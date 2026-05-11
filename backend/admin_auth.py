"""Admin-only authentication: TOTP 2FA, role-based access, session expiry,
brute-force lockout, audit logging.

Mounted at /api/admin/auth/*.

Token model
-----------
Three JWT subtypes (distinguished by `type` claim):

1. `admin_pre2fa` — issued after correct email+password; valid 5 min;
   only usable to POST /admin/auth/2fa/verify (or /setup on first time).
2. `admin_setup` — issued at /2fa/setup; valid 10 min; only usable
   to POST /admin/auth/2fa/enable (consumes the secret + first TOTP).
3. `admin` — the real session token, valid up to 12h (absolute max).
   Carries `sid` (admin session id) so we can enforce 4h inactivity.

Roles
-----
- super_admin       : everything (incl. admin CRUD, dangerous actions)
- operations_admin  : everything except admin CRUD + dangerous actions
- support_admin     : read user data, refunds <= $500, password resets
- content_admin     : CMS only

Backward compatibility
----------------------
Existing users with `is_admin=True` and no `admin_role` are treated as
`super_admin` (a one-time migration sets the field on first call).
"""
from __future__ import annotations
import os
import io
import base64
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple, Literal

import jwt
import pyotp
import qrcode
import bcrypt
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from motor.motor_asyncio import AsyncIOMotorClient

from auth import (
    JWT_SECRET, JWT_ALGORITHM, hash_password, verify_password,
)

router = APIRouter(prefix="/admin/auth", tags=["admin-auth"])
bearer = HTTPBearer(auto_error=False)

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

# ----------------------------- constants -----------------------------

ALL_ROLES = ("super_admin", "operations_admin", "support_admin", "content_admin")
AdminRole = Literal["super_admin", "operations_admin", "support_admin", "content_admin"]

FAILED_LOCKOUT_THRESHOLD = 5
FAILED_LOCKOUT_MINUTES = 30
PRE2FA_TTL_MINUTES = 5
SETUP_TTL_MINUTES = 10
SESSION_INACTIVE_HOURS = 4
SESSION_MAX_HOURS = 12
TOTP_ISSUER = "Wayly Admin"
BACKUP_CODE_COUNT = 8


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ----------------------------- token helpers -----------------------------

def _encode(payload: dict) -> str:
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _decode(token: str, expected_type: Optional[str] = None) -> dict:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    if expected_type and data.get("type") != expected_type:
        raise HTTPException(401, "Invalid token type")
    return data


def _make_pre2fa_token(user_id: str) -> str:
    return _encode({
        "sub": user_id, "type": "admin_pre2fa",
        "exp": _now() + timedelta(minutes=PRE2FA_TTL_MINUTES),
    })


def _make_setup_token(user_id: str, secret: str) -> str:
    return _encode({
        "sub": user_id, "type": "admin_setup", "totp_secret": secret,
        "exp": _now() + timedelta(minutes=SETUP_TTL_MINUTES),
    })


def _make_admin_token(user_id: str, session_id: str, role: str) -> str:
    return _encode({
        "sub": user_id, "type": "admin", "sid": session_id, "role": role,
        "exp": _now() + timedelta(hours=SESSION_MAX_HOURS),
    })


# ----------------------------- audit log -----------------------------

async def audit_log(
    actor_id: Optional[str],
    action: str,
    target_id: Optional[str] = None,
    ip: Optional[str] = None,
    result: str = "success",
    detail: Optional[dict] = None,
) -> None:
    """Append-only admin audit log. Never blocks the request on failure."""
    try:
        await db.admin_audit.insert_one({
            "ts": _iso(_now()),
            "actor_id": actor_id,
            "action": action,
            "target_id": target_id,
            "ip": ip,
            "result": result,
            "detail": detail or {},
        })
    except Exception:
        pass


# ----------------------------- brute force -----------------------------

