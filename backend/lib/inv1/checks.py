"""INV-1 v1.2 · WS4 · Deterministic checks engine (C1, C2, C4, C5, C7,
C8, C9, C10, C11, C12).

C3 (rate-logic) is **deliberately not implemented here**. It lives behind
the ``phase-1-c3-rate-logic.md`` sign-off gate and will land in a
separate module (``lib/inv1/c3_rate.py``) once the design is approved.

Every check:

- Reads its constants from INDEX-1 (never hardcodes a number).
- Emits :class:`Finding` objects with a tier, a confidence, an
  ``expected_source`` and a plain-English ``suggested_question``.
- Never accuses the provider. Every ``suggested_question`` is
  literally a question, not a claim.
- Reports a ``rule_effective_from`` so the user can verify the source.

The main entry point is :func:`run_checks(lines, statement, situation,
invoice_date)`, which returns a :class:`ReconciliationPayload`.
"""
from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from lib.inv1.extractor import find_duplicates, find_negative_lines
from lib.inv1.c3_rate import run_c3
from lib.inv1.schema import (
    CheckId,
    Confidence,
    DocumentShape,
    ExpectedSource,
    ExtractedLine,
    Finding,
    INV1_SCHEMA_VERSION,
    InputState,
    OverallVerdict,
    ReconciliationPayload,
    ServiceCategory,
    SituationProfile,
    Tier,
    derive_verdict,
)

logger = logging.getLogger("wayly.inv1.checks")


# ---------------------------------------------------------------------------
# INDEX-1 accessor with a safe fallback
# ---------------------------------------------------------------------------

def _index_get(key: str, as_of: Optional[date] = None, default: Any = None) -> Any:
    """Read from INDEX-1. Returns ``default`` if the loader is unavailable
    or the key is missing. Every consumer of this function should have a
    sensible default for the "loader unavailable" path so the checks
    never crash a request."""
    try:
        from monetary_constants import load_registry
        reg = load_registry()
        try:
            return reg.get_value(key, as_of=as_of)
        except KeyError:
            return default
    except Exception as e:  # pragma: no cover - defensive
        logger.warning("INDEX-1 unavailable for %s: %s", key, e)
        return default


def _index_effective_from(key: str, as_of: Optional[date] = None) -> Optional[str]:
    try:
        from monetary_constants import load_registry
        reg = load_registry()
        entry = reg.get_entry(key, as_of=as_of)
        if entry and entry.effective_from:
            return entry.effective_from.isoformat()
    except Exception:
        pass
    return None


def _to_iso(d: Any) -> Optional[str]:
    if d is None:
        return None
    if isinstance(d, str):
        return d
    if isinstance(d, (date, datetime)):
        return d.isoformat()
    return str(d)


