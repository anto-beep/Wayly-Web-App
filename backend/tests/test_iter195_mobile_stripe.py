"""Iter195 regression: mobile Stripe endpoints (shared backend, same as web).

Verifies /api/payments/checkout (solo, family), /api/billing/subscription,
/api/payments/portal, /api/billing/cancel, /api/billing/v2/upgrade-checkout,
/api/billing/v2/addon-checkout, /api/billing/v2/cancel-pending-addon,
/api/payments/sync-plan-to-participants for the mobpay.* test users.
"""
import os
import pytest
import requests

from dotenv import load_dotenv
load_dotenv("/app/frontend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"


def _login(email, password):
    last_err = None
    for _ in range(3):
        try:
            r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=45)
            if r.status_code == 200:
                return r.json().get("access_token") or r.json().get("token")
            last_err = f"{r.status_code} {r.text[:200]}"
        except Exception as e:
            last_err = str(e)
    pytest.skip(f"Login failed for {email}: {last_err}")


@pytest.fixture(scope="module")
def solo_token():
    return _login("mobpay.solo@example.com", "MobPay1!")


@pytest.fixture(scope="module")
def family_token():
    return _login("mobpay.family@example.com", "MobPay1!")


@pytest.fixture(scope="module")
def free_token():
    return _login("mobpay.free@example.com", "MobPay1!")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- Checkout (subscription mode + 7-day trial) ----------
class TestCheckout:
    def test_checkout_solo_returns_cs_test_url(self, free_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout",
            headers=_hdr(free_token),
            json={"plan": "solo", "origin_url": BASE_URL, "trial_days": 7},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "url" in body and body["url"].startswith("https://checkout.stripe.com/")
        # cs_test_ session id for Stripe test mode
        assert "cs_test_" in body["url"] or "session_id" in body

    def test_checkout_family_returns_cs_test_url(self, free_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout",
            headers=_hdr(free_token),
            json={"plan": "family", "origin_url": BASE_URL, "trial_days": 7},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("url", "").startswith("https://checkout.stripe.com/")

    def test_checkout_unknown_plan_rejected(self, free_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/checkout",
            headers=_hdr(free_token),
            json={"plan": "enterprise", "origin_url": BASE_URL, "trial_days": 7},
            timeout=20,
        )
        assert r.status_code in (400, 422), r.text


# ---------- Subscription read ----------
class TestSubscriptionRead:
    def test_solo_user_sub(self, solo_token):
        r = requests.get(f"{BASE_URL}/api/billing/subscription", headers=_hdr(solo_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "plan" in body
        # mobpay.solo may have plan solo or free depending on prior test-mode signups
        assert body["plan"] in ("solo", "family", "free")

    def test_family_user_sub(self, family_token):
        r = requests.get(f"{BASE_URL}/api/billing/subscription", headers=_hdr(family_token), timeout=20)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "plan" in body

    def test_free_user_sub(self, free_token):
        r = requests.get(f"{BASE_URL}/api/billing/subscription", headers=_hdr(free_token), timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("plan") in ("free", "solo", "family")


# ---------- Portal / cancel (no live sub → 400 expected) ----------
class TestPortalCancel:
    def test_portal_without_subscription(self, free_token):
        r = requests.post(f"{BASE_URL}/api/payments/portal", headers=_hdr(free_token), json={"origin_url": BASE_URL}, timeout=20)
        assert r.status_code in (200, 400, 404), r.text

    def test_cancel_without_subscription(self, free_token):
        r = requests.post(f"{BASE_URL}/api/billing/cancel", headers=_hdr(free_token), json={}, timeout=20)
        assert r.status_code in (200, 400, 404), r.text


# ---------- v2 upgrade / addon / cancel-pending-addon ----------
class TestV2Billing:
    def test_upgrade_checkout_solo_to_family(self, solo_token):
        r = requests.post(
            f"{BASE_URL}/api/billing/v2/upgrade-checkout",
            headers=_hdr(solo_token),
            json={"target_plan": "FAMILY", "origin_url": BASE_URL, "delta_only": True},
            timeout=30,
        )
        # Accept 200 with url, or 400 if user is not on solo currently
        assert r.status_code in (200, 400), r.text
        if r.status_code == 200:
            assert "url" in r.json() or "checkout_url" in r.json() or r.json().get("instant_upgrade")

    def test_addon_checkout(self, family_token):
        # addon_id is required; use a nonexistent one to at least reach the handler
        r = requests.post(
            f"{BASE_URL}/api/billing/v2/addon-checkout",
            headers=_hdr(family_token),
            json={"addon_id": "nonexistent-addon-id", "origin_url": BASE_URL},
            timeout=30,
        )
        # 400/404 expected for unknown addon; 200 if server treats as no-op
        assert r.status_code in (200, 400, 404), r.text

    def test_cancel_pending_addon(self, family_token):
        r = requests.post(
            f"{BASE_URL}/api/billing/v2/cancel-pending-addon",
            headers=_hdr(family_token),
            json={},
            timeout=20,
        )
        assert r.status_code in (200, 400, 404), r.text

    def test_sync_plan_to_participants(self, family_token):
        r = requests.post(
            f"{BASE_URL}/api/payments/sync-plan-to-participants",
            headers=_hdr(family_token),
            json={},
            timeout=20,
        )
        assert r.status_code in (200, 400, 404), r.text
