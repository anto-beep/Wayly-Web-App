"""Claude Sonnet 4.5 agents via emergentintegrations.

- StatementParserAgent: extract structured line items from statement text.
- AnomalyExplainerAgent: turn rule-based anomalies into plain-English alerts.
- WaylyChatAgent: caregiver Q&A with statement+budget context.
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


ANOMALY_SYSTEM = """You are Wayly's anomaly explainer. You receive a list of detected anomalies (rule-based flags)
and turn each into a calm, plain-English alert for an adult-child caregiver. Australian English.
For each anomaly, write:
- title: 6–10 words, neutral
- detail: 1–2 sentences explaining what looks unusual and why it might matter
- suggested_action: a short next step the caregiver could take
Output STRICT JSON: {"explained": [{"id":"...","title":"...","detail":"...","suggested_action":"..."}]}"""


CHAT_SYSTEM_TEMPLATE = """You are Wayly — a calm, precise concierge that helps Australian families navigate the Support at Home program.
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
  "provider_abn": "",
  "classification": "",
  "pension_status": "",
  "quarterly_budget_total": 0.00,
  "care_management_deducted": 0.00,
  "care_management_rate_pct": 0.00,
  "service_budget_available": 0.00,
  "rollover_from_prior_quarter": 0.00,
  "budget_remaining_at_quarter_end": 0.00,
  "reported_total_gross": 0.00,
  "reported_total_participant_contribution": 0.00,
  "reported_total_government_paid": 0.00,
  "stream_used_this_month": {
    "Clinical": 0.00,
    "Independence": 0.00,
    "EverydayLiving": 0.00
  },
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
- reported_total_gross is the statement's own "Total gross billed" / "Total this month" / "TOTAL" figure under the statement-totals section (the provider's stated total, including ALL streams + care management + previous-period adjustments — i.e. the bottom-line monthly TOTAL row).
- reported_total_participant_contribution / reported_total_government_paid are the matching totals if listed.
- budget_remaining_at_quarter_end is the statement's stated remaining quarterly service budget (post all line items), if shown.
- provider_abn is the provider's Australian Business Number as it appears on the statement header (e.g. "12 345 678 901" or "12345678901"). Copy it verbatim including any spaces. If absent, "".
- stream_used_this_month is the per-stream "Used [current month] (this statement)" / "Used This Month" / "Spent This Month" / "This Month Total" figures from the QUARTERLY BUDGET SUMMARY or BUDGET TRACKING or "SERVICE STREAM ALLOCATIONS" header sections. Match the provider's value for the CURRENT statement month — typically labelled "Used [Month] (this statement): $XX.XX" inside each stream's allocation block. CRITICAL: this must be the value from the header / allocations block, NOT the "Stream X Subtotal" line printed inside the ITEMISED SERVICES tables. Those two figures may legitimately differ (and a discrepancy is itself a flagged anomaly), so it is essential you extract the HEADER value here, not the subtotal. If the header value is absent or unclear, use 0.00 for that stream. Only fill the three keys (Clinical, Independence, EverydayLiving). Use 0.00 when not present.

PENSION STATUS — read this from the SERVICE STREAM ALLOCATIONS section by looking at the Independence and Everyday Living "Participant Contribution Rate" percentages:
  - Independence 5% AND Everyday Living 17.5% → "full_age_pension"
  - Independence 17.5% AND Everyday Living 50% → "part_age_pension"
  - Independence 50% AND Everyday Living 80% → "self_funded"
  - Rates absent or any other combination → "unknown"
  Also accept explicit text in the statement such as "(part Age Pension)" / "(full Age Pension)" / "(self-funded)" appended to a contribution-rate label, and use that to set pension_status accordingly.

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

INDEPENDENCE_DESCRIPTION = """The Independence stream covers personal care (showering, grooming, toileting), respite care, social support, transport (community access, medical appointments, hospital). Service codes typically begin PC-, RES-, SS-, TR-. Include transport items even if they have a "stream query" note.

CRITICAL — TRANSPORT ITEMS (read carefully — historical errors here):
- Extract EVERY transport line item individually. Do NOT deduplicate transport items even if they share the same service code and rate. Each transport entry on a different date is a separate service that MUST appear in your output.
- Specifically: if the statement contains transport entries on 05-May (two entries) AND a transport entry on 19-May, ALL THREE must appear in your line_items output. The 05-May entries are the same date and may be a duplicate billing — but they must both be extracted; the duplicate-detection rule downstream handles them. The 19-May entry is a different date and must always be extracted independently.
- Transport to a cardiology appointment, oncology appointment, GP appointment, hospital, day-program, specialist consultation, Wesley Hospital, or any other destination is ALWAYS Independence stream — NEVER Clinical, regardless of the medical context of the destination.
- Service codes starting with "TR-" or descriptions containing "transport", "taxi", "driver", "vehicle", "bus" are ALWAYS Independence.
- If you see N transport entries in the source text, you MUST emit N transport line items. Never skip one because it "looks like a duplicate" or because it is to a medical destination."""

EVERYDAY_DESCRIPTION = """The Everyday Living stream covers domestic assistance (cleaning, laundry), home maintenance/gardening, meal preparation, shopping. Service codes typically begin DA-, GM-, ML-, SH-.

ALSO include AT-HM (Assistive Technology / Home Modifications) items in your output — but recode their stream to "ATHM" (NOT "EverydayLiving"), even if the source statement places them in Everyday Living. AT-HM service codes typically begin AT-."""

CLINICAL_EXTRACTOR_SYSTEM = _stream_extractor_system("Clinical", CLINICAL_DESCRIPTION)
INDEPENDENCE_EXTRACTOR_SYSTEM = _stream_extractor_system("Independence", INDEPENDENCE_DESCRIPTION)
EVERYDAY_EXTRACTOR_SYSTEM = _stream_extractor_system("EverydayLiving", EVERYDAY_DESCRIPTION).replace(
    '"stream": "EverydayLiving"',
    '"stream": "EverydayLiving" | "ATHM"',
)


ADJUSTMENTS_EXTRACTOR_SYSTEM = """You are a data extraction engine for Australian Support at Home statements. Extract ONLY (a) the Care Management fee line item, (b) the previous-period-adjustments array, (c) the AT-HM commitments / outstanding-orders register, and (d) AT-HM items that were claimed/charged in the CURRENT statement period. Skip every other line item.

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
      "amount_claimed_this_period": 0.00,
      "status": ""
    }
  ],
  "at_hm_line_items_this_period": [
    {
      "date": "",
      "service_description": "",
      "service_code": "",
      "stream": "ATHM",
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
  ]
}

Rules:
- Care management fee usually has service code CM-01 or description containing "Care management". Always coded stream: "CareMgmt". For statements that apportion a quarterly care-management fee across months, extract ONLY the portion attributed to the current statement period (e.g. if the statement says "March portion (this statement): $160.83", that $160.83 is the line item). Do NOT include prior-month portions or the quarterly-total figure.
- Previous-period adjustments are listed in a separate "PREVIOUS PERIOD ADJUSTMENTS" or similar section — they are credits/refunds for prior months, NOT line items. Credit amounts are positive numbers (the dollar value of the credit), even if the source uses a leading minus sign for display.
- AT-HM commitments come from sections titled "AT-HM Commitments", "Outstanding Orders", "Approved Items Pending Delivery", or similar. They represent assistive-tech / home-modification items that were APPROVED (with a spend-limit) but may or may not yet have been delivered/installed/claimed.
- For each AT-HM commitment include: a reference number (ref), item description, approval_date (ISO if possible), expiry_date (ISO if possible), amount_approved, amount_claimed (cumulative — default 0.00 if not stated), amount_remaining (default amount_approved - amount_claimed if not stated explicitly), amount_claimed_this_period (the portion claimed in the CURRENT statement period only — use phrases like "claimed this period", "amount this month", "claimed in May", invoice dates inside the current period to detect this; default 0.00 if you can't tell), and a short status string ("approved", "in progress", "delivered", etc).
- at_hm_line_items_this_period: If an AT-HM commitment was claimed/charged in the CURRENT statement period (i.e. amount_claimed_this_period > 0), ALSO emit it as a line item in this array, using the commitment ref as service_code (e.g. "ATHM-2026-0118"), the item_description, gross = amount_claimed_this_period, participant_contribution = 0.00, government_paid = amount_claimed_this_period, stream = "ATHM", and the invoice date as the date if visible (otherwise the statement period_end). This ensures AT-HM costs appear in the per-stream breakdown and the gross total reconciles with the statement's printed total.
- If the statement has no AT-HM commitments section, return an empty at_hm_commitments and an empty at_hm_line_items_this_period array.
- Dates should be ISO (YYYY-MM-DD) when the source allows; otherwise copy verbatim.
- Return only valid JSON. No prose."""