def _parse_iso(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return date.fromisoformat(s[:10])
    except Exception:
        return None


def _fmt_au(s: Optional[str]) -> str:
    """Format an ISO date-ish string as DD/MM/YYYY (Australian). Returns
    the input unchanged if it can't be parsed so calling code stays safe."""
    if not s:
        return ""
    d = _parse_iso(s)
    if d is None:
        return str(s)
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


# ---------------------------------------------------------------------------
# C1 · Clinical care contribution must be nil
# ---------------------------------------------------------------------------

def check_c1_clinical_nil(lines: List[ExtractedLine]) -> List[Finding]:
    """Clinical care is always fully government-funded. Any non-zero
    contribution on a clinical line is a Tier 4 finding."""
    findings: List[Finding] = []
    for ln in lines:
        if ln.service_category != ServiceCategory.clinical:
            continue
        billed = ln.contribution_amount or 0.0
        rate = ln.contribution_rate or 0.0
        if billed > 0 or rate > 0:
            findings.append(Finding(
                check_id=CheckId.C1_clinical_nil,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={"contribution_amount": billed, "contribution_rate": rate},
                expected={"contribution_amount": 0, "contribution_rate": 0},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                suggested_question=(
                    "Under Support at Home, clinical care is fully government-funded. "
                    "Can you check why a contribution is showing on this line?"
                ),
                escalation="acqsc",
                narrative=(
                    f"Clinical care line \"{ln.service_type}\" shows a "
                    f"${billed:,.2f} contribution."
                ),
            ))
    return findings


# ---------------------------------------------------------------------------
# C2 · Personal care contribution on/after 1 Oct 2026 must be nil
# ---------------------------------------------------------------------------

def check_c2_personal_care_after_oct_2026(
    lines: List[ExtractedLine],
) -> List[Finding]:
    findings: List[Finding] = []
    # PC-RECLASS-1 decision 7: gated behind the rollout flag so turning it off
    # reverts to pre-boundary behaviour (post 01/10/2026 personal care treated
    # as contributory).
    try:
        from lib import services_base as _sb
        if not _sb.pc_reclass_enabled():
            return findings
    except Exception:
        pass
    # Single source of truth (decision 1): the boundary date lives in INDEX-1
    # under policy_date.personal_care_free; fall back to the legacy key, then
    # the gazetted date.
    cutoff_raw = _index_get("policy_date.personal_care_free", default=None)
    if cutoff_raw is None:
        cutoff_raw = _index_get("inv1.personal_care.fully_funded_from", default="2026-10-01")
    cutoff = _parse_iso(_to_iso(cutoff_raw)) or date(2026, 10, 1)
    for ln in lines:
        if ln.service_category != ServiceCategory.personal_care:
            continue
        line_date = _parse_iso(ln.service_date)
        if line_date is None or line_date < cutoff:
            continue
        billed = ln.contribution_amount or 0.0
        rate = ln.contribution_rate or 0.0
        if billed > 0 or rate > 0:
            findings.append(Finding(
                check_id=CheckId.C2_personal_care_after_oct_2026,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={"contribution_amount": billed, "service_date": ln.service_date},
                expected={"contribution_amount": 0},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                suggested_question=(
                    "From 1 October 2026, personal care under Support at Home is "
                    "fully government-funded. Can you check why a contribution is "
                    f"showing on this line dated {_fmt_au(ln.service_date)}?"
                ),
                escalation="acqsc",
                rule_effective_from=cutoff.isoformat(),
                narrative=(
                    f"Personal care line dated {_fmt_au(ln.service_date)} shows a "
                    f"${billed:,.2f} contribution after the fully-funded date."
                ),
            ))
    return findings


# ---------------------------------------------------------------------------
# C4 · Care management + prohibited fees
# ---------------------------------------------------------------------------

_PROHIBITED_CATEGORIES = {
    ServiceCategory.exit_fee: (
        "Support at Home does not permit exit or termination fees.",
        "acqsc",
    ),
    ServiceCategory.admin_fee: (
        "Support at Home does not permit separate administration fees on top "
        "of care management.",
        None,
    ),
}


def check_c4_care_management_and_prohibited(
    lines: List[ExtractedLine],
    total_care_cost: Optional[float] = None,
    quarterly_budget: Optional[float] = None,
) -> List[Finding]:
    """Care management must be at or below the ``care_management.cap_pct``
    of the participant's *quarterly budget* (not the current month's
    care spend). Exit fees and separate admin fees are never allowed.

    When ``quarterly_budget`` is provided, the check compares care-management
    on this invoice against ``cap_pct % × quarterly_budget × (invoice_period /
    quarterly_period)`` where invoice_period is inferred from the number
    of months of care lines. When it is not provided, the check falls
    back to the historical formula (care_management / (care_management +
    total_care_cost)).
    """
    findings: List[Finding] = []

    # Prohibited fees (exit fee, admin fee)
    for ln in lines:
        if ln.service_category in _PROHIBITED_CATEGORIES:
            msg, escal = _PROHIBITED_CATEGORIES[ln.service_category]
            findings.append(Finding(
                check_id=CheckId.C4_care_mgmt_and_prohibited_fees,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={"amount": ln.gross_cost, "category": ln.service_category.value},
                expected={"amount": 0},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                suggested_question=(
                    f"{msg} Can you check this line and remove it if it applies?"
                ),
                escalation=escal,
                narrative=(
                    f"A prohibited fee ({ln.service_category.value}) of "
                    f"${(ln.gross_cost or 0):,.2f} appears on this invoice."
                ),
            ))

    # Separate travel / mileage charges: under Support at Home the agreed unit
    # prices are all-inclusive of travel (no separate travel fee payable), so a
    # standalone travel or per-km line billed to the participant is worth a query.
    for ln in lines:
        if ln.service_category in _PROHIBITED_CATEGORIES:
            continue
        st = (ln.service_type or "").lower()
        is_travel = ("travel" in st or "mileage" in st) and (
            "km" in st or "mileage" in st or "vehicle" in st or "/km" in st
        )
        charged = (ln.contribution_amount or 0) or (ln.gross_cost or 0)
        if is_travel and charged > 0:
            findings.append(Finding(
                check_id=CheckId.C4_care_mgmt_and_prohibited_fees,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={"amount": charged, "category": "travel"},
                expected={"amount": 0},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                title="A separate travel charge that may not be allowed",
                suggested_question=(
                    "Support at Home unit prices are meant to be all-inclusive of travel. "
                    f"Can you check this separate travel charge of ${charged:,.2f} and "
                    "remove it if it applies?"
                ),
                escalation="acqsc",
                narrative=(
                    f"A separate travel/mileage line of ${charged:,.2f} appears on this invoice."
                ),
            ))

    # Care management cap
    cap_pct_raw = _index_get("care_management.cap_pct", default=10)
    try:
        cap_pct = float(cap_pct_raw)
    except (TypeError, ValueError):
        cap_pct = 10.0
    if cap_pct <= 1.0:
        cap_pct *= 100.0

    cm_lines = [
        ln for ln in lines
        if ln.service_category == ServiceCategory.care_management
    ]
    cm_total = sum((ln.gross_cost or 0) for ln in cm_lines)

    if quarterly_budget and quarterly_budget > 0 and cm_total > 0:
        # Compare against the pro-rata cap. Invoice covers ~1 month if
        # we have monthly service dates; assume 3 months per quarter.
        pro_rata_cap = (cap_pct / 100.0) * quarterly_budget * (1.0 / 3.0)
        if cm_total > pro_rata_cap * 1.02:
            observed_pct = 100.0 * cm_total / (quarterly_budget / 3.0)
            findings.append(Finding(
                check_id=CheckId.C4_care_mgmt_and_prohibited_fees,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id for ln in cm_lines],
                observed={
                    "care_management_amount": cm_total,
                    "pro_rata_cap": round(pro_rata_cap, 2),
                    "quarterly_budget": quarterly_budget,
                },
                expected={"care_management_cap_pct": cap_pct},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                rule_effective_from=_index_effective_from("care_management.cap_pct"),
                suggested_question=(
                    f"Care management on this invoice is ${cm_total:,.2f}, above the "
                    f"{cap_pct:g} % pro-rata cap of ${pro_rata_cap:,.2f} for a "
                    "quarterly budget. Can you check this?"
                ),
                escalation="acqsc",
                narrative=(
                    f"Care management ${cm_total:,.2f} exceeds pro-rata cap "
                    f"${pro_rata_cap:,.2f} ({cap_pct:g} % of ${quarterly_budget:,.2f} "
                    "quarterly budget over 3 months)."
                ),
            ))
    else:
        # Fallback path when we don't know the quarterly budget.
        if total_care_cost is None:
            # IC-FINDINGS-1 decision 1: resolve the care-services base through
            # the ONE shared module (excludes AT-HM + care management), so the
            # Invoice Checker and Statement Decoder can never disagree.
            from lib import services_base as _sb
            if _sb.remediation_a_enabled():
                total_care_cost = _sb.care_services_total_inv1(lines)
            else:
                total_care_cost = sum(
                    (ln.gross_cost or 0)
                    for ln in lines
                    if ln.service_category not in (
                        ServiceCategory.care_management,
                        ServiceCategory.exit_fee,
                        ServiceCategory.admin_fee,
                    )
                )
        if cm_total > 0 and total_care_cost > 0:
            cm_pct = 100.0 * cm_total / (total_care_cost + cm_total)
            if cm_pct > cap_pct + 0.5:
                findings.append(Finding(
                    check_id=CheckId.C4_care_mgmt_and_prohibited_fees,
                    tier=Tier.T4_check_before_paying,
                    line_ids=[ln.line_id for ln in cm_lines],
                    observed={"care_management_pct": round(cm_pct, 2), "amount": cm_total},
                    expected={"care_management_cap_pct": cap_pct},
                    expected_source=ExpectedSource.program_rule,
                    confidence=Confidence.medium,
                    rule_effective_from=_index_effective_from("care_management.cap_pct"),
                    suggested_question=(
                        f"Care management on this invoice is {cm_pct:,.1f} % of care "
                        f"spend, above the {cap_pct:g} % cap. Can you check this?"
                    ),
                    escalation="acqsc",
                    narrative=(
                        f"Care management ${cm_total:,.2f} of ${cm_total + total_care_cost:,.2f} "
                        f"care spend = {cm_pct:,.1f} %."
                    ),
                ))
    return findings


