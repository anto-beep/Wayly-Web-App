"""PERMS-CAREGIVER-1 Milestone 1: household invite model + Family Members endpoints.

Covers:
- GET /api/household/members: capacity, owner role, invites vs expired split
- POST /api/household/invite: PC-D23 email-registered block (409), success (caregiver),
  invalid relationship (422), seat limit (400), Guardian legal_role_declared
- POST /api/household/invite/{token}/resend: 200 + extends expires_at
- DELETE /api/household/invite/{token}: 200 revoke; cross-household → 404
"""
import os
import time
import uuid
import requests
import pytest

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    # fallback: read /app/frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")


BASE_URL = _load_backend_url()
API = f"{BASE_URL}/api"

CATHY = ("cathy@example.com", "testpass123")
OTHER = ("trialactive@example.com", "AccessTest1!")


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login failed for {email}: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def cathy_headers():
    return {"Authorization": f"Bearer {_login(*CATHY)}"}


@pytest.fixture(scope="module")
def other_headers():
    try:
        return {"Authorization": f"Bearer {_login(*OTHER)}"}
    except AssertionError:
        pytest.skip("other user not available")


@pytest.fixture(scope="module")
def created_tokens():
    tokens = []
    yield tokens
    # Cleanup — best effort revoke
    hdrs = {"Authorization": f"Bearer {_login(*CATHY)}"}
    for t in tokens:
        try:
            requests.delete(f"{API}/household/invite/{t}", headers=hdrs, timeout=15)
        except Exception:
            pass


def _cleanup_all_pending(headers):
    """Remove any pending invites so seat-limit tests start clean."""
    r = requests.get(f"{API}/household/members", headers=headers, timeout=15)
    if r.status_code != 200:
        return
    for i in r.json().get("invites", []) or []:
        requests.delete(f"{API}/household/invite/{i['token']}", headers=headers, timeout=15)
    for i in r.json().get("expired", []) or []:
        requests.delete(f"{API}/household/invite/{i['token']}", headers=headers, timeout=15)


# ---------------- GET /household/members ----------------
class TestMembersList:
    def test_members_shape_capacity_owner_role(self, cathy_headers):
        r = requests.get(f"{API}/household/members", headers=cathy_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        # capacity block
        cap = data.get("capacity")
        assert cap is not None, "capacity missing"
        assert cap["plan"] == "family"
        assert cap["participants_included"] == 2
        assert cap["caregivers_included"] == 3
        assert cap["max_people"] == 5
        assert isinstance(cap["people_used"], int)
        assert isinstance(cap["spaces_remaining"], int)
        assert cap["spaces_remaining"] == max(0, cap["max_people"] - cap["people_used"])
        # invites vs expired arrays present
        assert isinstance(data.get("invites"), list)
        assert isinstance(data.get("expired"), list)
        # owner row role/wayly_role
        members = data.get("members") or []
        assert len(members) >= 1
        owner_row = next((m for m in members if m.get("email", "").lower() == CATHY[0]), None)
        assert owner_row is not None, "owner row missing"
        assert owner_row.get("role") == "account_holder"
        assert owner_row.get("wayly_role") == "account_holder"


# ---------------- POST /household/invite ----------------
class TestInviteCreate:
    def test_pc_d23_email_registered_returns_409(self, cathy_headers):
        # Cathy tries to invite herself — already a Wayly user
        r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                          json={"email": CATHY[0], "wayly_role": "caregiver", "relationship": "Adult child"},
                          timeout=15)
        assert r.status_code == 409, r.text
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert detail.get("code") == "email_registered"
        msg = detail.get("message", "")
        assert "already registered with Wayly" in msg
        assert "Multi-household support" in msg
        assert "support@wayly.com.au" in msg

    def test_pc_d23_email_registered_other_user(self, cathy_headers):
        # Any other registered email should also be blocked
        r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                          json={"email": "bibi@test.com", "wayly_role": "caregiver", "relationship": "Adult child"},
                          timeout=15)
        assert r.status_code == 409, r.text
        assert r.json()["detail"]["code"] == "email_registered"

    def test_invalid_relationship_returns_422(self, cathy_headers):
        r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                          json={"email": f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com",
                                "wayly_role": "caregiver", "relationship": "BestFriendForever"},
                          timeout=15)
        assert r.status_code == 422, r.text

    def test_fresh_email_caregiver_success(self, cathy_headers, created_tokens):
        _cleanup_all_pending(cathy_headers)
        email = f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                          json={"email": email, "wayly_role": "caregiver",
                                "relationship": "Adult child", "note": "Hey"},
                          timeout=20)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["status"] == "pending"
        assert inv["wayly_role"] == "caregiver"
        assert inv["relationship"] == "Adult child"
        assert inv["legal_role_declared"] is False
        assert inv["email"] == email.lower()
        assert "token" in inv and len(inv["token"]) > 10
        created_tokens.append(inv["token"])

        # GET verify persistence — appears in invites (not expired)
        r2 = requests.get(f"{API}/household/members", headers=cathy_headers, timeout=15)
        assert r2.status_code == 200
        emails = [i["email"] for i in r2.json().get("invites", [])]
        assert email.lower() in emails

    def test_guardian_sets_legal_role_declared(self, cathy_headers, created_tokens):
        email = f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                          json={"email": email, "wayly_role": "caregiver",
                                "relationship": "Guardian (legal)"},
                          timeout=20)
        assert r.status_code == 200, r.text
        inv = r.json()
        assert inv["legal_role_declared"] is True
        created_tokens.append(inv["token"])

    def test_seat_limit_caregivers_max_3(self, cathy_headers, created_tokens):
        # Clean slate then fill to 3 caregiver invites
        _cleanup_all_pending(cathy_headers)
        emails = [f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com" for _ in range(3)]
        for e in emails:
            r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                              json={"email": e, "wayly_role": "caregiver", "relationship": "Adult child"},
                              timeout=20)
            assert r.status_code == 200, f"seed invite failed: {r.text}"
            created_tokens.append(r.json()["token"])
        # 4th caregiver → 400 seat limit
        r4 = requests.post(f"{API}/household/invite", headers=cathy_headers,
                           json={"email": f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com",
                                 "wayly_role": "caregiver", "relationship": "Adult child"},
                           timeout=20)
        assert r4.status_code == 400, r4.text
        # Cleanup so later tests aren't blocked
        _cleanup_all_pending(cathy_headers)


