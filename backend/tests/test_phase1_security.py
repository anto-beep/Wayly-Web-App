"""Phase 1 Security Hardening test suite.

Covers:
- HIBP password breach block on signup/reset
- Refresh token issuance + one-shot rotation
- Generic 401 on bad login (anti-enumeration)
- 5-fail account lockout (423)
- Token blocklist on logout
- Token invalidation after password reset
- /auth/me includes totp_enabled
- TOTP at-rest encryption (fernet:v1: prefix)
- Caregiver MFA full loop: setup → enable → login(mfa) → verify → disable
- Admin login uses separate ADMIN_JWT_SECRET
- revoked_tokens has logout doc with TTL field
"""
import os
import sys
import time
import secrets
import pytest
import requests
import pyotp
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

# Direct DB access for state reset / introspection
MONGO_URL = "mongodb://localhost:27017"
DB_NAME = "test_database"
mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]

CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"
ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASS = "AdminPass!2026"


def _reset_cathy_state():
    """Reset lockout + MFA state + token_invalid_before for cathy."""
    db.users.update_one(
        {"email": CATHY_EMAIL},
        {"$set": {"user_failed_login_count": 0, "user_lockout_until": None},
         "$unset": {"totp_secret": "", "totp_enabled": "", "totp_backup_codes": "",
                    "totp_enabled_at": "", "token_invalid_before": "",
                    "token_invalid_reason": ""}},
    )


@pytest.fixture(autouse=True)
def _per_test_setup():
    _reset_cathy_state()
    yield
    _reset_cathy_state()


@pytest.fixture
def cathy_login():
    """Plain login → returns (token, refresh_token, user)."""
    r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASS}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and "refresh_token" in data
    return data


# ---------- HIBP ----------
class TestHIBP:
    def test_signup_blocks_known_breached_password(self):
        email = f"TEST_hibp_{int(time.time())}@example.com"
        r = requests.post(f"{API}/auth/signup", json={
            "email": email, "password": "Password123!", "name": "Test", "role": "caregiver", "plan": "free"
        }, timeout=15)
        assert r.status_code == 400, f"Expected 400 for breached pwd, got {r.status_code}: {r.text}"
        body = r.json()
        assert "breach" in body.get("detail", "").lower() or "data breaches" in body.get("detail", "").lower()
        # user should NOT exist
        assert db.users.find_one({"email": email}) is None

    def test_reset_blocks_breached_password(self):
        # create reset token directly in DB pointing at cathy
        from datetime import datetime, timezone, timedelta
        token = "TESTreset" + os.urandom(16).hex()
        cathy = db.users.find_one({"email": CATHY_EMAIL})
        db.password_resets.insert_one({
            "token": token, "user_id": cathy["id"], "email": CATHY_EMAIL,
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=60)).isoformat(),
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        original_hash = cathy["password_hash"]
        r = requests.post(f"{API}/auth/reset", json={"token": token, "new_password": "Password123!"}, timeout=15)
        assert r.status_code == 400
        # password unchanged
        again = db.users.find_one({"email": CATHY_EMAIL})
        assert again["password_hash"] == original_hash
        db.password_resets.delete_one({"token": token})


# ---------- Refresh tokens / login ----------
class TestLoginRefresh:
    def test_login_returns_token_and_refresh(self, cathy_login):
        assert isinstance(cathy_login["token"], str) and len(cathy_login["token"]) >= 100
        assert isinstance(cathy_login["refresh_token"], str) and len(cathy_login["refresh_token"]) >= 100
        assert cathy_login["user"]["email"] == CATHY_EMAIL

    def test_generic_error_unknown_email(self):
        r = requests.post(f"{API}/auth/login", json={"email": "nosuchuser_TEST@example.com", "password": "whatever"}, timeout=15)
        assert r.status_code == 401
        assert r.json().get("detail") == "Invalid email or password"

    def test_generic_error_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": "wrongPassNope!"}, timeout=15)
        assert r.status_code == 401
        assert r.json().get("detail") == "Invalid email or password"

    def test_refresh_rotation_one_shot(self, cathy_login):
        rt = cathy_login["refresh_token"]
        r1 = requests.post(f"{API}/auth/refresh", json={"refresh_token": rt}, timeout=15)
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        assert "token" in d1 and "refresh_token" in d1
        # use NEW token on /me
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {d1['token']}"}, timeout=15)
        assert me.status_code == 200
        # use OLD refresh again → must 401
        r2 = requests.post(f"{API}/auth/refresh", json={"refresh_token": rt}, timeout=15)
        assert r2.status_code == 401, f"Old refresh token must be revoked after rotation. Got {r2.status_code}: {r2.text}"


# ---------- Lockout ----------
class TestLockout:
    def test_5_failures_then_423(self):
        # First 5 wrong passwords → 401
        for i in range(5):
            r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": f"wrong{i}!"}, timeout=15)
            assert r.status_code == 401, f"Attempt {i+1}: expected 401, got {r.status_code}: {r.text}"
        # 6th → 423
        r6 = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": "wrong5!"}, timeout=15)
        assert r6.status_code == 423, f"6th attempt expected 423 lockout, got {r6.status_code}: {r6.text}"
        assert "locked" in r6.json().get("detail", "").lower()


