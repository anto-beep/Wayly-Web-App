"""INV-1 v1.2 · WS1 · Combined-document splitter (spec §6, phase-0 audit §2).

Given the extracted text of a document already classified as
``combined``, return two logical sections:

- ``information_section``, the statement / summary content, routed to
  Statement Decoder for the DEC-1 pipeline.
- ``payable_section``    , the invoice / amount-due content, routed to
  the INV-1 checks engine.

The splitter is deterministic, keyword-and-anchor based. No LLM. If
confidence is low, the caller (routes/invoices.py) falls back to
``DocumentShape.combined_unsplit`` and treats the whole document as
the payable section with an editorial note (spec §12 fallback copy).

Heuristics used, in order:

1. **Anchor split.** Find "amount payable", "total payable", "amount
   due", "tax invoice" and split the document at the first strong
   payable anchor. Everything above becomes ``information_section``,
   everything from the anchor down becomes ``payable_section``.
2. **Page-level fallback.** When the input arrives with an explicit
   ``pages`` list (from pdfplumber-style extraction), classify each page
   as info-heavy or invoice-heavy using the same keyword banks as the
   classifier, then split on the first invoice-heavy page.

Tests: ``backend/tests/inv1/test_splitter.py``.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional, Sequence


# Anchors that mark the start of the payable section, in priority order.
_PAYABLE_ANCHORS = (
    r"\btotal amount payable\b",
    r"\btotal payable\b",
    r"\btotal amount due\b",
    r"\bamount payable\b",
    r"\bamount due\b",
    r"\btax invoice\b",
    r"\binvoice number\b",
    r"\bplease pay\b",
)

# Weak-info keywords (used for page-level scoring only)
_INFO_KEYWORDS = (
    r"\bmonthly statement\b",
    r"\bcare statement\b",
    r"\bfor your information\b",
    r"\bthis is not a bill\b",
    r"\bgovernment paid\b",
)


def _find_anchor(text: str) -> Optional[int]:
    """Return the character index of the first payable anchor, or None."""
    earliest: Optional[int] = None
    for pattern in _PAYABLE_ANCHORS:
        m = re.search(pattern, text, flags=re.IGNORECASE)
        if m is None:
            continue
        if earliest is None or m.start() < earliest:
            earliest = m.start()
    return earliest


def _score_page(text: str) -> int:
    """Return payable minus info hits for a single page's text."""
    payable = sum(
        1 for p in _PAYABLE_ANCHORS
        if re.search(p, text, flags=re.IGNORECASE)
    )
    info = sum(
        1 for p in _INFO_KEYWORDS
        if re.search(p, text, flags=re.IGNORECASE)
    )
    return payable - info


@dataclass(frozen=True)
class SplitResult:
    """Two logical sections of a combined document.

    Both sections may be empty strings if the split was not clean. The
    caller decides how to react: a `succeeded=False` result means fall
    back to ``combined_unsplit`` and treat the whole document as
    payable.
    """

    succeeded: bool
    information_section: str
    payable_section: str
    split_method: str                  # "anchor" | "page" | "none"
    confidence: float                  # 0.0 to 1.0


def split_combined_document(
    text: str,
    pages: Optional[Sequence[str]] = None,
) -> SplitResult:
    """Split a combined statement-and-invoice into its two logical parts.

    :param text: full extracted text of the document.
    :param pages: optional list of per-page text (from pdfplumber). When
        provided the splitter also tries a page-level split as fallback.
    """
    if not text or not text.strip():
        return SplitResult(
            succeeded=False,
            information_section="",
            payable_section="",
            split_method="none",
            confidence=0.0,
        )

    # 1. Anchor split
    idx = _find_anchor(text)
    if idx is not None and idx > 40:
        # Ensure we don't strip a useful invoice header, leave the anchor
        # itself in the payable section
        info = text[:idx].strip()
        payable = text[idx:].strip()
        # Confidence goes up if the info section still has statement-y
        # signals (otherwise it might just be an invoice preamble).
        info_score = sum(
            1 for p in _INFO_KEYWORDS
            if re.search(p, info, flags=re.IGNORECASE)
        )
        conf = 0.55 + 0.1 * min(info_score, 4)
        return SplitResult(
            succeeded=True,
            information_section=info,
            payable_section=payable,
            split_method="anchor",
            confidence=min(1.0, conf),
        )

    # 2. Page-level fallback
    if pages and len(pages) >= 2:
        page_scores = [_score_page(p or "") for p in pages]
        # The first page with score > 0 (payable dominates) is the split
        split_at: Optional[int] = None
        for i, s in enumerate(page_scores):
            if s > 0:
                split_at = i
                break
        if split_at is not None and split_at > 0:
            info = "\n\n".join(pages[:split_at]).strip()
            payable = "\n\n".join(pages[split_at:]).strip()
            return SplitResult(
                succeeded=True,
                information_section=info,
                payable_section=payable,
                split_method="page",
                confidence=0.6,
            )

    # No clean split, caller should fall back to combined_unsplit
    return SplitResult(
        succeeded=False,
        information_section="",
        payable_section=text,
        split_method="none",
        confidence=0.2,
    )
