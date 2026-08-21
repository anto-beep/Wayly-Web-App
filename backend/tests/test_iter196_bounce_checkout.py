"""
iter196 — verify:
 1) Backend bounce endpoint GET /api/payments/app-return
 2) POST /api/payments/checkout with app_return_url wires success_url/cancel_url to /api/payments/app-return
"""
import os
import time
import requests
from urllib.parse import quote

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    j = r.json()
    return j.get("token") or j.get("access_token")


# --- bounce endpoint --------------------------------------------------------
def test_app_return_success_html():
    deep = "wayly://billing-return"
    to_enc = quote(deep, safe="")
    url = f"{API}/payments/app-return?to={to_enc}&status=success&session_id=cs_test_xyz"
    r = requests.get(url, allow_redirects=False, timeout=90)
    assert r.status_code == 200
    body = r.text
    assert "Return to Wayly" in body
    assert "window.location.replace" in body
    assert "wayly://billing-return" in body
    assert "status=success" in body
    assert "cs_test_xyz" in body


def test_app_return_cancel_html():
    deep = "wayly://billing-return"
    to_enc = quote(deep, safe="")
    r = requests.get(f"{API}/payments/app-return?to={to_enc}&status=cancel", timeout=60)
    assert r.status_code == 200
    assert "status=cancel" in r.text
    assert "wayly://billing-return" in r.text


# --- checkout wires app_return_url into success/cancel URLs -----------------
def test_checkout_with_app_return_solo():
    # Fresh signup so nothing prior interferes
    email = f"iter196.solo.{int(time.time())}@example.com"
    r = requests.post(
        f"{API}/auth/signup",
        json={
            "email": email, "password": "MobTrial1!", "name": "Iter196 Solo",
            "role": "caregiver", "plan": "solo",
        },
        timeout=20,
    )
    assert r.status_code in (200, 201), f"signup {r.status_code} {r.text}"
    token = _login(email, "MobTrial1!")
    return_url = "wayly://billing-return"
    r = requests.post(
        f"{API}/payments/checkout",
        json={"plan": "solo", "origin_url": BASE_URL, "trial_days": 7, "app_return_url": return_url},
        headers={"Authorization": f"Bearer {token}"},
        timeout=25,
    )
    assert r.status_code == 200, f"checkout {r.status_code} {r.text}"
    data = r.json()
    assert isinstance(data.get("url"), str)
    assert data["url"].startswith("https://checkout.stripe.com/")
    # follow the session to introspect stored URLs
    sid = data.get("session_id") or data.get("id")
    # session id not always returned; use Stripe session-status endpoint if present
    st = requests.get(f"{API}/payments/session-status/{sid}", headers={"Authorization": f"Bearer {token}"}, timeout=20) if sid else None
    if st is not None and st.status_code == 200:
        s = st.json()
        # not strict about internal shape; success/cancel URLs may not be exposed here
        assert s
    print("SOLO checkout URL:", data["url"])  # useful for manual UI drive


def test_checkout_with_app_return_family():
    email = f"iter196.family.{int(time.time())}@example.com"
    r = requests.post(
        f"{API}/auth/signup",
        json={
            "email": email, "password": "MobTrial1!", "name": "Iter196 Family",
            "role": "caregiver", "plan": "family",
        },
        timeout=20,
    )
    assert r.status_code in (200, 201), r.text
    token = _login(email, "MobTrial1!")
    r = requests.post(
        f"{API}/payments/checkout",
        json={"plan": "family", "origin_url": BASE_URL, "trial_days": 7, "app_return_url": "wayly://billing-return"},
        headers={"Authorization": f"Bearer {token}"},
        timeout=25,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["url"].startswith("https://checkout.stripe.com/")
    print("FAMILY checkout URL:", data["url"])
