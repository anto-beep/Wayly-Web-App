"""OJ-1 v1.1 Onboarding Journey backend tests.

Covers the full lifecycle: create/get, persona lock, step ordering,
skip semantics, completion guard, top-level skip, and PDF export.
Also regression-tests existing route prefixes still respond.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://wayly-rn-build.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CAREGIVER_EMAIL = "cathy@example.com"
CAREGIVER_PASS = "testpass123"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{API}/auth/login", json={"email": CAREGIVER_EMAIL, "password": CAREGIVER_PASS}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def journey_id(client):
    # Clean up any pre-existing active journey by completing/abandoning through API is complex.
    # Use current endpoint first to reuse if there's an in_progress one.
    r = client.post(f"{API}/journeys", timeout=30)
    assert r.status_code == 200, f"create journey failed: {r.status_code} {r.text[:200]}"
    j = r.json()
    assert j.get("id"), "journey doc missing id"
    assert j.get("user_id"), "journey missing user_id"
    assert j.get("status") == "in_progress"
    assert j.get("steps", {}).get("csc", {}).get("status") == "pending"
    return j["id"]


class TestJourneyLifecycle:
    def test_post_is_idempotent(self, client, journey_id):
        r = client.post(f"{API}/journeys", timeout=30)
        assert r.status_code == 200
        assert r.json()["id"] == journey_id, "POST /journeys should return same in-progress journey"

    def test_current_returns_active(self, client, journey_id):
        r = client.get(f"{API}/journeys/current", timeout=30)
        assert r.status_code == 200
        body = r.json()
        assert body.get("journey", {}).get("id") == journey_id

    def test_step_before_persona_rejected(self, client, journey_id):
        r = client.put(f"{API}/journeys/{journey_id}/steps/csc", json={"status": "complete"}, timeout=30)
        assert r.status_code == 400
        assert "Persona" in r.text or "persona" in r.text

    def test_lock_persona(self, client, journey_id):
        r = client.put(f"{API}/journeys/{journey_id}/persona", json={"persona": "caregiver"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["persona"] == "caregiver"
        assert d["persona_locked_at"]

    def test_persona_lock_is_idempotent(self, client, journey_id):
        # Attempting to change persona to 'participant' should be a no-op (still caregiver).
        r = client.put(f"{API}/journeys/{journey_id}/persona", json={"persona": "participant"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["persona"] == "caregiver"

    def test_skip_after_persona_rejected(self, client, journey_id):
        r = client.post(f"{API}/journeys/{journey_id}/skip", timeout=30)
        assert r.status_code == 400

    def test_out_of_order_step_rejected(self, client, journey_id):
        # Try ce2 before csc.
        r = client.put(f"{API}/journeys/{journey_id}/steps/ce2", json={"status": "complete"}, timeout=30)
        assert r.status_code == 400
        assert "Prior" in r.text or "prior" in r.text or "csc" in r.text

    def test_complete_step_csc(self, client, journey_id):
        r = client.put(f"{API}/journeys/{journey_id}/steps/csc",
                       json={"status": "skipped"}, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["steps"]["csc"]["status"] == "skipped"
        assert d["steps"]["csc"]["source"] == "user_declared", "skip default source should be user_declared"

    def test_premature_complete_rejected(self, client, journey_id):
        r = client.post(f"{API}/journeys/{journey_id}/complete", timeout=30)
        assert r.status_code == 400

    def test_complete_remaining_steps(self, client, journey_id):
        for step in ["ce2", "budget", "cpr"]:
            r = client.put(f"{API}/journeys/{journey_id}/steps/{step}",
                           json={"status": "complete", "source": "computed"}, timeout=30)
            assert r.status_code == 200, f"{step}: {r.status_code} {r.text[:200]}"
            d = r.json()
            assert d["steps"][step]["status"] == "complete"
            assert d["steps"][step]["source"] == "computed"

    def test_unknown_step_rejected(self, client, journey_id):
        r = client.put(f"{API}/journeys/{journey_id}/steps/xyzzy", json={"status": "complete"}, timeout=30)
        assert r.status_code == 400

    def test_complete_journey(self, client, journey_id):
        r = client.post(f"{API}/journeys/{journey_id}/complete", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["status"] == "completed"
        assert d["completed_at"]

    def test_pdf_export(self, client, journey_id):
        r = client.get(f"{API}/journeys/{journey_id}/pdf", timeout=30)
        assert r.status_code == 200
        assert "application/pdf" in r.headers.get("content-type", "")
        assert r.content[:4] == b"%PDF", "PDF magic bytes missing"
        assert len(r.content) > 500

    def test_current_include_completed(self, client, journey_id):
        # After completion, current w/o include_completed returns None (or new in_progress if
        # POST was implicitly called). Explicitly check include_completed=1.
        r = client.get(f"{API}/journeys/current?include_completed=1", timeout=30)
        assert r.status_code == 200
        j = r.json().get("journey")
        assert j is not None
        # Should return the completed one OR a new in_progress; either way ID must be a UUID.
        assert j.get("id")


class TestUnauthenticated:
    def test_create_requires_auth(self):
        r = requests.post(f"{API}/journeys", timeout=30)
        assert r.status_code in (401, 403)


class TestRegression:
    """Sanity checks that existing routes are still wired after adding journeys."""

    def test_health(self):
        r = requests.get(f"{API}/health", timeout=30)
        assert r.status_code == 200

    def test_csc_public_routes_present(self, client):
        # CSC has some public/auth routes; at minimum they shouldn't 404 due to unmounted router.
        # We check an OPTIONS-ish probe to /api/csc/version if it exists, else fallback to any known route.
        r = client.get(f"{API}/csc/version", timeout=30)
        # 200 or 404 (route may not exist) is fine; a 5xx would indicate an import failure.
        assert r.status_code < 500

    def test_admin_route_reachable(self):
        # Should return 401/403 unauth, not 500.
        r = requests.get(f"{API}/admin/users", timeout=30)
        assert r.status_code < 500
