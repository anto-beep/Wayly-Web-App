"""Wayly — Extended Features Build Batch 2.

Wires the following feature areas under a single APIRouter so it can be
imported by `server.py` without bloating the monolith:

  Feature 9 — Multi-participant households   /api/participants/*
  Feature 1 — Hospital Liaison Mode           /api/hospital/*
  Feature 6 — Family Photo & Message Wall     /api/wall/*
  Feature 3 — SMS opt-in & external contacts  /api/me/contacts, /api/sms/*
  Feature 8 — Care Plan Amendment Generator   /api/amendments/*
  Feature 5 — Adviser Branded PDF             /api/adviser/brand
  Feature 2 — Adviser Scenario Modeller       /api/adviser/scenarios/*
                                              /api/adviser/means-test/settings
  Feature 7 — Adviser Multi-household Alerts  /api/adviser/alerts/global

Backwards compatibility: existing household_id-scoped endpoints continue to
work. Auto-migration on startup creates one primary participant per existing
household (mirroring `household.participant_name + classification + provider`).
"""
from __future__ import annotations
import os
import io
import base64
import logging
from datetime import datetime, timezone, date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from batch2_models import (
    MAX_PARTICIPANTS_PER_HOUSEHOLD,
    ParticipantCreate, ParticipantUpdate, Participant,
    HospitalAdmissionCreate, HospitalDischargeBody, HospitalAdmission,
    WallPostCreate, WallReact, WallPost,
    ExternalContactUpdate, ExternalContact,
    AmendmentCreate, AmendmentRequestItem, CarePlanAmendment,
    AdviserBrandUpdate,
    ScenarioCreate, ScenarioInputs, ScenarioOutputs, AdviserScenario,
    _new_id, _now_iso,
)
import sms_service
import email_service

logger = logging.getLogger("wayly.batch2")

batch2_router = APIRouter(tags=["batch2"])

# Dependency holders — wired by init_batch2_routes()
_db = None
_user_dep = None        # async (Request) -> user dict, raises 401 if missing
_adviser_dep = None     # async (Request) -> user dict, raises 403 if not adviser
_audit_log = None       # async (household_id, actor_id, actor_name, action, detail) -> None


def init_batch2_routes(*, db, user_dep, adviser_dep, audit_log):
    global _db, _user_dep, _adviser_dep, _audit_log
    _db = db
    _user_dep = user_dep
    _adviser_dep = adviser_dep
    _audit_log = audit_log


# ----------------------------------------------------------------------------
# Migration — auto-create a primary participant for every legacy household
# ----------------------------------------------------------------------------
async def migrate_existing_households() -> Dict[str, int]:
    """Idempotent migration. Runs at startup. Creates one primary participant
    per household that doesn't already have one."""
    if _db is None:
        return {"migrated": 0}
    created = 0
    cursor = _db.households.find({}, {"_id": 0})
    async for h in cursor:
        hid = h.get("id")
        if not hid:
            continue
        existing = await _db.participants.find_one({"household_id": hid, "is_archived": {"$ne": True}})
        if existing:
            continue
        p = Participant(
            household_id=hid,
            name=h.get("participant_name") or "Participant",
            classification=int(h.get("classification") or 4),
            provider_name=h.get("provider_name") or "Unknown provider",
            is_grandfathered=bool(h.get("is_grandfathered")),
            relationship=h.get("relationship") or "parent",
            is_primary=True,
        )
        await _db.participants.insert_one(p.model_dump())
        created += 1
    if created:
        logger.info("Batch2 migration: created %d primary participants", created)
    return {"migrated": created}


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def _strip(doc: dict) -> dict:
    return {k: v for k, v in (doc or {}).items() if k != "_id"}


async def _require_household_id(user: dict) -> str:
    hid = user.get("household_id")
    if not hid:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_household", "message": "Set up your household first.", "redirect": "/onboarding"},
        )
    return hid


async def _get_participant_or_404(household_id: str, participant_id: str) -> dict:
    p = await _db.participants.find_one(
        {"id": participant_id, "household_id": household_id, "is_archived": {"$ne": True}},
        {"_id": 0},
    )
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    return p


