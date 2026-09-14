"""INV-1 WS1 · Classifier tests (spec §6)."""
from __future__ import annotations

import sys
from pathlib import Path

# Allow running under both ``pytest`` from repo root and from backend/
_HERE = Path(__file__).resolve()
_BACKEND = _HERE.parents[2]
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from lib.inv1 import DocumentShape, classify_document  # noqa: E402


def test_invoice_is_recognised():
    """A separate invoice with clear payable signals classifies as ``invoice``."""
    text = """
    Tax Invoice
    Meridian Home Care Pty Ltd
    ABN 12 345 678 901

    Invoice number: MHC-2026-08-4321
    Due date: 30/09/2026

    Personal care  4 hrs @ $65.00     $260.00
    Domestic assistance  2 hrs        $130.00

    Total amount payable:             $390.00
    Please pay by direct debit.
    """
    result = classify_document(text)
    assert result.shape == DocumentShape.invoice
    assert result.confidence >= 0.6
    assert not result.low_confidence


def test_statement_is_recognised():
    """A monthly statement with informational-only signals classifies as ``statement``."""
    text = """
    Monthly Statement - Support at Home
    This is not a bill.
    For your information only.

    Government paid: $2,340.00
    Participant contribution: $180.00

    Statement of care activities delivered during August 2026.
    """
    result = classify_document(text)
    assert result.shape == DocumentShape.statement
    assert result.confidence >= 0.6


def test_combined_document_is_recognised():
    """A document with strong signals from BOTH banks classifies as ``combined``."""
    text = """
    Monthly Statement and Tax Invoice
    Support at Home statement for August 2026.
    This is not a bill for the information section.

    Government paid: $2,340.00
    Statement of care activities.

    -----

    Tax invoice
    Invoice number: MHC-2026-08-4321
    Amount payable: $180.00
    Due date: 30/09/2026
    """
    result = classify_document(text)
    assert result.shape == DocumentShape.combined
    assert result.confidence >= 0.5


def test_remittance_is_recognised():
    """A remittance advice classifies as ``remittance``, not ``invoice``."""
    text = """
    Remittance Advice
    Payment advice for the direct debit that has been processed on 05/09/2026.
    Transaction reference: DD-2026-0905-88221.
    Amount: $180.00
    """
    result = classify_document(text)
    assert result.shape == DocumentShape.remittance


def test_receipt_is_recognised():
    """A paid receipt classifies as ``receipt``."""
    text = """
    Receipt No. RCP-4432
    Paid in full.
    Thank you for your payment.
    Paid on 05/09/2026.
    """
    result = classify_document(text)
    assert result.shape == DocumentShape.receipt


def test_empty_input_is_low_confidence():
    result = classify_document("")
    assert result.confidence == 0.0
    assert result.low_confidence


def test_ambiguous_input_is_low_confidence():
    """Weak signals in both banks should not be classified with high confidence."""
    result = classify_document("Hello world. Some care was provided.")
    assert result.low_confidence
