"""CE-2 v1.1, Contribution Estimator calculation engine.

Pure-function core. Zero I/O beyond the INDEX-1 registry lookup. No HTTP,
no persistence, no LLM. Given a :class:`CE2Input`, returns a :class:`CE2Output`.

Covers Phase 1 workstreams:

* A, Calculation engine (this module top-to-bottom)
* B, Means-test formula (:func:`means_test`)
* F, No-worse-off branching (:func:`resolve_entry_path`)
* G, Not-yet-approved range calculation (:func:`range_calculation`)
* H, 1 October 2026 date-aware personal-care split (:func:`october_2026_split`)

Workstream L (HCP comparison) lives in :mod:`ce2_hcp_comparison`.
Workstream M (acceptance tests) lives in :mod:`tests.test_ce2_engine`.

All monetary constants are read from INDEX-1
(``monetary_constants.load_registry``). No hard-coded dollars anywhere in the
engine. If a constant is missing, the loader raises ``KeyError`` immediately
so we fail fast rather than silently substitute.
"""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Literal, Optional

from monetary_constants import load_registry

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

PensionStatus = Literal["full_pension", "part_pension", "cshc", "self_funded"]
Relationship = Literal["single", "couple"]
AssessmentStatus = Literal["have_classification", "awaiting_classification", "not_assessed"]
EntryPath = Literal[
    "not_assessed",                      # option 1
    "hcp_pre_sep_2024",                  # option 2 (grandfathered HCP)
    "npq_pre_sep_2024",                  # option 3 (NPQ)
    "hcp_post_sep_pre_nov_2025",         # option 4 (transitional HCP)
    "post_nov_2025",                     # option 5 (new participant)
]
HcpComparisonMode = Literal["always", "toggle", "never"]

# HCP-to-SAH classification mapping used when the participant is on a
# non-transitional SAH classification and we want to show what they WOULD
# have paid under HCP for context. Per Phase 0 audit §2.3.
HCP_LEVEL_FROM_SAH_CLASS: Dict[str, int] = {
    "class_1": 1, "class_2": 1,
    "class_3": 2, "class_4": 2,
    "class_5": 3, "class_6": 3,
    "class_7": 4, "class_8": 4,
    "transitional_1": 1, "transitional_2": 2,
    "transitional_3": 3, "transitional_4": 4,
}

# Classification keys. class_1..class_8 map to classification_annual.1..8.
# transitional_1..4 map to transitional_hcp.1..4.annual_aud.
# rcp / eolp are short-stay pathways.
Classification = Literal[
    "class_1", "class_2", "class_3", "class_4",
    "class_5", "class_6", "class_7", "class_8",
    "transitional_1", "transitional_2", "transitional_3", "transitional_4",
    "rcp", "eolp",
]

DEFAULT_SERVICE_MIX = {"clinical": 30, "independence": 45, "everyday": 25}
RANGE_ANCHOR_CLASSES = ["class_3", "class_5", "class_8"]
ALL_STANDARD_CLASSES = [f"class_{i}" for i in range(1, 9)]

WEEKS_PER_YEAR = 52.14285714  # 365.0 / 7
FORTNIGHTS_PER_YEAR = 26.07142857  # 365.0 / 14
MONTHS_PER_YEAR = 12.0
QUARTERS_PER_YEAR = 4.0

OCTOBER_2026_TRIGGER = date(2026, 10, 1)


@dataclass
class ServiceMix:
    clinical: float = 30.0
    independence: float = 45.0
    everyday: float = 25.0

    def as_fractions(self) -> Dict[str, float]:
        return {
            "clinical": self.clinical / 100.0,
            "independence": self.independence / 100.0,
            "everyday": self.everyday / 100.0,
        }

    def validate(self) -> None:
        total = self.clinical + self.independence + self.everyday
        if abs(total - 100.0) > 0.5:  # allow 0.5pp tolerance for user rounding
            raise ValueError(f"Service mix must sum to 100%, got {total}")


@dataclass
class CE2Input:
    """Input contract for CE-2, spec §4.1."""
    assessment_status: AssessmentStatus
    pension_status: PensionStatus
    relationship: Relationship
    homeowner: bool
    entry_path: EntryPath
    service_mix: ServiceMix
    effective_date: date
    person_name: Optional[str] = None
    income_excluding_pension: Optional[float] = None
    financial_assets: Optional[float] = None
    partner_income: Optional[float] = None
    partner_assets: Optional[float] = None
    hcp_paid_fees: Optional[bool] = None
    classification: Optional[Classification] = None
    hcp_level_when_grandfathered: Optional[int] = None  # 1..4, set for entry paths 2 and 4


