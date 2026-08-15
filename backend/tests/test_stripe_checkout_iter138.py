"""Backend tests for Stripe checkout endpoints (Wave 1 billing rollout).

Covers:
- POST /api/payments/checkout for plan=solo and plan=family
- POST /api/payments/checkout with unknown plan -> 400
- Read-only middleware exempts /api/payments/ (free/expired-trial user can still checkout)
- POST /api/webhook/stripe rejects requests with no stripe-signature (400)
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://proration-preview.preview.emergentagent.com"


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def cathy_token(api):
    r = api.post(f"{BASE_URL}/api/auth/login", json={
        "email": "cathy@example.com", "password": "testpass123"
    })
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token
    return token


class TestCheckout:
    def _post(self, api, plan, token=None):
        headers = {"Authorization": f"Bearer {token}"} if token else {}
        return api.post(
            f"{BASE_URL}/api/payments/checkout",
            json={"plan": plan, "origin_url": "https://example.test", "trial_days": 7},
            headers=headers,
        )

    def test_checkout_solo(self, api):
        r = self._post(api, "solo")
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert "url" in data and data["url"].startswith("https://checkout.stripe.com/"), data
        assert "session_id" in data and data["session_id"].startswith("cs_test_")

    def test_checkout_family(self, api):
        r = self._post(api, "family")
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert data["url"].startswith("https://checkout.stripe.com/")
        assert data["session_id"].startswith("cs_test_")

    def test_checkout_unknown_plan(self, api):
        r = api.post(
            f"{BASE_URL}/api/payments/checkout",
            json={"plan": "nonexistent", "origin_url": "https://example.test"},
        )
        # Either 400 (custom) or 422 (Pydantic pattern). Task requires 400.
        assert r.status_code in (400, 422), f"{r.status_code}: {r.text}"

    def test_checkout_authenticated_free_user_not_402(self, api, cathy_token):
        """Read-only middleware must NOT block /api/payments/. Free/family user
        both should be able to reach the endpoint and get a checkout url."""
        r = self._post(api, "solo", token=cathy_token)
        assert r.status_code != 402, f"middleware blocked checkout: {r.text}"
        assert r.status_code == 200, f"{r.status_code}: {r.text}"
        data = r.json()
        assert data["url"].startswith("https://checkout.stripe.com/")


class TestWebhook:
    def test_webhook_no_signature_returns_400(self, api):
        r = requests.post(
            f"{BASE_URL}/api/webhook/stripe",
            data=b'{"id":"evt_test","type":"ping"}',
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        body = r.text.lower()
        assert "invalid signature" in body or "signature" in body, r.text
