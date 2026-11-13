"""Phase 1 (Business OS) — SECURITY & production-readiness hardening tests.

Covers the targeted review items:
  1. Keyed HMAC email identifiers (not plain SHA-256) + fail-closed behaviour.
  2. Account-deletion tombstone + correct re-consent semantics.
  3. Unsubscribe / preference token scoping, expiry/replay, GET-never-mutates,
     one-click opt-out, affirmative-only opt-in.
  4. Marketing eligibility re-checked immediately before sending (outbox).
  5. Central template classification (no promo masquerading as transactional).

All synthetic @example.com data; no email is ever sent.
"""
from __future__ import annotations
import os
import time
import json
import hmac
import hashlib
import asyncio
import uuid
import requests
import pytest
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from lib import email_governance as gov
from lib import email_outbox as ob

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-renderer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
_mc = MongoClient(MONGO_URL)
_db = _mc[DB_NAME]
PW = "StrongPass!2026x"


def _flush_signup_rate_limit():
    """Clear shared per-IP signup/login rate-limit buckets so these tests (which
    create several synthetic accounts) are deterministic and don't exhaust the
    IP quota for the environment. No-op if Redis is unreachable."""
    try:
        import redis as _redis_sync
        url = os.environ.get("REDIS_URL")
        if not url:
            return
        r = _redis_sync.from_url(url, socket_connect_timeout=1, socket_timeout=1)
        for pat in ("rl:signup_ip:*", "rl:signup_email:*", "rl:login_ip:*", "rl:login_email:*"):
            keys = list(r.scan_iter(pat))
            if keys:
                r.delete(*keys)
    except Exception:
        pass


@pytest.fixture(autouse=True)
def _reset_rl():
    _flush_signup_rate_limit()
    yield


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


def _adb():
    return AsyncIOMotorClient(MONGO_URL)[DB_NAME]


def _email():
    return f"test_sec_{uuid.uuid4().hex[:12]}@example.com"


def _cleanup(em):
    u = _db.users.find_one({"email": em}, {"id": 1})
    if u:
        _db.marketing_consent_events.delete_many({"user_id": u["id"]})
    _db.users.delete_many({"email": em})
    _db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})


# --------------------------------------------------------------------------
# 1. Keyed HMAC identifiers
# --------------------------------------------------------------------------
def test_email_hash_is_keyed_hmac_not_plain_sha256():
    em = "Case.Sensitive@Example.COM "
    norm = gov.normalize_email(em)
    assert norm == "case.sensitive@example.com"
    # It must NOT equal a bare SHA-256 of the normalised address.
    plain = hashlib.sha256(norm.encode()).hexdigest()
    assert gov.email_hash(em) != plain
    # It MUST equal the keyed HMAC computed independently with the same secret.
    secret = gov._email_hash_secret()
    expected = hmac.new(secret, norm.encode(), hashlib.sha256).hexdigest()
    assert gov.email_hash(em) == expected
    # Normalisation is consistent (different casing/spacing → same identifier).
    assert gov.email_hash(em) == gov.email_hash("case.sensitive@example.com")


def test_email_hash_fail_closed_when_secret_missing(monkeypatch):
    monkeypatch.delenv("EMAIL_HASH_SECRET", raising=False)
    assert gov.email_hash_available() is False
    with pytest.raises(gov.EmailHashSecretMissing):
        gov.email_hash("a@b.com")

    async def body():
        db = _adb()
        u = {"email": "a@b.com", "marketing_consent": True, "email_verified": True}
        # Consented, verified user, but we cannot compute the suppression
        # identifier → must FAIL CLOSED (do not send), not fall through to 'ok'.
        ok, reason = await gov.can_send_marketing(db, user=u, email="a@b.com")
        assert ok is False and reason == "hash_unavailable"
    _run(body())


# --------------------------------------------------------------------------
# 2. Deletion tombstone + re-consent semantics
# --------------------------------------------------------------------------
def test_reconsent_clears_optout_tombstones_but_never_hard_signals():
    async def body():
        db = _adb()
        uid = uuid.uuid4().hex
        em = _email()
        await db.users.insert_one({"id": uid, "email": em, "name": "X",
                                   "created_at": datetime.now(timezone.utc).isoformat()})
        try:
            # Simulate: user deleted (account_deleted tombstone), had unsubscribed,
            # AND had a spam complaint on file.
            await gov.suppress(db, email=em, reason="account_deleted", permanent=True)
            await gov.suppress(db, email=em, reason="unsubscribe", permanent=True)
            await gov.suppress(db, email=em, reason="complaint", permanent=True)
            # Explicit affirmative opt-in from a PROVEN-OWNERSHIP path
            # (clear_suppression=True — e.g. verified settings toggle or an
            # emailed prefs token) clears reversible tombstones only.
            await gov.record_consent(db, user_id=uid, email=em, opted_in=True,
                                     source="settings", clear_suppression=True)
            rows = await db.email_suppressions.find(
                {"email_hash": gov.email_hash(em)}, {"_id": 0, "reason": 1}).to_list(10)
            reasons = {r["reason"] for r in rows}
            assert "unsubscribe" not in reasons        # reversible opt-out cleared
            assert "account_deleted" not in reasons    # reversible opt-out cleared
            assert "complaint" in reasons              # hard signal NEVER cleared
        finally:
            await db.users.delete_many({"id": uid})
            await db.marketing_consent_events.delete_many({"user_id": uid})
            await db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})
    _run(body())


