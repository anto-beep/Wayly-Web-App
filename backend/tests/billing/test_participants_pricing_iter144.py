"""Iter 144: verify participants pricing endpoints return non-5xx.

Covers the three endpoints called by the participants UI:
  - GET  /api/payments/reconciliation-report
  - POST /api/payments/sync-plan-to-participants
  - POST /api/payments/proration-preview
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to reading frontend/.env directly since pytest may not inherit it
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
                    break
    except FileNotFoundError:
        pass

CATHY = {"email": "cathy@example.com", "password": "testpass123"}


@pytest.fixture(scope="module")
def token():
    r = None
    last_err = None
    for _ in range(3):
        try:
            r = requests.post(f"{BASE_URL}/api/auth/login", json=CATHY, timeout=90)
            break
        except Exception as e:
            last_err = e
    assert r is not None, f"login request failed after retries: {last_err}"
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_reconciliation_report(auth_headers):
    r = requests.get(f"{BASE_URL}/api/payments/reconciliation-report", headers=auth_headers, timeout=60)
    assert r.status_code < 500, f"5xx from reconciliation-report: {r.status_code} {r.text[:400]}"
    assert r.status_code in (200, 401, 403, 404), r.status_code


def test_sync_plan_to_participants(auth_headers):
    r = requests.post(f"{BASE_URL}/api/payments/sync-plan-to-participants", headers=auth_headers, timeout=60)
    assert r.status_code < 500, f"5xx from sync-plan-to-participants: {r.status_code} {r.text[:400]}"
    # 200 with ok:false is fine when no active subscription
    if r.status_code == 200:
        data = r.json()
        assert isinstance(data, dict)


def test_proration_preview_family(auth_headers):
    r = requests.post(
        f"{BASE_URL}/api/payments/proration-preview",
        headers=auth_headers,
        json={"target_plan": "family"},
        timeout=60,
    )
    assert r.status_code < 500, f"5xx from proration-preview: {r.status_code} {r.text[:400]}"
