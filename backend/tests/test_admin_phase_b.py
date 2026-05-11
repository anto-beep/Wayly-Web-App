"""Phase B admin backend tests — overview, activity, llm-cost-trend, user profile,
notes, suspend/reinstate, extend-trial, impersonate, refund, audit-log."""
import os
import time
import pyotp
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to internal frontend env value resolution
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.strip().split("=", 1)[1].rstrip("/")
                break

ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASSWORD = "AdminPass!2026"
USER_EMAIL = "cathy@example.com"
USER_PASSWORD = "testpass123"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

_mongo = MongoClient(MONGO_URL)
_db = _mongo[DB_NAME]


def _get_totp_secret():
    u = _db.users.find_one({"email": ADMIN_EMAIL}, {"totp_secret": 1})
    return u and u.get("totp_secret")


def _reset_admin_lock():
    _db.users.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {"failed_login_count": 0, "lockout_until": None}},
    )


@pytest.fixture(scope="session")
def admin_token():
    _reset_admin_lock()
    secret = _get_totp_secret()
    assert secret, "Admin TOTP secret missing — admin must have 2FA enabled"
    r = requests.post(f"{BASE_URL}/api/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data.get("requires_2fa"), f"Expected requires_2fa, got {data}"
    code = pyotp.TOTP(secret).now()
    r2 = requests.post(f"{BASE_URL}/api/admin/auth/2fa/verify",
                       json={"temp_token": data["temp_token"], "code": code})
    assert r2.status_code == 200, f"2FA verify failed: {r2.text}"
    return r2.json()["token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def admin_id():
    u = _db.users.find_one({"email": ADMIN_EMAIL}, {"id": 1})
    return u["id"]


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.status_code} {r.text}")
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def target_user_id():
    u = _db.users.find_one({"email": USER_EMAIL}, {"id": 1})
    assert u, "Target user cathy@example.com missing"
    return u["id"]


# =================== OVERVIEW ===================

class TestOverview:
    def test_overview_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/overview", headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("total_users", "signups_today", "paid_subscribers",
                    "active_trials", "mrr_aud", "statements_today",
                    "churn_30d", "open_tickets"):
            assert key in d["cards"], f"cards missing {key}"
        for key in ("llm_cost_today_aud", "llm_cost_month_aud", "llm_calls_today",
                    "llm_errors_today", "decoder_runs_24h", "decoder_avg_ms",
                    "decoder_success_rate_pct"):
            assert key in d["ai_health"], f"ai_health missing {key}"
        assert "plans" in d and "subscriptions" in d
        assert isinstance(d["cards"]["total_users"], int)
        assert isinstance(d["cards"]["mrr_aud"], (int, float))

    def test_overview_unauth(self):
        r = requests.get(f"{BASE_URL}/api/admin/overview")
        assert r.status_code == 401

    def test_overview_regular_user_rejected(self, user_token):
        r = requests.get(f"{BASE_URL}/api/admin/overview",
                         headers={"Authorization": f"Bearer {user_token}"})
        assert r.status_code == 401


# =================== ACTIVITY ===================

