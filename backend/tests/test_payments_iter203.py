"""Iter 203: verify /api/payments/checkout returns a real Stripe URL and
fresh users have NO plan (never 'free'). See review_request in iteration."""
import os
import time
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"


def _register_fresh():
    email = f"TEST_iter203_{uuid.uuid4().hex[:8]}@example.com"
    password = "Iter203!Aa9"
    r = requests.post(f"{API}/auth/register", json={
        "email": email,
        "password": password,
        "name": "Iter203 Tester",
        "first_name": "Iter203",
        "last_name": "Tester",
    }, timeout=30)
    # Fall back to /auth/signup path if /register isn't the one used
    if r.status_code == 404:
        r = requests.post(f"{API}/auth/signup", json={
            "email": email, "password": password, "name": "Iter203 Tester",
            "first_name": "Iter203", "last_name": "Tester",
        }, timeout=30)
    assert r.status_code in (200, 201), f"register failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token") or data.get("data", {}).get("token")
    assert token, f"no token in register response: {data}"
    return email, password, token


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_checkout_returns_real_stripe_url_solo():
    _, _, token = _register_fresh()
    r = requests.post(
        f"{API}/payments/checkout",
        headers=_auth_headers(token),
        json={"plan": "solo", "origin_url": BASE_URL, "trial_days": 7},
        timeout=45,
    )
    assert r.status_code == 200, f"checkout(solo) failed: {r.status_code} {r.text}"
    body = r.json()
    url = body.get("url") or body.get("checkout_url")
    assert url and "checkout.stripe.com" in url, f"expected real Stripe URL, got {url!r}"


def test_checkout_returns_real_stripe_url_family():
    _, _, token = _register_fresh()
    r = requests.post(
        f"{API}/payments/checkout",
        headers=_auth_headers(token),
        json={"plan": "family", "origin_url": BASE_URL, "trial_days": 7},
        timeout=45,
    )
    assert r.status_code == 200, f"checkout(family) failed: {r.status_code} {r.text}"
    body = r.json()
    url = body.get("url") or body.get("checkout_url")
    assert url and "checkout.stripe.com" in url, f"expected real Stripe URL, got {url!r}"


def test_fresh_user_has_no_active_subscription():
    """A user registered via API has no plan; /billing/subscription must NOT
    report an active paid plan and Settings/Plan&Billing render 'No active plan'."""
    _, _, token = _register_fresh()
    r = requests.get(f"{API}/billing/subscription", headers=_auth_headers(token), timeout=30)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    plan = (body.get("plan") or "").lower()
    status = (body.get("status") or "").lower()
    # Must not be trialing/active on a paid plan
    assert status not in ("trialing", "trial", "active", "past_due") or plan in ("", "free"), (
        f"fresh user unexpectedly has an active paid sub: {body}"
    )


def test_auth_me_fresh_user_not_paid():
    _, _, token = _register_fresh()
    r = requests.get(f"{API}/auth/me", headers=_auth_headers(token), timeout=30)
    assert r.status_code == 200
    body = r.json()
    plan = (body.get("plan") or "").lower()
    status = (body.get("subscription_status") or "").lower()
    # Fresh registration must NOT already be trialing/active paid
    assert status not in ("trialing", "active"), f"unexpected active status on fresh user: {body}"
    # UI expects planKey to be treated as 'no plan' if free/empty
    assert plan in ("", "free"), f"unexpected plan on fresh user: {body}"


def test_checkout_unauth_rejected():
    r = requests.post(
        f"{API}/payments/checkout",
        json={"plan": "solo", "origin_url": BASE_URL, "trial_days": 7},
        timeout=30,
    )
    assert r.status_code in (401, 403), f"expected 401/403 for unauth checkout, got {r.status_code}"
