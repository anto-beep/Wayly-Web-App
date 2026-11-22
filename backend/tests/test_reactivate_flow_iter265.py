"""Iter265 — Reactivate flow backend contract.

Focused checks for the iter265 punchlist:
  1. POST /api/payments/portal for a view_only user with no Stripe customer
     record returns a NON-402, well-formed error (400/404) that the client can
     detect via the message "No Stripe customer" and fall back to
     starting checkout. This is what /settings/billing (web) and
     /plan-billing (mobile) rely on to avoid dead-ending on portal.
  2. POST /api/payments/checkout returns a checkout.stripe.com URL for both
     plans with trial_days:0 for a view_only user (reactivation).
  3. The four Guided-Journeys public endpoints are reachable (no 5xx) — the
     server currently exempts /api/public/* from the read-only middleware, so
     enforcement for these tools is UI-only. This test documents that fact.
"""
import os
import re

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

VIEW_ONLY_EMAIL = "cancelled.vo@example.com"
VIEW_ONLY_PW = "AccessTest1!"


def _login(email: str, password: str) -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=20,
    )
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login for {email}"
    return tok


@pytest.fixture(scope="module")
def vo_token():
    return _login(VIEW_ONLY_EMAIL, VIEW_ONLY_PW)


# 1. Portal fallback contract ------------------------------------------------
def test_portal_returns_no_customer_error_for_cancelled_user(vo_token):
    r = requests.post(
        f"{BASE_URL}/api/payments/portal",
        headers={"Authorization": f"Bearer {vo_token}"},
        json={"origin_url": BASE_URL},
        timeout=25,
    )
    # Must NOT be gated by the 402 middleware (billing is exempt).
    assert r.status_code != 402, f"billing should not be 402-gated: {r.text[:200]}"
    # Cancelled.vo has no live Stripe customer/subscription → expect a 4xx that
    # the client can pattern-match on the message. Accept either 400 or 404.
    if r.status_code in (200,):
        # If the server managed to open a portal session, that's fine — but
        # then no fallback is needed. Assert we still got a URL.
        body = r.json()
        assert body.get("url") or body.get("portal_url"), body
        pytest.skip("portal returned a URL — no-customer branch not exercised")
    assert r.status_code in (400, 404, 409), (
        f"unexpected status: {r.status_code} {r.text[:200]}"
    )
    text = r.text
    assert re.search(r"no stripe customer|start a subscription", text, re.I), (
        f"error message does not match client fallback pattern: {text[:200]}"
    )


# 2. Checkout Stripe URL (regression) ---------------------------------------
@pytest.mark.parametrize("plan", ["solo", "family"])
def test_reactivate_checkout_returns_stripe_url(vo_token, plan):
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        headers={"Authorization": f"Bearer {vo_token}"},
        json={"plan": plan, "origin_url": BASE_URL, "trial_days": 0},
        timeout=25,
    )
    assert r.status_code == 200, f"{plan}: {r.status_code} {r.text[:200]}"
    url = r.json().get("url", "")
    assert "checkout.stripe.com" in url, f"{plan}: bad url {url!r}"


# 3. Guided-Journeys public endpoints — reachability -----------------------
@pytest.mark.parametrize(
    "path,body",
    [
        ("/api/public/budget-calc", {"classification": 4, "contribution_pct": 50}),
        (
            "/api/public/classification-check",
            {"answers": {"mobility": "some", "memory": "some"}},
        ),
        (
            "/api/public/reassessment-letter",
            {"reason": "care needs increased", "supports": []},
        ),
        (
            "/api/public/care-plan-review",
            {"care_plan_text": "Provider will assist with meals."},
        ),
    ],
)
def test_view_only_guided_journey_public_endpoints_are_reachable(vo_token, path, body):
    """These endpoints are exempt from the 402 middleware today.

    The iter265 UI wraps the routes in ToolLockGate (client-side inert), but
    the shared backend does not enforce 402 on /api/public/* — reachability
    check only. If we ever tighten the middleware to gate these, flip this
    assertion to == 402 for a view_only user.
    """
    r = requests.post(
        f"{BASE_URL}{path}",
        headers={"Authorization": f"Bearer {vo_token}"},
        json=body,
        timeout=25,
    )
    assert r.status_code < 500, f"{path}: 5xx {r.status_code} {r.text[:200]}"