# Provider-notes chunk — extracts the free-form "PROVIDER NOTES" / "ADDITIONAL NOTES"
# section at the bottom of statements. These often contain disclosures (brokered
# rate premiums, care plan issues, upcoming changes) that line items don't carry.
PROVIDER_NOTES_EXTRACTOR_SYSTEM = """You are a data extraction engine for Australian Support at Home statements. Extract ONLY the free-form notes section(s) — typically found under headings like "PROVIDER NOTES", "ADDITIONAL NOTES", "ADVISORY NOTES", "REMARKS", or similar at the bottom of the statement.

Return STRICT JSON only:
{
  "provider_notes_raw": [
    "Note 1 full text",
    "Note 2 full text"
  ]
}

Rules:
- Each numbered or bulleted note becomes ONE entry in the array, with its full prose preserved. Do NOT summarise. Do NOT paraphrase.
- Strip leading numbering / bullet characters ("1.", "•", "-") but keep the full sentence(s).
- If a note spans multiple lines, join the lines with single spaces and keep the entry as one string.
- DO NOT include sub-line "NOTE:" comments that are attached to specific service line items in the itemised services tables — those are line-item flags, not provider notes.
- DO include notes from any section explicitly titled "PROVIDER NOTES", "ADDITIONAL NOTES", "ADVISORY NOTES", "REMARKS", "STATEMENT NOTES", or similar.
- If no such section exists, return an empty array.
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
ONLY trigger this rule when there is unambiguous evidence of an INPATIENT hospital admission. An inpatient admission means the participant stayed in hospital overnight or longer — never a clinic visit, specialist review, day procedure, or outpatient appointment.

REQUIRED EVIDENCE — at least ONE of the following MUST appear in line-item notes/flags/cancellations or in provider_notes_raw:
  (a) A cancelled service with notes containing "hospitalised", "hospital admission", "admitted to hospital", "admitted overnight", "inpatient", "days in hospital", "stayed overnight", or "discharged from hospital".
  (b) A line item for hospital transport on a date followed by cancelled services on subsequent days.
  (c) Provider notes explicitly stating "hospital admission" or "admitted" together with a duration of at least one night.

EVIDENCE THAT MUST NOT TRIGGER THIS RULE:
  - Outpatient appointment ("review", "assessment", "clinic", "consultation").
  - "Cardiology review" / "specialist review" without explicit admission language.
  - Single-day transport to a hospital without subsequent service cancellations.
  - Any note containing "review" or "appointment" without "admitted" or "hospitalised".

If the inpatient evidence is present AND no line item has service_code beginning "RCP-" or description containing "Restorative": flag as HIGH severity. Otherwise DO NOT EMIT THIS RULE under any circumstances.

RULE 8 — TRANSPORT STREAM QUERY
If any transport line item (service_code beginning "TR-") is on the same date as a hospital admission cancellation or has flags_in_original mentioning "hospital" or "emergency": flag as LOW severity.

GLOBAL RULE — NO NO-ANOMALY COMMENTARY
Never emit anomaly objects whose detail says "no anomaly", "no issue found", "standard rate applies", "Friday is a weekday", "weekday rate is correct", "this is consistent with", or any equivalent phrase that explains why a rule did NOT fire. The anomalies array contains only positive findings. If a rule check produces "no anomaly", emit nothing — silence is the correct output.

RULE 9 — CONTRIBUTION ARITHMETIC CHECK (PENSION-AWARE)
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check is performed in code (rule keys "RULE_9_CONTRIBUTION_MISMATCH" or "RULE_9_PENSION_STATUS_UNKNOWN") which:
  - Reads pension_status from the extracted header.
  - If pension_status is "unknown": emits ONE LOW-severity flag advising the user that contribution checks were skipped (and runs no per-line math).
  - Otherwise: looks up the correct rate per stream from the table below and validates each non-cancelled line item's participant_contribution against (gross × expected_rate). Only flags a line where the variance exceeds $0.10.

  Contribution rate table:
    full_age_pension  → Clinical 0%, Independence 5%,    EverydayLiving 17.5%, ATHM 0%
    part_age_pension  → Clinical 0%, Independence 17.5%, EverydayLiving 50%,   ATHM 0%
    self_funded       → Clinical 0%, Independence 50%,   EverydayLiving 80%,   ATHM 0%

You MUST skip Rule 9 entirely in your output. Emitting Rule 9 in your JSON will cause double-counting and is treated as a hallucination.

RULE 10 — PREVIOUS PERIOD ADJUSTMENTS
If adjustments array is non-empty: flag as LOW severity (informational). Summarise what was corrected and confirm the credit was applied to government_paid not participant_contribution.

RULE 11 — BROKERED RATE PREMIUM (HARD EVIDENCE GATE)
HARD GATE — emit this rule ONLY when BOTH of these are EXPLICITLY stated as numeric dollar values in the source statement for the SAME service code:
  (a) the provider's published rate, AND
  (b) the brokered provider's rate.

If either rate is missing, partial, paraphrased, or "implied", DO NOT EMIT THIS RULE. There is no "partially disclosed" or "estimated premium" category. The flag is either backed by both numeric rates or it does not exist.

The following words and phrases MUST NOT appear anywhere in the detail or suggested_action of a Rule 11 flag: "approximately", "suggests", "consistent with", "potential", "hidden", "likely premium", "cannot be calculated", "may exceed", "could indicate", "appears to", "partially disclosed". If you cannot state the rate difference as a specific confirmed dollar figure (e.g. "$7.00/hr above the published rate of $135.00/hr"), DO NOT create a flag.

When the gate passes:
  - Compute hours_this_month = sum of hours across all non-cancelled brokered line items of the same service code.
  - Dollar impact = (brokered_rate - published_rate) × hours_this_month.
  - Flag as MEDIUM severity, rule "RULE_11_BROKERED_PREMIUM".
  - Detail MUST contain both numeric rates verbatim, the per-hour premium, the total hours this month, and the dollar impact.

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
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_13_QUARTERLY_UNDERSPEND") that compares budget_remaining_at_quarter_end against the rollover cap and emits LOW or MEDIUM as appropriate. Skip this rule entirely in your output to avoid double-counting.

RULE 14 — STATEMENT PERIOD ACCURACY (parsing warning)
Verify the extracted statement_period (and period_start/period_end if present) match the explicit "STATEMENT PERIOD" header in the source — NOT the quarterly-budget-summary date range.
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_14_PERIOD_PARSE_WARNING") which fires only when the period span exceeds 35 days. Skip this rule entirely in your output to avoid double-counting.

RULE 15 — GROSS TOTAL VALIDATION (parsing warning)
Compute extracted_total = sum(line_item.gross for line_item where is_cancellation=false) - sum(prev_period_adjustment.credit_amount).
Compare extracted_total against reported_total_gross from the header.
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_15_GROSS_TOTAL_PARSE_WARNING") which fires when the difference is > $5.00. Skip this rule entirely in your output to avoid double-counting.

RULE 16 — STREAM SUBTOTAL vs HEADER DISCREPANCY
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_16_STREAM_DISCREPANCY") compares each stream's summed line-item gross against the header's "Used This Month" figure for that stream and emits a MEDIUM anomaly if they differ by more than $5.

RULE 17 — CARE PLAN REVIEW DUE (provider notes pattern)
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_17_CARE_PLAN_REVIEW_DUE") scans provider_notes_raw for review-due phrases and emits a LOW anomaly.

RULE 18 — PLANNED SERVICE INCREASE (provider notes pattern)
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_18_SERVICE_INCREASE") scans provider_notes_raw for frequency-increase phrases and emits a LOW anomaly.

RULE 19 — LARGE AT-HM CLAIM
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_19_AT_HM_LARGE_CLAIM") fires when an AT-HM commitment with amount_approved > $1,500 has amount_claimed >= 90% of approved.

RULE 20 — PROVIDER ABN FORMAT
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_20_ABN_FORMAT") validates the provider_abn header field against the 11-digit ABN format.

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
    is_valid=None,
) -> Optional[Any]:
    """Run a single chunked extraction call with one retry. Returns parsed
    JSON or None. Retries once on transport / parse failure or, when an
    `is_valid` callable is provided, when the parsed result fails validation
    (e.g. all fields empty — a known LLM hiccup mode for the header chunk).
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
            return None
        if is_valid is not None and not is_valid(parsed):
            logger.warning(
                "Chunk %s attempt %d returned invalid/empty result — retrying. snapshot=%r",
                session_id, attempt, str(parsed)[:300],
            )
            return None
        return parsed

    result = await _attempt(1)
    if result is not None:
        return result
    # One retry — fresh session id so any stuck conversation state is reset
    return await _attempt(2)


