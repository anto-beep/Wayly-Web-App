"""DEC-1 v5 · Phase 1 regression tests.

Covers:
  - Schema module: enums, backfill helpers (line item / extracted / anomaly),
    computed_line_item_sum determinism.
  - Anti-fabrication module: F1 (GST + provider-mismatch), F3 (service codes),
    F4 (impact traceability), F5 (illegal citations).
  - Env flag: `DEC1_V5_STRICT` controls strict vs log-only behaviour.

None of these tests hit the network or the LLM. They exercise the new
modules directly.

Reference:
  /app/docs/DEC-1_v5_spec.md §Phase 1 + §F1-F5
  /app/docs/audits/DEC-1-v5-phase0-audit.md §14
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.dec1_v5_schema import (  # noqa: E402
    UNIT_VOCAB,
    PER_LINE_CONTRIBUTION_SOURCE_VOCAB,
    LEGISLATIVE_CITATION_ALLOWLIST,
    BANNED_LEGISLATIVE_PHRASES,
    backfill_line_item,
    backfill_extracted,
    backfill_anomaly,
    backfill_anomalies,
    compute_line_item_sum,
    is_valid_unit,
    is_valid_contribution_source,
)
from lib.dec1_v5_antifab import (  # noqa: E402
    strip_hallucinated_service_codes,
    strip_hallucinated_source_field_anomalies,
    audit_impact_traceability,
    strip_illegal_legislative_citations,
    apply_all_anti_fabrication,
)

# ---------------------------------------------------------------------------
# Schema — enum + validator smoke tests
# ---------------------------------------------------------------------------

def test_unit_vocab_is_stable_and_complete():
    """v5 §Invariant 11 — units are first-class with a fixed vocabulary."""
    assert UNIT_VOCAB == ("hr", "km", "session", "visit", "ea", "day")
    assert is_valid_unit("hr")
    assert is_valid_unit("km")
    assert not is_valid_unit("hours")   # only enum values pass
    assert not is_valid_unit(None)
    assert not is_valid_unit("")


def test_per_line_contribution_source_vocab():
    """v5 §Phase 1 — RULE_9 gating driver."""
    for v in ("aggregate_only", "per_line", "category_aggregated",
              "percentage_labelled", "unknown"):
        assert v in PER_LINE_CONTRIBUTION_SOURCE_VOCAB
        assert is_valid_contribution_source(v)
    assert not is_valid_contribution_source("something_else")


def test_citation_allowlist_covers_key_sources():
    """v5 §F5 — allowlist includes the Act, the Program Manual, and the Rules."""
    joined = " ".join(LEGISLATIVE_CITATION_ALLOWLIST).lower()
    assert "aged care act 2024" in joined
    assert "support at home program manual" in joined
    assert "aged care rules 2025" in joined
    # Banned phrases are vague — they must not accidentally be on the allowlist.
    for banned in BANNED_LEGISLATIVE_PHRASES:
        assert not any(banned in ok.lower() for ok in LEGISLATIVE_CITATION_ALLOWLIST)


# ---------------------------------------------------------------------------
# Backfill helpers — pre-v5 data reads correctly under v5 shape
# ---------------------------------------------------------------------------

def test_backfill_line_item_populates_missing_v5_fields():
    """Pre-v5 line item has hours>0, no unit — backfill fills unit='hr'."""
    pre_v5 = {"date": "2026-04-05", "service_description": "Domestic",
              "hours": 2.0, "unit_rate": 75.0, "gross": 150.0,
              "participant_contribution": 25.0, "government_paid": 125.0}
    out = backfill_line_item(pre_v5)
    assert out["quantity"] == 2.0
    assert out["unit"] == "hr"
    assert out["raw_qty_text"] is None
    assert out["raw_rate_text"] is None
    # Existing fields untouched.
    assert out["hours"] == 2.0
    assert out["gross"] == 150.0
    # Never mutates input.
    assert "quantity" not in pre_v5


def test_backfill_line_item_leaves_unit_none_when_hours_zero():
    """Cancellations / lump sums with hours==0 must not default to 'hr'."""
    pre_v5 = {"hours": 0.0, "gross": 0.0, "is_cancellation": True}
    out = backfill_line_item(pre_v5)
    assert out["unit"] is None
    assert out["quantity"] is None


def test_backfill_line_item_preserves_existing_v5_values():
    """Idempotent: v5-native rows survive without loss."""
    v5_native = {"quantity": 18.0, "unit": "km", "raw_qty_text": "18 km",
                 "raw_rate_text": "$1.20/km", "hours": 0.0, "unit_rate": 1.20,
                 "gross": 21.60}
    out = backfill_line_item(v5_native)
    assert out["quantity"] == 18.0
    assert out["unit"] == "km"
    assert out["raw_qty_text"] == "18 km"
    # Calling twice is identical to once.
    assert backfill_line_item(out) == out


def test_backfill_extracted_fills_missing_top_level_fields():
    pre_v5 = {
        "participant_name": "Margaret",
        "line_items": [{"hours": 1.0, "gross": 78.0}],
        "quarterly_budget_total": 3250.0,
    }
    out = backfill_extracted(pre_v5)
    assert "source_declared_services_total" in out
    assert out["source_declared_services_total"] is None
    assert "per_line_contribution_source" in out
    # Legacy quarterly_budget_total should backfill quarterly_allocation.
    assert out["quarterly_allocation"] == 3250.0
    # Line items also backfilled.
    assert out["line_items"][0]["unit"] == "hr"


def test_backfill_anomaly_adds_evidence_and_impact_fields():
    a = {"rule": "RULE_25_SOURCE_ARITHMETIC_GAP", "severity": "medium"}
    out = backfill_anomaly(a)
    assert out["source_evidence"] == []
    assert out["impact_aud"] is None
    # Doesn't overwrite existing values.
    a2 = {"rule": "X", "source_evidence": ["excerpt"], "impact_aud": 21.5}
    out2 = backfill_anomaly(a2)
    assert out2["source_evidence"] == ["excerpt"]
    assert out2["impact_aud"] == 21.5


def test_backfill_anomalies_list_wrapper():
    out = backfill_anomalies([{"rule": "A"}, {"rule": "B"}])
    assert all("source_evidence" in a and "impact_aud" in a for a in out)


# ---------------------------------------------------------------------------
# compute_line_item_sum — deterministic, ignores cancellations
# ---------------------------------------------------------------------------

def test_compute_line_item_sum_ignores_cancellations():
    items = [
        {"gross": 78.00, "is_cancellation": False},
        {"gross": 136.00, "is_cancellation": False},
        {"gross": 21.60, "is_cancellation": False},
        {"gross": 999.00, "is_cancellation": True},   # excluded
    ]
    assert compute_line_item_sum(items) == 235.60


def test_compute_line_item_sum_deterministic_across_orderings():
    a = [{"gross": 1.11}, {"gross": 2.22}, {"gross": 3.33}]
    b = list(reversed(a))
    assert compute_line_item_sum(a) == compute_line_item_sum(b) == 6.66


# ---------------------------------------------------------------------------
# F1 — anti-hallucinated field anomalies (GST + provider mismatch)
# ---------------------------------------------------------------------------

def test_f1_gst_strip_in_strict_mode():
    """Source has no 'GST' — GST anomaly must be strippable."""
    src = "Better Care at Home Services Pty Ltd — 1 June 2026 to 30 June 2026"
    anoms = [
        {"rule": "RULE_27_GST_ON_GST_FREE", "severity": "medium",
         "message": "GST is being charged on GST-free care services."},
        {"rule": "RULE_9_PENSION_STATUS_UNKNOWN", "severity": "low",
         "message": "Pension status is not stated."},
    ]
    kept, stripped = strip_hallucinated_source_field_anomalies(
        anoms, src, strict=True,
    )
    assert len(kept) == 1
    assert kept[0]["rule"] == "RULE_9_PENSION_STATUS_UNKNOWN"
    assert len(stripped) == 1
    assert stripped[0].pattern == "F1"


def test_f1_gst_pass_when_source_mentions_gst():
    src = "GST-inclusive amounts shown below.\nDomestic care: $75 (GST-free)"
    anoms = [{"rule": "RULE_27_GST_ON_GST_FREE", "message": "GST issue"}]
    kept, stripped = strip_hallucinated_source_field_anomalies(
        anoms, src, strict=True,
    )
    assert len(kept) == 1
    assert len(stripped) == 0


def test_f1_log_only_mode_preserves_anomaly():
    src = "source with no such token here"
    anoms = [{"rule": "R", "message": "GST charged"}]
    kept, stripped = strip_hallucinated_source_field_anomalies(
        anoms, src, strict=False,
    )
    # log-only: kept list unchanged, but strip events recorded.
    assert len(kept) == 1
    assert len(stripped) == 1


def test_f1_provider_mismatch_strip_when_no_source_evidence():
    """v5 §F1: RULE_32 without source_evidence is unverifiable → strip."""
    src = (
        "Better Care at Home Services Pty Ltd\nSupport at Home Statement\n"
        + "..." * 40
        + "\nBetter Care at Home Services Pty Ltd — Phone 1300 000 000"
    )
    anoms = [{
        "rule": "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH",
        "severity": "medium",
        "message": "Provider name in the header does not match the footer",
        # note: no source_evidence provided → cannot be verified.
    }]
    kept, stripped = strip_hallucinated_source_field_anomalies(
        anoms, src, strict=True,
    )
    assert kept == []
    assert len(stripped) == 1
    assert stripped[0].pattern == "F1"


def test_f1_provider_mismatch_kept_when_source_evidence_supplied():
    """RULE_32 WITH two DISTINCT evidence strings stays — auditor did work."""
    src = "Any source text at all"
    anoms = [{
        "rule": "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH",
        "severity": "medium",
        "message": "Header says X, footer says Y",
        "source_evidence": ["header: ACME Care Pty Ltd", "footer: XYZ Services Pty Ltd"],
    }]
    kept, stripped = strip_hallucinated_source_field_anomalies(
        anoms, src, strict=True,
    )
    assert len(kept) == 1
    assert stripped == []


def test_f1_provider_mismatch_stripped_when_evidence_is_substring():
    """LLM auditor's hallucination pattern: truncates a full name and calls
    the truncation a 'footer' distinct from the full 'header'. Since one is
    a substring of the other, this is not a real mismatch."""
    src = "Better Care at Home Services Pty Ltd — Phone 1300 000 000"
    anoms = [{
        "rule": "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH",
        "severity": "medium",
        "source_evidence": [
            "header: Better Care at Home Services Pty Ltd",
            "footer: Home Services Pty Ltd",   # substring of header
        ],
    }]
    kept, stripped = strip_hallucinated_source_field_anomalies(
        anoms, src, strict=True,
    )
    assert kept == []
    assert len(stripped) == 1
    assert stripped[0].pattern == "F1"


def test_f1_provider_mismatch_stripped_when_only_one_evidence_string():
    """A mismatch claim requires TWO differing strings. One string is not
    a valid mismatch."""
    src = "Any source text"
    anoms = [{
        "rule": "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH",
        "source_evidence": ["ACME Pty Ltd"],
    }]
    kept, stripped = strip_hallucinated_source_field_anomalies(
        anoms, src, strict=True,
    )
    assert kept == []
    assert len(stripped) == 1


# ---------------------------------------------------------------------------
# F3 — anti-hallucinated service codes
# ---------------------------------------------------------------------------

def test_f3_strips_all_service_codes_when_source_has_none():
    """Margaret case: source shows no codes, decoder invented PT/PC/TR/DA."""
    src = ("Better Care at Home Services Pty Ltd\n"
           "Personal Care — Morning shower\n"
           "Domestic Assistance — Cleaning and laundry\n"
           "Transport — GP appointment\n")
    items = [
        {"date": "02/06", "service_description": "Personal Care", "service_code": "PC"},
        {"date": "03/06", "service_description": "Domestic Assistance", "service_code": "DA"},
        {"date": "05/06", "service_description": "Transport", "service_code": "TR"},
    ]
    kept, stripped = strip_hallucinated_service_codes(items, src, strict=True)
    assert all(li.get("service_code") == "" for li in kept)
    assert len(stripped) == 3
    for ev in stripped:
        assert ev.pattern == "F3"


def test_f3_leaves_codes_when_source_actually_contains_codes():
    src = ("PC-001 Personal Care — Morning shower\n"
           "DA-002 Domestic Assistance — Cleaning\n"
           "TR-003 Transport — GP appointment\n")
    items = [
        {"service_description": "Personal Care", "service_code": "PC-001"},
    ]
    kept, stripped = strip_hallucinated_service_codes(items, src, strict=True)
    assert kept[0]["service_code"] == "PC-001"
    assert stripped == []


def test_f3_log_only_mode_never_mutates():
    src = "no codes anywhere\nPersonal Care\nDomestic Assistance"
    items = [{"service_description": "Personal Care", "service_code": "PC"}]
    kept, stripped = strip_hallucinated_service_codes(items, src, strict=False)
    assert kept[0]["service_code"] == "PC"   # unchanged in log-only
    assert len(stripped) == 1


# ---------------------------------------------------------------------------
# F4 — impact traceability
# ---------------------------------------------------------------------------

def test_f4_traceable_impact_is_kept():
    items = [{"gross": 78.00}, {"gross": 136.00}, {"gross": 21.60}]
    anoms = [{"rule": "R25", "impact_aud": 21.60}]
    kept, stripped = audit_impact_traceability(anoms, items, strict=True)
    assert kept[0]["impact_aud"] == 21.60
    assert stripped == []


def test_f4_untraceable_impact_is_stripped():
    items = [{"gross": 78.00}, {"gross": 136.00}, {"gross": 21.60}]
    anoms = [{"rule": "R25", "impact_aud": 433.00}]  # not any subset sum
    kept, stripped = audit_impact_traceability(anoms, items, strict=True)
    assert kept[0]["impact_aud"] is None
    assert len(stripped) == 1
    assert stripped[0].pattern == "F4"


def test_f4_null_impact_is_allowed_without_evidence():
    items = [{"gross": 78.00}]
    anoms = [{"rule": "R", "impact_aud": None}]
    kept, stripped = audit_impact_traceability(anoms, items, strict=True)
    assert kept[0]["impact_aud"] is None
    assert stripped == []


def test_f4_subset_sum_2_is_traceable():
    items = [{"gross": 100.00}, {"gross": 21.50}, {"gross": 200.00}]
    anoms = [{"rule": "R", "impact_aud": 121.50}]   # 100 + 21.50
    kept, stripped = audit_impact_traceability(anoms, items, strict=True)
    assert kept[0]["impact_aud"] == 121.50
    assert stripped == []


# ---------------------------------------------------------------------------
# F5 — illegal legislative citations
# ---------------------------------------------------------------------------

def test_f5_banned_citation_stripped():
    anoms = [{
        "rule": "R", "severity": "medium",
        "message": "This is required under Aged Care legislation.",
    }]
    kept, stripped = strip_illegal_legislative_citations(anoms, strict=True)
    assert len(kept) == 1
    assert "required under aged care legislation" not in kept[0]["message"].lower()
    assert stripped[0].pattern == "F5"


def test_f5_allowlisted_citation_is_kept():
    anoms = [{
        "rule": "R",
        "message": "See Aged Care Act 2024 s.194-5 for the classification schedule.",
    }]
    kept, stripped = strip_illegal_legislative_citations(anoms, strict=True)
    assert "s.194-5" in kept[0]["message"]
    assert stripped == []


def test_f5_banned_alongside_allowlisted_is_kept():
    """If the field cites BOTH a specific source and a banned vague phrase,
    the specific source is enough — do not strip."""
    anoms = [{"rule": "R",
              "message": "required under aged care legislation, specifically Aged Care Act 2024 s.194-5"}]
    kept, stripped = strip_illegal_legislative_citations(anoms, strict=True)
    assert kept[0]["message"] == anoms[0]["message"]
    assert stripped == []


# ---------------------------------------------------------------------------
# Combined pipeline
# ---------------------------------------------------------------------------

def test_apply_all_anti_fabrication_covers_all_patterns():
    """Round-trip Margaret's exact defects through the combined pipeline."""
    src = ("Better Care at Home Services Pty Ltd\n"
           "Support at Home Monthly Statement\n"
           "Personal Care Morning shower\n"
           "Domestic Assistance Cleaning\n"
           "Transport GP appointment\n"
           "Better Care at Home Services Pty Ltd Phone 1300 000 000")
    ext = {
        "line_items": [
            {"date": "02/06", "service_code": "PC", "gross": 78.00},
            {"date": "03/06", "service_code": "DA", "gross": 136.00},
        ],
    }
    audit = {"anomalies": [
        {"rule": "RULE_27_GST_ON_GST_FREE", "message": "GST issue detected"},
        {"rule": "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH",
         "message": "Provider header/footer mismatch"},
        {"rule": "RULE_25", "impact_aud": 999.99},   # untraceable
        {"rule": "R", "message": "required under aged care legislation"},
    ]}
    new_ext, new_audit, events = apply_all_anti_fabrication(
        ext, audit, src, strict=True,
    )
    # F3: service codes stripped
    assert all(li["service_code"] == "" for li in new_ext["line_items"])
    # F1: GST anomaly stripped
    rules = [a.get("rule") for a in new_audit["anomalies"]]
    assert "RULE_27_GST_ON_GST_FREE" not in rules
    # F1: provider-mismatch anomaly stripped
    assert "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH" not in rules
    # F4: untraceable impact nulled
    r25 = next(a for a in new_audit["anomalies"] if a.get("rule") == "RULE_25")
    assert r25["impact_aud"] is None
    # F5: banned legislative phrase removed
    r_last = next(a for a in new_audit["anomalies"] if a.get("rule") == "R")
    assert "required under aged care legislation" not in r_last["message"].lower()
    # Events cover all four patterns.
    patterns = {e.pattern for e in events}
    assert {"F1", "F3", "F4", "F5"}.issubset(patterns)