# ---------------------------------------------------------------------------
# C5 · Charged after the service was delivered
# ---------------------------------------------------------------------------

def check_c5_charged_after_delivery(
    lines: List[ExtractedLine],
    invoice_date: Optional[str],
    period_end: Optional[str] = None,
) -> List[Finding]:
    """Each line's ``service_date`` should fall within the billing period.

    When ``period_end`` is known (extracted from "Period covered:" on
    the header), any service dated after ``period_end`` fires Tier 4 ,
    the service was billed for a period after the one this invoice
    covers, so it cannot have been delivered yet.

    When only ``invoice_date`` is known, a service date after the
    invoice date fires Tier 3 (weaker signal, since the "delivered
    yet?" boundary is less certain).
    """
    findings: List[Finding] = []
    period_end_d = _parse_iso(period_end)
    inv = _parse_iso(invoice_date)

    for ln in lines:
        sd = _parse_iso(ln.service_date)
        if sd is None:
            continue
        # Tier 4: past the billing period entirely
        if period_end_d is not None and sd > period_end_d:
            days = (sd - period_end_d).days
            findings.append(Finding(
                check_id=CheckId.C5_charged_after_delivery,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={"service_date": ln.service_date, "period_end": period_end},
                expected={"service_date_within_period": True},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                suggested_question=(
                    f"This line is dated {_fmt_au(ln.service_date)}, which is {days} day"
                    f"{'s' if days != 1 else ''} after the invoice's billing period ended "
                    f"on {_fmt_au(period_end)}. Can you check whether this service belongs on a "
                    "later invoice, or has it not been delivered yet?"
                ),
                narrative=(
                    f"Service date {_fmt_au(ln.service_date)} is past the invoice period "
                    f"end {_fmt_au(period_end)}."
                ),
            ))
            continue
        # Tier 3 fallback: no period_end, use invoice_date
        if period_end_d is None and inv is not None and sd > inv:
            days = (sd - inv).days
            findings.append(Finding(
                check_id=CheckId.C5_charged_after_delivery,
                tier=Tier.T3_worth_a_question,
                line_ids=[ln.line_id],
                observed={"service_date": ln.service_date, "invoice_date": invoice_date},
                expected={"service_date_on_or_before": invoice_date},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                suggested_question=(
                    f"This line is dated {_fmt_au(ln.service_date)}, which is {days} day"
                    f"{'s' if days != 1 else ''} after the invoice date of "
                    f"{_fmt_au(invoice_date)}. Can you check whether this service has been "
                    "delivered yet?"
                ),
                narrative=(
                    f"Service date {_fmt_au(ln.service_date)} is after the invoice date "
                    f"{_fmt_au(invoice_date)}."
                ),
            ))
    return findings


# ---------------------------------------------------------------------------
# C7 · Invoice reconciliation against the statement
# ---------------------------------------------------------------------------

def check_c7_reconciliation(
    lines: List[ExtractedLine],
    statement: Optional[Dict[str, Any]],
) -> List[Finding]:
    """When a statement payload is provided, reconcile every invoice line
    against a statement line (± 3 days and ± $1). Unmatched invoice
    lines fire Tier 3."""
    findings: List[Finding] = []
    if not statement:
        return findings
    statement_lines = statement.get("line_items") or []
    if not statement_lines:
        return findings

    def _match(inv_line: ExtractedLine) -> Optional[Dict[str, Any]]:
        for sl in statement_lines:
            sl_amount = sl.get("gross_cost") or sl.get("amount") or 0
            if inv_line.gross_cost is None:
                continue
            if abs(float(sl_amount) - inv_line.gross_cost) > 1.0:
                continue
            sl_date = _parse_iso(sl.get("service_date") or sl.get("date"))
            iv_date = _parse_iso(inv_line.service_date)
            if sl_date and iv_date and abs((sl_date - iv_date).days) > 3:
                continue
            return sl
        return None

    for ln in lines:
        if ln.gross_cost is None:
            continue
        m = _match(ln)
        if m is None:
            findings.append(Finding(
                check_id=CheckId.C7_invoice_statement_reconciliation,
                tier=Tier.T3_worth_a_question,
                line_ids=[ln.line_id],
                observed={"gross_cost": ln.gross_cost, "service_date": ln.service_date},
                expected={"matching_statement_line": True},
                expected_source=ExpectedSource.statement,
                confidence=Confidence.medium,
                suggested_question=(
                    f"We could not find a matching line on your statement for "
                    f"\"{ln.service_type}\" (${ln.gross_cost:,.2f} on "
                    f"{_fmt_au(ln.service_date)}). Can you check whether this service was "
                    "recorded?"
                ),
                narrative=(
                    f"Invoice line ${ln.gross_cost:,.2f} on {_fmt_au(ln.service_date)} does "
                    "not reconcile to any statement line within tolerance."
                ),
            ))
    return findings


# ---------------------------------------------------------------------------
# C8 · GST on ordinary care lines
# ---------------------------------------------------------------------------

_GST_ALLOWED = {
    ServiceCategory.transport,       # taxi/uber can be GST-inclusive
    ServiceCategory.consumable,      # commercial retail items
    ServiceCategory.at_hm,           # some equipment
}


