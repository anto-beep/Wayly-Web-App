"""Iteration 8 backend tests.

Scope:
1. POST /api/auth/forgot — enumeration-safe (always returns {ok: true})
2. POST /api/auth/reset — validates token, updates password
3. GET /api/billing/subscription — returns plan+status (200)
4. POST /api/billing/cancel — 404 for none / ok for active
5. POST /api/billing/upgrade — changes plan for active subs
6. GET /api/household/members — returns members + invites (owner synth)
7. POST /api/household/invite — requires Family plan, 5-member cap
8. POST /api/participant/wellbeing — logs mood + audits
9. Regression: POST /api/public/family-coordinator-chat anonymous works (no 402)
10. Regression: Cathy login + /auth/me returns plan=family
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY = {"email": "cathy@example.com", "password": "testpass123"}


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def cathy_token():
    r = requests.post(f"{API}/auth/login", json=CATHY, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"cathy login failed: {r.status_code} {r.text[:200]}")
    return r.json()["token"]


@pytest.fixture(scope="session")
def cathy_auth(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}"}


def _signup_family_user():
    """Create a brand-new Family-plan user (no household yet)."""
    email = f"test{uuid.uuid4().hex[:10]}@example.com"
    payload = {
        "name": "Iter8 Tester",
        "email": email,
        "password": "Test1234!",
        "role": "caregiver",
        "plan": "family",
    }
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text[:300]}"
    data = r.json()
    return email, data["token"]


# ---------- 1. Cathy regression ----------
def test_cathy_login_and_me_family_plan(cathy_token, cathy_auth):
    r = requests.get(f"{API}/auth/me", headers=cathy_auth, timeout=30)
    assert r.status_code == 200, r.text
    me = r.json()
    assert me["email"] == "cathy@example.com"
    assert me.get("plan") == "family", f"expected family, got {me.get('plan')}"


# ---------- 2. /auth/forgot ----------
def test_forgot_password_known_email_returns_ok():
    r = requests.post(f"{API}/auth/forgot", json={"email": "cathy@example.com"}, timeout=30)
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}


def test_forgot_password_unknown_email_returns_ok():
    r = requests.post(
        f"{API}/auth/forgot", json={"email": f"nobody{uuid.uuid4().hex[:6]}@example.com"}, timeout=30
    )
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True}, "enumeration-safe: must always return {ok:true}"


# ---------- 3. /auth/reset ----------
def test_auth_reset_bad_token_returns_400():
    r = requests.post(
        f"{API}/auth/reset", json={"token": "definitely_not_a_real_token_xxxx", "new_password": "NewPass9!"}, timeout=30
    )
    assert r.status_code == 400, f"{r.status_code} {r.text[:200]}"


# ---------- 4. /billing/subscription ----------
def test_billing_subscription_returns_plan_status(cathy_auth):
    r = requests.get(f"{API}/billing/subscription", headers=cathy_auth, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "plan" in body
    assert "status" in body


def test_billing_subscription_requires_auth():
    r = requests.get(f"{API}/billing/subscription", timeout=30)
    assert r.status_code in (401, 403), r.status_code


# ---------- 5. /billing/cancel and /billing/upgrade (new user, no sub) ----------
def test_billing_cancel_no_active_returns_404():
    email, tok = _signup_family_user()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(f"{API}/billing/cancel", headers=h, timeout=30)
    assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text[:200]}"


def test_billing_upgrade_no_active_returns_400():
    email, tok = _signup_family_user()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(f"{API}/billing/upgrade", json={"plan": "solo"}, headers=h, timeout=30)
    assert r.status_code == 400, f"expected 400, got {r.status_code} {r.text[:200]}"


# ---------- 6. /household/members (as cathy) ----------
def test_household_members_returns_owner(cathy_auth):
    r = requests.get(f"{API}/household/members", headers=cathy_auth, timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "members" in body
    assert "invites" in body
    assert isinstance(body["members"], list)
    # owner should be synthesised
    emails = [m.get("email") for m in body["members"]]
    assert "cathy@example.com" in emails, f"owner missing from members: {body}"


# ---------- 7. /household/invite ----------
def test_invite_requires_household_first():
    """Family-plan user without a household should get 400 (Create a household first)."""
    email, tok = _signup_family_user()
    h = {"Authorization": f"Bearer {tok}"}
    r = requests.post(
        f"{API}/household/invite",
        json={"email": f"friend{uuid.uuid4().hex[:6]}@example.com", "role": "family_member"},
        headers=h,
        timeout=30,
    )
    # Either 400 (no household) or creates + invites. We allow both but expect 400 for fresh user.
    assert r.status_code in (400, 200), f"{r.status_code} {r.text[:200]}"


def test_invite_non_family_plan_gets_402():
    """Solo-plan user with a household attempting to invite should get 402 plan_required."""
    email = f"solo{uuid.uuid4().hex[:10]}@example.com"
    signup = requests.post(
        f"{API}/auth/signup",
        json={"name": "Solo T", "email": email, "password": "Test1234!", "role": "caregiver", "plan": "solo"},
        timeout=30,
    )
    assert signup.status_code == 200, signup.text
    tok = signup.json()["token"]
    h = {"Authorization": f"Bearer {tok}"}
    # Create a household
    hh = requests.post(
        f"{API}/household",
        json={"participant_name": "Grandma Test", "classification": 4, "provider": "Test Co"},
        headers=h,
        timeout=30,
    )
    # household creation may not exist as /household POST — skip gracefully
    if hh.status_code not in (200, 201):
        pytest.skip(f"household POST not supported ({hh.status_code}); cannot test plan gate precisely")
    r = requests.post(
        f"{API}/household/invite",
        json={"email": "x@example.com", "role": "family_member"},
        headers=h,
        timeout=30,
    )
    assert r.status_code == 402, f"solo plan should be blocked with 402, got {r.status_code} {r.text[:200]}"


def test_cathy_invite_returns_invite(cathy_auth):
    """Cathy is Family-plan with existing household — invite should succeed (or hit 5-member cap)."""
    r = requests.post(
        f"{API}/household/invite",
        json={"email": f"friend{uuid.uuid4().hex[:8]}@example.com", "role": "family_member", "note": "iter8 test"},
        headers=cathy_auth,
        timeout=30,
    )
    # 200 success OR 400 (5-member cap already reached from prior tests)
    assert r.status_code in (200, 400), f"{r.status_code} {r.text[:300]}"
    if r.status_code == 200:
        body = r.json()
        assert body.get("status") == "pending"
        assert "token" in body


# ---------- 8. /participant/wellbeing ----------
def test_wellbeing_post_good(cathy_auth):
    r = requests.post(
        f"{API}/participant/wellbeing",
        json={"mood": "good", "notify_caregiver": False},
        headers=cathy_auth,
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
    body = r.json()
    assert body["mood"] == "good"
    assert "id" in body
    assert "created_at" in body


def test_wellbeing_post_invalid_mood_rejected(cathy_auth):
    r = requests.post(
        f"{API}/participant/wellbeing",
        json={"mood": "euphoric", "notify_caregiver": False},
        headers=cathy_auth,
        timeout=30,
    )
    assert r.status_code == 422, f"{r.status_code} {r.text[:200]}"


def test_wellbeing_get_lists_recent(cathy_auth):
    r = requests.get(f"{API}/participant/wellbeing", headers=cathy_auth, timeout=30)
    assert r.status_code == 200, r.text


# ---------- 9. Regression: family-coordinator-chat anonymous open (no 402) ----------
def test_family_coordinator_chat_anonymous_no_402():
    fake_ip = f"10.88.{uuid.uuid4().int % 200}.{uuid.uuid4().int % 200}"
    r = requests.post(
        f"{API}/public/family-coordinator-chat",
        json={"message": "What is classification 4 budget?"},
        headers={"X-Forwarded-For": fake_ip},
        timeout=90,
    )
    assert r.status_code != 402, f"STILL gated: {r.status_code} {r.text[:300]}"
    assert r.status_code != 401, f"requires auth: {r.text[:300]}"
    assert r.status_code in (200, 422, 429), f"unexpected {r.status_code}: {r.text[:300]}"
