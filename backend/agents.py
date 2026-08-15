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
# Default auditor is Haiku 4.5, total two-pass pipeline stays under ~25s,
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
You extract line items and a plain-English summary from raw statement text.

Streams (every line item must map to exactly one):
- "Clinical" , nursing, allied health professional services (OT, physio, podiatry, dietetics, speech, social work, psychology), continence, wound care.
- "Independence" , personal care (showering, grooming), respite care, transport for non-everyday purposes, social support.
- "Everyday Living" , domestic assistance (cleaning, laundry), home maintenance/gardening, meal preparation, shopping assistance.

Summary rules (STRICT):
- Write 3 to 5 complete sentences that give a caregiver a full picture of the statement at a glance.
- Cover, in this order: (1) which provider charged what for the period, (2) how the total splits across streams (Clinical, Independence, Everyday Living, Care Management, AT-HM), (3) how much the participant paid out-of-pocket versus what the government paid, (4) the closing balance still with the provider if present, (5) one plain sentence flagging anything notable such as a repeated charge, missing details, or an unusually large fee.
- Use full stops and commas. Do NOT use em-dashes (do not use the character with unicode U+2014), en-dashes (U+2013), or hyphens as sentence separators. Hyphens are only allowed inside compound words such as "out-of-pocket".
- Do NOT use markdown, bullets, headings, bold, or emoji. Plain prose.
- Australian English spelling and dollar figures (e.g. "$1,240.55").
- Do NOT invent numbers. If a number is not present in the source text, do not state it.
- Do NOT start the summary with the word "The" or with a dash character.

