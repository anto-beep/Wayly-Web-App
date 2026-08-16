"""Backend tests for Iteration 55 — Email verification (soft-block 7-day grace).

Covers:
- Signup writes email_verified=false + verification_deadline + Resend attempt
- Login during grace period succeeds (soft-block)
- GET /auth/verification-status returns proper shape
- POST /auth/send-verification-email + 60s cooldown (HTTP 429)
- GET /auth/verify-email?token=INVALID  → 302 invalid
- GET /auth/verify-email?token=<valid>  → 302 success + db side-effects
- Legacy user (cathy) login still works (grandfather migration)
- Past-deadline + unverified login → 403 email_verification_required
- Public POST /auth/resend-verification-email (200 always; anti-enum)
"""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Direct DB access (used for token lookup + deadline mutation, as per review_request)
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")
_mc = MongoClient(MONGO_URL)
_db = _mc[DB_NAME]


def _unique_email():
    return f"TEST_ev_{uuid.uuid4().hex[:10]}@example.com"


# Module-level fixture: signup a brand-new user once and reuse across tests
@pytest.fixture(scope="module")
def fresh_user():
    email = _unique_email()
    password = "StrongPass!2026"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "name": "Eva Verify",
        "role": "caregiver", "plan": "free",
    }, timeout=30)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data
    return {"email": email, "password": password, "token": data["token"], "user": data["user"]}


@pytest.fixture(scope="module")
def auth_headers(fresh_user):
    return {"Authorization": f"Bearer {fresh_user['token']}"}


# 1. Signup persists email_verified=false + deadline ~7 days + tries Resend
def test_signup_persists_verification_fields(fresh_user):
    user_row = _db.users.find_one({"email": fresh_user["email"].lower()})
    assert user_row is not None
    assert user_row.get("email_verified") is False
    deadline = user_row.get("verification_deadline")
    assert deadline, "verification_deadline missing"
    d = datetime.fromisoformat(deadline.replace("Z", "+00:00"))
    delta_days = (d - datetime.now(timezone.utc)).total_seconds() / 86400
    assert 6.5 <= delta_days <= 7.5, f"deadline not ~7d in future: {delta_days}d"
    # send_verification_email_for should have inserted a token row
    tok = _db.email_verification_tokens.find_one({"user_id": user_row["id"]})
    assert tok is not None, "no token row — send_verification_email_for not called"


# 2. Login during grace period succeeds
def test_login_during_grace_succeeds(fresh_user):
    r = requests.post(f"{API}/auth/login", json={
        "email": fresh_user["email"], "password": fresh_user["password"],
    }, timeout=20)
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body


# 3. GET /auth/verification-status shape
def test_verification_status_shape(auth_headers, fresh_user):
    r = requests.get(f"{API}/auth/verification-status", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["email"] == fresh_user["email"].lower()
    assert body["email_verified"] is False
    assert body["past_deadline"] is False
    assert body["grace_days"] == 7
    assert body["days_remaining"] in (6, 7)


# 4. POST /auth/send-verification-email then 2nd call within 60s → 429
def test_send_verification_then_cooldown(auth_headers):
    r1 = requests.post(f"{API}/auth/send-verification-email", headers=auth_headers, timeout=20)
    assert r1.status_code == 200, r1.text
    assert r1.json().get("ok") is True
    r2 = requests.post(f"{API}/auth/send-verification-email", headers=auth_headers, timeout=20)
    assert r2.status_code == 429, f"expected 429, got {r2.status_code} {r2.text}"
    detail = (r2.json().get("detail") or "").lower()
    assert "wait" in detail


# 5. Invalid token redirect
def test_verify_email_invalid_token():
    r = requests.get(f"{API}/auth/verify-email", params={"token": "totally-bogus-xyz"},
                     allow_redirects=False, timeout=20)
    assert r.status_code == 302
    loc = r.headers.get("location", "")
    assert "status=invalid" in loc, loc


# 6. Valid token → 302 success + user becomes verified
def test_verify_email_valid_token(fresh_user):
    user_row = _db.users.find_one({"email": fresh_user["email"].lower()})
    # Use most recent unused token (the cooldown test above triggered another send)
    tok = _db.email_verification_tokens.find_one(
        {"user_id": user_row["id"], "used": False},
        sort=[("created_at", -1)],
    )
    assert tok, "no unused token found"
    r = requests.get(f"{API}/auth/verify-email", params={"token": tok["token"]},
                     allow_redirects=False, timeout=20)
    assert r.status_code == 302, f"expected 302, got {r.status_code}"
    loc = r.headers.get("location", "")
    assert "status=success" in loc, loc
    # DB side-effects
    updated = _db.users.find_one({"id": user_row["id"]})
    assert updated.get("email_verified") is True
    assert updated.get("email_verified_at"), "email_verified_at not set"


# 7. Legacy user cathy — grandfathered, login normal
def test_cathy_legacy_login_no_verification_block():
    r = requests.post(f"{API}/auth/login", json={
        "email": "cathy@example.com", "password": "testpass123",
    }, timeout=20)
    assert r.status_code == 200, f"cathy login failed: {r.status_code} {r.text}"
    body = r.json()
    assert "token" in body
    # Check cathy's row is marked verified
    cathy = _db.users.find_one({"email": "cathy@example.com"})
    assert cathy is not None
    assert cathy.get("email_verified") is True, "cathy not grandfathered to verified"


# 8. Past-deadline + unverified → 403 email_verification_required
def test_past_deadline_blocks_login():
    email = _unique_email()
    password = "AnotherPass!2026"
    rs = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "name": "Past Due",
        "role": "caregiver", "plan": "free",
    }, timeout=30)
    assert rs.status_code in (200, 201), rs.text
    # Mutate the user to be unverified + past deadline
    past_iso = "2025-01-01T00:00:00+00:00"
    res = _db.users.update_one(
        {"email": email.lower()},
        {"$set": {"email_verified": False, "verification_deadline": past_iso}},
    )
    assert res.matched_count == 1
    r = requests.post(f"{API}/auth/login", json={
        "email": email, "password": password,
    }, timeout=20)
    assert r.status_code == 403, f"expected 403, got {r.status_code} {r.text}"
    detail = r.json().get("detail")
    # FastAPI keeps dict detail intact
    assert isinstance(detail, dict)
    assert detail.get("code") == "email_verification_required"
    return email  # not strictly needed


# 9. Public resend — always {ok:true}
def test_public_resend_existing_and_nonexistent():
    # nonexistent → ok:true (anti-enum)
    r = requests.post(f"{API}/auth/resend-verification-email",
                      json={"email": f"nonexistent_{uuid.uuid4().hex[:6]}@example.com"},
                      timeout=20)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # Now an existing past-deadline user
    email = _unique_email()
    password = "ResendPass!2026"
    requests.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "name": "Resend Past",
        "role": "caregiver", "plan": "free",
    }, timeout=30)
    _db.users.update_one(
        {"email": email.lower()},
        {"$set": {"email_verified": False, "verification_deadline": "2025-01-01T00:00:00+00:00"}},
    )
    r2 = requests.post(f"{API}/auth/resend-verification-email",
                       json={"email": email}, timeout=20)
    assert r2.status_code == 200, r2.text
    assert r2.json().get("ok") is True


# Teardown — wipe TEST_ev_ users
def teardown_module(module):
    try:
        _db.users.delete_many({"email": {"$regex": "^test_ev_", "$options": "i"}})
    except Exception:
        pass
