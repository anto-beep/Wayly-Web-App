"""Wave 2 — Trial Paywall (402) and Trial Email Subjects backend tests.

Covers:
- HTTP 402 with body `{detail: {error: 'trial_expired', ...}}` for expired-trial
  user on paid-tool endpoints (Budget Calc, Price Check, etc.)
- Authenticated GET endpoints still return 200 (read-only mode works)
- Trial reminder email subjects verbatim match the §4.8 brief
"""

import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback for backend-only env; the frontend env var is normally present
    BASE_URL = "http://localhost:8001"

EXPIRED_EMAIL = "trial30909@example.com"
EXPIRED_PASS = "TrialPass1!"


# ---------- fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def expired_user_session(session):
    """Log in the seeded expired-trial test user. Sets Authorization Bearer."""
    r = session.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EXPIRED_EMAIL, "password": EXPIRED_PASS},
    )
    if r.status_code != 200:
        pytest.skip(
            f"Cannot login as expired-trial user ({r.status_code}): {r.text[:200]}"
        )
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if not token:
        pytest.skip(f"Login returned no token: {data}")
    session.headers.update({"Authorization": f"Bearer {token}"})
    return session


# ---------- 402 enforcement on paid tools ----------

PAID_TOOL_ENDPOINTS = [
    # Primary brief endpoint (req: "Hit POST /api/public/budget-calc with body {classification: 4}")
    ("POST", "/api/public/budget-calc", {"classification": 4}),
    # Second paid endpoint (req: "at least 2-3 of the 7 paid-tool endpoints return 402")
    ("POST", "/api/public/price-check", {"service": "cleaning", "rate": 65.0}),
]


@pytest.mark.parametrize("method,path,body", PAID_TOOL_ENDPOINTS)
def test_paid_tool_returns_402_for_expired_user(expired_user_session, method, path, body):
    url = f"{BASE_URL}{path}"
    resp = expired_user_session.request(method, url, json=body)
    assert resp.status_code == 402, (
        f"{path} expected 402 but got {resp.status_code}: {resp.text[:300]}"
    )
    payload = resp.json()
    detail = payload.get("detail", payload)
    assert detail.get("error") == "trial_expired", (
        f"{path} expected detail.error='trial_expired' but got: {detail}"
    )
    assert detail.get("upgrade_url") == "/pricing", (
        f"{path} expected upgrade_url='/pricing' but got: {detail}"
    )
    assert "message" in detail


# ---------- read endpoints still work (read-only mode) ----------

def test_auth_me_works_for_expired_user(expired_user_session):
    r = expired_user_session.get(f"{BASE_URL}/api/auth/me")
    assert r.status_code == 200, r.text[:300]
    data = r.json()
    assert data.get("email", "").lower() == EXPIRED_EMAIL.lower()


def test_billing_subscription_works_for_expired_user(expired_user_session):
    r = expired_user_session.get(f"{BASE_URL}/api/billing/subscription")
    assert r.status_code == 200, r.text[:300]


# ---------- unauth still returns 401, not 402 ----------

def test_paid_tool_returns_401_for_unauthenticated(session):
    """A clean session (no auth cookie) hitting a paid tool should get 401."""
    fresh = requests.Session()
    fresh.headers.update({"Content-Type": "application/json"})
    r = fresh.post(f"{BASE_URL}/api/public/budget-calc", json={"classification": 4})
    # 401 unauthenticated OR 429 rate-limit are both acceptable
    assert r.status_code in (401, 429), (
        f"expected 401/429 unauth but got {r.status_code}: {r.text[:300]}"
    )


# ---------- static check of trial email subjects (§4.8) ----------

def test_trial_email_subjects_verbatim():
    """Day 5 / Day 7 / Day 8 subjects exist verbatim in server.py per brief."""
    with open("/app/backend/server.py", "r", encoding="utf-8") as f:
        src = f.read()
    # process function exists
    assert "_process_trial_reminders_once" in src
    # exact subject lines from brief
    assert "Two days left in your Wayly trial" in src, "Day 5 subject missing"
    assert "Your Wayly trial ends today" in src, "Day 7 subject missing"
    assert "Your Wayly trial has ended" in src, "Day 8 subject missing"


# ---------- static check: _require_paid_plan returns 402, not 403 ----------

def test_require_paid_plan_uses_402():
    with open("/app/backend/server.py", "r", encoding="utf-8") as f:
        src = f.read()
    # locate the function
    m = re.search(
        r"async def _require_paid_plan\(.*?\) -> dict:.*?(?=\nasync def |\ndef )",
        src,
        re.DOTALL,
    )
    assert m, "_require_paid_plan not found"
    body = m.group(0)
    assert "status_code=402" in body, "expected 402 in _require_paid_plan"
    assert '"error": "trial_expired"' in body, "expected trial_expired marker"
    assert '"upgrade_url": "/pricing"' in body
