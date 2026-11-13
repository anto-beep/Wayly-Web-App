"""Wayly BOS — unified Approval registry.

A single mechanism for founder/senior-admin sign-off across NEW business
activities (content, publicity, partnership outreach, experiments, campaign
changes). It does NOT replace the specialised Help Centre or Marketing Expense
approval flows — the Command Centre aggregates all three for display.

Key rule: approval and execution are DIFFERENT states. Approving never marks a
task executed. A material change after approval must re-request approval.

Collection: bos_approvals (keyed by source_collection+source_id).
Mounted at /api/admin/bos/approvals/*.
"""
from __future__ import annotations

import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

STATUSES = ("draft", "submitted", "pending_approval", "approved",
            "rejected", "changes_requested", "executed", "failed", "cancelled")
OPEN_STATUSES = ("submitted", "pending_approval", "changes_requested")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def ensure_indexes() -> None:
    try:
        await db.bos_approvals.create_index([("source_collection", 1), ("source_id", 1)], unique=True)
        await db.bos_approvals.create_index("status")
        await db.bos_approvals.create_index("kind")
        await db.bos_approvals.create_index("created_at")
    except Exception as exc:  # pragma: no cover
        logger.warning("bos_approvals index skipped: %s", exc)


async def request_approval(*, kind: str, source_collection: str, source_id: str,
                           title: str, reason: str = "", owner: Optional[str] = None,
                           priority: str = "normal", evidence: Optional[dict] = None,
                           destination: Optional[str] = None,
                           required_approver: str = "founder",
                           actor: Optional[dict] = None) -> dict:
    """Idempotent upsert: move an item into pending_approval. If it was already
    executed/approved and is being resubmitted, it re-enters pending_approval
    (material-change re-approval)."""
    existing = await db.bos_approvals.find_one(
        {"source_collection": source_collection, "source_id": source_id}, {"_id": 0})
    entry = {
        "status": "pending_approval", "updated_at": _now(),
        "action": "requested", "actor_id": (actor or {}).get("id"),
        "actor_email": (actor or {}).get("email"), "note": None, "ts": _now(),
    }
    if existing:
        await db.bos_approvals.update_one(
            {"id": existing["id"]},
            {"$set": {"status": "pending_approval", "title": title, "reason": reason,
                      "priority": priority, "evidence": evidence or {},
                      "destination": destination, "updated_at": _now()},
             "$push": {"history": entry}})
        return await db.bos_approvals.find_one({"id": existing["id"]}, {"_id": 0})
    doc = {
        "id": uuid.uuid4().hex, "kind": kind, "title": title, "reason": reason,
        "owner": owner, "priority": priority, "evidence": evidence or {},
        "source_collection": source_collection, "source_id": source_id,
        "destination": destination, "required_approver": required_approver,
        "status": "pending_approval", "execution_outcome": None,
        "created_at": _now(), "updated_at": _now(),
        "created_by": (actor or {}).get("id"), "history": [entry],
    }
    await db.bos_approvals.insert_one(doc)
    doc.pop("_id", None)
    return doc


async def _transition(approval_id: str, new_status: str, admin: dict,
                      note: Optional[str] = None, execution_outcome: Optional[str] = None) -> dict:
    a = await db.bos_approvals.find_one({"id": approval_id}, {"_id": 0})
    if not a:
        raise HTTPException(404, "Approval item not found")
    upd: Dict[str, Any] = {"status": new_status, "updated_at": _now()}
    if execution_outcome is not None:
        upd["execution_outcome"] = execution_outcome
    hist = {"status": new_status, "action": new_status, "actor_id": admin.get("id"),
            "actor_email": admin.get("email"), "note": note, "ts": _now()}
    await db.bos_approvals.update_one({"id": approval_id}, {"$set": upd, "$push": {"history": hist}})
    return await db.bos_approvals.find_one({"id": approval_id}, {"_id": 0})


async def list_open() -> List[dict]:
    rows = []
    async for a in db.bos_approvals.find({"status": {"$in": list(OPEN_STATUSES)}}, {"_id": 0}).sort("created_at", 1):
        rows.append(a)
    return rows


class ActionBody(BaseModel):
    note: Optional[str] = Field(default=None, max_length=1000)


def build_bos_approvals_router():
    from admin_auth import require_super_or_ops  # noqa: WPS433
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(ensure_indexes())
    except Exception as exc:  # pragma: no cover
        logger.warning("bos_approvals init skipped: %s", exc)

    r = APIRouter(prefix="/admin/bos/approvals", tags=["bos-approvals"])

    @r.get("")
    async def list_approvals(status: Optional[str] = None,
                             admin: dict = Depends(require_super_or_ops)):
        q = {} if not status else {"status": status}
        rows = []
        async for a in db.bos_approvals.find(q, {"_id": 0}).sort("created_at", -1):
            rows.append(a)
        return {"approvals": rows}

    @r.post("/{approval_id}/approve")
    async def approve(approval_id: str, body: ActionBody, admin: dict = Depends(require_super_or_ops)):
        a = await _transition(approval_id, "approved", admin, body.note)
        # sync the source entity (best-effort)
        await _sync_source(a, "approved", admin)
        return {"ok": True, "approval": a}

    @r.post("/{approval_id}/reject")
    async def reject(approval_id: str, body: ActionBody, admin: dict = Depends(require_super_or_ops)):
        a = await _transition(approval_id, "rejected", admin, body.note)
        await _sync_source(a, "rejected", admin)
        return {"ok": True, "approval": a}

    @r.post("/{approval_id}/request-changes")
    async def request_changes(approval_id: str, body: ActionBody, admin: dict = Depends(require_super_or_ops)):
        a = await _transition(approval_id, "changes_requested", admin, body.note)
        await _sync_source(a, "changes_requested", admin)
        return {"ok": True, "approval": a}

    @r.post("/{approval_id}/mark-executed")
    async def mark_executed(approval_id: str, body: ActionBody, admin: dict = Depends(require_super_or_ops)):
        """Record that the APPROVED action actually happened (manual execution)."""
        a = await db.bos_approvals.find_one({"id": approval_id}, {"_id": 0, "status": 1})
        if not a:
            raise HTTPException(404, "Approval item not found")
        if a.get("status") != "approved":
            raise HTTPException(409, "Only approved items can be marked executed.")
        a2 = await _transition(approval_id, "executed", admin, body.note, execution_outcome=body.note or "executed")
        await _sync_source(a2, "executed", admin)
        return {"ok": True, "approval": a2}

    return r


async def _sync_source(approval: dict, new_state: str, admin: dict) -> None:
    """Reflect an approval decision back onto its source entity's own status
    field, when that collection is one of ours. Best-effort, audited by caller."""
    coll = approval.get("source_collection")
    sid = approval.get("source_id")
    if not coll or not sid:
        return
    mapping = {
        "approved": {"draft": "approved", "publicity": "outreach_authorised",
                     "partnership": "approved", "experiment": "approved"},
    }
    # entity status words differ by collection; use a conservative shared word
    state_word = {
        "approved": "approved", "rejected": "rejected",
        "changes_requested": "changes_requested", "executed": "executed",
    }.get(new_state, new_state)
    try:
        await db[coll].update_one({"id": sid}, {"$set": {
            "approval_state": state_word, "approval_synced_at": _now()}})
    except Exception as exc:  # pragma: no cover
        logger.warning("approval source sync skipped (%s/%s): %s", coll, sid, exc)
