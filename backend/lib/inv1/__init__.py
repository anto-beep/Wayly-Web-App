"""INV-1 v1.2 · Invoice Checker library package.

Public modules:

- ``classifier``, document-type detection (statement / invoice / combined /
  remittance / receipt).
- ``splitter``  , combined-document logical-section splitter.
- ``schema``    , dataclasses for the extracted line item, situation
  profile and reconciliation payload (spec §10).

Nothing in this package makes network calls, hits the LLM, or writes to
Mongo. The checks engine (WS4) will consume these types once the
Phase 0 audit is signed off and the ladder + Phase-1 C3 gate are cleared.
"""

from lib.inv1.classifier import (
    DocumentShape,
    ClassificationResult,
    classify_document,
)
from lib.inv1.splitter import SplitResult, split_combined_document
from lib.inv1.extractor import (
    extract_line_items,
    find_duplicates,
    find_negative_lines,
)
from lib.inv1.checks import run_checks
from lib.inv1.schema import (
    INV1_SCHEMA_VERSION,
    ExtractedLine,
    SituationProfile,
    Finding,
    ReconciliationPayload,
    OverallVerdict,
    Tier,
    Confidence,
    ExpectedSource,
    ServiceCategory,
    CheckId,
    InputState,
    derive_verdict,
)

__all__ = [
    "INV1_SCHEMA_VERSION",
    "DocumentShape",
    "ClassificationResult",
    "classify_document",
    "SplitResult",
    "split_combined_document",
    "extract_line_items",
    "find_duplicates",
    "find_negative_lines",
    "run_checks",
    "ExtractedLine",
    "SituationProfile",
    "Finding",
    "ReconciliationPayload",
    "OverallVerdict",
    "Tier",
    "Confidence",
    "ExpectedSource",
    "ServiceCategory",
    "CheckId",
    "InputState",
    "derive_verdict",
]
