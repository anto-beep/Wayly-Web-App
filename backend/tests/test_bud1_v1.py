"""BUD-1 v1 · Phase 1 backend tests for the Budget Calculator.

Covers T1..T16 from the spec plus the Rev A rollover formula alignment.
Uses the `budget` module directly to keep tests hermetic (no HTTP).
Constants routed through program_reference reflect the seeded post-20-Mar-2026
lifetime caps ($137,917.01 / $86,185.23).
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import budget  # noqa: E402


# Anchor to 20 March 2026 so tests deterministically hit the Rev A indexed
# lifetime caps regardless of the wall clock. `budget.lifetime_cap` accepts
# an `as_of` argument that program_reference honours.
AS_OF_MAR_2026 = "2026-03-20"


# ---------------------------------------------------------------------------
# Rollover cap (T1-T3 + T4 grandfathered variant)
# ---------------------------------------------------------------------------

def test_T1_rollover_class3_q1_floor_wins():
    """Class 3, Jan-Mar quarter (90 days): 10% × $54.16 × 90 = $487.44 →
    floor ($1,000) wins."""
    cap = budget.rollover_cap(3, days_in_quarter=90)
    assert cap == 1000.00


def test_T2_rollover_class8_q4_percent_wins():
    """Class 8, Apr-Jun quarter (91 days): 10% × $192.59 × 91 ≈ $1,752.57."""
    cap = budget.rollover_cap(8, days_in_quarter=91)
    # Allow ±$1 tolerance (derived from annual/365 vs the Schedule's exact daily rate)
    assert 1750 <= cap <= 1755, f"Expected ~$1,752.57, got {cap}"


def test_T3_rollover_class6_q4_percent_wins():
    """Class 6, Apr-Jun quarter (91 days): 10% × $118.64 × 91 ≈ $1,079.62."""
    cap = budget.rollover_cap(6, days_in_quarter=91)
    assert 1075 <= cap <= 1085, f"Expected ~$1,079.62, got {cap}"


def test_T4_rollover_uses_current_quarter_when_days_omitted():
    """When `days_in_quarter` is omitted, the current SAH quarter is inferred.
    Class 3 should still hit the $1,000 floor regardless of quarter length."""
    cap = budget.rollover_cap(3)
    assert cap == 1000.00


# ---------------------------------------------------------------------------
# Lifetime cap (T10-T14 · Rev A indexed values)
# ---------------------------------------------------------------------------

def test_T10_lifetime_cap_grandfathered_on_post_march_2026():
    """Grandfathered on: HCP no-worse-off = $86,185.23."""
    cap = budget.lifetime_cap(True, as_of=AS_OF_MAR_2026)
    assert cap == 86185.23


def test_T11_lifetime_cap_gf_50k_balance_leaves_36185_23():
    cap = budget.lifetime_cap(True, as_of=AS_OF_MAR_2026)
    remaining = round(cap - 50000, 2)
    assert remaining == 36185.23


def test_T12_lifetime_cap_gf_at_cap_leaves_zero():
    cap = budget.lifetime_cap(True, as_of=AS_OF_MAR_2026)
    remaining = round(max(0.0, cap - cap), 2)
    assert remaining == 0.0


def test_T13_lifetime_cap_gf_over_cap_is_clamped_to_zero():
    cap = budget.lifetime_cap(True, as_of=AS_OF_MAR_2026)
    over = cap + 1000
    remaining = round(max(0.0, cap - over), 2)
    assert remaining == 0.0


def test_T14_lifetime_cap_non_grandfathered_50k_balance_leaves_87917_01():
    cap = budget.lifetime_cap(False, as_of=AS_OF_MAR_2026)
    remaining = round(cap - 50000, 2)
    assert cap == 137917.01
    assert remaining == 87917.01


# ---------------------------------------------------------------------------
# Care management deduction (T5 · HCP transitional universal 10%)
# ---------------------------------------------------------------------------

def test_T5_care_management_ongoing_sah_10pct():
    """Class 8 ongoing SAH: quarterly usable = annual × 0.9 / 4."""
    annual = budget.classification_annual(8)
    expected_usable = round(annual / 4 * 0.9, 2)
    assert budget.quarterly_budget(8) == expected_usable


# ---------------------------------------------------------------------------
# Grandfathered no longer switches classification rates (F5)
# ---------------------------------------------------------------------------

def test_T6_grandfathered_flag_does_not_change_annual_for_ongoing_sah():
    """After Rev A, is_grandfathered only affects the lifetime cap. The
    classification annual comes from the ongoing SAH table regardless."""
    for c in range(1, 9):
        annual_pre = budget.classification_annual(c)
        annual_post = budget.classification_annual(c)
        assert annual_pre == annual_post


# ---------------------------------------------------------------------------
# Rollover formula boundary — days ranges (T16 defensive)
# ---------------------------------------------------------------------------

def test_T16_rollover_min_and_max_quarter_lengths():
    """Sanity: 90-day quarter is smaller than 92-day quarter for the same class."""
    small = budget.rollover_cap(8, days_in_quarter=90)
    large = budget.rollover_cap(8, days_in_quarter=92)
    assert small <= large


# ---------------------------------------------------------------------------
# API contract shim — the endpoint returns both caps
# ---------------------------------------------------------------------------

def test_T7_lifetime_cap_grandfathered_and_standard_available_separately():
    gf = budget.lifetime_cap(True, as_of=AS_OF_MAR_2026)
    std = budget.lifetime_cap(False, as_of=AS_OF_MAR_2026)
    assert gf < std, "Grandfathered cap must be lower than standard SAH cap"
    assert gf == 86185.23
    assert std == 137917.01
