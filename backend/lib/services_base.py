"""Single shared services-base definition (DEC-FINDINGS-1 / IC-FINDINGS-1).

The "services base" used by the care-management cap check and the
source-arithmetic reconciliation check is the sum of CARE-SERVICE line
items only. It EXCLUDES Assistive Technology & Home Modifications (AT-HM),
Care Management, and supplement rows.

Both the Statement Decoder (agents.py) and the Invoice Checker (lib/inv1)
resolve the base through THIS one module so the two checks can never
disagree. The SD-ERR-C phantom "$286.00 AT-HM" reconciliation flag was
caused by the reconciliation check summing all line items (including AT-HM)
while the cap check excluded AT-HM. One definition, reused, fixes that.

Also hosts:
  * the per-line GOVT PAID identity (GROSS - YOU PAID), decision 6;
  * INDEX-1-sourced contribution typical rates, decision 2;
  * per-workstream feature flags for rollback.
"""
from __future__ import annotations

import os
from typing import Any, Iterable, Optional

# Streams that are NOT part of the care-services base.
NON_SERVICE_STREAMS = {
    "ATHM", "AT-HM", "AT&HM", "Assistive Technology", "Home Modifications",
    "CareMgmt", "Care Management", "supplement", "Supplement",
}
_ATHM_STREAMS = {"ATHM", "AT-HM", "AT&HM", "Assistive Technology", "Home Modifications"}

# 1 October 2026 personal-care reclassification (a date constant, not a rate).
PERSONAL_CARE_RECLASS_DATE = "2026-10-01"


def _gross(li: dict) -> float:
    try:
        return float(li.get("gross") if li.get("gross") is not None else (li.get("total") or 0.0))
    except Exception:
        return 0.0


def is_care_service_line(li: Any) -> bool:
    """True for a care-service line item (excludes AT-HM, care management,
    supplements, and cancellations)."""
    if not isinstance(li, dict):
        return False
    if li.get("is_cancellation"):
        return False
    stream = (li.get("stream") or "").strip()
    return stream not in NON_SERVICE_STREAMS


def care_services_subtotal(line_items: Iterable[dict]) -> float:
    """THE services base: sum of gross for care-service line items only."""
    return round(sum(_gross(li) for li in (line_items or []) if is_care_service_line(li)), 2)


def athm_subtotal(line_items: Iterable[dict]) -> float:
    """Sum of gross for AT-HM line items only."""
    total = 0.0
    for li in (line_items or []):
        if not isinstance(li, dict) or li.get("is_cancellation"):
            continue
        if (li.get("stream") or "").strip() in _ATHM_STREAMS:
            total += _gross(li)
    return round(total, 2)


def line_items_gross_total(line_items: Iterable[dict]) -> float:
    """Sum of gross across every non-cancelled line item (care services + AT-HM).
    This is the line-item GOVT PAID column total on a fully-subsidised statement."""
    total = 0.0
    for li in (line_items or []):
        if not isinstance(li, dict) or li.get("is_cancellation"):
            continue
        total += _gross(li)
    return round(total, 2)


def line_government_paid(gross: Any, contribution: Any) -> float:
    """Per-line GOVT PAID identity: GROSS - YOU PAID (decision 6).

    Guarantees YOU PAID + GOVT PAID == GROSS on every row.
    """
    try:
        g = float(gross or 0.0)
    except Exception:
        g = 0.0
    try:
        c = float(contribution or 0.0)
    except Exception:
        c = 0.0
    return round(g - c, 2)


def care_management_pct(care_management_fee: Any, line_items: Iterable[dict]) -> Optional[float]:
    """Care-management fee as a percentage of the services base (AT-HM excluded).

    This is the SAME base the HIGH cap flag uses, so the plain-English prose
    and the flag can never disagree (decision 5). Returns None when the base
    is zero.
    """
    base = care_services_subtotal(line_items)
    try:
        fee = float(care_management_fee or 0.0)
    except Exception:
        fee = 0.0
    if base <= 0:
        return None
    return round((fee / base) * 100, 1)