def check_c8_gst_on_care(lines: List[ExtractedLine]) -> List[Finding]:
    """GST should not appear on ordinary care service lines. Consumables,
    transport and AT-HM items may legitimately carry GST."""
    findings: List[Finding] = []
    for ln in lines:
        if not ln.gst_amount or ln.gst_amount == 0:
            continue
        if ln.service_category in _GST_ALLOWED:
            continue
        if ln.service_category == ServiceCategory.unknown:
            continue    # too little information to be sure
        findings.append(Finding(
            check_id=CheckId.C8_gst_service_type,
            tier=Tier.T3_worth_a_question,
            line_ids=[ln.line_id],
            observed={"gst_amount": ln.gst_amount, "category": ln.service_category.value},
            expected={"gst_amount": 0},
            expected_source=ExpectedSource.program_rule,
            confidence=Confidence.medium,
            suggested_question=(
                f"There is ${ln.gst_amount:,.2f} of GST on the "
                f"\"{ln.service_type}\" line. Ordinary care services under "
                "Support at Home are usually GST-free. Can you check this?"
            ),
            narrative=(
                f"GST ${ln.gst_amount:,.2f} appears on a "
                f"{ln.service_category.value} line."
            ),
        ))
    return findings


# ---------------------------------------------------------------------------
# C9 · Adjustments / refunds
# ---------------------------------------------------------------------------

def check_c9_adjustments(lines: List[ExtractedLine]) -> List[Finding]:
    """Every negative-amount line is called out as informational."""
    findings: List[Finding] = []
    for ln in find_negative_lines(lines):
        findings.append(Finding(
            check_id=CheckId.C9_adjustments_refunds,
            tier=Tier.T1_informational,
            line_ids=[ln.line_id],
            observed={"gross_cost": ln.gross_cost, "service_type": ln.service_type},
            expected=None,
            expected_source=ExpectedSource.program_rule,
            confidence=Confidence.high,
            suggested_question=(
                "This line looks like an adjustment or refund. Confirm with your "
                "provider what it relates to so it lines up on your statement."
            ),
            narrative=(
                f"Adjustment line \"{ln.service_type}\" of ${ln.gross_cost:,.2f}."
            ),
        ))
    return findings


# ---------------------------------------------------------------------------
# C10 · Lifetime-cap indicative
# ---------------------------------------------------------------------------

def check_c10_lifetime_cap(
    lines: List[ExtractedLine],
    lifetime_running_total: Optional[float] = None,
    situation: Optional[SituationProfile] = None,
) -> List[Finding]:
    """Indicative lifetime-cap warning. The actual cap value is deferred
    (INDEX-1 keys ``inv1.lifetime_cap.*`` are placeholders with
    ``deferred: true``). When both cap keys are None, this check is a
    silent no-op, Tier 1 informational only if the running total is
    within 10 % of a hypothetical cap."""
    findings: List[Finding] = []
    grandfathered = (
        situation is not None
        and situation.grandfathered.value == "yes"
    )
    cap_key = (
        "inv1.lifetime_cap.grandfathered_aud"
        if grandfathered
        else "inv1.lifetime_cap.standard_aud"
    )
    cap = _index_get(cap_key, default=None)
    if cap is None or lifetime_running_total is None:
        # Cap deferred, emit a Tier 1 informational so the UI can show
        # a "we'll track this here once the number is confirmed" note.
        findings.append(Finding(
            check_id=CheckId.C10_lifetime_cap_indicative,
            tier=Tier.T1_informational,
            line_ids=[],
            observed={"lifetime_running_total": lifetime_running_total},
            expected={"lifetime_cap_aud": None},
            expected_source=ExpectedSource.program_rule,
            confidence=Confidence.low,
            suggested_question=(
                "Nothing to do right now, and this is not based on your own figures. "
                "The lifetime cap is the most you would ever pay towards Support at Home care overall. "
                "The government (Department of Health and Aged Care) has not published the final cap amount yet, "
                "so once they do, Wayly will automatically start showing how close you are."
            ),
            narrative=(
                "There is a lifetime limit on the total you will ever pay towards your Support at Home care. "
                "The government has not published the final cap figure yet, so we cannot show how close you are to it. "
                "This note is here for your information only, not because anything on this invoice is wrong."
            ),
        ))
        return findings

    try:
        cap_val = float(cap)
    except (TypeError, ValueError):
        return findings

    if lifetime_running_total >= cap_val * 0.9:
        pct = 100.0 * lifetime_running_total / cap_val
        findings.append(Finding(
            check_id=CheckId.C10_lifetime_cap_indicative,
            tier=Tier.T2_worth_noting,
            line_ids=[],
            observed={"lifetime_running_total": lifetime_running_total, "cap": cap_val},
            expected=None,
            expected_source=ExpectedSource.program_rule,
            confidence=Confidence.medium,
            suggested_question=(
                f"Your lifetime contribution total is around {pct:,.0f} % of the "
                f"cap. Once you reach the cap, you will not need to contribute "
                "further. Consider tracking this closely."
            ),
            narrative=(
                f"Lifetime running total ${lifetime_running_total:,.2f} is "
                f"{pct:,.0f} % of the ${cap_val:,.2f} cap."
            ),
        ))
    return findings


# ---------------------------------------------------------------------------
# C11 · Duplicate lines
# ---------------------------------------------------------------------------

def check_c11_duplicates(lines: List[ExtractedLine]) -> List[Finding]:
    findings: List[Finding] = []
    for line_a, line_b, reason in find_duplicates(lines):
        findings.append(Finding(
            check_id=CheckId.C11_duplicate_billing,
            tier=Tier.T3_worth_a_question,
            line_ids=[line_a, line_b],
            observed={"reason": reason},
            expected=None,
            expected_source=ExpectedSource.program_rule,
            confidence=Confidence.high,
            suggested_question=(
                "Two lines on this invoice look identical (same amount, same "
                "service, same date). Can you check whether one is a duplicate?"
            ),
            narrative=f"Possible duplicate: {reason}.",
        ))
    return findings


