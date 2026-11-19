"""Regression: SAMBURKE-INV-2 (field-per-line / two-column invoice).

Locks in the fix for the three ship-blocker defects reported against this
fixture:
  * D1 — an impossible potential refund larger than the amount billed
          (frontend summed arbitrary observed.* fields). The refund must now
          be traceable and capped at the amount billed.
  * D2 — the two-column "Invoice to\\nMr Sam Burke" participant name was not
          read, which blocked the result.
  * D3 — the legitimate $411.38 monthly care-management line was false-flagged
          by comparing it against an hourly price-book rate.

From the invoice ALONE (no supporting records) the engine should detect exactly
six issues with zero false positives: personal-care-now-free (C2), a prohibited
admin fee and a separate travel charge (C4), a line-maths error (C6), a
duplicate domestic-assistance line (C11) and an invoice footing gap (C13).
"""
import os

import pytest

from lib.inv1.extractor import extract_line_items, extract_invoice_header, extract_invoice_totals
from lib.inv1.checks import run_checks, refund_total
from lib.inv1.schema import SituationProfile, ServiceCategory

_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "samburke_inv2_text.txt")


@pytest.fixture(scope="module")
def text():
    with open(_FIXTURE, encoding="utf-8") as f:
        return f.read()


@pytest.fixture(scope="module")
def recon(text):
    header = extract_invoice_header(text)
    year = int(header["invoice_date"][:4]) if header.get("invoice_date") else None
    lines = extract_line_items(text, invoice_year=year)
    _, _, total = extract_invoice_totals(text)
    rec = run_checks(
        lines=lines,
        situation=SituationProfile(),
        invoice_date=header.get("invoice_date"),
        period_end=header.get("period_end"),
        quarterly_budget=header.get("quarterly_budget"),
        printed_total_payable=total,
    ).to_dict()
    rec["_lines"] = lines
    rec["_header"] = header
    rec["_printed_total"] = total
    return rec


def test_extracts_all_31_lines(recon):
    assert len(recon["_lines"]) == 31


def test_participant_name_read_from_two_columns(recon):
    # D2: name must be read even though it sits on the line after "Invoice to".
    assert recon["_header"]["participant_name"] == "Mr Sam Burke"


def test_contribution_column_and_total(recon):
    lines = recon["_lines"]
    col = round(sum((ln.contribution_amount or 0.0) for ln in lines), 2)
    assert col == 999.06
    assert recon["_printed_total"] == 1019.06


def test_social_support_streamed_as_independence(recon):
    # Printed category "Independence" must win over the keyword bank so the
    # 12.5% rate is not false-flagged as a rate mismatch (no C3 finding).
    social = [ln for ln in recon["_lines"] if "social support" in (ln.service_type or "").lower()]
    assert social and all(ln.service_category == ServiceCategory.independence for ln in social)
    assert not any(f["check_id"] == "C3" for f in recon["findings"])


def test_care_management_not_flagged(recon):
    # D3: the $411.38 care-management line is legitimate and must not appear in
    # any finding (no C12 vs hourly price-book, no C4 cap breach).
    cm = next(ln for ln in recon["_lines"] if ln.service_category == ServiceCategory.care_management)
    for f in recon["findings"]:
        assert cm.line_id not in (f.get("line_ids") or [])
    assert not any(f["check_id"] == "C12" for f in recon["findings"])


def test_exactly_six_issue_checks_from_invoice_alone(recon):
    codes = sorted(f["check_id"] for f in recon["findings"] if f["check_id"] != "C10")
    assert codes == ["C11", "C13", "C2", "C4", "C4", "C6"]


