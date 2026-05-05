"""Claude Sonnet 4.5 agents via emergentintegrations.

- StatementParserAgent: extract structured line items from statement text.
- AnomalyExplainerAgent: turn rule-based anomalies into plain-English alerts.
- KindredChatAgent: caregiver Q&A with statement+budget context.
"""
import asyncio
import json
import os
import re
import logging
from typing import List, Dict, Any, Optional
from emergentintegrations.llm.chat import LlmChat, UserMessage

logger = logging.getLogger(__name__)

MODEL_PROVIDER = "anthropic"
MODEL_NAME = "claude-sonnet-4-5-20250929"

# Two-pass statement decoder uses:
#   - Haiku 4.5 for structured extraction (fast, cheap, great at schema)
#   - Sonnet 4.5 for anomaly audit. Sonnet 4.6 is new (released Feb 2026)
#     and currently returning 502s during capacity spikes; 4.5 is stable and
#     performs the 10-rule audit equivalently. Flip back to 4.6 once capacity
#     is consistent by setting KINDRED_AUDITOR_MODEL env to "claude-sonnet-4-6".
EXTRACTOR_MODEL = os.environ.get("KINDRED_EXTRACTOR_MODEL", "claude-haiku-4-5-20251001")
# Default auditor is Haiku 4.5 — total two-pass pipeline stays under ~25s,
# well inside the 60s Kubernetes ingress read timeout on the preview/prod
# gateway. Sonnet 4.5 is higher quality but routinely takes 50-110s on its
# own which causes 502s upstream. Flip to sonnet by exporting
# KINDRED_AUDITOR_MODEL=claude-sonnet-4-5-20250929 once infra is tuned.
AUDITOR_MODEL = os.environ.get("KINDRED_AUDITOR_MODEL", "claude-haiku-4-5-20251001")


def _key() -> str:
    return os.environ.get("EMERGENT_LLM_KEY", "")


def _strip_json(text: str) -> str:
    """Pull the first JSON object/array out of an LLM response."""
    text = text.strip()
    # remove triple-backtick fences
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    # grab from first { or [ to last } or ]
    m = re.search(r"[\{\[]", text)
    if not m:
        return text
    start = m.start()
    depth = 0
    end = -1
    open_c = text[start]
    close_c = "}" if open_c == "{" else "]"
    for i, ch in enumerate(text[start:], start=start):
        if ch == open_c:
            depth += 1
        elif ch == close_c:
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    return text[start:end] if end > 0 else text[start:]


PARSER_SYSTEM = """You are an expert parser for Australian Support at Home monthly provider statements.
You extract line items and a one-paragraph summary from raw statement text.

Streams (every line item must map to exactly one):
- "Clinical" — nursing, allied health professional services (OT, physio, podiatry, dietetics, speech, social work, psychology), continence, wound care.
- "Independence" — personal care (showering, grooming), respite care, transport for non-everyday purposes, social support.
- "Everyday Living" — domestic assistance (cleaning, laundry), home maintenance/gardening, meal preparation, shopping assistance.

Output STRICT JSON only — no markdown, no commentary. Schema:
{
  "period_label": "October 2026",
  "summary": "Plain-English one-paragraph summary of what the statement shows.",
  "line_items": [
    {
      "date": "2026-10-14",
      "service_code": "DA-01" | null,
      "service_name": "Domestic assistance — cleaning",
      "stream": "Everyday Living",
      "units": 2.0,
      "unit_price": 75.50,
      "total": 151.00,
      "contribution_paid": 25.00,
      "government_paid": 126.00,
      "confidence": 0.92
    }
  ]
}
If a field is unknown set numeric fields to 0 and string fields to null. Always include every line item even if confidence is low."""


ANOMALY_SYSTEM = """You are Kindred's anomaly explainer. You receive a list of detected anomalies (rule-based flags)
and turn each into a calm, plain-English alert for an adult-child caregiver. Australian English.
For each anomaly, write:
- title: 6–10 words, neutral
- detail: 1–2 sentences explaining what looks unusual and why it might matter
- suggested_action: a short next step the caregiver could take
Output STRICT JSON: {"explained": [{"id":"...","title":"...","detail":"...","suggested_action":"..."}]}"""


CHAT_SYSTEM_TEMPLATE = """You are Kindred — a calm, precise concierge that helps Australian families navigate the Support at Home program.
You are speaking with {caregiver_name}, the family caregiver for {participant_name}.

Household context:
- Participant classification: {classification} (annual ${annual:,.0f}, quarterly ${quarterly:,.2f} after 10% care management).
- Provider: {provider}.
- Current quarter: {quarter_label}.
- Quarter spend by stream: {burn}.
- Lifetime cap progress: ${contributions_total:,.2f} of ${cap:,.2f}.

Recent statement summary:
{statement_summary}

Rules:
- Use Australian English. Be warm, brief, factual. No clinical advice; refer back to their care team for clinical questions.
- Money figures must come ONLY from the context above — never invent numbers. If you don't know, say so.
- Streams cannot cross-subsidise: Clinical, Independence, Everyday Living are separate budgets.
- If asked about price caps, mention that government price caps apply from 1 July 2026.
- Keep responses under 6 short sentences unless asked for detail."""


