"""Phase 1 (Business OS) — lifecycle email outbox unit tests.

Exercises de-duplication, atomic claiming, retry/backoff, max-attempt death,
ambiguous-provider handling, stale-claim recovery and concurrency — all with a
MOCKED send function, so no email is ever sent.
"""
from __future__ import annotations
import os
import asyncio
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from lib import email_outbox as ob

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _db():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _key():
    return f"test_outbox_{uuid.uuid4().hex}"


async def _cleanup(db, keys):
    await db.email_outbox.delete_many({"dedupe_key": {"$in": keys}})


def _ok_send(capture=None):
    async def _fn(msg):
        if capture is not None:
            capture.append(msg["idempotency_key"])
        return {"ok": True, "id": "re_" + uuid.uuid4().hex[:8], "ambiguous": False}
    return _fn


def _fail_send(ambiguous=False):
    async def _fn(msg):
        return {"ok": False, "id": None, "ambiguous": ambiguous, "error": "boom"}
    return _fn


def test_enqueue_is_duplicate_safe():
    async def body():
        db = _db()
        k = _key()
        try:
            r1 = await ob.enqueue(db, dedupe_key=k, to="a@example.com",
                                  template="nurture", subject="s", html="<p>x</p>")
            r2 = await ob.enqueue(db, dedupe_key=k, to="a@example.com",
                                  template="nurture", subject="s", html="<p>x</p>")
            assert r1["enqueued"] is True and r2["enqueued"] is False
            count = await db.email_outbox.count_documents({"dedupe_key": k})
            assert count == 1
        finally:
            await _cleanup(db, [k])
    _run(body())


def test_process_once_success_clears_body_and_passes_idempotency_key():
    async def body():
        db = _db()
        k = _key()
        seen = []
        try:
            await ob.enqueue(db, dedupe_key=k, to="a@example.com", template="nurture",
                             subject="s", html="<p>secret body</p>", idempotency_key=k)
            res = await ob.process_once(db, _ok_send(seen), limit=10)
            assert res["sent"] == 1
            doc = await db.email_outbox.find_one({"dedupe_key": k}, {"_id": 0})
            assert doc["status"] == "sent"
            assert doc["html"] is None            # body dropped on success
            assert doc["provider_message_id"]
            assert seen == [k]                    # idempotency key forwarded to send
        finally:
            await _cleanup(db, [k])
    _run(body())


def test_failure_retries_with_backoff_then_dies():
    async def body():
        db = _db()
        k = _key()
        try:
            await ob.enqueue(db, dedupe_key=k, to="a@example.com", template="nurture",
                             subject="s", html="<p>x</p>", max_attempts=2)
            # First failure → back to pending with a future next_attempt_at.
            r1 = await ob.process_once(db, _fail_send(), limit=10)
            assert r1["retried"] == 1
            doc = await db.email_outbox.find_one({"dedupe_key": k}, {"_id": 0})
            assert doc["status"] == "pending" and doc["attempts"] == 1
            assert doc["next_attempt_at"] > datetime.now(timezone.utc).isoformat()
            # It is not due yet, so a second pass claims nothing.
            r_none = await ob.process_once(db, _fail_send(), limit=10)
            assert r_none["claimed"] == 0
            # Force it due, fail again → attempts hit max → dead.
            await db.email_outbox.update_one(
                {"dedupe_key": k},
                {"$set": {"next_attempt_at": datetime.now(timezone.utc).isoformat()}})
            r2 = await ob.process_once(db, _fail_send(), limit=10)
            assert r2["dead"] == 1
            doc = await db.email_outbox.find_one({"dedupe_key": k}, {"_id": 0})
            assert doc["status"] == "dead" and doc["attempts"] == 2
        finally:
            await _cleanup(db, [k])
    _run(body())


def test_ambiguous_response_is_retried_not_duplicated():
    async def body():
        db = _db()
        k = _key()
        try:
            await ob.enqueue(db, dedupe_key=k, to="a@example.com", template="nurture",
                             subject="s", html="<p>x</p>", max_attempts=5)
            # Ambiguous (timeout) → safe to retry because the same idempotency
            # key is reused on the next attempt; never creates a second row.
            res = await ob.process_once(db, _fail_send(ambiguous=True), limit=10)
            assert res["retried"] == 1
            assert await db.email_outbox.count_documents({"dedupe_key": k}) == 1
            doc = await db.email_outbox.find_one({"dedupe_key": k}, {"_id": 0})
            assert doc["status"] == "pending" and doc["idempotency_key"] == k
        finally:
            await _cleanup(db, [k])
    _run(body())


def test_claim_is_atomic_and_recovers_stale():
    async def body():
        db = _db()
        k = _key()
        try:
            await ob.enqueue(db, dedupe_key=k, to="a@example.com", template="nurture",
                             subject="s", html="<p>x</p>")
            # Claim once → a second immediate claim finds nothing (not stale yet).
            m1 = await ob._claim_one(db, "worker-A")
            assert m1 and m1["dedupe_key"] == k and m1["status"] == "claimed"
            m2 = await ob._claim_one(db, "worker-B")
            assert m2 is None  # worker-B cannot steal worker-A's fresh claim
            # Simulate worker-A crashing: age the claim past the stale window.
            old = (datetime.now(timezone.utc) - timedelta(seconds=ob.STALE_CLAIM_SECONDS + 60)).isoformat()
            await db.email_outbox.update_one({"dedupe_key": k}, {"$set": {"claimed_at": old}})
            m3 = await ob._claim_one(db, "worker-B")
            assert m3 and m3["claim_owner"] == "worker-B"  # recovered interrupted work
        finally:
            await _cleanup(db, [k])
    _run(body())


def test_worker_disabled_by_default():
    # Phase 1 safety: the background worker must not auto-run in preview.
    assert ob.worker_enabled() is False
