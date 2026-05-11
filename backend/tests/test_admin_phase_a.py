"""Phase A admin backend tests: TOTP 2FA, lockout, sessions, roles."""
import os
import asyncio
import pytest
import pyotp
import requests
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

HELLO = "hello@techglove.com.au"
HELLO_PW = "AdminPass!2026"
ANTONY = "a.chiware2@gmail.com"
ANTONY_PW = "Admin!2026"
CATHY = "cathy@example.com"
CATHY_PW = "testpass123"


def _db():
    load_dotenv("/app/backend/.env")
    return AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


async def _reset_user(email):
    await _db().users.update_one(
        {"email": email},
        {"$set": {"failed_login_count": 0, "lockout_until": None}},
    )


async def _get_user(email):
    return await _db().users.find_one({"email": email}, {"_id": 0})


def run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


@pytest.fixture(autouse=True)
def reset_lockouts():
    run(_reset_user(HELLO))
    run(_reset_user(ANTONY))
    yield
    run(_reset_user(HELLO))
    run(_reset_user(ANTONY))


# ---------------- Login step 1 ----------------

def test_login_super_admin_with_totp_returns_requires_2fa():
    r = requests.post(f"{API}/admin/auth/login", json={"email": HELLO, "password": HELLO_PW})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("requires_2fa") is True
    assert "temp_token" in d and len(d["temp_token"]) > 20
    assert d.get("role") == "super_admin"


def test_login_first_time_admin_returns_setup_payload():
    # Pre-state: ensure antony has no totp
    user = run(_get_user(ANTONY))
    if user.get("totp_enabled") and user.get("totp_secret"):
        pytest.skip("Antony already has TOTP — skipping first-time setup test (re-seed if needed)")
    r = requests.post(f"{API}/admin/auth/login", json={"email": ANTONY, "password": ANTONY_PW})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("requires_2fa_setup") is True
    assert "setup_token" in d
    assert d.get("qr_data_uri", "").startswith("data:image/png;base64,")
    assert isinstance(d.get("secret"), str) and len(d["secret"]) >= 16
    assert d.get("role") == "super_admin"


def test_login_non_admin_user_returns_403():
    r = requests.post(f"{API}/admin/auth/login", json={"email": CATHY, "password": CATHY_PW})
    assert r.status_code == 403
    assert "not an admin" in r.text.lower()


def test_login_wrong_email_returns_401():
    r = requests.post(f"{API}/admin/auth/login", json={"email": "nobody@example.com", "password": "x"})
    assert r.status_code == 401


# ---------------- Lockout ----------------

def test_brute_force_lockout_after_5_failed_attempts():
    # 5 fails → 6th returns 423
    for i in range(5):
        r = requests.post(f"{API}/admin/auth/login", json={"email": HELLO, "password": "WrongPass!"})
        assert r.status_code == 401, f"attempt {i+1}: {r.status_code} {r.text}"
    r6 = requests.post(f"{API}/admin/auth/login", json={"email": HELLO, "password": "WrongPass!"})
    assert r6.status_code == 423, f"expected 423 got {r6.status_code} {r6.text}"


# ---------------- 2FA verify ----------------

def _get_temp_token_hello():
    r = requests.post(f"{API}/admin/auth/login", json={"email": HELLO, "password": HELLO_PW})
    assert r.status_code == 200
    return r.json()["temp_token"]


def _hello_totp_now():
    user = run(_get_user(HELLO))
    secret = user.get("totp_secret")
    assert secret, "hello user has no totp_secret"
    return pyotp.TOTP(secret).now()


def test_2fa_verify_with_valid_code_returns_admin_token():
    temp = _get_temp_token_hello()
    code = _hello_totp_now()
    r = requests.post(f"{API}/admin/auth/2fa/verify", json={"temp_token": temp, "code": code})
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d
    a = d["admin"]
    for k in ("id", "email", "name", "admin_role", "totp_enabled", "backup_codes_remaining"):
        assert k in a
    assert a["admin_role"] == "super_admin"
    assert a["email"] == HELLO


def test_2fa_verify_with_wrong_code_returns_401():
    temp = _get_temp_token_hello()
    r = requests.post(f"{API}/admin/auth/2fa/verify", json={"temp_token": temp, "code": "000000"})
    assert r.status_code == 401


# ---------------- /me & guards ----------------

def _admin_token():
    temp = _get_temp_token_hello()
    code = _hello_totp_now()
    r = requests.post(f"{API}/admin/auth/2fa/verify", json={"temp_token": temp, "code": code})
    return r.json()["token"]


def _regular_user_token():
    r = requests.post(f"{API}/auth/login", json={"email": CATHY, "password": CATHY_PW})
    assert r.status_code == 200, r.text
    return r.json()["token"]


