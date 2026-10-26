"""Backend regression for iter382 — items 3/4/5.
Tests the OPTIONAL cancellation reason body on /payments/cancel-subscription and /billing/cancel.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-renderer.preview.emergentagent.com").rstrip("/")

ACTIVE_EMAIL = "cathy@example.com"
ACTIVE_PASS = "testpass123"
INACTIVE_EMAIL = "cancelled.vo@example.com"
INACTIVE_PASS = "AccessTest1!"


def _login(email, pw):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture
def active_token():
    return _login(ACTIVE_EMAIL, ACTIVE_PASS)


@pytest.fixture
def inactive_token():
    return _login(INACTIVE_EMAIL, INACTIVE_PASS)


# -- /auth/me shape --
def test_auth_me_inactive_has_canceled_status(inactive_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {inactive_token}"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    # Expect sub cancelled OR plan free with period_end set
    plan = (data.get("plan") or "").lower()
    status = (data.get("subscription_status") or "").lower()
    print(f"inactive /me plan={plan} status={status}")
    assert plan in ("free", "", None) or status in ("canceled", "cancelled", "expired", "incomplete_expired")


# -- /billing/subscription shape --
def test_billing_subscription_inactive_user(inactive_token):
    r = requests.get(f"{BASE_URL}/api/billing/subscription", headers={"Authorization": f"Bearer {inactive_token}"}, timeout=30)
    assert r.status_code == 200
    data = r.json()
    print(f"inactive /billing/subscription: {data}")
    # Must at least contain plan + status fields
    assert "plan" in data or "status" in data


# -- OPTIONAL reason body on /billing/cancel (idempotent for already-cancelled sub) --
# NOTE: inactive user has no active plan so cancel returns 404; what we're verifying
# here is simply that the OPTIONAL body is ACCEPTED by the endpoint schema (no 422).

def test_billing_cancel_accepts_no_body(inactive_token):
    r = requests.post(f"{BASE_URL}/api/billing/cancel", headers={"Authorization": f"Bearer {inactive_token}"}, timeout=30)
    print(f"/billing/cancel no body -> {r.status_code} {r.text[:200]}")
    assert r.status_code != 422, "endpoint must accept no body"


def test_billing_cancel_accepts_empty_body(inactive_token):
    r = requests.post(f"{BASE_URL}/api/billing/cancel", json={}, headers={"Authorization": f"Bearer {inactive_token}"}, timeout=30)
    print(f"/billing/cancel empty body -> {r.status_code} {r.text[:200]}")
    assert r.status_code != 422, "endpoint must accept empty body"


def test_billing_cancel_accepts_reason_body(inactive_token):
    r = requests.post(f"{BASE_URL}/api/billing/cancel",
                      json={"reason": "Too expensive", "reason_detail": ""},
                      headers={"Authorization": f"Bearer {inactive_token}"}, timeout=30)
    print(f"/billing/cancel reason -> {r.status_code} {r.text[:200]}")
    assert r.status_code != 422, "endpoint must accept {reason, reason_detail} body"


def test_payments_cancel_subscription_accepts_no_body(inactive_token):
    r = requests.post(f"{BASE_URL}/api/payments/cancel-subscription",
                      headers={"Authorization": f"Bearer {inactive_token}"}, timeout=30)
    print(f"/payments/cancel-subscription no body -> {r.status_code} {r.text[:200]}")
    assert r.status_code != 422


def test_payments_cancel_subscription_accepts_reason_body(inactive_token):
    r = requests.post(f"{BASE_URL}/api/payments/cancel-subscription",
                      json={"reason": "Found another service", "reason_detail": ""},
                      headers={"Authorization": f"Bearer {inactive_token}"}, timeout=30)
    print(f"/payments/cancel-subscription reason -> {r.status_code} {r.text[:200]}")
    assert r.status_code != 422


# -- ensure active user's /billing/subscription returns the active plan --
def test_billing_subscription_active_user(active_token):
    r = requests.get(f"{BASE_URL}/api/billing/subscription", headers={"Authorization": f"Bearer {active_token}"}, timeout=30)
    assert r.status_code == 200
    d = r.json()
    print(f"active /billing/subscription: {d}")
    assert (d.get("plan") or "").lower() in ("family", "solo", "adviser")