async def parse_statement(text: str, household_id: str) -> Dict[str, Any]:
    """Send raw statement text to Claude; return parsed JSON dict."""
    key = _key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=key,
        session_id=f"parse-{household_id}",
        system_message=PARSER_SYSTEM,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)
    truncated = text[:18000]  # safety cap
    msg = UserMessage(text=f"Parse this Support at Home statement:\n\n{truncated}")
    raw = await chat.send_message(msg)
    payload = _strip_json(raw)
    try:
        return json.loads(payload)
    except Exception as e:
        logger.warning("Statement parse JSON decode failed: %s", e)
        # return minimal valid shape
        return {"period_label": None, "summary": "Unable to fully parse statement.", "line_items": []}


async def explain_anomalies(anomalies: List[Dict[str, Any]], household_id: str) -> List[Dict[str, Any]]:
    """Pass rule-based anomaly stubs to LLM for plain-English copy."""
    key = _key()
    if not anomalies or not key:
        return anomalies
    chat = LlmChat(
        api_key=key,
        session_id=f"anomaly-{household_id}",
        system_message=ANOMALY_SYSTEM,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)
    msg = UserMessage(text=f"Anomalies:\n{json.dumps(anomalies, indent=2)}")
    try:
        raw = await chat.send_message(msg)
        data = json.loads(_strip_json(raw))
        explained = {item["id"]: item for item in data.get("explained", [])}
        merged = []
        for a in anomalies:
            e = explained.get(a["id"])
            if e:
                a = {**a, **{k: v for k, v in e.items() if k != "id"}}
            merged.append(a)
        return merged
    except Exception as e:
        logger.warning("Anomaly explain failed: %s", e)
        return anomalies


async def chat_with_kindred(
    user_text: str,
    session_id: str,
    context: Dict[str, Any],
) -> str:
    """Conversational reply with statement+budget context injected."""
    key = _key()
    if not key:
        return "Chat is not configured. Please add an LLM key."
    system = CHAT_SYSTEM_TEMPLATE.format(**context)
    chat = LlmChat(
        api_key=key,
        session_id=session_id,
        system_message=system,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)
    return await chat.send_message(UserMessage(text=user_text))


# ---------------------------------------------------------------------------
# Two-pass Statement Decoder pipeline
# ---------------------------------------------------------------------------
EXTRACTOR_SYSTEM = """You are a data extraction engine for Australian Support at Home monthly statements. Extract every line item exactly as it appears. Do not summarise. Do not interpret. Do not skip items. Do not merge items.

Return a JSON object with this exact structure:

{
  "participant_name": "",
  "mac_id": "",
  "statement_period": "",
  "provider_name": "",
  "classification": "",
  "quarterly_budget_total": 0.00,
  "care_management_deducted": 0.00,
  "care_management_rate_pct": 0.00,
  "service_budget_available": 0.00,
  "rollover_from_prior_quarter": 0.00,
  "line_items": [
    {
      "date": "",
      "service_description": "",
      "service_code": "",
      "stream": "Clinical" | "Independence" | "EverydayLiving" | "ATHM" | "CareMgmt",
      "hours": 0.00,
      "unit_rate": 0.00,
      "gross": 0.00,
      "participant_contribution": 0.00,
      "government_paid": 0.00,
      "is_cancellation": true,
      "worker_name": "",
      "is_brokered": true,
      "provider_notes": "",
      "flags_in_original": ""
    }
  ],
  "previous_period_adjustments": [
    {"ref": "", "description": "", "credit_amount": 0.00}
  ],
  "lifetime_cap_total": 0.00,
  "lifetime_contributions_to_date": 0.00,
  "direct_debit_amount": 0.00,
  "direct_debit_date": ""
}

Rules:
- Every line item gets its own object in the array. Never merge two services into one object.
- Cancelled services must be included with is_cancellation: true and gross: 0.00.
- AT-HM items must be coded stream: "ATHM" not "EverydayLiving" even if the statement places them in Everyday Living.
- Care management fee gets its own line item with stream: "CareMgmt".
- Previous period adjustments go in the adjustments array, not line_items.
- If a line item has a note or asterisk in the original statement, copy that note verbatim into flags_in_original.
- Return only valid JSON. No prose before or after the JSON."""


# ---------------------------------------------------------------------------
# Chunked extraction prompts — each chunk targets a slice of the schema so a
# single LLM call can never exceed its output-token budget. All chunks see
# the full statement text so they don't miss items mis-placed in the source.
# ---------------------------------------------------------------------------

HEADER_EXTRACTOR_SYSTEM = """You are a data extraction engine for Australian Support at Home statements. Extract ONLY the header / budget metadata. Do not extract line items.

Return STRICT JSON only:
{
  "participant_name": "",
  "mac_id": "",
  "statement_period": "",
  "period_start": "",
  "period_end": "",
  "provider_name": "",
  "classification": "",
  "quarterly_budget_total": 0.00,
  "care_management_deducted": 0.00,
  "care_management_rate_pct": 0.00,
  "service_budget_available": 0.00,
  "rollover_from_prior_quarter": 0.00,
  "budget_remaining_at_quarter_end": 0.00,
  "reported_total_gross": 0.00,
  "reported_total_participant_contribution": 0.00,
  "reported_total_government_paid": 0.00,
  "lifetime_cap_total": 0.00,
  "lifetime_contributions_to_date": 0.00,
  "direct_debit_amount": 0.00,
  "direct_debit_date": ""
}

Rules:
- If a value is not in the statement, use "" for strings and 0.00 for numbers.
- Calculate care_management_rate_pct as care_management_deducted / quarterly_budget_total * 100, rounded to 2dp, OR copy the percentage if the statement states it explicitly (e.g. "Care management deducted (11%)").
- statement_period is the value from the explicit "STATEMENT PERIOD" / "Statement Period" header — NOT the quarterly-budget-summary date range. A monthly statement covers a single calendar month even if the budget summary references a 3-month quarter.
- period_start and period_end should be ISO dates (YYYY-MM-DD) parsed from statement_period when possible, otherwise "".
- reported_total_gross is the statement's own "Total gross billed" / "Total this month" figure (the provider's stated total).
- reported_total_participant_contribution / reported_total_government_paid are the matching totals if listed.
- budget_remaining_at_quarter_end is the statement's stated remaining quarterly service budget (post all line items), if shown.
- Return only the JSON object. No prose."""