def test_me_with_valid_admin_token_returns_profile():
    tok = _admin_token()
    r = requests.get(f"{API}/admin/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200
    a = r.json()["admin"]
    assert a["email"] == HELLO
    assert a["admin_role"] == "super_admin"
    assert "backup_codes_remaining" in a


def test_me_without_token_returns_401():
    r = requests.get(f"{API}/admin/auth/me")
    assert r.status_code == 401


def test_me_with_regular_user_token_returns_401():
    tok = _regular_user_token()
    r = requests.get(f"{API}/admin/auth/me", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


def test_analytics_with_admin_token_returns_payload():
    tok = _admin_token()
    r = requests.get(f"{API}/admin/analytics", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    d = r.json()
    for k in ("users", "plans", "subscriptions", "statements", "households", "payments"):
        assert k in d


def test_analytics_with_regular_user_token_returns_401():
    tok = _regular_user_token()
    r = requests.get(f"{API}/admin/analytics", headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 401


# ---------------- Session tracking ----------------

def test_admin_session_persisted_in_admin_sessions():
    tok = _admin_token()
    import jwt as pyjwt
    # Just decode without verification to read claims (sid)
    payload = pyjwt.decode(tok, options={"verify_signature": False})
    sid = payload.get("sid")
    assert sid, "no sid claim"
    sess = run(_db().admin_sessions.find_one({"id": sid}, {"_id": 0}))
    assert sess is not None
    assert sess["user_id"] == payload["sub"]
    assert sess["revoked"] is False


# ---------------- Logout ----------------

def test_logout_invalidates_session():
    tok = _admin_token()
    h = {"Authorization": f"Bearer {tok}"}
    # /me works
    assert requests.get(f"{API}/admin/auth/me", headers=h).status_code == 200
    r = requests.post(f"{API}/admin/auth/logout", headers=h)
    assert r.status_code == 200
    r2 = requests.get(f"{API}/admin/auth/me", headers=h)
    assert r2.status_code == 401


# ---------------- Super-admin only: DELETE /admin/users/{id} ----------------

def test_super_admin_can_call_delete_endpoint_404_for_unknown():
    tok = _admin_token()
    r = requests.delete(
        f"{API}/admin/users/__nonexistent__",
        headers={"Authorization": f"Bearer {tok}"},
    )
    # super_admin authorized → not 403; user doesn't exist → 404
    assert r.status_code == 404, r.text


# ---------------- Backup codes (Antony first-time flow) ----------------

def test_first_time_setup_returns_backup_codes_once_and_consumption_decreases():
    user = run(_get_user(ANTONY))
    if user.get("totp_enabled") and user.get("totp_secret"):
        pytest.skip("Antony already enabled — skipping first-time backup-code flow")
    # Step 1: login → setup
    r = requests.post(f"{API}/admin/auth/login", json={"email": ANTONY, "password": ANTONY_PW})
    assert r.status_code == 200
    d = r.json()
    setup_token = d["setup_token"]
    secret = d["secret"]
    first_code = pyotp.TOTP(secret).now()
    # Step 2: enable
    r2 = requests.post(
        f"{API}/admin/auth/2fa/enable",
        json={"setup_token": setup_token, "code": first_code},
    )
    assert r2.status_code == 200, r2.text
    enable = r2.json()
    assert "token" in enable
    codes = enable.get("backup_codes")
    assert isinstance(codes, list) and len(codes) == 8
    admin_token = enable["token"]

    # /me shows backup_codes_remaining == 8
    me = requests.get(f"{API}/admin/auth/me", headers={"Authorization": f"Bearer {admin_token}"}).json()["admin"]
    assert me["backup_codes_remaining"] == 8
    assert me["totp_enabled"] is True

    # Use a backup code on /2fa/verify
    # New login → temp_token
    r3 = requests.post(f"{API}/admin/auth/login", json={"email": ANTONY, "password": ANTONY_PW})
    assert r3.status_code == 200
    temp = r3.json()["temp_token"]
    backup = codes[0]
    r4 = requests.post(f"{API}/admin/auth/2fa/verify", json={"temp_token": temp, "code": backup})
    assert r4.status_code == 200, r4.text
    new_tok = r4.json()["token"]
    me2 = requests.get(f"{API}/admin/auth/me", headers={"Authorization": f"Bearer {new_tok}"}).json()["admin"]
    assert me2["backup_codes_remaining"] == 7

    # Subsequent login shouldn't return backup codes again
    r5 = requests.post(f"{API}/admin/auth/login", json={"email": ANTONY, "password": ANTONY_PW})
    assert "backup_codes" not in r5.json()
    assert r5.json().get("requires_2fa") is True
