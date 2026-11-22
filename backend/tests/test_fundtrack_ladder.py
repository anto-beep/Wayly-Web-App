"""FUNDTRACK-1 / BSC-1 defect-log acceptance tests (pure Decimal ladder).

Covers the acceptance evidence in fundtrack-1-scope-budget-tracking.md s12 and
the fixes required by defect-log-budget-scenarios-and-dashboard-2026-11-22.md:

  #1 care management convention (D1)
  #2 underspend detection, never "On track" (D2/D3/D4)
  #3 carryover base and both branches (D2)
  #4 separate pools are structurally excluded (D2)
  + date-awareness guard (D4) and overspend detection.

program_reference cache is preloaded from seed by tests/conftest.py.
"""
from datetime import date
from decimal import Decimal

import pytest

import budget as budget_lib
from lib.fundtrack import compute_ladder, carryover_cap

ASOF = date(2026, 11, 22)          # Oct-Dec 2026 quarter, 58% elapsed
TODAY = date(2026, 11, 22)


def _ladder(cls, used, **kw):
    return compute_ladder(classification=cls, used_so_far=used, as_of=ASOF, today=TODAY, **kw)


# --- #1 Care management convention ------------------------------------------
def test_care_management_convention_all_classifications():
    """Gross less 10% equals available-for-care (A - B == D with no carryover),
    for every classification, with no second deduction."""
    for cls in range(1, 9):
        L = _ladder(cls, 0)
        f = L["figures"]
        net = round(budget_lib.quarterly_budget(cls, ASOF), 2)
        assert abs(f["A"] - f["B"] - net) < 0.005, f"class {cls}: A-B != net"
        assert abs(f["D"] - net) < 0.005, f"class {cls}: D != net (double deduction?)"
        # B is 10% of A (gross).
        assert abs(f["B"] - round(f["A"] * 0.10, 2)) < 0.02, f"class {cls}: B != 10% of A"


def test_statement_sourced_net_balance_not_deducted_twice():
    """A net balance passed as carry_in is added, never re-reduced by CM."""
    L = _ladder(6, 0, carry_in=500.00)
    assert abs(L["figures"]["C"] - 500.00) < 0.005
    # D = net + C (no extra 10% off the carried amount).
    net = round(budget_lib.quarterly_budget(6, ASOF), 2)
    assert abs(L["figures"]["D"] - (net + 500.00)) < 0.005


# --- #2 Underspend detection -------------------------------------------------
def test_sam_burke_underspend_not_on_track():
    """Class 6, $12,365.48 gross, $865 used, 58% elapsed -> underspend status,
    cap $1,112.89, a forfeit figure with its method named. Never 'on track'."""
    L = _ladder(6, 865.00)
    f = L["figures"]
    assert f["A"] == 12365.48
    assert f["B"] == 1236.55
    assert f["D"] == 11128.93           # available for care (net)
    assert f["E"] == 865.00
    assert f["F"] == 10263.93           # left for care
    assert L["quarter"]["elapsed_pct"] == 58
    assert L["status"] == "underspend_risk"
    assert L["status"] != "on_track"
    assert L["carryover_cap_aud"] == 1112.89
    assert L["projection"]["method"] == "linear_pace"
    assert L["projection"]["forfeit_aud"] > 8000     # ~$8,514 by linear pace
    assert L["projection"]["forfeit_date"] == "2026-12-31"


# --- #3 Carryover base and both branches ------------------------------------
def test_carryover_cap_class6_ten_percent_leg():
    assert carryover_cap(6, ASOF).quantize(Decimal("0.01")) == Decimal("1112.89")
    assert _ladder(6, 0)["carryover_cap_aud"] == 1112.89


def test_carryover_cap_class3_floor():
    # Class 3 net 10% is below $1,000, so the floor wins.
    assert carryover_cap(3, ASOF) == Decimal("1000.00")
    assert _ladder(3, 0)["carryover_cap_aud"] == 1000.00


# --- #4 Pool exclusion -------------------------------------------------------
def test_pools_structurally_excluded():
    """compute_ladder has no inputs for retained HCP / AT-HM / Restorative Care
    pools, so they can never inflate D, F, H or the forfeit."""
    L = _ladder(6, 865.00)
    net = round(budget_lib.quarterly_budget(6, ASOF), 2)
    assert L["figures"]["D"] == net          # exactly the quarterly net, no pools added
    # H == F when nothing is booked forward (G == 0).
    assert L["figures"]["H"] == L["figures"]["F"]
    assert L["figures"]["G"] == 0.0


# --- D4 date-awareness guard -------------------------------------------------
def test_early_quarter_same_spend_is_on_track():
    """7% used at 10% elapsed is fine; the SAME ratio at 58% is underspend.
    Status is driven by the date, not raw utilisation."""
    net = budget_lib.quarterly_budget(6, ASOF)
    seven_pct = round(net * 0.07, 2)
    early = compute_ladder(classification=6, used_so_far=seven_pct, as_of=ASOF, today=date(2026, 10, 9))
    assert early["quarter"]["elapsed_pct"] <= 12
    assert early["status"] == "on_track"
    late = compute_ladder(classification=6, used_so_far=seven_pct, as_of=ASOF, today=date(2026, 11, 22))
    assert late["status"] == "underspend_risk"


def test_overspend_detection():
    """Spending fast enough to project past the available budget -> overspend."""
    L = _ladder(6, 9000.00)   # linear pace from 58% elapsed projects well over D
    assert L["status"] == "overspend_risk"
    assert L["projection"]["shortfall_aud"] > 0


def test_confidence_never_high_without_recent_anchor():
    """D5: confidence is derived, never asserted High without a recent anchor."""
    no_anchor = _ladder(6, 865.00)                       # no statement age -> low
    assert no_anchor["confidence"]["level"] == "low"
    stale = _ladder(6, 865.00, anchor_statement_age_days=120)
    assert stale["confidence"]["level"] in ("low", "medium")
    assert stale["confidence"]["level"] != "high"


# --- #5 Ladder parity: override drives status without inflating G/H ---------
def test_projected_total_override_keeps_g_and_h_as_booked_only():
    """A caller's own projection sets status/forfeit/shortfall, but G stays the
    genuinely-booked amount and H = F - G (parity with the dashboard)."""
    # Dashboard-style: no override, G=0 -> linear pace.
    dash = _ladder(6, 865.00)
    # Budget-Scenarios-style baseline: same projection passed as override, G=0.
    bsc = compute_ladder(
        classification=6, used_so_far=865.00, committed_forward=0,
        as_of=ASOF, today=TODAY,
        projected_total_override=dash["projection"]["projected_total_aud"],
        method_override="linear_pace",
    )
    # Figures A..H identical, including G and H.
    assert bsc["figures"] == dash["figures"]
    assert bsc["figures"]["G"] == 0.0
    assert bsc["figures"]["H"] == bsc["figures"]["F"]
    # Status / forfeit identical.
    assert bsc["status"] == dash["status"]
    assert bsc["projection"]["forfeit_aud"] == dash["projection"]["forfeit_aud"]


def test_scenario_booking_reduces_spare_h():
    """When a scenario books forward care (G>0), H falls by exactly G."""
    L = compute_ladder(
        classification=6, used_so_far=865.00, committed_forward=2000.00,
        as_of=ASOF, today=TODAY,
    )
    f = L["figures"]
    assert abs(f["H"] - (f["F"] - 2000.00)) < 0.005
    assert f["G"] == 2000.00