@dataclass
class SourceCitation:
    label: str
    key: str
    value: str
    source_url: Optional[str] = None


@dataclass
class RangeAnchor:
    classification: Classification
    weekly: float
    annual: float
    label: str


@dataclass
class HcpComparison:
    """Workstream L output, what the participant would have paid under HCP.

    Uses the last-indexation (September 2025) HCP fee schedule, held as
    historical_fixed constants in INDEX-1. All figures are illustrative for
    caregivers to see the cost delta between the old and new arrangements.
    """
    hcp_level: int                              # 1..4
    basic_daily_fee_daily: float                # $12.09 .. $13.49
    itcf_daily: float                           # $0 for full pensioners; means-tested otherwise
    hcp_weekly: float                           # (BDF + ITCF) x 7
    hcp_annual: float                           # (BDF + ITCF) x 365
    sah_weekly: float                           # already computed for the same person
    sah_annual: float
    delta_weekly: float                         # positive = SAH costs more; negative = SAH cheaper
    delta_annual: float
    is_sah_cheaper: bool
    itcf_annual_cap_applied: float              # $7,047.55 or $14,095.20 or None
    itcf_annual_capped: bool                    # True if the raw ITCF would exceed the cap
    itcf_lifetime_cap: float                    # $84,571.66


@dataclass
class CE2Output:
    """Output contract for CE-2, spec §4.1."""
    contribution_weekly: float = 0.0
    contribution_fortnightly: float = 0.0
    contribution_monthly: float = 0.0
    contribution_quarterly: float = 0.0
    contribution_annual: float = 0.0
    government_share_weekly: float = 0.0
    government_share_annual: float = 0.0
    government_share_percent: float = 100.0
    independence_rate: float = 0.0          # percent, 0-100
    everyday_rate: float = 0.0              # percent, 0-100
    total_rate: float = 0.0                 # weighted total, percent
    is_no_worse_off: bool = False
    is_fee_exempt: bool = False
    is_transitional: bool = False
    applicable_lifetime_cap: Optional[float] = None
    contribution_post_october_2026_weekly: float = 0.0
    contribution_post_october_2026_annual: float = 0.0
    range_mode: bool = False
    range_min_weekly: Optional[float] = None
    range_max_weekly: Optional[float] = None
    range_anchors: List[RangeAnchor] = field(default_factory=list)
    show_hcp_comparison: HcpComparisonMode = "never"
    hcp_comparison: Optional[HcpComparison] = None
    source_citations: List[SourceCitation] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # Serialise nested dataclasses that asdict already handled.
        return d


# ---------------------------------------------------------------------------
# Rounding helpers
# ---------------------------------------------------------------------------

def _round(value: float, places: int = 2) -> float:
    if value is None:
        return None  # type: ignore[return-value]
    return float(Decimal(str(value)).quantize(
        Decimal(10) ** -places, rounding=ROUND_HALF_UP,
    ))


def _round_dollar(value: float) -> int:
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------------------
# INDEX-1 accessors
# ---------------------------------------------------------------------------

def _cst(registry, key: str, effective: Optional[date] = None) -> float:
    """Get a monetary constant as a float, honouring effective-date lookup."""
    val = registry.get_value(key, as_of=effective) if effective else registry.get_value(key)
    return float(val)


def classification_annual_service_base(registry, classification: Classification, effective: date) -> float:
    """Return the annual service funding base for a classification."""
    if classification.startswith("class_"):
        n = classification.split("_")[1]
        return _cst(registry, f"classification_annual.{n}", effective)
    if classification.startswith("transitional_"):
        n = classification.split("_")[1]
        return _cst(registry, f"transitional_hcp.{n}.annual_aud", effective)
    if classification == "rcp":
        return _cst(registry, "pathway.restorative_care.episode_aud", effective)
    if classification == "eolp":
        return _cst(registry, "pathway.end_of_life.episode_aud", effective)
    raise ValueError(f"Unknown classification: {classification!r}")


