"""ITER-81 regression: signup carryover exposes first/last/mobile everywhere,
and PUT /api/persona (participant self) preserves both first_name AND last_name.

Verifies iter-80 fixes:
  1. UserPublic returns first_name, last_name, mobile on:
     - POST /api/auth/signup
     - POST /api/auth/login
     - GET  /api/auth/me
  2. PUT /api/persona with viewer_persona='participant' + is_self=true → returned
     profile.care_recipient contains BOTH first_name AND last_name copied from user doc.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
STRONG_PW = "X9!kLpQr2vW#nzY7"


def _unique_email(prefix="iter81"):
    return f"{prefix}_{int(time.time() * 1000)}@example.com"


@pytest.fixture(scope="module")
def participant_signup():
    """Sign up a participant (plan=solo) so trial-middleware allows writes."""
    email = _unique_email("iter81p")
    payload = {
        "email": email,
        "password": STRONG_PW,
        "name": "Alex Rivera",
        "first_name": "Alex",
        "last_name": "Rivera",
        "mobile": "+61412345678",
        "role": "participant",
        "plan": "solo",
    }
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=30)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    return {
        "email": email,
        "password": STRONG_PW,
        "token": data["token"],
        "user": data["user"],
        "raw": data,
    }


@pytest.fixture(scope="module")
def caregiver_signup():
    email = _unique_email("iter81c")
    payload = {
        "email": email,
        "password": STRONG_PW,
        "name": "Sam Carter",
        "first_name": "Sam",
        "last_name": "Carter",
        "mobile": "+61498765432",
        "role": "caregiver",
        "plan": "family",
    }
    r = requests.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=30)
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text[:400]}"
    data = r.json()
    return {
        "email": email,
        "password": STRONG_PW,
        "token": data["token"],
        "user": data["user"],
    }


# -------- FEATURE 1: UserPublic surfaces first_name/last_name/mobile --------

class TestUserPublicCarryover:

    def test_signup_response_includes_first_last_mobile(self, participant_signup):
        u = participant_signup["user"]
        assert u.get("first_name") == "Alex"
        assert u.get("last_name") == "Rivera"
        assert u.get("mobile") == "+61412345678"

    def test_auth_me_includes_first_last_mobile(self, participant_signup):
        headers = {"Authorization": f"Bearer {participant_signup['token']}"}
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("first_name") == "Alex"
        assert u.get("last_name") == "Rivera"
        assert u.get("mobile") == "+61412345678"

    def test_login_response_includes_first_last_mobile(self, participant_signup):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"email": participant_signup["email"], "password": participant_signup["password"]},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # In case MFA is enabled it might return requires_mfa; but for a fresh acct it's not.
        assert "user" in data, f"login did not return user object: {data}"
        u = data["user"]
        assert u.get("first_name") == "Alex"
        assert u.get("last_name") == "Rivera"
        assert u.get("mobile") == "+61412345678"

    def test_caregiver_signup_also_includes_carryover(self, caregiver_signup):
        u = caregiver_signup["user"]
        assert u.get("first_name") == "Sam"
        assert u.get("last_name") == "Carter"
        assert u.get("mobile") == "+61498765432"


# -------- FEATURE 2: PUT /api/persona (participant self) preserves last_name --------

class TestPersonaParticipantLastName:

    def test_put_persona_participant_preserves_last_name(self, participant_signup):
        headers = {"Authorization": f"Bearer {participant_signup['token']}"}
        # Participant mirrors themselves
        put_body = {
            "viewer_persona": "participant",
            "is_authorised_representative": False,
            "care_recipient": {
                "is_self": True,
                "first_name": "Alex",
                "last_name": "Rivera",
                "pronouns": "unknown",
                "relationship_to_account": None,
            },
        }
        r = requests.put(f"{BASE_URL}/api/persona", json=put_body, headers=headers, timeout=15)
        assert r.status_code == 200, f"PUT persona failed: {r.status_code} {r.text[:400]}"
        data = r.json()
        care = data.get("profile", {}).get("care_recipient", {})
        assert care.get("first_name") == "Alex", f"first_name lost: {care}"
        assert care.get("last_name") == "Rivera", f"last_name stripped (regression): {care}"

    def test_get_persona_after_put_still_has_both_names(self, participant_signup):
        headers = {"Authorization": f"Bearer {participant_signup['token']}"}
        r = requests.get(f"{BASE_URL}/api/persona", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        care = r.json().get("profile", {}).get("care_recipient", {})
        assert care.get("first_name") == "Alex"
        assert care.get("last_name") == "Rivera"