def _stream_extractor_system(stream_name: str, stream_description: str) -> str:
    return f"""You are a data extraction engine for Australian Support at Home statements. Extract EVERY line item belonging to the {stream_name} stream. Do not skip any item. Do not merge any items. Do not summarise.

{stream_description}

CRITICAL — COMPLETENESS:
- Scan the ENTIRE statement from top to bottom. List every {stream_name} line item you find — there are typically multiple personal care visits, multiple cleaning visits, multiple nursing visits across the month.
- Repeat-occurrence services (e.g. weekly Personal Care, weekly Cleaning, weekly Nursing) MUST each get their own entry — never collapse them.
- Cancelled items in this stream MUST also be included with is_cancellation: true and gross: 0.00.
- Items with weekend / after-hours / substitute-worker variations are still {stream_name} items — include them too.

Return STRICT JSON only:
{{
  "line_items": [
    {{
      "date": "",
      "service_description": "",
      "service_code": "",
      "stream": "{stream_name}",
      "hours": 0.00,
      "unit_rate": 0.00,
      "gross": 0.00,
      "participant_contribution": 0.00,
      "government_paid": 0.00,
      "is_cancellation": false,
      "worker_name": "",
      "is_brokered": false,
      "provider_notes": "",
      "flags_in_original": ""
    }}
  ]
}}

Rules:
- Preserve the date format as it appears in the source statement (do not reformat to ISO unless the source already is ISO).
- Copy any asterisk note or "**" remark verbatim into flags_in_original.
- worker_name is the person delivering the service when listed; otherwise "".
- Return only valid JSON. No prose."""


CLINICAL_DESCRIPTION = """The Clinical stream covers nursing visits, allied health (occupational therapy, physiotherapy, podiatry, dietetics, speech, social work, psychology), wound care, continence support. Service codes typically begin NU-, OT-, PT-, PD-, AH-, WC-."""

INDEPENDENCE_DESCRIPTION = """The Independence stream covers personal care (showering, grooming, toileting), respite care, social support, transport (community access, medical appointments, hospital). Service codes typically begin PC-, RES-, SS-, TR-. Include transport items even if they have a "stream query" note."""

EVERYDAY_DESCRIPTION = """The Everyday Living stream covers domestic assistance (cleaning, laundry), home maintenance/gardening, meal preparation, shopping. Service codes typically begin DA-, GM-, ML-, SH-.

ALSO include AT-HM (Assistive Technology / Home Modifications) items in your output — but recode their stream to "ATHM" (NOT "EverydayLiving"), even if the source statement places them in Everyday Living. AT-HM service codes typically begin AT-."""

CLINICAL_EXTRACTOR_SYSTEM = _stream_extractor_system("Clinical", CLINICAL_DESCRIPTION)
INDEPENDENCE_EXTRACTOR_SYSTEM = _stream_extractor_system("Independence", INDEPENDENCE_DESCRIPTION)
EVERYDAY_EXTRACTOR_SYSTEM = _stream_extractor_system("EverydayLiving", EVERYDAY_DESCRIPTION).replace(
    '"stream": "EverydayLiving"',
    '"stream": "EverydayLiving" | "ATHM"',
)


ADJUSTMENTS_EXTRACTOR_SYSTEM = """You are a data extraction engine for Australian Support at Home statements. Extract ONLY (a) the Care Management fee line item, (b) the previous-period-adjustments array, and (c) the AT-HM commitments / outstanding-orders register. Skip every other line item.

Return STRICT JSON only:
{
  "care_management_line_items": [
    {
      "date": "",
      "service_description": "",
      "service_code": "",
      "stream": "CareMgmt",
      "hours": 0.00,
      "unit_rate": 0.00,
      "gross": 0.00,
      "participant_contribution": 0.00,
      "government_paid": 0.00,
      "is_cancellation": false,
      "worker_name": "",
      "is_brokered": false,
      "provider_notes": "",
      "flags_in_original": ""
    }
  ],
  "previous_period_adjustments": [
    {"ref": "", "description": "", "credit_amount": 0.00}
  ],
  "at_hm_commitments": [
    {
      "ref": "",
      "item_description": "",
      "approval_date": "",
      "expiry_date": "",
      "amount_approved": 0.00,
      "amount_claimed": 0.00,
      "amount_remaining": 0.00,
      "status": ""
    }
  ]
}

Rules:
- Care management fee usually has service code CM-01 or description containing "Care management". Always coded stream: "CareMgmt".
- Previous-period adjustments are listed in a separate "PREVIOUS PERIOD ADJUSTMENTS" or similar section — they are credits/refunds for prior months, NOT line items.
- AT-HM commitments come from sections titled "AT-HM Commitments", "Outstanding Orders", "Approved Items Pending Delivery", or similar. They represent assistive-tech / home-modification items that were APPROVED but have not yet been delivered/installed/claimed.
- For each AT-HM commitment include: a reference number (ref), item description, approval_date (ISO if possible), expiry_date (ISO if possible), amount_approved, amount_claimed (default 0.00 if not stated), amount_remaining (default amount_approved - amount_claimed if not stated explicitly), and a short status string ("approved", "in progress", "delivered", etc).
- If the statement has no AT-HM commitments section, return an empty at_hm_commitments array.
- Dates should be ISO (YYYY-MM-DD) when the source allows; otherwise copy verbatim.
- Return only valid JSON. No prose."""


