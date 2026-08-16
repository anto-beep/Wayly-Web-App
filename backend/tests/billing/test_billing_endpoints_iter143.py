"""Contract tests for BILLING-UI-1 v5 / STRIPE-CONFIG-1 v4 endpoints (iter 143)."""
import os
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-exact-parity.preview.emergentagent.com").rstrip("/")

CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"


def _login():
    r = requests.post(f"{BASE}/api/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("access_token") or r.json().get("token")
    assert token
    return token


def test_prices_public_no_500():
    r = requests.get(f"{BASE}/api/payments/prices", timeout=90)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "prices" in data
    assert "fallback_env" in data
    assert isinstance(data["prices"], dict)
    assert isinstance(data["fallback_env"], dict)


def test_proration_preview_requires_auth():
    # Send valid body so we test auth (not body validation)
    r = requests.post(f"{BASE}/api/payments/proration-preview", json={"target_plan": "family"}, timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text}"


def test_proration_preview_no_subscription():
    tok = _login()
    r = requests.post(
        f"{BASE}/api/payments/proration-preview",
        json={"target_plan": "family"},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # available may be true if cathy has a sub; but if not, must degrade gracefully
    if body.get("available") is False:
        assert body.get("reason") == "no_active_subscription"


def test_sync_plan_requires_auth():
    r = requests.post(f"{BASE}/api/payments/sync-plan-to-participants", json={}, timeout=30)
    assert r.status_code in (401, 403)


def test_sync_plan_no_subscription():
    tok = _login()
    r = requests.post(
        f"{BASE}/api/payments/sync-plan-to-participants",
        json={},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    if body.get("ok") is False:
        assert body.get("reason") in ("no_active_subscription", "no_change_needed", "no_customer")


def test_reconciliation_report_requires_auth():
    r = requests.get(f"{BASE}/api/payments/reconciliation-report", timeout=30)
    assert r.status_code in (401, 403)


def test_reconciliation_report_authed():
    tok = _login()
    r = requests.get(
        f"{BASE}/api/payments/reconciliation-report",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "drift" in body
    assert isinstance(body["drift"], list)


def test_checkout_returns_stripe_url():
    tok = _login()
    r = requests.post(
        f"{BASE}/api/payments/checkout",
        json={"plan": "solo"},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=60,
    )
    # Accept 200 with URL, or a graceful 4xx if user already has active sub
    if r.status_code == 200:
        body = r.json()
        url = body.get("url") or body.get("checkout_url")
        assert url, f"no url in response: {body}"
        assert "checkout.stripe.com" in url or "stripe.com" in url, url
    else:
        assert r.status_code < 500, f"checkout 5xx: {r.status_code} {r.text}"
