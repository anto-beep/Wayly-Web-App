"""INV-1 v1.2 · WS4b · C3 rate-logic engine.

Implementation of the design landed in
``docs/inv-1/phase-1-c3-rate-logic.md``.

Given the extracted line items, the situation profile and (optionally)
a CE-2 estimate, ``run_c3`` emits :class:`Finding` objects that flag
lines where the contribution rate on the invoice diverges from the
expected rate for this participant.

Design invariants (see design doc):

- **Grandfathering is a protective floor, never punitive.** A
  grandfathered participant charged *below* the expected rate is
  silent (no finding).
- **Hardship is an override.** During a confirmed hardship window,
  expected rate is 0 % on all care and package-management lines;
  a non-zero contribution fires Tier 4 with ACQSC escalation.
- **Assessment-pending is a caveat, not a re-derivation.** C3 uses
  the current classification's rate and appends a fixed caveat.
- **Confidence caps.** Two or more unknown inputs → Tier ≤ 2. A single
  unknown input caps at Tier 3. A finding never fires at Tier 4 when
  confidence is ``low`` (spec §8, design §6).

C1 (clinical), C2 (personal-care after 2026-10-01) and C4 (care
management) territories are skipped here, C3 only speaks to
independence and everyday-living streams and to hardship-overridden
personal-care lines before 1 Oct 2026.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any, Dict, List, Optional, Tuple

from lib.inv1.schema import (
    CheckId,
    Confidence,
    ExpectedSource,
    ExtractedLine,
    Finding,
    PensionStatus,
    ServiceCategory,
    SituationProfile,
    Tier,
    YesNoUnknown,
)

logger = logging.getLogger("wayly.inv1.c3")


# ---------------------------------------------------------------------------
# Rate matrix, placeholder values until INDEX-1 ce2.* rates land
# ---------------------------------------------------------------------------

# Reference rates per pension status. These match the Department of
# Health "means not disclosed = interim maximum" model:
#   Independence stream max = 50%, Everyday living max = 80%, Clinical = 0%.
# When means are disclosed and the participant is a self-funded retiree
# without CSHC, they pay this maximum on an ongoing basis.
_INDEPENDENCE_RATES = {
    PensionStatus.full_pensioner:      5.0,
    PensionStatus.part_pensioner:     25.0,
    PensionStatus.cshc:               50.0,
    PensionStatus.self_funded_no_cshc: 50.0,
}

_EVERYDAY_LIVING_RATES = {
    PensionStatus.full_pensioner:     17.5,
    PensionStatus.part_pensioner:     47.5,
    PensionStatus.cshc:               80.0,
    PensionStatus.self_funded_no_cshc: 80.0,
}

# Grandfathered participants are protected at their pre-transition
# ("no worse off") contribution rate. Applied as a floor only.
_GRANDFATHERED_PROTECTED_RATES = {
    PensionStatus.full_pensioner:      0.0,
    PensionStatus.part_pensioner:     15.0,
    PensionStatus.cshc:               30.0,
    PensionStatus.self_funded_no_cshc: 50.0,
}


def _index_rate(key: str, fallback: float, as_of: Optional[date] = None) -> float:
    """INDEX-1 lookup with a hard-coded fallback."""
    try:
        from monetary_constants import load_registry
        reg = load_registry()
        v = reg.get_value(key, as_of=as_of)
        if v is not None:
            f = float(v)
            # INDEX-1 stores percentages as fractions
            return f * 100.0 if f <= 1.0 else f
    except Exception:
        pass
    return fallback


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


# ---------------------------------------------------------------------------
# Public: expected-rate resolver
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ExpectedRate:
    """Resolved expected-rate for a single line.

    ``rate`` is the primary value; ``rate_range`` is used when the
    situation is underspecified (e.g. pension_status unknown). Callers
    interpret ``rate_range`` as `[min, max]` inclusive, an observed
    rate inside the range is a match.
    """
    rate: Optional[float]
    rate_range: Optional[Tuple[float, float]] = None
    grandfathered_floor: Optional[float] = None
    source: ExpectedSource = ExpectedSource.program_rule
    caveats: Tuple[str, ...] = ()
    rule_effective_from: Optional[str] = None


def _rate_for_stream(
    category: ServiceCategory,
    pension_status: PensionStatus,
) -> Optional[float]:
    """Base program-rule rate for a category and pension status. Returns
    ``None`` when C3 does not speak to this category."""
    if category in (
        ServiceCategory.independence,
        ServiceCategory.personal_care,       # pre-1-Oct-2026 handled elsewhere
        ServiceCategory.transport,
    ):
        table = _INDEPENDENCE_RATES
        key_prefix = "ce2.independence_rate"
    elif category == ServiceCategory.everyday_living:
        table = _EVERYDAY_LIVING_RATES
        key_prefix = "ce2.everyday_living_rate"
    elif category == ServiceCategory.consumable:
        table = _EVERYDAY_LIVING_RATES
        key_prefix = "ce2.everyday_living_rate"
    else:
        return None

    if pension_status not in table:
        return None
    # INDEX-1 key format: ce2.independence_rate.full_pension
    index_key = f"{key_prefix}.{pension_status.value}"
    return _index_rate(index_key, table[pension_status])


def resolve_expected_rate(
    line: ExtractedLine,
    situation: SituationProfile,
    as_of: Optional[date] = None,
) -> Optional[ExpectedRate]:
    """Return the expected contribution-rate for a single line. Returns
    ``None`` when C3 has no expectation (clinical, care-management,
    exit/admin fees, unknown category, or C2-owned personal-care)."""
    if line.service_category in (
        ServiceCategory.clinical,
        ServiceCategory.care_management,
        ServiceCategory.exit_fee,
        ServiceCategory.admin_fee,
        ServiceCategory.unknown,
        ServiceCategory.cancellation_fee,
        ServiceCategory.at_hm,
    ):
        return None

    # Personal-care lines dated on/after 1 Oct 2026 are C2's territory.
    if line.service_category == ServiceCategory.personal_care:
        from datetime import date as _date
        try:
            sd = _date.fromisoformat((line.service_date or "")[:10])
        except ValueError:
            sd = None
        if sd and sd >= _date(2026, 10, 1):
            return None

    ps = situation.pension_status
    rate = _rate_for_stream(line.service_category, ps)

    caveats: List[str] = []
    grandfathered_floor: Optional[float] = None
    rate_range: Optional[Tuple[float, float]] = None

    # Pension status unknown → range from lowest to highest table value
    if ps == PensionStatus.unknown or rate is None:
        table = _INDEPENDENCE_RATES if line.service_category != ServiceCategory.everyday_living else _EVERYDAY_LIVING_RATES
        rate_range = (min(table.values()), max(table.values()))
        rate = None
        caveats.append("Your pension status is not confirmed, we are checking against the whole possible range.")

    # Grandfathering handling
    if situation.grandfathered == YesNoUnknown.yes and ps != PensionStatus.unknown:
        grandfathered_floor = _GRANDFATHERED_PROTECTED_RATES.get(ps)
    elif situation.grandfathered == YesNoUnknown.unknown:
        caveats.append(
            "If your care was arranged before 12 September 2024 you may be on "
            "a lower protected rate. Ask your provider to confirm."
        )

    # Assessment-pending caveat (§5)
    if situation.assessment_pending == YesNoUnknown.yes:
        caveats.append(
            "You have a reassessment pending. Your expected rate may change "
            "once the new classification is finalised."
        )

    return ExpectedRate(
        rate=rate,
        rate_range=rate_range,
        grandfathered_floor=grandfathered_floor,
        source=ExpectedSource.program_rule,
        caveats=tuple(caveats),
        rule_effective_from=_index_effective_from(
            f"ce2.independence_rate.{ps.value}" if ps != PensionStatus.unknown else None,
            as_of=as_of,
        ) if ps != PensionStatus.unknown else None,
    )


# ---------------------------------------------------------------------------
# Hardship override (§4)
# ---------------------------------------------------------------------------

def _hardship_active(
    line: ExtractedLine,
    situation: SituationProfile,
) -> Optional[bool]:
    """Return True if the line's service date falls within an active
    hardship window, False if not, and ``None`` if the situation is too
    underspecified to decide (hardship=yes but dates unknown)."""
    if situation.hardship != YesNoUnknown.yes:
        return False
    # Hardship start/end dates would live on ``SituationProfile`` if the
    # profile were extended; for v1 we treat an active hardship without
    # dates as "unknown window", C3 caps at Tier 2 per §4.
    return None    # TODO(WS3): honour situation.hardship_start/end fields


# ---------------------------------------------------------------------------
# Confidence tiering (§6)
# ---------------------------------------------------------------------------

def _confidence(
    situation: SituationProfile,
    line: ExtractedLine,
) -> Confidence:
    unknowns = 0
    if situation.pension_status == PensionStatus.unknown:
        unknowns += 1
    if situation.grandfathered == YesNoUnknown.unknown:
        unknowns += 1
    if situation.hardship == YesNoUnknown.unknown:
        unknowns += 1
    if situation.assessment_pending == YesNoUnknown.unknown:
        unknowns += 1
    if line.read_confidence < 0.8:
        unknowns += 1
    if unknowns >= 2:
        return Confidence.low
    if unknowns == 1:
        return Confidence.medium
    return Confidence.high


def _cap_tier(tier: Tier, confidence: Confidence) -> Tier:
    """Confidence caps the tier per §6."""
    if confidence == Confidence.low and tier == Tier.T4_check_before_paying:
        return Tier.T3_worth_a_question
    if confidence == Confidence.low and tier == Tier.T3_worth_a_question:
        return Tier.T2_worth_noting
    return tier


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_c3(
    lines: List[ExtractedLine],
    situation: SituationProfile,
    as_of: Optional[date] = None,
) -> List[Finding]:
    """Run C3 over every line and return the findings list."""
    findings: List[Finding] = []
    for ln in lines:
        # Hardship override, Tier 4 for any non-zero contribution
        # during an active window; Tier 2 (capped) when window is unknown.
        active = _hardship_active(ln, situation)
        if active is True and (ln.contribution_amount or ln.contribution_rate):
            findings.append(Finding(
                check_id=CheckId.C3_rate_asymmetric,
                tier=Tier.T4_check_before_paying,
                line_ids=[ln.line_id],
                observed={
                    "contribution_amount": ln.contribution_amount,
                    "contribution_rate": ln.contribution_rate,
                },
                expected={"contribution_amount": 0, "reason": "hardship"},
                expected_source=ExpectedSource.situation_profile,
                confidence=Confidence.high,
                suggested_question=(
                    "You have a confirmed hardship arrangement, which zero-rates "
                    "your contribution during that window. Can you check why a "
                    "contribution is showing on this line?"
                ),
                escalation="acqsc",
                narrative=(
                    f"Non-zero contribution ${ln.contribution_amount or 0:,.2f} "
                    "billed during an active hardship window."
                ),
            ))
            continue
        if active is None and situation.hardship == YesNoUnknown.yes:
            if ln.contribution_amount or ln.contribution_rate:
                findings.append(Finding(
                    check_id=CheckId.C3_rate_asymmetric,
                    tier=Tier.T2_worth_noting,
                    line_ids=[ln.line_id],
                    observed={"contribution_amount": ln.contribution_amount},
                    expected={"contribution_amount": 0, "reason": "hardship"},
                    expected_source=ExpectedSource.situation_profile,
                    confidence=Confidence.low,
                    suggested_question=(
                        "You told us you are on a hardship arrangement but we "
                        "don't have the dates. Can you check whether this line "
                        "falls within your hardship window?"
                    ),
                    narrative="Hardship active but window unknown.",
                ))
            continue

        expected = resolve_expected_rate(ln, situation, as_of=as_of)
        if expected is None:
            continue

        observed_rate = ln.contribution_rate
        if observed_rate is None:
            continue        # extractor did not read the rate, cannot compare

        confidence = _confidence(situation, ln)

        # Grandfathered floor: silence when observed <= floor (§3)
        if expected.grandfathered_floor is not None and observed_rate <= expected.grandfathered_floor:
            continue

        # Range comparison (§7)
        if expected.rate_range is not None:
            lo, hi = expected.rate_range
            if lo <= observed_rate <= hi:
                continue
            if observed_rate > hi:
                delta = observed_rate - hi
                tier = Tier.T3_worth_a_question if delta >= 1.0 else Tier.T2_worth_noting
            else:
                # under-charged (§7 under-charged branch)
                tier = Tier.T2_worth_noting
                confidence = min(confidence, Confidence.medium, key=lambda c: ["low", "medium", "high"].index(c.value))
            findings.append(_build_c3_finding(
                ln, expected, observed_rate, tier, _cap_tier(tier, confidence), confidence, expected.rule_effective_from,
                narrative_extra="Range check",
            ))
            continue

        # Point comparison
        if expected.rate is None:
            continue

        # Grandfathered but rate above protected floor → use current-program rate as expected
        base_expected = expected.rate
        delta = observed_rate - base_expected

        if abs(delta) < 0.5:
            continue

        if delta > 0:
            if delta >= 5:
                raw_tier = Tier.T4_check_before_paying if confidence == Confidence.high else Tier.T3_worth_a_question
            elif delta >= 1:
                raw_tier = Tier.T3_worth_a_question
            else:
                raw_tier = Tier.T2_worth_noting
        else:
            # under-charged
            if situation.grandfathered == YesNoUnknown.yes:
                continue                  # protective silence
            raw_tier = Tier.T2_worth_noting
            confidence = Confidence.medium if confidence == Confidence.high else confidence

        tier = _cap_tier(raw_tier, confidence)
        findings.append(_build_c3_finding(
            ln, expected, observed_rate, raw_tier, tier, confidence, expected.rule_effective_from,
            narrative_extra="Point check",
        ))

    # Interim-rate informational note (Banksia guard). When assessment
    # is pending and no over-charge C3 fired, add a Tier 1 note about
    # the interim maximum + expected refund.
    if (
        situation.assessment_pending == YesNoUnknown.yes
        and not any(
            f.check_id == CheckId.C3_rate_asymmetric
            and f.tier.value >= Tier.T3_worth_a_question.value
            for f in findings
        )
    ):
        rate_bearing = [ln for ln in lines if ln.contribution_rate and ln.contribution_rate > 0]
        if rate_bearing:
            findings.append(Finding(
                check_id=CheckId.C3_rate_asymmetric,
                tier=Tier.T1_informational,
                line_ids=[ln.line_id for ln in rate_bearing],
                observed=None,
                expected={"note": "interim_max_pending_assessment"},
                expected_source=ExpectedSource.situation_profile,
                confidence=Confidence.medium,
                suggested_question=(
                    "These look like interim rates while your income and assets "
                    "assessment is being finalised. They are set at the maximum "
                    "by default. Once Services Australia confirms your assessed "
                    "rate, your provider must refund any amount you have overpaid. "
                    "Keep this invoice so you can check the refund later."
                ),
                narrative="Interim rates apply while assessment is pending. Refund expected once finalised.",
            ))

    return findings


def _build_c3_finding(
    line: ExtractedLine,
    expected: ExpectedRate,
    observed: float,
    raw_tier: Tier,
    capped_tier: Tier,
    confidence: Confidence,
    rule_effective_from: Optional[str],
    narrative_extra: str = "",
) -> Finding:
    caveat_text = " ".join(expected.caveats) if expected.caveats else ""
    if expected.rate is not None:
        exp_display = f"{expected.rate:g} %"
    elif expected.rate_range is not None:
        lo, hi = expected.rate_range
        exp_display = f"between {lo:g} % and {hi:g} %"
    else:
        exp_display = "unknown"
    escalation = "acqsc" if capped_tier == Tier.T4_check_before_paying else None
    return Finding(
        check_id=CheckId.C3_rate_asymmetric,
        tier=capped_tier,
        line_ids=[line.line_id],
        observed={"contribution_rate": observed},
        expected={
            "rate": expected.rate,
            "rate_range": list(expected.rate_range) if expected.rate_range else None,
            "grandfathered_floor": expected.grandfathered_floor,
        },
        expected_source=expected.source,
        confidence=confidence,
        rule_effective_from=rule_effective_from,
        escalation=escalation,
        suggested_question=(
            f"The contribution rate on \"{line.service_type}\" is {observed:g} %, "
            f"and for your situation we would expect {exp_display}. "
            "Can you check whether the right rate has been applied? "
            + caveat_text
        ).strip(),
        narrative=(
            f"{narrative_extra}: observed {observed:g} %, expected {exp_display}."
        ),
    )
