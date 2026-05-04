"""Claude Sonnet 4.5 agents via emergentintegrations.

- StatementParserAgent: extract structured line items from statement text.
- AnomalyExplainerAgent: turn rule-based anomalies into plain-English alerts.
- KindredChatAgent: caregiver Q&A with statement+budget context.
"""
import json
import os
import re
import logging
from typing import List, Dict, Any
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
AUDITOR_MODEL = os.environ.get("KINDRED_AUDITOR_MODEL", "claude-sonnet-4-5-20250929")


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


async def extract_statement(text: str, household_id: str) -> Dict[str, Any]:
    """Pass 1 — Claude Haiku 4.5 extracts every line item into strict JSON.

    Returns the full structured schema defined in EXTRACTOR_SYSTEM. On
    parse failure returns a minimal shape with line_items=[] so Pass 2 and
    the caller can still render something.
    """
    key = _key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=key,
        session_id=f"extract-{household_id}",
        system_message=EXTRACTOR_SYSTEM,
    ).with_model(MODEL_PROVIDER, EXTRACTOR_MODEL)
    msg = UserMessage(text=f"Extract this Support at Home statement exactly:\n\n{text[:24000]}")
    try:
        raw = await chat.send_message(msg)
        return json.loads(_strip_json(raw))
    except Exception as e:
        logger.warning("Extractor Pass 1 failed: %s", e)
        return {
            "participant_name": "", "mac_id": "", "statement_period": "",
            "provider_name": "", "classification": "",
            "quarterly_budget_total": 0.0, "care_management_deducted": 0.0,
            "care_management_rate_pct": 0.0, "service_budget_available": 0.0,
            "rollover_from_prior_quarter": 0.0,
            "line_items": [], "previous_period_adjustments": [],
            "lifetime_cap_total": 0.0, "lifetime_contributions_to_date": 0.0,
            "direct_debit_amount": 0.0, "direct_debit_date": "",
            "_extraction_error": str(e),
        }


async def audit_statement(extracted: Dict[str, Any], household_id: str) -> Dict[str, Any]:
    """Pass 2 — Claude Sonnet 4.6 applies the 10-rule anomaly audit against
    the structured extraction from Pass 1. Returns statement_summary +
    stream_breakdown + anomalies + anomaly_count.

    On failure returns a locally-computed summary with an empty anomaly
    array so the UI can still render a clean result (plus a meta flag so
    the frontend can show the partial-result message).
    """
    key = _key()
    if not key:
        return _empty_audit(extracted)
    chat = LlmChat(
        api_key=key,
        session_id=f"audit-{household_id}",
        system_message=AUDITOR_SYSTEM,
    ).with_model(MODEL_PROVIDER, AUDITOR_MODEL)
    payload = json.dumps(extracted, separators=(",", ":"))[:40000]
    msg = UserMessage(text=f"Audit this extracted statement:\n\n{payload}")
    try:
        raw = await chat.send_message(msg)
        result = json.loads(_strip_json(raw))
        # Normalise anomaly_count if the model forgot it
        anoms = result.get("anomalies", []) or []
        counts = {"high": 0, "medium": 0, "low": 0}
        for a in anoms:
            sev = (a.get("severity") or "").lower()
            if sev in counts:
                counts[sev] += 1
        result["anomaly_count"] = counts
        return result
    except Exception as e:
        logger.warning("Auditor Pass 2 failed: %s", e)
        fallback = _empty_audit(extracted)
        fallback["_audit_error"] = str(e)
        return fallback
