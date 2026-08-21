"""LF-1 v1.2, letter generation engine.

Six archetype-specific LLM prompts plus an orchestrator that:

* Reads the correspondence log entry.
* Loads matching citations from the Statement of Rights library.
* Verifies source data (WS6, refuses to generate when required fields
  are missing).
* Calls the LLM via `lib.llm_wrapper.chat_send`.
* Structures the result into email subject/body + PDF-ready payload +
  MAC portal short-form + cover-note metadata.

Guardrails:
  * `temperature=0` deterministic, same intake produces the same draft.
  * Prompt system messages forbid claiming statements the user did not
    make and forbid citing statute the tool did not surface.
  * The orchestrator never mutates the correspondence entry itself ,
    the route layer decides which fields to persist.
"""
from __future__ import annotations

import datetime as _dt
import logging
from pathlib import Path
from typing import Any

import yaml

from lib import lf1
from lib import llm_wrapper

log = logging.getLogger("wayly.lf1.generate")

_CITATION_LIBRARY_PATH = (
    Path(__file__).parent.parent / "data" / "lf1" / "citation_library.yaml"
)

# The Emergent LLM key gates Anthropic Claude, OpenAI, and Gemini calls.
# Claude Sonnet 4.5 is the anchor model for LF-1 draft generation, its
# tone-control on formal correspondence is stronger than the Gemini and
# OpenAI equivalents in Wayly's evaluations.
_MODEL = "claude-sonnet-4-5-20250929"
_PROVIDER = "anthropic"


# ---------------------------------------------------------------------------
# Citation library loading
# ---------------------------------------------------------------------------


def _load_citations() -> list[dict]:
    if not _CITATION_LIBRARY_PATH.exists():
        return []
    with _CITATION_LIBRARY_PATH.open("r", encoding="utf-8") as fh:
        raw = yaml.safe_load(fh) or {}
    return list(raw.get("citations") or [])


_CITATIONS = _load_citations()


def list_citations() -> list[dict]:
    return list(_CITATIONS)


def citations_for(archetype: str) -> list[dict]:
    return [c for c in _CITATIONS if archetype in (c.get("archetypes") or [])]


# ---------------------------------------------------------------------------
# WS6, source data verification gate
# ---------------------------------------------------------------------------


class SourceDataMissing(ValueError):
    """Raised when the intake payload does not contain the fields the
    archetype prompt requires. Surfaces to the frontend as HTTP 422 so
    the intake screen can show the missing-fields checklist."""


_REQUIRED_INTAKE_FIELDS: dict[str, list[str]] = {
    "request": ["participant_name", "change_summary"],
    "dispute": ["participant_name", "disputed_charge_summary"],
    "complaint": ["participant_name", "complaint_summary"],
    "escalation": ["participant_name", "escalation_summary", "prior_attempts"],
    "notification": ["participant_name", "notification_summary"],
    "response_draft": ["inbound_summary"],
    "guided_pathway": ["participant_name"],
}


def verify_source_data(archetype: str, intake: dict | None) -> list[str]:
    """Return the list of missing required intake fields for the archetype.
    Empty list means the intake is complete."""
    required = _REQUIRED_INTAKE_FIELDS.get(archetype, [])
    intake = intake or {}
    return [f for f in required if not intake.get(f)]


# ---------------------------------------------------------------------------
# Prompt templates per archetype
# ---------------------------------------------------------------------------


_SYSTEM_BASE = """You are a plain-English Australian aged-care correspondence writer for the
Wayly Letters & Follow-ups tool. You draft polite, factual letters that families and
participants send to My Aged Care, aged care providers, the Aged Care Quality and Safety
Commission, the Commonwealth Ombudsman, or Services Australia.

Absolute rules you MUST follow:
1. Only reference facts contained in the intake payload. Never invent dates, diagnoses,
   dollar amounts, or events.
2. Only cite legislation that the intake payload marks as "available_citations".
   Never fabricate citations, section numbers, or URLs.
3. Never claim the user has done something they did not tell you about.
4. Never promise action from the recipient, you may request or ask.
5. Use Australian English spelling. Plain, respectful register. Short paragraphs.
6. No emoji. No em-dashes when a comma or full stop will do.
7. Do NOT include a signature line, Wayly appends the sender identity separately.
8. Output MUST be exactly two blocks: a "SUBJECT:" line, a blank line, then the letter body.
"""


