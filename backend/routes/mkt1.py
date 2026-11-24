"""Wayly Social OS — Phase 1: Marketing Asset library + permanent public media.

Admin-only management of social media creative (PNG/JPG/MP4/PDF), permanent
hosting on Emergent object storage, and a sanitised campaign/asset manifest
(CSV/JSON) for downstream automation (Buffer in Phase 3, ChatGPT handoff).

Mounted at /api/mkt/*. Management routes require super_admin/operations_admin.
The media route /api/mkt/media/{asset_id}/{filename} is PUBLIC (no auth) but
only serves APPROVED, non-deleted assets — unapproved/unpublished stay private.

Storage is isolated under the `wayly/social/...` key namespace, completely
separate from customer statements/invoices/health records.
"""
from __future__ import annotations

import os
import io
import csv
import json
import uuid
import asyncio
import logging
import zipfile
import re
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, Request
from fastapi.responses import Response, JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

from admin_auth import require_super_or_ops
from lib import mkt_storage as store

logger = logging.getLogger(__name__)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

ALLOWED_EXT = set(store.EXT_TO_TYPE.keys())
PLATFORMS = {"facebook", "instagram", "linkedin", "all"}
APPROVAL = {"draft", "approved", "rejected"}
PUB_STATUS = {"unpublished", "scheduled", "published", "failed"}

# Safe-ZIP limits
ZIP_MAX_FILES = 500
ZIP_MAX_FILE_BYTES = 200 * 1024 * 1024       # 200 MB per entry
ZIP_MAX_TOTAL_BYTES = 1024 * 1024 * 1024     # 1 GB uncompressed total


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "-", (s or "").strip().lower()).strip("-")
    return s or "untitled"


