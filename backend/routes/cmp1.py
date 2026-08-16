"""CMP-1 v1 slice: Complaints workflow (per /app/docs/specs/CMP-1-v1.md).

Scope for this v1 slice:
  * Section D.1: Complaint CRUD (create, list, get, patch).
  * Section D.2: Basic stage transitions (advance-stage, close).
  * Section D.3: Evidence bundle scaffolding (create, propose, confirm, list).
  * Section K (minimal): Elder-abuse safeguard resources returned on the
    detail endpoint when contains_elder_abuse_indicators is true.
  * Section M (partial): LOOP-1 case creation on complaint create.

Deferred to CMP-1 v2:
  * Section I: ACQSC referral pathway (needs solicitor sign-off).
  * Section J: Ombudsman escalation.
  * Section H PDF export (needs LF-1 v2 letter compose).
  * Provider directory + bundle recipient customisation.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.cmp1")

cmp1_router = APIRouter(prefix="/cmp1", tags=["cmp1"])

_db = None
_user_dep = None
_core1_assert_access = None
_core1_write_event = None
_loop1_open_case = None

COMPLAINT_TYPES = {
    "billing_dispute", "care_quality", "worker_behaviour",
    "service_delivery_failure", "care_plan_dispute",
    "communication_breakdown", "elder_abuse", "other",
}
SEVERITIES = {"informational", "minor", "serious", "critical_urgent"}
STAGES = {
    "drafting", "stage_1_internal_provider", "stage_2_provider_senior",
    "stage_3_acqsc_referral", "stage_4_ombudsman_referral",
    "stage_5_appeals", "closed_resolved", "closed_abandoned",
}
DESIRED_OUTCOMES = {
    "correction_of_billing", "correction_of_care_quality",
    "change_of_worker", "change_of_care_plan", "formal_apology",
    "financial_compensation", "referral_to_regulator", "other",
}
STAGE_EXIT_OUTCOMES = {
    "resolved_satisfied", "resolved_unsatisfied", "no_response",
    "referred_to_next_stage", "escalated_by_user", "abandoned_by_user",
    "awaiting_action",
}
FINAL_RESOLUTIONS = {
    "resolved_satisfied", "resolved_partially_satisfied",
    "resolved_unsatisfied", "abandoned", "closed_no_response",
    "referred_elsewhere",
}
EVIDENCE_SOURCE_TYPES = {
    "statement", "invoice", "invoice_check_result", "care_plan_review",
    "contribution_estimate", "contribution_reconciliation",
    "correspondence", "voice_check", "user_note", "external_upload",
}

# Legal transitions (per Section G): forward-only within main path;
# closed states can be entered from any active stage.
LEGAL_TRANSITIONS: Dict[str, set] = {
    "drafting": {"stage_1_internal_provider", "closed_abandoned"},
    "stage_1_internal_provider": {"stage_2_provider_senior", "stage_3_acqsc_referral", "closed_resolved", "closed_abandoned"},
    "stage_2_provider_senior": {"stage_3_acqsc_referral", "closed_resolved", "closed_abandoned"},
    "stage_3_acqsc_referral": {"stage_4_ombudsman_referral", "closed_resolved", "closed_abandoned"},
    "stage_4_ombudsman_referral": {"stage_5_appeals", "closed_resolved", "closed_abandoned"},
    "stage_5_appeals": {"closed_resolved", "closed_abandoned"},
    "closed_resolved": set(),
    "closed_abandoned": {"drafting"},  # re-open allowed
}


def init_cmp1_routes(*, db, user_dep, core1_assert_access, core1_write_timeline, loop1_open_case):
    global _db, _user_dep, _core1_assert_access, _core1_write_event, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _core1_write_event = core1_write_timeline
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("CMP1_ENABLED", "1") != "0"


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


async def ensure_cmp1_indexes(db) -> None:
    """Idempotent index creation for CMP-1 collections."""
    try:
        await db.complaints.create_index([("participant_id", 1), ("created_at", -1)])
        await db.complaints.create_index([("household_id", 1), ("current_stage", 1)])
        await db.complaint_evidence_bundles.create_index([("complaint_id", 1)], unique=True)
        await db.complaint_evidence_items.create_index([("bundle_id", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("cmp1 index creation skipped: %s", e)


def _elder_abuse_safeguard() -> Dict[str, Any]:
    """Section K: safeguard resources surfaced whenever elder-abuse indicators are present."""
    return {
        "resources": [
            {"name": "Elder Abuse Helpline (1800ELDERHelp)", "phone": "1800 353 374",
             "when": "9am,5pm weekdays; free, confidential"},
            {"name": "Lifeline", "phone": "13 11 14", "when": "24/7 crisis support"},
            {"name": "Aged Care Quality and Safety Commission", "phone": "1800 951 822",
             "when": "Weekdays; formal complaints channel"},
            {"name": "Emergency (imminent safety concern)", "phone": "000", "when": "24/7"},
        ],
        "guidance_tokens": {
            "caregiver": (
                "If there is a safety concern right now, phone 000. Otherwise "
                "the Elder Abuse Helpline can help you understand the options "
                "before you decide how to proceed. Speaking to them does not "
                "commit you to anything."
            ),
            "participant_self": (
                "If you are in danger right now, phone 000. Otherwise the "
                "Elder Abuse Helpline can help you understand your options. "
                "Speaking to them does not commit you to anything."
            ),
        },
    }


def _complaint_view(c: dict, *, include_safeguard: bool = False) -> dict:
    view = {
        "id": c["id"],
        "participant_id": c["participant_id"],
        "household_id": c.get("household_id"),
        "initiated_by_user_id": c.get("initiated_by_user_id"),
        "complaint_type": c.get("complaint_type"),
        "complaint_type_notes": c.get("complaint_type_notes"),
        "severity": c.get("severity"),
        "provider_name": c.get("provider_name"),
        "provider_contact_details": c.get("provider_contact_details") or {},
        "subject_matter_summary": c.get("subject_matter_summary"),
        "incident_start_date": c.get("incident_start_date"),
        "incident_end_date": c.get("incident_end_date"),
        "is_ongoing": bool(c.get("is_ongoing")),
        "desired_outcome": c.get("desired_outcome"),
        "desired_outcome_notes": c.get("desired_outcome_notes"),
        "current_stage": c.get("current_stage", "drafting"),
        "stage_history": c.get("stage_history") or [],
        "final_resolution": c.get("final_resolution"),
        "final_resolution_notes": c.get("final_resolution_notes"),
        "final_resolution_date": c.get("final_resolution_date"),
        "is_anonymous_acqsc_submission": bool(c.get("is_anonymous_acqsc_submission")),
        "anonymity_preserved_in_bundle": bool(c.get("anonymity_preserved_in_bundle")),
        "primary_case_id": c.get("primary_case_id"),
        "related_case_ids": c.get("related_case_ids") or [],
        "evidence_bundle_id": c.get("evidence_bundle_id"),
        "contains_elder_abuse_indicators": bool(c.get("contains_elder_abuse_indicators")),
        "contains_immediate_safety_concerns": bool(c.get("contains_immediate_safety_concerns")),
        "created_at": _iso(c.get("created_at")),
        "updated_at": _iso(c.get("updated_at")),
        "last_activity_at": _iso(c.get("last_activity_at")),
    }
    if include_safeguard and view["contains_elder_abuse_indicators"]:
        view["elder_abuse_safeguard"] = _elder_abuse_safeguard()
    return view


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


class ComplaintCreate(BaseModel):
    complaint_type: str
    complaint_type_notes: Optional[str] = None
    severity: str = "minor"
    provider_name: str = Field(min_length=1, max_length=200)
    provider_contact_details: Dict[str, Any] = Field(default_factory=dict)
    subject_matter_summary: str = Field(min_length=1, max_length=3000)
    incident_start_date: Optional[str] = None
    incident_end_date: Optional[str] = None
    is_ongoing: bool = False
    desired_outcome: str
    desired_outcome_notes: Optional[str] = None
    is_anonymous_acqsc_submission: bool = False
    contains_immediate_safety_concerns: bool = False


class ComplaintPatch(BaseModel):
    complaint_type: Optional[str] = None
    complaint_type_notes: Optional[str] = None
    severity: Optional[str] = None
    provider_name: Optional[str] = None
    provider_contact_details: Optional[Dict[str, Any]] = None
    subject_matter_summary: Optional[str] = None
    incident_start_date: Optional[str] = None
    incident_end_date: Optional[str] = None
    is_ongoing: Optional[bool] = None
    desired_outcome: Optional[str] = None
    desired_outcome_notes: Optional[str] = None


def _detect_elder_abuse(complaint_type: str, subject: str) -> bool:
    if complaint_type == "elder_abuse":
        return True
    subject_lower = (subject or "").lower()
    keywords = {"hits", "hit me", "threatens", "afraid", "scared of", "won't let", "took my money",
                "financial abuse", "isolated me", "yelled", "shouting", "threaten"}
    return any(k in subject_lower for k in keywords)


@cmp1_router.post("/participants/{pid}/complaints")
async def create_complaint(pid: str, body: ComplaintCreate, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    if body.complaint_type not in COMPLAINT_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown complaint_type: {body.complaint_type}")
    if body.severity not in SEVERITIES:
        raise HTTPException(status_code=422, detail=f"Unknown severity: {body.severity}")
    if body.desired_outcome not in DESIRED_OUTCOMES:
        raise HTTPException(status_code=422, detail=f"Unknown desired_outcome: {body.desired_outcome}")

    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    contains_ea = _detect_elder_abuse(body.complaint_type, body.subject_matter_summary)
    now = _now()
    cid = str(uuid.uuid4())
    stage_history = [{
        "stage": "drafting",
        "entered_at": now,
        "exited_at": None,
        "outcome_at_exit": None,
        "exit_notes": None,
        "correspondence_at_stage": [],
    }]

    # Open a LOOP-1 case for this complaint so it appears on the participant profile.
    primary_case_id = None
    if _loop1_open_case:
        try:
            case = await _loop1_open_case(
                participant_id=pid,
                case_type="complaint_open",
                title=f"Complaint: {body.provider_name}",
                summary=body.subject_matter_summary[:280],
                source_tool="cmp1",
                source_artefact_type="complaint",
                source_artefact_id=cid,
                severity="critical" if body.severity == "critical_urgent" else (
                    "high" if body.severity == "serious" else "medium"),
                actor_type="user",
                actor_id=user.get("id"),
                metadata={"complaint_type": body.complaint_type,
                          "contains_elder_abuse_indicators": contains_ea},
                dedupe_key=f"cmp1_complaint:{cid}",
            )
            if case and case.get("id"):
                primary_case_id = case["id"]
        except Exception as e:  # pragma: no cover
            logger.warning("cmp1 case creation failed: %s", e)

    doc = {
        "id": cid,
        "participant_id": pid,
        "household_id": p.get("household_id"),
        "initiated_by_user_id": user.get("id"),
        "complaint_type": body.complaint_type,
        "complaint_type_notes": body.complaint_type_notes,
        "severity": body.severity,
        "provider_name": body.provider_name,
        "provider_contact_details": body.provider_contact_details,
        "subject_matter_summary": body.subject_matter_summary,
        "incident_start_date": body.incident_start_date,
        "incident_end_date": body.incident_end_date,
        "is_ongoing": body.is_ongoing,
        "desired_outcome": body.desired_outcome,
        "desired_outcome_notes": body.desired_outcome_notes,
        "current_stage": "drafting",
        "stage_history": stage_history,
        "final_resolution": None,
        "final_resolution_notes": None,
        "final_resolution_date": None,
        "is_anonymous_acqsc_submission": body.is_anonymous_acqsc_submission,
        "anonymity_preserved_in_bundle": body.is_anonymous_acqsc_submission,
        "primary_case_id": primary_case_id,
        "related_case_ids": [],
        "evidence_bundle_id": None,
        "contains_elder_abuse_indicators": contains_ea,
        "contains_immediate_safety_concerns": body.contains_immediate_safety_concerns,
        "created_at": now,
        "updated_at": now,
        "last_activity_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.complaints.insert_one(dict(doc))

    # Timeline event
    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=pid,
                event_type="complaint_opened",
                event_source="cmp1",
                actor_type="user",
                actor_id=user.get("id"),
                summary_tokens={
                    "caregiver": f"Complaint opened against {body.provider_name}: {body.complaint_type.replace('_', ' ')}",
                    "participant_self": f"Complaint opened against {body.provider_name}: {body.complaint_type.replace('_', ' ')}",
                },
                metadata={"complaint_id": cid, "complaint_type": body.complaint_type,
                          "severity": body.severity, "case_id": primary_case_id},
            )
        except Exception:  # pragma: no cover
            pass

    return _complaint_view(doc, include_safeguard=True)


@cmp1_router.get("/participants/{pid}/complaints")
async def list_complaints(pid: str, request: Request, stage: Optional[str] = None,
                          severity: Optional[str] = None,
                          provider: Optional[str] = None,
                          limit: int = Query(50, ge=1, le=200)):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if stage:
        if stage not in STAGES:
            raise HTTPException(status_code=422, detail=f"Unknown stage: {stage}")
        q["current_stage"] = stage
    if severity:
        if severity not in SEVERITIES:
            raise HTTPException(status_code=422, detail=f"Unknown severity: {severity}")
        q["severity"] = severity
    if provider:
        q["provider_name"] = {"$regex": provider, "$options": "i"}
    rows = []
    async for c in _db.complaints.find(q, {"_id": 0}).sort("created_at", -1).limit(limit):
        rows.append(_complaint_view(c))
    return {"complaints": rows, "count": len(rows)}


@cmp1_router.get("/complaints/{cid}")
async def get_complaint(cid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    await _core1_assert_access(user, c["participant_id"])
    return _complaint_view(c, include_safeguard=True)


@cmp1_router.patch("/complaints/{cid}")
async def patch_complaint(cid: str, body: ComplaintPatch, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Complaint not found")
    await _core1_assert_access(user, existing["participant_id"])
    update: Dict[str, Any] = {"updated_at": _now(), "last_activity_at": _now()}
    body_dict = body.model_dump(exclude_unset=True)
    for k, v in body_dict.items():
        if v is None:
            continue
        if k == "complaint_type" and v not in COMPLAINT_TYPES:
            raise HTTPException(status_code=422, detail=f"Unknown complaint_type: {v}")
        if k == "severity" and v not in SEVERITIES:
            raise HTTPException(status_code=422, detail=f"Unknown severity: {v}")
        if k == "desired_outcome" and v not in DESIRED_OUTCOMES:
            raise HTTPException(status_code=422, detail=f"Unknown desired_outcome: {v}")
        update[k] = v
    # Re-detect elder-abuse on complaint_type or subject changes.
    if "complaint_type" in body_dict or "subject_matter_summary" in body_dict:
        merged_type = update.get("complaint_type", existing["complaint_type"])
        merged_subject = update.get("subject_matter_summary", existing["subject_matter_summary"])
        update["contains_elder_abuse_indicators"] = _detect_elder_abuse(merged_type, merged_subject)
    await _db.complaints.update_one({"id": cid}, {"$set": update})
    fresh = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    return _complaint_view(fresh, include_safeguard=True)


# ---------------------------------------------------------------------------
# Stage transitions
# ---------------------------------------------------------------------------


class StageAdvanceBody(BaseModel):
    to_stage: str
    reason: str = Field(min_length=1, max_length=500)
    outcome_at_exit: Optional[str] = None
    exit_notes: Optional[str] = None


class ComplaintCloseBody(BaseModel):
    final_resolution: str
    final_resolution_notes: Optional[str] = None


@cmp1_router.post("/complaints/{cid}/advance-stage")
async def advance_stage(cid: str, body: StageAdvanceBody, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    await _core1_assert_access(user, c["participant_id"])
    if body.to_stage not in STAGES:
        raise HTTPException(status_code=422, detail=f"Unknown to_stage: {body.to_stage}")
    if body.outcome_at_exit and body.outcome_at_exit not in STAGE_EXIT_OUTCOMES:
        raise HTTPException(status_code=422, detail=f"Unknown outcome_at_exit: {body.outcome_at_exit}")

    current = c.get("current_stage", "drafting")
    if body.to_stage not in LEGAL_TRANSITIONS.get(current, set()):
        raise HTTPException(
            status_code=422,
            detail=f"Illegal transition {current} → {body.to_stage}. Allowed: {sorted(LEGAL_TRANSITIONS.get(current, set()))}",
        )

    now = _now()
    hist = list(c.get("stage_history") or [])
    if hist:
        hist[-1]["exited_at"] = now
        hist[-1]["outcome_at_exit"] = body.outcome_at_exit or "referred_to_next_stage"
        hist[-1]["exit_notes"] = body.exit_notes
    hist.append({
        "stage": body.to_stage,
        "entered_at": now,
        "exited_at": None,
        "outcome_at_exit": None,
        "exit_notes": None,
        "correspondence_at_stage": [],
    })
    await _db.complaints.update_one(
        {"id": cid},
        {"$set": {
            "current_stage": body.to_stage,
            "stage_history": hist,
            "updated_at": now,
            "last_activity_at": now,
        }},
    )

    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=c["participant_id"],
                event_type="complaint_stage_advanced",
                event_source="cmp1",
                actor_type="user",
                actor_id=user.get("id"),
                summary_tokens={
                    "caregiver": f"Complaint moved to {body.to_stage.replace('_', ' ')}",
                    "participant_self": f"Your complaint moved to {body.to_stage.replace('_', ' ')}",
                },
                metadata={"complaint_id": cid, "from_stage": current, "to_stage": body.to_stage,
                          "reason": body.reason},
            )
        except Exception:  # pragma: no cover
            pass

    fresh = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    return _complaint_view(fresh, include_safeguard=True)


@cmp1_router.post("/complaints/{cid}/close")
async def close_complaint(cid: str, body: ComplaintCloseBody, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    await _core1_assert_access(user, c["participant_id"])
    if body.final_resolution not in FINAL_RESOLUTIONS:
        raise HTTPException(status_code=422, detail=f"Unknown final_resolution: {body.final_resolution}")
    to_stage = "closed_resolved" if body.final_resolution in {
        "resolved_satisfied", "resolved_partially_satisfied"
    } else "closed_abandoned"

    now = _now()
    hist = list(c.get("stage_history") or [])
    if hist:
        hist[-1]["exited_at"] = now
        hist[-1]["outcome_at_exit"] = ("abandoned_by_user" if to_stage == "closed_abandoned"
                                       else "resolved_satisfied")
    hist.append({
        "stage": to_stage, "entered_at": now, "exited_at": None,
        "outcome_at_exit": None, "exit_notes": body.final_resolution_notes,
        "correspondence_at_stage": [],
    })
    await _db.complaints.update_one(
        {"id": cid},
        {"$set": {
            "current_stage": to_stage,
            "final_resolution": body.final_resolution,
            "final_resolution_notes": body.final_resolution_notes,
            "final_resolution_date": now.date().isoformat(),
            "stage_history": hist,
            "updated_at": now,
            "last_activity_at": now,
        }},
    )
    fresh = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    return _complaint_view(fresh, include_safeguard=True)


# ---------------------------------------------------------------------------
# Evidence bundle
# ---------------------------------------------------------------------------


class EvidenceProposeBody(BaseModel):
    source_type: str
    source_id: str
    notes: Optional[str] = None


class EvidenceConfirmBody(BaseModel):
    include: bool


def _evidence_view(e: dict) -> dict:
    return {
        "id": e["id"],
        "bundle_id": e["bundle_id"],
        "source_type": e.get("source_type"),
        "source_id": e.get("source_id"),
        "notes": e.get("notes"),
        "proposed_for_inclusion": bool(e.get("proposed_for_inclusion", True)),
        "user_confirmed_for_inclusion": bool(e.get("user_confirmed_for_inclusion")),
        "added_by_user_id": e.get("added_by_user_id"),
        "added_at": _iso(e.get("added_at")),
        "confirmed_at": _iso(e.get("confirmed_at")),
    }


@cmp1_router.post("/complaints/{cid}/evidence-bundle")
async def create_evidence_bundle(cid: str, request: Request):
    """Idempotent, returns the existing bundle if one already exists."""
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    await _core1_assert_access(user, c["participant_id"])
    existing = await _db.complaint_evidence_bundles.find_one({"complaint_id": cid}, {"_id": 0})
    if existing:
        return {"id": existing["id"], "complaint_id": cid, "created_at": _iso(existing.get("created_at")),
                "already_existed": True}
    now = _now()
    bundle_id = str(uuid.uuid4())
    await _db.complaint_evidence_bundles.insert_one({
        "id": bundle_id,
        "complaint_id": cid,
        "participant_id": c["participant_id"],
        "created_at": now,
        "created_by_user_id": user.get("id"),
    })
    await _db.complaints.update_one({"id": cid}, {"$set": {"evidence_bundle_id": bundle_id,
                                                            "updated_at": now}})
    return {"id": bundle_id, "complaint_id": cid, "created_at": _iso(now), "already_existed": False}


@cmp1_router.post("/evidence-bundles/{bid}/propose")
async def propose_evidence(bid: str, body: EvidenceProposeBody, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    if body.source_type not in EVIDENCE_SOURCE_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown source_type: {body.source_type}")
    bundle = await _db.complaint_evidence_bundles.find_one({"id": bid}, {"_id": 0})
    if not bundle:
        raise HTTPException(status_code=404, detail="Evidence bundle not found")
    await _core1_assert_access(user, bundle["participant_id"])
    # Dedupe on (bundle_id, source_type, source_id), same evidence never added twice.
    dupe = await _db.complaint_evidence_items.find_one(
        {"bundle_id": bid, "source_type": body.source_type, "source_id": body.source_id},
        {"_id": 0},
    )
    if dupe:
        return _evidence_view(dupe)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "bundle_id": bid,
        "source_type": body.source_type,
        "source_id": body.source_id,
        "notes": body.notes,
        "proposed_for_inclusion": True,
        "user_confirmed_for_inclusion": False,
        "added_by_user_id": user.get("id"),
        "added_at": now,
        "confirmed_at": None,
    }
    await _db.complaint_evidence_items.insert_one(dict(doc))
    return _evidence_view(doc)


@cmp1_router.post("/evidence-items/{iid}/confirm")
async def confirm_evidence(iid: str, body: EvidenceConfirmBody, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    item = await _db.complaint_evidence_items.find_one({"id": iid}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Evidence item not found")
    bundle = await _db.complaint_evidence_bundles.find_one({"id": item["bundle_id"]}, {"_id": 0})
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    await _core1_assert_access(user, bundle["participant_id"])
    await _db.complaint_evidence_items.update_one(
        {"id": iid},
        {"$set": {
            "user_confirmed_for_inclusion": bool(body.include),
            "confirmed_at": _now() if body.include else None,
        }},
    )
    fresh = await _db.complaint_evidence_items.find_one({"id": iid}, {"_id": 0})
    return _evidence_view(fresh)


@cmp1_router.get("/evidence-bundles/{bid}")
async def get_evidence_bundle(bid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    bundle = await _db.complaint_evidence_bundles.find_one({"id": bid}, {"_id": 0})
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    await _core1_assert_access(user, bundle["participant_id"])
    items = []
    async for it in _db.complaint_evidence_items.find({"bundle_id": bid}, {"_id": 0}).sort("added_at", 1):
        items.append(_evidence_view(it))
    return {
        "id": bundle["id"],
        "complaint_id": bundle["complaint_id"],
        "created_at": _iso(bundle.get("created_at")),
        "items": items,
        "confirmed_count": sum(1 for it in items if it["user_confirmed_for_inclusion"]),
        "proposed_count": sum(1 for it in items if not it["user_confirmed_for_inclusion"]),
    }


@cmp1_router.get("/evidence-bundles/{bid}/export.pdf")
async def export_bundle_pdf(bid: str, request: Request):
    """Render the printable evidence-bundle PDF families can hand to a
    regulator, provider senior manager, or lawyer."""
    from fastapi.responses import Response
    from services.cmp1_bundle_pdf import render_complaint_bundle_pdf

    await _assert_flag()
    user = await _user_dep(request)
    bundle = await _db.complaint_evidence_bundles.find_one({"id": bid}, {"_id": 0})
    if not bundle:
        raise HTTPException(status_code=404, detail="Bundle not found")
    await _core1_assert_access(user, bundle["participant_id"])

    complaint = await _db.complaints.find_one({"id": bundle["complaint_id"]}, {"_id": 0})
    if not complaint:
        raise HTTPException(status_code=404, detail="Complaint not found")
    items = []
    async for it in _db.complaint_evidence_items.find({"bundle_id": bid}, {"_id": 0}).sort("added_at", 1):
        items.append(it)
    participant = await _db.participants.find_one({"id": bundle["participant_id"]}, {"_id": 0}) or {}
    participant_name = participant.get("display_name") or participant.get("full_name") or "Participant"

    pdf_bytes = render_complaint_bundle_pdf(
        complaint=complaint,
        evidence_items=items,
        participant_name=participant_name,
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="complaint-bundle-{bid[:8]}.pdf"'},
    )


# ---------------------------------------------------------------------------
# ACQSC live submission (Feb 2026, per user brief).
#
# Sends the complaint packet to the Aged Care Quality and Safety Commission by
# email, records a full audit trail row in `cmp1_acqsc_submissions`, and
# advances the complaint stage. If Resend is not live, the send is logged as
# mocked so tests remain deterministic. This is the user-approved "email with
# full audit trail" pathway for CMP-1 live ACQSC referral.
# ---------------------------------------------------------------------------


ACQSC_DEFAULT_EMAIL = os.environ.get("ACQSC_SUBMISSION_EMAIL", "info@agedcarequality.gov.au")


class ACQSCSubmitBody(BaseModel):
    recipient_email: Optional[str] = None
    reply_to: Optional[str] = None
    additional_notes: Optional[str] = None
    include_evidence_bundle_link: bool = True


def _plain_stage(s: str) -> str:
    return s.replace("_", " ").replace("stage", "Stage").strip()


def _build_acqsc_email(complaint: dict, participant: Optional[dict], notes: Optional[str], evidence_link: Optional[str]) -> Dict[str, str]:
    provider = complaint.get("provider_name") or "the provider"
    pname = "the participant"
    if participant:
        pname = participant.get("preferred_name") or participant.get("first_name") or participant.get("name") or pname
    if complaint.get("is_anonymous_acqsc_submission"):
        pname = "an aged care participant (identity withheld)"

    subject = (
        f"Aged Care complaint referral, {provider}, "
        f"{complaint.get('complaint_type', 'complaint').replace('_', ' ')}"
    )

    lines_html: List[str] = []
    lines_html.append(f"<p>Dear Aged Care Quality and Safety Commission,</p>")
    lines_html.append(
        f"<p>This is a formal referral of an unresolved complaint concerning {provider}. "
        "The complaint has been through the provider's internal process and remains unresolved, "
        "so it is being escalated to the Commission for review.</p>"
    )
    lines_html.append("<h3>Complaint summary</h3>")
    lines_html.append(f"<p><strong>Participant:</strong> {pname}</p>")
    lines_html.append(f"<p><strong>Provider:</strong> {provider}</p>")
    lines_html.append(f"<p><strong>Type:</strong> {complaint.get('complaint_type', '').replace('_', ' ')}</p>")
    lines_html.append(f"<p><strong>Severity:</strong> {complaint.get('severity', '')}</p>")
    lines_html.append(f"<p><strong>Desired outcome:</strong> {complaint.get('desired_outcome', '').replace('_', ' ')}</p>")
    if complaint.get("incident_start_date"):
        end = complaint.get("incident_end_date") or ("ongoing" if complaint.get("is_ongoing") else "not stated")
        lines_html.append(f"<p><strong>Incident period:</strong> {complaint['incident_start_date']} to {end}</p>")
    lines_html.append("<h3>What happened</h3>")
    lines_html.append(f"<p>{(complaint.get('subject_matter_summary') or '').replace(chr(10), '<br>')}</p>")

    hist = complaint.get("stage_history") or []
    if hist:
        lines_html.append("<h3>Stage history</h3><ol>")
        for h in hist:
            entered = h.get("entered_at")
            entered = entered.isoformat() if hasattr(entered, "isoformat") else entered
            lines_html.append(f"<li>{_plain_stage(h.get('stage',''))}, entered {entered}. Outcome, {h.get('outcome_at_exit') or 'in progress'}.</li>")
        lines_html.append("</ol>")

    if notes:
        lines_html.append("<h3>Additional notes from the caregiver</h3>")
        lines_html.append(f"<p>{notes}</p>")

    if evidence_link:
        lines_html.append("<h3>Evidence bundle</h3>")
        lines_html.append(f'<p>The evidence bundle for this complaint is available at: <a href="{evidence_link}">{evidence_link}</a></p>')

    lines_html.append(
        "<p>Please confirm receipt at your earliest convenience. Correspondence can be sent by reply to this email. "
        "Thank you for your consideration.</p>"
    )
    lines_html.append("<p>Kind regards,<br>Sent on behalf of the caregiver via Wayly (wayly.com.au)</p>")
    html_body = "\n".join(lines_html)
    return {"subject": subject, "html": html_body}


@cmp1_router.post("/complaints/{cid}/submit-to-acqsc")
async def submit_complaint_to_acqsc(cid: str, body: ACQSCSubmitBody, request: Request):
    """Send the complaint packet to ACQSC by email with a full audit trail.

    Behaviour:
      - Validates the complaint is in an appropriate stage to escalate.
      - Renders a formal referral email (respects is_anonymous_acqsc_submission).
      - Sends via Resend when configured, otherwise records a mocked send.
      - Writes an audit trail row in cmp1_acqsc_submissions with the full
        payload metadata (hash of body, subject, recipient, actor, timing).
      - Advances the complaint stage to stage_3_acqsc_referral when legal.
      - Emits a CORE-1 timeline event.
    """
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.complaints.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    await _core1_assert_access(user, c["participant_id"])

    current = c.get("current_stage", "drafting")
    # Allow submission from any active provider stage. Closed complaints cannot be re-escalated.
    if current in {"closed_resolved", "closed_abandoned", "stage_4_ombudsman_referral", "stage_5_appeals"}:
        raise HTTPException(status_code=422, detail=f"Cannot submit to ACQSC from stage: {current}")

    recipient = (body.recipient_email or ACQSC_DEFAULT_EMAIL).strip()
    if "@" not in recipient:
        raise HTTPException(status_code=422, detail="Invalid recipient email")

    participant = await _db.participants.find_one({"id": c["participant_id"]}, {"_id": 0, "first_name": 1, "preferred_name": 1, "name": 1})
    evidence_link = None
    if body.include_evidence_bundle_link and c.get("evidence_bundle_id"):
        base = os.environ.get("PUBLIC_APP_URL", "").rstrip("/")
        if base:
            evidence_link = f"{base}/api/cmp1/evidence-bundles/{c['evidence_bundle_id']}/export.pdf"

    email = _build_acqsc_email(c, participant, body.additional_notes, evidence_link)

    # Send the email (or mock).
    send_result: Dict[str, Any] = {"ok": False, "mocked": True}
    try:
        from email_service import send_email  # local import to keep hot-path light
        send_result = await send_email(
            to=recipient,
            subject=email["subject"],
            html=email["html"],
            reply_to=body.reply_to,
        )
    except Exception as e:  # pragma: no cover
        logger.warning("ACQSC send raised: %s", e)
        send_result = {"ok": False, "mocked": True, "reason": str(e)}

    now = _now()
    submission_id = str(uuid.uuid4())
    import hashlib as _hashlib
    body_hash = _hashlib.sha256(email["html"].encode("utf-8")).hexdigest()

    audit_row = {
        "id": submission_id,
        "complaint_id": cid,
        "participant_id": c["participant_id"],
        "recipient_email": recipient,
        "reply_to": body.reply_to,
        "subject": email["subject"],
        "body_hash_sha256": body_hash,
        "body_bytes": len(email["html"].encode("utf-8")),
        "actor_user_id": user.get("id"),
        "sent_at": now,
        "sent_ok": bool(send_result.get("ok")),
        "sent_mocked": bool(send_result.get("mocked")),
        "provider_message_id": send_result.get("id"),
        "provider_error": send_result.get("reason") if not send_result.get("ok") else None,
        "is_anonymous": bool(c.get("is_anonymous_acqsc_submission")),
        "evidence_bundle_id": c.get("evidence_bundle_id"),
        "evidence_link_included": bool(evidence_link),
        "additional_notes": body.additional_notes,
        "created_at": now,
    }
    await _db.cmp1_acqsc_submissions.insert_one(dict(audit_row))

    # Advance stage to ACQSC referral if a legal transition and not already there.
    if current in LEGAL_TRANSITIONS and "stage_3_acqsc_referral" in LEGAL_TRANSITIONS[current] and current != "stage_3_acqsc_referral":
        hist = list(c.get("stage_history") or [])
        if hist:
            hist[-1]["exited_at"] = now
            hist[-1]["outcome_at_exit"] = "referred_to_next_stage"
            hist[-1]["exit_notes"] = "Escalated to ACQSC by email"
        hist.append({
            "stage": "stage_3_acqsc_referral",
            "entered_at": now,
            "exited_at": None,
            "outcome_at_exit": None,
            "exit_notes": None,
            "correspondence_at_stage": [{"submission_id": submission_id, "sent_at": now}],
        })
        await _db.complaints.update_one(
            {"id": cid},
            {"$set": {
                "current_stage": "stage_3_acqsc_referral",
                "stage_history": hist,
                "updated_at": now,
                "last_activity_at": now,
                "acqsc_last_submission_id": submission_id,
                "acqsc_last_submitted_at": now,
            }},
        )

    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=c["participant_id"],
                event_type="complaint_submitted_to_acqsc",
                event_source="cmp1",
                actor_type="user",
                actor_id=user.get("id"),
                summary_tokens={
                    "caregiver": f"Complaint referred to ACQSC by email to {recipient}.",
                    "participant_self": f"Your complaint was referred to ACQSC by email to {recipient}.",
                },
                linked_artefact_id=submission_id,
                linked_artefact_type="cmp1_acqsc_submission",
                metadata={
                    "complaint_id": cid,
                    "recipient_email": recipient,
                    "mocked": bool(send_result.get("mocked")),
                    "ok": bool(send_result.get("ok")),
                },
            )
        except Exception:
            pass

    return {
        "submission_id": submission_id,
        "recipient_email": recipient,
        "sent_at": _iso(now),
        "sent_ok": bool(send_result.get("ok")),
        "mocked": bool(send_result.get("mocked")),
        "subject": email["subject"],
        "body_hash_sha256": body_hash,
        "current_stage": (await _db.complaints.find_one({"id": cid}, {"_id": 0, "current_stage": 1})).get("current_stage"),
    }


@cmp1_router.get("/complaints/{cid}/acqsc-submissions")
async def list_acqsc_submissions(cid: str, request: Request):
    """Return the audit trail of every ACQSC email submission for this complaint."""
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.complaints.find_one({"id": cid}, {"_id": 0, "participant_id": 1})
    if not c:
        raise HTTPException(status_code=404, detail="Complaint not found")
    await _core1_assert_access(user, c["participant_id"])
    out: List[Dict[str, Any]] = []
    async for row in _db.cmp1_acqsc_submissions.find({"complaint_id": cid}, {"_id": 0}).sort("sent_at", -1):
        row["sent_at"] = _iso(row.get("sent_at"))
        row["created_at"] = _iso(row.get("created_at"))
        out.append(row)
    return {"submissions": out, "count": len(out)}


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


@cmp1_router.get("/status")
async def status():
    return {
        "cmp1_v1_enabled": _flag_enabled(),
        "version": "v1.1",
        "surfaces": ["complaint_crud", "stage_transitions", "evidence_bundle", "elder_abuse_safeguard", "acqsc_email_submission"],
        "complaint_types": sorted(COMPLAINT_TYPES),
        "stages": sorted(STAGES),
        "deferred_to_v2": ["ombudsman_escalation", "pdf_export", "provider_directory", "sdl1_lock_integration"],
        "acqsc_default_email": ACQSC_DEFAULT_EMAIL,
        "data_residency": "ap-southeast-2",
    }
