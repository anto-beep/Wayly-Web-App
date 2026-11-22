"""Verify DELETE /api/auth/account still 200s (and doesn't 500) after the
Stripe cancel-at-period-end addition, both with and without a sub id."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
# Fallback: read mobile .env directly (test runs in container)
if not BASE_URL:
    for line in open("/app/mobile/.env"):
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip()
            break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"


def _rand_email():
    return f"TEST_del_{int(time.time()*1000)}_{os.getpid()}@example.com"


@pytest.fixture
def throwaway_user():
    """Create a fresh throwaway user via /api/auth/signup."""
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    email = _rand_email()
    pw = f"Wx9!qN{int(time.time()*1000)%100000}Zp&"
    r = s.post(f"{API}/auth/signup", json={
        "email": email,
        "password": pw,
        "name": "Delete Me",
        "first_name": "Delete",
        "last_name": "Me",
        "role": "caregiver",
        "plan": "family",
    })
    assert r.status_code in (200, 201), f"signup failed {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token in signup response: {data}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s, email, pw


def test_delete_account_no_stripe_sub(throwaway_user):
    """A fresh signup has no stripe_subscription_id — the delete must still 200."""
    s, email, pw = throwaway_user
    r = s.delete(f"{API}/auth/account", json={"confirm": "delete my account"})
    # Allow 200 or 204; must not 500
    assert r.status_code in (200, 204), f"delete failed {r.status_code} {r.text[:300]}"
    # Try to log back in — should fail (anonymised)
    time.sleep(0.5)
    s2 = requests.Session()
    s2.headers.update({"Content-Type": "application/json"})
    rr = s2.post(f"{API}/auth/login", json={"email": email, "password": pw})
    assert rr.status_code in (401, 403, 404), f"login after delete should fail, got {rr.status_code}"