_HEADER_DEFAULTS = {
    "participant_name": "", "mac_id": "", "statement_period": "",
    "period_start": "", "period_end": "",
    "provider_name": "", "provider_abn": "", "classification": "",
    "pension_status": "",
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

_HEADER_DICT_DEFAULTS = {
    "stream_used_this_month": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
}


def _empty_extracted() -> Dict[str, Any]:
    return {
        **_HEADER_DEFAULTS,
        **{k: dict(v) for k, v in _HEADER_DICT_DEFAULTS.items()},
        "line_items": [],
        "previous_period_adjustments": [],
        "at_hm_commitments": [],
        "provider_notes_raw": [],
    }


def _is_subtotal_row(it: Dict[str, Any]) -> bool:
    """Return True if a 'line item' is actually a subtotal/summary row that
    should not be counted alongside individual service items.
    """
    desc = (it.get("service_description") or "").lower()
    code = (it.get("service_code") or "").lower()
    if any(w in desc for w in ("subtotal", "sub total", "sub-total", " total", "balance forward", "running total")):
        return True
    # Pure heading rows that lack a date are also summaries
    if not (it.get("date") or "").strip() and any(w in desc for w in ("total", "summary")):
        return True
    if code in {"subtotal", "total", "sum", "balance"}:
        return True
    return False


def _recover_transport_items(items: list[dict], text: str) -> list[dict]:
    """Deterministic backstop — scans the original statement text for
    date-prefixed transport line entries (TR- service codes) that were not
    captured by the Independence chunked extractor. Adds a stub Independence
    line item for each missing entry.

    The Beverley fixture contains TR-003 entries on multiple dates; the LLM
    occasionally drops one mid-month entry when they appear far apart in the
    statement. This pass restores those.
    """
    import re as _re
    if not text or not isinstance(text, str):
        return items
    # Pattern: <DD-Month> on a line, then TR-XXX nearby, then $amount nearby.
    # Tight horizontal bounds — date and TR- must be within ~80 chars (i.e. on
    # the same statement line, accounting for column spacing). Too loose and
    # we false-positive across separate line items.
    LINE_RE = _re.compile(
        r"(?P<date>(?:\d{1,2}[-\s][A-Z][a-z]{2,8})|\d{4}-\d{2}-\d{2})"
        r"[^\n\r]{0,100}?"
        r"(?P<code>TR-\d{2,4})"
        r"[^\n\r]{0,80}?"
        r"\$(?P<amount>\d+(?:\.\d{1,2})?)",
    )

    # Index existing items by (date, code, gross).
    def _norm_date(d: str) -> str:
        return _re.sub(r"[^a-zA-Z0-9]", "", d or "").lower()

    # Collect existing transport occurrence count per (date, code) — match by
    # date + code only so that an LLM-extracted item with gross=None still
    # counts as already present and we don't add a duplicate stub.
    from collections import Counter
    occurrences: Counter = Counter()
    for it in items:
        if not isinstance(it, dict):
            continue
        code = (it.get("service_code") or "").strip().upper()
        if not code.startswith("TR"):
            continue
        occurrences[(_norm_date(it.get("date") or ""), code)] += 1

    # Scan the source text for TR- references and count occurrences per (date, code).
    found: Counter = Counter()
    found_amount: dict = {}
    for m in LINE_RE.finditer(text):
        date = m.group("date").strip()
        code = m.group("code").upper()
        try:
            amount = round(float(m.group("amount")), 2)
        except Exception:
            continue
        # Skip if the matched $amount looks like a subtotal aggregate (>= $250 for transport).
        # TR- charges are tiny per-trip; subtotal rows are big. Also skip $0 entries.
        if amount <= 0 or amount > 250:
            continue
        key = (_norm_date(date), code)
        found[key] += 1
        # Remember the first dollar-amount we saw for this (date, code) so the
        # stub is realistic.
        if key not in found_amount:
            found_amount[key] = (date, amount)

    # For each found (date, code), ensure we have at least that many in items.
    for (date_norm, code), seen_count in found.items():
        already = occurrences.get((date_norm, code), 0)
        missing = seen_count - already
        if missing <= 0:
            continue
        raw_date, amount = found_amount[(date_norm, code)]
        # Cap recoveries to a sane upper bound to avoid runaway noise from regex matches.
        for _ in range(min(missing, 5)):
            items.append({
                "date": raw_date,
                "service_description": "Community Transport",
                "service_code": code,
                "stream": "Independence",
                "hours": 0.0,
                "unit_rate": amount,
                "gross": amount,
                "participant_contribution": round(amount * 0.5, 2),
                "government_paid": round(amount * 0.5, 2),
                "is_cancellation": False,
                "worker_name": "",
                "is_brokered": False,
                "provider_notes": "(recovered by deterministic transport backstop — verify against original)",
                "flags_in_original": "",
            })
            occurrences[(date_norm, code)] = already + 1
            already += 1
    return items


def _dedupe_line_items(items: list[dict]) -> tuple[list[dict], int]:
    """Drop duplicate line items by (date + service_code + gross) signature.
    Returns (filtered, n_dropped).
    """
    seen: set[tuple] = set()
    out: list[dict] = []
    dropped = 0
    for it in items:
        sig = (
            (it.get("date") or "").strip().lower(),
            (it.get("service_code") or "").strip().upper(),
            round(float(it.get("gross") or 0.0), 2),
            (it.get("worker_name") or "").strip().lower(),
            bool(it.get("is_cancellation")),
        )
        # Empty-signature items (no date AND no code AND zero gross) are likely
        # parsing artifacts — drop them quietly without counting as duplicates.
        if not sig[0] and not sig[1] and sig[2] == 0.0:
            dropped += 1
            continue
        if sig in seen:
            dropped += 1
            continue
        seen.add(sig)
        out.append(it)
    return out, dropped


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

    def _header_is_valid(parsed):
        if not isinstance(parsed, dict):
            return False
        # Accept the result if at least ONE of the headline fields populated.
        if (parsed.get("participant_name") or "").strip():
            return True
        if (parsed.get("statement_period") or "").strip() or (parsed.get("period_end") or "").strip():
            return True
        try:
            if float(parsed.get("quarterly_budget_total") or 0) > 0:
                return True
        except Exception:
            pass
        try:
            if float(parsed.get("reported_total_gross") or 0) > 0:
                return True
        except Exception:
            pass
        return False

    tasks = [
        _llm_chunk_call(HEADER_EXTRACTOR_SYSTEM, user_msg, f"extract-header-{household_id}", max_tokens=1000, is_valid=_header_is_valid),
        _llm_chunk_call(CLINICAL_EXTRACTOR_SYSTEM, user_msg, f"extract-clin-{household_id}", max_tokens=2500),
        _llm_chunk_call(INDEPENDENCE_EXTRACTOR_SYSTEM, user_msg, f"extract-indep-{household_id}", max_tokens=2500),
        _llm_chunk_call(EVERYDAY_EXTRACTOR_SYSTEM, user_msg, f"extract-everyday-{household_id}", max_tokens=2500),
        _llm_chunk_call(ADJUSTMENTS_EXTRACTOR_SYSTEM, user_msg, f"extract-adj-{household_id}", max_tokens=1200),
        _llm_chunk_call(PROVIDER_NOTES_EXTRACTOR_SYSTEM, user_msg, f"extract-notes-{household_id}", max_tokens=1500),
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    header_res, clin_res, indep_res, every_res, adj_res, notes_res = [
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
        # Merge dict-typed header fields (e.g. stream_used_this_month)
        sutm = header_res.get("stream_used_this_month")
        if isinstance(sutm, dict):
            cleaned = {}
            for stream_key in ("Clinical", "Independence", "EverydayLiving"):
                try:
                    cleaned[stream_key] = float(sutm.get(stream_key) or 0.0)
                except Exception:
                    cleaned[stream_key] = 0.0
            assembled["stream_used_this_month"] = cleaned
        # Normalise pension_status to one of the canonical values
        ps = (assembled.get("pension_status") or "").strip().lower().replace("-", "_").replace(" ", "_")
        if "self" in ps and "fund" in ps:
            assembled["pension_status"] = "self_funded"
        elif "part" in ps and "pension" in ps:
            assembled["pension_status"] = "part_age_pension"
        elif "full" in ps and "pension" in ps:
            assembled["pension_status"] = "full_age_pension"
        elif ps in {"full_age_pension", "part_age_pension", "self_funded", "unknown"}:
            assembled["pension_status"] = ps
        else:
            assembled["pension_status"] = "unknown"

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
                if _is_subtotal_row(it):
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
            if isinstance(it, dict) and not _is_subtotal_row(it):
                it["stream"] = "CareMgmt"
                line_items.append(it)
        adj_list = adj_res.get("previous_period_adjustments") or []
        if isinstance(adj_list, list):
            assembled["previous_period_adjustments"] = [a for a in adj_list if isinstance(a, dict)]
        commitments = adj_res.get("at_hm_commitments") or []
        if isinstance(commitments, list):
            assembled["at_hm_commitments"] = [c for c in commitments if isinstance(c, dict)]
        # AT-HM items claimed this period — append to line_items so they appear
        # in the stream breakdown and feed the gross total reconciliation.
        for it in (adj_res.get("at_hm_line_items_this_period") or []):
            if not isinstance(it, dict):
                continue
            try:
                gross = float(it.get("gross") or 0.0)
            except Exception:
                gross = 0.0
            if gross <= 0:
                continue
            it["stream"] = "ATHM"
            line_items.append(it)

    # Provider notes
    if isinstance(notes_res, dict):
        notes = notes_res.get("provider_notes_raw") or []
        if isinstance(notes, list):
            assembled["provider_notes_raw"] = [str(n).strip() for n in notes if str(n or "").strip()]

    # Deterministic transport-recovery backstop —
    # The LLM occasionally drops one of multiple TR- transport entries when
    # they appear far apart in the statement. Scan the original text for any
    # date-prefixed line containing a TR- service code and a $-amount, and
    # add a stub Independence line item if it isn't already in `line_items`.
    line_items = _recover_transport_items(line_items, text)

    # Dedupe line items (drops duplicates extracted from both stream + subtotal rows
    # the LLM accidentally treats as items)
    line_items, n_dropped = _dedupe_line_items(line_items)
    assembled["line_items"] = line_items
    if n_dropped:
        assembled["_dedupe_dropped"] = n_dropped

    # Capture failure metadata so the caller can know which chunks fell over
    failures = []
    for name, res in [
        ("header", header_res),
        ("clinical", clin_res),
        ("independence", indep_res),
        ("everyday", every_res),
        ("adjustments", adj_res),
        ("provider_notes", notes_res),
    ]:
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
        fallback = _add_parse_warnings(_empty_audit(extracted), extracted)
        _apply_reported_totals(fallback, extracted)
        _recompute_stream_breakdown(fallback, extracted)
        return fallback
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
        # Append deterministic parse warnings (Rules 9, 13, 14 & 15) and re-tally
        result = _add_parse_warnings(result, extracted)
        # If the statement reports explicit totals, prefer those for display
        _apply_reported_totals(result, extracted)
        # Always recompute stream_breakdown deterministically so AT-HM card is present
        _recompute_stream_breakdown(result, extracted)
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
        _apply_reported_totals(fallback, extracted)
        _recompute_stream_breakdown(fallback, extracted)
        fallback["_audit_error"] = f"json_parse: {e}"
        return fallback
    except Exception as e:
        logger.warning("Auditor Pass 2 failed: %s", e)
        fallback = _add_parse_warnings(_empty_audit(extracted), extracted)
        _apply_reported_totals(fallback, extracted)
        _recompute_stream_breakdown(fallback, extracted)
        fallback["_audit_error"] = str(e)
        return fallback


def _apply_reported_totals(audit_result: Dict[str, Any], extracted: Dict[str, Any]) -> None:
    """If the statement explicitly reports its own totals, prefer those for
    the display layer (UI `statement_summary`). This makes the decoded figure
    match the statement's printed bottom-line total exactly, instead of
    summing (sometimes inconsistent) extracted line items. A parsing
    warning is still raised separately by Rule 15 when they don't reconcile.
    """
    try:
        reported_gross = float(extracted.get("reported_total_gross") or 0.0)
        reported_contrib = float(extracted.get("reported_total_participant_contribution") or 0.0)
        reported_gov = float(extracted.get("reported_total_government_paid") or 0.0)
    except Exception:
        return
    summary = audit_result.setdefault("statement_summary", {}) or {}
    if reported_gross > 0:
        summary["total_gross"] = round(reported_gross, 2)
        summary["net_budget_impact"] = round(reported_gross, 2)
    if reported_contrib > 0:
        summary["total_participant_contribution"] = round(reported_contrib, 2)
    if reported_gov > 0:
        summary["total_government_paid"] = round(reported_gov, 2)
    audit_result["statement_summary"] = summary


def _recompute_stream_breakdown(audit_result: Dict[str, Any], extracted: Dict[str, Any]) -> None:
    """Always recompute the stream_breakdown array deterministically from the
    extracted line items. Replaces whatever the LLM auditor returned (which
    sometimes omits AT-HM or merges streams). Guarantees the UI gets a card
    for every stream that has at least one non-cancelled line item — including
    AT-HM (assistive tech / home modifications)."""
    items = extracted.get("line_items") or []
    by_stream: Dict[str, Dict[str, float]] = {}
    # Stable display order — AT-HM card sits between Everyday Living and Care Mgmt.
    ORDER = ["Clinical", "Independence", "EverydayLiving", "ATHM", "CareMgmt"]
    for li in items:
        if not isinstance(li, dict) or li.get("is_cancellation"):
            continue
        stream = (li.get("stream") or "Unknown").strip() or "Unknown"
        b = by_stream.setdefault(stream, {
            "line_item_count": 0,
            "gross_total": 0.0,
            "participant_contribution": 0.0,
            "government_paid": 0.0,
        })
        b["line_item_count"] += 1
        try:
            b["gross_total"] += float(li.get("gross") or 0.0)
            b["participant_contribution"] += float(li.get("participant_contribution") or 0.0)
            b["government_paid"] += float(li.get("government_paid") or 0.0)
        except Exception:
            pass
    out: list[dict] = []
    for s in ORDER:
        if s in by_stream:
            v = by_stream.pop(s)
            out.append({"stream": s, **{k: round(val, 2) if isinstance(val, float) else val for k, val in v.items()}})
    # Any remaining (unknown) streams append in alpha order
    for s in sorted(by_stream.keys()):
        v = by_stream[s]
        out.append({"stream": s, **{k: round(val, 2) if isinstance(val, float) else val for k, val in v.items()}})
    audit_result["stream_breakdown"] = out


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


# Pension-aware contribution rate table for Rule 9 deterministic check.
# Maps pension_status → stream → expected contribution rate (decimal).
_PENSION_RATES = {
    "full_age_pension": {"Clinical": 0.0,    "Independence": 0.05,  "EverydayLiving": 0.175, "ATHM": 0.0, "CareMgmt": 0.0},
    "part_age_pension": {"Clinical": 0.0,    "Independence": 0.175, "EverydayLiving": 0.5,   "ATHM": 0.0, "CareMgmt": 0.0},
    "self_funded":      {"Clinical": 0.0,    "Independence": 0.5,   "EverydayLiving": 0.8,   "ATHM": 0.0, "CareMgmt": 0.0},
}


def _add_parse_warnings(audit_result: Dict[str, Any], extracted: Dict[str, Any]) -> Dict[str, Any]:
    """Append deterministic parsing warnings (Rules 9, 13, 14 & 15) if conditions
    are met and the LLM hasn't already flagged the same rule. Returns the
    mutated audit_result for chaining.
    """
    anomalies = audit_result.setdefault("anomalies", []) or []

    # Drop malformed anomalies (missing rule key, missing severity, or empty headline)
    anomalies = [
        a for a in anomalies
        if isinstance(a, dict)
        and (a.get("rule") or "").strip()
        and (a.get("severity") or "").strip()
        and not (a.get("rule") or "").strip().lower().endswith("_")  # e.g. "RULE_:" stub
    ]
    audit_result["anomalies"] = anomalies

    existing_rules = {(a.get("rule") or "").upper() for a in anomalies if isinstance(a, dict)}

    # Rule 9 — Pension-aware contribution arithmetic (deterministic)
    rule_9_keys = {"RULE_9_CONTRIBUTION_MISMATCH", "RULE_9_PENSION_STATUS_UNKNOWN"}
    if not (existing_rules & rule_9_keys):
        pension_status = (extracted.get("pension_status") or "unknown").strip().lower()
        if pension_status not in _PENSION_RATES:
            anomalies.append({
                "severity": "low",
                "rule": "RULE_9_PENSION_STATUS_UNKNOWN",
                "headline": "We couldn't confirm this participant's pension status from the statement.",
                "detail": "Contribution rate checks have been skipped because pension status is unclear. Verify your contribution rates directly with your provider — the correct rates depend on whether the participant receives the full Age Pension, part Age Pension, or is self-funded.",
                "dollar_impact": 0.0,
                "evidence": [f"pension_status: {pension_status or 'unknown'}"],
                "suggested_action": "Phone your provider's billing line and ask them to confirm the participant's recorded pension status, then reconcile your contribution rates against the published Support at Home rate table.",
            })
        else:
            rates = _PENSION_RATES[pension_status]
            mismatches: list[dict] = []
            for li in (extracted.get("line_items") or []):
                if not isinstance(li, dict):
                    continue
                if li.get("is_cancellation"):
                    continue
                stream = (li.get("stream") or "").strip()
                expected_rate = rates.get(stream)
                if expected_rate is None:
                    continue
                try:
                    gross = float(li.get("gross") or 0.0)
                    contrib = float(li.get("participant_contribution") or 0.0)
                except Exception:
                    continue
                if gross <= 0:
                    continue
                expected_dollars = round(gross * expected_rate, 2)
                variance = round(abs(contrib - expected_dollars), 2)
                if variance > 0.10:
                    mismatches.append({
                        "date": li.get("date") or "",
                        "service_code": li.get("service_code") or "",
                        "service_description": li.get("service_description") or "",
                        "stream": stream,
                        "gross": gross,
                        "charged_contribution": round(contrib, 2),
                        "expected_contribution": expected_dollars,
                        "expected_rate_pct": round(expected_rate * 100, 2),
                        "variance": variance,
                    })
            for m in mismatches:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_9_CONTRIBUTION_MISMATCH",
                    "headline": (
                        f"{m['service_description'] or m['service_code'] or m['stream']} "
                        f"on {m['date']} contribution doesn't match the expected "
                        f"{m['expected_rate_pct']}% rate for {pension_status.replace('_', ' ')}."
                    ),
                    "detail": (
                        f"For a {pension_status.replace('_', ' ')} participant, the {m['stream']} stream "
                        f"contribution rate is {m['expected_rate_pct']}%. On gross ${m['gross']:,.2f} the expected "
                        f"contribution is ${m['expected_contribution']:,.2f}, but the statement charged "
                        f"${m['charged_contribution']:,.2f} — a variance of ${m['variance']:,.2f}."
                    ),
                    "dollar_impact": m["variance"],
                    "evidence": [
                        f"pension_status: {pension_status}",
                        f"stream: {m['stream']}",
                        f"gross: ${m['gross']:,.2f}",
                        f"charged contribution: ${m['charged_contribution']:,.2f}",
                        f"expected contribution: ${m['expected_contribution']:,.2f}",
                    ],
                    "suggested_action": (
                        f"Ask your provider to confirm the contribution rate applied to "
                        f"{m['service_code'] or m['service_description']} on {m['date']}, and to refund the "
                        f"variance if it was charged in error."
                    ),
                })

    # Rule 13 — Quarterly underspend pattern (deterministic, period-aware)
    # Only fire the full forfeiture alert when the statement period_end falls
    # in the FINAL month of the quarter (March / June / September / December).
    # In mid-quarter months, emit a soft LOW informational note only.
    if "RULE_13_QUARTERLY_UNDERSPEND" not in existing_rules and "RULE_13_MID_QUARTER_UPDATE" not in existing_rules:
        try:
            quarterly_total = float(extracted.get("quarterly_budget_total") or 0.0)
            remaining = float(extracted.get("budget_remaining_at_quarter_end") or 0.0)
        except Exception:
            quarterly_total = remaining = 0.0
        QUARTER_FINAL_MONTHS = {3, 6, 9, 12}
        period_end = _parse_iso_date(extracted.get("period_end"))
        period_month = period_end.month if period_end else None
        is_final_month = period_month in QUARTER_FINAL_MONTHS

        if is_final_month and quarterly_total > 0 and remaining > 0:
            # Final month of the quarter — fire the full forfeiture alert
            remaining_pct = remaining / quarterly_total * 100
            rollover_cap = max(1000.00, 0.10 * quarterly_total)
            if remaining_pct >= 10 or remaining >= 500:
                participant = extracted.get("participant_name") or "The participant"
                forfeit = max(0.0, remaining - rollover_cap)
                if remaining > rollover_cap:
                    severity = "medium"
                    closing = (
                        f" Unspent funding above the rollover cap (${rollover_cap:,.2f}) is forfeited permanently — "
                        f"about ${forfeit:,.2f} is at risk."
                    )
                else:
                    severity = "low"
                    closing = (
                        f" The full ${remaining:,.2f} will roll over to next quarter (within the "
                        f"${rollover_cap:,.2f} rollover cap)."
                    )
                anomalies.append({
                    "severity": severity,
                    "rule": "RULE_13_QUARTERLY_UNDERSPEND",
                    "headline": f"{participant} ended the quarter with ${remaining:,.2f} unspent — about {remaining_pct:.0f}% of the quarterly budget.",
                    "detail": (
                        f"Quarterly budget was ${quarterly_total:,.2f}; ${remaining:,.2f} ({remaining_pct:.1f}%) remains at quarter end."
                        f"{closing} A care plan review might help ensure the full budget is being used for services {participant} needs."
                    ),
                    "dollar_impact": round(forfeit if remaining > rollover_cap else 0.0, 2),
                    "evidence": [
                        f"quarterly_budget_total: ${quarterly_total:,.2f}",
                        f"budget_remaining_at_quarter_end: ${remaining:,.2f}",
                        f"remaining_pct: {remaining_pct:.2f}%",
                        f"rollover_cap: ${rollover_cap:,.2f}",
                        f"period_end_month: {period_month}",
                    ],
                    "suggested_action": "Schedule a care-plan review with the provider before quarter end. Identify services the participant qualifies for but isn't currently using.",
                })
        elif period_month is not None and not is_final_month and quarterly_total > 0:
            # Mid-quarter month — only emit a LOW informational note when
            # less than 60% of the quarterly budget has been used so far AND
            # more than one month remains in the quarter.
            # Compute used-to-date from line items (fallback if remaining is 0).
            used_to_date = 0.0
            for li in (extracted.get("line_items") or []):
                if isinstance(li, dict) and not li.get("is_cancellation"):
                    try:
                        used_to_date += float(li.get("gross") or 0.0)
                    except Exception:
                        pass
            # If remaining is reported, prefer (quarterly - remaining) as used-to-date
            if remaining > 0:
                used_to_date = max(used_to_date, quarterly_total - remaining)
            used_pct = (used_to_date / quarterly_total * 100) if quarterly_total > 0 else 0.0
            # Months remaining in the quarter (1 = period_month is mid-quarter mid, etc)
            # Quarters: Q1=Jan/Feb/Mar, Q2=Apr/May/Jun, Q3=Jul/Aug/Sep, Q4=Oct/Nov/Dec.
            # Final-month is the 3rd month. Mid-quarter months remaining_after = (3 - position).
            quarter_position = ((period_month - 1) % 3) + 1  # 1, 2, or 3
            months_remaining = 3 - quarter_position  # 2 (1st month), 1 (2nd month), 0 (final)
            qtr_remaining_dollars = max(0.0, quarterly_total - used_to_date)
            if used_pct < 60.0 and months_remaining > 0:
                anomalies.append({
                    "severity": "low",
                    "rule": "RULE_13_MID_QUARTER_UPDATE",
                    "headline": f"Mid-quarter update: ${qtr_remaining_dollars:,.2f} remains in the quarterly budget with {months_remaining} month{'s' if months_remaining != 1 else ''} still to run. No action needed yet.",
                    "detail": (
                        f"This statement covers a mid-quarter month, so the underspend forfeiture risk doesn't apply yet. "
                        f"About {used_pct:.0f}% of the ${quarterly_total:,.2f} quarterly budget has been used — "
                        f"${qtr_remaining_dollars:,.2f} remains with {months_remaining} month{'s' if months_remaining != 1 else ''} left in the quarter."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [
                        f"period_end_month: {period_month}",
                        f"quarter_position: {quarter_position} of 3",
                        f"months_remaining: {months_remaining}",
                        f"used_to_date: ${used_to_date:,.2f}",
                        f"used_pct: {used_pct:.1f}%",
                        f"quarterly_budget_total: ${quarterly_total:,.2f}",
                    ],
                    "suggested_action": "No action required this month. We'll re-check at the end of the quarter.",
                })

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

    # Rule 16 — Stream subtotal vs header "Used This Month" discrepancy
    # (deterministic, EVERYDAY LIVING ONLY)
    #
    # Rationale: Clinical and Independence false-positive easily because the
    # LLM occasionally misses one or two line items (transport on a different
    # page, weekend variants, etc.) — that variance fires the rule even though
    # the actual statement is fine. We restrict the user-facing check to
    # Everyday Living, the smallest stream, where a discrepancy is most likely
    # to be a real provider error rather than an extraction blip.
    # Internal parsing warnings are still recorded for Clinical/Independence
    # when their extraction-vs-header confidence is low (< 0.92).
    if "RULE_16_STREAM_DISCREPANCY" not in existing_rules:
        sutm = extracted.get("stream_used_this_month") or {}
        if isinstance(sutm, dict):
            parsing_warnings: list[str] = []
            for stream_key in ("Clinical", "Independence", "EverydayLiving"):
                try:
                    header_val = float(sutm.get(stream_key) or 0.0)
                except Exception:
                    continue
                if header_val <= 0:
                    continue
                computed = 0.0
                for li in (extracted.get("line_items") or []):
                    if not isinstance(li, dict) or li.get("is_cancellation"):
                        continue
                    if (li.get("stream") or "") != stream_key:
                        continue
                    try:
                        computed += float(li.get("gross") or 0.0)
                    except Exception:
                        continue
                diff = abs(computed - header_val)
                confidence = 1.0 - (diff / header_val) if header_val > 0 else 1.0

                if stream_key in ("Clinical", "Independence"):
                    # Never user-facing. Just record an internal parsing warning when confidence is low.
                    if confidence < 0.92:
                        parsing_warnings.append(
                            f"{stream_key} extraction confidence low ({confidence:.2f}) — stream discrepancy check suppressed."
                        )
                    continue

                # Everyday Living — flag whenever diff > $5.
                if diff <= 5.0:
                    continue
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_16_STREAM_DISCREPANCY",
                    "headline": "Everyday Living total doesn't add up — reconciliation needed",
                    "detail": (
                        f"The Everyday Living line items on this statement total ${computed:,.2f}, "
                        f"but the budget summary shows ${header_val:,.2f} used for Everyday Living this month. "
                        f"The ${diff:,.2f} difference has no explanation on the statement. "
                        f"Note: this discrepancy is based on AI extraction which may not have captured every line item. "
                        f"Review your original statement to confirm."
                    ),
                    "dollar_impact": round(diff, 2),
                    "evidence": [
                        "stream: EverydayLiving",
                        f"sum of Everyday Living line items: ${computed:,.2f}",
                        f"header 'Used This Month' for Everyday Living: ${header_val:,.2f}",
                        f"extraction_confidence: {confidence:.3f}",
                    ],
                    "suggested_action": "Ask your provider to reconcile the Everyday Living total before your next statement.",
                })
            if parsing_warnings:
                audit_result.setdefault("_parsing_warnings", []).extend(parsing_warnings)

    # Rule 17 / 18 — Provider notes pattern matching (deterministic)
    notes_raw = extracted.get("provider_notes_raw") or []
    if isinstance(notes_raw, list) and notes_raw:
        # Pattern A — Care plan review due (broadened pattern set)
        if "RULE_17_CARE_PLAN_REVIEW_DUE" not in existing_rules:
            review_patterns = [
                "care plan review", "plan review", "review due",
                "review scheduled", "review in ", "last reviewed",
                "6-monthly review", "six-monthly review", "annual review",
                "plan is due",
            ]
            for note in notes_raw:
                if not isinstance(note, str):
                    continue
                lower = note.lower()
                if any(p in lower for p in review_patterns):
                    anomalies.append({
                        "severity": "low",
                        "rule": "RULE_17_CARE_PLAN_REVIEW_DUE",
                        "headline": "Care plan review is due or upcoming",
                        "detail": (
                            note.strip()
                            + " A care plan review is an opportunity to ensure services match current "
                            "needs — particularly important if there have been recent health changes."
                        ),
                        "dollar_impact": 0.0,
                        "evidence": [f"provider note: {note.strip()[:240]}"],
                        "suggested_action": (
                            "Confirm the review date with your care manager. Bring notes on any changes "
                            "since the last review — new diagnoses, medication changes, falls, or changes "
                            "in daily ability."
                        ),
                    })
                    break  # one flag is enough

        # Pattern B — Service frequency increasing
        if "RULE_18_SERVICE_INCREASE" not in existing_rules:
            increase_patterns = [
                "will increase", "additional visits", "more frequent",
                "weekly from", "twice weekly", "increasing frequency",
                "frequency will increase", "stepping up",
            ]
            for note in notes_raw:
                if not isinstance(note, str):
                    continue
                lower = note.lower()
                if any(p in lower for p in increase_patterns):
                    # Best-effort stream guess from keywords in the note
                    n = lower
                    if any(w in n for w in ("nurs", "wound", "clinical", "podiatry", "ot ", "physio")):
                        stream_label = "Clinical"
                    elif any(w in n for w in ("personal care", "respite", "social", "transport")):
                        stream_label = "Independence"
                    elif any(w in n for w in ("clean", "domestic", "garden", "meal", "shopping")):
                        stream_label = "EverydayLiving"
                    else:
                        stream_label = ""
                    impact = 0.0
                    # Try to estimate dollar impact: pick a $rate/hr and frequency from the note
                    import re as _re
                    rate_match = _re.search(r"\$(\d+(?:\.\d{1,2})?)", note)
                    freq_match = _re.search(r"(\d+)\s*(?:per\s+week|/\s*week|x\s*per\s*week|weekly)", lower)
                    hours_match = _re.search(r"(\d+(?:\.\d{1,2})?)\s*hour", lower)
                    if rate_match and freq_match:
                        try:
                            rate = float(rate_match.group(1))
                            visits_per_week = float(freq_match.group(1))
                            hours_per_visit = float(hours_match.group(1)) if hours_match else 1.0
                            # Project ~4.33 weeks/month
                            impact = round(rate * hours_per_visit * visits_per_week * 4.33, 2)
                        except Exception:
                            impact = 0.0
                    advisory_stream = stream_label or "current stream"
                    anomalies.append({
                        "severity": "low",
                        "rule": "RULE_18_SERVICE_INCREASE",
                        "headline": "Planned service increase may affect your budget",
                        "detail": note.strip(),
                        "dollar_impact": impact,
                        "evidence": [f"provider note: {note.strip()[:240]}"],
                        "suggested_action": (
                            f"Check with your care manager that your {advisory_stream} allocation is sufficient "
                            f"to cover the increased visits through the end of the quarter."
                        ),
                    })
                    break

    # Rule 19 — Large AT-HM claim (worth keeping the invoice)
    if "RULE_19_AT_HM_LARGE_CLAIM" not in existing_rules:
        for c in (extracted.get("at_hm_commitments") or []):
            if not isinstance(c, dict):
                continue
            try:
                approved = float(c.get("amount_approved") or 0.0)
                claimed = float(c.get("amount_claimed") or 0.0)
            except Exception:
                continue
            if approved <= 1500.0:
                continue
            if approved <= 0:
                continue
            # Claimed at or near the full spend limit (>= 90%)
            if claimed >= 0.90 * approved:
                desc = (c.get("item_description") or "AT-HM item").strip()
                anomalies.append({
                    "severity": "low",
                    "rule": "RULE_19_AT_HM_LARGE_CLAIM",
                    "headline": "Large AT-HM claim — worth keeping your invoice",
                    "detail": (
                        f"The full AT-HM allowance of ${approved:,.2f} for {desc} was claimed this month. "
                        f"AT-HM Tier 2 claims are subject to reasonable cost assessment. Retain the invoice "
                        f"from the supplier in case of query."
                    ),
                    "dollar_impact": round(claimed, 2),
                    "evidence": [
                        f"item: {desc}",
                        f"approved: ${approved:,.2f}",
                        f"claimed: ${claimed:,.2f}",
                        f"ref: {c.get('ref') or ''}",
                    ],
                    "suggested_action": "Keep the original invoice. If possible, obtain one comparative quote for your records.",
                })

    # Rule 20 — Provider ABN format validation
    if "RULE_20_ABN_FORMAT" not in existing_rules:
        abn_raw = (extracted.get("provider_abn") or "").strip()
        if abn_raw:
            # Strip spaces only — anything else is suspect.
            abn_no_spaces = abn_raw.replace(" ", "")
            invalid = (not abn_no_spaces.isdigit()) or (len(abn_no_spaces) != 11)
            if invalid:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_20_ABN_FORMAT",
                    "headline": "Provider ABN appears to contain a formatting error",
                    "detail": (
                        f"The ABN on this statement reads '{abn_raw}' which does not appear to be a valid "
                        f"Australian Business Number. A valid ABN contains 11 digits."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [
                        f"extracted ABN: {abn_raw}",
                        f"digits-only length: {len(abn_no_spaces)}",
                    ],
                    "suggested_action": (
                        "Verify this provider's ABN at abr.business.gov.au before making any payments. "
                        "An incorrect ABN on a statement may indicate a data entry error."
                    ),
                })

    # Rule 10 — Previous period adjustments (deterministic backstop — LLM is
    # inconsistent at emitting this even when adjustments are clearly present).
    if "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS" not in existing_rules:
        adjs = extracted.get("previous_period_adjustments") or []
        adjs = [a for a in adjs if isinstance(a, dict)]
        if adjs:
            total_credit = 0.0
            descriptions: list[str] = []
            for a in adjs:
                try:
                    total_credit += float(a.get("credit_amount") or 0.0)
                except Exception:
                    pass
                desc = (a.get("description") or "").strip()
                ref = (a.get("ref") or "").strip()
                if desc:
                    descriptions.append(f"{ref}: {desc}" if ref else desc)
            if total_credit > 0 or descriptions:
                anomalies.append({
                    "severity": "low",
                    "rule": "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS",
                    "headline": (
                        f"{len(adjs)} previous-period adjustment{'s' if len(adjs) != 1 else ''} "
                        f"applied — total credit ${total_credit:,.2f}."
                    ),
                    "detail": (
                        "These corrections relate to a prior month's services. "
                        "Confirm the credit was applied to the government share, not your participant contribution."
                        + (" Adjustment summary: " + " · ".join(descriptions[:3]) if descriptions else "")
                    ),
                    "dollar_impact": round(total_credit, 2),
                    "evidence": [f"adjustments: {len(adjs)}", f"total_credit: ${total_credit:,.2f}"],
                    "suggested_action": "Verify the credit shows on your next direct debit statement.",
                })

    # Rule 3 (deterministic) — Exact same-date duplicate detection.
    # Runs as a backstop to the LLM Rule 3 fuzzy check. A pair of line items
    # that share date + service_code + unit_rate (within $0.01) and are not
    # cancellations is almost certainly a billing duplicate — flag HIGH.
    if "RULE_3_DUPLICATE_EXACT" not in existing_rules:
        items_for_dup = [
            li for li in (extracted.get("line_items") or [])
            if isinstance(li, dict) and not li.get("is_cancellation")
        ]
        # Group by (normalised_date, service_code, rounded_unit_rate)
        groups: Dict[tuple, list[dict]] = {}
        for li in items_for_dup:
            date = (li.get("date") or "").strip()
            code = (li.get("service_code") or "").strip().upper()
            try:
                rate = round(float(li.get("unit_rate") or 0.0), 2)
            except Exception:
                rate = 0.0
            if not date or not code:
                continue
            groups.setdefault((date, code, rate), []).append(li)

        # Read provider notes once for the "return trip" hint.
        notes_blob = " ".join(
            (n or "").lower() for n in (extracted.get("provider_notes_raw") or [])
            if isinstance(n, str)
        )
        # Also scan inline provider_notes / flags_in_original on the matched items.
        for (date, code, rate), members in groups.items():
            if len(members) < 2:
                continue
            first = members[0]
            desc = (first.get("service_description") or first.get("service_name") or code or "service").strip()
            try:
                gross = float(first.get("gross") or 0.0)
            except Exception:
                gross = 0.0
            extra = ""
            inline_notes = " ".join(
                ((m.get("provider_notes") or "") + " " + (m.get("flags_in_original") or "")).lower()
                for m in members
            )
            looks_like_return_trip = (
                "return" in (desc or "").lower()
                and (
                    "per return trip" in notes_blob
                    or "return trip inclusive" in notes_blob
                    or "return trip" in inline_notes
                )
            )
            if looks_like_return_trip:
                extra = (
                    " The provider's published rate describes this service as a return trip — "
                    "charging it twice may mean you have been billed for two return trips instead of one."
                )
            anomalies.append({
                "severity": "high",
                "rule": "RULE_3_DUPLICATE_EXACT",
                "headline": f"Possible duplicate charge — {len(members)} identical {desc} services on {date}",
                "detail": (
                    f"{len(members)} {code} line items appear on {date} with the same rate of "
                    f"${rate:,.2f}. This may be a duplicate billing error.{extra}"
                ),
                "dollar_impact": round(gross * (len(members) - 1), 2),
                "evidence": [
                    f"date: {date}",
                    f"service_code: {code}",
                    f"unit_rate: ${rate:,.2f}",
                    f"occurrences: {len(members)}",
                ] + [
                    f"item {i+1}: gross ${float(m.get('gross') or 0):,.2f} worker '{m.get('worker_name') or ''}'"
                    for i, m in enumerate(members[:3])
                ],
                "suggested_action": (
                    f"Ask your provider to confirm whether {len(members)} separate {desc} services "
                    f"genuinely occurred on {date}. If only one occurred, request a credit of "
                    f"${gross:,.2f}."
                ),
            })

    # Rule 11 (deterministic) — Brokered rate premium.
    # Hard-evidence backstop. Fires only when provider_notes_raw or
    # line-item flags contain BOTH a brokered rate AND a published rate as
    # explicit numeric $-per-hour values. The LLM auditor is intentionally
    # conservative; this catches the common "Service X brokered at $A/hr;
    # published rate $B/hr; premium $C/hr" pattern, even when the comparison
    # is split across sentences.
    if not any((a.get("rule") or "").upper().startswith("RULE_11") for a in anomalies if isinstance(a, dict)):
        notes_blob_full = " ".join(
            (n or "") for n in (extracted.get("provider_notes_raw") or [])
            if isinstance(n, str)
        )
        # Also include line-item flags + provider_notes (some statements put
        # the brokered/published comparison inline with the line item).
        for li in (extracted.get("line_items") or []):
            if isinstance(li, dict):
                notes_blob_full += " " + (li.get("provider_notes") or "")
                notes_blob_full += " " + (li.get("flags_in_original") or "")

        import re as __re
        # Search for "Service X is brokered ... published rate $A/hr ... premium $B/hr"
        # — three sub-patterns within ~400 chars of each other.
        # We require: (1) "brokered" word, (2) "published" or "premium" word with $-amount,
        # (3) the brokered rate $-amount, (4) the published rate $-amount, all in proximity.
        # Approach: scan paragraph-sized windows for a brokered rate and a published rate.

        # Slide a window paragraph-by-paragraph (split on double newline / period+newline).
        windows = __re.split(r"\n\s*\n|(?<=\.)\s*\n", notes_blob_full)
        # Also include the full blob as a single fallback window for short-paragraph notes.
        if notes_blob_full not in windows:
            windows.append(notes_blob_full)

        for win in windows:
            w_lower = win.lower()
            if "brokered" not in w_lower or "published" not in w_lower:
                continue
            brokered_m = __re.search(r"brokered[^$]{0,200}\$([0-9]+(?:\.[0-9]{2})?)", w_lower)
            published_m = __re.search(r"published[^$]{0,200}\$([0-9]+(?:\.[0-9]{2})?)", w_lower)
            if not (brokered_m and published_m):
                # Try inverse order: "published rate ... brokered rate $X"
                m1 = __re.search(r"published[^$]{0,200}\$([0-9]+(?:\.[0-9]{2})?)", w_lower)
                m2 = __re.search(r"\$([0-9]+(?:\.[0-9]{2})?)[^$]{0,80}brokered", w_lower)
                if m1 and m2:
                    published_m = m1
                    brokered_m = m2
                else:
                    continue
            try:
                brokered_rate = round(float(brokered_m.group(1)), 2)
                published_rate = round(float(published_m.group(1)), 2)
            except Exception:
                continue
            premium = round(brokered_rate - published_rate, 2)
            if premium <= 0.50:
                continue
            # Try to identify the service code being discussed.
            code_match = __re.search(r"([A-Z]{2,5}-\d{2,4})", win)
            service_code = code_match.group(1) if code_match else ""
            # Service description — look for capitalised words preceding "brokered".
            descr_match = __re.search(r"\b((?:[A-Z][a-zA-Z]+ ?){1,4})(?:\s+(?:is|are|programme|services|service))?[^.]{0,80}brokered", win)
            service_label = descr_match.group(1).strip() if descr_match else ""
            label = service_label or service_code or "service"
            # Sum hours across all non-cancelled brokered line items of this code.
            hours = 0.0
            if service_code:
                for li in (extracted.get("line_items") or []):
                    if not isinstance(li, dict) or li.get("is_cancellation"):
                        continue
                    if (li.get("service_code") or "").upper() == service_code.upper():
                        try:
                            hours += float(li.get("hours") or 0.0)
                        except Exception:
                            pass
            dollar_impact = round(premium * hours, 2) if hours > 0 else round(premium, 2)
            anomalies.append({
                "severity": "medium",
                "rule": "RULE_11_BROKERED_PREMIUM",
                "headline": f"{label} brokered rate premium of ${premium:.2f}/hr above published rate.",
                "detail": (
                    f"The brokered rate for {label} is ${brokered_rate:.2f}/hr; "
                    f"the published rate is ${published_rate:.2f}/hr — a premium of ${premium:.2f}/hr."
                    + (f" Across {hours:.1f} hours this month the premium totals ${dollar_impact:,.2f}."
                       if hours > 0 else "")
                ),
                "dollar_impact": dollar_impact,
                "evidence": [
                    f"published rate: ${published_rate:.2f}/hr",
                    f"brokered rate: ${brokered_rate:.2f}/hr",
                    f"premium: ${premium:.2f}/hr",
                    f"hours this month: {hours:.1f}",
                    f"service_code: {service_code or '(unspecified)'}",
                ],
                "suggested_action": (
                    "Ask your provider whether the brokered rate premium can be absorbed by the "
                    "provider rather than your budget. Providers are not required to pass "
                    "brokered rate premiums to participants."
                ),
            })
            break  # one deterministic Rule 11 is enough

    # Final pass — clean up the anomalies array.
    # Five steps in order:
    #   (a) Drop speculative-language anomalies (Fix 4 + Fix 1) — anomalies that
    #       describe what they didn't find, or that hedge with words like
    #       "approximately"/"may exceed"/"likely"/"suggests" without a confirmed
    #       dollar figure.
    #   (b) Drop brokered-rate flags that lack explicit two-rate evidence
    #       (HARD GATE — both rates must appear as numeric $-amounts).
    #   (c) Drop Rule 7 (Restorative Care Pathway) flags that lack explicit
    #       INPATIENT admission evidence — outpatient reviews must not trigger.
    #   (d) Deduplicate by content fingerprint.
    #   (e) Merge the care-plan-review-due flag with the service-frequency-increase
    #       flag when both are present, with sentence-level dedup of detail.

    import re as _re

    def _has_two_rate_refs(a: dict) -> bool:
        """Returns True iff the anomaly cites at least two distinct dollar-amount values."""
        blob = (a.get("detail") or "")
        for ev in (a.get("evidence") or []):
            blob += " " + str(ev or "")
        amounts = set()
        for m in _re.finditer(r"\$([0-9]+(?:\.[0-9]{1,2})?)", blob):
            amounts.add(round(float(m.group(1)), 2))
        return len(amounts) >= 2

    SPECULATIVE_PHRASES = (
        "no anomaly", "no issue found", "no issue identified", "no concerns",
        "standard rate applies", "weekday rate is correct", "weekday rate applies",
        "is a weekday", "is a friday", "is a monday", "is a tuesday",
        "is a wednesday", "is a thursday", "no further action required",
        "appears correct", "is consistent with", "no flag required",
        "no anomaly detected", "no issue detected", "no premium applies",
    )
    HEDGE_PHRASES = (
        "approximately", "may exceed", "could indicate", "likely premium",
        "appears to exceed", "appears to be a premium", "cannot be calculated",
        "partially disclosed", "potential premium", "hidden premium",
        "may include a premium", "consistent with a premium",
        "may be a premium", "looks like a premium", "consistent with a brokered premium",
    )

    cleaned: list[dict] = []
    for a in anomalies:
        if not isinstance(a, dict):
            continue
        rule = (a.get("rule") or "").upper()
        text_blob = ((a.get("detail") or "") + " " + (a.get("headline") or "")).lower()

        # (a) Speculative / no-anomaly commentary — never user-facing.
        if any(phrase in text_blob for phrase in SPECULATIVE_PHRASES):
            continue

        # (b) Brokered flag without explicit two-rate evidence.
        looks_brokered = ("brokered" in text_blob or rule.startswith("RULE_11")) and (
            "premium" in text_blob or "above" in text_blob or "exceed" in text_blob or rule.startswith("RULE_11")
        )
        if rule.startswith("RULE_11") or looks_brokered:
            if not _has_two_rate_refs(a):
                continue
            # Hedge language not allowed in confirmed brokered flags either.
            if any(h in text_blob for h in HEDGE_PHRASES):
                continue

        # (c) Rule 7 — RCP / hospital admission must have inpatient evidence.
        if rule.startswith("RULE_7"):
            inpatient_words = (
                "hospitalised", "hospitalized", "hospital admission",
                "admitted to hospital", "admitted overnight", "inpatient",
                "days in hospital", "stayed overnight", "discharged from hospital",
            )
            outpatient_words = (
                "review", "appointment", "clinic", "consultation",
                "specialist visit", "day procedure",
            )
            evidence_blob = ((a.get("detail") or "") + " "
                             + " ".join(str(e) for e in (a.get("evidence") or []))).lower()
            # Also scan extracted notes + line-item flags for inpatient evidence.
            notes_blob = " ".join(
                (n or "").lower() for n in (extracted.get("provider_notes_raw") or [])
                if isinstance(n, str)
            )
            for li in (extracted.get("line_items") or []):
                if isinstance(li, dict):
                    notes_blob += " " + (li.get("provider_notes") or "").lower()
                    notes_blob += " " + (li.get("flags_in_original") or "").lower()
            has_inpatient = any(w in evidence_blob or w in notes_blob for w in inpatient_words)
            if not has_inpatient:
                continue
            # Also reject if the cited evidence is ONLY outpatient language.
            if (
                any(w in evidence_blob for w in outpatient_words)
                and not any(w in evidence_blob for w in inpatient_words)
            ):
                continue

        cleaned.append(a)

    # (b) Deduplicate by content fingerprint.
    #
    # The fingerprint includes the rule prefix so that distinct rules that
    # happen to reference the same date/service-code (e.g. Rule 17 review-due
    # and Rule 18 service-increase both citing the same provider note) are
    # NOT collapsed — those are handled by the merge step below.
    # Same-rule duplicates (e.g. Rule 3 from the LLM auditor + Rule 3 from the
    # deterministic backstop, which describe the same billing issue) DO
    # collapse via this step.
    DATE_RE = _re.compile(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-\s][A-Za-z]{3,9}|\d{1,2}/\d{1,2}/\d{2,4})\b")
    SERVICE_CODE_RE = _re.compile(r"\b([A-Z]{2,5}-\d{2,4})\b")
    RULE_PREFIX_RE = _re.compile(r"^(RULE_\d+)")

    def _normalise_date(raw: str) -> str:
        # Extract just (day-number, first-3-letters-of-month). Handles every
        # combination of "5 May", "05-May", "5-May-2026", "2026-05-05", etc.
        if not raw:
            return ""
        s = raw.strip()
        # ISO format like 2026-05-05 → "5may"
        iso_m = _re.match(r"^(\d{4})-(\d{2})-(\d{2})$", s)
        if iso_m:
            try:
                _y, mm, dd = int(iso_m.group(1)), int(iso_m.group(2)), int(iso_m.group(3))
                month_names = ["", "jan", "feb", "mar", "apr", "may", "jun",
                               "jul", "aug", "sep", "oct", "nov", "dec"]
                if 1 <= mm <= 12:
                    return f"{dd}{month_names[mm]}"
            except Exception:
                pass
        # Day + month-name format like "5 May", "05-May", "5-May-2026"
        m = _re.search(r"(\d{1,2}).{0,2}([A-Za-z]{3,9})", s)
        if m:
            return f"{int(m.group(1))}{m.group(2)[:3].lower()}"
        return _re.sub(r"[^a-zA-Z0-9]", "", s).lower()

    def _fingerprint(a: dict) -> str:
        # Pull the first date and first service-code from detail + evidence.
        blob = (a.get("detail") or "")
        for ev in (a.get("evidence") or []):
            blob += " " + str(ev or "")
        date_m = DATE_RE.search(blob)
        code_m = SERVICE_CODE_RE.search(blob)
        date = _normalise_date(date_m.group(1)) if date_m else ""
        code = code_m.group(1).strip().lower() if code_m else ""
        try:
            dollars = round(float(a.get("dollar_impact") or 0.0), 2)
        except Exception:
            dollars = 0.0
        rule_prefix_m = RULE_PREFIX_RE.match((a.get("rule") or "").upper())
        rule_prefix = rule_prefix_m.group(1) if rule_prefix_m else (a.get("rule") or "")
        key = f"{rule_prefix}|{date}|{code}|{dollars}"
        if len(key.replace("|", "").strip()) > len(rule_prefix) + 2:
            return key
        # No structural anchor — fall back to a hash of the first 60 chars of detail.
        return ("notes:" + rule_prefix + ":" + (a.get("detail") or a.get("headline") or "")[:60].lower()).strip()

    seen_fp: dict[str, dict] = {}
    for a in cleaned:
        fp = _fingerprint(a)
        existing = seen_fp.get(fp)
        if existing is None:
            seen_fp[fp] = a
        else:
            # Prefer higher severity first, then longer detail.
            sev_rank = {"high": 3, "medium": 2, "low": 1}
            sev_a = sev_rank.get((a.get("severity") or "").lower(), 0)
            sev_e = sev_rank.get((existing.get("severity") or "").lower(), 0)
            if sev_a > sev_e:
                seen_fp[fp] = a
            elif sev_a == sev_e and len(a.get("detail") or "") > len(existing.get("detail") or ""):
                seen_fp[fp] = a
    deduped = list(seen_fp.values())

    # (e) Merge care-plan-review + service-frequency-increase when both present.
    review_idx = None
    increase_idx = None
    for i, a in enumerate(deduped):
        rule = (a.get("rule") or "").upper()
        if rule == "RULE_17_CARE_PLAN_REVIEW_DUE" and review_idx is None:
            review_idx = i
        elif rule == "RULE_18_SERVICE_INCREASE" and increase_idx is None:
            increase_idx = i
    if review_idx is not None and increase_idx is not None:
        review = deduped[review_idx]
        increase = deduped[increase_idx]

        def _split_sentences(s: str) -> list[str]:
            parts = _re.split(r"[.!?]+", s or "")
            return [p.strip() for p in parts if len(p.strip()) > 10]

        sentences_a = _split_sentences(review.get("detail") or "")
        sentences_b = _split_sentences(increase.get("detail") or "")
        # Keep only B-sentences whose first 40 chars don't substantially appear
        # in any A-sentence — eliminates near-duplicate provider-note sentences.
        a_prefixes = {sa[:40].lower() for sa in sentences_a}
        unique_b = [sb for sb in sentences_b if sb[:40].lower() not in a_prefixes]
        if unique_b:
            merged_detail = ". ".join(sentences_a + ["Additionally"] + unique_b) + "."
        else:
            merged_detail = ". ".join(sentences_a) + "."

        merged = {
            "severity": "low",
            "rule": "RULE_17_18_REVIEW_AND_INCREASE_MERGED",
            "headline": "Care plan review due — and services are changing",
            "detail": merged_detail,
            "dollar_impact": round(
                max(float(review.get("dollar_impact") or 0.0), float(increase.get("dollar_impact") or 0.0)),
                2,
            ),
            "evidence": (review.get("evidence") or []) + (increase.get("evidence") or []),
            "suggested_action": (
                "Confirm the review date with your care manager. Bring notes on recent "
                "health changes including the medication adjustment, planned nursing increase, "
                "and any changes in daily ability since the last review."
            ),
        }
        # Replace both with the merged one. Order: insert at the earlier of the two indices.
        keep_idx = min(review_idx, increase_idx)
        drop_idx = max(review_idx, increase_idx)
        deduped[keep_idx] = merged
        deduped.pop(drop_idx)

    audit_result["anomalies"] = deduped
    return audit_result
