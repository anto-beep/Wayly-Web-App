"""Phase 1 (Business OS) — consent + unsubscribe INTEGRATION tests.

Runs against the live preview backend (REACT_APP_BACKEND_URL) with synthetic
@example.com accounts (pre-verified, so no email is sent). Verifies the signup
consent checkbox, the scanner-safe unsubscribe GET, the real POST unsubscribe,
the authenticated in-app toggle, and that the Resend webhook stays inert.
"""
from __future__ import annotations
import os
import uuid
import requests
import pytest
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-renderer.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"
_mc = MongoClient(os.environ["MONGO_URL"])
_db = _mc[os.environ["DB_NAME"]]

from lib import email_governance as gov  # mint valid tokens with the shared secret

PW = "StrongPass!2026x"


def _email():
    return f"test_consent_{uuid.uuid4().hex[:12]}@example.com"


def _signup(marketing_consent):
    em = _email()
    payload = {"email": em, "password": PW, "name": "Consent Test",
               "role": "caregiver", "plan": "solo"}
    if marketing_consent is not None:
        payload["marketing_consent"] = marketing_consent
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return em, r.json()


def _cleanup(em):
    u = _db.users.find_one({"email": em}, {"id": 1})
    if u:
        _db.marketing_consent_events.delete_many({"user_id": u["id"]})
    _db.users.delete_many({"email": em})
    _db.email_suppressions.delete_many({"email_hash": gov.email_hash(em)})


def test_signup_with_consent_accepted():
    em, data = _signup(True)
    try:
        assert data["user"].get("marketing_opted_in") is True
        u = _db.users.find_one({"email": em}, {"_id": 0})
        assert u["marketing_consent"] is True
        assert u["marketing_consent_source"] == "signup"
        ev = _db.marketing_consent_events.find_one({"user_id": u["id"], "status": "opted_in"})
        assert ev is not None and ev["version"]
        ok, reason = _eligible(u)
        assert ok is True
    finally:
        _cleanup(em)


def test_signup_with_consent_declined_defaults_off():
    for val in (False, None):  # unchecked box OR field omitted
        em, data = _signup(val)
        try:
            assert bool(data["user"].get("marketing_opted_in")) is False
            u = _db.users.find_one({"email": em}, {"_id": 0})
            assert bool(u.get("marketing_consent")) is False
        finally:
            _cleanup(em)


def test_get_unsubscribe_is_scanner_safe():
    em, data = _signup(True)
    try:
        u = _db.users.find_one({"email": em}, {"_id": 0})
        token = gov.make_email_token(u["id"], em, "unsub")
        # A GET (scanner / link prefetch) must NOT opt the user out.
        r = requests.get(f"{API}/email/unsubscribe", params={"token": token}, timeout=30)
        assert r.status_code == 200 and "Unsubscribe" in r.text
        u2 = _db.users.find_one({"email": em}, {"_id": 0})
        assert u2["marketing_consent"] is True  # unchanged by GET
    finally:
        _cleanup(em)


def test_post_unsubscribe_opts_out_and_suppresses():
    em, data = _signup(True)
    try:
        u = _db.users.find_one({"email": em}, {"_id": 0})
        token = gov.make_email_token(u["id"], em, "unsub")
        r = requests.post(f"{API}/email/unsubscribe", params={"token": token}, timeout=30)
        assert r.status_code == 200
        u2 = _db.users.find_one({"email": em}, {"_id": 0})
        assert u2["marketing_consent"] is False
        supp = _db.email_suppressions.find_one({"email_hash": gov.email_hash(em), "reason": "unsubscribe"})
        assert supp is not None and supp["permanent"] is True
    finally:
        _cleanup(em)


def test_preferences_get_and_post_roundtrip():
    em, data = _signup(True)
    try:
        u = _db.users.find_one({"email": em}, {"_id": 0})
        token = gov.make_email_token(u["id"], em, "prefs")
        g = requests.get(f"{API}/email/preferences", params={"token": token}, timeout=30)
        assert g.status_code == 200 and g.json()["marketing_opted_in"] is True
        p = requests.post(f"{API}/email/preferences",
                          json={"token": token, "marketing_opted_in": False}, timeout=30)
        assert p.status_code == 200 and p.json()["marketing_opted_in"] is False
        u2 = _db.users.find_one({"email": em}, {"_id": 0})
        assert u2["marketing_consent"] is False
    finally:
        _cleanup(em)


def test_authenticated_marketing_toggle():
    em, data = _signup(False)
    try:
        token = data["token"]
        h = {"Authorization": f"Bearer {token}"}
        g = requests.get(f"{API}/account/marketing-preferences", headers=h, timeout=30)
        assert g.status_code == 200 and g.json()["marketing_opted_in"] is False
        pa = requests.patch(f"{API}/account/marketing-preferences",
                            json={"marketing_opted_in": True}, headers=h, timeout=30)
        assert pa.status_code == 200 and pa.json()["marketing_opted_in"] is True
        u = _db.users.find_one({"email": em}, {"_id": 0})
        assert u["marketing_consent"] is True
    finally:
        _cleanup(em)


def test_invalid_token_rejected():
    r = requests.get(f"{API}/email/preferences", params={"token": "bogus"}, timeout=30)
    assert r.status_code == 400


def test_resend_webhook_inert_without_secret():
    # Phase 1: no secret configured in preview → handler must refuse (503),
    # never silently accept unsigned events.
    r = requests.post(f"{API}/webhook/resend", data=b"{}", timeout=30)
    assert r.status_code in (503, 400)


def _eligible(u):
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    return asyncio.get_event_loop().run_until_complete(gov.can_send_marketing(db, user=u))