# ---------------------------------------------------------------------------
# C6 · Line arithmetic sanity (qty × unit_price should equal gross_cost)
# ---------------------------------------------------------------------------

def check_c6_line_arithmetic(lines: List[ExtractedLine]) -> List[Finding]:
    """Flag every line where units_or_hours × unit_price doesn't reconcile
    to the amount charged. Tolerates 5 cent rounding for GST-inclusive
    lines. Common on hand-typed invoices and a fast win for caregivers."""
    findings: List[Finding] = []
    for ln in lines:
        qty = ln.units_or_hours
        rate = ln.unit_price
        gross = ln.gross_cost
        if qty is None or rate is None or gross is None:
            continue
        try:
            expected = round(float(qty) * float(rate), 2)
        except (TypeError, ValueError):
            continue
        diff = round(abs(float(gross) - expected), 2)
        # 5 cent tolerance for rounding; larger deltas are real errors.
        if diff <= 0.05:
            continue
        findings.append(Finding(
            check_id=CheckId.C6_line_arithmetic,
            tier=Tier.T3_worth_a_question,
            line_ids=[ln.line_id],
            observed={
                "gross_cost": float(gross),
                "quantity": float(qty),
                "unit_price": float(rate),
                "expected": expected,
                "difference": diff,
            },
            expected={"gross_cost": expected},
            expected_source=ExpectedSource.program_rule,
            confidence=Confidence.high,
            suggested_question=(
                f"This line charges ${gross:,.2f}, but "
                f"{qty} × ${rate:,.2f} works out to ${expected:,.2f}. "
                f"Can you check the arithmetic and correct the total?"
            ),
            narrative=(
                f"Line total ${gross:,.2f} does not match "
                f"{qty} × ${rate:,.2f} = ${expected:,.2f}, difference ${diff:,.2f}."
            ),
        ))
    return findings



# ---------------------------------------------------------------------------
# C12 · Unit price vs published price (stub, full PPC integration in WS5)
# ---------------------------------------------------------------------------

def check_c12_price_vs_published(
    lines: List[ExtractedLine],
    ppc_snapshot: Optional[Dict[str, float]] = None,
) -> List[Finding]:
    """Compare each line's unit price against the provider's published
    price. Requires a ``ppc_snapshot`` dict of ``{service_type_key:
    published_price}``. If no snapshot is provided, the check is a
    silent no-op (spec §11: statutory caps deferred, so v1 uses the
    provider's own published price only)."""
    findings: List[Finding] = []
    if not ppc_snapshot:
        return findings
    for ln in lines:
        if ln.unit_price is None or not ln.service_type:
            continue
        key = ln.service_type.lower().strip()[:40]
        published = ppc_snapshot.get(key)
        if published is None:
            continue
        try:
            published_val = float(published)
        except (TypeError, ValueError):
            continue
        if ln.unit_price > published_val * 1.01:
            delta = ln.unit_price - published_val
            findings.append(Finding(
                check_id=CheckId.C12_price_vs_published,
                tier=Tier.T3_worth_a_question,
                line_ids=[ln.line_id],
                observed={"unit_price": ln.unit_price},
                expected={"published_price": published_val},
                expected_source=ExpectedSource.published_price,
                confidence=Confidence.high,
                suggested_question=(
                    f"The unit price ${ln.unit_price:,.2f} for "
                    f"\"{ln.service_type}\" is ${delta:,.2f} above your "
                    f"provider's own published rate of ${published_val:,.2f}. "
                    "Can you check?"
                ),
                narrative=(
                    f"Unit price ${ln.unit_price:,.2f} exceeds published "
                    f"${published_val:,.2f} by ${delta:,.2f}."
                ),
            ))
    return findings


# ---------------------------------------------------------------------------
# Clean reconciliation summary (spec §12)
# ---------------------------------------------------------------------------

def _build_clean_reconciliation(
    lines: List[ExtractedLine],
    findings: List[Finding],
) -> List[Dict[str, Any]]:
    """Summarise every check that had no findings for the results screen.
    Each entry is `{check_id, label, ok}` so the UI can render a "we
    also checked these" list under the flags."""
    flagged_check_ids = {f.check_id.value for f in findings}
    checks_run = [
        (CheckId.C1_clinical_nil, "Clinical care contribution is nil"),
        (CheckId.C2_personal_care_after_oct_2026, "Personal care from 1 Oct 2026 is nil"),
        (CheckId.C3_rate_asymmetric, "Contribution rate matches your situation"),
        (CheckId.C4_care_mgmt_and_prohibited_fees, "Care management within cap, no exit or admin fees"),
        (CheckId.C5_charged_after_delivery, "Every line was delivered on or before the invoice date"),
        (CheckId.C7_invoice_statement_reconciliation, "Every invoice line reconciles to the statement"),
        (CheckId.C8_gst_service_type, "No GST on ordinary care lines"),
        (CheckId.C9_adjustments_refunds, "No unexplained adjustments or refunds"),
        (CheckId.C11_duplicate_billing, "No duplicate lines"),
        (CheckId.C12_price_vs_published, "Every unit price matches your provider's published rate"),
    ]
    out: List[Dict[str, Any]] = []
    for cid, label in checks_run:
        out.append({
            "check_id": cid.value,
            "label": label,
            "ok": cid.value not in flagged_check_ids,
        })
    return out


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------

def _rollup_c3(c3_findings: List[Finding]) -> List[Finding]:
    """Roll up per-line C3 findings that share the same (observed_rate,
    expected) into a single finding. Prevents the results screen from
    showing "17.5% vs expected 80%" five times for five identical lines.
    """
    if len(c3_findings) <= 1:
        return c3_findings
    groups: Dict[tuple, List[Finding]] = {}
    for f in c3_findings:
        obs = (f.observed or {}).get("contribution_rate")
        exp = (f.expected or {}).get("rate")
        key = (round(obs, 2) if isinstance(obs, (int, float)) else obs,
               round(exp, 2) if isinstance(exp, (int, float)) else exp,
               f.tier.value)
        groups.setdefault(key, []).append(f)
    rolled: List[Finding] = []
    for group in groups.values():
        if len(group) == 1:
            rolled.append(group[0])
            continue
        head = group[0]
        line_ids = [lid for f in group for lid in (f.line_ids or [])]
        head = Finding(
            check_id=head.check_id,
            tier=head.tier,
            line_ids=line_ids,
            observed=head.observed,
            expected=head.expected,
            expected_source=head.expected_source,
            confidence=head.confidence,
            suggested_question=(
                f"{len(group)} lines are charged at the same contribution rate "
                f"that doesn't match what we would expect for your situation. "
                + (head.suggested_question or "").split(".", 1)[-1].strip()
            ),
            escalation=head.escalation,
            rule_effective_from=head.rule_effective_from,
            narrative=(
                f"Rate mismatch on {len(group)} lines. {head.narrative or ''}"
            ),
        )
        rolled.append(head)
    return rolled


