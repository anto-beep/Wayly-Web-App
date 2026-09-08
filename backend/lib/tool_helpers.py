"""Pure data + small helpers used by the public tool routes in server.py.

This is the first step of the server.py refactor, extracting reference
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
# Tool 4, Provider Price Checker benchmark medians.
#
# National provider price caps were deferred indefinitely by the Australian
# Government in May 2026 (and as of the latest DoH advice, providers will
# continue to set their own prices until further notice). The figures below
# are the official network medians + ranges published in the Department of
# Health "Summary of indicative Support at Home prices" PDF, October 2025.
#
# Each row carries:
#   - median: AUD, the published "indicative" price
#   - lower / upper: AUD, the published indicative range (verdict thresholds)
#   - unit: "hour" | "trip" | "meal"
#   - stream: "Clinical" | "Independence" | "Everyday Living"
#   - source: DoH provenance string
#   - effective_from: ISO date the figure was published
# Verdict logic in server.public_price_check() uses the official lower/upper
# bounds when available; otherwise it falls back to a +/- 10% / 15% band.
#
# The legacy hyphenated keys are kept (Section "legacy aliases" below) so old
# tests and callers continue to find a match.
# ---------------------------------------------------------------------------
_INDICATIVE_SOURCE = "DoH Summary of indicative Support at Home prices (Oct 2025)"
_INDICATIVE_FROM = "2025-10-01"

PRICE_BENCHMARKS = {
    # ---- Clinical ----
    "Nursing care":                                  {"median": 150.0, "lower": 125.0, "upper": 179.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Registered nurse":                              {"median": 160.0, "lower": 144.0, "upper": 186.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Enrolled nurse":                                {"median": 140.0, "lower": 120.0, "upper": 163.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Nursing assistant":                             {"median": 110.0, "lower":  92.0, "upper": 143.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Allied health and other therapeutic services":  {"median": 195.0, "lower": 160.0, "upper": 220.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Allied health therapy assistant":               {"median": 122.0, "lower": 105.0, "upper": 167.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Counsellor or psychotherapist":                 {"median": 208.0, "lower": 160.0, "upper": 225.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Dietitian or nutritionist":                     {"median": 200.0, "lower": 165.0, "upper": 219.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Exercise physiologist":                         {"median": 190.0, "lower": 165.0, "upper": 219.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Occupational therapist":                        {"median": 200.0, "lower": 174.0, "upper": 220.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Physiotherapist":                               {"median": 185.0, "lower": 160.0, "upper": 210.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Podiatrist":                                    {"median": 180.0, "lower": 153.0, "upper": 208.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Psychologist":                                  {"median": 228.0, "lower": 210.0, "upper": 250.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Social worker":                                 {"median": 200.0, "lower": 163.0, "upper": 238.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Speech pathologist":                            {"median": 208.0, "lower": 187.0, "upper": 236.0, "unit": "hour", "stream": "Clinical",        "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},

    # ---- Independence ----
    "Care management":                               {"median": 120.0, "lower":  80.0, "upper": 150.0, "unit": "hour", "stream": "Independence",   "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Restorative care management":                   {"median": 150.0, "lower": 120.0, "upper": 173.0, "unit": "hour", "stream": "Independence",   "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Personal care":                                 {"median": 100.0, "lower":  85.0, "upper": 115.0, "unit": "hour", "stream": "Independence",   "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Therapeutic services for independent living":   {"median": 165.0, "lower": 140.0, "upper": 220.0, "unit": "hour", "stream": "Independence",   "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Remedial masseuse":                             {"median": 150.0, "lower": 134.0, "upper": 206.0, "unit": "hour", "stream": "Independence",   "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Respite":                                       {"median":  99.0, "lower":  85.0, "upper": 112.0, "unit": "hour", "stream": "Independence",   "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},

    # ---- Everyday Living ----
    "Social support and community engagement":       {"median":  99.0, "lower":  82.0, "upper": 110.0, "unit": "hour", "stream": "Everyday Living", "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Transport":                                     {"median":  70.0, "lower":  40.0, "upper":  97.0, "unit": "trip", "stream": "Everyday Living", "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Domestic assistance":                           {"median":  95.0, "lower":  83.0, "upper": 109.0, "unit": "hour", "stream": "Everyday Living", "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Home maintenance and repairs":                  {"median": 103.0, "lower":  85.0, "upper": 120.0, "unit": "hour", "stream": "Everyday Living", "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Meal delivery":                                 {"median":  15.0, "lower":  11.0, "upper":  22.0, "unit": "meal", "stream": "Everyday Living", "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
    "Meal preparation":                              {"median":  97.0, "lower":  82.0, "upper": 110.0, "unit": "hour", "stream": "Everyday Living", "source": _INDICATIVE_SOURCE, "effective_from": _INDICATIVE_FROM},
}

# ---- Legacy hyphenated aliases, kept so older callers/tests keep matching.
# Each entry points at the canonical DoH row above.
_PRICE_LEGACY_ALIASES = {
    "Domestic assistance, cleaning":  "Domestic assistance",
    "Occupational therapy":            "Occupational therapist",
    "Physiotherapy":                   "Physiotherapist",
    "Social support":                  "Social support and community engagement",
    "Transport, community access":    "Transport",
    "Home maintenance / gardening":    "Home maintenance and repairs",
    "Nursing, registered":            "Registered nurse",
    "Allied health, podiatry":        "Podiatrist",
}
for _alias, _canonical in _PRICE_LEGACY_ALIASES.items():
    PRICE_BENCHMARKS[_alias] = dict(PRICE_BENCHMARKS[_canonical], _alias_of=_canonical)


# ---------------------------------------------------------------------------
# Tool 6, Contribution Estimator rate bands.
#
# Each entry maps a pension cohort + stream to a (min_rate, max_rate) band.
# Exact-rate cohorts have ``min == max``. Band cohorts (part Age Pension,
# CSHC) sit on a Services Australia means-tested range, see iteration
# 40/42 for the full F5/F6 fix history.
# ---------------------------------------------------------------------------
PENSION_RATES = {
    "full":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.05),  "everyday_living": (0.175, 0.175)},
    # Department of Health "Support at Home, participant contributions" PDF
    # (effective 1 November 2025) treats part Age Pension and CSHC as the
    # SAME cohort with the same Services-Australia-set band.
    "part":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.50),  "everyday_living": (0.175, 0.80)},
    "cshc":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.50),  "everyday_living": (0.175, 0.80)},
    "self":      {"clinical": (0.0, 0.0), "independence": (0.50, 0.50),  "everyday_living": (0.80, 0.80)},
}


# ---------------------------------------------------------------------------
# Tool 7, Care Plan Reviewer regex helpers.
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
    when nothing matched. Trades precision for determinism, the LLM's
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