async def _resolve_participant(user: dict, participant_id: Optional[str]) -> dict:
    """Return the participant doc for the user's household. If `participant_id`
    is None, returns the primary participant (auto-created during migration).
    """
    hid = await _require_household_id(user)
    if participant_id:
        return await _get_participant_or_404(hid, participant_id)
    p = await _db.participants.find_one(
        {"household_id": hid, "is_primary": True, "is_archived": {"$ne": True}},
        {"_id": 0},
    )
    if p:
        return p
    # Fallback: any non-archived participant
    p = await _db.participants.find_one(
        {"household_id": hid, "is_archived": {"$ne": True}},
        {"_id": 0},
    )
    if p:
        return p
    # No participants yet — synth one on the fly from the household
    h = await _db.households.find_one({"id": hid}, {"_id": 0})
    if not h:
        raise HTTPException(status_code=409, detail="No household")
    np = Participant(
        household_id=hid,
        name=h.get("participant_name") or "Participant",
        classification=int(h.get("classification") or 4),
        provider_name=h.get("provider_name") or "Unknown provider",
        is_grandfathered=bool(h.get("is_grandfathered")),
        relationship=h.get("relationship") or "parent",
        is_primary=True,
    ).model_dump()
    await _db.participants.insert_one(np)
    return _strip(np)


# ============================================================================
# FEATURE 9 — Multi-participant household
# ============================================================================
@batch2_router.get("/participants")
async def list_participants(request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    cur = _db.participants.find({"household_id": hid, "is_archived": {"$ne": True}}, {"_id": 0}).sort("is_primary", -1).limit(MAX_PARTICIPANTS_PER_HOUSEHOLD + 1)
    items = [p async for p in cur]
    # Self-heal: if none exist, create primary from the household record.
    if not items:
        primary = await _resolve_participant(user, None)
        items = [primary]
    return {"items": items, "max": MAX_PARTICIPANTS_PER_HOUSEHOLD}


@batch2_router.post("/participants")
async def add_participant(payload: ParticipantCreate, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    existing = await _db.participants.count_documents({"household_id": hid, "is_archived": {"$ne": True}})
    if existing >= MAX_PARTICIPANTS_PER_HOUSEHOLD:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "participant_limit",
                "message": f"This household already has {MAX_PARTICIPANTS_PER_HOUSEHOLD} participants. Archive one to add another.",
            },
        )
    is_primary = existing == 0
    p = Participant(household_id=hid, is_primary=is_primary, **payload.model_dump())
    await _db.participants.insert_one(p.model_dump())
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "PARTICIPANT_ADDED",
                         f"Added participant {p.name} (Classification {p.classification})")
    except Exception:
        pass
    return p.model_dump()


@batch2_router.patch("/participants/{pid}")
async def update_participant(pid: str, payload: ParticipantUpdate, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    p = await _get_participant_or_404(hid, pid)
    patch = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not patch:
        return p
    await _db.participants.update_one({"id": pid, "household_id": hid}, {"$set": patch})
    updated = await _db.participants.find_one({"id": pid}, {"_id": 0})
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "PARTICIPANT_UPDATED",
                         f"Updated participant {updated.get('name')}: {', '.join(patch.keys())}")
    except Exception:
        pass
    return updated


@batch2_router.delete("/participants/{pid}")
async def archive_participant(pid: str, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    p = await _get_participant_or_404(hid, pid)
    if p.get("is_primary"):
        raise HTTPException(status_code=409, detail="The primary participant cannot be archived. Promote another participant first.")
    await _db.participants.update_one({"id": pid, "household_id": hid}, {"$set": {"is_archived": True}})
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "PARTICIPANT_ARCHIVED",
                         f"Archived participant {p.get('name')}")
    except Exception:
        pass
    return {"ok": True}


@batch2_router.post("/participants/{pid}/promote")
async def promote_to_primary(pid: str, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    p = await _get_participant_or_404(hid, pid)
    await _db.participants.update_many({"household_id": hid}, {"$set": {"is_primary": False}})
    await _db.participants.update_one({"id": pid, "household_id": hid}, {"$set": {"is_primary": True}})
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "PARTICIPANT_PROMOTED",
                         f"Set {p.get('name')} as primary participant")
    except Exception:
        pass
    return {"ok": True, "primary_id": pid}


# ============================================================================
# FEATURE 1 — Hospital Liaison Mode
# ============================================================================
@batch2_router.get("/hospital/admissions")
async def list_hospital_admissions(request: Request, participant_id: Optional[str] = Query(default=None), status_filter: Optional[str] = Query(default=None, alias="status")):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    q: Dict[str, Any] = {"household_id": hid}
    if participant_id:
        # Phase 2: validate ownership before honouring the param.
        from security_utils import assert_participant_access
        await assert_participant_access(user["id"], participant_id)
        q["participant_id"] = participant_id
    if status_filter in ("active", "discharged"):
        q["status"] = status_filter
    cur = _db.hospital_admissions.find(q, {"_id": 0}).sort("admission_date", -1).limit(100)
    items = [doc async for doc in cur]
    return {"items": items}