async def _is_locked(user_id: str) -> Tuple[bool, Optional[str]]:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "lockout_until": 1})
    until = (u or {}).get("lockout_until")
    if not until:
        return False, None
    try:
        until_dt = datetime.fromisoformat(until)
    except Exception:
        return False, None
    if until_dt > _now():
        return True, until
    return False, None


async def _record_failure(user_id: str) -> None:
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "failed_login_count": 1})
    n = int((u or {}).get("failed_login_count") or 0) + 1
    update: dict = {"failed_login_count": n}
    if n >= FAILED_LOCKOUT_THRESHOLD:
        update["lockout_until"] = _iso(_now() + timedelta(minutes=FAILED_LOCKOUT_MINUTES))
        update["failed_login_count"] = 0
    await db.users.update_one({"id": user_id}, {"$set": update})


async def _clear_failures(user_id: str) -> None:
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"failed_login_count": 0, "lockout_until": None}},
    )


# ----------------------------- sessions -----------------------------

async def _create_session(user_id: str, ip: str, ua: str) -> str:
    sid = secrets.token_urlsafe(16)
    now = _now()
    await db.admin_sessions.insert_one({
        "id": sid,
        "user_id": user_id,
        "ip": ip,
        "ua": ua[:200],
        "created_at": _iso(now),
        "last_activity": _iso(now),
        "expires_at_max": _iso(now + timedelta(hours=SESSION_MAX_HOURS)),
        "revoked": False,
    })
    return sid


async def _touch_session(sid: str) -> Optional[dict]:
    """Update last_activity. Return session doc, or None if invalid/expired."""
    sess = await db.admin_sessions.find_one({"id": sid, "revoked": False}, {"_id": 0})
    if not sess:
        return None
    now = _now()
    last_iso = sess.get("last_activity")
    max_iso = sess.get("expires_at_max")
    try:
        last_dt = datetime.fromisoformat(last_iso) if last_iso else now
        max_dt = datetime.fromisoformat(max_iso) if max_iso else now + timedelta(hours=SESSION_MAX_HOURS)
    except Exception:
        return None
    if now > max_dt:
        return None
    if (now - last_dt) > timedelta(hours=SESSION_INACTIVE_HOURS):
        return None
    await db.admin_sessions.update_one({"id": sid}, {"$set": {"last_activity": _iso(now)}})
    return sess


# ----------------------------- backup codes -----------------------------

def _gen_backup_codes() -> Tuple[list, list]:
    """Return (plaintext list to show to admin once, hashed list to store)."""
    plain = [secrets.token_hex(4).upper() for _ in range(BACKUP_CODE_COUNT)]  # e.g. "A4B2C1F8"
    hashed = [bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode() for p in plain]
    return plain, hashed


def _consume_backup_code(stored_hashes: list, supplied: str) -> Optional[list]:
    """If `supplied` matches one of `stored_hashes`, return remaining list."""
    supplied = (supplied or "").strip().upper()
    for h in list(stored_hashes):
        try:
            if bcrypt.checkpw(supplied.encode(), h.encode()):
                remaining = [x for x in stored_hashes if x != h]
                return remaining
        except Exception:
            continue
    return None


# ----------------------------- QR code -----------------------------

