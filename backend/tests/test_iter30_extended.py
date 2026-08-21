"""Iter 30 — Smoke tests for Features 4-13 (extended_routes.py)."""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY = {"email": "cathy@example.com", "password": "testpass123"}
ADVISER = {"email": "mark.adviser@example.com", "password": "AdviserPass1!"}


@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(f"{API}/auth/login", json=CATHY, timeout=20)
    assert r.status_code == 200, f"Cathy login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def cathy_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def adviser_token():
    r = requests.post(f"{API}/auth/login", json=ADVISER, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Adviser login failed: {r.status_code}")
    return r.json()["token"]


# ---------------- Feature 4: Visits ----------------
class TestVisits:
    def test_list_empty_or_existing(self, cathy_headers):
        r = requests.get(f"{API}/visits", headers=cathy_headers, timeout=20)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_crud_visit(self, cathy_headers):
        payload = {
            "title": "TEST_GP visit", "starts_at": "2026-03-15T10:00:00",
            "duration_minutes": 45, "kind": "appointment", "provider": "Dr Test",
        }
        r = requests.post(f"{API}/visits", json=payload, headers=cathy_headers, timeout=20)
        assert r.status_code == 200, r.text
        v = r.json()
        assert v["title"] == "TEST_GP visit"
        assert "id" in v
        vid = v["id"]
        # PATCH
        payload["title"] = "TEST_GP visit (updated)"
        r2 = requests.patch(f"{API}/visits/{vid}", json=payload, headers=cathy_headers, timeout=20)
        assert r2.status_code == 200
        assert r2.json()["title"] == "TEST_GP visit (updated)"
        # GET verify
        r3 = requests.get(f"{API}/visits", headers=cathy_headers, timeout=20)
        assert any(x["id"] == vid for x in r3.json())
        # DELETE
        r4 = requests.delete(f"{API}/visits/{vid}", headers=cathy_headers, timeout=20)
        assert r4.status_code == 200

    def test_visit_validation_bad_kind(self, cathy_headers):
        r = requests.post(f"{API}/visits", json={"title": "X", "starts_at": "2026-03-15T10:00:00", "kind": "bogus"}, headers=cathy_headers, timeout=20)
        assert r.status_code == 422

    def test_no_household_returns_409(self):
        # Create a fresh user without household
        email = f"TEST_nohousehold_{int(time.time())}@example.com"
        r = requests.post(f"{API}/auth/signup", json={"email": email, "password": "TestPass1!", "name": "Test NH", "role": "caregiver", "plan": "free"}, timeout=20)
        if r.status_code != 200:
            pytest.skip(f"signup failed: {r.text}")
        tok = r.json()["token"]
        h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}
        rv = requests.get(f"{API}/visits", headers=h, timeout=20)
        assert rv.status_code == 409, f"expected 409 no_household, got {rv.status_code}: {rv.text}"


# ---------------- Feature 5: Budget Alerts ----------------
class TestBudgetAlerts:
    def test_crud(self, cathy_headers):
        r = requests.get(f"{API}/budget-alerts", headers=cathy_headers, timeout=20)
        assert r.status_code == 200
        body = {"stream": "Clinical", "threshold_pct": 80, "notify_email": True, "active": True}
        r2 = requests.post(f"{API}/budget-alerts", json=body, headers=cathy_headers, timeout=20)
        assert r2.status_code == 200, r2.text
        aid = r2.json()["id"]
        body["threshold_pct"] = 90
        r3 = requests.patch(f"{API}/budget-alerts/{aid}", json=body, headers=cathy_headers, timeout=20)
        assert r3.status_code == 200 and r3.json()["threshold_pct"] == 90
        r4 = requests.delete(f"{API}/budget-alerts/{aid}", headers=cathy_headers, timeout=20)
        assert r4.status_code == 200

    def test_invalid_stream_422(self, cathy_headers):
        r = requests.post(f"{API}/budget-alerts", json={"stream": "Nope", "threshold_pct": 50}, headers=cathy_headers, timeout=20)
        assert r.status_code == 422

    def test_invalid_threshold_422(self, cathy_headers):
        r = requests.post(f"{API}/budget-alerts", json={"stream": "all", "threshold_pct": 5}, headers=cathy_headers, timeout=20)
        assert r.status_code == 422