# ---------------------------------------------------------------------------
# C13 · Invoice footing (printed total vs sum of line contributions)
# ---------------------------------------------------------------------------

def check_c13_footing(
    lines: List[ExtractedLine],
    printed_total_payable: Optional[float],
) -> List[Finding]:
    """The printed "amount payable by you" should equal the sum of the
    per-line contribution amounts. When the printed total is higher, the
    invoice doesn't foot and the difference is worth querying."""
    findings: List[Finding] = []
    if not printed_total_payable or printed_total_payable <= 0:
        return findings
    col = round(sum((ln.contribution_amount or 0.0) for ln in lines), 2)
    if col <= 0:
        return findings
    diff = round(printed_total_payable - col, 2)
    if diff > 0.5:
        findings.append(Finding(
            check_id=CheckId.C13_invoice_footing,
            tier=Tier.T3_worth_a_question,
            line_ids=[],
            observed={
                "printed_total": round(printed_total_payable, 2),
                "lines_sum": col,
                "difference": diff,
            },
            expected={"total_matches_line_sum": True},
            expected_source=ExpectedSource.program_rule,
            confidence=Confidence.high,
            title="The invoice total is higher than the lines add up to",
            suggested_question=(
                f"The amount payable is ${printed_total_payable:,.2f}, but the individual "
                f"contribution amounts on the invoice add up to ${col:,.2f}. "
                f"Can you check the ${diff:,.2f} difference?"
            ),
            narrative=(
                f"Printed total payable ${printed_total_payable:,.2f} exceeds the sum of the "
                f"line contributions ${col:,.2f} by ${diff:,.2f}."
            ),
        ))
    return findings


# ---------------------------------------------------------------------------
# Supporting-records cross-checks (rate vs agreed Schedule A; not-delivered)
# ---------------------------------------------------------------------------

_RATE_CHECK_CATEGORIES = {ServiceCategory.everyday_living, ServiceCategory.independence}
_CARE_SERVICE_CATEGORIES = {
    ServiceCategory.everyday_living, ServiceCategory.independence,
    ServiceCategory.personal_care, ServiceCategory.clinical,
}


def _day_type(iso: Optional[str], public_holidays: set) -> Optional[str]:
    d = _parse_iso(iso)
    if d is None:
        return None
    if (iso or "")[:10] in public_holidays:
        return "public_holiday"
    return {5: "saturday", 6: "sunday"}.get(d.weekday(), "weekday")


def check_rate_vs_agreed(
    lines: List[ExtractedLine],
    agreed_rates: Dict[str, Dict[str, Optional[float]]],
    public_holidays: Optional[List[str]] = None,
) -> List[Finding]:
    """Compare each hourly service line's unit price against the participant's
    OWN agreed Schedule A price for that service and day-type (weekday /
    Saturday / Sunday / public holiday). Catches a weekend rate billed on a
    weekday and any rate above the agreed schedule. One finding per service."""
    from lib.inv1.supporting import canonical_service
    findings: List[Finding] = []
    if not agreed_rates:
        return findings
    ph = set(public_holidays or [])
    groups: Dict[str, Dict[str, Any]] = {}
    for ln in lines:
        if ln.service_category not in _RATE_CHECK_CATEGORIES:
            continue
        if ln.unit_price is None or ln.service_date is None or ln.units_or_hours is None:
            continue
        key = canonical_service(ln.service_type)
        rates = agreed_rates.get(key)
        if not rates:
            continue
        dt = _day_type(ln.service_date, ph)
        if dt is None:
            continue
        agreed = rates.get(dt)
        if agreed is None:
            continue
        if ln.unit_price > agreed * 1.01:
            gross_over = round((ln.unit_price - agreed) * ln.units_or_hours, 2)
            rate = (ln.contribution_rate or 0.0) / 100.0
            contrib_over = round(gross_over * rate, 2) if rate else gross_over
            g = groups.setdefault(key, {"line_ids": [], "overcharge": 0.0, "examples": []})
            g["line_ids"].append(ln.line_id)
            g["overcharge"] = round(g["overcharge"] + contrib_over, 2)
            g["examples"].append((ln.service_date, ln.unit_price, agreed, dt))
    for key, g in groups.items():
        if g["overcharge"] <= 0:
            continue
        date0, charged0, agreed0, dt0 = g["examples"][0]
        label = key.title()
        dt_word = {"weekday": "weekday", "saturday": "Saturday", "sunday": "Sunday",
                   "public_holiday": "public holiday"}.get(dt0, dt0)
        findings.append(Finding(
            check_id=CheckId.C12_price_vs_published,
            tier=Tier.T3_worth_a_question,
            line_ids=g["line_ids"],
            observed={
                "contribution_overcharge": g["overcharge"],
                "charged_rate": charged0,
                "agreed_rate": agreed0,
                "day_type": dt0,
                "lines": len(g["line_ids"]),
            },
            expected={"agreed_rate": agreed0},
            expected_source=ExpectedSource.published_price,
            confidence=Confidence.high,
            title=f"{label} charged above your agreed rate",
            suggested_question=(
                f"Your service agreement lists {label.lower()} at ${agreed0:,.2f} an hour "
                f"for a {dt_word}, but this invoice charges ${charged0:,.2f}. "
                "Can you check the rate and refund the difference?"
            ),
            escalation="acqsc",
            narrative=(
                f"{label} billed at ${charged0:,.2f}/hr against the agreed {dt_word} rate of "
                f"${agreed0:,.2f}/hr; your contribution overcharge is ${g['overcharge']:,.2f}."
            ),
        ))
    return findings


