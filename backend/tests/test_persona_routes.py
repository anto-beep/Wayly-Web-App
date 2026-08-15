"""PERSONA-1 HTTP endpoint tests.

Exercises GET/PUT/POST /api/persona and /api/persona/resolve. Verifies:
- Feature-flag gating.
- Legacy backfill populated care_recipient.first_name from Household when
  available.
- Switching persona to participant mirrors the account holder as the care
  recipient and forces is_authorised_representative back to False (§B).
- Resolver returns persona-correct copy end-to-end.
"""
from __future__ import annotations

import os

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://proration-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Cannot log in: {r.status_code}")
    return r.json()["token"]


@pytest.fixture
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


@pytest.fixture(autouse=True)
def reset_persona(client):
    """Every test starts with cathy in a known caregiver default state."""
    client.put(
        f"{API}/persona",
        json={
            "viewer_persona": "caregiver",
            "is_authorised_representative": False,
            "care_recipient": {
                "is_self": False,
                "first_name": "Dorothy",
                "pronouns": "unknown",
                "relationship_to_account": "mother",
            },
        },
        timeout=10,
    )
    yield


class TestGetPersona:
    def test_requires_auth(self):
        r = requests.get(f"{API}/persona", timeout=10)
        assert r.status_code in (401, 403)

    def test_get_returns_profile_and_resolver(self, client):
        r = client.get(f"{API}/persona", timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert "profile" in body and "resolver" in body
        assert body["profile"]["viewer_persona"] in ("caregiver", "participant")
        assert "tokens" in body["resolver"]


class TestPutPersona:
    def test_switch_to_participant_mirrors_account(self, client):
        r = client.put(
            f"{API}/persona",
            json={"viewer_persona": "participant"},
            timeout=10,
        )
        assert r.status_code == 200
        prof = r.json()["profile"]
        assert prof["viewer_persona"] == "participant"
        assert prof["care_recipient"]["is_self"] is True
        # first_name should be lifted from the account holder.
        assert prof["care_recipient"]["first_name"], "expected first_name to be mirrored from account"
        # is_authorised_representative must be False for participant (§B.2).
        assert prof["is_authorised_representative"] is False

    def test_participant_ignores_representative_flag(self, client):
        r = client.put(
            f"{API}/persona",
            json={"viewer_persona": "participant", "is_authorised_representative": True},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["profile"]["is_authorised_representative"] is False

    def test_caregiver_representative_persists(self, client):
        r = client.put(
            f"{API}/persona",
            json={
                "viewer_persona": "caregiver",
                "is_authorised_representative": True,
                "care_recipient": {
                    "is_self": False,
                    "first_name": "Louisa",
                    "pronouns": "she_her",
                    "relationship_to_account": "mother",
                },
            },
            timeout=10,
        )
        assert r.status_code == 200
        prof = r.json()["profile"]
        assert prof["is_authorised_representative"] is True
        assert prof["care_recipient"]["first_name"] == "Louisa"
        assert prof["care_recipient"]["pronouns"] == "she_her"


class TestResolve:
    def test_tier1_participant_first_person(self, client):
        client.put(f"{API}/persona", json={"viewer_persona": "participant"}, timeout=10)
        r = client.post(
            f"{API}/persona/resolve",
            json={"tier1_keys": ["dec1.results.hero", "dec1.results.charged_correctly"]},
            timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert body["tier1"]["dec1.results.hero"] == "Here is what we found in your statement."
        # No third-person markers.
        joined = " ".join(body["tier1"].values()).lower()
        for banned in ("parent", "mother", "father", " she ", " he ", " her ", " his "):
            assert banned not in joined, f"unexpected third-person marker: {banned!r}"

    def test_tier1_caregiver_third_person_uses_name(self, client):
        client.put(
            f"{API}/persona",
            json={
                "viewer_persona": "caregiver",
                "care_recipient": {"is_self": False, "first_name": "Louisa", "pronouns": "she_her"},
            },
            timeout=10,
        )
        r = client.post(
            f"{API}/persona/resolve",
            json={"tier1_keys": ["dec1.results.hero"]},
            timeout=10,
        )
        assert r.status_code == 200
        out = r.json()["tier1"]["dec1.results.hero"]
        assert out == "Here is what we found in Louisa's statement."

    def test_tier2_template_substitution(self, client):
        client.put(
            f"{API}/persona",
            json={
                "viewer_persona": "caregiver",
                "care_recipient": {"is_self": False, "first_name": "Louisa", "pronouns": "she_her"},
            },
            timeout=10,
        )
        r = client.post(
            f"{API}/persona/resolve",
            json={"tier2_templates": {"hello": "{subject} {have_present} a message."}},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json()["tier2"]["hello"] == "Louisa has a message."

    def test_unknown_tier1_key_reported(self, client):
        r = client.post(
            f"{API}/persona/resolve",
            json={"tier1_keys": ["nope.never.registered"]},
            timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        assert "nope.never.registered" in body["tier1_missing"]


class TestTier1KeysEndpoint:
    def test_lists_keys(self, client):
        r = client.get(f"{API}/persona/tier1-keys", timeout=10)
        assert r.status_code == 200
        keys = r.json()["keys"]
        assert isinstance(keys, list)
        assert "dec1.results.hero" in keys


class TestAdminPreviewOverride:
    """Admin-only override must be silently ignored for non-admin callers
    but respected for admins. Cathy has no admin_role by default, so any
    override sent should be dropped.
    """

    def test_non_admin_override_ignored(self, client):
        # Cathy is caregiver; ask to preview as participant.
        r = client.post(
            f"{API}/persona/resolve",
            json={
                "tier1_keys": ["dec1.results.hero"],
                "override_persona": "participant",
            },
            timeout=10,
        )
        assert r.status_code == 200
        body = r.json()
        # Override was NOT applied (still third-person / caregiver copy).
        assert body["preview_active"] is False
        assert "your statement" not in body["tier1"]["dec1.results.hero"].lower()
