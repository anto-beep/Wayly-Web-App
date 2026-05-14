"""Iteration 27 — Adviser plan + plan-gating + adviser portal CRUD tests.

Covers:
- POST /api/billing/start-trial with plan='adviser','solo','family'
- POST /api/billing/checkout with plan='adviser','solo','family'
- GET /api/adviser/summary (401, 403, 200)
- GET/POST/PATCH/DELETE /api/adviser/clients
- Plan literal expansion (signup/login/me returns 'adviser' without errors)
- Regression: Family user cathy@example.com gets 403 on adviser endpoints
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADVISER_EMAIL = "mark.adviser@example.com"
ADVISER_PASSWORD = "AdviserPass1!"
FAMILY_EMAIL = "cathy@example.com"
FAMILY_PASSWORD = "testpass123"


def _signup_or_login(email, password, name="Test User", plan="free", role="caregiver"):
    """Try login first; if 401, signup."""
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    if r.status_code == 200:
        return r.json()["token"], r.json()["user"]
    r = requests.post(
        f"{API}/auth/signup",
        json={"email": email, "password": password, "name": name, "role": role, "plan": plan},
        timeout=30,
    )
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    return r.json()["token"], r.json()["user"]


# --- Module-level fixtures ---

@pytest.fixture(scope="module")
def adviser_token():
    """Ensure mark.adviser@example.com exists with plan='adviser'."""
    token, user = _signup_or_login(ADVISER_EMAIL, ADVISER_PASSWORD, name="Mark Adviser", plan="free")
    # Force adviser plan via direct PUT /api/auth/plan
    h = {"Authorization": f"Bearer {token}"}
    if (user.get("plan") or "").lower() != "adviser":
        r = requests.put(f"{API}/auth/plan", headers=h, json={"plan": "adviser"}, timeout=30)
        assert r.status_code == 200, f"plan flip failed: {r.status_code} {r.text}"
    return token


@pytest.fixture(scope="module")
def family_token():
    token, user = _signup_or_login(FAMILY_EMAIL, FAMILY_PASSWORD, name="Cathy", plan="free")
    # If existing user isn't family, force family for regression test of 403
    h = {"Authorization": f"Bearer {token}"}
    if (user.get("plan") or "").lower() != "family":
        requests.put(f"{API}/auth/plan", headers=h, json={"plan": "family"}, timeout=30)
    return token


@pytest.fixture(scope="module")
def fresh_solo_user():
    """Create a fresh user for start-trial(solo) regression."""
    email = f"TEST_solo_{int(time.time())}@example.com"
    token, _ = _signup_or_login(email, "TrialPass1!", name="Test Solo", plan="free")
    return email, token


@pytest.fixture(scope="module")
def fresh_family_user():
    email = f"TEST_fam_{int(time.time())}@example.com"
    token, _ = _signup_or_login(email, "TrialPass1!", name="Test Family", plan="free")
    return email, token


@pytest.fixture(scope="module")
def fresh_adviser_user():
    """Brand-new free user for start-trial(adviser) verification."""
    email = f"TEST_adv_{int(time.time())}@example.com"
    token, _ = _signup_or_login(email, "TrialPass1!", name="Test Adviser", plan="free")
    return email, token


# --- /auth/me with adviser plan (serialisation) ---

class TestAuthAdviser:
    def test_me_adviser_serialises(self, adviser_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {adviser_token}"}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("plan") == "adviser"
        assert "id" in data and "email" in data


# --- /billing/start-trial ---

class TestStartTrial:
    def test_start_trial_adviser(self, fresh_adviser_user):
        email, token = fresh_adviser_user
        r = requests.post(
            f"{API}/billing/start-trial",
            headers={"Authorization": f"Bearer {token}"},
            json={"plan": "adviser"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["plan"] == "adviser"
        assert data["trial_days"] == 7
        assert data["subscription_status"] == "trialing"
        # Verify /auth/me flipped to adviser
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30).json()
        assert me["plan"] == "adviser"

    def test_start_trial_solo(self, fresh_solo_user):
        _, token = fresh_solo_user
        r = requests.post(
            f"{API}/billing/start-trial",
            headers={"Authorization": f"Bearer {token}"},
            json={"plan": "solo"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["plan"] == "solo"

    def test_start_trial_family(self, fresh_family_user):
        _, token = fresh_family_user
        r = requests.post(
            f"{API}/billing/start-trial",
            headers={"Authorization": f"Bearer {token}"},
            json={"plan": "family"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["plan"] == "family"

    def test_start_trial_used_twice_blocked(self, fresh_adviser_user):
        _, token = fresh_adviser_user
        r = requests.post(
            f"{API}/billing/start-trial",
            headers={"Authorization": f"Bearer {token}"},
            json={"plan": "adviser"},
            timeout=30,
        )
        # Second call should 400 "trial_used"
        assert r.status_code == 400


# --- /billing/checkout ---

class TestCheckout:
    def _co(self, token, plan):
        return requests.post(
            f"{API}/billing/checkout",
            headers={"Authorization": f"Bearer {token}"},
            json={"plan": plan, "origin_url": "https://example.com"},
            timeout=60,
        )

    def test_checkout_adviser(self, adviser_token):
        r = self._co(adviser_token, "adviser")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "url" in data and data["url"].startswith("http")
        assert "session_id" in data

    def test_checkout_solo(self, adviser_token):
        r = self._co(adviser_token, "solo")
        assert r.status_code == 200, r.text
        assert "url" in r.json()

    def test_checkout_family(self, adviser_token):
        r = self._co(adviser_token, "family")
        assert r.status_code == 200, r.text
        assert "url" in r.json()

    def test_checkout_invalid_plan(self, adviser_token):
        r = self._co(adviser_token, "platinum")
        # Pydantic Literal validation -> 422; legacy custom check -> 400
        assert r.status_code in (400, 422)


# --- /adviser/summary plan-gating ---

class TestAdviserSummary:
    def test_unauthenticated_401(self):
        r = requests.get(f"{API}/adviser/summary", timeout=30)
        assert r.status_code == 401
        body = r.json()
        det = body.get("detail") or {}
        assert det.get("error") == "unauthenticated" or "unauthent" in (det.get("message") or "").lower()

    def test_family_user_403(self, family_token):
        r = requests.get(
            f"{API}/adviser/summary", headers={"Authorization": f"Bearer {family_token}"}, timeout=30,
        )
        assert r.status_code == 403, r.text
        det = r.json().get("detail") or {}
        assert det.get("error") == "plan_required"
        assert det.get("current_plan") == "family"
        assert "adviser" in det.get("required_plans") or []
        assert det.get("redirect") == "/pricing"

    def test_adviser_user_200(self, adviser_token):
        r = requests.get(
            f"{API}/adviser/summary", headers={"Authorization": f"Bearer {adviser_token}"}, timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ("plan", "max_clients", "clients_total", "clients_active", "clients_invited", "seats_remaining"):
            assert k in data, f"missing key {k} in {data}"
        assert data["plan"] == "adviser"
        assert data["max_clients"] == 25


# --- /adviser/clients CRUD ---

class TestAdviserClientsCRUD:
    @pytest.fixture(scope="class", autouse=True)
    def _cleanup_before(self, adviser_token):
        # Clean up any prior TEST_ clients
        h = {"Authorization": f"Bearer {adviser_token}"}
        existing = requests.get(f"{API}/adviser/clients", headers=h, timeout=30).json() or []
        for c in existing:
            if (c.get("client_email") or "").startswith("test_") or "test_" in (c.get("client_email") or ""):
                requests.delete(f"{API}/adviser/clients/{c['id']}", headers=h, timeout=30)
        yield

    def test_list_403_for_family(self, family_token):
        r = requests.get(
            f"{API}/adviser/clients", headers={"Authorization": f"Bearer {family_token}"}, timeout=30,
        )
        assert r.status_code == 403

    def test_list_200_for_adviser(self, adviser_token):
        r = requests.get(
            f"{API}/adviser/clients", headers={"Authorization": f"Bearer {adviser_token}"}, timeout=30,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_client(self, adviser_token):
        h = {"Authorization": f"Bearer {adviser_token}"}
        unique = int(time.time())
        payload = {
            "client_name": "TEST Client A",
            "client_email": f"test_client_a_{unique}@example.com",
            "notes": "Initial notes",
        }
        r = requests.post(f"{API}/adviser/clients", headers=h, json=payload, timeout=30)
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        assert doc["client_email"] == payload["client_email"].lower()
        assert doc["client_name"] == "TEST Client A"
        assert doc["status"] == "invited"  # no linked Wayly user
        assert doc.get("linked_user_id") in (None, "")
        # Persist - GET list and ensure it's there
        listing = requests.get(f"{API}/adviser/clients", headers=h, timeout=30).json()
        assert any(c["id"] == doc["id"] for c in listing)

        # Duplicate email -> 409
        r2 = requests.post(f"{API}/adviser/clients", headers=h, json=payload, timeout=30)
        assert r2.status_code == 409

        # Patch update
        patch_r = requests.patch(
            f"{API}/adviser/clients/{doc['id']}",
            headers=h, json={"client_name": "TEST Client A Updated", "status": "active"}, timeout=30,
        )
        assert patch_r.status_code == 200, patch_r.text
        upd = patch_r.json()
        assert upd["client_name"] == "TEST Client A Updated"
        assert upd["status"] == "active"

        # Patch non-existent -> 404
        bad = requests.patch(f"{API}/adviser/clients/nonexistent-id", headers=h, json={"client_name": "X"}, timeout=30)
        assert bad.status_code == 404

        # Delete
        d = requests.delete(f"{API}/adviser/clients/{doc['id']}", headers=h, timeout=30)
        assert d.status_code == 200
        # Re-delete -> 404
        d2 = requests.delete(f"{API}/adviser/clients/{doc['id']}", headers=h, timeout=30)
        assert d2.status_code == 404

    def test_create_with_linked_user(self, adviser_token):
        """If a Wayly user already exists with the email, linked_user_id is set + status='active'."""
        h = {"Authorization": f"Bearer {adviser_token}"}
        unique = int(time.time())
        # Create a Wayly user first
        existing_email = f"test_linked_{unique}@example.com"
        _signup_or_login(existing_email, "TrialPass1!", name="Linked User", plan="free")
        # Now add as adviser client
        r = requests.post(
            f"{API}/adviser/clients", headers=h,
            json={"client_name": "TEST Linked", "client_email": existing_email},
            timeout=30,
        )
        assert r.status_code in (200, 201), r.text
        doc = r.json()
        assert doc.get("linked_user_id"), f"linked_user_id should be set: {doc}"
        assert doc["status"] == "active"
        # Cleanup
        requests.delete(f"{API}/adviser/clients/{doc['id']}", headers=h, timeout=30)

    def test_post_403_for_family(self, family_token):
        r = requests.post(
            f"{API}/adviser/clients",
            headers={"Authorization": f"Bearer {family_token}"},
            json={"client_name": "X", "client_email": "x@example.com"},
            timeout=30,
        )
        assert r.status_code == 403


# --- Regression: signup with plan='adviser' literal accepted ---

class TestSignupAdviserLiteral:
    def test_signup_adviser_plan_accepted(self):
        email = f"TEST_signup_adv_{int(time.time())}@example.com"
        r = requests.post(
            f"{API}/auth/signup",
            json={"email": email, "password": "TrialPass1!", "name": "Sig", "role": "caregiver", "plan": "adviser"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json()["user"]["plan"] == "adviser"


# --- Regression: public AI tools still respond ---

class TestPublicToolsRegression:
    def test_statement_decoder_public_post(self):
        r = requests.post(
            f"{API}/public/decode-statement-text",
            json={"text": "Care Mgmt $50"},
            timeout=60,
        )
        # Either 200 success, or 429 rate-limited, or 400/422 invalid — never 500.
        assert r.status_code in (200, 400, 401, 422, 429), f"unexpected {r.status_code}: {r.text[:200]}"

    def test_budget_calc_public_post(self):
        r = requests.post(
            f"{API}/public/budget-calc",
            json={"classification": 4, "monthly_fee": 500, "weekly_services": 200},
            timeout=60,
        )
        # 401 means rate-limit/soft-gate kicked in - endpoint exists which is what we verify
        assert r.status_code in (200, 400, 401, 422, 429), f"unexpected {r.status_code}: {r.text[:200]}"
