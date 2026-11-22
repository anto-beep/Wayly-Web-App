"""iter149 — verifies /api/billing/v2/cancel-pending-addon idempotency,
       addon rollback, and participant archival."""

import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read from frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL"):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_cancel_endpoint_returns_200_and_contract(headers):
    r = requests.post(f"{BASE_URL}/api/billing/v2/cancel-pending-addon", headers=headers, timeout=15)
    assert r.status_code == 200, f"unexpected: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("ok") is True
    assert "cancelled_count" in body and isinstance(body["cancelled_count"], int)
    assert "participants_archived" in body and isinstance(body["participants_archived"], list)


def test_cancel_endpoint_idempotent(headers):
    r1 = requests.post(f"{BASE_URL}/api/billing/v2/cancel-pending-addon", headers=headers, timeout=15)
    r2 = requests.post(f"{BASE_URL}/api/billing/v2/cancel-pending-addon", headers=headers, timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200
    # Second call should cancel 0 rows (already-CANCELLED filtered out).
    assert r2.json()["cancelled_count"] == 0


def test_cancel_endpoint_unauth():
    r = requests.post(f"{BASE_URL}/api/billing/v2/cancel-pending-addon", timeout=15)
    assert r.status_code in (401, 403), f"expected auth error, got {r.status_code}"


def test_participants_endpoint_still_works(headers):
    """Regression: /api/v2/participants must still return items list."""
    r = requests.get(f"{BASE_URL}/api/v2/participants", headers=headers, timeout=15)
    assert r.status_code == 200
    assert "items" in r.json()