def _means_test_constants(registry, relationship: Relationship, homeowner: bool, effective: date):
    """Return the four constants the means-test formula needs."""
    if relationship == "single":
        income_free = _cst(registry, "means_test.income_free_area.individual", effective)
        assets_free = _cst(
            registry,
            "means_test.assets_free_area.individual_homeowner" if homeowner
            else "means_test.assets_free_area.individual_non_homeowner",
            effective,
        )
        income_limit = _cst(registry, "means_test.income_limit.individual", effective)
    else:
        income_free = _cst(registry, "means_test.income_free_area.couple_member", effective)
        assets_free = _cst(
            registry,
            "means_test.assets_free_area.couple_homeowner" if homeowner
            else "means_test.assets_free_area.couple_non_homeowner",
            effective,
        )
        income_limit = _cst(registry, "means_test.income_limit.couple", effective)
    income_taper = _cst(registry, "means_test.income_taper_pct", effective)
    asset_taper = _cst(registry, "means_test.asset_taper_pct", effective)
    return income_free, assets_free, income_limit, income_taper, asset_taper


# ---------------------------------------------------------------------------
# Workstream B, Means-Test Formula
# ---------------------------------------------------------------------------

def means_test(
    *,
    assessable_income_annual: float,
    assessable_assets: float,
    income_free_area: float,
    assets_free_area: float,
    income_limit: float,
    income_taper: float,
    asset_taper: float,
    rate_floor_independence: float,
    rate_ceiling_independence: float,
    rate_floor_everyday: float,
    rate_ceiling_everyday: float,
) -> Dict[str, float]:
    """Six-step means-test formula per spec §2.4.

    Endpoint arguments differ between standard arrangements
    (5-50 / 17.5-80) and no-worse-off arrangements (0-25 / 0-25). Callers
    supply them explicitly.
    """
    income_reduction = round(max(0.0, (assessable_income_annual - income_free_area)) * income_taper)
    asset_reduction = round(max(0.0, (assessable_assets - assets_free_area)) * asset_taper)
    max_reduction = round((income_limit - income_free_area) * income_taper)
    if max_reduction <= 0:
        raw_input_rate = 0.0
    else:
        raw_input_rate = (max(income_reduction, asset_reduction) / max_reduction) * 100.0
    independence_rate = raw_input_rate * 0.45 + rate_floor_independence
    everyday_rate = raw_input_rate * 0.625 + rate_floor_everyday
    # Apply floor and ceiling. Floor is baked into the linear formula already;
    # ceiling is applied here.
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
# Workstream F, Entry path resolution
# ---------------------------------------------------------------------------

@dataclass
class EntryPathResolution:
    is_fee_exempt: bool
    is_no_worse_off: bool
    is_transitional: bool
    applicable_lifetime_cap: Optional[float]  # None when fee exempt
    show_hcp_comparison: HcpComparisonMode
    rate_table: Literal["standard", "no_worse_off"]


def resolve_entry_path(registry, entry_path: EntryPath, hcp_paid_fees: Optional[bool]) -> EntryPathResolution:
    """Determine which rate table applies + fee-exemption + lifetime cap.

    Spec §4.6 branching:
      - hcp_pre_sep_2024 + hcp_paid_fees=false  -> fee exempt (permanent zero)
      - hcp_pre_sep_2024 + hcp_paid_fees=true|null -> no-worse-off
      - npq_pre_sep_2024 -> no-worse-off
      - hcp_post_sep_pre_nov_2025 -> standard (transitional)
      - post_nov_2025 -> standard
      - not_assessed -> standard (range mode)
    """
    cap_standard = _cst(registry, "lifetime_cap.standard")
    cap_nwo = _cst(registry, "lifetime_cap.no_worse_off")
    cap_hcp = _cst(registry, "lifetime_cap.hcp_transitioned")

    if entry_path == "hcp_pre_sep_2024":
        if hcp_paid_fees is False:
            return EntryPathResolution(
                is_fee_exempt=True, is_no_worse_off=True, is_transitional=False,
                applicable_lifetime_cap=None, show_hcp_comparison="always",
                rate_table="no_worse_off",
            )
        return EntryPathResolution(
            is_fee_exempt=False, is_no_worse_off=True, is_transitional=False,
            applicable_lifetime_cap=cap_hcp, show_hcp_comparison="always",
            rate_table="no_worse_off",
        )
    if entry_path == "npq_pre_sep_2024":
        return EntryPathResolution(
            is_fee_exempt=False, is_no_worse_off=True, is_transitional=False,
            applicable_lifetime_cap=cap_nwo, show_hcp_comparison="never",
            rate_table="no_worse_off",
        )
    if entry_path == "hcp_post_sep_pre_nov_2025":
        return EntryPathResolution(
            is_fee_exempt=False, is_no_worse_off=False, is_transitional=True,
            applicable_lifetime_cap=cap_standard, show_hcp_comparison="always",
            rate_table="standard",
        )
    if entry_path == "post_nov_2025":
        return EntryPathResolution(
            is_fee_exempt=False, is_no_worse_off=False, is_transitional=False,
            applicable_lifetime_cap=cap_standard, show_hcp_comparison="toggle",
            rate_table="standard",
        )
    if entry_path == "not_assessed":
        return EntryPathResolution(
            is_fee_exempt=False, is_no_worse_off=False, is_transitional=False,
            applicable_lifetime_cap=cap_standard, show_hcp_comparison="toggle",
            rate_table="standard",
        )
    raise ValueError(f"Unknown entry_path: {entry_path!r}")


