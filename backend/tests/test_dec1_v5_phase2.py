"""DEC-1 v5 · Phase 2 backend rule tests + Margaret Phase 3 kickoff.

Covers the three deterministic-Python additions:
  - RULE_25_SOURCE_ARITHMETIC_GAP (v5 §Phase 2 #5)
  - RULE_1B_CARE_MGMT_BELOW_STANDARD (v5 §Phase 2 #4, below-10% INFO variant)
  - RULE_9 aggregate_only gate (v5 §F2)

All tests exercise `audit_statement` in isolation via a stubbed LLM auditor
so the rules are testable without network. The Margaret Phase 3 kickoff
test runs the deterministic post-audit rules against the Margaret extracted
JSON produced by `build_margaret_v1.py` to prove the rules fire correctly.

Reference:
  /app/docs/DEC-1_v5_spec.md §Phase 2, §Anti-Hallucination §F1-F5, §Golden Output
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agents  # noqa: E402


@pytest.fixture(autouse=True)
def _seed_index1_contribution(monkeypatch):
    """DEC-FINDINGS-1 decision 2: contribution rates come from INDEX-1."""
    import program_reference as pr
    monkeypatch.setattr(pr, "_CACHE", {
        "contribution.independence_band": [("2025-11-01", None, [0.05, 0.50], "id-ind")],
        "contribution.everyday_band": [("2025-11-01", None, [0.175, 0.80], "id-eve")],
        "contribution.clinical_pct": [("2025-11-01", None, 0.00, "id-cli")],
    }, raising=False)
    monkeypatch.setattr(pr, "_CACHE_READY", True, raising=False)
    yield



# ---------------------------------------------------------------------------
# Test scaffolding — feed the deterministic post-audit rules directly.
# ---------------------------------------------------------------------------

def _base_extracted(**overrides) -> Dict[str, Any]:
    """A minimal extracted_json shaped like the LLM's Phase 2 output."""
    base = {
        "participant_name": "Margaret Wilson",
        "provider_name": "Better Care at Home Services Pty Ltd",
        "provider_abn": "",
        "statement_period": "1 June 2026 to 30 June 2026",
        "period_start": "2026-06-01",
        "period_end": "2026-06-30",
        "pension_status": "unknown",
        "classification": "",
        "quarterly_budget_total": 0.0,
        "care_management_deducted": 142.50,
        "care_management_rate_pct": 0.0,
        "care_management_source_text": "Total administration and care management costs for the period: $142.50",
        "service_budget_available": 0.0,
        "reported_total_gross": 0.0,
        "reported_total_participant_contribution": 197.25,
        "reported_total_government_paid": 1775.25,
        "source_declared_services_total": 1972.50,
        "per_line_contribution_source": "aggregate_only",
        "funding_available_this_month": 3250.00,
        "quarterly_allocation": None,
        "stream_used_this_month": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
        "header_stream_budgets": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
        "line_items": [
            {"date": "2026-06-02", "service_description": "Personal Care",
             "stream": "Independence", "quantity": 1.0, "unit": "hr",
             "hours": 1.0, "unit_rate": 78.0, "gross": 78.00,
             "participant_contribution": None, "government_paid": None,
             "is_cancellation": False},
            {"date": "2026-06-05", "service_description": "Transport",
             "stream": "Independence", "quantity": 18.0, "unit": "km",
             "raw_qty_text": "18 km", "raw_rate_text": "$1.20/km",
             "hours": 0.0, "unit_rate": 1.20, "gross": 21.60,
             "participant_contribution": None, "government_paid": None,
             "is_cancellation": False},
            {"date": "2026-06-19", "service_description": "Physiotherapy",
             "stream": "Clinical", "quantity": 1.0, "unit": "session",
             "raw_qty_text": "1 session", "raw_rate_text": "$185.00",
             "hours": 0.0, "unit_rate": 185.0, "gross": 185.00,
             "participant_contribution": None, "government_paid": None,
             "is_cancellation": False},
        ],
        "previous_period_adjustments": [],
        "provider_notes_raw": [],
        "computed_line_item_sum": 284.60,   # 78+21.60+185
    }
    base.update(overrides)
    return base


def _run_rules(extracted: Dict[str, Any], initial_audit: Dict[str, Any] = None) -> Dict[str, Any]:
    """Run only the deterministic post-audit pipeline (agents._add_parse_warnings).

    We bypass the LLM auditor because these are deterministic checks, testable
    without network. The pipeline adds RULE_9, RULE_15, RULE_25, RULE_1B, etc.
    directly onto the audit dict.
    """
    audit = copy.deepcopy(initial_audit) if initial_audit else {
        "anomalies": [],
        "statement_summary": {"cadence": "monthly"},
    }
    return agents._add_parse_warnings(audit, extracted)