def test_recreation_without_consent_keeps_optout():
    async def body():
        db = _adb()
        em = _email()
        try:
            await gov.suppress(db, email=em, reason="account_deleted", permanent=True)
            # Opting OUT (or simply NOT consenting) must never clear the tombstone.
            await gov.record_consent(db, user_id=uuid.uuid4().hex, email=em,
                                     opted_in=False, source="settings")
            assert await gov.is_suppressed(db, em) is True
        finally:
            await db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})
            await db.marketing_consent_events.delete_many({"email_hash": gov.email_hash(em)})
    _run(body())


def test_deleted_account_recreate_then_explicit_consent_becomes_eligible():
    """Full lifecycle via live API: signup → delete (tombstone) → recreate
    WITHOUT consent (still suppressed) → recreate WITH consent (eligible)."""
    em = _email()
    try:
        # 1) create + opt in
        r = requests.post(f"{API}/auth/signup", json={"email": em, "password": PW,
                          "name": "Life Cycle", "role": "caregiver", "plan": "solo",
                          "marketing_consent": True}, timeout=30)
        assert r.status_code == 200, r.text
        u = _db.users.find_one({"email": em}, {"_id": 0})
        # 2) simulate deletion tombstone + remove the user row (hard delete for test)
        _run(gov.suppress(_adb(), email=em, reason="account_deleted", permanent=True))
        _db.users.delete_many({"email": em})
        _db.marketing_consent_events.delete_many({"user_id": u["id"]})
        # 3) recreate WITHOUT consent → tombstone remains, not eligible
        r2 = requests.post(f"{API}/auth/signup", json={"email": em, "password": PW,
                           "name": "Life Cycle", "role": "caregiver", "plan": "solo",
                           "marketing_consent": False}, timeout=30)
        assert r2.status_code == 200, r2.text
        u2 = _db.users.find_one({"email": em}, {"_id": 0})
        ok, reason = _run(gov.can_send_marketing(_adb(), user=u2))
        assert ok is False and reason in ("no_consent", "suppressed")
        # confirm the deletion tombstone survived recreation-without-consent
        assert _db.email_suppressions.find_one(
            {"email_hash": gov.email_hash(em), "reason": "account_deleted"}) is not None
        # 4) same user now EXPLICITLY opts in via authenticated toggle
        tok = requests.post(f"{API}/auth/login", json={"email": em, "password": PW},
                            timeout=30).json()["token"]
        pa = requests.patch(f"{API}/account/marketing-preferences",
                            json={"marketing_opted_in": True},
                            headers={"Authorization": f"Bearer {tok}"}, timeout=30)
        assert pa.status_code == 200
        u3 = _db.users.find_one({"email": em}, {"_id": 0})
        ok2, reason2 = _run(gov.can_send_marketing(_adb(), user=u3))
        assert ok2 is True and reason2 == "ok"   # legitimate re-consent works
    finally:
        _cleanup(em)


# --------------------------------------------------------------------------
# 3. Token scoping + expiry/replay + GET-never-mutates + affirmative opt-in
# --------------------------------------------------------------------------
def test_optin_rejects_unsub_token_and_stale_prefs_token():
    # An opt-OUT (unsub) token must never satisfy the opt-IN path.
    unsub = gov.make_email_token("u1", "a@b.com", "unsub")
    assert gov.verify_email_token(unsub, expected_purpose="prefs", max_age_days=30) is None
    # A fresh prefs token does.
    prefs = gov.make_email_token("u1", "a@b.com", "prefs")
    assert gov.verify_email_token(prefs, expected_purpose="prefs", max_age_days=30) is not None
    # A STALE prefs token (issued 40 days ago) is rejected for opt-in (replay).
    body = {"u": "u1", "e": "a@b.com", "p": "prefs", "iat": int(time.time()) - 40 * 86400}
    payload = gov._b64u(json.dumps(body, separators=(",", ":"), sort_keys=True).encode())
    sig = gov._b64u(hmac.new(gov._token_secret(), payload.encode(), hashlib.sha256).digest())
    stale = f"{payload}.{sig}"
    assert gov.verify_email_token(stale, expected_purpose="prefs", max_age_days=30) is None
    # …but the same stale token is still fine for opt-OUT (no age limit).
    assert gov.verify_email_token(stale) is not None