def test_apply_all_anti_fabrication_log_only_preserves_data():
    """Default log-only mode: inputs come back byte-identical shape-wise."""
    src = "Provider name here. Personal Care service."
    ext = {"line_items": [{"service_code": "PC", "gross": 78.00}]}
    audit = {"anomalies": [{"rule": "R", "message": "GST charged"}]}
    new_ext, new_audit, events = apply_all_anti_fabrication(
        ext, audit, src, strict=False,
    )
    # log-only: original values preserved
    assert new_ext["line_items"][0]["service_code"] == "PC"
    assert new_audit["anomalies"][0]["message"] == "GST charged"
    # But strip events are recorded so we can see what strict WOULD do.
    assert any(e.pattern == "F3" for e in events)
    assert any(e.pattern == "F1" for e in events)


# ---------------------------------------------------------------------------
# Env flag toggles strict mode
# ---------------------------------------------------------------------------

def test_env_flag_defaults_to_log_only(monkeypatch):
    monkeypatch.delenv("DEC1_V5_STRICT", raising=False)
    src = "Statement with no such token here"
    anoms = [{"rule": "R", "message": "GST charged"}]
    kept, stripped = strip_hallucinated_source_field_anomalies(anoms, src)
    # No explicit strict= → reads env → default OFF → keeps anomaly
    assert len(kept) == 1
    assert len(stripped) == 1


@pytest.mark.parametrize("val,expected_strict", [
    ("true", True), ("TRUE", True), ("1", True), ("yes", True), ("on", True),
    ("false", False), ("0", False), ("no", False), ("", False), ("banana", False),
])
def test_env_flag_parsing(monkeypatch, val, expected_strict):
    monkeypatch.setenv("DEC1_V5_STRICT", val)
    src = "Statement with no such token here"
    anoms = [{"rule": "R", "message": "GST charged"}]
    kept, stripped = strip_hallucinated_source_field_anomalies(anoms, src)
    if expected_strict:
        assert len(kept) == 0   # stripped in strict mode
    else:
        assert len(kept) == 1   # kept in log-only mode
    assert len(stripped) == 1   # always recorded
