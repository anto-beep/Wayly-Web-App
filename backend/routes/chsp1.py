"""CHSP-1 v1 slice: Commonwealth Home Support Programme Tooling.

Scope (per CHSP-1-v1.md):
  * Section B.1 ChspProfile with 8-status enum.
  * Section B.2 ChspServiceEntry with 14 service types.
  * Section B.3 ChspFeeCheck with variance tolerances ($5/2% within, 2-5% minor, >5% material).
  * Section B.4 ChspTransitionConsideration with 6-step walkthrough.
  * Section D endpoints for profile/service/fee/transition CRUD.
  * Section F.6 dispute case creation to LOOP-1 on material variance.

Deferred to CHSP-1 v2:
  * CHSP provider comparison with quality context (PPC-3 analogue).
  * CHSP-specific LF-2 correspondence templates.
  * Cross-tool activation on transition completion.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from lib.chsp1.fee_check import run_fee_check

logger = logging.getLogger("wayly.chsp1")

chsp1_router = APIRouter(prefix="/chsp1", tags=["chsp1"])

_db = None
_user_dep = None
_loop1_open_case: Optional[Callable] = None


def init_chsp1_routes(*, db, user_dep, loop1_open_case=None):
    global _db, _user_dep, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("CHSP1_ENABLED", "1") != "0"


def _ws1_enabled() -> bool:
    """CHSP-TOOLS-1 WS-1 feature flag (`chsp_tools_v1`). Defaulted OFF in
    production per the spec; enabled elsewhere so it is testable."""
    return os.environ.get("CHSP_TOOLS_V1", "1") != "0"


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


async def _user_id(request) -> str:
    user = await _user_dep(request)
    uid = user["id"] if isinstance(user, dict) else getattr(user, "id", None)
    if not uid:
        raise HTTPException(status_code=401, detail="Auth required")
    return str(uid)


async def ensure_chsp1_indexes(db) -> None:
    try:
        await db.chsp_profiles.create_index([("user_id", 1)], unique=True)
        await db.chsp_service_entries.create_index([("chsp_profile_id", 1), ("is_active", 1)])
        await db.chsp_fee_checks.create_index([("chsp_profile_id", 1), ("reviewed_at", -1)])
        await db.chsp_transition_considerations.create_index([("chsp_profile_id", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("chsp1 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Profile
# ---------------------------------------------------------------------------


class ChspProfileIn(BaseModel):
    represents_participant_id: Optional[str] = None
    current_chsp_status: str = "on_chsp"
    chsp_start_date: Optional[str] = None


def _view_profile(p: dict) -> Dict[str, Any]:
    p = {k: v for k, v in p.items() if k != "_id"}
    for k in ("created_at", "updated_at", "retention_expires_at", "promoted_at", "transition_consideration_started_at"):
        if p.get(k):
            p[k] = _iso(p[k])
    return p


@chsp1_router.post("/profile")
async def create_or_update_profile(body: ChspProfileIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    existing = await _db.chsp_profiles.find_one({"user_id": uid})
    now = _now()
    if existing:
        upd = {k: v for k, v in body.dict().items() if v is not None}
        upd["updated_at"] = now
        await _db.chsp_profiles.update_one({"user_id": uid}, {"$set": upd})
        existing.update(upd)
        return {"profile": _view_profile(existing)}
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "represents_participant_id": body.represents_participant_id,
        "current_chsp_status": body.current_chsp_status,
        "ras_assessment_history": [],
        "chsp_start_date": body.chsp_start_date,
        "chsp_end_date": None,
        "end_reason": None,
        "active_service_entries": [],
        "transition_being_considered": False,
        "transition_consideration_started_at": None,
        "transition_assessment_scheduled_date": None,
        "promoted_to_sah_participant_id": None,
        "promoted_at": None,
        "created_at": now,
        "updated_at": now,
        "retention_expires_at": now + timedelta(days=365),
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_profiles.insert_one(doc)
    return {"profile": _view_profile(doc)}


@chsp1_router.get("/profile")
async def get_profile(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.chsp_profiles.find_one({"user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return {"profile": _view_profile(doc)}


# ---------------------------------------------------------------------------
# Service entries
# ---------------------------------------------------------------------------


class ServiceEntryIn(BaseModel):
    service_type: str
    provider_name: str
    hourly_rate_or_fee: float
    fee_structure_note: str = ""
    weekly_frequency: str = ""
    client_contribution_per_unit: float = 0.0
    start_date: str


@chsp1_router.post("/service-entries")
async def add_service(body: ServiceEntryIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "chsp_profile_id": profile["id"],
        "service_type": body.service_type,
        "provider_name": body.provider_name,
        "provider_contact_details": {},
        "hourly_rate_or_fee": {"amount": body.hourly_rate_or_fee, "currency": "AUD"},
        "fee_structure_note": body.fee_structure_note,
        "weekly_frequency": body.weekly_frequency,
        "client_contribution_per_unit": {"amount": body.client_contribution_per_unit, "currency": "AUD"},
        "client_contribution_notes": None,
        "start_date": body.start_date,
        "end_date": None,
        "is_active": True,
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_service_entries.insert_one(doc)
    await _db.chsp_profiles.update_one({"id": profile["id"]}, {"$push": {"active_service_entries": doc["id"]}})
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    doc["updated_at"] = _iso(doc["updated_at"])
    return {"service_entry": doc}


@chsp1_router.get("/service-entries")
async def list_services(request: Request, is_active: Optional[bool] = None):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        return {"service_entries": []}
    q: Dict[str, Any] = {"chsp_profile_id": profile["id"]}
    if is_active is not None:
        q["is_active"] = is_active
    cur = _db.chsp_service_entries.find(q).sort("start_date", -1)
    items = await cur.to_list(length=100)
    for it in items:
        it.pop("_id", None)
        for k in ("created_at", "updated_at"):
            if it.get(k):
                it[k] = _iso(it[k])
    return {"service_entries": items}


class ServiceEntryPatch(BaseModel):
    hourly_rate_or_fee: Optional[float] = None
    client_contribution_per_unit: Optional[float] = None
    fee_structure_note: Optional[str] = None
    weekly_frequency: Optional[str] = None
    start_date: Optional[str] = None


async def _owned_service_entry(uid: str, entry_id: str) -> Dict[str, Any]:
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    row = await _db.chsp_service_entries.find_one({"id": entry_id, "chsp_profile_id": profile["id"]})
    if not row:
        raise HTTPException(status_code=404, detail="Service entry not found")
    return row


@chsp1_router.patch("/service-entries/{entry_id}")
async def update_service(entry_id: str, body: ServiceEntryPatch, request: Request):
    """Agreed Rate Schedule management, edit a saved provider's per-unit rate
    and related fields."""
    await _assert_flag()
    uid = await _user_id(request)
    await _owned_service_entry(uid, entry_id)
    update: Dict[str, Any] = {"updated_at": _now()}
    if body.hourly_rate_or_fee is not None:
        update["hourly_rate_or_fee"] = {"amount": body.hourly_rate_or_fee, "currency": "AUD"}
    if body.client_contribution_per_unit is not None:
        update["client_contribution_per_unit"] = {"amount": body.client_contribution_per_unit, "currency": "AUD"}
    if body.fee_structure_note is not None:
        update["fee_structure_note"] = body.fee_structure_note
    if body.weekly_frequency is not None:
        update["weekly_frequency"] = body.weekly_frequency
    if body.start_date is not None:
        update["start_date"] = body.start_date
    await _db.chsp_service_entries.update_one({"id": entry_id}, {"$set": update})
    row = await _db.chsp_service_entries.find_one({"id": entry_id})
    row.pop("_id", None)
    for k in ("created_at", "updated_at"):
        if row.get(k):
            row[k] = _iso(row[k])
    return {"service_entry": row}


@chsp1_router.post("/service-entries/{entry_id}/expire")
async def expire_service(entry_id: str, request: Request):
    """Expire (deactivate) a saved rate so it stops pre-filling the Fee Check
    without deleting the history."""
    await _assert_flag()
    uid = await _user_id(request)
    await _owned_service_entry(uid, entry_id)
    now = _now()
    await _db.chsp_service_entries.update_one(
        {"id": entry_id},
        {"$set": {"is_active": False, "status": "expired", "end_date": _iso(now), "updated_at": now}},
    )
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if profile:
        await _db.chsp_profiles.update_one({"id": profile["id"]}, {"$pull": {"active_service_entries": entry_id}})
    return {"entry_id": entry_id, "status": "expired"}


# ---------------------------------------------------------------------------
# Fee checks
# ---------------------------------------------------------------------------


class FeeCheckIn(BaseModel):
    chsp_service_entry_id: Optional[str] = None
    invoice_or_statement_reference: str
    service_type: str
    provider_name: str
    billed_period_start: str
    billed_period_end: str
    billed_amount: float
    units_billed: str
    expected_amount: float


def _variance_status(pct: float, abs_diff: float) -> str:
    if abs_diff < 5.0 or pct < 2.0:
        return "within_tolerance"
    if pct <= 5.0:
        return "minor_variance"
    return "material_variance"


@chsp1_router.post("/fee-checks")
async def submit_fee_check(body: FeeCheckIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    variance_amt = round(body.billed_amount - body.expected_amount, 2)
    pct = round(abs(variance_amt) / body.expected_amount * 100, 2) if body.expected_amount > 0 else 0
    status = _variance_status(pct, abs(variance_amt))
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "chsp_profile_id": profile["id"],
        "chsp_service_entry_id": body.chsp_service_entry_id,
        "invoice_or_statement_reference": body.invoice_or_statement_reference,
        "service_type": body.service_type,
        "provider_name": body.provider_name,
        "billed_period_start": body.billed_period_start,
        "billed_period_end": body.billed_period_end,
        "billed_amount": {"amount": body.billed_amount, "currency": "AUD"},
        "units_billed": body.units_billed,
        "expected_amount": {"amount": body.expected_amount, "currency": "AUD"},
        "expected_calculation_source": "user_provided_rate_from_service_entry",
        "variance_amount": {"amount": variance_amt, "currency": "AUD"},
        "variance_percentage": pct,
        "variance_status": status,
        "variance_explanation_offered_by_provider": None,
        "case_id": None,
        "reviewed_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_fee_checks.insert_one(doc)
    doc.pop("_id", None)
    doc["reviewed_at"] = _iso(doc["reviewed_at"])
    return {"fee_check": doc, "requires_explanation": status == "material_variance"}


class FeeCheckDisputeIn(BaseModel):
    fee_check_id: str
    explanation_received: Optional[str] = None
    open_dispute_case: bool = True


@chsp1_router.post("/fee-checks/{fc_id}/dispute")
async def open_fee_dispute(fc_id: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    fc = await _db.chsp_fee_checks.find_one({"id": fc_id})
    if not fc:
        raise HTTPException(status_code=404, detail="Not found")
    case_id = None
    if _loop1_open_case:
        try:
            profile = await _db.chsp_profiles.find_one({"id": fc["chsp_profile_id"]})
            case = await _loop1_open_case(
                participant_id=profile.get("represents_participant_id") or uid,
                case_type="invoice_error", source_tool="chsp1",
                subject=f"CHSP fee variance dispute: {fc['provider_name']} · ${fc['variance_amount']['amount']}",
                metadata={"fee_check_id": fc_id, "variance_pct": fc.get("variance_percentage")})
            case_id = case.get("id") if isinstance(case, dict) else None
        except Exception as e:  # pragma: no cover
            logger.warning("loop1 case open failed: %s", e)
    if case_id:
        await _db.chsp_fee_checks.update_one({"id": fc_id}, {"$set": {"case_id": case_id}})
    return {"case_id": case_id}


# ---------------------------------------------------------------------------
# WS-1 · Per-unit Fee Check (CHSP-TOOLS-1) + WS-3 access/hardship letters
# ---------------------------------------------------------------------------


@chsp1_router.get("/config")
async def chsp_config():
    """Feature-flag state so the frontends can gate the WS-1 experience."""
    return {"chsp_tools_v1": _ws1_enabled(), "chsp1_enabled": _flag_enabled()}


class FeeCheckPreviewIn(BaseModel):
    invoice_reference: Optional[str] = None
    provider_name: Optional[str] = None
    service_type: Optional[str] = None
    units_billed: float
    units_received: float
    billed_amount: float
    agreed_rate: Optional[float] = None
    rate_effective_date: Optional[str] = None
    billed_period_start: Optional[str] = None
    billed_period_end: Optional[str] = None
    spans_contribution_change: bool = False


@chsp1_router.post("/fee-check/preview")
async def fee_check_preview(body: FeeCheckPreviewIn, request: Request):
    """Stateless WS-1 per-unit Fee Check. Requires auth but persists nothing;
    the caller decides whether to act on the verdict."""
    await _assert_flag()
    if not _ws1_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    await _user_id(request)
    result = run_fee_check(
        agreed_rate=body.agreed_rate,
        units_received=body.units_received,
        units_billed=body.units_billed,
        billed_amount=body.billed_amount,
        rate_effective_date=body.rate_effective_date,
        billed_period_start=body.billed_period_start,
        spans_contribution_change=body.spans_contribution_change,
    )
    result["invoice_reference"] = body.invoice_reference
    result["provider_name"] = body.provider_name
    result["service_type"] = body.service_type
    return {"result": result}


class ChspLetterIn(BaseModel):
    kind: str = "service_continuity"  # or "hardship"
    provider_name: Optional[str] = None
    context: Dict[str, Any] = Field(default_factory=dict)


@chsp1_router.post("/letter")
async def create_chsp_letter(body: ChspLetterIn, request: Request):
    """WS-3 · Create an LF-1 correspondence draft for a CHSP access/hardship
    situation and return the editor path. ``service_continuity`` asks the
    provider to keep services running (situation 6); ``hardship`` raises a
    fee-waiver / contribution-hardship notification (situation 9)."""
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    participant_id = (profile or {}).get("represents_participant_id")

    if body.kind == "hardship":
        situation_id, archetype, recipient = 9, "notification", "services_australia_aged_care"
    else:
        situation_id, archetype, recipient = 6, "request", "provider_cm"

    entry_id = str(uuid.uuid4())
    now = _iso(_now())
    entry = {
        "id": entry_id,
        "user_id": uid,
        "participant_id": participant_id,
        "situation_id": situation_id,
        "archetype": archetype,
        "direction": "outbound",
        "recipient_type": recipient,
        "sender_identity": None,
        "sender_authority_basis": None,
        "complaint_mode": None,
        "atsi_preference": False,
        "source_import": {
            "tool": "chsp-tools",
            "letter_kind": body.kind,
            "provider_name": body.provider_name,
            **body.context,
        },
        "intake": {},
        "status": "draft",
        "created_at": now,
        "updated_at": now,
    }
    await _db.lf1_correspondence.insert_one(entry)
    return {
        "entry_id": entry_id,
        "situation_id": situation_id,
        "kind": body.kind,
        "editor_path": f"/tools/letters-and-follow-ups/{entry_id}",
    }



# ---------------------------------------------------------------------------
# Transition consideration
# ---------------------------------------------------------------------------


class TransitionIn(BaseModel):
    reasons_for_considering_transition: List[str] = Field(default_factory=list)
    reasons_notes: Optional[str] = None
    considerations_reviewed: Dict[str, bool] = Field(default_factory=dict)
    decision: Optional[str] = None
    decision_notes: Optional[str] = None


@chsp1_router.post("/transition-considerations")
async def submit_transition(body: TransitionIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    profile = await _db.chsp_profiles.find_one({"user_id": uid})
    if not profile:
        raise HTTPException(status_code=404, detail="No CHSP profile")
    now = _now()
    # Cross-tool context snapshot
    services = await _db.chsp_service_entries.count_documents({"chsp_profile_id": profile["id"], "is_active": True})
    doc = {
        "id": str(uuid.uuid4()),
        "chsp_profile_id": profile["id"],
        "actor_user_id": uid,
        "reasons_for_considering_transition": body.reasons_for_considering_transition,
        "reasons_notes": body.reasons_notes,
        "cross_tool_context_snapshot": {"active_services_count": services, "typical_hours_per_week": None, "caregiver_burnout_indicators_from_cs_1": None},
        "considerations_reviewed": body.considerations_reviewed,
        "decision": body.decision,
        "decision_notes": body.decision_notes,
        "completed_at": now if body.decision else None,
        "data_residency": "ap-southeast-2",
    }
    await _db.chsp_transition_considerations.insert_one(doc)
    # Mark profile if user chose to proceed
    profile_upd: Dict[str, Any] = {"updated_at": now}
    if body.decision in {"proceed_with_transition_seek_ras_reassessment", "proceed_with_transition_seek_iat_directly"}:
        profile_upd["transition_being_considered"] = True
        profile_upd["transition_consideration_started_at"] = now
        profile_upd["current_chsp_status"] = "transitioning_to_sah"
    await _db.chsp_profiles.update_one({"id": profile["id"]}, {"$set": profile_upd})
    doc.pop("_id", None)
    doc["completed_at"] = _iso(doc["completed_at"])
    return {"transition_consideration": doc}
