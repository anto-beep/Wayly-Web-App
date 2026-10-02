"""CHSP-TOOLS-1 WS-1 · Per-unit Fee Check engine.

The Fee Check exists to catch OVERCHARGING against a provider's agreed
per-unit rate. It is deliberately conservative:

* Money is ``Decimal``, quantised to two places, half-up.
* Rate bands are PER UNIT:
    - within : |billed_per_unit - agreed_rate| <= max(2% of agreed, $0.50)
    - minor  : <= max(10% of agreed, $2.00)
    - material: beyond the minor band
* Units check:
    - within : billed == received
    - minor  : billed exceeds received by a fraction of one unit
    - material: billed exceeds received by one whole unit or more
* Overall verdict = the worse of the rate tier and the units tier.
* Directionality: an undercharge (billed rate below agreed) and an underbill
  (units billed below units received) are NOT consumer harm. They never
  escalate beyond ``within`` and never offer a dispute case.
* Staleness: if the agreed rate's age at the billed period start exceeds 90
  days, or the billed period spans a known contribution-change date, the
  verdict is marked provisional and a "confirm this rate is current" prompt
  is shown.
* Degradation: with no agreed rate on file, no authoritative verdict is
  produced; the tool enters informational-only state.

This module is asserted against CHSP-FIX-golden-v1 in
``backend/tests/test_chsp_fee_check_golden.py`` and gates the WS-1 flag flip.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Dict, Optional

STALENESS_DAYS = 90

# Tier ranking so the overall verdict can be "the worse of" the two checks.
_TIER_RANK = {"within": 0, "minor": 1, "material": 2}
_RANK_TIER = {v: k for k, v in _TIER_RANK.items()}


def _d(value: Any) -> Decimal:
    """Coerce to Decimal via str so floats do not leak binary noise."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _parse_date(value: Any) -> Optional[date]:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    s = str(value).strip()
    # Accept DD/MM/YYYY (the Wayly human format) and ISO YYYY-MM-DD.
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def rate_tier(agreed_rate: Any, billed_per_unit: Any) -> str:
    """Classify the per-unit rate difference. Overcharge only; an undercharge
    (billed below agreed) is always ``within``."""
    agreed = _d(agreed_rate)
    billed = _d(billed_per_unit)
    if billed <= agreed:
        return "within"  # undercharge or exact match is never harm
    diff = billed - agreed
    within_band = max(agreed * Decimal("0.02"), Decimal("0.50"))
    minor_band = max(agreed * Decimal("0.10"), Decimal("2.00"))
    if diff <= within_band:
        return "within"
    if diff <= minor_band:
        return "minor"
    return "material"


def units_tier(units_received: Any, units_billed: Any) -> str:
    """Classify the units difference. Overbilling only; an underbill (billed
    below received) is always ``within``."""
    received = _d(units_received)
    billed = _d(units_billed)
    if billed <= received:
        return "within"  # underbill is never harm
    over = billed - received
    if over < Decimal("1"):
        return "minor"
    return "material"


def run_fee_check(
    *,
    agreed_rate: Any = None,
    units_received: Any,
    units_billed: Any,
    billed_amount: Any,
    rate_effective_date: Any = None,
    billed_period_start: Any = None,
    spans_contribution_change: bool = False,
) -> Dict[str, Any]:
    """Run the per-unit Fee Check and return a serialisable result.

    Returns keys: ``degraded`` (no agreed rate), ``billed_per_unit``,
    ``expected_amount``, ``rate_difference``, ``amount_delta``, ``rate_tier``,
    ``units_tier``, ``overall_verdict``, ``dispute_offered``, ``provisional``,
    ``rate_age_days``, ``is_overcharge``, ``is_underbill`` and a
    human-facing ``verdict_label``.
    """
    billed_amount_d = _money(_d(billed_amount))
    units_billed_d = _d(units_billed)
    units_received_d = _d(units_received)

    # ---- Degraded state: no authoritative anchor -----------------------
    if agreed_rate is None or str(agreed_rate) == "":
        return {
            "degraded": True,
            "billed_amount": str(billed_amount_d),
            "billed_per_unit": None,
            "expected_amount": None,
            "rate_difference": None,
            "amount_delta": None,
            "rate_tier": None,
            "units_tier": None,
            "overall_verdict": "no_verdict",
            "verdict_label": "No verdict",
            "dispute_offered": False,
            "provisional": False,
            "rate_age_days": None,
            "is_overcharge": False,
            "is_underbill": False,
            "prompt_add_agreed_rate": True,
        }

    agreed_d = _d(agreed_rate)

    # ---- Derived values ------------------------------------------------
    billed_per_unit = _money(billed_amount_d / units_billed_d) if units_billed_d != 0 else Decimal("0.00")
    expected_amount = _money(agreed_d * units_received_d)
    amount_delta = _money(billed_amount_d - expected_amount)
    rate_difference = _money(abs(billed_per_unit - agreed_d))

    r_tier = rate_tier(agreed_d, billed_per_unit)
    u_tier = units_tier(units_received_d, units_billed_d)
    overall_rank = max(_TIER_RANK[r_tier], _TIER_RANK[u_tier])
    overall = _RANK_TIER[overall_rank]

    is_overcharge = billed_per_unit > agreed_d
    is_underbill = units_billed_d < units_received_d

    # ---- Staleness -----------------------------------------------------
    rate_age_days: Optional[int] = None
    eff = _parse_date(rate_effective_date)
    start = _parse_date(billed_period_start)
    if eff and start:
        rate_age_days = (start - eff).days
    stale = bool(spans_contribution_change) or (rate_age_days is not None and rate_age_days > STALENESS_DAYS)

    dispute_offered = overall in ("minor", "material")

    labels = {"within": "Within tolerance", "minor": "Minor", "material": "Material"}
    verdict_label = labels[overall]
    if stale:
        verdict_label = f"{verdict_label}, provisional"

    return {
        "degraded": False,
        "billed_amount": str(billed_amount_d),
        "agreed_rate": str(_money(agreed_d)),
        "billed_per_unit": str(billed_per_unit),
        "expected_amount": str(expected_amount),
        "rate_difference": str(rate_difference),
        "amount_delta": str(amount_delta),
        "rate_tier": r_tier,
        "units_tier": u_tier,
        "overall_verdict": overall,
        "verdict_label": verdict_label,
        "dispute_offered": dispute_offered,
        "provisional": stale,
        "rate_age_days": rate_age_days,
        "is_overcharge": is_overcharge,
        "is_underbill": is_underbill,
        "prompt_add_agreed_rate": False,
    }