@batch2_router.post("/hospital/admissions")
async def create_hospital_admission(payload: HospitalAdmissionCreate, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    p = await _get_participant_or_404(hid, payload.participant_id)
    adm = HospitalAdmission(
        household_id=hid,
        participant_id=payload.participant_id,
        admission_date=payload.admission_date,
        expected_discharge=payload.expected_discharge,
        hospital_name=payload.hospital_name,
        ward=payload.ward,
        reason=payload.reason,
        services_paused=bool(payload.pause_services),
        rcp_requested=bool(payload.request_rcp),
        rcp_requested_at=_now_iso() if payload.request_rcp else None,
        notes=payload.notes,
        created_by=user["id"],
    )
    await _db.hospital_admissions.insert_one(adm.model_dump())
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "HOSPITAL_ADMISSION",
                         f"Hospital admission logged: {payload.hospital_name} for {p.get('name')}"
                         + (" — services paused" if payload.pause_services else "")
                         + (" — RCP requested" if payload.request_rcp else ""))
    except Exception:
        pass
    # Best-effort notify team inbox so we have visibility (Resend, no-op if mocked).
    try:
        await email_service.email_tool_result(
            to=os.environ.get("WAYLY_TEAM_EMAIL", "a.chiware2@gmail.com"),
            tool_name=f"Hospital admission · {p.get('name')}",
            headline=f"{p.get('name')} admitted to {payload.hospital_name}",
            body_html=(
                f"<p><strong>Participant:</strong> {p.get('name')}</p>"
                f"<p><strong>Hospital:</strong> {payload.hospital_name}{(' (' + payload.ward + ')') if payload.ward else ''}</p>"
                f"<p><strong>Admission date:</strong> {payload.admission_date}</p>"
                f"<p><strong>Reason:</strong> {payload.reason or '—'}</p>"
                f"<p><strong>Services paused:</strong> {'Yes' if payload.pause_services else 'No'}</p>"
                f"<p><strong>RCP requested:</strong> {'Yes' if payload.request_rcp else 'No'}</p>"
            ),
        )
    except Exception as e:
        logger.warning("Hospital admission email failed: %s", e)
    return adm.model_dump()


@batch2_router.post("/hospital/admissions/{aid}/discharge")
async def discharge_admission(aid: str, payload: HospitalDischargeBody, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    adm = await _db.hospital_admissions.find_one({"id": aid, "household_id": hid}, {"_id": 0})
    if not adm:
        raise HTTPException(status_code=404, detail="Admission not found")
    if adm["status"] == "discharged":
        return adm
    await _db.hospital_admissions.update_one(
        {"id": aid, "household_id": hid},
        {"$set": {
            "status": "discharged",
            "discharge_date": payload.discharge_date,
            "discharge_notes": payload.discharge_notes,
            "services_paused": False,
        }},
    )
    p = await _db.participants.find_one({"id": adm["participant_id"]}, {"_id": 0})
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "HOSPITAL_DISCHARGE",
                         f"Discharged {(p or {}).get('name', 'participant')} from {adm.get('hospital_name')} on {payload.discharge_date}")
    except Exception:
        pass
    return await _db.hospital_admissions.find_one({"id": aid}, {"_id": 0})


@batch2_router.post("/hospital/admissions/{aid}/request-rcp")
async def request_rcp(aid: str, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    adm = await _db.hospital_admissions.find_one({"id": aid, "household_id": hid}, {"_id": 0})
    if not adm:
        raise HTTPException(status_code=404, detail="Admission not found")
    if adm.get("rcp_requested"):
        return adm
    await _db.hospital_admissions.update_one(
        {"id": aid, "household_id": hid},
        {"$set": {"rcp_requested": True, "rcp_requested_at": _now_iso()}},
    )
    p = await _db.participants.find_one({"id": adm["participant_id"]}, {"_id": 0})
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "RCP_REQUESTED",
                         f"Restorative Care Pathway (RCP) requested for {(p or {}).get('name')} ({adm.get('hospital_name')})")
    except Exception:
        pass
    return await _db.hospital_admissions.find_one({"id": aid}, {"_id": 0})


# ============================================================================
# FEATURE 6 — Family Photo & Message Wall
# ============================================================================
@batch2_router.get("/wall/posts")
async def list_wall_posts(request: Request, participant_id: Optional[str] = Query(default=None), limit: int = Query(default=40, ge=1, le=100)):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    q: Dict[str, Any] = {"household_id": hid}
    if participant_id:
        from security_utils import assert_participant_access
        await assert_participant_access(user["id"], participant_id)
        q["participant_id"] = participant_id
    cur = _db.family_wall_posts.find(q, {"_id": 0}).sort("created_at", -1).limit(limit)
    return {"items": [d async for d in cur]}


