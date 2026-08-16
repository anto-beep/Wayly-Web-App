"""Onboarding draft auto-save — live HTTP endpoint tests.

Exercises the ``GET /api/onboarding/draft``, ``PUT /api/onboarding/draft``,
``DELETE /api/onboarding/draft`` endpoints added Feb 2026 so a caregiver's
in-progress onboarding form survives a browser refresh.
"""
from __future__ import annotations

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-sweep.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD}, timeout=15)
    if r.status_code != 200:
        pytest.skip(f"Cannot log in as cathy: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture
def client(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


class TestOnboardingDraft:
    def test_get_requires_auth(self):
        r = requests.get(f"{API}/onboarding/draft", timeout=10)
        assert r.status_code in (401, 403)

    def test_get_when_no_draft(self, client):
        # Start clean.
        client.delete(f"{API}/onboarding/draft", timeout=10)
        r = client.get(f"{API}/onboarding/draft", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json() == {"draft": None}

    def test_put_and_get_round_trip(self, client):
        marker = str(uuid.uuid4())[:8]
        payload = {
            "data": {
                "tier1": {"first_name": f"Louisa-{marker}", "last_name": "Davids"},
                "step": 2,
            }
        }
        r = client.put(f"{API}/onboarding/draft", json=payload, timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["saved"] is True
        assert body["updated_at"]

        r2 = client.get(f"{API}/onboarding/draft", timeout=10)
        assert r2.status_code == 200
        draft = r2.json()["draft"]
        assert draft["data"]["tier1"]["first_name"] == f"Louisa-{marker}"
        assert draft["data"]["step"] == 2
        # cleanup
        client.delete(f"{API}/onboarding/draft", timeout=10)

    def test_put_upsert_updates_existing(self, client):
        client.put(f"{API}/onboarding/draft", json={"data": {"step": 1}}, timeout=10)
        client.put(f"{API}/onboarding/draft", json={"data": {"step": 3}}, timeout=10)
        r = client.get(f"{API}/onboarding/draft", timeout=10)
        assert r.json()["draft"]["data"]["step"] == 3
        client.delete(f"{API}/onboarding/draft", timeout=10)

    def test_delete(self, client):
        client.put(f"{API}/onboarding/draft", json={"data": {"step": 1}}, timeout=10)
        r = client.delete(f"{API}/onboarding/draft", timeout=10)
        assert r.status_code == 200
        assert r.json()["deleted"] is True

        r2 = client.get(f"{API}/onboarding/draft", timeout=10)
        assert r2.json() == {"draft": None}

    def test_reject_oversize_payload(self, client):
        big_string = "x" * 40_000
        r = client.put(f"{API}/onboarding/draft", json={"data": {"blob": big_string}}, timeout=10)
        assert r.status_code == 413
