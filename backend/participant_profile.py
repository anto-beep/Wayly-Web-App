"""Wayly — Participant Profile (v2) schema + endpoints.

Adds the Tier 1 mandatory / Tier 2 strongly recommended / Tier 3 progressive
disclosure fields to the participant collection, plus a completeness score
and a profile-prompts endpoint that drives inline disclosure prompts inside
the tools.

The collection (`db.participants`) is shared with batch3_routes — this module
only adds new fields and new endpoints. Existing batch3 endpoints continue to
work unchanged because the new fields are all optional at the DB layer and
the strict validation lives in this module's POST endpoint only.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Literal

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("wayly.participant_profile")

participant_profile_router = APIRouter(tags=["participant_profile"])

_db = None
_user_dep = None
_account_for_user = None


def init_participant_profile_routes(*, db, user_dep, account_for_user):
    """Wire up the module from server.py at startup."""
    global _db, _user_dep, _account_for_user
    _db = db
    _user_dep = user_dep
    _account_for_user = account_for_user


# ----------------------------------------------------------------------------
# Schema
# ----------------------------------------------------------------------------
PensionStatus = Literal["full_pension", "part_pension", "cshc", "self_funded", "unsure"]
StatementDelivery = Literal["email", "post", "portal", "other"]
AustralianState = Literal["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"]
GrandfatheredHCP = Literal["yes", "no", "unsure"]
CaregiverRelationship = Literal[
    "daughter", "son", "spouse_partner", "sibling", "grandchild",
    "friend", "paid_carer", "power_of_attorney", "other",
]
EnteralType = Literal["bolus", "non_bolus"]
ActivePathway = Literal["restorative_care", "end_of_life"]
VeteranStatus = Literal["dva_card", "none", "unsure"]

TIER1_FIELDS = (
    "first_name",
    "last_name",
    "dob",
    "classification_level",
    "pension_status",
    "provider_name",
    "statement_delivery",
    "authorisation_confirmed",
)

TIER2_FIELDS = (
    "preferred_name",
    "mac_reference_number",
    "suburb",
    "state",
    "is_grandfathered_hcp",
    "caregiver_relationship",
    "caregiver_phone",
)

TIER3_FIELDS = (
    "care_manager_name",
    "care_manager_phone",
    "care_manager_email",
    "full_address",
    "part_pension_actual_independence_pct",
    "part_pension_actual_everyday_pct",
    "applicable_supplements",  # non-empty list counts as filled
    "enteral_feeding_type",
    "active_pathway",
    "primary_language",
    "veteran_status",
)


class ParticipantCreateBody(BaseModel):
    """Strict Tier 1 + authorisation. Tier 2 + 3 optional on create."""
    model_config = ConfigDict(extra="ignore")
    # Tier 1 — Mandatory
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    dob: str  # ISO date YYYY-MM-DD
    classification_level: int = Field(ge=1, le=8)
    pension_status: PensionStatus
    provider_name: str = Field(min_length=1, max_length=255)
    statement_delivery: StatementDelivery
    authorisation_confirmed: bool

    # Tier 2 — optional on create
    preferred_name: Optional[str] = Field(default=None, max_length=100)
    mac_reference_number: Optional[str] = Field(default=None, max_length=64)
    suburb: Optional[str] = Field(default=None, max_length=120)
    state: Optional[AustralianState] = None
    is_grandfathered_hcp: Optional[GrandfatheredHCP] = None
    hcp_level: Optional[int] = Field(default=None, ge=1, le=4)
    caregiver_relationship: Optional[CaregiverRelationship] = None
    caregiver_phone: Optional[str] = Field(default=None, max_length=32)


class ParticipantPatchBody(BaseModel):
    """Partial update — every field optional."""
    model_config = ConfigDict(extra="ignore")
    # Tier 1
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    dob: Optional[str] = None
    classification_level: Optional[int] = Field(default=None, ge=1, le=8)
    pension_status: Optional[PensionStatus] = None
    provider_name: Optional[str] = None
    statement_delivery: Optional[StatementDelivery] = None
    authorisation_confirmed: Optional[bool] = None
    # Tier 2
    preferred_name: Optional[str] = None
    mac_reference_number: Optional[str] = None
    suburb: Optional[str] = None
    state: Optional[AustralianState] = None
    is_grandfathered_hcp: Optional[GrandfatheredHCP] = None
    hcp_level: Optional[int] = Field(default=None, ge=1, le=4)
    caregiver_relationship: Optional[CaregiverRelationship] = None
    caregiver_phone: Optional[str] = None
    # Tier 3
    care_manager_name: Optional[str] = None
    care_manager_phone: Optional[str] = None
    care_manager_email: Optional[str] = None
    full_address: Optional[str] = None
    part_pension_actual_independence_pct: Optional[float] = Field(default=None, ge=0, le=100)
    part_pension_actual_everyday_pct: Optional[float] = Field(default=None, ge=0, le=100)
    applicable_supplements: Optional[List[str]] = None
    enteral_feeding_type: Optional[EnteralType] = None
    active_pathway: Optional[ActivePathway] = None
    active_pathway_start: Optional[str] = None
    primary_language: Optional[str] = None
    interpreter_required: Optional[bool] = None
    veteran_status: Optional[VeteranStatus] = None


# ----------------------------------------------------------------------------
# Completeness scoring
# ----------------------------------------------------------------------------
def _field_filled(doc: dict, name: str) -> bool:
    v = doc.get(name)
    if v is None:
        return False
    if isinstance(v, str) and not v.strip():
        return False
    if isinstance(v, list) and len(v) == 0:
        return False
    if name == "authorisation_confirmed":
        return v is True
    return True


def compute_profile_completeness(doc: dict) -> float:
    """Tier 1 weighted 60%, Tier 2 30%, Tier 3 10%. A profile with all Tier 1
    + Tier 2 fields filled returns 90% (good enough to use Wayly fully)."""
    t1_filled = sum(1 for f in TIER1_FIELDS if _field_filled(doc, f))
    t2_filled = sum(1 for f in TIER2_FIELDS if _field_filled(doc, f))
    t3_filled = sum(1 for f in TIER3_FIELDS if _field_filled(doc, f))
    t1_score = (t1_filled / len(TIER1_FIELDS)) * 60.0 if TIER1_FIELDS else 0.0
    t2_score = (t2_filled / len(TIER2_FIELDS)) * 30.0 if TIER2_FIELDS else 0.0
    t3_score = (t3_filled / len(TIER3_FIELDS)) * 10.0 if TIER3_FIELDS else 0.0
    return round(t1_score + t2_score + t3_score, 1)


def missing_required_fields(doc: dict) -> List[str]:
    return [f for f in TIER1_FIELDS if not _field_filled(doc, f)]


def recommended_next_fields(doc: dict) -> List[str]:
    """Tier 2 fields not yet filled, in priority order."""
    priority = (
        "mac_reference_number",
        "is_grandfathered_hcp",
        "suburb",
        "state",
        "caregiver_relationship",
        "caregiver_phone",
        "preferred_name",
    )
    return [f for f in priority if not _field_filled(doc, f)]


# ----------------------------------------------------------------------------
# Profile prompts — dynamic Tier 3 disclosure copy
# ----------------------------------------------------------------------------
def _build_profile_prompts(doc: dict) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    pension = (doc.get("pension_status") or "").lower()
    if pension in ("part_pension", "cshc"):
        if doc.get("part_pension_actual_independence_pct") is None:
            out.append({
                "field": "part_pension_actual_independence_pct",
                "prompt": (
                    "You said your parent is on a part pension. Enter the exact Independence "
                    "contribution percentage from their Services Australia letter so Wayly can give "
                    "precise figures."
                ),
                "where": "contribution_estimator",
                "tier": "3",
            })
        if doc.get("part_pension_actual_everyday_pct") is None:
            out.append({
                "field": "part_pension_actual_everyday_pct",
                "prompt": (
                    "Enter the exact Everyday Living contribution percentage from their Services "
                    "Australia letter for a precise figure."
                ),
                "where": "contribution_estimator",
                "tier": "3",
            })
    if not doc.get("applicable_supplements"):
        first = doc.get("preferred_name") or doc.get("first_name") or "your parent"
        out.append({
            "field": "applicable_supplements",
            "prompt": (
                f"Does {first} receive any of these supplements? Check anything that applies and "
                "Wayly will include them in the budget."
            ),
            "where": "budget_calculator",
            "tier": "3",
        })
    if not doc.get("care_manager_name"):
        out.append({
            "field": "care_manager_name",
            "prompt": "Add the care manager's name so we can pre-fill it on letters and reports.",
            "where": "reassessment_letter",
            "tier": "3",
        })
        out.append({
            "field": "care_manager_name",
            "prompt": (
                "If this statement names a care manager, save them to the profile so "
                "Wayly can flag changes and pre-fill it on letters."
            ),
            "where": "statement_decoder",
            "tier": "3",
        })
    if not doc.get("full_address"):
        out.append({
            "field": "full_address",
            "prompt": (
                "Add the participant's full residential address so letters to My Aged Care can be "
                "auto-filled."
            ),
            "where": "reassessment_letter",
            "tier": "3",
        })
    if not doc.get("mac_reference_number"):
        out.append({
            "field": "mac_reference_number",
            "prompt": (
                "Add the My Aged Care reference (Client ID) so we can include it on every letter "
                "and reassessment request."
            ),
            "where": "reassessment_letter",
            "tier": "2",
        })
    if doc.get("is_grandfathered_hcp") is None:
        out.append({
            "field": "is_grandfathered_hcp",
            "prompt": (
                "Did your parent transition from a Home Care Package on 1 Nov 2025? This unlocks "
                "transitional HCP figures and supplements."
            ),
            "where": "profile",
            "tier": "2",
        })
    return out


# ----------------------------------------------------------------------------
# Storage helpers
# ----------------------------------------------------------------------------
async def _account_for(request: Request) -> tuple:
    """Returns (user, account) — raises 401 if no auth."""
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    return user, acct


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip_mongo(doc: Optional[dict]) -> Optional[dict]:
    if not doc:
        return None
    return {k: v for k, v in doc.items() if k != "_id"}


def _decorate(doc: dict) -> dict:
    """Adds computed `profile_completeness_pct`, `missing_required_fields`,
    `recommended_next_fields`, `requires_completion` to a participant doc."""
    if not doc:
        return doc
    doc = dict(doc)
    doc["profile_completeness_pct"] = compute_profile_completeness(doc)
    missing = missing_required_fields(doc)
    doc["missing_required_fields"] = missing
    doc["recommended_next_fields"] = recommended_next_fields(doc)
    doc["requires_completion"] = bool(missing)
    return doc


async def _audit(account_id: str, actor_id: str, action: str, target: str, detail: str) -> None:
    try:
        await _db.audit_events.insert_one({
            "id": str(__import__("uuid").uuid4()),
            "account_id": account_id,
            "actor_id": actor_id,
            "action": action,
            "target": target,
            "detail": detail,
            "at": _now_iso(),
        })
    except Exception as e:
        logger.warning("audit failed: %s", e)


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------
@participant_profile_router.post("/participants", status_code=201)
async def create_participant(body: ParticipantCreateBody, request: Request):
    """Tier 1 mandatory + authorisation. Creates a new participant on the
    user's account and a backing household row for legacy callers."""
    if not body.authorisation_confirmed:
        raise HTTPException(status_code=422, detail={
            "error": "authorisation_required",
            "message": (
                "You must confirm you are authorised to manage this participant's aged care "
                "information before saving."
            ),
            "field": "authorisation_confirmed",
        })
    user, acct = await _account_for(request)
    # Build the new participant doc directly (the legacy v2 model has only a
    # subset of fields — we extend it here with the full Tier 1 / 2 / 3 schema).
    import uuid
    pid = str(uuid.uuid4())
    # Create a backing household row for legacy code paths
    hid = user.get("household_id")
    full_name = f"{body.first_name} {body.last_name}".strip()
    if not hid:
        hid = str(uuid.uuid4())
        await _db.households.insert_one({
            "id": hid,
            "owner_id": user["id"],
            "participant_name": full_name,
            "classification": body.classification_level,
            "provider_name": body.provider_name,
            "is_grandfathered": (body.is_grandfathered_hcp == "yes"),
            "relationship": "parent",
            "created_at": _now_iso(),
        })
        await _db.users.update_one({"id": user["id"]}, {"$set": {"household_id": hid}})

    existing_primary = await _db.participants.find_one(
        {"account_id": acct["id"], "is_primary": True, "status": "ACTIVE"}, {"_id": 0}
    )
    doc = {
        "id": pid,
        "account_id": acct["id"],
        "household_id": hid,
        # Tier 1
        "first_name": body.first_name.strip(),
        "last_name": body.last_name.strip(),
        "dob": body.dob,
        "date_of_birth": body.dob,  # legacy alias used by batch3_models
        "classification_level": body.classification_level,
        "classification": body.classification_level,  # legacy alias
        "pension_status": body.pension_status,
        "provider_name": body.provider_name.strip(),
        "statement_delivery": body.statement_delivery,
        "statement_format": body.statement_delivery,  # legacy alias
        "authorisation_confirmed": True,
        "authorisation_confirmed_at": _now_iso(),
        "authorisation_confirmed_by_user_id": user["id"],
        # Tier 2
        "preferred_name": body.preferred_name,
        "mac_reference_number": body.mac_reference_number,
        "suburb": body.suburb,
        "state": body.state,
        "is_grandfathered_hcp": body.is_grandfathered_hcp,
        "hcp_level": body.hcp_level,
        "caregiver_relationship": body.caregiver_relationship,
        "caregiver_phone": body.caregiver_phone,
        # Tier 3 defaults
        "applicable_supplements": [],
        "interpreter_required": False,
        # Status/system
        "status": "ACTIVE",
        "is_primary": (existing_primary is None),
        "color_index": 0,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    doc["profile_completeness_pct"] = compute_profile_completeness(doc)
    await _db.participants.insert_one(doc)
    await _audit(acct["id"], user["id"], "PARTICIPANT_CREATED", pid,
                 f"Created participant {full_name} (class {body.classification_level})")
    return _decorate(_strip_mongo(doc))


@participant_profile_router.get("/participants/{pid}")
async def get_participant(pid: str, request: Request):
    user, acct = await _account_for(request)
    doc = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Participant not found")
    return _decorate(doc)


@participant_profile_router.get("/participants")
async def list_participants(request: Request, include_removed: bool = Query(default=False)):
    user, acct = await _account_for(request)
    q: Dict[str, Any] = {"account_id": acct["id"]}
    if not include_removed:
        q["status"] = "ACTIVE"
    cur = _db.participants.find(q, {"_id": 0}).sort("is_primary", -1).limit(50)
    items = [_decorate(p) async for p in cur]
    return {"items": items}


@participant_profile_router.patch("/participants/{pid}")
async def patch_participant(pid: str, body: ParticipantPatchBody, request: Request):
    user, acct = await _account_for(request)
    doc = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Participant not found")
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        return _decorate(doc)
    # Sync legacy aliases for back-compat
    if "dob" in patch:
        patch["date_of_birth"] = patch["dob"]
    if "classification_level" in patch:
        patch["classification"] = patch["classification_level"]
    if "statement_delivery" in patch:
        patch["statement_format"] = patch["statement_delivery"]
    if patch.get("authorisation_confirmed") is True and not doc.get("authorisation_confirmed_at"):
        patch["authorisation_confirmed_at"] = _now_iso()
        patch["authorisation_confirmed_by_user_id"] = user["id"]
    patch["updated_at"] = _now_iso()
    # Compute completeness against the merged doc
    merged = {**doc, **patch}
    patch["profile_completeness_pct"] = compute_profile_completeness(merged)
    await _db.participants.update_one({"id": pid}, {"$set": patch})

    # Audit which Tier 3 fields were filled via progressive disclosure
    tier3_filled = [f for f in TIER3_FIELDS if f in patch]
    if tier3_filled:
        await _audit(acct["id"], user["id"], "profile_field_prompted", pid,
                     f"Filled Tier 3 fields: {', '.join(tier3_filled)}")

    updated = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    return _decorate(updated)


@participant_profile_router.get("/participants/{pid}/profile-prompts")
async def participant_profile_prompts(pid: str, request: Request):
    user, acct = await _account_for(request)
    doc = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Participant not found")
    return {
        "participant_id": pid,
        "profile_completeness_pct": compute_profile_completeness(doc),
        "missing_required_fields": missing_required_fields(doc),
        "prompts": _build_profile_prompts(doc),
    }


# ----------------------------------------------------------------------------
# Migration — used by the CLI script and the optional startup hook
# ----------------------------------------------------------------------------
async def migrate_participants_to_v2(db_handle) -> Dict[str, int]:
    """Idempotent. Walks `db.participants` and ensures every doc has the new
    fields populated with safe defaults. Resets `authorisation_confirmed=False`
    for any legacy doc that has never been explicitly confirmed.

    Returns counters: {scanned, updated, flagged_for_completion}.
    """
    scanned = 0
    updated = 0
    flagged = 0
    cur = db_handle.participants.find({}, {"_id": 0})
    async for p in cur:
        scanned += 1
        patch: Dict[str, Any] = {}
        # pension_status default → "unsure"
        if p.get("pension_status") in (None, ""):
            patch["pension_status"] = "unsure"
        # statement_delivery: derive from legacy `statement_format` or default email
        if p.get("statement_delivery") in (None, ""):
            sf = (p.get("statement_format") or "").lower()
            if sf in ("email", "post", "portal", "other"):
                patch["statement_delivery"] = sf
            elif sf == "paper":
                patch["statement_delivery"] = "post"
            else:
                patch["statement_delivery"] = "email"
        # classification_level: derive from legacy `classification`
        if p.get("classification_level") is None and p.get("classification") is not None:
            patch["classification_level"] = int(p["classification"])
        # dob: derive from legacy `date_of_birth`
        if p.get("dob") in (None, "") and p.get("date_of_birth"):
            patch["dob"] = p["date_of_birth"]
        # authorisation_confirmed: explicit reset to False so caregivers re-confirm
        # only when the field has NEVER been set; if it's True already we leave it.
        if "authorisation_confirmed" not in p:
            patch["authorisation_confirmed"] = False
        # Defaults for Tier 3 collection-shaped fields
        if p.get("applicable_supplements") is None:
            patch["applicable_supplements"] = []
        if p.get("interpreter_required") is None:
            patch["interpreter_required"] = False
        # Recompute completeness against the merged doc
        merged = {**p, **patch}
        new_pct = compute_profile_completeness(merged)
        if patch or abs(float(p.get("profile_completeness_pct") or 0) - new_pct) > 0.05:
            patch["profile_completeness_pct"] = new_pct
            patch["updated_at"] = _now_iso()
            await db_handle.participants.update_one({"id": p["id"]}, {"$set": patch})
            updated += 1
        if missing_required_fields(merged):
            flagged += 1
    logger.info("migrate_participants_to_v2 → scanned=%d updated=%d flagged=%d",
                scanned, updated, flagged)
    return {"scanned": scanned, "updated": updated, "flagged_for_completion": flagged}
