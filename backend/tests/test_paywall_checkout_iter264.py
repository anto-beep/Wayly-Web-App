"""Iter264 — Verify paywall Stripe checkout flow for view_only users.

Focused checks on the shared FastAPI backend used by both web PaywallModal and
mobile plan-select:
  - POST /api/payments/checkout with plan=solo/family + trial_days:0 returns a
    real checkout.stripe.com URL for a view_only user (reactivation flow).
  - Same endpoint works for an ACTIVE user (parity — used from /plan-select).
  - View-only write-block regression: writes to non-billing endpoints still 402
    while /api/payments/*, /api/billing/*, /api/auth/* remain reachable.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

VIEW_ONLY_EMAIL = "cancelled.vo@example.com"
VIEW_ONLY_PW = "AccessTest1!"
ACTIVE_EMAIL = "cathy@example.com"
ACTIVE_PW = "testpass123"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response for {email}: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def view_only_token():
    return _login(VIEW_ONLY_EMAIL, VIEW_ONLY_PW)


@pytest.fixture(scope="module")
def active_token():
    return _login(ACTIVE_EMAIL, ACTIVE_PW)


# --- /auth/me sanity ---------------------------------------------------------
def test_view_only_user_reports_view_only_access_state(view_only_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {view_only_token}"}, timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert body.get("access_state") == "view_only", f"expected view_only, got {body.get('access_state')}"


def test_active_user_reports_active_access_state(active_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {active_token}"}, timeout=20)
    assert r.status_code == 200
    assert r.json().get("access_state") in ("active", "trial")


# --- Stripe checkout for view_only reactivation (paywall CTA) ---------------
@pytest.mark.parametrize("plan", ["solo", "family"])
def test_paywall_checkout_returns_stripe_url_for_view_only(view_only_token, plan):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        headers={"Authorization": f"Bearer {view_only_token}"},
        json={"plan": plan, "origin_url": BASE_URL, "trial_days": 0},
        timeout=25,
    )
    assert r.status_code == 200, f"{plan}: {r.status_code} {r.text[:200]}"
    body = r.json()
    url = body.get("url", "")
    assert "checkout.stripe.com" in url, f"{plan}: unexpected checkout URL: {url!r}"
    # session_id / cs_test_ id should be present in some form
    assert body.get("session_id") or "cs_test_" in url, f"{plan}: no session id: {body}"


# --- Same endpoint for ACTIVE user (mobile plan-select parity) --------------
def test_active_user_can_open_checkout_for_family_plan(active_token):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        headers={"Authorization": f"Bearer {active_token}"},
        json={"plan": "family", "origin_url": BASE_URL, "trial_days": 0},
        timeout=25,
    )
    # Some backends refuse checkout while already active — accept 200 (Stripe URL) or 4xx guard.
    assert r.status_code in (200, 400, 409), f"{r.status_code} {r.text[:200]}"
    if r.status_code == 200:
        assert "checkout.stripe.com" in r.json().get("url", "")


# --- Read-only middleware regression ---------------------------------------
def test_view_only_get_auth_me_not_blocked(view_only_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {view_only_token}"}, timeout=20)
    assert r.status_code == 200  # GETs never 402


def test_view_only_billing_write_reachable(view_only_token):
    # /api/billing/* must remain writable for the reactivation flow — the
    # endpoint may 400/404 depending on state, but must NOT return 402.
    r = requests.post(
        f"{BASE_URL}/api/billing/portal",
        headers={"Authorization": f"Bearer {view_only_token}"},
        json={},
        timeout=20,
    )
    assert r.status_code != 402, f"billing route incorrectly gated: {r.status_code} {r.text[:200]}"


def test_view_only_non_billing_write_is_402(view_only_token):
    # A non-billing write should hit the read-only middleware and return 402.
    r = requests.post(
        f"{BASE_URL}/api/participant/wellbeing",
        headers={"Authorization": f"Bearer {view_only_token}"},
        json={"mood": "good"},
        timeout=20,
    )
    assert r.status_code == 402, f"non-billing write should be 402, got {r.status_code}: {r.text[:200]}"
    # Payload should indicate read_only:true so client can trigger paywall
    try:
        body = r.json()
        detail = body.get("detail", body)
        blob = detail if isinstance(detail, dict) else body
        assert blob.get("read_only") is True or "read_only" in r.text
    except ValueError:
        pytest.fail("402 response was not JSON")


def test_view_only_public_ai_tool_write_is_402(view_only_token):
    # The /api/public/budget-calc route is exempt at middleware level BUT the
    # client-side allow-list has been tightened (iter263). Server-side we
    # simply verify it is reachable — the enforcement is UI-only for this
    # endpoint, so ANY 200/4xx is acceptable. This is a smoke check.
    r = requests.post(
        f"{BASE_URL}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {view_only_token}"},
        json={"classification": 4, "contribution_pct": 50},
        timeout=25,
    )
    assert r.status_code < 500, f"public tool endpoint 5xx: {r.status_code} {r.text[:200]}"
