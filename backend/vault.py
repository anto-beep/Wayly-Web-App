"""Feature 1 — Document Vault.

Per-household secure document storage. Files stored inline as base64 in Mongo
(swap to S3 later — `_save_file` / `_load_file` are the only touch-points).

Collection: vault_documents
  id (str UUID), household_id, uploaded_by, document_type, title,
  original_filename, mime_type, file_size_bytes, page_count,
  statement_period, provider_name, tags[], notes,
  is_decoded, decode_result_id, version, previous_version_id,
  uploaded_at, last_viewed_at, shared_with[], is_deleted, deleted_at,
  file_b64 (private — never returned in list endpoints)
"""
from __future__ import annotations
import os
import base64
import secrets
import re
from datetime import datetime, timezone
from typing import Optional, List, Literal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from auth import get_current_user_id

vault_router = APIRouter(prefix="/vault", tags=["vault"])

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _strip(d: dict) -> dict:
    if not d:
        return d
    d.pop("_id", None)
    d.pop("file_b64", None)  # never leak file payload via list/detail metadata
    return d


VALID_TYPES = (
    "STATEMENT", "CARE_PLAN", "SERVICE_AGREEMENT", "CORRESPONDENCE",
    "ASSESSMENT", "INVOICE", "AT_HM", "MEDICAL", "OTHER",
)

ACCEPTED_MIME = {
    "application/pdf": (20, "PDF"),
    "image/jpeg": (10, "JPG"),
    "image/png": (10, "PNG"),
    "image/heic": (10, "HEIC"),
    "image/webp": (10, "WEBP"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": (10, "DOCX"),
    "application/msword": (10, "DOC"),
    "text/plain": (5, "TXT"),
}


async def _require_household(user_id: str) -> dict:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1, "name": 1})
    if not u or not u.get("household_id"):
        raise HTTPException(400, "No household configured. Complete onboarding first.")
    h = await db.households.find_one({"id": u["household_id"]}, {"_id": 0, "id": 1, "participant_name": 1})
    if not h:
        raise HTTPException(404, "Household not found")
    return h


# ============================================================================
# Upload
# ============================================================================

@vault_router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str = Form(...),
    document_type: str = Form(...),
    provider_name: Optional[str] = Form(None),
    statement_period: Optional[str] = Form(None),  # YYYY-MM-DD
    tags: Optional[str] = Form(None),               # comma-separated
    notes: Optional[str] = Form(None),
    previous_version_id: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    if document_type not in VALID_TYPES:
        raise HTTPException(400, f"document_type must be one of {VALID_TYPES}")
    if file.content_type not in ACCEPTED_MIME:
        raise HTTPException(400, f"Unsupported file type: {file.content_type}")
    max_mb, fmt_badge = ACCEPTED_MIME[file.content_type]

    data = await file.read()
    size = len(data)
    if size > max_mb * 1024 * 1024:
        raise HTTPException(400, f"File too large — max {max_mb}MB for {fmt_badge}")
    if size < 16:
        raise HTTPException(400, "File appears empty")

    household = await _require_household(user_id)
    tag_list = [t.strip() for t in (tags or "").split(",") if t.strip()][:20]

    new_version = 1
    if previous_version_id:
        prev = await db.vault_documents.find_one(
            {"id": previous_version_id, "household_id": household["id"]},
            {"_id": 0, "version": 1},
        )
        if prev:
            new_version = (prev.get("version") or 1) + 1

    rec = {
        "id": secrets.token_urlsafe(12),
        "household_id": household["id"],
        "uploaded_by": user_id,
        "document_type": document_type,
        "title": title.strip()[:255],
        "original_filename": file.filename or "uploaded",
        "mime_type": file.content_type,
        "format_badge": fmt_badge,
        "file_size_bytes": size,
        "page_count": None,  # PDF page count requires PyPDF; deferred
        "statement_period": statement_period,
        "provider_name": (provider_name or "").strip()[:255] or None,
        "tags": tag_list,
        "notes": (notes or "").strip()[:5000] or None,
        "is_decoded": False,
        "decode_result_id": None,
        "version": new_version,
        "previous_version_id": previous_version_id,
        "uploaded_at": _now(),
        "last_viewed_at": None,
        "shared_with": [],
        "is_deleted": False,
        "deleted_at": None,
        "file_b64": base64.b64encode(data).decode("ascii"),
    }
    await db.vault_documents.insert_one(rec)
    return _strip(dict(rec))


# ============================================================================
# List
# ============================================================================

@vault_router.get("")
async def list_documents(
    document_type: Optional[str] = None,
    q: Optional[str] = None,
    tag: Optional[str] = None,
    sort: Literal["newest", "oldest", "name", "type", "provider"] = "newest",
    starred: bool = False,
    user_id: str = Depends(get_current_user_id),
):
    household = await _require_household(user_id)
    filt: dict = {"household_id": household["id"], "is_deleted": False}
    if document_type and document_type != "ALL":
        filt["document_type"] = document_type
    if tag:
        filt["tags"] = tag
    if q:
        safe = re.escape(q.strip())
        filt["$or"] = [
            {"title": {"$regex": safe, "$options": "i"}},
            {"original_filename": {"$regex": safe, "$options": "i"}},
            {"notes": {"$regex": safe, "$options": "i"}},
            {"provider_name": {"$regex": safe, "$options": "i"}},
            {"tags": {"$regex": safe, "$options": "i"}},
        ]
    sort_map = {
        "newest": [("uploaded_at", -1)],
        "oldest": [("uploaded_at", 1)],
        "name": [("title", 1)],
        "type": [("document_type", 1), ("uploaded_at", -1)],
        "provider": [("provider_name", 1), ("uploaded_at", -1)],
    }
    rows = []
    async for d in db.vault_documents.find(
        filt, {"_id": 0, "file_b64": 0}
    ).sort(sort_map[sort]).limit(500):
        rows.append(d)

    # Per-category counts (always returned so sidebar can render)
    counts = {}
    async for c in db.vault_documents.aggregate([
        {"$match": {"household_id": household["id"], "is_deleted": False}},
        {"$group": {"_id": "$document_type", "n": {"$sum": 1}}},
    ]):
        counts[c["_id"]] = c["n"]
    total = sum(counts.values())
    return {"rows": rows, "total": total, "counts": counts}


