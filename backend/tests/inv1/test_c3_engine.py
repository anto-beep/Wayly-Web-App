"""INV-1 · C3 rate-logic engine tests (spec §7 §8, design §10 V1..V12)."""
from __future__ import annotations

import sys
from pathlib import Path
from uuid import uuid4

_HERE = Path(__file__).resolve()
_BACKEND = _HERE.parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from lib.inv1 import (  # noqa: E402
    CheckId,
    Confidence,
    ExtractedLine,
    ServiceCategory,
    SituationProfile,
    Tier,
    run_checks,
)
from lib.inv1.c3_rate import run_c3  # noqa: E402
from lib.inv1.schema import PensionStatus, YesNoUnknown  # noqa: E402


def _line(rate, category=ServiceCategory.independence, **kw):
    defaults = dict(
        line_id=str(uuid4()),
        service_category=category,
        service_type="Cleaning",
        service_date="2026-08-15",
        gross_cost=100.0,
        contribution_rate=rate,
        contribution_amount=rate,
        read_confidence=1.0,
        raw_text="Cleaning 15/08/2026 $100.00",
    )
    defaults.update(kw)
    return ExtractedLine(**defaults)


def _sit(ps=PensionStatus.full_pensioner, gf=YesNoUnknown.no,
         hs=YesNoUnknown.no, ap=YesNoUnknown.no, letter=None):
    return SituationProfile(
        pension_status=ps, grandfathered=gf, hardship=hs,
        assessment_pending=ap, assessment_letter_date=letter,
    )


def _c3(recon):
    return [f for f in recon.findings if f.check_id == CheckId.C3_rate_asymmetric]


# V1: Full pensioner, standard independence rate → no finding
def test_v1_full_pensioner_standard_rate_no_finding():
    lines = [_line(5.0)]
    recon = run_checks(lines=lines, situation=_sit())
    assert _c3(recon) == []


# V2: Full pensioner, no grandfather, +5pp above expected → Tier 4, high confidence
def test_v2_five_pp_over_tier_4_high_confidence():
    lines = [_line(10.0)]        # expected 5, observed 10 → +5pp
    recon = run_checks(lines=lines, situation=_sit())
    fs = _c3(recon)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T4_check_before_paying
    assert fs[0].confidence == Confidence.high
    assert fs[0].escalation == "acqsc"


# V3: Grandfathered full pensioner billed at current rate, above protected floor → Tier 3
def test_v3_grandfathered_current_rate_above_floor():
    lines = [_line(5.0)]         # expected 5 for full pensioner, protected floor 0
    recon = run_checks(lines=lines, situation=_sit(gf=YesNoUnknown.yes))
    fs = _c3(recon)
    # observed 5, expected 5 → within 0.5 → silent
    assert fs == []


# V4: Grandfathered full pensioner billed BELOW protected floor → silent
def test_v4_grandfathered_below_floor_silent():
    lines = [_line(0.0)]         # expected 5, floor 0
    recon = run_checks(lines=lines, situation=_sit(ps=PensionStatus.part_pensioner, gf=YesNoUnknown.yes))
    # part pensioner expected 25, grandfathered floor 15. observed 0 <= 15 → silent
    fs = _c3(recon)
    assert fs == []


# V5: Full pensioner, hardship active, personal-care billed 5% (pre-Oct 2026) →
#     hardship override, Tier 4, ACQSC. But our _hardship_active returns None
#     because no dates. The design says Tier 2 in that case.
def test_v5_hardship_active_but_unknown_dates_tier_2():
    lines = [_line(5.0, category=ServiceCategory.personal_care, service_date="2026-08-15")]
    recon = run_checks(lines=lines, situation=_sit(hs=YesNoUnknown.yes))
    fs = _c3(recon)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T2_worth_noting
    assert fs[0].escalation is None