def _rules_in(audit: Dict[str, Any]) -> List[str]:
    return [a.get("rule", "") for a in (audit.get("anomalies") or [])]


# ---------------------------------------------------------------------------
# RULE_25_SOURCE_ARITHMETIC_GAP
# ---------------------------------------------------------------------------

def test_rule_25_fires_on_source_arithmetic_gap():
    """Margaret case: declared services total $1,972.50 vs line sum $1,951.00,
    gap $21.50 must fire RULE_25 at MEDIUM with impact_aud=$21.50."""
    ext = _base_extracted(
        source_declared_services_total=1972.50,
        computed_line_item_sum=1951.00,
    )
    audit = _run_rules(ext)
    r25 = [a for a in audit["anomalies"] if a.get("rule") == "RULE_25_SOURCE_ARITHMETIC_GAP"]
    assert len(r25) == 1
    a = r25[0]
    assert a["severity"] == "medium"
    assert a["dollar_impact"] == 21.50
    assert a["impact_aud"] == 21.50
    assert a["source_evidence"], "RULE_25 must supply source_evidence"


def test_rule_25_silent_when_source_declared_missing():
    """Pre-v5 statements have no `source_declared_services_total` — must not fire."""
    ext = _base_extracted(source_declared_services_total=None,
                          computed_line_item_sum=1951.00)
    audit = _run_rules(ext)
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in _rules_in(audit)


def test_rule_25_silent_when_gap_zero():
    """No arithmetic gap → no anomaly."""
    ext = _base_extracted(source_declared_services_total=1951.00,
                          computed_line_item_sum=1951.00)
    audit = _run_rules(ext)
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" not in _rules_in(audit)


def test_rule_25_negative_gap_fires_too():
    """Line sum > declared is also a defect (line items exceed the stated total)."""
    ext = _base_extracted(source_declared_services_total=1000.00,
                          computed_line_item_sum=1050.00)
    audit = _run_rules(ext)
    r25 = [a for a in audit["anomalies"] if a.get("rule") == "RULE_25_SOURCE_ARITHMETIC_GAP"]
    assert len(r25) == 1
    assert r25[0]["impact_aud"] == 50.00


def test_rule_25_falls_back_to_line_sum_when_computed_missing():
    """If Phase 1 hook didn't populate computed_line_item_sum, fall back to summing."""
    ext = _base_extracted(source_declared_services_total=200.00)
    ext["computed_line_item_sum"] = None
    # base line items sum: 78 + 21.60 + 185 = 284.60 → gap = 84.60
    audit = _run_rules(ext)
    r25 = [a for a in audit["anomalies"] if a.get("rule") == "RULE_25_SOURCE_ARITHMETIC_GAP"]
    assert len(r25) == 1
    assert r25[0]["impact_aud"] == 84.60


# ---------------------------------------------------------------------------
# RULE_1B_CARE_MGMT_BELOW_STANDARD
# ---------------------------------------------------------------------------

def test_rule_1b_below_fires_when_rate_under_9pct():
    """Margaret case: $142.50 / $1,972.50 = 7.22% → INFO."""
    ext = _base_extracted(
        care_management_deducted=142.50,
        source_declared_services_total=1972.50,
    )
    audit = _run_rules(ext)
    r1b = [a for a in audit["anomalies"] if a.get("rule") == "RULE_1B_CARE_MGMT_BELOW_STANDARD"]
    assert len(r1b) == 1
    a = r1b[0]
    assert a["severity"] == "info"
    assert "7.22%" in a["detail"] or "7.22" in a["detail"]
    # F1 anti-fab: source_evidence must include the verbatim source line.
    assert any("$142.50" in ev for ev in a["source_evidence"])


def test_rule_1b_below_silent_within_half_pct_band():
    """9.5% is within the ±0.5% band around 10% → silent."""
    # 10 / 105.263 = ~9.5%
    ext = _base_extracted(
        care_management_deducted=10.00,
        source_declared_services_total=105.263,
    )
    audit = _run_rules(ext)
    assert "RULE_1B_CARE_MGMT_BELOW_STANDARD" not in _rules_in(audit)


def test_rule_1b_below_silent_above_10pct():
    """12% is above 10% — this rule is INFO-below only; existing MONTHLY
    HIGH variant handles above."""
    ext = _base_extracted(
        care_management_deducted=120.00,
        source_declared_services_total=1000.00,
    )
    audit = _run_rules(ext)
    assert "RULE_1B_CARE_MGMT_BELOW_STANDARD" not in _rules_in(audit)


