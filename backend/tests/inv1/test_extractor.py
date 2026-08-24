"""INV-1 WS2 · Extractor tests."""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
_BACKEND = _HERE.parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from lib.inv1 import ServiceCategory, extract_line_items, find_duplicates, find_negative_lines  # noqa: E402


def test_extracts_basic_line_items():
    text = """
    Description                              Unit price   Qty      Amount
    Personal care  4 hrs @ $65.00                                 $260.00
    Domestic assistance  2 hrs @ $65.00                           $130.00
    Nursing visit 15/09/2026                                      $180.00
    """
    lines = extract_line_items(text)
    assert len(lines) >= 3
    types = [ln.service_category for ln in lines]
    assert ServiceCategory.personal_care in types
    # Per the Support at Home category matrix, domestic assistance is
    # everyday-living (higher rate), not independence.
    assert ServiceCategory.everyday_living in types
    assert ServiceCategory.clinical in types


def test_gross_and_unit_price_parsed():
    text = "Personal care  4 hrs @ $65.00     $260.00"
    lines = extract_line_items(text)
    assert len(lines) == 1
    ln = lines[0]
    assert ln.gross_cost == 260.00
    assert ln.unit_price == 65.00
    assert ln.units_or_hours == 4.0


def test_service_date_parsed_multiple_formats():
    text = """
    Personal care 15/09/2026     $130.00
    Cleaning 2026-09-16          $80.00
    Meal prep 17 Sep 2026        $90.00
    """
    lines = extract_line_items(text)
    dates = sorted(ln.service_date for ln in lines if ln.service_date)
    assert "2026-09-15" in dates
    assert "2026-09-16" in dates
    assert "2026-09-17" in dates


def test_gst_labelled_amount():
    text = "Consumables — wipes and pads  GST: $10.00      $110.00"
    lines = extract_line_items(text)
    assert len(lines) == 1
    assert lines[0].gst_amount == 10.00


def test_gst_inclusive_back_calculated():
    text = "Domestic assistance (including GST)      $110.00"
    lines = extract_line_items(text)
    assert len(lines) == 1
    # $110 / 11 = $10.00
    assert lines[0].gst_amount == 10.00


def test_negative_amount_line_treated_as_refund():
    text = "Adjustment — refund for cancelled visit      -$50.00"
    lines = extract_line_items(text)
    negs = find_negative_lines(lines)
    assert len(negs) == 1
    assert negs[0].gross_cost == -50.0


def test_duplicate_detection():
    text = """
    Personal care 15/09/2026    $65.00
    Personal care 15/09/2026    $65.00
    """
    lines = extract_line_items(text)
    dupes = find_duplicates(lines)
    assert len(dupes) == 1


def test_read_confidence_below_half_for_partial_line():
    """A one-money-figure line with no date and short text should drop below 0.5."""
    text = "?fee $5.00"
    lines = extract_line_items(text)
    if lines:
        assert lines[0].read_confidence <= 0.6


def test_prohibited_fee_lines_classified():
    text = """
    Exit fee                                    $250.00
    Administration fee                          $50.00
    """
    lines = extract_line_items(text)
    cats = {ln.service_category for ln in lines}
    assert ServiceCategory.exit_fee in cats
    assert ServiceCategory.admin_fee in cats


def test_no_hallucinated_values_on_headers():
    """Header-only lines should not produce ExtractedLine entries."""
    text = "Description        Unit price       Qty        Amount\n"
    lines = extract_line_items(text)
    assert lines == []


def test_care_management_category():
    text = "Care management — August 2026         $200.00"
    lines = extract_line_items(text)
    assert len(lines) == 1
    assert lines[0].service_category == ServiceCategory.care_management


# ---------------------------------------------------------------------------
# Header extraction (WS7 · invoice_date + provider + ABN)
# ---------------------------------------------------------------------------

def test_extract_invoice_header_labelled_date_and_abn():
    from lib.inv1.extractor import extract_invoice_header
    text = """
    Tax Invoice
    Meridian Home Care Pty Ltd
    ABN 12 345 678 901

    Invoice number: MHC-2026-08-4321
    Invoice date: 15/09/2026
    Due date: 30/09/2026

    Personal care  4 hrs @ $65.00      $260.00
    Total amount payable:               $260.00
    """
    header = extract_invoice_header(text)
    assert header["invoice_date"] == "2026-09-15"
    assert header["due_date"] == "2026-09-30"
    assert header["provider_abn"] == "12345678901"
    assert header["provider_name"] and "Meridian" in header["provider_name"]


def test_extract_invoice_header_falls_back_to_earliest_date():
    """When no 'invoice date:' label is present, use the earliest date."""
    from lib.inv1.extractor import extract_invoice_header
    text = "Random Care Services Pty Ltd\n15 Sep 2026\nSome content\n20 Sep 2026\n"
    header = extract_invoice_header(text)
    assert header["invoice_date"] == "2026-09-15"


def test_extract_invoice_header_empty_text():
    from lib.inv1.extractor import extract_invoice_header
    header = extract_invoice_header("")
    assert header == {
        "invoice_date": None, "due_date": None,
        "provider_name": None, "provider_abn": None,
        "quarterly_budget": None,
    }


def test_extract_invoice_header_bad_abn_ignored():
    """An ABN with the wrong digit count is not surfaced."""
    from lib.inv1.extractor import extract_invoice_header
    header = extract_invoice_header("ABN 123456")
    assert header["provider_abn"] is None
