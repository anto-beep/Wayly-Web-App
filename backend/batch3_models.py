"""Wayly Batch 3 — Plan restructure, multi-participant billing, free-tier monthly gate.

Mongo-mapped translations from the PostgreSQL spec:
  • TIMESTAMPTZ → ISO 8601 string (we already use this convention everywhere)
  • ENUM        → Literal[...] in Pydantic
  • UUID        → str (uuid4-hex from `_new_id()`)
  • UUID[]      → List[str]
  • INET        → str (we store the IPv4/IPv6 verbatim)
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Literal, Dict, Any
from datetime import datetime, timezone
import uuid


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id() -> str:
    return str(uuid.uuid4())


BasePlan = Literal["FREE", "SOLO", "FAMILY", "ADVISER", "ADVISER_PRO"]
PlanStatus = Literal["ACTIVE", "TRIALLING", "CANCELLED", "PAST_DUE"]

PLAN_PRICES_MONTHLY = {
    "FREE": 0.0,
    "SOLO": 19.0,
    "FAMILY": 39.0,
    "ADVISER": 299.0,
    "ADVISER_PRO": 999.0,
}
ADDON_PRICE_MONTHLY = 19.0
SEAT_LIMITS = {"FREE": 1, "SOLO": 1, "FAMILY": 3, "ADVISER": 9999, "ADVISER_PRO": 9999}
PARTICIPANT_BASE_INCLUDED = {"FREE": 1, "SOLO": 1, "FAMILY": 2, "ADVISER": 25, "ADVISER_PRO": 99999}
MAX_PARTICIPANTS_PER_ACCOUNT = 10  # hard cap on the "extras" picker


# ---------- accounts ----------
class Account(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    owner_user_id: str
    base_plan: BasePlan = "FREE"
    base_plan_status: PlanStatus = "ACTIVE"
    trial_started_at: Optional[str] = None
    trial_ends_at: Optional[str] = None
    billing_anchor_day: Optional[int] = None  # 1-28
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    pending_downgrade_to: Optional[BasePlan] = None
    pending_downgrade_at: Optional[str] = None  # ISO date when downgrade takes effect
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)


# ---------- participant add-ons ----------
AddOnStatus = Literal["ACTIVE", "CANCELLED", "PENDING_CANCELLATION"]


class ParticipantAddOn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    account_id: str
    participant_id: str
    status: AddOnStatus = "ACTIVE"
    stripe_subscription_id: Optional[str] = None
    activated_at: str = Field(default_factory=_now_iso)
    cancels_at: Optional[str] = None
    cancelled_at: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)


# ---------- participants (Batch 3 schema) ----------
ParticipantStatus = Literal["ACTIVE", "PENDING_REMOVAL", "REMOVED"]


class ParticipantV2(BaseModel):
    """Replaces the Batch 2 `Participant`. Adds account_id, first/last name,
    household forwarding email, status + removal/purge timestamps."""
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    account_id: str
    household_id: Optional[str] = None  # legacy bridge
    first_name: str
    last_name: str = ""
    date_of_birth: Optional[str] = None
    classification: Optional[int] = None  # 1-8
    provider_name: Optional[str] = None
    provider_id: Optional[str] = None
    household_email: Optional[str] = None  # e.g. dorothy-7a3f@in.wayly.com.au
    statement_format: Optional[str] = None  # email/portal/paper/unknown
    is_primary: bool = False
    status: ParticipantStatus = "ACTIVE"
    removal_requested_at: Optional[str] = None
    removal_confirmed_at: Optional[str] = None
    data_purge_scheduled_at: Optional[str] = None
    data_purged_at: Optional[str] = None
    notes: Optional[str] = None
    color_index: int = 0  # 0-4 for participant switcher coloured border
    created_at: str = Field(default_factory=_now_iso)
    updated_at: str = Field(default_factory=_now_iso)


# ---------- account members (caregiver seats) ----------
MemberRole = Literal["OWNER", "CAREGIVER", "VIEWER"]
MemberStatus = Literal["PENDING", "ACTIVE", "REMOVED"]


class AccountMember(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    account_id: str
    user_id: str
    role: MemberRole = "CAREGIVER"
    invited_by: Optional[str] = None
    invited_at: Optional[str] = None
    accepted_at: Optional[str] = None
    status: MemberStatus = "ACTIVE"
    participant_access: Optional[List[str]] = None  # null = all
    email: Optional[str] = None  # cached for display
    name: Optional[str] = None
    created_at: str = Field(default_factory=_now_iso)


# ---------- free tool usage ----------
class FreeToolUsage(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=_new_id)
    user_id: Optional[str] = None
    fingerprint: Optional[str] = None
    tool: Literal["STATEMENT_DECODER"] = "STATEMENT_DECODER"
    used_at: str = Field(default_factory=_now_iso)
    period_month: str  # YYYY-MM
    ip_address: Optional[str] = None
    result_id: Optional[str] = None


# ---------- request bodies ----------
class ParticipantCreateV2(BaseModel):
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(default="", max_length=100)
    date_of_birth: Optional[str] = None
    classification: Optional[int] = Field(default=None, ge=1, le=8)
    provider_name: Optional[str] = Field(default=None, max_length=255)
    statement_format: Optional[Literal["email", "portal", "paper", "unknown"]] = "unknown"


class ParticipantRemoveBody(BaseModel):
    downgrade: bool = False  # when removing participant #2 on Family


class HardDeleteBody(BaseModel):
    confirm_full_name: str