def _public_base() -> str:
    return (os.environ.get("MKT_PUBLIC_BASE_URL")
            or os.environ.get("FRONTEND_URL")
            or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")


def _media_path(asset: dict) -> str:
    return f"/api/mkt/media/{asset['id']}/{asset['filename']}"


def _public_url(asset: dict) -> str:
    base = _public_base()
    return f"{base}{_media_path(asset)}" if base else _media_path(asset)


def _thumb_url(asset: dict) -> Optional[str]:
    if not asset.get("thumbnail_storage_path"):
        return None
    base = _public_base()
    path = f"/api/mkt/thumb/{asset['id']}/cover.png"
    return f"{base}{path}" if base else path


def _readiness(a: dict) -> str:
    """Is this asset ready to attach to a Buffer post?"""
    if a.get("approval_status") != "approved":
        return "not_approved"
    if a.get("asset_type") == "document" and not a.get("thumbnail_storage_path"):
        return "awaiting_thumbnail"
    return "ready"


def _gen_pdf_thumbnail(data: bytes) -> Optional[bytes]:
    """First page of a PDF -> PNG cover (for LinkedIn document posts)."""
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        pix = doc.load_page(0).get_pixmap(matrix=fitz.Matrix(2, 2))
        out = pix.tobytes("png")
        doc.close()
        return out
    except Exception as e:
        logger.info(f"pdf thumbnail generation failed: {e}")
        return None


def _manifest_asset(a: dict) -> dict:
    """Sanitised, machine-readable record for the ChatGPT/Buffer manifest."""
    return {
        "asset_id": a["id"],
        "campaign_id": a.get("campaign_id"),
        "topic": a.get("content_topic", ""),
        "media_url": _public_url(a),
        "thumbnail_url": _thumb_url(a),
        "asset_type": a.get("asset_type"),
        "content_type": a.get("content_type"),
        "carousel_order": a.get("carousel_order", 0),
        "target_platform": a.get("target_platform", "all"),
        "alt_text": a.get("alt_text", ""),
        "canva_design_id": a.get("canva_design_id"),
        "buffer_draft_id": a.get("buffer_draft_id"),
        "checksum": a.get("checksum"),
        "width": a.get("width"), "height": a.get("height"),
        "version": a.get("version", 1),
        "approval_status": a.get("approval_status", "draft"),
        "publication_status": a.get("publication_status", "unpublished"),
        "publishing_readiness": _readiness(a),
    }


MANIFEST_TOKEN = os.environ.get("MKT_MANIFEST_TOKEN")


def _probe_dimensions(asset_type: str, ext: str, data: bytes) -> Dict[str, Any]:
    out: Dict[str, Any] = {"width": None, "height": None, "pages": None, "duration": None}
    try:
        if asset_type == "image":
            from PIL import Image
            with Image.open(io.BytesIO(data)) as im:
                out["width"], out["height"] = im.size
        elif ext == "pdf":
            from pypdf import PdfReader
            out["pages"] = len(PdfReader(io.BytesIO(data)).pages)
    except Exception as e:  # dimensions are best-effort, never block an upload
        logger.info(f"mkt dimension probe failed ({asset_type}/{ext}): {e}")
    return out


def _asset_public(a: dict) -> dict:
    """Serialise an asset for API responses (no _id, add computed URLs)."""
    return {
        "id": a["id"],
        "campaign_id": a.get("campaign_id"),
        "content_topic": a.get("content_topic"),
        "filename": a.get("filename"),
        "canva_design_id": a.get("canva_design_id"),
        "asset_type": a.get("asset_type"),
        "width": a.get("width"),
        "height": a.get("height"),
        "pages": a.get("pages"),
        "duration": a.get("duration"),
        "file_size": a.get("file_size"),
        "checksum": a.get("checksum"),
        "carousel_order": a.get("carousel_order", 0),
        "target_platform": a.get("target_platform", "all"),
        "content_type": a.get("content_type"),
        "media_url": _public_url(a),
        "thumbnail_url": _thumb_url(a),
        "alt_text": a.get("alt_text"),
        "approval_status": a.get("approval_status", "draft"),
        "version": a.get("version", 1),
        "publication_status": a.get("publication_status", "unpublished"),
        "publishing_readiness": _readiness(a),
        "buffer_draft_id": a.get("buffer_draft_id"),
        "created_at": a.get("created_at"),
        "updated_at": a.get("updated_at"),
    }


async def _audit(entity: str, entity_id: str, action: str, actor: dict, detail: dict | None = None):
    await db.mkt_audit.insert_one({
        "id": str(uuid.uuid4()), "entity": entity, "entity_id": entity_id,
        "action": action, "actor_id": (actor or {}).get("id"),
        "actor_email": (actor or {}).get("email"), "detail": detail or {}, "at": _now(),
    })


async def _store_and_create(
    *, data: bytes, filename: str, campaign_id: str, content_topic: str,
    target_platform: str, alt_text: str, carousel_order: int, canva_design_id: str | None,
    content_type_hint: str | None, actor: dict,
) -> dict:
    ext = store.ext_of(filename)
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"Unsupported file type '.{ext}'. Allowed: {', '.join(sorted(ALLOWED_EXT))}")
    asset_type = store.EXT_TO_TYPE[ext]
    content_type = store.guess_content_type(filename, content_type_hint)
    checksum = store.sha256_hex(data)
    asset_id = str(uuid.uuid4())
    version = 1
    safe_name = f"{_slug(content_topic or filename.rsplit('.', 1)[0])}-v{version}.{ext}"
    month = datetime.now(timezone.utc).strftime("%Y/%m")
    key = f"{store.APP_PREFIX}/{month}/{_slug(campaign_id)}/{asset_id}-v{version}.{ext}"

    result = await asyncio.to_thread(store.put_object, key, data, content_type)
    dims = _probe_dimensions(asset_type, ext, data)

    # LinkedIn document posts need a cover image — generate one for PDFs
    thumb_path = None
    if ext == "pdf":
        thumb = _gen_pdf_thumbnail(data)
        if thumb:
            thumb_key = f"{store.APP_PREFIX}/{month}/{_slug(campaign_id)}/{asset_id}-v{version}-thumb.png"
            try:
                tr = await asyncio.to_thread(store.put_object, thumb_key, thumb, "image/png")
                thumb_path = tr["path"]
            except Exception as e:
                logger.info(f"mkt thumbnail store failed: {e}")

    doc = {
        "id": asset_id,
        "campaign_id": campaign_id,
        "content_topic": content_topic or "",
        "filename": safe_name,
        "original_filename": filename,
        "canva_design_id": canva_design_id or None,
        "asset_type": asset_type,
        "width": dims["width"], "height": dims["height"],
        "pages": dims["pages"], "duration": dims["duration"],
        "file_size": result.get("size", len(data)),
        "checksum": checksum,
        "carousel_order": int(carousel_order or 0),
        "target_platform": target_platform if target_platform in PLATFORMS else "all",
        "storage_path": result["path"],
        "thumbnail_storage_path": thumb_path,
        "content_type": content_type,
        "alt_text": alt_text or "",
        "approval_status": "draft",
        "version": version,
        "publication_status": "unpublished",
        "buffer_draft_id": None,
        "is_deleted": False,
        "created_at": _now(), "updated_at": _now(),
    }
    await db.mkt_assets.insert_one(doc)
    await _audit("asset", asset_id, "upload", actor, {"filename": safe_name, "campaign_id": campaign_id})
    return doc


