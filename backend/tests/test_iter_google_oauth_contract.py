"""Iter (June 2026) — POST /api/auth/google endpoint contract + regression tests.

Cannot mint a real Google ID token in an automated test, so we validate:
  (a) empty body -> 422
  (b) invalid credential -> 401 "Could not verify Google sign-in"
  (c) endpoint exists (no 404) and does not 500 on well-formed but invalid input
Plus regression: existing email/password login + signup still work.
"""
import os
import time
import uuid
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://statement-checker-3.preview.emergentagent.com"
API = f"{BASE_URL}/api"


# ---- /api/auth/google contract ----------------------------------------------

def test_auth_google_empty_body_returns_422():
    r = requests.post(f"{API}/auth/google", json={}, timeout=30)
    assert r.status_code == 422, f"expected 422 on empty body, got {r.status_code}: {r.text[:200]}"


def test_auth_google_missing_credential_field_returns_422():
    r = requests.post(f"{API}/auth/google", json={"plan": "solo"}, timeout=30)
    assert r.status_code == 422, f"expected 422 when credential missing, got {r.status_code}"


def test_auth_google_short_credential_returns_422():
    # Field(min_length=10) — under 10 chars is a validation error, not 401.
    r = requests.post(f"{API}/auth/google", json={"credential": "abc"}, timeout=30)
    assert r.status_code == 422, f"expected 422 for too-short credential, got {r.status_code}"


def test_auth_google_invalid_credential_returns_401():
    """A well-formed length but bogus JWT string must be rejected as 401."""
    bogus = "eyJhbGciOiJSUzI1NiJ9." + "A" * 40 + "." + "B" * 40  # looks like a JWT but signature is garbage
    r = requests.post(f"{API}/auth/google", json={"credential": bogus}, timeout=30)
    assert r.status_code == 401, f"expected 401 for invalid token, got {r.status_code}: {r.text[:200]}"
    body = r.json()
    detail = body.get("detail", "")
    assert "Google" in detail or "verify" in detail.lower(), f"unexpected detail: {detail!r}"


def test_auth_google_endpoint_not_404_and_not_500():
    r = requests.post(f"{API}/auth/google", json={"credential": "x" * 32}, timeout=30)
    assert r.status_code != 404, "endpoint /api/auth/google should exist"
    assert r.status_code < 500, f"endpoint should not 500 on invalid input, got {r.status_code}: {r.text[:200]}"


# ---- Regression: email/password login ---------------------------------------

def test_login_cathy_email_password_still_works():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    assert "token" in body and isinstance(body["token"], str) and len(body["token"]) > 20
    assert "user" in body
    assert body["user"].get("email") == "cathy@example.com"


def test_login_cathy_token_works_on_me():
    login = requests.post(
        f"{API}/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=30,
    )
    assert login.status_code == 200
    token = login.json()["token"]
    me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert me.status_code == 200
    assert me.json().get("email") == "cathy@example.com"


def test_login_wrong_password_returns_401():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "cathy@example.com", "password": "not-the-password"},
        timeout=30,
    )
    assert r.status_code == 401


# ---- Regression: email/password signup --------------------------------------

def test_signup_email_password_creates_user_and_returns_token():
    suffix = f"{int(time.time())}_{uuid.uuid4().hex[:6]}"
    email = f"TEST_googletest_{suffix}@example.com"
    payload = {
        "email": email,
        "password": f"Wayly!GoT-{suffix[:8]}",
        "name": "Google Test",
        "first_name": "Google",
        "last_name": "Test",
        "role": "caregiver",
        "plan": "family",
    }
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text[:300]}"
    body = r.json()
    assert "token" in body
    assert body["user"]["email"] == email.lower()
