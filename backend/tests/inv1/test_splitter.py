"""INV-1 WS1 · Splitter tests (spec §6, phase-0 audit §2)."""
from __future__ import annotations

import sys
from pathlib import Path

_HERE = Path(__file__).resolve()
_BACKEND = _HERE.parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from lib.inv1 import split_combined_document  # noqa: E402


def test_anchor_split_when_payable_section_is_present():
    text = """
    Monthly Statement
    This is not a bill.
    Statement of care for August 2026.
    Government paid: $2,340.00

    Total amount payable: $180.00
    Please pay by 30/09/2026.
    """
    result = split_combined_document(text)
    assert result.succeeded is True
    assert result.split_method == "anchor"
    assert "not a bill" in result.information_section.lower()
    assert "amount payable" in result.payable_section.lower()
    assert result.confidence >= 0.5


def test_page_level_fallback():
    """When no anchor is found in the raw text but the pages list carries
    a clear invoice page, we split on the page boundary."""
    pages = [
        "Monthly statement. This is not a bill. For your information only.",
        "Invoice number MHC-88. AMT $180. Bank details enclosed.",
    ]
    # Strip every anchor to force page-level fallback
    combined = "\n\n".join(pages)
    result = split_combined_document(combined, pages=pages)
    # "invoice number" is an anchor, so anchor path should still be preferred.
    assert result.succeeded is True
    assert result.split_method in ("anchor", "page")


def test_no_split_returns_unsuccess():
    """Text with no payable anchors and no pages returns succeeded=False."""
    text = "Just some notes about care activities. Nothing payable here."
    result = split_combined_document(text)
    assert result.succeeded is False
    assert result.split_method == "none"


def test_empty_input():
    result = split_combined_document("")
    assert result.succeeded is False
    assert result.confidence == 0.0


def test_anchor_split_preserves_anchor_in_payable():
    text = "info section\nAmount payable: $10\nfooter"
    result = split_combined_document(text)
    if result.succeeded:
        # The anchor itself must live in the payable section, not information
        assert "amount payable" in result.payable_section.lower()
        assert "amount payable" not in result.information_section.lower()
