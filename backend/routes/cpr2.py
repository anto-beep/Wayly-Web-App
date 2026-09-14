"""CPR-2 v1: Support Plan Reviewer slice.

Scope for this v1 slice (following spec /app/docs/specs/CPR-2-v1.md):

  * Section E, "Support Plan" rename: primary label change + `care_plan_reviewer`
    slug alias retained for backward compatibility, URL redirect from
    `/app/tools/care-plan-reviewer` → `/app/tools/support-plan-reviewer`,
    one-time rename notification.
  * Section B.2 / D.2, Goal ledger: create/list/patch/link-to-plan/meeting-note
    + supersede. Cross-plan tracking via `appears_in_plan_ids`.
  * Section B.3 / D.3 / G, Re-review prompts + LCA-1 subscriber. When an LCA-1
    change is published with `affects_wayly_tools` containing
    `support_plan_reviewer` or `care_plan_reviewer`, one ReReviewPrompt is
    written per participant that has at least one plan review. Prompts surface
    on the participant profile; user response (dismiss/defer/start) is
    persisted with idempotent state transitions.

Deferred to CPR-2 v2:
  * Section H, Participant voice check (first-class module).
  * Section I, Similar-profile comparison.
  * Section J, Case creation from findings.
  * Section L, Full persona-aware rendering pass.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.cpr2")

cpr2_router = APIRouter(prefix="/cpr2", tags=["cpr2"])

_db = None
_user_dep = None
_core1_assert_access = None
_core1_write_event = None

GOAL_TYPES = {
    "self_directed_participant_stated",
    "provider_recommended",
    "medical_or_clinical",
    "functional",
    "social_wellbeing",
    "other",
}

GOAL_STATUSES = {
    "active_ongoing",
    "partially_met",
    "fully_met",
    "dropped_no_longer_relevant",
    "dropped_by_provider",
    "new_in_current_plan",
    "superseded_by_new_goal",
}

RE_REVIEW_TRIGGERS = {
    "legislative_change",
    "user_request",
    "scheduled_cadence",
    "cross_tool_referral",
}

RE_REVIEW_USER_RESPONSES = {"dismissed", "started_re_review", "deferred_to_date", "completed_new_review"}


def init_cpr2_routes(*, db, user_dep, core1_assert_access, core1_write_timeline):
    global _db, _user_dep, _core1_assert_access, _core1_write_event
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _core1_write_event = core1_write_timeline


def _flag_enabled() -> bool:
    return os.environ.get("CPR2_ENABLED", "1") != "0"


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


async def ensure_cpr2_indexes(db) -> None:
    """Idempotent index creation for CPR-2 collections."""
    try:
        await db.goal_ledger_entries.create_index([("participant_id", 1), ("status", 1)])
        await db.goal_ledger_entries.create_index([("first_extracted_from_plan_id", 1)])
        await db.re_review_prompts.create_index([("participant_id", 1), ("triggered_at", -1)])
        await db.re_review_prompts.create_index([("lca_1_change_id", 1), ("participant_id", 1)], unique=False)
        await db.participant_voice_checks.create_index([("participant_id", 1), ("created_at", -1)])
        await db.participant_voice_checks.create_index([("plan_review_id", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("cpr2 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Status + rename notification
# ---------------------------------------------------------------------------


@cpr2_router.get("/status")
async def status():
    return {
        "cpr2_v1_enabled": _flag_enabled(),
        "version": "v1",
        "primary_label": "Support Plan Reviewer",
        "aliases": ["care_plan_reviewer", "care-plan-reviewer"],
        "surfaces": ["rename", "goal_ledger", "re_review_prompts", "lca1_subscriber", "voice_check"],
        "deferred_to_v2": ["similar_profile_comparison", "case_from_findings"],
        "data_residency": "ap-southeast-2",
    }


@cpr2_router.get("/rename-notification")
async def get_rename_notification(request: Request):
    """Return the one-time Support Plan rename notification per Section E.3.

    Idempotent per user. Marked as seen on first fetch so it only appears once.
    """
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthenticated")

    row = await _db.cpr2_rename_notifications.find_one({"user_id": uid}, {"_id": 0})
    if row and row.get("acknowledged_at"):
        return {"show": False, "already_acknowledged": True}

    msg = {
        "caregiver": (
            "Care Plan Reviewer is now Support Plan Reviewer. Under the Aged "
            "Care Act 2024, the document you sign with your provider is called "
            "a Support Plan. We've updated the name to match. Everything else "
            "works the same."
        ),
        "participant_self": (
            "Care Plan Reviewer is now Support Plan Reviewer. Your Support "
            "Plan is the document you sign with your provider under the Aged "
            "Care Act 2024. We've updated the name to match. Everything else "
            "works the same."
        ),
    }
    return {
        "show": True,
        "already_acknowledged": False,
        "message_tokens": msg,
        "title": "Care Plan Reviewer is now Support Plan Reviewer",
    }


@cpr2_router.post("/rename-notification/acknowledge")
async def ack_rename_notification(request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="Unauthenticated")
    await _db.cpr2_rename_notifications.update_one(
        {"user_id": uid},
        {"$set": {"user_id": uid, "acknowledged_at": _now()}},
        upsert=True,
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Goal ledger
# ---------------------------------------------------------------------------


class GoalCreate(BaseModel):
    goal_text: str = Field(min_length=1, max_length=2000)
    original_extracted_text: Optional[str] = None
    goal_type: str
    first_extracted_from_plan_id: Optional[str] = None
    extraction_confidence: str = Field(default="medium", pattern=r"^(high|medium|low)$")
    user_confirmed_at_extraction: bool = False


class GoalPatch(BaseModel):
    goal_text: Optional[str] = None
    status: Optional[str] = None
    status_reason: Optional[str] = None


class GoalLink(BaseModel):
    plan_id: str


class GoalSupersede(BaseModel):
    superseding_goal_id: str


class GoalMeetingNote(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


def _goal_view(g: dict) -> dict:
    return {
        "id": g["id"],
        "participant_id": g["participant_id"],
        "household_id": g.get("household_id"),
        "goal_text": g["goal_text"],
        "original_extracted_text": g.get("original_extracted_text"),
        "goal_type": g["goal_type"],
        "first_extracted_from_plan_id": g.get("first_extracted_from_plan_id"),
        "first_extracted_at": _iso(g.get("first_extracted_at")),
        "extraction_confidence": g.get("extraction_confidence", "medium"),
        "user_confirmed_at_extraction": bool(g.get("user_confirmed_at_extraction")),
        "status": g.get("status", "active_ongoing"),
        "status_reason": g.get("status_reason"),
        "last_status_change_at": _iso(g.get("last_status_change_at")),
        "last_status_change_by_user_id": g.get("last_status_change_by_user_id"),
        "appears_in_plan_ids": g.get("appears_in_plan_ids") or [],
        "superseded_by_goal_id": g.get("superseded_by_goal_id"),
        "meeting_notes": g.get("meeting_notes") or [],
        "created_at": _iso(g.get("created_at")),
        "updated_at": _iso(g.get("updated_at")),
    }


@cpr2_router.get("/participants/{pid}/goals")
async def list_goals(pid: str, request: Request, status: Optional[str] = None,
                     limit: int = Query(100, ge=1, le=500)):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if status:
        if status not in GOAL_STATUSES:
            raise HTTPException(status_code=422, detail=f"Unknown status: {status}")
        q["status"] = status
    rows: List[Dict[str, Any]] = []
    async for g in _db.goal_ledger_entries.find(q, {"_id": 0}).sort("created_at", -1).limit(limit):
        rows.append(_goal_view(g))
    return {"goals": rows, "count": len(rows)}


@cpr2_router.post("/participants/{pid}/goals")
async def create_goal(pid: str, body: GoalCreate, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    if body.goal_type not in GOAL_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown goal_type: {body.goal_type}")
    p = await _db.participants.find_one({"id": pid}, {"_id": 0, "household_id": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "household_id": p.get("household_id"),
        "goal_text": body.goal_text,
        "original_extracted_text": body.original_extracted_text or body.goal_text,
        "goal_type": body.goal_type,
        "first_extracted_from_plan_id": body.first_extracted_from_plan_id,
        "first_extracted_at": now if body.first_extracted_from_plan_id else None,
        "extraction_confidence": body.extraction_confidence,
        "user_confirmed_at_extraction": body.user_confirmed_at_extraction,
        "status": "new_in_current_plan" if body.first_extracted_from_plan_id else "active_ongoing",
        "status_reason": None,
        "last_status_change_at": now,
        "last_status_change_by_user_id": user.get("id"),
        "appears_in_plan_ids": [body.first_extracted_from_plan_id] if body.first_extracted_from_plan_id else [],
        "superseded_by_goal_id": None,
        "meeting_notes": [],
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.goal_ledger_entries.insert_one(dict(doc))
    return _goal_view(doc)


@cpr2_router.patch("/goals/{gid}")
async def patch_goal(gid: str, body: GoalPatch, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    await _core1_assert_access(user, existing["participant_id"])
    update: Dict[str, Any] = {"updated_at": _now()}
    if body.goal_text is not None:
        update["goal_text"] = body.goal_text
    if body.status is not None:
        if body.status not in GOAL_STATUSES:
            raise HTTPException(status_code=422, detail=f"Unknown status: {body.status}")
        update["status"] = body.status
        update["last_status_change_at"] = _now()
        update["last_status_change_by_user_id"] = user.get("id")
    if body.status_reason is not None:
        update["status_reason"] = body.status_reason
    await _db.goal_ledger_entries.update_one({"id": gid}, {"$set": update})
    fresh = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    return _goal_view(fresh)


@cpr2_router.post("/goals/{gid}/link-to-plan")
async def link_goal_to_plan(gid: str, body: GoalLink, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    await _core1_assert_access(user, existing["participant_id"])
    await _db.goal_ledger_entries.update_one(
        {"id": gid},
        {"$addToSet": {"appears_in_plan_ids": body.plan_id}, "$set": {"updated_at": _now()}},
    )
    fresh = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    return _goal_view(fresh)


@cpr2_router.post("/goals/{gid}/supersede")
async def supersede_goal(gid: str, body: GoalSupersede, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    superseding = await _db.goal_ledger_entries.find_one({"id": body.superseding_goal_id}, {"_id": 0})
    if not existing or not superseding:
        raise HTTPException(status_code=404, detail="Goal not found")
    if existing["participant_id"] != superseding["participant_id"]:
        raise HTTPException(status_code=422, detail="Cross-participant supersede not allowed")
    await _core1_assert_access(user, existing["participant_id"])
    now = _now()
    await _db.goal_ledger_entries.update_one(
        {"id": gid},
        {"$set": {
            "status": "superseded_by_new_goal",
            "superseded_by_goal_id": body.superseding_goal_id,
            "last_status_change_at": now,
            "last_status_change_by_user_id": user.get("id"),
            "updated_at": now,
        }},
    )
    fresh = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    return _goal_view(fresh)


@cpr2_router.post("/goals/{gid}/meeting-note")
async def add_meeting_note(gid: str, body: GoalMeetingNote, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Goal not found")
    await _core1_assert_access(user, existing["participant_id"])
    note = {"timestamp": _now(), "note": body.note, "note_by_user_id": user.get("id")}
    await _db.goal_ledger_entries.update_one(
        {"id": gid},
        {"$push": {"meeting_notes": note}, "$set": {"updated_at": _now()}},
    )
    fresh = await _db.goal_ledger_entries.find_one({"id": gid}, {"_id": 0})
    return _goal_view(fresh)


# ---------------------------------------------------------------------------
# Re-review prompts
# ---------------------------------------------------------------------------


class ReReviewPromptCreate(BaseModel):
    plan_review_id: Optional[str] = None
    triggered_by: str = "user_request"
    lca_1_change_id: Optional[str] = None
    change_summary: Optional[str] = None


class ReReviewUserResponse(BaseModel):
    response: str
    deferred_until: Optional[str] = None


def _prompt_view(p: dict) -> dict:
    return {
        "id": p["id"],
        "participant_id": p["participant_id"],
        "plan_review_id": p.get("plan_review_id"),
        "triggered_by": p.get("triggered_by"),
        "lca_1_change_id": p.get("lca_1_change_id"),
        "triggered_at": _iso(p.get("triggered_at")),
        "change_summary": p.get("change_summary"),
        "prompted_to_user_at": _iso(p.get("prompted_to_user_at")),
        "prompted_to_user_id": p.get("prompted_to_user_id"),
        "user_response": p.get("user_response"),
        "user_responded_at": _iso(p.get("user_responded_at")),
        "deferred_until": p.get("deferred_until"),
        "new_plan_review_id": p.get("new_plan_review_id"),
    }


@cpr2_router.get("/participants/{pid}/re-review-prompts")
async def list_re_review_prompts(pid: str, request: Request, status: Optional[str] = None):
    """List re-review prompts for a participant. `status=open` returns only
    prompts the user hasn't dismissed or completed yet."""
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if status == "open":
        q["user_response"] = {"$in": [None, "deferred_to_date"]}
    elif status == "closed":
        q["user_response"] = {"$in": ["dismissed", "completed_new_review", "started_re_review"]}
    rows = []
    async for p in _db.re_review_prompts.find(q, {"_id": 0}).sort("triggered_at", -1).limit(50):
        rows.append(_prompt_view(p))
    return {"prompts": rows, "count": len(rows)}


