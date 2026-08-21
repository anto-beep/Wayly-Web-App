"""Iter 205: second-participant onboarding + rotated Stripe key sanity.

Scope:
- /api/payments/checkout with the rotated key must return a real Stripe URL
  for solo AND family plans (authed) and 401 without auth.
- POST /v2/participants stub with only first_name yields requires_completion=true.
- After completing the primary + PATCHing the stub, GET /participants count
  stays constant == number of REAL participants (no duplicate created).
"""
import os
import uuid
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

STRONG_PW = "Zt9-qFm2-Kw7xLp!"


def _signup(plan="family"):
    email = f"TEST_iter205_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": STRONG_PW,
        "name": "Iter205 Tester", "first_name": "Iter205", "last_name": "Tester",
        "plan": plan,
    }, timeout=45)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token") or body.get("data", {}).get("token")
    assert token, f"no token in signup: {body}"
    return email, token


def _hdr(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Rotated Stripe key sanity ---
def test_checkout_solo_returns_real_stripe_url():
    _, token = _signup("solo")
    r = requests.post(f"{API}/payments/checkout", headers=_hdr(token),
                      json={"plan": "solo", "origin_url": BASE_URL, "trial_days": 7}, timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    url = (r.json().get("url") or r.json().get("checkout_url") or "")
    assert "checkout.stripe.com" in url, f"expected real Stripe URL, got {url!r}"


def test_checkout_family_returns_real_stripe_url():
    _, token = _signup("family")
    r = requests.post(f"{API}/payments/checkout", headers=_hdr(token),
                      json={"plan": "family", "origin_url": BASE_URL, "trial_days": 7}, timeout=45)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    url = (r.json().get("url") or r.json().get("checkout_url") or "")
    assert "checkout.stripe.com" in url, f"expected real Stripe URL, got {url!r}"


def test_checkout_unauth_rejected():
    r = requests.post(f"{API}/payments/checkout",
                      json={"plan": "family", "origin_url": BASE_URL, "trial_days": 7}, timeout=30)
    assert r.status_code in (401, 403), f"expected 401/403 anon checkout, got {r.status_code}"


# --- Second-participant stub creation ---
def test_v2_stub_participant_flags_requires_completion():
    _, token = _signup("family")
    r = requests.post(f"{API}/v2/participants", headers=_hdr(token),
                      json={"first_name": "Felix", "last_name": "",
                            "statement_format": "unknown", "is_primary": False}, timeout=30)
    assert r.status_code in (200, 201), f"stub create failed: {r.status_code} {r.text}"
    body = r.json()
    p = body.get("participant") or body
    pid = p.get("id") or body.get("id")
    assert pid, f"no id in stub response: {body}"

    # requires_completion should be True on the stub
    lst = requests.get(f"{API}/participants", headers=_hdr(token), timeout=30)
    assert lst.status_code == 200
    items = lst.json().get("items") or lst.json().get("participants") or []
    match = [x for x in items if x.get("id") == pid]
    assert match, f"stub not returned in listing: {items}"
    assert match[0].get("requires_completion") is True, f"expected requires_completion=True, got {match[0]}"


# --- Duplicate participant prevention (chained onboarding parity check) ---
def test_patch_stub_does_not_create_duplicate():
    _, token = _signup("family")
    # 1. Create stub
    stub = requests.post(f"{API}/v2/participants", headers=_hdr(token),
                         json={"first_name": "Felix", "last_name": "",
                               "statement_format": "unknown", "is_primary": False}, timeout=30)
    assert stub.status_code in (200, 201)
    pid = (stub.json().get("participant") or stub.json()).get("id") or stub.json().get("id")

    # 2. Baseline count
    before = requests.get(f"{API}/participants", headers=_hdr(token), timeout=30).json()
    before_items = before.get("items") or before.get("participants") or []
    baseline = len(before_items)
    assert baseline >= 1

    # 3. PATCH the stub with full details (mirror mobile onboarding submitParticipant)
    patch = requests.patch(f"{API}/participants/{pid}", headers=_hdr(token), json={
        "first_name": "Felix", "last_name": "Kowalski", "dob": "1950-06-15",
        "pension_status": "full_pension", "classification_level": 3,
        "provider_name": "BlueBerry Care", "statement_delivery": "email",
        "authorisation_confirmed": True,
    }, timeout=30)
    assert patch.status_code in (200, 204), f"patch failed: {patch.status_code} {patch.text}"

    # 4. Count stays the same — NO new participant
    after = requests.get(f"{API}/participants", headers=_hdr(token), timeout=30).json()
    after_items = after.get("items") or after.get("participants") or []
    assert len(after_items) == baseline, f"duplicate created: before={baseline}, after={len(after_items)}"

    # 5. And the stub now has the full name
    match = [x for x in after_items if x.get("id") == pid]
    assert match and match[0].get("last_name") == "Kowalski"
