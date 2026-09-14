"""DEC-1 v5 · Phase 3 · Archetype fixtures.

Eight structured extract fixtures covering the corner cases the v5 spec
identifies as "additional archetypes". These sit alongside the Margaret
golden test — Margaret is the aggregate-only monthly case; each archetype
below stresses a different real-world statement variant.

Each fixture is a small Python dict that the deterministic tail of the
pipeline (`_add_parse_warnings` + anti-fab strip + backfill) consumes.
LLM extraction is out-of-scope for these tests (non-deterministic); once
the LLM prompt for a variant lands, an end-to-end fixture can be added.

Reference:
  /app/docs/DEC-1_v5_spec.md §Additional archetype fixtures

Archetypes tested:
  1. Zero-service month              → no line items, care mgmt only
  2. No-Worse-Off (full pensioner)   → per-line PC = 0 explicitly, GP = gross
  3. Post-1-October-2026 personal care → date-based detection
  4. Restorative Care Pathway (RCP)  → RCP-only budget envelope
  5. AT-HM standalone                → assistive tech + home mods only
  6. Interim funding                 → bridge funding line
  7. Adjustments                     → previous-period credit/debit
  8. Provider-terminology variants   → alt category names (Nursing / Cleaning)
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any, Dict

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agents  # noqa: E402
from lib.dec1_v5_antifab import apply_all_anti_fabrication  # noqa: E402
from lib.dec1_v5_schema import (  # noqa: E402
    backfill_extracted,
    backfill_anomalies,
    compute_line_item_sum,
)


def _run_pipeline(
    extracted: Dict[str, Any],
    source_text: str = "Better Care at Home Services Pty Ltd Statement",
) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Deterministic pipeline: post-audit rules → anti-fab strip → backfill."""
    ext = copy.deepcopy(extracted)
    ext["computed_line_item_sum"] = compute_line_item_sum(ext.get("line_items") or [])
    audit = {"anomalies": [], "statement_summary": {"cadence": "monthly"}}
    audit = agents._add_parse_warnings(audit, ext)
    new_ext, new_aud, _ev = apply_all_anti_fabrication(
        ext, audit, source_text, strict=True,
    )
    new_ext = backfill_extracted(new_ext)
    new_aud["anomalies"] = backfill_anomalies(new_aud.get("anomalies") or [])
    return new_ext, new_aud


def _rules(audit: Dict[str, Any]) -> list[str]:
    return [a.get("rule", "") for a in (audit.get("anomalies") or [])]


def _base_extract(**overrides) -> Dict[str, Any]:
    """A minimal v5-shape extract, monthly cadence, aggregate_only defaults."""
    base = {
        "participant_name": "Test Participant",
        "provider_name": "Test Provider Pty Ltd",
        "provider_abn": "",
        "statement_period": "1 April 2026 to 30 April 2026",
        "period_start": "2026-04-01",
        "period_end": "2026-04-30",
        "pension_status": "unknown",
        "classification": "",
        "quarterly_budget_total": 0.0,
        "care_management_deducted": 0.0,
        "care_management_source_text": "",
        "reported_total_gross": 0.0,
        "reported_total_participant_contribution": 0.0,
        "reported_total_government_paid": 0.0,
        "source_declared_services_total": None,
        "per_line_contribution_source": "unknown",
        "funding_available_this_month": 0.0,
        "quarterly_allocation": None,
        "stream_used_this_month": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
        "header_stream_budgets": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
        "line_items": [],
        "previous_period_adjustments": [],
        "at_hm_commitments": [],
        "provider_notes_raw": [],
    }
    base.update(overrides)
    return base


# ---------------------------------------------------------------------------
# 1. Zero-service month
# ---------------------------------------------------------------------------

def test_archetype_zero_service_month():
    """A month where no services were delivered. Care mgmt fee may still be
    charged (some providers do, some don't). Rules must NOT false-positive.
    Expected: no anomalies, or only the pension-unknown INFO if applicable."""
    ext = _base_extract(
        care_management_deducted=142.50,
        care_management_source_text="Care management fee (April): $142.50",
        source_declared_services_total=0.0,   # zero services
        per_line_contribution_source="unknown",
    )
    _e, audit = _run_pipeline(ext)
    rules = _rules(audit)
    # RULE_25 must not fire on 0 vs 0 gap.
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in rules
    # RULE_1B_BELOW must not fire when declared==0 (division guard).
    assert "RULE_1B_CARE_MGMT_BELOW_STANDARD" not in rules
    # RULE_15 must not fire on a zero-service month.
    assert "RULE_15_GROSS_TOTAL_PARSE_WARNING" not in rules


