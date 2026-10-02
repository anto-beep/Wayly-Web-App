"""Iter257 — live checkout smoke test.

Verifies the mode-aware price selection didn't regress the TEST-mode preview
checkout, and that an unknown plan is a 4xx (not 500/502)."""
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def active_token():
    tok = _login("cathy@example.com", "testpass123")
    if not tok:
        pytest.skip("active user login failed")
    return tok


@pytest.fixture(scope="module")
def view_only_token():
    return _login("cancelled.vo@example.com", "AccessTest1!")


@pytest.mark.parametrize("plan", ["solo", "family"])
def test_checkout_returns_stripe_test_session(active_token, plan):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        json={"plan": plan, "origin_url": BASE_URL},
        headers={"Authorization": f"Bearer {active_token}"},
        timeout=45,
    )
    assert r.status_code == 200, f"plan={plan} got {r.status_code}: {r.text[:400]}"
    body = r.json()
    assert "url" in body and body["url"].startswith("https://checkout.stripe.com/"), body
    assert "session_id" in body and body["session_id"].startswith("cs_test_"), body


def test_checkout_unknown_plan_is_4xx(active_token):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        json={"plan": "enterprise", "origin_url": BASE_URL},
        headers={"Authorization": f"Bearer {active_token}"},
        timeout=30,
    )
    # Pydantic pattern validator on the model returns 422; a route-level
    # unknown-plan check would return 400. Both are 4xx and NOT 5xx.
    assert 400 <= r.status_code < 500, f"expected 4xx got {r.status_code}: {r.text[:300]}"


def test_view_only_can_start_checkout(view_only_token):
    """iter256 regression: view_only user must NOT be blocked by read-only
    middleware on /payments/checkout (reactivation path)."""
    if not view_only_token:
        pytest.skip("view_only login failed")
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        json={"plan": "family", "origin_url": BASE_URL},
        headers={"Authorization": f"Bearer {view_only_token}"},
        timeout=45,
    )
    # The important guarantee is: not a 402 read-only block.
    if r.status_code == 402:
        body = r.json()
        detail = body.get("detail", body)
        assert detail.get("read_only") is not True, (
            f"view_only was blocked on /payments/checkout: {body}"
        )
    assert r.status_code == 200, f"view_only checkout got {r.status_code}: {r.text[:300]}"
    body = r.json()
    assert body.get("session_id", "").startswith("cs_test_"), body