# Invoice-Checker category exclusions (mirror the decoder stream exclusions):
# the care-services base excludes AT-HM, care management, and prohibited fees.
_NON_SERVICE_CATEGORIES = {
    "care_management", "at_hm", "exit_fee", "admin_fee", "supplement", "cancellation_fee",
}


def care_services_total_inv1(lines: Iterable[Any]) -> float:
    """Care-services base for the Invoice Checker (IC-FINDINGS-1 decision 1).

    Excludes AT-HM, care management, and prohibited fees, sharing the exclusion
    policy with the Statement Decoder base so the cap and reconciliation checks
    agree on what "services" means. Operates on ExtractedLine objects.
    """
    total = 0.0
    for ln in (lines or []):
        cat = getattr(getattr(ln, "service_category", None), "value", None) or ""
        if cat in _NON_SERVICE_CATEGORIES:
            continue
        if getattr(ln, "is_cancellation", False):
            continue
        try:
            total += float(getattr(ln, "gross_cost", 0) or 0)
        except Exception:
            pass
    return round(total, 2)


# ---------------------------------------------------------------------------
# Contribution typical rates, sourced from INDEX-1 (program_reference).
# ---------------------------------------------------------------------------

def effective_contribution_stream(stream: str, description: str, as_of_date: Any) -> str:
    """Honour the 1 Oct 2026 personal-care reclassification (decision 2):
    personal care is Independence before that date and Clinical on/after it,
    which changes whether a contribution applies at all."""
    s = (stream or "").strip()
    desc = (description or "").lower()
    if s == "Independence" and "personal care" in desc:
        if as_of_date and str(as_of_date) >= PERSONAL_CARE_RECLASS_DATE:
            return "Clinical"
    return s


def contribution_expected_band(stream: str, pension_status: str, as_of_date: Any):
    """Expected participant-contribution band (lo, hi) as fractions for a
    stream+cohort, sourced from INDEX-1 with effective dating (decision 2).

    * Exact cohorts contribute at a single point: full Age Pension at the band
      minimum, self-funded at the band maximum.
    * Means-tested band cohorts (part Age Pension / CSHC / unconfirmed) may sit
      anywhere within [lo, hi].
    * Streams with no contribution (Clinical, AT-HM, Care Management) return
      (0.0, 0.0).

    Returns None when INDEX-1 has no applicable row (so no note is emitted;
    there is no hardcoded rate fallback).
    """
    s = (stream or "").strip()
    if s not in ("Independence", "EverydayLiving", "Everyday Living"):
        return (0.0, 0.0)
    try:
        import program_reference as _pr
        key = "contribution.independence_band" if s == "Independence" else "contribution.everyday_band"
        band = _pr.get_value(key, as_of_date, default=None)
    except Exception:
        band = None
    if not isinstance(band, (list, tuple)) or len(band) < 2:
        return None
    try:
        lo, hi = float(band[0]), float(band[1])
    except Exception:
        return None
    ps = (pension_status or "").strip().lower()
    if ps == "full_age_pension":
        return (lo, lo)
    if ps == "self_funded":
        return (hi, hi)
    return (lo, hi)


# ---------------------------------------------------------------------------
# Per-workstream feature flags (default ON, set to 0 to roll back).
# ---------------------------------------------------------------------------

def _flag(name: str, default: str = "1") -> bool:
    return os.environ.get(name, default).strip().lower() in ("1", "true", "yes", "on")


def remediation_a_enabled() -> bool:
    """Single services-base + reconciliation fix."""
    return _flag("DEC1_REMEDIATION_A")


def remediation_b_enabled() -> bool:
    """Contributions demoted to one INFO note, rates from INDEX-1."""
    return _flag("DEC1_REMEDIATION_B")


def remediation_c_enabled() -> bool:
    """Same-direction aggregate + consistent care-management %."""
    return _flag("DEC1_REMEDIATION_C")


def remediation_d_enabled() -> bool:
    """Per-line GOVT PAID identity + footer flag removal."""
    return _flag("DEC1_REMEDIATION_D")
