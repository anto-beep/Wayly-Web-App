"""Emergent managed object storage wrapper for the Social OS marketing library.

All marketing media (PNG/JPG/MP4/PDF) is stored here, isolated from customer
statements/invoices/health data by the `wayly/social/...` key namespace. Emergent
storage has NO public/presigned URLs, so bytes are streamed back through our own
no-auth media route (see routes/mkt1.py `/api/mkt/media/...`). The DB is the source
of truth; this module only moves bytes.
"""
from __future__ import annotations

import os
import hashlib
import logging

import requests

logger = logging.getLogger(__name__)

_STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = _STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

APP_PREFIX = "wayly/social"  # every key lives under here — isolated from app data

_storage_key: str | None = None

MIME_BY_EXT = {
    "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
    "gif": "image/gif", "webp": "image/webp",
    "mp4": "video/mp4", "mov": "video/quicktime",
    "pdf": "application/pdf",
}

# what the marketing library accepts -> logical asset_type
EXT_TO_TYPE = {
    "png": "image", "jpg": "image", "jpeg": "image", "gif": "image", "webp": "image",
    "mp4": "video", "mov": "video",
    "pdf": "document",
}


def ext_of(filename: str) -> str:
    return (filename.rsplit(".", 1)[-1].lower() if "." in filename else "").strip()


def guess_content_type(filename: str, fallback: str | None = None) -> str:
    return MIME_BY_EXT.get(ext_of(filename), fallback or "application/octet-stream")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def init_storage(force: bool = False) -> str:
    global _storage_key
    if _storage_key and not force:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload bytes. Returns {"path","size","etag"}. Re-inits once on a dead key."""
    key = init_storage()
    url = f"{STORAGE_URL}/objects/{path}"
    resp = requests.put(url, headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=180)
    if resp.status_code == 404:  # cached key went inactive — mint a fresh one, retry once
        key = init_storage(force=True)
        resp = requests.put(url, headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=180)
    resp.raise_for_status()
    return resp.json()


def get_object(path: str) -> tuple[bytes, str]:
    """Download bytes. Returns (content, content_type). Re-inits once on a dead key."""
    key = init_storage()
    url = f"{STORAGE_URL}/objects/{path}"
    resp = requests.get(url, headers={"X-Storage-Key": key}, timeout=120)
    if resp.status_code == 404 and _storage_key:
        key = init_storage(force=True)
        resp = requests.get(url, headers={"X-Storage-Key": key}, timeout=120)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")
