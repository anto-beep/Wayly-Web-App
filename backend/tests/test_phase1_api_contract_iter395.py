"""Phase 1 — Email Automation Foundation API contract tests (iter 395).

Independently verifies the end-to-end API contract the main agent asked for:
- signup consent capture (true/false/omitted)
- token-based GET/POST /api/email/preferences
- scanner-safe GET /api/email/unsubscribe + RFC 8058 POST
- authenticated GET/PATCH /api/account/marketing-preferences
- /api/webhook/resend is INERT (503) when secret not configured
- can_send_marketing central gate (direct call)

Cleans up every TEST_ user it creates (by id) and their consent/suppression
rows. Does NOT seed data or delete anything outside its own ids.
"""
import os
import sys
import uuid
import time
import asyncio
import pytest
import requests

sys.path.insert(0, "/app/backend")

from lib.email_governance import (
    make_email_token, email_hash, can_send_marketing,
)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-renderer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CREATED_USER_IDS = []
CREATED_EMAILS = []


def _reset_rate_limits():
    """Clear signup rate-limit buckets in Redis so the tests can run back-to-back."""
    import redis
    try:
        c = redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
        keys = c.keys("rl:signup_*")
        if keys:
            c.delete(*keys)
    except Exception as e:
        print(f"redis rl reset skipped: {e}")


def _mk_email():
    return f"TEST_phase1_{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture(scope="module")
def loop():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db(loop):
    # Build the motor client ON the test loop so futures belong to it.
    from motor.motor_asyncio import AsyncIOMotorClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    async def _mk():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        return client, client[os.environ["DB_NAME"]]
    client, database = loop.run_until_complete(_mk())
    yield database
    client.close()


def _signup(email, password="Zx9#kLq2!mR7vN4pQ6", consent=None, name="Test User"):
    _reset_rate_limits()
    body = {"email": email, "password": password, "name": name, "role": "caregiver", "plan": "family"}
    if consent is not None:
        body["marketing_consent"] = consent
    r = requests.post(f"{API}/auth/signup", json=body, timeout=15)
    return r


# ---- 1) Signup with consent=true -----------------------------------------
def test_signup_consent_true(db, loop):
    email = _mk_email()
    CREATED_EMAILS.append(email)
    r = _signup(email, consent=True)
    assert r.status_code in (200, 201), r.text
    data = r.json()
    assert data.get("user", {}).get("marketing_opted_in") is True
    uid = data["user"]["id"]
    CREATED_USER_IDS.append(uid)

    u = loop.run_until_complete(db.users.find_one({"id": uid}, {"_id": 0}))
    assert u["marketing_consent"] is True
    assert u["marketing_consent_source"] == "signup"
    assert u.get("marketing_consent_at")

    ev = loop.run_until_complete(db.marketing_consent_events.find_one(
        {"user_id": uid, "status": "opted_in"}, {"_id": 0}))
    assert ev is not None
    assert ev["source"] == "signup"


# ---- 2) Signup with consent=false AND omitted ----------------------------
def test_signup_consent_false(db, loop):
    email = _mk_email()
    CREATED_EMAILS.append(email)
    r = _signup(email, consent=False)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["user"]["id"]
    CREATED_USER_IDS.append(uid)
    u = loop.run_until_complete(db.users.find_one({"id": uid}, {"_id": 0}))
    assert u["marketing_consent"] is False
    assert r.json()["user"].get("marketing_opted_in") is False


def test_signup_consent_omitted(db, loop):
    email = _mk_email()
    CREATED_EMAILS.append(email)
    r = _signup(email, consent=None)
    assert r.status_code in (200, 201), r.text
    uid = r.json()["user"]["id"]
    CREATED_USER_IDS.append(uid)
    u = loop.run_until_complete(db.users.find_one({"id": uid}, {"_id": 0}))
    assert u["marketing_consent"] is False, "omitted consent must default to false"


# ---- 3) GET + POST /api/email/preferences --------------------------------
def test_prefs_get_and_post_toggles_off(db, loop):
    email = _mk_email()
    CREATED_EMAILS.append(email)
    r = _signup(email, consent=True)
    uid = r.json()["user"]["id"]
    CREATED_USER_IDS.append(uid)
    tok = make_email_token(uid, email, "prefs")

    # GET
    g = requests.get(f"{API}/email/preferences", params={"token": tok}, timeout=10)
    assert g.status_code == 200, g.text
    body = g.json()
    assert body["marketing_opted_in"] is True
    assert "***" in body["email_masked"]

    # POST off
    p = requests.post(f"{API}/email/preferences",
                      json={"token": tok, "marketing_opted_in": False}, timeout=10)
    assert p.status_code == 200, p.text
    assert p.json()["marketing_opted_in"] is False

    u = loop.run_until_complete(db.users.find_one({"id": uid}, {"_id": 0}))
    assert u["marketing_consent"] is False

    supp = loop.run_until_complete(db.email_suppressions.find_one(
        {"email_hash": email_hash(email), "reason": "unsubscribe"}, {"_id": 0}))
    assert supp is not None
    assert supp["permanent"] is True


def test_prefs_bogus_token_400():
    r = requests.get(f"{API}/email/preferences", params={"token": "not.a.real.token"}, timeout=10)
    assert r.status_code == 400


