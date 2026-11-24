"""Wayly Social OS — Phase 2: Canva Connect (OAuth + design export → asset library).

ALL Canva OAuth and REST calls stay server-side. The frontend never receives the
client secret, access token, refresh token or PKCE verifier. Tokens are encrypted
at rest (Fernet, reusing TOTP_ENC_KEY) and stored as a single founder connection.

Flow (adapted to the admin's Bearer session):
  1. Admin hits GET /oauth/url (authed) -> we mint PKCE+state, return the Canva authorize URL.
  2. Browser visits Canva, approves, Canva redirects to GET /oauth/callback (no auth).
  3. We exchange the code, store encrypted tokens, redirect back to the admin UI.

Exports: create an async export job, poll it, and on success download every URL
immediately (Canva URLs expire ~24h) into the permanent marketing library (mkt1),
which then serves them as stable public HTTPS media for Buffer.

Mounted at /api/mkt/canva/*. Management routes require super_admin/operations_admin;
the callback is public (validated by one-time state).
"""
from __future__ import annotations

import os
import time
import base64
import hashlib
import secrets
import asyncio
import logging
from urllib.parse import urlencode
from typing import Optional, List, Dict, Any

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from admin_auth import require_super_or_ops
from security_utils import encrypt_text, decrypt_text
from routes.mkt1 import db, _slug, _store_and_create, store

logger = logging.getLogger(__name__)

AUTH_URL = "https://www.canva.com/api/oauth/authorize"
TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token"
API_URL = "https://api.canva.com/rest/v1"
SCOPES = "design:content:read design:meta:read asset:read"
CONNECTION_ID = "wayly"  # single founder-wide Canva connection

# type -> (file extension, logical ingest hint)
EXPORT_EXT = {"png": "png", "jpg": "jpg", "pdf": "pdf", "mp4": "mp4"}


def _client() -> tuple[str, str]:
    cid = os.environ.get("CANVA_CLIENT_ID")
    csec = os.environ.get("CANVA_CLIENT_SECRET")
    if not cid or not csec:
        raise HTTPException(503, "Canva is not configured (missing client id/secret)")
    return cid, csec


