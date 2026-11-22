"""CS-1 v1 slice: Carer Support Assessment.

Scope for this v1 slice (per CS-1-v1.md):
  * Section B.1: CarerAssessment with field-level opt-in.
  * Section B.2: CarerHandoverPack (partial fields, no PDF generation yet).
  * Section B.3: RespitePlan with BC-2 pathway link.
  * Section B.4: SupportServiceReference seeded with authoritative Australian services.
  * Section H: Burnout self-check with deterministic composite signal.
  * Section E: Multi-step assessment (fields captured as one submission for v1).
  * Section F: Support service directory browse.
  * Section G: Respite planning CRUD.

Deferred to CS-1 v2:
  * PDF generation for handover pack (Section I.5 stubbed).
  * FC-2 sensitive content detection reuse (basic stub).
  * Automated retention scheduler (retention_expires_at set; no cron yet).
  * Caregiver peer support signals.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.cs1")

cs1_router = APIRouter(prefix="/cs1", tags=["cs1"])

_db = None
_user_dep = None
_core1_write_event = None

DEFAULT_ASSESSMENT_RETENTION_MONTHS = 12
DEFAULT_HANDOVER_RETENTION_MONTHS = 24


def init_cs1_routes(*, db, user_dep, core1_write_timeline):
    global _db, _user_dep, _core1_write_event
    _db = db
    _user_dep = user_dep
    _core1_write_event = core1_write_timeline


def _flag_enabled() -> bool:
    return os.environ.get("CS1_ENABLED", "1") != "0"


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


# Curated support services (Section B.4)
SUPPORT_SERVICES = [
    {"slug": "carer_gateway", "service_name": "Carer Gateway", "category": "carer_helpline",
     "description": "Australia's national carer support service. Practical services and emotional support.",
     "contact_phone": "1800 422 737", "contact_website": "https://www.carergateway.gov.au",
     "region_availability": "national", "eligibility_summary": "Unpaid carers of any age",
     "cost_summary": "Free"},
    {"slug": "lifeline", "service_name": "Lifeline", "category": "crisis_support",
     "description": "24/7 crisis support and suicide prevention.",
     "contact_phone": "13 11 14", "contact_website": "https://www.lifeline.org.au",
     "region_availability": "national", "eligibility_summary": "Anyone in crisis",
     "cost_summary": "Free"},
    {"slug": "1800respect", "service_name": "1800RESPECT", "category": "crisis_support",
     "description": "National sexual assault, family and domestic violence counselling service.",
     "contact_phone": "1800 737 732", "contact_website": "https://www.1800respect.org.au",
     "region_availability": "national", "eligibility_summary": "Anyone affected by violence",
     "cost_summary": "Free"},
    {"slug": "opan", "service_name": "OPAN (Older Persons Advocacy Network)",
     "category": "peer_support",
     "description": "Free advocacy service for older people and their carers.",
     "contact_phone": "1800 700 600", "contact_website": "https://opan.org.au",
     "region_availability": "national", "eligibility_summary": "Older people and their carers",
     "cost_summary": "Free"},
    {"slug": "my_aged_care", "service_name": "My Aged Care", "category": "respite_service",
     "description": "Government gateway to respite and residential aged care services.",
     "contact_phone": "1800 200 422", "contact_website": "https://www.myagedcare.gov.au",
     "region_availability": "national", "eligibility_summary": "Any Australian resident aged 65+",
     "cost_summary": "Fees vary"},
    {"slug": "elder_abuse_helpline", "service_name": "Elder Abuse Helpline",
     "category": "crisis_support",
     "description": "Confidential information, support and referrals about elder abuse.",
     "contact_phone": "1800 353 374", "contact_website": "https://compass.info",
     "region_availability": "national", "eligibility_summary": "Anyone affected by elder abuse",
     "cost_summary": "Free"},
]


async def ensure_cs1_indexes(db) -> None:
    try:
        await db.carer_assessments.create_index(
            [("caregiver_user_id", 1), ("assessment_date", -1)])
        await db.carer_handover_packs.create_index([("caregiver_user_id", 1)])
        await db.respite_plans.create_index(
            [("caregiver_user_id", 1), ("planned_start_date", -1)])
        await db.support_service_references.create_index([("slug", 1)], unique=True)
        # Seed directory (idempotent)
        for svc in SUPPORT_SERVICES:
            doc = {**svc, "last_verified_at": datetime.now(timezone.utc)}
            await db.support_service_references.update_one(
                {"slug": svc["slug"]}, {"$set": doc}, upsert=True)
    except Exception as e:  # pragma: no cover
        logger.warning("cs1 index/seed skipped: %s", e)


# ---------------------------------------------------------------------------
# Burnout composite (Section H.3)
# ---------------------------------------------------------------------------


def _compute_burnout(b: Dict[str, Any]) -> str:
    """Deterministic composite: low / moderate / elevated / high."""
    if not b:
        return "low"
    level_map = {"none": 0, "mild": 1, "moderate": 2, "high": 3, "severe": 4}
    fatigue = level_map.get(b.get("fatigue_level"), 0)
    emotional = level_map.get(b.get("emotional_exhaustion"), 0)
    isolation = level_map.get(b.get("isolation_feelings"), 0)
    sleep_map = {"good": 0, "fair": 1, "poor": 2, "very_poor": 3}
    sleep = sleep_map.get(b.get("sleep_quality"), 0)
    self_care_map = {"adequate": 0, "limited": 1, "minimal": 2, "none": 3}
    self_care = self_care_map.get(b.get("self_care_time"), 0)

    max_level = max(fatigue, emotional, isolation)
    if max_level >= 4 or sleep >= 3 or self_care >= 3:
        return "high"
    if max_level >= 3 or sleep >= 2 or self_care >= 2:
        return "elevated"
    if max_level >= 2 or sleep >= 1 or self_care >= 1:
        return "moderate"
    return "low"


def _burnout_response(signal: str) -> Dict[str, Any]:
    templates = {
        "low": {
            "message": "Sounds like you're managing well right now. Keep looking after yourself.",
            "recommended_resources": ["carer_gateway"],
        },
        "moderate": {
            "message": "Some things sound like they're wearing on you. There's help available if you want it.",
            "recommended_resources": ["carer_gateway", "opan"],
        },
        "elevated": {
            "message": "You're carrying quite a lot right now. Please consider reaching out to Carer Gateway.",
            "recommended_resources": ["carer_gateway", "1800respect", "opan"],
        },
        "high": {
            "message": "It sounds like you're really struggling. You do not have to carry this alone. Please consider phoning one of the numbers listed.",
            "recommended_resources": ["lifeline", "carer_gateway", "1800respect"],
            "emergency_note": "If you are in immediate danger, please call 000.",
        },
    }
    return templates.get(signal, templates["low"])


# Desired-support / constraint → relevant directory services (Section F). Lets the
# results screen point to more than one generic list, tailored to what the carer said.
_DESIRED_TO_SLUGS = {
    "more_respite": ["my_aged_care", "carer_gateway"],
    "financial_support": ["carer_gateway", "my_aged_care"],
    "counselling": ["carer_gateway", "lifeline", "1800respect"],
    "peer_support": ["opan", "carer_gateway"],
    "education": ["carer_gateway"],
    "practical_help": ["carer_gateway", "my_aged_care"],
    "understanding": ["opan", "carer_gateway"],
}
_CONSTRAINT_TO_SLUGS = {
    "own_health": ["carer_gateway"],
    "social_isolation": ["opan", "carer_gateway"],
    "family_conflict": ["1800respect", "elder_abuse_helpline"],
    "emotional": ["lifeline", "carer_gateway"],
}

_STRENGTH_LABEL = {
    "patience": "patience", "organisation": "organisation", "medical_knowledge": "medical knowledge",
    "physical_capacity": "physical capacity", "emotional_resilience": "emotional resilience",
    "communication": "communication", "other": "other strengths",
}
_DESIRED_LABEL = {
    "more_respite": "more respite", "financial_support": "financial support", "counselling": "counselling",
    "peer_support": "peer support", "education": "education or training", "practical_help": "practical help",
    "understanding": "understanding from others",
}


def _recommend_resources(desired: List[str], constraints: List[str], base: List[str]) -> List[str]:
    slugs: List[str] = list(base or [])
    for d in desired or []:
        slugs.extend(_DESIRED_TO_SLUGS.get(d, []))
    for c in constraints or []:
        slugs.extend(_CONSTRAINT_TO_SLUGS.get(c, []))
    if not slugs:
        slugs = ["carer_gateway"]
    # De-dupe, preserve order, cap.
    seen, out = set(), []
    for s in slugs:
        if s not in seen:
            seen.add(s)
            out.append(s)
    return out[:6]


def _humanise_list(items: List[str], mapping: Dict[str, str]) -> str:
    labels = [mapping.get(i, i.replace("_", " ")) for i in (items or [])]
    labels = [l for l in labels if l]
    if not labels:
        return ""
    if len(labels) == 1:
        return labels[0]
    if len(labels) == 2:
        return f"{labels[0]} and {labels[1]}"
    return ", ".join(labels[:-1]) + f", and {labels[-1]}"


def _build_carer_summary(body: "CarerAssessmentIn", burnout_signal: Optional[str]) -> Dict[str, Any]:
    """A warm, plain-English read-back of what the carer told us, plus an
    encouraging line and tailored next steps. Deterministic (no LLM)."""
    strengths = _humanise_list(body.self_reported_strengths, _STRENGTH_LABEL)
    desired = _humanise_list(body.desired_support, _DESIRED_LABEL)
    hours = None
    try:
        hours = int((body.capacity_indicators or {}).get("hours_per_week_caring") or 0) or None
    except Exception:
        hours = None

    lines: List[str] = []
    if strengths:
        lines.append(f"You bring real {strengths} to your caring role, and that matters.")
    else:
        lines.append("Showing up for someone every day takes real strength, even on the days it does not feel like it.")
    if hours:
        lines.append(f"You told us you spend around {hours} hours a week caring. That is a big part of your life to give.")
    if body.constraints_reported:
        lines.append("You also named some things that are making it harder right now. Naming them is the first step to getting the right support.")
    summary = " ".join(lines)

    encouragement_map = {
        "low": "You seem to be holding things steady. Keep protecting the small routines that keep you well.",
        "moderate": "A few things are starting to wear on you. A little support now can stop it building up.",
        "elevated": "You are carrying a lot at the moment. Please be as kind to yourself as you are to the person you care for.",
        "high": "This sounds really heavy right now. You deserve support too, and reaching out is a sign of strength, not failure.",
    }
    encouragement = encouragement_map.get(burnout_signal or "low", encouragement_map["low"])

    next_steps: List[str] = []
    if desired:
        next_steps.append(f"You said {desired} would help most. The contacts below can start you on that.")
    if burnout_signal in ("elevated", "high"):
        next_steps.append("Consider calling Carer Gateway on 1800 422 737 for practical and emotional support.")
    next_steps.append("Book a gentle check-in with yourself in a few weeks so you keep noticing how you are travelling.")
    if "respite_formal" not in (body.support_used_currently or []) and "respite_informal" not in (body.support_used_currently or []):
        next_steps.append("If you have never tried respite, even a short break can make a real difference.")

    return {"personal_summary": summary, "encouragement": encouragement, "next_steps": next_steps}


# ---------------------------------------------------------------------------
# Carer assessment (Sections B.1, D.1, E)
# ---------------------------------------------------------------------------


class BurnoutSelfReport(BaseModel):
    fatigue_level: Optional[str] = None
    emotional_exhaustion: Optional[str] = None
    isolation_feelings: Optional[str] = None
    sleep_quality: Optional[str] = None
    self_care_time: Optional[str] = None


class CarerAssessmentIn(BaseModel):
    participant_context_id: Optional[str] = None
    assessment_date: Optional[str] = None
    self_reported_strengths: List[str] = Field(default_factory=list)
    strengths_notes: Optional[str] = None
    capacity_indicators: Dict[str, Any] = Field(default_factory=dict)
    constraints_reported: List[str] = Field(default_factory=list)
    constraints_notes: Optional[str] = None
    support_used_currently: List[str] = Field(default_factory=list)
    burnout_self_report: Optional[BurnoutSelfReport] = None
    desired_support: List[str] = Field(default_factory=list)
    opt_in_burnout: bool = False
    opt_in_health_conditions: bool = False
    next_checkin_date: Optional[str] = None


def _view_assessment(a: dict) -> Dict[str, Any]:
    return {
        "id": a["id"],
        "caregiver_user_id": a["caregiver_user_id"],
        "participant_context_id": a.get("participant_context_id"),
        "assessment_date": a.get("assessment_date"),
        "self_reported_strengths": a.get("self_reported_strengths") or [],
        "strengths_notes": a.get("strengths_notes"),
        "capacity_indicators": a.get("capacity_indicators") or {},
        "constraints_reported": a.get("constraints_reported") or [],
        "constraints_notes": a.get("constraints_notes"),
        "support_used_currently": a.get("support_used_currently") or [],
        "burnout_self_report": a.get("burnout_self_report"),
        "burnout_composite_signal": a.get("burnout_composite_signal"),
        "burnout_response": a.get("burnout_response"),
        "desired_support": a.get("desired_support") or [],
        "resources_offered": a.get("resources_offered") or [],
        "personal_summary": a.get("personal_summary"),
        "encouragement": a.get("encouragement"),
        "next_steps": a.get("next_steps") or [],
        "next_checkin_date": a.get("next_checkin_date"),
        "created_at": _iso(a.get("created_at")),
        "retention_expires_at": _iso(a.get("retention_expires_at")),
        "caregiver_extended_retention": bool(a.get("caregiver_extended_retention")),
    }


@cs1_router.post("/assessments")
async def create_assessment(body: CarerAssessmentIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()

    # Field-level opt-in enforcement (Section C.5)
    capacity = body.capacity_indicators or {}
    if not body.opt_in_health_conditions:
        capacity = {k: v for k, v in capacity.items() if k != "has_own_health_conditions"}

    burnout_signal = None
    burnout_response = None
    burnout_dict = None
    if body.opt_in_burnout and body.burnout_self_report:
        burnout_dict = body.burnout_self_report.dict()
        burnout_signal = _compute_burnout(burnout_dict)
        burnout_dict["burnout_composite_signal"] = burnout_signal
        burnout_response = _burnout_response(burnout_signal)

    resources_offered = []
    if burnout_response:
        resources_offered = burnout_response.get("recommended_resources", [])
    # Tailor the resource list to what the carer actually asked for + their constraints.
    resources_offered = _recommend_resources(body.desired_support, body.constraints_reported, resources_offered)
    warm = _build_carer_summary(body, burnout_signal)

    doc = {
        "id": str(uuid.uuid4()),
        "caregiver_user_id": uid,
        "participant_context_id": body.participant_context_id,
        "assessment_date": body.assessment_date or _iso(now)[:10],
        "self_reported_strengths": body.self_reported_strengths,
        "strengths_notes": body.strengths_notes,
        "capacity_indicators": capacity,
        "constraints_reported": body.constraints_reported,
        "constraints_notes": body.constraints_notes,
        "support_used_currently": body.support_used_currently,
        "burnout_self_report": burnout_dict,
        "burnout_composite_signal": burnout_signal,
        "burnout_response": burnout_response,
        "desired_support": body.desired_support,
        "resources_offered": resources_offered,
        "personal_summary": warm["personal_summary"],
        "encouragement": warm["encouragement"],
        "next_steps": warm["next_steps"],
        "next_checkin_date": body.next_checkin_date,
        "resources_taken_up": [],
        "contains_sensitive_content_flag": bool(
            body.constraints_notes and any(k in (body.constraints_notes or "").lower()
                                           for k in ["hurt", "unsafe", "abuse", "harm"])),
        "created_at": now,
        "updated_at": now,
        "retention_expires_at": now + timedelta(days=DEFAULT_ASSESSMENT_RETENTION_MONTHS * 30),
        "caregiver_extended_retention": False,
        "data_residency": "ap-southeast-2",
    }
    await _db.carer_assessments.insert_one(doc)
    return {"assessment": _view_assessment(doc)}


@cs1_router.get("/assessments")
async def list_assessments(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    cur = _db.carer_assessments.find({"caregiver_user_id": uid}).sort("assessment_date", -1)
    items = await cur.to_list(length=100)
    return {"assessments": [_view_assessment(a) for a in items]}


@cs1_router.post("/assessments/{aid}/extend-retention")
async def extend_retention(aid: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.carer_assessments.find_one({"id": aid, "caregiver_user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    new_expiry = _now() + timedelta(days=24 * 30)
    await _db.carer_assessments.update_one(
        {"id": aid},
        {"$set": {"retention_expires_at": new_expiry,
                  "caregiver_extended_retention": True}})
    return {"retention_expires_at": _iso(new_expiry), "extended": True}


@cs1_router.delete("/assessments/{aid}")
async def delete_assessment(aid: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    result = await _db.carer_assessments.delete_one(
        {"id": aid, "caregiver_user_id": uid})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# In-progress draft (save & resume) — one draft per carer
# ---------------------------------------------------------------------------


class AssessmentDraftIn(BaseModel):
    form: Dict[str, Any] = Field(default_factory=dict)
    step: int = 1


@cs1_router.get("/assessment-draft")
async def get_assessment_draft(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.carer_assessment_drafts.find_one({"caregiver_user_id": uid}, {"_id": 0})
    if not doc:
        return {"draft": None}
    return {"draft": {"form": doc.get("form") or {}, "step": doc.get("step") or 1, "updated_at": _iso(doc.get("updated_at"))}}


@cs1_router.put("/assessment-draft")
async def save_assessment_draft(body: AssessmentDraftIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    await _db.carer_assessment_drafts.update_one(
        {"caregiver_user_id": uid},
        {"$set": {"caregiver_user_id": uid, "form": body.form, "step": body.step, "updated_at": now}},
        upsert=True,
    )
    return {"saved": True, "updated_at": _iso(now)}


@cs1_router.delete("/assessment-draft")
async def clear_assessment_draft(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    await _db.carer_assessment_drafts.delete_one({"caregiver_user_id": uid})
    return {"cleared": True}


class CheckinIn(BaseModel):
    next_checkin_date: Optional[str] = None


@cs1_router.post("/assessments/{aid}/checkin")
async def set_checkin(aid: str, body: CheckinIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.carer_assessments.find_one({"id": aid, "caregiver_user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    await _db.carer_assessments.update_one(
        {"id": aid}, {"$set": {"next_checkin_date": body.next_checkin_date, "updated_at": _now()}})
    return {"ok": True, "next_checkin_date": body.next_checkin_date}


# ---------------------------------------------------------------------------
# Burnout standalone self-check (Section H)
# ---------------------------------------------------------------------------


class BurnoutCheckIn(BaseModel):
    fatigue_level: Optional[str] = None
    emotional_exhaustion: Optional[str] = None
    isolation_feelings: Optional[str] = None
    sleep_quality: Optional[str] = None
    self_care_time: Optional[str] = None


@cs1_router.post("/burnout-check")
async def burnout_check(body: BurnoutCheckIn, request: Request):
    await _assert_flag()
    await _user_id(request)
    payload = body.dict()
    signal = _compute_burnout(payload)
    return {
        "composite_signal": signal,
        "response": _burnout_response(signal),
    }


# ---------------------------------------------------------------------------
# Handover pack (Sections B.2, D.2, I)
# ---------------------------------------------------------------------------


class HandoverPackIn(BaseModel):
    participant_context_id: Optional[str] = None
    my_routines: Optional[str] = None
    backup_contacts: List[Dict[str, Any]] = Field(default_factory=list)
    my_medical_needs: Optional[str] = None
    my_key_information: Optional[str] = None
    emergency_priorities: Optional[str] = None
    who_can_help_with_what: List[Dict[str, Any]] = Field(default_factory=list)
    shared_with_participant_handover_pack: bool = False
    opt_in_medical: bool = False


def _view_pack(p: dict) -> Dict[str, Any]:
    return {
        "id": p["id"],
        "caregiver_user_id": p["caregiver_user_id"],
        "participant_context_id": p.get("participant_context_id"),
        "my_routines": p.get("my_routines"),
        "backup_contacts": p.get("backup_contacts") or [],
        "my_medical_needs": p.get("my_medical_needs"),
        "my_key_information": p.get("my_key_information"),
        "emergency_priorities": p.get("emergency_priorities"),
        "who_can_help_with_what": p.get("who_can_help_with_what") or [],
        "shared_with_participant_handover_pack": bool(
            p.get("shared_with_participant_handover_pack")),
        "last_generated_at": _iso(p.get("last_generated_at")),
        "created_at": _iso(p.get("created_at")),
        "retention_expires_at": _iso(p.get("retention_expires_at")),
    }


@cs1_router.post("/handover-packs")
async def create_pack(body: HandoverPackIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "caregiver_user_id": uid,
        "participant_context_id": body.participant_context_id,
        "my_routines": body.my_routines,
        "backup_contacts": body.backup_contacts,
        "my_medical_needs": body.my_medical_needs if body.opt_in_medical else None,
        "my_key_information": body.my_key_information,
        "emergency_priorities": body.emergency_priorities,
        "who_can_help_with_what": body.who_can_help_with_what,
        "shared_with_participant_handover_pack": body.shared_with_participant_handover_pack,
        "generated_pdf_url": None,
        "generated_pdf_hash": None,
        "last_generated_at": None,
        "created_at": now,
        "updated_at": now,
        "retention_expires_at": now + timedelta(days=DEFAULT_HANDOVER_RETENTION_MONTHS * 30),
        "data_residency": "ap-southeast-2",
    }
    await _db.carer_handover_packs.insert_one(doc)
    return {"pack": _view_pack(doc)}


@cs1_router.get("/handover-packs")
async def list_packs(request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    cur = _db.carer_handover_packs.find({"caregiver_user_id": uid})
    packs = await cur.to_list(length=100)
    return {"packs": [_view_pack(p) for p in packs]}


async def _load_pack_or_404(pid_: str, uid: str) -> dict:
    pack = await _db.carer_handover_packs.find_one({"id": pid_}, {"_id": 0})
    if not pack or pack.get("caregiver_user_id") != uid:
        raise HTTPException(status_code=404, detail="Handover pack not found")
    return pack


@cs1_router.get("/handover-packs/{pack_id}")
async def get_pack(pack_id: str, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    pack = await _load_pack_or_404(pack_id, uid)
    return {"pack": _view_pack(pack)}


@cs1_router.patch("/handover-packs/{pack_id}")
async def update_pack(pack_id: str, body: HandoverPackIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    await _load_pack_or_404(pack_id, uid)
    update = {
        "participant_context_id": body.participant_context_id,
        "my_routines": body.my_routines,
        "backup_contacts": body.backup_contacts,
        "my_medical_needs": body.my_medical_needs if body.opt_in_medical else None,
        "my_key_information": body.my_key_information,
        "emergency_priorities": body.emergency_priorities,
        "who_can_help_with_what": body.who_can_help_with_what,
        "shared_with_participant_handover_pack": body.shared_with_participant_handover_pack,
        "updated_at": _now(),
    }
    await _db.carer_handover_packs.update_one({"id": pack_id}, {"$set": update})
    fresh = await _db.carer_handover_packs.find_one({"id": pack_id}, {"_id": 0})
    return {"pack": _view_pack(fresh)}


@cs1_router.get("/handover-packs/{pack_id}/export.pdf")
async def export_pack_pdf(pack_id: str, request: Request):
    """Render the print-ready carer handover pack PDF."""
    from fastapi.responses import Response
    from services.cs1_handover_pdf import render_handover_pack_pdf

    await _assert_flag()
    uid = await _user_id(request)
    pack = await _load_pack_or_404(pack_id, uid)

    participant_name = "the person you care for"
    ctx_id = pack.get("participant_context_id")
    if ctx_id:
        p = await _db.participants.find_one({"id": ctx_id}, {"_id": 0}) or {}
        participant_name = (
            p.get("display_name")
            or f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
            or p.get("preferred_name")
            or participant_name
        )

    pdf_bytes = render_handover_pack_pdf(pack=pack, participant_name=participant_name)
    await _db.carer_handover_packs.update_one(
        {"id": pack_id}, {"$set": {"last_generated_at": _now()}})
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="carer-handover-pack-{pack_id[:8]}.pdf"'},
    )


# ---------------------------------------------------------------------------
# Respite planning (Sections B.3, D.3, G)
# ---------------------------------------------------------------------------


class RespitePlanIn(BaseModel):
    participant_context_id: Optional[str] = None
    respite_type: str
    planned_start_date: str
    planned_end_date: Optional[str] = None
    planned_provider_name: Optional[str] = None
    planned_hours: Optional[float] = None
    budget_source: str = "standard_sah_budget"
    participant_involvement_note: Optional[str] = None
    participant_confirmed_awareness: bool = False


def _view_respite(r: dict) -> Dict[str, Any]:
    return {
        "id": r["id"],
        "caregiver_user_id": r["caregiver_user_id"],
        "respite_type": r.get("respite_type"),
        "planned_start_date": r.get("planned_start_date"),
        "planned_end_date": r.get("planned_end_date"),
        "planned_provider_name": r.get("planned_provider_name"),
        "planned_hours": r.get("planned_hours"),
        "budget_source": r.get("budget_source"),
        "participant_confirmed_awareness": bool(r.get("participant_confirmed_awareness")),
        "participant_involvement_note": r.get("participant_involvement_note"),
        "status": r.get("status", "planning"),
        "created_at": _iso(r.get("created_at")),
    }


@cs1_router.post("/respite-plans")
async def create_respite(body: RespitePlanIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "caregiver_user_id": uid,
        "participant_context_id": body.participant_context_id,
        "respite_type": body.respite_type,
        "planned_start_date": body.planned_start_date,
        "planned_end_date": body.planned_end_date,
        "planned_provider_name": body.planned_provider_name,
        "planned_hours": body.planned_hours,
        "budget_source": body.budget_source,
        "bc_2_projection_id": None,
        "participant_involvement_note": body.participant_involvement_note,
        "participant_confirmed_awareness": body.participant_confirmed_awareness,
        "status": "planning",
        "outcome_notes": None,
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.respite_plans.insert_one(doc)
    return {"plan": _view_respite(doc)}


@cs1_router.get("/respite-plans")
async def list_respite(request: Request, status: Optional[str] = None):
    await _assert_flag()
    uid = await _user_id(request)
    q: Dict[str, Any] = {"caregiver_user_id": uid}
    if status:
        q["status"] = status
    cur = _db.respite_plans.find(q).sort("planned_start_date", -1)
    plans = await cur.to_list(length=100)
    return {"plans": [_view_respite(p) for p in plans]}


class RespiteUpdateIn(BaseModel):
    status: Optional[str] = None
    outcome_notes: Optional[str] = None


@cs1_router.patch("/respite-plans/{rid}")
async def update_respite(rid: str, body: RespiteUpdateIn, request: Request):
    await _assert_flag()
    uid = await _user_id(request)
    doc = await _db.respite_plans.find_one({"id": rid, "caregiver_user_id": uid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    upd: Dict[str, Any] = {"updated_at": _now()}
    if body.status:
        upd["status"] = body.status
    if body.outcome_notes is not None:
        upd["outcome_notes"] = body.outcome_notes
    await _db.respite_plans.update_one({"id": rid}, {"$set": upd})
    doc.update(upd)
    return {"plan": _view_respite(doc)}


# ---------------------------------------------------------------------------
# Support services directory (Sections B.4, D.4, F)
# ---------------------------------------------------------------------------


@cs1_router.get("/support-services")
async def list_services(category: Optional[str] = None, region: Optional[str] = None):
    await _assert_flag()
    q: Dict[str, Any] = {}
    if category:
        q["category"] = category
    if region:
        q["region_availability"] = region
    cur = _db.support_service_references.find(q)
    items = await cur.to_list(length=200)
    return {"services": [{k: v for k, v in s.items() if k != "_id"} for s in items]}