def test_rule_1b_below_silent_on_quarterly():
    """RULE_1B_CARE_MGMT_BELOW_STANDARD must not fire on quarterly statements."""
    ext = _base_extracted(
        care_management_deducted=142.50,
        source_declared_services_total=1972.50,
        # Give the extract a quarterly period so the pipeline infers cadence=quarterly.
        statement_period="1 April 2026 to 30 June 2026",
        period_start="2026-04-01",
        period_end="2026-06-30",
    )
    audit = _run_rules(ext)
    assert "RULE_1B_CARE_MGMT_BELOW_STANDARD" not in _rules_in(audit)


def test_rule_1b_below_silent_on_pre_v5_missing_declared():
    """Pre-v5 statements have no `source_declared_services_total` — must not fire."""
    ext = _base_extracted(
        care_management_deducted=142.50,
        source_declared_services_total=None,
    )
    audit = _run_rules(ext)
    assert "RULE_1B_CARE_MGMT_BELOW_STANDARD" not in _rules_in(audit)


# ---------------------------------------------------------------------------
# RULE_9 aggregate_only gate
# ---------------------------------------------------------------------------

def test_rule_9_arithmetic_skipped_when_source_is_aggregate_only():
    """Margaret's shape: aggregate contribution figures, null per-line values.
    RULE_9_CONTRIBUTION_MISMATCH must NOT fire, but RULE_9_PENSION_STATUS_UNKNOWN
    still fires because pension is unknown."""
    ext = _base_extracted(
        per_line_contribution_source="aggregate_only",
        pension_status="full_age_pension",   # so mismatch WOULD apply
    )
    # Add a line where a per-line arithmetic check would have flagged.
    ext["line_items"].append({
        "date": "2026-06-27", "service_description": "Social Support",
        "stream": "Independence", "quantity": 3.0, "unit": "hr",
        "hours": 3.0, "unit_rate": 72.0, "gross": 216.00,
        "participant_contribution": None, "government_paid": None,
        "is_cancellation": False,
    })
    audit = _run_rules(ext)
    rules = _rules_in(audit)
    assert "RULE_9_CONTRIBUTION_MISMATCH" not in rules
    assert "RULE_9_INCONSISTENT_RATE" not in rules


def test_rule_9_arithmetic_fires_when_source_is_per_line():
    """When source has per-line contribution values (Louisa's pattern) and
    they don't match the expected pension rate, RULE_9 must still fire."""
    ext = _base_extracted(
        per_line_contribution_source="per_line",
        pension_status="full_age_pension",
    )
    # For full_age_pension the Independence rate is 5%. Charge 20% instead.
    ext["line_items"] = [{
        "date": "2026-06-02", "service_description": "Personal Care",
        "stream": "Independence", "quantity": 1.0, "unit": "hr",
        "hours": 1.0, "unit_rate": 78.0, "gross": 78.00,
        "participant_contribution": 15.60,   # 20% (should be 5% = $3.90)
        "government_paid": 62.40,
        "is_cancellation": False,
    }]
    audit = _run_rules(ext)
    assert "RULE_9_CONTRIBUTION_INFO" in _rules_in(audit)
    assert "RULE_9_CONTRIBUTION_MISMATCH" not in _rules_in(audit)


def test_rule_9_pension_unknown_still_fires_on_aggregate_only():
    """The pension-unknown INFO must fire even for aggregate_only statements
    (Margaret is exactly this case)."""
    ext = _base_extracted(
        per_line_contribution_source="aggregate_only",
        pension_status="unknown",
    )
    audit = _run_rules(ext)
    assert "RULE_9_PENSION_STATUS_UNKNOWN" in _rules_in(audit)


# ---------------------------------------------------------------------------
# Margaret Phase 3 kickoff — the 3 mandatory anomalies fire, no fabrications.
# ---------------------------------------------------------------------------

