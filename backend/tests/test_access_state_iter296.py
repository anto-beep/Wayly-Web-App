"""Iter 296 — Verify /api/auth/me access_state for the four fixture accounts.

Expectations:
  cathy@example.com/testpass123           -> active
  cancelled.vo@example.com/AccessTest1!    -> view_only
  trialactive@example.com/AccessTest1!     -> trial
  trial30909@example.com/TrialPass1!       -> view_only (expired trial legacy fallback)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-6.preview.emergentagent.com").rstrip("/")

FIXTURES = [
    ("cathy@example.com", "testpass123", "active"),
    ("cancelled.vo@example.com", "AccessTest1!", "view_only"),
    ("trialactive@example.com", "AccessTest1!", "trial"),
    ("trial30909@example.com", "TrialPass1!", "view_only"),
]


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.mark.parametrize("email,password,expected", FIXTURES)
def test_access_state(email, password, expected):
    token = _login(email, password)
    me = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=30)
    assert me.status_code == 200, me.text[:200]
    data = me.json()
    actual = data.get("access_state")
    assert actual == expected, f"{email}: expected access_state={expected}, got {actual}. sub={data.get('subscription_status')} plan={data.get('plan')} trial_ends_at={data.get('trial_ends_at')}"
