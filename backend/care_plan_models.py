"""CPR-1 Care Plan data models (Pydantic + Mongo document shapes).

Three collections are modelled:

  * `care_plans`, the plan record itself (metadata, provenance, status).
  * `care_plan_findings`, findings from an analysis run. Separated from the
    plan so a re-review under a newer reference snapshot keeps prior findings.
  * `care_plan_review_runs`, one row per analysis run, recording the model,
    prompt version, and reference snapshot the run executed against.

All models use `PyObjectId` for the underlying `_id` and expose the
`str`-ified value as `id`. All datetimes are UTC-aware ISO strings on the
wire.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, ConfigDict


# ---------------------------------------------------------------------------
# Enumerations (kept as string Literals so Pydantic validates them cleanly)
# ---------------------------------------------------------------------------

Status = Literal["uploaded", "active", "superseded", "archived", "deleted"]
FindingCategory = Literal[
    "rights", "clinical", "service_mix", "budget", "cohort", "timebound", "choice",
]
FindingSeverity = Literal["compliance", "efficiency", "choice", "info"]
FindingConfidence = Literal["high", "medium", "low"]
ReviewRunStatus = Literal["running", "complete", "failed"]


# ---------------------------------------------------------------------------
# Care Plan document
# ---------------------------------------------------------------------------

class CarePlan(BaseModel):
    """The plan record itself. One row per uploaded care-plan document.

    Every ID field uses UUID strings for consistency with the rest of the
    Wayly Mongo schema (participants, statements, households).
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    participant_id: str
    uploaded_by_user_id: str
    uploaded_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    # Plan metadata (extracted from the document)
    effective_from: Optional[str] = None          # ISO YYYY-MM-DD
    effective_to: Optional[str] = None
    provider_name: Optional[str] = None
    classification_at_review: Optional[int] = Field(default=None, ge=1, le=8)
    quarterly_budget_at_review: Optional[float] = Field(default=None, ge=0)

    # Provenance
    original_file_id: Optional[str] = None        # GridFS `_id` (as str)
    extracted_text_id: Optional[str] = None       # linked care_plan_extracted_texts._id
    structured_extraction_id: Optional[str] = None
    redaction_applied: bool = False

    # Lifecycle
    status: Status = "uploaded"
    superseded_by_id: Optional[str] = None
    soft_deleted_at: Optional[str] = None
    hard_delete_at: Optional[str] = None

    notes: Optional[str] = None

    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    model_config = ConfigDict(extra="ignore")


# ---------------------------------------------------------------------------
# Finding
# ---------------------------------------------------------------------------

class CarePlanFinding(BaseModel):
    """One row per finding produced by an analysis run.

    Kept as a separate document so re-review does not overwrite prior
    findings. The `review_run_id` links back to the specific
    `care_plan_review_runs._id` that produced this finding.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    care_plan_id: str
    review_run_id: str

    category: FindingCategory
    severity: FindingSeverity
    finding_key: str                  # stable identifier for de-dup across runs
    title: str
    detail: str

    citation_source: str              # e.g. "Statement of Rights, Right 4"
    citation_url: str                 # deep link to Wayly help centre
    confidence: FindingConfidence
    suggested_question: str

    related_tool_slug: Optional[str] = None   # e.g. "reassessment-letter-generator"

    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    model_config = ConfigDict(extra="ignore")


# ---------------------------------------------------------------------------
# Review Run
# ---------------------------------------------------------------------------

class CarePlanReviewRun(BaseModel):
    """One row per analysis run.

    `reference_snapshot_id` captures the version of the reference registry
    (Statement of Rights, Quality Standards, Aged Care Rules) the run was
    executed against, so historical findings remain reproducible after
    legislation updates.
    """

    id: str = Field(default_factory=lambda: str(uuid4()))
    care_plan_id: str
    triggered_by_user_id: str
    triggered_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    model_used: str                   # e.g. "claude-sonnet-4-5-20250929"
    prompt_version: str               # e.g. "cpr-1.v1"
    reference_snapshot_id: str        # UUID; see reference_snapshots collection

    status: ReviewRunStatus = "running"
    failure_reason: Optional[str] = None

    completed_at: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


# ---------------------------------------------------------------------------
# Structured extraction (what the ingest pipeline distils from the file)
# ---------------------------------------------------------------------------

class ExtractedService(BaseModel):
    """One extracted service line from a care plan document."""

    stream: Literal["Clinical", "Independence", "EverydayLiving", "Unknown"] = "Unknown"
    description: str
    hours_per_week: Optional[float] = Field(default=None, ge=0)
    frequency_text: Optional[str] = None      # verbatim, e.g. "1 hr / fortnight"
    unit_rate: Optional[float] = Field(default=None, ge=0)
    provider: Optional[str] = None

    model_config = ConfigDict(extra="ignore")


class StructuredExtraction(BaseModel):
    """The structured shape rendered on the Preview-what-was-read screen
    (Section B.3)."""

    id: str = Field(default_factory=lambda: str(uuid4()))
    care_plan_id: str

    # Plan header
    participant_first_name: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    classification: Optional[int] = Field(default=None, ge=1, le=8)
    provider_name: Optional[str] = None
    quarterly_budget: Optional[float] = Field(default=None, ge=0)

    # Services identified
    services: List[ExtractedService] = Field(default_factory=list)

    # Narrative content (used by the analysis engine to detect conditions,
    # goals, isolation etc.)
    narrative_text: str = ""

    # Sections the parser could not read (page numbers or block labels)
    unread_sections: List[str] = Field(default_factory=list)

    # Meta
    extraction_engine: str = ""       # e.g. "pdf-text-layer", "ocr:tesseract"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    model_config = ConfigDict(extra="ignore")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def utcnow_iso() -> str:
    """UTC-aware ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def compute_hard_delete_at(soft_deleted_iso: str, days: int = 30) -> str:
    """Given a soft-delete timestamp, return the hard-delete-at timestamp."""
    dt = datetime.fromisoformat(soft_deleted_iso)
    from datetime import timedelta
    return (dt + timedelta(days=days)).isoformat()
