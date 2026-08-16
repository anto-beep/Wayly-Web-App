"""Iteration 10 RETEST — verify 3 fixes from iter9.

Fixes under test:
1. POST /household/invite now returns 402 plan_required for Solo BEFORE 400 household check.
2. Notifications bell endpoints still work (smoke).
3. Cathy login + digest smoke still works.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CATHY = {"email": "cathy@example.com", "password": "testpass123"}


@pytest.fixture(scope="session")
def cathy_auth():
    r = requests.post(f"{API}/auth/login", json=CATHY, timeout=30)
    assert r.status_code == 200, f"cathy login failed: {r.status_code} {r.text[:300]}"
    return {"Authorization": f"Bearer {r.json()['token']}"}


def _signup(plan: str = "solo"):
    email = f"test{uuid.uuid4().hex[:10]}@example.com"
    payload = {
        "name": "Iter10 Tester",
        "email": email,
        "password": "Test1234!",
        "role": "caregiver",
        "plan": plan,
    }
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text[:300]}"
    return email, r.json()["token"]


# ---- FIX 1: plan-gate ordering on /household/invite ----
def test_invite_solo_no_household_returns_402_plan_required():
    """Solo plan user with NO household should now get 402 plan_required
    (previously 400 'Create a household first')."""
    _, tok = _signup(plan="solo")
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(
        f"{API}/household/invite",
        json={"email": "x@example.com", "role": "family_member"},
        headers=h, timeout=30,
    )
    assert r.status_code == 402, f"expected 402, got {r.status_code} {r.text[:300]}"
    detail = r.json().get("detail") or {}
    if isinstance(detail, dict):
        assert detail.get("code") == "plan_required", f"expected code=plan_required, got {detail}"


def test_invite_free_no_household_returns_402_plan_required():
    _, tok = _signup(plan="free")
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(
        f"{API}/household/invite",
        json={"email": "x@example.com", "role": "family_member"},
        headers=h, timeout=30,
    )
    assert r.status_code == 402, f"expected 402, got {r.status_code} {r.text[:300]}"


def test_invite_family_plan_still_works(cathy_auth):
    """Cathy (Family w/ household) should succeed or hit member cap (400)."""
    r = requests.post(
        f"{API}/household/invite",
        json={"email": f"friend{uuid.uuid4().hex[:8]}@example.com", "role": "family_member"},
        headers=cathy_auth, timeout=30,
    )
    assert r.status_code in (200, 400), f"{r.status_code} {r.text[:300]}"


# ---- FIX 2 / Smoke: notifications ----
def test_notifications_list_cathy(cathy_auth):
    r = requests.get(f"{API}/notifications", headers=cathy_auth, timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert "items" in body and "unread" in body
    assert isinstance(body["unread"], int)


def test_notifications_mark_all_read(cathy_auth):
    r = requests.post(f"{API}/notifications/read", json={"ids": []}, headers=cathy_auth, timeout=30)
    assert r.status_code == 200
    assert r.json().get("ok") is True
    r2 = requests.get(f"{API}/notifications", headers=cathy_auth, timeout=30)
    assert r2.json()["unread"] == 0


def test_digest_send_creates_notification_increasing_unread(cathy_auth):
    # Mark all read first
    requests.post(f"{API}/notifications/read", json={"ids": []}, headers=cathy_auth, timeout=30)
    before = requests.get(f"{API}/notifications", headers=cathy_auth, timeout=30).json()
    assert before["unread"] == 0
    # Send a digest — should create a weekly_digest notification for sender
    r = requests.post(f"{API}/digest/send", headers=cathy_auth, timeout=60)
    assert r.status_code == 200, r.text[:400]
    after = requests.get(f"{API}/notifications", headers=cathy_auth, timeout=30).json()
    # Unread should have gone up (bell badge must show a number)
    assert after["unread"] >= 1, f"expected unread>=1 after digest/send, got {after['unread']}"


# ---- Smoke: digest preview ----
def test_digest_preview_smoke(cathy_auth):
    r = requests.get(f"{API}/digest/preview", headers=cathy_auth, timeout=30)
    assert r.status_code == 200
    body = r.json()
    for key in ("household_id", "wellbeing", "anomalies"):
        assert key in body


# ---- Smoke: auth/me ----
def test_cathy_me(cathy_auth):
    r = requests.get(f"{API}/auth/me", headers=cathy_auth, timeout=30)
    assert r.status_code == 200
    assert r.json()["email"] == "cathy@example.com"
    assert r.json().get("plan") == "family"
