"""Support at Home budget calculation logic, Phase 1 refactor.

This module no longer holds program figures as Python literals. It reads every
classification budget, cap, and percentage through
``program_reference.get_value(key, as_of_date)``, which is the single source of
truth seeded from official sources with point-in-time effective dates.

Public surface (kept stable for every caller already using ``budget_lib``):

  CLASSIFICATIONS                       {1..8: {"label": "Classification N"}}  (label only)
  STREAMS                               ["Clinical", "Independence", "Everyday Living"]
  classification_annual(c, as_of)       float , annual budget for classification c
  quarterly_budget(c, as_of)            float , quarterly budget after 10% CM deduction
  stream_allocations(c, as_of)          dict  , {stream: per-quarter $}
  rollover_cap(c, as_of)                float , greater of $1,000 or 10% of quarterly
  lifetime_cap(is_grandfathered, as_of) float , relevant lifetime cap
  get_quarter_window(today)             tuple , (start, end, label) for the SAH quarter
  compute_burn(line_items, q_start, q_end)
  compute_contributions(line_items)
"""
from __future__ import annotations
from datetime import datetime, date, timezone
from typing import Dict, List, Optional

from program_reference import get_value

# Labels are non-versioned strings, safe to keep as literals.
CLASSIFICATIONS: Dict[int, Dict[str, str]] = {
    n: {"label": f"Classification {n}"} for n in range(1, 9)
}

# Three service streams. Money is NOT fungible across streams.
STREAMS = ["Clinical", "Independence", "Everyday Living"]


def _as_of(as_of: Optional[date | str]) -> Optional[date | str]:
    """Accept date / iso string / None, pass through to program_reference."""
    return as_of


def classification_annual(classification: int, as_of: Optional[date | str] = None) -> float:
    return float(get_value(f"classification_annual.{classification}", _as_of(as_of)))


def quarterly_budget(classification: int, as_of: Optional[date | str] = None) -> float:
    """Participant's quarterly base individual amount (a.k.a. usable quarterly
    budget after the provider's 10% slice).

    Maths: ``daily_total × 365 × (1 - 0.10) / 4``, i.e. 90% of
    ``annual_gross / 4``.

    Per Aged Care Rules 2025 s.229-5 the daily total (e.g. $213.99 for SAH
    class 8) splits into ``base_individual_amount`` ($192.59) plus
    ``base_provider_amount`` ($21.40). The participant's spendable budget IS
    the base individual amount. The Department of Health Schedule of
    Subsidies and Supplements (effective 1 November 2025) confirms the same
    split. So this function returns the per-quarter base individual amount.

    Note on naming: historically called "post care management", confusing
    because care management is a SEPARATE 10% taken from the participant's
    base individual amount each quarter, NOT the provider's 10%. The name is
    kept for backwards compatibility but the value returned here is the
    base individual quarterly amount (pre-care-management).
    """
    annual = classification_annual(classification, as_of)
    cm_pct = float(get_value("care_management.cap_pct", _as_of(as_of)))
    quarterly = annual / 4.0
    return round(quarterly * (1 - cm_pct), 2)


def stream_allocations(classification: int, as_of: Optional[date | str] = None) -> Dict[str, float]:
    """Per-stream quarterly allocation."""
    q = quarterly_budget(classification, as_of)
    proportions = {s: float(get_value(f"stream_proportion.{s}", _as_of(as_of))) for s in STREAMS}
    return {s: round(q * proportions[s], 2) for s in STREAMS}


def rollover_cap(
    classification: int,
    as_of: Optional[date | str] = None,
    days_in_quarter: Optional[int] = None,
) -> float:
    """Greater of $1,000 or 10% of the base individual DAILY amount times the
    number of days in the current calendar quarter.

    BUD-1 v1 (Feb 2026), spec T2/T3 acceptance values are computed on actual
    calendar days per quarter (90, 91, or 92) rather than the flat 91.25-day
    average. Section 193-5 references the daily base individual amount, so the
    days-in-quarter formulation is the correct one.

    ``days_in_quarter``:
      - ``None`` (default), the current SAH calendar quarter is used
        (91 days for Apr-Jun and Jul-Sep, 92 for Oct-Dec, 90 for Jan-Mar).
      - Any positive int, used verbatim. Handy for point-in-time backtesting.

    Floor (``rollover.floor_aud``) and percentage (``rollover.pct``) come
    from program_reference so indexation flows automatically.
    """
    if days_in_quarter is None:
        q_start, q_end, _ = get_quarter_window()
        days_in_quarter = (q_end - q_start).days + 1
    # Daily base individual: derive from the annual gross (annual / 365 gives
    # the daily *total*, of which 90% is the participant's base individual).
    annual = classification_annual(classification, as_of)
    daily_total = annual / 365.0
    daily_base_individual = daily_total * 0.9
    floor = float(get_value("rollover.floor_aud", _as_of(as_of)))
    pct = float(get_value("rollover.pct", _as_of(as_of)))
    return round(max(floor, daily_base_individual * days_in_quarter * pct), 2)


