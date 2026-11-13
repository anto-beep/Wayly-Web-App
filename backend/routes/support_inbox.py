"""Phase 3A.1 — Unified Support Inbox (read-only aggregation).

A single admin view over the three standard-support intake surfaces:
  * sup_tickets      (source="ticket")   — the authoritative SUP-* system
  * contact_requests (source="enquiry")  — website contact form
  * support_tickets  (source="legacy")   — dormant Phase-D tickets, shown
                                           only during the transition window

Hard guarantees:
  * READ ONLY. No writes, no status changes, no auto-conversion of leads.
  * NEVER returns message bodies or internal notes — only ticket-level
    metadata — so an internal staff note can never leak through this view.
  * Legacy tickets already migrated into sup_* (sup_tickets.migrated_from.*)
    are excluded from the "legacy" source so nothing is double-counted.

Mounted at /api/admin/support/inbox (admin-gated).
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger(__name__)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

# Normalised status buckets so three different status vocabularies can be
# filtered together.
_SUP_BUCKET = {
    "received": "open", "under_review": "open", "awaiting_user": "open",
    "resolved": "resolved", "closed": "closed",
}
_LEGACY_BUCKET = {
    "open": "open", "in_progress": "open", "waiting_on_user": "open",
    "resolved": "resolved", "closed": "closed",
}
_LEGACY_PRIORITY = {"P1": "urgent", "P2": "high", "P3": "normal"}


def _fmt(iso: Optional[str]) -> Optional[str]:
    return iso


def build_support_inbox_router():
    from admin_auth import get_current_admin  # lazy import (no circular dep)

    r = APIRouter(tags=["support-inbox"])

    @r.get("/admin/support/inbox")
    async def unified_inbox(
        source: Optional[str] = Query(None, description="ticket | enquiry | legacy"),
        status: Optional[str] = Query(None, description="open | resolved | closed | new | actioned"),
        priority: Optional[str] = Query(None, description="urgent | high | normal | low | none"),
        date_from: Optional[str] = Query(None),
        date_to: Optional[str] = Query(None),
        q: Optional[str] = Query(None, max_length=200),
        page: int = Query(1, ge=1),
        page_size: int = Query(50, ge=1, le=200),
        admin: dict = Depends(get_current_admin),
    ):
        rows: List[Dict[str, Any]] = []
        last_updated: Dict[str, Optional[str]] = {"ticket": None, "enquiry": None, "legacy": None}

        # Legacy ticket ids already migrated into sup_* must not appear twice.
        migrated_legacy_ids = set()
        async for s in db.sup_tickets.find(
            {"migrated_from.legacy_id": {"$ne": None}},
            {"_id": 0, "migrated_from": 1},
        ):
            lid = (s.get("migrated_from") or {}).get("legacy_id")
            if lid:
                migrated_legacy_ids.add(lid)

        # ---- SUP-* tickets (authoritative) ----
        async for t in db.sup_tickets.find({}, {
            "_id": 0, "id": 1, "reference": 1, "status": 1, "priority": 1,
            "category": 1, "channel": 1, "tool_name": 1, "user_email": 1,
            "user_name": 1, "created_at": 1, "updated_at": 1, "last_activity_at": 1,
            "message_count": 1, "assignee_name": 1, "csat_score": 1,
            "linked_defect_id": 1,
        }).limit(2000):
            created = t.get("created_at")
            if last_updated["ticket"] is None or (created or "") > last_updated["ticket"]:
                last_updated["ticket"] = created
            rows.append({
                "source": "ticket",
                "id": t.get("id"),
                "reference": t.get("reference"),
                "title": t.get("category") or "Support ticket",
                "detail": t.get("tool_name"),
                "status": t.get("status"),
                "status_bucket": _SUP_BUCKET.get(t.get("status"), "open"),
                "priority": t.get("priority") or "normal",
                "requester_email": t.get("user_email"),
                "requester_name": t.get("user_name"),
                "assignee_name": t.get("assignee_name"),
                "channel": t.get("channel"),
                "message_count": t.get("message_count", 0),
                "csat_score": t.get("csat_score"),
                "has_defect": bool(t.get("linked_defect_id")),
                "created_at": created,
                "last_activity_at": t.get("last_activity_at") or t.get("updated_at"),
                "open_path": f"/admin/support/{t.get('id')}",
            })

        # ---- Website contact enquiries (leads; NOT tickets) ----
        async for e in db.contact_requests.find({}, {
            "_id": 0, "id": 1, "name": 1, "email": 1, "intent": 1, "role": 1,
            "status": 1, "created_at": 1, "actioned_at": 1,
        }).limit(2000):
            created = e.get("created_at")
            if last_updated["enquiry"] is None or (created or "") > last_updated["enquiry"]:
                last_updated["enquiry"] = created
            est = e.get("status") or "new"
            rows.append({
                "source": "enquiry",
                "id": e.get("id"),
                "reference": None,
                "title": (e.get("intent") or "general").title() + " enquiry",
                "detail": e.get("role"),
                "status": est,
                "status_bucket": "actioned" if est == "actioned" else "new",
                "priority": "none",
                "requester_email": e.get("email"),
                "requester_name": e.get("name"),
                "assignee_name": None,
                "channel": "website_contact",
                "message_count": None,
                "csat_score": None,
                "has_defect": False,
                "created_at": created,
                "last_activity_at": e.get("actioned_at") or created,
                "open_path": "/admin/enquiries",
            })

        # ---- Legacy Phase-D tickets (transition only; skip migrated) ----
        async for t in db.support_tickets.find({}, {
            "_id": 0, "id": 1, "subject": 1, "status": 1, "priority": 1,
            "category": 1, "user_email": 1, "user_name": 1, "created_at": 1,
            "last_message_at": 1, "resolved_at": 1,
        }).limit(2000):
            if t.get("id") in migrated_legacy_ids:
                continue
            created = t.get("created_at")
            if last_updated["legacy"] is None or (created or "") > last_updated["legacy"]:
                last_updated["legacy"] = created
            rows.append({
                "source": "legacy",
                "id": t.get("id"),
                "reference": None,
                "title": t.get("subject") or "Legacy ticket",
                "detail": t.get("category"),
                "status": t.get("status"),
                "status_bucket": _LEGACY_BUCKET.get(t.get("status"), "open"),
                "priority": _LEGACY_PRIORITY.get(t.get("priority"), "normal"),
                "requester_email": t.get("user_email"),
                "requester_name": t.get("user_name"),
                "assignee_name": None,
                "channel": "legacy",
                "message_count": None,
                "csat_score": None,
                "has_defect": False,
                "created_at": created,
                "last_activity_at": t.get("last_message_at") or created,
                "open_path": None,
            })

        # ---- Counts before filtering (for the header chips) ----
        counts_by_source = {"ticket": 0, "enquiry": 0, "legacy": 0}
        for row in rows:
            counts_by_source[row["source"]] += 1

        # ---- Filter ----
        def _keep(row: Dict[str, Any]) -> bool:
            if source and row["source"] != source:
                return False
            if status and row["status_bucket"] != status:
                return False
            if priority and row["priority"] != priority:
                return False
            created = row.get("created_at") or ""
            if date_from and created < date_from:
                return False
            if date_to and created > date_to:
                return False
            if q:
                ql = q.strip().lower()
                hay = " ".join(str(row.get(k) or "") for k in
                               ("reference", "title", "detail", "requester_email", "requester_name")).lower()
                if ql not in hay:
                    return False
            return True

        filtered = [row for row in rows if _keep(row)]
        counts_by_bucket: Dict[str, int] = {}
        for row in filtered:
            counts_by_bucket[row["status_bucket"]] = counts_by_bucket.get(row["status_bucket"], 0) + 1

        filtered.sort(key=lambda x: (x.get("created_at") or ""), reverse=True)
        total = len(filtered)
        start = (page - 1) * page_size
        page_rows = filtered[start:start + page_size]

        return {
            "rows": page_rows,
            "total": total,
            "page": page,
            "page_size": page_size,
            "counts_by_source": counts_by_source,
            "counts_by_bucket": counts_by_bucket,
            "meta": {
                "sources": [
                    {"name": "ticket", "label": "Support tickets", "count": counts_by_source["ticket"], "last_updated": last_updated["ticket"]},
                    {"name": "enquiry", "label": "Website enquiries", "count": counts_by_source["enquiry"], "last_updated": last_updated["enquiry"]},
                    {"name": "legacy", "label": "Legacy tickets", "count": counts_by_source["legacy"], "last_updated": last_updated["legacy"]},
                ],
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "note": "Read-only view. Message bodies and internal notes are never included.",
            },
        }

    return r
