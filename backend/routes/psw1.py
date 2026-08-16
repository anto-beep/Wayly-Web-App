"""PSW-1 v1 slice: Provider Switching Workflow.

Scope for this v1 slice (per PSW-1-v1.md):
  * Section B.1: ProviderSwitch data model with 10 stages + abandoned.
  * Section B.2: SwitchDecisionWalkthrough with cross-tool snapshot.
  * Section B.3: PostSwitchSettlement with refund reconciliation.
  * Section B.4: OverlapServiceAssignment.
  * Section D.1: Switch CRUD + stage transitions.
  * Section D.2: Legal stage transition matrix (Section E.4).
  * Section D.3: Decision walkthrough capture with cross-tool context.
  * Section D.7: Overlap service tracking.
  * Section D.8: Post-switch settlement + variance-dispute LOOP-1 case.
  * Section G: Notice generation stub (LF-2 template reference).
  * Section K.6: Refund variance dispute opens LOOP-1 case.

Deferred to PSW-1 v2:
  * Deep LF-2 send-from-Wayly integration (currently stores template ref).
  * Full cross-tool coordination with CPR-2, BC-2, CE-3 (references only).
  * 30-day check-in scheduler (Section L.3 endpoint only).
  * Adviser tier multi-client switch batch management.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.psw1")

psw1_router = APIRouter(prefix="/psw1", tags=["psw1"])

_db = None
_user_dep = None
_core1_assert_access: Optional[Callable] = None
_core1_write_event: Optional[Callable] = None
_loop1_open_case: Optional[Callable] = None


VALID_REASONS = {
    "billing_disputes_unresolved", "care_quality_declined",
    "worker_experience_issues", "provider_communication_breakdown",
    "financial_reasons", "location_change", "care_manager_concerns",
    "care_plan_alignment_issues", "other",
}
VALID_STAGES = {
    "deciding", "decision_confirmed", "notice_being_prepared",
    "notice_given_awaiting_effective_date", "care_plan_transitioning",
    "overlap_period_active", "old_provider_closing_out",
    "final_settlement_pending", "new_provider_onboarded",
    "completed", "abandoned",
}
LEGAL_TRANSITIONS: Dict[str, set] = {
    "deciding": {"decision_confirmed", "abandoned"},
    "decision_confirmed": {"notice_being_prepared", "abandoned"},
    "notice_being_prepared": {"notice_given_awaiting_effective_date", "abandoned"},
    "notice_given_awaiting_effective_date": {"care_plan_transitioning", "abandoned"},
    "care_plan_transitioning": {"overlap_period_active", "old_provider_closing_out", "abandoned"},
    "overlap_period_active": {"old_provider_closing_out", "abandoned"},
    "old_provider_closing_out": {"final_settlement_pending", "abandoned"},
    "final_settlement_pending": {"new_provider_onboarded", "abandoned"},
    "new_provider_onboarded": {"completed", "abandoned"},
    "completed": set(),
    "abandoned": set(),
}

DEFAULT_NOTICE_DAYS = 14  # Aged Care Rules 2025 default


def init_psw1_routes(*, db, user_dep, core1_assert_access, core1_write_timeline, loop1_open_case):
    global _db, _user_dep, _core1_assert_access, _core1_write_event, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _core1_write_event = core1_write_timeline
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("PSW1_ENABLED", "1") != "0"


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
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt.isoformat()
    return dt.astimezone(timezone.utc).isoformat()


async def ensure_psw1_indexes(db) -> None:
    try:
        await db.provider_switches.create_index(
            [("participant_id", 1), ("switch_stage", 1)])
        await db.switch_decision_walkthroughs.create_index(
            [("provider_switch_id", 1)], unique=True)
        await db.post_switch_settlements.create_index(
            [("provider_switch_id", 1)])
        await db.overlap_service_assignments.create_index(
            [("provider_switch_id", 1)])
    except Exception as e:  # pragma: no cover
        logger.warning("psw1 index creation skipped: %s", e)


def _view_switch(s: dict) -> Dict[str, Any]:
    return {
        "id": s["id"],
        "participant_id": s["participant_id"],
        "household_id": s.get("household_id"),
        "current_provider_name": s.get("current_provider_name"),
        "new_provider_name": s.get("new_provider_name"),
        "initial_reason_for_switch": s.get("initial_reason_for_switch"),
        "reason_notes": s.get("reason_notes"),
        "switch_stage": s.get("switch_stage", "deciding"),
        "stage_history": s.get("stage_history") or [],
        "switch_target_effective_date": s.get("switch_target_effective_date"),
        "actual_switch_effective_date": s.get("actual_switch_effective_date"),
        "notice_period_days": s.get("notice_period_days"),
        "notice_period_source": s.get("notice_period_source"),
        "decision_walkthrough_id": s.get("decision_walkthrough_id"),
        "notice_letter_delivery_id": s.get("notice_letter_delivery_id"),
        "post_switch_settlement_id": s.get("post_switch_settlement_id"),
        "overlap_period_start": s.get("overlap_period_start"),
        "overlap_period_end": s.get("overlap_period_end"),
        "refund_amount_expected": s.get("refund_amount_expected"),
        "refund_amount_received": s.get("refund_amount_received"),
        "refund_status": s.get("refund_status", "not_yet_calculated"),
        "final_resolution": s.get("final_resolution"),
        "related_case_ids": s.get("related_case_ids") or [],
        "created_at": _iso(s.get("created_at")),
        "updated_at": _iso(s.get("updated_at")),
    }


# ---------------------------------------------------------------------------
# Switch CRUD (Sections D.1)
# ---------------------------------------------------------------------------


class SwitchCreateIn(BaseModel):
    current_provider_name: str = Field(min_length=1)
    initial_reason_for_switch: str
    reason_notes: Optional[str] = None


@psw1_router.post("/participants/{pid}/switches")
async def create_switch(pid: str, body: SwitchCreateIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    uid = user["id"] if isinstance(user, dict) else getattr(user, "id", None)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    if body.initial_reason_for_switch not in VALID_REASONS:
        raise HTTPException(status_code=422, detail="Invalid reason")
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "household_id": None,
        "initiated_by_user_id": uid,
        "current_provider_name": body.current_provider_name,
        "current_provider_agreement_end_date": None,
        "new_provider_name": None,
        "new_provider_agreement_start_date": None,
        "initial_reason_for_switch": body.initial_reason_for_switch,
        "reason_notes": body.reason_notes,
        "switch_stage": "deciding",
        "stage_history": [{
            "stage": "deciding",
            "entered_at": _iso(now),
            "exited_at": None,
            "outcome_at_exit": None,
            "exit_notes": None,
        }],
        "switch_target_effective_date": None,
        "actual_switch_effective_date": None,
        "notice_period_days": DEFAULT_NOTICE_DAYS,
        "notice_period_source": "aged_care_rules_default",
        "decision_walkthrough_id": None,
        "notice_letter_delivery_id": None,
        "care_plan_transition_id": None,
        "budget_transition_projection_id": None,
        "contribution_transition_reconciliation_ids": [],
        "final_invoice_review_id": None,
        "final_statement_id": None,
        "post_switch_settlement_id": None,
        "overlap_period_start": None,
        "overlap_period_end": None,
        "overlap_active_services": [],
        "refund_amount_expected": None,
        "refund_amount_received": None,
        "refund_status": "not_yet_calculated",
        "final_resolution": None,
        "final_resolution_notes": None,
        "final_resolution_date": None,
        "related_case_ids": [],
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.provider_switches.insert_one(doc)

    if _core1_write_event:
        try:
            await _core1_write_event(
                pid, "switch_initiated",
                {"switch_id": doc["id"], "current_provider": body.current_provider_name,
                 "reason": body.initial_reason_for_switch},
                actor_user_id=uid)
        except Exception as e:  # pragma: no cover
            logger.warning("timeline event failed: %s", e)

    return {"switch": _view_switch(doc)}


@psw1_router.get("/participants/{pid}/switches")
async def list_switches(pid: str, request: Request, status: Optional[str] = None):
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if status:
        q["switch_stage"] = status
    cur = _db.provider_switches.find(q).sort("created_at", -1)
    items = await cur.to_list(length=100)
    return {"switches": [_view_switch(s) for s in items]}


@psw1_router.get("/switches/{sid}")
async def get_switch(sid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    return {"switch": _view_switch(doc)}


class SwitchPatchIn(BaseModel):
    new_provider_name: Optional[str] = None
    switch_target_effective_date: Optional[str] = None
    notice_period_days: Optional[int] = None
    notice_period_source: Optional[str] = None


@psw1_router.patch("/switches/{sid}")
async def patch_switch(sid: str, body: SwitchPatchIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    upd = {k: v for k, v in body.dict().items() if v is not None}
    upd["updated_at"] = _now()
    await _db.provider_switches.update_one({"id": sid}, {"$set": upd})
    doc.update(upd)
    return {"switch": _view_switch(doc)}


# ---------------------------------------------------------------------------
# Stage transitions (Section D.2)
# ---------------------------------------------------------------------------


class StageAdvanceIn(BaseModel):
    to_stage: str
    outcome_notes: Optional[str] = None


@psw1_router.post("/switches/{sid}/advance-stage")
async def advance_stage(sid: str, body: StageAdvanceIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    current = doc.get("switch_stage", "deciding")
    if body.to_stage not in LEGAL_TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=422,
                            detail=f"Illegal transition {current} → {body.to_stage}")
    now = _now()
    history = doc.get("stage_history") or []
    if history and history[-1].get("exited_at") is None:
        history[-1]["exited_at"] = _iso(now)
        history[-1]["outcome_at_exit"] = body.outcome_notes or "advanced"
    history.append({
        "stage": body.to_stage,
        "entered_at": _iso(now),
        "exited_at": None,
        "outcome_at_exit": None,
        "exit_notes": None,
    })
    await _db.provider_switches.update_one(
        {"id": sid},
        {"$set": {"switch_stage": body.to_stage,
                  "stage_history": history,
                  "updated_at": now}})
    doc["switch_stage"] = body.to_stage
    doc["stage_history"] = history
    return {"switch": _view_switch(doc)}


class AbandonIn(BaseModel):
    reason: str


@psw1_router.post("/switches/{sid}/abandon")
async def abandon_switch(sid: str, body: AbandonIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    now = _now()
    history = doc.get("stage_history") or []
    if history and history[-1].get("exited_at") is None:
        history[-1]["exited_at"] = _iso(now)
        history[-1]["outcome_at_exit"] = "abandoned"
        history[-1]["exit_notes"] = body.reason
    history.append({
        "stage": "abandoned",
        "entered_at": _iso(now), "exited_at": None,
        "outcome_at_exit": None, "exit_notes": body.reason,
    })
    await _db.provider_switches.update_one(
        {"id": sid},
        {"$set": {"switch_stage": "abandoned",
                  "stage_history": history,
                  "final_resolution": "abandoned_before_notice",
                  "final_resolution_notes": body.reason,
                  "final_resolution_date": _iso(now),
                  "updated_at": now}})
    doc["switch_stage"] = "abandoned"
    doc["stage_history"] = history
    return {"switch": _view_switch(doc)}


# ---------------------------------------------------------------------------
# Decision walkthrough (Section D.3, F)
# ---------------------------------------------------------------------------


@psw1_router.get("/switches/{sid}/context-snapshot")
async def context_snapshot(sid: str, request: Request):
    """Lightweight decision-support counts to surface during the walkthrough.

    Returns unresolved complaints against the current provider and open LOOP-1
    cases for the participant, so users see cross-tool context BEFORE they submit
    a decision (Section F.4 pre-submit surface).
    """
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    complaints_count = 0
    cases_count = 0
    try:
        complaints_count = await _db.cmp1_complaints.count_documents({
            "participant_id": doc["participant_id"],
            "provider_name": doc["current_provider_name"],
            "current_stage": {"$nin": ["closed_resolved", "closed_abandoned"]},
        })
    except Exception:
        pass
    try:
        cases_count = await _db.cases.count_documents({
            "participant_id": doc["participant_id"],
            "status": {"$ne": "closed"},
        })
    except Exception:
        pass
    return {
        "unresolved_complaints_at_current_count": complaints_count,
        "open_loop_cases_at_current_count": cases_count,
    }


class WalkthroughIn(BaseModel):
    switching_reasons: List[str] = Field(default_factory=list)
    switching_reason_details: Optional[str] = None
    considerations_reviewed: Dict[str, bool] = Field(default_factory=dict)
    alternative_actions_considered: Dict[str, Any] = Field(default_factory=dict)
    final_decision: str = Field(pattern="^(proceed_with_switch|defer_and_reassess_in_30_days|abandon_switch_pursue_alternatives|escalate_via_complaint_first)$")
    final_decision_notes: Optional[str] = None


@psw1_router.post("/switches/{sid}/decision-walkthrough")
async def submit_walkthrough(sid: str, body: WalkthroughIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    now = _now()

    # Cross-tool snapshot (Sections B.2 / F.4)
    pid = doc["participant_id"]
    complaints_count = await _db.complaints.count_documents({
        "participant_id": pid, "provider_name": doc["current_provider_name"],
        "current_stage": {"$nin": ["closed_resolved", "closed_abandoned"]},
    }) if hasattr(_db, "complaints") else 0
    cases_count = await _db.cases.count_documents({
        "participant_id": pid, "status": {"$ne": "closed"},
    }) if hasattr(_db, "cases") else 0

    walkthrough = {
        "id": str(uuid.uuid4()),
        "provider_switch_id": sid,
        "participant_id": pid,
        "switching_reasons": body.switching_reasons,
        "switching_reason_details": body.switching_reason_details,
        "considerations_reviewed": body.considerations_reviewed,
        "alternative_actions_considered": body.alternative_actions_considered,
        "unresolved_complaints_at_current_count": complaints_count,
        "open_loop_cases_at_current_count": cases_count,
        "budget_position_at_decision_snapshot": None,
        "care_plan_at_decision_snapshot_id": None,
        "final_decision": body.final_decision,
        "final_decision_notes": body.final_decision_notes,
        "completed_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.switch_decision_walkthroughs.update_one(
        {"provider_switch_id": sid}, {"$set": walkthrough}, upsert=True)

    upd = {"decision_walkthrough_id": walkthrough["id"], "updated_at": now}
    if body.final_decision == "proceed_with_switch":
        upd["switch_stage"] = "decision_confirmed"
    elif body.final_decision == "abandon_switch_pursue_alternatives":
        upd["switch_stage"] = "abandoned"
        upd["final_resolution"] = "abandoned_before_notice"

    await _db.provider_switches.update_one({"id": sid}, {"$set": upd})
    return {"walkthrough": walkthrough, "switch_stage": upd.get("switch_stage", doc.get("switch_stage"))}


@psw1_router.get("/switches/{sid}/decision-walkthrough")
async def get_walkthrough(sid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    w = await _db.switch_decision_walkthroughs.find_one({"provider_switch_id": sid})
    if not w:
        raise HTTPException(status_code=404, detail="Not found")
    w.pop("_id", None)
    return {"walkthrough": w}


# ---------------------------------------------------------------------------
# Notice generation (Section G / D.4)
# ---------------------------------------------------------------------------


class NoticeGenIn(BaseModel):
    notice_period_days: int = DEFAULT_NOTICE_DAYS
    effective_date: Optional[str] = None
    notice_period_source: str = "aged_care_rules_default"


@psw1_router.post("/switches/{sid}/generate-notice")
async def generate_notice(sid: str, body: NoticeGenIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    now = _now()
    effective = body.effective_date or _iso(now + timedelta(days=body.notice_period_days))
    delivery_id = str(uuid.uuid4())
    notice_content = (
        f"Notice of termination for participant {doc['participant_id']}. "
        f"Current provider: {doc['current_provider_name']}. "
        f"Notice period: {body.notice_period_days} days "
        f"(source: {body.notice_period_source}). Effective date: {effective}. "
        "This is a formal notice generated via Wayly."
    )
    await _db.provider_switches.update_one(
        {"id": sid},
        {"$set": {
            "notice_letter_delivery_id": delivery_id,
            "notice_period_days": body.notice_period_days,
            "notice_period_source": body.notice_period_source,
            "switch_target_effective_date": effective,
            "updated_at": now,
        }})
    return {
        "notice_letter_delivery_id": delivery_id,
        "notice_content": notice_content,
        "template": "notice_of_termination",
        "effective_date": effective,
    }


# ---------------------------------------------------------------------------
# Overlap period (Section D.7 / J)
# ---------------------------------------------------------------------------


class OverlapIn(BaseModel):
    service_type: str
    provider_name: str
    effective_start_date: str
    effective_end_date: Optional[str] = None
    attributed_to_budget_of: str = "current_provider"


@psw1_router.post("/switches/{sid}/overlap-service")
async def add_overlap_service(sid: str, body: OverlapIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    now = _now()
    assignment = {
        "id": str(uuid.uuid4()),
        "provider_switch_id": sid,
        "participant_id": doc["participant_id"],
        "service_type": body.service_type,
        "provider_name": body.provider_name,
        "effective_start_date": body.effective_start_date,
        "effective_end_date": body.effective_end_date,
        "attributed_to_budget_of": body.attributed_to_budget_of,
        "attribution_notes": None,
        "created_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.overlap_service_assignments.insert_one(assignment)
    return {"assignment": {k: v for k, v in assignment.items() if k != "_id"}}


@psw1_router.get("/switches/{sid}/overlap-services")
async def list_overlap_services(sid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    cur = _db.overlap_service_assignments.find({"provider_switch_id": sid})
    items = await cur.to_list(length=200)
    return {"assignments": [{k: v for k, v in a.items() if k != "_id"} for a in items]}


# ---------------------------------------------------------------------------
# Post-switch settlement (Sections D.8 / K)
# ---------------------------------------------------------------------------


class SettlementCreateIn(BaseModel):
    refund_calculated_amount: float
    refund_calculation_method: str
    refund_expected_by_date: Optional[str] = None


@psw1_router.post("/switches/{sid}/post-switch-settlement")
async def create_settlement(sid: str, body: SettlementCreateIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    doc = await _db.provider_switches.find_one({"id": sid})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    if _core1_assert_access:
        await _core1_assert_access(user, doc["participant_id"])
    now = _now()
    settlement = {
        "id": str(uuid.uuid4()),
        "provider_switch_id": sid,
        "participant_id": doc["participant_id"],
        "final_invoice_id": None,
        "final_invoice_reviewed_at": None,
        "final_invoice_findings": None,
        "final_statement_id": None,
        "final_statement_reviewed_at": None,
        "final_statement_findings": None,
        "refund_calculated_amount": {"amount": body.refund_calculated_amount, "currency": "AUD"},
        "refund_calculation_method": body.refund_calculation_method,
        "refund_expected_by_date": body.refund_expected_by_date,
        "refund_received_amount": None,
        "refund_received_at": None,
        "refund_reconciliation_variance": None,
        "dispute_case_id": None,
        "dispute_letter_delivery_id": None,
        "settlement_status": "review_complete_refund_pending",
        "completed_at": None,
        "data_residency": "ap-southeast-2",
    }
    await _db.post_switch_settlements.insert_one(settlement)
    await _db.provider_switches.update_one(
        {"id": sid},
        {"$set": {
            "post_switch_settlement_id": settlement["id"],
            "refund_amount_expected": settlement["refund_calculated_amount"],
            "refund_status": "pending_receipt",
            "updated_at": now,
        }})
    return {"settlement": {k: v for k, v in settlement.items() if k != "_id"}}


class RefundReceiptIn(BaseModel):
    refund_received_amount: float


@psw1_router.post("/settlements/{settlement_id}/refund-received")
async def refund_received(settlement_id: str, body: RefundReceiptIn, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    settlement = await _db.post_switch_settlements.find_one({"id": settlement_id})
    if not settlement:
        raise HTTPException(status_code=404, detail="Not found")
    switch = await _db.provider_switches.find_one({"id": settlement["provider_switch_id"]})
    if _core1_assert_access and switch:
        await _core1_assert_access(user, switch["participant_id"])
    now = _now()
    expected = (settlement.get("refund_calculated_amount") or {}).get("amount", 0)
    variance = round(expected - body.refund_received_amount, 2)
    upd = {
        "refund_received_amount": {"amount": body.refund_received_amount, "currency": "AUD"},
        "refund_received_at": now,
        "refund_reconciliation_variance": {"amount": variance, "currency": "AUD"} if variance else None,
    }
    if variance > 0.01:
        upd["settlement_status"] = "refund_received_variance_flagged"
        # Open LOOP-1 dispute case
        if _loop1_open_case and switch:
            try:
                case = await _loop1_open_case(
                    participant_id=switch["participant_id"],
                    case_type="invoice_error",
                    source_tool="psw1",
                    subject=f"Post-switch refund shortfall: ${variance:.2f}",
                    metadata={"switch_id": switch["id"], "settlement_id": settlement_id,
                              "expected": expected, "received": body.refund_received_amount,
                              "variance": variance})
                upd["dispute_case_id"] = case.get("id") if isinstance(case, dict) else None
            except Exception as e:  # pragma: no cover
                logger.warning("loop1 case open failed: %s", e)
    else:
        upd["settlement_status"] = "refund_received_reconciled"
        upd["completed_at"] = now

    await _db.post_switch_settlements.update_one({"id": settlement_id}, {"$set": upd})
    settlement.update(upd)

    switch_upd: Dict[str, Any] = {
        "refund_amount_received": upd["refund_received_amount"],
        "refund_status": ("received_less_than_expected_disputed" if variance > 0.01
                          else "received_matches_expected"),
        "updated_at": now,
    }
    if switch:
        await _db.provider_switches.update_one({"id": switch["id"]}, {"$set": switch_upd})

    return {"settlement": {k: v for k, v in settlement.items() if k != "_id"},
            "variance": variance,
            "dispute_case_id": upd.get("dispute_case_id")}
