"""INV-1 v1.2 · Data model (spec §10).

Every field required by the reconciliation payload contract in the
handoff document is modelled here as a dataclass. All monetary amounts
stay as floats (matching the CE-2, DEC-1 and PPC conventions elsewhere
in the codebase) and every constant used by a finding is sourced from
INDEX-1 at check time.

Nothing in this module resolves values against INDEX-1 or calls the LLM.
It is a pure data contract shared by the classifier, the splitter, the
extractor (WS2) and the checks engine (WS4).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional


INV1_SCHEMA_VERSION = "inv1.v1.2"


# ---------------------------------------------------------------------------
# Enumerations (spec §10)
# ---------------------------------------------------------------------------

class DocumentShape(str, Enum):
    """The four shapes INV-1 accepts (spec §6). ``combined_unsplit`` is the
    fallback when the splitter cannot separate a combined document with
    high confidence."""

    invoice = "invoice"
    invoice_plus_statement = "invoice_plus_statement"
    combined = "combined"
    combined_unsplit = "combined_unsplit"
    statement = "statement"
    remittance = "remittance"
    receipt = "receipt"


class InputState(str, Enum):
    """A, B, C per spec §3 decision 2."""

    A_invoice_only = "A"                       # invoice only
    B_invoice_plus_statement = "B"              # invoice plus statement
    C_invoice_plus_statement_plus_ce2 = "C"     # invoice plus statement plus CE-2


class OverallVerdict(str, Enum):
    """Verdict shown at the top of the results screen (spec §12)."""

    all_clear = "all_clear"
    items_to_note = "items_to_note"
    questions_to_raise = "questions_to_raise"
    check_before_paying = "check_before_paying"


class Tier(int, Enum):
    """The four-tier UXF-1 consequence ladder (spec §8, §12)."""

    T1_informational = 1
    T2_worth_noting = 2
    T3_worth_a_question = 3
    T4_check_before_paying = 4


class Confidence(str, Enum):
    """Per-finding confidence (spec §8, catalogue column)."""

    high = "high"
    medium = "medium"
    low = "low"


class ExpectedSource(str, Enum):
    """Where the expected value on a finding came from (spec §10)."""

    ce2_estimate = "ce2_estimate"
    statement = "statement"
    published_price = "published_price"
    program_rule = "program_rule"
    situation_profile = "situation_profile"


class CheckId(str, Enum):
    """C1..C12 (C6 deferred, spec §3 decision 5)."""

    C1_clinical_nil = "C1"
    C2_personal_care_after_oct_2026 = "C2"
    C3_rate_asymmetric = "C3"
    C4_care_mgmt_and_prohibited_fees = "C4"
    C5_charged_after_delivery = "C5"
    C6_line_arithmetic = "C6"
    C7_invoice_statement_reconciliation = "C7"
    C8_gst_service_type = "C8"
    C9_adjustments_refunds = "C9"
    C10_lifetime_cap_indicative = "C10"
    C11_duplicate_billing = "C11"
    C12_price_vs_published = "C12"


class ServiceCategory(str, Enum):
    """Line-item categories (spec §10, extracted line)."""

    care = "care"
    clinical = "clinical"
    personal_care = "personal_care"
    independence = "independence"
    everyday_living = "everyday_living"
    care_management = "care_management"
    at_hm = "at_hm"                    # assistive tech + home mods
    consumable = "consumable"
    transport = "transport"
    cancellation_fee = "cancellation_fee"
    exit_fee = "exit_fee"
    admin_fee = "admin_fee"
    unknown = "unknown"


class PensionStatus(str, Enum):
    """Situation-profile pension status (spec §7, participant_profile.py:42)."""

    full_pensioner = "full_pensioner"
    part_pensioner = "part_pensioner"
    cshc = "cshc"
    self_funded_no_cshc = "self_funded_no_cshc"
    unknown = "unknown"


class YesNoUnknown(str, Enum):
    """Ternary flags used in the situation profile."""

    yes = "yes"
    no = "no"
    unknown = "unknown"


# ---------------------------------------------------------------------------
# Data model (spec §10)
# ---------------------------------------------------------------------------

@dataclass
class ExtractedLine:
    """One line-item extracted from an invoice (spec §10). Every value is
    computed-from-source under the WS2 discipline. Never infer an absent
    value; leave it ``None`` and set ``read_confidence`` below 0.5 so the
    "could not read" line state fires."""

    line_id: str
    service_category: ServiceCategory = ServiceCategory.unknown
    service_type: str = ""
    service_date: Optional[str] = None                # ISO date
    units_or_hours: Optional[float] = None
    unit_price: Optional[float] = None
    gross_cost: Optional[float] = None
    contribution_rate: Optional[float] = None         # 0.0 to 100.0, per cent
    contribution_amount: Optional[float] = None
    gst_amount: Optional[float] = None                # None if absent, never inferred
    read_confidence: float = 1.0                      # 0.0 to 1.0
    raw_text: str = ""                                # verbatim source snippet

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["service_category"] = self.service_category.value
        return d


@dataclass
class SituationProfile:
    """Situation profile inputs (spec §7)."""

    pension_status: PensionStatus = PensionStatus.unknown
    grandfathered: YesNoUnknown = YesNoUnknown.unknown
    hardship: YesNoUnknown = YesNoUnknown.unknown
    assessment_pending: YesNoUnknown = YesNoUnknown.unknown
    assessment_letter_date: Optional[str] = None      # ISO date, may be null

    def to_dict(self) -> Dict[str, Any]:
        return {
            "pension_status": self.pension_status.value,
            "grandfathered": self.grandfathered.value,
            "hardship": self.hardship.value,
            "assessment_pending": self.assessment_pending.value,
            "assessment_letter_date": self.assessment_letter_date,
        }


@dataclass
class Finding:
    """One check output (spec §10). The ``suggested_question`` is the
    exact string shown to the user; the ``escalation`` is populated only
    when the tier warrants the ACQSC follow-up."""

    check_id: CheckId
    tier: Tier
    line_ids: List[str] = field(default_factory=list)
    observed: Optional[Any] = None                    # value on the invoice
    expected: Optional[Any] = None                    # expected value
    expected_source: ExpectedSource = ExpectedSource.program_rule
    confidence: Confidence = Confidence.high
    suggested_question: str = ""
    escalation: Optional[str] = None                  # "acqsc" or None
    rule_effective_from: Optional[str] = None         # ISO date, from INDEX-1
    narrative: str = ""                               # persona-agnostic "what we saw"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "check_id": self.check_id.value,
            "tier": self.tier.value,
            "line_ids": self.line_ids,
            "observed": self.observed,
            "expected": self.expected,
            "expected_source": self.expected_source.value,
            "confidence": self.confidence.value,
            "suggested_question": self.suggested_question,
            "escalation": self.escalation,
            "rule_effective_from": self.rule_effective_from,
            "narrative": self.narrative,
        }


@dataclass
class ReconciliationPayload:
    """The versioned reconciliation payload emitted by INV-1 (spec §10),
    consumed by the results screen (WS8) and LF-1 (WS13)."""

    schema_version: str = INV1_SCHEMA_VERSION
    document_shape: DocumentShape = DocumentShape.invoice
    input_state: InputState = InputState.A_invoice_only
    overall_verdict: OverallVerdict = OverallVerdict.all_clear
    findings: List[Finding] = field(default_factory=list)
    clean_reconciliation: List[Dict[str, Any]] = field(default_factory=list)
    lines: List[ExtractedLine] = field(default_factory=list)
    situation: SituationProfile = field(default_factory=SituationProfile)
    generated_at: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    # Version pins on the upstream contracts we consumed (spec §5, WS6)
    ce2_schema_version: Optional[str] = None
    statement_schema_version: Optional[str] = None
    ppc_snapshot_id: Optional[str] = None
    # Total amount billed on the invoice (sum of line gross_cost). Surfaced by
    # the results banner ("Amount billed") on web + mobile.
    invoice_total: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "document_shape": self.document_shape.value,
            "input_state": self.input_state.value,
            "overall_verdict": self.overall_verdict.value,
            "findings": [f.to_dict() for f in self.findings],
            "clean_reconciliation": self.clean_reconciliation,
            "lines": [ln.to_dict() for ln in self.lines],
            "situation": self.situation.to_dict(),
            "generated_at": self.generated_at,
            "ce2_schema_version": self.ce2_schema_version,
            "statement_schema_version": self.statement_schema_version,
            "ppc_snapshot_id": self.ppc_snapshot_id,
            "invoice_total": self.invoice_total,
        }


# ---------------------------------------------------------------------------
# Verdict derivation
# ---------------------------------------------------------------------------

def derive_verdict(findings: List[Finding]) -> OverallVerdict:
    """Map the highest-tier finding to the overall verdict (spec §12).

    - Any Tier 4 → "check before paying"
    - Any Tier 3 (no Tier 4) → "questions to raise"
    - Any Tier 2 (no Tier 3+) → "items to note"
    - Otherwise → "all clear"
    """
    max_tier = 0
    for f in findings:
        if f.tier.value > max_tier:
            max_tier = f.tier.value
    if max_tier >= Tier.T4_check_before_paying.value:
        return OverallVerdict.check_before_paying
    if max_tier >= Tier.T3_worth_a_question.value:
        return OverallVerdict.questions_to_raise
    if max_tier >= Tier.T2_worth_noting.value:
        return OverallVerdict.items_to_note
    return OverallVerdict.all_clear
