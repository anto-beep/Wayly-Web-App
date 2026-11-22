"""Duplicate-safe lifecycle email outbox (MongoDB-backed).

Delivery guarantee: AT-LEAST-ONCE with strong de-duplication — NOT
exactly-once. A unique `dedupe_key` stops the same logical message being
enqueued twice, and the Resend Idempotency-Key makes a retry after an
ambiguous provider response (e.g. a network timeout AFTER Resend already
accepted the message) safe at the provider. We deliberately do not claim
exactly-once across MongoDB + Resend.

Message lifecycle:  pending → claimed → sent
                                     ↘ (retry, backoff) → pending
                                     ↘ (attempts exhausted) → dead

Concurrency: `_claim_one` uses an atomic find-and-modify so two workers never
process the same row. Interrupted work (a worker that claimed a row then
crashed) is recovered when its claim goes stale.

Privacy: failures are logged WITHOUT the email body; the html body is dropped
from the row on terminal success to minimise retention of message content.
"""
from __future__ import annotations
import os
import uuid
import socket
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Callable, Awaitable, Dict, Any

from pymongo import ReturnDocument

log = logging.getLogger("wayly.email_outbox")

MAX_ATTEMPTS = int(os.environ.get("EMAIL_OUTBOX_MAX_ATTEMPTS", "6"))
STALE_CLAIM_SECONDS = int(os.environ.get("EMAIL_OUTBOX_STALE_SECONDS", "300"))
BACKOFF_BASE_SECONDS = int(os.environ.get("EMAIL_OUTBOX_BACKOFF_BASE", "60"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _backoff_seconds(attempts: int) -> int:
    """Exponential backoff: 60s, 120s, 240s, ... capped at 6 hours."""
    return min(BACKOFF_BASE_SECONDS * (2 ** max(0, attempts - 1)), 6 * 3600)


async def ensure_indexes(db) -> None:
    await db.email_outbox.create_index("dedupe_key", unique=True)
    await db.email_outbox.create_index([("status", 1), ("next_attempt_at", 1)])


async def enqueue(db, *, dedupe_key: str, to: str, template: str, subject: str,
                  html: str, category: Optional[str] = None,
                  headers: Optional[dict] = None,
                  idempotency_key: Optional[str] = None,
                  max_attempts: int = MAX_ATTEMPTS) -> dict:
    """Insert the message iff its `dedupe_key` is unseen. Duplicate-safe via an
    upsert + $setOnInsert, so concurrent enqueues of the same key create
    exactly one row. Returns {enqueued: bool, dedupe_key, id}."""
    now = _now()
    doc = {
        "id": uuid.uuid4().hex,
        "dedupe_key": dedupe_key,
        "to": to,
        "template": template,
        "category": category,
        "subject": subject,
        "html": html,
        "headers": headers or {},
        "idempotency_key": idempotency_key or dedupe_key,
        "status": "pending",
        "attempts": 0,
        "max_attempts": max_attempts,
        "next_attempt_at": now.isoformat(),
        "claimed_at": None,
        "claim_owner": None,
        "provider_message_id": None,
        "last_error": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    res = await db.email_outbox.update_one(
        {"dedupe_key": dedupe_key}, {"$setOnInsert": doc}, upsert=True)
    enqueued = res.upserted_id is not None
    return {"enqueued": enqueued, "dedupe_key": dedupe_key,
            "id": doc["id"] if enqueued else None}


async def _claim_one(db, owner: str) -> Optional[dict]:
    """Atomically claim the next due message, OR recover a stale claim left by
    an interrupted worker. Returns the claimed doc or None."""
    now = _now()
    stale_cutoff = (now - timedelta(seconds=STALE_CLAIM_SECONDS)).isoformat()
    return await db.email_outbox.find_one_and_update(
        {"$or": [
            {"status": "pending", "next_attempt_at": {"$lte": now.isoformat()}},
            {"status": "claimed", "claimed_at": {"$lte": stale_cutoff}},
        ]},
        {"$set": {"status": "claimed", "claim_owner": owner,
                  "claimed_at": now.isoformat(), "updated_at": now.isoformat()}},
        sort=[("next_attempt_at", 1)],
        return_document=ReturnDocument.AFTER,
    )


SendFn = Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]


async def process_once(db, send_fn: SendFn, *, limit: int = 25,
                       owner: Optional[str] = None) -> dict:
    """Claim and attempt up to `limit` due messages.

    `send_fn(msg)` MUST return a dict {ok: bool, id: str|None,
    ambiguous: bool, error: str|None} and MUST NOT raise. It should pass
    msg['idempotency_key'] to Resend so an ambiguous retry is duplicate-safe.
    """
    owner = owner or f"{socket.gethostname()}:{uuid.uuid4().hex[:8]}"
    sent = failed = retried = dead = claimed = skipped = 0
    while claimed < limit:
        msg = await _claim_one(db, owner)
        if not msg:
            break
        claimed += 1
        attempts = (msg.get("attempts") or 0) + 1
        now = _now()
        try:
            result = await send_fn(msg)
        except Exception as e:  # defensive — send_fn is contracted not to raise
            result = {"ok": False, "ambiguous": False, "error": str(e)[:300], "id": None}

        # Eligibility gate (marketing) decided this message must NOT go out →
        # terminal 'skipped' (not sent, not retried, body dropped).
        if result.get("skipped"):
            await db.email_outbox.update_one({"id": msg["id"]}, {"$set": {
                "status": "skipped", "attempts": attempts, "html": None,
                "skipped_at": now.isoformat(), "updated_at": now.isoformat(),
                "claim_owner": None, "last_error": None,
            }})
            skipped += 1
            continue

        if result.get("ok"):
            await db.email_outbox.update_one({"id": msg["id"]}, {"$set": {
                "status": "sent", "attempts": attempts,
                "provider_message_id": result.get("id"),
                "html": None,  # drop the body on success (minimise retention)
                "sent_at": now.isoformat(), "updated_at": now.isoformat(),
                "claim_owner": None, "last_error": None,
            }})
            sent += 1
            continue

        err = (result.get("error") or "send_failed")[:300]
        if attempts >= msg.get("max_attempts", MAX_ATTEMPTS):
            await db.email_outbox.update_one({"id": msg["id"]}, {"$set": {
                "status": "dead", "attempts": attempts, "last_error": err,
                "updated_at": now.isoformat(), "claim_owner": None,
            }})
            dead += 1
            # Never logs the html body — only template + error.
            log.warning("email_outbox message dead after %s attempts (template=%s): %s",
                        attempts, msg.get("template"), err)
        else:
            nxt = (now + timedelta(seconds=_backoff_seconds(attempts))).isoformat()
            await db.email_outbox.update_one({"id": msg["id"]}, {"$set": {
                "status": "pending", "attempts": attempts, "last_error": err,
                "next_attempt_at": nxt, "updated_at": now.isoformat(),
                "claim_owner": None, "claimed_at": None,
            }})
            retried += 1
        failed += 1
    return {"claimed": claimed, "sent": sent, "failed": failed,
            "retried": retried, "dead": dead, "skipped": skipped}


def worker_enabled() -> bool:
    """The background worker is OFF by default so Phase 1 (no live producers)
    never sends in preview. Enable post-approval with EMAIL_OUTBOX_WORKER_ENABLED=1."""
    return os.environ.get("EMAIL_OUTBOX_WORKER_ENABLED", "").lower() in ("1", "true", "yes")
