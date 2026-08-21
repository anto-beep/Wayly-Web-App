"""iter201 — POST /api/payments/change-plan + /sync-plan-to-participants regression.

Per env note in the review request: preview env has no live Stripe webhooks, and
most seeded users lack a real stripe_subscription_id. Expected outcomes:
- 401 when unauthenticated
- 422 on invalid target_plan
- 400 "No active subscription on record." when user has no live sub
- 409 on downgrade attempt (family user calling target_plan=solo) — but only if
  user has an active sub; without one we still get 400. We test that separately
  by seeding a minimal fake subscription retrieval path is not possible → assert
  the 400 code path is wired.
- /payments/sync-plan-to-participants: still reachable, returns 200 with
  {ok:false, reason:"no_active_subscription"} for accounts without a live sub.
"""
from __future__ import annotations

import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")

CATHY = ("cathy@example.com", "testpass123")
SOLO = ("mobpay.solo@example.com", "MobPay1!")


def _login(email: str, password: str) -> str | None:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=15)
    if r.status_code != 200:
        return None
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def cathy_token():
    tok = _login(*CATHY)
    if not tok:
        pytest.skip("cathy login unavailable")
    return tok


@pytest.fixture(scope="module")
def solo_token():
    tok = _login(*SOLO)
    if not tok:
        pytest.skip("mobpay.solo login unavailable")
    return tok


# --- /payments/change-plan -------------------------------------------------

class TestChangePlan:
    def test_unauthenticated_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/payments/change-plan", json={"target_plan": "family"}, timeout=15)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text[:200]}"

    def test_invalid_target_plan_returns_422(self, cathy_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/change-plan",
            json={"target_plan": "adviser"},
            headers={"Authorization": f"Bearer {cathy_token}"},
            timeout=15,
        )
        assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"

    def test_missing_target_plan_returns_422(self, cathy_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/change-plan",
            json={},
            headers={"Authorization": f"Bearer {cathy_token}"},
            timeout=15,
        )
        assert r.status_code == 422

    def test_no_active_subscription_returns_400_solo(self, solo_token):
        """mobpay.solo has no real Stripe subscription in preview env → 400."""
        r = requests.post(
            f"{BASE_URL}/api/payments/change-plan",
            json={"target_plan": "family"},
            headers={"Authorization": f"Bearer {solo_token}"},
            timeout=20,
        )
        # Preview env limitation: no live sub → 400 wired path
        assert r.status_code in (400, 409), f"expected 400 (no sub) or 409 (downgrade), got {r.status_code}: {r.text[:200]}"
        if r.status_code == 400:
            assert "No active subscription" in r.text or "subscription" in r.text.lower()

    def test_family_user_downgrade_attempt(self, cathy_token):
        """cathy is family; calling target_plan=solo is a downgrade attempt.
        Without a live Stripe sub in preview env → 400 (no_active_subscription).
        With one → 409 (downgrade blocked). Both paths mean the endpoint is wired."""
        r = requests.post(
            f"{BASE_URL}/api/payments/change-plan",
            json={"target_plan": "solo"},
            headers={"Authorization": f"Bearer {cathy_token}"},
            timeout=20,
        )
        assert r.status_code in (400, 409), f"expected 400 or 409, got {r.status_code}: {r.text[:200]}"


# --- /payments/sync-plan-to-participants regression -------------------------

class TestSyncPlanRegression:
    def test_unauthenticated_returns_401(self):
        r = requests.post(f"{BASE_URL}/api/payments/sync-plan-to-participants", timeout=15)
        assert r.status_code == 401

    def test_sync_returns_no_active_subscription_for_solo(self, solo_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/sync-plan-to-participants",
            headers={"Authorization": f"Bearer {solo_token}"},
            timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        # Either "no_active_subscription" (no live sub) or a real sync result.
        assert "ok" in body
        if body["ok"] is False:
            assert body.get("reason") == "no_active_subscription"

    def test_sync_reachable_for_family_user(self, cathy_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/sync-plan-to-participants",
            headers={"Authorization": f"Bearer {cathy_token}"},
            timeout=20,
        )
        assert r.status_code == 200
        body = r.json()
        assert "ok" in body


# --- /payments/prices sanity ---------------------------------------------

def test_prices_endpoint_reachable():
    r = requests.get(f"{BASE_URL}/api/payments/prices", timeout=15)
    # 200 when Stripe configured, 503 when not. Either proves the router is mounted.
    assert r.status_code in (200, 503), f"unexpected {r.status_code}: {r.text[:200]}"