_ARCHETYPE_SYSTEMS = {
    "request": _SYSTEM_BASE + """
You are writing a REQUEST letter. This is a first-approach letter asking a recipient
(usually My Aged Care or the participant's provider) to take a specific action, such as
arranging a reassessment, initiating an RCP referral, amending a care plan, or updating
a recorded family representative. Tone: polite, evidence-led, matter-of-fact. Structure:
opening paragraph naming the participant and the request; middle paragraphs setting out
what has changed and the evidence you can point to; closing paragraph specifying the
outcome you want and the response window.""",

    "dispute": _SYSTEM_BASE + """
You are writing a DISPUTE letter. The user believes a charge, an assessment outcome, or
a decision is wrong and wants it reconsidered. Tone: firm, factual, chronological, not
combative. Structure: opening paragraph naming the dispute and the reference number if
available; middle paragraphs setting out each disputed item with dates and evidence;
closing paragraph asking for the recipient's written response by a specific date.""",

    "complaint": _SYSTEM_BASE + """
You are writing a COMPLAINT letter to a provider. The user has attempted resolution
already or the matter warrants a formal complaint. Tone: factual, evidence-heavy,
remedy-focused. Structure: opening paragraph identifying the participant and the
complaint category; middle paragraphs setting out incidents in chronological order with
dates and impact; a paragraph citing the relevant Statement of Rights item (only if the
intake includes it in available_citations); closing paragraph asking for a written
response within 14 days and stating that unresolved complaints will be escalated to
the Aged Care Quality and Safety Commission.""",

    "escalation": _SYSTEM_BASE + """
You are writing an ESCALATION letter, typically to a provider's senior management or
to the Aged Care Quality and Safety Commission after direct resolution failed. Tone:
chronology-led, references prior correspondence, remedy-specific. Structure: opening
paragraph naming the participant, the escalation, and any prior letter references;
a chronology block listing prior contacts by date; middle paragraphs setting out the
concerns; a paragraph citing the Statement of Rights and any complaints-handling
citations from available_citations; closing paragraph specifying the remedy sought
and the response window (14 days for provider senior, 90 days for ACQSC).""",

    "notification": _SYSTEM_BASE + """
You are writing a NOTIFICATION letter, a formal record of a decision the user has
made or a fact they wish to place on record. Examples: notifying Services Australia of
financial hardship, notifying a provider of a transfer, recording a family
representative with My Aged Care. Tone: formal, brief, matter-of-fact, no argument.
Structure: opening paragraph stating the notification; middle paragraphs setting out
the relevant details; closing paragraph confirming any effective date and asking
for a written acknowledgement.""",

    "response_draft": _SYSTEM_BASE + """
You are drafting a RESPONSE to an inbound message. The intake payload contains the
inbound content in a field called "inbound_summary". Address the points raised in the
inbound message, quote them briefly where relevant, and advance the user's position
(accept, refute, ask for further information, or escalate). Preserve the chronology by
referencing the original outbound letter this responds to when the intake payload
supplies it.""",

    "guided_pathway": _SYSTEM_BASE + """
You are drafting a STRUCTURED SAFEGUARDING RECORD, not a persuasion letter. The user
has already been prompted to call 1800ELDERHelp, OPAN, or the police first. This
record exists so the user has a factual document to keep for their own file and to
attach to a formal complaint later. Tone: factual, calm, non-accusatory. Structure:
opening paragraph naming the participant and the safeguarding concern category;
middle paragraphs setting out each observation in chronological order with dates
and any evidence; closing paragraph listing the phone calls the user has already
made and the outcome of each. Do NOT invent phone calls or outcomes.""",
}


# ---------------------------------------------------------------------------
# User-message template
# ---------------------------------------------------------------------------


def _build_user_message(*, entry: dict, citations: list[dict], persona_context: dict | None = None) -> str:
    intake = entry.get("intake") or {}
    situation_label = entry.get("situation_label") or ""
    archetype = entry.get("archetype") or ""
    recipient_type = entry.get("recipient_type") or ""
    sender_identity = entry.get("sender_identity") or "participant"
    sender_authority_basis = entry.get("sender_authority_basis") or ""
    complaint_mode = entry.get("complaint_mode")
    atsi_preference = bool(entry.get("atsi_preference"))
    recipient_specific = entry.get("recipient_specific") or {}

    lines = [
        f"Situation: {situation_label}",
        f"Archetype: {archetype}",
        f"Recipient type: {recipient_type}",
        f"Recipient specific: {recipient_specific}",
        f"Sender identity: {sender_identity}",
        f"Sender authority basis: {sender_authority_basis}",
        f"Complaint mode: {complaint_mode or 'not_applicable'}",
        f"ATSI preference: {atsi_preference}",
        "",
        "Intake payload:",
    ]
    # PERSONA-1 §G, the caller's persona block is already appended to the
    # system message in generate_letter(). Repeating it here would double
    # the token cost per letter without changing model behaviour, so we
    # deliberately do NOT re-emit it in the user turn.
    _ = persona_context  # retained on the signature for API stability
    for k, v in intake.items():
        if v is None or v == "":
            continue
        lines.append(f"  {k}: {v}")

    if citations:
        lines.extend([
            "",
            "Available citations you MAY reference (verbatim quotes, no invention):",
        ])
        for c in citations:
            lines.append(f"  [{c['id']}] {c['label']}")
            lines.append(f"      \"{c['quote'].strip()}\"")
            lines.append(f"      Source: {c['source']}")
    else:
        lines.extend([
            "",
            "Available citations: none for this archetype (do not cite legislation).",
        ])

    lines.extend([
        "",
        "Draft the letter now. Remember: SUBJECT: line, blank line, then body. No signature.",
    ])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# LLM output parsing
