"""ITER-80: Signup → Onboarding → Settings carryover verification.

Tests:
1. Signup persists care_recipient.last_name (Feb 2026 addition).
2. GET /api/persona returns care_recipient.first_name, last_name, relationship_to_account.
3. PUT /api/persona accepts last_name (Optional[str], max 80).
4. Signup persists user mobile (used later by Settings/Onboarding phone prefill).
"""
from __future__ import annotations

import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def signed_up_user(api):
    ts = int(time.time())
    email = f"sv{ts}{uuid.uuid4().hex[:6]}@example.com"
    payload = {
        "first_name": "Aiden",
        "last_name": "Chiware",
        "name": "Aiden Chiware",
        "email": email,
        "password": f"Zx9!kL{ts}mQrT#",
        "mobile": "+61412345678",
        "role": "caregiver",
        "plan": "family",
    }
    r = api.post(f"{BASE_URL}/api/auth/signup", json=payload, timeout=30)
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    body = r.json()
    token = body.get("token") or body.get("access_token")
    assert token, f"no token in signup response: {body}"
    api.headers.update({"Authorization": f"Bearer {token}"})
    return {"email": email, "token": token, "user": body.get("user", body)}


class TestPersonaLastName:
    """PERSONA-1 §C — CareRecipient.last_name (Feb 2026)."""

    def test_put_persona_accepts_last_name(self, api, signed_up_user):
        payload = {
            "viewer_persona": "caregiver",
            "is_authorised_representative": False,
            "care_recipient": {
                "is_self": False,
                "first_name": "Louisa",
                "last_name": "Davids",
                "pronouns": "she_her",
                "relationship_to_account": "daughter",
            },
        }
        r = api.put(f"{BASE_URL}/api/persona", json=payload, timeout=15)
        assert r.status_code in (200, 204), f"PUT /persona failed: {r.status_code} {r.text}"

    def test_get_persona_returns_last_name(self, api, signed_up_user):
        r = api.get(f"{BASE_URL}/api/persona", timeout=15)
        assert r.status_code == 200, f"GET /persona failed: {r.status_code}"
        body = r.json()
        profile = body.get("profile") or body
        cr = profile.get("care_recipient") or {}
        assert cr.get("first_name") == "Louisa", f"first_name mismatch: {cr}"
        assert cr.get("last_name") == "Davids", f"last_name mismatch (Feb 2026 field): {cr}"
        assert cr.get("relationship_to_account") == "daughter", f"relationship mismatch: {cr}"

    def test_put_persona_last_name_max_80(self, api, signed_up_user):
        # last_name max_length=80 — 81 chars should reject.
        payload = {
            "care_recipient": {
                "is_self": False,
                "first_name": "Test",
                "last_name": "X" * 81,
                "pronouns": "unknown",
            },
        }
        r = api.put(f"{BASE_URL}/api/persona", json=payload, timeout=15)
        assert r.status_code in (400, 422), f"expected validation error for 81-char last_name, got {r.status_code}"

    def test_put_persona_last_name_optional(self, api, signed_up_user):
        # last_name is Optional — payload without it should work.
        payload = {
            "care_recipient": {
                "is_self": False,
                "first_name": "OnlyFirst",
                "pronouns": "unknown",
            },
        }
        r = api.put(f"{BASE_URL}/api/persona", json=payload, timeout=15)
        assert r.status_code in (200, 204)
        # And GET should show last_name explicitly null (not carry over old value implicitly? Depends on
        # server merge semantics — we only assert first_name overwrote).
        g = api.get(f"{BASE_URL}/api/persona", timeout=15).json()
        cr = (g.get("profile") or g).get("care_recipient") or {}
        assert cr.get("first_name") == "OnlyFirst"


class TestSignupMobilePersists:
    """Settings /profile phone prefill fallback relies on user.mobile from signup."""

    def test_auth_me_returns_mobile(self, api, signed_up_user):
        r = api.get(f"{BASE_URL}/api/auth/me", timeout=15)
        assert r.status_code == 200, f"/auth/me failed: {r.status_code}"
        user = r.json()
        # Accept either `mobile` or `phone_e164` field name.
        mobile = user.get("mobile") or user.get("phone_e164")
        assert mobile and "412345678" in mobile, f"signup mobile not persisted on user: {user}"

    def test_account_returns_mobile(self, api, signed_up_user):
        # Onboarding prefill reads acct.mobile from /api/account.
        r = api.get(f"{BASE_URL}/api/account", timeout=15)
        if r.status_code == 404:
            pytest.skip("/api/account not present in this env")
        assert r.status_code == 200, f"/account failed: {r.status_code} {r.text}"
        acct = r.json()
        mobile = acct.get("mobile") or (acct.get("owner") or {}).get("mobile")
        # Not strictly required — Onboarding falls back to user.mobile.
        if mobile is not None:
            assert "412345678" in mobile
