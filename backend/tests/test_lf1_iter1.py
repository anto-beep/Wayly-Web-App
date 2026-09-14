"""LF-1 v1.2 Iteration 1 deterministic tests.

Covers WS1 (situation mapping), WS3 (recipient directory), WS8
(correspondence log data model + enums + response window defaults),
and the constants Iteration 2 will build on.

Live HTTP surface coverage is via curl-driven smoke checks in the
Iteration 1 acceptance sweep and will be extended by the testing agent
after each iteration.
"""
from __future__ import annotations

import pytest

from lib import lf1


# ---------------------------------------------------------------------------
# WS1 — Situation mapping
# ---------------------------------------------------------------------------

def test_twelve_situations_loaded():
    assert len(lf1.SITUATIONS) == 12
    ids = [s["id"] for s in lf1.SITUATIONS]
    assert ids == list(range(1, 13))


def test_situations_reference_valid_archetypes():
    for s in lf1.SITUATIONS:
        assert s["archetype"] in lf1.ARCHETYPES, s


def test_situation_11_is_guided_pathway_no_letter():
    row = lf1.get_situation(11)
    assert row is not None
    assert row["archetype"] == "guided_pathway"
    assert row["default_recipient"] == "elder_abuse_helpline"


def test_situation_12_is_response_draft():
    row = lf1.get_situation(12)
    assert row is not None
    assert row["archetype"] == "response_draft"
    assert row["default_recipient"] is None  # matched to inbound sender


def test_situation_id_can_be_string_or_int():
    assert lf1.get_situation("1") is not None
    assert lf1.get_situation(1) is not None
    assert lf1.get_situation(99) is None


# ---------------------------------------------------------------------------
# Archetype constants
# ---------------------------------------------------------------------------

def test_seven_archetypes_registered():
    assert set(lf1.ARCHETYPES.keys()) == {
        "request", "dispute", "complaint", "escalation",
        "notification", "response_draft", "guided_pathway",
    }


def test_opan_footer_only_on_complaint_and_escalation():
    """Locked decision #11 — OPAN footer on escalation, complaint, ACQSC,
    Ombudsman only. Not on plan amendment, reassessment, RCP, notification."""
    assert lf1.ARCHETYPES["complaint"]["opan_footer"] is True
    assert lf1.ARCHETYPES["escalation"]["opan_footer"] is True
    assert lf1.ARCHETYPES["request"]["opan_footer"] is False
    assert lf1.ARCHETYPES["dispute"]["opan_footer"] is False
    assert lf1.ARCHETYPES["notification"]["opan_footer"] is False
    assert lf1.ARCHETYPES["response_draft"]["opan_footer"] is False


def test_complaint_modes_only_on_complaint_escalation_guided():
    """Locked decision #18 — anonymous/confidential/open modes only on
    ACQSC, Complaints Commissioner, Ombudsman, elder abuse letters."""
    assert lf1.ARCHETYPES["complaint"]["supports_complaint_modes"] is True
    assert lf1.ARCHETYPES["escalation"]["supports_complaint_modes"] is True
    assert lf1.ARCHETYPES["guided_pathway"]["supports_complaint_modes"] is True
    assert lf1.ARCHETYPES["request"]["supports_complaint_modes"] is False
    assert lf1.ARCHETYPES["dispute"]["supports_complaint_modes"] is False
    assert lf1.ARCHETYPES["notification"]["supports_complaint_modes"] is False
    assert lf1.ARCHETYPES["response_draft"]["supports_complaint_modes"] is False


# ---------------------------------------------------------------------------
# WS3 — Recipient directory
# ---------------------------------------------------------------------------

def test_recipient_directory_loads_seed_records():
    rows = lf1.list_recipients()
    keys = {r["key"] for r in rows}
    # 10 seed records per spec + Phase 0 audit.
    assert {"mac", "acqsc", "complaints_commissioner", "ombudsman", "opan",
            "opan_atsi", "elder_abuse_helpline", "police_emergency",
            "services_australia_aged_care", "public_advocate_generic"} <= keys


def test_mac_recipient_carries_phone_and_portal():
    row = lf1.get_recipient("mac")
    assert row is not None
    assert row["phone"] == "1800 200 422"
    assert "myagedcare.gov.au" in row["portal_url"]
    assert row["response_window_days"] == 28


def test_acqsc_recipient_has_90_day_finalisation():
    row = lf1.get_recipient("acqsc")
    assert row["response_window_days"] == 90
    assert row["phone"] == "1800 951 822"


def test_ombudsman_recipient_has_42_day_window():
    row = lf1.get_recipient("ombudsman")
    assert row["response_window_days"] == 42
    assert row["phone"] == "1300 362 072"


