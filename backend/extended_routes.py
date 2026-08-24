"""Extended Functionality Build, Features 4-13 (MVP stubs).

Provides minimal but complete CRUD for the following household-scoped resources:
  - Visit Calendar         (visits)
  - Budget Alerts          (budget_alerts)
  - Provider Switching     (provider_switches)
  - AT-HM Tracker          (athm_items)
  - Correspondence         (correspondence)
  - Referrals              (referrals)
  - Private Provider Rates (provider_ratings, user-scoped, NOT household)

Plus:
  - GET /api/search            , cross-resource global search
  - GET /api/reports/summary.pdf, household summary PDF (quarter scope)

All endpoints sit behind Bearer JWT (`require_user`). Household-scoped routes
auto-resolve the caller's household from `users.household_id`. Provider ratings
are deliberately user-scoped so each user maintains their own private list.
"""
from __future__ import annotations
import io
import re
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, EmailStr, Field

from models import new_id, now_iso

extended_router = APIRouter(tags=["extended"])

_db = None
_user_dep = None


def init_extended_routes(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


async def _require_household(user: dict) -> str:
    hh = user.get("household_id")
    if not hh:
        raise HTTPException(
            status_code=409,
            detail={"error": "no_household", "message": "Set up your household first.", "redirect": "/onboarding"},
        )
    return hh


def _strip(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k != "_id"}


# ---------------------------------------------------------------------------
# Visit Calendar
# ---------------------------------------------------------------------------
class VisitBody(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    starts_at: str  # ISO datetime
    duration_minutes: int = Field(default=60, ge=5, le=720)
    location: Optional[str] = Field(default=None, max_length=200)
    provider: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=1000)
    kind: str = Field(default="appointment", pattern="^(appointment|home_visit|telehealth|assessment|other)$")
    # UI-1 §3, appointments are never hard-deleted by users. They are
    # archived once the date has passed, or cancelled if the user explicitly
    # chooses to cancel them ahead of time. The default is "active".
    status: str = Field(default="active", pattern="^(active|cancelled|archived)$")


@extended_router.get("/visits")
async def list_visits(request: Request, upcoming_only: bool = Query(default=False)):
    user = await _user_dep(request)
    hh = await _require_household(user)
    q = {"household_id": hh}
    if upcoming_only:
        q["starts_at"] = {"$gte": now_iso()}
    cur = _db.visits.find(q, {"_id": 0}).sort("starts_at", 1).limit(500)
    return [v async for v in cur]


@extended_router.post("/visits")
async def create_visit(body: VisitBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    doc = {"id": new_id(), "household_id": hh, "created_at": now_iso(), "updated_at": now_iso(), **body.model_dump()}
    await _db.visits.insert_one(doc)
    return _strip(doc)


@extended_router.patch("/visits/{vid}")
async def update_visit(vid: str, body: VisitBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    updates = {**body.model_dump(), "updated_at": now_iso()}
    res = await _db.visits.update_one({"id": vid, "household_id": hh}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Visit not found")
    doc = await _db.visits.find_one({"id": vid, "household_id": hh}, {"_id": 0})
    return doc


@extended_router.delete("/visits/{vid}")
async def delete_visit(vid: str, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    res = await _db.visits.delete_one({"id": vid, "household_id": hh})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Visit not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Budget Alerts
# ---------------------------------------------------------------------------
class BudgetAlertBody(BaseModel):
    stream: str = Field(pattern="^(Clinical|Independence|Everyday Living|lifetime|all)$")
    threshold_pct: int = Field(ge=10, le=100)
    notify_email: bool = True
    active: bool = True


@extended_router.get("/budget-alerts")
async def list_alerts(request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    cur = _db.budget_alerts.find({"household_id": hh}, {"_id": 0}).sort("created_at", -1)
    return [a async for a in cur]


@extended_router.post("/budget-alerts")
async def create_alert(body: BudgetAlertBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    doc = {"id": new_id(), "household_id": hh, "created_at": now_iso(), "updated_at": now_iso(), **body.model_dump()}
    await _db.budget_alerts.insert_one(doc)
    return _strip(doc)


@extended_router.patch("/budget-alerts/{aid}")
async def update_alert(aid: str, body: BudgetAlertBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    updates = {**body.model_dump(), "updated_at": now_iso()}
    res = await _db.budget_alerts.update_one({"id": aid, "household_id": hh}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return await _db.budget_alerts.find_one({"id": aid, "household_id": hh}, {"_id": 0})


@extended_router.delete("/budget-alerts/{aid}")
async def delete_alert(aid: str, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    res = await _db.budget_alerts.delete_one({"id": aid, "household_id": hh})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Provider Switching Workflow
# ---------------------------------------------------------------------------
SWITCH_STAGES = ["considering", "comparing", "notice_given", "transition", "complete"]


class SwitchStart(BaseModel):
    current_provider: str = Field(min_length=1, max_length=120)
    target_provider: Optional[str] = Field(default=None, max_length=120)
    reason: Optional[str] = Field(default=None, max_length=600)


class SwitchUpdate(BaseModel):
    target_provider: Optional[str] = Field(default=None, max_length=120)
    stage: Optional[str] = Field(default=None)
    checklist: Optional[dict] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


DEFAULT_CHECKLIST = {
    "compared_services": False,
    "compared_prices": False,
    "checked_unspent_funds": False,
    "given_notice_to_current": False,
    "signed_new_agreement": False,
    "transferred_care_plan": False,
    "confirmed_first_visit": False,
}


@extended_router.get("/provider-switch")
async def get_switch(request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    row = await _db.provider_switches.find_one({"household_id": hh}, {"_id": 0}, sort=[("created_at", -1)])
    return row or None


@extended_router.post("/provider-switch")
async def start_switch(body: SwitchStart, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    doc = {
        "id": new_id(),
        "household_id": hh,
        "current_provider": body.current_provider,
        "target_provider": body.target_provider,
        "reason": body.reason,
        "stage": "considering",
        "checklist": dict(DEFAULT_CHECKLIST),
        "notes": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await _db.provider_switches.insert_one(doc)
    return _strip(doc)


@extended_router.patch("/provider-switch/{sid}")
async def update_switch(sid: str, body: SwitchUpdate, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    row = await _db.provider_switches.find_one({"id": sid, "household_id": hh}, {"_id": 0})
    if not row:
        raise HTTPException(status_code=404, detail="Switch not found")
    payload = body.model_dump(exclude_none=True)
    if "stage" in payload and payload["stage"] not in SWITCH_STAGES:
        raise HTTPException(status_code=400, detail={"error": "bad_stage", "allowed": SWITCH_STAGES})
    if "checklist" in payload:
        merged = {**row.get("checklist", {}), **payload["checklist"]}
        payload["checklist"] = merged
    payload["updated_at"] = now_iso()
    await _db.provider_switches.update_one({"id": sid, "household_id": hh}, {"$set": payload})
    return await _db.provider_switches.find_one({"id": sid, "household_id": hh}, {"_id": 0})


# ---------------------------------------------------------------------------
# AT-HM Tracker (Assistive Technology + Home Modifications)
# ---------------------------------------------------------------------------
class AthmBody(BaseModel):
    kind: str = Field(pattern="^(AT|HM)$")
    name: str = Field(min_length=1, max_length=200)
    status: str = Field(default="proposed", pattern="^(proposed|approved|ordered|installed|declined)$")
    cost_aud: Optional[float] = Field(default=None, ge=0)
    supplier: Optional[str] = Field(default=None, max_length=120)
    notes: Optional[str] = Field(default=None, max_length=1000)


@extended_router.get("/athm")
async def list_athm(request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    cur = _db.athm_items.find({"household_id": hh}, {"_id": 0}).sort("created_at", -1).limit(500)
    return [a async for a in cur]


@extended_router.post("/athm")
async def create_athm(body: AthmBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    doc = {"id": new_id(), "household_id": hh, "created_at": now_iso(), "updated_at": now_iso(), **body.model_dump()}
    await _db.athm_items.insert_one(doc)
    return _strip(doc)


@extended_router.patch("/athm/{iid}")
async def update_athm(iid: str, body: AthmBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    updates = {**body.model_dump(), "updated_at": now_iso()}
    res = await _db.athm_items.update_one({"id": iid, "household_id": hh}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return await _db.athm_items.find_one({"id": iid, "household_id": hh}, {"_id": 0})


@extended_router.delete("/athm/{iid}")
async def delete_athm(iid: str, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    res = await _db.athm_items.delete_one({"id": iid, "household_id": hh})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# UI-1 §4, Documents on AT-HM line items (quotes, invoices, OT letters, photos).
# Lightweight: store file metadata inline on the item under `attachments`. The
# actual binary lives in the existing upload bucket via `/uploads/object`
# (reused from the statements pipeline). When that pipeline lands in Supabase
# Sydney this metadata stays valid.
class _AthmAttachmentBody(BaseModel):
    filename: str = Field(min_length=1, max_length=200)
    storage_path: str = Field(min_length=1, max_length=400)
    mime_type: Optional[str] = Field(default=None, max_length=120)
    size_bytes: Optional[int] = Field(default=None, ge=0)
    kind: str = Field(default="quote", pattern="^(quote|invoice|ot_letter|photo|other)$")


@extended_router.post("/athm/{iid}/attachments")
async def add_athm_attachment(iid: str, body: _AthmAttachmentBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    att = {
        "id": new_id(),
        **body.model_dump(),
        "uploaded_at": now_iso(),
        "uploaded_by": user.get("id"),
    }
    res = await _db.athm_items.update_one(
        {"id": iid, "household_id": hh},
        {"$push": {"attachments": att}, "$set": {"updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return att


@extended_router.delete("/athm/{iid}/attachments/{aid}")
async def remove_athm_attachment(iid: str, aid: str, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    res = await _db.athm_items.update_one(
        {"id": iid, "household_id": hh},
        {"$pull": {"attachments": {"id": aid}}, "$set": {"updated_at": now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# UI-1 §4, binary file upload for AT-HM line items. Accepts multipart, stores
# the binary in `athm_files` (base64-encoded), and pushes a metadata record
# onto the parent item's `attachments` list so the row can be listed alongside
# any pre-existing pointer-only attachments.
_ATHM_FILE_MIME = {
    ".png":  "image/png",
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".pdf":  "application/pdf",
    ".doc":  "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
_ATHM_MAX_BYTES = 25 * 1024 * 1024  # 25 MB per file
_ATHM_MAX_FILES = 20                 # per request


@extended_router.post("/athm/{iid}/files")
async def upload_athm_file(
    iid: str,
    request: Request,
    file: UploadFile = File(...),
    kind: str = Form("other"),
):
    """UI-1 §4, Documents upload for an AT-HM line item.

    Stores the binary in GridFS so we can carry files up to the spec's 25 MB
    per-file cap (BSON's 16 MB doc cap would otherwise blow up first).
    Metadata is mirrored to athm_files for cheap listing without opening the
    GridFS stream.
    """
    import os.path
    from motor.motor_asyncio import AsyncIOMotorGridFSBucket

    user = await _user_dep(request)
    hh = await _require_household(user)

    parent = await _db.athm_items.find_one({"id": iid, "household_id": hh})
    if not parent:
        raise HTTPException(status_code=404, detail="Item not found")

    existing = [a for a in (parent.get("attachments") or []) if not a.get("deleted_at")]
    if len(existing) >= _ATHM_MAX_FILES:
        raise HTTPException(status_code=400, detail=f"At most {_ATHM_MAX_FILES} files per request")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ATHM_FILE_MIME:
        raise HTTPException(status_code=400, detail=f"File type {ext or '(unknown)'} is not supported. Allowed: PNG, JPG, JPEG, PDF, DOC, DOCX.")

    raw = await file.read()
    if len(raw) > _ATHM_MAX_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB per-file limit.")
    if len(raw) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    bucket = AsyncIOMotorGridFSBucket(_db, bucket_name="athm")
    gridfs_id = await bucket.upload_from_stream(
        file.filename or f"upload{ext}",
        raw,
        metadata={
            "athm_id": iid,
            "household_id": hh,
            "uploaded_by": user.get("id"),
            "mime_type": _ATHM_FILE_MIME[ext],
        },
    )

    file_id = new_id()
    safe_kind = kind if kind in ("quote", "invoice", "ot_letter", "photo", "other") else "other"
    file_doc = {
        "id": file_id,
        "athm_id": iid,
        "household_id": hh,
        "filename": file.filename or f"upload{ext}",
        "mime_type": _ATHM_FILE_MIME[ext],
        "size_bytes": len(raw),
        "kind": safe_kind,
        "gridfs_id": str(gridfs_id),
        "uploaded_at": now_iso(),
        "uploaded_by": user.get("id"),
    }
    await _db.athm_files.insert_one(file_doc)

    att = {
        "id": file_id,
        "filename": file_doc["filename"],
        "storage_path": f"athm/{iid}/{file_id}",
        "mime_type": file_doc["mime_type"],
        "size_bytes": file_doc["size_bytes"],
        "kind": safe_kind,
        "uploaded_at": file_doc["uploaded_at"],
        "uploaded_by": user.get("id"),
        "has_binary": True,
    }
    await _db.athm_items.update_one(
        {"id": iid, "household_id": hh},
        {"$push": {"attachments": att}, "$set": {"updated_at": now_iso()}},
    )
    return att


@extended_router.get("/athm/{iid}/files/{fid}")
async def download_athm_file(iid: str, fid: str, request: Request):
    from bson import ObjectId
    from motor.motor_asyncio import AsyncIOMotorGridFSBucket

    user = await _user_dep(request)
    hh = await _require_household(user)
    f = await _db.athm_files.find_one({"id": fid, "athm_id": iid, "household_id": hh}, {"_id": 0})
    if not f:
        raise HTTPException(status_code=404, detail="File not found")
    if f.get("deleted_at"):
        raise HTTPException(status_code=410, detail="File has been removed")

    # Backwards compat: pre-GridFS rows still have b64 inline.
    if f.get("b64"):
        import base64
        body = base64.b64decode(f["b64"])
    else:
        bucket = AsyncIOMotorGridFSBucket(_db, bucket_name="athm")
        stream = await bucket.open_download_stream(ObjectId(f["gridfs_id"]))
        body = await stream.read()

    headers = {
        "Content-Disposition": f'attachment; filename="{f["filename"]}"',
        "Cache-Control": "private, no-store",
    }
    return Response(content=body, media_type=f.get("mime_type") or "application/octet-stream", headers=headers)


@extended_router.delete("/athm/{iid}/files/{fid}")
async def delete_athm_file(iid: str, fid: str, request: Request):
    """Soft-delete an AT-HM file (recoverable for 30 days per spec)."""
    user = await _user_dep(request)
    hh = await _require_household(user)
    res = await _db.athm_files.update_one(
        {"id": fid, "athm_id": iid, "household_id": hh, "deleted_at": {"$exists": False}},
        {"$set": {"deleted_at": now_iso(), "deleted_by": user.get("id")}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="File not found")
    await _db.athm_items.update_one(
        {"id": iid, "household_id": hh},
        {"$pull": {"attachments": {"id": fid}}, "$set": {"updated_at": now_iso()}},
    )
    return {"ok": True}


# ---------------------------------------------------------------------------
# Correspondence Tracker
# ---------------------------------------------------------------------------
class CorrespondenceBody(BaseModel):
    direction: str = Field(pattern="^(in|out)$")
    channel: str = Field(pattern="^(email|letter|phone|sms|in_person)$")
    counterparty: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1, max_length=200)
    body_summary: Optional[str] = Field(default=None, max_length=4000)
    occurred_at: str  # ISO datetime
    follow_up_at: Optional[str] = None
    attachment_doc_id: Optional[str] = None


@extended_router.get("/correspondence")
async def list_correspondence(request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    cur = _db.correspondence.find({"household_id": hh}, {"_id": 0}).sort("occurred_at", -1).limit(500)
    return [c async for c in cur]


@extended_router.post("/correspondence")
async def create_correspondence(body: CorrespondenceBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    doc = {"id": new_id(), "household_id": hh, "created_at": now_iso(), "updated_at": now_iso(), **body.model_dump()}
    await _db.correspondence.insert_one(doc)
    return _strip(doc)


@extended_router.patch("/correspondence/{cid}")
async def update_correspondence(cid: str, body: CorrespondenceBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    updates = {**body.model_dump(), "updated_at": now_iso()}
    res = await _db.correspondence.update_one({"id": cid, "household_id": hh}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return await _db.correspondence.find_one({"id": cid, "household_id": hh}, {"_id": 0})


@extended_router.delete("/correspondence/{cid}")
async def delete_correspondence(cid: str, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    res = await _db.correspondence.delete_one({"id": cid, "household_id": hh})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Referrals
# ---------------------------------------------------------------------------
class ReferralBody(BaseModel):
    referred_to: str = Field(min_length=1, max_length=200)
    kind: str = Field(pattern="^(GP|specialist|allied_health|support_service|other)$")
    contact: Optional[str] = Field(default=None, max_length=200)
    reason: Optional[str] = Field(default=None, max_length=1000)
    status: str = Field(default="open", pattern="^(open|in_progress|completed|declined)$")
    referred_at: str
    completed_at: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=2000)


@extended_router.get("/referrals")
async def list_referrals(request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    cur = _db.referrals.find({"household_id": hh}, {"_id": 0}).sort("referred_at", -1).limit(500)
    return [r async for r in cur]


@extended_router.post("/referrals")
async def create_referral(body: ReferralBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    doc = {"id": new_id(), "household_id": hh, "created_at": now_iso(), "updated_at": now_iso(), **body.model_dump()}
    await _db.referrals.insert_one(doc)
    return _strip(doc)


@extended_router.patch("/referrals/{rid}")
async def update_referral(rid: str, body: ReferralBody, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    updates = {**body.model_dump(), "updated_at": now_iso()}
    res = await _db.referrals.update_one({"id": rid, "household_id": hh}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Referral not found")
    return await _db.referrals.find_one({"id": rid, "household_id": hh}, {"_id": 0})


@extended_router.delete("/referrals/{rid}")
async def delete_referral(rid: str, request: Request):
    user = await _user_dep(request)
    hh = await _require_household(user)
    res = await _db.referrals.delete_one({"id": rid, "household_id": hh})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Referral not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Private Provider Ratings, USER scope (one user's private list)
# ---------------------------------------------------------------------------
class RatingBody(BaseModel):
    provider_name: str = Field(min_length=1, max_length=200)
    stars: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(default=None, max_length=2000)
    would_recommend: Optional[bool] = None


@extended_router.get("/provider-ratings")
async def list_ratings(request: Request):
    user = await _user_dep(request)
    cur = _db.provider_ratings.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(500)
    return [r async for r in cur]


@extended_router.post("/provider-ratings")
async def create_rating(body: RatingBody, request: Request):
    user = await _user_dep(request)
    doc = {"id": new_id(), "user_id": user["id"], "created_at": now_iso(), "updated_at": now_iso(), **body.model_dump()}
    await _db.provider_ratings.insert_one(doc)
    return _strip(doc)


@extended_router.patch("/provider-ratings/{rid}")
async def update_rating(rid: str, body: RatingBody, request: Request):
    user = await _user_dep(request)
    updates = {**body.model_dump(), "updated_at": now_iso()}
    res = await _db.provider_ratings.update_one({"id": rid, "user_id": user["id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Rating not found")
    return await _db.provider_ratings.find_one({"id": rid, "user_id": user["id"]}, {"_id": 0})


@extended_router.delete("/provider-ratings/{rid}")
async def delete_rating(rid: str, request: Request):
    user = await _user_dep(request)
    res = await _db.provider_ratings.delete_one({"id": rid, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Rating not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Global Search
# ---------------------------------------------------------------------------
@extended_router.get("/search")
async def global_search(request: Request, q: str = Query(min_length=2, max_length=200)):
    user = await _user_dep(request)
    hh = user.get("household_id")
    needle = re.escape(q.strip())
    rx = {"$regex": needle, "$options": "i"}
    results: List[dict] = []
    if hh:
        # statements (period_label / filename / summary)
        async for s in _db.statements.find({
            "household_id": hh,
            "$or": [{"period_label": rx}, {"filename": rx}, {"summary": rx}],
        }, {"_id": 0, "id": 1, "period_label": 1, "filename": 1, "uploaded_at": 1}).limit(20):
            results.append({
                "type": "statement", "id": s["id"], "title": s.get("period_label") or s.get("filename"),
                "subtitle": (s.get("uploaded_at") or "").split("T")[0],
                "href": f"/app/statements/{s['id']}",
            })
        # documents
        async for d in _db.documents.find({
            "household_id": hh,
            "$or": [{"title": rx}, {"filename": rx}, {"notes": rx}],
        }, {"_id": 0, "id": 1, "title": 1, "category": 1, "filename": 1}).limit(20):
            results.append({
                "type": "document", "id": d["id"], "title": d.get("title") or d.get("filename"),
                "subtitle": (d.get("category") or "").replace("_", " ").capitalize(),
                "href": "/app/documents",
            })
        # family messages
        async for m in _db.family_messages.find({
            "household_id": hh, "body": rx,
        }, {"_id": 0, "id": 1, "body": 1, "author_name": 1, "created_at": 1}).limit(20):
            results.append({
                "type": "family_message", "id": m["id"],
                "title": (m.get("body") or "")[:80],
                "subtitle": f"{m.get('author_name', '')} · {(m.get('created_at') or '').split('T')[0]}",
                "href": "/app/family",
            })
        # visits
        async for v in _db.visits.find({
            "household_id": hh,
            "$or": [{"title": rx}, {"provider": rx}, {"location": rx}, {"notes": rx}],
        }, {"_id": 0, "id": 1, "title": 1, "starts_at": 1, "provider": 1}).limit(20):
            results.append({
                "type": "visit", "id": v["id"], "title": v.get("title"),
                "subtitle": f"{v.get('provider') or ''} · {(v.get('starts_at') or '').split('T')[0]}",
                "href": "/app/calendar",
            })
        # correspondence
        async for c in _db.correspondence.find({
            "household_id": hh,
            "$or": [{"subject": rx}, {"counterparty": rx}, {"body_summary": rx}],
        }, {"_id": 0, "id": 1, "subject": 1, "counterparty": 1, "occurred_at": 1}).limit(20):
            results.append({
                "type": "correspondence", "id": c["id"], "title": c.get("subject"),
                "subtitle": f"{c.get('counterparty') or ''} · {(c.get('occurred_at') or '').split('T')[0]}",
                "href": "/app/correspondence",
            })
        # referrals
        async for r in _db.referrals.find({
            "household_id": hh,
            "$or": [{"referred_to": rx}, {"reason": rx}, {"contact": rx}, {"notes": rx}],
        }, {"_id": 0, "id": 1, "referred_to": 1, "kind": 1, "status": 1}).limit(20):
            results.append({
                "type": "referral", "id": r["id"], "title": r.get("referred_to"),
                "subtitle": f"{r.get('kind') or ''} · {r.get('status') or ''}",
                "href": "/app/referrals",
            })
    return {"q": q, "count": len(results), "results": results}


# ---------------------------------------------------------------------------
# Summary Reports (household PDF)
# ---------------------------------------------------------------------------
@extended_router.get("/reports/summary.pdf")
async def household_summary_pdf(request: Request, period: str = Query(default="quarter", pattern="^(quarter|all)$")):
    user = await _user_dep(request)
    hh = await _require_household(user)
    household = await _db.households.find_one({"id": hh}, {"_id": 0})
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    statements = [s async for s in _db.statements.find(
        {"household_id": hh}, {"_id": 0, "file_b64": 0},
    ).sort("uploaded_at", -1).limit(12)]
    concerns = [c async for c in _db.audit_events.find(
        {"household_id": hh, "kind": {"$in": ["CONCERN_RAISED", "FAMILY_MESSAGE_POSTED"]}},
        {"_id": 0},
    ).sort("created_at", -1).limit(20)]
    visits_count = await _db.visits.count_documents({"household_id": hh})
    docs_count = await _db.documents.count_documents({"household_id": hh})
    pdf_bytes = _render_summary_pdf(
        user_name=user.get("name") or user.get("email") or "Caregiver",
        household=household,
        statements=statements,
        concerns=concerns,
        visits_count=visits_count,
        docs_count=docs_count,
    )
    fname = f"wayly-summary-{(household.get('participant_name') or 'household').replace(' ', '_')}-{datetime.utcnow().strftime('%Y%m%d')}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


def _render_summary_pdf(*, user_name, household, statements, concerns, visits_count, docs_count) -> bytes:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import mm
    from reportlab.lib import colors
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    NAVY = colors.HexColor("#0E2A47")
    MUTED = colors.HexColor("#6F6A60")
    BORDER = colors.HexColor("#E6E1D6")
    SAND = colors.HexColor("#EAF4FB")

    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=18*mm, rightMargin=18*mm, topMargin=18*mm, bottomMargin=18*mm)
    base = getSampleStyleSheet()
    h1 = ParagraphStyle("h1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=22, textColor=NAVY, leading=26)
    h2 = ParagraphStyle("h2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, textColor=NAVY, leading=16, spaceBefore=10, spaceAfter=4)
    body = ParagraphStyle("body", parent=base["BodyText"], fontName="Helvetica", fontSize=10, textColor=NAVY, leading=14)
    muted = ParagraphStyle("muted", parent=body, textColor=MUTED, fontSize=9)

    spent = 0.0
    anomalies = 0
    for s in statements:
        anomalies += len(s.get("anomalies") or [])
        for it in s.get("line_items") or []:
            try:
                spent += float(it.get("total") or it.get("amount") or 0)
            except Exception:
                pass

    flow = [
        Paragraph("Wayly Summary Report", h1),
        Paragraph(f"For {household.get('participant_name', ',')} · prepared by {user_name} · {datetime.utcnow().strftime('%d %b %Y')}", muted),
        Spacer(1, 8),
        Paragraph("Household", h2),
    ]
    tbl_style = TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), MUTED),
        ("TEXTCOLOR", (1, 0), (1, -1), NAVY),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, BORDER),
    ])
    hh_tbl = Table([
        ["Participant", household.get("participant_name") or ","],
        ["Classification", str(household.get("classification") or ",")],
        ["Provider", household.get("provider_name") or ","],
        ["On Wayly since", (household.get("created_at") or "").split("T")[0] or ","],
    ], colWidths=[35*mm, None])
    hh_tbl.setStyle(tbl_style)
    flow.append(hh_tbl)
    flow.append(Paragraph("At-a-glance", h2))
    metrics = Table([
        ["Statements", "Anomalies", "Spent (AUD)", "Documents", "Visits"],
        [str(len(statements)), str(anomalies), f"${spent:,.0f}", str(docs_count), str(visits_count)],
    ], colWidths=[33*mm, 33*mm, 38*mm, 33*mm, 33*mm])
    metrics.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, 1), 14),
        ("TEXTCOLOR", (0, 0), (-1, 0), MUTED),
        ("TEXTCOLOR", (0, 1), (-1, 1), NAVY),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("BACKGROUND", (0, 0), (-1, 0), SAND),
        ("BOX", (0, 0), (-1, -1), 0.5, BORDER),
        ("LINEABOVE", (0, 1), (-1, 1), 0.5, BORDER),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    flow.append(metrics)
    if concerns:
        flow.append(Paragraph("Recent decisions & family activity", h2))
        for c in concerns[:8]:
            flow.append(Paragraph(
                f"<b>{(c.get('kind') or '').replace('_', ' ').capitalize()}</b> · {(c.get('created_at') or '').split('T')[0]}, {(c.get('detail') or '')[:200]}",
                body,
            ))
            flow.append(Spacer(1, 2))
    flow.append(Spacer(1, 12))
    flow.append(Paragraph("Wayly · Confidential household summary. Generated automatically.", muted))
    doc.build(flow)
    out = buf.getvalue()
    buf.close()
    return out
