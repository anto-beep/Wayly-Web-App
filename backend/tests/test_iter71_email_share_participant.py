"""Wayly iteration 71 backend tests.

Covers:
- Email-change flow (POST/GET/DELETE change-request, GET change-confirm)
- Participant share-link flow (POST/GET/POST rotate/DELETE + public shared view)
- Participant PATCH with extended onboarding fields

Run:
    pytest /app/backend/tests/test_iter71_email_share_participant.py -v \
        --junitxml=/app/test_reports/pytest/iter71.xml
"""
from __future__ import annotations

import os
import time
import uuid
import secrets
from datetime import datetime, timezone, timedelta

import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-exact-parity.preview.emergentagent.com").rstrip("/")
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

USER_EMAIL = "trial30909@example.com"
USER_PASSWORD = "TrialPass1!"


# -----------------------------
# Fixtures
# -----------------------------
@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def db():
    return MongoClient(MONGO_URL)[DB_NAME]


@pytest.fixture(scope="module")
def user_ctx(api, db):
    # Ensure user email is trial30909@example.com in case a previous test drift-changed it.
    original_email = USER_EMAIL
    u = db.users.find_one({"email": original_email})
    if not u:
        # try to restore from any pre-existing "trial30909" account with modified email
        u = db.users.find_one({"id": {"$exists": True}, "email": {"$regex": "trial30909"}})
        if u:
            db.users.update_one({"id": u["id"]}, {"$set": {"email": original_email}})
    r = api.post(f"{BASE_URL}/api/auth/login", json={"email": original_email, "password": USER_PASSWORD})
    if r.status_code != 200:
        pytest.skip(f"Login failed for {original_email}: {r.status_code} {r.text[:200]}")
    token = r.json()["token"]
    user_id = None
    me = api.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    if me.status_code == 200:
        user_id = me.json().get("id") or me.json().get("user", {}).get("id")
    return {"token": token, "user_id": user_id, "email": original_email}


@pytest.fixture(scope="module")
def auth_headers(user_ctx):
    return {"Authorization": f"Bearer {user_ctx['token']}", "Content-Type": "application/json"}


