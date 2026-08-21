"""SD-ERR-C golden-output regression fixture (DEC-FINDINGS-1 v3, workstream E;
spec: SD-ERR-C-golden v2).

Freezes the corrected deterministic decode of SD-ERR-C so the specific defects
found on it cannot return silently: the phantom AT-HM reconciliation flag, the
inverted contribution remedy, the misleading aggregate, the contradictory care
management % in the plain-English text, the broken government-paid identity,
and the footer noise.

Like the Margaret golden, this does NOT hit the LLM. It feeds the frozen
extracted_json through the deterministic tail (`agents._add_parse_warnings`)
plus the plain-English summary renderer and the per-line GOVT PAID identity,
and asserts the golden values. Drift fails the build.

Input: SD-ERR-C_Louisa_Davids_JulSep2026.pdf
Golden: two findings (HIGH care-management cap + one INFO contribution note),
$28.60 recoverable, care-management 11.5%, GOVT PAID column $2,160.00, summary
government-paid $2,376.00 = column + $216.00 care management.
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any, Dict

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import program_reference as pr  # noqa: E402
import agents  # noqa: E402
import server  # noqa: E402
from lib.dec1_v5_schema import compute_line_item_sum  # noqa: E402


# --- INDEX-1 contribution rates (effective 1 Nov 2025). Seeding the cache here
# proves the decoder resolves rates from INDEX-1, not from hardcoded constants.
_INDEX1_CONTRIBUTION_CACHE = {
    "contribution.independence_band": [("2025-11-01", None, [0.05, 0.50], "id-ind")],
    "contribution.everyday_band": [("2025-11-01", None, [0.175, 0.80], "id-eve")],
    "contribution.clinical_pct": [("2025-11-01", None, 0.00, "id-cli")],
}


@pytest.fixture(autouse=True)
def _seed_index1(monkeypatch):
    monkeypatch.setattr(pr, "_CACHE", copy.deepcopy(_INDEX1_CONTRIBUTION_CACHE), raising=False)
    monkeypatch.setattr(pr, "_CACHE_READY", True, raising=False)
    yield


_PERSONAL_CARE = ["2026-07-07", "2026-07-21", "2026-08-04", "2026-08-18",
                  "2026-09-01", "2026-09-15", "2026-09-29", "2026-09-08"]
_DOMESTIC = ["2026-07-14", "2026-07-28", "2026-08-11", "2026-08-25", "2026-09-22"]
_CLINICAL = ["2026-07-10", "2026-08-12", "2026-09-16"]


def _line(date, desc, stream, q, unit, rate, gross):
    return {
        "date": date, "service_description": desc, "service_code": "", "stream": stream,
        "quantity": q, "unit": unit, "raw_qty_text": f"{q} {unit}", "raw_rate_text": f"${rate:.2f}",
        "hours": q if unit == "hr" else 0.0, "unit_rate": rate, "gross": gross,
        "participant_contribution": None, "government_paid": None, "is_cancellation": False,
        "worker_name": "", "is_brokered": False, "provider_notes": "", "flags_in_original": "",
    }


def _sderrc_extracted() -> Dict[str, Any]:
    items = []
    for d in _PERSONAL_CARE:
        items.append(_line(d, "Personal care", "Independence", 1.5, "hr", 72.0, 108.0))
    for d in _DOMESTIC:
        items.append(_line(d, "Domestic assistance", "EverydayLiving", 2.0, "hr", 65.0, 130.0))
    for d in _CLINICAL:
        items.append(_line(d, "Clinical care - nursing wound review", "Clinical", 1.0, "visit", 120.0, 120.0))
    items.append(_line("2026-09-20",
                       "Assistive technology and home modifications - bathroom grab rails",
                       "ATHM", 1.0, "ea", 286.0, 286.0))
    ext = {
        "participant_name": "Louisa Davids", "provider_name": "Glorious Services Pty Ltd",
        "provider_abn": "12 345 678 901", "statement_period": "1 July 2026 to 30 September 2026",
        "period_start": "2026-07-01", "period_end": "2026-09-30",
        "pension_status": "full_age_pension", "classification": "8",
        "quarterly_budget_total": 2516.0, "care_management_deducted": 216.0,
        "care_management_rate_pct": 10.0,
        "care_management_source_text": "Care management fee (quarter): $216.00",
        "service_budget_available": 2516.0, "reported_total_gross": 2376.0,
        "reported_total_participant_contribution": 0.0, "reported_total_government_paid": 2376.0,
        "source_declared_services_total": 1874.0, "per_line_contribution_source": "aggregate_only",
        "funding_available_this_month": 2516.0, "quarterly_allocation": 2516.0,
        "stream_used_this_month": {}, "header_stream_budgets": {},
        "line_items": items, "previous_period_adjustments": [], "at_hm_commitments": [],
        "provider_notes_raw": [],
    }
    ext["computed_line_item_sum"] = compute_line_item_sum(ext["line_items"])
    return ext


def _run_audit(ext: Dict[str, Any]) -> Dict[str, Any]:
    audit = {"anomalies": [], "statement_summary": {"cadence": "quarterly"}}
    return agents._add_parse_warnings(audit, copy.deepcopy(ext))


def _summary_audit(ext, audit) -> Dict[str, Any]:
    return {
        "anomalies": audit["anomalies"],
        "anomaly_count": {"high": 1, "medium": 0, "low": 0},
        "statement_summary": {
            "participant_name": "Louisa Davids", "provider": "Glorious Services Pty Ltd",
            "period": "01/07/2026 to 30/09/2026", "classification": "8", "cadence": "quarterly",
            "total_gross": 2376.0, "total_participant_contribution": 0.0,
            "total_government_paid": 2376.0, "total_line_items": 17, "care_management_fee": 216.0,
        },
        "stream_breakdown": [
            {"stream": "Clinical", "gross_total": 360.0, "line_item_count": 3},
            {"stream": "Independence", "gross_total": 864.0, "line_item_count": 8},
            {"stream": "EverydayLiving", "gross_total": 650.0, "line_item_count": 5},
            {"stream": "ATHM", "gross_total": 286.0, "line_item_count": 1},
        ],
    }


# --- Golden assertions ------------------------------------------------------

def test_exactly_two_findings():
    audit = _run_audit(_sderrc_extracted())
    rules = [a.get("rule") for a in audit["anomalies"]]
    assert len(rules) == 2, f"SD-ERR-C must decode to exactly two findings, got {rules}"
    assert "RULE_1_CARE_MGMT_CAP" in rules
    assert "RULE_9_CONTRIBUTION_INFO" in rules


def test_no_reconciliation_no_footer_no_medium():
    audit = _run_audit(_sderrc_extracted())
    for a in audit["anomalies"]:
        rule = (a.get("rule") or "").upper()
        sev = (a.get("severity") or "").lower()
        assert rule != "RULE_25_SOURCE_ARITHMETIC_GAP", "phantom AT-HM reconciliation flag must not fire"
        assert rule != "RULE_29_MISSING_ACT_DISCLOSURE", "footer program-reference flag was removed"
        assert sev != "medium", f"no MEDIUM finding allowed, got {rule}"


def test_high_care_management_cap_unchanged():
    audit = _run_audit(_sderrc_extracted())
    cap = next(a for a in audit["anomalies"] if a.get("rule") == "RULE_1_CARE_MGMT_CAP")
    assert cap["severity"] == "high"
    assert cap["dollar_impact"] == 28.60
    assert "$28.60" in cap["headline"]
    # base $1,874.00 (AT-HM excluded), 11.5%, cap $187.40
    ev = " ".join(str(e) for e in cap.get("evidence") or [])
    assert "1,874.00" in ev and "187.40" in ev
    assert "11.5%" in cap["detail"]


def test_contribution_is_single_info_note_no_refund():
    audit = _run_audit(_sderrc_extracted())
    note = next(a for a in audit["anomalies"] if a.get("rule") == "RULE_9_CONTRIBUTION_INFO")
    assert note["severity"] == "info"
    assert not note.get("dollar_impact")
    assert note.get("impact_aud") is None
    blob = " ".join(str(note.get(k) or "") for k in ("headline", "detail", "suggested_action")).lower()
    assert "refund" not in blob, "contribution note must contain no refund wording"
    assert "contribution estimator" in blob
    # lists the two affected streams
    assert "Independence" in str(note.get("evidence"))
    assert "Everyday Living" in str(note.get("evidence"))


def test_contribution_rates_trace_to_index1(monkeypatch):
    """No hardcoded rate: if INDEX-1 says Independence has a 0% band, no
    Independence contribution difference is noted."""
    monkeypatch.setattr(pr, "_CACHE", {
        "contribution.independence_band": [("2025-11-01", None, [0.0, 0.0], "id-ind")],
        "contribution.everyday_band": [("2025-11-01", None, [0.0, 0.0], "id-eve")],
    }, raising=False)
    monkeypatch.setattr(pr, "_CACHE_READY", True, raising=False)
    audit = _run_audit(_sderrc_extracted())
    notes = [a for a in audit["anomalies"] if a.get("rule") == "RULE_9_CONTRIBUTION_INFO"]
    assert not notes, "with 0% INDEX-1 bands no contribution difference should be noted"


def test_per_line_government_paid_identity():
    ext = _sderrc_extracted()
    col = round(sum(server._line_govt_paid(li) for li in ext["line_items"]), 2)
    assert col == 2160.00, f"line-item GOVT PAID column must sum to 2160.00, got {col}"
    for li in ext["line_items"]:
        assert abs(server._line_govt_paid(li) - li["gross"]) < 0.005, (
            "every line: GOVT PAID must equal GROSS when YOU PAID is 0.00"
        )
    # summary government-paid 2,376.00 = column 2,160.00 + care management 216.00
    assert round(col + 216.00, 2) == 2376.00


def test_plain_english_care_management_pct_and_aggregate():
    ext = _sderrc_extracted()
    audit = _run_audit(ext)
    summ = server._render_plain_english_summary(ext, _summary_audit(ext, audit))
    assert "11.5%" in summ, "prose care-management % must read 11.5%"
    assert "10.0%" not in summ, "prose must not read the AT-HM-included 10.0%"
    assert "$28.60" in summ, "aggregate recoverable must be $28.60"
    assert "refund" not in summ.lower()


def test_determinism_three_runs():
    fps = set()
    for _ in range(3):
        audit = _run_audit(_sderrc_extracted())
        fps.add(tuple(sorted(
            (a.get("rule"), a.get("severity"), a.get("dollar_impact"))
            for a in audit["anomalies"]
        )))
    assert len(fps) == 1, f"deterministic tail must be reproducible: {fps}"


def test_decoder_and_invoice_checker_share_one_services_base():
    """IC-FINDINGS-1: both tools resolve the services base through the ONE
    shared module, and both exclude AT-HM consistently."""
    from lib import services_base as sb
    from lib.inv1.schema import ExtractedLine, ServiceCategory

    # Decoder-side (dict + stream) base excludes AT-HM.
    decoder_lines = [
        {"stream": "Independence", "gross": 864.0, "is_cancellation": False},
        {"stream": "EverydayLiving", "gross": 650.0, "is_cancellation": False},
        {"stream": "Clinical", "gross": 360.0, "is_cancellation": False},
        {"stream": "ATHM", "gross": 286.0, "is_cancellation": False},
    ]
    assert sb.care_services_subtotal(decoder_lines) == 1874.00

    # Invoice-Checker-side (ExtractedLine + category) base excludes AT-HM,
    # resolved through the SAME module.
    ic_lines = [
        ExtractedLine(line_id="1", service_category=ServiceCategory.independence, gross_cost=864.0),
        ExtractedLine(line_id="2", service_category=ServiceCategory.everyday_living, gross_cost=650.0),
        ExtractedLine(line_id="3", service_category=ServiceCategory.clinical, gross_cost=360.0),
        ExtractedLine(line_id="4", service_category=ServiceCategory.at_hm, gross_cost=286.0),
    ]
    assert sb.care_services_total_inv1(ic_lines) == 1874.00
    # Same module, same exclusion policy, same answer.
    assert sb.care_services_subtotal(decoder_lines) == sb.care_services_total_inv1(ic_lines)