# ---------------------------------------------------------------------------
# Rate resolution, plugs pension_status + rate_table together
# ---------------------------------------------------------------------------

def _resolve_rates(
    registry,
    *,
    input_data: CE2Input,
    resolution: EntryPathResolution,
    use_ceiling_for_range: bool = False,
) -> Dict[str, float]:
    """Return {independence_rate_pct, everyday_rate_pct, input_rate_pct} for
    the given pension status and rate table.

    Full pensioners and self-funded users have deterministic rates (no means
    test). Part pensioners and CSHC users hit the means-test formula. If they
    skipped the financial-detail fields, the caller passes ``use_ceiling_for_range``
    to produce the upper bound of the range.
    """
    ps = input_data.pension_status
    if resolution.rate_table == "no_worse_off":
        floor_ind, ceil_ind = 0.0, 25.0
        floor_ev, ceil_ev = 0.0, 25.0
        default_full_ind, default_full_ev = 0.0, 0.0
        default_self_ind, default_self_ev = 25.0, 25.0
    else:
        floor_ind, ceil_ind = 5.0, 50.0
        floor_ev, ceil_ev = 17.5, 80.0
        default_full_ind, default_full_ev = 5.0, 17.5
        default_self_ind, default_self_ev = 50.0, 80.0

    if ps == "full_pension":
        return {
            "input_rate_pct": 0.0,
            "independence_rate_pct": default_full_ind,
            "everyday_rate_pct": default_full_ev,
        }
    if ps == "self_funded":
        return {
            "input_rate_pct": 100.0,
            "independence_rate_pct": default_self_ind,
            "everyday_rate_pct": default_self_ev,
        }

    # ps in ('part_pension', 'cshc') -> means test
    income_free, assets_free, income_limit, income_taper, asset_taper = _means_test_constants(
        registry, input_data.relationship, input_data.homeowner, input_data.effective_date,
    )
    # Range fallback: if the user did not supply financial details, we return
    # None from the caller flow. This path is used when they DID supply them.
    inc = input_data.income_excluding_pension or 0.0
    assets = input_data.financial_assets or 0.0
    if input_data.relationship == "couple":
        # Assess income and assets as half of combined per spec §2.4.
        combined_income = inc + (input_data.partner_income or 0.0)
        combined_assets = assets + (input_data.partner_assets or 0.0)
        inc = combined_income / 2.0
        assets = combined_assets / 2.0

    r = means_test(
        assessable_income_annual=inc,
        assessable_assets=assets,
        income_free_area=income_free,
        assets_free_area=assets_free,
        income_limit=income_limit,
        income_taper=income_taper,
        asset_taper=asset_taper,
        rate_floor_independence=floor_ind,
        rate_ceiling_independence=ceil_ind,
        rate_floor_everyday=floor_ev,
        rate_ceiling_everyday=ceil_ev,
    )
    return {
        "input_rate_pct": r["input_rate_pct"],
        "independence_rate_pct": r["independence_rate_pct"],
        "everyday_rate_pct": r["everyday_rate_pct"],
    }


# ---------------------------------------------------------------------------
# Workstream H, 1 October 2026 date-aware split of Independence
# ---------------------------------------------------------------------------

def october_2026_split(
    registry,
    *,
    independence_spend_annual: float,
    independence_rate_pct: float,
    effective_date: date,
) -> Dict[str, float]:
    """Return the Independence-category contribution split under both regimes.

    Before 1 October 2026: both personal-care and other-Independence sub-shares
    contribute at the full Independence rate.
    From 1 October 2026: personal-care sub-share contributes at 0% (fully
    government-funded), other-Independence sub-share continues at the
    Independence rate.
    """
    pc_share = _cst(registry, "ce2.personal_care_sub_share_of_independence")
    other_share = 1.0 - pc_share
    pre_oct = independence_spend_annual * (independence_rate_pct / 100.0)
    post_oct = independence_spend_annual * other_share * (independence_rate_pct / 100.0)
    return {
        "personal_care_sub_share": pc_share,
        "other_share": other_share,
        "independence_contribution_pre_oct_2026_annual": _round(pre_oct, 2),
        "independence_contribution_post_oct_2026_annual": _round(post_oct, 2),
    }


