"""Phase E admin backend tests — Audit Log Export, Admin Sessions, Data Requests,
Feature Flags, System Health, Maintenance Mode, Admin Accounts CRUD, RBAC.
"""
import os
import secrets
import jwt
import pyotp
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = ""
with open("/app/frontend/.env") as f:
    for line in f:
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.strip().split("=", 1)[1].rstrip("/")
            break

ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASSWORD = "AdminPass!2026"
ADMIN2_EMAIL = "a.chiware2@gmail.com"
USER_EMAIL = "cathy@example.com"
USER_PASSWORD = "testpass123"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]

# Need JWT secret for synthesising support_admin token
from auth import JWT_SECRET, JWT_ALGORITHM  # noqa: E402


def _reset_admin_lock(email):
    _db.users.update_one({"email": email}, {"$set": {"failed_login_count": 0, "lockout_until": None}})


@pytest.fixture(scope="session")
def admin_token():
    _reset_admin_lock(ADMIN_EMAIL)
    u = _db.users.find_one({"email": ADMIN_EMAIL}, {"totp_secret": 1, "id": 1})
    secret = u and u.get("totp_secret")
    assert secret, "Admin TOTP secret missing"
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("requires_2fa"), data
    code = pyotp.TOTP(secret).now()
    r2 = requests.post(f"{BASE_URL}/api/admin/auth/2fa/verify",
                       json={"temp_token": data["temp_token"], "code": code})
    assert r2.status_code == 200, r2.text
    return r2.json()["token"]


@pytest.fixture(scope="session")
def admin_id():
    return _db.users.find_one({"email": ADMIN_EMAIL}, {"id": 1})["id"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def support_admin_token():
    """Synthesise a support_admin token by creating temp admin + session."""
    # Find any non-super admin; if none, create a TEST one
    target = _db.users.find_one({"admin_role": "support_admin"}, {"id": 1})
    if not target:
        uid = "TEST_support_" + secrets.token_urlsafe(6)
        _db.users.insert_one({
            "id": uid, "email": f"{uid}@example.com", "name": "TEST Support",
            "password_hash": "x", "role": "caregiver", "plan": "family",
            "is_admin": True, "admin_role": "support_admin",
            "totp_enabled": False, "created_at": datetime.now(timezone.utc).isoformat(),
        })
        user_id = uid
    else:
        user_id = target["id"]
    sid = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)
    _db.admin_sessions.insert_one({
        "id": sid, "user_id": user_id, "ip": "0.0.0.0", "ua": "pytest",
        "created_at": now.isoformat(), "last_activity": now.isoformat(),
        "expires_at_max": (now + timedelta(hours=12)).isoformat(),
        "revoked": False,
    })
    tok = jwt.encode({
        "sub": user_id, "type": "admin", "sid": sid, "role": "support_admin",
        "exp": now + timedelta(hours=12),
    }, JWT_SECRET, algorithm=JWT_ALGORITHM)
    return tok, user_id, sid


@pytest.fixture(scope="session")
def support_headers(support_admin_token):
    tok, _, _ = support_admin_token
    return {"Authorization": f"Bearer {tok}"}


_created = {"flags": [], "data_requests": [], "admins": [], "sessions": []}


@pytest.fixture(scope="session", autouse=True)
def cleanup(support_admin_token):
    yield
    _, uid, sid = support_admin_token
    _db.admin_sessions.delete_many({"id": sid})
    for n in _created["flags"]:
        _db.feature_flags.delete_many({"name": n})
    for rid in _created["data_requests"]:
        _db.data_requests.delete_many({"id": rid})
    for aid in _created["admins"]:
        _db.users.delete_many({"id": aid})
    for s in _created["sessions"]:
        _db.admin_sessions.delete_many({"id": s})
    # remove synthetic support admin if it was TEST_-prefixed
    _db.users.delete_many({"id": {"$regex": "^TEST_"}})
    # restore maintenance off
    _db.system_state.update_one(
        {"key": "maintenance_mode"}, {"$set": {"enabled": False}}, upsert=True
    )


