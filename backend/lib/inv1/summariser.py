"""INV-1 v1.2 · AI summariser (spec §12 · "Plain-English summary").

Produces a short, plain-English summary of the invoice reconciliation.
Displayed above the verdict banner on the results screen, matching the
Statement Decoder pattern in ``agents.py::parse_statement``.

Design invariants:

- **Grounded, not creative.** The LLM receives every finding, the
  verdict and the extracted lines. It may only paraphrase, never
  invent a figure that is not in the data.
- **Persona-agnostic and calm.** No accusatory language. Every flag is
  framed as "worth checking with your provider", never as "your
  provider is overcharging you".
- **Short.** Two or three sentences plus at most one small list. This
  is a summary, not a report.
- **No em-dashes, no headings, no markdown asterisks.** Plain sentences
  that read aloud naturally.
- **Deterministic fallback.** If the LLM is unavailable or the call
  fails, ``generate_summary`` returns a deterministic template so the
  UI never renders an empty summary.
"""
from __future__ import annotations

import json
import logging
import os
import re
from typing import Any, Dict, List, Optional

logger = logging.getLogger("wayly.inv1.summariser")


_MODEL_PROVIDER = "anthropic"
_MODEL_NAME = os.environ.get(
    "INV1_SUMMARISER_MODEL", "claude-haiku-4-5-20251001",
)


_SYSTEM_PROMPT = """You write short, calm, plain-English summaries of an aged-care invoice check for an Australian family caregiver.

Rules:
- Two or three sentences. No headings. No bullet markers unless you truly need one short list, and even then keep it to two or three lines maximum.
- Plain prose. Do not use em-dashes, en-dashes, double asterisks, backticks, or any markdown formatting.
- Grounded. Only mention figures, categories, dates, provider names and rule references that appear in the data given to you. Never invent a number.
- Australian date format. Every date is DD/MM/YYYY, never YYYY-MM-DD, never Month-name form. If the input contains an ISO date, convert it to DD/MM/YYYY.
- Money uses the "$" symbol with no space, e.g. "$1,234.50", never "1234.5 dollars" or "AUD 1234.50".
- Percentages use the "%" symbol with no space, e.g. "17.5%", never "17.5 percent" or "17.5 per cent".
- Calm and non-accusatory. Every issue is framed as "worth checking with your provider", never as "your provider is overcharging you" or "your provider has made an error".
- Match the verdict. If the verdict is "all clear", say so directly. If it is "check before you pay", say the participant should raise it with their provider before paying.
- When a Tier 4 finding involves the Aged Care Quality and Safety Commission, mention that the ACQSC on 1800 951 822 is available as a next step, but only in one short sentence at the end.
- If a hardship arrangement is active, personal care post 01/10/2026 is contested, or an exit fee appears, mention it explicitly.
- Do not repeat the verdict banner text verbatim. Add colour and specifics.

Your entire response is the summary text. No JSON. No preamble."""


def _scrub_dashes(text: str) -> str:
    """Same discipline as `agents._scrub_dash_separators`."""
    text = re.sub(r"\s*[\u2014\u2013]\s*", " ", text)
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


def _fmt_au_date(s: Any) -> str:
    """Convert an ISO date-ish string to DD/MM/YYYY. Returns str(s) or ''."""
    if not s:
        return ""
    try:
        from datetime import date as _date
        d = _date.fromisoformat(str(s)[:10])
        return f"{d.day:02d}/{d.month:02d}/{d.year}"
    except Exception:
        return str(s)


def _iso_to_au_in_text(text: str) -> str:
    """Rewrite any bare YYYY-MM-DD tokens inside a text blob to DD/MM/YYYY.
    Guards fallback / narrative strings that were composed pre-formatting."""
    if not text:
        return text
    return re.sub(
        r"\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b",
        lambda m: f"{m.group(3)}/{m.group(2)}/{m.group(1)}",
        text,
    )


def _finding_line(f: Dict[str, Any]) -> str:
    """Compact one-line rendering of a finding for the LLM prompt."""
    check_id = f.get("check_id", "?")
    tier = f.get("tier", "?")
    narrative = _iso_to_au_in_text(f.get("narrative") or f.get("suggested_question") or "")
    escalation = " (ACQSC)" if f.get("escalation") == "acqsc" else ""
    return f"- [{check_id} · Tier {tier}]{escalation} {narrative}"