# ============================================================================
# Get one
# ============================================================================

@vault_router.get("/{doc_id}")
async def get_document(doc_id: str, user_id: str = Depends(get_current_user_id)):
    household = await _require_household(user_id)
    d = await db.vault_documents.find_one(
        {"id": doc_id, "household_id": household["id"], "is_deleted": False},
        {"_id": 0, "file_b64": 0},
    )
    if not d:
        raise HTTPException(404, "Document not found")

    # Touch last_viewed_at
    await db.vault_documents.update_one({"id": doc_id}, {"$set": {"last_viewed_at": _now()}})

    # Pull version history (all docs with same lineage)
    versions = []
    if d.get("previous_version_id") or d.get("version", 1) > 1:
        seen = set()
        cur_id = doc_id
        while cur_id and cur_id not in seen:
            seen.add(cur_id)
            v = await db.vault_documents.find_one(
                {"id": cur_id}, {"_id": 0, "id": 1, "version": 1, "uploaded_at": 1, "previous_version_id": 1},
            )
            if not v:
                break
            versions.append(v)
            cur_id = v.get("previous_version_id")
    return {**d, "versions": versions}


# ============================================================================
# Download (returns raw file)
# ============================================================================

@vault_router.get("/{doc_id}/download")
async def download_document(doc_id: str, user_id: str = Depends(get_current_user_id)):
    household = await _require_household(user_id)
    d = await db.vault_documents.find_one(
        {"id": doc_id, "household_id": household["id"], "is_deleted": False},
        {"_id": 0},
    )
    if not d:
        raise HTTPException(404, "Document not found")
    payload = base64.b64decode(d["file_b64"])
    fname = d.get("original_filename") or f"{d['title']}.bin"
    return Response(
        content=payload,
        media_type=d.get("mime_type") or "application/octet-stream",
        headers={"Content-Disposition": f'inline; filename="{fname}"'},
    )


# ============================================================================
# Update metadata
# ============================================================================

class UpdateDocBody(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    document_type: Optional[str] = None
    provider_name: Optional[str] = Field(None, max_length=255)
    statement_period: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: Optional[str] = Field(None, max_length=5000)


@vault_router.put("/{doc_id}")
async def update_document(doc_id: str, body: UpdateDocBody, user_id: str = Depends(get_current_user_id)):
    household = await _require_household(user_id)
    update = {}
    if body.title is not None:
        update["title"] = body.title.strip()
    if body.document_type is not None:
        if body.document_type not in VALID_TYPES:
            raise HTTPException(400, f"document_type must be one of {VALID_TYPES}")
        update["document_type"] = body.document_type
    if body.provider_name is not None:
        update["provider_name"] = body.provider_name.strip() or None
    if body.statement_period is not None:
        update["statement_period"] = body.statement_period or None
    if body.tags is not None:
        update["tags"] = [t.strip() for t in body.tags if t and t.strip()][:20]
    if body.notes is not None:
        update["notes"] = body.notes.strip() or None
    if not update:
        raise HTTPException(400, "No fields to update")
    update["updated_at"] = _now()
    res = await db.vault_documents.update_one(
        {"id": doc_id, "household_id": household["id"], "is_deleted": False},
        {"$set": update},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Document not found")
    return {"ok": True, "updated": update}


# ============================================================================
# Delete (soft, then 30-day grace)
# ============================================================================

@vault_router.delete("/{doc_id}")
async def delete_document(doc_id: str, user_id: str = Depends(get_current_user_id)):
    household = await _require_household(user_id)
    res = await db.vault_documents.update_one(
        {"id": doc_id, "household_id": household["id"], "is_deleted": False},
        {"$set": {"is_deleted": True, "deleted_at": _now()}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Document not found")
    return {"ok": True, "restore_within_days": 30}


# ============================================================================
# Sharing
# ============================================================================

class ShareBody(BaseModel):
    shared_with: List[str]  # list of user_ids in the same household


@vault_router.put("/{doc_id}/sharing")
async def update_sharing(doc_id: str, body: ShareBody, user_id: str = Depends(get_current_user_id)):
    household = await _require_household(user_id)
    # Validate every user_id is in this household
    if body.shared_with:
        valid_count = await db.users.count_documents(
            {"id": {"$in": body.shared_with}, "household_id": household["id"]}
        )
        if valid_count != len(set(body.shared_with)):
            raise HTTPException(400, "All shared_with users must be household members")
    res = await db.vault_documents.update_one(
        {"id": doc_id, "household_id": household["id"], "is_deleted": False},
        {"$set": {"shared_with": list(set(body.shared_with))}},
    )
    if res.matched_count == 0:
        raise HTTPException(404, "Document not found")
    return {"ok": True}