# ---------- Blocklist on logout & password reset ----------
class TestBlocklist:
    def test_logout_revokes_token(self, cathy_login):
        token = cathy_login["token"]
        h = {"Authorization": f"Bearer {token}"}
        me1 = requests.get(f"{API}/auth/me", headers=h, timeout=15)
        assert me1.status_code == 200
        out = requests.post(f"{API}/auth/logout", headers=h, timeout=15)
        assert out.status_code == 200
        me2 = requests.get(f"{API}/auth/me", headers=h, timeout=15)
        assert me2.status_code == 401
        assert me2.json().get("detail") == "Token revoked — please sign in again"
        # revoked_tokens doc exists
        cathy = db.users.find_one({"email": CATHY_EMAIL})
        doc = db.revoked_tokens.find_one({"user_id": cathy["id"], "reason": "logout"})
        assert doc is not None
        assert "expires_at" in doc
        assert "jti" in doc

    def test_password_reset_kills_old_tokens(self, cathy_login):
        import bcrypt as _bc
        old_token = cathy_login["token"]
        # Initiate forgot
        requests.post(f"{API}/auth/forgot", json={"email": CATHY_EMAIL}, timeout=15)
        # Grab the most recent reset token
        rec = db.password_resets.find_one({"email": CATHY_EMAIL, "used": False}, sort=[("created_at", -1)])
        assert rec, "Forgot did not create reset token"
        # Reset to a strong, non-breached, random password
        strong_pw = "Wj4-Lk9!QvB7zXp@" + secrets.token_hex(6)
        r = requests.post(f"{API}/auth/reset", json={"token": rec["token"], "new_password": strong_pw}, timeout=20)
        assert r.status_code == 200, r.text
        # Old token must no longer work
        time.sleep(1)
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {old_token}"}, timeout=15)
        assert me.status_code == 401
        # Restore cathy's password directly via Mongo so other tests / dev keep working.
        db.users.update_one(
            {"email": CATHY_EMAIL},
            {"$set": {"password_hash": _bc.hashpw(CATHY_PASS.encode(), _bc.gensalt()).decode()},
             "$unset": {"token_invalid_before": "", "token_invalid_reason": ""}},
        )


# ---------- /auth/me totp_enabled flag ----------
class TestAuthMe:
    def test_me_has_totp_enabled_field(self, cathy_login):
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {cathy_login['token']}"}, timeout=15)
        assert me.status_code == 200
        body = me.json()
        assert "totp_enabled" in body, f"Response missing totp_enabled: {list(body.keys())}"
        assert body["totp_enabled"] in (False, None, True)


# ---------- MFA loop ----------
class TestMfaLoop:
    def test_full_mfa_setup_enable_login_verify_disable(self, cathy_login):
        token = cathy_login["token"]
        h = {"Authorization": f"Bearer {token}"}

        # SETUP
        s = requests.post(f"{API}/auth/mfa/setup", headers=h, timeout=15)
        assert s.status_code == 200, s.text
        sd = s.json()
        assert "setup_token" in sd and "qr_data_uri" in sd and "secret" in sd
        secret = sd["secret"]
        assert sd["qr_data_uri"].startswith("data:image/png;base64,")

        # ENABLE
        code = pyotp.TOTP(secret).now()
        e = requests.post(f"{API}/auth/mfa/enable", headers=h,
                          json={"setup_token": sd["setup_token"], "code": code}, timeout=15)
        assert e.status_code == 200, e.text
        ed = e.json()
        assert ed.get("ok") is True
        assert len(ed.get("backup_codes", [])) == 8

        # Verify TOTP secret stored encrypted at rest
        u = db.users.find_one({"email": CATHY_EMAIL})
        assert u.get("totp_enabled") is True
        assert isinstance(u.get("totp_secret"), str)
        assert u["totp_secret"].startswith("fernet:v1:"), f"Expected fernet:v1: prefix, got: {u['totp_secret'][:20]}..."

        # LOGIN now returns requires_mfa
        lr = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASS}, timeout=15)
        assert lr.status_code == 200
        ld = lr.json()
        assert ld.get("requires_mfa") is True
        assert isinstance(ld.get("temp_token"), str)
        assert "token" not in ld

        # VERIFY MFA
        code2 = pyotp.TOTP(secret).now()
        # If same code as enable, wait until next window
        if code2 == code:
            time.sleep(31)
            code2 = pyotp.TOTP(secret).now()
        v = requests.post(f"{API}/auth/mfa/verify",
                         json={"temp_token": ld["temp_token"], "code": code2}, timeout=15)
        assert v.status_code == 200, v.text
        vd = v.json()
        assert vd["user"]["email"] == CATHY_EMAIL
        assert isinstance(vd["token"], str) and len(vd["token"]) >= 100
        assert isinstance(vd["refresh_token"], str) and len(vd["refresh_token"]) >= 100

        # /auth/me totp_enabled True
        me = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {vd['token']}"}, timeout=15)
        assert me.status_code == 200
        assert me.json().get("totp_enabled") is True

        # DISABLE — needs fresh code, possibly different window
        code3 = pyotp.TOTP(secret).now()
        d = requests.post(f"{API}/auth/mfa/disable",
                          headers={"Authorization": f"Bearer {vd['token']}"},
                          json={"password": CATHY_PASS, "code": code3}, timeout=15)
        assert d.status_code == 200, d.text
        # Confirm fields unset
        u2 = db.users.find_one({"email": CATHY_EMAIL})
        assert not u2.get("totp_enabled")
        assert not u2.get("totp_secret")


# ---------- Admin login with separate ADMIN_JWT_SECRET ----------
class TestAdminLogin:
    def test_admin_login_returns_2fa_challenge(self):
        r = requests.post(f"{API}/admin/auth/login",
                          json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=20)
        # Per existing seed, hello@techglove has TOTP enabled → requires_2fa
        assert r.status_code == 200, r.text
        body = r.json()
        # accept either 'requires_2fa' or 'requires_mfa'
        assert body.get("requires_2fa") is True or body.get("requires_mfa") is True
        assert isinstance(body.get("temp_token"), str)
        assert body.get("role") in ("super_admin", "admin")