AUDITOR_SYSTEM = """You are an anomaly detection engine for Australian Support at Home statements. You receive structured JSON extracted from a monthly statement. Your job is to find every problem, discrepancy, and missed entitlement.

Check every one of the following rules. For each rule that fails, add an anomaly to the output array. If a rule passes, do not mention it.

RULE 1 — CARE MANAGEMENT CAP
Care management must not exceed 10% of the quarterly budget total.
Calculate: care_management_rate_pct from the JSON.
If > 10.0: flag as HIGH severity.
Dollar impact: (actual_rate/100 - 0.10) × quarterly_budget_total

RULE 2 — WEEKEND / AFTER-HOURS RATE ACCURACY
If any line item's unit_rate exceeds the provider's published weekday rate for that service code, check whether a weekend or after-hours rate was legitimately applied. If the charged rate exceeds the provider's published weekend rate (where visible in the statement): flag as MEDIUM severity.
Dollar impact: (charged_rate - published_rate) × hours

RULE 3 — DUPLICATE SERVICES
Check for any two line items with the same service_code within 7 calendar days of each other AND the same approximate unit_rate. Also check for any line item where flags_in_original contains words like "duplicate", "also appears", "verify", "pre-billing", "query". Flag as HIGH severity.

RULE 4 — AT-HM STREAM MISCODING
Any line item with service_code beginning "AT-" should be stream: "ATHM". If it appears in EverydayLiving or any other stream: flag as MEDIUM. AT-HM items are fully government funded — participant_contribution should be 0.00 for all AT-HM items. If participant_contribution > 0 on an AT-HM item: flag as HIGH.

RULE 5 — STREAM MISCLASSIFICATION RISK
Check flags_in_original for any provider notes questioning the stream assignment (e.g. "may qualify as Clinical", "confirm stream", "query"). Flag as MEDIUM severity with the provider's own note as evidence.
Dollar impact: the participant contribution amount on that item.

RULE 6 — WORKER SUBSTITUTION WITHOUT NOTICE
If provider_notes or flags_in_original contain phrases like "no prior notice", "worker substitution", "usual worker on leave": flag as LOW severity. This is a Statement of Rights issue (right to continuity of care and advance notice of changes).

RULE 7 — HOSPITAL ADMISSION + NO RESTORATIVE CARE PATHWAY
Check line_items for any cancelled service with a note referencing "hospital" or "hospitalised". If found, check whether any line item has service_code beginning "RCP-" or description containing "Restorative". If hospital admission is present but no Restorative Care Pathway item exists: flag as HIGH severity. This is a missed entitlement.

RULE 8 — TRANSPORT STREAM QUERY
If any transport line item (service_code beginning "TR-") is on the same date as a hospital admission cancellation or has flags_in_original mentioning "hospital" or "emergency": flag as LOW severity.

RULE 9 — CONTRIBUTION ARITHMETIC CHECK
For each line item where is_cancellation is false, verify: participant_contribution = gross × expected_contribution_rate. Expected rates (full Age Pension): Clinical 0%, Independence 5%, EverydayLiving 17.5%, ATHM 0%. If any item's contribution is off by more than $0.10: flag as MEDIUM.
Dollar impact: abs(charged_contribution - correct_contribution)

RULE 10 — PREVIOUS PERIOD ADJUSTMENTS
If adjustments array is non-empty: flag as LOW severity (informational). Summarise what was corrected and confirm the credit was applied to government_paid not participant_contribution.

RULE 11 — BROKERED RATE PREMIUM
Scan provider_notes and flags_in_original on every line item for any disclosure that a brokered rate exceeds the provider's own published rate for an equivalent service (look for phrases like "brokered rate", "external provider rate", "subcontracted", "premium rate applies", "above usual rate due to brokering").
Also: if a line item has is_brokered=true, compare its unit_rate against any published rate mentioned elsewhere in the statement for the same service_code. If the brokered rate exceeds the published rate by more than $0.50: flag as MEDIUM severity.
Dollar impact: (brokered_rate - published_rate) * hours * occurrences_this_month for the affected service.
Suggested action: "Ask your provider whether the brokered rate premium can be absorbed by the provider rather than your budget. Providers are not required to pass brokered rate premiums to participants."

RULE 12 — UNCLAIMED AT-HM COMMITMENTS
Inspect the at_hm_commitments array (each entry has ref, item_description, approval_date, expiry_date, amount_approved, amount_claimed, amount_remaining, status).
Reference today's date relative to the statement period_end. If period_end is missing, use the last day of the statement_period text. Compute days_since_approval = period_end - approval_date.
- If amount_claimed = 0.00 AND days_since_approval > 30: flag as LOW severity. Detail must include the commitment ref, item_description, amount_remaining, expiry_date.
- If amount_claimed > 0 AND amount_remaining > 0 AND days_since_approval > 180: flag as LOW severity (prompt to use remaining balance). Detail must include the same fields.
Suggested action for both sub-cases: "Follow up with your care manager to arrange delivery/installation before this commitment expires."
If the at_hm_commitments array is empty, do NOT emit this rule.

RULE 13 — QUARTERLY UNDERSPEND PATTERN
Use budget_remaining_at_quarter_end (or service_budget_available - sum of non-cancelled gross if remaining isn't directly given) and quarterly_budget_total.
Compute remaining_pct = budget_remaining_at_quarter_end / quarterly_budget_total * 100.
Compute rollover_cap = max(1000.00, 0.10 * quarterly_budget_total).
- If remaining_pct > 15 AND budget_remaining_at_quarter_end <= rollover_cap: flag as LOW severity (the full amount will roll over — positive outcome but worth noting).
- If remaining_pct > 15 AND budget_remaining_at_quarter_end > rollover_cap: flag as MEDIUM severity (excess above rollover cap will be forfeited).
Headline copy template: "{participant_name} ended the quarter with ${budget_remaining_at_quarter_end:,.2f} unspent — about {remaining_pct:.0f}% of the quarterly budget. Unspent funding above the rollover cap (${rollover_cap:,.2f}) is forfeited permanently. A care plan review might help ensure the full budget is being used."
If budget_remaining_at_quarter_end <= 0 or quarterly_budget_total <= 0: do NOT emit this rule.

RULE 14 — STATEMENT PERIOD ACCURACY (parsing warning)
Verify the extracted statement_period (and period_start/period_end if present) match the explicit "STATEMENT PERIOD" header in the source — NOT the quarterly-budget-summary date range.
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_14_PERIOD_PARSE_WARNING") which fires only when the period span exceeds 35 days. Skip this rule entirely in your output to avoid double-counting.

RULE 15 — GROSS TOTAL VALIDATION (parsing warning)
Compute extracted_total = sum(line_item.gross for line_item where is_cancellation=false) - sum(prev_period_adjustment.credit_amount).
Compare extracted_total against reported_total_gross from the header.
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_15_GROSS_TOTAL_PARSE_WARNING") which fires when the difference is > $5.00. Skip this rule entirely in your output to avoid double-counting.

OUTPUT FORMAT — return ONLY valid JSON, no prose:

{
  "statement_summary": {
    "participant_name": "",
    "period": "",
    "provider": "",
    "classification": "",
    "total_line_items": 0,
    "total_gross": 0.00,
    "total_participant_contribution": 0.00,
    "total_government_paid": 0.00,
    "care_management_fee": 0.00,
    "net_budget_impact": 0.00,
    "budget_remaining": 0.00,
    "rollover_applied": 0.00,
    "adjusted_budget_remaining": 0.00,
    "lifetime_contributions_to_date": 0.00,
    "lifetime_cap_remaining": 0.00
  },
  "stream_breakdown": [
    {"stream": "Clinical", "line_item_count": 0, "gross_total": 0.00, "participant_contribution": 0.00, "government_paid": 0.00}
  ],
  "anomalies": [
    {
      "severity": "high",
      "rule": "RULE_1_CARE_MGMT_CAP",
      "headline": "One plain-English sentence",
      "detail": "2-3 sentences explaining what was found",
      "dollar_impact": 0.00,
      "evidence": ["specific fact from the statement"],
      "suggested_action": "What to do next"
    }
  ],
  "anomaly_count": {"high": 0, "medium": 0, "low": 0}
}

Severity strings must be lowercase: "high", "medium", "low"."""