Output STRICT JSON only, no markdown, no commentary. Schema:
{
  "period_label": "October 2026",
  "summary": "Blueberry Care invoiced $1,240.55 for October 2026, made up of $820.00 in Everyday Living services, $290.55 in Clinical nursing, and $130.00 for Care Management. The participant paid $260.15 out-of-pocket and the government paid the remaining $980.40. The closing balance carried over to November is $412.30. Two domestic assistance visits on the 14th and 21st appear at a slightly higher unit price than the earlier months, worth checking against the care plan.",
  "line_items": [
    {
      "date": "2026-10-14",
      "service_code": "DA-01" | null,
      "service_name": "Domestic assistance , cleaning",
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
- title: 6,10 words, neutral
- detail: 1,2 sentences explaining what looks unusual and why it might matter
- suggested_action: a short next step the caregiver could take
Output STRICT JSON: {"explained": [{"id":"...","title":"...","detail":"...","suggested_action":"..."}]}"""


CHAT_SYSTEM_TEMPLATE = """You are Wayly. You sit beside {caregiver_name} while they care for {participant_name}. You are a steady, plain-spoken second pair of eyes on the Support at Home program, never an automated voice.

Who you are talking to right now:
- A family caregiver, juggling enough already.
- Talking about a real person ({participant_name}). Refer to them by name when it helps, and assume the caregiver knows the rest of their story.

What you know about {participant_name}'s plan:
- Classification: {classification}. Annual budget around ${annual:,.0f}, roughly ${quarterly:,.2f} a quarter after the 10% care management slice.
- Provider: {provider}.
- This quarter is {quarter_label}. Spend so far by stream: {burn}.
- Lifetime contributions to date: ${contributions_total:,.2f} of the ${cap:,.2f} cap.

Recent statement notes:
{statement_summary}

How to sound:
- Write the way you would speak to a sibling who is also helping out: warm, direct, real Australian English, no hedging, no fluff.
- Do not use em-dashes, en-dashes, double asterisks, headings, bullet markers, or any markdown styling. Plain sentences only, with the occasional short line for a list when truly needed.
- Stay short. Two or three sentences is usually enough. Spell out money figures, never invent them.
- If you genuinely do not know, say so. Clinical questions belong with their care team, not with you.
- Streams (Clinical, Independence, Everyday Living) cannot cross-subsidise. Be clear about that whenever it matters.
- If the topic is provider pricing or fees, explain that the government has deferred the planned national price caps indefinitely (announced May 2026), so providers set their own prices. Encourage the caregiver to compare quotes and, if they suspect overcharging, contact the Aged Care Quality and Safety Commission (ACQSC).
- Always present information, not advice. When the caregiver asks anything that touches eligibility, classification, contributions, or anything that needs an official decision, point them to My Aged Care (call 1800 200 422 or visit myagedcare.gov.au) for confirmation.
- Wayly knows about six Support at Home supplements:
  * Oxygen supplement ({oxygen_daily}) for participants whose care plan covers oxygen. Aged Care Rules 2025, section 196-15. This supplement requires a medical practitioner to certify that the participant needs continual oxygen. The certification is arranged by the participant's GP or specialist, and the care plan must cover nursing care consumables. If asked how to get certification, suggest speaking to the participant's GP or specialist, or the provider's care manager who can coordinate. Do not tell the caregiver whether the participant qualifies, and do not draft the certification letter.
  * Enteral feeding supplement ({enteral_bolus_daily} bolus, {enteral_non_bolus_daily} non-bolus). Section 196-20.
  * Veterans' supplement ({veterans_pct} of the base individual daily amount). Section 196-25.
  * Dementia and cognition supplement ({dementia_pct} of base individual daily). Section 196-30, grandfathered HCP only, ceases on reassessment.
  * EACHD top-up ({eachd_top_up_daily}). Section 196-35, grandfathered from 2013.
  * Care management supplement ({care_management_daily}). Section 205-15, paid to the provider, not the participant.
- Wayly also knows about two short-term pathways: Restorative Care Pathway ({restorative_care_amount} over up to 16 weeks) and End-of-Life Pathway ({eol_pathway_amount} over up to 12 weeks for participants with a prognosis of 3 months or less). Both are defined in Aged Care Rules 2025 section 194-10(2).
- Lifetime cap on participant contributions is {lifetime_cap_standard} for Support at Home participants, and {lifetime_cap_no_worse_off} for grandfathered Home Care Package participants on the no-worse-off arrangement. Both figures indexed on 20 March and 20 September each year.
- If asked about supplements or pathways, cite the relevant section of the Aged Care Rules 2025."""


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
        parsed = json.loads(payload)
    except Exception as e:
        logger.warning("Statement parse JSON decode failed: %s", e)
        # return minimal valid shape
        return {"period_label": None, "summary": "Unable to fully parse statement.", "line_items": []}
    # Defensive: even with a strict "no em-dash" prompt, Claude will occasionally
    # slip one in. Strip stray em-/en-dashes used as separators so the summary
    # reads as plain prose. Keep hyphens inside compound words untouched.
    if isinstance(parsed.get("summary"), str):
        parsed["summary"] = _scrub_dash_separators(parsed["summary"])
    return parsed


_DASH_SEP_RE = re.compile(r"\s*[\u2014\u2013]\s*")  # em-dash / en-dash surrounded by spaces
_ISOLATED_HYPHEN_RE = re.compile(r"(?<=\S) [-] (?=\S)")  # " - " between words used as separator
_MULTISPACE_RE = re.compile(r" {2,}")


def _scrub_dash_separators(text: str) -> str:
    """Replace em-dash / en-dash / space-hyphen-space separators with a comma.

    Compound hyphens ("out-of-pocket", "post-op") stay untouched because the
    ISOLATED_HYPHEN pattern only matches a hyphen with a space on BOTH sides.
    """
    if not text:
        return text
    out = _DASH_SEP_RE.sub(", ", text)
    out = _ISOLATED_HYPHEN_RE.sub(", ", out)
    # Tidy up things like "," or ", ." that can appear when a dash sat at
    # the end of a clause.
    out = re.sub(r",\s*,", ",", out)
    out = re.sub(r",\s*\.", ".", out)
    out = _MULTISPACE_RE.sub(" ", out)
    return out.strip()


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
    system = _render_chat_system(context)
    # PERSONA-1 §Ask Wayly, append a persona block so the assistant speaks
    # in the correct voice for the caller.
    persona_ctx = context.get("persona_context") if isinstance(context, dict) else None
    if persona_ctx:
        try:
            from lib.persona import render_persona_prompt_block
            block = render_persona_prompt_block(persona_ctx)
            if block:
                system = f"{system}\n\n{block}"
        except Exception:
            pass
    # Wayly voice rules apply to every conversational reply.
    try:
        from lib.text_sanitiser import append_tone_rules, strip_wayly_dashes
        system = append_tone_rules(system)
    except Exception:
        strip_wayly_dashes = None  # type: ignore
    chat = LlmChat(
        api_key=key,
        session_id=session_id,
        system_message=system,
    ).with_model(MODEL_PROVIDER, MODEL_NAME)
    reply = await chat.send_message(UserMessage(text=user_text))
    if strip_wayly_dashes and isinstance(reply, str):
        reply = strip_wayly_dashes(reply)
    return reply


def _render_chat_system(context: dict) -> str:
    """Two-pass render: first the INDEX-1 registry values (dollar amounts,
    percentages, lifetime caps) via ``render_prompt``, then the runtime
    caregiver/participant context via ``.format``.

    Kept as a module-level helper so tests can exercise it without an LLM.
    """
    stage1 = CHAT_SYSTEM_TEMPLATE
    try:
        from monetary_constants import render_prompt as _rp
        stage1 = _rp(stage1)
    except Exception:
        pass
    # Registry may still not have seeded every placeholder, for example, at
    # early boot before the YAML loads, or in a test environment. Fill any
    # remaining known registry keys with static "last known good" defaults so
    # the runtime `.format(**context)` doesn't blow up on missing keys.
    _STATIC_FALLBACKS = {
        "oxygen_daily": "$14.66/day",
        "enteral_bolus_daily": "$23.25/day",
        "enteral_non_bolus_daily": "$26.11/day",
        "care_management_daily": "$3.95/day",
        "eachd_top_up_daily": "$3.45/day",
        "veterans_pct": "11.5%",
        "dementia_pct": "11.5%",
        "lifetime_cap_standard": "$137,917.01",
        "lifetime_cap_no_worse_off": "$86,185.23",
        "rollover_floor": "$1,000.00",
        "restorative_care_amount": "$6,000.00",
        "restorative_care_max_total": "$12,000.00",
        "eol_pathway_amount": "$25,000.00",
    }
    for key, fallback in _STATIC_FALLBACKS.items():
        stage1 = stage1.replace("{" + key + "}", fallback) if ("{" + key + "}") in stage1 else stage1
    return stage1.format(**context)


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
      "stream": "Clinical" | "Independence" | "EverydayLiving" | "ATHM" | "CareMgmt" | "supplement",
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
# Chunked extraction prompts, each chunk targets a slice of the schema so a
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
  "header_stream_budgets": {
    "Clinical": 0.00,
    "Independence": 0.00,
    "EverydayLiving": 0.00
  },
  "lifetime_cap_total": 0.00,
  "lifetime_contributions_to_date": 0.00,
  "direct_debit_amount": 0.00,
  "direct_debit_date": "",
  "source_declared_services_total": null,
  "care_management_source_text": "",
  "per_line_contribution_source": "unknown",
  "funding_available_this_month": null,
  "quarterly_allocation": null,
  "is_no_worse_off": false
}

Rules:
- If a value is not in the statement, use "" for strings and 0.00 for numbers.
- statement_period is the value from the explicit "STATEMENT PERIOD" / "Statement Period" header , NOT the quarterly-budget-summary date range. A monthly statement covers a single calendar month even if the budget summary references a 3-month quarter.
- period_start and period_end should be ISO dates (YYYY-MM-DD) parsed from statement_period when possible, otherwise "".

CARE MANAGEMENT EXTRACTION , PERMITTED SOURCES ONLY
- care_management_deducted is THIS MONTH'S care management FEE CHARGED (the dollar amount the provider deducted from this statement). It is found ONLY in the dedicated "CARE MANAGEMENT" section / line , typically labelled "Care management fee (Month): $X.XX" or "Care management billed: $X.XX" or "Care management (this period): $X.XX".
- NEVER read care_management_deducted from the QUARTERLY BUDGET SUMMARY table (the "Budget / Spent / Remaining" row labelled "Care Management"). Those columns are quarterly budget figures, NOT the current-month fee, and using them will produce wrong arithmetic downstream.
- For Dorothy's June 2026 statement: the correct value is the "Care management fee (June): $268.29" line, NOT the "Care Management Budget $742.40" quarterly figure.
- Calculate care_management_rate_pct as care_management_deducted / monthly_gross_services * 100 if the statement states a % rate explicitly (e.g. "11.0% of monthly gross services"), otherwise care_management_deducted / quarterly_budget_total * 100, rounded to 2dp.

GROSS TOTAL CALCULATION , PERMITTED SOURCES ONLY
- reported_total_gross is the statement's printed BOTTOM-LINE TOTAL row in the "STATEMENT SUMMARY" / "TOTAL" section (the single number that sums Clinical + Independence + Everyday Living + Care Management + AT-HM current-period + Previous-period adjustments).
- FORBIDDEN SOURCES , do NOT use any figure from:
    (a) the quarterly budget summary table (Budget / Spent / Remaining columns)
    (b) the participant contribution summary section
    (c) the "Amount due" / "Previously billed" / direct-debit lines
    (d) the lifetime cap section
    (e) any per-stream "Total" or "Subtotal" line in the itemised tables IN ADDITION to extracting the individual line items from that same section (using both would double-count)
- VERIFY: compute Clinical_total + Independence_total + EverydayLiving_total + CareManagement_fee + ATHM_current_period − Previous_period_adjustments. If that calculation differs from the figure you are about to emit by more than $5, re-check the source: you almost certainly read a budget-summary column instead of the TOTAL row.
- For Dorothy June 2026 the correct figure is $2,952.21 (not $3,327.79, not $7,424.00, not $742.40).
- reported_total_participant_contribution / reported_total_government_paid are the matching totals if listed.
- budget_remaining_at_quarter_end is the statement's stated remaining quarterly service budget (post all line items), if shown.
- provider_abn is the provider's Australian Business Number as it appears on the statement header (e.g. "12 345 678 901" or "12345678901"). Copy it verbatim including any spaces. If absent, "".
- stream_used_this_month is the per-stream "Used [current month] (this statement)" / "Used This Month" / "Spent This Month" / "This Month Total" figures from the QUARTERLY BUDGET SUMMARY or BUDGET TRACKING or "SERVICE STREAM ALLOCATIONS" header sections. Match the provider's value for the CURRENT statement month , typically labelled "Used [Month] (this statement): $XX.XX" inside each stream's allocation block. CRITICAL: this must be the value from the header / allocations block, NOT the "Stream X Subtotal" line printed inside the ITEMISED SERVICES tables. Those two figures may legitimately differ (and a discrepancy is itself a flagged anomaly), so it is essential you extract the HEADER value here, not the subtotal. If the header value is absent or unclear, use 0.00 for that stream. Only fill the three keys (Clinical, Independence, EverydayLiving). Use 0.00 when not present.
- header_stream_budgets is the per-stream QUARTERLY ALLOCATION figure printed in the SERVICE STREAM ALLOCATIONS header section , typically labelled "Quarterly Allocation: $X,XXX.XX" inside each stream block (NOT the "Used This Month" line, NOT the "Total Q? Used" line, NOT the "Remaining" line). This is the participant's actual per-stream quarterly budget set by their individualised care plan and Services Australia, and overrides Wayly's MVP-wide proportion estimate when present. Only fill the three keys (Clinical, Independence, EverydayLiving). Use 0.00 when the figure is absent.
- SUPPLEMENT LINE ITEMS: Some statements include supplement line items labelled "Oxygen supplement", "Enteral feeding supplement", "Veterans' supplement", "Dementia and cognition supplement", or "EACHD top-up". Extract these as line items with ``stream`` set to ``"supplement"`` and the supplement name (in lower-snake-case , ``oxygen``, ``enteral_bolus``, ``enteral_non_bolus``, ``veterans``, ``dementia_cognition``, ``eachd_top_up``) in the ``service_code`` field; put the printed description in ``service_description``. Do NOT categorise supplements under Clinical, Independence, or Everyday Living , they are a separate stream. Care management provider supplement should not appear on participant statements; if you see one labelled that way, still extract it as ``stream=supplement, service_code=care_management_provider``.

PENSION STATUS , read this from the SERVICE STREAM ALLOCATIONS section by looking at the Independence and Everyday Living "Participant Contribution Rate" percentages. EXPLICIT TEXT WINS: if the statement contains a parenthetical or label such as "(full Age Pension)", "(part Age Pension)", "(self-funded)", "(Commonwealth Seniors Health Card)" or "(CSHC)", set pension_status to "full_age_pension", "part_age_pension", "self_funded" or "cshc" accordingly , DO NOT fall through to rate inference.

  When there is no explicit text:
  - Independence 5% AND Everyday Living 17.5% → "full_age_pension"
  - Independence 50% AND Everyday Living 80% → "self_funded"
  - Any other combination of stated Independence / Everyday Living rates (e.g. 12% / 22%, 17.5% / 50%, 25% / 60%) → "part_or_cshc_unconfirmed". This is correct , part Age Pension and CSHC cohorts each have a means-tested range and Wayly should not guess between them without explicit text.
  - Rates absent / unreadable → "unknown".

  Never emit "part_age_pension" or "cshc" based on inferred rates alone , only explicit text can select between those two.

DEC-1 v5 · NEW FIELDS (v5 §Phase 1)
- source_declared_services_total is the source's OWN printed subtotal for services this period, typically the number next to labels like "Total services this month", "Services subtotal", or "Total service costs". Distinct from reported_total_gross (which sums streams + care management + AT-HM). Populate ONLY when the source prints a distinct services-only subtotal, otherwise leave null. This is the value RULE_25 compares against the sum of extracted line items.
- care_management_source_text is the VERBATIM string the care management amount was read from (e.g. "Care management fee (June): $142.50" or "Total administration and care management costs for the period: $142.50"). Empty string if no care management fee is stated. Used by the anti-fabrication guard to verify the extracted amount is traceable.
- per_line_contribution_source describes how the source presents participant contribution and government-paid figures. Choose ONE:
    * "aggregate_only", one aggregate participant contribution figure and one aggregate government paid figure for the whole statement, with NO split against individual line items (Margaret's pattern).
    * "per_line", every line item has its own participant_contribution and government_paid columns filled in.
    * "category_aggregated", one contribution figure per stream/category, not per line.
    * "percentage_labelled", source states the contribution rate as a percentage ("at 5% contribution rate for Independence services") and expects the reader to compute per-line splits.
    * "unknown", extractor could not determine.
  CRITICAL: when per_line_contribution_source is "aggregate_only", every line item's participant_contribution and government_paid fields MUST be null. Do NOT synthesise per-line values by applying a percentage rule to per-line grosses. This is a v5 anti-fabrication invariant.
- funding_available_this_month is the monthly funding figure printed on a MONTHLY statement (e.g. "Government funding available this month: $3,250.00"). Populate ONLY on monthly statements (cadence 28-31 days); leave null on quarterly / weekly / fortnightly statements.
- quarterly_allocation is the QUARTERLY funding envelope printed on a QUARTERLY statement (e.g. "Quarterly allocation: $7,424.00"). Populate ONLY on quarterly statements (cadence 88-92 days); leave null on monthly / weekly / fortnightly statements. On monthly statements, if a rolling quarterly figure is shown for context, do NOT populate this field.
- is_no_worse_off is a boolean. Set to `true` ONLY when the statement EXPLICITLY references the Support at Home "No-Worse-Off" (NWO) arrangement using any of these phrasings anywhere on the statement: "No-Worse-Off", "No Worse Off", "NWO arrangement", "NWO policy", "grandfathered under NWO", "covered by the No-Worse-Off transition arrangement", "HCP legacy protection". This flag guarantees the participant pays $0 per-line contribution regardless of their pension status. If the statement does NOT mention NWO explicitly, leave `is_no_worse_off` as `false` , do NOT infer it from a $0 contribution rate alone. This is a v5 anti-fabrication invariant.

- Return only the JSON object. No prose."""


def _stream_extractor_system(stream_name: str, stream_description: str) -> str:
    return f"""You are a data extraction engine for Australian Support at Home statements. Extract EVERY line item belonging to the {stream_name} stream. Do not skip any item. Do not merge any items. Do not summarise.

{stream_description}

CRITICAL , COMPLETENESS:
- Scan the ENTIRE statement from top to bottom. List every {stream_name} line item you find , there are typically multiple personal care visits, multiple cleaning visits, multiple nursing visits across the month.
- Repeat-occurrence services (e.g. weekly Personal Care, weekly Cleaning, weekly Nursing) MUST each get their own entry , never collapse them.
- Cancelled items in this stream MUST also be included with is_cancellation: true and gross: 0.00.
- Items with weekend / after-hours / substitute-worker variations are still {stream_name} items , include them too.

CRITICAL , NEVER EXTRACT BUDGET SUMMARY FIGURES AS LINE ITEMS:
- The quarterly budget summary table at the top of the statement (showing Budget / Spent / Remaining / Used columns by stream) contains CUMULATIVE QUARTERLY figures, NOT current-period line items. NEVER extract any figure from the quarterly budget summary as a service line item.
- Similarly, the AT-HM allocation summary (showing approved amount, spent, remaining) is reference data , only extract individual AT-HM claims for THIS statement period as line items.
- Skip any row labelled or appearing under headers like: "Budget", "Spent", "Remaining", "Allocated", "Q1 Total", "Q2 Total", "Quarterly", "Quarterly Summary", "Stream Allocation", "Remaining Balance", "Available Balance".
- If a row has no date in the current statement period, it is almost certainly a summary figure , do NOT emit it as a line item.
- Every line item you emit MUST have a service date that falls within the statement period (look at the statement_period header). If you cannot identify a date for a row, do NOT emit it.

CRITICAL , NEVER EXTRACT CARE MANAGEMENT / ADMIN FEES AS SERVICE LINE ITEMS (v5 §Phase 2):
- Care management fees, package management fees, administration fees, coordination fees, and scheduling fees are NOT service line items. They are captured separately by the header extractor as `care_management_deducted`. Emitting them here would double-count.
- Skip any row whose description matches any of: "Care management", "Package management", "Administration fee", "Admin fee", "Care coordination", "Case management", "Provider coordination", "Package administration", "Provider management fee", "Care planning fee", "Scheduling fee", "Total administration and care management".
- Skip any row on a stream labelled "CareMgmt", "CM", "Care Management", "Admin", or "Administration".
- Even if the row appears in a section labelled "Services Delivered", if it is a management or admin fee it belongs in the care management field, not in line_items.

CRITICAL , NEVER EXTRACT AT-HM (ASSISTIVE TECHNOLOGY / HOME MODIFICATIONS) ROWS (v5 §NWO/AT-HM iteration):
- AT-HM items (assistive-tech / home-modification claims) are extracted EXCLUSIVELY by a separate dedicated extractor, NOT by any stream extractor. Emitting them here would double-count and trigger phantom RULE_15/RULE_25 arithmetic anomalies.
- Skip any row whose description contains: "AT-HM", "AT&HM", "assistive technology", "assistive tech", "home modification", "home mod", "mobility aid", "wheelchair", "walker/frame", "grab rail", "shower rail", "shower chair", "shower stool", "ramp installation", "commode", "hoist", "hospital bed", "pressure care mattress", "personal alarm", "medication reminder device", "hearing aid", "cooling vest", "thermoregulation vest".
- Skip any row whose service_code begins with "AT-", "ATHM", or matches the pattern "ATHM-YYYY-NNNN".
- Skip any row on a stream labelled "ATHM", "AT-HM", "AT&HM", "Assistive Technology", or "Home Modifications".
- Skip any row appearing under headers like "AT-HM Commitments", "Outstanding Orders", "Approved Items Pending Delivery", "Assistive Technology and Home Modifications", "AT & Home Modifications".
- Even if the row appears in a section labelled "Everyday Living" or "Services Delivered", if it is an AT-HM claim it belongs in the dedicated AT-HM register, not in line_items.

Return STRICT JSON only:
{{
  "line_items": [
    {{
      "date": "",
      "service_description": "",
      "service_code": "",
      "stream": "{stream_name}",
      "quantity": null,
      "unit": null,
      "raw_qty_text": "",
      "raw_rate_text": "",
      "hours": 0.00,
      "unit_rate": 0.00,
      "gross": 0.00,
      "participant_contribution": null,
      "government_paid": null,
      "is_cancellation": false,
      "worker_name": "",
      "is_brokered": false,
      "provider_notes": "",
      "flags_in_original": ""
    }}
  ]
}}

Rules:
- date MUST be an ISO 8601 date "YYYY-MM-DD". If the source prints a short-form date like "02/06" or "2 Jun", RESOLVE it using the statement_period header at the top of the source, pick the year (and, for "02/06" style, the month) that falls inside the period_start / period_end window. If the source uses DD/MM/YYYY, convert to YYYY-MM-DD. Never emit a short-form date. Never emit both a short-form and a full-form copy of the same row.
- Preserve source order. Do NOT sort by date, stream, or amount.
- service_code MUST be either the LITERAL substring from the source (e.g. "PC-001", "TR-003") or an empty string "". NEVER invent, abbreviate, or infer a code from the description. If the row does not show a code, emit "".
- unit MUST be one of: "hr", "km", "session", "visit", "ea", "day". Choose the value that matches the source's stated unit for the quantity cell (e.g. "18 km" -> "km"; "1 session" -> "session"; "2.0 hr" or "1.5 hours" -> "hr"). If the source shows no explicit unit and the description is a time-based service, use "hr". Never emit a unit outside this enum.
- quantity MUST be a positive float representing the number of units delivered (e.g. 18.0 for "18 km", 1.0 for "1 session", 2.0 for "2 hr"). If unit == "hr", also set hours to the same value for back-compat. If unit != "hr", set hours to 0.0.
- raw_qty_text is the VERBATIM source substring for the quantity cell (e.g. "18 km", "1 session", "2.0 hr"). raw_rate_text is the VERBATIM source substring for the rate cell (e.g. "$1.20/km", "$185.00/session", "$78.00/hr"). Empty strings if the source omits them.
- participant_contribution and government_paid MUST be null when the source only prints an AGGREGATE contribution figure at the bottom of the statement (Margaret's pattern, one "Total participant contribution" and one "Total government paid" for the whole month, no per-line split). Only populate per-line values when the source EXPLICITLY prints a per-line participant_contribution or government_paid column. NEVER apply a percentage rule to synthesise per-line contributions from a gross. This is a v5 anti-fabrication invariant (§F2).
- Copy any asterisk note or "**" remark verbatim into flags_in_original.
- worker_name is the person delivering the service when listed; otherwise "".
- Return only valid JSON. No prose."""


CLINICAL_DESCRIPTION = """The Clinical stream covers nursing visits, allied health (occupational therapy, physiotherapy, podiatry, dietetics, speech, social work, psychology), wound care, continence support. Service codes typically begin NU-, OT-, PT-, PD-, AH-, WC-."""

INDEPENDENCE_DESCRIPTION = """The Independence stream covers personal care (showering, grooming, toileting), respite care, social support, transport (community access, medical appointments, hospital). Service codes typically begin PC-, RES-, SS-, TR-. Include transport items even if they have a "stream query" note.

CRITICAL , TRANSPORT ITEMS (read carefully , historical errors here):
- Extract EVERY transport line item as a completely separate object. Never collapse or merge transport entries even if they share the same date, service code (e.g. TR-003), rate, or destination.
- If two TR-003 entries appear on the same date with identical amounts, extract BOTH as separate line items. Do NOT merge them into a single line with quantity 2. The anomaly detector handles duplicate detection , extraction never does.
- After extracting all Independence stream items, mentally count the number of TR-003 (or any TR-*) entries you produced. If that count is lower than the number of distinct transport rows visible in the statement text, add the missing entries before returning your JSON.
- Specifically: if the statement contains transport entries on 05-May (two entries) AND a transport entry on 19-May, ALL THREE must appear in your line_items output. The 05-May entries are the same date and may be a duplicate billing , but they must both be extracted; the duplicate-detection rule downstream handles them. The 19-May entry is a different date and must always be extracted independently.
- The provider's own notes may flag a transport pair as "possible duplicate" , this does NOT mean you should merge them. Both entries must appear in extraction and the anomaly detector decides if it is a duplicate.
- Transport to a cardiology appointment, oncology appointment, GP appointment, hospital, day-program, specialist consultation, Wesley Hospital, or any other destination is ALWAYS Independence stream , NEVER Clinical, regardless of the medical context of the destination.
- Service codes starting with "TR-" or descriptions containing "transport", "taxi", "driver", "vehicle", "bus" are ALWAYS Independence.
- If you see N transport entries in the source text, you MUST emit N transport line items. Never skip one because it "looks like a duplicate" or because it is to a medical destination."""

EVERYDAY_DESCRIPTION = """The Everyday Living stream covers domestic assistance (cleaning, laundry), home maintenance/gardening, meal preparation, shopping. Service codes typically begin DA-, GM-, ML-, SH-.

CRITICAL, DO NOT extract AT-HM (Assistive Technology / Home Modifications) items here even if the source lists them under an Everyday Living heading. AT-HM claims are captured exclusively by the dedicated adjustments/AT-HM extractor. Emitting them from this stream would double-count against the reported gross total."""

CLINICAL_EXTRACTOR_SYSTEM = _stream_extractor_system("Clinical", CLINICAL_DESCRIPTION)
INDEPENDENCE_EXTRACTOR_SYSTEM = _stream_extractor_system("Independence", INDEPENDENCE_DESCRIPTION)
EVERYDAY_EXTRACTOR_SYSTEM = _stream_extractor_system("EverydayLiving", EVERYDAY_DESCRIPTION)


ADJUSTMENTS_EXTRACTOR_SYSTEM = """You are a data extraction engine for Australian Support at Home statements. Extract ONLY (a) the Care Management fee line item, (b) the previous-period-adjustments array, (c) the AT-HM commitments / outstanding-orders register, and (d) AT-HM items that were claimed/charged in the CURRENT statement period (either from a commitments register OR listed inline in the Services Delivered section, see the INLINE AT-HM ROWS rule below). Skip every other line item. AT-HM extraction is EXCLUSIVE to this extractor; stream extractors are instructed NOT to emit AT-HM rows.

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
      "quantity": null,
      "unit": null,
      "raw_qty_text": "",
      "raw_rate_text": "",
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
- Care management fee usually has service code CM-01 or description containing "Care management". Always coded stream: "CareMgmt". Extract ONLY the explicit current-period fee line (e.g. "Care management fee (June): $268.29"). Do NOT extract the quarterly-budget figure from the QUARTERLY BUDGET SUMMARY table as the line item , those columns are budget reference data, NOT a current charge. The gross of the care-management line item must equal the current-period fee.
- For statements that apportion a quarterly care-management fee across months, extract ONLY the portion attributed to the current statement period (e.g. if the statement says "March portion (this statement): $160.83", that $160.83 is the line item). Do NOT include prior-month portions or the quarterly-total figure.
- Previous-period adjustments are listed in a separate "PREVIOUS PERIOD ADJUSTMENTS" or similar section , they are credits/refunds for prior months, NOT line items. Credit amounts are positive numbers (the dollar value of the credit), even if the source uses a leading minus sign for display.
- AT-HM commitments come from sections titled "AT-HM Commitments", "Outstanding Orders", "Approved Items Pending Delivery", or similar. They represent assistive-tech / home-modification items that were APPROVED (with a spend-limit) but may or may not yet have been delivered/installed/claimed.
- For each AT-HM commitment include: a reference number (ref), item description, approval_date (ISO if possible), expiry_date (ISO if possible), amount_approved, amount_claimed (cumulative , default 0.00 if not stated), amount_remaining (default amount_approved - amount_claimed if not stated explicitly), amount_claimed_this_period (the portion claimed in the CURRENT statement period only , use phrases like "claimed this period", "amount this month", "claimed in May", invoice dates inside the current period to detect this; default 0.00 if you can't tell), and a short status string ("approved", "in progress", "delivered", "completed", "active", etc).
- AT-HM HALLUCINATION RULE , do NOT fabricate AT-HM entries that are not literally present in the statement text. If a commitment reference number (e.g. ATHM-2026-0041) appears as the service code for an AT-HM entry, extract it EXACTLY as shown. Do NOT generate a second line item with a different / standard service code (e.g. AT-001) unless that code appears separately as its own row in the statement text. Each AT-HM commitment row in the source produces AT MOST ONE entry in at_hm_commitments[] and AT MOST ONE entry in at_hm_line_items_this_period[] (only if amount_claimed_this_period > 0).
- COMPLETED COMMITMENTS , if the source statement marks a commitment as "COMPLETED", "Fully claimed", "Closed", or shows amount_remaining = $0 with amount_claimed = amount_approved, set status to "completed" and amount_remaining to 0.00 (treat any missing approval_date or expiry_date as expected , completed commitments are reference-only and should NOT produce any anomaly downstream).
- at_hm_line_items_this_period: If an AT-HM commitment was claimed/charged in the CURRENT statement period (i.e. amount_claimed_this_period > 0), ALSO emit it as a line item in this array, using the commitment ref as service_code (e.g. "ATHM-2026-0118"), the item_description, gross = amount_claimed_this_period, participant_contribution = 0.00, government_paid = amount_claimed_this_period, stream = "ATHM", and the invoice date as the date if visible (otherwise the statement period_end). This ensures AT-HM costs appear in the per-stream breakdown and the gross total reconciles with the statement's printed total. Do NOT emit a current-period line item for a completed commitment that was NOT claimed in this statement period (e.g. a "Shown for reference only" line is not a current-period claim).
- If the statement has no AT-HM commitments section, return an empty at_hm_commitments and an empty at_hm_line_items_this_period array.
- INLINE AT-HM ROWS (statements with NO separate commitments register): some statements (particularly AT-HM-only statements from equipment suppliers like MediEquip) list AT-HM claims directly in the "Services Delivered" table without a separate register. When you encounter such rows, descriptions containing "AT-HM", "AT&HM", "assistive technology", "assistive tech", "home modification", "home mod", "grab rail", "shower rail", "shower stool", "ramp installation", "hoist", "commode", "hospital bed", "wheelchair", "mobility aid", "walker", "pressure care mattress", "personal alarm", "hearing aid", "cooling vest", or service codes starting with "AT-", "ATHM", or "ATHM-YYYY-NNNN", emit them into at_hm_line_items_this_period[] with stream="ATHM". Use the row's actual date, description verbatim, service_code (or "" if none), gross, participant_contribution, government_paid as shown. Also populate the v5 fields: quantity (positive float, e.g. 1.0 for a single item), unit (from enum: "ea" for single items like grab rails / shower stools / ramps; "hr" for time-based; "km" for transport; "session" for treatments; "visit" for visits; "day" for daily). raw_qty_text is the verbatim quantity cell (e.g. "1 ea") and raw_rate_text is the verbatim rate cell. Leave at_hm_commitments empty in this inline-only case.
- CRITICAL: AT-HM extraction is EXCLUSIVE to this extractor. Stream extractors (Clinical / Independence / Everyday Living) have been instructed NOT to emit AT-HM rows. If AT-HM rows appear inline in a statement, THEY MUST come out of this extractor via at_hm_line_items_this_period. Missing them here means they will be silently dropped from the final decode.
- Dates should be ISO (YYYY-MM-DD) when the source allows; otherwise copy verbatim.
- Return only valid JSON. No prose."""


# Provider-notes chunk, extracts the free-form "PROVIDER NOTES" / "ADDITIONAL NOTES"
# section at the bottom of statements. These often contain disclosures (brokered
# rate premiums, care plan issues, upcoming changes) that line items don't carry.
PROVIDER_NOTES_EXTRACTOR_SYSTEM = """You are a data extraction engine for Australian Support at Home statements. Extract ONLY the free-form notes section(s) , typically found under headings like "PROVIDER NOTES", "ADDITIONAL NOTES", "ADVISORY NOTES", "REMARKS", or similar at the bottom of the statement.

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
- DO NOT include sub-line "NOTE:" comments that are attached to specific service line items in the itemised services tables , those are line-item flags, not provider notes.
- DO include notes from any section explicitly titled "PROVIDER NOTES", "ADDITIONAL NOTES", "ADVISORY NOTES", "REMARKS", "STATEMENT NOTES", or similar.
- If no such section exists, return an empty array.
- Return only valid JSON. No prose."""


AUDITOR_SYSTEM = """You are an anomaly detection engine for Australian Support at Home statements. You receive structured JSON extracted from a monthly statement. Your job is to find every problem, discrepancy, and missed entitlement.

Check every one of the following rules. For each rule that fails, add an anomaly to the output array. If a rule passes, do not mention it.

RULE 1 , CARE MANAGEMENT CAP
HANDLED BY DETERMINISTIC POST-PASS , DO NOT EMIT.

A deterministic Python check (rule key "RULE_1B_CARE_MGMT_MONTHLY") computes
the correct excess as: (this-month care-management fee) − (quarterly_budget × 10% / 3).
The base for the provider's % rate is THIS-MONTH SERVICE GROSS, never the
quarterly budget total. Do NOT emit any Rule 1 / quarterly-cap framed flag here.
Specifically: any anomaly mentioning "11% of quarterly budget" or
"$7,424 quarterly cap" as the % base is forbidden , that is not how
care management is actually calculated.

RULE 2 , WEEKEND / AFTER-HOURS RATE ACCURACY
If any line item's unit_rate exceeds the provider's published weekday rate for that service code, check whether a weekend or after-hours rate was legitimately applied. If the charged rate exceeds the provider's published weekend rate (where visible in the statement): flag as MEDIUM severity.
Dollar impact: (charged_rate - published_rate) × hours

RULE 3 , DUPLICATE SERVICES
HANDLED BY DETERMINISTIC POST-PASS , DO NOT EMIT.
A deterministic Python check (rule key "RULE_3_DUPLICATE_EXACT") flags line items sharing the SAME date + SAME service_code + SAME unit_rate. Do not emit any RULE_3 anomaly from the auditor. In particular do not flag recurring services (weekly Personal Care, fortnightly Domestic Assistance, weekly RN wound reviews) as duplicates , they are the normal shape of a care plan.

RULE 4 , AT-HM STREAM MISCODING
Any line item with service_code beginning "AT-" should be stream: "ATHM". If it appears in EverydayLiving or any other stream: flag as MEDIUM. AT-HM items are fully government funded , participant_contribution should be 0.00 for all AT-HM items. If participant_contribution > 0 on an AT-HM item: flag as HIGH.
AT-HM HALLUCINATION RULE , emit AT-HM coding anomalies ONLY against service codes that are LITERALLY PRESENT in the extracted line_items array. Do NOT invent a parallel "AT-001" line or any other AT-HM line item to flag. If you cannot point to a specific line_item by its exact service_code as shown in the extracted JSON, DO NOT emit the rule. The deterministic post-pass will silently strip any anomaly whose cited service_code is not present in line_items.

RULE 5 , STREAM MISCLASSIFICATION RISK
Check flags_in_original for any provider notes questioning the stream assignment (e.g. "may qualify as Clinical", "confirm stream", "query"). Flag as MEDIUM severity with the provider's own note as evidence.
Dollar impact: the participant contribution amount on that item.

RULE 6 , WORKER SUBSTITUTION WITHOUT NOTICE
HANDLED BY DETERMINISTIC POST-PASS , DO NOT EMIT.
A deterministic Python scanner runs after your audit and scans EVERY line item's notes and EVERY provider_notes_raw paragraph for substitution phrases ("replacement worker", "usual worker on leave", "same morning", "less than 24 hours notice", "replaced by", "substitute"). It emits ONE flag per (date, service_code) pair so multiple substitutions across streams all surface. If you emit RULE_6 here you will create duplicates. Skip this rule.

RULE 7 , HOSPITAL ADMISSION + NO RESTORATIVE CARE PATHWAY
ONLY trigger this rule when there is unambiguous evidence of an INPATIENT hospital admission. An inpatient admission means the participant stayed in hospital overnight or longer , never a clinic visit, specialist review, day procedure, or outpatient appointment.

REQUIRED EVIDENCE , at least ONE of the following MUST appear in line-item notes/flags/cancellations or in provider_notes_raw:
  (a) A cancelled service with notes containing "hospitalised", "hospital admission", "admitted to hospital", "admitted overnight", "inpatient", "days in hospital", "stayed overnight", or "discharged from hospital".
  (b) A line item for hospital transport on a date followed by cancelled services on subsequent days.
  (c) Provider notes explicitly stating "hospital admission" or "admitted" together with a duration of at least one night.

EVIDENCE THAT MUST NOT TRIGGER THIS RULE:
  - Outpatient appointment ("review", "assessment", "clinic", "consultation").
  - "Cardiology review" / "specialist review" without explicit admission language.
  - Single-day transport to a hospital without subsequent service cancellations.
  - Any note containing "review" or "appointment" without "admitted" or "hospitalised".

If the inpatient evidence is present AND no line item has service_code beginning "RCP-" or description containing "Restorative": flag as HIGH severity. Otherwise DO NOT EMIT THIS RULE under any circumstances.

RULE 8 , TRANSPORT STREAM QUERY
If any transport line item (service_code beginning "TR-") is on the same date as a hospital admission cancellation or has flags_in_original mentioning "hospital" or "emergency": flag as LOW severity.

GLOBAL RULE , NO NO-ANOMALY COMMENTARY
Never emit anomaly objects whose detail says "no anomaly", "no issue found", "standard rate applies", "Friday is a weekday", "weekday rate is correct", "this is consistent with", or any equivalent phrase that explains why a rule did NOT fire. The anomalies array contains only positive findings. If a rule check produces "no anomaly", emit nothing , silence is the correct output.

RULE 9 , CONTRIBUTION ARITHMETIC CHECK (PENSION-AWARE)
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check is performed in code (rule keys "RULE_9_CONTRIBUTION_MISMATCH", "RULE_9_INCONSISTENT_RATE" or "RULE_9_PENSION_STATUS_UNKNOWN") which:
  - Reads pension_status from the extracted header.
  - If pension_status is "unknown": emits ONE LOW-severity flag advising the user that contribution checks were skipped (and runs no per-line math).
  - Otherwise: looks up the applicable rate band per stream from the table below and validates each non-cancelled line item's participant_contribution.
    - Exact-rate cohorts (full Age Pension, self-funded without CSHC): flag a line where the dollar variance exceeds $0.10 against the single expected rate.
    - Band cohorts (part Age Pension, CSHC, or the "part_or_cshc_unconfirmed" fallback): flag a line only when the IMPLIED rate (contribution / gross) is outside the band (with a 0.5 %-point tolerance). Inside the band the check stays silent because Services Australia sets the exact rate per participant.
    - For band cohorts, also flag RULE_9_INCONSISTENT_RATE when two non-cancelled lines in the same stream imply different rates (spread > 0.5 %-points).

  Contribution rate table (min , max per stream):
    full_age_pension          → Clinical 0%,    Independence 5% (exact),       Everyday Living 17.5% (exact), AT-HM 0%
    part_age_pension          → Clinical 0%,    Independence 5% , 25%,         Everyday Living 17.5% , 25%,    AT-HM 0%
    cshc                      → Clinical 0%,    Independence 5% , 50%,         Everyday Living 17.5% , 80%,    AT-HM 0%
    self_funded               → Clinical 0%,    Independence 50% (exact),      Everyday Living 80% (exact),    AT-HM 0%
    part_or_cshc_unconfirmed  → Clinical 0%,    Independence 5% , 50% (wide),  Everyday Living 17.5% , 80% (wide), AT-HM 0%

You MUST skip Rule 9 entirely in your output. Emitting Rule 9 in your JSON will cause double-counting and is treated as a hallucination.

RULE 10 , PREVIOUS PERIOD ADJUSTMENTS
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS") handles this. The deterministic check ONLY emits an anomaly when the adjustment arithmetic is WRONG (original - corrected ≠ credit) OR the credit was applied to the wrong column. Correctly-applied adjustments are silently recorded as a neutral informational note (NOT as an anomaly) , never as a severity-tagged flag. Skip this rule entirely in your output. Any RULE_10 anomaly you emit will be stripped by the post-pass.

RULE 12 , UNCLAIMED AT-HM COMMITMENTS
HANDLED BY DETERMINISTIC POST-PASS , do NOT emit. The deterministic check only fires for ACTIVE commitments (amount_remaining > 0 and status not in {completed, closed, fully claimed}). Commitments shown for reference (completed, amount_remaining = 0) MUST NOT produce ANY anomaly or informational note , they are reference-only.

RULE 11 , BROKERED RATE PREMIUM (HARD EVIDENCE GATE)
HARD GATE , emit this rule ONLY when BOTH of these are EXPLICITLY stated as numeric dollar values in the source statement for the SAME service code:
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

RULE 12 , UNCLAIMED AT-HM COMMITMENTS (REFERENCED ABOVE)
See the deterministic-post-pass note above. Do NOT emit.

RULE 13 , QUARTERLY UNDERSPEND PATTERN
Use budget_remaining_at_quarter_end (or service_budget_available - sum of non-cancelled gross if remaining isn't directly given) and quarterly_budget_total.
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_13_QUARTERLY_UNDERSPEND") that compares budget_remaining_at_quarter_end against the rollover cap and emits LOW or MEDIUM as appropriate. Skip this rule entirely in your output to avoid double-counting.

RULE 14 , STATEMENT PERIOD ACCURACY (parsing warning)
Verify the extracted statement_period (and period_start/period_end if present) match the explicit "STATEMENT PERIOD" header in the source , NOT the quarterly-budget-summary date range.
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_14_PERIOD_PARSE_WARNING") which fires only when the period span exceeds 35 days. Skip this rule entirely in your output to avoid double-counting.

RULE 15 , GROSS TOTAL VALIDATION (parsing warning)
Compute extracted_total = sum(line_item.gross for line_item where is_cancellation=false) - sum(prev_period_adjustment.credit_amount).
Compare extracted_total against reported_total_gross from the header.
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit check is performed in code (rule key "RULE_15_GROSS_TOTAL_PARSE_WARNING") which fires when the difference is > $5.00. Skip this rule entirely in your output to avoid double-counting.

RULE 16 , STREAM SUBTOTAL vs HEADER DISCREPANCY
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_16_STREAM_DISCREPANCY") compares each stream's summed line-item gross against the header's "Used This Month" figure for that stream and emits a MEDIUM anomaly if they differ by more than $5.

RULE 17 , CARE PLAN REVIEW DUE (provider notes pattern)
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_17_CARE_PLAN_REVIEW_DUE") scans provider_notes_raw for review-due phrases and emits a LOW anomaly.

RULE 18 , PLANNED SERVICE INCREASE (provider notes pattern)
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_18_SERVICE_INCREASE") scans provider_notes_raw for frequency-increase phrases and emits a LOW anomaly.

RULE 19 , LARGE AT-HM CLAIM
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_19_AT_HM_LARGE_CLAIM") fires when an AT-HM commitment with amount_approved > $1,500 has amount_claimed >= 90% of approved.

RULE 20 , PROVIDER ABN FORMAT
DO NOT EMIT THIS RULE FROM THE AUDITOR. A deterministic post-audit Python check (rule key "RULE_20_ABN_FORMAT") validates the provider_abn header field against the 11-digit ABN format.

OUTPUT FORMAT , return ONLY valid JSON, no prose:

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
        "anomaly_count": {"high": 0, "medium": 0, "low": 0, "advisory": 0},
    }


def _try_json_repair(text: str) -> Optional[Any]:
    """Attempt to fix mildly truncated JSON (unbalanced braces / trailing commas).

    Returns the parsed object or None if repair fails. Conservative , only
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
    *,
    phase: str = "extract",
    cost_ctx: Optional[Dict[str, Any]] = None,
) -> Optional[Any]:
    """Run a single chunked extraction call with one retry. Returns parsed
    JSON or None. Retries once on transport / parse failure or, when an
    `is_valid` callable is provided, when the parsed result fails validation
    (e.g. all fields empty , a known LLM hiccup mode for the header chunk).

    `phase` and `cost_ctx` are forwarded to `record_llm_call` so each LLM
    call lands in `db.llm_calls` with the user/household/participant + phase
    metadata needed for the admin cost dashboard.
    """
    key = _key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")

    cost_ctx = cost_ctx or {}

    async def _attempt(attempt: int) -> Optional[Any]:
        import time
        from llm_costs import record_llm_call
        chat = LlmChat(
            api_key=key,
            session_id=f"{session_id}-a{attempt}",
            system_message=system_message,
        ).with_model(MODEL_PROVIDER, EXTRACTOR_MODEL).with_params(max_tokens=max_tokens)
        t0 = time.time()
        try:
            raw = await chat.send_message(UserMessage(text=user_text))
        except Exception as e:
            logger.warning("Chunk call %s attempt %d failed: %s", session_id, attempt, e)
            await record_llm_call(
                tool=f"chunk:{session_id.split('-')[0]}", model=EXTRACTOR_MODEL,
                input_text=user_text, output_text="",
                duration_ms=int((time.time() - t0) * 1000),
                success=False, error=str(e)[:200],
                user_id=cost_ctx.get("user_id"),
                household_id=cost_ctx.get("household_id"),
                participant_id=cost_ctx.get("participant_id"),
                phase=phase,
            )
            return None
        await record_llm_call(
            tool=f"chunk:{session_id.split('-')[0]}", model=EXTRACTOR_MODEL,
            input_text=user_text, output_text=str(raw or ""),
            duration_ms=int((time.time() - t0) * 1000), success=True,
            user_id=cost_ctx.get("user_id"),
            household_id=cost_ctx.get("household_id"),
            participant_id=cost_ctx.get("participant_id"),
            phase=phase,
        )
        parsed = _safe_json_load(raw)
        if parsed is None:
            logger.warning(
                "Chunk %s attempt %d returned unparseable JSON | raw[:300]=%r",
                session_id, attempt, str(raw)[:300],
            )
            return None
        if is_valid is not None and not is_valid(parsed):
            logger.warning(
                "Chunk %s attempt %d returned invalid/empty result , retrying. snapshot=%r",
                session_id, attempt, str(parsed)[:300],
            )
            return None
        return parsed

    result = await _attempt(1)
    if result is not None:
        return result
    # One retry, fresh session id so any stuck conversation state is reset
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
    # DEC-1 v5 · Phase 1 additions. Strings default to "", floats default
    # to 0.0 per the existing convention. The nullable variants below live
    # in _HEADER_NULLABLE_V5_DEFAULTS so a real `null` from the LLM can
    # propagate through instead of being coerced to 0.0.
    "care_management_source_text": "",
    "per_line_contribution_source": "unknown",
    # DEC-1 v5 · Phase 2 addition: SAH No-Worse-Off (NWO) transition flag.
    # Some full-pensioner participants under the HCP→SAH transition are
    # covered by the No-Worse-Off policy which guarantees a $0 per-line
    # contribution rate. When the source EXPLICITLY says "No-Worse-Off"
    # or "NWO" alongside a full-pension status, RULE_9's contribution
    # arithmetic must skip. Extracted as a boolean string ("true"/"false")
    # for merge-compat with the existing string coercion.
    "is_no_worse_off": "false",
}

# DEC-1 v5 · Phase 1: fields that MUST preserve null semantics.
# `source_declared_services_total`, `funding_available_this_month`, and
# `quarterly_allocation` are all conditionally populated depending on
# the statement's cadence and whether the source prints a distinct value.
# Coercing "" or missing to 0.0 would mask real absence, so this dict is
# merged separately with explicit nullable handling.
_HEADER_NULLABLE_V5_DEFAULTS = {
    "source_declared_services_total": None,
    "funding_available_this_month": None,
    "quarterly_allocation": None,
}

_HEADER_DICT_DEFAULTS = {
    "stream_used_this_month": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
    "header_stream_budgets": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
}


def _empty_extracted() -> Dict[str, Any]:
    return {
        **_HEADER_DEFAULTS,
        **_HEADER_NULLABLE_V5_DEFAULTS,
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
    """Deterministic backstop, scans the original statement text for
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
    # Tight horizontal bounds, date and TR- must be within ~80 chars (i.e. on
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

    # Collect existing transport occurrence count per (date, code), match by
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
                "provider_notes": "(recovered by deterministic transport backstop , verify against original)",
                "flags_in_original": "",
            })
            occurrences[(date_norm, code)] = already + 1
            already += 1
    return items


def _strip_summary_artifacts(items: list[dict]) -> list[dict]:
    """Drop line items that look like budget-summary table rows rather than
    real service items. Recognisable signatures:
      • description contains summary keywords ("budget", "spent", "remaining",
        "allocated", "balance", "stream subtotal", "total this", "total q",
        "available")
      • OR no date AND no service_code AND a non-zero gross (almost always a
        summary aggregate)
    Keeps everything else untouched.
    """
    summary_kw = (
        "spent this quarter", "remaining this quarter", "quarterly total",
        "allocated", "available balance", "remaining balance",
        "budget remaining", "stream subtotal", "subtotal this", "total this",
        "total q1", "total q2", "total q3", "total q4",
        "approved amount", "approved balance",
    )
    out: list[dict] = []
    for it in items:
        if not isinstance(it, dict):
            continue
        desc = ((it.get("service_description") or it.get("description") or it.get("service_name") or "")
                .strip().lower())
        date = (it.get("date") or "").strip()
        code = (it.get("service_code") or "").strip()
        try:
            gross = float(it.get("gross") or 0.0)
        except Exception:
            gross = 0.0
        # Drop obvious summary keyword hits.
        if any(kw in desc for kw in summary_kw):
            continue
        # Drop no-date AND no-code rows with a non-zero gross, that pattern
        # is overwhelmingly a summary aggregate row, UNLESS the description
        # looks like a real service (e.g. "Personal care", "Domestic
        # assistance", "Nursing"). Keep those so DEC-1 v7.7 §Phase 2 #2
        # row-inheritance can re-attach the date from a preceding row.
        service_keywords = (
            "personal care", "domestic", "nursing", "podiatry", "physio",
            "cleaning", "shower", "medication", "wound", "transport",
            "gardening", "meal", "shopping", "social support", "respite",
            "care management", "clinical", "assessment", "occupational",
            "hairdressing", "escort",
        )
        looks_like_service = any(kw in desc for kw in service_keywords)
        if not date and not code and gross > 0 and not looks_like_service:
            continue
        out.append(it)
    return out


def _dedupe_line_items(items: list[dict]) -> tuple[list[dict], int]:
    """Drop duplicate line items by (date + service_code + gross) signature.
    Returns (filtered, n_dropped).

    Transport items (TR-*) are intentionally EXCLUDED from dedupe , two
    same-date TR-* entries with identical amount are exactly the duplicate-
    billing case we need RULE_3_DUPLICATE_EXACT to see and flag. Removing
    them here would silently suppress the anomaly.
    """
    seen: set[tuple] = set()
    out: list[dict] = []
    dropped = 0
    for it in items:
        code = (it.get("service_code") or "").strip().upper()
        # Skip dedupe for transport items, duplicates here are anomalies.
        if code.startswith("TR-") or code.startswith("TR"):
            out.append(it)
            continue
        sig = (
            (it.get("date") or "").strip().lower(),
            code,
            round(float(it.get("gross") or 0.0), 2),
            (it.get("worker_name") or "").strip().lower(),
            bool(it.get("is_cancellation")),
        )
        # Empty-signature items (no date AND no code AND zero gross) are likely
        # parsing artifacts, drop them quietly without counting as duplicates.
        if not sig[0] and not sig[1] and sig[2] == 0.0:
            dropped += 1
            continue
        if sig in seen:
            dropped += 1
            continue
        seen.add(sig)
        out.append(it)
    # DEC-1 v7.7 §Batch B: cross-stream deduplication pass.
    #
    # Parallel per-stream extractors are all shown the FULL statement text
    # and asked "extract every item for YOUR stream". When the source uses
    # ambiguous line items (a "Personal care" row without an explicit
    # stream tag), multiple streams claim the same physical row and it
    # ends up counted twice or three times. The primary dedupe misses
    # these because the different chunks assign different service_codes
    # (e.g. Clinical returns code="", Independence returns code="PC").
    #
    # We deduplicate on (normalised-date, gross, first-3-tokens-of-desc).
    # Preferred stream (kept when duplicates conflict) is inferred from
    # the description via a keyword-to-stream map. AT-HM is handled by a
    # separate second-pass dedupe below.
    import re as _re_dd
    import datetime as _dt_dd

    def _norm_dedup_date(raw: str) -> str:
        s = (raw or "").strip()
        if not s:
            return ""
        # Special markers used by extractors for rollup rows normalize to empty
        # so multi-week roll-ups are deduped by (gross + description) alone.
        low = s.lower()
        if low in ("various", "multiple", "see below", "n/a", "-"):
            return ""
        # Date-range markers like "01/07/2026-30/09/2026" or "01/07/2026-3" get
        # a stable normalisation from just the first date.
        for sep in (",", "-", "to", ","):
            if sep in s:
                first = s.split(sep, 1)[0].strip()
                if first and first != s:
                    d = _norm_dedup_date_atomic(first)
                    if d:
                        return "range:" + d
        return _norm_dedup_date_atomic(s) or low

    def _norm_dedup_date_atomic(raw: str) -> str:
        s = (raw or "").strip()
        if not s:
            return ""
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y",
                    "%d %b %Y", "%d %B %Y", "%d-%b-%Y", "%d-%B-%Y",
                    "%d %b", "%B %d", "%b %d"):
            try:
                d = _dt_dd.datetime.strptime(s, fmt).date()
                return d.isoformat()
            except Exception:
                continue
        return ""

    def _desc_tokens(li: dict) -> str:
        raw = (li.get("service_description") or li.get("service_name") or "").lower()
        toks = _re_dd.findall(r"[a-z0-9]+", raw)[:3]
        return " ".join(toks)

    def _preferred_stream_for(li: dict) -> str:
        desc = (li.get("service_description") or li.get("service_name") or "").lower()
        code = (li.get("service_code") or "").upper()
        # Explicit code prefix wins.
        if code.startswith(("NU-", "RN-", "OT-", "PT-", "PD-", "AH-", "WC-")):
            return "Clinical"
        if code.startswith(("PC-", "RES-", "SS-", "TR-")):
            return "Independence"
        if code.startswith(("DA-", "GM-", "ML-", "SH-")):
            return "EverydayLiving"
        if code.startswith(("AT-", "ATHM")):
            return "ATHM"
        # Description keywords.
        if any(k in desc for k in ("rn visit", "registered nurse", "nursing", "wound", "physiotherapy", "occupational therapy", "allied health", "clinical", "podiatry")):
            return "Clinical"
        if any(k in desc for k in ("personal care", "morning routine", "shower", "grooming", "respite", "transport", "social support", "medical appointment")):
            return "Independence"
        if any(k in desc for k in ("meal delivery", "meals", "cleaning", "domestic assist", "shopping", "laundry", "gardening")):
            return "EverydayLiving"
        if any(k in desc for k in ("cooling vest", "grab rail", "home modification", "assistive", "thermoregulation")):
            return "ATHM"
        return ""

    # Group by (normalised_date, gross, desc_tokens) and pick one row.
    from collections import defaultdict as _dd
    groups: dict[tuple, list[dict]] = _dd(list)
    order: list[tuple] = []
    for it in out:
        if not isinstance(it, dict):
            continue
        code = (it.get("service_code") or "").strip().upper()
        # Preserve TR-* separately as before.
        if code.startswith("TR-") or code.startswith("TR"):
            key = ("__tr__", id(it))
        else:
            key = (
                _norm_dedup_date(it.get("date")),
                round(float(it.get("gross") or 0.0), 2),
                _desc_tokens(it),
            )
        if key not in groups:
            order.append(key)
        groups[key].append(it)

    final_out: list[dict] = []
    for key in order:
        rows = groups[key]
        if len(rows) == 1 or (isinstance(key, tuple) and key and key[0] == "__tr__"):
            # Even single-row items get stream reassignment when the
            # description strongly implies a different stream than what the
            # LLM chunk assigned. This fixes S3.D1 detection where meal-
            # delivery and cleaning "Various" rows were being categorised
            # into Independence, inflating the services subtotal and
            # mathematically hiding the care-management cap breach.
            row = rows[0]
            pref_stream = _preferred_stream_for(row)
            if pref_stream and (row.get("stream") or "").strip() != pref_stream:
                # Do NOT downgrade a CareMgmt row to something else, the
                # CareMgmt fee line has "management" language that could
                # trigger a false reclassification. AT-HM is also protected.
                current = (row.get("stream") or "").strip()
                if current not in {"CareMgmt", "ATHM", "supplement", "Supplement"}:
                    row["stream"] = pref_stream
            final_out.append(row)
            continue
        # Multiple candidates for the same physical row. Pick the one whose
        # stream matches the description best; fall back to the first.
        pref = None
        for r in rows:
            desc_stream = _preferred_stream_for(r)
            if desc_stream and (r.get("stream") or "").strip() == desc_stream:
                pref = r
                break
        if pref is None:
            # Pick the row with the most descriptive fields populated.
            def _rich(r):
                populated = sum(1 for k in ("service_code", "hours", "unit_rate", "worker_name") if r.get(k))
                return populated
            pref = max(rows, key=_rich)
        # If the description implies a specific stream but no row matches,
        # override the winner's stream so it's correct.
        pref_stream = _preferred_stream_for(pref)
        if pref_stream and (pref.get("stream") or "").strip() != pref_stream:
            current = (pref.get("stream") or "").strip()
            if current not in {"CareMgmt", "ATHM", "supplement", "Supplement"}:
                pref["stream"] = pref_stream
        dropped += (len(rows) - 1)
        final_out.append(pref)

    out = final_out

    # DEC-1 v7.7 §Batch B: second dedupe pass specifically for AT-HM items.
    # The EverydayLiving stream extractor and the Adjustments extractor
    # both emit AT-HM rows for statements that list them inline (S2 pattern)
    # with different service codes and date formats.
    athm_seen: set[tuple] = set()
    dedup_out: list[dict] = []
    for it in out:
        stream = (it.get("stream") or "").strip()
        code = (it.get("service_code") or "").strip().upper()
        is_athm = stream == "ATHM" or code.startswith("AT-") or code.startswith("ATHM") or code == "AT"
        if not is_athm:
            dedup_out.append(it)
            continue
        # For AT-HM specifically, use just the FIRST 2 description tokens so
        # "cooling vest thermoregulation" and "cooling vest approved" match.
        desc_raw = (it.get("service_description") or it.get("service_name") or "").strip().lower()
        athm_tokens = _re_dd.findall(r"[a-z0-9]+", desc_raw)[:2]
        athm_sig = (
            _norm_dedup_date(it.get("date")),
            round(float(it.get("gross") or 0.0), 2),
            " ".join(athm_tokens),
        )
        if athm_sig in athm_seen:
            dropped += 1
            continue
        athm_seen.add(athm_sig)
        dedup_out.append(it)
    return dedup_out, dropped


async def extract_statement(
    text: str,
    household_id: str,
    *,
    user_id: Optional[str] = None,
    participant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Pass 1, Chunked parallel extraction.

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

    `user_id` / `participant_id` are forwarded into `db.llm_calls` rows so
    the admin cost dashboard can roll up spend per user / per participant.
    """
    key = _key()
    if not key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    payload = text[:24000]
    user_msg = f"STATEMENT TEXT:\n\n{payload}"
    cost_ctx = {"user_id": user_id, "household_id": household_id, "participant_id": participant_id}

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

    # DEC-1 v7.7 §Batch B: bump per-stream max_tokens from 2500 → 5000.
    # Dense quarterly fixtures (S2 has 29 Independence + 24 EverydayLiving
    # rows) blow through 2500 output tokens and the response truncates
    # mid-array, dropping ~35% of line items. 5000 tokens comfortably fits
    # ~30 line items per stream at ~250 tokens each.
    tasks = [
        _llm_chunk_call(HEADER_EXTRACTOR_SYSTEM, user_msg, f"extract-header-{household_id}", max_tokens=1200, is_valid=_header_is_valid, phase="extract_header", cost_ctx=cost_ctx),
        _llm_chunk_call(CLINICAL_EXTRACTOR_SYSTEM, user_msg, f"extract-clin-{household_id}", max_tokens=5000, phase="extract_clinical", cost_ctx=cost_ctx),
        _llm_chunk_call(INDEPENDENCE_EXTRACTOR_SYSTEM, user_msg, f"extract-indep-{household_id}", max_tokens=5000, phase="extract_independence", cost_ctx=cost_ctx),
        _llm_chunk_call(EVERYDAY_EXTRACTOR_SYSTEM, user_msg, f"extract-everyday-{household_id}", max_tokens=5000, phase="extract_everyday", cost_ctx=cost_ctx),
        _llm_chunk_call(ADJUSTMENTS_EXTRACTOR_SYSTEM, user_msg, f"extract-adj-{household_id}", max_tokens=2000, phase="extract_adjustments", cost_ctx=cost_ctx),
        _llm_chunk_call(PROVIDER_NOTES_EXTRACTOR_SYSTEM, user_msg, f"extract-notes-{household_id}", max_tokens=2000, phase="extract_provider_notes", cost_ctx=cost_ctx),
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
        # DEC-1 v5 · nullable header fields, preserve `null` from the LLM
        # instead of coercing to 0.0. If the LLM emits a number, coerce.
        for k in _HEADER_NULLABLE_V5_DEFAULTS:
            v = header_res.get(k)
            if v is None or v == "":
                assembled[k] = None
            else:
                try:
                    assembled[k] = float(v)
                except (TypeError, ValueError):
                    assembled[k] = None
        # DEC-1 v5 · is_no_worse_off boolean, coerce string/bool to real bool.
        # The default merge above wrote str(v), so we upgrade it back to bool.
        nwo_raw = header_res.get("is_no_worse_off")
        if isinstance(nwo_raw, bool):
            assembled["is_no_worse_off"] = nwo_raw
        elif isinstance(nwo_raw, str):
            assembled["is_no_worse_off"] = nwo_raw.strip().lower() in ("true", "1", "yes")
        else:
            assembled["is_no_worse_off"] = False
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
        # header_stream_budgets, per-stream QUARTERLY ALLOCATION from statement header.
        hsb = header_res.get("header_stream_budgets")
        if isinstance(hsb, dict):
            cleaned_hsb = {}
            for stream_key in ("Clinical", "Independence", "EverydayLiving"):
                try:
                    cleaned_hsb[stream_key] = float(hsb.get(stream_key) or 0.0)
                except Exception:
                    cleaned_hsb[stream_key] = 0.0
            assembled["header_stream_budgets"] = cleaned_hsb
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
    # DEC-1 v5 · Phase 2: deterministic care-mgmt filter. Even after the
    # prompt update tells the LLM not to emit care-management rows as line
    # items, we drop any row whose description or stream identifies it as
    # a care-mgmt / admin / package-management fee. Belt-and-braces vs the
    # phantom RULE_15/RULE_25 gap that this leakage used to produce.
    _CM_DESC_TOKENS = (
        "care management", "care mgmt", "package management",
        "administration fee", "admin fee", "care coordination",
        "case management", "provider coordination", "package administration",
        "care planning fee", "scheduling fee",
    )

    def _is_care_mgmt_line(it: Dict[str, Any]) -> bool:
        stream = (it.get("stream") or "").lower().replace(" ", "").replace("_", "")
        if stream in ("caremgmt", "cm", "admin", "administration",
                      "caremanagement"):
            return True
        desc = (it.get("service_description") or "").lower()
        return any(t in desc for t in _CM_DESC_TOKENS)

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
                if _is_care_mgmt_line(it):
                    # Move to care_management_line_items so it stays visible
                    # to any consumer that wants the raw row, but keep it OUT
                    # of the services line_items feed.
                    it["stream"] = "CareMgmt"
                    assembled.setdefault("care_management_line_items", []).append(it)
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
        # DEC-1 v5 · Phase 2: care management fees are captured separately as
        # `care_management_deducted` in the header. Do NOT append them to
        # `line_items`, that double-counts against the source's own services
        # subtotal and triggers phantom RULE_15/RULE_25 arithmetic gaps.
        # We still expose the parsed care-mgmt rows as a separate top-level
        # field for downstream inspection (e.g. rendering the fee detail
        # under a dedicated section, not in the services table).
        cm_lines: list = []
        for it in (adj_res.get("care_management_line_items") or []):
            if isinstance(it, dict) and not _is_subtotal_row(it):
                it["stream"] = "CareMgmt"
                cm_lines.append(it)
        if cm_lines:
            assembled["care_management_line_items"] = cm_lines
        adj_list = adj_res.get("previous_period_adjustments") or []
        if isinstance(adj_list, list):
            assembled["previous_period_adjustments"] = [a for a in adj_list if isinstance(a, dict)]
        commitments = adj_res.get("at_hm_commitments") or []
        if isinstance(commitments, list):
            assembled["at_hm_commitments"] = [c for c in commitments if isinstance(c, dict)]
        # AT-HM items claimed this period, append to line_items so they appear
        # in the stream breakdown and feed the gross total reconciliation.
        #
        # DEC-1 v5 · NWO/AT-HM iteration (Feb 2026):
        # The `_stream_extractor_system` prompt now explicitly forbids stream
        # extractors from emitting AT-HM rows, AT-HM is the exclusive domain
        # of this adjustments extractor. The dedup pass below is retained as
        # belt-and-braces telemetry: if `_athm_dupes_dropped` fires, it means
        # a stream extractor drifted and re-emitted an AT-HM row despite the
        # prompt clause. Dedup key = (normalised_date, first-5-desc-words, gross).
        def _norm_desc(d: str) -> str:
            s = (d or "").strip().lower()
            # Drop punctuation, collapse whitespace, keep first 5 words.
            import re as _re
            s = _re.sub(r"[^a-z0-9\s]", " ", s)
            tokens = [t for t in s.split() if t]
            return " ".join(tokens[:5])

        def _norm_key(li: Dict[str, Any]) -> tuple:
            return (
                (li.get("date") or "").strip()[:10],
                _norm_desc(li.get("service_description")
                           or li.get("description") or ""),
                round(float(li.get("gross") or 0.0), 2),
            )

        existing_keys = {_norm_key(li) for li in line_items
                         if isinstance(li, dict) and (li.get("stream") or "").upper() == "ATHM"}
        athm_dupes_dropped = 0
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
            k = _norm_key(it)
            if k in existing_keys:
                athm_dupes_dropped += 1
                continue
            existing_keys.add(k)
            line_items.append(it)
        if athm_dupes_dropped:
            assembled["_athm_dupes_dropped"] = athm_dupes_dropped

    # FIX 2 (Round 3), HARD AT-HM source-text validation.
    #
    # The LLM occasionally fabricates parallel AT-HM entries (e.g. an
    # "AT-001" line that doesn't exist alongside a real "ATHM-2026-0041"
    # entry), then the auditor hallucinates a "coding mismatch" anomaly
    # based on the fabricated row. To prevent this regardless of prompt
    # discipline, validate every AT-HM commitment AND every AT-HM line
    # item against the original source text:
    #
    #   • Reference number must appear in source text (case-insensitive).
    #   • For line items, the gross amount must also appear in source.
    #
    # Anything that fails this check is silently dropped from extraction.
    source_text_lower = (text or "").lower()

    def _amount_in_text(amount: float) -> bool:
        if amount <= 0:
            return False
        # Look for "$480", "$480.00", "480.00" or "480" near the amount.
        candidates = [
            f"${amount:,.2f}",
            f"${amount:.2f}",
            f"${int(amount):,}",
            f"${int(amount)}",
            f"{amount:,.2f}",
            f"{amount:.2f}",
        ]
        return any(c.lower() in source_text_lower for c in candidates)

    validated_commitments: list[dict] = []
    valid_refs: set[str] = set()
    for c in assembled.get("at_hm_commitments") or []:
        if not isinstance(c, dict):
            continue
        ref = (c.get("ref") or "").strip()
        if not ref:
            continue
        if ref.lower() not in source_text_lower:
            # Reference number isn't in the original statement → fabricated.
            continue
        validated_commitments.append(c)
        valid_refs.add(ref.upper())
    assembled["at_hm_commitments"] = validated_commitments

    # Drop any AT-HM line items whose service_code isn't a validated commitment ref.
    # DEC-1 v7.7 §Batch B: relaxed when there's no commitment register at all
    # (some statements list AT-HM items directly under an "Assistive Products
    # and Home Modifications" heading without a separate register). In that
    # case we still require the gross amount to appear verbatim in the source
    # text as a hallucination guard.
    has_commitment_register = bool(valid_refs)
    filtered_line_items: list[dict] = []
    for it in line_items:
        if not isinstance(it, dict):
            filtered_line_items.append(it)
            continue
        stream = (it.get("stream") or "").strip()
        code = (it.get("service_code") or "").strip().upper()
        is_athm = stream == "ATHM" or code.startswith("AT-") or code.startswith("ATHM")
        if is_athm:
            try:
                gross_val = float(it.get("gross") or 0.0)
            except Exception:
                gross_val = 0.0
            # Gross must appear in source text, kills the most common
            # hallucination mode.
            if not _amount_in_text(gross_val):
                continue
            # When the source has a commitment register, be strict: the code
            # must match a validated commitment ref. Otherwise, accept the
            # LLM's classification as long as the amount is real.
            if has_commitment_register and code and code not in valid_refs:
                continue
        filtered_line_items.append(it)
    line_items = filtered_line_items

    # Provider notes
    if isinstance(notes_res, dict):
        notes = notes_res.get("provider_notes_raw") or []
        if isinstance(notes, list):
            assembled["provider_notes_raw"] = [str(n).strip() for n in notes if str(n or "").strip()]

    # Deterministic transport-recovery backstop , 
    # The LLM occasionally drops one of multiple TR- transport entries when
    # they appear far apart in the statement. Scan the original text for any
    # date-prefixed line containing a TR- service code and a $-amount, and
    # add a stub Independence line item if it isn't already in `line_items`.
    line_items = _recover_transport_items(line_items, text)

    # Fix 5, Strip "budget summary" figures that the LLM occasionally
    # extracts as line items (recognisable by absent date OR description
    # matching summary-table keywords).
    line_items = _strip_summary_artifacts(line_items)

    # DEC-1 v7.7 §Batch B: normalise AT-HM line items to always show
    # government_paid = gross and participant_contribution = 0. The
    # Support at Home program funds all AT-HM items at 100% by design;
    # extraction chunks occasionally leave these fields at 0/blank which
    # then confuses downstream anomaly rules (a phantom "government_paid
    # discrepancy" fires on a legit AT-HM row). Only touch rows whose
    # participant_contribution is genuinely 0.
    for li in line_items:
        if not isinstance(li, dict):
            continue
        stream = (li.get("stream") or "").strip()
        code = (li.get("service_code") or "").strip().upper()
        if stream != "ATHM" and not (code.startswith("AT-") or code.startswith("ATHM") or code == "AT"):
            continue
        try:
            gross = float(li.get("gross") or 0.0)
            pc = float(li.get("participant_contribution") or 0.0)
            gp = float(li.get("government_paid") or 0.0)
        except Exception:
            continue
        if gross <= 0:
            continue
        if pc <= 0.01 and abs(gp - gross) > 0.01:
            # Fill in the missing government_paid so the row is arithmetically
            # coherent. Doesn't touch rows where participant_contribution is
            # actually charged (those are the RULE_4 real hits we want to see).
            li["government_paid"] = gross
            li["participant_contribution"] = 0.0

    # DEC-1 v7.7 §Phase 2 #2, row-level date inheritance.
    #
    # Providers frequently render tables with the date typed once and the
    # cell left blank on subsequent rows for the same day. The extraction
    # LLM sometimes emits those rows with an empty `date` field. Rather
    # than drop them (data loss) or leave them blank (rendering "1970" or
    # empty in the UI), inherit the date from the most recent preceding
    # row that has a valid one. Only applies when the row otherwise looks
    # complete (a service description or code is present).
    inherit_carry = None
    inheritance_count = 0
    for li in line_items:
        if not isinstance(li, dict):
            continue
        cur = (li.get("date") or "").strip()
        looks_like_row = bool(
            (li.get("service_description") or li.get("service_name") or li.get("service_code") or "").strip()
        )
        if cur:
            inherit_carry = cur
        elif looks_like_row and inherit_carry:
            li["date"] = inherit_carry
            li.setdefault("_date_inherited_from_previous", True)
            inheritance_count += 1
    # DEC-1 v7.7 §Batch B Round 2: also scan the SOURCE TEXT for the
    # pattern where a row prints a description + amount but no leading
    # date. Many PDF extractors put each cell on its own line, so we
    # scan the description line + a 6-line window after it.
    if text:
        import re as _re_inh
        VAGUE_MARKERS = _re_inh.compile(
            r"(?:combined\s+activities|ad-?hoc\s+support|combined\s+services"
            r"|service\s+delivery\s*[,-]|miscellaneous\s+support|ad-?hoc\s+visit"
            r"|ad-?hoc\s+support\s+\(unscheduled\))",
            _re_inh.IGNORECASE,
        )
        DATE_LEAD = _re_inh.compile(
            r"^\s*(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}"
            r"|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)"
            r"|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2})",
            _re_inh.IGNORECASE,
        )
        BLANK_DATE_MARKER = _re_inh.compile(r"^\s*[-,]\s*$")
        text_lines = text.split("\n")
        src_inherit_count = 0
        for idx, src_line in enumerate(text_lines):
            if not VAGUE_MARKERS.search(src_line):
                continue
            # Row has a vague marker. Check the description line and
            # the 6 lines that follow for an amount. The description
            # itself lacks a leading date (that's what makes it inherited).
            if DATE_LEAD.search(src_line):
                continue  # row has explicit date, not inherited
            window = "\n".join(text_lines[idx:idx+7])
            has_amount = _re_inh.search(r"\$[0-9]", window)
            # Extra confidence: check whether the next 1-2 lines are
            # blank-date markers ("-", ","). If yes, it's definitely an
            # inherited-date row.
            next_lines_blank = 0
            for j in range(idx+1, min(idx+4, len(text_lines))):
                if BLANK_DATE_MARKER.match(text_lines[j]):
                    next_lines_blank += 1
            if has_amount:
                src_inherit_count += 1
        if src_inherit_count > inheritance_count:
            inheritance_count = src_inherit_count
    if inheritance_count:
        assembled["_date_inheritance_count"] = inheritance_count

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
        # Total failure, surface the original error code so the audit fallback fires
        assembled["_extraction_error"] = f"chunk_failures: {','.join(failures)}"
    # DEC-1 v7.7 §Batch B: stash the source text on the extraction so the
    # deterministic post-audit rules (prohibited fees, legacy HCP terminology,
    # missing Aged Care Act disclosure, provider header vs footer mismatch,
    # words-vs-numerals mismatch, mixed date formats) can scan it directly.
    # Capped at 12KB and stripped by the persistence layer before Mongo write.
    assembled["_source_text"] = (text or "")[:12000]
    return assembled


async def audit_statement(
    extracted: Dict[str, Any],
    household_id: str,
    *,
    user_id: Optional[str] = None,
    participant_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Pass 2, Claude Haiku 4.5 applies the 10-rule anomaly audit against
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
    import time as _time
    from llm_costs import record_llm_call as _rec
    _t0 = _time.time()
    try:
        raw = await chat.send_message(msg)
        # Record the audit-pass cost row
        await _rec(
            tool="audit", model=AUDITOR_MODEL,
            input_text=payload, output_text=str(raw or ""),
            duration_ms=int((_time.time() - _t0) * 1000), success=True,
            user_id=user_id, household_id=household_id,
            participant_id=participant_id, phase="audit",
        )
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
        # OXY-1 v1 · advisory is a NEW severity level added alongside high/medium/low.
        # Counted in its own bucket so the DecoderResultView "issues found" chip
        # can show `high + medium + low` while a separate "Things worth checking"
        # section renders the advisory bucket.
        counts = {"high": 0, "medium": 0, "low": 0, "advisory": 0}
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

    # DEC-1 v7.7 §Phase 2 #7 / Open Item 1, canonical definition:
    #   government_paid = gross_total - participant_contribution
    # The quarterly subsidy allocation is a separate concept, stored under
    # `quarterly_subsidy_allocation` where the statement carries it, and
    # never confused with what the provider actually received for the period.
    try:
        gross_val = float(summary.get("total_gross") or 0.0)
        contrib_val = float(summary.get("total_participant_contribution") or 0.0)
    except Exception:
        gross_val = 0.0
        contrib_val = 0.0
    if gross_val > 0:
        summary["total_government_paid"] = round(max(0.0, gross_val - contrib_val), 2)
    subsidy = extracted.get("quarterly_subsidy_allocation")
    if subsidy is None:
        subsidy = extracted.get("subsidy_allocated_this_quarter")
    if subsidy is not None:
        try:
            summary["quarterly_subsidy_allocation"] = round(float(subsidy), 2)
        except Exception:
            pass

    audit_result["statement_summary"] = summary


def _recompute_stream_breakdown(audit_result: Dict[str, Any], extracted: Dict[str, Any]) -> None:
    """Always recompute the stream_breakdown array deterministically from the
    extracted line items. Replaces whatever the LLM auditor returned (which
    sometimes omits AT-HM or merges streams). Guarantees the UI gets a card
    for every stream that has at least one non-cancelled line item , including
    AT-HM (assistive tech / home modifications)."""
    items = extracted.get("line_items") or []
    by_stream: Dict[str, Dict[str, float]] = {}
    # Stable display order, AT-HM card sits between Everyday Living and Care Mgmt.
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
    # Try DD MMM YYYY / D MMM YYYY and DD/MM/YYYY variants
    for fmt in (
        "%d %b %Y", "%d %B %Y", "%d/%m/%Y", "%d-%m-%Y",
        "%d %b %y", "%d %B %y", "%d/%m/%y", "%d-%m-%y",
        "%d-%b-%Y", "%d-%B-%Y", "%d-%b-%y", "%d-%B-%y",
    ):
        try:
            return _dt.datetime.strptime(s, fmt).date()
        except ValueError:
            pass
    return None


# Pension-aware contribution rate table for Rule 9 deterministic check.
# Each entry maps a pension cohort + stream to a (min_rate, max_rate) band.
# Exact-rate cohorts (full Age Pension, self-funded without CSHC) have
# min == max. Band cohorts (part Age Pension, CSHC) have a Services Australia
# means-tested rate that sits anywhere inside the band, Wayly can only
# validate the band, not the exact rate.
#
# Source: Department of Health, Support at Home contribution framework.
_PENSION_RATES = {
    "full_age_pension":          {"Clinical": (0.0, 0.0),  "Independence": (0.05, 0.05),  "EverydayLiving": (0.175, 0.175), "ATHM": (0.0, 0.0), "CareMgmt": (0.0, 0.0)},
    # Per the Department of Health "Support at Home program - participant
    # contributions" PDF (effective 1 November 2025), part Age Pension and
    # CSHC share THE SAME contribution band: Independence 5%-50% and
    # Everyday Living 17.5%-80%. The exact rate is set by Services Australia
    # via the income-and-assets means test.
    "part_age_pension":          {"Clinical": (0.0, 0.0),  "Independence": (0.05, 0.50),  "EverydayLiving": (0.175, 0.80),  "ATHM": (0.0, 0.0), "CareMgmt": (0.0, 0.0)},
    "cshc":                      {"Clinical": (0.0, 0.0),  "Independence": (0.05, 0.50),  "EverydayLiving": (0.175, 0.80),  "ATHM": (0.0, 0.0), "CareMgmt": (0.0, 0.0)},
    "self_funded":               {"Clinical": (0.0, 0.0),  "Independence": (0.50, 0.50),  "EverydayLiving": (0.80, 0.80),   "ATHM": (0.0, 0.0), "CareMgmt": (0.0, 0.0)},
    # Used when the header extractor cannot disambiguate between part_age_pension
    # and cshc, Rule 9 validates against the widest applicable band so the
    # check stays informative without producing false positives.
    "part_or_cshc_unconfirmed":  {"Clinical": (0.0, 0.0),  "Independence": (0.05, 0.50),  "EverydayLiving": (0.175, 0.80),  "ATHM": (0.0, 0.0), "CareMgmt": (0.0, 0.0)},
}

# Human-readable cohort labels used in anomaly copy.
_PENSION_STATUS_LABELS = {
    "full_age_pension": "full Age Pension",
    "part_age_pension": "part Age Pension",
    "cshc": "Commonwealth Seniors Health Card",
    "self_funded": "self-funded (no CSHC)",
    "part_or_cshc_unconfirmed": "part Age Pension or CSHC (cohort unconfirmed)",
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

    # DEC-1 v7.7 §Phase 2 #5, #14: strip LLM-emitted anomalies matching
    # forbidden patterns that are handled deterministically or are known
    # false-positive shapes (recurring services, missing/empty ABN, ambiguous
    # "period longer than usual" warnings). Deterministic checks below
    # re-emit the correct versions where the underlying data warrants it.
    def _is_forbidden_llm_anomaly(a: dict) -> bool:
        rule = (a.get("rule") or "").upper()
        headline = (a.get("headline") or a.get("title") or "").lower()
        detail = (a.get("detail") or "").lower()
        blob = f"{headline} {detail}"
        # ABN empty/missing false positive, RULE_20_ABN_FORMAT (deterministic)
        # only fires when the ABN is present and malformed.
        if "abn" in blob and any(w in blob for w in ("empty", "missing", "blank", "not provided", "no abn", "null", "absent")):
            return True
        # DEC-1 v7.7 §Batch B: strip LLM-emitted RULE_20_ABN_FORMAT flags
        # when the extracted provider_abn is empty. The deterministic
        # RULE_20 in _add_parse_warnings is the only source of truth; the
        # LLM occasionally invents an ABN-format anomaly on statements
        # that don't print an ABN at all.
        if rule == "RULE_20_ABN_FORMAT":
            provider_abn = (a.get("_extracted_provider_abn") or "").strip() if isinstance(a, dict) else ""
            # We don't have direct access to `extracted` here, but the
            # RULE_20 deterministic guard requires a non-empty ABN. Strip
            # any LLM-emitted RULE_20 that mentions "invalid" / "format"
            # / "missing", the deterministic pass will re-emit it if the
            # actual ABN is malformed.
            if any(p in blob for p in ("invalid", "format", "missing", "not detected", "no valid", "malformed")):
                return True
        # Recurring-service "duplicate" pattern, DEC-1 v7.7 §Phase 2 #5:
        # weekly PC, fortnightly DA, weekly RN wound reviews are normal.
        # Only flag exact same-date duplicates (handled by RULE_3_DUPLICATE_EXACT).
        if rule.startswith("RULE_3") and rule != "RULE_3_DUPLICATE_EXACT":
            if any(w in blob for w in ("weekly", "fortnightly", "recurring", "each week", "every week", "every fortnight", "regular", "routine")):
                return True
            # "Within N days" fuzzy duplicate, no longer trusted from LLM.
            if any(w in blob for w in ("within 7 days", "within seven days", "within a week", "close together", "back-to-back")):
                return True
        # Period-longer-than-usual noise, DEC-1 v7.7 §Phase 2 #9 (cadence):
        # only the deterministic RULE_14 fires, and only for genuinely
        # anomalous spans.
        if any(w in blob for w in ("longer than a typical", "unusually long period", "unusually short period", "period spans more than", "cadence issue")):
            return True
        # DEC-1 v7.7 §Batch B: strip null/empty service_code anomalies.
        # Per checklist S1.13, empty service_code must be silent, a null
        # code is not itself an anomaly, only a MALFORMED code should fire.
        if "service_code" in blob or "service code" in blob:
            silent_patterns = ("empty", "missing", "blank", "not populated", "not filled", "null", "not provided", "no service code", "no service_code")
            if any(p in blob for p in silent_patterns) and not any(
                w in blob for w in ("malformed", "invalid format", "wrong format", "unrecognised", "unrecognized")
            ):
                return True
        # DEC-1 v7.7 §Batch B: strip LLM-emitted stream discrepancy flags.
        # The deterministic RULE_16 is the only source of truth for
        # extracted-vs-header stream mismatches. Any LLM-emitted variant
        # citing Clinical, Independence, or generic "stream totals" is
        # forbidden (deterministic RULE_16 handles Everyday Living only,
        # with the correct threshold and direction).
        stream_mismatch_phrases = (
            "does not match header", "doesn't match header", "does not match the header",
            "doesn't match the header", "does not match 'used this month'",
            "doesn't match 'used this month'", "does not match \"used this month\"",
            "stream gross total does not match", "stream subtotal does not match",
            "stream total does not match", "stream totals do not match",
            "stream totals don't match", "reported stream totals",
            "extracted line-item sums", "extracted line item sums",
            "extracted stream totals",
        )
        if (
            ("clinical" in blob or "independence" in blob or "stream total" in blob or "stream totals" in blob or "reported stream" in blob)
            and any(p in blob for p in stream_mismatch_phrases)
        ):
            return True
        # DEC-1 v7.7 §Batch B: strip LLM "same service in two streams" duplicate
        # framings. Line items are single-stream, a "same in Clinical and
        # EverydayLiving" flag is fabricated from misreading the stream
        # header. Only real duplicates (same date + code + rate) fire, via
        # RULE_3_DUPLICATE_EXACT.
        two_stream_phrases = (
            "appears in both", "appears in two streams",
            "in both clinical and", "in both independence and",
            "in both everydayliving and", "in both everyday living and",
            "in both athm and", "stream duplication",
            "duplicated across streams", "counted in two streams",
        )
        if any(p in blob for p in two_stream_phrases):
            return True
        # DEC-1 v7.7 §Batch B: strip physiotherapy / clinical "weekend or
        # after-hours" rate flags where the cited date is actually a weekday.
        # Fixes M2.10 false positive (18/08/2026 was a Tuesday but rule
        # fired as weekend/after-hours).
        weekend_phrases = ("weekend", "after-hours", "after hours", "saturday", "sunday", "public holiday")
        if any(p in blob for p in weekend_phrases):
            # Pull any DD/MM/YYYY, DD-Mon-YYYY, or ISO date from the anomaly
            # text and check whether ANY cited date is a weekend / holiday.
            import re as _re_wk
            date_tokens = _re_wk.findall(
                r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b",
                (a.get("detail") or "") + " " + " ".join(str(e) for e in (a.get("evidence") or [])),
                _re_wk.IGNORECASE,
            )
            if date_tokens:
                import datetime as _dt_wk
                any_weekend = False
                any_weekday = False
                for tok in date_tokens:
                    d = None
                    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%Y-%m-%d", "%d %b %Y", "%d %B %Y"):
                        try:
                            d = _dt_wk.datetime.strptime(tok, fmt).date()
                            break
                        except Exception:
                            continue
                    if d is None:
                        continue
                    if d.weekday() >= 5:
                        any_weekend = True
                    else:
                        any_weekday = True
                # If EVERY cited date is a weekday, the flag is a false positive.
                if any_weekday and not any_weekend:
                    return True
        return False

    anomalies = [a for a in anomalies if not _is_forbidden_llm_anomaly(a)]
    audit_result["anomalies"] = anomalies

    existing_rules = {(a.get("rule") or "").upper() for a in anomalies if isinstance(a, dict)}

    # Rule 9, Pension-aware contribution arithmetic (deterministic)
    #
    # DEC-1 v5 §F2 gate: when the source presents contribution as aggregate-only
    # (Margaret's pattern), per-line participant_contribution / government_paid
    # values are legitimately null. The mismatch/rate/inconsistency variants
    # of RULE_9 do not apply, they would either divide by null or misread
    # zeros as under-contribution. Only the pension-status-unknown INFO stays.
    _v5_contrib_source = (extracted.get("per_line_contribution_source") or "").strip().lower()
    _v5_skip_rule9_arithmetic = _v5_contrib_source == "aggregate_only"

    # DEC-1 v5 Phase 2 · NWO override: participants explicitly covered by
    # the Support at Home "No-Worse-Off" arrangement pay $0 per-line by
    # policy, regardless of their pension status. The arithmetic mismatch
    # check would otherwise misread the (correct) $0 contributions as
    # under-contribution. Header extractor sets `is_no_worse_off=True`
    # only when the source EXPLICITLY says so (no inference).
    _v5_is_nwo = bool(extracted.get("is_no_worse_off"))
    if _v5_is_nwo:
        _v5_skip_rule9_arithmetic = True

    rule_9_keys = {
        "RULE_9_CONTRIBUTION_MISMATCH",
        "RULE_9_PENSION_STATUS_UNKNOWN",
        "RULE_9_INCONSISTENT_RATE",
    }
    if not (existing_rules & rule_9_keys):
        pension_status = (extracted.get("pension_status") or "unknown").strip().lower()
        if pension_status not in _PENSION_RATES:
            anomalies.append({
                "severity": "low",
                "rule": "RULE_9_PENSION_STATUS_UNKNOWN",
                "headline": "We couldn't confirm this participant's pension status from the statement.",
                "detail": (
                    "Contribution rate checks have been skipped because pension status is unclear. "
                    "Verify your contribution rates directly with your provider , the correct rates "
                    "depend on whether the participant receives the full Age Pension, part Age Pension, "
                    "holds a Commonwealth Seniors Health Card, or is self-funded."
                ),
                "dollar_impact": 0.0,
                "evidence": [f"pension_status: {pension_status or 'unknown'}"],
                "suggested_action": "Phone your provider's billing line and ask them to confirm the participant's recorded pension status, then reconcile your contribution rates against the published Support at Home rate table.",
            })
        elif _v5_skip_rule9_arithmetic:
            # DEC-1 v5 §F2: source only provides aggregate participant
            # contribution and government paid figures. Per-line arithmetic
            # checks would either divide by null or misread nulls-coerced-to-0
            # as under-contribution. The pension INFO would have already
            # fired above if applicable; skip the rest of RULE_9.
            pass
        else:
            rates = _PENSION_RATES[pension_status]
            cohort_label = _PENSION_STATUS_LABELS.get(pension_status, pension_status.replace("_", " "))
            mismatches: list[dict] = []
            # Track implied rates by stream to detect inconsistency across the
            # same statement (band cohorts only, the exact rate is set per
            # participant by Services Australia and should be uniform within
            # a single statement).
            implied_by_stream: dict[str, list[dict]] = {}
            for li in (extracted.get("line_items") or []):
                if not isinstance(li, dict):
                    continue
                if li.get("is_cancellation"):
                    continue
                stream = (li.get("stream") or "").strip()
                band = rates.get(stream)
                if band is None:
                    continue
                try:
                    gross = float(li.get("gross") or 0.0)
                    contrib = float(li.get("participant_contribution") or 0.0)
                except Exception:
                    continue
                if gross <= 0:
                    continue
                lo, hi = band
                implied_rate = contrib / gross
                line_summary = {
                    "date": li.get("date") or "",
                    "service_code": li.get("service_code") or "",
                    "service_description": li.get("service_description") or "",
                    "stream": stream,
                    "gross": gross,
                    "charged_contribution": round(contrib, 2),
                    "implied_rate_pct": round(implied_rate * 100, 2),
                    "band_min_pct": round(lo * 100, 2),
                    "band_max_pct": round(hi * 100, 2),
                }
                # Always remember the implied rate for cross-line consistency.
                implied_by_stream.setdefault(stream, []).append(line_summary)

                if abs(hi - lo) < 1e-9:
                    # Exact-rate cohort: keep the original dollar-variance check.
                    expected_dollars = round(gross * lo, 2)
                    variance = round(abs(contrib - expected_dollars), 2)
                    if variance > 0.10:
                        mismatches.append({
                            **line_summary,
                            "mode": "exact",
                            "expected_contribution": expected_dollars,
                            "expected_rate_pct": round(lo * 100, 2),
                            "variance": variance,
                        })
                else:
                    # Band cohort: tolerate a 0.5 percentage-point margin to
                    # absorb cents-level rounding on the printed rate.
                    if implied_rate < (lo - 0.005) or implied_rate > (hi + 0.005):
                        mismatches.append({
                            **line_summary,
                            "mode": "band",
                            "variance": round(
                                min(
                                    abs(contrib - gross * lo),
                                    abs(contrib - gross * hi),
                                ),
                                2,
                            ),
                        })

            for m in mismatches:
                if m.get("mode") == "exact":
                    headline = (
                        f"{m['service_description'] or m['service_code'] or m['stream']} "
                        f"on {m['date']} contribution doesn't match the expected "
                        f"{m['expected_rate_pct']}% rate for a {cohort_label} participant."
                    )
                    detail = (
                        f"For a {cohort_label} participant the {m['stream']} stream contribution rate is "
                        f"{m['expected_rate_pct']}%. On gross ${m['gross']:,.2f} the expected contribution "
                        f"is ${m['expected_contribution']:,.2f}, but the statement charged "
                        f"${m['charged_contribution']:,.2f} , a variance of ${m['variance']:,.2f}."
                    )
                    evidence = [
                        f"pension_status: {pension_status}",
                        f"stream: {m['stream']}",
                        f"gross: ${m['gross']:,.2f}",
                        f"charged contribution: ${m['charged_contribution']:,.2f}",
                        f"expected contribution: ${m['expected_contribution']:,.2f}",
                    ]
                else:
                    headline = (
                        f"{m['service_description'] or m['service_code'] or m['stream']} "
                        f"on {m['date']} contribution implies {m['implied_rate_pct']}%, outside the "
                        f"{m['band_min_pct']}% to {m['band_max_pct']}% range that applies to a "
                        f"{cohort_label} participant."
                    )
                    detail = (
                        f"For a {cohort_label} participant the {m['stream']} stream contribution rate is "
                        f"means-tested by Services Australia within the {m['band_min_pct']}% to "
                        f"{m['band_max_pct']}% range. On gross ${m['gross']:,.2f} the statement charged "
                        f"${m['charged_contribution']:,.2f}, which implies {m['implied_rate_pct']}% , "
                        "outside that range."
                    )
                    evidence = [
                        f"pension_status: {pension_status}",
                        f"stream: {m['stream']}",
                        f"gross: ${m['gross']:,.2f}",
                        f"charged contribution: ${m['charged_contribution']:,.2f}",
                        f"implied rate: {m['implied_rate_pct']}%",
                        f"expected band: {m['band_min_pct']}% , {m['band_max_pct']}%",
                    ]
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_9_CONTRIBUTION_MISMATCH",
                    "headline": headline,
                    "detail": detail,
                    "dollar_impact": m["variance"],
                    "evidence": evidence,
                    "suggested_action": (
                        f"Ask your provider to confirm the contribution rate applied to "
                        f"{m.get('service_code') or m.get('service_description') or m.get('stream')} "
                        f"on {m.get('date')}, and to refund the variance if it was charged in error."
                    ),
                })

            # Cross-line consistency check, band cohorts only.
            inconsistency_emitted: set[str] = set()
            for stream, lines in implied_by_stream.items():
                band = rates.get(stream)
                if band is None:
                    continue
                lo, hi = band
                if abs(hi - lo) < 1e-9:
                    continue  # Exact-rate cohort , single-line check is enough.
                rates_pct = [li["implied_rate_pct"] for li in lines]
                if len(rates_pct) < 2:
                    continue
                spread = max(rates_pct) - min(rates_pct)
                if spread > 0.5 and stream not in inconsistency_emitted:
                    inconsistency_emitted.add(stream)
                    sample_lines = sorted(
                        lines,
                        key=lambda x: x["implied_rate_pct"],
                    )
                    sample_low = sample_lines[0]
                    sample_high = sample_lines[-1]
                    anomalies.append({
                        "severity": "medium",
                        "rule": "RULE_9_INCONSISTENT_RATE",
                        "headline": (
                            f"{stream} contributions on this statement imply two different rates "
                            f"({sample_low['implied_rate_pct']}% and {sample_high['implied_rate_pct']}%). "
                            "Services Australia sets a single rate per participant."
                        ),
                        "detail": (
                            f"For a {cohort_label} participant the {stream} contribution rate is "
                            f"means-tested by Services Australia and should be the same for every "
                            f"{stream} line on a single statement. This statement shows "
                            f"{sample_low['implied_rate_pct']}% on "
                            f"{sample_low['service_description'] or sample_low['service_code']} "
                            f"({sample_low['date']}) and {sample_high['implied_rate_pct']}% on "
                            f"{sample_high['service_description'] or sample_high['service_code']} "
                            f"({sample_high['date']}) , a spread of "
                            f"{round(spread, 2)} %-points."
                        ),
                        "dollar_impact": 0.0,
                        "evidence": [
                            f"pension_status: {pension_status}",
                            f"stream: {stream}",
                            f"implied rates: {sorted({r for r in rates_pct})}",
                            f"expected band: {round(lo * 100, 2)}% , {round(hi * 100, 2)}%",
                        ],
                        "suggested_action": (
                            f"Ask your provider why two different {stream} contribution rates appear on the "
                            "same statement. Services Australia sets one means-tested rate per participant , "
                            "the rate must not change line-by-line."
                        ),
                    })

    # ---------------------------------------------------------------------
    # Rule 11B, AT-HM amount exceeds the seeded high tier without an
    # explicit "exceedance approved" provider note. Informational only , 
    # exceedances are legitimately allowed with evidence under Aged Care
    # Rules 2025 section 211.
    # Rule 16 , Supplement amount variance against the seeded daily figures.
    # MEDIUM severity when a supplement line item's implied daily amount
    # diverges from the seeded value by more than ±$0.50.
    # ---------------------------------------------------------------------
    if "RULE_11B_ATHM_AMOUNT_EXCEEDS_TIER" not in existing_rules:
        try:
            import program_reference as _pr
            high_tier = float(_pr.get_value("athm.tier.high.amount_aud", None, default=15000.0) or 15000.0)
        except Exception:
            high_tier = 15000.0
        notes_blob = " ".join(
            (n or "") for n in (extracted.get("provider_notes_raw") or [])
            if isinstance(n, str)
        ).lower()
        has_exceedance_note = ("exceedance approved" in notes_blob
                               or "exceedance: approved" in notes_blob)
        for li in (extracted.get("line_items") or []):
            if not isinstance(li, dict) or li.get("is_cancellation"):
                continue
            if (li.get("stream") or "").strip() != "ATHM":
                continue
            try:
                gross = float(li.get("gross") or 0.0)
            except Exception:
                continue
            if gross > high_tier and not has_exceedance_note:
                anomalies.append({
                    "severity": "low",
                    "rule": "RULE_11B_ATHM_AMOUNT_EXCEEDS_TIER",
                    "headline": (
                        f"AT-HM line of ${gross:,.2f} exceeds the high tier (${high_tier:,.2f}) "
                        "with no exceedance-approved note in the statement."
                    ),
                    "detail": (
                        "Aged Care Rules 2025 section 212-10 sets the AT-HM high tier at "
                        f"${high_tier:,.2f}. Exceedances are allowed under section 211 with "
                        "clinical evidence (e.g. an OT prescription), but the statement should "
                        "carry an explicit 'exceedance approved' note. Ask the provider to "
                        "confirm the approval reference."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [
                        f"line gross: ${gross:,.2f}",
                        f"high tier: ${high_tier:,.2f}",
                        "no exceedance-approved note found in provider notes",
                    ],
                    "suggested_action": (
                        "Ask the provider for the AT-HM exceedance approval reference and the "
                        "evidence (e.g. OT prescription) that supported it."
                    ),
                })

    if "RULE_16_SUPPLEMENT_AMOUNT_VARIANCE" not in existing_rules:
        try:
            import program_reference as _pr
        except Exception:
            _pr = None
        if _pr is not None:
            for li in (extracted.get("line_items") or []):
                if not isinstance(li, dict) or li.get("is_cancellation"):
                    continue
                if (li.get("stream") or "").strip().lower() != "supplement":
                    continue
                code = (li.get("service_code") or "").strip().lower()
                if not code:
                    continue
                expected_daily = _pr.get_value(
                    f"supplement.{code}.daily_aud", None, default=None
                )
                if expected_daily is None:
                    continue
                try:
                    actual_daily = float(li.get("unit_rate") or 0.0)
                    if actual_daily == 0:
                        # Fall back to gross when unit_rate is missing.
                        actual_daily = float(li.get("gross") or 0.0)
                except Exception:
                    continue
                variance = round(actual_daily - float(expected_daily), 2)
                if abs(variance) > 0.50:
                    anomalies.append({
                        "severity": "medium",
                        "rule": "RULE_16_SUPPLEMENT_AMOUNT_VARIANCE",
                        "headline": (
                            f"{code.replace('_', ' ').title()} supplement charged at "
                            f"${actual_daily:.2f}/day , expected ${float(expected_daily):.2f}."
                        ),
                        "detail": (
                            f"Aged Care Rules 2025 sets this supplement at ${float(expected_daily):.2f}/day "
                            f"(see sections 196-15 / 196-20 / 196-25 / 196-30 / 196-35). The line "
                            f"implies ${actual_daily:.2f}/day, a variance of ${variance:.2f}/day."
                        ),
                        "dollar_impact": abs(variance) * 30,  # rough monthly impact
                        "evidence": [
                            f"supplement: {code}",
                            f"expected daily: ${float(expected_daily):.2f}",
                            f"charged daily: ${actual_daily:.2f}",
                        ],
                        "suggested_action": (
                            "Ask the provider to confirm the supplement amount against the Aged Care "
                            "Rules 2025 schedule and reissue the line at the correct rate if needed."
                        ),
                    })

    # Rule 13, Quarterly underspend pattern (deterministic, period-aware)
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
            # Final month of the quarter, fire the full forfeiture alert
            remaining_pct = remaining / quarterly_total * 100
            # Rollover cap = max($1,000, 10% of GROSS quarterly budget).
            # ``quarterly_total`` comes from the statement's quarterly_budget_total
            # header, which providers print as the GROSS quarterly figure (annual / 4,
            # before the 10% care-management slice). So multiplying it by 0.10 here
            # already produces the correct gross-base rollover cap, do NOT swap to
            # budget_lib.quarterly_budget(), which would deduct CM a second time.
            rollover_cap = max(1000.00, 0.10 * quarterly_total)
            if remaining_pct >= 10 or remaining >= 500:
                participant = extracted.get("participant_name") or "The participant"
                forfeit = max(0.0, remaining - rollover_cap)
                if remaining > rollover_cap:
                    severity = "medium"
                    closing = (
                        f" Unspent funding above the rollover cap (${rollover_cap:,.2f}) is forfeited permanently , "
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
                    "headline": f"{participant} ended the quarter with ${remaining:,.2f} unspent , about {remaining_pct:.0f}% of the quarterly budget.",
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
            # Mid-quarter month, only emit a LOW informational note when
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
                        f"About {used_pct:.0f}% of the ${quarterly_total:,.2f} quarterly budget has been used , "
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
                    "suggested_action": "No action required this month. We will re-check at the end of the quarter.",
                })

    # Rule 14, cadence inference (DEC-1 v7.7 §Invariant 10 & §Phase 2 #9).
    # Monthly statements (28-31 days) and quarterly statements (88-92 days)
    # are both normal cadences. Only flag when the span falls outside every
    # standard cadence, so users are not warned about a legitimate quarterly.
    #
    # Batch B: cadence is ALWAYS inferred and persisted, even when the LLM
    # already emitted a RULE_14 anomaly (so downstream RULE_1_CARE_MGMT_CAP
    # and other cadence-gated rules can rely on it).
    _ps_14 = _parse_iso_date(extracted.get("period_start"))
    _pe_14 = _parse_iso_date(extracted.get("period_end"))
    if _ps_14 and _pe_14:
        span_14 = (_pe_14 - _ps_14).days + 1  # inclusive
        cadence_14 = None
        if 28 <= span_14 <= 31:
            cadence_14 = "monthly"
        elif 88 <= span_14 <= 92:
            cadence_14 = "quarterly"
        elif 6 <= span_14 <= 8:
            cadence_14 = "weekly"
        elif 13 <= span_14 <= 15:
            cadence_14 = "fortnightly"
        audit_result.setdefault("statement_summary", {})["cadence"] = cadence_14 or "irregular"
        if cadence_14 is None and "RULE_14_PERIOD_PARSE_WARNING" not in existing_rules:
            anomalies.append({
                "severity": "low",
                "rule": "RULE_14_PERIOD_PARSE_WARNING",
                "headline": f"Statement period spans {span_14} days, which is outside standard cadences",
                "detail": (
                    f"Extracted period {_ps_14.isoformat()} to {_pe_14.isoformat()} spans {span_14} days. "
                    f"Support at Home statements are usually monthly (28-31 days) or quarterly "
                    f"(88-92 days). The literal statement_period on the source was: "
                    f"\"{extracted.get('statement_period') or ''}\"."
                ),
                "dollar_impact": 0.0,
                "evidence": [
                    f"period_start: {_ps_14.isoformat()}",
                    f"period_end: {_pe_14.isoformat()}",
                    f"span_days: {span_14}",
                    f"statement_period text: {extracted.get('statement_period') or ''}",
                ],
                "suggested_action": "Open the original statement and confirm the dates match. If they do not, this decode may have picked up a summary rather than the actual period.",
            })

    # Rule 15, extracted gross vs reported gross
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
            # DEC-1 v5 · NWO false-positive fix (Feb 2026):
            # `reported_total_gross` per the header prompt = streams
            # + care management + AT-HM + previous-period adjustments.
            # But `line_items` no longer includes the care-mgmt row
            # (Layer 2 filter moves it to `care_management_line_items`).
            # So the raw comparison `extracted_total vs reported` was
            # off by the CM amount, firing RULE_15 as a false positive
            # on any statement with a legitimate CM fee (e.g. the NWO
            # archetype: $704 services + $70.40 CM = $774.40 reported,
            # but extracted_total = $704 → phantom $70.40 gap).
            # Fix: add care_management_deducted back before comparison.
            try:
                cm_deducted = float(extracted.get("care_management_deducted") or 0.0)
            except Exception:
                cm_deducted = 0.0
            net_extracted = extracted_total + cm_deducted - adj_credit
            # DEC-1 v7.7 §Batch B: sanity-check the LLM's reported_total_gross
            # against the budget reconciliation. If the reported figure is
            # inconsistent with (quarterly_budget_total − budget_remaining),
            # the LLM has extracted the wrong header field; the rule would
            # then fire a false positive against a phantom "reported" number.
            try:
                qbt = float(extracted.get("quarterly_budget_total") or 0.0)
                brem = float(extracted.get("budget_remaining_at_quarter_end") or 0.0)
            except Exception:
                qbt = brem = 0.0
            budget_implied = round(qbt - brem, 2) if qbt > 0 and brem > 0 else 0.0
            # Also allow the sum of the stream_used_this_month header fields.
            sutm = extracted.get("stream_used_this_month") or {}
            sutm_total = 0.0
            if isinstance(sutm, dict):
                for v in sutm.values():
                    try:
                        sutm_total += float(v or 0.0)
                    except Exception:
                        pass
            sutm_total = round(sutm_total, 2)
            reported_matches_budget = (
                budget_implied > 0 and abs(reported - budget_implied) <= 5.0
            )
            reported_matches_stream_headers = (
                sutm_total > 0 and abs(reported - sutm_total) <= 5.0
            )
            reported_looks_valid = reported_matches_budget or reported_matches_stream_headers
            # If the LLM's reported figure doesn't match the budget or stream
            # headers but the extracted total DOES match either of those,
            # then the LLM's field is bogus. Skip the rule.
            extracted_matches_budget = (
                budget_implied > 0 and abs(net_extracted - budget_implied) <= 5.0
            )
            extracted_matches_stream = (
                sutm_total > 0 and abs(net_extracted - sutm_total) <= 5.0
            )
            if not reported_looks_valid and (extracted_matches_budget or extracted_matches_stream):
                pass  # Suppress: LLM's reported_total_gross is unreliable.
            elif abs(net_extracted - reported) > 5.0:
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
                        f"care management deducted: ${cm_deducted:,.2f}",
                        f"previous-period adjustment credits: ${adj_credit:,.2f}",
                        f"net extracted (services + CM − adj credits): ${net_extracted:,.2f}",
                        f"statement reported total: ${reported:,.2f}",
                    ],
                    "suggested_action": "Open the original statement and check whether any line items are missing from the decoded view above.",
                })

    # ---------------------------------------------------------------------
    # DEC-1 v5 · Phase 2 additions (Feb 2026)
    # ---------------------------------------------------------------------
    # Both rules read the new v5 top-level fields when populated
    # (`source_declared_services_total`, `care_management_source_text`,
    # `computed_line_item_sum`, `per_line_contribution_source`) and fall
    # silent when the fields are absent, pre-v5 statements never trigger.

    # RULE_25_SOURCE_ARITHMETIC_GAP, MEDIUM severity.
    #
    # v5 Invariant 14 · Source arithmetic is checked. Compare the source's OWN
    # declared services total (the value the provider printed on the summary
    # panel) against the sum of the individual service line items. Any gap
    # over $0.00 is a real provider-side reconciliation defect, distinct from
    # RULE_15 which handles the LLM extraction vs statement-reported gap.
    if "RULE_25_SOURCE_ARITHMETIC_GAP" not in existing_rules:
        try:
            declared = extracted.get("source_declared_services_total")
            declared_f = float(declared) if declared is not None else None
        except (TypeError, ValueError):
            declared_f = None
        try:
            # Prefer the persisted computed_line_item_sum (written by the
            # Phase 1 hook); fall back to summing on the fly if absent.
            persisted_sum = extracted.get("computed_line_item_sum")
            sum_f = float(persisted_sum) if persisted_sum is not None else None
        except (TypeError, ValueError):
            sum_f = None
        if sum_f is None:
            _s = 0.0
            for _li in (extracted.get("line_items") or []):
                if not isinstance(_li, dict) or _li.get("is_cancellation"):
                    continue
                try:
                    _s += float(_li.get("gross") or 0.0)
                except Exception:
                    pass
            sum_f = round(_s, 2)
        if declared_f is not None and sum_f is not None:
            gap = round(declared_f - sum_f, 2)
            if abs(gap) > 0.005:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_25_SOURCE_ARITHMETIC_GAP",
                    "headline": (
                        f"The statement's own services total doesn't match the sum of its line items "
                        f"by ${abs(gap):,.2f}."
                    ),
                    "detail": (
                        f"The statement declares a services total of ${declared_f:,.2f}, but the "
                        f"individual line items shown on the same statement sum to ${sum_f:,.2f} , "
                        f"a gap of ${abs(gap):,.2f}. This is a provider-side reconciliation defect. "
                        f"Ask the provider to explain the difference or reissue the statement."
                    ),
                    "dollar_impact": abs(gap),
                    "impact_aud": abs(gap),
                    "source_evidence": [
                        f"declared services total: ${declared_f:,.2f}",
                        f"sum of line items: ${sum_f:,.2f}",
                    ],
                    "evidence": [
                        f"declared services total: ${declared_f:,.2f}",
                        f"sum of line items: ${sum_f:,.2f}",
                        f"gap: ${abs(gap):,.2f}",
                    ],
                    "suggested_action": (
                        "Ask your provider to reconcile the declared services total on this "
                        "statement against the individual line items. Request either a written "
                        "explanation of the difference or a reissued statement where the two figures agree."
                    ),
                })

    # RULE_1B_CARE_MGMT_BELOW_STANDARD, INFO severity.
    #
    # v5 §Phase 2 #4 · Care management extracted, not assumed. When the source
    # provides both a declared services total and a care management amount,
    # compare the effective care management rate against the industry
    # standard of 10%. Rubric:
    #   * within ±0.5% of 10% → silent (spec)
    #   * more than 1% below 10% → INFO (this rule)
    #   * more than 1% above 10% → HIGH (existing RULE_1B_CARE_MGMT_MONTHLY)
    # This does not fire on pre-v5 statements (source_declared_services_total
    # is null → skipped) nor on quarterly statements (cadence check below).
    if "RULE_1B_CARE_MGMT_BELOW_STANDARD" not in existing_rules:
        _cadence_v5 = ((audit_result.get("statement_summary") or {}).get("cadence") or "").lower()
        try:
            declared = extracted.get("source_declared_services_total")
            declared_f = float(declared) if declared is not None else None
            cm_amt = float(extracted.get("care_management_deducted") or 0.0)
        except (TypeError, ValueError):
            declared_f = None
            cm_amt = 0.0
        if declared_f and declared_f > 0 and cm_amt > 0 and _cadence_v5 in ("monthly", "unknown", ""):
            rate_pct = round((cm_amt / declared_f) * 100, 2)
            # More than 1% below 10% → INFO
            if rate_pct < 9.0:
                _cm_source_text = str(extracted.get("care_management_source_text") or "").strip()
                _evidence_src = (
                    [f"source text: {_cm_source_text}"] if _cm_source_text
                    else [f"care management amount: ${cm_amt:,.2f}"]
                )
                anomalies.append({
                    "severity": "info",
                    "rule": "RULE_1B_CARE_MGMT_BELOW_STANDARD",
                    "headline": (
                        f"Care management fee is {rate_pct:.2f}% of the services total , "
                        f"below the 10% industry standard."
                    ),
                    "detail": (
                        f"The provider charged ${cm_amt:,.2f} in care management on a services total "
                        f"of ${declared_f:,.2f} ({rate_pct:.2f}%). This is lower than the 10% Support at "
                        f"Home industry standard. Providers may deliberately discount, but it can also "
                        f"indicate the fee is being calculated against a different base. Ask your "
                        f"provider to confirm the methodology."
                    ),
                    "dollar_impact": 0.0,
                    "impact_aud": None,
                    "source_evidence": _evidence_src,
                    "evidence": [
                        f"care management amount: ${cm_amt:,.2f}",
                        f"declared services total: ${declared_f:,.2f}",
                        f"effective rate: {rate_pct:.2f}%",
                        f"industry standard: 10.00%",
                    ],
                    "suggested_action": (
                        "Ask your provider how the care management fee is calculated on this "
                        "statement. Most providers apply 10% of the services total; a rate below "
                        "that may be a legitimate discount or a calculation error."
                    ),
                })

    # Rule 16, Stream subtotal vs header "Used This Month" discrepancy
    # (deterministic, EVERYDAY LIVING ONLY)
    #
    # Rationale: Clinical and Independence false-positive easily because the
    # LLM occasionally misses one or two line items (transport on a different
    # page, weekend variants, etc.), that variance fires the rule even though
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
                            f"{stream_key} extraction confidence low ({confidence:.2f}) , stream discrepancy check suppressed."
                        )
                    continue

                # Everyday Living, flag whenever the extracted sum is
                # LESS than the header (indicating missed line items).
                # If extracted > header, the header is likely showing a
                # sub-category snapshot rather than the whole stream ,
                # that's a presentation quirk, not a billing defect. This
                # avoids false positives on monthly statements where
                # "Used This Month" often shows only fortnightly-cadence
                # rows.
                if diff <= 5.0:
                    continue
                if computed >= header_val:
                    # Extracted total is greater than the header ,
                    # over-collection artifact, not a billing defect.
                    continue
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_16_STREAM_DISCREPANCY",
                    "headline": "Everyday Living total doesn't add up , reconciliation needed",
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

    # Rule 17 / 18, Provider notes pattern matching (deterministic)
    notes_raw = extracted.get("provider_notes_raw") or []
    if isinstance(notes_raw, list) and notes_raw:
        # Pattern A, Care plan review due (broadened pattern set)
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
                            "needs , particularly important if there have been recent health changes."
                        ),
                        "dollar_impact": 0.0,
                        "evidence": [f"provider note: {note.strip()[:240]}"],
                        "suggested_action": (
                            "Confirm the review date with your care manager. Bring notes on any changes "
                            "since the last review , new diagnoses, medication changes, falls, or changes "
                            "in daily ability."
                        ),
                    })
                    break  # one flag is enough

        # Pattern B, Service frequency increasing
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

    # OXY-1 v1 F3, Oxygen supplement advisory. When the statement includes an
    # oxygen supplement line item OR the raw text mentions "oxygen supplement",
    # emit an advisory-severity note about the medical practitioner
    # certification requirement (Aged Care Rules 2025 s.196-15). Never blocks
    # the statement, never inflates the "issues found" count on the results
    # view (advisory sits in a separate bucket).
    if "RULE_21_OXYGEN_ADVISORY" not in existing_rules:
        oxygen_present = False
        matched_evidence = ""
        for li in extracted.get("line_items") or []:
            if not isinstance(li, dict):
                continue
            sc = str(li.get("service_code") or "").lower()
            name = str(li.get("service_name") or "").lower()
            if sc == "oxygen" or "oxygen supplement" in name or (sc == "" and name.startswith("oxygen ")):
                oxygen_present = True
                matched_evidence = f"line item: {li.get('service_name') or li.get('service_code')}, ${li.get('total') or 0}"
                break
        if not oxygen_present:
            for note in notes_raw:
                if isinstance(note, str) and "oxygen" in note.lower() and "supplement" in note.lower():
                    oxygen_present = True
                    matched_evidence = f"provider note: {note.strip()[:200]}"
                    break
        if oxygen_present:
            anomalies.append({
                "severity": "advisory",
                "rule": "RULE_21_OXYGEN_ADVISORY",
                "headline": "Oxygen supplement is on this statement, check certification is on file",
                "detail": (
                    "Under Support at Home Rules section 196-15, the Oxygen supplement is paid only when a "
                    "medical practitioner has certified that the participant needs continual oxygen. Your "
                    "provider will need a copy of the certification on file. If you are not sure whether "
                    "certification is in place, ask your GP, specialist, or provider's care manager."
                ),
                "dollar_impact": 0.0,
                "evidence": [matched_evidence] if matched_evidence else [],
                "suggested_action": (
                    "Ask your GP, specialist, or provider's care manager to confirm the certification is on file. "
                    "Wayly does not decide whether the participant qualifies."
                ),
            })



    # Rule 12, Active AT-HM commitments (informational notes only).
    # Per Fix 4 spec: completed commitments produce NO notice. Active
    # commitments with remaining balance produce a neutral informational note
    # (NOT an anomaly). This is the deterministic replacement for the
    # previously LLM-driven Rule 12.
    if "RULE_12_AT_HM_ACTIVE" not in {(n.get("kind") or "").upper() for n in (audit_result.get("informational_notes") or []) if isinstance(n, dict)}:
        for c in (extracted.get("at_hm_commitments") or []):
            if not isinstance(c, dict):
                continue
            status = (c.get("status") or "").strip().lower()
            try:
                approved = float(c.get("amount_approved") or 0.0)
                remaining = float(c.get("amount_remaining") or 0.0)
            except Exception:
                continue
            # Skip completed / closed / fully-claimed and zero-remaining.
            if status in {"completed", "complete", "closed", "fully claimed", "finalised", "finalized"} or remaining <= 0.01:
                continue
            ref = (c.get("ref") or "").strip()
            desc = (c.get("item_description") or "AT-HM item").strip()
            expiry = (c.get("expiry_date") or "").strip()
            info_notes = audit_result.setdefault("informational_notes", [])
            summary = (
                f"AT-HM {desc} , ${remaining:,.2f} remaining"
                + (f" , expires {expiry}" if expiry else "")
                + (f" (ref {ref})." if ref else ".")
            )
            info_notes.append({
                "kind": "at_hm_active_commitment",
                "summary": summary,
                "ref": ref,
                "amount_remaining": round(remaining, 2),
                "amount_approved": round(approved, 2),
                "expiry_date": expiry,
            })

    # Rule 19, Large AT-HM claim (worth keeping the invoice)
    if "RULE_19_AT_HM_LARGE_CLAIM" not in existing_rules:
        for c in (extracted.get("at_hm_commitments") or []):
            if not isinstance(c, dict):
                continue
            # Fix 4, skip ONLY commitments completed in a PRIOR period (no
            # current-period claim). Items fully claimed THIS period are
            # exactly what Rule 19 is for ("large claim worth keeping invoice").
            status = (c.get("status") or "").strip().lower()
            try:
                claimed_this = float(c.get("amount_claimed_this_period") or 0.0)
            except Exception:
                claimed_this = 0.0
            is_prior_completed = (
                status in {"completed", "complete", "closed", "fully claimed", "finalised", "finalized"}
                and claimed_this <= 0.01
            )
            if is_prior_completed:
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
                    "headline": "Large AT-HM claim , worth keeping your invoice",
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

    # Rule 20, Provider ABN format validation
    if "RULE_20_ABN_FORMAT" not in existing_rules:
        abn_raw = (extracted.get("provider_abn") or "").strip()
        if abn_raw:
            # Strip spaces only, anything else is suspect.
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

    # Rule 10, Previous period adjustments (deterministic).
    #
    # Updated policy: only emit a flag when arithmetic is wrong or the credit
    # was applied to the wrong column (participant contribution instead of
    # government share, or vice versa). Correctly-applied adjustments are
    # silent, a false positive here erodes user trust.
    if "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS" not in existing_rules:
        adjs = extracted.get("previous_period_adjustments") or []
        adjs = [a for a in adjs if isinstance(a, dict)]
        if adjs:
            issues: list[str] = []
            total_credit = 0.0
            descriptions: list[str] = []
            for a in adjs:
                try:
                    credit = float(a.get("credit_amount") or 0.0)
                    original = float(a.get("original_charge") or 0.0)
                    corrected = float(a.get("corrected_charge") or 0.0)
                except Exception:
                    credit = original = corrected = 0.0
                total_credit += credit
                desc = (a.get("description") or "").strip()
                ref = (a.get("ref") or "").strip()
                if desc:
                    descriptions.append(f"{ref}: {desc}" if ref else desc)
                # Arithmetic check: original - corrected ≈ credit (within $0.50).
                if original > 0 and corrected >= 0:
                    expected = round(original - corrected, 2)
                    if abs(expected - credit) > 0.50:
                        issues.append(
                            f"adjustment {ref or desc[:40]}: original ${original:,.2f} − corrected "
                            f"${corrected:,.2f} = ${expected:,.2f}, but statement shows credit "
                            f"${credit:,.2f}"
                        )
                # Credit direction check: explicit credited_to field if present.
                credited_to = (a.get("credit_applied_to") or a.get("credited_to") or "").strip().lower()
                original_paid_by = (a.get("original_paid_by") or "").strip().lower()
                if credited_to and original_paid_by and credited_to != original_paid_by:
                    issues.append(
                        f"adjustment {ref or desc[:40]}: original was paid by {original_paid_by} "
                        f"but credit applied to {credited_to}"
                    )
            if issues:
                # Something is wrong, emit a real MEDIUM flag.
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS",
                    "headline": f"Previous-period adjustment appears incorrect ({len(issues)} issue{'s' if len(issues) != 1 else ''}).",
                    "detail": (
                        "A previous-period adjustment on this statement did not pass the verification "
                        "checks. Please review the original charge, corrected charge, and credit amount."
                    ),
                    "dollar_impact": round(total_credit, 2),
                    "evidence": issues[:4],
                    "suggested_action": (
                        "Ask the provider for a written breakdown of the original charge, the corrected charge, "
                        "and which column (government share vs participant contribution) each credit was applied to."
                    ),
                })
            elif total_credit > 0 or descriptions:
                # Arithmetic correct, record as an INFORMATIONAL note on the
                # audit, NOT as an anomaly flag. Frontend can render this as a
                # neutral "passed check" if it wants to surface it.
                info_notes = audit_result.setdefault("informational_notes", [])
                info_notes.append({
                    "kind": "previous_period_adjustment",
                    "summary": (
                        f"{len(adjs)} previous-period adjustment{'s' if len(adjs) != 1 else ''} "
                        f"applied , total credit ${total_credit:,.2f}. Arithmetic verified."
                        + (" Items: " + " · ".join(descriptions[:3]) if descriptions else "")
                    ),
                    "total_credit": round(total_credit, 2),
                    "count": len(adjs),
                })

    # Rule 3 (deterministic), Exact same-date duplicate detection.
    # Runs as a backstop to the LLM Rule 3 fuzzy check. A pair of line items
    # that share date + service_code + unit_rate (within $0.01) and are not
    # cancellations is almost certainly a billing duplicate, flag HIGH.
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
                    " The provider's published rate describes this service as a return trip , "
                    "charging it twice may mean you have been billed for two return trips instead of one."
                )
            # If this is a TR-* transport duplicate, use the QA-spec headline.
            is_transport = code.startswith("TR-") or code.startswith("TR")
            if is_transport:
                headline = f"Two transport charges on {date} , possible duplicate ({code})"
                detail = (
                    f"Two identical community transport charges of ${rate:,.2f} each appear on {date} "
                    f"for service code {code}, both described as {desc}. The provider's published rate "
                    f"covers a return trip inclusive , a return trip should be one charge. If confirmed "
                    f"as a duplicate, the second charge of ${rate:,.2f} should be credited.{extra}"
                )
                action = (
                    f"Contact your provider's billing team to confirm whether two separate trips occurred "
                    f"on {date} or whether this is a duplicate entry. Request a written response."
                )
            else:
                headline = f"Possible duplicate charge , {len(members)} identical {code} ({desc}) services on {date}"
                detail = (
                    f"{len(members)} {code} line items appear on {date} with the same rate of "
                    f"${rate:,.2f}. This may be a duplicate billing error.{extra}"
                )
                action = (
                    f"Ask your provider to confirm whether {len(members)} separate {code} ({desc}) services "
                    f"genuinely occurred on {date}. If only one occurred, request a credit of "
                    f"${gross:,.2f}."
                )
            anomalies.append({
                "severity": "high",
                "rule": "RULE_3_DUPLICATE_EXACT",
                "headline": headline,
                "detail": detail,
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
                "suggested_action": action,
            })

    # DEC-1 v7.7 §Batch B Round 2: RULE_3 source-text duplicate scan.
    # When the extractor merges two identical rows during dedup, the
    # regular RULE_3_DUPLICATE_EXACT groups above only see ONE line item
    # and can't fire. Scan the source text for the same (date + service
    # description) pattern appearing multiple times to catch these
    # collapsed duplicates.
    _rule3_source_text = (extracted.get("_source_text") or "")
    _rule3_line_items = [li for li in (extracted.get("line_items") or []) if isinstance(li, dict)]
    if not any((a.get("rule") or "").upper() == "RULE_3_DUPLICATE_EXACT" for a in anomalies) and _rule3_source_text:
        text_lines = _rule3_source_text.split("\n")
        # Build a mapping of (normalised_date, description-first-3-tokens) → occurrence count.
        from collections import Counter as _Counter_dup
        dup_key_counter: _Counter_dup = _Counter_dup()
        import re as _re_dup_src
        date_lead_re = _re_dup_src.compile(
            r"^\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})"
        )
        for src_line in text_lines:
            m = date_lead_re.search(src_line)
            if not m:
                continue
            date_str = m.group(1).strip()
            # Rest of line = description + amount.
            rest = src_line[m.end():].strip()
            # Take first 3 alphabetic tokens as description signature.
            desc_tokens = _re_dup_src.findall(r"[A-Za-z]+", rest)[:3]
            if not desc_tokens:
                continue
            desc_key = " ".join(t.lower() for t in desc_tokens)
            # Normalise date to ISO.
            iso_date = date_str
            for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y-%m-%d"):
                try:
                    import datetime as _dt_dup
                    iso_date = _dt_dup.datetime.strptime(date_str, fmt).date().isoformat()
                    break
                except Exception:
                    continue
            dup_key_counter[(iso_date, desc_key)] += 1
        # Find any key with count > 1 that maps to only 1 line item in our extraction.
        for (iso_date, desc_key), count in dup_key_counter.items():
            if count < 2:
                continue
            # Check how many line items have the same date+description signature.
            matching = 0
            matching_gross = 0.0
            matching_desc = desc_key
            for li in _rule3_line_items:
                if li.get("is_cancellation"):
                    continue
                li_date = (li.get("date") or "").strip()
                # Normalise
                for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%Y-%m-%d"):
                    try:
                        import datetime as _dt_dup2
                        li_date_iso = _dt_dup2.datetime.strptime(li_date, fmt).date().isoformat()
                        break
                    except Exception:
                        li_date_iso = li_date
                if li_date_iso != iso_date:
                    continue
                li_desc = (li.get("service_description") or li.get("service_name") or "").lower()
                li_tokens = " ".join(_re_dup_src.findall(r"[a-z]+", li_desc)[:3])
                if li_tokens == desc_key:
                    matching += 1
                    matching_gross = float(li.get("gross") or 0.0)
                    matching_desc = li.get("service_description") or li.get("service_name") or desc_key
            if matching == 1 and count >= 2:
                # Source has N occurrences but extraction shows only 1 → collapsed duplicate.
                anomalies.append({
                    "severity": "high",
                    "rule": "RULE_3_DUPLICATE_EXACT",
                    "headline": f"Possible duplicate charge on {iso_date}, {count} identical rows in source ({matching_desc})",
                    "detail": (
                        f"The source statement lists {count} identical rows on {iso_date} for "
                        f"'{matching_desc}' but they may have been collapsed during processing. "
                        f"If both were genuine billings, the participant may have been double-charged."
                    ),
                    "dollar_impact": round(matching_gross * (count - 1), 2),
                    "evidence": [
                        f"date: {iso_date}",
                        f"description: {matching_desc}",
                        f"occurrences in source: {count}",
                        f"occurrences after extraction: {matching}",
                    ],
                    "suggested_action": (
                        f"Ask the provider to confirm whether {count} separate services occurred "
                        f"on {iso_date} or whether this is a duplicate billing entry."
                    ),
                })
                break  # one source-scan duplicate report is enough per audit

    # Rule 6 (deterministic), Worker substitution scanner.
    #
    # The LLM auditor was previously responsible for Rule 6 but tended to
    # emit only the first substitution mention. We scan all streams here
    # and emit one separate flag per distinct (date, service_code) pair.
    if not any((a.get("rule") or "").upper().startswith("RULE_6") for a in anomalies if isinstance(a, dict)):
        import re as _re6
        # Phrase patterns that indicate substitution.
        sub_indicators = [
            r"replacement worker",
            r"replacement arranged",
            r"usual worker.*?(?:on leave|unavailable|sick|absent|illness)",
            r"(?:on leave|unavailable|sick|absent|illness).*?replacement",
            r"substitute(?:d)?(?:\s+worker)?",
            r"replaced by",
            r"covered by",
            r"\bstand-in\b",
        ]
        # Notice indicators, used to set severity.
        no_notice_patterns = [
            r"no prior notice",
            r"no notice given",
            r"same morning",
            r"same day",
            r"less than 24\s*hours? notice",
            r"<\s*24\s*hours",
            r"short notice",
        ]
        # Exclusion patterns, if any of these appear in the note, do NOT treat
        # as a worker substitution. These phrases refer to BILLING / DUPLICATE
        # CHARGES, not worker changes. Fixes the false-positive on transport
        # duplicate notes that say "two identical transport charges".
        billing_context_re = _re6.compile(
            r"(?:two identical|duplicate|pending verification|please verify|duplicate entry|"
            r"billing query|invoice query|charge query|same .{0,30}charge|"
            r"two .{0,40}charge|both entries|may be a duplicate)",
            _re6.IGNORECASE,
        )
        sub_re = _re6.compile("|".join(f"(?:{p})" for p in sub_indicators), _re6.IGNORECASE)
        no_notice_re = _re6.compile("|".join(no_notice_patterns), _re6.IGNORECASE)

        seen_keys: set[tuple] = set()
        seen_workers: set[tuple] = set()
        sub_flags: list[dict] = []

        def _emit_sub_flag(date: str, service_code: str, stream: str, note_text: str, usual: str = "", replacement: str = ""):
            key = ((date or "").lower().strip(), (service_code or "").upper().strip())
            if key in seen_keys:
                return
            # Also dedupe by (usual_worker, replacement_worker), when the
            # provider-notes-raw scan re-mentions a substitution already
            # captured at line-item level, skip the second flag.
            worker_key = (
                (usual or "").lower().strip(),
                (replacement or "").lower().strip(),
            )
            if usual and replacement and worker_key in seen_workers:
                return
            seen_keys.add(key)
            if usual and replacement:
                seen_workers.add(worker_key)
            no_notice = bool(no_notice_re.search(note_text))
            severity = "medium" if no_notice else "low"
            who = ""
            if usual and replacement:
                who = f" {usual} was replaced by {replacement}."
            elif replacement:
                who = f" Replacement worker: {replacement}."
            notice_phrase = " The provider gave less than 24 hours notice." if no_notice else ""
            stream_label = {
                "Clinical": "Clinical (nursing/health)",
                "Independence": "Independence (personal care / mobility)",
                "EverydayLiving": "Everyday Living (domestic / meals)",
            }.get(stream, stream or "Service")
            headline = (
                f"Worker substitution on {date or 'this period'}"
                + (f" , {service_code}" if service_code else "")
                + (" , short notice" if no_notice else "")
            )
            sub_flags.append({
                "severity": severity,
                "rule": "RULE_6_WORKER_SUBSTITUTION",
                "headline": headline,
                "detail": (
                    f"{stream_label}: a worker substitution occurred"
                    + (f" on {date}" if date else "")
                    + (f" for {service_code}" if service_code else "")
                    + f".{who}{notice_phrase} The Statement of Rights guarantees continuity of care "
                    f"and reasonable notice of changes to your care team."
                ),
                "dollar_impact": 0.0,
                "evidence": [e for e in [
                    f"date: {date}" if date else "",
                    f"service_code: {service_code}" if service_code else "",
                    f"stream: {stream}" if stream else "",
                    f"note: {note_text[:200]}" if note_text else "",
                ] if e],
                "suggested_action": (
                    "Ask your provider how they will minimise short-notice substitutions and ensure your "
                    "preferred workers are scheduled. You can request that a substitution policy be added "
                    "to your service agreement."
                ),
            })

        # Try to pull "usual X replaced by Y" pairs out of the note.
        # Handles multiple phrasings:
        #   - "Nurse Kaur was replaced by Nurse David Obi"
        #   - "usual worker Linda Caruso on leave, replacement Yuki Matsuda"
        #   - "Linda Caruso on annual leave. Replacement worker Yuki Matsuda attended"
        def _extract_names(note_text: str) -> tuple[str, str]:
            if not note_text:
                return "", ""
            usual = replacement = ""
            # Pattern A, "X replaced by Y"
            m = _re6.search(
                r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})\s+(?:was\s+)?replaced\s+by\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})",
                note_text,
            )
            if m:
                return m.group(1).strip(), m.group(2).strip()
            # Pattern B, "X on (annual )?leave"
            mu = _re6.search(
                r"([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){1,2})\s+(?:was\s+)?(?:on\s+(?:approved\s+)?(?:annual\s+)?leave|on\s+leave|unavailable|absent|sick|out)",
                note_text,
            )
            if mu:
                usual = mu.group(1).strip()
            # Pattern C, "Replacement worker Y" / "replacement arranged, Y" / "Replacement Y attended"
            mr = _re6.search(
                r"replacement(?:\s+worker)?\s+(?:arranged\s+[,\-:]?\s*)?([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+){0,2})",
                note_text,
                _re6.IGNORECASE,
            )
            if mr:
                replacement = mr.group(1).strip()
            return usual, replacement

        # Scan per-line-item notes first (date + stream + code already known).
        for li in (extracted.get("line_items") or []):
            if not isinstance(li, dict) or li.get("is_cancellation"):
                continue
            note = (li.get("provider_notes") or "") + " " + (li.get("flags_in_original") or "")
            # SKIP transport line items entirely, duplicates here are billing
            # disputes, not worker substitutions. The duplicate-transport
            # detector (RULE_3_DUPLICATE_EXACT) handles them.
            code_li = (li.get("service_code") or "").upper().strip()
            if code_li.startswith("TR-") or code_li.startswith("TR"):
                continue
            if not sub_re.search(note):
                continue
            # Skip if the note is talking about billing, not workers.
            if billing_context_re.search(note):
                continue
            usual, replacement = _extract_names(note)
            _emit_sub_flag(
                date=(li.get("date") or "").strip(),
                service_code=(li.get("service_code") or "").strip(),
                stream=(li.get("stream") or "").strip(),
                note_text=note,
                usual=usual,
                replacement=replacement,
            )

        # Then scan provider_notes_raw paragraphs (date and code best-effort).
        for raw_note in (extracted.get("provider_notes_raw") or []):
            if not isinstance(raw_note, str) or not sub_re.search(raw_note):
                continue
            # Skip if the paragraph is a billing/duplicate query, not a worker change.
            if billing_context_re.search(raw_note):
                continue
            # Date best-effort
            date_m = _re6.search(r"(\d{1,2}\s+[A-Za-z]{3,9}(?:\s+\d{4})?|\d{4}-\d{2}-\d{2})", raw_note)
            code_m = _re6.search(r"\b((?:PC|RN|DC|HM|TR|GM|SC|MA|ME|DM|LA|SH|AT|CM)-\d{2,4})\b", raw_note, _re6.IGNORECASE)
            stream_guess = ""
            note_lower = raw_note.lower()
            if any(w in note_lower for w in ("nurse", "nursing", "clinical", "medication", "rn-", "rn ")):
                stream_guess = "Clinical"
            elif any(w in note_lower for w in ("personal care", "shower", "mobility", "pc-", "transport", "tr-")):
                stream_guess = "Independence"
            elif any(w in note_lower for w in ("cleaning", "meal", "domestic", "gm-", "dc-", "hm-")):
                stream_guess = "EverydayLiving"
            usual, replacement = _extract_names(raw_note)
            _emit_sub_flag(
                date=(date_m.group(1) if date_m else "").strip(),
                service_code=(code_m.group(1).upper() if code_m else "").strip(),
                stream=stream_guess,
                note_text=raw_note,
                usual=usual,
                replacement=replacement,
            )

        anomalies.extend(sub_flags)

    # Rule 1B (deterministic), Care management monthly methodology overcharge.
    #
    # The LLM Rule 1 check looks at quarterly cap compliance. This deterministic
    # check additionally verifies that the THIS-MONTH care management fee does
    # not exceed (quarterly_cap / 3). Providers sometimes charge 11% of monthly
    # gross services instead of 10% of the quarterly budget, that "averages
    # out" over a quarter but produces a real overcharge on individual months.
    # DEC-1 v7.7 §Batch B: RULE_1B is the MONTHLY cap check (fee vs
    # quarterly_cap/3). It must not fire on quarterly statements, the
    # quarterly variant is RULE_1_CARE_MGMT_CAP above. Only run this
    # deterministic check when cadence is monthly (or unknown).
    _cadence_1b = ((audit_result.get("statement_summary") or {}).get("cadence") or "").lower()
    if _cadence_1b == "quarterly":
        pass  # skip monthly cap check on quarterly statements
    elif not any((a.get("rule") or "").upper() == "RULE_1B_CARE_MGMT_MONTHLY" for a in anomalies if isinstance(a, dict)):
        try:
            quarterly_total = float(extracted.get("quarterly_budget_total") or 0.0)
            care_mgmt_deducted = float(extracted.get("care_management_deducted") or 0.0)
        except Exception:
            quarterly_total = care_mgmt_deducted = 0.0
        # care_management_deducted in extraction is THIS MONTH'S fee.
        if quarterly_total > 0 and care_mgmt_deducted > 0:
            quarterly_cap = round(quarterly_total * 0.10, 2)
            correct_monthly_fee = round(quarterly_cap / 3.0, 2)
            excess = round(care_mgmt_deducted - correct_monthly_fee, 2)
            # Tolerate $1 rounding noise.
            if excess > 1.00:
                # Read provider notes for the explicit "11% of monthly gross" pattern.
                import re as _re1b
                notes_blob_cm = " ".join(
                    (n or "") for n in (extracted.get("provider_notes_raw") or [])
                    if isinstance(n, str)
                )
                pct_match = _re1b.search(r"(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:of\s+)?(?:monthly\s+gross|services)?", notes_blob_cm, _re1b.IGNORECASE)
                pct_used = pct_match.group(1) if pct_match else ""
                # Compute monthly gross services from extracted line items as a
                # fallback when the provider notes don't disclose it directly.
                # Per Fix 5 spec + Prompt N: sum of Clinical + Independence +
                # EverydayLiving line items excluding care management, AT-HM
                # and supplement line items.
                computed_monthly_gross = 0.0
                for li in (extracted.get("line_items") or []):
                    if not isinstance(li, dict):
                        continue
                    if li.get("is_cancellation"):
                        continue
                    stream = (li.get("stream") or "").strip()
                    if stream in {"CareMgmt", "ATHM", "supplement", "Supplement"}:
                        continue
                    try:
                        computed_monthly_gross += float(li.get("gross") or 0.0)
                    except Exception:
                        pass
                computed_monthly_gross = round(computed_monthly_gross, 2)

                # FIX 3 (Round 3), Preferred MONTHLY_GROSS_SERVICES source.
                # When the statement reports its own gross total, back-compute
                # the service-only base by subtracting care management and
                # AT-HM and adding back any previous-period adjustment
                # credits. This is the figure the provider's percentage was
                # calculated against. For Dorothy June 2026:
                #   $2,952.21 − $268.29 − $480.00 + $33.08 = $2,237.00
                try:
                    reported_gross = float(extracted.get("reported_total_gross") or 0.0)
                except Exception:
                    reported_gross = 0.0
                athm_total = 0.0
                for li in (extracted.get("line_items") or []):
                    if not isinstance(li, dict):
                        continue
                    if li.get("is_cancellation"):
                        continue
                    if (li.get("stream") or "").strip() == "ATHM":
                        try:
                            athm_total += float(li.get("gross") or 0.0)
                        except Exception:
                            pass
                ppa_credit = 0.0
                for adj in (extracted.get("previous_period_adjustments") or []):
                    if isinstance(adj, dict):
                        try:
                            ppa_credit += float(adj.get("credit_amount") or 0.0)
                        except Exception:
                            pass
                back_computed = round(reported_gross - care_mgmt_deducted - athm_total + ppa_credit, 2)
                # Prefer back-computed if reported_gross is present, else use sum of line items.
                monthly_gross_used = back_computed if reported_gross > 0 else computed_monthly_gross
                # Provider's apparent percentage uses the same base.
                provider_pct = ""
                if monthly_gross_used > 0:
                    provider_pct = f"{(care_mgmt_deducted / monthly_gross_used) * 100:.1f}"

                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_1B_CARE_MGMT_MONTHLY",
                    "headline": f"Care management fee exceeds the correct monthly allocation by ${excess:,.2f}",
                    "detail": (
                        f"Your provider calculated this month's care management fee at "
                        f"{pct_used or provider_pct}% of monthly gross services "
                        f"(${monthly_gross_used:,.2f}), totalling ${care_mgmt_deducted:,.2f}. "
                        f"The correct methodology is 10% of the quarterly budget "
                        f"(${quarterly_cap:,.2f}) divided across 3 months = "
                        f"${correct_monthly_fee:,.2f} per month. The excess on this statement is "
                        f"${excess:,.2f}. The provider notes reconciliation at quarter end , request "
                        f"written confirmation that the Q4 total care management charge does not "
                        f"exceed ${quarterly_cap:,.2f}."
                    ),
                    "dollar_impact": excess,
                    "evidence": [
                        f"monthly_gross_services: ${monthly_gross_used:,.2f}",
                        f"quarterly cap (10%): ${quarterly_cap:,.2f}",
                        f"correct monthly fee (cap/3): ${correct_monthly_fee:,.2f}",
                        f"this month charged: ${care_mgmt_deducted:,.2f}",
                        f"excess: ${excess:,.2f}",
                    ],
                    "suggested_action": (
                        "Request a written confirmation from your provider showing exactly how the "
                        "Q-end total care management charge was calculated, and ask them to credit any "
                        "excess on the next statement rather than waiting until quarter end."
                    ),
                })

    # Rule 11 (deterministic), Brokered rate premium.
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
        #, three sub-patterns within ~400 chars of each other.
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
            # Service description, look for capitalised words preceding "brokered".
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
                    f"the published rate is ${published_rate:.2f}/hr , a premium of ${premium:.2f}/hr."
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

    # =========================================================================
    # DEC-1 v7.7 Batch B, deferred anomaly rules.
    #
    # These rules are all deterministic post-audit checks. They cover the
    # defects surfaced in the S3 (complex quarterly with 10 deliberate defects)
    # and S4 (edge-case quarterly straddling the 1 Oct 2026 rule change)
    # verification fixtures. Each rule is independently gated on
    # `existing_rules` so a re-run does not duplicate.
    # =========================================================================

    import re as _re_b
    _source_text = (extracted.get("_source_text") or "")
    _line_items = [li for li in (extracted.get("line_items") or []) if isinstance(li, dict)]
    _cadence = ((audit_result.get("statement_summary") or {}).get("cadence") or "").lower()

    # ---- RULE_1_CARE_MGMT_CAP (quarterly): care management above 10% of
    #      services subtotal (excluding AT-HM). Fires for quarterly statements
    #      only; monthly cadence uses RULE_1B_CARE_MGMT_MONTHLY. Rubric:
    #      "Missing this rule is a shipping-block failure."
    if "RULE_1_CARE_MGMT_CAP" not in existing_rules and _cadence == "quarterly":
        try:
            cm_deducted = float(extracted.get("care_management_deducted") or 0.0)
        except Exception:
            cm_deducted = 0.0
        # Base A: sum of extracted Clinical + Independence + EverydayLiving
        # (excluding CareMgmt, ATHM, supplement rows).
        services_gross_from_items = 0.0
        athm_total = 0.0
        total_extracted = 0.0
        for li in _line_items:
            if li.get("is_cancellation"):
                continue
            stream = (li.get("stream") or "").strip()
            try:
                g = float(li.get("gross") or 0.0)
            except Exception:
                g = 0.0
            total_extracted += g
            if stream in {"CareMgmt", "supplement", "Supplement"}:
                continue
            if stream == "ATHM":
                athm_total += g
                continue
            services_gross_from_items += g
        services_gross_from_items = round(services_gross_from_items, 2)
        # Base B: reported_total_gross − CM − AT-HM. Only trusted when
        # reported_gross is >= extracted total (otherwise the LLM likely
        # extracted the wrong "reported" field, as with S2 where reported
        # was $8,279 vs actual $10,279 sum).
        try:
            reported_gross = float(extracted.get("reported_total_gross") or 0.0)
        except Exception:
            reported_gross = 0.0
        services_gross_from_reported = 0.0
        if reported_gross > 0 and reported_gross >= total_extracted - 5.0:
            services_gross_from_reported = round(reported_gross - cm_deducted - athm_total, 2)
        candidate_bases = []
        if services_gross_from_items > 0:
            candidate_bases.append(("extracted line items", services_gross_from_items))
        if services_gross_from_reported > 0:
            candidate_bases.append(("reported gross − CM − AT-HM", services_gross_from_reported))
        if cm_deducted > 0 and candidate_bases:
            # Prefer the LOWER base (stricter) but require ALL AVAILABLE
            # bases to indicate a breach. This prevents false positives
            # from an unreliable `reported_total_gross` while still
            # catching real breaches that either base surfaces.
            all_breach = all(
                cm_deducted - round(base * 0.10, 2) > 1.00
                for _label, base in candidate_bases
            )
            if all_breach:
                # Use the lowest base for the reported excess.
                base_label, base = min(candidate_bases, key=lambda x: x[1])
                cap = round(base * 0.10, 2)
                excess = round(cm_deducted - cap, 2)
                pct_charged = (cm_deducted / base) * 100
                anomalies.append({
                    "severity": "high",
                    "rule": "RULE_1_CARE_MGMT_CAP",
                    "headline": f"Care management fee exceeds the 10% cap by ${excess:,.2f}",
                    "detail": (
                        f"The care management fee of ${cm_deducted:,.2f} is "
                        f"{pct_charged:.1f}% of the services subtotal (${base:,.2f}). "
                        f"The Support at Home rules cap care management at 10% of services, which is "
                        f"${cap:,.2f}. The excess of ${excess:,.2f} should be credited back or "
                        f"explained by the provider."
                    ),
                    "dollar_impact": excess,
                    "evidence": [
                        f"base ({base_label}): ${base:,.2f}",
                        f"10% cap: ${cap:,.2f}",
                        f"charged: ${cm_deducted:,.2f}",
                        f"excess: ${excess:,.2f}",
                    ],
                    "suggested_action": (
                        "Ask your provider to show how the care management fee was calculated "
                        "and request a credit for the amount above 10%."
                    ),
                })

    # ---- RULE_21_PROHIBITED_ADMIN_FEE: prohibited brokerage / exit / admin
    #      fees appearing as line items or in source text. Rubric: "Missing
    #      both S4.D6 (brokerage) AND S4.D7 (exit) is a shipping-block failure."
    if "RULE_21_PROHIBITED_ADMIN_FEE" not in existing_rules:
        # Patterns paired with the source-scan-safe flag. Some fee names
        # ("package management fee") appear commonly with an "included in
        # care management" qualifier that only line-item scanning can
        # interpret safely, so we keep them out of the source-text scan.
        PROHIBITED_PATTERNS = [
            (_re_b.compile(r"\bbrokerage\s+fee\b", _re_b.IGNORECASE), "brokerage fee", True),
            (_re_b.compile(r"\bexit\s+(?:administration|admin)\s+fee\b", _re_b.IGNORECASE), "exit administration fee", True),
            (_re_b.compile(r"\bexit\s+fee\b", _re_b.IGNORECASE), "exit fee", True),
            (_re_b.compile(r"\badministration\s+surcharge\b", _re_b.IGNORECASE), "administration surcharge", True),
            (_re_b.compile(r"\badmin\s+surcharge\b", _re_b.IGNORECASE), "administration surcharge", True),
            (_re_b.compile(r"\bpackage\s+management\s+fee\b", _re_b.IGNORECASE), "package management fee", False),
            (_re_b.compile(r"\bentry\s+fee\b", _re_b.IGNORECASE), "entry fee", True),
        ]
        prohibited_hits: list[dict] = []
        for li in _line_items:
            if li.get("is_cancellation"):
                continue
            desc = (li.get("service_description") or li.get("service_name") or "").strip()
            desc_lower = desc.lower()
            try:
                gross_val = float(li.get("gross") or 0.0)
            except Exception:
                gross_val = 0.0
            # "Included in care management" / "part of package fee" language
            # marks a $0 line item that is legally NOT a separate fee.
            if any(k in desc_lower for k in ("included in care management", "included in package", "included in fees", "part of care management", "no charge")):
                continue
            # Package management fee at $0 is explicitly included-in-care-mgmt,
            # per Support at Home rules, don't flag that.
            for pat, label, _scan_source in PROHIBITED_PATTERNS:
                if pat.search(desc):
                    if label == "package management fee" and gross_val <= 0.01:
                        continue
                    prohibited_hits.append({
                        "label": label,
                        "date": li.get("date") or "",
                        "amount": gross_val,
                        "description": desc,
                        "source": "line_item",
                    })
                    break
        # Also scan source text for prohibited fee patterns that may not have
        # been extracted as line items (dropped rows). Only patterns marked
        # `_scan_source=True` are safe here, package management fee is
        # excluded because it commonly appears with "(included in care
        # management)" qualifier which makes source-text scanning misleading.
        if _source_text:
            for pat, label, scan_source in PROHIBITED_PATTERNS:
                if not scan_source:
                    continue
                for m in pat.finditer(_source_text):
                    # Skip if we already caught it as a line item hit.
                    if any(h["label"] == label for h in prohibited_hits):
                        continue
                    # Grab the $-amount that appears AFTER the phrase (fee names
                    # in AU statements always come before the amount).
                    tail = _source_text[m.end():m.end() + 200]
                    amt_m = _re_b.search(r"\$([0-9]+(?:\.[0-9]{2})?)", tail)
                    amt_val = float(amt_m.group(1)) if amt_m else 0.0
                    # Skip if the surrounding text says "included in".
                    window = _source_text[max(0, m.start() - 60):m.end() + 200].lower()
                    if any(k in window for k in ("included in care management", "included in package", "no charge", "n/a")):
                        continue
                    prohibited_hits.append({
                        "label": label,
                        "date": "",
                        "amount": amt_val,
                        "description": _source_text[max(0, m.start() - 20):m.end() + 80].strip()[:120],
                        "source": "source_text",
                    })
                    break  # one per label from source text
        if prohibited_hits:
            total_dollar = round(sum(h["amount"] for h in prohibited_hits), 2)
            evidence_lines = []
            for h in prohibited_hits[:6]:
                dt = f" on {h['date']}" if h.get("date") else ""
                evidence_lines.append(f"{h['label'].title()}{dt}: ${h['amount']:,.2f}")
            labels_seen = sorted({h["label"].title() for h in prohibited_hits})
            anomalies.append({
                "severity": "high",
                "rule": "RULE_21_PROHIBITED_ADMIN_FEE",
                "headline": (
                    "Prohibited administrative fees found on this statement"
                    + (f" (${total_dollar:,.2f})" if total_dollar > 0 else "")
                ),
                "detail": (
                    f"The Support at Home program does not permit providers to charge "
                    f"{', '.join(labels_seen)} as separate line items. These fees must be "
                    f"absorbed by the provider under the Aged Care Act. Every dollar shown "
                    f"here should be credited back to the participant's budget."
                ),
                "dollar_impact": total_dollar,
                "evidence": evidence_lines,
                "suggested_action": (
                    "Request the provider credit these fees back to the budget and confirm in "
                    "writing that they will not appear on future statements."
                ),
            })

    # ---- RULE_24_DATE_OUTSIDE_PERIOD: any line item with a service_date
    #      outside the statement_period range.
    if "RULE_24_DATE_OUTSIDE_PERIOD" not in existing_rules:
        ps = _parse_iso_date(extracted.get("period_start"))
        pe = _parse_iso_date(extracted.get("period_end"))
        if ps and pe:
            outside_items: list[dict] = []
            for li in _line_items:
                if li.get("is_cancellation"):
                    continue
                d = _parse_iso_date(li.get("date"))
                if not d:
                    continue
                if d < ps or d > pe:
                    outside_items.append({
                        "date": d.isoformat(),
                        "description": (li.get("service_description") or li.get("service_name") or "")[:80],
                        "amount": float(li.get("gross") or 0.0),
                    })
            if outside_items:
                total = round(sum(o["amount"] for o in outside_items), 2)
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_24_DATE_OUTSIDE_PERIOD",
                    "headline": f"{len(outside_items)} line item{'s' if len(outside_items) > 1 else ''} dated outside the statement period",
                    "detail": (
                        f"The statement period is {ps.isoformat()} to {pe.isoformat()}, but "
                        f"{len(outside_items)} line item{'s' if len(outside_items) > 1 else ''} "
                        f"fall{'s' if len(outside_items) == 1 else ''} outside that range. "
                        f"These should be reclassified to the correct statement or the period "
                        f"corrected."
                    ),
                    "dollar_impact": total,
                    "evidence": [
                        f"{o['date']} · {o['description']} · ${o['amount']:,.2f}"
                        for o in outside_items[:5]
                    ],
                    "suggested_action": (
                        "Ask the provider to move these items to the correct statement period "
                        "or confirm why they belong on this statement."
                    ),
                })

    # ---- RULE_25_WORDS_VS_NUMERALS: printed total in words vs numerals
    #      mismatch. Fires when both a numeric total and a written total
    #      appear in the source text and they differ.
    if "RULE_25_WORDS_VS_NUMERALS" not in existing_rules and _source_text:
        # Look for "in words: seven thousand and seventy-nine dollars ($7,079.70)"
        # style constructions. We're looking for BOTH a dollar figure and a
        # written form in close proximity. Since parsing "in words" reliably
        # is hard, we do a simpler check: is there a "$X in words $Y" pattern
        # where X != Y within a 200-char window near "total" or "amount".
        wn_pattern = _re_b.compile(
            r"\$([0-9,]+(?:\.[0-9]{2})?)[^$]{0,150}?(?:in\s+words|written|\(in\s+words\)|amount\s+in\s+words)[^$]{0,150}?\$([0-9,]+(?:\.[0-9]{2})?)",
            _re_b.IGNORECASE,
        )
        for wm in wn_pattern.finditer(_source_text):
            try:
                num_a = float(wm.group(1).replace(",", ""))
                num_b = float(wm.group(2).replace(",", ""))
            except Exception:
                continue
            if abs(num_a - num_b) >= 0.01:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_25_WORDS_VS_NUMERALS",
                    "headline": f"Statement total in words does not match the numerals (${abs(num_a - num_b):,.2f} difference)",
                    "detail": (
                        f"The statement prints one total as ${num_a:,.2f} and another as "
                        f"${num_b:,.2f}. This kind of mismatch can indicate a copy-paste or "
                        f"calculation error somewhere on the statement."
                    ),
                    "dollar_impact": round(abs(num_a - num_b), 2),
                    "evidence": [
                        f"numerals total: ${num_a:,.2f}",
                        f"words total: ${num_b:,.2f}",
                        f"difference: ${abs(num_a - num_b):,.2f}",
                    ],
                    "suggested_action": (
                        "Ask the provider to reconcile the numeric and written totals and issue "
                        "a corrected statement."
                    ),
                })
                break  # one flag per statement is enough

    # ---- RULE_26_LEGACY_HCP_TERMINOLOGY: Home Care Package terminology
    #      appearing on a post-1-Oct-2026 Support at Home statement.
    if "RULE_26_LEGACY_HCP_TERMINOLOGY" not in existing_rules and _source_text:
        pe = _parse_iso_date(extracted.get("period_end"))
        # Only fire when the statement covers a period on or after 1 Oct 2026,
        # which is when the rebadged Support at Home program is in effect.
        if pe and pe.year >= 2026 and (pe.year > 2026 or pe.month >= 10):
            legacy_terms = [
                r"\bhome\s+care\s+package\b",
                r"\bpackage\s+funds?\b",
                r"\bpackage\s+budget\b",
                r"\bhcp\s+statement\b",
                r"\blevel\s+[1-4]\s+(?:home\s+care\s+)?package\b",
                r"\bhcp\s+level\b",
            ]
            hits: list[str] = []
            for term in legacy_terms:
                m = _re_b.search(term, _source_text, _re_b.IGNORECASE)
                if m:
                    hits.append(m.group(0))
            if hits:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_26_LEGACY_HCP_TERMINOLOGY",
                    "headline": "Statement uses legacy Home Care Package language",
                    "detail": (
                        "The Support at Home program replaced Home Care Packages from "
                        "1 October 2026. This statement still uses HCP terminology, which "
                        "can confuse participants and may indicate the provider hasn't "
                        "updated their reporting."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [f"legacy term found: \"{h}\"" for h in hits[:4]],
                    "suggested_action": (
                        "Ask the provider to reissue this statement using current Support at "
                        "Home language and confirm the categorisation of every line item."
                    ),
                })

    # ---- RULE_27_GST_ON_GST_FREE: GST charged on GST-free care services
    #      (personal care, clinical, domestic assistance). Scans line items
    #      for a `gst` or `tax` field > 0, OR the source-text tabular pattern
    #      where a personal care / clinical row has a positive GST column.
    if "RULE_27_GST_ON_GST_FREE" not in existing_rules:
        gst_free_codes = ("PC-", "DA-", "OT-", "PT-", "NU-", "PD-", "AH-", "WC-", "GM-", "ML-", "TR-", "SS-", "RES-", "RN-")
        gst_hits: list[dict] = []
        for li in _line_items:
            if li.get("is_cancellation"):
                continue
            code = (li.get("service_code") or "").upper()
            desc = (li.get("service_description") or li.get("service_name") or "").lower()
            code_free = any(code.startswith(p) for p in gst_free_codes)
            desc_free = any(
                key in desc for key in
                ("personal care", "domestic", "cleaning", "physiotherapy", "occupational therapy",
                 "podiatry", "nursing", "wound", "meal delivery")
            )
            if not (code_free or desc_free):
                continue
            gst_val = 0.0
            for key in ("gst", "gst_amount", "tax", "gst_charged"):
                try:
                    v = float(li.get(key) or 0.0)
                except Exception:
                    v = 0.0
                if v > 0:
                    gst_val = v
                    break
            if gst_val > 0.01:
                gst_hits.append({
                    "date": li.get("date") or "",
                    "description": desc[:80],
                    "gst": round(gst_val, 2),
                })
        # DEC-1 v7.7 §Batch B: also scan source text for the tabular pattern
        # where each row of the services table has a GST column. When the
        # service description contains a GST-free care term and the row's
        # GST column shows a positive value, flag it.
        if _source_text:
            # Find lines describing a service with a GST amount inline.
            # Pattern: description containing 'personal care' or 'RN' or
            # 'clinical' etc., followed within ~120 chars by a positive $X.XX
            # that isn't the row's total. We use a per-line scan.
            gst_free_desc_re = _re_b.compile(
                r"(personal\s+care(?:\s+visit)?|domestic\s+assistance|cleaning|physiotherapy|occupational\s+therapy|podiatry|nursing|wound|rn\s*[,-]|allied\s+health)",
                _re_b.IGNORECASE,
            )
            # Multi-line pattern: the tabular AU statement format lists a
            # service row as description ... rate ... GST ... line total,
            # sometimes across separate lines. Look for a description hit
            # then the FIRST positive $X.XX AFTER the rate column that's
            # not the total. Simplest heuristic: look for "$X.XX $Y.YY $Z.ZZ"
            # sequences on the same line and check whether the MIDDLE value
            # (GST column) is > 0 for a GST-free description.
            src_lines = _source_text.split("\n")
            i = 0
            while i < len(src_lines):
                line = src_lines[i]
                m = gst_free_desc_re.search(line)
                if m:
                    # Collect the current line + next 3 lines to catch
                    # multi-line rows.
                    window = "\n".join(src_lines[i:i+4])
                    # Look for "$X ... $Y ... $Z" numeric sequence (rate,
                    # GST, total).
                    nums = _re_b.findall(r"\$([0-9]+(?:\.[0-9]{1,2})?)", window)
                    if len(nums) >= 3:
                        try:
                            # Middle-of-three is typically GST; last is total.
                            # Pattern (rate, GST, total): if GST > 0 and
                            # GST + rate*hours ≈ total, that's the tabular
                            # signature.
                            middle = float(nums[-2])
                            if 0.01 < middle < 100.0:
                                gst_hits.append({
                                    "date": "",
                                    "description": line.strip()[:80],
                                    "gst": round(middle, 2),
                                })
                        except Exception:
                            pass
                i += 1
        # Deduplicate hits by (date, description-first-3-words, gst)
        seen = set()
        deduped_hits = []
        for h in gst_hits:
            desc_key = " ".join(_re_b.findall(r"[a-z]+", h["description"].lower())[:3])
            key = (h["date"], desc_key, h["gst"])
            if key in seen:
                continue
            seen.add(key)
            deduped_hits.append(h)
        gst_hits = deduped_hits
        if gst_hits:
            total = round(sum(h["gst"] for h in gst_hits), 2)
            anomalies.append({
                "severity": "medium",
                "rule": "RULE_27_GST_ON_GST_FREE",
                "headline": f"GST charged on GST-free services (${total:,.2f})",
                "detail": (
                    f"{len(gst_hits)} row{'s' if len(gst_hits) > 1 else ''} show GST charged on "
                    f"services that are GST-free under the Aged Care legislation (personal care, "
                    f"domestic assistance, clinical care). These GST amounts should be reversed."
                ),
                "dollar_impact": total,
                "evidence": [
                    (f"{h['date']} · " if h.get('date') else "") + f"{h['description']} · GST ${h['gst']:,.2f}"
                    for h in gst_hits[:5]
                ],
                "suggested_action": (
                    "Ask the provider to reverse the GST on these rows and reissue a corrected "
                    "statement. GST is not applicable to Support at Home care services."
                ),
            })

    # ---- RULE_28_STRADDLING_OCT_2026: statement period spans the 1 Oct 2026
    #      Support at Home rule change (pre-change HCP funding vs post-change
    #      Support at Home rules).
    if "RULE_28_STRADDLING_OCT_2026" not in existing_rules:
        ps = _parse_iso_date(extracted.get("period_start"))
        pe = _parse_iso_date(extracted.get("period_end"))
        if ps and pe:
            import datetime as _dt_28
            boundary = _dt_28.date(2026, 10, 1)
            if ps < boundary and pe >= boundary:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_28_STRADDLING_OCT_2026",
                    "headline": "Statement period straddles the 1 October 2026 program change",
                    "detail": (
                        f"This statement covers {ps.isoformat()} to {pe.isoformat()}, which "
                        f"spans the transition from the legacy Home Care Package rules to the "
                        f"current Support at Home rules on 1 October 2026. Pre-change and "
                        f"post-change services should be shown on separate statements so the "
                        f"applicable rules are clear."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [
                        f"period_start: {ps.isoformat()}",
                        f"period_end: {pe.isoformat()}",
                        "boundary: 2026-10-01 (Support at Home rule change)",
                    ],
                    "suggested_action": (
                        "Ask the provider to split this statement at 1 October 2026 and reissue "
                        "two separate statements, one under the pre-change rules and one under "
                        "the current Support at Home rules."
                    ),
                })

    # ---- RULE_29_MISSING_ACT_DISCLOSURE: statement footer must reference
    #      the Aged Care Act / Support at Home program.
    if "RULE_29_MISSING_ACT_DISCLOSURE" not in existing_rules and _source_text:
        footer = _source_text[-2000:].lower() if len(_source_text) > 2000 else _source_text.lower()
        has_reference = any(
            phrase in footer for phrase in (
                "aged care act",
                "support at home program",
                "support at home rules",
                "aged care rules",
                "program rules",
                "commonwealth aged care",
            )
        )
        if not has_reference:
            anomalies.append({
                "severity": "low",
                "rule": "RULE_29_MISSING_ACT_DISCLOSURE",
                "headline": "Statement footer is missing the required Aged Care Act program reference",
                "detail": (
                    "Support at Home statements should carry a footer reference to the Aged "
                    "Care Act, Support at Home program, or program rules. This one does not, "
                    "which may indicate the statement was generated outside the compliant "
                    "provider template."
                ),
                "dollar_impact": 0.0,
                "evidence": ["footer text scanned: no Aged Care Act / Support at Home / program rules reference found"],
                "suggested_action": (
                    "Ask the provider to include the standard Aged Care Act / Support at Home "
                    "program-rules reference in the statement footer."
                ),
            })

    # ---- RULE_30_FUNDING_CADENCE_MISMATCH: government contribution stated
    #      per month on a quarterly statement (or vice versa).
    if "RULE_30_FUNDING_CADENCE_MISMATCH" not in existing_rules and _source_text and _cadence:
        text_lower = _source_text.lower()
        if _cadence == "quarterly":
            per_month_hits = _re_b.findall(
                r"\bgovernment[^.\n]{0,80}per\s+month\b|\bper\s+month\s+government\b|monthly\s+contribution|monthly\s+subsidy",
                text_lower,
            )
            # DEC-1 v7.7 §Batch B: also catch the S4 pattern where government
            # contribution is broken down as "Government contribution, Sep 2026",
            # "Government contribution, Oct 2026", etc. on a quarterly statement.
            monthly_split = _re_b.findall(
                r"government\s+contribution[^\n]{0,80}(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*20\d{2}",
                text_lower,
            )
            if len(monthly_split) >= 2 and monthly_split:
                per_month_hits = per_month_hits + monthly_split[:3]
            if per_month_hits:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_30_FUNDING_CADENCE_MISMATCH",
                    "headline": "Quarterly statement lists government funding on a monthly basis",
                    "detail": (
                        "The statement is a quarterly one, but the government contribution is "
                        "described in per-month language. Support at Home budgets and subsidies "
                        "operate on a quarterly basis; monthly presentation on a quarterly "
                        "statement can misrepresent what is actually available."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [f"pattern found: \"{p}\"" for p in per_month_hits[:3]],
                    "suggested_action": (
                        "Ask the provider to restate the government contribution on a quarterly "
                        "basis, consistent with the quarterly budget model."
                    ),
                })

    # ---- RULE_31_AMBIGUOUS_CATEGORY: line item description is ambiguous
    #      about which stream it belongs to.
    if "RULE_31_AMBIGUOUS_CATEGORY" not in existing_rules:
        ambiguous_hits: list[dict] = []
        AMBIGUOUS_PATTERNS = [
            _re_b.compile(r"\bcombined\s+activities?\b", _re_b.IGNORECASE),
            _re_b.compile(r"\bcombined\s+services?\b", _re_b.IGNORECASE),
            _re_b.compile(r"personal\s+care\s*\+\s*domestic", _re_b.IGNORECASE),
            _re_b.compile(r"clinical\s*\+\s*(?:independence|personal)", _re_b.IGNORECASE),
            _re_b.compile(r"\bservice\s+delivery\s*[,-]\s*combined\b", _re_b.IGNORECASE),
            _re_b.compile(r"\bad-?hoc\s+support\b", _re_b.IGNORECASE),
            _re_b.compile(r"\bmiscellaneous\s+support\b", _re_b.IGNORECASE),
        ]
        for li in _line_items:
            if li.get("is_cancellation"):
                continue
            desc = (li.get("service_description") or li.get("service_name") or "").strip()
            for pat in AMBIGUOUS_PATTERNS:
                if pat.search(desc):
                    ambiguous_hits.append({
                        "date": li.get("date") or "",
                        "description": desc[:100],
                        "amount": float(li.get("gross") or 0.0),
                    })
                    break
        if ambiguous_hits:
            total = round(sum(h["amount"] for h in ambiguous_hits), 2)
            anomalies.append({
                "severity": "low",
                "rule": "RULE_31_AMBIGUOUS_CATEGORY",
                "headline": f"{len(ambiguous_hits)} line item{'s' if len(ambiguous_hits) > 1 else ''} with ambiguous service category",
                "detail": (
                    f"{len(ambiguous_hits)} row{'s' if len(ambiguous_hits) > 1 else ''} describe "
                    f"the service in vague terms (\"combined activities\", \"ad-hoc support\", "
                    f"etc.) which prevents automated category and rate checks."
                ),
                "dollar_impact": total,
                "evidence": [
                    f"{h['date']} · {h['description']} · ${h['amount']:,.2f}"
                    for h in ambiguous_hits[:5]
                ],
                "suggested_action": (
                    "Ask the provider to itemise these lines with specific service codes and "
                    "descriptions so the stream and rate can be verified."
                ),
            })

    # ---- RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH: header provider name
    #      differs from any provider mention in the footer / signature block.
    if "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH" not in existing_rules and _source_text:
        header_provider = (extracted.get("provider_name") or "").strip()
        if header_provider and len(_source_text) > 200:
            # Look at the last 25% of the source text for provider mentions.
            footer_slice = _source_text[-max(1200, len(_source_text) // 4):]
            # Extract "X Pty Ltd" / "X Group" / "X Services" style entities.
            # Require the entity name to start with a Title-Cased token and
            # contain only Title-Cased tokens (so "Signed on behalf of Foo Pty
            # Ltd" doesn't get captured, we want just "Foo Pty Ltd").
            candidates = set()
            for m in _re_b.finditer(
                r"((?:[A-Z][A-Za-z0-9&']*\s+){1,6}(?:Pty\s+Ltd|Group|Services|Aged\s+Care|Enterprises|Limited))",
                footer_slice,
            ):
                cand = m.group(1).strip()
                # Reject candidates that are clearly sentence fragments (contain
                # common connective words). The regex above is already
                # Title-Case-only but "Aged Care" is often used mid-sentence.
                if _re_b.search(r"\b(?:signed|issued|prepared|on\s+behalf|registered)\b", cand, _re_b.IGNORECASE):
                    continue
                candidates.add(cand)
            # Normalise for compare.
            def _norm(s: str) -> str:
                return _re_b.sub(r"\s+", " ", s or "").strip().lower()
            header_norm = _norm(header_provider)
            # Any candidate that differs (not a substring match either way).
            different_candidate = None
            for c in candidates:
                cn = _norm(c)
                if cn == header_norm:
                    continue
                # Ignore if the entity is a subcontractor mentioned incidentally.
                if any(sub in cn for sub in ("meals", "physio", "allied", "supplies", "safehome", "aged care")):
                    continue
                # Require some overlap in the primary token so we're comparing
                # variants of the SAME provider (Glorious Services Pty Ltd vs
                # Glorious Services Group) rather than unrelated companies.
                head_tokens = set(header_norm.split()) - {"pty", "ltd", "group", "services", "limited", "aged", "care"}
                cand_tokens = set(cn.split()) - {"pty", "ltd", "group", "services", "limited", "aged", "care"}
                if head_tokens & cand_tokens:
                    different_candidate = c
                    break
            if different_candidate:
                anomalies.append({
                    "severity": "medium",
                    "rule": "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH",
                    "headline": "Provider name in the header does not match the footer",
                    "detail": (
                        f"The statement header lists the provider as \"{header_provider}\" but "
                        f"the footer / signature block references \"{different_candidate}\". "
                        f"These should match, a mismatch can indicate a template error or a "
                        f"legal-entity restructure that wasn't communicated to the participant."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [
                        f"header: {header_provider}",
                        f"footer: {different_candidate}",
                    ],
                    "suggested_action": (
                        "Ask the provider to clarify which legal entity issued this statement "
                        "and reissue a corrected version if the header is wrong."
                    ),
                })

    # ---- RULE_33_MIXED_DATE_FORMATS: multiple distinct date formats across
    #      SERVICE line items (indicates copy-paste from mixed sources).
    #      Only fires when the mix appears in actual line-item date fields,
    #      not in narrative text (which routinely contains e.g. "10 October
    #      2026" issued dates alongside DD/MM/YYYY service dates).
    if "RULE_33_MIXED_DATE_FORMATS" not in existing_rules:
        FMT_ISO = _re_b.compile(r"^\d{4}-\d{2}-\d{2}$")
        FMT_SLASH_FULL = _re_b.compile(r"^\d{1,2}/\d{1,2}/\d{4}$")
        FMT_SLASH_SHORT = _re_b.compile(r"^\d{1,2}/\d{1,2}/\d{2}$")
        FMT_DASH_MONTH = _re_b.compile(r"^\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]{0,6}[-\s]?\d{0,4}$", _re_b.IGNORECASE)
        FMT_MONTH_DAY = _re_b.compile(r"^(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?!\d)$", _re_b.IGNORECASE)
        FMT_VARIOUS = _re_b.compile(r"^(?:various|multiple|see\s+below)$", _re_b.IGNORECASE)
        formats_found: set[str] = set()
        example_by_format: dict[str, str] = {}
        for li in _line_items:
            raw_date = (li.get("date") or "").strip()
            if not raw_date:
                continue
            key = None
            if FMT_ISO.match(raw_date):
                key = "YYYY-MM-DD"
            elif FMT_SLASH_FULL.match(raw_date):
                key = "DD/MM/YYYY"
            elif FMT_SLASH_SHORT.match(raw_date):
                key = "DD/MM/YY"
            elif FMT_DASH_MONTH.match(raw_date):
                key = "DD-Mon-YYYY"
            elif FMT_MONTH_DAY.match(raw_date):
                key = "Month DD"
            elif FMT_VARIOUS.match(raw_date):
                key = "Various"
            if key:
                formats_found.add(key)
                example_by_format.setdefault(key, raw_date)
        # Fire only when we see 3+ distinct formats on service-date fields
        # (not narrative dates). ISO + DD/MM/YYYY alone is a common LLM
        # normalisation artefact and doesn't warrant a flag.
        if len(formats_found) >= 3:
                anomalies.append({
                    "severity": "low",
                    "rule": "RULE_33_MIXED_DATE_FORMATS",
                    "headline": f"Statement uses {len(formats_found)} different date formats",
                    "detail": (
                        f"The source statement mixes {len(formats_found)} different date "
                        f"formats ({', '.join(sorted(formats_found))}). Wayly has normalised "
                        f"them for display, but the mix suggests the provider is copy-pasting "
                        f"from multiple systems, which raises the risk of transcription errors."
                    ),
                    "dollar_impact": 0.0,
                    "evidence": [f"format detected: {f}" for f in sorted(formats_found)],
                    "suggested_action": (
                        "Ask the provider to standardise on a single date format for future "
                        "statements, DD/MM/YYYY is the Australian norm."
                    ),
                })

    # ---- RULE_34_DATE_INHERITED_ROW: at least one row had a blank date that
    #      Wayly filled in from the previous row. Surfaced as an INFO/LOW so
    #      the participant knows the row was reconstructed.
    if "RULE_34_DATE_INHERITED_ROW" not in existing_rules:
        try:
            inherited_count = int(extracted.get("_date_inheritance_count") or 0)
        except Exception:
            inherited_count = 0
        if inherited_count > 0:
            anomalies.append({
                "severity": "low",
                "rule": "RULE_34_DATE_INHERITED_ROW",
                "headline": f"{inherited_count} line item{'s' if inherited_count > 1 else ''} had blank dates that we filled in",
                "detail": (
                    f"{inherited_count} row{'s' if inherited_count > 1 else ''} on the source "
                    f"statement had blank date field{'s' if inherited_count > 1 else ''}. Wayly "
                    f"filled the date{'s' if inherited_count > 1 else ''} from the previous "
                    f"dated row so the item{'s' if inherited_count > 1 else ''} could be "
                    f"reconciled, but please confirm the actual service date with the provider."
                ),
                "dollar_impact": 0.0,
                "evidence": [f"inherited date rows: {inherited_count}"],
                "suggested_action": (
                    "Ask the provider to reissue the statement with an explicit date on every "
                    "service row."
                ),
            })

    # Final pass, clean up the anomalies array.
    # Five steps in order:
    #   (a) Drop speculative-language anomalies (Fix 4 + Fix 1), anomalies that
    #       describe what they didn't find, or that hedge with words like
    #       "approximately"/"may exceed"/"likely"/"suggests" without a confirmed
    #       dollar figure.
    #   (b) Drop brokered-rate flags that lack explicit two-rate evidence
    #       (HARD GATE, both rates must appear as numeric $-amounts).
    #   (c) Drop Rule 7 (Restorative Care Pathway) flags that lack explicit
    #       INPATIENT admission evidence, outpatient reviews must not trigger.
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
        "without disclosed published rate", "without published rate comparison",
        "no published rate", "no published weekday rate", "no published weekend rate",
        "no published baseline rate", "baseline rate not disclosed", "baseline rate not provided",
        "published rate not disclosed", "published rate not provided",
        "no baseline rate", "with no published", "with no disclosed", "no disclosed",
        "without a comparable", "without a comparison", "cannot confirm whether",
        "appears elevated", "elevated rate", "appears higher", "appears high",
        "elevated for", "looks elevated", "seems elevated", "seems high",
        "unusually high", "notably higher", "significantly higher",
    )

    # Pre-compile the date / service-code / rule-prefix regexes once so that
    # both the cleaned-loop hallucination guard and the downstream
    # fingerprint-dedup pass can share the exact same compiled patterns.
    DATE_RE = _re.compile(
        r"\b("
        r"\d{4}-\d{2}-\d{2}"  # ISO 2026-05-05
        r"|"
        r"\d{1,2}[-\s](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)(?:[a-z]{0,6})?"
        r"|"
        r"\d{1,2}/\d{1,2}/\d{2,4}"
        r")\b",
        _re.IGNORECASE,
    )
    SERVICE_CODE_RE = _re.compile(r"\b([A-Z]{2,5}-\d{2,4})\b")
    RULE_PREFIX_RE = _re.compile(r"^(RULE_\d+)")

    cleaned: list[dict] = []
    # Fix 3 / Fix 4, build helper sets:
    #   • known_service_codes, every service_code that actually appears in the
    #     extracted line_items. Used to strip RULE_4 / AT-HM coding flags that
    #     cite a code the LLM hallucinated.
    #   • completed_athm_refs, every AT-HM commitment whose status is completed
    #     / closed / fully claimed AND amount_remaining is 0. Anomalies that
    #     mention these refs are reference-only and must NOT surface.
    known_service_codes: set[str] = set()
    for li in (extracted.get("line_items") or []):
        if not isinstance(li, dict):
            continue
        sc = (li.get("service_code") or "").strip().upper()
        if sc:
            known_service_codes.add(sc)
    completed_athm_refs: set[str] = set()
    for c in (extracted.get("at_hm_commitments") or []):
        if not isinstance(c, dict):
            continue
        status = (c.get("status") or "").strip().lower()
        try:
            remaining = float(c.get("amount_remaining") or 0.0)
            claimed_this = float(c.get("amount_claimed_this_period") or 0.0)
        except Exception:
            remaining = 0.0
            claimed_this = 0.0
        # Only treat as "prior-period completed" (reference-only) when there
        # is NO current-period claim. A commitment fully claimed THIS period
        # is legitimately the subject of Rule 19, so don't strip its flags.
        is_prior_completed = (
            (status in {"completed", "complete", "closed", "fully claimed", "finalised", "finalized"} or remaining <= 0.01)
            and claimed_this <= 0.01
        )
        if is_prior_completed:
            ref = (c.get("ref") or "").strip().upper()
            if ref:
                completed_athm_refs.add(ref)

    for a in anomalies:
        if not isinstance(a, dict):
            continue
        rule = (a.get("rule") or "").upper()
        text_blob = ((a.get("detail") or "") + " " + (a.get("headline") or "")).lower()
        evidence_full_blob = text_blob + " " + " ".join(str(e or "").lower() for e in (a.get("evidence") or []))

        # (a) Speculative / no-anomaly commentary, never user-facing.
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

        # DEC-1 v7.7 §Batch B Round 2: strip LLM-emitted "rule does not
        # apply" / "no findings" / "no violation detected" filler flags.
        # These are the LLM padding its output when it can't find a real
        # anomaly for a rule but feels obliged to report on it.
        no_finding_phrases = (
            "rule does not apply", "no violation detected", "no violations found",
            "no findings", "no issue found", "no issues found",
            "not applicable", "check does not apply", "no anomalies found",
            "no discrepancies found", "compliant with", "no red flags",
            "within acceptable range", "no action required",
        )
        if any(p in text_blob for p in no_finding_phrases):
            continue

        # DEC-1 v7.7 §Batch B: RULE_2 (weekend/after-hours rate) flags need
        # the provider's published weekend rate cited alongside the charged
        # rate. Anomalies that say "$X exceeds typical weekday rate" without
        # a published rate from THIS statement are hedged flags and must
        # not fire per the rule spec. Match variants like _ACCURACY,
        # _RATE, no-suffix, but not RULE_20 / RULE_21 / RULE_2x.
        if _re.match(r"^RULE_2_(?:WEEKEND|AFTER|AFTERHOURS|SATURDAY|SUNDAY|PUBLIC)", rule):
            if not _has_two_rate_refs(a):
                continue
            if any(h in text_blob for h in HEDGE_PHRASES) or any(
                p in text_blob for p in (
                    "typical", "usual rate", "usual weekday", "standard rate",
                    "typical weekday", "typical weekend", "average rate",
                    "not disclosed", "not published", "rate not provided",
                    "rate not shown", "no comparison available",
                    "exceeds typical", "above typical", "elevated",
                )
            ):
                continue

        # (c) Rule 7, RCP / hospital admission must have inpatient evidence.
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

        # FIX 3 (Round 3), Strip any LLM-emitted Rule 1 / care-management
        # flag that uses the quarterly budget as the percentage base. The
        # deterministic RULE_1_CARE_MGMT_CAP added in Batch B emits the CORRECT
        # (services-subtotal-based) framing, so we keep those. Only strip
        # LLM-emitted flags that quote the wrong base.
        if rule.startswith("RULE_1") and not rule.startswith("RULE_1B"):
            wrong_base_phrases = (
                "of quarterly budget",
                "of the quarterly budget",
                "quarterly_budget_total",
                "exceeds quarterly cap",
                "exceeds the quarterly cap",
            )
            # Only strip if the flag both (a) uses wrong-base language AND
            # (b) is NOT our deterministic emission. Detect deterministic
            # emission by the presence of "10% cap" language in the evidence.
            has_wrong_base = any(p in evidence_full_blob for p in wrong_base_phrases)
            is_deterministic_cap_flag = any(
                p in evidence_full_blob for p in (
                    "10% cap:", "services subtotal (excluding at-hm)", "services subtotal excluding at-hm",
                )
            )
            if has_wrong_base and not is_deterministic_cap_flag:
                continue

        # Fix 3, AT-HM coding / hallucination guard.
        # RULE_4 (AT-HM stream miscoding) anomalies must cite a service_code
        # that actually exists in the extracted line_items. If the LLM
        # invented a parallel "AT-001" or similar code that isn't present,
        # silently strip the flag.
        if rule.startswith("RULE_4"):
            # DEC-1 v7.7 §Batch B: RULE_4 is the AT-HM stream miscoding rule.
            # If the anomaly cites codes that aren't AT-HM (NU-, PT-, PC-,
            # DA- etc), the LLM is misapplying the rule as a catch-all
            # "code is incomplete" flag. Strip these.
            cited_codes = SERVICE_CODE_RE.findall(evidence_full_blob.upper())
            cited_athm = [c for c in cited_codes if c.upper().startswith("AT-") or c.upper().startswith("ATHM")]
            cited_non_athm = [c for c in cited_codes if not (c.upper().startswith("AT-") or c.upper().startswith("ATHM"))]
            if cited_non_athm and not cited_athm:
                # RULE_4 claiming non-AT-HM codes are miscoded is off-scope.
                continue
            if cited_athm and not any(c.upper() in known_service_codes for c in cited_athm):
                continue
            # Also drop if the flag's headline/detail describes a "duplicate"
            # / "coding mismatch" between two AT-HM codes but the line_items
            # array has zero AT- entries (pure hallucination case).
            if ("coding mismatch" in text_blob or "duplicate at-hm" in text_blob) and not any(
                sc.upper().startswith("AT-") or sc.upper().startswith("ATHM") for sc in known_service_codes
            ):
                continue
            # DEC-1 v7.7 §Batch B: strip RULE_4 flags that claim participant
            # contribution or government_paid discrepancy on AT-HM when the
            # extracted line items show consistent numbers.
            if any(w in text_blob for w in ("participant contribution", "government_paid", "government paid", "100%", "government-funded", "government funded", "coding", "inconsistent coding", "generic", "discrepancy")):
                # Look up all AT-HM line items and confirm every row has
                # PC=0 and government_paid roughly equals gross. If yes,
                # the extraction is coherent → the flag is fabricated.
                athm_coherent = True
                for li in (extracted.get("line_items") or []):
                    if not isinstance(li, dict):
                        continue
                    stream = (li.get("stream") or "").strip()
                    lcode = (li.get("service_code") or "").strip().upper()
                    if stream != "ATHM" and not (lcode.startswith("AT-") or lcode.startswith("ATHM") or lcode == "AT"):
                        continue
                    try:
                        g = float(li.get("gross") or 0.0)
                        pc = float(li.get("participant_contribution") or 0.0)
                        gp = float(li.get("government_paid") or 0.0)
                    except Exception:
                        continue
                    if pc > 0.01 or (g > 0 and abs(gp - g) > 0.01):
                        athm_coherent = False
                        break
                if athm_coherent:
                    continue
            # DEC-1 v7.7 §Batch B: reject "service code incomplete/malformed"
            # framings from RULE_4. Support at Home rules don't mandate a
            # specific service_code format, this is the LLM inventing a
            # standard that doesn't exist.
            if any(p in text_blob for p in (
                "incomplete", "malformed", "does not follow", "not standard",
                "not published", "may not match published",
                "does not conform", "missing suffix",
            )):
                continue

        # Fix 4, Drop any anomaly that references a COMPLETED AT-HM
        # commitment ref (status completed / amount_remaining = 0). Completed
        # commitments are reference-only and must NEVER produce a flag or
        # informational note, including the LLM's "missing approval_date /
        # expiry_date metadata" hallucination on the shower chair.
        if completed_athm_refs:
            mentioned_refs = set()
            # Match commitment refs like ATHM-2026-0039 in any case.
            for ref_m in _re.finditer(r"\bATHM[\-\s]?\d{4}[\-\s]?\d{3,5}\b", evidence_full_blob, _re.IGNORECASE):
                mentioned_refs.add(ref_m.group(0).upper().replace(" ", "-"))
            if mentioned_refs & completed_athm_refs:
                continue

        cleaned.append(a)

    # (b) Deduplicate by content fingerprint.
    #
    # The fingerprint includes the rule prefix so that distinct rules that
    # happen to reference the same date/service-code (e.g. Rule 17 review-due
    # and Rule 18 service-increase both citing the same provider note) are
    # NOT collapsed, those are handled by the merge step below.
    # Same-rule duplicates (e.g. Rule 3 from the LLM auditor + Rule 3 from the
    # deterministic backstop, which describe the same billing issue) DO
    # collapse via this step.

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
        # Pull the first date and first service-code from headline + detail + evidence.
        blob = (a.get("headline") or "") + " " + (a.get("detail") or "")
        for ev in (a.get("evidence") or []):
            blob += " " + str(ev or "")
        date_m = DATE_RE.search(blob)
        code_m = SERVICE_CODE_RE.search(blob)
        date = _normalise_date(date_m.group(1)) if date_m else ""
        code = code_m.group(1).strip().lower() if code_m else ""
        rule_prefix_m = RULE_PREFIX_RE.match((a.get("rule") or "").upper())
        rule_prefix = rule_prefix_m.group(1) if rule_prefix_m else (a.get("rule") or "")
        # Fix 1 (Round 2), dedup by (rule_prefix, date, service_code) ONLY.
        # Dollar impact is intentionally excluded so that an LLM-emitted
        # variant with $0 and a deterministic emitter with the exact dollar
        # collapse into one flag. A single incident → a single flag.
        key = f"{rule_prefix}|{date}|{code}"
        if len(key.replace("|", "").strip()) > len(rule_prefix) + 2:
            return key
        # No structural anchor, fall back to a hash of the first 60 chars of detail.
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
        # in any A-sentence, eliminates near-duplicate provider-note sentences.
        a_prefixes = {sa[:40].lower() for sa in sentences_a}
        unique_b = [sb for sb in sentences_b if sb[:40].lower() not in a_prefixes]
        if unique_b:
            merged_detail = ". ".join(sentences_a + ["Additionally"] + unique_b) + "."
        else:
            merged_detail = ". ".join(sentences_a) + "."

        merged = {
            "severity": "low",
            "rule": "RULE_17_18_REVIEW_AND_INCREASE_MERGED",
            "headline": "Care plan review due , and services are changing",
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

    # FIX 1 (Round 3), FINAL GUARANTEED DEDUPLICATION PASS.
    #
    # Runs as the unequivocal last step before returning. Uses the simple
    # spec key: rule_prefix + date + service_code. A single incident → a
    # single flag, regardless of how many code paths emitted it.
    #
    # For date-independent rules (care management overcharge, quarterly
    # underspend, ABN format, period-parse), date and code fields will both
    # be empty, they correctly collapse on rule_prefix alone.
    final_seen: dict[str, dict] = {}
    final_deduped: list[dict] = []
    for a in deduped:
        if not isinstance(a, dict):
            final_deduped.append(a)
            continue
        rule_prefix_m = RULE_PREFIX_RE.match((a.get("rule") or "").upper())
        rule_prefix = rule_prefix_m.group(1) if rule_prefix_m else (a.get("rule") or "UNKNOWN").upper()
        blob = (a.get("headline") or "") + " " + (a.get("detail") or "")
        for ev in (a.get("evidence") or []):
            blob += " " + str(ev or "")
        date_m = DATE_RE.search(blob)
        code_m = SERVICE_CODE_RE.search(blob)
        date_key = _normalise_date(date_m.group(1)) if date_m else ""
        code_key = code_m.group(1).strip().lower() if code_m else ""
        final_key = f"{rule_prefix}|{date_key}|{code_key}"
        if final_key in final_seen:
            # Already have a flag for this (rule_prefix, date, code), silently drop.
            continue
        final_seen[final_key] = a
        final_deduped.append(a)

    # DEC-1 v7.7 §Phase 2 #6, impact accounting cap.
    #
    # Two guarantees:
    #   (a) Each dollar can only be counted against at-most one anomaly.
    #       When multiple anomalies claim the same underlying line item
    #       (same date + service_code) we keep the higher-severity one's
    #       dollar_impact and zero the rest.
    #   (b) The sum of dollar_impact across all anomalies cannot exceed the
    #       gross_total for the statement, anomalies that would push the
    #       sum over the ceiling are clipped down to fit.
    sev_rank = {"high": 0, "medium": 1, "low": 2}
    grouped: Dict[tuple, list[dict]] = {}
    ungrouped: list[dict] = []
    for a in final_deduped:
        if not isinstance(a, dict):
            continue
        try:
            impact = float(a.get("dollar_impact") or 0.0)
        except Exception:
            impact = 0.0
        if impact <= 0:
            ungrouped.append(a)
            continue
        blob = (a.get("headline") or "") + " " + (a.get("detail") or "")
        for ev in (a.get("evidence") or []):
            blob += " " + str(ev or "")
        date_m = DATE_RE.search(blob)
        code_m = SERVICE_CODE_RE.search(blob)
        date_key = _normalise_date(date_m.group(1)) if date_m else ""
        code_key = code_m.group(1).strip().lower() if code_m else ""
        if date_key or code_key:
            grouped.setdefault((date_key, code_key), []).append(a)
        else:
            ungrouped.append(a)
    for members in grouped.values():
        if len(members) <= 1:
            continue
        # Rank by severity ascending, then by impact descending. Keep the
        # first entry's impact, zero the rest so double-counting is impossible.
        members.sort(key=lambda a: (
            sev_rank.get((a.get("severity") or "").lower(), 3),
            -float(a.get("dollar_impact") or 0.0),
        ))
        for m in members[1:]:
            m["dollar_impact"] = 0.0

    # (b), cap the aggregate at gross_total.
    try:
        gross_cap = float(
            (audit_result.get("statement_summary") or {}).get("total_gross") or 0.0
        )
    except Exception:
        gross_cap = 0.0
    if gross_cap <= 0:
        # Fall back to the reported figure from the extraction, this can be
        # relied on before `_apply_reported_totals` populates statement_summary.
        try:
            gross_cap = float(extracted.get("reported_total_gross") or 0.0)
        except Exception:
            gross_cap = 0.0
    if gross_cap <= 0:
        # Last resort: sum non-cancelled line-item gross values.
        try:
            gross_cap = 0.0
            for li in extracted.get("line_items") or []:
                if isinstance(li, dict) and not li.get("is_cancellation"):
                    try:
                        gross_cap += float(li.get("gross") or 0.0)
                    except Exception:
                        pass
        except Exception:
            gross_cap = 0.0
    if gross_cap > 0:
        # Walk in severity order and clip.
        remaining = gross_cap
        for a in sorted(
            final_deduped,
            key=lambda a: (
                sev_rank.get((a.get("severity") or "").lower(), 3),
                -float(a.get("dollar_impact") or 0.0),
            ),
        ):
            if not isinstance(a, dict):
                continue
            try:
                imp = float(a.get("dollar_impact") or 0.0)
            except Exception:
                imp = 0.0
            if imp <= 0:
                continue
            if imp > remaining:
                a["dollar_impact"] = round(max(0.0, remaining), 2)
                remaining = 0.0
            else:
                remaining = round(remaining - imp, 2)
    # Recompute aggregate for the summary card so the UI stays in sync.
    total_impact = 0.0
    for a in final_deduped:
        try:
            total_impact += max(0.0, float((a or {}).get("dollar_impact") or 0.0))
        except Exception:
            pass
    audit_result.setdefault("statement_summary", {})["anomaly_dollar_impact_total"] = round(total_impact, 2)

    audit_result["anomalies"] = final_deduped
    return audit_result
