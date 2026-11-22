"""Resend delivery webhook — delivery / bounce / complaint events.

Verifies the Svix signature Resend uses (`svix-id` / `svix-timestamp` /
`svix-signature`), deduplicates on the svix event id, and maintains the
suppression list so marketing can never be sent to a hard-bounced or
complained address again.

Phase 1: this handler is INERT in production until RESEND_WEBHOOK_SECRET is
configured and the endpoint is registered in the Resend dashboard — without
the secret it returns 503 and records nothing. Dashboard setup steps are in
the Phase 1 deliverables.

Privacy: we store only a one-way hash of the recipient address plus the
provider message id — never the body or plaintext email.
"""
from __future__ import annotations
import os
import time
import json
import hmac
import base64
import hashlib
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Request, HTTPException

from lib.email_governance import suppress, email_hash

log = logging.getLogger("wayly.resend_webhook")

resend_webhook_router = APIRouter(tags=["resend-webhook"])

_db = None


def init_resend_webhook(*, db):
    global _db
    _db = db


def _verify_svix(secret: str, headers, body: bytes) -> bool:
    svix_id = headers.get("svix-id") or headers.get("webhook-id")
    svix_ts = headers.get("svix-timestamp") or headers.get("webhook-timestamp")
    svix_sig = headers.get("svix-signature") or headers.get("webhook-signature")
    if not (svix_id and svix_ts and svix_sig):
        return False
    try:
        if abs(time.time() - int(svix_ts)) > 300:  # 5-minute tolerance
            return False
    except (TypeError, ValueError):
        return False
    sk = secret
    if sk.startswith("whsec_"):
        sk = sk[len("whsec_"):]
    try:
        key = base64.b64decode(sk)
    except Exception:
        key = sk.encode("utf-8")
    signed = f"{svix_id}.{svix_ts}.".encode("utf-8") + body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode("ascii")
    for part in svix_sig.split(" "):
        candidate = part.split(",", 1)[-1]
        if hmac.compare_digest(candidate, expected):
            return True
    return False


def _recipient(data: dict):
    to = data.get("to")
    if isinstance(to, list) and to:
        return to[0]
    if isinstance(to, str):
        return to
    return None


@resend_webhook_router.post("/webhook/resend")
async def resend_webhook(request: Request):
    secret = os.environ.get("RESEND_WEBHOOK_SECRET")
    if not secret:
        # Inert until configured (Phase 1: not activated in production).
        raise HTTPException(status_code=503, detail="Resend webhook not configured")

    body = await request.body()
    if not _verify_svix(secret, request.headers, body):
        raise HTTPException(status_code=400, detail="invalid signature")

    try:
        event = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="invalid payload")

    svix_id = request.headers.get("svix-id") or request.headers.get("webhook-id")
    etype = event.get("type") or ""
    data = event.get("data") or {}

    # Idempotency / dedupe on the svix event id.
    if _db is not None and svix_id:
        prior = await _db.resend_webhook_events.find_one({"id": svix_id})
        if prior and prior.get("processed_at"):
            return {"received": True, "duplicate": True}
        await _db.resend_webhook_events.update_one(
            {"id": svix_id},
            {"$setOnInsert": {"id": svix_id, "type": etype,
                              "created_at": datetime.now(timezone.utc).isoformat()}},
            upsert=True,
        )

    to = _recipient(data)
    if _db is not None and to:
        if etype == "email.bounced":
            btype = ((data.get("bounce") or {}).get("type") or "").lower()
            permanent = btype not in ("transient", "soft", "undetermined", "")
            await suppress(_db, email=to,
                           reason="bounce_permanent" if permanent else "bounce_transient",
                           permanent=permanent, meta={"bounce_type": btype})
        elif etype == "email.complained":
            await suppress(_db, email=to, reason="complaint", permanent=True, meta={})
        # Minimal, de-identified delivery record.
        await _db.email_delivery_events.insert_one({
            "id": uuid.uuid4().hex,
            "svix_id": svix_id,
            "type": etype,
            "email_hash": email_hash(to),
            "provider_message_id": data.get("email_id") or data.get("id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    if _db is not None and svix_id:
        await _db.resend_webhook_events.update_one(
            {"id": svix_id},
            {"$set": {"processed_at": datetime.now(timezone.utc).isoformat()}},
        )
    return {"received": True, "type": etype}
