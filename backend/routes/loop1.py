"""LOOP-1 v1: Closed-loop case framework.

A "case" is a piece of work waiting for someone to do something, a
statement anomaly needing review, an invoice error needing a letter, a
care plan gap needing a conversation, an unanswered provider letter, a
price above reference. Cases live under a participant and drive the
"Open follow-ups" card on the CORE-1 profile.

Ships behind feature flag `LOOP1_CASES_ENABLED` (env, default "1").
When disabled, all endpoints return 404.

Case types (v1 registry):
  statement_anomaly_ready       from Statement Decoder anomalies
  invoice_issue_review          from Invoice Checker verdicts
  care_plan_review_findings     from Care Plan Reviewer findings
  letter_awaiting_reply         from LF-1 sent correspondence
  price_over_reference          from Provider Price Checker
  reclassification_review       from LCA-1 October reclassification scanner
  manual                        opened by the user directly
  system                        opened by internal jobs

Case statuses:
  open                  new, needs attention
  in_progress           user has started acting
  waiting_on_provider   letter sent, waiting for reply
  resolved              closed with an outcome
  dismissed             closed without action (marked as noise)

Endpoints (all under /api/loop):
  GET  /cases                             list cases (filter by status, participant, type)
  GET  /cases/{cid}                       case detail (with events)
  POST /cases                              open a case (internal + manual)
  PATCH /cases/{cid}                       update status/notes/assignee
  POST /cases/{cid}/events                 append a case event (comment, action, transition)
  POST /cases/scan                          run the auto-opener for a participant
  GET  /cases/registry                    return the case type registry (metadata)
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.loop1")

loop1_router = APIRouter(prefix="/loop", tags=["loop1"])

_db = None
_user_dep = None
_core1_assert_access = None  # reuse CORE-1's access check
_core1_write_event = None    # reuse CORE-1's timeline event writer


def init_loop1_routes(*, db, user_dep, core1_assert_access, core1_write_timeline):
    global _db, _user_dep, _core1_assert_access, _core1_write_event
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _core1_write_event = core1_write_timeline


def _flag_enabled() -> bool:
    return os.environ.get("LOOP1_CASES_ENABLED", "1") != "0"


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if not dt:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


# ---------------------------------------------------------------------------
# Case type registry
# ---------------------------------------------------------------------------

CASE_TYPES = {
    "statement_anomaly_ready": {
        "label": "Statement anomaly to review",
        "source_tool": "statement_decoder",
        "default_severity": "medium",
        "auto_open": True,
        "resolution_action_label": "Review anomaly",
    },
    "invoice_issue_review": {
        "label": "Invoice needs a follow-up",
        "source_tool": "invoice_checker",
        "default_severity": "high",
        "auto_open": True,
        "resolution_action_label": "Draft a letter",
    },
    "care_plan_review_findings": {
        "label": "Care plan review findings",
        "source_tool": "care_plan_reviewer",
        "default_severity": "medium",
        "auto_open": True,
        "resolution_action_label": "Review findings",
    },
    "letter_awaiting_reply": {
        "label": "Letter awaiting a reply",
        "source_tool": "lf1",
        "default_severity": "medium",
        "auto_open": True,
        "resolution_action_label": "Mark reply received",
        "sla_days": 14,
    },
    "price_over_reference": {
        "label": "Price above reference",
        "source_tool": "ppc",
        "default_severity": "low",
        "auto_open": True,
        "resolution_action_label": "Compare providers",
    },
    "reclassification_review": {
        "label": "Reclassification opportunity, 1 Oct",
        "source_tool": "lca1",
        "default_severity": "high",
        "auto_open": True,
        "resolution_action_label": "Review classification",
        "campaign": "oct_2026",
    },
    "manual": {
        "label": "Manual follow-up",
        "source_tool": "manual",
        "default_severity": "low",
        "auto_open": False,
        "resolution_action_label": "Mark complete",
    },
    "system": {
        "label": "System alert",
        "source_tool": "system",
        "default_severity": "medium",
        "auto_open": False,
        "resolution_action_label": "Acknowledge",
    },
}

OPEN_STATUSES = {"open", "in_progress", "waiting_on_provider"}
CLOSED_STATUSES = {"resolved", "dismissed"}
ALL_STATUSES = OPEN_STATUSES | CLOSED_STATUSES


# ---------------------------------------------------------------------------
# Data helpers
# ---------------------------------------------------------------------------


def _case_public(c: dict, events: Optional[List[dict]] = None) -> dict:
    meta = CASE_TYPES.get(c.get("case_type"), {})
    return {
        "id": c.get("id"),
        "participant_id": c.get("participant_id"),
        "case_type": c.get("case_type"),
        "case_type_label": meta.get("label"),
        "source_tool": c.get("source_tool") or meta.get("source_tool"),
        "source_artefact_id": c.get("source_artefact_id"),
        "source_artefact_type": c.get("source_artefact_type"),
        "title": c.get("title"),
        "summary": c.get("summary"),
        "severity": c.get("severity") or meta.get("default_severity") or "medium",
        "status": c.get("status") or "open",
        "assignee_user_id": c.get("assignee_user_id"),
        "sla_deadline": _iso(c.get("sla_deadline")),
        "created_at": _iso(c.get("created_at")),
        "updated_at": _iso(c.get("updated_at")),
        "closed_at": _iso(c.get("closed_at")),
        "resolution_notes": c.get("resolution_notes"),
        "resolution_action_label": meta.get("resolution_action_label"),
        "metadata": c.get("metadata") or {},
        "events": events or [],
        "data_residency": "ap-southeast-2",
    }


def _case_event_public(e: dict) -> dict:
    return {
        "id": e.get("id"),
        "case_id": e.get("case_id"),
        "event_type": e.get("event_type"),  # opened, status_changed, note_added, sla_breached, closed
        "actor_type": e.get("actor_type"),
        "actor_id": e.get("actor_id"),
        "note": e.get("note"),
        "old_status": e.get("old_status"),
        "new_status": e.get("new_status"),
        "created_at": _iso(e.get("created_at")),
    }


async def _write_case_event(case_id: str, *, event_type: str, actor_type: str = "system",
                            actor_id: Optional[str] = None, note: Optional[str] = None,
                            old_status: Optional[str] = None, new_status: Optional[str] = None) -> dict:
    ev = {
        "id": str(uuid.uuid4()),
        "case_id": case_id,
        "event_type": event_type,
        "actor_type": actor_type,
        "actor_id": actor_id,
        "note": note,
        "old_status": old_status,
        "new_status": new_status,
        "created_at": _now(),
    }
    await _db.case_events.insert_one(dict(ev))
    return ev


# ---------------------------------------------------------------------------
# List / get / create / update
# ---------------------------------------------------------------------------


@loop1_router.get("/cases/registry")
async def get_registry():
    await _assert_flag()
    return {"case_types": CASE_TYPES, "open_statuses": sorted(OPEN_STATUSES), "closed_statuses": sorted(CLOSED_STATUSES)}


@loop1_router.get("/cases")
async def list_cases(
    request: Request,
    participant_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None, description="open|in_progress|waiting_on_provider|resolved|dismissed|open_any"),
    case_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
):
    await _assert_flag()
    user = await _user_dep(request)

    q: Dict[str, Any] = {}
    if participant_id:
        await _core1_assert_access(user, participant_id)
        q["participant_id"] = participant_id
    else:
        # Scope to caller's accessible participants
        accessible = await _accessible_participant_ids(user)
        if not accessible:
            return {"cases": []}
        q["participant_id"] = {"$in": accessible}

    if status:
        if status == "open_any":
            q["status"] = {"$in": list(OPEN_STATUSES)}
        elif status in ALL_STATUSES:
            q["status"] = status
    if case_type:
        q["case_type"] = case_type

    cur = _db.cases.find(q, {"_id": 0}).sort([("severity", -1), ("created_at", -1)]).limit(limit)
    docs = await cur.to_list(limit)
    return {"cases": [_case_public(c) for c in docs], "count": len(docs)}


async def _accessible_participant_ids(user: dict) -> List[str]:
    """Resolve every participant id the caller can see.

    Mirrors the CORE-1 access rules: account_id membership OR household_id.
    """
    ids: List[str] = []
    # account
    uid = user.get("id")
    acct_id = None
    if uid:
        member = await _db.account_members.find_one({"user_id": uid, "status": "ACTIVE"}, {"_id": 0, "account_id": 1})
        if member:
            acct_id = member.get("account_id")
        if not acct_id:
            acct = await _db.accounts.find_one({"owner_user_id": uid}, {"_id": 0, "id": 1})
            if acct:
                acct_id = acct.get("id")
    hid = user.get("household_id")
    q_or = []
    if acct_id:
        q_or.append({"account_id": acct_id})
    if hid:
        q_or.append({"household_id": hid})
    if not q_or:
        return []
    async for p in _db.participants.find(
        {"$or": q_or, "is_archived": {"$ne": True}, "status": {"$ne": "REMOVED"}},
        {"_id": 0, "id": 1},
    ):
        if p.get("id"):
            ids.append(p["id"])
    return ids


@loop1_router.get("/cases/{cid}")
async def get_case(cid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.cases.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    await _core1_assert_access(user, c["participant_id"])  # authorises via participant scope
    events = []
    async for e in _db.case_events.find({"case_id": cid}, {"_id": 0}).sort("created_at", 1):
        events.append(_case_event_public(e))
    return _case_public(c, events)


class CaseCreate(BaseModel):
    participant_id: str
    case_type: str
    title: str
    summary: Optional[str] = None
    source_tool: Optional[str] = None
    source_artefact_id: Optional[str] = None
    source_artefact_type: Optional[str] = None
    severity: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


@loop1_router.post("/cases")
async def create_case(payload: CaseCreate, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, payload.participant_id)
    if payload.case_type not in CASE_TYPES:
        raise HTTPException(status_code=422, detail=f"Unknown case_type: {payload.case_type}")
    c = await _open_case(
        participant_id=payload.participant_id,
        case_type=payload.case_type,
        title=payload.title,
        summary=payload.summary,
        source_tool=payload.source_tool,
        source_artefact_id=payload.source_artefact_id,
        source_artefact_type=payload.source_artefact_type,
        severity=payload.severity,
        actor_type="user",
        actor_id=user.get("id"),
        metadata=payload.metadata,
    )
    return _case_public(c)


class CasePatch(BaseModel):
    status: Optional[str] = None
    assignee_user_id: Optional[str] = None
    resolution_notes: Optional[str] = None
    severity: Optional[str] = None


@loop1_router.patch("/cases/{cid}")
async def patch_case(cid: str, payload: CasePatch, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.cases.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    await _core1_assert_access(user, c["participant_id"])

    updates: Dict[str, Any] = {"updated_at": _now()}
    old_status = c.get("status")
    new_status = payload.status
    status_changed = False
    if new_status and new_status != old_status:
        if new_status not in ALL_STATUSES:
            raise HTTPException(status_code=422, detail=f"Unknown status: {new_status}")
        updates["status"] = new_status
        status_changed = True
        if new_status in CLOSED_STATUSES and not c.get("closed_at"):
            updates["closed_at"] = _now()
        elif new_status in OPEN_STATUSES and c.get("closed_at"):
            updates["closed_at"] = None
    if "assignee_user_id" in payload.model_fields_set:
        updates["assignee_user_id"] = payload.assignee_user_id  # may be None to unassign
    if payload.resolution_notes is not None:
        updates["resolution_notes"] = payload.resolution_notes
    if payload.severity is not None:
        updates["severity"] = payload.severity

    await _db.cases.update_one({"id": cid}, {"$set": updates})

    if status_changed:
        await _write_case_event(cid, event_type="status_changed", actor_type="user",
                                actor_id=user.get("id"), old_status=old_status, new_status=new_status)
        # Also emit a CORE-1 timeline event
        p = c.get("participant_id")
        await _core1_write_event(
            participant_id=p, event_type="case_status_changed", event_source="loop1",
            actor_type="user", actor_id=user.get("id"),
            summary_tokens={
                "caregiver": f"Case '{c.get('title','case')}' moved to {new_status.replace('_',' ')}",
                "participant_self": f"Case '{c.get('title','case')}' moved to {new_status.replace('_',' ')}",
            },
            linked_case_id=cid,
        )

    c2 = await _db.cases.find_one({"id": cid}, {"_id": 0})
    return _case_public(c2)


class CaseEventCreate(BaseModel):
    event_type: str = Field(pattern=r"^(note_added|action_taken|reminder)$")
    note: Optional[str] = None


@loop1_router.post("/cases/{cid}/events")
async def post_case_event(cid: str, payload: CaseEventCreate, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    c = await _db.cases.find_one({"id": cid}, {"_id": 0})
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    await _core1_assert_access(user, c["participant_id"])
    ev = await _write_case_event(cid, event_type=payload.event_type, actor_type="user",
                                  actor_id=user.get("id"), note=payload.note)
    await _db.cases.update_one({"id": cid}, {"$set": {"updated_at": _now()}})
    return _case_event_public(ev)


# ---------------------------------------------------------------------------
# Core case opener (idempotent by dedupe_key)
# ---------------------------------------------------------------------------


async def _open_case(
    *,
    participant_id: str,
    case_type: str,
    title: str,
    summary: Optional[str] = None,
    source_tool: Optional[str] = None,
    source_artefact_id: Optional[str] = None,
    source_artefact_type: Optional[str] = None,
    severity: Optional[str] = None,
    actor_type: str = "system",
    actor_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
    dedupe_key: Optional[str] = None,
) -> dict:
    """Create a case (idempotent on dedupe_key). Emits case_events.opened +
    a CORE-1 timeline event `case_opened`."""
    meta = CASE_TYPES.get(case_type, {})
    dedupe_key = dedupe_key or (
        f"{case_type}:{source_artefact_type or ''}:{source_artefact_id or ''}"
        if source_artefact_id else None
    )

    # Idempotency check: if a case with the same dedupe_key already exists and
    # is still open, return it unchanged.
    if dedupe_key:
        existing = await _db.cases.find_one({
            "participant_id": participant_id,
            "dedupe_key": dedupe_key,
            "status": {"$in": list(OPEN_STATUSES)},
        }, {"_id": 0})
        if existing:
            return existing

    now = _now()
    sla_deadline = None
    sla_days = meta.get("sla_days")
    if sla_days:
        from datetime import timedelta
        sla_deadline = now + timedelta(days=sla_days)

    case = {
        "id": str(uuid.uuid4()),
        "participant_id": participant_id,
        "case_type": case_type,
        "source_tool": source_tool or meta.get("source_tool"),
        "source_artefact_id": source_artefact_id,
        "source_artefact_type": source_artefact_type,
        "title": title,
        "summary": summary,
        "severity": severity or meta.get("default_severity") or "medium",
        "status": "open",
        "assignee_user_id": None,
        "sla_deadline": sla_deadline,
        "resolution_notes": None,
        "closed_at": None,
        "dedupe_key": dedupe_key,
        "metadata": metadata or {},
        "created_at": now,
        "updated_at": now,
        "data_residency": "ap-southeast-2",
    }
    await _db.cases.insert_one(dict(case))
    await _write_case_event(case["id"], event_type="opened", actor_type=actor_type, actor_id=actor_id)
    # CORE-1 timeline
    await _core1_write_event(
        participant_id=participant_id, event_type="case_opened", event_source="loop1",
        actor_type=actor_type, actor_id=actor_id,
        summary_tokens={
            "caregiver": f"Case opened: {title}",
            "participant_self": f"Case opened: {title}",
        },
        linked_case_id=case["id"],
        linked_artefact_id=source_artefact_id,
        linked_artefact_type=source_artefact_type,
    )
    return case


# ---------------------------------------------------------------------------
# Auto-opener: scan a participant's tool artefacts and open cases
# ---------------------------------------------------------------------------


@loop1_router.post("/cases/scan")
async def scan_participant(request: Request, participant_id: str = Query(...)):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, participant_id)
    result = await scan_participant_for_cases(participant_id)
    return {"opened": result["opened"], "skipped_deduped": result["skipped_deduped"], "scanned_sources": result["scanned_sources"]}


async def scan_participant_for_cases(participant_id: str) -> dict:
    """Scan every source tool for auto-openable findings and open cases.
    Idempotent (dedupe_key prevents duplicates)."""
    opened = 0
    skipped = 0
    scanned: List[str] = []
    p = await _db.participants.find_one({"id": participant_id}, {"_id": 0})
    if not p:
        return {"opened": 0, "skipped_deduped": 0, "scanned_sources": []}
    hid = p.get("household_id")
    acct_id = p.get("account_id")

    user_ids: List[str] = []
    if hid:
        async for u in _db.users.find({"household_id": hid}, {"_id": 0, "id": 1}):
            user_ids.append(u["id"])

    # 1. Statement anomalies → statement_anomaly_ready (one case per statement with anomalies)
    scanned.append("statement_decoder")
    async for s in _db.statements.find(
        {"$or": [{"participant_id": participant_id}, {"household_id": hid}], "anomalies": {"$exists": True, "$ne": []}},
        {"_id": 0, "id": 1, "period_label": 1, "anomalies": 1},
    ):
        n = len(s.get("anomalies") or [])
        if n == 0:
            continue
        r = await _open_case_check(
            participant_id, "statement_anomaly_ready",
            title=f"{n} anomal{'ies' if n != 1 else 'y'} in {s.get('period_label') or 'a statement'}",
            summary=f"Review the {n} flagged item{'s' if n != 1 else ''} in your latest decoded statement.",
            source_artefact_id=s.get("id"), source_artefact_type="statement",
            severity="high" if n >= 3 else "medium",
        )
        opened += r["opened"]; skipped += r["skipped"]

    # 2. Invoice checks → invoice_issue_review (verdict != all_good)
    scanned.append("invoice_checker")
    async for i in _db.invoices.find(
        {"participant_id": participant_id, "reconciliation.overall_verdict": {"$in": ["questions_to_raise", "significant_issues", "requires_letter"]}},
        {"_id": 0, "id": 1, "provider_name": 1, "reconciliation.overall_verdict": 1},
    ):
        verdict = (i.get("reconciliation") or {}).get("overall_verdict")
        r = await _open_case_check(
            participant_id, "invoice_issue_review",
            title=f"Invoice from {i.get('provider_name') or 'provider'}, {verdict.replace('_',' ')}",
            summary="Review the reconciliation and consider drafting a letter to the provider.",
            source_artefact_id=i.get("id"), source_artefact_type="invoice",
            severity="high" if verdict == "significant_issues" else "medium",
        )
        opened += r["opened"]; skipped += r["skipped"]

    # 3. Care plan reviews → care_plan_review_findings
    scanned.append("care_plan_reviewer")
    async for cpr in _db.care_plan_review_runs.find(
        {"$or": [{"participant_id": participant_id}]}, {"_id": 0, "id": 1, "findings": 1, "status": 1},
    ):
        findings = cpr.get("findings") or []
        n = len(findings) if isinstance(findings, list) else 0
        if n == 0 and cpr.get("status") != "completed_with_findings":
            continue
        r = await _open_case_check(
            participant_id, "care_plan_review_findings",
            title=f"Care plan review: {n or 'multiple'} finding{'s' if n != 1 else ''}",
            summary="Review the findings from the latest care plan analysis.",
            source_artefact_id=cpr.get("id"), source_artefact_type="care_plan_review",
        )
        opened += r["opened"]; skipped += r["skipped"]

    # 4. LF-1 sent correspondence with no reply after threshold → letter_awaiting_reply
    scanned.append("lf1")
    async for lf in _db.lf1_correspondence.find(
        {"participant_id": participant_id, "status": {"$in": ["sent", "dispatched", "posted"]}, "reply_received_at": {"$in": [None, "", False]}},
        {"_id": 0, "id": 1, "archetype": 1, "sent_at": 1, "status": 1},
    ):
        r = await _open_case_check(
            participant_id, "letter_awaiting_reply",
            title=f"{(lf.get('archetype') or 'letter').replace('_',' ').title()} awaiting reply",
            summary="Track progress and follow up if no reply arrives within the SLA.",
            source_artefact_id=lf.get("id"), source_artefact_type="letter",
        )
        opened += r["opened"]; skipped += r["skipped"]

    # 5. Price checks with price_over_reference flag
    scanned.append("ppc")
    if user_ids:
        async for pc in _db.ppc_saved_checks.find(
            {"user_id": {"$in": user_ids}, "verdict": {"$in": ["above_reference", "well_above"]}},
            {"_id": 0, "id": 1, "service_category": 1, "verdict": 1},
        ):
            r = await _open_case_check(
                participant_id, "price_over_reference",
                title=f"{(pc.get('service_category') or 'Service').title()} priced above reference",
                summary="Consider comparing providers or asking about the difference.",
                source_artefact_id=pc.get("id"), source_artefact_type="price_check",
                severity="low",
            )
            opened += r["opened"]; skipped += r["skipped"]

    return {"opened": opened, "skipped_deduped": skipped, "scanned_sources": scanned}


async def _open_case_check(participant_id: str, case_type: str, **kwargs) -> dict:
    dedupe_key = f"{case_type}:{kwargs.get('source_artefact_type','')}:{kwargs.get('source_artefact_id','')}"
    existing = await _db.cases.find_one({
        "participant_id": participant_id, "dedupe_key": dedupe_key,
        "status": {"$in": list(OPEN_STATUSES)},
    }, {"_id": 0, "id": 1})
    if existing:
        return {"opened": 0, "skipped": 1}
    await _open_case(participant_id=participant_id, case_type=case_type, dedupe_key=dedupe_key, **kwargs)
    return {"opened": 1, "skipped": 0}


# ---------------------------------------------------------------------------
# Status endpoint
# ---------------------------------------------------------------------------

@loop1_router.get("/status")
async def loop1_status():
    return {
        "loop_1_cases": _flag_enabled(),
        "version": "v1",
        "case_type_count": len(CASE_TYPES),
        "data_residency": "ap-southeast-2",
    }


async def ensure_loop1_indexes():
    try:
        await _db.cases.create_index("id", unique=True, sparse=True)
        await _db.cases.create_index([("participant_id", 1), ("status", 1), ("created_at", -1)])
        await _db.cases.create_index([("participant_id", 1), ("dedupe_key", 1)])
        await _db.case_events.create_index([("case_id", 1), ("created_at", 1)])
    except Exception as e:
        logger.warning("loop1 index creation failed: %s", e)


# ---------------------------------------------------------------------------
# LCA-1 October reclassification alert
# ---------------------------------------------------------------------------

async def run_lca1_scan_for_participant(participant_id: str) -> Optional[dict]:
    """Scan the participant's signals and open a reclassification_review case
    if the participant is a strong candidate for reclassification ahead of
    the 1 October 2026 window.

    Simple heuristic v1:
      • Current classification is 2 or 3 AND
      • Latest statement spend > 75% of quarterly budget AND
      • There is at least one recent statement anomaly
    """
    p = await _db.participants.find_one({"id": participant_id}, {"_id": 0})
    if not p:
        return None
    band = p.get("classification") or p.get("classification_level")
    if band not in (2, 3):
        return None

    # latest statement
    stmt = await _db.statements.find_one(
        {"$or": [{"participant_id": participant_id}, {"household_id": p.get("household_id")}]},
        {"_id": 0, "id": 1, "summary": 1, "anomalies": 1, "uploaded_at": 1},
        sort=[("uploaded_at", -1)],
    )
    if not stmt:
        return None
    summary = stmt.get("summary") if isinstance(stmt.get("summary"), dict) else {}
    spent = summary.get("total") or summary.get("total_spent") or 0
    if not spent:
        return None

    # rough quarterly ceiling by band (from INDEX-1)
    band_quarterly_ceiling = {2: 4500, 3: 6500, 4: 8500, 5: 10500}.get(band, 6000)
    threshold = band_quarterly_ceiling * 0.75
    if spent < threshold:
        return None

    anomaly_count = len(stmt.get("anomalies") or [])
    if anomaly_count == 0:
        return None

    signal = {
        "spent_ratio": round(spent / band_quarterly_ceiling, 2),
        "anomaly_count": anomaly_count,
        "current_band": band,
        "statement_id": stmt.get("id"),
    }

    case = await _open_case(
        participant_id=participant_id,
        case_type="reclassification_review",
        title="Consider reclassification review before 1 October",
        summary=(
            f"Recent statement shows spending at {int(signal['spent_ratio']*100)}% of the "
            f"Level {band} quarterly ceiling with {anomaly_count} flagged item"
            f"{'s' if anomaly_count != 1 else ''}. This could indicate the current "
            f"classification is no longer a fit, reviewers open cases like this "
            f"before the 1 Oct 2026 window closes."
        ),
        source_tool="lca1",
        source_artefact_id=stmt.get("id"),
        source_artefact_type="statement",
        severity="high",
        metadata={"lca1_signal": signal},
        dedupe_key=f"reclassification_review:oct2026:{participant_id}",
    )
    return case


@loop1_router.post("/lca1/scan")
async def lca1_scan(request: Request, participant_id: str = Query(...)):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, participant_id)
    result = await run_lca1_scan_for_participant(participant_id)
    if not result:
        return {"opened": False, "reason": "no_signal"}
    return {"opened": True, "case_id": result.get("id"), "signal": result.get("metadata", {}).get("lca1_signal")}
