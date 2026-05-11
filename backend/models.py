"""Pydantic models for Wayly."""
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Literal
from datetime import datetime, timezone
import uuid


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def new_id() -> str:
    return str(uuid.uuid4())


# ---------- Auth ----------
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str
    role: Literal["caregiver", "participant"] = "caregiver"
    plan: Literal["free", "solo", "family"] = "free"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    token: str
    user: "UserPublic"


class UserPublic(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: EmailStr
    name: str
    role: Literal["caregiver", "participant"]
    plan: Literal["free", "solo", "family"] = "free"
    household_id: Optional[str] = None
    created_at: str
    is_admin: bool = False
    admin_role: Optional[Literal["super_admin", "operations_admin", "support_admin", "content_admin"]] = None
    # Subscription summary (optional — populated only on /auth/me, /auth/login,
    # /auth/signup, /auth/google-session responses).
    subscription_status: Optional[str] = None  # "trialing" | "active" | "cancelled" | None
    trial_ends_at: Optional[str] = None        # ISO datetime when trial expires (if trialing)
    cancel_at_period_end: Optional[bool] = None


class PlanUpdate(BaseModel):
    plan: Literal["free", "solo", "family"]


# ---------- Household & Participant ----------
class HouseholdCreate(BaseModel):
    participant_name: str
    classification: int = Field(ge=1, le=8)
    provider_name: str
    is_grandfathered: bool = False
    relationship: Optional[str] = "parent"


class Household(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    owner_id: str
    participant_name: str
    classification: int
    provider_name: str
    is_grandfathered: bool = False
    relationship: str = "parent"
    created_at: str = Field(default_factory=now_iso)


# ---------- Statements ----------
class StatementLineItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    date: str  # YYYY-MM-DD
    service_code: Optional[str] = None
    service_name: str
    stream: Literal["Clinical", "Independence", "Everyday Living"]
    units: float = 1.0
    unit_price: float = 0.0
    total: float = 0.0
    contribution_paid: float = 0.0
    government_paid: float = 0.0
    confidence: float = 1.0


class Statement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    household_id: str
    filename: str
    period_label: Optional[str] = None  # e.g. "October 2026"
    uploaded_at: str = Field(default_factory=now_iso)
    line_items: List[StatementLineItem] = Field(default_factory=list)
    summary: Optional[str] = None
    anomalies: List["Anomaly"] = Field(default_factory=list)
    raw_text_preview: Optional[str] = None
    # Original-file storage for re-download. Stored as base64 to avoid binary in JSON.
    file_mimetype: Optional[str] = None
    file_size_bytes: Optional[int] = None
    file_b64: Optional[str] = None  # original bytes, base64-encoded
    has_original_file: bool = False  # surfaced on list/detail endpoints (file_b64 itself is excluded)


class Anomaly(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    severity: Literal["info", "warning", "alert"] = "info"
    title: str
    detail: str
    suggested_action: Optional[str] = None
    line_item_id: Optional[str] = None


# ---------- Family thread / audit ----------
class FamilyMessageCreate(BaseModel):
    body: str
    related_statement_id: Optional[str] = None


class FamilyMessage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    household_id: str
    author_id: str
    author_name: str
    body: str
    related_statement_id: Optional[str] = None
    created_at: str = Field(default_factory=now_iso)


class AuditEvent(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    household_id: str
    actor_id: str
    actor_name: str
    action: str  # e.g. "STATEMENT_UPLOADED", "PROVIDER_CHANGED"
    detail: str
    created_at: str = Field(default_factory=now_iso)


# ---------- Chat ----------
class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None  # one chat session per caregiver/household


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=new_id)
    household_id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: str = Field(default_factory=now_iso)


# ---------- Participant view ----------
class ConcernCreate(BaseModel):
    note: Optional[str] = None


TokenResponse.model_rebuild()
Statement.model_rebuild()
