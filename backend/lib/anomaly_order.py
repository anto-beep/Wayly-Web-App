"""Canonical finding order (DOC-PARITY-1 v2, decisions 5-6).

There are FOUR severity bands and findings render in this order EVERYWHERE
they appear (in-app on web + mobile, and in the downloadable artefact):

    high  ->  medium  ->  low  ->  informational

"informational" collapses both the `info` and `advisory` severities.

Within a band the secondary sort is descending estimated dollar impact, then
date ascending as a tiebreak. The backend sorts once so both surfaces and the
server-authoritative artefact all consume the same ordered list.
"""
from __future__ import annotations

import os
from typing import Any, Dict, List

# Band rank: lower sorts first.
_BAND_RANK = {
    "high": 0,
    "medium": 1,
    "low": 2,
    "info": 3,
    "informational": 3,
    "advisory": 3,
}

# Four human-facing bands in render order.
BANDS = ("high", "medium", "low", "informational")


def band_of(severity: Any) -> str:
    s = (severity or "").strip().lower()
    if s in ("info", "informational", "advisory"):
        return "informational"
    if s in ("high", "medium", "low"):
        return s
    return "low"


def _rank(a: Dict[str, Any]) -> int:
    return _BAND_RANK.get((a.get("severity") or "").strip().lower(), 2)


def _dollar(a: Dict[str, Any]) -> float:
    try:
        return float(a.get("dollar_impact") or 0.0)
    except Exception:
        return 0.0


def _date_key(a: Dict[str, Any]) -> str:
    # Prefer an explicit date, else first evidence date-ish string; ascending.
    for k in ("date", "period_start", "as_of"):
        v = a.get(k)
        if v:
            return str(v)
    return "9999-99-99"


def _enabled() -> bool:
    return os.environ.get("DOCPARITY_ORDERING", "1").strip().lower() in ("1", "true", "yes", "on")


def sort_anomalies(anomalies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return the anomalies in canonical order (band, then desc dollar, then
    date ascending). Stable, deterministic, no mutation of the input list."""
    items = [a for a in (anomalies or []) if isinstance(a, dict)]
    if not _enabled():
        return items
    return sorted(items, key=lambda a: (_rank(a), -_dollar(a), _date_key(a)))


def compute_counts(anomalies: List[Dict[str, Any]]) -> Dict[str, int]:
    """Severity summary counts derived from the ordered list (decision 4)."""
    counts = {"high": 0, "medium": 0, "low": 0, "advisory": 0, "informational": 0}
    for a in (anomalies or []):
        if not isinstance(a, dict):
            continue
        sev = (a.get("severity") or "").strip().lower()
        if sev in ("high", "medium", "low", "advisory"):
            counts[sev] += 1
        b = band_of(sev)
        if b == "informational":
            counts["informational"] += 1
    return counts
