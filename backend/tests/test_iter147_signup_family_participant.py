"""
Iter 147 — Participant + Family signup bug fix verification.

Covers:
 - POST /api/auth/signup with role=participant, plan=family
 - POST /api/v2/participants with is_primary=false pre-creates stub w/o primary
 - GET /api/v2/participants?include_removed=true returns stub as ACTIVE, is_primary=false
 - POST /api/participants (batch2) with pre-existing non-primary stub → new participant becomes primary
 - Exactly one participant is_primary=true after both created
 - Default is_primary derivation (no is_primary → True when no participants exist, else False)
 - is_primary=true when primary already exists must NOT downgrade the primary
"""
import os
import time
import requests
import pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


def _uniq_email(tag: str = "iter147") -> str:
    return f"autotest+{tag}-{int(time.time()*1000)}@example.com"


@pytest.fixture(scope="module")
def signup_participant_family():
    """Signup a new user with role=participant plan=family and return token+user."""
    email = _uniq_email("pf")
    r = requests.post(f"{API}/auth/signup", json={
        "email": email,
        "password": "TestPass!2026",
        "name": "John Test",
        "first_name": "John",
        "last_name": "Test",
        "role": "participant",
        "plan": "family",
    }, timeout=30)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and data["user"]["email"] == email
    return {"token": data["token"], "user": data["user"], "email": email}


def _auth(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


class TestSignupFix:
    def test_signup_creates_participant_family_user(self, signup_participant_family):
        s = signup_participant_family
        assert s["user"]["role"] == "participant"
        assert s["user"]["plan"] == "family"

    def test_v2_participants_create_stub_is_primary_false(self, signup_participant_family):
        tok = signup_participant_family["token"]
        # Create Caren as second participant BEFORE the primary exists
        r = requests.post(f"{API}/v2/participants", headers=_auth(tok), json={
            "first_name": "Caren",
            "last_name": "",
            "statement_format": "unknown",
            "is_primary": False,
        }, timeout=15)
        assert r.status_code == 200, f"v2 participants create failed: {r.status_code} {r.text}"
        p = r.json().get("participant") or r.json()
        # Response might be wrapped; try both
        if "is_primary" not in p and "participant" in r.json():
            p = r.json()["participant"]
        assert p["is_primary"] is False, f"stub should NOT be primary, got: {p}"
        assert p["first_name"] == "Caren"

    def test_v2_participants_list_includes_caren_active_non_primary(self, signup_participant_family):
        tok = signup_participant_family["token"]
        r = requests.get(f"{API}/v2/participants?include_removed=true",
                         headers=_auth(tok), timeout=15)
        assert r.status_code == 200
        items = r.json().get("items") or r.json().get("participants") or []
        caren = [p for p in items if p.get("first_name") == "Caren"]
        assert len(caren) >= 1, f"Caren not in list: {items}"
        assert caren[0].get("status") == "ACTIVE"
        assert caren[0].get("is_primary") is False
        # No primary should exist yet
        primaries = [p for p in items if p.get("is_primary") is True]
        assert len(primaries) == 0, f"unexpected primary present: {primaries}"


class TestBatch2PrimaryKeeping:
    """After Caren stub (is_primary=False) exists in v2, creating a batch2 participant
    for the primary user's own profile must set is_primary=True (primary-slot open)."""

    def test_batch2_add_participant_becomes_primary(self, signup_participant_family):
        tok = signup_participant_family["token"]
        # batch2 requires a household — create it first
        rh = requests.post(f"{API}/household", headers=_auth(tok), json={
            "participant_name": "John Test",
            "classification": 4,
            "provider_name": "TestProvider",
            "relationship": "self",
        }, timeout=15)
        assert rh.status_code == 200, f"household create failed: {rh.status_code} {rh.text}"

        # Now POST /api/participants (this is participant_profile router, which
        # shadows the batch2 endpoint at this path). Uses the Tier1 mandatory schema.
        rp = requests.post(f"{API}/participants", headers=_auth(tok), json={
            "first_name": "John",
            "last_name": "Test",
            "dob": "1950-01-01",
            "classification_level": 4,
            "pension_status": "full_pension",
            "provider_name": "TestProvider",
            "statement_delivery": "email",
            "authorisation_confirmed": True,
        }, timeout=15)
        assert rp.status_code in (200, 201), f"batch2 participants create failed: {rp.status_code} {rp.text}"
        newp = rp.json()
        assert newp.get("is_primary") is True, (
            f"batch2 new participant should become primary since no primary existed, got: {newp}"
        )

    def test_batch2_list_exactly_one_primary(self, signup_participant_family):
        tok = signup_participant_family["token"]
        r = requests.get(f"{API}/participants", headers=_auth(tok), timeout=15)
        assert r.status_code == 200
        items = r.json().get("items") or []
        primaries = [p for p in items if p.get("is_primary")]
        assert len(primaries) == 1, f"expected exactly 1 primary, got {len(primaries)}: {items}"


class TestV2ParticipantContract:
    """Independent account for contract tests."""

    @pytest.fixture(scope="class")
    def user2(self):
        email = _uniq_email("v2c")
        r = requests.post(f"{API}/auth/signup", json={
            "email": email,
            "password": "TestPass!2026",
            "name": "Alice Two",
            "role": "participant",
            "plan": "family",
        }, timeout=30)
        assert r.status_code == 200
        return r.json()["token"]

    def test_default_no_field_first_participant_is_primary(self, user2):
        r = requests.post(f"{API}/v2/participants", headers=_auth(user2), json={
            "first_name": "First",
            "statement_format": "unknown",
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        p = body.get("participant") or body
        if isinstance(p, dict) and "is_primary" not in p and "participant" in body:
            p = body["participant"]
        assert p["is_primary"] is True

    def test_default_no_field_second_participant_defaults_false(self, user2):
        r = requests.post(f"{API}/v2/participants", headers=_auth(user2), json={
            "first_name": "Second",
            "statement_format": "unknown",
        }, timeout=15)
        assert r.status_code == 200
        body = r.json()
        p = body.get("participant") or body
        assert p["is_primary"] is False

    def test_is_primary_true_does_not_downgrade_existing_primary(self, user2):
        # A primary "First" already exists. Try to create a third with is_primary=true.
        r = requests.post(f"{API}/v2/participants", headers=_auth(user2), json={
            "first_name": "Third",
            "statement_format": "unknown",
            "is_primary": True,
        }, timeout=15)
        assert r.status_code == 200
        body = r.json()
        p = body.get("participant") or body
        assert p["is_primary"] is False, "must NOT downgrade existing primary"

        # Verify only "First" is still primary
        rl = requests.get(f"{API}/v2/participants?include_removed=true",
                          headers=_auth(user2), timeout=15)
        items = rl.json().get("items") or rl.json().get("participants") or []
        primaries = [x for x in items if x.get("is_primary")]
        assert len(primaries) == 1
        assert primaries[0]["first_name"] == "First"