# ---------------- Feature 6: Provider Switch ----------------
class TestProviderSwitch:
    def test_full_workflow(self, cathy_headers):
        r = requests.get(f"{API}/provider-switch", headers=cathy_headers, timeout=20)
        assert r.status_code == 200
        # POST
        r2 = requests.post(f"{API}/provider-switch", json={"current_provider": "TEST_BlueBerry", "target_provider": "TEST_New", "reason": "testing"}, headers=cathy_headers, timeout=20)
        assert r2.status_code == 200, r2.text
        sw = r2.json()
        assert sw["stage"] == "considering"
        assert isinstance(sw["checklist"], dict) and "compared_services" in sw["checklist"]
        sid = sw["id"]
        # PATCH stage
        r3 = requests.patch(f"{API}/provider-switch/{sid}", json={"stage": "comparing"}, headers=cathy_headers, timeout=20)
        assert r3.status_code == 200 and r3.json()["stage"] == "comparing"
        # PATCH bad stage
        r4 = requests.patch(f"{API}/provider-switch/{sid}", json={"stage": "bogus"}, headers=cathy_headers, timeout=20)
        assert r4.status_code == 400
        # PATCH checklist merge
        r5 = requests.patch(f"{API}/provider-switch/{sid}", json={"checklist": {"compared_services": True}}, headers=cathy_headers, timeout=20)
        assert r5.status_code == 200
        assert r5.json()["checklist"]["compared_services"] is True
        assert r5.json()["checklist"]["compared_prices"] is False  # other keys preserved


# ---------------- Feature 7: Summary PDF ----------------
class TestSummaryPDF:
    def test_quarter(self, cathy_headers):
        r = requests.get(f"{API}/reports/summary.pdf?period=quarter", headers=cathy_headers, timeout=60)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content.startswith(b"%PDF-")
        assert len(r.content) > 1500

    def test_all(self, cathy_headers):
        r = requests.get(f"{API}/reports/summary.pdf?period=all", headers=cathy_headers, timeout=60)
        assert r.status_code == 200
        assert r.content.startswith(b"%PDF-")


# ---------------- Feature 8: AT-HM ----------------
class TestAthm:
    def test_crud(self, cathy_headers):
        r = requests.get(f"{API}/athm", headers=cathy_headers, timeout=20)
        assert r.status_code == 200
        b = {"kind": "AT", "name": "TEST_Walking frame", "status": "proposed", "cost_aud": 500.0}
        r2 = requests.post(f"{API}/athm", json=b, headers=cathy_headers, timeout=20)
        assert r2.status_code == 200, r2.text
        iid = r2.json()["id"]
        b["status"] = "approved"
        r3 = requests.patch(f"{API}/athm/{iid}", json=b, headers=cathy_headers, timeout=20)
        assert r3.status_code == 200 and r3.json()["status"] == "approved"
        r4 = requests.delete(f"{API}/athm/{iid}", headers=cathy_headers, timeout=20)
        assert r4.status_code == 200

    def test_bad_kind(self, cathy_headers):
        r = requests.post(f"{API}/athm", json={"kind": "ZZ", "name": "x"}, headers=cathy_headers, timeout=20)
        assert r.status_code == 422


# ---------------- Feature 9: Global Search ----------------
class TestSearch:
    def test_q_too_short(self, cathy_headers):
        r = requests.get(f"{API}/search?q=a", headers=cathy_headers, timeout=20)
        assert r.status_code == 422

    def test_search_with_household(self, cathy_headers):
        # seed a visit so search has something to find
        payload = {"title": "TEST_SEARCH_NEEDLE_xyz", "starts_at": "2026-04-01T10:00:00"}
        c = requests.post(f"{API}/visits", json=payload, headers=cathy_headers, timeout=20)
        vid = c.json()["id"]
        try:
            r = requests.get(f"{API}/search?q=TEST_SEARCH_NEEDLE_xyz", headers=cathy_headers, timeout=20)
            assert r.status_code == 200
            data = r.json()
            assert "q" in data and "count" in data and "results" in data
            assert data["count"] >= 1
            assert any(x["type"] == "visit" for x in data["results"])
        finally:
            requests.delete(f"{API}/visits/{vid}", headers=cathy_headers, timeout=20)

    def test_search_no_household(self):
        # Create fresh user without household
        email = f"TEST_search_nh_{int(time.time())}@example.com"
        r = requests.post(f"{API}/auth/signup", json={"email": email, "password": "TestPass1!", "name": "X", "role": "caregiver", "plan": "free"}, timeout=20)
        if r.status_code != 200:
            pytest.skip(f"signup failed: {r.text}")
        tok = r.json()["token"]
        h = {"Authorization": f"Bearer {tok}"}
        rs = requests.get(f"{API}/search?q=anything", headers=h, timeout=20)
        assert rs.status_code == 200
        assert rs.json()["results"] == []
        assert rs.json()["count"] == 0