def _empty_audit(extracted: Dict[str, Any]) -> Dict[str, Any]:
    """Minimal audit shape so the frontend can render something useful even
    when Pass 2 fails. Computes totals locally from the extraction."""
    items = extracted.get("line_items", []) or []
    by_stream: Dict[str, Dict[str, float]] = {}
    total_gross = total_contrib = total_gov = 0.0
    care_mgmt = 0.0
    for li in items:
        if li.get("is_cancellation"):
            continue
        stream = li.get("stream") or "Unknown"
        b = by_stream.setdefault(stream, {"line_item_count": 0, "gross_total": 0.0, "participant_contribution": 0.0, "government_paid": 0.0})
        b["line_item_count"] += 1
        b["gross_total"] += float(li.get("gross") or 0)
        b["participant_contribution"] += float(li.get("participant_contribution") or 0)
        b["government_paid"] += float(li.get("government_paid") or 0)
        total_gross += float(li.get("gross") or 0)
        total_contrib += float(li.get("participant_contribution") or 0)
        total_gov += float(li.get("government_paid") or 0)
        if stream == "CareMgmt":
            care_mgmt += float(li.get("gross") or 0)
    return {
        "statement_summary": {
            "participant_name": extracted.get("participant_name", ""),
            "period": extracted.get("statement_period", ""),
            "provider": extracted.get("provider_name", ""),
            "classification": extracted.get("classification", ""),
            "total_line_items": len([i for i in items if not i.get("is_cancellation")]),
            "total_gross": round(total_gross, 2),
            "total_participant_contribution": round(total_contrib, 2),
            "total_government_paid": round(total_gov, 2),
            "care_management_fee": round(care_mgmt, 2),
            "net_budget_impact": round(total_gross, 2),
            "budget_remaining": round(float(extracted.get("service_budget_available") or 0) - total_gross, 2),
            "rollover_applied": float(extracted.get("rollover_from_prior_quarter") or 0),
            "adjusted_budget_remaining": round(float(extracted.get("service_budget_available") or 0) - total_gross, 2),
            "lifetime_contributions_to_date": float(extracted.get("lifetime_contributions_to_date") or 0),
            "lifetime_cap_remaining": round(float(extracted.get("lifetime_cap_total") or 0) - float(extracted.get("lifetime_contributions_to_date") or 0), 2),
        },
        "stream_breakdown": [
            {"stream": s, **{k: round(v, 2) if isinstance(v, float) else v for k, v in vals.items()}}
            for s, vals in by_stream.items()
        ],
        "anomalies": [],
        "anomaly_count": {"high": 0, "medium": 0, "low": 0},
    }


