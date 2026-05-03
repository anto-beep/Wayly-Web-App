"""Support at Home reference data and budget calculation logic.

Reference: Australian Department of Health, Disability and Ageing — Support at Home program
classifications and budgets effective 1 November 2025.
"""
from datetime import datetime, date, timezone
from typing import Dict, List

# 8 ongoing classifications (annual amounts in AUD)
CLASSIFICATIONS: Dict[int, Dict] = {
    1: {"annual": 10731, "label": "Classification 1"},
    2: {"annual": 15910, "label": "Classification 2"},
    3: {"annual": 22515, "label": "Classification 3"},
    4: {"annual": 29696, "label": "Classification 4"},
    5: {"annual": 39805, "label": "Classification 5"},
    6: {"annual": 49906, "label": "Classification 6"},
    7: {"annual": 60005, "label": "Classification 7"},
    8: {"annual": 78106, "label": "Classification 8"},
}

# Three service streams. Money is NOT fungible across streams.
STREAMS = ["Clinical", "Independence", "Everyday Living"]

# Indicative stream allocation proportions (varies by participant; this is an MVP default).
STREAM_PROPORTIONS = {
    "Clinical": 0.40,
    "Independence": 0.35,
    "Everyday Living": 0.25,
}

CARE_MANAGEMENT_DEDUCTION = 0.10  # Provider can retain up to 10%
ROLLOVER_FLOOR = 1000.0  # $1,000 or 10% of quarterly budget, whichever is higher

# Lifetime contribution caps
LIFETIME_CAP_GRANDFATHERED = 84571.66
LIFETIME_CAP_NEW_ENTRANT = 135318.69


def get_quarter_window(today: date | None = None) -> tuple[date, date, str]:
    """Return (start, end, label) for the Support at Home quarter containing `today`.
    Quarters start 1 Jul / 1 Oct / 1 Jan / 1 Apr."""
    today = today or datetime.now(timezone.utc).date()
    y = today.year
    starts = [
        (date(y, 1, 1), date(y, 3, 31), f"Jan–Mar {y}"),
        (date(y, 4, 1), date(y, 6, 30), f"Apr–Jun {y}"),
        (date(y, 7, 1), date(y, 9, 30), f"Jul–Sep {y}"),
        (date(y, 10, 1), date(y, 12, 31), f"Oct–Dec {y}"),
    ]
    for s, e, label in starts:
        if s <= today <= e:
            return s, e, label
    return starts[0]


def quarterly_budget(classification: int) -> float:
    """Quarterly budget after care-management deduction."""
    annual = CLASSIFICATIONS[classification]["annual"]
    quarterly = annual / 4.0
    return round(quarterly * (1 - CARE_MANAGEMENT_DEDUCTION), 2)


def stream_allocations(classification: int) -> Dict[str, float]:
    """Per-stream quarterly allocation."""
    q = quarterly_budget(classification)
    return {s: round(q * STREAM_PROPORTIONS[s], 2) for s in STREAMS}


def rollover_cap(classification: int) -> float:
    q = quarterly_budget(classification)
    return max(ROLLOVER_FLOOR, q * 0.10)


def lifetime_cap(is_grandfathered: bool) -> float:
    return LIFETIME_CAP_GRANDFATHERED if is_grandfathered else LIFETIME_CAP_NEW_ENTRANT


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