# ---------------------------------------------------------------------------
# Workstream G, Range calculation (not-yet-assessed pathway)
# ---------------------------------------------------------------------------

def range_calculation(
    registry,
    *,
    input_data: CE2Input,
    resolution: EntryPathResolution,
    rate_lookup: Dict[str, float],
    classes: Optional[List[Classification]] = None,
) -> List[RangeAnchor]:
    """Compute a weekly + annual contribution for each anchor classification.

    ``rate_lookup`` is the resolved rate output (from :func:`_resolve_rates`)
    so range calculation stays purely arithmetic, the means-test is not
    recomputed per classification.
    """
    anchors: List[RangeAnchor] = []
    for cls in (classes or RANGE_ANCHOR_CLASSES):
        base = classification_annual_service_base(registry, cls, input_data.effective_date)
        annual = _classify_contribution(base, input_data.service_mix, rate_lookup)
        weekly = annual / WEEKS_PER_YEAR
        anchors.append(RangeAnchor(
            classification=cls,
            weekly=_round(weekly, 2),
            annual=_round(annual, 2),
            label=_class_label(cls),
        ))
    return anchors


def _class_label(cls: Classification) -> str:
    if cls.startswith("class_"):
        return f"Class {cls.split('_')[1]}"
    if cls.startswith("transitional_"):
        return f"Transitional Level {cls.split('_')[1]}"
    if cls == "rcp":
        return "Restorative Care Pathway"
    if cls == "eolp":
        return "End of Life Pathway"
    return cls


def _classify_contribution(
    annual_base: float,
    service_mix: ServiceMix,
    rate_lookup: Dict[str, float],
) -> float:
    """Weighted contribution across the three service categories."""
    ind_share = annual_base * (service_mix.independence / 100.0)
    ev_share = annual_base * (service_mix.everyday / 100.0)
    ind_contrib = ind_share * (rate_lookup["independence_rate_pct"] / 100.0)
    ev_contrib = ev_share * (rate_lookup["everyday_rate_pct"] / 100.0)
    # Clinical is always 0% -> no contribution component.
    return ind_contrib + ev_contrib


# ---------------------------------------------------------------------------
# Workstream L, HCP comparison
# ---------------------------------------------------------------------------

def hcp_comparison(
    registry,
    *,
    input_data: CE2Input,
    sah_annual: float,
) -> Optional[HcpComparison]:
    """Compute the participant's would-be HCP cost using the September 2025
    historical fee schedule, and diff against their SAH cost.

    Returns None when we cannot identify an HCP level (e.g. classification is
    an RCP / EOLP short-stay pathway, or no classification chosen).
    """
    # Prefer the explicitly-recorded HCP level when the user was actually on
    # an HCP (entry paths 2 + 4). Otherwise map via HCP_LEVEL_FROM_SAH_CLASS.
    if input_data.hcp_level_when_grandfathered in (1, 2, 3, 4):
        level = int(input_data.hcp_level_when_grandfathered)
    elif input_data.classification and input_data.classification in HCP_LEVEL_FROM_SAH_CLASS:
        level = HCP_LEVEL_FROM_SAH_CLASS[input_data.classification]
    else:
        return None

    # Basic Daily Fee (historical fixed at last indexation).
    bdf = _cst(registry, f"hcp.basic_daily_fee.level_{level}")

    # Income-Tested Care Fee. Full pensioners are exempt (their assessable
    # income is below the free area by definition). CSHC / part / self-funded
    # go through the daily calculation, capped at the tier caps.
    if input_data.pension_status == "full_pension":
        itcf_daily = 0.0
        itcf_annual_cap = _cst(registry, "hcp.itcf.annual_cap_tier1")
        itcf_capped = False
    else:
        income_free = _cst(
            registry,
            "hcp.itcf.income_free_area.individual" if input_data.relationship == "single"
            else "hcp.itcf.income_free_area.couple",
        )
        tier2_threshold = _cst(
            registry,
            "hcp.itcf.tier2_income_threshold.individual" if input_data.relationship == "single"
            else "hcp.itcf.tier2_income_threshold.couple",
        )
        max_daily_t1 = _cst(registry, "hcp.itcf.max_daily_rate_tier1")
        max_daily_t2 = _cst(registry, "hcp.itcf.max_daily_rate_tier2")
        cap_t1 = _cst(registry, "hcp.itcf.annual_cap_tier1")
        cap_t2 = _cst(registry, "hcp.itcf.annual_cap_tier2")

        income = float(input_data.income_excluding_pension or 0.0)
        if input_data.relationship == "couple":
            income = (income + float(input_data.partner_income or 0.0)) / 2.0
        raw_daily = max(0.0, (income - income_free)) * 0.5 / 365.0

        if income > tier2_threshold:
            itcf_daily = min(raw_daily, max_daily_t2)
            itcf_annual_cap = cap_t2
        else:
            itcf_daily = min(raw_daily, max_daily_t1)
            itcf_annual_cap = cap_t1

        raw_annual = itcf_daily * 365.0
        itcf_capped = raw_annual > itcf_annual_cap + 0.005

    hcp_annual = (bdf + itcf_daily) * 365.0
    hcp_weekly = hcp_annual / WEEKS_PER_YEAR

    sah_weekly = sah_annual / WEEKS_PER_YEAR
    delta_weekly = sah_weekly - hcp_weekly
    delta_annual = sah_annual - hcp_annual

    return HcpComparison(
        hcp_level=level,
        basic_daily_fee_daily=_round(bdf, 2),
        itcf_daily=_round(itcf_daily, 2),
        hcp_weekly=_round(hcp_weekly, 2),
        hcp_annual=_round(hcp_annual, 2),
        sah_weekly=_round(sah_weekly, 2),
        sah_annual=_round(sah_annual, 2),
        delta_weekly=_round(delta_weekly, 2),
        delta_annual=_round(delta_annual, 2),
        is_sah_cheaper=delta_annual < 0,
        itcf_annual_cap_applied=_round(itcf_annual_cap, 2),
        itcf_annual_capped=itcf_capped,
        itcf_lifetime_cap=_cst(registry, "hcp.itcf.lifetime_cap"),
    )