def test_per_finding_impacts_are_traceable(recon):
    by_code = {}
    for f in recon["findings"]:
        by_code.setdefault(f["check_id"], []).append(f)
    # C2 personal-care reclass rolled up across all 11 lines.
    c2 = by_code["C2"][0]
    assert len(c2["line_ids"]) == 11
    assert c2["financial_impact"]["amount"] == 186.05
    # C4: admin fee $22.00 + travel $60.76.
    c4_amts = sorted(f["financial_impact"]["amount"] for f in by_code["C4"])
    assert c4_amts == [22.0, 60.76]
    # C6 gardening maths: contribution share of the $20 over-statement.
    assert by_code["C6"][0]["financial_impact"]["amount"] == 8.5
    # C11 duplicate domestic assistance: refund ONE copy.
    assert by_code["C11"][0]["financial_impact"]["amount"] == 64.6
    # C13 footing gap.
    assert by_code["C13"][0]["financial_impact"]["amount"] == 20.0


def test_refund_is_traceable_and_capped(recon):
    rt = refund_total(recon["findings"], recon["invoice_total"])
    # Six invoice-detectable issues: 186.05 + 22 + 60.76 + 8.50 + 64.60 + 20.00.
    assert rt == 361.91
    # D1: refund can never exceed the amount billed.
    assert rt <= recon["invoice_total"]


# --- With the supporting records cross-referenced: the full 10 of 10 --------

_SUPPORT_FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "samburke_inv2_supporting_text.txt")


@pytest.fixture(scope="module")
def recon_with_support(text):
    from lib.inv1.supporting import parse_supporting_records
    header = extract_invoice_header(text)
    year = int(header["invoice_date"][:4]) if header.get("invoice_date") else None
    lines = extract_line_items(text, invoice_year=year)
    _, _, total = extract_invoice_totals(text)
    with open(_SUPPORT_FIXTURE, encoding="utf-8") as f:
        supp = parse_supporting_records(f.read())
    rec = run_checks(
        lines=lines,
        situation=SituationProfile(),
        invoice_date=header.get("invoice_date"),
        period_end=header.get("period_end"),
        quarterly_budget=header.get("quarterly_budget"),
        printed_total_payable=total,
        supporting=supp,
    ).to_dict()
    rec["_total"] = total
    rec["_supp"] = supp
    return rec


def test_supporting_records_parse(recon_with_support):
    supp = recon_with_support["_supp"]
    assert supp["agreed_rates"]["meal preparation"]["weekday"] == 74.0
    assert supp["agreed_rates"]["domestic assistance"]["weekday"] == 76.0
    assert "2026-10-05" in supp["public_holidays"]
    assert any(c["service_key"] == "respite" and c["with_notice"] for c in supp["cancellations"])
    assert any(a["start"] == "2026-10-20" for a in supp["absences"])


def test_full_ten_of_ten_refund_is_466_66(recon_with_support):
    rt = refund_total(recon_with_support["findings"], recon_with_support["_total"])
    assert rt == 466.66
    assert round(recon_with_support["_total"] - rt, 2) == 552.40


def test_all_four_supporting_issues_detected(recon_with_support):
    impacts = {}
    for f in recon_with_support["findings"]:
        amt = (f.get("financial_impact") or {}).get("amount") or 0
        impacts.setdefault(f["check_id"], []).append((f.get("title") or "", amt))
    # Meal-prep rate ($17) and Saturday-rate-on-weekday DA ($25.50) as C12.
    c12 = sorted(a for _, a in impacts.get("C12", []))
    assert c12 == [17.0, 25.5]
    # Cancelled respite ($42.75) and hospital social support ($19.50) as C5.
    c5 = sorted(a for _, a in impacts.get("C5", []))
    assert c5 == [19.5, 42.75]


def test_controls_not_flagged_with_support(recon_with_support):
    # Legit Saturday nursing, PH personal-care rate, and $411.38 care management
    # must never be flagged as rate overcharges.
    for f in recon_with_support["findings"]:
        if f["check_id"] == "C12":
            assert f["observed"].get("agreed_rate") is not None
            # Never a clinical/nursing rate flag (nursing is 0% and matches Sat).
            assert "nursing" not in (f.get("title") or "").lower()

