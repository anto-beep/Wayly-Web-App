"""Document Vault — household-scoped file storage for caregivers + linked
advisers. Stores docs as base64 inside Mongo to stay consistent with the
existing Statement upload pattern (no external S3 dependency).

Endpoints (all prefixed by `/api` via the parent router include):
  GET    /documents                       — list household's documents (metadata only)
  POST   /documents                       — upload a new doc (multipart)
  GET    /documents/{doc_id}              — metadata for a single doc
  GET    /documents/{doc_id}/download     — binary download
  PATCH  /documents/{doc_id}              — update title / category / notes
  DELETE /documents/{doc_id}              — remove a doc
  POST   /documents/{doc_id}/send-to-decoder — pipe a `statement` doc through
                                              the existing Statement Decoder
                                              and return the parsed result
                                              (also persists a Statement row).

Adviser read-only access:
  GET    /documents?as_client_id=<adviser_client_id>   — list a linked
                                                         client's docs as an
                                                         adviser (read-only)
  GET    /documents/{doc_id}?as_client_id=...
  GET    /documents/{doc_id}/download?as_client_id=...

Storage shape (collection `documents`):
  {
    id, household_id, owner_user_id, category, title, filename,
    file_mimetype, file_size_bytes, file_b64, notes,
    created_at, updated_at, last_decoded_statement_id,
  }

Categories: assessment, statement, care_plan, medical, financial, legal, other.
Hard caps: 10 MB per file, 100 MB total per household.
"""
from __future__ import annotations
import base64
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import StreamingResponse
import io
from pydantic import BaseModel, Field

from models import new_id, now_iso

documents_router = APIRouter(prefix="/documents", tags=["documents"])

# Module-level injected deps (wired from server.py).
_db = None
_user_dep = None
_decode_statement = None  # async callable(file_bytes: bytes, filename: str, mimetype: str) -> dict

CATEGORIES = {"assessment", "statement", "care_plan", "medical", "financial", "legal", "other"}
MAX_FILE_BYTES = 10 * 1024 * 1024     # 10 MB per file
MAX_VAULT_BYTES = 100 * 1024 * 1024   # 100 MB per household
ALLOWED_MIMES = {
    "application/pdf",
    "text/plain", "text/csv",
    "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
}


def init_documents_routes(*, db, user_dep, decode_statement):
    global _db, _user_dep, _decode_statement
    _db = db
    _user_dep = user_dep
    _decode_statement = decode_statement


class DocUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    category: Optional[str] = Field(default=None)
    notes: Optional[str] = Field(default=None, max_length=2000)


def _public(doc: dict) -> dict:
    """Strip the heavy base64 blob (and Mongo's ObjectId) before returning."""
    out = {k: v for k, v in doc.items() if k not in ("file_b64", "_id")}
    out["has_file"] = bool(doc.get("file_b64"))
    return out


async def _household_for_user(user_id: str) -> dict:
    user = await _db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1})
    if not user or not user.get("household_id"):
        raise HTTPException(
            status_code=409,
            detail={
                "error": "no_household",
                "message": "Create your household first to use the Document Vault.",
                "redirect": "/onboarding",
            },
        )
    return {"id": user["household_id"], "user_id": user_id}


async def _resolve_scope(request: Request, as_client_id: Optional[str]) -> dict:
    """Returns {household_id, role: 'owner'|'adviser', adviser_user_id?}.
    Either:
      • The caller is the household owner (default), OR
      • The caller is an Adviser viewing one of their linked clients in
        read-only mode (`?as_client_id=` provided).
    """
    user = await _user_dep(request)
    if as_client_id:
        plan = (user.get("plan") or "").lower()
        if plan != "adviser":
            raise HTTPException(
                status_code=403,
                detail={"error": "plan_required", "message": "Read-only client access requires the Adviser plan."},
            )
        row = await _db.adviser_clients.find_one(
            {"id": as_client_id, "adviser_user_id": user["id"]}, {"_id": 0},
        )
        if not row:
            raise HTTPException(status_code=404, detail="Client not found")
        hh = row.get("linked_household_id")
        if not hh:
            raise HTTPException(
                status_code=409,
                detail={"error": "client_not_linked", "message": "This client hasn't completed onboarding yet."},
            )
        return {"household_id": hh, "role": "adviser", "adviser_user_id": user["id"], "user_id": user["id"]}
    hh = await _household_for_user(user["id"])
    return {"household_id": hh["id"], "role": "owner", "user_id": user["id"]}


@documents_router.get("")
async def list_documents(
    request: Request,
    category: Optional[str] = Query(default=None),
    as_client_id: Optional[str] = Query(default=None),
):
    scope = await _resolve_scope(request, as_client_id)
    q = {"household_id": scope["household_id"]}
    if category and category in CATEGORIES:
        q["category"] = category
    cur = _db.documents.find(q, {"_id": 0, "file_b64": 0}).sort("created_at", -1).limit(500)
    docs = [d async for d in cur]
    for d in docs:
        d["has_file"] = True  # we excluded file_b64; assume present
    total_bytes = await _vault_total_bytes(scope["household_id"])
    return {
        "documents": docs,
        "scope": scope["role"],
        "limits": {
            "max_file_bytes": MAX_FILE_BYTES,
            "max_vault_bytes": MAX_VAULT_BYTES,
            "vault_used_bytes": total_bytes,
            "vault_remaining_bytes": max(0, MAX_VAULT_BYTES - total_bytes),
        },
        "categories": sorted(CATEGORIES),
    }


