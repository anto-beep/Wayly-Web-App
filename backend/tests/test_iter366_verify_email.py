"""iter366: Verify-email nudge suppression for test accounts + 90-day grace.

Covers the 4 backend assertions from the review request:
  1. Signup with a TEST-domain email (example.com) => email_verified=true,
     verification_deadline=null, no debug_code, grace_days=90.
  2. Signup with a REAL-domain email (gmail.com) => email_verified=false,
     verification_deadline ~90 days out, days_remaining ~89-90, grace_days=90,
     debug_code present (non-prod).
  3. Pre-existing unverified example.com account (DB email_verified=false)
     => /auth/verification-status returns email_verified=true,
     past_deadline=false, days_remaining=0 (nudge suppressed).
  4. grace_days == 90 in every verification-status response.
"""
import os
import time
import pytest
import requests

def _load_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"')
                        break
        except OSError:
            pass
    assert url, "REACT_APP_BACKEND_URL not configured"
    return url.rstrip("/")


BASE_URL = _load_backend_url()

PRE_EXISTING_UNVERIFIED_TEST = {
    "email": "verifytest+1791419681@example.com",
    "password": "VerifyTest1!",
}


def _signup(email: str, password: str = "VerifyTest1!", name: str = "QA Test",
            role: str = "caregiver", plan: str = "family") -> dict:
    r = requests.post(f"{BASE_URL}/api/auth/signup", json={
        "email": email,
        "password": password,
        "name": name,
        "role": role,
        "plan": plan,
    }, timeout=20)
    assert r.status_code in (200, 201), f"signup failed {r.status_code}: {r.text}"
    return r.json()


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in login response: {data}"
    return tok


def _status(token: str) -> dict:
    r = requests.get(f"{BASE_URL}/api/auth/verification-status",
                     headers={"Authorization": f"Bearer {token}"}, timeout=15)
    assert r.status_code == 200, f"status failed {r.status_code}: {r.text}"
    return r.json()


# --- 1. TEST-domain signup is pre-verified ---------------------------------
def test_test_domain_signup_is_preverified():
    ts = int(time.time())
    email = f"qa+{ts}@example.com"
    body = _signup(email)
    tok = body.get("token") or body.get("access_token")
    assert tok, f"no token on signup: {body}"
    st = _status(tok)
    assert st["email_verified"] is True, f"test account should be verified: {st}"
    assert st["verification_deadline"] in (None, ""), f"test account should have no deadline: {st}"
    assert st["past_deadline"] is False
    assert st["days_remaining"] == 0
    assert st["grace_days"] == 90, f"grace_days must be 90, got {st.get('grace_days')}"
    assert "debug_code" not in st, f"test account should have no debug_code: {st}"


# --- 2. REAL-domain signup gets ~90-day grace + debug_code -----------------
def test_real_domain_signup_gets_90_day_grace_and_code():
    ts = int(time.time())
    email = f"realperson{ts}@gmail.com"
    body = _signup(email)
    tok = body.get("token") or body.get("access_token")
    assert tok, f"no token on signup: {body}"
    st = _status(tok)
    assert st["email_verified"] is False, f"real account must not be auto-verified: {st}"
    assert st["verification_deadline"], f"real account must have a deadline: {st}"
    # days_remaining should be ~89-90 (grace minus a few seconds)
    assert 85 <= st["days_remaining"] <= 90, (
        f"days_remaining should be ~90 (3 months), got {st['days_remaining']}"
    )
    assert st["grace_days"] == 90
    assert st["past_deadline"] is False
    assert "debug_code" in st and st["debug_code"], (
        f"non-prod real signup must expose debug_code: {st}"
    )


# --- 3. Pre-existing unverified TEST account is now suppressed -------------
def test_pre_existing_unverified_test_account_is_suppressed():
    tok = _login(PRE_EXISTING_UNVERIFIED_TEST["email"],
                 PRE_EXISTING_UNVERIFIED_TEST["password"])
    st = _status(tok)
    assert st["email_verified"] is True, (
        f"legacy unverified example.com user must now report verified: {st}"
    )
    assert st["past_deadline"] is False
    assert st["days_remaining"] == 0
    assert st["grace_days"] == 90
    assert "debug_code" not in st


# --- 4. cathy (verified family) also shows grace_days=90 -------------------
def test_cathy_status_grace_days_90():
    tok = _login("cathy@example.com", "testpass123")
    st = _status(tok)
    assert st["grace_days"] == 90
    assert st["email_verified"] is True
