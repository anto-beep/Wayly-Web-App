"""Support at Home budget calculation logic — Phase 1 refactor.

This module no longer holds program figures as Python literals. It reads every
classification budget, cap, and percentage through
``program_reference.get_value(key, as_of_date)``, which is the single source of
truth seeded from official sources with point-in-time effective dates.

Public surface (kept stable for every caller already using ``budget_lib``):

  CLASSIFICATIONS                       {1..8: {"label": "Classification N"}}  (label only)
  STREAMS                               ["Clinical", "Independence", "Everyday Living"]
  classification_annual(c, as_of)       float  — annual budget for classification c
  quarterly_budget(c, as_of)            float  — quarterly budget after 10% CM deduction
  stream_allocations(c, as_of)          dict   — {stream: per-quarter $}
  rollover_cap(c, as_of)                float  — greater of $1,000 or 10% of quarterly
  lifetime_cap(is_grandfathered, as_of) float  — relevant lifetime cap
  get_quarter_window(today)             tuple  — (start, end, label) for the SAH quarter
  compute_burn(line_items, q_start, q_end)
  compute_contributions(line_items)
"""
from __future__ import annotations
from datetime import datetime, date, timezone
from typing import Dict, List, Optional

from program_reference import get_value

# Labels are non-versioned strings — safe to keep as literals.
CLASSIFICATIONS: Dict[int, Dict[str, str]] = {
    n: {"label": f"Classification {n}"} for n in range(1, 9)
}

# Three service streams. Money is NOT fungible across streams.
STREAMS = ["Clinical", "Independence", "Everyday Living"]


def _as_of(as_of: Optional[date | str]) -> Optional[date | str]:
    """Accept date / iso string / None — pass through to program_reference."""
    return as_of


def classification_annual(classification: int, as_of: Optional[date | str] = None) -> float:
    return float(get_value(f"classification_annual.{classification}", _as_of(as_of)))


def quarterly_budget(classification: int, as_of: Optional[date | str] = None) -> float:
    """Quarterly budget after care-management deduction."""
    annual = classification_annual(classification, as_of)
    cm_pct = float(get_value("care_management.cap_pct", _as_of(as_of)))
    quarterly = annual / 4.0
    return round(quarterly * (1 - cm_pct), 2)


def stream_allocations(classification: int, as_of: Optional[date | str] = None) -> Dict[str, float]:
    """Per-stream quarterly allocation."""
    q = quarterly_budget(classification, as_of)
    proportions = {s: float(get_value(f"stream_proportion.{s}", _as_of(as_of))) for s in STREAMS}
    return {s: round(q * proportions[s], 2) for s in STREAMS}


def rollover_cap(classification: int, as_of: Optional[date | str] = None) -> float:
    """Greater of $1,000 or 10% of the GROSS quarterly budget.

    Note: the Support at Home rollover rule is calculated against the gross
    quarterly figure (annual / 4), NOT against ``quarterly_budget()`` which
    already deducts the 10% care-management slice. Using the post-CM figure
    understates the cap for Levels 6, 7 and 8 and risks families forfeiting
    funds they were entitled to carry over.
    """
    q_gross = classification_annual(classification, as_of) / 4.0
    floor = float(get_value("rollover.floor_aud", _as_of(as_of)))
    pct = float(get_value("rollover.pct", _as_of(as_of)))
    return max(floor, round(q_gross * pct, 2))


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
    1: 10731.00, 2: 15910.00, 3: 22515.00, 4: 29696.00,
    5: 39805.00, 6: 49906.00, 7: 60005.00, 8: 78106.00,
}


class _ClassificationsView(dict):
    def __getitem__(self, key):
        base = dict(super().__getitem__(key))
        try:
            base["annual"] = classification_annual(key)
        except Exception:
            base["annual"] = _FALLBACK_ANNUAL.get(key, 0)
        return base


CLASSIFICATIONS = _ClassificationsView(CLASSIFICATIONS)
