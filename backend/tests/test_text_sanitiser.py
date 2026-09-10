"""Pytest coverage for backend.lib.text_sanitiser.

Wayly voice rules require em/en dashes to be stripped from LLM output. These
assertions lock the behaviour in place so a future edit cannot silently
regress the caregiver-facing tone.
"""
from lib.text_sanitiser import (
    strip_wayly_dashes,
    append_tone_rules,
    WAYLY_TONE_INSTRUCTIONS,
)


class TestStripDashes:
    def test_em_dash_between_words(self):
        assert strip_wayly_dashes("Louisa Davids — my mother.") == "Louisa Davids, my mother."

    def test_en_dash_number_range(self):
        assert strip_wayly_dashes("Charges from 4–14 Feb.") == "Charges from 4, 14 Feb."

    def test_hyphen_is_preserved(self):
        assert strip_wayly_dashes("7-day free trial and self-check.") == "7-day free trial and self-check."

    def test_leading_dash_is_stripped(self):
        assert strip_wayly_dashes("— This is a test.") == "This is a test."

    def test_multiple_dashes_collapse_cleanly(self):
        assert strip_wayly_dashes("First — second — third.") == "First, second, third."

    def test_word_glued_em_dash(self):
        # No spaces around the dash.
        assert strip_wayly_dashes("word—word") == "word, word"

    def test_no_op_when_no_dashes(self):
        assert strip_wayly_dashes("Nothing to change here.") == "Nothing to change here."

    def test_empty_string(self):
        assert strip_wayly_dashes("") == ""

    def test_none_returns_none(self):
        assert strip_wayly_dashes(None) is None

    def test_json_string_value_stays_valid(self):
        import json
        raw = '{"summary": "This is a summary — with dashes."}'
        sanitised = strip_wayly_dashes(raw)
        assert "—" not in sanitised
        # JSON must still parse.
        parsed = json.loads(sanitised)
        assert parsed["summary"] == "This is a summary, with dashes."


class TestAppendToneRules:
    def test_appends_wayly_voice_rules(self):
        out = append_tone_rules("Base system message.")
        assert "Base system message." in out
        assert "Wayly voice rules" in out

    def test_is_idempotent(self):
        once = append_tone_rules("Base.")
        twice = append_tone_rules(once)
        assert twice == once

    def test_returns_rules_when_system_is_empty(self):
        out = append_tone_rules("")
        assert out == WAYLY_TONE_INSTRUCTIONS

    def test_rules_forbid_em_dash_explicitly(self):
        assert "em dash" in WAYLY_TONE_INSTRUCTIONS.lower()
        assert "en dash" in WAYLY_TONE_INSTRUCTIONS.lower()

    def test_rules_forbid_generic_ai_phrasing(self):
        assert "delve" in WAYLY_TONE_INSTRUCTIONS.lower()
