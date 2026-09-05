"""ITER271 — verify:
1. POST /payments/sync-plan-to-participants returns {ok:false,reason:'no_active_subscription'} for cathy (no real Stripe sub), NOT a 500.
2. Household invites v3 accept relationship/wayly_role/note and the members list returns the expected shape (members, invites, capacity, pending_approvals).
3. Household invite resend + revoke work.
"""
import os
import time
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-web-sync-35.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


def _login():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("token") or j.get("access_token")


def _h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def test_sync_plan_no_500_for_no_stripe_sub():
    tok = _login()
    r = requests.post(f"{API}/payments/sync-plan-to-participants", headers=_h(tok), timeout=60)
    # Must NOT be 500 (the sub.items bug); expected 200 with ok=false OR 200 with ok=true if there is now a sub.
    assert r.status_code == 200, f"unexpected {r.status_code}: {r.text}"
    body = r.json()
    assert "ok" in body
    if body.get("ok") is False:
        assert body.get("reason") == "no_active_subscription", body


def test_household_members_shape():
    tok = _login()
    r = requests.get(f"{API}/household/members", headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "members" in body
    assert "invites" in body
    assert "capacity" in body
    assert "pending_approvals" in body
    assert isinstance(body["members"], list)
    assert isinstance(body["invites"], list)
    assert isinstance(body["pending_approvals"], list)


def test_household_invite_v3_with_relationship_and_note():
    tok = _login()
    email = f"test_iter271_{int(time.time())}@example.com"
    r = requests.post(
        f"{API}/household/invite",
        headers=_h(tok),
        json={"email": email, "wayly_role": "caregiver", "relationship": "Adult child", "note": "test note"},
        timeout=30,
    )
    assert r.status_code in (200, 201), r.text
    body = r.json()
    # Grab token from members list for resend/revoke
    m = requests.get(f"{API}/household/members", headers=_h(tok), timeout=30).json()
    invites = [i for i in m.get("invites", []) if i.get("email") == email]
    assert invites, f"invite not visible in list: {m}"
    inv = invites[0]
    assert inv.get("relationship") == "Adult child"
    token = inv["token"]

    # Resend
    r2 = requests.post(f"{API}/household/invite/{token}/resend", headers=_h(tok), timeout=30)
    assert r2.status_code in (200, 202), r2.text

    # Revoke
    r3 = requests.delete(f"{API}/household/invite/{token}", headers=_h(tok), timeout=30)
    assert r3.status_code in (200, 204), r3.text

    # Verify gone
    m2 = requests.get(f"{API}/household/members", headers=_h(tok), timeout=30).json()
    left = [i for i in m2.get("invites", []) if i.get("email") == email]
    assert not left, f"invite still present after revoke: {left}"