# ---------- Audit Log Export ----------
class TestAuditExport:
    def test_export_csv(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/audit-log/export?days=30", headers=admin_headers)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        assert "attachment" in r.headers.get("content-disposition", "")
        body = r.text
        assert body.startswith("ts,actor_id,actor_email,action,target_id,ip,result,detail")
        lines = body.split("\n")
        assert len(lines) >= 2  # header + at least one event
        # column count
        assert len(lines[0].split(",")) == 8


# ---------- Admin Sessions ----------
class TestSessions:
    def test_list_sessions(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/sessions", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "sessions" in d and "active_count" in d and "total" in d
        assert d["active_count"] >= 1
        s = d["sessions"][0]
        assert "admin_email" in s and "admin_role" in s and "active" in s

    def test_revoke_non_super_forbidden(self, support_headers):
        r = requests.delete(f"{BASE_URL}/api/admin/sessions/dummy_sid", headers=support_headers)
        assert r.status_code == 403

    def test_revoke_session_flow(self, admin_headers):
        # Create a throwaway session for the admin to revoke
        sid = "TEST_sess_" + secrets.token_urlsafe(6)
        admin_uid = _db.users.find_one({"email": ADMIN_EMAIL})["id"]
        now = datetime.now(timezone.utc)
        tok = jwt.encode({"sub": admin_uid, "type": "admin", "sid": sid,
                          "role": "super_admin", "exp": now + timedelta(hours=12)},
                         JWT_SECRET, algorithm=JWT_ALGORITHM)
        _db.admin_sessions.insert_one({
            "id": sid, "user_id": admin_uid, "ip": "0", "ua": "pytest",
            "created_at": now.isoformat(), "last_activity": now.isoformat(),
            "expires_at_max": (now + timedelta(hours=12)).isoformat(),
            "revoked": False,
        })
        _created["sessions"].append(sid)
        # Verify works first
        r0 = requests.get(f"{BASE_URL}/api/admin/auth/me",
                          headers={"Authorization": f"Bearer {tok}"})
        assert r0.status_code == 200
        # Revoke
        r = requests.delete(f"{BASE_URL}/api/admin/sessions/{sid}", headers=admin_headers)
        assert r.status_code == 200
        # Now token should fail
        r2 = requests.get(f"{BASE_URL}/api/admin/auth/me",
                          headers={"Authorization": f"Bearer {tok}"})
        assert r2.status_code == 401


# ---------- Data Requests ----------
class TestDataRequests:
    def test_public_submit(self):
        r = requests.post(f"{BASE_URL}/api/public/data-request",
                          json={"user_email": "TEST_dr@example.com",
                                "request_type": "export",
                                "note": "TEST_ note"})
        assert r.status_code == 200, r.text
        rid = r.json()["request_id"]
        _created["data_requests"].append(rid)
        TestDataRequests.rid = rid

    def test_admin_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/data-requests", headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert any(x["id"] == TestDataRequests.rid for x in d["rows"])

    def test_update_pushes_history(self, admin_headers):
        rid = TestDataRequests.rid
        r = requests.put(f"{BASE_URL}/api/admin/data-requests/{rid}",
                         headers=admin_headers,
                         json={"status": "in_progress", "note": "TEST_ start"})
        assert r.status_code == 200
        rec = _db.data_requests.find_one({"id": rid})
        assert rec["status"] == "in_progress"
        assert len(rec.get("history") or []) >= 2

    def test_update_invalid_status(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/admin/data-requests/{TestDataRequests.rid}",
                         headers=admin_headers,
                         json={"status": "bogus"})
        assert r.status_code == 422


# ---------- Feature Flags ----------
class TestFlags:
    flag_name = "TEST_e2e_flag_" + secrets.token_hex(3)

    def test_create(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/feature-flags",
                          headers=admin_headers,
                          json={"name": self.flag_name, "description": "TEST",
                                "enabled": True, "rollout_percent": 25})
        assert r.status_code == 200, r.text
        _created["flags"].append(self.flag_name)
        assert r.json()["flag"]["name"] == self.flag_name

    def test_duplicate_name_400(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/feature-flags",
                          headers=admin_headers,
                          json={"name": self.flag_name, "description": "dup",
                                "enabled": False, "rollout_percent": 0})
        assert r.status_code == 400

    def test_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/feature-flags", headers=admin_headers)
        assert r.status_code == 200
        names = [f["name"] for f in r.json()["flags"]]
        assert self.flag_name in names

    def test_update_allowed_for_any_admin(self, support_headers):
        r = requests.put(f"{BASE_URL}/api/admin/feature-flags/{self.flag_name}",
                         headers=support_headers,
                         json={"name": self.flag_name, "description": "updated",
                               "enabled": False, "rollout_percent": 50})
        assert r.status_code == 200

    def test_create_forbidden_for_non_super(self, support_headers):
        r = requests.post(f"{BASE_URL}/api/admin/feature-flags",
                          headers=support_headers,
                          json={"name": "TEST_nosup", "description": "x",
                                "enabled": False, "rollout_percent": 0})
        assert r.status_code == 403

    def test_delete_forbidden_for_non_super(self, support_headers):
        r = requests.delete(f"{BASE_URL}/api/admin/feature-flags/{self.flag_name}",
                            headers=support_headers)
        assert r.status_code == 403

    def test_delete(self, admin_headers):
        r = requests.delete(f"{BASE_URL}/api/admin/feature-flags/{self.flag_name}",
                            headers=admin_headers)
        assert r.status_code == 200
        assert _db.feature_flags.find_one({"name": self.flag_name}) is None


# ---------- System Health ----------
def test_system_health(admin_headers):
    r = requests.get(f"{BASE_URL}/api/admin/system-health", headers=admin_headers)
    assert r.status_code == 200
    d = r.json()
    assert "services" in d and "counts" in d and "llm_errors_24h" in d and "maintenance_mode" in d
    names = [s["name"] for s in d["services"]]
    for n in ["MongoDB", "Stripe", "Emergent LLM", "Maintenance mode"]:
        assert any(n in x for x in names), f"missing {n} in {names}"
    assert any("Resend" in x for x in names)
    for k in ("users", "households", "support_tickets", "admin_sessions", "audit_events"):
        assert k in d["counts"]


# ---------- Maintenance Mode ----------
class TestMaintenance:
    def test_get(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/maintenance", headers=admin_headers)
        assert r.status_code == 200
        assert "enabled" in r.json()

    def test_post_non_super_forbidden(self, support_headers):
        r = requests.post(f"{BASE_URL}/api/admin/maintenance",
                          headers=support_headers,
                          json={"enabled": True, "message": "TEST_"})
        assert r.status_code == 403

    def test_toggle_and_public_reflects(self, admin_headers):
        # Enable
        r = requests.post(f"{BASE_URL}/api/admin/maintenance", headers=admin_headers,
                          json={"enabled": True, "message": "TEST_ down for a min"})
        assert r.status_code == 200
        # Public reflects
        rp = requests.get(f"{BASE_URL}/api/public/maintenance-status")
        assert rp.status_code == 200
        d = rp.json()
        assert d["enabled"] is True
        assert "TEST_" in (d.get("message") or "")
        # Disable
        r2 = requests.post(f"{BASE_URL}/api/admin/maintenance", headers=admin_headers,
                           json={"enabled": False, "message": ""})
        assert r2.status_code == 200
        rp2 = requests.get(f"{BASE_URL}/api/public/maintenance-status")
        assert rp2.json()["enabled"] is False


# ---------- Admin CRUD ----------
class TestAdminCRUD:
    def test_list_non_super_forbidden(self, support_headers):
        r = requests.get(f"{BASE_URL}/api/admin/admins", headers=support_headers)
        assert r.status_code == 403

    def test_list_admins(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/admins", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()["admins"]
        assert any(a["email"] == ADMIN_EMAIL for a in rows)
        # last_login_ts may be None for some
        for a in rows:
            assert "last_login_ts" in a

    def test_create_new_admin(self, admin_headers):
        email = f"TEST_newadmin_{secrets.token_hex(3)}@example.com"
        r = requests.post(f"{BASE_URL}/api/admin/admins", headers=admin_headers,
                          json={"email": email, "name": "TEST Admin",
                                "admin_role": "support_admin",
                                "temp_password": "TempPass1!2026"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["existing"] is False
        _created["admins"].append(d["user_id"])
        TestAdminCRUD.new_uid = d["user_id"]

    def test_create_existing_promotes(self, admin_headers):
        # Try with an existing user email (cathy)
        r = requests.post(f"{BASE_URL}/api/admin/admins", headers=admin_headers,
                          json={"email": USER_EMAIL, "name": "Cathy",
                                "admin_role": "support_admin",
                                "temp_password": "TempPass1!2026"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["existing"] is True
        # Cleanup: revert cathy back to non-admin
        _db.users.update_one({"email": USER_EMAIL},
                             {"$set": {"is_admin": False},
                              "$unset": {"admin_role": ""}})

    def test_update_role(self, admin_headers):
        r = requests.put(f"{BASE_URL}/api/admin/admins/{TestAdminCRUD.new_uid}/role",
                         headers=admin_headers, json={"admin_role": "content_admin"})
        assert r.status_code == 200
        rec = _db.users.find_one({"id": TestAdminCRUD.new_uid})
        assert rec["admin_role"] == "content_admin"

    def test_demote_self_400(self, admin_headers, admin_id):
        r = requests.put(f"{BASE_URL}/api/admin/admins/{admin_id}/role",
                         headers=admin_headers, json={"admin_role": "support_admin"})
        # Either 400 (self check) or 400 (2-super-min) — both fine
        assert r.status_code == 400

    def test_reset_2fa_self_400(self, admin_headers, admin_id):
        r = requests.post(f"{BASE_URL}/api/admin/admins/{admin_id}/reset-2fa",
                          headers=admin_headers)
        assert r.status_code == 400

    def test_reset_2fa_other(self, admin_headers):
        # Set fake totp first
        _db.users.update_one({"id": TestAdminCRUD.new_uid},
                             {"$set": {"totp_secret": "FAKE", "totp_enabled": True}})
        r = requests.post(f"{BASE_URL}/api/admin/admins/{TestAdminCRUD.new_uid}/reset-2fa",
                          headers=admin_headers)
        assert r.status_code == 200
        rec = _db.users.find_one({"id": TestAdminCRUD.new_uid})
        assert rec["totp_secret"] is None
        assert rec["totp_enabled"] is False

    def test_login_history(self, admin_headers, admin_id):
        r = requests.get(f"{BASE_URL}/api/admin/admins/{admin_id}/login-history",
                         headers=admin_headers)
        assert r.status_code == 200
        d = r.json()
        assert "events" in d and isinstance(d["events"], list)

    def test_delete_self_400(self, admin_headers, admin_id):
        r = requests.delete(f"{BASE_URL}/api/admin/admins/{admin_id}", headers=admin_headers)
        assert r.status_code == 400

    def test_delete_other(self, admin_headers):
        r = requests.delete(f"{BASE_URL}/api/admin/admins/{TestAdminCRUD.new_uid}",
                            headers=admin_headers)
        assert r.status_code == 200
        rec = _db.users.find_one({"id": TestAdminCRUD.new_uid})
        assert not rec.get("admin_role")


# ---------- RBAC gating quick spot ----------
def test_unauth_rejects():
    for p in ["/api/admin/sessions", "/api/admin/data-requests",
              "/api/admin/feature-flags", "/api/admin/system-health",
              "/api/admin/maintenance", "/api/admin/admins"]:
        r = requests.get(f"{BASE_URL}{p}")
        assert r.status_code in (401, 403), f"{p} -> {r.status_code}"