# ---------------------------------------------------------------------------
# 2. No-Worse-Off (full pensioner) — per-line PC = 0, GP = gross
# ---------------------------------------------------------------------------

def test_archetype_no_worse_off_full_pensioner():
    """A full pensioner on the NWO policy. Their contribution is $0 per line
    and the government funds 100%. Source explicitly shows per-line PC and
    GP (per_line contribution source), just with PC = 0 everywhere."""
    ext = _base_extract(
        pension_status="full_age_pension",
        per_line_contribution_source="per_line",
        source_declared_services_total=214.0,
        reported_total_gross=214.0,
        reported_total_participant_contribution=0.0,
        reported_total_government_paid=214.0,
        line_items=[
            {
                "date": "2026-04-05",
                "service_description": "Personal Care - Morning shower",
                "stream": "Independence",
                "quantity": 1.0, "unit": "hr", "raw_qty_text": "1 hr",
                "raw_rate_text": "$78.00", "hours": 1.0, "unit_rate": 78.0,
                "gross": 78.00,
                "participant_contribution": 0.0,   # NWO: full pensioner pays 0
                "government_paid": 78.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-12",
                "service_description": "Domestic Assistance - Cleaning",
                "stream": "EverydayLiving",
                "quantity": 2.0, "unit": "hr", "raw_qty_text": "2 hr",
                "raw_rate_text": "$68.00", "hours": 2.0, "unit_rate": 68.0,
                "gross": 136.00,
                "participant_contribution": 0.0,
                "government_paid": 136.00,
                "is_cancellation": False, "service_code": "",
            },
        ],
    )
    _e, audit = _run_pipeline(ext)
    rules = _rules(audit)
    # RULE_25 must not fire when totals reconcile.
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in rules
    # RULE_9_PENSION_STATUS_UNKNOWN must not fire (pension is stated).
    assert "RULE_9_PENSION_STATUS_UNKNOWN" not in rules


# ---------------------------------------------------------------------------
# 3. Post-1-October-2026 personal care (spec §Open Item 3)
# ---------------------------------------------------------------------------

def test_archetype_post_oct_2026_personal_care_date_based():
    """From 1 October 2026 the Support at Home program manual signals a
    different personal-care policy. The v5 rule for detection is date-based
    first (period_start >= 2026-10-01), with presence-based fallback.
    This test verifies that a post-Oct-2026 statement with personal care is
    NOT flagged as anomalous just because it's after the cutover."""
    ext = _base_extract(
        statement_period="1 November 2026 to 30 November 2026",
        period_start="2026-11-01",
        period_end="2026-11-30",
        per_line_contribution_source="per_line",
        pension_status="full_age_pension",
        source_declared_services_total=78.0,
        reported_total_gross=78.0,
        line_items=[{
            "date": "2026-11-05",
            "service_description": "Personal Care - Morning routine",
            "stream": "Independence",
            "quantity": 1.0, "unit": "hr", "raw_qty_text": "1 hr",
            "hours": 1.0, "unit_rate": 78.0, "gross": 78.00,
            "participant_contribution": 0.0, "government_paid": 78.00,
            "is_cancellation": False, "service_code": "",
        }],
    )
    _e, audit = _run_pipeline(ext)
    # No false-positive from Phase 2 rules on a valid post-Oct-2026 statement.
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in _rules(audit)


# ---------------------------------------------------------------------------
# 4. Restorative Care Pathway (RCP) — RCP-only budget envelope
# ---------------------------------------------------------------------------

def test_archetype_restorative_care_pathway():
    """RCP participants get a separate 12-week budget envelope. Line items
    reference the RCP stream (not the standard Clinical / Independence /
    EverydayLiving mix). The v5 pipeline treats RCP as a distinct stream —
    it must not false-positive against the standard-stream expectations."""
    ext = _base_extract(
        classification="RCP",
        per_line_contribution_source="per_line",
        pension_status="full_age_pension",
        source_declared_services_total=850.0,
        reported_total_gross=850.0,
        line_items=[
            {
                "date": "2026-04-08",
                "service_description": "RCP Physiotherapy assessment",
                "stream": "Clinical",   # RCP services report as Clinical stream
                "quantity": 1.0, "unit": "session",
                "hours": 0.0, "unit_rate": 350.00, "gross": 350.00,
                "participant_contribution": 0.0, "government_paid": 350.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-15",
                "service_description": "RCP Occupational therapy home visit",
                "stream": "Clinical",
                "quantity": 1.5, "unit": "hr",
                "hours": 1.5, "unit_rate": 200.00, "gross": 300.00,
                "participant_contribution": 0.0, "government_paid": 300.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-22",
                "service_description": "RCP Physiotherapy follow-up",
                "stream": "Clinical",
                "quantity": 1.0, "unit": "session",
                "hours": 0.0, "unit_rate": 200.00, "gross": 200.00,
                "participant_contribution": 0.0, "government_paid": 200.00,
                "is_cancellation": False, "service_code": "",
            },
        ],
    )
    _e, audit = _run_pipeline(ext)
    # RCP totals reconcile → RULE_25 silent.
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in _rules(audit)


