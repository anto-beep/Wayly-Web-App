"""Support at Home indicative published-price snapshot (Feb 2026).

Used by INV-1 check C12 (unit-price-vs-published) when a provider has not
uploaded their own PPC snapshot. Values are conservative caregiver-visible
ceilings drawn from the publicly released Support at Home indicative price
list; a provider charging above these is worth a question from the family.

Format: keyed by lowercase service descriptor tokens. `_match` performs a
loose contains-match so extractor-normalised descriptions like
"Personal care (shower + dressing)" hit "personal care".

Refresh cadence: quarterly. When the government publishes an updated
schedule, replace `SAH_PUBLISHED_PRICES_2026` with the new mapping and
bump `SAH_PRICEBOOK_VERSION`.
"""
from __future__ import annotations

from typing import Dict, Optional

SAH_PRICEBOOK_VERSION = "2026-02-01"

# Indicative maximum unit price (AUD/hour) a caregiver should expect to see
# on a normally-scheduled weekday service in the ordinary care streams.
# Weekend / after-hours loadings are handled by C2/C3, so this table is the
# BASE WEEKDAY rate ceiling only. Numbers err slightly high so we do not
# spam families with false positives on premium metropolitan providers.
SAH_PUBLISHED_PRICES_2026: Dict[str, float] = {
    # Everyday Living
    "domestic assistance": 72.00,
    "housekeeping": 72.00,
    "cleaning": 72.00,
    "gardening": 78.00,
    "home maintenance": 82.00,
    "meal preparation": 74.00,
    "shopping": 74.00,
    "social support": 74.00,
    "transport": 45.00,      # per one-way trip, not hourly
    # Independence
    "personal care": 84.00,
    "showering": 84.00,
    "dressing": 84.00,
    "toileting": 84.00,
    "medication prompt": 84.00,
    "respite": 88.00,
    # Clinical Care (RN / EN / AHP delivered)
    "nursing": 140.00,
    "registered nurse": 140.00,
    "wound dressing": 140.00,
    "wound care": 140.00,
    "medication management": 140.00,
    "physiotherapy": 155.00,
    "occupational therapy": 155.00,
    "podiatry": 145.00,
    "dietitian": 145.00,
    "speech pathology": 145.00,
    "psychology": 200.00,
    # Care Management / Package Management (charged separately, but included
    # for completeness so obvious overcharges get flagged)
    "care management": 90.00,
    "package management": 90.00,
}


def _normalise(s: str) -> str:
    return " ".join((s or "").lower().replace("(", " ").replace(")", " ").split())


def match_published_price(service_description: Optional[str]) -> Optional[float]:
    """Return the indicative ceiling AUD/hour for `service_description`, or
    None when no rule matches. Runs a longest-key-first contains match so
    "registered nurse wound dressing" hits the more specific "wound
    dressing" ceiling before falling back to "nursing"."""
    if not service_description:
        return None
    desc = _normalise(service_description)
    # Longer keys first so we prefer specific matches
    for key in sorted(SAH_PUBLISHED_PRICES_2026.keys(), key=len, reverse=True):
        if key in desc:
            return SAH_PUBLISHED_PRICES_2026[key]
    return None


def build_snapshot_for_lines(descriptions) -> Dict[str, float]:
    """Return a ``{lowercase_service_type_key: ceiling}`` snapshot in the
    shape expected by ``check_c12_price_vs_published``. Only builds keys
    for descriptions we can actually match."""
    snapshot: Dict[str, float] = {}
    for desc in descriptions or []:
        if not desc:
            continue
        ceiling = match_published_price(desc)
        if ceiling is not None:
            snapshot[desc.lower().strip()[:40]] = ceiling
    return snapshot