async def _vault_total_bytes(household_id: str) -> int:
    cur = _db.documents.aggregate([
        {"$match": {"household_id": household_id}},
        {"$group": {"_id": None, "total": {"$sum": "$file_size_bytes"}}},
    ])
    result = await cur.to_list(1)
    return int(result[0]["total"]) if result else 0


@documents_router.post("")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    category: str = Form("other"),
    title: Optional[str] = Form(None),
    notes: Optional[str] = Form(None),
):
    scope = await _resolve_scope(request, None)  # uploads are owner-only
    if category not in CATEGORIES:
        raise HTTPException(status_code=400, detail={"error": "bad_category", "message": f"Unknown category. Use one of: {sorted(CATEGORIES)}"})
    raw = await file.read()
    size = len(raw)
    if size == 0:
        raise HTTPException(status_code=400, detail="Empty file")
    if size > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"error": "file_too_large", "message": f"Files must be 10 MB or smaller. Yours is {size / 1_048_576:.1f} MB."},
        )
    existing_bytes = await _vault_total_bytes(scope["household_id"])
    if existing_bytes + size > MAX_VAULT_BYTES:
        raise HTTPException(
            status_code=413,
            detail={
                "error": "vault_full",
                "message": "Your vault is full. Delete older documents or contact support to lift the cap.",
                "vault_used_bytes": existing_bytes,
                "max_vault_bytes": MAX_VAULT_BYTES,
            },
        )
    mimetype = (file.content_type or "application/octet-stream").lower()
    if mimetype not in ALLOWED_MIMES:
        # Soft-allow but warn — many browsers misreport mimetypes.
        mimetype = "application/octet-stream"
    doc = {
        "id": new_id(),
        "household_id": scope["household_id"],
        "owner_user_id": scope["user_id"],
        "category": category,
        "title": (title or file.filename or "Untitled").strip()[:200],
        "filename": (file.filename or "upload.bin")[:200],
        "file_mimetype": mimetype,
        "file_size_bytes": size,
        "file_b64": base64.b64encode(raw).decode("ascii"),
        "notes": (notes or "").strip()[:2000] or None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "last_decoded_statement_id": None,
    }
    await _db.documents.insert_one(doc)
    return _public(doc)


@documents_router.get("/{doc_id}")
async def get_document(doc_id: str, request: Request, as_client_id: Optional[str] = Query(default=None)):
    scope = await _resolve_scope(request, as_client_id)
    doc = await _db.documents.find_one(
        {"id": doc_id, "household_id": scope["household_id"]}, {"_id": 0, "file_b64": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc["has_file"] = True
    return doc


@documents_router.get("/{doc_id}/download")
async def download_document(doc_id: str, request: Request, as_client_id: Optional[str] = Query(default=None)):
    scope = await _resolve_scope(request, as_client_id)
    doc = await _db.documents.find_one(
        {"id": doc_id, "household_id": scope["household_id"]}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    blob = base64.b64decode(doc.get("file_b64") or "")
    safe_name = (doc.get("filename") or "document").replace('"', '')
    return StreamingResponse(
        io.BytesIO(blob),
        media_type=doc.get("file_mimetype") or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@documents_router.patch("/{doc_id}")
async def update_document(doc_id: str, body: DocUpdate, request: Request):
    scope = await _resolve_scope(request, None)  # owner-only
    doc = await _db.documents.find_one(
        {"id": doc_id, "household_id": scope["household_id"]}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates.get("category") and updates["category"] not in CATEGORIES:
        raise HTTPException(status_code=400, detail={"error": "bad_category"})
    if not updates:
        return _public(doc)
    updates["updated_at"] = now_iso()
    await _db.documents.update_one(
        {"id": doc_id, "household_id": scope["household_id"]}, {"$set": updates},
    )
    doc.update(updates)
    return _public(doc)


@documents_router.delete("/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    scope = await _resolve_scope(request, None)
    res = await _db.documents.delete_one(
        {"id": doc_id, "household_id": scope["household_id"]},
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"ok": True, "deleted": doc_id}


@documents_router.post("/{doc_id}/send-to-decoder")
async def send_to_decoder(doc_id: str, request: Request):
    scope = await _resolve_scope(request, None)
    doc = await _db.documents.find_one(
        {"id": doc_id, "household_id": scope["household_id"]}, {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.get("category") != "statement":
        raise HTTPException(
            status_code=400,
            detail={
                "error": "wrong_category",
                "message": "Only documents with category='statement' can be sent to the Statement Decoder. Edit this document's category first.",
                "current_category": doc.get("category"),
            },
        )
    if _decode_statement is None:
        raise HTTPException(status_code=503, detail="Decoder not initialised")
    blob = base64.b64decode(doc.get("file_b64") or "")
    result = await _decode_statement(
        household_id=scope["household_id"],
        owner_user_id=scope["user_id"],
        file_bytes=blob,
        filename=doc.get("filename") or "statement.bin",
        mimetype=doc.get("file_mimetype") or "application/pdf",
        source_document_id=doc_id,
    )
    if result.get("statement_id"):
        await _db.documents.update_one(
            {"id": doc_id, "household_id": scope["household_id"]},
            {"$set": {"last_decoded_statement_id": result["statement_id"], "updated_at": now_iso()}},
        )
    return result
