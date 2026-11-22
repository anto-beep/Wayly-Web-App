"""Phase C admin backend tests — Decoder Log, Anomaly Log, Tool Stats,
Subscriptions, Failed Payments, Refunds (list + mark-processed), MRR Trend."""
import os
import pyotp
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
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


def _reset_admin_lock():
    _db.users.update_one(
        {"email": ADMIN_EMAIL},
        {"$set": {"failed_login_count": 0, "lockout_until": None}},
    )


@pytest.fixture(scope="session")
def admin_token():
    _reset_admin_lock()
    u = _db.users.find_one({"email": ADMIN_EMAIL}, {"totp_secret": 1})
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
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def user_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": USER_EMAIL, "password": USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"User login failed: {r.text}")
    j = r.json()
    return j.get("token") or j.get("access_token")


# --------------------- AUTH GATING ---------------------

class TestAuthGating:
    """All Phase C endpoints must reject unauthenticated + regular-user tokens."""

    ENDPOINTS = [
        ("GET", "/api/admin/decoder-log"),
        ("GET", "/api/admin/anomaly-log"),
        ("GET", "/api/admin/tool-stats"),
        ("GET", "/api/admin/subscriptions?status=active"),
        ("GET", "/api/admin/failed-payments"),
        ("GET", "/api/admin/refunds"),
        ("GET", "/api/admin/mrr-trend?months=12"),
    ]

    @pytest.mark.parametrize("method,path", ENDPOINTS)
    def test_unauth_rejected(self, method, path):
        r = requests.request(method, f"{BASE_URL}{path}")
        assert r.status_code in (401, 403), f"{path} -> {r.status_code}"

    @pytest.mark.parametrize("method,path", ENDPOINTS)
    def test_user_jwt_rejected(self, method, path, user_token):
        r = requests.request(method, f"{BASE_URL}{path}",
                             headers={"Authorization": f"Bearer {user_token}"})
        assert r.status_code in (401, 403), f"{path} -> {r.status_code}"


# --------------------- DECODER LOG ---------------------

class TestDecoderLog:
    def test_list_paginated(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/decoder-log?page=1&page_size=25",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data and "total" in data
        assert isinstance(data["rows"], list)
        for row in data["rows"]:
            # Forbidden heavy fields
            assert "file_b64" not in row
            assert "raw_text" not in row
            assert "audit" not in row
            assert "line_items" not in row
            # Required summary fields
            assert "anomaly_summary" in row
            assert set(["high", "medium", "low", "total"]).issubset(row["anomaly_summary"].keys())
            assert "line_items_count" in row

    def test_detail_404(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/decoder-log/__no_such_id__",
                         headers=admin_headers)
        assert r.status_code == 404

    def test_detail_full(self, admin_headers):
        # Pick first available statement
        listing = requests.get(f"{BASE_URL}/api/admin/decoder-log?page=1&page_size=1",
                               headers=admin_headers).json()
        if not listing.get("rows"):
            pytest.skip("No statements in DB")
        sid = listing["rows"][0]["id"]
        r = requests.get(f"{BASE_URL}/api/admin/decoder-log/{sid}", headers=admin_headers)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "statement" in body and "llm_calls" in body
        assert isinstance(body["llm_calls"], list)
        assert len(body["llm_calls"]) <= 10


# --------------------- ANOMALY LOG ---------------------

class TestAnomalyLog:
    def test_unwound_rows_with_stats(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/anomaly-log", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data and "stats_30d" in data
        stats = data["stats_30d"]
        assert "by_severity" in stats and "total_impact_aud" in stats
        for k in ("HIGH", "MEDIUM", "LOW"):
            assert k in stats["by_severity"]
        for row in data["rows"]:
            assert "severity" in row
            assert "headline" in row or row.get("headline") is None
            # category and dollar_impact keys must exist (may be null)
            assert "category" in row
            assert "dollar_impact" in row

    def test_severity_filter_high(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/anomaly-log?severity=HIGH",
                         headers=admin_headers)
        assert r.status_code == 200
        for row in r.json()["rows"]:
            assert row["severity"] == "HIGH"


# --------------------- TOOL STATS ---------------------

class TestToolStats:
    def test_three_buckets(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/tool-stats", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("today", "week", "month"):
            assert k in data
            assert isinstance(data[k], dict)
            for tool, stats in data[k].items():
                for f in ("calls", "cost_aud", "errors", "avg_ms"):
                    assert f in stats, f"missing {f} in {tool}"


# --------------------- SUBSCRIPTIONS ---------------------

class TestSubscriptions:
    def test_active(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/subscriptions?status=active",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data and "total" in data
        for s in data["rows"]:
            assert s.get("status") == "active"
            # enrichment fields may be None if user not found, but key should appear if user exists
            assert "user_id" in s

    def test_trialing(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/subscriptions?status=trialing",
                         headers=admin_headers)
        assert r.status_code == 200, r.text
        for s in r.json()["rows"]:
            assert s.get("status") == "trialing"


# --------------------- FAILED PAYMENTS ---------------------

class TestFailedPayments:
    def test_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/failed-payments", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data and isinstance(data["rows"], list)
        for row in data["rows"]:
            assert row.get("payment_status") == "failed"


# --------------------- REFUNDS ---------------------

class TestRefunds:
    def test_list(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/refunds", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "rows" in data

    def test_mark_processed_flow(self, admin_headers):
        # Seed a pending refund directly in db so we can flip
        import secrets, time
        rid = "TEST_" + secrets.token_urlsafe(6)
        _db.refunds.insert_one({
            "id": rid,
            "ts": "2026-01-01T00:00:00+00:00",
            "user_id": "test-user-phasec",
            "amount_aud": 12.34,
            "reason": "test_marker",
            "status": "pending_stripe",
            "processed_by": "test",
            "processed_by_email": "test@example.com",
        })
        try:
            r = requests.post(f"{BASE_URL}/api/admin/refunds/{rid}/mark-processed",
                              headers=admin_headers)
            assert r.status_code == 200, r.text
            assert r.json().get("ok") is True
            doc = _db.refunds.find_one({"id": rid})
            assert doc["status"] == "processed"

            # Second call should 404 because no longer pending_stripe
            r2 = requests.post(f"{BASE_URL}/api/admin/refunds/{rid}/mark-processed",
                               headers=admin_headers)
            assert r2.status_code == 404
        finally:
            _db.refunds.delete_one({"id": rid})

    def test_mark_processed_unknown_404(self, admin_headers):
        r = requests.post(f"{BASE_URL}/api/admin/refunds/__no_such_refund__/mark-processed",
                          headers=admin_headers)
        assert r.status_code == 404


# --------------------- MRR TREND ---------------------

class TestMrrTrend:
    def test_default_12(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/mrr-trend?months=12", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "points" in data
        assert len(data["points"]) == 12
        for p in data["points"]:
            assert "label" in p and "mrr_aud" in p and "date" in p
            assert isinstance(p["mrr_aud"], (int, float))

    def test_clamp_200_to_36(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/mrr-trend?months=200", headers=admin_headers)
        assert r.status_code == 200
        assert len(r.json()["points"]) == 36


def teardown_module(module):
    # cleanup test data & reset admin lock
    _db.refunds.delete_many({"id": {"$regex": "^TEST_"}})
    _reset_admin_lock()