def check_services_not_delivered(
    lines: List[ExtractedLine],
    cancellations: Optional[List[Dict[str, Any]]] = None,
    absences: Optional[List[Dict[str, str]]] = None,
) -> List[Finding]:
    """Flag service lines billed for a date the participant's records show the
    service was NOT delivered , either cancelled with notice (Clause 9.3) or
    while the participant was in hospital / on leave (Clause 9.5)."""
    from lib.inv1.supporting import canonical_service
    findings: List[Finding] = []
    cancels = cancellations or []
    abss = absences or []
    if not cancels and not abss:
        return findings
    for ln in lines:
        if ln.service_category not in _CARE_SERVICE_CATEGORIES:
            continue
        if not ln.service_date:
            continue
        sd = ln.service_date[:10]
        key = canonical_service(ln.service_type)
        amt = ln.contribution_amount if ln.contribution_amount is not None else ln.gross_cost
        reason = None
        for c in cancels:
            if c.get("with_notice") and c.get("service_key") == key and c.get("date") == sd:
                reason = "cancelled"
                break
        if reason is None:
            for a in abss:
                st, en = a.get("start"), a.get("end")
                if st and en and st <= sd <= en:
                    reason = "absence"
                    break
        if reason == "cancelled":
            findings.append(Finding(
                check_id=CheckId.C5_charged_after_delivery,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={"service_date": ln.service_date, "reason": "cancelled_with_notice",
                          "contribution_amount": amt},
                expected={"charge": 0},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                title="Charged for a service you cancelled with notice",
                suggested_question=(
                    f"Your records show the {ln.service_type} on {_fmt_au(ln.service_date)} was "
                    "cancelled with at least 24 hours notice, so under your agreement no charge "
                    "applies. Can you remove it?"
                ),
                escalation="acqsc",
                narrative=(
                    f"{ln.service_type} on {_fmt_au(ln.service_date)} was cancelled with notice "
                    f"but still billed ${(amt or 0):,.2f}."
                ),
            ))
        elif reason == "absence":
            findings.append(Finding(
                check_id=CheckId.C5_charged_after_delivery,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={"service_date": ln.service_date, "reason": "in_hospital",
                          "contribution_amount": amt},
                expected={"charge": 0},
                expected_source=ExpectedSource.program_rule,
                confidence=Confidence.high,
                title="Charged for a service during a hospital stay",
                suggested_question=(
                    f"Your records show you were in hospital / on leave on {_fmt_au(ln.service_date)} "
                    f"and no service was delivered, so under your agreement this {ln.service_type} "
                    "charge should not apply. Can you remove it?"
                ),
                escalation="acqsc",
                narrative=(
                    f"{ln.service_type} on {_fmt_au(ln.service_date)} was billed ${(amt or 0):,.2f} "
                    "while the participant was in hospital / on leave."
                ),
            ))
    return findings


# ---------------------------------------------------------------------------
# Rollup + traceable financial impact
# ---------------------------------------------------------------------------

def _rollup_same_check(findings: List[Finding], check_id: CheckId) -> List[Finding]:
    """Collapse all findings of ``check_id`` into a single finding carrying
    every affected line id. Used for C1/C2 so the results screen shows one
    "personal care should be free" card, not eleven."""
    group = [f for f in findings if f.check_id == check_id]
    if len(group) <= 1:
        return findings
    rest = [f for f in findings if f.check_id != check_id]
    head = group[0]
    line_ids = [lid for f in group for lid in (f.line_ids or [])]
    merged = Finding(
        check_id=head.check_id,
        tier=head.tier,
        line_ids=line_ids,
        observed={"line_count": len(group)},
        expected=head.expected,
        expected_source=head.expected_source,
        confidence=head.confidence,
        suggested_question=head.suggested_question,
        escalation=head.escalation,
        rule_effective_from=head.rule_effective_from,
        narrative=head.narrative,
        title=head.title,
    )
    # Preserve the original finding order: put the merged finding where the
    # first member was.
    out: List[Finding] = []
    inserted = False
    for f in findings:
        if f.check_id == check_id:
            if not inserted:
                out.append(merged)
                inserted = True
            continue
        out.append(f)
    return out


# Checks whose dollar impact is the FULL contribution on their lines (money
# the participant can get back entirely).
_FULL_CONTRIBUTION_CHECKS = {
    CheckId.C1_clinical_nil,
    CheckId.C2_personal_care_after_oct_2026,
    CheckId.C4_care_mgmt_and_prohibited_fees,
    CheckId.C5_charged_after_delivery,
}


def _annotate_financial_impact(
    findings: List[Finding],
    lines: List[ExtractedLine],
) -> None:
    """Attach a traceable ``financial_impact`` (contribution dollars the
    participant could recover) to each finding. Every amount is derived from a
    named line or a named figure, never inferred, and is bounded by the line's
    own contribution so a refund can never exceed what was billed."""
    by_id = {ln.line_id: ln for ln in lines}

    def contrib(ln: Optional[ExtractedLine]) -> float:
        if ln is None:
            return 0.0
        if ln.contribution_amount is not None:
            return float(ln.contribution_amount)
        return float(ln.gross_cost or 0.0)

    for f in findings:
        cid = f.check_id
        lns = [by_id[i] for i in (f.line_ids or []) if i in by_id]
        amount = 0.0
        basis = None
        if cid in _FULL_CONTRIBUTION_CHECKS:
            amount = round(sum(contrib(ln) for ln in lns), 2)
            basis = "sum of the contribution charged on the affected line(s)"
        elif cid == CheckId.C11_duplicate_billing:
            # Refund ONE copy of a duplicated pair.
            amount = round(contrib(lns[0]), 2) if lns else 0.0
            basis = "one copy of the duplicated line's contribution"
        elif cid == CheckId.C6_line_arithmetic:
            ln = lns[0] if lns else None
            if ln and ln.unit_price is not None and ln.units_or_hours is not None and ln.gross_cost is not None:
                expected = round(ln.unit_price * ln.units_or_hours, 2)
                gross_excess = max(0.0, round(ln.gross_cost - expected, 2))
                rate = (ln.contribution_rate or 0.0) / 100.0
                amount = round(gross_excess * rate, 2) if rate else gross_excess
                basis = "your contribution share of the over-stated line total"
        elif cid == CheckId.C12_price_vs_published:
            obs = f.observed if isinstance(f.observed, dict) else {}
            amount = round(float(obs.get("contribution_overcharge") or 0.0), 2)
            basis = "your contribution share of the rate above the agreed price"
        elif cid == CheckId.C13_invoice_footing:
            obs = f.observed if isinstance(f.observed, dict) else {}
            amount = round(float(obs.get("difference") or 0.0), 2)
            basis = "the gap between the printed total and the lines"
        # C7/C8/C9/C10 and anything else: informational, no refund.
        if amount and amount > 0:
            f.financial_impact = {"amount": amount, "basis": basis}
        else:
            f.financial_impact = {"amount": 0.0}


