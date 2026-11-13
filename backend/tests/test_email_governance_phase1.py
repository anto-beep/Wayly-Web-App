"""Phase 1 (Business OS) — email governance unit tests.

Covers consent recording, signed unsubscribe tokens, suppression and the
central marketing eligibility gate. Runs in-process against the configured
Mongo using synthetic @example.com users; no email is ever sent.
"""
from __future__ import annotations
import os
import asyncio
import uuid
import pytest
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from lib import email_governance as gov

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _db():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _email():
    return f"test_gov_{uuid.uuid4().hex[:12]}@example.com"


# --------------------------- token round-trip ------------------------------
def test_token_roundtrip_and_tamper():
    uid = uuid.uuid4().hex
    em = _email()
    tok = gov.make_email_token(uid, em, "unsub")
    data = gov.verify_email_token(tok)
    assert data and data["u"] == uid and data["e"] == em and data["p"] == "unsub"
    # Tampered payload fails.
    bad = tok[:-2] + ("aa" if not tok.endswith("aa") else "bb")
    assert gov.verify_email_token(bad) is None
    assert gov.verify_email_token("garbage") is None
    assert gov.verify_email_token("") is None


# --------------------------- categories ------------------------------------
def test_categories_transactional_vs_marketing():
    assert gov.category_for("password_reset") == gov.TRANSACTIONAL
    assert gov.category_for("trial_reminder") == gov.TRANSACTIONAL
    assert gov.category_for("admin_campaign") == gov.MARKETING
    assert gov.is_marketing("onboarding_series") is True
    assert gov.is_marketing("email_verification") is False
    # Unknown template fails safe → marketing (gated).
    assert gov.category_for("brand_new_unknown_template") == gov.MARKETING


# --------------------------- consent + eligibility -------------------------
def test_consent_and_eligibility_matrix():
    async def body():
        db = _db()
        uid = uuid.uuid4().hex
        em = _email()
        await db.users.insert_one({"id": uid, "email": em, "name": "Gov Test",
                                   "created_at": datetime.now(timezone.utc).isoformat()})
        try:
            # No consent recorded → not eligible.
            ok, reason = await gov.can_send_marketing(db, email=em)
            assert ok is False and reason == "no_consent"

            # Opt in → eligible + audit event written.
            await gov.record_consent(db, user_id=uid, email=em, opted_in=True, source="test")
            u = await db.users.find_one({"id": uid}, {"_id": 0})
            assert u["marketing_consent"] is True and u["marketing_consent_source"] == "test"
            ev = await db.marketing_consent_events.find_one({"user_id": uid, "status": "opted_in"})
            assert ev is not None
            ok, reason = await gov.can_send_marketing(db, user=u)
            assert ok is True and reason == "ok"

            # Suppress (e.g. complaint) → blocked even with consent.
            await gov.suppress(db, email=em, reason="complaint", permanent=True)
            assert await gov.is_suppressed(db, em) is True
            ok, reason = await gov.can_send_marketing(db, user=u)
            assert ok is False and reason == "suppressed"

            # Deleted user → blocked.
            await db.users.update_one({"id": uid}, {"$set": {"deleted_at": "now"}})
            u2 = await db.users.find_one({"id": uid}, {"_id": 0})
            ok, reason = await gov.can_send_marketing(db, user=u2)
            assert ok is False and reason == "deleted"
        finally:
            await db.users.delete_many({"id": uid})
            await db.marketing_consent_events.delete_many({"user_id": uid})
            await db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})
    _run(body())


def test_optin_clears_unsubscribe_but_not_complaint():
    async def body():
        db = _db()
        uid = uuid.uuid4().hex
        em = _email()
        await db.users.insert_one({"id": uid, "email": em, "name": "X",
                                   "created_at": datetime.now(timezone.utc).isoformat()})
        try:
            await gov.suppress(db, email=em, reason="unsubscribe", permanent=True)
            await gov.suppress(db, email=em, reason="complaint", permanent=True)
            # Opting back in removes the unsubscribe tombstone only.
            await gov.record_consent(db, user_id=uid, email=em, opted_in=True, source="test")
            remaining = await db.email_suppressions.find(
                {"email_hash": gov.email_hash(em)}, {"_id": 0, "reason": 1}).to_list(10)
            reasons = {r["reason"] for r in remaining}
            assert "unsubscribe" not in reasons
            assert "complaint" in reasons  # hard complaint stays
        finally:
            await db.users.delete_many({"id": uid})
            await db.marketing_consent_events.delete_many({"user_id": uid})
            await db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})
    _run(body())
