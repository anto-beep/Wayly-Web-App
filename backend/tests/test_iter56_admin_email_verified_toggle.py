"""Iter 56 — Admin "test mode" toggle for users.email_verified.

Covers:
- PUT /api/admin/users/{user_id}/email-verified   (admin-only)
- 401 without admin auth
- 404 for unknown user
- Sets email_verified=true + email_verified_at + admin_verified_by + audit row
- Flipping back to false clears email_verified_at and writes a second audit row

Admin auth strategy: TOTP is friction in CI, so we mint an admin JWT directly
using the backend's own ADMIN_JWT_SECRET + a freshly inserted admin_sessions row
(same shape as the real /admin/auth/2fa/verify path). The admin's id is taken
from the seeded super_admin `hello@techglove.com.au`.
"""
import os
import sys
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta

# Make backend importable
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv
load_dotenv("/app/backend/.env")

from pymongo import MongoClient
import jwt as _jwt  # PyJWT

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
ADMIN_JWT_SECRET = os.environ["ADMIN_JWT_SECRET"]
JWT_ALGORITHM = os.environ.get("JWT_ALGORITHM", "HS256")

_mc = MongoClient(MONGO_URL)
_db = _mc[DB_NAME]


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


@pytest.fixture(scope="module")
def admin_token():
    """Mint a valid admin JWT bound to the seeded super_admin."""
    admin_row = _db.users.find_one({"email": "hello@techglove.com.au"})
    assert admin_row, "super_admin seed missing"
    # Make sure admin_role is set (in case legacy is_admin only)
    if not admin_row.get("admin_role"):
        _db.users.update_one({"id": admin_row["id"]}, {"$set": {"admin_role": "super_admin"}})

    sid = uuid.uuid4().hex
    now = _now()
    _db.admin_sessions.insert_one({
        "id": sid,
        "user_id": admin_row["id"],
        "ip": "127.0.0.1",
        "ua": "pytest",
        "created_at": _iso(now),
        "last_activity": _iso(now),
        "expires_at_max": _iso(now + timedelta(hours=12)),
        "revoked": False,
    })
    payload = {
        "sub": admin_row["id"],
        "type": "admin",
        "sid": sid,
        "role": admin_row.get("admin_role", "super_admin"),
        "exp": now + timedelta(hours=12),
    }
    token = _jwt.encode(payload, ADMIN_JWT_SECRET, algorithm=JWT_ALGORITHM)
    if isinstance(token, bytes):
        token = token.decode()
    return {"token": token, "admin_id": admin_row["id"], "sid": sid}


@pytest.fixture(scope="module")
def target_user():
    """Create a throwaway non-admin user for the toggle tests."""
    email = f"TEST_iter56_{uuid.uuid4().hex[:8]}@example.com"
    password = "TogglePass!2026"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": password, "name": "Toggle Tester",
        "role": "caregiver", "plan": "free",
    }, timeout=30)
    assert r.status_code in (200, 201), f"signup failed: {r.text}"
    row = _db.users.find_one({"email": email.lower()})
    assert row is not None
    yield {"id": row["id"], "email": email.lower()}
    # teardown
    _db.users.delete_one({"id": row["id"]})
    _db.audit_events.delete_many({"target": row["id"]})


def _auth_headers(tok):
    return {"Authorization": f"Bearer {tok['token']}"}


# 1. Unauthenticated → 401
def test_endpoint_requires_admin_auth(target_user):
    r = requests.put(
        f"{API}/admin/users/{target_user['id']}/email-verified",
        json={"email_verified": True}, timeout=20,
    )
    assert r.status_code == 401, f"expected 401, got {r.status_code} {r.text}"


# 2. Unknown user → 404
def test_unknown_user_returns_404(admin_token):
    r = requests.put(
        f"{API}/admin/users/does-not-exist-xyz/email-verified",
        json={"email_verified": True},
        headers=_auth_headers(admin_token), timeout=20,
    )
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"


# 3. Flip → True: side-effects landed
def test_flip_to_true_sets_flag_and_writes_audit(admin_token, target_user):
    before_count = _db.audit_events.count_documents({
        "target": target_user["id"], "action": "admin_toggle_email_verified",
    })
    r = requests.put(
        f"{API}/admin/users/{target_user['id']}/email-verified",
        json={"email_verified": True},
        headers=_auth_headers(admin_token), timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("email_verified") is True

    updated = _db.users.find_one({"id": target_user["id"]})
    assert updated.get("email_verified") is True
    assert updated.get("email_verified_at"), "email_verified_at not stamped"
    assert updated.get("admin_verified_by") == admin_token["admin_id"], (
        f"admin_verified_by mismatch: {updated.get('admin_verified_by')}"
    )

    after_count = _db.audit_events.count_documents({
        "target": target_user["id"], "action": "admin_toggle_email_verified",
    })
    assert after_count == before_count + 1, "audit row not written on TRUE flip"
    # Most recent should mention True
    last = _db.audit_events.find_one(
        {"target": target_user["id"], "action": "admin_toggle_email_verified"},
        sort=[("at", -1)],
    )
    assert last is not None
    assert "True" in (last.get("detail") or "")
    assert last.get("actor_id") == admin_token["admin_id"]


# 4. Flip → False: clears email_verified_at + writes another audit
def test_flip_to_false_clears_and_writes_audit(admin_token, target_user):
    before_count = _db.audit_events.count_documents({
        "target": target_user["id"], "action": "admin_toggle_email_verified",
    })
    r = requests.put(
        f"{API}/admin/users/{target_user['id']}/email-verified",
        json={"email_verified": False},
        headers=_auth_headers(admin_token), timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("ok") is True
    assert body.get("email_verified") is False

    updated = _db.users.find_one({"id": target_user["id"]})
    assert updated.get("email_verified") is False
    assert updated.get("email_verified_at") is None, (
        f"email_verified_at should be None after flip-back, got {updated.get('email_verified_at')}"
    )
    after_count = _db.audit_events.count_documents({
        "target": target_user["id"], "action": "admin_toggle_email_verified",
    })
    assert after_count == before_count + 1, "audit row not written on FALSE flip"


# 5. Idempotent same-value PUT still returns 200
def test_idempotent_same_value(admin_token, target_user):
    r1 = requests.put(
        f"{API}/admin/users/{target_user['id']}/email-verified",
        json={"email_verified": True},
        headers=_auth_headers(admin_token), timeout=20,
    )
    r2 = requests.put(
        f"{API}/admin/users/{target_user['id']}/email-verified",
        json={"email_verified": True},
        headers=_auth_headers(admin_token), timeout=20,
    )
    assert r1.status_code == 200 and r2.status_code == 200
    updated = _db.users.find_one({"id": target_user["id"]})
    assert updated.get("email_verified") is True


def teardown_module(module):
    try:
        _db.users.delete_many({"email": {"$regex": "^test_iter56_", "$options": "i"}})
    except Exception:
        pass