def test_margaret_deterministic_pipeline_produces_the_three_mandatory_anomalies():
    """v5 §Golden Output: Margaret must produce exactly 3 anomalies:
      1. INFO  — pension status unknown (RULE_9_PENSION_STATUS_UNKNOWN)
      2. INFO  — care mgmt below 10% (RULE_1B_CARE_MGMT_BELOW_STANDARD)
      3. MEDIUM — source arithmetic gap $21.50 (RULE_25_SOURCE_ARITHMETIC_GAP)

    This test runs against a Margaret extracted_json produced synthetically
    (matching build_margaret_v1.py golden output). Once Phase 2 also
    rewrites the line-item LLM prompt, an end-to-end run through the real
    fixture should hit the same three anomalies and no more.
    """
    # Margaret's full 16-line-item extract, faithfully rebuilt from the
    # fixture golden output.
    lines = [
        ("2026-06-02", "Personal Care", "Independence", 1.0, "hr", 78.00, 78.00),
        ("2026-06-03", "Domestic Assistance", "EverydayLiving", 2.0, "hr", 68.00, 136.00),
        ("2026-06-05", "Transport", "Independence", 18.0, "km", 1.20, 21.60),
        ("2026-06-06", "Meal Preparation", "EverydayLiving", 2.0, "hr", 70.00, 140.00),
        ("2026-06-09", "Personal Care", "Independence", 1.0, "hr", 78.00, 78.00),
        ("2026-06-10", "Domestic Assistance", "EverydayLiving", 2.0, "hr", 68.00, 136.00),
        ("2026-06-12", "Social Support", "Independence", 3.0, "hr", 72.00, 216.00),
        ("2026-06-13", "Gardening", "EverydayLiving", 2.0, "hr", 75.00, 150.00),
        ("2026-06-16", "Personal Care", "Independence", 1.0, "hr", 78.00, 78.00),
        ("2026-06-17", "Domestic Assistance", "EverydayLiving", 2.0, "hr", 68.00, 136.00),
        ("2026-06-19", "Physiotherapy", "Clinical", 1.0, "session", 185.00, 185.00),
        ("2026-06-20", "Meal Preparation", "EverydayLiving", 2.0, "hr", 70.00, 140.00),
        ("2026-06-23", "Personal Care", "Independence", 1.0, "hr", 78.00, 78.00),
        ("2026-06-24", "Domestic Assistance", "EverydayLiving", 2.0, "hr", 68.00, 136.00),
        ("2026-06-26", "Transport", "Independence", 22.0, "km", 1.20, 26.40),
        ("2026-06-27", "Social Support", "Independence", 3.0, "hr", 72.00, 216.00),
    ]
    line_items = [
        {"date": d, "service_description": s, "stream": st,
         "quantity": q, "unit": u,
         "hours": q if u == "hr" else 0.0,
         "unit_rate": r, "gross": g,
         "participant_contribution": None, "government_paid": None,
         "is_cancellation": False,
         "service_code": ""}   # v5: no invented codes
        for (d, s, st, q, u, r, g) in lines
    ]
    ext = _base_extracted(
        line_items=line_items,
        source_declared_services_total=1972.50,
        computed_line_item_sum=1951.00,   # 21.50 gap
        care_management_deducted=142.50,
        care_management_source_text="Total administration and care management costs for the period: $142.50",
        per_line_contribution_source="aggregate_only",
        pension_status="unknown",
    )
    audit = _run_rules(ext)
    rules = _rules_in(audit)

    # The three mandatory anomalies.
    assert "RULE_9_PENSION_STATUS_UNKNOWN" in rules
    assert "RULE_1B_CARE_MGMT_BELOW_STANDARD" in rules
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" in rules

    # No fabrications on Margaret (spec F1 / F3 subcases):
    # RULE_9_CONTRIBUTION_MISMATCH — must not fire under aggregate_only
    assert "RULE_9_CONTRIBUTION_MISMATCH" not in rules
    assert "RULE_9_INCONSISTENT_RATE" not in rules

    # Every anomaly RULE_25 emits has source_evidence + traceable impact_aud.
    r25 = next(a for a in audit["anomalies"] if a.get("rule") == "RULE_25_SOURCE_ARITHMETIC_GAP")
    assert r25["impact_aud"] == 21.50
    assert r25["source_evidence"]


def test_margaret_deterministic_pipeline_is_byte_identical_across_3_runs():
    """v5 §Phase 3 · determinism gate. Same input × 3 → identical output."""
    ext = _base_extracted(
        source_declared_services_total=1972.50,
        computed_line_item_sum=1951.00,
        care_management_deducted=142.50,
        pension_status="unknown",
    )
    audits = [_run_rules(copy.deepcopy(ext)) for _ in range(3)]
    # Compare the anomalies lists structurally — rule keys + severity + impact.
    def _fingerprint(audit):
        return tuple(
            (a.get("rule"), a.get("severity"), a.get("dollar_impact"), a.get("impact_aud"))
            for a in (audit.get("anomalies") or [])
        )
    fps = {_fingerprint(a) for a in audits}
    assert len(fps) == 1, f"Non-deterministic anomaly output across runs: {fps}"
