"""Iteration 76 — verify admin override for /persona/resolve.

Uses mongo directly to grant/revoke `admin_role` on cathy so we can exercise
the admin-only preview path. Cleans up unconditionally in teardown.
"""
from __future__ import annotations

import os
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def db():
    mc = MongoClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    return mc[os.environ.get("DB_NAME", "test_database")]


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


@pytest.fixture
def admin_cathy(db):
    """Grant admin_role temporarily on cathy; ALWAYS unset in teardown."""
    db.users.update_one({"email": CATHY_EMAIL}, {"$set": {"admin_role": "super_admin"}})
    yield
    db.users.update_one({"email": CATHY_EMAIL}, {"$unset": {"admin_role": ""}})


class TestAdminOverridePath:
    def test_non_admin_override_ignored(self, client, db):
        # Ensure cathy has no admin_role first
        db.users.update_one({"email": CATHY_EMAIL}, {"$unset": {"admin_role": ""}})
        # Ensure known caregiver-with-name state
        client.put(f"{API}/persona", json={
            "viewer_persona": "caregiver",
            "care_recipient": {"is_self": False, "first_name": "Dorothy", "pronouns": "unknown", "relationship_to_account": "mother"},
        }, timeout=10)
        r = client.post(f"{API}/persona/resolve", json={
            "tier1_keys": ["dec1.results.hero"],
            "override_persona": "participant",
        }, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["preview_active"] is False
        hero = body["tier1"]["dec1.results.hero"]
        assert "your statement" not in hero.lower(), f"non-admin override should not apply, got: {hero}"

    def test_admin_override_applied(self, client, admin_cathy):
        r = client.post(f"{API}/persona/resolve", json={
            "tier1_keys": ["dec1.results.hero"],
            "override_persona": "participant",
        }, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["preview_active"] is True, f"expected preview_active=True, body={body}"
        hero = body["tier1"]["dec1.results.hero"]
        assert "your statement" in hero.lower(), f"expected first-person copy, got: {hero}"

    def test_admin_override_caregiver_with_name(self, client, admin_cathy):
        r = client.post(f"{API}/persona/resolve", json={
            "tier1_keys": ["dec1.results.hero"],
            "override_persona": "caregiver",
            "override_first_name": "Louisa",
            "override_pronouns": "she_her",
        }, timeout=10)
        assert r.status_code == 200
        body = r.json()
        assert body["preview_active"] is True
        assert body["tier1"]["dec1.results.hero"] == "Here is what we found in Louisa's statement."

    def test_admin_role_unset_after_teardown(self, db):
        # Sanity — belt and suspenders that our teardown works
        doc = db.users.find_one({"email": CATHY_EMAIL})
        assert doc is not None
        assert not doc.get("admin_role"), f"admin_role should be unset, but found: {doc.get('admin_role')}"
