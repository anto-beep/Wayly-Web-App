"""FC-2 v1 · Family Coordinator v2.

Household coordination around a participant:
  - Tasks (assign / complete / cancel)
  - Shared calendar entries (feeds SDL-1 attendance; disputes open a LOOP-1 case)
  - Household message thread (per participant)
  - Participant voice notes (flagship: preferences, wishes, concerns) with
    explicit visibility control and sensitive-content detection
  - Incident log (read-only aggregate over LOOP-1 cases, SDL-1 disputes, LF letters)
  - Handover pack PDF (on-demand, generation metadata persisted)

Ships behind feature flag FC2_ENABLED. Every endpoint is household-scoped via
CORE-1; voice notes add a visibility check.
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.fc2")

fc2_router = APIRouter(prefix="/fc2", tags=["fc2"])

_db = None
_user_dep: Optional[Callable] = None
_core1_assert_access: Optional[Callable] = None
_loop1_open_case: Optional[Callable] = None

RESIDENCY = "ap-southeast-2"

# Sensitive-content keyword scan (Section N, lightweight v1).
_SENSITIVE = {
    "harm_disclosure": ["kill myself", "end my life", "suicide", "want to die", "hurt myself"],
    "elder_abuse_indicators": ["hits me", "hit me", "threatens", "steals my money", "locks me", "won't feed", "afraid of them", "yells at me"],
    "distress": ["can't cope", "cannot cope", "hopeless", "so scared", "terrified", "give up"],
}
CRISIS_RESOURCES = [
    {"name": "Lifeline", "phone": "13 11 14", "note": "24/7 crisis support"},
    {"name": "1800RESPECT", "phone": "1800 737 732", "note": "Abuse and family violence support"},
    {"name": "Older Persons Advocacy Network (OPAN)", "phone": "1800 700 600", "note": "Free aged care advocacy"},
]


def init_fc2_routes(*, db, user_dep, core1_assert_access, loop1_open_case):
    global _db, _user_dep, _core1_assert_access, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _loop1_open_case = loop1_open_case


def _flag() -> bool:
    return os.environ.get("FC2_ENABLED", "1") != "0"


async def _assert_flag():
    if not _flag():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    return dt.astimezone(timezone.utc).isoformat()


async def _uid(request) -> str:
    u = await _user_dep(request)
    return (u.get("id") if isinstance(u, dict) else getattr(u, "id", None)) or ""


async def _access(request, pid: str):
    u = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(u, pid)
    return u


async def _participant(pid: str) -> dict:
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    return p


async def ensure_fc2_indexes(db) -> None:
    try:
        await db.tasks.create_index([("participant_id", 1), ("status", 1), ("due_date", 1)])
        await db.calendar_entries.create_index([("participant_id", 1), ("start_datetime", 1)])
        await db.household_messages.create_index([("participant_id", 1), ("created_at", -1)])
        await db.participant_voice_notes.create_index([("participant_id", 1), ("category", 1), ("visibility", 1)])
        await db.handover_pack_generations.create_index([("participant_id", 1), ("generated_at", -1)])
    except Exception as e:  # pragma: no cover
        logger.warning("fc2 index creation skipped: %s", e)


# ===========================================================================
# D.1 Tasks
# ===========================================================================

def _view_task(t: dict) -> dict:
    return {
        "id": t["id"], "participant_id": t["participant_id"], "title": t.get("title"),
        "description": t.get("description"), "assignee_user_id": t.get("assignee_user_id"),
        "assignee_name": t.get("assignee_name"), "due_date": t.get("due_date"),
        "status": t.get("status", "open"), "created_by_user_id": t.get("created_by_user_id"),
        "created_at": _iso(t.get("created_at")), "updated_at": _iso(t.get("updated_at")),
        "completed_at": _iso(t.get("completed_at")), "completion_note": t.get("completion_note"),
    }


class TaskCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    assignee_user_id: Optional[str] = None
    assignee_name: Optional[str] = None
    due_date: Optional[str] = None


class TaskPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_user_id: Optional[str] = None
    assignee_name: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None


@fc2_router.get("/participants/{pid}/tasks")
async def list_tasks(pid: str, request: Request, status: Optional[str] = None,
                     assignee_user_id: Optional[str] = None, include_cancelled: bool = False,
                     limit: int = 200):
    await _assert_flag()
    await _access(request, pid)
    q: Dict[str, Any] = {"participant_id": pid, "deleted_at": None}
    if status:
        q["status"] = status
    elif not include_cancelled:
        q["status"] = {"$ne": "cancelled"}
    if assignee_user_id:
        q["assignee_user_id"] = assignee_user_id
    rows = []
    async for t in _db.tasks.find(q, {"_id": 0}).sort("created_at", -1).limit(min(limit, 500)):
        rows.append(_view_task(t))
    return {"tasks": rows, "count": len(rows)}


@fc2_router.post("/participants/{pid}/tasks")
async def create_task(pid: str, body: TaskCreate, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _access(request, pid)
    p = await _participant(pid)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()), "participant_id": pid, "household_id": p.get("household_id"),
        "title": body.title.strip(), "description": (body.description or "").strip() or None,
        "assignee_user_id": body.assignee_user_id, "assignee_name": body.assignee_name,
        "due_date": body.due_date, "status": "open", "created_by_user_id": uid,
        "created_at": now, "updated_at": now, "completed_at": None, "completed_by_user_id": None,
        "completion_note": None, "cancelled_at": None, "cancelled_by_user_id": None,
        "deleted_at": None, "data_residency": RESIDENCY,
    }
    await _db.tasks.insert_one(dict(doc))
    return {"task": _view_task(doc)}


async def _load_task(tid: str, request) -> dict:
    t = await _db.tasks.find_one({"id": tid, "deleted_at": None}, {"_id": 0})
    if not t:
        raise HTTPException(status_code=404, detail="Task not found")
    await _access(request, t["participant_id"])
    return t


@fc2_router.patch("/tasks/{tid}")
async def patch_task(tid: str, body: TaskPatch, request: Request):
    await _assert_flag()
    t = await _load_task(tid, request)
    update = {k: v for k, v in body.dict().items() if v is not None}
    update["updated_at"] = _now()
    await _db.tasks.update_one({"id": tid}, {"$set": update})
    fresh = await _db.tasks.find_one({"id": tid}, {"_id": 0})
    return {"task": _view_task(fresh)}


class TaskComplete(BaseModel):
    completion_note: Optional[str] = None


@fc2_router.post("/tasks/{tid}/complete")
async def complete_task(tid: str, body: TaskComplete, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _load_task(tid, request)
    now = _now()
    await _db.tasks.update_one({"id": tid}, {"$set": {
        "status": "done", "completed_at": now, "completed_by_user_id": uid,
        "completion_note": body.completion_note, "updated_at": now}})
    fresh = await _db.tasks.find_one({"id": tid}, {"_id": 0})
    return {"task": _view_task(fresh)}


class TaskCancel(BaseModel):
    cancellation_reason: str = Field("", max_length=1000)


@fc2_router.post("/tasks/{tid}/cancel")
async def cancel_task(tid: str, body: TaskCancel, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _load_task(tid, request)
    now = _now()
    await _db.tasks.update_one({"id": tid}, {"$set": {
        "status": "cancelled", "cancelled_at": now, "cancelled_by_user_id": uid,
        "cancellation_reason": body.cancellation_reason, "updated_at": now}})
    fresh = await _db.tasks.find_one({"id": tid}, {"_id": 0})
    return {"task": _view_task(fresh)}


@fc2_router.delete("/tasks/{tid}")
async def delete_task(tid: str, request: Request):
    await _assert_flag()
    t = await _load_task(tid, request)
    # Only the creator may hard-delete an untouched open task (C.3).
    if t.get("assignee_user_id") or t.get("status") != "open":
        raise HTTPException(status_code=409, detail="Cancel this task instead of deleting it.")
    await _db.tasks.update_one({"id": tid}, {"$set": {"deleted_at": _now()}})
    return {"deleted": True}


# ===========================================================================
# D.2 Calendar
# ===========================================================================

def _view_entry(e: dict) -> dict:
    return {
        "id": e["id"], "participant_id": e["participant_id"], "entry_type": e.get("entry_type"),
        "title": e.get("title"), "notes": e.get("notes"),
        "start_datetime": e.get("start_datetime"), "end_datetime": e.get("end_datetime"),
        "is_all_day": e.get("is_all_day", False), "source": e.get("source", "manual"),
        "service_type": e.get("service_type"), "provider_name": e.get("provider_name"),
        "expected_worker_name": e.get("expected_worker_name"),
        "attendance_status": e.get("attendance_status", "expected"),
        "attendance_notes": e.get("attendance_notes"),
        "case_id": e.get("case_id"),
        "created_at": _iso(e.get("created_at")),
    }


class EntryCreate(BaseModel):
    entry_type: str = "care_service"
    title: str = Field(..., max_length=200)
    notes: Optional[str] = Field(None, max_length=2000)
    start_datetime: str
    end_datetime: Optional[str] = None
    is_all_day: bool = False
    service_type: Optional[str] = None
    provider_name: Optional[str] = None
    expected_worker_name: Optional[str] = None


@fc2_router.get("/participants/{pid}/calendar")
async def list_calendar(pid: str, request: Request, start_date: Optional[str] = None,
                        end_date: Optional[str] = None, entry_type: Optional[str] = None):
    await _assert_flag()
    await _access(request, pid)
    q: Dict[str, Any] = {"participant_id": pid, "deleted_at": None,
                         "source": {"$ne": "statement_pattern_dismissed"}}
    if entry_type:
        q["entry_type"] = entry_type
    if start_date:
        q.setdefault("start_datetime", {})["$gte"] = start_date
    if end_date:
        q.setdefault("start_datetime", {})["$lte"] = end_date + "T23:59:59"
    rows = []
    async for e in _db.calendar_entries.find(q, {"_id": 0}).sort("start_datetime", 1):
        rows.append(_view_entry(e))
    return {"entries": rows, "count": len(rows)}


@fc2_router.post("/participants/{pid}/calendar")
async def create_entry(pid: str, body: EntryCreate, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _access(request, pid)
    p = await _participant(pid)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()), "participant_id": pid, "household_id": p.get("household_id"),
        **body.dict(), "recurrence": None, "source": "manual", "source_reference_id": None,
        "attendance_status": "expected", "attendance_confirmed_by_user_id": None,
        "attendance_confirmed_at": None, "attendance_notes": None, "case_id": None,
        "created_by_user_id": uid, "created_at": now, "updated_at": now,
        "deleted_at": None, "data_residency": RESIDENCY,
    }
    await _db.calendar_entries.insert_one(dict(doc))
    return {"entry": _view_entry(doc)}


@fc2_router.delete("/calendar-entries/{eid}")
async def delete_entry(eid: str, request: Request):
    await _assert_flag()
    e = await _db.calendar_entries.find_one({"id": eid, "deleted_at": None}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    await _access(request, e["participant_id"])
    if (e.get("source") or "").startswith("statement_pattern"):
        await _db.calendar_entries.update_one({"id": eid}, {"$set": {"source": "statement_pattern_dismissed"}})
        return {"dismissed": True}
    await _db.calendar_entries.update_one({"id": eid}, {"$set": {"deleted_at": _now()}})
    return {"deleted": True}


class ConfirmAttendanceIn(BaseModel):
    attendance_status: str  # confirmed_present | confirmed_missed | disputed
    attendance_notes: Optional[str] = None


@fc2_router.post("/calendar-entries/{eid}/confirm-attendance")
async def confirm_attendance(eid: str, body: ConfirmAttendanceIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    e = await _db.calendar_entries.find_one({"id": eid, "deleted_at": None}, {"_id": 0})
    if not e:
        raise HTTPException(status_code=404, detail="Calendar entry not found")
    await _access(request, e["participant_id"])
    now = _now()
    case_id = e.get("case_id")
    if body.attendance_status == "disputed" and _loop1_open_case:
        try:
            case = await _loop1_open_case(
                participant_id=e["participant_id"], case_type="delivery_discrepancy",
                title=f"Disputed visit: {e.get('title', 'service')} on {str(e.get('start_datetime', ''))[:10]}",
                summary=body.attendance_notes or None, source_tool="fc2",
                source_artefact_id=eid, source_artefact_type="calendar_entry",
                severity="high", actor_type="user", actor_id=uid,
                dedupe_key=f"delivery_discrepancy:calendar_entry:{eid}")
            case_id = (case or {}).get("id") or case_id
        except Exception as ex:
            logger.warning("fc2 attendance dispute case failed: %s", ex)
    await _db.calendar_entries.update_one({"id": eid}, {"$set": {
        "attendance_status": body.attendance_status, "attendance_notes": body.attendance_notes,
        "attendance_confirmed_by_user_id": uid, "attendance_confirmed_at": now,
        "case_id": case_id, "updated_at": now}})
    fresh = await _db.calendar_entries.find_one({"id": eid}, {"_id": 0})
    return {"entry": _view_entry(fresh)}


# ===========================================================================
# D.3 Messages
# ===========================================================================

def _view_message(m: dict, uid: str) -> dict:
    deleted = m.get("deleted_at") is not None
    return {
        "id": m["id"], "participant_id": m["participant_id"],
        "author_user_id": m.get("author_user_id"), "author_name": m.get("author_name"),
        "content": "This message was deleted" if deleted else m.get("content"),
        "deleted": deleted, "reply_to_message_id": m.get("reply_to_message_id"),
        "edited_at": _iso(m.get("edited_at")),
        "read_by_user_ids": m.get("read_by_user_ids") or [],
        "is_mine": m.get("author_user_id") == uid,
        "created_at": _iso(m.get("created_at")),
    }


class MessageIn(BaseModel):
    content: str = Field(..., max_length=5000)
    reply_to_message_id: Optional[str] = None
    author_name: Optional[str] = None


@fc2_router.get("/participants/{pid}/messages")
async def list_messages(pid: str, request: Request, limit: int = 100):
    await _assert_flag()
    uid = await _uid(request)
    await _access(request, pid)
    rows = []
    async for m in _db.household_messages.find(
            {"participant_id": pid}, {"_id": 0}).sort("created_at", 1).limit(min(limit, 300)):
        rows.append(_view_message(m, uid))
    return {"messages": rows, "count": len(rows)}


@fc2_router.post("/participants/{pid}/messages")
async def post_message(pid: str, body: MessageIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _access(request, pid)
    p = await _participant(pid)
    now = _now()
    doc = {
        "id": str(uuid.uuid4()), "participant_id": pid, "household_id": p.get("household_id"),
        "author_user_id": uid, "author_name": body.author_name,
        "content": body.content, "reply_to_message_id": body.reply_to_message_id,
        "edited_at": None, "deleted_at": None, "read_by_user_ids": [uid],
        "created_at": now, "data_residency": RESIDENCY,
    }
    await _db.household_messages.insert_one(dict(doc))
    return {"message": _view_message(doc, uid)}


@fc2_router.delete("/messages/{mid}")
async def delete_message(mid: str, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    m = await _db.household_messages.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    await _access(request, m["participant_id"])
    if m.get("author_user_id") != uid:
        raise HTTPException(status_code=403, detail="You can only delete your own message.")
    await _db.household_messages.update_one({"id": mid}, {"$set": {"deleted_at": _now()}})
    return {"deleted": True}


@fc2_router.post("/messages/{mid}/mark-read")
async def mark_read(mid: str, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    m = await _db.household_messages.find_one({"id": mid}, {"_id": 0})
    if not m:
        raise HTTPException(status_code=404, detail="Message not found")
    await _access(request, m["participant_id"])
    await _db.household_messages.update_one({"id": mid}, {"$addToSet": {"read_by_user_ids": uid}})
    return {"ok": True}


# ===========================================================================
# D.4 Participant voice notes
# ===========================================================================

def _scan_sensitive(text: str) -> str:
    low = (text or "").lower()
    for flag, kws in _SENSITIVE.items():
        if any(k in low for k in kws):
            return flag
    return "none"


def _view_note(n: dict) -> dict:
    return {
        "id": n["id"], "participant_id": n["participant_id"],
        "author_user_id": n.get("author_user_id"), "authored_on_behalf": n.get("authored_on_behalf", False),
        "authored_on_behalf_of_participant_confirmation": n.get("authored_on_behalf_of_participant_confirmation", False),
        "category": n.get("category"), "content": n.get("content"),
        "visibility": n.get("visibility"), "shared_with_user_ids": n.get("shared_with_user_ids") or [],
        "contains_sensitive_content_flag": n.get("contains_sensitive_content_flag", "none"),
        "created_at": _iso(n.get("created_at")), "updated_at": _iso(n.get("updated_at")),
    }


class VoiceNoteIn(BaseModel):
    category: str
    content: str = Field(..., max_length=5000)
    visibility: str = "shared_with_household"
    authored_on_behalf: bool = False
    shared_with_user_ids: List[str] = Field(default_factory=list)


_VISIBILITIES = {"private_to_participant", "shared_with_household", "shared_with_specific_caregivers"}


@fc2_router.get("/participants/{pid}/voice-notes")
async def list_voice_notes(pid: str, request: Request, category: Optional[str] = None):
    await _assert_flag()
    uid = await _uid(request)
    await _access(request, pid)
    q: Dict[str, Any] = {"participant_id": pid, "deleted_at": None}
    if category:
        q["category"] = category
    rows = []
    async for n in _db.participant_voice_notes.find(q, {"_id": 0}).sort("created_at", -1):
        vis = n.get("visibility")
        author = n.get("author_user_id") == uid
        if author or vis == "shared_with_household" or (
                vis == "shared_with_specific_caregivers" and uid in (n.get("shared_with_user_ids") or [])):
            rows.append(_view_note(n))
    return {"voice_notes": rows, "count": len(rows)}


@fc2_router.post("/participants/{pid}/voice-notes")
async def create_voice_note(pid: str, body: VoiceNoteIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _access(request, pid)
    p = await _participant(pid)
    if body.visibility not in _VISIBILITIES:
        raise HTTPException(status_code=422, detail="Invalid visibility")
    now = _now()
    flag = _scan_sensitive(body.content)
    doc = {
        "id": str(uuid.uuid4()), "participant_id": pid, "household_id": p.get("household_id"),
        "author_user_id": uid, "authored_on_behalf": body.authored_on_behalf,
        "authored_on_behalf_of_participant_confirmation": False,
        "category": body.category, "content": body.content, "visibility": body.visibility,
        "shared_with_user_ids": body.shared_with_user_ids,
        "contains_sensitive_content_flag": flag,
        "sensitive_content_reviewed_by_participant": False,
        "crisis_resources_offered_at": now if flag != "none" else None,
        "created_at": now, "updated_at": now, "deleted_at": None, "data_residency": RESIDENCY,
    }
    await _db.participant_voice_notes.insert_one(dict(doc))
    resp = {"voice_note": _view_note(doc)}
    if flag != "none":
        resp["crisis_resources"] = CRISIS_RESOURCES
        resp["sensitive_flag"] = flag
    return resp


class VoiceNotePatch(BaseModel):
    category: Optional[str] = None
    content: Optional[str] = None
    visibility: Optional[str] = None
    shared_with_user_ids: Optional[List[str]] = None


@fc2_router.patch("/voice-notes/{nid}")
async def patch_voice_note(nid: str, body: VoiceNotePatch, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    n = await _db.participant_voice_notes.find_one({"id": nid, "deleted_at": None}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Voice note not found")
    await _access(request, n["participant_id"])
    if n.get("author_user_id") != uid:
        raise HTTPException(status_code=403, detail="Only the author can edit this note.")
    update = {k: v for k, v in body.dict().items() if v is not None}
    if "content" in update:
        update["contains_sensitive_content_flag"] = _scan_sensitive(update["content"])
    update["updated_at"] = _now()
    await _db.participant_voice_notes.update_one({"id": nid}, {"$set": update})
    fresh = await _db.participant_voice_notes.find_one({"id": nid}, {"_id": 0})
    return {"voice_note": _view_note(fresh)}


@fc2_router.delete("/voice-notes/{nid}")
async def delete_voice_note(nid: str, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    n = await _db.participant_voice_notes.find_one({"id": nid, "deleted_at": None}, {"_id": 0})
    if not n:
        raise HTTPException(status_code=404, detail="Voice note not found")
    await _access(request, n["participant_id"])
    if n.get("author_user_id") != uid:
        raise HTTPException(status_code=403, detail="Only the author can delete this note.")
    await _db.participant_voice_notes.update_one({"id": nid}, {"$set": {"deleted_at": _now()}})
    return {"deleted": True}


# ===========================================================================
# D.5 Incident log (aggregate view)
# ===========================================================================

@fc2_router.get("/participants/{pid}/incident-log")
async def incident_log(pid: str, request: Request, limit: int = 100):
    await _assert_flag()
    await _access(request, pid)
    items: List[dict] = []

    # LOOP-1 open cases
    try:
        async for c in _db.cases.find(
                {"participant_id": pid, "status": {"$in": ["open", "in_progress", "waiting_on_provider"]}},
                {"_id": 0}).limit(100):
            items.append({
                "id": c.get("id"), "source_tool": "loop1", "source_reference_id": c.get("id"),
                "event_type": c.get("case_type"), "summary": c.get("title"),
                "status": c.get("status"), "timestamp": _iso(c.get("updated_at") or c.get("created_at")),
                "url": f"/app/participants/{pid}/cases/{c.get('id')}",
            })
    except Exception:
        pass

    # SDL-1 disputed attendance
    try:
        async for r in _db.attendance_records.find(
                {"participant_id": pid, "confirmation_status": "disputed", "deleted_at": None},
                {"_id": 0}).limit(100):
            exp = r.get("expected") or {}
            items.append({
                "id": r.get("id"), "source_tool": "sdl1", "source_reference_id": r.get("id"),
                "event_type": "attendance_disputed",
                "summary": f"Disputed {exp.get('service_type', 'visit')} · {exp.get('provider_name', '')}",
                "status": "disputed", "timestamp": _iso(r.get("updated_at")),
                "url": f"/app/participants/{pid}/attendance",
            })
    except Exception:
        pass

    # LF-1 correspondence (letters)
    try:
        async for l in _db.lf1_correspondence.find(
                {"participant_id": pid}, {"_id": 0}).sort("created_at", -1).limit(50):
            items.append({
                "id": l.get("id"), "source_tool": "lf1", "source_reference_id": l.get("id"),
                "event_type": f"letter_{l.get('direction', 'sent')}",
                "summary": l.get("subject") or l.get("title") or "Correspondence",
                "status": l.get("status"), "timestamp": _iso(l.get("created_at")),
                "url": "/app/letters",
            })
    except Exception:
        pass

    items.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
    return {"incidents": items[:limit], "count": len(items)}


# ===========================================================================
# D.6 Handover pack PDF
# ===========================================================================

class HandoverIn(BaseModel):
    purpose: str = "primary_caregiver_absence"
    purpose_notes: Optional[str] = None


@fc2_router.post("/participants/{pid}/handover-pack")
async def generate_handover(pid: str, body: HandoverIn, request: Request):
    await _assert_flag()
    uid = await _uid(request)
    await _access(request, pid)
    p = await _participant(pid)
    from services.fc2_handover_pdf import render_family_handover_pdf

    # Assemble content snapshot.
    tasks = [t async for t in _db.tasks.find(
        {"participant_id": pid, "status": {"$in": ["open", "in_progress"]}, "deleted_at": None}, {"_id": 0}).limit(50)]
    upcoming = [e async for e in _db.calendar_entries.find(
        {"participant_id": pid, "deleted_at": None, "start_datetime": {"$gte": _now().isoformat()}},
        {"_id": 0}).sort("start_datetime", 1).limit(20)]
    prefs = [n async for n in _db.participant_voice_notes.find(
        {"participant_id": pid, "deleted_at": None, "visibility": {"$ne": "private_to_participant"},
         "category": {"$in": ["preferences_care_style", "preferences_daily_routine",
                              "preferences_communication", "values_and_dignity"]}}, {"_id": 0}).limit(20)]
    incidents = (await incident_log(pid, request, limit=10)).get("incidents", [])

    name = p.get("display_name") or f"{p.get('first_name','')} {p.get('last_name','')}".strip() or "the participant"
    pdf = render_family_handover_pdf(
        participant_name=name, purpose=body.purpose, purpose_notes=body.purpose_notes,
        tasks=tasks, upcoming=upcoming, preferences=prefs, incidents=incidents)

    gen = {
        "id": str(uuid.uuid4()), "participant_id": pid, "generated_by_user_id": uid,
        "generated_at": _now(), "file_size_bytes": len(pdf), "purpose": body.purpose,
        "purpose_notes": body.purpose_notes, "included_sections": [
            "profile", "upcoming services", "open tasks", "care preferences", "open issues"],
    }
    await _db.handover_pack_generations.insert_one(dict(gen))
    return Response(content=pdf, media_type="application/pdf", headers={
        "Content-Disposition": f'attachment; filename="family-handover-{pid[:8]}.pdf"'})


@fc2_router.get("/status")
async def status():
    return {"fc2_enabled": _flag(), "spec": "FC-2 v1"}