def test_opan_recipient_is_advocacy_not_complaints():
    row = lf1.get_recipient("opan")
    assert row["response_window_days"] is None  # advocacy, not a complaint recipient
    assert "cc_default" in (row.get("tags") or [])


def test_directory_metadata_reports_correct_count():
    meta = lf1.directory_metadata()
    assert meta["count"] >= 10
    assert meta["version"] == "1.0"


def test_get_recipient_unknown_returns_none():
    assert lf1.get_recipient("unknown_key") is None


# ---------------------------------------------------------------------------
# Enums (WS8 data model)
# ---------------------------------------------------------------------------

def test_recipient_types_include_all_national_bodies():
    assert "mac" in lf1.RECIPIENT_TYPES
    assert "acqsc" in lf1.RECIPIENT_TYPES
    assert "complaints_commissioner" in lf1.RECIPIENT_TYPES
    assert "ombudsman" in lf1.RECIPIENT_TYPES
    assert "provider_cm" in lf1.RECIPIENT_TYPES
    assert "provider_senior" in lf1.RECIPIENT_TYPES
    assert "services_australia_aged_care" in lf1.RECIPIENT_TYPES


def test_sender_identities_covers_four_roles():
    assert lf1.SENDER_IDENTITIES == frozenset({
        "participant", "family_caregiver", "recorded_representative", "poa",
    })


def test_complaint_modes_three_values():
    assert lf1.COMPLAINT_MODES == frozenset({"open", "confidential", "anonymous"})


def test_directions_are_inbound_outbound():
    assert lf1.DIRECTIONS == frozenset({"inbound", "outbound"})


def test_inbound_sources_cover_four_channels():
    assert lf1.INBOUND_SOURCES == frozenset({"email", "portal", "post", "phone_note"})


def test_correspondence_statuses_include_six_states():
    assert lf1.CORRESPONDENCE_STATUSES == frozenset({
        "draft", "sent", "awaiting_response", "responded", "escalated", "closed",
    })


def test_output_formats_three_values():
    assert lf1.OUTPUT_FORMATS == frozenset({"email", "pdf", "mac_portal"})


# ---------------------------------------------------------------------------
# Response window defaults
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("situation_id,expected", [
    (1, 28),   # Reassessment → MAC → 28 days
    (2, 28),   # RCP → MAC → 28 days
    (3, 14),   # Fee dispute → provider CM → 14 days
    (4, 14),   # Service delivery complaint → provider CM → 14 days
    (5, 10),   # CM unresponsive escalation → 10 days
    (6, 14),   # Care plan amendment → 14 days
    (7, 14),   # Provider transfer → 14 days
    (8, 28),   # Assessment dispute → MAC → 28 days
    (9, 28),   # Hardship → Services Australia → 28 days
    (10, 90),  # Regulator complaint → ACQSC → 90 days
    (11, None), # Guided pathway
    (12, None), # Response draft
])
def test_response_window_defaults_match_spec(situation_id, expected):
    row = lf1.get_situation(situation_id)
    assert row is not None
    assert row["response_window_days"] == expected
    assert lf1.default_response_window_days(situation_id, row["archetype"]) == expected


def test_response_window_fallback_by_archetype_when_situation_missing():
    assert lf1.default_response_window_days(None, "request") == 14
    assert lf1.default_response_window_days(None, "escalation") == 10
    assert lf1.default_response_window_days(None, "guided_pathway") is None
    assert lf1.default_response_window_days(None, "response_draft") == 14


# ---------------------------------------------------------------------------
# Copy blocks (WS14, WS20 T40)
# ---------------------------------------------------------------------------

def test_terms_footer_copy_present_and_states_not_legal_advice():
    assert "not legal advice" in lf1.TERMS_FOOTER_COPY
    assert "responsible for reviewing" in lf1.TERMS_FOOTER_COPY


def test_elder_abuse_safety_copy_includes_three_contacts():
    copy = lf1.ELDER_ABUSE_SAFETY_COPY
    assert copy["headline"] == "Please call first before writing anything."
    phones = [c["phone"] for c in copy["contacts"]]
    assert "1800 353 374" in phones  # ELDERHelp
    assert "1800 700 600" in phones  # OPAN
    assert "000" in phones           # Police
    assert copy["letter_gate_disclosure"]  # gate copy present


# ---------------------------------------------------------------------------
# Rename cascade smoke — verify RLG naming isn't used in the module
# ---------------------------------------------------------------------------

def test_module_uses_new_naming():
    """No 'RLG' or 'Reassessment Letter Drafter' anywhere in the LF-1 module."""
    import inspect
    src = inspect.getsource(lf1)
    assert "RLG" not in src
    assert "Reassessment Letter Drafter" not in src
    assert "Reassessment Letter Generator" not in src