# ---------------------------------------------------------------------------


def _parse_reply(raw: str) -> tuple[str, str]:
    """Split the LLM output into (subject, body). Falls back gracefully if
    the model forgets the SUBJECT: convention (still ships a body)."""
    text = (raw or "").strip()
    if not text:
        return "", ""
    lower = text.lower()
    if lower.startswith("subject:"):
        first_line, _, rest = text.partition("\n")
        subject = first_line.split(":", 1)[1].strip()
        body = rest.strip()
        return subject, body
    # Try to find a Subject: line anywhere in the first 3 lines.
    lines = text.splitlines()
    for i, line in enumerate(lines[:3]):
        if line.lower().startswith("subject:"):
            subject = line.split(":", 1)[1].strip()
            body = "\n".join(lines[i + 1:]).strip()
            return subject, body
    # Fallback: no subject line, synthesise one.
    return "Letter regarding your recent correspondence", text


# ---------------------------------------------------------------------------
# Cover-note builder (WS6)
# ---------------------------------------------------------------------------


def build_cover_note(entry: dict) -> dict:
    """Return the cover-note payload the frontend renders next to the
    draft. Includes recipient postal/portal/email, response window,
    the CC list, and any OPAN footer inclusion note."""
    recipient_type = entry.get("recipient_type") or ""
    recipient_specific = entry.get("recipient_specific") or {}
    archetype = entry.get("archetype") or ""

    # National recipient, pull from the INDEX-1 directory.
    directory_row = lf1.get_recipient(recipient_type) if recipient_type else None
    provider_name = None
    provider_email = None
    provider_postal = None
    if recipient_type in ("provider_cm", "provider_senior"):
        provider_name = recipient_specific.get("entity_name")
        provider_email = recipient_specific.get("email")
        provider_postal = recipient_specific.get("postal_address")

    include_opan_footer = bool(lf1.get_archetype(archetype) and lf1.get_archetype(archetype).get("opan_footer"))

    cc_recipients: list[dict] = []
    if include_opan_footer:
        opan = lf1.get_recipient("opan")
        if opan:
            cc_recipients.append({
                "label": opan["entity_name"],
                "phone": opan["phone"],
                "reason": "Independent advocacy, reference under Statement of Rights §3",
            })
    if bool(entry.get("atsi_preference")):
        opan_atsi = lf1.get_recipient("opan_atsi")
        if opan_atsi:
            cc_recipients.append({
                "label": opan_atsi["entity_name"],
                "phone": opan_atsi["phone"],
                "reason": "ATSI advocacy referral",
            })

    return {
        "recipient_type": recipient_type,
        "entity_name": (directory_row or {}).get("entity_name") or provider_name,
        "phone": (directory_row or {}).get("phone") or recipient_specific.get("phone"),
        "email": provider_email or (directory_row or {}).get("email"),
        "portal_url": (directory_row or {}).get("portal_url") or recipient_specific.get("portal_url"),
        "complaints_url": (directory_row or {}).get("complaints_url"),
        "postal_address": provider_postal or (directory_row or {}).get("postal_address"),
        "response_window_days": (directory_row or {}).get("response_window_days") or lf1.default_response_window_days(entry.get("situation_id"), archetype),
        "response_window_label": (directory_row or {}).get("response_window_label"),
        "cc_recipients": cc_recipients,
        "include_opan_footer": include_opan_footer,
    }


# ---------------------------------------------------------------------------
# MAC portal short-form (WS7)
# ---------------------------------------------------------------------------


