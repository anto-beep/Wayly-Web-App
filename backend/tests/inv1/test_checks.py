"""INV-1 WS4 · Checks engine tests (C1, C2, C4, C5, C7, C8, C9, C10, C11, C12)."""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
_BACKEND = _HERE.parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from lib.inv1 import (  # noqa: E402
    CheckId,
    DocumentShape,
    ExtractedLine,
    OverallVerdict,
    ServiceCategory,
    SituationProfile,
    Tier,
    run_checks,
)
from lib.inv1.schema import PensionStatus, YesNoUnknown  # noqa: E402


def _line(**kw) -> ExtractedLine:
    """Build an ExtractedLine with defaults suitable for tests."""
    from uuid import uuid4
    defaults = dict(
        line_id=str(uuid4()),
        service_category=ServiceCategory.independence,
        service_type="Domestic assistance",
        service_date="2026-08-15",
        gross_cost=100.0,
        read_confidence=1.0,
        raw_text="Domestic assistance 15/08/2026 $100.00",
    )
    defaults.update(kw)
    return ExtractedLine(**defaults)


def _situation(**kw) -> SituationProfile:
    defaults = dict(
        pension_status=PensionStatus.full_pensioner,
        grandfathered=YesNoUnknown.no,
        hardship=YesNoUnknown.no,
        assessment_pending=YesNoUnknown.no,
        assessment_letter_date=None,
    )
    defaults.update(kw)
    return SituationProfile(**defaults)


def _find(recon, check_id):
    return [f for f in recon.findings if f.check_id == check_id]


# ---------- C1 clinical nil ----------

def test_c1_flags_clinical_with_contribution():
    lines = [_line(
        service_category=ServiceCategory.clinical,
        service_type="Nursing",
        contribution_amount=25.0,
        contribution_rate=25.0,
    )]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C1_clinical_nil)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T4_check_before_paying
    assert fs[0].escalation == "acqsc"


def test_c1_silent_when_clinical_zero():
    lines = [_line(
        service_category=ServiceCategory.clinical,
        contribution_amount=0.0,
    )]
    recon = run_checks(lines=lines, situation=_situation())
    assert _find(recon, CheckId.C1_clinical_nil) == []


# ---------- C2 personal care post 1 Oct 2026 ----------

def test_c2_flags_personal_care_after_cutoff():
    lines = [_line(
        service_category=ServiceCategory.personal_care,
        service_date="2026-10-05",
        contribution_amount=15.0,
    )]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C2_personal_care_after_oct_2026)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T4_check_before_paying


def test_c2_silent_before_cutoff():
    lines = [_line(
        service_category=ServiceCategory.personal_care,
        service_date="2026-08-15",
        contribution_amount=15.0,
    )]
    recon = run_checks(lines=lines, situation=_situation())
    assert _find(recon, CheckId.C2_personal_care_after_oct_2026) == []


# ---------- C4 care management + prohibited fees ----------

def test_c4_flags_exit_fee():
    lines = [_line(service_category=ServiceCategory.exit_fee, service_type="Exit fee", gross_cost=250.0)]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C4_care_mgmt_and_prohibited_fees)
    assert len(fs) >= 1
    assert fs[0].tier == Tier.T4_check_before_paying
    assert fs[0].escalation == "acqsc"


def test_c4_flags_admin_fee():
    lines = [_line(service_category=ServiceCategory.admin_fee, service_type="Administration fee", gross_cost=50.0)]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C4_care_mgmt_and_prohibited_fees)
    assert len(fs) >= 1


def test_c4_flags_care_management_over_cap():
    """Care management above 10 % fires."""
    lines = [
        _line(service_category=ServiceCategory.independence, service_type="Cleaning", gross_cost=100.0),
        _line(service_category=ServiceCategory.care_management, service_type="Care management", gross_cost=50.0),
    ]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C4_care_mgmt_and_prohibited_fees)
    # 50 / (100 + 50) = 33 % → above 10 %
    assert any(f.observed.get("care_management_pct") for f in fs)


def test_c4_silent_when_care_management_within_cap():
    lines = [
        _line(service_category=ServiceCategory.independence, service_type="Cleaning", gross_cost=900.0),
        _line(service_category=ServiceCategory.care_management, service_type="Care management", gross_cost=100.0),
    ]
    recon = run_checks(lines=lines, situation=_situation())
    # 100 / 1000 = 10 %, at cap → silent
    pct_findings = [f for f in _find(recon, CheckId.C4_care_mgmt_and_prohibited_fees) if f.observed and "care_management_pct" in (f.observed or {})]
    assert pct_findings == []


# ---------- C5 charged after delivery ----------

