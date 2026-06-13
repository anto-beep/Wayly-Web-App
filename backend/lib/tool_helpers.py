"""Pure data + small helpers used by the public tool routes in server.py.

This is the first step of the server.py refactor — extracting reference
constants and the small text-parsing helpers that have no FastAPI / Mongo
dependencies. ``server.py`` re-exports these names so any external import
that referenced ``server.PRICE_BENCHMARKS`` etc. continues to work.

Why extract? ``server.py`` is currently ~5,900 lines and growing. Pulling
out content-free constants and pure helpers shrinks the route file and
makes the next refactor step (splitting the route declarations themselves)
considerably safer.
"""
from __future__ import annotations
import re

# ---------------------------------------------------------------------------
# Tool 4 — Provider Price Checker benchmark medians.
#
# National provider price caps were deferred indefinitely by the
# Australian Government in May 2026, so these benchmarks intentionally
# contain only network medians (no cap value).
# ---------------------------------------------------------------------------
PRICE_BENCHMARKS = {
    "Domestic assistance — cleaning": {"median": 76.0},
    "Personal care": {"median": 84.0},
    "Occupational therapy": {"median": 155.0},
    "Physiotherapy": {"median": 145.0},
    "Social support": {"median": 70.0},
    "Transport — community access": {"median": 35.0},
    "Home maintenance / gardening": {"median": 75.0},
    "Meal preparation": {"median": 68.0},
    "Nursing — registered": {"median": 165.0},
    "Allied health — podiatry": {"median": 130.0},
}


# ---------------------------------------------------------------------------
# Tool 6 — Contribution Estimator rate bands.
#
# Each entry maps a pension cohort + stream to a (min_rate, max_rate) band.
# Exact-rate cohorts have ``min == max``. Band cohorts (part Age Pension,
# CSHC) sit on a Services Australia means-tested range — see iteration
# 40/42 for the full F5/F6 fix history.
# ---------------------------------------------------------------------------
PENSION_RATES = {
    "full":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.05),  "everyday_living": (0.175, 0.175)},
    "part":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.25),  "everyday_living": (0.175, 0.25)},
    "cshc":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.50),  "everyday_living": (0.175, 0.80)},
    "self":      {"clinical": (0.0, 0.0), "independence": (0.50, 0.50),  "everyday_living": (0.80, 0.80)},
}


# ---------------------------------------------------------------------------
# Tool 7 — Care Plan Reviewer regex helpers.
# ---------------------------------------------------------------------------
CARE_PLAN_CHECK_KEYS = (
    "budget_fit", "care_management_cap", "service_list",
    "stream_alignment", "review_date", "goals_alignment",
)

_CARE_MGMT_PCT_RE = re.compile(
    r"care\s*management[^%\n]{0,80}?(\d{1,2}(?:\.\d{1,2})?)\s*%", re.IGNORECASE,
)


def parse_care_management_pct(text_lower: str) -> float | None:
    """Extract a "care management ... X%" figure from plan text, or ``None``."""
    m = _CARE_MGMT_PCT_RE.search(text_lower)
    if not m:
        return None
    try:
        return float(m.group(1))
    except Exception:
        return None


_MONTHLY_HINT_RE = re.compile(
    r"monthly[^$\n]{0,40}\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)", re.IGNORECASE,
)


def try_parse_monthly_total(note: str) -> float | None:
    """If the LLM happened to include a "monthly: $X" figure in its note,
    extract it so the deterministic check can compare against the usable
    budget without re-estimating."""
    m = _MONTHLY_HINT_RE.search(note)
    if not m:
        return None
    try:
        return float(m.group(1).replace(",", ""))
    except Exception:
        return None


_PLAN_DOLLAR_LINE_RE = re.compile(
    r"\$\s*([0-9][0-9,]*(?:\.\d{1,2})?)(?:\s*(?:per|/|a)?\s*"
    r"(hour|hr|week|wk|fortnight|month|visit|session))?",
    re.IGNORECASE,
)


def estimate_monthly_total_from_plan_text(text: str) -> float | None:
    """Cheap-and-conservative parser: walks every "$X per <unit>" line in the
    care plan and converts to a monthly figure. Returns the sum, or ``None``
    when nothing matched. Trades precision for determinism — the LLM's
    narrative review remains the qualitative authority."""
    total = 0.0
    found = False
    for match in _PLAN_DOLLAR_LINE_RE.finditer(text):
        try:
            amount = float(match.group(1).replace(",", ""))
        except Exception:
            continue
        unit = (match.group(2) or "").lower()
        if unit in ("week", "wk"):
            monthly_multiplier = 4.33
        elif unit == "fortnight":
            monthly_multiplier = 2.17
        elif unit == "month":
            monthly_multiplier = 1.0
        elif unit in ("visit", "session"):
            monthly_multiplier = 4.33  # assume weekly visits unless other context
        else:
            continue
        total += amount * monthly_multiplier
        found = True
    return round(total, 2) if found else None