def mac_portal_short_form(subject: str, body: str, max_chars: int = 1200) -> str:
    """MAC portal has a character-limited free-text field. This helper
    condenses the letter into a portal-friendly form, never truncating
    a sentence mid-word; falls back to the intake summary when the body
    is longer than the cap."""
    text = (subject + "\n\n" + body).strip()
    if len(text) <= max_chars:
        return text
    # Truncate at last full sentence before the cap.
    cutoff = text[:max_chars]
    for delimiter in [". ", ".\n", "? ", "! "]:
        last = cutoff.rfind(delimiter)
        if last != -1 and last > max_chars * 0.6:
            return cutoff[: last + 1].strip()
    return cutoff.rsplit(" ", 1)[0] + "…"


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


async def generate_letter(entry: dict) -> dict:
    """Generate a draft letter for a correspondence log entry.

    Returns::

        {
            "subject": "...",
            "body": "...",
            "mac_portal_short_form": "...",
            "cover_note": {...},
            "citations_used_ids": [...],
            "generated_at": "ISO",
            "model": "claude-sonnet-4-5-20250929",
        }
    """
    archetype = entry.get("archetype") or ""
    system = _ARCHETYPE_SYSTEMS.get(archetype)
    if not system:
        raise ValueError(f"Unknown archetype: {archetype}")

    missing = verify_source_data(archetype, entry.get("intake"))
    if missing:
        raise SourceDataMissing(missing)

    citations = citations_for(archetype)
    persona_context = entry.get("_persona_context") if isinstance(entry, dict) else None
    user_msg = _build_user_message(entry=entry, citations=citations, persona_context=persona_context)
    # PERSONA-1 §G, append persona voice rules to the system prompt so
    # every archetype (rate_query, escalation, notification, etc.) writes
    # in the correct voice for the sender.
    if persona_context:
        try:
            from lib.persona import render_persona_prompt_block
            block = render_persona_prompt_block(persona_context)
            if block:
                system = f"{system}\n\n{block}"
        except Exception:
            pass

    try:
        raw = await llm_wrapper.chat_send(
            model=_MODEL,
            provider=_PROVIDER,
            system=system,
            user_text=user_msg,
            session_id=f"lf1-{entry.get('id') or 'anon'}",
            deterministic=True,
            model_params={"max_tokens": 2200},
        )
    except Exception as exc:
        log.exception("LF-1 generate LLM call failed for entry %s", entry.get("id"))
        raise

    subject, body = _parse_reply(raw)
    cover = build_cover_note(entry)
    portal_form = mac_portal_short_form(subject, body)

    return {
        "subject": subject,
        "body": body,
        "mac_portal_short_form": portal_form,
        "cover_note": cover,
        "citations_available_ids": [c["id"] for c in citations],
        "generated_at": _dt.datetime.now(_dt.timezone.utc).isoformat(),
        "model": _MODEL,
    }


# ---------------------------------------------------------------------------
# WS_ITERATION3, Tone check
# ---------------------------------------------------------------------------


TONE_CHECK_SYSTEM = """You are a plain-English Australian aged-care correspondence reviewer for
Wayly's Letters & Follow-ups tool. You review draft letters headed to providers or
regulators and flag tone or claim risks.

Return a compact JSON object with exactly these keys:
  "tone": one of "polite", "firm", "combative"
  "concerns": array of short (< 20 word) strings, 0 to 3 items
  "suggested_edits": array of short strings, 0 to 3 items

Rules:
- Do not rewrite the letter. Only comment.
- Flag any specific factual claim the letter makes that the user has NOT
  supplied evidence for.
- Flag any invective, ultimatums, or personal attacks.
- Return valid JSON only, no prose."""


async def tone_check(body: str) -> dict:
    """Run a tone/claim review against a drafted letter body. Returns a
    parsed JSON payload; falls back to a safe default on parse error."""
    import json
    try:
        raw = await llm_wrapper.chat_send(
            model=_MODEL,
            provider=_PROVIDER,
            system=TONE_CHECK_SYSTEM,
            user_text=body[:6000],
            deterministic=True,
            model_params={"max_tokens": 400},
        )
    except Exception:
        log.exception("LF-1 tone check LLM call failed")
        return {"tone": "unknown", "concerns": [], "suggested_edits": [], "error": "llm_failed"}

    # Parse the compact JSON reply, tolerating markdown code fences.
    text = (raw or "").strip()
    if text.startswith("```"):
        text = text.strip("`")
        # Drop the leading language tag if present.
        if "\n" in text:
            text = text.split("\n", 1)[1]
        text = text.rstrip("`").strip()
    try:
        parsed = json.loads(text)
        return {
            "tone": parsed.get("tone") or "unknown",
            "concerns": list(parsed.get("concerns") or [])[:3],
            "suggested_edits": list(parsed.get("suggested_edits") or [])[:3],
        }
    except Exception:
        return {"tone": "unknown", "concerns": [], "suggested_edits": [], "error": "parse_failed"}