def test_c5_flags_service_date_after_invoice_date():
    lines = [_line(service_date="2026-10-10")]
    recon = run_checks(lines=lines, situation=_situation(), invoice_date="2026-10-05")
    fs = _find(recon, CheckId.C5_charged_after_delivery)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T3_worth_a_question


def test_c5_silent_when_service_before_invoice():
    lines = [_line(service_date="2026-10-01")]
    recon = run_checks(lines=lines, situation=_situation(), invoice_date="2026-10-05")
    assert _find(recon, CheckId.C5_charged_after_delivery) == []


# ---------- C7 reconciliation ----------

def test_c7_flags_unmatched_line():
    lines = [_line(gross_cost=100.0, service_date="2026-08-15")]
    statement = {"line_items": [{"gross_cost": 200.0, "service_date": "2026-08-15"}]}
    recon = run_checks(lines=lines, situation=_situation(), statement=statement)
    fs = _find(recon, CheckId.C7_invoice_statement_reconciliation)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T3_worth_a_question


def test_c7_matches_within_tolerance():
    lines = [_line(gross_cost=100.5, service_date="2026-08-15")]
    statement = {"line_items": [{"gross_cost": 100.0, "service_date": "2026-08-17"}]}
    recon = run_checks(lines=lines, situation=_situation(), statement=statement)
    assert _find(recon, CheckId.C7_invoice_statement_reconciliation) == []


# ---------- C8 GST on ordinary care ----------

def test_c8_flags_gst_on_care():
    lines = [_line(service_category=ServiceCategory.independence, gst_amount=10.0)]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C8_gst_service_type)
    assert len(fs) == 1


def test_c8_silent_on_transport():
    lines = [_line(service_category=ServiceCategory.transport, gst_amount=5.0)]
    recon = run_checks(lines=lines, situation=_situation())
    assert _find(recon, CheckId.C8_gst_service_type) == []


# ---------- C9 adjustments ----------

def test_c9_flags_negative_lines():
    lines = [_line(gross_cost=-50.0, service_type="Refund")]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C9_adjustments_refunds)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T1_informational


# ---------- C10 lifetime cap ----------

def test_c10_emits_deferred_note_when_cap_unknown():
    """The lifetime cap keys are ``deferred: true`` in the registry, so
    C10 should emit a Tier-1 informational placeholder."""
    lines = [_line()]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C10_lifetime_cap_indicative)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T1_informational


# ---------- C11 duplicates ----------

def test_c11_flags_duplicates():
    from uuid import uuid4
    lines = [
        _line(line_id=str(uuid4()), service_type="Personal care", service_date="2026-08-15", gross_cost=65.0),
        _line(line_id=str(uuid4()), service_type="Personal care", service_date="2026-08-15", gross_cost=65.0),
    ]
    recon = run_checks(lines=lines, situation=_situation())
    fs = _find(recon, CheckId.C11_duplicate_billing)
    assert len(fs) == 1
    assert fs[0].tier == Tier.T3_worth_a_question


# ---------- C12 published price ----------

def test_c12_flags_price_above_published():
    lines = [_line(service_type="cleaning", unit_price=80.0)]
    recon = run_checks(lines=lines, situation=_situation(), ppc_snapshot={"cleaning": 60.0})
    fs = _find(recon, CheckId.C12_price_vs_published)
    assert len(fs) == 1


def test_c12_silent_at_or_below_published():
    lines = [_line(service_type="cleaning", unit_price=60.0)]
    recon = run_checks(lines=lines, situation=_situation(), ppc_snapshot={"cleaning": 60.0})
    assert _find(recon, CheckId.C12_price_vs_published) == []


# ---------- Verdict derivation ----------

def test_all_clear_verdict_when_no_findings_except_c10():
    lines = [_line()]
    recon = run_checks(lines=lines, situation=_situation())
    # Only C10 deferred-info finding exists (Tier 1 informational)
    non_info = [f for f in recon.findings if f.tier != Tier.T1_informational]
    assert non_info == []
    assert recon.overall_verdict == OverallVerdict.all_clear


def test_check_before_paying_verdict_for_exit_fee():
    lines = [_line(service_category=ServiceCategory.exit_fee, gross_cost=100.0)]
    recon = run_checks(lines=lines, situation=_situation())
    assert recon.overall_verdict == OverallVerdict.check_before_paying


# ---------- Clean reconciliation summary ----------

def test_clean_reconciliation_populated():
    lines = [_line()]
    recon = run_checks(lines=lines, situation=_situation())
    assert len(recon.clean_reconciliation) >= 5
    ok_ids = [c["check_id"] for c in recon.clean_reconciliation if c["ok"]]
    assert "C1" in ok_ids
    assert "C11" in ok_ids
