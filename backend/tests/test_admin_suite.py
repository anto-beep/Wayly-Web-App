"""Iteration 20 — Admin suite end-to-end tests.
Covers /api/admin/* endpoints, RBAC, exports, and admin self-protection."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend .env value if not exported
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
                break

ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASSWORD = "AdminPass!2026"
NON_ADMIN_EMAIL = "cathy@example.com"
NON_ADMIN_PASSWORD = "testpass123"


# ---- shared sessions ----

@pytest.fixture(scope="module")
def admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    body = r.json()
    assert body["user"]["is_admin"] is True, f"is_admin missing on /auth/login response: {body['user']}"
    s.headers.update({"Authorization": f"Bearer {body['token']}"})
    s.admin_id = body["user"]["id"]  # type: ignore
    return s


@pytest.fixture(scope="module")
def non_admin_session():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": NON_ADMIN_EMAIL, "password": NON_ADMIN_PASSWORD}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Non-admin login skipped: {r.status_code}")
    body = r.json()
    s.headers.update({"Authorization": f"Bearer {body['token']}"})
    s.user_id = body["user"]["id"]  # type: ignore
    s.is_admin = body["user"].get("is_admin", False)  # type: ignore
    return s


# ---- Auth / RBAC ----

class TestAdminAuth:
    def test_admin_login_returns_is_admin_true(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/auth/me")
        assert r.status_code == 200
        body = r.json()
        assert body["is_admin"] is True

    def test_non_admin_is_not_admin(self, non_admin_session):
        assert non_admin_session.is_admin is False  # type: ignore

    def test_unauthenticated_admin_route_returns_401(self):
        r = requests.get(f"{BASE_URL}/api/admin/analytics", timeout=20)
        assert r.status_code == 401, r.text

    @pytest.mark.parametrize("path", [
        "/api/admin/analytics",
        "/api/admin/users",
        "/api/admin/households",
        "/api/admin/payments",
        "/api/admin/statements",
        "/api/admin/export/users.csv",
        "/api/admin/export/payments.csv",
        "/api/admin/export/statements.csv",
    ])
    def test_non_admin_gets_403(self, non_admin_session, path):
        r = non_admin_session.get(f"{BASE_URL}{path}")
        assert r.status_code == 403, f"{path} returned {r.status_code} {r.text[:200]}"


# ---- Analytics ----

class TestAdminAnalytics:
    def test_analytics_shape(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/analytics")
        assert r.status_code == 200, r.text
        data = r.json()
        for key in ("users", "plans", "subscriptions", "statements", "households", "payments", "top_active_households"):
            assert key in data, f"Missing key: {key}"
        assert isinstance(data["users"]["total"], int)
        assert isinstance(data["top_active_households"], list)
        assert "free" in data["plans"] and "solo" in data["plans"] and "family" in data["plans"]


# ---- Users ----

class TestAdminUsers:
    def test_list_users_paginated(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/users")
        assert r.status_code == 200
        data = r.json()
        assert "users" in data and "total" in data
        assert isinstance(data["users"], list)
        assert data["total"] >= 1

    def test_search_users(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/users", params={"q": "cathy"})
        assert r.status_code == 200
        data = r.json()
        if data["total"] > 0:
            emails = [u["email"].lower() for u in data["users"]]
            assert any("cathy" in e for e in emails), f"Search did not filter: {emails}"

    def test_user_detail(self, admin_session, non_admin_session):
        target_id = non_admin_session.user_id  # type: ignore
        r = admin_session.get(f"{BASE_URL}/api/admin/users/{target_id}")
        assert r.status_code == 200
        data = r.json()
        for key in ("user", "subscription", "household", "statements", "audit", "payments"):
            assert key in data, f"Missing key: {key}"
        assert data["user"]["id"] == target_id
        # ensure no _id and no password_hash
        assert "_id" not in data["user"]
        assert "password_hash" not in data["user"]
        for s in data["statements"]:
            assert "file_b64" not in s
            assert "raw_text" not in s

    def test_user_detail_404(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/users/does-not-exist-zzz")
        assert r.status_code == 404


# ---- Households / Payments / Statements ----

class TestAdminLists:
    def test_households_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/households")
        assert r.status_code == 200
        data = r.json()
        assert "households" in data and "total" in data
        if data["households"]:
            h = data["households"][0]
            assert "member_count" in h and "statement_count" in h

    def test_payments_list(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/payments")
        assert r.status_code == 200
        data = r.json()
        assert "payments" in data
        for p in data["payments"]:
            # enrichment optional but shouldn't crash
            assert "_id" not in p

    def test_statements_list_no_heavy_fields(self, admin_session):
        r = admin_session.get(f"{BASE_URL}/api/admin/statements")
        assert r.status_code == 200
        data = r.json()
        assert "statements" in data
        for s in data["statements"]:
            assert "file_b64" not in s
            assert "raw_text" not in s


# ---- CSV exports ----

class TestAdminExports:
    @pytest.mark.parametrize("path,filename", [
        ("/api/admin/export/users.csv", "wayly_users.csv"),
        ("/api/admin/export/payments.csv", "wayly_payments.csv"),
        ("/api/admin/export/statements.csv", "wayly_statements.csv"),
    ])
    def test_csv_export(self, admin_session, path, filename):
        r = admin_session.get(f"{BASE_URL}{path}")
        assert r.status_code == 200, r.text[:300]
        assert "text/csv" in r.headers.get("content-type", "")
        # Some exports may be empty, but Content-Disposition should still be set when rows exist.
        if r.text.strip():
            assert "attachment" in r.headers.get("content-disposition", ""), r.headers
            assert filename in r.headers.get("content-disposition", "")


# ---- Mutations + self-protection ----

class TestAdminMutations:
    def test_admin_cannot_remove_own_admin_flag(self, admin_session):
        admin_id = admin_session.admin_id  # type: ignore
        r = admin_session.put(f"{BASE_URL}/api/admin/users/{admin_id}/admin", json={"is_admin": False})
        assert r.status_code == 400, r.text

    def test_admin_cannot_delete_own_account(self, admin_session):
        admin_id = admin_session.admin_id  # type: ignore
        r = admin_session.delete(f"{BASE_URL}/api/admin/users/{admin_id}")
        assert r.status_code == 400, r.text

    def test_toggle_admin_on_another_user(self, admin_session, non_admin_session):
        target_id = non_admin_session.user_id  # type: ignore
        # grant admin
        r = admin_session.put(f"{BASE_URL}/api/admin/users/{target_id}/admin", json={"is_admin": True})
        assert r.status_code == 200, r.text
        assert r.json()["is_admin"] is True
        # verify persisted
        r2 = admin_session.get(f"{BASE_URL}/api/admin/users/{target_id}")
        assert r2.json()["user"].get("is_admin") is True
        # revoke admin (cleanup)
        r3 = admin_session.put(f"{BASE_URL}/api/admin/users/{target_id}/admin", json={"is_admin": False})
        assert r3.status_code == 200
        assert r3.json()["is_admin"] is False

    def test_set_plan_invalid(self, admin_session, non_admin_session):
        target_id = non_admin_session.user_id  # type: ignore
        r = admin_session.put(f"{BASE_URL}/api/admin/users/{target_id}/plan", json={"plan": "platinum"})
        assert r.status_code == 400

    def test_set_plan_valid_and_persists(self, admin_session, non_admin_session):
        target_id = non_admin_session.user_id  # type: ignore
        # get current plan to restore later
        before = admin_session.get(f"{BASE_URL}/api/admin/users/{target_id}").json()["user"].get("plan")
        try:
            r = admin_session.put(f"{BASE_URL}/api/admin/users/{target_id}/plan", json={"plan": "solo"})
            assert r.status_code == 200
            assert r.json()["plan"] == "solo"
            after = admin_session.get(f"{BASE_URL}/api/admin/users/{target_id}").json()["user"].get("plan")
            assert after == "solo"
        finally:
            if before:
                admin_session.put(f"{BASE_URL}/api/admin/users/{target_id}/plan", json={"plan": before})
