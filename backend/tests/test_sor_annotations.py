"""Unit tests for SD-3 Statement of Rights annotations (services.sor_annotations).

Covers the deterministic annotation logic added in SD-3 v1 remainder:
baseline rights, finding->right mapping, de-duplication and ordering.
Run: pytest backend/tests/test_sor_annotations.py
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from services.sor_annotations import annotate_statement, BASELINE_RIGHT_IDS  # noqa: E402


def _ids(result):
    return [a["right_id"] for a in result["annotations"]]


def test_empty_statement_returns_baseline_rights():
    result = annotate_statement([])
    ids = _ids(result)
    for rid in BASELINE_RIGHT_IDS:
        assert rid in ids
    # Baseline-only rights are flagged as baseline.
    assert all(a["is_baseline"] for a in result["annotations"])
    assert result["count"] == len(BASELINE_RIGHT_IDS)


def test_care_management_anomaly_maps_to_correct_billing():
    result = annotate_statement([{"rule_key": "RULE_1_CARE_MGMT_CAP"}])
    ids = _ids(result)
    assert "correct_billing" in ids
    assert "clear_information_costs" in ids
    # Baseline still present.
    assert "advocacy_support" in ids
    triggered = next(a for a in result["annotations"] if a["right_id"] == "correct_billing")
    assert "care_management_over_cap" in triggered["triggered_by"]
    assert triggered["is_baseline"] is False


def test_backdated_adjustment_maps_to_informed_of_changes():
    result = annotate_statement([{"rule": "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS"}])
    assert "informed_of_changes" in _ids(result)


def test_string_anomalies_supported():
    result = annotate_statement(["RULE_11_BROKERED_PREMIUM"])
    assert "correct_billing" in _ids(result)


def test_deduplicates_rights_across_multiple_anomalies():
    result = annotate_statement([
        {"rule_key": "RULE_1_CARE_MGMT_CAP"},
        {"rule_key": "RULE_9_WRONG_STREAM"},
        {"rule_key": "RULE_11_BROKERED_PREMIUM"},
    ])
    ids = _ids(result)
    # correct_billing triggered by multiple anomalies must appear exactly once.
    assert ids.count("correct_billing") == 1
    triggered = next(a for a in result["annotations"] if a["right_id"] == "correct_billing")
    assert set(triggered["triggered_by"]) >= {"care_management_over_cap", "wrong_stream_billing"}


def test_unknown_rule_key_falls_back_to_baseline_only():
    result = annotate_statement([{"rule_key": "RULE_DOES_NOT_EXIST"}])
    assert set(_ids(result)) == set(BASELINE_RIGHT_IDS)


def test_triggered_rights_ordered_before_baseline():
    result = annotate_statement([{"rule_key": "RULE_13_QUARTERLY_UNDERSPEND"}])
    ids = _ids(result)
    # control_choices (triggered) should come before purely-baseline rights.
    assert ids.index("control_choices") < ids.index("advocacy_support")
