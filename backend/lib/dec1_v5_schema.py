"""DEC-1 v5 · Phase 1 schema additions.

Additive, backwards-compatible. Existing decoded statements keep working
because everything new is either optional or backfilled at read time.

Reference:
  /app/docs/DEC-1_v5_spec.md §Phase 1 (Consolidate)
  /app/docs/audits/DEC-1-v5-phase0-audit.md §2 (Schema audit)

Nothing in this module is wired to the LLM prompt or the render pipeline
yet, that is Phase 2. This module is safe to import from anywhere without
altering behaviour on live statements.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional

# ---------------------------------------------------------------------------
# Enumerated vocabularies (v5 Invariant 11 "Units are first-class")
# ---------------------------------------------------------------------------

# Fixed unit vocabulary. Anything outside this set is a shipping-block failure.
UNIT_VOCAB: tuple[str, ...] = ("hr", "km", "session", "visit", "ea", "day")

# How the source presents participant contribution / government paid.
# Drives whether RULE_9_CONTRIBUTION_MISMATCH runs (only under per_line).
PER_LINE_CONTRIBUTION_SOURCE_VOCAB: tuple[str, ...] = (
    "aggregate_only",         # Margaret's case: one aggregate figure only
    "per_line",               # Louisa's case: split against every line
    "category_aggregated",    # one figure per stream/category
    "percentage_labelled",    # source states "at 10% for independence" etc
    "unknown",                # extractor could not determine
)

# ---------------------------------------------------------------------------
# Legislative citation allowlist (v5 §F5)
# ---------------------------------------------------------------------------
# The only strings the auditor may output as legislative authority. Any
# citation not on this list is stripped before persistence in strict mode.
# Vague appeals ("as required under the Aged Care Act") are not on the list
# and will be stripped.
LEGISLATIVE_CITATION_ALLOWLIST: tuple[str, ...] = (
    "Aged Care Act 2024",
    "Aged Care Act 2024 s.194-5",
    "Aged Care Act 2024 s.196-15",
    "Aged Care Act 2024 s.196-25",
    "Aged Care Act 2024 s.196-35",
    "Aged Care Act 2024 s.205-15",
    "Aged Care Act 2024 s.238-5",
    "Support at Home Program Manual",
    "Support at Home Program Manual Chapter 17",
    "Aged Care Rules 2025",
    "Home Care Package Program guidelines",
    "DoH 2025 Schedule of Subsidies",
    "DoH 2025 Schedule of Supplements",
)

# Phrases that must NEVER appear on their own as legislative authority.
BANNED_LEGISLATIVE_PHRASES: tuple[str, ...] = (
    "required under aged care legislation",
    "as required under the aged care act",
    "as per the regulation",
    "per government regulations",
    "under aged care legislation",
    "under the aged care regulations",
    "per the aged care rules",
)

# ---------------------------------------------------------------------------
# New line-item schema fields (v5 §Phase 1)
# ---------------------------------------------------------------------------

LINE_ITEM_V5_ADDITIONS = {
    # New nullable fields. LLM may leave any of these unset; extraction is
    # allowed but backfill from `hours` runs on read for pre-v5 rows.
    "quantity": None,           # float | None. Number of units delivered.
    "unit": None,               # str | None from UNIT_VOCAB.
    "raw_qty_text": None,       # str | None. Verbatim source text.
    "raw_rate_text": None,      # str | None. Verbatim source text.
}

# Fields that BECAME nullable in v5. Previously coerced to 0.00 in the schema
# template. Downstream code must accept None and not treat it as 0.
LINE_ITEM_V5_NULLABLE = ("participant_contribution", "government_paid")

# ---------------------------------------------------------------------------
# New extracted_json top-level fields (v5 §Phase 1)
# ---------------------------------------------------------------------------

EXTRACTED_V5_ADDITIONS = {
    # The source's OWN printed subtotal for services this period. Kept
    # distinct from `reported_total_gross` (which sums streams + care mgmt).
    "source_declared_services_total": None,
    # Deterministic sum of extracted line-item gross values. Persisted so
    # the arithmetic reconciliation rule stays repeatable.
    "computed_line_item_sum": None,
    # Verbatim string the care-management amount was read from ("Care
    # management fee (June): $142.50" etc). Needed for anti-fabrication.
    "care_management_source_text": None,
    # How the source presents PC/GP. Drives RULE_9 gating.
    "per_line_contribution_source": None,
    # Cadence-aware funding fields. Monthly statements populate the first,
    # quarterly statements populate the second. Legacy `quarterly_budget_total`
    # retained for back-compat but no longer overloaded across cadences.
    "funding_available_this_month": None,
    "quarterly_allocation": None,
}

# ---------------------------------------------------------------------------
# Anomaly schema additions (v5 §F1, §F4)
# ---------------------------------------------------------------------------

ANOMALY_V5_ADDITIONS = {
    # v5 §F1: every anomaly must cite the specific substring(s) from source
    # that support the flag. Empty list means "no evidence" and triggers a
    # deterministic strip in strict mode.
    "source_evidence": [],
    # v5 §F4: every anomaly's estimated impact must be arithmetically
    # traceable. Null is allowed but does not contribute to summary totals.
    "impact_aud": None,
}

# ---------------------------------------------------------------------------
# Backfill helpers, applied at read-time so pre-v5 rows still render.
# ---------------------------------------------------------------------------

def backfill_line_item(li: Dict[str, Any]) -> Dict[str, Any]:
    """Idempotent backfill of a line item to the v5 shape.

    Pre-v5 rows only have `hours` and non-null `participant_contribution` /
    `government_paid`. Preserve their semantics:
      * If quantity is missing and hours is populated, quantity = hours.
      * If unit is missing and hours > 0, unit = 'hr' (the only pre-v5 unit).
      * If unit is missing and hours == 0, leave unit = None (unknown unit).
      * Nullable PC/GP fields: leave as-is (may be 0.0 in pre-v5 rows).

    Returns a new dict, does not mutate the input.
    """
    if not isinstance(li, dict):
        return li
    out = dict(li)
    for k, v in LINE_ITEM_V5_ADDITIONS.items():
        out.setdefault(k, v)
    # Only backfill quantity/unit from hours if they're missing.
    if out.get("quantity") in (None, ""):
        hours = out.get("hours")
        if isinstance(hours, (int, float)):
            out["quantity"] = float(hours) if hours > 0 else None
    if out.get("unit") in (None, ""):
        hours = out.get("hours")
        # Pre-v5 rows with hours > 0 were always 'hr' (only unit supported).
        # Rows with hours == 0 (cancellations, lump sums) stay unit=None.
        if isinstance(hours, (int, float)) and hours > 0:
            out["unit"] = "hr"
    return out


def backfill_extracted(extracted: Dict[str, Any]) -> Dict[str, Any]:
    """Idempotent backfill of extracted_json to the v5 shape."""
    if not isinstance(extracted, dict):
        return extracted
    out = dict(extracted)
    for k, v in EXTRACTED_V5_ADDITIONS.items():
        out.setdefault(k, v)
    # Backfill the cadence-aware funding fields from legacy
    # `quarterly_budget_total` when we can. This keeps old data readable
    # without losing information.
    legacy_qbudget = out.get("quarterly_budget_total") or 0.0
    if legacy_qbudget and out.get("quarterly_allocation") in (None, 0, 0.0):
        # Legacy `quarterly_budget_total` was always quarterly by convention.
        out["quarterly_allocation"] = float(legacy_qbudget)
    # Line items backfill too.
    lines = out.get("line_items") or []
    if isinstance(lines, list):
        out["line_items"] = [backfill_line_item(li) for li in lines]
    return out


def backfill_anomaly(a: Dict[str, Any]) -> Dict[str, Any]:
    """Idempotent backfill of an anomaly to the v5 shape."""
    if not isinstance(a, dict):
        return a
    out = dict(a)
    for k, v in ANOMALY_V5_ADDITIONS.items():
        # Never overwrite a real value with the default; only fill in when missing.
        if k not in out:
            out[k] = v.copy() if isinstance(v, list) else v
    return out


def backfill_anomalies(anoms: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Convenience wrapper for a list."""
    return [backfill_anomaly(a) for a in (anoms or [])]


# ---------------------------------------------------------------------------
# Validation helpers, used by strict-mode strip functions in the antifab
# module. Kept here so the enum lives in exactly one place.
# ---------------------------------------------------------------------------

def is_valid_unit(u: Optional[str]) -> bool:
    return u is not None and u in UNIT_VOCAB


def is_valid_contribution_source(s: Optional[str]) -> bool:
    return s is not None and s in PER_LINE_CONTRIBUTION_SOURCE_VOCAB


def compute_line_item_sum(line_items: Iterable[Dict[str, Any]]) -> float:
    """Deterministic sum of line-item gross values, ignoring cancellations."""
    total = 0.0
    for li in (line_items or []):
        if not isinstance(li, dict):
            continue
        if li.get("is_cancellation"):
            continue
        g = li.get("gross")
        if isinstance(g, (int, float)):
            total += float(g)
    return round(total, 2)