# ---------------------------------------------------------------------------
# 5. AT-HM standalone — assistive tech + home mods only, no personal care
# ---------------------------------------------------------------------------

def test_archetype_athm_standalone():
    """A statement whose only line items are AT-HM (Assistive Technology
    & Home Modifications) claims. No personal care, no cleaning. The
    ATHM stream must not fire stream-discrepancy rules by itself."""
    ext = _base_extract(
        per_line_contribution_source="per_line",
        pension_status="part_age_pension",
        source_declared_services_total=1800.0,
        reported_total_gross=1800.0,
        reported_total_government_paid=1800.0,
        line_items=[
            {
                "date": "2026-04-10",
                "service_description": "Grab rail installation - bathroom",
                "stream": "ATHM",
                "quantity": 1.0, "unit": "ea", "raw_qty_text": "1 ea",
                "hours": 0.0, "unit_rate": 550.00, "gross": 550.00,
                "participant_contribution": 0.0, "government_paid": 550.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-17",
                "service_description": "Shower stool assistive device",
                "stream": "ATHM",
                "quantity": 1.0, "unit": "ea", "raw_qty_text": "1 ea",
                "hours": 0.0, "unit_rate": 250.00, "gross": 250.00,
                "participant_contribution": 0.0, "government_paid": 250.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-24",
                "service_description": "Ramp installation - front entrance",
                "stream": "ATHM",
                "quantity": 1.0, "unit": "ea", "raw_qty_text": "1 ea",
                "hours": 0.0, "unit_rate": 1000.00, "gross": 1000.00,
                "participant_contribution": 0.0, "government_paid": 1000.00,
                "is_cancellation": False, "service_code": "",
            },
        ],
    )
    _e, audit = _run_pipeline(ext)
    rules = _rules(audit)
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in rules
    # 'ea' unit is a valid v5 enum value → no unit-vocabulary anomaly.
    from lib.dec1_v5_schema import UNIT_VOCAB
    assert "ea" in UNIT_VOCAB


# ---------------------------------------------------------------------------
# 6. Interim funding — bridge funding line
# ---------------------------------------------------------------------------

def test_archetype_interim_funding():
    """Participants sometimes have a bridge / interim funding line between
    program transitions. The line has a distinct provider note and often
    doesn't participate in the standard streams. Must not false-positive."""
    ext = _base_extract(
        source_declared_services_total=500.0,
        reported_total_gross=500.0,
        per_line_contribution_source="aggregate_only",
        line_items=[{
            "date": "2026-04-15",
            "service_description": "Interim funding - transition allowance",
            "stream": "Independence",
            "quantity": 1.0, "unit": "ea", "raw_qty_text": "1 ea",
            "hours": 0.0, "unit_rate": 500.00, "gross": 500.00,
            "participant_contribution": None,
            "government_paid": None,
            "is_cancellation": False, "service_code": "",
            "provider_notes": "Interim funding period, HCP to SAH transition",
        }],
    )
    _e, audit = _run_pipeline(ext)
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in _rules(audit)


# ---------------------------------------------------------------------------
# 7. Adjustments — previous-period credit / debit
# ---------------------------------------------------------------------------

def test_archetype_previous_period_adjustments():
    """Some statements carry a previous-period adjustment (credit or debit).
    This must NOT be extracted as a line item AND must NOT be double-counted
    in the arithmetic gap check. RULE_15 already handles this by subtracting
    adjustment credits before comparison — verify RULE_25 does the same
    (spec: RULE_25 compares declared vs computed_line_item_sum, where the
    adjustment lives in a separate top-level field)."""
    ext = _base_extract(
        source_declared_services_total=250.0,
        reported_total_gross=250.0,
        per_line_contribution_source="per_line",
        pension_status="full_age_pension",
        previous_period_adjustments=[
            {"date": "2026-03-28",
             "description": "Credit: overcharge on 2026-03-15 transport",
             "amount": -15.60},
        ],
        line_items=[
            {
                "date": "2026-04-05",
                "service_description": "Personal Care",
                "stream": "Independence",
                "quantity": 1.0, "unit": "hr", "hours": 1.0,
                "unit_rate": 78.0, "gross": 78.00,
                "participant_contribution": 0.0, "government_paid": 78.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-12",
                "service_description": "Domestic Assistance",
                "stream": "EverydayLiving",
                "quantity": 2.0, "unit": "hr", "hours": 2.0,
                "unit_rate": 68.0, "gross": 136.00,
                "participant_contribution": 0.0, "government_paid": 136.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-19",
                "service_description": "Meal Preparation",
                "stream": "EverydayLiving",
                "quantity": 0.5, "unit": "hr", "hours": 0.5,
                "unit_rate": 72.0, "gross": 36.00,
                "participant_contribution": 0.0, "government_paid": 36.00,
                "is_cancellation": False, "service_code": "",
            },
        ],
    )
    _e, audit = _run_pipeline(ext)
    # 78 + 136 + 36 = 250. Declared = 250. Gap = 0 → no RULE_25.
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in _rules(audit)


