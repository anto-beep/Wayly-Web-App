"""Pydantic models for Wayly Batch 2 — Extended Features build.

Feature set covered:
 1. Multi-participant household
 2. Hospital Liaison Mode
 4. Family Photo + Message Wall (voice notes via base64)
 5. Care Plan Amendment Generator
 6. Adviser Branded PDF Output
 7. Adviser Scenario Modeller
 8. Adviser Multi-household Alert Dashboard (no new model — query only)
 9. SMS / external-contact opt-in (Twilio scaffold behind feature flag)
"""
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timezone
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


MAX_PARTICIPANTS_PER_HOUSEHOLD = 4


# ---------- Participants ----------
class ParticipantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    classification: int = Field(ge=1, le=8)
    provider_name: str = Field(min_length=1, max_length=200)
    is_grandfathered: bool = False
    relationship: Optional[str] = Field(default="parent", max_length=60)
    dob: Optional[str] = None  # YYYY-MM-DD


class ParticipantUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    classification: Optional[int] = Field(default=None, ge=1, le=8)
    provider_name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    is_grandfathered: Optional[bool] = None
    relationship: Optional[str] = Field(default=None, max_length=60)
    dob: Optional[str] = None


class Participant(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    household_id: str
    name: str
    classification: int
    provider_name: str
    is_grandfathered: bool = False
    relationship: str = "parent"
    dob: Optional[str] = None
    is_primary: bool = False
    is_archived: bool = False
    created_at: str = Field(default_factory=_now_iso)


# ---------- Hospital Liaison ----------
class HospitalAdmissionCreate(BaseModel):
    participant_id: str
    admission_date: str  # YYYY-MM-DD
    hospital_name: str = Field(min_length=1, max_length=200)
    ward: Optional[str] = Field(default=None, max_length=120)
    expected_discharge: Optional[str] = None
    reason: Optional[str] = Field(default=None, max_length=500)
    pause_services: bool = True
    request_rcp: bool = False
    notes: Optional[str] = Field(default=None, max_length=2000)


class HospitalDischargeBody(BaseModel):
    discharge_date: str  # YYYY-MM-DD
    discharge_notes: Optional[str] = Field(default=None, max_length=2000)


class HospitalAdmission(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    household_id: str
    participant_id: str
    admission_date: str
    discharge_date: Optional[str] = None
    expected_discharge: Optional[str] = None
    hospital_name: str
    ward: Optional[str] = None
    reason: Optional[str] = None
    services_paused: bool = True
    rcp_requested: bool = False
    rcp_requested_at: Optional[str] = None
    status: Literal["active", "discharged"] = "active"
    notes: Optional[str] = None
    discharge_notes: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)
    created_by: str  # user_id


# ---------- Family Photo + Message Wall ----------
class WallPostCreate(BaseModel):
    participant_id: str
    kind: Literal["message", "photo", "voice"] = "message"
    body: Optional[str] = Field(default=None, max_length=2000)
    image_b64: Optional[str] = None  # base64 of image (photo or voice waveform image)
    image_mime: Optional[str] = Field(default=None, max_length=80)
    audio_b64: Optional[str] = None  # base64 of voice note
    audio_mime: Optional[str] = Field(default=None, max_length=80)


class WallReact(BaseModel):
    emoji: str = Field(min_length=1, max_length=8)


class WallPost(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    household_id: str
    participant_id: str
    kind: Literal["message", "photo", "voice"]
    body: Optional[str] = None
    image_b64: Optional[str] = None
    image_mime: Optional[str] = None
    audio_b64: Optional[str] = None
    audio_mime: Optional[str] = None
    author_id: str
    author_name: str
    reactions: Dict[str, int] = Field(default_factory=dict)
    reacted_by: Dict[str, List[str]] = Field(default_factory=dict)  # user_id -> [emojis]
    created_at: str = Field(default_factory=_now_iso)


# ---------- SMS / External contacts ----------
class ExternalContactUpdate(BaseModel):
    phone_e164: Optional[str] = Field(default=None, max_length=20)
    sms_opt_in: Optional[bool] = None
    whatsapp_opt_in: Optional[bool] = None


class ExternalContact(BaseModel):
    model_config = ConfigDict(extra="ignore")
    user_id: str
    phone_e164: Optional[str] = None
    sms_opt_in: bool = False
    whatsapp_opt_in: bool = False
    sms_verified: bool = False
    updated_at: str = Field(default_factory=_now_iso)


# ---------- Care Plan Amendment ----------
class AmendmentRequestItem(BaseModel):
    service_name: str = Field(min_length=1, max_length=200)
    change_type: Literal["add", "increase", "decrease", "remove", "swap"]
    reason: str = Field(min_length=1, max_length=600)


class AmendmentCreate(BaseModel):
    participant_id: str
    items: List[AmendmentRequestItem] = Field(min_length=1, max_length=10)
    sender_name: str = Field(min_length=1, max_length=120)
    sender_role: Optional[str] = Field(default="primary caregiver", max_length=80)
    provider_name: Optional[str] = Field(default=None, max_length=200)


class CarePlanAmendment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    household_id: str
    participant_id: str
    items: List[AmendmentRequestItem]
    sender_name: str
    sender_role: str = "primary caregiver"
    provider_name: Optional[str] = None
    generated_letter: str
    status: Literal["draft", "sent", "accepted", "rejected"] = "draft"
    created_at: str = Field(default_factory=_now_iso)
    created_by: str


# ---------- Adviser Brand Profile ----------
class AdviserBrandUpdate(BaseModel):
    firm_name: Optional[str] = Field(default=None, max_length=200)
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = Field(default=None, max_length=40)
    primary_color: Optional[str] = Field(default=None, max_length=9)  # hex
    secondary_color: Optional[str] = Field(default=None, max_length=9)
    accent_color: Optional[str] = Field(default=None, max_length=9)
    logo_b64: Optional[str] = None
    logo_mime: Optional[str] = Field(default=None, max_length=80)
    tagline: Optional[str] = Field(default=None, max_length=200)
    footer_text: Optional[str] = Field(default=None, max_length=500)


# ---------- Adviser Scenario Modeller ----------
class ScenarioInputs(BaseModel):
    assets: float = Field(ge=0)
    annual_income: float = Field(ge=0)
    partner_status: Literal["single", "couple"] = "single"
    homeowner: bool = True
    classification: int = Field(ge=1, le=8)
    pensioner: bool = False


class ScenarioOutputs(BaseModel):
    contribution_per_day: float
    contribution_per_quarter: float
    contribution_per_year: float
    government_subsidy_per_year: float
    lifetime_cap_years: float
    means_test_band: str
    assumptions: Dict[str, Any]


class ScenarioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    client_id: Optional[str] = None  # optional adviser-roster client link
    inputs: ScenarioInputs


class AdviserScenario(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    adviser_id: str
    client_id: Optional[str] = None
    name: str
    inputs: ScenarioInputs
    outputs: ScenarioOutputs
    created_at: str = Field(default_factory=_now_iso)
