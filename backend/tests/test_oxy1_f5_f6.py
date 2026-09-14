"""OXY-1 v1 · Partial Authorisation (F5 + F6 only) tests.

Only tests O10 (Ask Wayly system prompt mentions certification) and O12
(copy source-of-truth constant exists exactly once) are in scope for this
authorisation. O1-O9 and O11 are held pending Privacy Policy v1.2 sign-off.

O12 is exercised by test_monetary_constants::test_oxy1_f6_certification_copy_string_appears_once.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agents  # noqa: E402


def test_O10_ask_wayly_system_prompt_mentions_oxygen_certification():
    """Ask Wayly's chat system prompt must:
      - mention the $14.66/day amount (rendered from registry)
      - cite section 196-15
      - describe the certification requirement in plain language
      - NOT tell the caregiver whether the participant qualifies
    """
    # Render placeholders via the INDEX-1 render helper first — the raw
    # template now uses {oxygen_daily} etc.
    from monetary_constants import render_prompt as _rp
    try:
        prompt = _rp(agents.CHAT_SYSTEM_TEMPLATE)
    except Exception:
        prompt = agents.CHAT_SYSTEM_TEMPLATE
    assert "$14.66/day" in prompt, "Oxygen daily rate ($14.66/day) missing from Ask Wayly system prompt."
    assert "section 196-15" in prompt, "Section 196-15 citation missing from Ask Wayly system prompt."
    # Plain-language certification framing
    assert "medical practitioner" in prompt, (
        "Ask Wayly should mention medical practitioner certification."
    )
    # The "no eligibility opinion" guardrail
    assert (
        "Do not tell the caregiver whether the participant qualifies" in prompt
        or "do not tell the caregiver whether the participant qualifies" in prompt
    ), "Ask Wayly prompt must not offer an eligibility opinion."


def test_O10_ask_wayly_does_not_offer_to_draft_certification_letter():
    """Guardrail: Wayly should never volunteer to draft the certification letter."""
    prompt = agents.CHAT_SYSTEM_TEMPLATE
    assert "do not draft" in prompt.lower(), (
        "Ask Wayly must explicitly refuse to draft the certification letter."
    )
