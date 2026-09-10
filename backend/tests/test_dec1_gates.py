"""Unit tests for the DEC-1 reconciliation gates (lib/dec1_gates.py).

Deterministic, no LLM, no DB: we load INDEX-1 (program_reference) into the
in-process cache from the seed rows, then feed a synthetic extraction modelled
on the Sam Burke Aug 2026 statement and assert the gates fire.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_program_reference_cache():
    import program_reference as pr
    import seed_program_reference as seed
    cache = {}
    for r in seed.get_seed_rows():
        key = r.get("key")
        if not key:
            continue
        cache.setdefault(key, []).append(
            (r.get("effective_from"), r.get("effective_to"), r.get("value"), r.get("key"))
        )
    pr._CACHE = cache
    pr._CACHE_READY = True


def _sam_burke_extracted():
    return {
        "classification": "6",
        "statement_period": "01/08/2026 to 31/08/2026",
        "quarterly_budget_total": 33540.00,
        "budget_remaining_at_quarter_end": 8906.90,
        "reported_total_gross": 3174.75,
        "reported_total_participant_contribution": 270.65,
        "reported_total_government_paid": 2904.10,
        "provider_name": "Meridian Home Care",
        "line_items": [
            {"date": "14/08/2026", "service_description": "Meal preparation",
             "unit_rate": 68.40, "hours": 1.25, "gross": 85.75, "is_cancellation": False, "confidence": 0.55},
            {"date": "12/08/2026", "service_description": "Physiotherapy",
             "unit_rate": 198.00, "hours": 1.0, "gross": 198.00, "is_cancellation": False},
            {"date": "05/08/2026", "service_description": "Shower stool",
             "unit_rate": 189.00, "hours": 1.0, "gross": 189.00, "is_cancellation": False,
             "source_stream": "Everyday Living", "stream": "ATHM"},
            {"date": "18/08/2026", "service_description": "Personal care visit",
             "unit_rate": 76.50, "hours": 1.0, "gross": 76.50, "is_cancellation": False},
            {"date": "20/08/2026", "service_description": "Worker travel loading",
             "unit_rate": 12.00, "hours": 1.0, "gross": 12.00, "is_cancellation": False},
            {"date": "20/08/2026", "service_description": "Transport (per km)",
             "unit_rate": 1.10, "units": 20, "gross": 22.00, "is_cancellation": False, "unit": "km"},
            {"date": "15/08/2026", "service_description": "Personal care (cancelled)",
             "unit_rate": 76.50, "hours": 1.0, "gross": 0.00, "is_cancellation": True, "charged_amount": 76.50},
        ],
    }


def _run():
    from lib.dec1_gates import run_reconciliation_gates
    anomalies = []
    audit_result = {}
    run_reconciliation_gates(anomalies, _sam_burke_extracted(), audit_result)
    rules = {(a.get("rule") or "").upper() for a in anomalies}
    return anomalies, audit_result, rules


def test_budget_not_in_index_fires():
    _load_program_reference_cache()
    _, _, rules = _run()
    assert "RULE_G3_BUDGET_NOT_IN_INDEX" in rules, rules


def test_qtd_over_budget_fires():
    _load_program_reference_cache()
    _, _, rules = _run()
    assert "RULE_G3_QTD_OVER_BUDGET" in rules, rules


def test_line_arithmetic_fires():
    _load_program_reference_cache()
    anomalies, _, rules = _run()
    assert "RULE_G1_LINE_ARITHMETIC" in rules, rules
    arith = next(a for a in anomalies if a.get("rule") == "RULE_G1_LINE_ARITHMETIC")
    # meal prep: 85.75 stated vs 85.50 computed -> delta 0.25
    assert abs(float(arith["dollar_impact"]) - 0.25) < 0.001, arith


def test_charged_cancellation_fires():
    _load_program_reference_cache()
    anomalies, _, rules = _run()
    assert "RULE_G6_CANCELLATION_CHARGED" in rules, rules
    canc = next(a for a in anomalies if a.get("rule") == "RULE_G6_CANCELLATION_CHARGED")
    assert abs(float(canc["dollar_impact"]) - 76.50) < 0.001, canc
    assert canc["severity"] == "medium"


def test_gross_reconciliation_fires():
    _load_program_reference_cache()
    _, _, rules = _run()
    assert "RULE_G2_GROSS_RECONCILE" in rules, rules


def test_statement_is_unpublishable():
    _load_program_reference_cache()
    _, audit_result, _ = _run()
    assert audit_result.get("publishable") is False
    blk = audit_result.get("publish_block") or {}
    # the four HIGH blockers, not the medium cancellation
    assert "RULE_G3_BUDGET_NOT_IN_INDEX" in blk.get("rules", [])
    assert "RULE_G3_QTD_OVER_BUDGET" in blk.get("rules", [])
    assert "RULE_G1_LINE_ARITHMETIC" in blk.get("rules", [])
    assert "RULE_G2_GROSS_RECONCILE" in blk.get("rules", [])
    assert "RULE_G6_CANCELLATION_CHARGED" not in blk.get("rules", [])


def test_wayly_recategorisation_transparency():
    _load_program_reference_cache()
    anomalies, _, rules = _run()
    assert "RULE_G7_WAYLY_RECATEGORISED" in rules, rules
    g7 = next(a for a in anomalies if a.get("rule") == "RULE_G7_WAYLY_RECATEGORISED")
    assert g7.get("origin") == "wayly"
    assert "Wayly moved" in g7.get("headline", "")


def test_travel_double_billing_fires():
    _load_program_reference_cache()
    _, _, rules = _run()
    assert "RULE_G8_TRAVEL_DOUBLE_BILL" in rules, rules


def test_category_transition_fires():
    _load_program_reference_cache()
    _, _, rules = _run()
    assert "RULE_G9_CATEGORY_TRANSITION" in rules, rules


def test_low_confidence_flag():
    _load_program_reference_cache()
    _, audit_result, _ = _run()
    assert audit_result.get("low_confidence") is True


def test_valid_budget_does_not_block():
    """A clean Class 6 statement (correct budget, totals reconcile) publishes."""
    _load_program_reference_cache()
    from lib.dec1_gates import run_reconciliation_gates
    ext = {
        "classification": "6",
        "statement_period": "01/08/2026 to 31/08/2026",
        "quarterly_budget_total": 12341.32,
        "budget_remaining_at_quarter_end": 9000.00,
        "reported_total_gross": 200.00,
        "line_items": [
            {"date": "12/08/2026", "service_description": "Physiotherapy",
             "unit_rate": 100.00, "hours": 2.0, "gross": 200.00, "is_cancellation": False},
        ],
    }
    anomalies, audit_result = [], {}
    run_reconciliation_gates(anomalies, ext, audit_result)
    rules = {(a.get("rule") or "").upper() for a in anomalies}
    assert "RULE_G3_BUDGET_NOT_IN_INDEX" not in rules
    assert "RULE_G3_QTD_OVER_BUDGET" not in rules
    assert "RULE_G1_LINE_ARITHMETIC" not in rules
    assert "RULE_G2_GROSS_RECONCILE" not in rules
    assert audit_result.get("publishable") is True


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print("PASS", name)
    print("ALL GATE TESTS PASSED")