def _qr_data_uri(otpauth_uri: str) -> str:
    img = qrcode.make(otpauth_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ----------------------------- migration helper -----------------------------

async def _ensure_admin_role(user: dict) -> dict:
    """Backfill admin_role from legacy is_admin flag. Idempotent."""
    if user.get("admin_role"):
        return user
    if user.get("is_admin"):
        await db.users.update_one({"id": user["id"]}, {"$set": {"admin_role": "super_admin"}})
        user["admin_role"] = "super_admin"
    return user


# ============================================================================
# DEPENDENCIES — used by all admin routes (not just /admin/auth)
# ============================================================================

async def get_current_admin(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer),
) -> dict:
    if not creds:
        raise HTTPException(401, "Not authenticated", headers={"WWW-Authenticate": "Bearer"})
    data = _decode(creds.credentials, expected_type="admin")
    sid = data.get("sid")
    if not sid:
        raise HTTPException(401, "Invalid admin token")
    sess = await _touch_session(sid)
    if not sess:
        raise HTTPException(401, "Session expired — please sign in again")
    user = await db.users.find_one({"id": data["sub"]}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(401, "User not found")
    user = await _ensure_admin_role(user)
    if not user.get("admin_role"):
        raise HTTPException(403, "Admin access required")
    return user


def require_roles(*allowed: str):
    """Build a dep that ensures the admin's role is in `allowed`."""
    allowed_set = set(allowed)

    async def _dep(admin: dict = Depends(get_current_admin)) -> dict:
        if admin.get("admin_role") not in allowed_set:
            raise HTTPException(403, f"Requires one of: {', '.join(allowed_set)}")
        return admin
    return _dep


require_super_admin = require_roles("super_admin")
require_super_or_ops = require_roles("super_admin", "operations_admin")


# ============================================================================
# REQUEST / RESPONSE MODELS
# ============================================================================

class LoginBody(BaseModel):
    email: EmailStr
    password: str


class TwoFAVerifyBody(BaseModel):
    temp_token: str
    code: str  # 6-digit TOTP OR 8-char backup code


class TwoFAEnableBody(BaseModel):
    setup_token: str
    code: str


# ============================================================================
# ROUTES
# ============================================================================

@router.post("/login")
async def admin_login(body: LoginBody, request: Request):
    """Step 1 of admin login.
    Returns one of:
      { requires_2fa: true,        temp_token, role }     (normal path)
      { requires_2fa_setup: true,  setup_token, qr_data_uri, secret, role }  (first time)
    """
    ip = request.client.host if request.client else None
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user:
        await audit_log(None, "admin_login_attempt", ip=ip, result="not_found",
                        detail={"email": email})
        # Constant-time-ish: still pretend to verify with a real bcrypt hash.
        try:
            bcrypt.checkpw(b"x", b"$2b$12$KIXQK8eYHJ.5Q3X2pUe3J.LhJqYqYqYqYqYqYqYqYqYqYqYqYqYqY")
        except Exception:
            pass
        raise HTTPException(401, "Invalid email or password")

    user = await _ensure_admin_role(user)
    if not user.get("admin_role"):
        await audit_log(user.get("id"), "admin_login_attempt", ip=ip,
                        result="not_admin")
        raise HTTPException(403, "This account is not an admin")

    locked, until = await _is_locked(user["id"])
    if locked:
        await audit_log(user["id"], "admin_login_attempt", ip=ip, result="locked")
        raise HTTPException(423, f"Account locked until {until}")

    if not verify_password(body.password, user["password_hash"]):
        await _record_failure(user["id"])
        await audit_log(user["id"], "admin_login_attempt", ip=ip,
                        result="bad_password")
        raise HTTPException(401, "Invalid email or password")

    await _clear_failures(user["id"])

    # 2FA branch
    if user.get("totp_enabled") and user.get("totp_secret"):
        await audit_log(user["id"], "admin_login_password_ok", ip=ip)
        return {
            "requires_2fa": True,
            "temp_token": _make_pre2fa_token(user["id"]),
            "role": user["admin_role"],
        }

    # First-time setup
    secret = pyotp.random_base32()
    otpauth = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user["email"], issuer_name=TOTP_ISSUER,
    )
    await audit_log(user["id"], "admin_login_first_time", ip=ip)
    return {
        "requires_2fa_setup": True,
        "setup_token": _make_setup_token(user["id"], secret),
        "qr_data_uri": _qr_data_uri(otpauth),
        "secret": secret,
        "role": user["admin_role"],
    }