# ---------------- resend / revoke ----------------
class TestResendRevoke:
    def test_resend_extends_expiry(self, cathy_headers):
        _cleanup_all_pending(cathy_headers)
        email = f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                          json={"email": email, "wayly_role": "caregiver", "relationship": "Sibling"},
                          timeout=20)
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        orig_exp = r.json()["expires_at"]
        time.sleep(1)
        rr = requests.post(f"{API}/household/invite/{token}/resend", headers=cathy_headers, timeout=20)
        assert rr.status_code == 200, rr.text
        body = rr.json()
        assert body.get("ok") is True
        assert body.get("expires_at") > orig_exp
        # Revoke
        rd = requests.delete(f"{API}/household/invite/{token}", headers=cathy_headers, timeout=15)
        assert rd.status_code == 200, rd.text
        # Verify removed
        rg = requests.get(f"{API}/household/members", headers=cathy_headers, timeout=15)
        emails = [i["email"] for i in rg.json().get("invites", [])]
        assert email not in emails

    def test_revoke_unknown_token_returns_404(self, cathy_headers):
        rd = requests.delete(f"{API}/household/invite/nonexistent-token-xyz", headers=cathy_headers, timeout=15)
        assert rd.status_code == 404

    def test_resend_unknown_token_returns_404(self, cathy_headers):
        rr = requests.post(f"{API}/household/invite/nonexistent-token-xyz/resend", headers=cathy_headers, timeout=15)
        assert rr.status_code == 404

    def test_cross_household_cannot_touch_token(self, cathy_headers, other_headers):
        # Cathy creates an invite; other user must not be able to resend/revoke it
        _cleanup_all_pending(cathy_headers)
        email = f"TEST_perm_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(f"{API}/household/invite", headers=cathy_headers,
                          json={"email": email, "wayly_role": "caregiver", "relationship": "Parent"},
                          timeout=20)
        if r.status_code != 200:
            pytest.skip(f"seed invite failed: {r.status_code} {r.text}")
        token = r.json()["token"]
        try:
            # Other user attempts to revoke Cathy's token — must NOT succeed.
            # If the other user has no household, backend returns 400 "No household";
            # if they have one, backend returns 404 (token not found in their household).
            rd = requests.delete(f"{API}/household/invite/{token}", headers=other_headers, timeout=15)
            assert rd.status_code in (400, 404), f"expected isolation, got {rd.status_code} {rd.text}"
            # And resend
            rr = requests.post(f"{API}/household/invite/{token}/resend", headers=other_headers, timeout=15)
            assert rr.status_code in (400, 404), f"expected isolation, got {rr.status_code} {rr.text}"
        finally:
            requests.delete(f"{API}/household/invite/{token}", headers=cathy_headers, timeout=15)
