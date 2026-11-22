"""Wayly, Onboarding draft auto-save.

Persists the caregiver's in-progress onboarding form so a browser refresh (or
tab close) never loses their work. One draft per authenticated user.

Endpoints:
- GET    /api/onboarding/draft   → current draft or `{draft: null}`
- PUT    /api/onboarding/draft   → upsert draft `{data}`
- DELETE /api/onboarding/draft   → clear (called on completion)

Draft doc shape (Mongo collection ``onboarding_drafts``):
    {
        user_id: str,
        data:    dict,        # opaque form snapshot from the frontend
        updated_at: iso str,
    }
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

logger = logging.getLogger("wayly.onboarding_draft")

onboarding_draft_router = APIRouter(tags=["onboarding"])

_db = None
_user_dep = None


def init_onboarding_draft_routes(*, db, user_dep):
    """Wire the shared db handle and auth dependency in from server.py boot."""
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class DraftPayload(BaseModel):
    data: Dict[str, Any]


async def _current_user(request: Request) -> dict:
    if _user_dep is None:
        raise HTTPException(status_code=500, detail="onboarding_draft not initialised")
    return await _user_dep(request)


@onboarding_draft_router.get("/onboarding/draft")
async def get_draft(request: Request):
    user = await _current_user(request)
    doc = await _db.onboarding_drafts.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        return {"draft": None}
    return {
        "draft": {
            "data": doc.get("data") or {},
            "updated_at": doc.get("updated_at"),
        }
    }


@onboarding_draft_router.put("/onboarding/draft")
async def put_draft(payload: DraftPayload, request: Request):
    user = await _current_user(request)
    data = payload.data or {}
    # Reject absurdly large payloads to protect Mongo. Onboarding is ~40 fields
    # of short strings; 32 KB is generous.
    approx = len(json.dumps(data))
    if approx > 32_768:
        raise HTTPException(status_code=413, detail="Draft too large")
    now = _now_iso()
    await _db.onboarding_drafts.update_one(
        {"user_id": user["id"]},
        {
            "$set": {"data": data, "updated_at": now},
            "$setOnInsert": {"user_id": user["id"], "created_at": now},
        },
        upsert=True,
    )
    return {"saved": True, "updated_at": now}


@onboarding_draft_router.delete("/onboarding/draft")
async def delete_draft(request: Request):
    user = await _current_user(request)
    result = await _db.onboarding_drafts.delete_one({"user_id": user["id"]})
    return {"deleted": bool(result.deleted_count)}


async def ensure_onboarding_draft_indexes(db):
    """Called by server.py boot. Idempotent."""
    await db.onboarding_drafts.create_index("user_id", unique=True)