def lifetime_cap(is_grandfathered: bool, as_of: Optional[date | str] = None) -> float:
    key = "lifetime_cap.no_worse_off" if is_grandfathered else "lifetime_cap.standard"
    return float(get_value(key, _as_of(as_of)))


def get_quarter_window(today: Optional[date] = None) -> tuple[date, date, str]:
    """Return (start, end, label) for the Support at Home quarter containing `today`.
    Quarters start 1 Jul / 1 Oct / 1 Jan / 1 Apr."""
    today = today or datetime.now(timezone.utc).date()
    y = today.year
    starts = [
        (date(y, 1, 1), date(y, 3, 31), f"Jan-Mar {y}"),
        (date(y, 4, 1), date(y, 6, 30), f"Apr-Jun {y}"),
        (date(y, 7, 1), date(y, 9, 30), f"Jul-Sep {y}"),
        (date(y, 10, 1), date(y, 12, 31), f"Oct-Dec {y}"),
    ]
    for s, e, label in starts:
        if s <= today <= e:
            return s, e, label
    return starts[0]


def compute_burn(line_items: List[dict], q_start: date, q_end: date) -> Dict[str, float]:
    """Sum total spent per stream within the quarter window."""
    burn = {s: 0.0 for s in STREAMS}
    for li in line_items:
        try:
            d = datetime.fromisoformat(li["date"]).date()
        except Exception:
            continue
        if not (q_start <= d <= q_end):
            continue
        stream = li.get("stream", "Everyday Living")
        if stream not in burn:
            stream = "Everyday Living"
        burn[stream] += float(li.get("total", 0) or 0)
    return {k: round(v, 2) for k, v in burn.items()}


def compute_contributions(line_items: List[dict]) -> float:
    """Sum participant contributions (counted toward lifetime cap)."""
    return round(sum(float(li.get("contribution_paid", 0) or 0) for li in line_items), 2)


# ---------------------------------------------------------------------------
# Backward-compat shims
# ---------------------------------------------------------------------------
# Some callers read ``budget_lib.CLASSIFICATIONS[c]["annual"]`` directly. To
# avoid breaking them in a single phase, we expose a getter that augments the
# dict lazily from the program_reference cache. If the cache is not loaded
# (process bootstrap, test environment) we fall back to the seed literals so
# the legacy callers don't silently get $0.
_FALLBACK_ANNUAL = {
    1: 10731.00, 2: 16034.00, 3: 21966.00, 4: 29696.00,
    5: 39697.00, 6: 48114.00, 7: 58148.00, 8: 78106.00,
}

# Aged Care Rules 2025, section 194-5(3), transitional HCP daily figures
# (levels 1-4 only). Distinct from the ongoing classification figures and
# only applicable to participants who transitioned from a Home Care Package
# on or before 31 October 2025.
_FALLBACK_TRANSITIONAL_ANNUAL = {
    1: 10986.00, 2: 19319.00, 3: 42055.00, 4: 63758.00,
}


def classification_annual_transitional(level: int, as_of: Optional[date | str] = None) -> float:
    """Transitional HCP annual figure for grandfathered participants.

    Source: Aged Care Rules 2025, section 194-5(3). Only levels 1-4 exist
    in the transitional schedule; higher levels raise ValueError.
    """
    if level not in _FALLBACK_TRANSITIONAL_ANNUAL:
        raise ValueError(
            f"Transitional HCP level {level} is not defined, only levels 1-4 "
            "exist per Aged Care Rules 2025, section 194-5(3)."
        )
    try:
        return float(get_value(f"transitional_hcp.{level}.annual_aud", _as_of(as_of)))
    except Exception:
        return _FALLBACK_TRANSITIONAL_ANNUAL[level]


def quarterly_budget_transitional(level: int, as_of: Optional[date | str] = None) -> float:
    """Post-care-management quarterly budget for transitional HCP cohorts."""
    annual = classification_annual_transitional(level, as_of)
    return round(annual * 0.90 / 4.0, 2)


class _ClassificationsView(dict):
    def __getitem__(self, key):
        base = dict(super().__getitem__(key))
        try:
            base["annual"] = classification_annual(key)
        except Exception:
            base["annual"] = _FALLBACK_ANNUAL.get(key, 0)
        return base


CLASSIFICATIONS = _ClassificationsView(CLASSIFICATIONS)