@router.post("/2fa/enable")
async def admin_2fa_enable(body: TwoFAEnableBody, request: Request):
    """First-time 2FA setup: verify the first TOTP code, store the secret,
    return backup codes + the real admin token."""
    data = _decode(body.setup_token, expected_type="admin_setup")
    user_id = data["sub"]
    secret = data["totp_secret"]
    if not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(401, "Invalid 2FA code")

    plain_codes, hashed_codes = _gen_backup_codes()
    await db.users.update_one({"id": user_id}, {"$set": {
        "totp_secret": secret,
        "totp_enabled": True,
        "totp_backup_codes": hashed_codes,
        "totp_enabled_at": _iso(_now()),
    }})

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")
    sid = await _create_session(user_id, ip or "", ua)
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0, "totp_secret": 0, "totp_backup_codes": 0})
    token = _make_admin_token(user_id, sid, user["admin_role"])
    await audit_log(user_id, "admin_2fa_enabled", ip=ip)
    return {
        "token": token,
        "admin": _public_admin(user),
        "backup_codes": plain_codes,  # SHOW ONCE
    }


@router.post("/2fa/verify")
async def admin_2fa_verify(body: TwoFAVerifyBody, request: Request):
    """Step 2 of admin login: verify TOTP (or backup code), issue real token."""
    data = _decode(body.temp_token, expected_type="admin_pre2fa")
    user_id = data["sub"]
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user or not user.get("totp_secret"):
        raise HTTPException(401, "2FA not configured")

    code = (body.code or "").strip()
    accepted = False
    # Path 1: TOTP
    if len(code) == 6 and code.isdigit():
        if pyotp.TOTP(user["totp_secret"]).verify(code, valid_window=1):
            accepted = True
    # Path 2: Backup code (single-use)
    if not accepted:
        remaining = _consume_backup_code(user.get("totp_backup_codes") or [], code)
        if remaining is not None:
            await db.users.update_one({"id": user_id}, {"$set": {"totp_backup_codes": remaining}})
            accepted = True
            await audit_log(user_id, "admin_backup_code_used",
                            ip=request.client.host if request.client else None,
                            detail={"remaining": len(remaining)})

    if not accepted:
        await _record_failure(user_id)
        await audit_log(user_id, "admin_2fa_attempt",
                        ip=request.client.host if request.client else None,
                        result="bad_code")
        raise HTTPException(401, "Invalid 2FA code")

    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent", "")
    sid = await _create_session(user_id, ip or "", ua)
    safe = {k: v for k, v in user.items() if k not in ("password_hash", "totp_secret", "totp_backup_codes")}
    token = _make_admin_token(user_id, sid, user["admin_role"])
    await audit_log(user_id, "admin_login_complete", ip=ip)
    return {"token": token, "admin": _public_admin(safe)}


@router.post("/logout")
async def admin_logout(request: Request, admin: dict = Depends(get_current_admin)):
    sid = None
    try:
        h = request.headers.get("authorization", "")
        if h.startswith("Bearer "):
            data = _decode(h.split(" ", 1)[1], expected_type="admin")
            sid = data.get("sid")
    except Exception:
        pass
    if sid:
        await db.admin_sessions.update_one({"id": sid}, {"$set": {"revoked": True}})
    await audit_log(admin["id"], "admin_logout",
                    ip=request.client.host if request.client else None)
    return {"ok": True}


@router.get("/me")
async def admin_me(admin: dict = Depends(get_current_admin)):
    return {"admin": _public_admin(admin)}


# ----------------------------- helpers -----------------------------

def _public_admin(u: dict) -> dict:
    """Sanitised admin user shape returned to the client."""
    return {
        "id": u.get("id"),
        "email": u.get("email"),
        "name": u.get("name"),
        "admin_role": u.get("admin_role"),
        "is_admin": True,
        "totp_enabled": bool(u.get("totp_enabled")),
        "backup_codes_remaining": len(u.get("totp_backup_codes") or []),
    }
