"""PERSONA-1 — persona context helper unit tests.

Covers the shared prompt-injection block used by Ask Wayly, help chat,
LF-1 letters, and the reports executive summary.
"""
from __future__ import annotations

import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from lib.persona.context import render_persona_prompt_block  # noqa: E402


def test_empty_profile_returns_empty_block():
    assert render_persona_prompt_block(None) == ""
    assert render_persona_prompt_block({}) == ""
    # Flag off → also empty.
    assert render_persona_prompt_block({"flag_enabled": False, "viewer_persona": "caregiver"}) == ""


def test_participant_block_contains_first_person_rule():
    block = render_persona_prompt_block({
        "flag_enabled": True,
        "viewer_persona": "participant",
        "first_name": "Louisa",
        "pronouns": "she_her",
        "is_authorised_representative": False,
        "relationship_to_account": None,
        "is_self": True,
    })
    assert "PERSONA CONTEXT" in block
    assert "viewer_persona: participant" in block
    assert "second person" in block  # participant voice rule
    assert "your parent" in block or "loved one" in block  # rule mentions banned phrasings


def test_caregiver_block_contains_pronoun_rules():
    block = render_persona_prompt_block({
        "flag_enabled": True,
        "viewer_persona": "caregiver",
        "first_name": "Louisa",
        "pronouns": "she_her",
        "is_authorised_representative": True,
        "relationship_to_account": "daughter",
        "is_self": False,
    })
    assert "Louisa" in block
    assert "she_her" in block
    assert "daughter" in block
    assert "is_authorised_representative" in block  # rep signing rule
    assert "unknown" in block  # unknown-pronoun fallback rule


def test_block_shape_stable():
    # Contract: always leads with the header line, always ends with the
    # voice rules paragraph. Keeps prompt-injection callers safe to append
    # more text after without re-parsing.
    block = render_persona_prompt_block({
        "flag_enabled": True,
        "viewer_persona": "caregiver",
        "first_name": None,
        "pronouns": "unknown",
        "is_authorised_representative": False,
        "relationship_to_account": None,
        "is_self": False,
    })
    lines = block.splitlines()
    assert lines[0].startswith("PERSONA CONTEXT")
    assert "PERSONA VOICE RULES" in block