def _try_json_repair(text: str) -> Optional[Any]:
    """Attempt to fix mildly truncated JSON (unbalanced braces / trailing commas).

    Returns the parsed object or None if repair fails. Conservative — only
    handles the common case where the model ran out of output tokens mid-array.
    """
    if not text:
        return None
    s = text.strip()
    # Try once as-is
    try:
        return json.loads(s)
    except Exception:
        pass
    # Strip trailing comma + close any unterminated string
    # Heuristic: walk the string tracking brackets + string state. When we hit
    # the end without closing, append the missing close characters.
    stack: list[str] = []
    in_str = False
    escape = False
    last_complete_idx = -1
    for i, ch in enumerate(s):
        if escape:
            escape = False
            continue
        if ch == "\\" and in_str:
            escape = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch in "{[":
            stack.append("}" if ch == "{" else "]")
        elif ch in "}]":
            if stack and stack[-1] == ch:
                stack.pop()
                if not stack:
                    last_complete_idx = i
    candidate = s[: last_complete_idx + 1] if last_complete_idx >= 0 else s
    if last_complete_idx < 0:
        # Try closing what's open
        # First close any open string
        if in_str:
            candidate = s + '"'
        else:
            candidate = s
        # Drop dangling trailing comma
        candidate = re.sub(r",\s*$", "", candidate)
        # Append closing brackets in reverse stack order
        candidate = candidate + "".join(reversed(stack))
    try:
        return json.loads(candidate)
    except Exception:
        # Final fallback: aggressively trim the last incomplete element
        # and close brackets
        trimmed = re.sub(r",\s*[^,\}\]]*$", "", s)
        trimmed = re.sub(r",\s*$", "", trimmed)
        # Recount stack on trimmed
        stack2: list[str] = []
        in_str2 = False
        esc2 = False
        for ch in trimmed:
            if esc2:
                esc2 = False
                continue
            if ch == "\\" and in_str2:
                esc2 = True
                continue
            if ch == '"':
                in_str2 = not in_str2
                continue
            if in_str2:
                continue
            if ch in "{[":
                stack2.append("}" if ch == "{" else "]")
            elif ch in "}]":
                if stack2 and stack2[-1] == ch:
                    stack2.pop()
        if in_str2:
            trimmed += '"'
        trimmed += "".join(reversed(stack2))
        try:
            return json.loads(trimmed)
        except Exception:
            return None


def _safe_json_load(raw: Optional[str]) -> Optional[Any]:
    """Try strict parse, then repair. Returns None on total failure."""
    if not raw:
        return None
    payload = _strip_json(raw)
    try:
        return json.loads(payload)
    except Exception:
        repaired = _try_json_repair(payload)
        if repaired is not None:
            logger.info("JSON repair succeeded after strict parse failed")
        return repaired


async def _llm_chunk_call(
    system_message: str,
    user_text: str,
    session_id: str,
    max_tokens: int,
) -> Optional[Any]:
    """Run a single chunked extraction call with one retry. Returns parsed
    JSON or None. Retries once on transport / parse failure to ride through
    the rare flaky Haiku response.
    """
    key = _key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")

    async def _attempt(attempt: int) -> Optional[Any]:
        chat = LlmChat(
            api_key=key,
            session_id=f"{session_id}-a{attempt}",
            system_message=system_message,
        ).with_model(MODEL_PROVIDER, EXTRACTOR_MODEL).with_params(max_tokens=max_tokens)
        try:
            raw = await chat.send_message(UserMessage(text=user_text))
        except Exception as e:
            logger.warning("Chunk call %s attempt %d failed: %s", session_id, attempt, e)
            return None
        parsed = _safe_json_load(raw)
        if parsed is None:
            logger.warning(
                "Chunk %s attempt %d returned unparseable JSON | raw[:300]=%r",
                session_id, attempt, str(raw)[:300],
            )
        return parsed

    result = await _attempt(1)
    if result is not None:
        return result
    # One retry — fresh session id so any stuck conversation state is reset
    return await _attempt(2)