@batch2_router.post("/wall/posts")
async def create_wall_post(payload: WallPostCreate, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    p = await _get_participant_or_404(hid, payload.participant_id)
    # Phase 4: signature-validate + virus-scan the b64 photo/voice payloads.
    from upload_security import (
        secure_validate_b64, PROFILE_IMAGE, PROFILE_AUDIO,
        MAX_IMAGE_BYTES, MAX_AUDIO_BYTES,
    )
    if payload.kind == "message" and not (payload.body or "").strip():
        raise HTTPException(status_code=400, detail="Message body required")
    if payload.kind == "photo":
        if not payload.image_b64:
            raise HTTPException(status_code=400, detail="Photo upload missing")
        secure_validate_b64(
            payload.image_b64, allowed_profiles=PROFILE_IMAGE, max_bytes=MAX_IMAGE_BYTES,
        )
    if payload.kind == "voice":
        if not payload.audio_b64:
            raise HTTPException(status_code=400, detail="Voice clip missing")
        secure_validate_b64(
            payload.audio_b64, allowed_profiles=PROFILE_AUDIO, max_bytes=MAX_AUDIO_BYTES,
        )
    post = WallPost(
        household_id=hid,
        participant_id=payload.participant_id,
        kind=payload.kind,
        body=payload.body,
        image_b64=payload.image_b64,
        image_mime=payload.image_mime,
        audio_b64=payload.audio_b64,
        audio_mime=payload.audio_mime,
        author_id=user["id"],
        author_name=user.get("name") or user["email"],
    )
    await _db.family_wall_posts.insert_one(post.model_dump())
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "WALL_POST",
                         f"{post.kind.capitalize()} posted to the family wall for {p.get('name')}")
    except Exception:
        pass
    return post.model_dump()


