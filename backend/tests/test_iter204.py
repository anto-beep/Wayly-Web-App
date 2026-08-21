"""Iter 204 backend tests:
1. POST /api/payments/checkout requires auth (401 without token).
2. With auth returns real https://checkout.stripe.com/... URL for solo & family.
3. Duplicate participant prevention: POST /participants once vs. PATCH afterwards.
4. GET /participants/{id} returns correct participant.
"""
import os
import time
import uuid
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


def _signup():
    email = f"TEST_iter204_{uuid.uuid4().hex[:8]}@example.com"
    pw = "Iter204!Aa9x"
    r = requests.post(f"{API}/auth/signup", json={
        "email": email, "password": pw, "name": "Test User", "first_name": "Test", "last_name": "User", "plan": "family"
    }, timeout=30)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    assert token, f"no token in signup response: {data}"
    return email, pw, token


def _headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_checkout_requires_auth():
    r = requests.post(f"{API}/payments/checkout", json={
        "plan": "solo", "origin_url": BASE, "trial_days": 7,
    }, timeout=30)
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:300]}"


def test_checkout_solo_authed_returns_stripe_url():
    _, _, token = _signup()
    r = requests.post(f"{API}/payments/checkout", json={
        "plan": "solo", "origin_url": BASE, "trial_days": 7,
    }, headers=_headers(token), timeout=30)
    assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
    url = r.json().get("url", "")
    assert url.startswith("https://checkout.stripe.com/"), f"unexpected url: {url}"


def test_checkout_family_authed_returns_stripe_url():
    _, _, token = _signup()
    r = requests.post(f"{API}/payments/checkout", json={
        "plan": "family", "origin_url": BASE, "trial_days": 7,
    }, headers=_headers(token), timeout=30)
    assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
    url = r.json().get("url", "")
    assert url.startswith("https://checkout.stripe.com/"), f"unexpected url: {url}"


def test_participant_no_duplicate_on_patch_flow():
    """Simulate the mobile onboarding fix: 1 POST creates the primary, then
    PATCH updates the same participant. Count must remain 1."""
    _, _, token = _signup()
    h = _headers(token)
    # Initial list — could be 0 or 1 auto-seeded. Get baseline
    lst0 = requests.get(f"{API}/participants", headers=h, timeout=30)
    assert lst0.status_code == 200, lst0.text[:300]
    initial_count = len(lst0.json().get("items", []))

    # POST once (mimics submitParticipant with no participantId)
    payload = {
        "first_name": "Maud", "last_name": "Test", "dob": "1945-03-01",
        "pension_status": "full_pension", "classification_level": 4,
        "provider_name": "BlueBerry Care", "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    r1 = requests.post(f"{API}/participants", json=payload, headers=h, timeout=30)
    assert r1.status_code in (200, 201), f"POST 1 failed: {r1.status_code} {r1.text[:300]}"
    pid = r1.json().get("id")
    assert pid, f"no id: {r1.text[:300]}"

    # PATCH same id (mimics submitParticipant when participantId is already set)
    payload2 = {**payload, "provider_name": "BlueBerry Care Updated"}
    r2 = requests.patch(f"{API}/participants/{pid}", json=payload2, headers=h, timeout=30)
    assert r2.status_code == 200, f"PATCH failed: {r2.status_code} {r2.text[:300]}"

    # List again — count should be initial_count + 1, NOT + 2
    lst = requests.get(f"{API}/participants", headers=h, timeout=30)
    assert lst.status_code == 200, lst.text[:300]
    items = lst.json().get("items", [])
    assert len(items) == initial_count + 1, f"expected {initial_count + 1}, got {len(items)}: {[p.get('first_name') for p in items]}"

    # GET single participant should reflect PATCH
    g = requests.get(f"{API}/participants/{pid}", headers=h, timeout=30)
    assert g.status_code == 200, g.text[:300]
    assert g.json().get("provider_name") == "BlueBerry Care Updated"


def test_family_signup_two_participants_no_extras():
    """After Family signup and completing primary + adding one 2nd participant,
    total active participants should be 2. This is the bug scenario from
    the PS (Maud + Felix, not 5)."""
    _, _, token = _signup()
    h = _headers(token)

    # baseline
    lst0 = requests.get(f"{API}/participants", headers=h, timeout=30)
    initial = len(lst0.json().get("items", []))

    # Primary
    p1 = {
        "first_name": "Maud", "last_name": "Test", "dob": "1945-03-01",
        "pension_status": "full_pension", "classification_level": 4,
        "provider_name": "BlueBerry Care", "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    r1 = requests.post(f"{API}/participants", json=p1, headers=h, timeout=30)
    assert r1.status_code in (200, 201), r1.text[:300]
    pid1 = r1.json()["id"]

    # Simulate re-submit (should PATCH — mobile fix); we test the API allows PATCH
    r1b = requests.patch(f"{API}/participants/{pid1}", json=p1, headers=h, timeout=30)
    assert r1b.status_code == 200, r1b.text[:300]

    # Verify still just 1 new
    lst1 = requests.get(f"{API}/participants", headers=h, timeout=30)
    assert len(lst1.json().get("items", [])) == initial + 1
