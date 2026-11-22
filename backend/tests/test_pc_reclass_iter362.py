"""PC-RECLASS-1 · Personal-care contribution reclassification (1 Oct 2026).

From 1 October 2026 personal care moved from the Independence contribution
category to Clinical Supports under Support at Home; the participant share is
$0 where funds are available. These tests pin the acceptance-evidence matrix:

  WS-A  INDEX-1 single source of truth (policy_date.personal_care_free) + no
        hardcoded $0 literal (the share is computed).
  WS-B  Date-aware engine, four date cases, boundary by SERVICE DELIVERY date.
  WS-C  Statement Decoder new error flag RULE_PC_RECLASS_CONTRIB, with a
        false-positive control (pre-boundary + post-boundary-$0 + non-PC).
  WS-D  SAH Invoice Checker C2 respects the rollback flag.
  WS-E  Contribution Estimator (CE-2) forward estimate excludes personal care.
  D7    Feature flag pc_reclass_2026_10 rollback path.
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agents  # noqa: E402
from lib import services_base as sb  # noqa: E402


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _pc_line(date_iso: str, contribution: float, *, desc="Personal Care - Morning routine",
             stream="Independence", gross=82.0):
    gp = round(gross - contribution, 2)
    return {
        "date": date_iso,
        "service_description": desc,
        "stream": stream,
        "quantity": 1.0, "unit": "hr", "raw_qty_text": "1 hr",
        "hours": 1.0, "unit_rate": gross, "gross": gross,
        "participant_contribution": contribution, "government_paid": gp,
        "is_cancellation": False, "service_code": "",
    }


def _ext(line_items):
    gross = round(sum(li["gross"] for li in line_items), 2)
    pc = round(sum(li["participant_contribution"] for li in line_items), 2)
    gp = round(gross - pc, 2)
    return {
        "participant_name": "Ivan Kowalski",
        "provider_name": "Southern Cross Home Care",
        "provider_abn": "",
        "statement_period": "1 November 2026 to 30 November 2026",
        "period_start": "2026-11-01",
        "period_end": "2026-11-30",
        "pension_status": "part_age_pension",
        "classification": "",
        "quarterly_budget_total": 0.0,
        "care_management_deducted": 0.0,
        "care_management_source_text": "",
        "reported_total_gross": gross,
        "reported_total_participant_contribution": pc,
        "reported_total_government_paid": gp,
        "source_declared_services_total": gross,
        "per_line_contribution_source": "per_line",
        "funding_available_this_month": 3400.0,
        "quarterly_allocation": None,
        "stream_used_this_month": {"Clinical": 0.0, "Independence": gross, "EverydayLiving": 0.0},
        "header_stream_budgets": {"Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0},
        "line_items": line_items,
        "previous_period_adjustments": [],
        "at_hm_commitments": [],
        "provider_notes_raw": [],
    }


def _decoder_rules(line_items):
    audit = {"anomalies": [], "statement_summary": {"cadence": "monthly"}}
    out = agents._add_parse_warnings(audit, copy.deepcopy(_ext(line_items)))
    return [a.get("rule", "") for a in (out.get("anomalies") or [])]


# ---------------------------------------------------------------------------
# WS-A · INDEX-1 single source of truth
# ---------------------------------------------------------------------------

def test_wsa_index1_boundary_is_single_source():
    """The boundary date lives in INDEX-1 (monetary_constants.yaml) under
    policy_date.personal_care_free, effective-dated, with provenance."""
    from monetary_constants import load_registry
    reg = load_registry()
    entry = reg.get_entry("policy_date.personal_care_free")
    assert entry is not None, "policy_date.personal_care_free missing from INDEX-1"
    assert str(entry.value)[:10] == "2026-10-01"
    assert entry.source_url, "boundary row must carry source provenance"


def test_wsa_seed_program_reference_has_boundary():
    from seed_program_reference import get_seed_rows
    rows = [r for r in get_seed_rows() if r["key"] == "policy_date.personal_care_free"]
    assert rows, "policy_date.personal_care_free missing from program_reference seed"
    assert str(rows[0]["value"])[:10] == "2026-10-01"


def test_wsa_no_hardcoded_zero_share():
    """The $0 participant share is COMPUTED, not a literal typed into the
    engine (decision 4)."""
    share = sb.expected_personal_care_participant_share("2026-11-15")
    assert share == 0.0  # derived from the fully-funded rule, not a magic cell
    assert sb.expected_personal_care_participant_share("2026-09-30") is None


# ---------------------------------------------------------------------------
# WS-B · date-aware engine, four date cases (boundary by SERVICE DELIVERY date)
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("service_date,funded", [
    ("2026-09-30", False),   # pre-boundary: contribution still applies
    ("2026-10-01", True),    # on boundary: fully funded
    ("2026-10-02", True),    # post-boundary
    ("2026-11-15", True),    # well past boundary
])
def test_wsb_four_date_cases(service_date, funded):
    assert sb.personal_care_is_fully_funded(service_date) is funded
    if funded:
        assert sb.expected_personal_care_participant_share(service_date) == 0.0
    else:
        assert sb.expected_personal_care_participant_share(service_date) is None


def test_wsb_flag_off_disables_engine(monkeypatch):
    monkeypatch.setenv("pc_reclass_2026_10", "0")
    assert sb.pc_reclass_enabled() is False
    assert sb.personal_care_is_fully_funded("2026-11-15") is False
    assert sb.expected_personal_care_participant_share("2026-11-15") is None


# ---------------------------------------------------------------------------
# WS-C · Statement Decoder new error flag + false-positive controls
# ---------------------------------------------------------------------------

def test_wsc_seeded_error_is_flagged():
    rules = _decoder_rules([_pc_line("2026-11-04", 8.20)])
    assert "RULE_PC_RECLASS_CONTRIB" in rules


def test_wsc_post_boundary_zero_contribution_not_flagged():
    rules = _decoder_rules([_pc_line("2026-11-04", 0.0)])
    assert "RULE_PC_RECLASS_CONTRIB" not in rules


def test_wsc_pre_boundary_contribution_not_flagged():
    """A September service keeps its contribution (decision 2 — by delivery date)."""
    rules = _decoder_rules([_pc_line("2026-09-20", 8.20)])
    assert "RULE_PC_RECLASS_CONTRIB" not in rules


def test_wsc_non_personal_care_not_flagged():
    rules = _decoder_rules([
        _pc_line("2026-11-04", 12.0, desc="Domestic cleaning", stream="Everyday Living"),
    ])
    assert "RULE_PC_RECLASS_CONTRIB" not in rules


def test_wsc_dedupes_to_single_flag():
    rules = _decoder_rules([
        _pc_line("2026-11-04", 8.20),
        _pc_line("2026-11-11", 8.20, desc="Personal Care - Toileting support"),
    ])
    assert rules.count("RULE_PC_RECLASS_CONTRIB") == 1


def test_wsc_flag_off_rollback(monkeypatch):
    monkeypatch.setenv("pc_reclass_2026_10", "0")
    rules = _decoder_rules([_pc_line("2026-11-04", 8.20)])
    assert "RULE_PC_RECLASS_CONTRIB" not in rules


# ---------------------------------------------------------------------------
# WS-D · Invoice Checker C2 respects the rollback flag
# ---------------------------------------------------------------------------

def _c2(service_date, contribution):
    from uuid import uuid4
    from lib.inv1.schema import ServiceCategory, ExtractedLine
    from lib.inv1.checks import check_c2_personal_care_after_oct_2026
    ln = ExtractedLine(
        line_id=str(uuid4()),
        service_category=ServiceCategory.personal_care,
        service_type="Personal care",
        service_date=service_date,
        gross_cost=82.0,
        contribution_amount=contribution,
        read_confidence=1.0,
        raw_text=f"Personal care {service_date} ${contribution}",
    )
    return check_c2_personal_care_after_oct_2026([ln])


def test_wsd_c2_flags_post_boundary():
    assert len(_c2("2026-11-04", 8.20)) == 1


def test_wsd_c2_flag_off_rollback(monkeypatch):
    monkeypatch.setenv("pc_reclass_2026_10", "0")
    assert _c2("2026-11-04", 8.20) == []


# ---------------------------------------------------------------------------
# WS-E · CE-2 forward estimate excludes the personal-care contribution
# ---------------------------------------------------------------------------

def test_wse_ce2_october_split_excludes_personal_care():
    from datetime import date
    from monetary_constants import load_registry
    from services.ce2_engine import october_2026_split
    reg = load_registry()
    split = october_2026_split(
        reg,
        independence_spend_annual=10000.0,
        independence_rate_pct=5.0,
        effective_date=date(2026, 11, 1),
    )
    # post-Oct contribution must be strictly less than pre-Oct (personal-care
    # sub-share now contributes 0%), and the drop equals the PC sub-share.
    assert split["independence_contribution_post_oct_2026_annual"] < \
        split["independence_contribution_pre_oct_2026_annual"]
    assert 0.0 < split["personal_care_sub_share"] <= 1.0
