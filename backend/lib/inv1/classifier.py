"""INV-1 v1.2 · WS1 · Document-type classifier (spec §6).

Given an extracted-text blob (from ``document_extract.extract_document``),
return the document shape and a confidence score. This is a deterministic
keyword+regex classifier, no LLM, no network. The classifier is the
first thing that runs after ingestion; downstream routing (statement to
Statement Decoder, invoice to INV-1, combined through the splitter)
depends on its output.

Design invariants:

1. Prefer certainty. A high-confidence classification (>=0.8) is trusted.
   Anything below that is surfaced to the caller as ``low_confidence``
   and the UX can prompt the user.
2. No infer, never fabricate. Absence of an invoice keyword is not
   evidence of a statement; both must be present-and-strong for
   ``combined``.
3. Order matters. A remittance advice or paid receipt looks superficially
   like an invoice, so those are checked first.

Test fixtures live under ``backend/tests/inv1/test_classifier.py``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Tuple

from lib.inv1.schema import DocumentShape


# ---------------------------------------------------------------------------
# Keyword banks (case-insensitive matched)
# ---------------------------------------------------------------------------

# A "statement" phrase strongly indicates the informational monthly
# statement. Note that "statement of account" also lives on some invoices,
# so it is deliberately excluded to avoid false positives.
_STATEMENT_KEYWORDS = (
    r"\bmonthly statement\b",
    r"\bcare statement\b",
    r"\bsupport at home statement\b",
    r"\bstatement of care\b",
    r"\bthis is not a bill\b",
    r"\bfor your information\b",
    r"\bgovernment paid\b",
    r"\bgovernment contribution\b",
)

# An "invoice" phrase strongly indicates a payable document.
_INVOICE_KEYWORDS = (
    r"\btax invoice\b",
    r"\binvoice number\b",
    r"\binvoice no\.?\b",
    r"\bamount due\b",
    r"\bamount payable\b",
    r"\btotal payable\b",
    r"\btotal due\b",
    r"\bdue date\b",
    r"\bpay by\b",
    r"\bplease pay\b",
    r"\babn\b",
)

# A remittance advice tells the recipient a payment has already been sent
# or debited. INV-1 recognises this and labels it, rather than treating
# it as a payable.
_REMITTANCE_KEYWORDS = (
    r"\bremittance advice\b",
    r"\bpayment advice\b",
    r"\bdirect debit\b.*\bhas been\b",
    r"\bpayment received\b",
    r"\btransaction reference\b",
)

# A receipt is a paid record, not payable.
_RECEIPT_KEYWORDS = (
    r"\breceipt number\b",
    r"\breceipt no\.?\b",
    r"\bpaid in full\b",
    r"\bthank you for your payment\b",
    r"\bpaid on\b.*\d{4}",
)


def _count_matches(text: str, patterns: Tuple[str, ...]) -> int:
    hits = 0
    for p in patterns:
        if re.search(p, text, flags=re.IGNORECASE):
            hits += 1
    return hits


@dataclass(frozen=True)
class ClassificationResult:
    """Outcome of the classifier."""

    shape: DocumentShape
    confidence: float                  # 0.0 to 1.0
    signals: dict                      # per-bank hit counts, useful for debugging

    @property
    def low_confidence(self) -> bool:
        """Callers should surface an "is this right?" prompt when true."""
        return self.confidence < 0.6


def classify_document(text: str) -> ClassificationResult:
    """Classify an extracted-text blob into one of the DocumentShape values.

    The extractor is expected to have already produced usable text via
    ``backend.document_extract.extract_document``. Empty input returns a
    zero-confidence ``invoice`` (safest default) with an explicit note.
    """
    if not text or not text.strip():
        return ClassificationResult(
            shape=DocumentShape.invoice,
            confidence=0.0,
            signals={"empty": True},
        )

    receipt_hits = _count_matches(text, _RECEIPT_KEYWORDS)
    remittance_hits = _count_matches(text, _REMITTANCE_KEYWORDS)
    invoice_hits = _count_matches(text, _INVOICE_KEYWORDS)
    statement_hits = _count_matches(text, _STATEMENT_KEYWORDS)

    signals = {
        "receipt_hits": receipt_hits,
        "remittance_hits": remittance_hits,
        "invoice_hits": invoice_hits,
        "statement_hits": statement_hits,
    }

    # Order: receipts and remittances first, they can look like invoices.
    if receipt_hits >= 1 and invoice_hits <= 2:
        return ClassificationResult(
            shape=DocumentShape.receipt,
            confidence=min(1.0, 0.6 + 0.1 * receipt_hits),
            signals=signals,
        )

    if remittance_hits >= 1 and invoice_hits <= 2:
        return ClassificationResult(
            shape=DocumentShape.remittance,
            confidence=min(1.0, 0.6 + 0.1 * remittance_hits),
            signals=signals,
        )

    # Combined = both invoice and statement signals strong within one document.
    if invoice_hits >= 2 and statement_hits >= 2:
        # Weighted average of the two hit rates
        conf = min(1.0, 0.5 + 0.05 * (invoice_hits + statement_hits))
        return ClassificationResult(
            shape=DocumentShape.combined,
            confidence=conf,
            signals=signals,
        )

    if invoice_hits >= 2 or (invoice_hits >= 1 and statement_hits == 0):
        return ClassificationResult(
            shape=DocumentShape.invoice,
            confidence=min(1.0, 0.5 + 0.1 * invoice_hits),
            signals=signals,
        )

    if statement_hits >= 2 or (statement_hits >= 1 and invoice_hits == 0):
        return ClassificationResult(
            shape=DocumentShape.statement,
            confidence=min(1.0, 0.5 + 0.1 * statement_hits),
            signals=signals,
        )

    # Weak signals in both banks, call it an invoice with low confidence
    # (the safer default so the checks still run) and let the caller
    # prompt the user to confirm.
    return ClassificationResult(
        shape=DocumentShape.invoice,
        confidence=0.3,
        signals=signals,
    )