# ---------------------------------------------------------------------------
# Workstream A, Main calculation orchestrator
# ---------------------------------------------------------------------------

def calculate(input_data: CE2Input) -> CE2Output:
    """The public CE-2 calculation entry point.

    Determines fee-exemption, applies the means-test where needed, computes
    weighted contribution against the classification base, produces the
    October 2026 comparison, and packages the citations. Everything else
    (form logic, sharing, rendering) is downstream.
    """
    registry = load_registry()
    input_data.service_mix.validate()

    resolution = resolve_entry_path(registry, input_data.entry_path, input_data.hcp_paid_fees)

    # Fee-exempt short-circuit takes precedence over everything else.
    if resolution.is_fee_exempt:
        return _fee_exempt_output(registry, resolution, input_data)

    # ---- Range mode (not-yet-assessed) --------------------------------------
    if input_data.assessment_status == "not_assessed" or input_data.classification is None:
        return _range_mode_output(registry, resolution, input_data)

    # ---- Range mode (Part/CSHC skipped financials) --------------------------
    if input_data.pension_status in ("part_pension", "cshc") \
            and input_data.income_excluding_pension is None \
            and input_data.financial_assets is None:
        return _band_range_output(registry, resolution, input_data)

    # ---- Standard case: specific classification, resolved rates -------------
    rate_lookup = _resolve_rates(registry, input_data=input_data, resolution=resolution)
    return _finalise(registry, input_data, resolution, rate_lookup)