# -----------------------------
# EMAIL CHANGE
# -----------------------------
class TestEmailChange:
    def _cleanup(self, api, headers, db, original_email):
        # Cancel any pending
        api.delete(f"{BASE_URL}/api/auth/email/change-request", headers=headers)
        # Restore email if it was swapped
        u = db.users.find_one({"email": original_email})
        if not u:
            # find by user_id-owned drift
            drift = db.users.find_one({"email": {"$regex": "iter71-newemail"}})
            if drift:
                db.users.update_one({"id": drift["id"]}, {"$set": {"email": original_email}})

    def test_a_same_email_returns_400(self, api, auth_headers, user_ctx):
        r = api.post(
            f"{BASE_URL}/api/auth/email/change-request",
            headers=auth_headers,
            json={"new_email": user_ctx["email"], "password": USER_PASSWORD},
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"
        body = r.json()
        assert "already your email" in (body.get("detail") or "").lower()

    def test_b_wrong_password_returns_401(self, api, auth_headers):
        r = api.post(
            f"{BASE_URL}/api/auth/email/change-request",
            headers=auth_headers,
            json={"new_email": f"iter71-newemail-{uuid.uuid4().hex[:6]}@example.com", "password": "wrong-password"},
        )
        assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"

    def test_c_valid_request_creates_token(self, api, auth_headers, db, user_ctx):
        new_email = f"iter71-newemail-{uuid.uuid4().hex[:6]}@example.com"
        r = api.post(
            f"{BASE_URL}/api/auth/email/change-request",
            headers=auth_headers,
            json={"new_email": new_email, "password": USER_PASSWORD},
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        j = r.json()
        assert j.get("ok") is True
        assert j.get("new_email") == new_email
        # DB row exists
        row = db.email_change_tokens.find_one({"user_id": user_ctx["user_id"], "new_email": new_email, "used": False, "revoked": False})
        assert row, "email_change_tokens row not created"

    def test_d_status_pending_true(self, api, auth_headers, user_ctx):
        r = api.get(f"{BASE_URL}/api/auth/email/change-status", headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        assert j.get("pending") is True
        assert "iter71-newemail" in j.get("new_email", "")

    def test_e_cancel_clears_pending(self, api, auth_headers):
        r = api.delete(f"{BASE_URL}/api/auth/email/change-request", headers=auth_headers)
        assert r.status_code == 200
        st = api.get(f"{BASE_URL}/api/auth/email/change-status", headers=auth_headers)
        assert st.status_code == 200
        assert st.json().get("pending") is False

    def test_f_confirm_swaps_email(self, api, auth_headers, db, user_ctx):
        new_email = f"iter71-newemail-{uuid.uuid4().hex[:6]}@example.com"
        r = api.post(
            f"{BASE_URL}/api/auth/email/change-request",
            headers=auth_headers,
            json={"new_email": new_email, "password": USER_PASSWORD},
        )
        assert r.status_code == 200
        row = db.email_change_tokens.find_one({"user_id": user_ctx["user_id"], "new_email": new_email, "used": False})
        assert row, "token row missing"
        token = row["token"]

        # Public GET (no auth) should redirect (302) with success
        r = requests.get(f"{BASE_URL}/api/auth/email/change-confirm", params={"token": token}, allow_redirects=False)
        assert r.status_code == 302, f"expected 302 got {r.status_code}: {r.text[:300]}"
        loc = r.headers.get("location", "")
        assert "status=success" in loc, f"expected success redirect, got {loc}"

        # Verify user record swapped
        u = db.users.find_one({"id": user_ctx["user_id"]})
        assert u["email"] == new_email, f"email not swapped: {u['email']} != {new_email}"

        # Store for re-use / restoration
        pytest.iter71_new_email = new_email
        pytest.iter71_used_token = token

    def test_g_reuse_token_idempotent(self, api):
        token = getattr(pytest, "iter71_used_token", None)
        assert token, "token from prior test missing"
        r = requests.get(f"{BASE_URL}/api/auth/email/change-confirm", params={"token": token}, allow_redirects=False)
        assert r.status_code == 302
        assert "status=success" in r.headers.get("location", "")

    def test_h_invalid_token_redirects(self):
        r = requests.get(f"{BASE_URL}/api/auth/email/change-confirm", params={"token": "totally-bogus-" + secrets.token_urlsafe(8)}, allow_redirects=False)
        assert r.status_code == 302
        assert "status=invalid" in r.headers.get("location", ""), r.headers.get("location", "")

    def test_i_expired_token_redirects(self, api, db, user_ctx):
        # Login with the (now swapped) email first
        new_email = getattr(pytest, "iter71_new_email", None)
        assert new_email
        # After swap current login token might still be valid, but we need to create a
        # new pending request. Use existing token from user_ctx (JWT still tied to user_id).
        r = api.post(
            f"{BASE_URL}/api/auth/email/change-request",
            headers={"Authorization": f"Bearer {user_ctx['token']}", "Content-Type": "application/json"},
            json={"new_email": f"iter71-expire-{uuid.uuid4().hex[:6]}@example.com", "password": USER_PASSWORD},
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        # Mutate DB row to be expired
        row = db.email_change_tokens.find_one(
            {"user_id": user_ctx["user_id"], "used": False, "revoked": False},
            sort=[("created_at", -1)],
        )
        assert row
        past = datetime.now(timezone.utc) - timedelta(hours=48)
        db.email_change_tokens.update_one({"token": row["token"]}, {"$set": {"expires_at": past.isoformat()}})
        r2 = requests.get(f"{BASE_URL}/api/auth/email/change-confirm", params={"token": row["token"]}, allow_redirects=False)
        assert r2.status_code == 302
        assert "status=expired" in r2.headers.get("location", ""), r2.headers.get("location", "")

    def test_z_restore_email(self, api, db, user_ctx):
        """Restore the original test email so downstream test runs don't fail."""
        db.users.update_one({"id": user_ctx["user_id"]}, {"$set": {"email": USER_EMAIL}})
        db.email_change_tokens.update_many(
            {"user_id": user_ctx["user_id"], "used": False, "revoked": False},
            {"$set": {"revoked": True, "revoked_at": datetime.now(timezone.utc).isoformat()}},
        )
        u = db.users.find_one({"id": user_ctx["user_id"]})
        assert u["email"] == USER_EMAIL


# -----------------------------
# PARTICIPANT SHARE LINK
# -----------------------------
@pytest.fixture(scope="module")
def a_participant_id(api, auth_headers):
    r = api.get(f"{BASE_URL}/api/participants", headers=auth_headers)
    assert r.status_code == 200, f"list participants failed: {r.status_code} {r.text[:200]}"
    body = r.json()
    items = body.get("items") if isinstance(body, dict) else body
    assert items, "no participants for this test user"
    return items[0]["id"]


class TestShareLink:
    def test_a_create_returns_url_and_token(self, api, auth_headers, a_participant_id):
        r = api.post(f"{BASE_URL}/api/participants/{a_participant_id}/share-link", headers=auth_headers)
        assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
        j = r.json()
        assert j["has_link"] is True
        assert j.get("url") and "/view/" in j["url"]
        assert j.get("token")
        pytest.iter71_share_token = j["token"]

    def test_b_public_view_ok(self, a_participant_id):
        token = pytest.iter71_share_token
        r = requests.get(f"{BASE_URL}/api/public/shared-view/{token}")
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        j = r.json()
        assert "participant" in j and "caregiver" in j and "share_meta" in j
        assert j["participant"].get("display_name")
        # Caregiver name derived from user first_name/name; may be None if user has no name
        # phone falls back to user.mobile if participant.caregiver_phone missing
        assert "name" in j["caregiver"] and "phone" in j["caregiver"]

    def test_c_rotate_invalidates_old_and_issues_new(self, api, auth_headers, a_participant_id):
        old_token = pytest.iter71_share_token
        r = api.post(f"{BASE_URL}/api/participants/{a_participant_id}/share-link/rotate", headers=auth_headers)
        assert r.status_code == 200
        j = r.json()
        assert j["token"] != old_token
        new_token = j["token"]

        # Old token → 404
        r_old = requests.get(f"{BASE_URL}/api/public/shared-view/{old_token}")
        assert r_old.status_code == 404, f"old token still active: {r_old.status_code}"
        # New token → 200
        r_new = requests.get(f"{BASE_URL}/api/public/shared-view/{new_token}")
        assert r_new.status_code == 200
        pytest.iter71_share_token = new_token

    def test_d_delete_revokes_link(self, api, auth_headers, a_participant_id):
        r = api.delete(f"{BASE_URL}/api/participants/{a_participant_id}/share-link", headers=auth_headers)
        assert r.status_code == 200
        # public 404
        r_pub = requests.get(f"{BASE_URL}/api/public/shared-view/{pytest.iter71_share_token}")
        assert r_pub.status_code == 404

    def test_e_ownership_enforcement(self, api, a_participant_id, auth_headers):
        # Create a fresh, unrelated user
        rand = uuid.uuid4().hex[:8]
        signup = api.post(
            f"{BASE_URL}/api/auth/signup",
            json={"name": "Iter71 Rando", "email": f"iter71-rando-{rand}@example.com", "password": "RandoPass1!", "plan": "family"},
        )
        # sign-up may 200 or already 400; if fail, skip
        if signup.status_code not in (200, 201):
            pytest.skip(f"could not create rando user: {signup.status_code} {signup.text[:200]}")
        login = api.post(f"{BASE_URL}/api/auth/login", json={"email": f"iter71-rando-{rand}@example.com", "password": "RandoPass1!"})
        assert login.status_code == 200
        rando_headers = {"Authorization": f"Bearer {login.json()['token']}", "Content-Type": "application/json"}
        # Try to hit share endpoints for a participant they don't own
        r = api.post(f"{BASE_URL}/api/participants/{a_participant_id}/share-link", headers=rando_headers)
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text[:200]}"
        r2 = api.get(f"{BASE_URL}/api/participants/{a_participant_id}/share-link", headers=rando_headers)
        assert r2.status_code == 404


# -----------------------------
# PARTICIPANT PATCH — extended fields
# -----------------------------
class TestParticipantPatch:
    def test_patch_all_onboarding_fields(self, api, auth_headers, a_participant_id):
        payload = {
            "first_name": "Dot",
            "last_name": "TestUser",
            "preferred_name": "Dottie",
            "dob": "1940-05-12",
            "classification_level": 4,
            "pension_status": "full_pension",
            "provider_name": "BlueBerry Care",
            "statement_delivery": "email",
            "mac_reference_number": "AC7654321",
            "suburb": "Ashfield",
            "state": "NSW",
            "is_grandfathered_hcp": "yes",
            "hcp_level": 3,
            "caregiver_relationship": "daughter",
            "caregiver_phone": "+61412345678",
        }
        r = api.patch(f"{BASE_URL}/api/participants/{a_participant_id}", headers=auth_headers, json=payload)
        assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
        # Re-fetch and verify
        r2 = api.get(f"{BASE_URL}/api/participants", headers=auth_headers)
        body = r2.json()
        items = body.get("items") if isinstance(body, dict) else body
        p = next((x for x in items if x["id"] == a_participant_id), None)
        assert p is not None
        # ParticipantPatch may nest / lowercase some keys — validate the ones we're sure of.
        for k in ["first_name", "last_name", "preferred_name", "suburb", "state",
                  "provider_name", "statement_delivery", "mac_reference_number",
                  "caregiver_relationship", "caregiver_phone"]:
            assert (p.get(k) or "").lower() == str(payload[k]).lower(), (
                f"field {k} not persisted: got {p.get(k)!r} want {payload[k]!r}"
            )
        # Classification / pension / HCP fields — allow either exact or normalized value
        # (backend may map 'HCP4'→'4' etc.)
        cls_ok = str(p.get("classification_level") or p.get("classification") or "").lower()
        assert "4" in cls_ok
        assert str(p.get("pension_status") or "").lower() == "full_pension"