# --------------------------------------------------------------------------- models
class CampaignIn(BaseModel):
    campaign_id: str = Field(min_length=1, max_length=80)
    name: str = Field(min_length=1, max_length=200)
    topic: Optional[str] = ""
    month: Optional[str] = ""


class AssetPatch(BaseModel):
    content_topic: Optional[str] = None
    alt_text: Optional[str] = None
    carousel_order: Optional[int] = None
    target_platform: Optional[str] = None
    campaign_id: Optional[str] = None
    approval_status: Optional[str] = None
    publication_status: Optional[str] = None
    buffer_draft_id: Optional[str] = None


def build_mkt1_router() -> APIRouter:
    router = APIRouter(prefix="/mkt", tags=["social-os"])

    # ---------------- Campaigns ----------------
    @router.post("/campaigns")
    async def create_campaign(body: CampaignIn, admin: dict = Depends(require_super_or_ops)):
        cid = _slug(body.campaign_id)
        existing = await db.mkt_campaigns.find_one({"campaign_id": cid})
        if existing:
            raise HTTPException(409, "A campaign with that ID already exists")
        doc = {
            "id": str(uuid.uuid4()), "campaign_id": cid, "name": body.name,
            "topic": body.topic or "", "month": body.month or "",
            "status": "active", "created_at": _now(), "updated_at": _now(),
        }
        await db.mkt_campaigns.insert_one(doc)
        await _audit("campaign", cid, "create", admin, {"name": body.name})
        doc.pop("_id", None)
        return doc

    @router.get("/campaigns")
    async def list_campaigns(admin: dict = Depends(require_super_or_ops)):
        rows = await db.mkt_campaigns.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
        # attach asset counts
        for r in rows:
            r["asset_count"] = await db.mkt_assets.count_documents(
                {"campaign_id": r["campaign_id"], "is_deleted": {"$ne": True}})
        return rows

    # ---------------- Upload ----------------
    @router.post("/assets/upload")
    async def upload_asset(
        request: Request,
        file: UploadFile = File(...),
        campaign_id: str = Form(...),
        content_topic: str = Form(""),
        target_platform: str = Form("all"),
        alt_text: str = Form(""),
        carousel_order: int = Form(0),
        canva_design_id: str = Form(""),
        admin: dict = Depends(require_super_or_ops),
    ):
        data = await file.read()
        if not data:
            raise HTTPException(400, "Empty file")
        doc = await _store_and_create(
            data=data, filename=file.filename or "upload.bin", campaign_id=_slug(campaign_id),
            content_topic=content_topic, target_platform=target_platform, alt_text=alt_text,
            carousel_order=carousel_order, canva_design_id=canva_design_id,
            content_type_hint=file.content_type, actor=admin,
        )
        return _asset_public(doc)

    @router.post("/assets/bulk-upload")
    async def bulk_upload(
        request: Request,
        files: List[UploadFile] = File(...),
        campaign_id: str = Form(...),
        content_topic: str = Form(""),
        target_platform: str = Form("all"),
        admin: dict = Depends(require_super_or_ops),
    ):
        created: List[dict] = []
        errors: List[dict] = []
        cid = _slug(campaign_id)
        order = 0
        for f in files:
            raw = await f.read()
            name = f.filename or "upload.bin"
            ext = store.ext_of(name)
            try:
                if ext == "zip":
                    sub = await _ingest_zip(raw, cid, content_topic, target_platform, admin, start_order=order)
                    created.extend(sub["created"]); errors.extend(sub["errors"]); order += len(sub["created"])
                    continue
                doc = await _store_and_create(
                    data=raw, filename=name, campaign_id=cid, content_topic=content_topic,
                    target_platform=target_platform, alt_text="", carousel_order=order,
                    canva_design_id=None, content_type_hint=f.content_type, actor=admin,
                )
                created.append(_asset_public(doc)); order += 1
            except HTTPException as he:
                errors.append({"filename": name, "error": he.detail})
            except Exception as e:
                errors.append({"filename": name, "error": str(e)})
        return {"created": created, "errors": errors, "created_count": len(created)}

    async def _ingest_zip(raw: bytes, cid: str, topic: str, platform: str, actor: dict, start_order: int = 0) -> dict:
        created, errors = [], []
        try:
            zf = zipfile.ZipFile(io.BytesIO(raw))
        except zipfile.BadZipFile:
            raise HTTPException(400, "Invalid ZIP archive")
        infos = [i for i in zf.infolist() if not i.is_dir()]
        if len(infos) > ZIP_MAX_FILES:
            raise HTTPException(400, f"ZIP has too many files (>{ZIP_MAX_FILES})")
        total = 0
        order = start_order
        for info in infos:
            nm = info.filename
            # path-traversal / absolute-path / hidden protection
            if nm.startswith("/") or ".." in nm.replace("\\", "/").split("/") or ":" in nm:
                errors.append({"filename": nm, "error": "unsafe path skipped"}); continue
            base = os.path.basename(nm.replace("\\", "/"))
            if not base or base.startswith("."):
                continue
            ext = store.ext_of(base)
            if ext not in ALLOWED_EXT:
                errors.append({"filename": base, "error": f"unsupported .{ext} skipped"}); continue
            if info.file_size > ZIP_MAX_FILE_BYTES:
                errors.append({"filename": base, "error": "file too large skipped"}); continue
            total += info.file_size
            if total > ZIP_MAX_TOTAL_BYTES:
                raise HTTPException(400, "ZIP uncompressed size exceeds limit")
            try:
                with zf.open(info) as fh:
                    data = fh.read()
                doc = await _store_and_create(
                    data=data, filename=base, campaign_id=cid, content_topic=topic,
                    target_platform=platform, alt_text="", carousel_order=order,
                    canva_design_id=None, content_type_hint=None, actor=actor,
                )
                created.append(_asset_public(doc)); order += 1
            except Exception as e:
                errors.append({"filename": base, "error": str(e)})
        return {"created": created, "errors": errors}

    # ---------------- List / detail / edit / delete ----------------
    @router.get("/assets")
    async def list_assets(
        q: Optional[str] = None,
        campaign_id: Optional[str] = None,
        target_platform: Optional[str] = None,
        asset_type: Optional[str] = None,
        approval_status: Optional[str] = None,
        publication_status: Optional[str] = None,
        skip: int = 0,
        limit: int = Query(60, le=200),
        admin: dict = Depends(require_super_or_ops),
    ):
        flt: Dict[str, Any] = {"is_deleted": {"$ne": True}}
        if campaign_id:
            flt["campaign_id"] = _slug(campaign_id)
        if target_platform and target_platform in PLATFORMS:
            flt["target_platform"] = target_platform
        if asset_type:
            flt["asset_type"] = asset_type
        if approval_status in APPROVAL:
            flt["approval_status"] = approval_status
        if publication_status in PUB_STATUS:
            flt["publication_status"] = publication_status
        if q:
            rx = {"$regex": re.escape(q), "$options": "i"}
            flt["$or"] = [{"content_topic": rx}, {"filename": rx}, {"campaign_id": rx}, {"alt_text": rx}]
        total = await db.mkt_assets.count_documents(flt)
        rows = await db.mkt_assets.find(flt).sort([("campaign_id", 1), ("carousel_order", 1), ("created_at", -1)]).skip(skip).limit(limit).to_list(limit)
        return {"total": total, "assets": [_asset_public(r) for r in rows]}

    @router.get("/assets/{asset_id}")
    async def get_asset(asset_id: str, admin: dict = Depends(require_super_or_ops)):
        a = await db.mkt_assets.find_one({"id": asset_id, "is_deleted": {"$ne": True}})
        if not a:
            raise HTTPException(404, "Asset not found")
        return _asset_public(a)

    @router.get("/assets/{asset_id}/raw")
    async def raw_asset(asset_id: str, admin: dict = Depends(require_super_or_ops)):
        """Admin-only byte stream for previewing ANY asset (incl. unapproved)."""
        a = await db.mkt_assets.find_one({"id": asset_id, "is_deleted": {"$ne": True}})
        if not a:
            raise HTTPException(404, "Asset not found")
        try:
            data, ctype = await asyncio.to_thread(store.get_object, a["storage_path"])
        except Exception as e:
            logger.warning(f"mkt raw fetch failed {asset_id}: {e}")
            raise HTTPException(502, "Media temporarily unavailable")
        return Response(content=data, media_type=a.get("content_type") or ctype,
                        headers={"Content-Disposition": f'inline; filename="{a.get("filename")}"'})

    @router.patch("/assets/{asset_id}")
    async def patch_asset(asset_id: str, body: AssetPatch, admin: dict = Depends(require_super_or_ops)):
        a = await db.mkt_assets.find_one({"id": asset_id, "is_deleted": {"$ne": True}})
        if not a:
            raise HTTPException(404, "Asset not found")
        upd: Dict[str, Any] = {}
        if body.content_topic is not None:
            upd["content_topic"] = body.content_topic
        if body.alt_text is not None:
            upd["alt_text"] = body.alt_text
        if body.carousel_order is not None:
            upd["carousel_order"] = int(body.carousel_order)
        if body.target_platform is not None:
            if body.target_platform not in PLATFORMS:
                raise HTTPException(400, "Invalid target_platform")
            upd["target_platform"] = body.target_platform
        if body.campaign_id is not None:
            upd["campaign_id"] = _slug(body.campaign_id)
        if body.approval_status is not None:
            if body.approval_status not in APPROVAL:
                raise HTTPException(400, "Invalid approval_status")
            upd["approval_status"] = body.approval_status
        if body.publication_status is not None:
            if body.publication_status not in PUB_STATUS:
                raise HTTPException(400, "Invalid publication_status")
            upd["publication_status"] = body.publication_status
        if body.buffer_draft_id is not None:
            upd["buffer_draft_id"] = body.buffer_draft_id.strip() or None
        if not upd:
            return _asset_public(a)
        upd["updated_at"] = _now()
        await db.mkt_assets.update_one({"id": asset_id}, {"$set": upd})
        await _audit("asset", asset_id, "update", admin, upd)
        a = await db.mkt_assets.find_one({"id": asset_id})
        return _asset_public(a)

    @router.delete("/assets/{asset_id}")
    async def delete_asset(asset_id: str, admin: dict = Depends(require_super_or_ops)):
        a = await db.mkt_assets.find_one({"id": asset_id, "is_deleted": {"$ne": True}})
        if not a:
            raise HTTPException(404, "Asset not found")
        await db.mkt_assets.update_one({"id": asset_id}, {"$set": {"is_deleted": True, "updated_at": _now()}})
        await _audit("asset", asset_id, "delete", admin, {})
        return {"ok": True}

    # ---------------- Manifest (approved only) ----------------
    async def _approved_assets() -> List[dict]:
        return await db.mkt_assets.find(
            {"is_deleted": {"$ne": True}, "approval_status": "approved"}
        ).sort([("campaign_id", 1), ("carousel_order", 1)]).to_list(5000)

    def _manifest_payload(assets: List[dict]) -> dict:
        campaigns: Dict[str, Any] = {}
        for a in assets:
            cid = a.get("campaign_id") or "uncategorised"
            campaigns.setdefault(cid, {"campaign_id": cid, "assets": []})
            campaigns[cid]["assets"].append(_manifest_asset(a))
        return {"generated_at": _now(), "campaign_count": len(campaigns),
                "asset_count": len(assets), "campaigns": list(campaigns.values())}

    _CSV_COLS = ["campaign_id", "topic", "asset_id", "media_url", "thumbnail_url",
                 "asset_type", "content_type", "carousel_order", "target_platform",
                 "alt_text", "canva_design_id", "buffer_draft_id", "checksum",
                 "width", "height", "version", "approval_status",
                 "publication_status", "publishing_readiness"]

    def _manifest_csv_text(assets: List[dict]) -> str:
        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(_CSV_COLS)
        for a in assets:
            m = _manifest_asset(a)
            w.writerow([m.get(c, "") if m.get(c) is not None else "" for c in _CSV_COLS])
        return buf.getvalue()

    @router.get("/manifest.json")
    async def manifest_json(admin: dict = Depends(require_super_or_ops)):
        return _manifest_payload(await _approved_assets())

    @router.get("/manifest.csv")
    async def manifest_csv(admin: dict = Depends(require_super_or_ops)):
        return Response(content=_manifest_csv_text(await _approved_assets()), media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=wayly-marketing-manifest.csv"})

    # Token-gated manifest for ChatGPT / external automation (no admin session).
    def _check_manifest_token(token: Optional[str], request: Request):
        supplied = token or request.headers.get("x-manifest-token")
        if not MANIFEST_TOKEN or supplied != MANIFEST_TOKEN:
            raise HTTPException(401, "Invalid or missing manifest token")

    @router.get("/public-manifest.json")
    async def public_manifest_json(request: Request, token: Optional[str] = None):
        _check_manifest_token(token, request)
        return _manifest_payload(await _approved_assets())

    @router.get("/public-manifest.csv")
    async def public_manifest_csv(request: Request, token: Optional[str] = None):
        _check_manifest_token(token, request)
        return Response(content=_manifest_csv_text(await _approved_assets()), media_type="text/csv",
                        headers={"Content-Disposition": "attachment; filename=wayly-marketing-manifest.csv"})

    @router.get("/manifest-link")
    async def manifest_link(admin: dict = Depends(require_super_or_ops)):
        if not MANIFEST_TOKEN:
            raise HTTPException(503, "Manifest token not configured (set MKT_MANIFEST_TOKEN)")
        base = _public_base()
        return {
            "json_url": f"{base}/api/mkt/public-manifest.json?token={MANIFEST_TOKEN}",
            "csv_url": f"{base}/api/mkt/public-manifest.csv?token={MANIFEST_TOKEN}",
            "header_name": "X-Manifest-Token", "token": MANIFEST_TOKEN,
        }

    @router.get("/stats")
    async def stats(admin: dict = Depends(require_super_or_ops)):
        base = {"is_deleted": {"$ne": True}}
        return {
            "total": await db.mkt_assets.count_documents(base),
            "approved": await db.mkt_assets.count_documents({**base, "approval_status": "approved"}),
            "draft": await db.mkt_assets.count_documents({**base, "approval_status": "draft"}),
            "campaigns": await db.mkt_campaigns.count_documents({}),
            "by_platform": {p: await db.mkt_assets.count_documents({**base, "target_platform": p}) for p in PLATFORMS},
        }

    # ---------------- PUBLIC media (no auth; approved only) ----------------
    @router.get("/media/{asset_id}/{filename}")
    async def serve_media(asset_id: str, filename: str, request: Request):
        a = await db.mkt_assets.find_one({"id": asset_id, "is_deleted": {"$ne": True}})
        if not a or a.get("filename") != filename or a.get("approval_status") != "approved":
            raise HTTPException(404, "Not found")
        etag = f'"{a.get("checksum", asset_id)}"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304)
        try:
            data, ctype = await asyncio.to_thread(store.get_object, a["storage_path"])
        except Exception as e:
            logger.warning(f"mkt media fetch failed {asset_id}: {e}")
            raise HTTPException(502, "Media temporarily unavailable")
        return Response(
            content=data,
            media_type=a.get("content_type") or ctype,
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                "ETag": etag,
                "Content-Disposition": f'inline; filename="{filename}"',
                "Content-Length": str(len(data)),
                "Cross-Origin-Resource-Policy": "cross-origin",
            },
        )

    @router.get("/thumb/{asset_id}/{filename}")
    async def serve_thumb(asset_id: str, filename: str, request: Request):
        """PUBLIC cover thumbnail for approved document (PDF) assets."""
        a = await db.mkt_assets.find_one({"id": asset_id, "is_deleted": {"$ne": True}})
        if not a or a.get("approval_status") != "approved" or not a.get("thumbnail_storage_path"):
            raise HTTPException(404, "Not found")
        etag = f'"{a.get("checksum", asset_id)}-thumb"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304)
        try:
            data, _ = await asyncio.to_thread(store.get_object, a["thumbnail_storage_path"])
        except Exception as e:
            logger.warning(f"mkt thumb fetch failed {asset_id}: {e}")
            raise HTTPException(502, "Thumbnail temporarily unavailable")
        return Response(
            content=data, media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                "ETag": etag,
                "Content-Length": str(len(data)),
                "Cross-Origin-Resource-Policy": "cross-origin",
            },
        )

    return router
