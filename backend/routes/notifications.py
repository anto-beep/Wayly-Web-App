"""Wayly, notification routes (extracted from server.py for modularity).

Exposes the 5 user-facing notification endpoints:
- GET  /notifications          → list + unread count
- POST /notifications/read     → mark all (or specific ids) read
- GET  /notifications/prefs    → per-category opt-in flags
- PUT  /notifications/prefs    → save per-category opt-in flags
- GET  /notifications/stream   → SSE stream for real-time bell updates

Dependencies (db, helpers, constants) are injected via init_notification_routes
to keep this file free of circular imports with server.py.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from auth import get_current_user_id, decode_token

logger = logging.getLogger("wayly.notifications")

notification_router = APIRouter(tags=["notifications"])

# Injected at startup ------------------------------------------------------
_db = None
_get_user = None
_now_iso = None
_default_prefs: Dict[str, bool] = {}
_categories: List[str] = []


def init_notification_routes(*, db, get_user_helper, now_iso_helper,
                             default_prefs, categories):
    """Wire the late-bound dependencies. Called once from server.py at boot."""
    global _db, _get_user, _now_iso, _default_prefs, _categories
    _db = db
    _get_user = get_user_helper
    _now_iso = now_iso_helper
    _default_prefs = default_prefs
    _categories = categories


# -- Body models ------------------------------------------------------------
class NotificationReadBody(BaseModel):
    ids: List[str] = Field(default_factory=list)


class NotificationPrefsBody(BaseModel):
    prefs: dict = Field(default_factory=dict)


# -- Routes -----------------------------------------------------------------
@notification_router.get("/notifications")
async def list_notifications(user_id: str = Depends(get_current_user_id)):
    cur = _db.notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(30)
    items = await cur.to_list(30)
    unread = await _db.notifications.count_documents({"user_id": user_id, "read": False})
    return {"items": items, "unread": unread}


@notification_router.post("/notifications/read")
async def mark_notifications_read(body: NotificationReadBody, user_id: str = Depends(get_current_user_id)):
    query: dict = {"user_id": user_id}
    if body.ids:
        query["id"] = {"$in": body.ids}
    res = await _db.notifications.update_many(query, {"$set": {"read": True, "read_at": _now_iso()}})
    return {"ok": True, "modified": res.modified_count}


@notification_router.get("/notifications/prefs")
async def get_notification_prefs(user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    prefs = u.get("notification_prefs") or _default_prefs
    return {"prefs": {c: bool(prefs.get(c, True)) for c in _categories}}


@notification_router.put("/notifications/prefs")
async def put_notification_prefs(body: NotificationPrefsBody, user_id: str = Depends(get_current_user_id)):
    clean = {c: bool(body.prefs.get(c, True)) for c in _categories}
    await _db.users.update_one({"id": user_id}, {"$set": {"notification_prefs": clean}})
    return {"ok": True, "prefs": clean}


@notification_router.get("/notifications/stream")
async def stream_notifications(request: Request, token: Optional[str] = None):
    """Server-Sent Events stream for real-time bell updates.

    EventSource cannot send custom Authorization headers, so we accept the JWT
    via the ``?token=`` query string. The stream emits one ``notification``
    event per newly inserted row and a ``heartbeat`` every 25 seconds so
    proxies don't close the connection.
    """
    auth_header = request.headers.get("authorization", "")
    jwt_str = None
    if token:
        jwt_str = token
    elif auth_header.lower().startswith("bearer "):
        jwt_str = auth_header.split(" ", 1)[1]
    if not jwt_str:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        user_id = decode_token(jwt_str)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    async def event_stream():
        last_ts = datetime.now(timezone.utc).isoformat()
        unread = await _db.notifications.count_documents({"user_id": user_id, "read": False})
        yield f"event: snapshot\ndata: {json.dumps({'unread': unread})}\n\n"
        heartbeat = 0
        while True:
            if await request.is_disconnected():
                return
            try:
                cur = _db.notifications.find(
                    {"user_id": user_id, "created_at": {"$gt": last_ts}},
                    {"_id": 0},
                ).sort("created_at", 1)
                docs = await cur.to_list(20)
                for doc in docs:
                    last_ts = doc.get("created_at", last_ts)
                    yield f"event: notification\ndata: {json.dumps(doc)}\n\n"
                heartbeat += 1
                if heartbeat % 25 == 0:
                    yield "event: heartbeat\ndata: {}\n\n"
            except Exception as e:
                logger.warning(f"SSE tick error: {e}")
            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