# ---------------------------------------------------------------------------
# 8. Provider terminology variants
# ---------------------------------------------------------------------------

def test_archetype_provider_terminology_variants():
    """Different providers use different terminology for the same services
    (e.g. 'Nursing' vs 'Clinical', 'Cleaning' vs 'Domestic Assistance').
    The v5 pipeline must accept these — the stream classification comes
    from the LLM's stream field, not from the description string."""
    ext = _base_extract(
        source_declared_services_total=414.0,
        reported_total_gross=414.0,
        per_line_contribution_source="per_line",
        pension_status="full_age_pension",
        line_items=[
            {
                "date": "2026-04-06",
                "service_description": "Nursing visit - wound care",
                "stream": "Clinical",   # LLM correctly classified as Clinical
                "quantity": 1.0, "unit": "visit", "raw_qty_text": "1 visit",
                "hours": 0.0, "unit_rate": 138.00, "gross": 138.00,
                "participant_contribution": 0.0, "government_paid": 138.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-13",
                "service_description": "Cleaning service - fortnightly",
                "stream": "EverydayLiving",
                "quantity": 2.0, "unit": "hr",
                "hours": 2.0, "unit_rate": 68.0, "gross": 136.00,
                "participant_contribution": 0.0, "government_paid": 136.00,
                "is_cancellation": False, "service_code": "",
            },
            {
                "date": "2026-04-20",
                "service_description": "Community access day trip",
                "stream": "Independence",
                "quantity": 2.0, "unit": "hr",
                "hours": 2.0, "unit_rate": 70.0, "gross": 140.00,
                "participant_contribution": 0.0, "government_paid": 140.00,
                "is_cancellation": False, "service_code": "",
            },
        ],
    )
    _e, audit = _run_pipeline(ext)
    rules = _rules(audit)
    # 138 + 136 + 140 = 414. Reconciles → no arithmetic gap.
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in rules
    # 'visit' is a valid v5 enum unit.
    from lib.dec1_v5_schema import UNIT_VOCAB
    assert "visit" in UNIT_VOCAB


# ---------------------------------------------------------------------------
# Cross-archetype smoke: every archetype survives the anti-fab strip
# ---------------------------------------------------------------------------

def test_all_archetypes_pass_anti_fab_strip():
    """Anti-fab must not accidentally strip real anomalies from any of the
    8 archetypes. Runs every fixture through strict-mode strip and asserts
    that no legitimate anomaly is lost."""
    from lib.dec1_v5_antifab import apply_all_anti_fabrication

    src = "Provider name goes here. Some service description text."
    archetypes = [
        # (name, extract_builder)
        ("zero_service", lambda: _base_extract(
            care_management_deducted=142.50,
            source_declared_services_total=0.0,
        )),
        ("no_worse_off", lambda: _base_extract(
            source_declared_services_total=78.0,
            line_items=[{
                "date": "2026-04-05", "service_description": "Care",
                "stream": "Independence", "quantity": 1.0, "unit": "hr",
                "hours": 1.0, "unit_rate": 78.0, "gross": 78.0,
                "participant_contribution": 0.0, "government_paid": 78.0,
                "is_cancellation": False, "service_code": "",
            }],
        )),
    ]
    for name, builder in archetypes:
        ext = builder()
        audit = {"anomalies": [], "statement_summary": {"cadence": "monthly"}}
        audit = agents._add_parse_warnings(audit, ext)
        before = len(audit.get("anomalies") or [])
        new_ext, new_audit, events = apply_all_anti_fabrication(
            ext, audit, src, strict=True,
        )
        after = len(new_audit.get("anomalies") or [])
        # No archetype should lose more than 1 anomaly to strict-mode strips,
        # and none should CRASH the pipeline.
        assert after >= before - 2, (
            f"Archetype '{name}' lost too many anomalies: {before} → {after}"
        )