@batch2_router.delete("/wall/posts/{pid}")
async def delete_wall_post(pid: str, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    post = await _db.family_wall_posts.find_one({"id": pid, "household_id": hid}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    # Authors and household owners can delete
    if post["author_id"] != user["id"] and user.get("id") not in (await _household_owner_ids(hid)):
        raise HTTPException(status_code=403, detail="Not allowed")
    await _db.family_wall_posts.delete_one({"id": pid, "household_id": hid})
    return {"ok": True}


@batch2_router.post("/wall/posts/{pid}/react")
async def react_wall_post(pid: str, payload: WallReact, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    post = await _db.family_wall_posts.find_one({"id": pid, "household_id": hid}, {"_id": 0})
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    reactions = post.get("reactions") or {}
    reacted_by = post.get("reacted_by") or {}
    user_emojis = set(reacted_by.get(user["id"], []))
    emoji = payload.emoji
    if emoji in user_emojis:
        # toggle off
        user_emojis.discard(emoji)
        reactions[emoji] = max(0, (reactions.get(emoji) or 0) - 1)
        if reactions[emoji] == 0:
            reactions.pop(emoji, None)
    else:
        user_emojis.add(emoji)
        reactions[emoji] = (reactions.get(emoji) or 0) + 1
    reacted_by[user["id"]] = list(user_emojis)
    await _db.family_wall_posts.update_one(
        {"id": pid, "household_id": hid},
        {"$set": {"reactions": reactions, "reacted_by": reacted_by}},
    )
    return {"ok": True, "reactions": reactions}


async def _household_owner_ids(household_id: str) -> List[str]:
    h = await _db.households.find_one({"id": household_id}, {"_id": 0})
    if not h:
        return []
    return [h.get("owner_id")]


# ============================================================================
# FEATURE 3 — SMS opt-in & external contacts
# ============================================================================
@batch2_router.get("/me/contacts")
async def get_my_contacts(request: Request):
    user = await _user_dep(request)
    doc = await _db.user_external_contacts.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = ExternalContact(user_id=user["id"]).model_dump()
    doc["sms_enabled"] = sms_service.sms_enabled()
    doc["whatsapp_enabled"] = sms_service.whatsapp_enabled()
    return doc


@batch2_router.put("/me/contacts")
async def update_my_contacts(payload: ExternalContactUpdate, request: Request):
    user = await _user_dep(request)
    patch: Dict[str, Any] = {"updated_at": _now_iso()}
    if payload.phone_e164 is not None:
        norm = sms_service.normalize_phone_e164(payload.phone_e164) if payload.phone_e164 else None
        if payload.phone_e164 and not norm:
            raise HTTPException(status_code=400, detail="Phone number is not a valid E.164 / Australian format")
        patch["phone_e164"] = norm
        patch["sms_verified"] = False  # invalidate verification on change
    if payload.sms_opt_in is not None:
        patch["sms_opt_in"] = bool(payload.sms_opt_in)
    if payload.whatsapp_opt_in is not None:
        patch["whatsapp_opt_in"] = bool(payload.whatsapp_opt_in)
    await _db.user_external_contacts.update_one(
        {"user_id": user["id"]},
        {"$set": {"user_id": user["id"], **patch}},
        upsert=True,
    )
    doc = await _db.user_external_contacts.find_one({"user_id": user["id"]}, {"_id": 0})
    doc["sms_enabled"] = sms_service.sms_enabled()
    doc["whatsapp_enabled"] = sms_service.whatsapp_enabled()
    return doc


class _SmsTestBody(BaseModel):
    message: str = Field(default="Hello from Wayly. SMS test message.", max_length=320)


@batch2_router.post("/sms/test")
async def send_sms_test(payload: _SmsTestBody, request: Request):
    user = await _user_dep(request)
    doc = await _db.user_external_contacts.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc or not doc.get("phone_e164"):
        raise HTTPException(status_code=400, detail="Add a phone number first in Settings → Contacts.")
    if not doc.get("sms_opt_in"):
        raise HTTPException(status_code=400, detail="Enable SMS notifications first.")
    res = await sms_service.send_sms(doc["phone_e164"], payload.message)
    return res


# ============================================================================
# FEATURE 8 — Care Plan Amendment Generator
# ============================================================================
def _generate_amendment_letter(*, participant: dict, items: List[AmendmentRequestItem], sender_name: str, sender_role: str, provider_name: Optional[str]) -> str:
    today = datetime.now(timezone.utc).strftime("%-d %B %Y") if hasattr(datetime, "strftime") else datetime.now(timezone.utc).strftime("%d %B %Y")
    prov = provider_name or participant.get("provider_name") or "your Support at Home provider"
    bullet_lines = []
    for it in items:
        verb = {
            "add": "Add",
            "increase": "Increase",
            "decrease": "Decrease",
            "remove": "Remove",
            "swap": "Swap",
        }.get(it.change_type, it.change_type.capitalize())
        bullet_lines.append(f"- {verb} {it.service_name} — {it.reason}")
    body = (
        f"{today}\n\n"
        f"To: {prov}\n"
        f"From: {sender_name} ({sender_role}) on behalf of {participant.get('name')}\n\n"
        f"Subject: Request to amend the Support at Home care plan for {participant.get('name')}\n\n"
        f"Dear {prov.split()[0] if prov else 'Provider'} team,\n\n"
        f"I'm writing on behalf of {participant.get('name')} (Classification {participant.get('classification')}) to formally request the following changes to the current care plan:\n\n"
        + "\n".join(bullet_lines)
        + "\n\nThese changes reflect a shift in needs and we'd like the updated plan agreed in writing within 14 days. "
        "Please confirm receipt of this request and the next available time to meet (in person, by phone or by video) to "
        "finalise the amended plan and pricing schedule.\n\n"
        f"You can reach me on the contact details we have on file. Thank you for your support of {participant.get('name')}.\n\n"
        "Kind regards,\n"
        f"{sender_name}\n"
        f"{sender_role}\n"
    )
    return body


@batch2_router.post("/amendments/generate")
async def create_amendment(payload: AmendmentCreate, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    p = await _get_participant_or_404(hid, payload.participant_id)
    letter = _generate_amendment_letter(
        participant=p,
        items=payload.items,
        sender_name=payload.sender_name,
        sender_role=payload.sender_role or "primary caregiver",
        provider_name=payload.provider_name,
    )
    amd = CarePlanAmendment(
        household_id=hid,
        participant_id=payload.participant_id,
        items=payload.items,
        sender_name=payload.sender_name,
        sender_role=payload.sender_role or "primary caregiver",
        provider_name=payload.provider_name or p.get("provider_name"),
        generated_letter=letter,
        created_by=user["id"],
    )
    await _db.care_plan_amendments.insert_one(amd.model_dump())
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "AMENDMENT_DRAFTED",
                         f"Drafted care-plan amendment ({len(payload.items)} change(s)) for {p.get('name')}")
    except Exception:
        pass
    return amd.model_dump()


@batch2_router.get("/amendments")
async def list_amendments(request: Request, participant_id: Optional[str] = Query(default=None)):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    q: Dict[str, Any] = {"household_id": hid}
    if participant_id:
        from security_utils import assert_participant_access
        await assert_participant_access(user["id"], participant_id)
        q["participant_id"] = participant_id
    cur = _db.care_plan_amendments.find(q, {"_id": 0}).sort("created_at", -1).limit(100)
    return {"items": [d async for d in cur]}


class _AmendmentStatusBody(BaseModel):
    status: str = Field(pattern="^(draft|sent|accepted|rejected)$")


@batch2_router.post("/amendments/{aid}/status")
async def update_amendment_status(aid: str, payload: _AmendmentStatusBody, request: Request):
    user = await _user_dep(request)
    hid = await _require_household_id(user)
    res = await _db.care_plan_amendments.update_one(
        {"id": aid, "household_id": hid},
        {"$set": {"status": payload.status}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Amendment not found")
    try:
        await _audit_log(hid, user["id"], user.get("name") or user["email"], "AMENDMENT_STATUS",
                         f"Amendment {aid[:8]} → {payload.status}")
    except Exception:
        pass
    return await _db.care_plan_amendments.find_one({"id": aid}, {"_id": 0})


# ============================================================================
# FEATURE 5 — Adviser Branded PDF (brand profile CRUD)
# ============================================================================
@batch2_router.get("/adviser/brand")
async def get_brand(request: Request):
    user = await _adviser_dep(request)
    doc = await _db.adviser_brand_profiles.find_one({"adviser_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = {
            "adviser_id": user["id"],
            "firm_name": "",
            "contact_email": user.get("email", ""),
            "contact_phone": "",
            "primary_color": "#0E2A47",
            "secondary_color": "#2BC4D6",
            "accent_color": "#7C9B82",
            "logo_b64": None,
            "logo_mime": None,
            "tagline": "",
            "footer_text": "",
            "updated_at": _now_iso(),
        }
    return doc


@batch2_router.put("/adviser/brand")
async def update_brand(payload: AdviserBrandUpdate, request: Request):
    user = await _adviser_dep(request)
    patch = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if patch.get("logo_b64") and len(patch["logo_b64"]) > 1_200_000:
        raise HTTPException(status_code=413, detail="Logo too large (max ~800 KB)")
    patch["updated_at"] = _now_iso()
    patch["adviser_id"] = user["id"]
    await _db.adviser_brand_profiles.update_one(
        {"adviser_id": user["id"]},
        {"$set": patch},
        upsert=True,
    )
    return await _db.adviser_brand_profiles.find_one({"adviser_id": user["id"]}, {"_id": 0})


# ============================================================================
# FEATURE 2 — Adviser Scenario Modeller (means-test contributions)
# ============================================================================
# Default 2026-27 figures (hard-coded). Override via DB settings doc.
_DEFAULT_MEANS_TEST = {
    "version": "2026-27",
    "basic_daily_fee_per_day": 13.61,        # 17.5% age pension single
    "income_free_area_single_weekly": 198.00,
    "income_taper_per_dollar": 0.50,
    "asset_thresholds": {
        "asset_free_threshold": 60000.0,
        "asset_max_threshold": 215000.0,
        "asset_taper_per_year": 17.50,        # 17.5% of value above floor / year
    },
    "annual_contribution_cap": 36923.27,
    "lifetime_cap_new_entrant": 135318.69,
    "lifetime_cap_grandfathered": 84571.66,
    "subsidy_by_classification": {
        "1": 10731, "2": 15910, "3": 22515, "4": 29696,
        "5": 39805, "6": 49906, "7": 60005, "8": 78106,
    },
}


async def _load_means_test_settings() -> Dict[str, Any]:
    doc = await _db.means_test_settings.find_one({"id": "current"}, {"_id": 0})
    if not doc:
        return dict(_DEFAULT_MEANS_TEST)
    merged = dict(_DEFAULT_MEANS_TEST)
    merged.update({k: v for k, v in doc.items() if k != "id"})
    return merged


def _compute_scenario(inputs: ScenarioInputs, mts: Dict[str, Any]) -> ScenarioOutputs:
    # Basic daily fee always payable (unless full pensioner with no income — kept for transparency)
    daily_fee = float(mts["basic_daily_fee_per_day"])
    annual_basic = daily_fee * 365

    # Income-tested contribution
    weekly_income = inputs.annual_income / 52.0
    free_area = float(mts["income_free_area_single_weekly"]) * (1.5 if inputs.partner_status == "couple" else 1.0)
    income_taper = float(mts["income_taper_per_dollar"])
    income_tested_weekly = max(0.0, (weekly_income - free_area) * income_taper)
    income_tested_yearly = income_tested_weekly * 52

    # Asset-tested
    at = mts["asset_thresholds"]
    free = float(at["asset_free_threshold"])
    cap = float(at["asset_max_threshold"])
    taper = float(at["asset_taper_per_year"]) / 100.0
    excess = max(0.0, inputs.assets - free)
    if not inputs.homeowner:
        excess = max(0.0, excess - 100000.0)  # non-homeowner exemption
    excess = min(excess, max(0.0, cap - free)) if cap > free else excess
    asset_tested_yearly = excess * taper

    # Pensioners get a discount (illustrative — 50% reduction)
    means_contribution_yearly = (income_tested_yearly + asset_tested_yearly)
    if inputs.pensioner:
        means_contribution_yearly *= 0.5

    annual_cap = float(mts["annual_contribution_cap"])
    total_annual_contrib = min(annual_basic + means_contribution_yearly, annual_cap)
    contribution_per_day = total_annual_contrib / 365.0
    contribution_per_quarter = total_annual_contrib / 4.0

    # Subsidy: govt covers the gap to classification annual budget
    cls_key = str(int(inputs.classification))
    subsidy_total = float(mts["subsidy_by_classification"].get(cls_key, 0))
    govt_subsidy = max(0.0, subsidy_total - total_annual_contrib)

    # Means-test band
    if means_contribution_yearly <= 0:
        band = "Low means (basic fee only)"
    elif means_contribution_yearly < 5000:
        band = "Partially supported"
    elif means_contribution_yearly < 20000:
        band = "Moderate means"
    else:
        band = "Fully self-funded (capped)"

    # Lifetime cap years
    lifetime_cap = float(mts.get("lifetime_cap_grandfathered", _DEFAULT_MEANS_TEST["lifetime_cap_grandfathered"]))  # fallback
    if total_annual_contrib > 0:
        years_to_cap = lifetime_cap / total_annual_contrib
    else:
        years_to_cap = 999.0

    return ScenarioOutputs(
        contribution_per_day=round(contribution_per_day, 2),
        contribution_per_quarter=round(contribution_per_quarter, 2),
        contribution_per_year=round(total_annual_contrib, 2),
        government_subsidy_per_year=round(govt_subsidy, 2),
        lifetime_cap_years=round(min(years_to_cap, 999.0), 2),
        means_test_band=band,
        assumptions={
            "version": mts["version"],
            "basic_daily_fee": daily_fee,
            "income_free_area_weekly": free_area,
            "income_taper": income_taper,
            "asset_taper_pct_per_year": taper * 100,
            "asset_free_threshold": free,
            "annual_contribution_cap": annual_cap,
            "classification_subsidy_annual": subsidy_total,
            "pensioner_discount_applied": inputs.pensioner,
        },
    )


@batch2_router.post("/adviser/scenarios/calc")
async def calc_scenario(payload: ScenarioInputs, request: Request):
    """Pure compute — does not persist. Used for live-preview as adviser edits inputs."""
    await _adviser_dep(request)
    mts = await _load_means_test_settings()
    out = _compute_scenario(payload, mts)
    return out.model_dump()


@batch2_router.post("/adviser/scenarios")
async def create_scenario(payload: ScenarioCreate, request: Request):
    user = await _adviser_dep(request)
    mts = await _load_means_test_settings()
    out = _compute_scenario(payload.inputs, mts)
    scenario = AdviserScenario(
        adviser_id=user["id"],
        client_id=payload.client_id,
        name=payload.name,
        inputs=payload.inputs,
        outputs=out,
    )
    await _db.adviser_scenarios.insert_one(scenario.model_dump())
    return scenario.model_dump()


@batch2_router.get("/adviser/scenarios")
async def list_scenarios(request: Request, client_id: Optional[str] = Query(default=None)):
    user = await _adviser_dep(request)
    q: Dict[str, Any] = {"adviser_id": user["id"]}
    if client_id:
        q["client_id"] = client_id
    cur = _db.adviser_scenarios.find(q, {"_id": 0}).sort("created_at", -1).limit(100)
    return {"items": [d async for d in cur]}


@batch2_router.delete("/adviser/scenarios/{sid}")
async def delete_scenario(sid: str, request: Request):
    user = await _adviser_dep(request)
    res = await _db.adviser_scenarios.delete_one({"id": sid, "adviser_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"ok": True}


@batch2_router.get("/adviser/means-test/settings")
async def get_means_test_settings(request: Request):
    await _adviser_dep(request)
    return await _load_means_test_settings()


class _MeansTestPatch(BaseModel):
    basic_daily_fee_per_day: Optional[float] = None
    income_free_area_single_weekly: Optional[float] = None
    income_taper_per_dollar: Optional[float] = None
    annual_contribution_cap: Optional[float] = None


@batch2_router.put("/adviser/means-test/settings")
async def update_means_test_settings(payload: _MeansTestPatch, request: Request):
    user = await _adviser_dep(request)
    patch = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not patch:
        return await _load_means_test_settings()
    patch["updated_at"] = _now_iso()
    patch["updated_by"] = user["id"]
    await _db.means_test_settings.update_one(
        {"id": "current"},
        {"$set": {"id": "current", **patch}},
        upsert=True,
    )
    return await _load_means_test_settings()


# ============================================================================
# FEATURE 7 — Adviser Multi-household Alert Dashboard
# ============================================================================
@batch2_router.get("/adviser/alerts/global")
async def adviser_global_alerts(
    request: Request,
    severity: Optional[str] = Query(default=None),
    type_: Optional[str] = Query(default=None, alias="type"),
    limit: int = Query(default=100, ge=1, le=300),
):
    user = await _adviser_dep(request)
    # Resolve linked households for this adviser
    cur = _db.adviser_clients.find(
        {"adviser_user_id": user["id"], "linked_household_id": {"$ne": None}},
        {"_id": 0, "linked_household_id": 1, "client_name": 1, "linked_user_id": 1, "id": 1},
    )
    clients = [c async for c in cur]
    hh_ids = [c["linked_household_id"] for c in clients if c.get("linked_household_id")]
    hh_to_client = {c["linked_household_id"]: c for c in clients if c.get("linked_household_id")}

    if not hh_ids:
        return {"items": [], "client_count": 0}

    alerts: List[Dict[str, Any]] = []

    # 1) Statement anomalies — from stored statements
    if not type_ or type_ == "anomaly":
        stmt_cur = _db.statements.find(
            {"household_id": {"$in": hh_ids}, "anomalies": {"$exists": True, "$ne": []}},
            {"_id": 0, "id": 1, "household_id": 1, "uploaded_at": 1, "filename": 1, "anomalies": 1, "period_label": 1},
        ).sort("uploaded_at", -1).limit(200)
        async for s in stmt_cur:
            for a in (s.get("anomalies") or []):
                sev = a.get("severity", "info")
                if severity and sev != severity:
                    continue
                client = hh_to_client.get(s["household_id"], {})
                alerts.append({
                    "type": "anomaly",
                    "severity": sev,
                    "title": a.get("title", "Anomaly"),
                    "detail": a.get("detail") or "",
                    "client_id": client.get("id"),
                    "client_name": client.get("client_name"),
                    "household_id": s["household_id"],
                    "source_id": s["id"],
                    "source_label": f"{s.get('filename')} · {s.get('period_label') or ''}".strip(),
                    "created_at": s.get("uploaded_at"),
                })

    # 2) Hospital admissions — active ones
    if not type_ or type_ == "hospital":
        ha_cur = _db.hospital_admissions.find(
            {"household_id": {"$in": hh_ids}, "status": "active"},
            {"_id": 0},
        ).sort("admission_date", -1).limit(100)
        async for h in ha_cur:
            client = hh_to_client.get(h["household_id"], {})
            alerts.append({
                "type": "hospital",
                "severity": "alert",
                "title": f"Hospital admission · {h.get('hospital_name')}",
                "detail": h.get("reason") or "",
                "client_id": client.get("id"),
                "client_name": client.get("client_name"),
                "household_id": h["household_id"],
                "source_id": h["id"],
                "source_label": h.get("hospital_name"),
                "created_at": h.get("created_at"),
                "rcp_requested": bool(h.get("rcp_requested")),
            })

    # 3) Amendments — non-final state
    if not type_ or type_ == "amendment":
        am_cur = _db.care_plan_amendments.find(
            {"household_id": {"$in": hh_ids}, "status": {"$in": ["draft", "sent"]}},
            {"_id": 0},
        ).sort("created_at", -1).limit(100)
        async for am in am_cur:
            client = hh_to_client.get(am["household_id"], {})
            alerts.append({
                "type": "amendment",
                "severity": "warning",
                "title": f"Care-plan amendment · {len(am.get('items') or [])} change(s)",
                "detail": am.get("status", ""),
                "client_id": client.get("id"),
                "client_name": client.get("client_name"),
                "household_id": am["household_id"],
                "source_id": am["id"],
                "source_label": am.get("provider_name"),
                "created_at": am.get("created_at"),
            })

    alerts.sort(key=lambda a: a.get("created_at") or "", reverse=True)
    return {"items": alerts[:limit], "client_count": len(clients)}