_HEADER_DEFAULTS = {
    "participant_name": "", "mac_id": "", "statement_period": "",
    "period_start": "", "period_end": "",
    "provider_name": "", "classification": "",
    "quarterly_budget_total": 0.0, "care_management_deducted": 0.0,
    "care_management_rate_pct": 0.0, "service_budget_available": 0.0,
    "rollover_from_prior_quarter": 0.0,
    "budget_remaining_at_quarter_end": 0.0,
    "reported_total_gross": 0.0,
    "reported_total_participant_contribution": 0.0,
    "reported_total_government_paid": 0.0,
    "lifetime_cap_total": 0.0, "lifetime_contributions_to_date": 0.0,
    "direct_debit_amount": 0.0, "direct_debit_date": "",
}


def _empty_extracted() -> Dict[str, Any]:
    return {
        **_HEADER_DEFAULTS,
        "line_items": [],
        "previous_period_adjustments": [],
        "at_hm_commitments": [],
    }


async def extract_statement(text: str, household_id: str) -> Dict[str, Any]:
    """Pass 1 — Chunked parallel extraction.

    Splits extraction across 5 parallel LLM calls so no single call hits the
    output-token limit on long statements:
      1. Header / budget metadata
      2. Clinical stream line items
      3. Independence stream line items
      4. Everyday Living + AT-HM line items
      5. Care management fee + previous-period adjustments

    All chunks see the full statement text. Each chunk has its own bounded
    output budget. JSON repair is applied to each chunk's response. The five
    sub-results are assembled into the unified extraction schema.
    """
    key = _key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    payload = text[:24000]
    user_msg = f"STATEMENT TEXT:\n\n{payload}"

    tasks = [
        _llm_chunk_call(HEADER_EXTRACTOR_SYSTEM, user_msg, f"extract-header-{household_id}", max_tokens=800),
        _llm_chunk_call(CLINICAL_EXTRACTOR_SYSTEM, user_msg, f"extract-clin-{household_id}", max_tokens=2500),
        _llm_chunk_call(INDEPENDENCE_EXTRACTOR_SYSTEM, user_msg, f"extract-indep-{household_id}", max_tokens=2500),
        _llm_chunk_call(EVERYDAY_EXTRACTOR_SYSTEM, user_msg, f"extract-everyday-{household_id}", max_tokens=2500),
        _llm_chunk_call(ADJUSTMENTS_EXTRACTOR_SYSTEM, user_msg, f"extract-adj-{household_id}", max_tokens=800),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    header_res, clin_res, indep_res, every_res, adj_res = [
        r if not isinstance(r, BaseException) else None for r in results
    ]

    assembled: Dict[str, Any] = _empty_extracted()

    # Merge header
    if isinstance(header_res, dict):
        for k, default in _HEADER_DEFAULTS.items():
            v = header_res.get(k, default)
            if isinstance(default, float):
                try:
                    assembled[k] = float(v) if v not in (None, "") else 0.0
                except Exception:
                    assembled[k] = 0.0
            else:
                assembled[k] = "" if v is None else str(v)

    # Merge stream line items
    line_items: list[dict] = []
    for chunk_name, chunk_res, fallback_stream in [
        ("clinical", clin_res, "Clinical"),
        ("independence", indep_res, "Independence"),
        ("everyday", every_res, "EverydayLiving"),
    ]:
        if isinstance(chunk_res, dict):
            items = chunk_res.get("line_items") or []
            for it in items:
                if not isinstance(it, dict):
                    continue
                # Force AT- service codes onto ATHM stream defensively
                code = (it.get("service_code") or "").upper()
                if code.startswith("AT-"):
                    it["stream"] = "ATHM"
                elif not it.get("stream"):
                    it["stream"] = fallback_stream
                line_items.append(it)

    # Merge care-mgmt + adjustments + AT-HM commitments
    if isinstance(adj_res, dict):
        for it in (adj_res.get("care_management_line_items") or []):
            if isinstance(it, dict):
                it["stream"] = "CareMgmt"
                line_items.append(it)
        adj_list = adj_res.get("previous_period_adjustments") or []
        if isinstance(adj_list, list):
            assembled["previous_period_adjustments"] = [a for a in adj_list if isinstance(a, dict)]
        commitments = adj_res.get("at_hm_commitments") or []
        if isinstance(commitments, list):
            assembled["at_hm_commitments"] = [c for c in commitments if isinstance(c, dict)]

    # Sort line items by date string (ISO-ish or "DD MMM" — best-effort lexical)
    assembled["line_items"] = line_items

    # Capture failure metadata so the caller can know which chunks fell over
    failures = []
    for name, res in [("header", header_res), ("clinical", clin_res), ("independence", indep_res), ("everyday", every_res), ("adjustments", adj_res)]:
        if res is None:
            failures.append(name)
    if failures:
        assembled["_chunk_failures"] = failures
    if not line_items and failures:
        # Total failure — surface the original error code so the audit fallback fires
        assembled["_extraction_error"] = f"chunk_failures: {','.join(failures)}"
    return assembled


async def audit_statement(extracted: Dict[str, Any], household_id: str) -> Dict[str, Any]:
    """Pass 2 — Claude Haiku 4.5 applies the 10-rule anomaly audit against
    the structured extraction from Pass 1. Returns statement_summary +
    stream_breakdown + anomalies + anomaly_count.

    On failure returns a locally-computed summary with an empty anomaly
    array so the UI can still render a clean result (plus a meta flag so
    the frontend can show the partial-result message).
    """
    key = _key()
    if not key:
        return _add_parse_warnings(_empty_audit(extracted), extracted)
    chat = LlmChat(
        api_key=key,
        session_id=f"audit-{household_id}",
        system_message=AUDITOR_SYSTEM,
    ).with_model(MODEL_PROVIDER, AUDITOR_MODEL).with_params(max_tokens=4000)
    payload = json.dumps(extracted, separators=(",", ":"))[:40000]
    msg = UserMessage(text=f"Audit this extracted statement:\n\n{payload}")
    raw = None
    try:
        raw = await chat.send_message(msg)
        result = _safe_json_load(raw)
        if result is None:
            raise json.JSONDecodeError("repair failed", raw or "", 0)
        # Append deterministic parse warnings (rules 14 & 15) and re-tally
        result = _add_parse_warnings(result, extracted)
        # Normalise anomaly_count if the model forgot it
        anoms = result.get("anomalies", []) or []
        counts = {"high": 0, "medium": 0, "low": 0}
        for a in anoms:
            sev = (a.get("severity") or "").lower()
            if sev in counts:
                counts[sev] += 1
        result["anomaly_count"] = counts
        return result
    except json.JSONDecodeError as e:
        logger.warning("Auditor Pass 2 JSON parse failed: %s | raw[:500]=%r", e, str(raw)[:500])
        fallback = _add_parse_warnings(_empty_audit(extracted), extracted)
        fallback["_audit_error"] = f"json_parse: {e}"
        return fallback
    except Exception as e:
        logger.warning("Auditor Pass 2 failed: %s", e)
        fallback = _add_parse_warnings(_empty_audit(extracted), extracted)
        fallback["_audit_error"] = str(e)
        return fallback


# ---------------------------------------------------------------------------
# Deterministic parse-warning helpers (Rules 14 & 15)
# ---------------------------------------------------------------------------

def _parse_iso_date(value: Any):
    """Best-effort parse of a date string into a datetime.date.
    Returns None on failure.
    """
    import datetime as _dt
    if not value or not isinstance(value, str):
        return None
    s = value.strip()
    # Try ISO formats first
    for fmt in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            return _dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    # Try DD MMM YYYY / D MMM YYYY
    for fmt in ("%d %b %Y", "%d %B %Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return _dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


def _add_parse_warnings(audit_result: Dict[str, Any], extracted: Dict[str, Any]) -> Dict[str, Any]:
    """Append deterministic parsing warnings (Rules 14 & 15) if conditions
    are met and the LLM hasn't already flagged the same rule. Returns the
    mutated audit_result for chaining.
    """
    anomalies = audit_result.setdefault("anomalies", []) or []
    existing_rules = {(a.get("rule") or "").upper() for a in anomalies if isinstance(a, dict)}

    # Rule 14 — period span > 35 days
    if "RULE_14_PERIOD_PARSE_WARNING" not in existing_rules:
        ps = _parse_iso_date(extracted.get("period_start"))
        pe = _parse_iso_date(extracted.get("period_end"))
        if ps and pe:
            span = (pe - ps).days
            if span > 35:
                anomalies.append({
                    "severity": "low",
                    "rule": "RULE_14_PERIOD_PARSE_WARNING",
                    "headline": "Statement period may be incorrectly extracted — verify dates.",
                    "detail": (
                        f"Extracted period {ps.isoformat()} → {pe.isoformat()} spans {span} days, "
                        f"which is longer than a typical monthly statement. The literal statement_period "
                        f"on the source was: \"{extracted.get('statement_period') or ''}\"."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [
                        f"period_start: {ps.isoformat()}",
                        f"period_end: {pe.isoformat()}",
                        f"statement_period text: {extracted.get('statement_period') or ''}",
                    ],
                    "suggested_action": "Open the original statement and confirm the dates match. If they don't, this decode may be reading from the quarterly summary by mistake.",
                })

    # Rule 15 — extracted gross vs reported gross
    if "RULE_15_GROSS_TOTAL_PARSE_WARNING" not in existing_rules:
        try:
            reported = float(extracted.get("reported_total_gross") or 0.0)
        except Exception:
            reported = 0.0
        if reported > 0:
            extracted_total = 0.0
            for li in extracted.get("line_items", []) or []:
                if li.get("is_cancellation"):
                    continue
                try:
                    extracted_total += float(li.get("gross") or 0)
                except Exception:
                    continue
            adj_credit = 0.0
            for adj in extracted.get("previous_period_adjustments", []) or []:
                try:
                    adj_credit += float(adj.get("credit_amount") or 0)
                except Exception:
                    continue
            net_extracted = extracted_total - adj_credit
            if abs(net_extracted - reported) > 5.0:
                anomalies.append({
                    "severity": "low",
                    "rule": "RULE_15_GROSS_TOTAL_PARSE_WARNING",
                    "headline": "Decoded total doesn't match the statement's reported total.",
                    "detail": (
                        f"Extracted total (${net_extracted:,.2f}) differs from the statement's reported "
                        f"total (${reported:,.2f}). Some line items may not have been extracted. "
                        f"Review the full statement manually."
                    ),
                    "dollar_impact": round(abs(net_extracted - reported), 2),
                    "evidence": [
                        f"sum of non-cancelled line item gross: ${extracted_total:,.2f}",
                        f"previous-period adjustment credits: ${adj_credit:,.2f}",
                        f"net extracted: ${net_extracted:,.2f}",
                        f"statement reported total: ${reported:,.2f}",
                    ],
                    "suggested_action": "Open the original statement and check whether any line items are missing from the decoded view above.",
                })

    audit_result["anomalies"] = anomalies
    return audit_result