class TestActivity:
    def test_activity_returns_events(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/activity?limit=10",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "events" in d
        assert isinstance(d["events"], list)
        assert len(d["events"]) <= 10
        for ev in d["events"]:
            assert "kind" in ev and "ts" in ev and "summary" in ev
            assert "color" in ev

    def test_activity_unauth(self):
        r = requests.get(f"{BASE_URL}/api/admin/activity")
        assert r.status_code == 401


# =================== LLM COST TREND ===================

class TestLlmCostTrend:
    def test_trend_shape(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/llm-cost-trend?days=30",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "days" in d and isinstance(d["days"], list)
        for row in d["days"]:
            assert "date" in row and "cost_aud" in row
            assert "calls" in row and "errors" in row


# =================== AUDIT LOG ===================

class TestAuditLog:
    def test_audit_log_default(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/audit-log",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "events" in d and "total" in d
        assert isinstance(d["events"], list)


# =================== USER PROFILE ===================

class TestUserProfile:
    def test_profile_returns_all_sections(self, admin_headers, target_user_id):
        r = requests.get(f"{BASE_URL}/api/admin/users/{target_user_id}/profile",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        for key in ("user", "subscription", "household", "statements",
                    "payments", "llm_usage", "audit_events", "notes", "sessions"):
            assert key in d, f"missing {key}"
        assert d["user"]["id"] == target_user_id
        assert "password_hash" not in d["user"]

    def test_profile_unknown_user(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/users/nonexistent_id/profile",
                         headers=admin_headers)
        assert r.status_code == 404


# =================== NOTES ===================

class TestNotes:
    @pytest.fixture(autouse=True)
    def _cleanup(self, target_user_id):
        yield
        _db.admin_user_notes.delete_many({"target_user_id": target_user_id,
                                          "text": {"$regex": "^TEST_"}})

    def test_add_note(self, admin_headers, target_user_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/notes",
                          headers=admin_headers,
                          json={"text": "TEST_phaseb note 1"})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["note"]["text"] == "TEST_phaseb note 1"
        # GET
        r2 = requests.get(f"{BASE_URL}/api/admin/users/{target_user_id}/notes",
                          headers=admin_headers)
        assert r2.status_code == 200
        texts = [n["text"] for n in r2.json()["notes"]]
        assert "TEST_phaseb note 1" in texts

    def test_add_empty_note_400(self, admin_headers, target_user_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/notes",
                          headers=admin_headers, json={"text": "  "})
        assert r.status_code == 400

    def test_add_long_note_400(self, admin_headers, target_user_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/notes",
                          headers=admin_headers, json={"text": "TEST_" + ("x" * 5100)})
        assert r.status_code == 400


# =================== SUSPEND / REINSTATE ===================

class TestSuspend:
    @pytest.fixture(autouse=True)
    def _cleanup(self, target_user_id, admin_headers):
        yield
        # Always reinstate
        requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/reinstate",
                      headers=admin_headers)

    def test_suspend_then_reinstate(self, admin_headers, target_user_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/suspend",
                          headers=admin_headers, json={"reason": "TEST_phaseb"})
        assert r.status_code == 200, r.text
        u = _db.users.find_one({"id": target_user_id})
        assert u.get("suspended") is True
        r2 = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/reinstate",
                           headers=admin_headers)
        assert r2.status_code == 200
        u2 = _db.users.find_one({"id": target_user_id})
        assert u2.get("suspended") is False

    def test_cant_suspend_self(self, admin_headers, admin_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{admin_id}/suspend",
                          headers=admin_headers, json={"reason": "x"})
        assert r.status_code == 400


# =================== EXTEND TRIAL ===================

class TestExtendTrial:
    def test_extend_trial_invalid_days(self, admin_headers, target_user_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/extend-trial",
                          headers=admin_headers, json={"days": 0})
        assert r.status_code == 400
        r2 = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/extend-trial",
                           headers=admin_headers, json={"days": 100})
        assert r2.status_code == 400

    def test_extend_trial_no_sub_404(self, admin_headers):
        # Create a temporary user with no subscription
        import uuid
        tmp_id = "TEST_" + uuid.uuid4().hex[:8]
        _db.users.insert_one({"id": tmp_id, "email": f"tmp_{tmp_id}@example.com",
                              "name": "tmp", "created_at": datetime.now(timezone.utc).isoformat()})
        try:
            r = requests.post(f"{BASE_URL}/api/admin/users/{tmp_id}/extend-trial",
                              headers=admin_headers, json={"days": 7})
            assert r.status_code == 404
        finally:
            _db.users.delete_one({"id": tmp_id})

    def test_extend_trial_success(self, admin_headers, target_user_id):
        # Ensure subscription exists
        existing = _db.subscriptions.find_one({"user_id": target_user_id})
        created = False
        if not existing:
            _db.subscriptions.insert_one({
                "user_id": target_user_id,
                "status": "trialing",
                "plan": "family",
                "trial_ends_at": datetime.now(timezone.utc).isoformat(),
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            created = True
        try:
            before = _db.subscriptions.find_one({"user_id": target_user_id})
            r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/extend-trial",
                              headers=admin_headers, json={"days": 7})
            assert r.status_code == 200, r.text
            after_iso = r.json()["trial_ends_at"]
            after_dt = datetime.fromisoformat(after_iso)
            # Should be roughly 7 days from now (or 7 days from prior trial end if future)
            now = datetime.now(timezone.utc)
            delta = (after_dt - now).total_seconds()
            assert 6 * 86400 - 60 <= delta <= 8 * 86400 + 60, f"delta {delta}"
        finally:
            if created:
                _db.subscriptions.delete_one({"user_id": target_user_id})


# =================== IMPERSONATE ===================

class TestImpersonate:
    def test_impersonate_returns_token(self, admin_headers, target_user_id, admin_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/impersonate",
                          headers=admin_headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "token" in d and d["expires_in_minutes"] == 60
        assert d["target_email"] == USER_EMAIL
        # Decode the JWT
        import jwt
        decoded = jwt.decode(d["token"], options={"verify_signature": False})
        assert decoded["type"] == "impersonation"
        assert decoded["sub"] == target_user_id
        assert decoded["impersonator_id"] == admin_id
        # Audit entry exists
        ev = _db.admin_audit.find_one({"actor_id": admin_id,
                                       "action": "impersonation_start",
                                       "target_id": target_user_id})
        assert ev is not None

    def test_impersonate_unknown_user(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/users/nonexistent/impersonate",
                          headers=admin_headers)
        assert r.status_code == 404


# =================== REFUND ===================

class TestRefund:
    def test_refund_unknown_txn(self, admin_headers, target_user_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/refund",
                          headers=admin_headers,
                          json={"session_id": "nonexistent_xxx", "amount": 1.0})
        assert r.status_code == 404

    def test_refund_missing_fields(self, admin_headers, target_user_id):
        r = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/refund",
                          headers=admin_headers, json={})
        assert r.status_code == 400

    def test_refund_workflow(self, admin_headers, target_user_id):
        # Seed a paid + unpaid txn
        import uuid
        sid_paid = "TEST_sess_" + uuid.uuid4().hex[:8]
        sid_unpaid = "TEST_sess_" + uuid.uuid4().hex[:8]
        _db.payment_transactions.insert_many([
            {"session_id": sid_paid, "user_id": target_user_id, "amount": 39.0,
             "currency": "AUD", "plan": "family", "payment_status": "paid",
             "ts": datetime.now(timezone.utc).isoformat()},
            {"session_id": sid_unpaid, "user_id": target_user_id, "amount": 39.0,
             "currency": "AUD", "plan": "family", "payment_status": "initiated",
             "ts": datetime.now(timezone.utc).isoformat()},
        ])
        try:
            # Refund > original
            r1 = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/refund",
                               headers=admin_headers,
                               json={"session_id": sid_paid, "amount": 100.0})
            assert r1.status_code == 400, r1.text

            # Refund unpaid txn
            r2 = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/refund",
                               headers=admin_headers,
                               json={"session_id": sid_unpaid, "amount": 10.0})
            assert r2.status_code == 400, r2.text

            # Valid refund
            r3 = requests.post(f"{BASE_URL}/api/admin/users/{target_user_id}/refund",
                               headers=admin_headers,
                               json={"session_id": sid_paid, "amount": 10.0,
                                     "reason": "TEST_phaseb"})
            assert r3.status_code == 200, r3.text
            assert r3.json()["refund"]["status"] == "pending_stripe"
        finally:
            _db.payment_transactions.delete_many({"session_id": {"$in": [sid_paid, sid_unpaid]}})
            _db.refunds.delete_many({"session_id": {"$in": [sid_paid, sid_unpaid]}})


# =================== AUTHZ — all endpoints reject non-admin & unauth ===================

@pytest.mark.parametrize("path", [
    "/api/admin/overview",
    "/api/admin/activity",
    "/api/admin/llm-cost-trend",
    "/api/admin/audit-log",
])
def test_phaseb_unauthenticated(path):
    r = requests.get(f"{BASE_URL}{path}")
    assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"


@pytest.mark.parametrize("path", [
    "/api/admin/overview",
    "/api/admin/activity",
])
def test_phaseb_user_token_rejected(user_token, path):
    r = requests.get(f"{BASE_URL}{path}",
                     headers={"Authorization": f"Bearer {user_token}"})
    assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"
