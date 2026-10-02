"""INDEX-1 v1 · Deploy 1b tests — LLM prompt render helper + no output drift.

Deploy 1b consumer migration replaces hard-coded dollar amounts in
``agents.py`` prompts with placeholders that the registry substitutes at
render time. These tests prove:

- The `render_prompt` helper substitutes known keys.
- Unknown placeholders survive unchanged (fail-open, not KeyError).
- The rendered CHAT_SYSTEM_TEMPLATE contains the current cap values.
- The DEC-1 test suite still passes with the refactored prompt (proof of
  no behavioural drift — asserted by the parent test runner, not this file).
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import monetary_constants as mc  # noqa: E402
import agents  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def _load_registry():
    """Load the monetary_constants YAML for this test module. The session-scoped
    conftest fixture wires up program_reference only, not monetary_constants."""
    if not mc.REGISTRY._loaded:
        mc.REGISTRY.load()
    yield


def test_render_prompt_substitutes_known_placeholders():
    template = "Oxygen is {oxygen_daily}. Cap is {lifetime_cap_standard}."
    out = mc.render_prompt(template, as_of=date(2026, 3, 20))
    assert "$14.66/day" in out
    assert "$137,917.01" in out


def test_render_prompt_leaves_unknown_placeholders_intact():
    """A prompt author can add a placeholder before the registry key exists;
    the string stays literal so the missing key is discoverable in review."""
    template = "New value is {newly_named_key_not_in_registry}."
    out = mc.render_prompt(template)
    assert "{newly_named_key_not_in_registry}" in out


def test_render_prompt_supplement_daily_amounts_present():
    """Every supplement placeholder used by the CHAT_SYSTEM_TEMPLATE has a
    value in the registry."""
    for k in [
        "oxygen_daily",
        "enteral_bolus_daily",
        "enteral_non_bolus_daily",
        "care_management_daily",
        "eachd_top_up_daily",
        "veterans_pct",
        "dementia_pct",
        "lifetime_cap_standard",
        "lifetime_cap_no_worse_off",
    ]:
        ctx = mc.REGISTRY.prompt_context()
        assert ctx.get(k), f"Registry missing prompt placeholder value for {k!r}"


def test_chat_system_template_still_contains_placeholders():
    """The refactor should leave placeholders in the raw template — real
    substitution happens at request time via _render_chat_system."""
    tpl = agents.CHAT_SYSTEM_TEMPLATE
    assert "{oxygen_daily}" in tpl
    assert "{lifetime_cap_standard}" in tpl
    # And crucially the certification guardrail is still present (OXY-1 F5).
    assert "medical practitioner" in tpl


def test_render_chat_system_substitutes_placeholders_end_to_end():
    context = {
        "caregiver_name": "Cathy",
        "participant_name": "Dorothy",
        "classification": "Classification 4",
        "annual": 29696,
        "quarterly": 6681.60,
        "provider": "BlueBerry Care",
        "quarter_label": "Q1 2026",
        "burn": "Everyday Living $500",
        "contributions_total": 50000,
        "cap": 137917.01,
        "statement_summary": "Statement looks clean.",
    }
    system = agents._render_chat_system(context)
    # Registry values landed
    assert "$14.66/day" in system
    assert "$137,917.01" in system
    # Runtime context landed
    assert "Cathy" in system
    assert "Dorothy" in system
    # No stray placeholders (fully rendered)
    assert "{oxygen_daily}" not in system
    assert "{caregiver_name}" not in system


def test_render_chat_system_survives_missing_registry():
    """When monetary_constants is unavailable (early boot / test env), the
    render helper falls back to the un-substituted template so runtime
    formatting still works."""
    # Save + zero the registry
    saved_keys = mc.REGISTRY._by_key
    mc.REGISTRY._by_key = {}
    try:
        context = {
            "caregiver_name": "Cathy",
            "participant_name": "Dorothy",
            "classification": "Classification 4",
            "annual": 29696,
            "quarterly": 6681.60,
            "provider": "BlueBerry Care",
            "quarter_label": "Q1 2026",
            "burn": "Everyday Living $500",
            "contributions_total": 50000,
            "cap": 137917.01,
            "statement_summary": "Statement looks clean.",
        }
        system = agents._render_chat_system(context)
        # Runtime formatting should still succeed even without registry values.
        assert "Cathy" in system and "Dorothy" in system
    finally:
        mc.REGISTRY._by_key = saved_keys