def _redirect_uri() -> str:
    base = (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")
    if not base:
        raise HTTPException(503, "Public app URL not configured for Canva redirect")
    return f"{base}/api/mkt/canva/oauth/callback"


def _web_origin() -> str:
    return (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_APP_URL") or "").rstrip("/")


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    return verifier, challenge


def _token_post(data: dict) -> dict:
    cid, csec = _client()
    resp = requests.post(TOKEN_URL, auth=(cid, csec), data=data, timeout=40)
    if resp.is_error if hasattr(resp, "is_error") else (resp.status_code >= 400):
        logger.warning(f"canva token exchange failed: {resp.status_code}")
        raise HTTPException(502, "Canva token exchange failed")
    return resp.json()


async def _access_token() -> str:
    doc = await db.mkt_canva_tokens.find_one({"_id": CONNECTION_ID})
    if not doc:
        raise HTTPException(401, "Canva is not connected")
    if doc.get("expires_at", 0) > time.time() + 60:
        return decrypt_text(doc["access_token"])
    refresh = decrypt_text(doc.get("refresh_token"))
    if not refresh:
        raise HTTPException(401, "Canva authorization expired — reconnect Canva")
    tok = await asyncio.to_thread(_token_post, {"grant_type": "refresh_token", "refresh_token": refresh})
    await db.mkt_canva_tokens.update_one({"_id": CONNECTION_ID}, {"$set": {
        "access_token": encrypt_text(tok["access_token"]),
        "refresh_token": encrypt_text(tok.get("refresh_token", refresh)),  # rotate
        "expires_at": int(time.time()) + int(tok.get("expires_in", 14400)),
        "scope": tok.get("scope", doc.get("scope", SCOPES)),
    }})
    return tok["access_token"]


def _api_get(path: str, token: str, params: dict | None = None) -> dict:
    r = requests.get(f"{API_URL}{path}", headers={"Authorization": f"Bearer {token}"},
                     params=params or {}, timeout=40)
    if r.status_code >= 400:
        raise HTTPException(502, f"Canva API GET {path} failed ({r.status_code})")
    return r.json()


def _api_post(path: str, token: str, body: dict) -> dict:
    r = requests.post(f"{API_URL}{path}", headers={"Authorization": f"Bearer {token}"},
                      json=body, timeout=40)
    if r.status_code >= 400:
        raise HTTPException(502, f"Canva API POST {path} failed ({r.status_code}): {r.text[:200]}")
    return r.json()


# ------------------------------------------------------------------- models
class ExportIn(BaseModel):
    design_id: str = Field(min_length=1)
    campaign_id: str = Field(min_length=1)
    type: str = "png"                       # png | jpg | pdf | mp4
    pages: Optional[List[int]] = None
    target_platform: str = "all"
    content_topic: Optional[str] = ""
    alt_text: Optional[str] = ""
    video_quality: Optional[str] = None     # mp4 only


def build_mkt_canva_router() -> APIRouter:
    router = APIRouter(prefix="/mkt/canva", tags=["social-os-canva"])

    # ----------------------------------------------------------- connection
    @router.get("/status")
    async def status(admin: dict = Depends(require_super_or_ops)):
        configured = bool(os.environ.get("CANVA_CLIENT_ID") and os.environ.get("CANVA_CLIENT_SECRET"))
        doc = await db.mkt_canva_tokens.find_one({"_id": CONNECTION_ID})
        return {
            "configured": configured,
            "connected": bool(doc),
            "scope": (doc or {}).get("scope"),
            "connected_by": (doc or {}).get("connected_by"),
            "connected_at": (doc or {}).get("connected_at"),
            "expires_at": (doc or {}).get("expires_at"),
            "redirect_uri": _redirect_uri() if configured else None,
        }

    @router.get("/oauth/url")
    async def oauth_url(admin: dict = Depends(require_super_or_ops)):
        cid, _ = _client()
        state = secrets.token_urlsafe(32)
        verifier, challenge = _pkce()
        redirect = _redirect_uri()
        await db.mkt_canva_oauth_states.insert_one({
            "_id": state, "verifier": verifier, "redirect_uri": redirect,
            "admin_id": admin.get("id"), "admin_email": admin.get("email"),
            "created_at": time.time(),
        })
        q = urlencode({
            "code_challenge": challenge, "code_challenge_method": "S256",
            "scope": SCOPES, "response_type": "code", "client_id": cid,
            "state": state, "redirect_uri": redirect,
        })
        return {"url": f"{AUTH_URL}?{q}"}

    @router.get("/oauth/callback")
    async def oauth_callback(code: Optional[str] = None, state: Optional[str] = None,
                             error: Optional[str] = None):
        web = _web_origin()
        dest = f"{web}/admin/social-publishing"
        if error:
            return RedirectResponse(f"{dest}?canva=error")
        if not code or not state:
            return RedirectResponse(f"{dest}?canva=error")
        pending = await db.mkt_canva_oauth_states.find_one_and_delete({"_id": state})
        if not pending or time.time() - pending["created_at"] > 600:
            return RedirectResponse(f"{dest}?canva=expired")
        try:
            tok = await asyncio.to_thread(_token_post, {
                "grant_type": "authorization_code", "code": code,
                "code_verifier": pending["verifier"], "redirect_uri": pending["redirect_uri"],
            })
        except HTTPException:
            return RedirectResponse(f"{dest}?canva=error")
        await db.mkt_canva_tokens.update_one({"_id": CONNECTION_ID}, {"$set": {
            "access_token": encrypt_text(tok["access_token"]),
            "refresh_token": encrypt_text(tok.get("refresh_token")),
            "expires_at": int(time.time()) + int(tok.get("expires_in", 14400)),
            "scope": tok.get("scope", SCOPES),
            "connected_by": pending.get("admin_email"),
            "connected_at": int(time.time()),
        }}, upsert=True)
        return RedirectResponse(f"{dest}?canva=connected")

    @router.post("/disconnect")
    async def disconnect(admin: dict = Depends(require_super_or_ops)):
        await db.mkt_canva_tokens.delete_one({"_id": CONNECTION_ID})
        return {"ok": True}

    # ----------------------------------------------------------- designs
    @router.get("/designs")
    async def designs(query: Optional[str] = None, continuation: Optional[str] = None,
                      admin: dict = Depends(require_super_or_ops)):
        token = await _access_token()
        params: Dict[str, Any] = {}
        if query:
            params["query"] = query
        if continuation:
            params["continuation"] = continuation
        data = await asyncio.to_thread(_api_get, "/designs", token, params)
        items = []
        for d in data.get("items", []):
            thumb = (d.get("thumbnail") or {}).get("url")
            items.append({"id": d.get("id"), "title": d.get("title") or "(untitled)",
                          "thumbnail_url": thumb, "updated_at": d.get("updated_at")})
        return {"items": items, "continuation": data.get("continuation")}

    # ----------------------------------------------------------- export + ingest
    @router.post("/export")
    async def create_export(body: ExportIn, admin: dict = Depends(require_super_or_ops)):
        if body.type not in EXPORT_EXT:
            raise HTTPException(400, f"Unsupported export type. Allowed: {', '.join(EXPORT_EXT)}")
        token = await _access_token()
        fmt: Dict[str, Any] = {"type": body.type}
        if body.pages:
            fmt["pages"] = body.pages
        if body.type == "mp4":
            fmt["quality"] = body.video_quality or "horizontal_1080p"
        job = (await asyncio.to_thread(_api_post, "/exports", token,
                                       {"design_id": body.design_id, "format": fmt})).get("job") or {}
        await db.mkt_canva_exports.update_one({"_id": job.get("id")}, {"$set": {
            "_id": job.get("id"), "design_id": body.design_id, "campaign_id": _slug(body.campaign_id),
            "type": body.type, "target_platform": body.target_platform,
            "content_topic": body.content_topic or "", "alt_text": body.alt_text or "",
            "status": job.get("status"), "ingested": False, "asset_ids": [],
            "created_by": admin.get("email"), "created_at": int(time.time()),
        }}, upsert=True)
        return {"export_id": job.get("id"), "status": job.get("status")}

    @router.get("/export/{export_id}")
    async def export_status(export_id: str, admin: dict = Depends(require_super_or_ops)):
        rec = await db.mkt_canva_exports.find_one({"_id": export_id})
        if not rec:
            raise HTTPException(404, "Export not found")
        if rec.get("ingested"):
            return {"status": "success", "ingested": True, "asset_ids": rec.get("asset_ids", [])}
        token = await _access_token()
        job = (await asyncio.to_thread(_api_get, f"/exports/{export_id}", token)).get("job") or {}
        st = job.get("status")
        await db.mkt_canva_exports.update_one({"_id": export_id}, {"$set": {"status": st}})
        if st != "success":
            return {"status": st, "ingested": False}

        # success → download every URL immediately (Canva URLs expire ~24h) and ingest
        urls = job.get("urls") or []
        ext = EXPORT_EXT[rec["type"]]
        asset_ids: List[str] = []
        for idx, url in enumerate(urls):
            data = await asyncio.to_thread(_download, url)
            fname = f"{rec['design_id']}-p{idx + 1}.{ext}"
            doc = await _store_and_create(
                data=data, filename=fname, campaign_id=rec["campaign_id"],
                content_topic=rec.get("content_topic") or "", target_platform=rec.get("target_platform", "all"),
                alt_text=rec.get("alt_text") or "", carousel_order=idx,
                canva_design_id=rec["design_id"], content_type_hint=None, actor=admin,
            )
            asset_ids.append(doc["id"])
        await db.mkt_canva_exports.update_one({"_id": export_id}, {"$set": {
            "ingested": True, "asset_ids": asset_ids, "status": "success"}})
        return {"status": "success", "ingested": True, "asset_ids": asset_ids,
                "note": "Imported as DRAFT assets — approve them to publish."}

    return router


def _download(url: str) -> bytes:
    r = requests.get(url, timeout=120, allow_redirects=True)
    if r.status_code >= 400:
        raise HTTPException(502, f"Canva export download failed ({r.status_code})")
    return r.content