def _fallback_summary(
    reconciliation: Dict[str, Any],
) -> str:
    """Deterministic summary used when the LLM is unavailable."""
    verdict = reconciliation.get("overall_verdict") or "all_clear"
    findings = reconciliation.get("findings") or []
    total_lines = len(reconciliation.get("lines") or [])
    tier_counts = {1: 0, 2: 0, 3: 0, 4: 0}
    for f in findings:
        t = f.get("tier")
        if t in tier_counts:
            tier_counts[t] += 1

    if verdict == "all_clear":
        return (
            f"We read {total_lines} line{'s' if total_lines != 1 else ''} on this "
            "invoice and did not find anything worth raising. Every line reconciles "
            "against the current Support at Home rules."
        )
    if verdict == "items_to_note":
        return (
            f"We read {total_lines} line{'s' if total_lines != 1 else ''} on this "
            f"invoice. Nothing needs urgent action, but there are {tier_counts[2]} "
            "item(s) worth reading before you file this away."
        )
    if verdict == "questions_to_raise":
        return (
            f"We read {total_lines} line{'s' if total_lines != 1 else ''} on this "
            f"invoice and found {tier_counts[3] + tier_counts[4]} line(s) worth "
            "asking your provider about. Each finding below has a suggested "
            "question you can use verbatim."
        )
    # check_before_paying
    return (
        f"We read {total_lines} line{'s' if total_lines != 1 else ''} on this "
        f"invoice and found {tier_counts[4]} item(s) that may breach the "
        "Support at Home rules. Please raise these with your provider before "
        "you pay this invoice. If the response is not satisfactory, the Aged "
        "Care Quality and Safety Commission is available on 1800 951 822."
    )


def _build_prompt(
    reconciliation: Dict[str, Any],
    header: Optional[Dict[str, Any]] = None,
    situation: Optional[Dict[str, Any]] = None,
) -> str:
    findings = reconciliation.get("findings") or []
    lines = reconciliation.get("lines") or []
    verdict = reconciliation.get("overall_verdict") or "all_clear"
    total_gross = sum((ln.get("gross_cost") or 0) for ln in lines)

    parts: List[str] = []
    parts.append(f"Overall verdict: {verdict}")
    parts.append(f"Number of line items: {len(lines)}")
    parts.append(f"Total gross on the invoice: ${total_gross:,.2f}")
    if header:
        if header.get("invoice_date"):
            parts.append(f"Invoice date: {_fmt_au_date(header['invoice_date'])}")
        if header.get("due_date"):
            parts.append(f"Due date: {_fmt_au_date(header['due_date'])}")
        if header.get("period_end"):
            parts.append(f"Billing period ends: {_fmt_au_date(header['period_end'])}")
        if header.get("provider_name"):
            parts.append(f"Provider: {header['provider_name']}")
    if situation:
        ps = situation.get("pension_status")
        if ps and ps != "unknown":
            parts.append(f"Participant pension status: {ps}")
        if situation.get("grandfathered") == "yes":
            parts.append("Participant is grandfathered on 'no worse off' arrangements.")
        if situation.get("hardship") == "yes":
            parts.append("Participant has a hardship arrangement in place.")
        if situation.get("assessment_pending") == "yes":
            parts.append("Participant has a reassessment pending.")

    if findings:
        parts.append("Findings (each already has a suggested question the participant can use):")
        for f in findings:
            parts.append(_finding_line(f))
    else:
        parts.append("No findings, every check passed.")

    return "\n".join(parts)


async def generate_summary(
    reconciliation: Dict[str, Any],
    header: Optional[Dict[str, Any]] = None,
    situation: Optional[Dict[str, Any]] = None,
    session_id: str = "inv1-summary",
) -> str:
    """Return a plain-English summary of the reconciliation. Falls back
    to a deterministic template when the LLM is unavailable."""
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return _fallback_summary(reconciliation)

    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:      # pragma: no cover - defensive
        logger.warning("emergentintegrations unavailable: %s", e)
        return _fallback_summary(reconciliation)

    try:
        chat = LlmChat(
            api_key=key,
            session_id=session_id,
            system_message=_SYSTEM_PROMPT,
        ).with_model(_MODEL_PROVIDER, _MODEL_NAME)
        payload = _build_prompt(reconciliation, header=header, situation=situation)
        msg = UserMessage(text=f"Here is what we found on the invoice:\n\n{payload}\n\nWrite the summary now.")
        raw = await chat.send_message(msg)
        text = _iso_to_au_in_text(_scrub_dashes(str(raw or "")).strip())
        if not text:
            return _fallback_summary(reconciliation)
        return text
    except Exception as e:
        logger.warning("INV-1 summariser failed, using fallback: %s", e)
        return _fallback_summary(reconciliation)
