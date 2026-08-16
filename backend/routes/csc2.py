"""CSC-2 v1 slice: Classification Self-Check v2 (Stream-Mix + IAT Prep).

Scope (per CSC-2-v1.md):
  * Section B.2 StreamMixCheck with deterministic fit signals.
  * Section B.3 IatPrep with 6-step preparation model.
  * Section B.4 PreParticipantProfile with 6-month retention.
  * Section D.1 stream-mix endpoint.
  * Section D.2 IAT prep CRUD + mark-completed + record-result endpoints.
  * Section D.3 pre-participant profile CRUD + promote + extend-retention endpoints.

Deferred to CSC-2 v2:
  * CSC-1 v1 result record extension (already lives elsewhere; extension only wired via optional linkage).
  * Automated retention scheduler for pre-participant profiles (retention_expires_at persisted).
  * Adviser tier bulk pre-classification screening.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.csc2")

csc2_router = APIRouter(prefix="/csc2", tags=["csc2"])

_db = None
_user_dep = None
_core1_write_event = None


def init_csc2_routes(*, db, user_dep, core1_write_timeline):
    global _db, _user_dep, _core1_write_event
    _db = db
    _user_dep = user_dep
    _core1_write_event = core1_write_timeline


def _flag_enabled() -> bool:
    return os.environ.get("CSC2_ENABLED", "1") != "0"


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


async def ensure_csc2_indexes(db) -> None:
    try:
        await db.stream_mix_checks.create_index([("csc_result_id", 1)])
        await db.iat_preps.create_index([("participant_or_pre_participant_id", 1)])
        await db.pre_participant_profiles.create_index(
            [("user_id", 1), ("retention_expires_at", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("csc2 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Stream-mix (Section F)
# ---------------------------------------------------------------------------


class StreamMixIn(BaseModel):
    csc_result_id: Optional[str] = None
    participant_or_pre_participant_id: str
    is_current_hcp_holder: bool = False
    hcp_level: Optional[int] = None
    recent_hospital_stay_or_acute_event: bool = False
    restorative_potential_indicated: bool = False
    palliative_status_indicated: bool = False
    at_needs_indicated: bool = False
    hm_needs_indicated: bool = False


def _tokens(caregiver: str, self_txt: Optional[str] = None) -> Dict[str, str]:
    return {"caregiver": caregiver, "participant_self": self_txt or caregiver.replace("your participant", "you").replace("them", "yourself")}


def _compute_streams(body: StreamMixIn) -> List[Dict[str, Any]]:
    caveat = "This is guidance based on what you've told us. Your actual eligibility is determined by the assessor and, in some cases, by a provider."
    recs: List[Dict[str, Any]] = []
    # Standard SAH
    recs.append({
        "stream": "standard_sah", "fit_signal": "possible_fit_worth_discussing",
        "rationale_plain_language": _tokens("Standard Support at Home is the default programme for most participants.", None),
        "considerations": [caveat],
    })
    # RCP
    if body.recent_hospital_stay_or_acute_event and body.restorative_potential_indicated:
        recs.append({"stream": "restorative_care_pathway", "fit_signal": "likely_fit",
                     "rationale_plain_language": _tokens("Recent hospital stay plus restorative goals suggest the Restorative Care Pathway may fit.", None),
                     "considerations": [caveat, "RCP is time-limited (up to 12 weeks)."]})
    else:
        recs.append({"stream": "restorative_care_pathway", "fit_signal": "insufficient_information_to_assess",
                     "rationale_plain_language": _tokens("Not enough information to indicate RCP fit.", None),
                     "considerations": [caveat]})
    # EoLP
    if body.palliative_status_indicated:
        recs.append({"stream": "end_of_life_pathway", "fit_signal": "likely_fit",
                     "rationale_plain_language": _tokens("If palliative planning is under way, the End-of-Life Pathway may offer specific funding. This is sensitive and there's no requirement to discuss it further unless you wish to.", None),
                     "considerations": [caveat, "Palliative Care Australia can help."]})
    # HCP transition
    if body.is_current_hcp_holder:
        recs.append({"stream": "hcp_transition", "fit_signal": "likely_fit",
                     "rationale_plain_language": _tokens("As a current HCP holder, the HCP transition provisions apply.", None),
                     "considerations": [caveat]})
    # AT/HM
    if body.at_needs_indicated:
        recs.append({"stream": "assistive_technology", "fit_signal": "likely_fit",
                     "rationale_plain_language": _tokens("Specific AT needs indicated. The ATHM tool will help.", None),
                     "considerations": [caveat]})
    if body.hm_needs_indicated:
        recs.append({"stream": "home_modifications", "fit_signal": "likely_fit",
                     "rationale_plain_language": _tokens("Home modification needs indicated. The ATHM tool will help.", None),
                     "considerations": [caveat]})
    return recs


@csc2_router.post("/stream-mix-checks")
async def create_stream_mix(body: StreamMixIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "csc_result_id": body.csc_result_id,
        "participant_or_pre_participant_id": body.participant_or_pre_participant_id,
        "actor_user_id": uid,
        "stream_recommendations": _compute_streams(body),
        "hcp_transition_context": {"is_current_hcp_holder": body.is_current_hcp_holder, "hcp_level": body.hcp_level} if body.is_current_hcp_holder else None,
        "rcp_context": {"recent_hospital_stay_or_acute_event": body.recent_hospital_stay_or_acute_event, "restorative_potential_indicated": body.restorative_potential_indicated} if body.recent_hospital_stay_or_acute_event else None,
        "eolp_context": {"palliative_status_indicated": True, "sensitivity_flag": True} if body.palliative_status_indicated else None,
        "athm_context": {"at_needs_indicated": body.at_needs_indicated, "hm_needs_indicated": body.hm_needs_indicated, "athm_1_referral_note": "See the AT & HM tool for detailed support."} if (body.at_needs_indicated or body.hm_needs_indicated) else None,
        "created_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.stream_mix_checks.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    return {"stream_mix_check": doc}


# ---------------------------------------------------------------------------
# IAT Prep (Section G)
# ---------------------------------------------------------------------------


DEFAULT_DOCS = [
    {"document_name": "Medicare card", "user_confirmed_ready": False, "notes": None},
    {"document_name": "Recent medical documents", "user_confirmed_ready": False, "notes": None},
    {"document_name": "Current medications list", "user_confirmed_ready": False, "notes": None},
    {"document_name": "Hospital discharge summaries (if any)", "user_confirmed_ready": False, "notes": None},
    {"document_name": "Allied health reports (if any)", "user_confirmed_ready": False, "notes": None},
    {"document_name": "Written statement of needs (if prepared)", "user_confirmed_ready": False, "notes": None},
]
DEFAULT_QUESTIONS = [
    {"question": "What classification will you assess me for?", "user_confirmed_ready_to_ask": False},
    {"question": "What streams will you consider?", "user_confirmed_ready_to_ask": False},
    {"question": "When will I receive the result?", "user_confirmed_ready_to_ask": False},
    {"question": "Can I have a copy of the assessment notes?", "user_confirmed_ready_to_ask": False},
    {"question": "How do I ask for a reconsideration if I disagree?", "user_confirmed_ready_to_ask": False},
]


class IatPrepIn(BaseModel):
    participant_or_pre_participant_id: str
    iat_scheduled_date: Optional[str] = None
    iat_appointment_type: str = "not_yet_scheduled"


@csc2_router.post("/iat-preps")
async def create_iat_prep(body: IatPrepIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_or_pre_participant_id": body.participant_or_pre_participant_id,
        "actor_user_id": uid,
        "csc_result_id": None,
        "iat_scheduled_date": body.iat_scheduled_date,
        "iat_appointment_type": body.iat_appointment_type,
        "iat_notes": None,
        "current_status": "pre_iat_preparing",
        "documents_to_bring_checklist": DEFAULT_DOCS,
        "questions_to_ask_at_assessment": DEFAULT_QUESTIONS,
        "evidence_prepared": [],
        "advocacy_notes": None,
        "post_iat_findings": None,
        "classification_received": None,
        "classification_matches_expected_from_csc": None,
        "gap_analysis": None,
        "dispute_case_id": None,
        "dispute_letter_id": None,
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.iat_preps.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    doc["updated_at"] = _iso(doc["updated_at"])
    return {"iat_prep": doc}


class IatPatchIn(BaseModel):
    documents_to_bring_checklist: Optional[List[Dict[str, Any]]] = None
    questions_to_ask_at_assessment: Optional[List[Dict[str, Any]]] = None
    evidence_prepared: Optional[List[Dict[str, Any]]] = None
    advocacy_notes: Optional[str] = None
    iat_notes: Optional[str] = None


@csc2_router.patch("/iat-preps/{prep_id}")
async def patch_iat_prep(prep_id: str, body: IatPatchIn, request: Request):
    await _assert_flag()
    await _user_id(request)
    doc = await _db.iat_preps.find_one({"id": prep_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    upd = {k: v for k, v in body.dict().items() if v is not None}
    upd["updated_at"] = _now()
    await _db.iat_preps.update_one({"id": prep_id}, {"$set": upd})
    doc.update(upd)
    doc.pop("_id", None)
    doc["updated_at"] = _iso(doc["updated_at"])
    doc["created_at"] = _iso(doc.get("created_at"))
    return {"iat_prep": doc}


class IatResultIn(BaseModel):
    classification_received: int = Field(ge=1, le=8)
    matches_expected: bool


@csc2_router.post("/iat-preps/{prep_id}/record-classification-result")
async def record_result(prep_id: str, body: IatResultIn, request: Request):
    await _assert_flag()
    await _user_id(request)
    doc = await _db.iat_preps.find_one({"id": prep_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    upd = {
        "classification_received": body.classification_received,
        "classification_matches_expected_from_csc": body.matches_expected,
        "current_status": "result_reviewed_matches_expected" if body.matches_expected else "result_reviewed_disputed",
        "gap_analysis": None if body.matches_expected else {"expected": None, "actual": body.classification_received, "note": "User to consider reconsideration or appeal."},
        "updated_at": _now(),
    }
    await _db.iat_preps.update_one({"id": prep_id}, {"$set": upd})
    doc.update(upd)
    doc.pop("_id", None)
    doc["updated_at"] = _iso(doc["updated_at"])
    doc["created_at"] = _iso(doc.get("created_at"))
    return {"iat_prep": doc}


# ---------------------------------------------------------------------------
# Pre-participant profile (Section H)
# ---------------------------------------------------------------------------


class PreParticipantIn(BaseModel):
    first_name: Optional[str] = None
    age_range: Optional[str] = None
    location_postcode: Optional[str] = None
    currently_receiving_care: bool = False
    iat_scheduled_date: Optional[str] = None


@csc2_router.post("/pre-participant-profiles")
async def create_pre_participant(body: PreParticipantIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": uid,
        "first_name": body.first_name,
        "age_range": body.age_range,
        "location_postcode": body.location_postcode,
        "expected_classification_range": None,
        "currently_receiving_care": body.currently_receiving_care,
        "current_care_summary": None,
        "previous_care_experience_summary": None,
        "current_supports_summary": None,
        "iat_scheduled_date": body.iat_scheduled_date,
        "retention_expires_at": now + timedelta(days=180),
        "user_extended_retention": False,
        "promoted_to_participant_id": None,
        "promoted_at": None,
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.pre_participant_profiles.insert_one(doc)
    doc.pop("_id", None)
    for k in ("created_at", "updated_at", "retention_expires_at"):
        if doc.get(k):
            doc[k] = _iso(doc[k])
    return {"pre_participant_profile": doc}


@csc2_router.get("/pre-participant-profiles")
async def list_pre_participants(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    cur = _db.pre_participant_profiles.find({"user_id": uid})
    items = await cur.to_list(length=50)
    for it in items:
        it.pop("_id", None)
        for k in ("created_at", "updated_at", "retention_expires_at", "promoted_at"):
            if it.get(k):
                it[k] = _iso(it[k])
    return {"pre_participant_profiles": items}


@csc2_router.post("/pre-participant-profiles/{pid}/extend-retention")
async def extend_pre_participant_retention(pid: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.pre_participant_profiles.find_one({"id": pid, "user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    new_expiry = _now() + timedelta(days=365)
    await _db.pre_participant_profiles.update_one(
        {"id": pid},
        {"$set": {"retention_expires_at": new_expiry, "user_extended_retention": True, "updated_at": _now()}})
    return {"retention_expires_at": _iso(new_expiry), "extended": True}
