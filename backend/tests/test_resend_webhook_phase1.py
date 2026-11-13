"""Phase 1 (Business OS) — Resend webhook signature + suppression unit tests.

Tests the Svix signature verifier directly and the suppression side-effects.
No real webhook is activated; the live handler stays inert (503) until
RESEND_WEBHOOK_SECRET is configured.
"""
from __future__ import annotations
import os
import time
import base64
import hmac
import hashlib
import uuid
import asyncio
import pytest
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from routes.resend_webhook import _verify_svix
from lib import email_governance as gov

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# A throwaway signing secret used only in this test file.
_RAW_KEY = base64.b64encode(b"phase1-test-signing-key-32bytes!").decode()
SECRET = "whsec_" + _RAW_KEY


def _sign(svix_id: str, ts: str, body: bytes) -> str:
    key = base64.b64decode(_RAW_KEY)
    signed = f"{svix_id}.{ts}.".encode() + body
    sig = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest()).decode()
    return f"v1,{sig}"


def test_valid_signature_passes():
    body = b'{"type":"email.delivered","data":{}}'
    sid = "msg_" + uuid.uuid4().hex
    ts = str(int(time.time()))
    headers = {"svix-id": sid, "svix-timestamp": ts, "svix-signature": _sign(sid, ts, body)}
    assert _verify_svix(SECRET, headers, body) is True


def test_invalid_signature_rejected():
    body = b'{"type":"email.delivered","data":{}}'
    sid = "msg_" + uuid.uuid4().hex
    ts = str(int(time.time()))
    headers = {"svix-id": sid, "svix-timestamp": ts, "svix-signature": "v1,not-the-right-signature"}
    assert _verify_svix(SECRET, headers, body) is False


def test_missing_headers_rejected():
    body = b"{}"
    assert _verify_svix(SECRET, {}, body) is False


def test_stale_timestamp_rejected():
    body = b"{}"
    sid = "msg_" + uuid.uuid4().hex
    ts = str(int(time.time()) - 4000)  # outside 5-min tolerance
    headers = {"svix-id": sid, "svix-timestamp": ts, "svix-signature": _sign(sid, ts, body)}
    assert _verify_svix(SECRET, headers, body) is False


def test_bounce_and_complaint_build_suppressions():
    async def body():
        db = AsyncIOMotorClient(MONGO_URL)[DB_NAME]
        em = f"test_wh_{uuid.uuid4().hex[:10]}@example.com"
        try:
            await gov.suppress(db, email=em, reason="bounce_permanent", permanent=True,
                               meta={"bounce_type": "hard"})
            assert await gov.is_suppressed(db, em) is True
            em2 = f"test_wh_{uuid.uuid4().hex[:10]}@example.com"
            await gov.suppress(db, email=em2, reason="bounce_transient", permanent=False)
            # A transient/soft bounce is NOT a permanent suppression.
            assert await gov.is_suppressed(db, em2) is False
            await db.email_suppressions.delete_many({"email_hash": gov.email_hash(em2)})
        finally:
            await db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})
    asyncio.get_event_loop().run_until_complete(body())
