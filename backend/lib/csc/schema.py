"""Pydantic models for CSC-1 v1.

Schema: ``csc.payload.v1`` (§7.1 of the CSC-1 spec). Downstream consumers
(CE-2 v1.2, LF-1 v1.3, Budget Calculator) rely on the fields listed here.
Breaking changes bump the major version.
"""
from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# --- Answer literals ---------------------------------------------------------

DifficultyLevel = Literal["no_difficulty", "slight", "moderate", "significant", "cannot_alone", "not_sure"]
FrequencyLevel = Literal["never", "rarely", "sometimes", "often", "every_day", "not_sure"]
CountLevel = Literal["zero", "one", "two_to_three", "more_than_three", "not_sure"]
AmountLevel = Literal["none", "a_little", "some", "a_lot", "full_time", "not_sure"]

Persona = Literal["caregiver", "participant"]
Confidence = Literal["high", "medium", "low"]


# --- Request ----------------------------------------------------------------

class CSCAnswers(BaseModel):
    """Sixteen answers, keyed by canonical question id. Every value is
    a scale literal or ``"not_sure"``."""
    Q1_self_care_shower: DifficultyLevel
    Q2_self_care_dress: DifficultyLevel
    Q3_self_care_mobility: DifficultyLevel
    Q4_self_care_continence: DifficultyLevel
    Q5_iadl_meals: DifficultyLevel
    Q6_iadl_cleaning_laundry: DifficultyLevel
    Q7_iadl_medication: DifficultyLevel
    Q8_iadl_shopping: DifficultyLevel
    Q9_iadl_transport: DifficultyLevel
    Q10_cognition: DifficultyLevel
    Q11_mood: DifficultyLevel
    Q12_behaviour: FrequencyLevel
    Q13_falls_6mo: CountLevel
    Q14_hospital_12mo: CountLevel
    Q15_home_environment: DifficultyLevel
    Q16_informal_support: AmountLevel


class CSCRunRequest(BaseModel):
    persona: Persona = "caregiver"
    answers: CSCAnswers
    current_classification: Optional[int] = Field(default=None, ge=1, le=8)


# --- Response ---------------------------------------------------------------

class CSCTopDriver(BaseModel):
    question_id: str
    answer: str
    domain: str


class CSCClassification(BaseModel):
    primary: int = Field(ge=1, le=8)
    range_low: int = Field(ge=1, le=8)
    range_high: int = Field(ge=1, le=8)
    confidence: Confidence
    annual_budget_low: int
    annual_budget_high: int
    quarterly_budget_low: int
    quarterly_budget_high: int
    budget_source_version: str


class CSCPayload(BaseModel):
    """Complete ``csc.payload.v1``, emitted to local storage and returned
    verbatim from the endpoint. Field order and names are frozen."""
    schema_version: Literal["csc.payload.v1"] = "csc.payload.v1"
    csc_run_id: str
    run_at: str                       # ISO 8601 timestamp
    persona: Persona
    classification: CSCClassification
    domain_scores: Dict[str, float]
    composite_score: float
    top_drivers: List[CSCTopDriver]
    current_classification: Optional[int]
    gap_detected: bool
    gap_direction: Optional[Literal["up", "down"]]
    unanswered_count: int
    excluded_domains: List[str]
    # Branch metadata (§6.2), front-end uses this to pick the header + CTA.
    branch: Literal["A", "B", "C"]
    profile_summary: str              # from the closest vignette