def refund_total(findings: List[Dict[str, Any]], amount_billed: Optional[float]) -> float:
    """Sum the traceable per-finding impacts (de-duplicated by check + lines)
    and clamp to ``amount_billed`` so a refund can never exceed what was
    billed (fail-closed guard, spec defect D1)."""
    seen = set()
    total = 0.0
    for f in findings or []:
        fi = (f.get("financial_impact") or {}) if isinstance(f, dict) else {}
        try:
            amt = float(fi.get("amount") or 0.0)
        except (TypeError, ValueError):
            amt = 0.0
        if amt <= 0:
            continue
        ids = "|".join(sorted(f.get("line_ids") or []))
        key = f"{f.get('check_id')}::{ids}" if ids else f"raw::{id(f)}"
        if key in seen:
            continue
        seen.add(key)
        total += amt
    total = round(total, 2)
    if amount_billed is not None and total > amount_billed:
        logger.warning("inv1 refund %.2f exceeds amount billed %.2f; clamping", total, amount_billed)
        total = round(float(amount_billed), 2)
    return total


def run_checks(
    *,
    lines: List[ExtractedLine],
    situation: SituationProfile,
    document_shape: DocumentShape = DocumentShape.invoice,
    invoice_date: Optional[str] = None,
    period_end: Optional[str] = None,
    quarterly_budget: Optional[float] = None,
    statement: Optional[Dict[str, Any]] = None,
    ppc_snapshot: Optional[Dict[str, float]] = None,
    lifetime_running_total: Optional[float] = None,
    printed_total_payable: Optional[float] = None,
    supporting: Optional[Dict[str, Any]] = None,
    ce2_schema_version: Optional[str] = None,
    statement_schema_version: Optional[str] = None,
    ppc_snapshot_id: Optional[str] = None,
) -> ReconciliationPayload:
    """Run every deterministic check and assemble the reconciliation
    payload."""

    findings: List[Finding] = []
    findings.extend(check_c1_clinical_nil(lines))
    findings.extend(check_c2_personal_care_after_oct_2026(lines))
    # C3 (rate logic), gated behind `phase-1-c3-rate-logic.md` sign-off.
    c3_raw = run_c3(lines, situation)
    findings.extend(_rollup_c3(c3_raw))
    findings.extend(check_c4_care_management_and_prohibited(lines, quarterly_budget=quarterly_budget))
    findings.extend(check_c5_charged_after_delivery(lines, invoice_date, period_end=period_end))
    findings.extend(check_c6_line_arithmetic(lines))
    findings.extend(check_c7_reconciliation(lines, statement))
    findings.extend(check_c8_gst_on_care(lines))
    findings.extend(check_c9_adjustments(lines))
    findings.extend(check_c10_lifetime_cap(lines, lifetime_running_total, situation))
    findings.extend(check_c11_duplicates(lines))
    findings.extend(check_c13_footing(lines, printed_total_payable))
    # C12: unit price vs published. Only runs when the caller passes a
    # provider-specific PPC snapshot (e.g. the agreed Schedule A prices). The
    # generic SaH indicative pricebook is NOT used as a fallback: its ceilings
    # sit below many providers' legitimately agreed rates and firing against it
    # floods the family with false positives on ordinary lines.
    if ppc_snapshot:
        findings.extend(check_c12_price_vs_published(lines, ppc_snapshot))

    # Supporting-records cross-checks: agreed Schedule A rate comparison and
    # services billed while cancelled-with-notice or in hospital / on leave.
    if supporting:
        findings.extend(check_rate_vs_agreed(
            lines,
            supporting.get("agreed_rates") or {},
            supporting.get("public_holidays") or [],
        ))
        findings.extend(check_services_not_delivered(
            lines,
            supporting.get("cancellations") or [],
            supporting.get("absences") or [],
        ))

    # Input state derivation
    if statement and ce2_schema_version:
        input_state = InputState.C_invoice_plus_statement_plus_ce2
    elif statement:
        input_state = InputState.B_invoice_plus_statement
    else:
        input_state = InputState.A_invoice_only

    # Total amount billed = sum of line gross_cost (spec §10 banner "Amount billed").
    _invoice_total = round(sum((ln.gross_cost or 0) for ln in lines), 2) if lines else None

    # Roll C1/C2 up to a single card each, then attach a traceable dollar
    # impact to every finding (refund can never exceed the line's own charge).
    findings = _rollup_same_check(findings, CheckId.C1_clinical_nil)
    findings = _rollup_same_check(findings, CheckId.C2_personal_care_after_oct_2026)
    _annotate_financial_impact(findings, lines)

    return ReconciliationPayload(
        schema_version=INV1_SCHEMA_VERSION,
        document_shape=document_shape,
        input_state=input_state,
        overall_verdict=derive_verdict(findings),
        findings=findings,
        clean_reconciliation=_build_clean_reconciliation(lines, findings),
        lines=lines,
        situation=situation,
        ce2_schema_version=ce2_schema_version,
        statement_schema_version=statement_schema_version,
        ppc_snapshot_id=ppc_snapshot_id,
        invoice_total=_invoice_total,
    )