# ---------------- Feature 10: Correspondence ----------------
class TestCorrespondence:
    def test_crud(self, cathy_headers):
        r = requests.get(f"{API}/correspondence", headers=cathy_headers, timeout=20)
        assert r.status_code == 200
        b = {"direction": "in", "channel": "email", "counterparty": "TEST_Provider",
             "subject": "TEST_Invoice query", "occurred_at": "2026-03-01T09:00:00"}
        r2 = requests.post(f"{API}/correspondence", json=b, headers=cathy_headers, timeout=20)
        assert r2.status_code == 200, r2.text
        cid = r2.json()["id"]
        b["subject"] = "TEST_Invoice query (updated)"
        r3 = requests.patch(f"{API}/correspondence/{cid}", json=b, headers=cathy_headers, timeout=20)
        assert r3.status_code == 200 and r3.json()["subject"] == "TEST_Invoice query (updated)"
        r4 = requests.delete(f"{API}/correspondence/{cid}", headers=cathy_headers, timeout=20)
        assert r4.status_code == 200

    def test_bad_channel(self, cathy_headers):
        r = requests.post(f"{API}/correspondence", json={"direction": "in", "channel": "carrier_pigeon", "counterparty": "x", "subject": "y", "occurred_at": "2026-03-01T09:00:00"}, headers=cathy_headers, timeout=20)
        assert r.status_code == 422


# ---------------- Feature 11: Referrals ----------------
class TestReferrals:
    def test_crud(self, cathy_headers):
        r = requests.get(f"{API}/referrals", headers=cathy_headers, timeout=20)
        assert r.status_code == 200
        b = {"referred_to": "TEST_GP Dr X", "kind": "GP", "status": "open", "referred_at": "2026-03-01T09:00:00"}
        r2 = requests.post(f"{API}/referrals", json=b, headers=cathy_headers, timeout=20)
        assert r2.status_code == 200, r2.text
        rid = r2.json()["id"]
        b["status"] = "in_progress"
        r3 = requests.patch(f"{API}/referrals/{rid}", json=b, headers=cathy_headers, timeout=20)
        assert r3.status_code == 200 and r3.json()["status"] == "in_progress"
        r4 = requests.delete(f"{API}/referrals/{rid}", headers=cathy_headers, timeout=20)
        assert r4.status_code == 200


# ---------------- Feature 13: Provider Ratings (USER-scoped) ----------------
class TestProviderRatings:
    def test_user_isolation(self, cathy_headers, adviser_token):
        # Cathy creates a rating
        r1 = requests.post(f"{API}/provider-ratings", json={"provider_name": "TEST_CathyProv", "stars": 5, "comment": "great"}, headers=cathy_headers, timeout=20)
        assert r1.status_code == 200, r1.text
        rid = r1.json()["id"]
        # Adviser creates their own
        ah = {"Authorization": f"Bearer {adviser_token}", "Content-Type": "application/json"}
        r2 = requests.post(f"{API}/provider-ratings", json={"provider_name": "TEST_AdvProv", "stars": 3}, headers=ah, timeout=20)
        assert r2.status_code == 200
        rid2 = r2.json()["id"]
        # List from each user — should NOT see other's rating
        l1 = requests.get(f"{API}/provider-ratings", headers=cathy_headers, timeout=20).json()
        l2 = requests.get(f"{API}/provider-ratings", headers=ah, timeout=20).json()
        cathy_ids = {x["id"] for x in l1}
        adv_ids = {x["id"] for x in l2}
        assert rid in cathy_ids and rid not in adv_ids
        assert rid2 in adv_ids and rid2 not in cathy_ids
        # cleanup
        requests.delete(f"{API}/provider-ratings/{rid}", headers=cathy_headers, timeout=20)
        requests.delete(f"{API}/provider-ratings/{rid2}", headers=ah, timeout=20)

    def test_bad_stars(self, cathy_headers):
        r = requests.post(f"{API}/provider-ratings", json={"provider_name": "x", "stars": 9}, headers=cathy_headers, timeout=20)
        assert r.status_code == 422


# ---------------- Feature 12: Offline /sw.js ----------------
class TestServiceWorker:
    def test_sw_reachable(self):
        r = requests.get(f"{BASE_URL}/sw.js", timeout=20)
        assert r.status_code == 200, f"sw.js not reachable: {r.status_code}"


# ---------------- Regression: cathy core flows ----------------
class TestRegression:
    def test_me(self, cathy_headers):
        r = requests.get(f"{API}/auth/me", headers=cathy_headers, timeout=20)
        assert r.status_code == 200 and r.json()["email"] == CATHY["email"]

    def test_statements_list(self, cathy_headers):
        r = requests.get(f"{API}/statements", headers=cathy_headers, timeout=20)
        assert r.status_code == 200 and isinstance(r.json(), list)

    def test_budget_current(self, cathy_headers):
        r = requests.get(f"{API}/budget/current", headers=cathy_headers, timeout=20)
        assert r.status_code == 200 and "streams" in r.json()

    def test_family_thread(self, cathy_headers):
        r = requests.get(f"{API}/family-thread", headers=cathy_headers, timeout=20)
        assert r.status_code == 200