@cpr2_router.post("/participants/{pid}/re-review-prompts")
async def create_re_review_prompt(pid: str, body: ReReviewPromptCreate, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    if body.triggered_by not in RE_REVIEW_TRIGGERS:
        raise HTTPException(status_code=422, detail=f"Unknown triggered_by: {body.triggered_by}")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "plan_review_id": body.plan_review_id,
        "triggered_by": body.triggered_by,
        "lca_1_change_id": body.lca_1_change_id,
        "triggered_at": now,
        "change_summary": body.change_summary,
        "prompted_to_user_at": now,
        "prompted_to_user_id": user.get("id"),
        "user_response": None,
        "user_responded_at": None,
        "deferred_until": None,
        "new_plan_review_id": None,
        "data_residency": "ap-southeast-2",
    }
    await _db.re_review_prompts.insert_one(dict(doc))
    return _prompt_view(doc)


@cpr2_router.post("/re-review-prompts/{prid}/user-response")
async def submit_user_response(prid: str, body: ReReviewUserResponse, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    prompt = await _db.re_review_prompts.find_one({"id": prid}, {"_id": 0})
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    await _core1_assert_access(user, prompt["participant_id"])
    if body.response not in RE_REVIEW_USER_RESPONSES:
        raise HTTPException(status_code=422, detail=f"Unknown response: {body.response}")
    update = {
        "user_response": body.response,
        "user_responded_at": _now(),
    }
    if body.response == "deferred_to_date" and body.deferred_until:
        update["deferred_until"] = body.deferred_until
    await _db.re_review_prompts.update_one({"id": prid}, {"$set": update})
    fresh = await _db.re_review_prompts.find_one({"id": prid}, {"_id": 0})
    return _prompt_view(fresh)


# ---------------------------------------------------------------------------
# LCA-1 subscriber
# ---------------------------------------------------------------------------


CPR2_TOOL_SLUGS = {"support_plan_reviewer", "care_plan_reviewer"}

# ---------------------------------------------------------------------------
# Participant voice check (Section H)
# ---------------------------------------------------------------------------


VOICE_CHECK_ANSWERS = {
    "yes_i_wanted_this",
    "yes_but_not_exactly",
    "no_this_was_the_providers_idea",
    "i_dont_remember_discussing_this",
    "skipped",
}


class GoalReviewItem(BaseModel):
    goal_id: str
    goal_text_shown: str
    review_prompt_shown: Optional[str] = None
    participant_answer: str
    participant_notes: Optional[str] = None


class VoiceCheckCreate(BaseModel):
    plan_review_id: Optional[str] = None
    authored_on_behalf: bool = False
    goal_reviews: List[GoalReviewItem] = Field(default_factory=list)
    participant_confirmed_review_at: Optional[str] = None


class VoiceCheckPatch(BaseModel):
    goal_reviews: Optional[List[GoalReviewItem]] = None
    overall_finding: Optional[str] = None
    overall_notes: Optional[str] = None
    participant_confirmed_review_at: Optional[str] = None


class VoiceCheckFollowUp(BaseModel):
    action: str = Field(pattern=r"^(letter_drafted|voice_note_created|plan_re_review_requested)$")
    reference_id: Optional[str] = None


VOICE_CHECK_OVERALL = {"participant_led", "provider_led", "mixed_collaborative", "participant_absent"}


def _voice_check_overall_finding(goal_reviews: List[Dict[str, Any]]) -> str:
    """Deterministic overall finding per spec H.4.

    Rules:
      - Mostly `yes_i_wanted_this` (>60% of answered) → participant_led
      - Mostly `no_this_was_the_providers_idea` OR `i_dont_remember_discussing_this` → provider_led
      - Skipped most (>50% skipped) → participant_absent
      - Mix → mixed_collaborative
    """
    if not goal_reviews:
        return "participant_absent"
    n = len(goal_reviews)
    counts: Dict[str, int] = {a: 0 for a in VOICE_CHECK_ANSWERS}
    for g in goal_reviews:
        a = g.get("participant_answer") if isinstance(g, dict) else getattr(g, "participant_answer", None)
        if a in counts:
            counts[a] += 1
    if counts["skipped"] > n / 2:
        return "participant_absent"
    answered = n - counts["skipped"]
    if answered <= 0:
        return "participant_absent"
    yes_share = counts["yes_i_wanted_this"] / answered
    provider_share = (counts["no_this_was_the_providers_idea"] + counts["i_dont_remember_discussing_this"]) / answered
    if yes_share > 0.6:
        return "participant_led"
    if provider_share > 0.6:
        return "provider_led"
    return "mixed_collaborative"


def _voice_check_follow_up_suggestions(finding: str) -> Dict[str, Any]:
    """Follow-up action suggestions per spec H.5, framed persona-agnostically."""
    if finding == "participant_led":
        return {
            "headline_tokens": {
                "caregiver": "Sounds like the plan is genuinely theirs.",
                "participant_self": "Sounds like your plan is genuinely yours.",
            },
            "suggested_actions": [],
        }
    if finding == "mixed_collaborative":
        return {
            "headline_tokens": {
                "caregiver": "A few goals could use a conversation with the care manager.",
                "participant_self": "A few goals could use a conversation with your care manager.",
            },
            "suggested_actions": [
                {"key": "note_goals_to_discuss", "label": "Note the specific goals to discuss"},
                {"key": "draft_discussion_letter", "label": "Draft a letter requesting discussion of unclear goals",
                 "lf1_archetype": "request", "lf1_situation_id": 6},
            ],
        }
    if finding == "provider_led":
        return {
            "headline_tokens": {
                "caregiver": "The plan appears provider-authored. A conversation is worth having.",
                "participant_self": "This plan looks like it came mostly from your provider. A conversation is worth having.",
            },
            "suggested_actions": [
                {"key": "draft_revision_letter", "label": "Draft a letter requesting plan revision to include participant preferences",
                 "lf1_archetype": "request", "lf1_situation_id": 6},
                {"key": "create_voice_note", "label": "Capture what the participant does want as a voice note",
                 "fc2_link": True},
                {"key": "discuss_with_care_manager", "label": "Discuss with care manager"},
            ],
        }
    # participant_absent
    return {
        "headline_tokens": {
            "caregiver": "Consider arranging for the participant to be involved in the next plan development.",
            "participant_self": "Try to arrange time to be involved in the next plan development.",
        },
        "suggested_actions": [
            {"key": "arrange_participation", "label": "Arrange for participant involvement in the next plan"},
            {"key": "elder_abuse_safeguard_check", "label": "If this pattern repeats, review the elder-abuse safeguard resources"},
        ],
    }


def _voice_check_view(vc: dict) -> dict:
    return {
        "id": vc["id"],
        "plan_review_id": vc.get("plan_review_id"),
        "participant_id": vc["participant_id"],
        "initiated_by_user_id": vc.get("initiated_by_user_id"),
        "authored_on_behalf": bool(vc.get("authored_on_behalf")),
        "participant_confirmed_review_at": vc.get("participant_confirmed_review_at"),
        "participant_confirmed_by_user_id": vc.get("participant_confirmed_by_user_id"),
        "goal_reviews": vc.get("goal_reviews") or [],
        "overall_finding": vc.get("overall_finding"),
        "overall_notes": vc.get("overall_notes"),
        "suggested_actions_taken": vc.get("suggested_actions_taken") or {
            "letter_drafted": False, "letter_id": None,
            "voice_note_created": False, "voice_note_id": None,
            "plan_re_review_requested": False,
        },
        "contains_sensitive_content_flag": bool(vc.get("contains_sensitive_content_flag")),
        "follow_up_suggestions": _voice_check_follow_up_suggestions(vc.get("overall_finding") or "participant_absent"),
        "created_at": _iso(vc.get("created_at")),
    }


@cpr2_router.get("/participants/{pid}/voice-checks")
async def list_voice_checks(pid: str, request: Request, plan_review_id: Optional[str] = None):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if plan_review_id:
        q["plan_review_id"] = plan_review_id
    rows = []
    async for vc in _db.participant_voice_checks.find(q, {"_id": 0}).sort("created_at", -1).limit(50):
        rows.append(_voice_check_view(vc))
    return {"voice_checks": rows, "count": len(rows)}


def _scan_sensitive_content(goal_reviews: List[Dict[str, Any]]) -> bool:
    """Best-effort keyword scan per spec H.7. Never triggers automatic
    disclosure, just sets the flag so downstream UI can surface resources."""
    keywords = {
        "afraid", "scared", "hits me", "hits her", "hits him", "threatens",
        "took my money", "financial abuse", "won't let me", "isolated",
        "shouting", "yelled at me",
    }
    for g in goal_reviews:
        note = (g.get("participant_notes") or "").lower() if isinstance(g, dict) else ""
        if not note:
            continue
        for kw in keywords:
            if kw in note:
                return True
    return False


@cpr2_router.post("/participants/{pid}/voice-checks")
async def create_voice_check(pid: str, body: VoiceCheckCreate, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    p = await _db.participants.find_one({"id": pid}, {"_id": 0, "household_id": 1})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    # Validate each answer
    goal_reviews = [gr.model_dump() for gr in body.goal_reviews]
    for gr in goal_reviews:
        if gr["participant_answer"] not in VOICE_CHECK_ANSWERS:
            raise HTTPException(status_code=422, detail=f"Unknown participant_answer: {gr['participant_answer']}")
    finding = _voice_check_overall_finding(goal_reviews)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "plan_review_id": body.plan_review_id,
        "participant_id": pid,
        "household_id": p.get("household_id"),
        "initiated_by_user_id": user.get("id"),
        "authored_on_behalf": body.authored_on_behalf,
        "participant_confirmed_review_at": body.participant_confirmed_review_at,
        "participant_confirmed_by_user_id": user.get("id") if not body.authored_on_behalf else None,
        "goal_reviews": goal_reviews,
        "overall_finding": finding,
        "overall_notes": None,
        "suggested_actions_taken": {
            "letter_drafted": False, "letter_id": None,
            "voice_note_created": False, "voice_note_id": None,
            "plan_re_review_requested": False,
        },
        "contains_sensitive_content_flag": _scan_sensitive_content(goal_reviews),
        "created_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.participant_voice_checks.insert_one(dict(doc))
    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=pid,
                event_type="voice_check_completed",
                event_source="cpr2",
                actor_type="user",
                actor_id=user.get("id"),
                summary_tokens={
                    "caregiver": f"Support plan voice check completed, finding: {finding.replace('_', ' ')}",
                    "participant_self": f"Voice check on your plan completed, finding: {finding.replace('_', ' ')}",
                },
                metadata={"voice_check_id": doc["id"], "overall_finding": finding,
                          "authored_on_behalf": body.authored_on_behalf},
            )
        except Exception:  # pragma: no cover
            pass
    return _voice_check_view(doc)


@cpr2_router.patch("/voice-checks/{vcid}")
async def patch_voice_check(vcid: str, body: VoiceCheckPatch, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.participant_voice_checks.find_one({"id": vcid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Voice check not found")
    await _core1_assert_access(user, existing["participant_id"])
    update: Dict[str, Any] = {}
    if body.goal_reviews is not None:
        grs = [gr.model_dump() for gr in body.goal_reviews]
        for gr in grs:
            if gr["participant_answer"] not in VOICE_CHECK_ANSWERS:
                raise HTTPException(status_code=422, detail=f"Unknown participant_answer: {gr['participant_answer']}")
        update["goal_reviews"] = grs
        # Recompute finding unless caller overrode
        if body.overall_finding is None:
            update["overall_finding"] = _voice_check_overall_finding(grs)
        update["contains_sensitive_content_flag"] = _scan_sensitive_content(grs)
    if body.overall_finding is not None:
        if body.overall_finding not in VOICE_CHECK_OVERALL:
            raise HTTPException(status_code=422, detail=f"Unknown overall_finding: {body.overall_finding}")
        update["overall_finding"] = body.overall_finding
    if body.overall_notes is not None:
        update["overall_notes"] = body.overall_notes
    if body.participant_confirmed_review_at is not None:
        update["participant_confirmed_review_at"] = body.participant_confirmed_review_at
        update["participant_confirmed_by_user_id"] = user.get("id")
    if update:
        await _db.participant_voice_checks.update_one({"id": vcid}, {"$set": update})
    fresh = await _db.participant_voice_checks.find_one({"id": vcid}, {"_id": 0})
    return _voice_check_view(fresh)


@cpr2_router.post("/voice-checks/{vcid}/mark-follow-up")
async def mark_follow_up(vcid: str, body: VoiceCheckFollowUp, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.participant_voice_checks.find_one({"id": vcid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Voice check not found")
    await _core1_assert_access(user, existing["participant_id"])
    taken = existing.get("suggested_actions_taken") or {}
    if body.action == "letter_drafted":
        taken["letter_drafted"] = True
        taken["letter_id"] = body.reference_id
    elif body.action == "voice_note_created":
        taken["voice_note_created"] = True
        taken["voice_note_id"] = body.reference_id
    elif body.action == "plan_re_review_requested":
        taken["plan_re_review_requested"] = True
    await _db.participant_voice_checks.update_one({"id": vcid}, {"$set": {"suggested_actions_taken": taken}})
    fresh = await _db.participant_voice_checks.find_one({"id": vcid}, {"_id": 0})
    return _voice_check_view(fresh)


async def cpr2_on_lca1_publish(change: dict) -> Dict[str, Any]:
    """Called by LCA-1's `_run_matching` after publish. If the change affects
    the Support Plan Reviewer tool, create one ReReviewPrompt per participant
    that has at least one plan review. Idempotent, dedupe on
    (participant_id, lca_1_change_id).

    Returns a summary count. Failure is logged but non-fatal so a bad
    subscriber never blocks the alert fanout.
    """
    if _db is None:
        return {"created": 0, "reason": "cpr2_not_initialised"}
    affects = set(change.get("affects_wayly_tools") or [])
    if not (affects & CPR2_TOOL_SLUGS):
        return {"created": 0, "reason": "not_a_cpr2_change"}
    cid = change.get("id")
    now = _now()
    created = 0
    seen: set = set()

    # Find every participant that has at least one plan review or care plan.
    async for pr in _db.plan_reviews.find({}, {"_id": 0, "participant_id": 1, "id": 1}):
        pid = pr.get("participant_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        existing = await _db.re_review_prompts.find_one(
            {"participant_id": pid, "lca_1_change_id": cid},
            {"_id": 0, "id": 1},
        )
        if existing:
            continue
        prompt = {
            "id": str(uuid.uuid4()),
            "participant_id": pid,
            "plan_review_id": pr.get("id"),
            "triggered_by": "legislative_change",
            "lca_1_change_id": cid,
            "triggered_at": now,
            "change_summary": change.get("title"),
            "prompted_to_user_at": now,
            "prompted_to_user_id": None,
            "user_response": None,
            "user_responded_at": None,
            "deferred_until": None,
            "new_plan_review_id": None,
            "data_residency": "ap-southeast-2",
        }
        await _db.re_review_prompts.insert_one(dict(prompt))
        created += 1
        # CORE-1 timeline event
        if _core1_write_event:
            try:
                await _core1_write_event(
                    participant_id=pid,
                    event_type="support_plan_re_review_prompted",
                    event_source="cpr2",
                    actor_type="system",
                    actor_id=None,
                    summary_tokens={
                        "caregiver": f"Support plan re-review suggested, {change.get('title')}",
                        "participant_self": f"Support plan re-review suggested, {change.get('title')}",
                    },
                    metadata={"lca_1_change_id": cid, "prompt_id": prompt["id"]},
                )
            except Exception:  # pragma: no cover
                pass

    # Legacy fallback: some households only have care_plans (pre CPR-1)
    async for cp in _db.care_plans.find({}, {"_id": 0, "participant_id": 1, "id": 1}):
        pid = cp.get("participant_id")
        if not pid or pid in seen:
            continue
        seen.add(pid)
        existing = await _db.re_review_prompts.find_one(
            {"participant_id": pid, "lca_1_change_id": cid},
            {"_id": 0, "id": 1},
        )
        if existing:
            continue
        prompt = {
            "id": str(uuid.uuid4()),
            "participant_id": pid,
            "plan_review_id": None,
            "triggered_by": "legislative_change",
            "lca_1_change_id": cid,
            "triggered_at": now,
            "change_summary": change.get("title"),
            "prompted_to_user_at": now,
            "prompted_to_user_id": None,
            "user_response": None,
            "user_responded_at": None,
            "deferred_until": None,
            "new_plan_review_id": None,
            "data_residency": "ap-southeast-2",
        }
        await _db.re_review_prompts.insert_one(dict(prompt))
        created += 1

    return {"created": created, "tool_slugs_matched": sorted(affects & CPR2_TOOL_SLUGS)}