def _finalise(registry, input_data: CE2Input, resolution: EntryPathResolution, rate_lookup: Dict[str, float]) -> CE2Output:
    """Package the point-estimate output (non-range, non-fee-exempt)."""
    classification = input_data.classification
    base_annual = classification_annual_service_base(registry, classification, input_data.effective_date)

    # Contribution components.
    ind_share_annual = base_annual * (input_data.service_mix.independence / 100.0)
    ev_share_annual = base_annual * (input_data.service_mix.everyday / 100.0)
    contribution_annual = (
        ind_share_annual * (rate_lookup["independence_rate_pct"] / 100.0)
        + ev_share_annual * (rate_lookup["everyday_rate_pct"] / 100.0)
    )
    weekly = contribution_annual / WEEKS_PER_YEAR
    fortnightly = contribution_annual / FORTNIGHTS_PER_YEAR
    monthly = contribution_annual / MONTHS_PER_YEAR
    quarterly = contribution_annual / QUARTERS_PER_YEAR

    govt_annual = base_annual - contribution_annual
    govt_weekly = govt_annual / WEEKS_PER_YEAR
    govt_pct = 100.0 - (contribution_annual / base_annual * 100.0) if base_annual else 100.0

    total_rate_weighted = _weighted_total_rate(input_data.service_mix, rate_lookup)

    # October 2026 comparison.
    oct_split = october_2026_split(
        registry,
        independence_spend_annual=ind_share_annual,
        independence_rate_pct=rate_lookup["independence_rate_pct"],
        effective_date=input_data.effective_date,
    )
    ev_contribution_annual = ev_share_annual * (rate_lookup["everyday_rate_pct"] / 100.0)
    contribution_post_oct_annual = oct_split["independence_contribution_post_oct_2026_annual"] + ev_contribution_annual
    contribution_post_oct_weekly = contribution_post_oct_annual / WEEKS_PER_YEAR

    return CE2Output(
        contribution_weekly=_round(weekly, 2),
        contribution_fortnightly=_round(fortnightly, 2),
        contribution_monthly=_round(monthly, 2),
        contribution_quarterly=_round(quarterly, 2),
        contribution_annual=_round(contribution_annual, 2),
        government_share_weekly=_round(govt_weekly, 2),
        government_share_annual=_round(govt_annual, 2),
        government_share_percent=_round(govt_pct, 2),
        independence_rate=_round(rate_lookup["independence_rate_pct"], 2),
        everyday_rate=_round(rate_lookup["everyday_rate_pct"], 2),
        total_rate=_round(total_rate_weighted, 2),
        is_no_worse_off=resolution.is_no_worse_off,
        is_fee_exempt=False,
        is_transitional=resolution.is_transitional,
        applicable_lifetime_cap=resolution.applicable_lifetime_cap,
        contribution_post_october_2026_weekly=_round(contribution_post_oct_weekly, 2),
        contribution_post_october_2026_annual=_round(contribution_post_oct_annual, 2),
        show_hcp_comparison=resolution.show_hcp_comparison,
        hcp_comparison=hcp_comparison(
            registry,
            input_data=input_data,
            sah_annual=contribution_annual,
        ) if resolution.show_hcp_comparison != "never" else None,
        source_citations=_build_citations(registry, resolution),
    )


def _weighted_total_rate(mix: ServiceMix, rates: Dict[str, float]) -> float:
    """Blended contribution rate across all three streams (clinical is 0)."""
    ind_weight = mix.independence / 100.0
    ev_weight = mix.everyday / 100.0
    return rates["independence_rate_pct"] * ind_weight + rates["everyday_rate_pct"] * ev_weight


def _fee_exempt_output(registry, resolution: EntryPathResolution, input_data: CE2Input) -> CE2Output:
    return CE2Output(
        is_fee_exempt=True,
        is_no_worse_off=True,
        applicable_lifetime_cap=None,
        show_hcp_comparison=resolution.show_hcp_comparison,
        hcp_comparison=hcp_comparison(
            registry, input_data=input_data, sah_annual=0.0,
        ) if resolution.show_hcp_comparison != "never" else None,
        source_citations=_build_citations(registry, resolution),
    )


def _range_mode_output(registry, resolution: EntryPathResolution, input_data: CE2Input) -> CE2Output:
    """Range across Class 3, 5, 8 anchors for the not-yet-assessed pathway."""
    rate_lookup = _resolve_rates(registry, input_data=input_data, resolution=resolution)
    anchors = range_calculation(registry, input_data=input_data, resolution=resolution, rate_lookup=rate_lookup)
    weeklies = [a.weekly for a in anchors]
    return CE2Output(
        range_mode=True,
        range_min_weekly=min(weeklies) if weeklies else None,
        range_max_weekly=max(weeklies) if weeklies else None,
        range_anchors=anchors,
        independence_rate=_round(rate_lookup["independence_rate_pct"], 2),
        everyday_rate=_round(rate_lookup["everyday_rate_pct"], 2),
        total_rate=_round(_weighted_total_rate(input_data.service_mix, rate_lookup), 2),
        is_no_worse_off=resolution.is_no_worse_off,
        is_transitional=resolution.is_transitional,
        applicable_lifetime_cap=resolution.applicable_lifetime_cap,
        show_hcp_comparison=resolution.show_hcp_comparison,
        source_citations=_build_citations(registry, resolution),
    )


