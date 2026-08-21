"""CHSP-FIX-golden-v1 answer-key assertions for the WS-1 per-unit Fee Check.

Every numeric expectation here is copied from CHSP-FIX-golden-v1. A mismatch
on any assertion is a build failure and blocks the CHSP-TOOLS-1 WS-1 flag flip.
"""
from lib.chsp1.fee_check import rate_tier, run_fee_check


def test_fix_1_clean_invoice():
    r = run_fee_check(agreed_rate="6.00", units_received=4, units_billed=4, billed_amount="24.00")
    assert r["billed_per_unit"] == "6.00"
    assert r["expected_amount"] == "24.00"
    assert r["amount_delta"] == "0.00"
    assert r["rate_tier"] == "within"
    assert r["units_tier"] == "within"
    assert r["overall_verdict"] == "within"
    assert r["dispute_offered"] is False
    assert r["provisional"] is False


def test_fix_2_material_rate():
    r = run_fee_check(agreed_rate="6.00", units_received=1, units_billed=1, billed_amount="10.00")
    assert r["billed_per_unit"] == "10.00"
    assert r["rate_difference"] == "4.00"
    assert r["expected_amount"] == "6.00"
    assert r["amount_delta"] == "4.00"
    assert r["rate_tier"] == "material"
    assert r["units_tier"] == "within"
    assert r["overall_verdict"] == "material"
    assert r["dispute_offered"] is True


def test_fix_3_extra_unit():
    r = run_fee_check(agreed_rate="6.00", units_received=4, units_billed=5, billed_amount="30.00")
    assert r["billed_per_unit"] == "6.00"
    assert r["rate_difference"] == "0.00"
    assert r["expected_amount"] == "24.00"
    assert r["amount_delta"] == "6.00"
    assert r["rate_tier"] == "within"
    assert r["units_tier"] == "material"
    assert r["overall_verdict"] == "material"
    assert r["dispute_offered"] is True


def test_fix_4_no_agreed_rate_degraded():
    r = run_fee_check(agreed_rate=None, units_received=4, units_billed=4, billed_amount="24.00")
    assert r["degraded"] is True
    assert r["overall_verdict"] == "no_verdict"
    assert r["rate_tier"] is None
    assert r["units_tier"] is None
    assert r["dispute_offered"] is False
    assert r["prompt_add_agreed_rate"] is True


def test_fix_5_stale_rate_provisional():
    r = run_fee_check(
        agreed_rate="6.00", units_received=4, units_billed=4, billed_amount="24.00",
        rate_effective_date="01/01/2026", billed_period_start="01/07/2026",
    )
    assert r["rate_age_days"] == 181
    assert r["rate_tier"] == "within"
    assert r["units_tier"] == "within"
    assert r["overall_verdict"] == "within"
    assert r["provisional"] is True
    assert "provisional" in r["verdict_label"].lower()


def test_rate_tier_thresholds():
    # From the boundary/guard assertions in the golden spec (agreed $6.00).
    assert rate_tier("6.00", "6.50") == "within"   # diff 0.50
    assert rate_tier("6.00", "6.51") == "minor"    # diff 0.51
    assert rate_tier("6.00", "8.00") == "minor"    # diff 2.00
    assert rate_tier("6.00", "8.01") == "material"  # diff 2.01


def test_directionality_guards():
    # Undercharge: billed per-unit below agreed is never harm.
    under = run_fee_check(agreed_rate="6.00", units_received=1, units_billed=1, billed_amount="3.00")
    assert under["is_overcharge"] is False
    assert under["rate_tier"] == "within"
    assert under["dispute_offered"] is False
    # Underbill: fewer units billed than received is never harm.
    underbill = run_fee_check(agreed_rate="6.00", units_received=4, units_billed=3, billed_amount="18.00")
    assert underbill["units_tier"] == "within"
    assert underbill["dispute_offered"] is False
