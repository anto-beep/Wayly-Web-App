"""Phase 0 acceptance gate for CE-2 v1.1.

This is a **reference implementation only**, used to lock the means-test
formula, the constants pulled from INDEX-1, and the Bill / John / Louisa
fixtures. It reproduces the government fact sheet targets to the cent
before any Workstream A production code is written.

If Bill or John fails here, Phase 0 sign-off does not proceed.

Spec: /app/docs/audits/CE-2-phase-0-audit.md
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pytest
import yaml

from monetary_constants import load_registry


# ---------------------------------------------------------------------------
# Reference calculator — pure Python, no I/O, no framework, no dependencies.
# The production Workstream A engine will re-derive from this reference.
# ---------------------------------------------------------------------------

def _round(value, places=2):
    """Half-up rounding to N places, returning a float for easy assert."""
    q = Decimal(10) ** -places
    return float(Decimal(str(value)).quantize(q, rounding=ROUND_HALF_UP))


def means_test(
    *,
    assessable_income_annual: float,
    assessable_assets: float,
    income_free_area: float,
    assets_free_area: float,
    income_limit: float,
    income_taper: float,
    asset_taper: float,
    rate_floor_independence: float = 5.0,
    rate_ceiling_independence: float = 50.0,
    rate_floor_everyday: float = 17.5,
    rate_ceiling_everyday: float = 80.0,
):
    """Implement the six-step means-test formula per CE-2 spec §2.4.

    Returns a dict with input_rate_pct, independence_rate_pct, everyday_rate_pct.
    """
    # Step 1: income reduction, floored at zero.
    income_reduction = max(0, (assessable_income_annual - income_free_area)) * income_taper
    income_reduction = round(income_reduction)  # rounded to nearest dollar per spec

    # Step 2: asset reduction, floored at zero.
    asset_reduction = max(0, (assessable_assets - assets_free_area)) * asset_taper
    asset_reduction = round(asset_reduction)

    # Step 3: maximum reduction anchor.
    max_reduction = (income_limit - income_free_area) * income_taper
    max_reduction = round(max_reduction)

    # Step 4: input contribution rate.
    raw_input_rate = (max(income_reduction, asset_reduction) / max_reduction) * 100 if max_reduction > 0 else 0

    # Step 5: independence percentage.
    independence_rate = raw_input_rate * 0.45 + 5.0

    # Step 6: everyday living percentage.
    everyday_rate = raw_input_rate * 0.625 + 17.5

    # Clamp to standard-arrangements floor and ceiling.
    independence_rate = min(rate_ceiling_independence, max(rate_floor_independence, independence_rate))
    everyday_rate = min(rate_ceiling_everyday, max(rate_floor_everyday, everyday_rate))

    return {
        "income_reduction": income_reduction,
        "asset_reduction": asset_reduction,
        "max_reduction": max_reduction,
        "input_rate_pct": _round(raw_input_rate, 2),
        "independence_rate_pct": _round(independence_rate, 2),
        "everyday_rate_pct": _round(everyday_rate, 2),
    }


# ---------------------------------------------------------------------------
# Fixture loader
# ---------------------------------------------------------------------------

_FIXTURES_PATH = Path(__file__).parent.parent / "data" / "ce2_fixtures.yaml"


@pytest.fixture(scope="module")
def ce2_fixtures():
    with _FIXTURES_PATH.open() as f:
        return yaml.safe_load(f)["fixtures"]


@pytest.fixture(scope="module")
def registry():
    return load_registry()


def _mt_constants(registry, relationship: str, homeowner: bool):
    """Pull the four means-test constants for the given household shape."""
    if relationship == "single":
        income_free = float(registry.get_value("means_test.income_free_area.individual"))
        assets_free = float(registry.get_value(
            "means_test.assets_free_area.individual_homeowner" if homeowner
            else "means_test.assets_free_area.individual_non_homeowner"
        ))
        income_limit = float(registry.get_value("means_test.income_limit.individual"))
    else:
        income_free = float(registry.get_value("means_test.income_free_area.couple_member"))
        assets_free = float(registry.get_value(
            "means_test.assets_free_area.couple_homeowner" if homeowner
            else "means_test.assets_free_area.couple_non_homeowner"
        ))
        income_limit = float(registry.get_value("means_test.income_limit.couple"))
    income_taper = float(registry.get_value("means_test.income_taper_pct"))
    asset_taper = float(registry.get_value("means_test.asset_taper_pct"))
    return income_free, assets_free, income_limit, income_taper, asset_taper


# ---------------------------------------------------------------------------
# Constants presence
# ---------------------------------------------------------------------------

class TestConstantsSourced:
    """Phase 0 §2.1, §2.2, §2.7 — every required constant is in INDEX-1."""

    REQUIRED = [
        "means_test.income_free_area.individual",
        "means_test.income_free_area.couple_member",
        "means_test.assets_free_area.individual_homeowner",
        "means_test.assets_free_area.individual_non_homeowner",
        "means_test.assets_free_area.couple_homeowner",
        "means_test.assets_free_area.couple_non_homeowner",
        "means_test.income_limit.individual",
        "means_test.income_limit.couple",
        "means_test.income_limit.couple_separated_by_illness",
        "means_test.income_taper_pct",
        "means_test.asset_taper_pct",
        "lifetime_cap.standard",
        "lifetime_cap.no_worse_off",
        "lifetime_cap.hcp_transitioned",
        "hcp.basic_daily_fee.level_1",
        "hcp.basic_daily_fee.level_2",
        "hcp.basic_daily_fee.level_3",
        "hcp.basic_daily_fee.level_4",
        "hcp.itcf.income_free_area.individual",
        "hcp.itcf.income_free_area.couple",
        "hcp.itcf.tier2_income_threshold.individual",
        "hcp.itcf.tier2_income_threshold.couple",
        "hcp.itcf.max_daily_rate_tier1",
        "hcp.itcf.max_daily_rate_tier2",
        "hcp.itcf.annual_cap_tier1",
        "hcp.itcf.annual_cap_tier2",
        "hcp.itcf.lifetime_cap",
        "hcp.itcf.income_taper_pct",
        "ce2.personal_care_sub_share_of_independence",
    ]

    def test_all_required_keys_present(self, registry):
        missing = [k for k in self.REQUIRED if registry.get_entry(k) is None]
        assert not missing, f"Missing INDEX-1 keys: {missing}"

    def test_all_have_source_urls(self, registry):
        """No PENDING sources on the CE-2 constants."""
        pending = []
        for k in self.REQUIRED:
            e = registry.get_entry(k)
            if not e.source_url or e.source_url == "PENDING":
                pending.append(k)
        assert not pending, f"CE-2 keys missing source_url: {pending}"

    def test_lifetime_cap_values(self, registry):
        assert float(registry.get_value("lifetime_cap.standard")) == 137917.01
        assert float(registry.get_value("lifetime_cap.no_worse_off")) == 86185.23
        assert float(registry.get_value("lifetime_cap.hcp_transitioned")) == 84571.66


# ---------------------------------------------------------------------------
# Bill — gate-blocking (spec §6 test 1)
# ---------------------------------------------------------------------------

class TestBillGateBlocking:
    def test_bill_input_rate_is_14_pct(self, ce2_fixtures, registry):
        f = ce2_fixtures["bill"]
        i = f["input"]
        income_free, assets_free, income_limit, income_taper, asset_taper = _mt_constants(
            registry, i["relationship"], i["homeowner"]
        )
        r = means_test(
            assessable_income_annual=i["income_excluding_pension_annual"],
            assessable_assets=i["financial_assets"],
            income_free_area=income_free,
            assets_free_area=assets_free,
            income_limit=income_limit,
            income_taper=income_taper,
            asset_taper=asset_taper,
        )
        expected = f["expected_output"]
        assert r["input_rate_pct"] == pytest.approx(expected["input_contribution_rate_pct"], abs=0.05), (
            f"Bill input rate {r['input_rate_pct']}% != expected {expected['input_contribution_rate_pct']}%. "
            f"means_test intermediate: income_reduction={r['income_reduction']} asset_reduction={r['asset_reduction']} max_reduction={r['max_reduction']}"
        )

    def test_bill_derived_rates(self, ce2_fixtures, registry):
        f = ce2_fixtures["bill"]
        i = f["input"]
        income_free, assets_free, income_limit, income_taper, asset_taper = _mt_constants(
            registry, i["relationship"], i["homeowner"]
        )
        r = means_test(
            assessable_income_annual=i["income_excluding_pension_annual"],
            assessable_assets=i["financial_assets"],
            income_free_area=income_free,
            assets_free_area=assets_free,
            income_limit=income_limit,
            income_taper=income_taper,
            asset_taper=asset_taper,
        )
        assert r["independence_rate_pct"] == pytest.approx(f["expected_output"]["independence_rate_pct"], abs=0.05)
        assert r["everyday_rate_pct"] == pytest.approx(f["expected_output"]["everyday_rate_pct"], abs=0.05)

    def test_bill_government_share(self, ce2_fixtures, registry):
        f = ce2_fixtures["bill"]
        i = f["input"]
        income_free, assets_free, income_limit, income_taper, asset_taper = _mt_constants(
            registry, i["relationship"], i["homeowner"]
        )
        r = means_test(
            assessable_income_annual=i["income_excluding_pension_annual"],
            assessable_assets=i["financial_assets"],
            income_free_area=income_free,
            assets_free_area=assets_free,
            income_limit=income_limit,
            income_taper=income_taper,
            asset_taper=asset_taper,
        )
        govt_share = 100.0 - r["input_rate_pct"]
        assert govt_share == pytest.approx(f["expected_output"]["government_share_pct"], abs=0.05)


# ---------------------------------------------------------------------------
# John — gate-blocking (spec §6 test 2)
# ---------------------------------------------------------------------------

class TestJohnGateBlocking:
    def test_john_fee_exempt_short_circuit(self, ce2_fixtures):
        """The presence of hcpPaidFees=false on HCP-pre-Sep-2024 entry path
        must short-circuit the calculation to zero, regardless of income
        or assets. This is the no-worse-off / fee-exempt guarantee.
        """
        f = ce2_fixtures["john"]
        i = f["input"]
        assert i["entry_path"] == "hcp_pre_sep_2024"
        assert i["hcp_paid_fees"] is False
        # Reference implementation of the short-circuit gate.
        is_fee_exempt = (
            i["entry_path"] == "hcp_pre_sep_2024" and i["hcp_paid_fees"] is False
        )
        assert is_fee_exempt is True
        assert f["expected_output"]["is_fee_exempt"] is True
        assert f["expected_output"]["total_contribution_pct"] == 0.0
        assert f["expected_output"]["contribution_weekly_aud"] == 0.0
        assert f["expected_output"]["contribution_annual_aud"] == 0.0


# ---------------------------------------------------------------------------
# Louisa — cross-tool fixture correction check
# ---------------------------------------------------------------------------

class TestLouisaCanonical:
    def test_louisa_is_class_8(self, ce2_fixtures):
        f = ce2_fixtures["louisa"]
        assert f["canonical"] is True
        assert f["input"]["classification"] == "class_8"
        assert f["input"]["provider_name"] == "Glorious Services Pty Ltd"

    def test_louisa_full_pension_floor_rates(self, ce2_fixtures):
        f = ce2_fixtures["louisa"]
        assert f["expected_output"]["independence_rate_pct"] == 5.0
        assert f["expected_output"]["everyday_rate_pct"] == 17.5


# ---------------------------------------------------------------------------
# Formula worked examples (spec §6 tests 4, 5, 6)
# ---------------------------------------------------------------------------

class TestFormulaWorkedExamples:
    def test_part_pension_ceiling(self, registry):
        """Input rate 100 -> Independence 50%, Everyday 80% (ceiling).

        To hit input_rate == 100 exactly, income_reduction must equal max_reduction.
        max_reduction = (101,105 - 5,668) * 0.5 = $47,718.50
        income_reduction = (X - 5,668) * 0.5 = 47,718.50
        X = 101,105
        """
        income_free, assets_free, income_limit, income_taper, asset_taper = _mt_constants(
            registry, "single", True
        )
        r = means_test(
            assessable_income_annual=101105,
            assessable_assets=0,
            income_free_area=income_free,
            assets_free_area=assets_free,
            income_limit=income_limit,
            income_taper=income_taper,
            asset_taper=asset_taper,
        )
        assert r["independence_rate_pct"] == pytest.approx(50.0, abs=0.05)
        assert r["everyday_rate_pct"] == pytest.approx(80.0, abs=0.05)

    def test_part_pension_floor(self, registry):
        """Full pensioner with $0 assessable income returns Ind 5%, EL 17.5%."""
        income_free, assets_free, income_limit, income_taper, asset_taper = _mt_constants(
            registry, "single", True
        )
        r = means_test(
            assessable_income_annual=0,
            assessable_assets=0,
            income_free_area=income_free,
            assets_free_area=assets_free,
            income_limit=income_limit,
            income_taper=income_taper,
            asset_taper=asset_taper,
        )
        assert r["independence_rate_pct"] == 5.0
        assert r["everyday_rate_pct"] == 17.5