def _band_range_output(registry, resolution: EntryPathResolution, input_data: CE2Input) -> CE2Output:
    """Part / CSHC user skipped financials, produce a floor-and-ceiling range."""
    if resolution.rate_table == "no_worse_off":
        floor_rates = {"input_rate_pct": 0.0, "independence_rate_pct": 0.0, "everyday_rate_pct": 0.0}
        ceiling_rates = {"input_rate_pct": 100.0, "independence_rate_pct": 25.0, "everyday_rate_pct": 25.0}
    else:
        floor_rates = {"input_rate_pct": 0.0, "independence_rate_pct": 5.0, "everyday_rate_pct": 17.5}
        ceiling_rates = {"input_rate_pct": 100.0, "independence_rate_pct": 50.0, "everyday_rate_pct": 80.0}

    classification = input_data.classification or "class_5"
    base_annual = classification_annual_service_base(registry, classification, input_data.effective_date)
    ind_share = base_annual * (input_data.service_mix.independence / 100.0)
    ev_share = base_annual * (input_data.service_mix.everyday / 100.0)

    floor_annual = (
        ind_share * floor_rates["independence_rate_pct"] / 100.0
        + ev_share * floor_rates["everyday_rate_pct"] / 100.0
    )
    ceiling_annual = (
        ind_share * ceiling_rates["independence_rate_pct"] / 100.0
        + ev_share * ceiling_rates["everyday_rate_pct"] / 100.0
    )
    return CE2Output(
        range_mode=True,
        range_min_weekly=_round(floor_annual / WEEKS_PER_YEAR, 2),
        range_max_weekly=_round(ceiling_annual / WEEKS_PER_YEAR, 2),
        independence_rate=floor_rates["independence_rate_pct"],  # floor as display default
        everyday_rate=floor_rates["everyday_rate_pct"],
        total_rate=_round(_weighted_total_rate(input_data.service_mix, floor_rates), 2),
        is_no_worse_off=resolution.is_no_worse_off,
        is_transitional=resolution.is_transitional,
        applicable_lifetime_cap=resolution.applicable_lifetime_cap,
        show_hcp_comparison=resolution.show_hcp_comparison,
        source_citations=_build_citations(registry, resolution),
    )


def _build_citations(registry, resolution: EntryPathResolution) -> List[SourceCitation]:
    """Assemble the constant citations that back this calculation."""
    citations: List[SourceCitation] = []
    keys = [
        "means_test.income_free_area.individual",
        "means_test.assets_free_area.individual_homeowner",
        "means_test.income_limit.individual",
        "means_test.income_taper_pct",
        "means_test.asset_taper_pct",
    ]
    if resolution.applicable_lifetime_cap is not None:
        if resolution.is_no_worse_off and not resolution.is_fee_exempt:
            keys.append(
                "lifetime_cap.hcp_transitioned" if resolution.applicable_lifetime_cap == 84571.66
                else "lifetime_cap.no_worse_off"
            )
        else:
            keys.append("lifetime_cap.standard")
    for k in keys:
        e = registry.get_entry(k)
        if e is None:
            continue
        val = e.value
        citations.append(SourceCitation(
            label=k.replace("_", " ").replace(".", ": "),
            key=k,
            value=f"${val:,.2f}" if e.unit == "AUD" else f"{val}",
            source_url=e.source_url,
        ))
    return citations


# ---------------------------------------------------------------------------
# Convenience constructor for API/route callers
# ---------------------------------------------------------------------------

def build_input(payload: Dict[str, Any]) -> CE2Input:
    """Coerce a plain dict (from an HTTP body or fixture) into a CE2Input."""
    mix = payload.get("service_mix") or {}
    ed = payload.get("effective_date")
    if isinstance(ed, str):
        ed = date.fromisoformat(ed)
    elif ed is None:
        ed = date.today()
    return CE2Input(
        assessment_status=payload["assessment_status"],
        pension_status=payload["pension_status"],
        relationship=payload["relationship"],
        homeowner=bool(payload["homeowner"]),
        entry_path=payload["entry_path"],
        service_mix=ServiceMix(
            clinical=float(mix.get("clinical", DEFAULT_SERVICE_MIX["clinical"])),
            independence=float(mix.get("independence", DEFAULT_SERVICE_MIX["independence"])),
            everyday=float(mix.get("everyday", DEFAULT_SERVICE_MIX["everyday"])),
        ),
        effective_date=ed,
        person_name=payload.get("person_name"),
        income_excluding_pension=payload.get("income_excluding_pension") or payload.get("income_excluding_pension_annual"),
        financial_assets=payload.get("financial_assets"),
        partner_income=payload.get("partner_income"),
        partner_assets=payload.get("partner_assets"),
        hcp_paid_fees=payload.get("hcp_paid_fees"),
        classification=payload.get("classification"),
        hcp_level_when_grandfathered=payload.get("hcp_level_when_grandfathered"),
    )