def test_api_optin_requires_prefs_token_optout_accepts_any():
    em = _email()
    try:
        r = requests.post(f"{API}/auth/signup", json={"email": em, "password": PW,
                          "name": "Tok Scope", "role": "caregiver", "plan": "solo",
                          "marketing_consent": True}, timeout=30)
        assert r.status_code == 200, r.text
        u = _db.users.find_one({"email": em}, {"_id": 0})
        unsub = gov.make_email_token(u["id"], em, "unsub")
        prefs = gov.make_email_token(u["id"], em, "prefs")
        # opt-IN with an unsub token → 403 (affirmative/prefs required)
        bad = requests.post(f"{API}/email/preferences",
                            json={"token": unsub, "marketing_opted_in": True}, timeout=30)
        assert bad.status_code == 403
        # opt-OUT with the unsub token → allowed
        out = requests.post(f"{API}/email/preferences",
                            json={"token": unsub, "marketing_opted_in": False}, timeout=30)
        assert out.status_code == 200 and out.json()["marketing_opted_in"] is False
        # opt-IN with a fresh prefs token → allowed (verified affirmative action)
        back = requests.post(f"{API}/email/preferences",
                             json={"token": prefs, "marketing_opted_in": True}, timeout=30)
        assert back.status_code == 200 and back.json()["marketing_opted_in"] is True
    finally:
        _cleanup(em)


def test_get_unsubscribe_never_mutates_post_one_click_opts_out():
    em = _email()
    try:
        requests.post(f"{API}/auth/signup", json={"email": em, "password": PW,
                      "name": "One Click", "role": "caregiver", "plan": "solo",
                      "marketing_consent": True}, timeout=30)
        u = _db.users.find_one({"email": em}, {"_id": 0})
        tok = gov.make_email_token(u["id"], em, "unsub")
        g = requests.get(f"{API}/email/unsubscribe", params={"token": tok}, timeout=30)
        assert g.status_code == 200
        assert _db.users.find_one({"email": em})["marketing_consent"] is True  # GET no-op
        # RFC 8058 one-click POST with the real List-Unsubscribe-Post body.
        p = requests.post(f"{API}/email/unsubscribe", params={"token": tok},
                          data={"List-Unsubscribe": "One-Click"}, timeout=30)
        assert p.status_code == 200
        assert _db.users.find_one({"email": em})["marketing_consent"] is False
        assert _db.email_suppressions.find_one(
            {"email_hash": gov.email_hash(em), "reason": "unsubscribe"}) is not None
    finally:
        _cleanup(em)


# --------------------------------------------------------------------------
# 4. Eligibility checked immediately before sending (outbox)
# --------------------------------------------------------------------------
def test_outbox_skips_marketing_when_ineligible_at_send():
    async def body():
        db = _adb()
        k = f"test_sec_outbox_{uuid.uuid4().hex}"
        em = _email()
        try:
            await db.email_outbox.delete_many({"dedupe_key": k})
            await ob.enqueue(db, dedupe_key=k, to=em, template="nurture",
                             subject="s", html="<p>x</p>", category="marketing")

            # send_fn that mirrors the production at-send gate: no consent recorded
            # for `em`, so eligibility fails → return skipped (never calls provider).
            async def _gated_send(msg):
                if msg.get("category") == "marketing":
                    ok, _r = await gov.can_send_marketing(db, email=msg["to"])
                    if not ok:
                        return {"ok": True, "skipped": True, "id": None, "ambiguous": False}
                return {"ok": True, "id": "should-not-happen", "ambiguous": False}

            res = await ob.process_once(db, _gated_send, limit=5)
            assert res["skipped"] == 1 and res["sent"] == 0
            doc = await db.email_outbox.find_one({"dedupe_key": k}, {"_id": 0})
            assert doc["status"] == "skipped" and doc["html"] is None
        finally:
            await db.email_outbox.delete_many({"dedupe_key": k})
            await db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})
    _run(body())


# --------------------------------------------------------------------------
# 5. Template classification — no promo can masquerade as transactional
# --------------------------------------------------------------------------
def test_transactional_templates_are_not_marketing():
    for t in ("email_verification", "password_reset", "billing_receipt",
              "failed_payment", "trial_reminder", "trial_expired", "security_alert",
              "welcome", "tool_result", "adviser_invite"):
        assert gov.is_marketing(t) is False, t
    for t in ("admin_campaign", "onboarding_series", "product_news", "nurture"):
        assert gov.is_marketing(t) is True, t
    # Unknown template fails safe → treated as MARKETING (gated), never bypasses.
    assert gov.is_marketing("totally_new_template_xyz") is True