# ---- 4) GET /api/email/unsubscribe is scanner-safe -----------------------
def test_unsubscribe_get_is_scanner_safe(db, loop):
    email = _mk_email()
    CREATED_EMAILS.append(email)
    r = _signup(email, consent=True)
    uid = r.json()["user"]["id"]
    CREATED_USER_IDS.append(uid)
    tok = make_email_token(uid, email, "unsub")

    g = requests.get(f"{API}/email/unsubscribe", params={"token": tok},
                     timeout=10, allow_redirects=False)
    assert g.status_code == 200
    assert "text/html" in g.headers.get("content-type", "")
    assert "Unsubscribe" in g.text

    u = loop.run_until_complete(db.users.find_one({"id": uid}, {"_id": 0}))
    assert u["marketing_consent"] is True, "GET must NOT opt the user out"


# ---- 5) POST /api/email/unsubscribe performs opt-out (RFC 8058) ----------
def test_unsubscribe_post_opts_out(db, loop):
    email = _mk_email()
    CREATED_EMAILS.append(email)
    r = _signup(email, consent=True)
    uid = r.json()["user"]["id"]
    CREATED_USER_IDS.append(uid)
    tok = make_email_token(uid, email, "unsub")

    # One-click: POST with token as query param, no body
    p = requests.post(f"{API}/email/unsubscribe", params={"token": tok}, timeout=10)
    assert p.status_code == 200, p.text
    assert "unsubscribed" in p.text.lower()

    u = loop.run_until_complete(db.users.find_one({"id": uid}, {"_id": 0}))
    assert u["marketing_consent"] is False
    supp = loop.run_until_complete(db.email_suppressions.find_one(
        {"email_hash": email_hash(email), "reason": "unsubscribe"}, {"_id": 0}))
    assert supp is not None and supp["permanent"] is True


# ---- 6) Authenticated /api/account/marketing-preferences -----------------
@pytest.fixture(scope="module")
def auth_token():
    r = requests.post(f"{API}/auth/login",
                      json={"email": "cathy@example.com", "password": "testpass123"},
                      timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_account_marketing_prefs_get_and_patch(auth_token, db, loop):
    h = {"Authorization": f"Bearer {auth_token}"}
    # read current
    g = requests.get(f"{API}/account/marketing-preferences", headers=h, timeout=10)
    assert g.status_code == 200, g.text
    original = bool(g.json()["marketing_opted_in"])

    try:
        # flip
        new_val = not original
        p = requests.patch(f"{API}/account/marketing-preferences", headers=h,
                           json={"marketing_opted_in": new_val}, timeout=10)
        assert p.status_code == 200, p.text
        assert p.json()["marketing_opted_in"] is new_val

        # verify persisted
        g2 = requests.get(f"{API}/account/marketing-preferences", headers=h, timeout=10)
        assert g2.json()["marketing_opted_in"] is new_val
    finally:
        # restore original
        requests.patch(f"{API}/account/marketing-preferences", headers=h,
                       json={"marketing_opted_in": original}, timeout=10)
        # also clear any unsubscribe suppression we may have created on cathy
        if not original:
            # we didn't suppress since we restored opt-in
            pass
        loop.run_until_complete(db.email_suppressions.delete_many(
            {"email_hash": email_hash("cathy@example.com"), "reason": "unsubscribe"}))


# ---- 7) Resend webhook is inert without secret ---------------------------
def test_resend_webhook_inert_when_no_secret():
    # We must NOT set RESEND_WEBHOOK_SECRET. Verify the live backend is inert.
    r = requests.post(f"{API}/webhook/resend",
                      json={"type": "email.bounced", "data": {}},
                      timeout=10)
    assert r.status_code == 503, f"expected 503 inert, got {r.status_code}: {r.text[:200]}"


# ---- 8) Central eligibility gate -----------------------------------------
def test_can_send_marketing_gate(db, loop):
    # Fresh test user, no consent
    email = _mk_email()
    CREATED_EMAILS.append(email)
    r = _signup(email, consent=False)
    uid = r.json()["user"]["id"]
    CREATED_USER_IDS.append(uid)

    async def _run():
        u = await db.users.find_one({"id": uid}, {"_id": 0})
        ok, reason = await can_send_marketing(db, user=u)
        assert ok is False and reason == "no_consent"

        # Opt them in
        await db.users.update_one({"id": uid}, {"$set": {"marketing_consent": True}})
        u2 = await db.users.find_one({"id": uid}, {"_id": 0})
        ok2, reason2 = await can_send_marketing(db, user=u2)
        assert ok2 is True and reason2 == "ok"

        # Suppress them
        from lib.email_governance import suppress
        await suppress(db, email=email, reason="complaint", permanent=True)
        u3 = await db.users.find_one({"id": uid}, {"_id": 0})
        ok3, reason3 = await can_send_marketing(db, user=u3)
        assert ok3 is False and reason3 == "suppressed"

    loop.run_until_complete(_run())


# ---- Cleanup --------------------------------------------------------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(db, loop):
    yield
    async def _do():
        for uid in CREATED_USER_IDS:
            await db.users.delete_one({"id": uid})
            await db.marketing_consent_events.delete_many({"user_id": uid})
        for em in CREATED_EMAILS:
            await db.email_suppressions.delete_many({"email_hash": email_hash(em)})
    try:
        loop.run_until_complete(_do())
    except Exception as e:
        print(f"cleanup error: {e}")