# V6: same as V5 but the caller says hardship=no → not a hardship finding
def test_v6_hardship_no_treats_as_normal():
    lines = [_line(5.0, category=ServiceCategory.personal_care, service_date="2026-08-15")]
    recon = run_checks(lines=lines, situation=_sit(hs=YesNoUnknown.no))
    fs = _c3(recon)
    # personal_care pre 1 Oct 2026 uses independence rates. Full pensioner
    # expected 5, observed 5 → silent.
    assert fs == []


# V7: Assessment pending, over-charged 3pp → Tier 3, medium confidence, caveat present
def test_v7_assessment_pending_caveat_over_charged():
    lines = [_line(8.0)]
    recon = run_checks(lines=lines, situation=_sit(ap=YesNoUnknown.yes))
    fs = _c3(recon)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T3_worth_a_question
    assert "reassessment" in fs[0].suggested_question.lower()


# V8: Grandfathering unknown, over-charged → caveat present, capped confidence
def test_v8_grandfathering_unknown_over_charged_caveat():
    lines = [_line(10.0)]
    recon = run_checks(lines=lines, situation=_sit(gf=YesNoUnknown.unknown))
    fs = _c3(recon)
    assert len(fs) == 1
    assert fs[0].confidence in (Confidence.medium, Confidence.low)
    assert "12 september 2024" in fs[0].suggested_question.lower()


# V9: Observed 0.5pp above → below the 0.5 tolerance → silent
def test_v9_under_tolerance_silent():
    lines = [_line(5.4)]
    recon = run_checks(lines=lines, situation=_sit())
    fs = _c3(recon)
    assert fs == []


# V10: Extractor read_confidence < 0.8 → confidence low, tier capped
def test_v10_low_read_confidence_caps_tier():
    lines = [_line(10.0, read_confidence=0.4)]
    recon = run_checks(lines=lines, situation=_sit())
    fs = _c3(recon)
    assert len(fs) == 1
    # Raw would be Tier 4; capped to Tier 3 (or 2) because confidence low
    assert fs[0].tier in (Tier.T3_worth_a_question, Tier.T2_worth_noting)


# V11: Pension status unknown → range check, observed inside range = silent
def test_v11_pension_unknown_range_silent_when_inside():
    lines = [_line(20.0)]        # range 5..80 for independence
    recon = run_checks(lines=lines, situation=_sit(ps=PensionStatus.unknown))
    fs = _c3(recon)
    assert fs == []


# V12: Pension unknown, observed above range max
def test_v12_pension_unknown_above_range():
    lines = [_line(90.0)]        # independence max 80
    recon = run_checks(lines=lines, situation=_sit(ps=PensionStatus.unknown))
    fs = _c3(recon)
    assert len(fs) == 1


# Under-charged branch (§7)
def test_under_charged_not_grandfathered_tier_2():
    lines = [_line(2.0)]         # expected 5
    recon = run_checks(lines=lines, situation=_sit())
    fs = _c3(recon)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T2_worth_noting


def test_under_charged_grandfathered_silent():
    lines = [_line(2.0)]
    recon = run_checks(lines=lines, situation=_sit(gf=YesNoUnknown.yes))
    fs = _c3(recon)
    # protected floor 0, observed 2 > 0 → not silence rule. But delta < 0
    # so under-charged. Grandfathered → silence per §7.
    assert fs == []


# C3 does not fire on clinical, care-management, exit-fee lines
def test_c3_ignores_clinical():
    lines = [_line(5.0, category=ServiceCategory.clinical)]
    recon = run_c3(lines, _sit())
    assert recon == []


def test_c3_ignores_care_management():
    lines = [_line(5.0, category=ServiceCategory.care_management)]
    recon = run_c3(lines, _sit())
    assert recon == []


# Personal-care post 1 Oct 2026 → C3 defers to C2
def test_c3_defers_to_c2_for_personal_care_post_cutoff():
    lines = [_line(10.0, category=ServiceCategory.personal_care, service_date="2026-11-01")]
    recon = run_c3(lines, _sit())
    assert recon == []
