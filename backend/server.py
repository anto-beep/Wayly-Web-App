"""Wayly — backend API."""
import os
import io
import csv
import logging
import re
import statistics
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict, Any
from typing import Literal as _LiteralType  # noqa: F401

from collections import defaultdict
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pypdf import PdfReader
import jwt

from auth import (
    hash_password,
    verify_password,
    create_token,
    create_access_token,
    create_refresh_token,
    create_mfa_challenge_token,
    decode_refresh_token,
    decode_mfa_challenge_token,
    get_current_user_id,
    get_current_user_payload,
    get_current_admin_id,
)
from security_utils import (
    assert_password_not_pwned,
    revoke_jti,
    revoke_all_user_tokens,
    is_user_locked,
    record_login_failure,
    clear_login_failures,
    encrypt_totp_secret,
    decrypt_totp_secret,
    is_totp_encrypted,
    ensure_security_indexes,
)
import pyotp
import qrcode
import base64
import io as _io_for_qr
import secrets as _secrets_mod
import rate_limit as _rl
from models import (
    SignupRequest,
    LoginRequest,
    TokenResponse,
    UserPublic,
    PlanUpdate,
    HouseholdCreate,
    Household,
    Statement,
    StatementLineItem,
    Anomaly,
    FamilyMessageCreate,
    FamilyMessage,
    AuditEvent,
    ChatRequest,
    ChatTurn,
    ConcernCreate,
    new_id,
    now_iso,
)
import budget as budget_lib
from agents import parse_statement, explain_anomalies, chat_with_kindred
from wrapper import run_wrapper
import email_service
import asyncio
import json
from auth_emergent import exchange_session_id
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout, CheckoutSessionRequest,
)
from constants import (
    TRIAL_DAYS, HOUSEHOLD_MAX_MEMBERS, RATE_LIMIT_WINDOW_HOURS, RATE_LIMIT_MAX_PER_IP,
    PASSWORD_RESET_EXPIRY_MINUTES, INVITE_EXPIRY_DAYS, NOTIFICATION_CATEGORIES,
    DEFAULT_NOTIFICATION_PREFS, DIGEST_FREQUENCY_DEFAULT,
)
import digest_service
import observability as _obs
import security_alerter as _alerter

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("kindred")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="Wayly API")
APP_STARTED_AT = datetime.now(timezone.utc)
APP_BUILD_VERSION = os.environ.get("APP_BUILD_VERSION", "iter38-2026-02")
ANOMALY_ENGINE_VERSION = "v3.4-iter27"
DOCUMENT_EXTRACT_VERSION = "v2.1-iter28"
api = APIRouter(prefix="/api")


# ----------------- helpers -----------------
async def _get_user(user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


async def _get_user_household(user_id: str) -> Optional[dict]:
    user = await _get_user(user_id)
    hid = user.get("household_id")
    if not hid:
        return None
    return await db.households.find_one({"id": hid}, {"_id": 0})


async def _require_household(user_id: str) -> dict:
    h = await _get_user_household(user_id)
    if not h:
        raise HTTPException(status_code=400, detail="No household configured. Complete onboarding first.")
    return h


async def _resolve_active_participant(user_id: str, request: Request) -> Optional[dict]:
    """Reads the `X-Participant-Id` header and validates it belongs to the
    user's account via `assert_participant_access`. Falls back to the
    household's primary participant when the header is missing. If the header
    is present but the participant doesn't belong to the caller we now
    raise 404 — silently falling back was hiding cross-account bugs."""
    from security_utils import assert_participant_access
    pid = request.headers.get("x-participant-id")
    if pid:
        # 404 if the pid doesn't belong to this user — explicit, auditable.
        p = await assert_participant_access(user_id, pid, require_active=True)
        try:
            await _alerter.record_participant_access(db, user_id=user_id, participant_id=pid)
        except Exception:
            pass
        return p
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0, "household_id": 1})
    hid = (user_doc or {}).get("household_id")
    if not hid:
        return None
    return await db.participants.find_one(
        {"household_id": hid, "is_primary": True, "status": {"$ne": "REMOVED"}}, {"_id": 0}
    ) or await db.participants.find_one({"household_id": hid, "status": {"$ne": "REMOVED"}}, {"_id": 0})


async def _scope_query_to_participant(user_id: str, request: Request, base_q: Dict[str, Any]) -> Dict[str, Any]:
    """Tighten `base_q` to the active participant. Legacy docs (no
    participant_id) are treated as belonging to the household's primary
    participant — so existing data continues to surface for that person
    until a background backfill runs."""
    p = await _resolve_active_participant(user_id, request)
    if not p:
        return base_q
    q = dict(base_q)
    if p.get("is_primary"):
        q["$or"] = [
            {"participant_id": p["id"]},
            {"participant_id": None},
            {"participant_id": {"$exists": False}},
        ]
    else:
        q["participant_id"] = p["id"]
    return q


async def _audit(household_id: str, actor_id: str, actor_name: str, action: str, detail: str) -> None:
    evt = AuditEvent(
        household_id=household_id,
        actor_id=actor_id,
        actor_name=actor_name,
        action=action,
        detail=detail,
    )
    await db.audit_events.insert_one(evt.model_dump())


def _user_public(u: dict, sub: Optional[dict] = None) -> UserPublic:
    return UserPublic(
        id=u["id"],
        email=u["email"],
        name=u["name"],
        role=u["role"],
        plan=u.get("plan", "free"),
        household_id=u.get("household_id"),
        created_at=u["created_at"],
        is_admin=bool(u.get("is_admin", False)),
        admin_role=u.get("admin_role"),
        subscription_status=(sub or {}).get("status"),
        trial_ends_at=(sub or {}).get("trial_ends_at"),
        cancel_at_period_end=(sub or {}).get("cancel_at_period_end"),
        totp_enabled=bool(u.get("totp_enabled", False)),
    )


async def _user_public_with_sub(u: dict) -> UserPublic:
    """Fetch the subscription doc and build a UserPublic with trial info."""
    sub = await db.subscriptions.find_one({"user_id": u["id"]}, {"_id": 0})
    return _user_public(u, sub)


# ----------------- auth -----------------
@api.post("/auth/signup")
async def signup(payload: SignupRequest, request: Request):
    await _rl.enforce(
        request,
        ("signup_ip", _rl._client_ip(request)),
        ("signup_email", payload.email.lower()),
    )
    # Check existing email first to save an HIBP round-trip on collisions.
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    # Phase 1: refuse passwords seen in HIBP breach corpus.
    await assert_password_not_pwned(payload.password)
    user_doc = {
        "id": new_id(),
        "email": payload.email.lower(),
        "password_hash": hash_password(payload.password),
        "name": payload.name,
        "role": payload.role,
        "plan": payload.plan,
        "household_id": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(user_doc)
    # Adviser-portal auto-link: if any adviser invited this email, mark linked.
    try:
        from adviser_routes import link_client_by_email, link_client_by_invite_token
        await link_client_by_email(user_doc["id"], user_doc["email"])
        if payload.invite:
            await link_client_by_invite_token(user_doc["id"], payload.invite)
    except Exception as _e:
        logger.warning("adviser auto-link (signup) failed: %s", _e)
    access, _jti, _exp = create_access_token(user_doc["id"])
    refresh, _rjti, _rexp = create_refresh_token(user_doc["id"])
    _obs.log_auth_login_success(user_doc["id"], _rl._client_ip(request))
    return {
        "token": access,
        "refresh_token": refresh,
        "user": (await _user_public_with_sub(user_doc)).model_dump(),
    }


# ----------------- auth: login -----------------
@api.post("/auth/login")
async def login(payload: LoginRequest, request: Request):
    """Phase 1 hardened login + Phase 3 rate limiting:
    - Generic error message for unknown email vs wrong password (anti-enumeration)
    - 5-failure / 15-min lockout per account
    - Per-IP + per-email Redis rate limit (5/5min/IP + 10/hour/email)
      counted on FAILED attempts only — successful logins are not abuse and
      must not lock legitimate users sharing an IP (NAT, carrier CGN, family
      behind one router).
    - MFA branch: if the user opted into TOTP, returns `requires_mfa=true` and a
      short-lived challenge token instead of the access pair.
    """
    # Read-only check — if a previous burst of failures has exhausted the
    # bucket we still refuse to even look at the password. This is the
    # short-circuit that protects against credential-stuffing.
    await _rl.enforce_peek(
        request,
        ("login_ip", _rl._client_ip(request)),
        ("login_email", payload.email.lower()),
    )
    _ip = _rl._client_ip(request)
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user:
        # Constant-ish time: run a dummy bcrypt to mask the no-user path.
        try:
            verify_password(payload.password, "$2b$12$" + "x" * 53)
        except Exception:
            pass
        # Consume the budget — this is a real failed attempt.
        await _rl.consume("login_ip", _ip)
        await _rl.consume("login_email", payload.email.lower())
        _obs.log_auth_login_failure(_ip, attempt_count=0)
        await _alerter.record_login_failure(db, ip=_ip, email=payload.email.lower())
        raise HTTPException(status_code=401, detail="Invalid email or password")

    locked, until = await is_user_locked(user["id"])
    if locked:
        _obs.log_auth_lockout(_ip, user_id=user["id"])
        raise HTTPException(
            status_code=423,
            detail=(
                "Account temporarily locked due to too many failed attempts. "
                f"Try again after {until.strftime('%H:%M UTC')} or reset your password."
            ),
        )

    if not verify_password(payload.password, user["password_hash"]):
        await record_login_failure(user["id"])
        # Best-effort attempt count from the user record after the increment.
        try:
            _u = await db.users.find_one({"id": user["id"]}, {"failed_login_count": 1, "_id": 0})
            _attempts = int((_u or {}).get("failed_login_count") or 0)
        except Exception:
            _attempts = 0
        # Failed password — burn the rate-limit budget so brute-force still
        # gets blocked.
        await _rl.consume("login_ip", _ip)
        await _rl.consume("login_email", payload.email.lower())
        _obs.log_auth_login_failure(_ip, attempt_count=_attempts)
        await _alerter.record_login_failure(db, ip=_ip, email=payload.email.lower())
        raise HTTPException(status_code=401, detail="Invalid email or password")

    await clear_login_failures(user["id"])
    # Successful login — clear any prior failure counter on this email so a
    # legitimate user who fat-fingered earlier today isn't punished. We leave
    # the per-IP counter alone (it protects against a shared NAT being used
    # for credential stuffing across many accounts).
    try:
        await _rl.reset("login_email", payload.email.lower())
    except Exception:
        pass

    # MFA branch (opt-in for caregivers / participants)
    if user.get("totp_enabled") and user.get("totp_secret"):
        return {
            "requires_mfa": True,
            "temp_token": create_mfa_challenge_token(user["id"]),
        }

    access, _jti, _exp = create_access_token(user["id"])
    refresh, _rjti, _rexp = create_refresh_token(user["id"])
    _obs.log_auth_login_success(user["id"], _ip)
    return {
        "token": access,
        "refresh_token": refresh,
        "user": (await _user_public_with_sub(user)).model_dump(),
    }


@api.get("/auth/me", response_model=UserPublic)
async def me(user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    return await _user_public_with_sub(u)


@api.post("/auth/refresh")
async def refresh_session(request: Request):
    """Exchange a refresh token for a new short-lived access token. Optional
    rotation of the refresh token itself (defence against token reuse)."""
    body = await request.json()
    rt = (body or {}).get("refresh_token")
    if not rt:
        raise HTTPException(status_code=400, detail="Missing refresh token")
    payload = decode_refresh_token(rt)
    # Defence in depth — refresh tokens are also subject to the per-user
    # `token_invalid_before` sentinel and the blocklist.
    from auth import _enforce_revocation
    await _enforce_revocation({**payload, "type": "access"})  # reuse the checks
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    access, _jti, _exp = create_access_token(user["id"])
    new_refresh, _rjti, _rexp = create_refresh_token(user["id"])
    # Rotate: revoke the *used* refresh jti so it cannot be re-used.
    try:
        old_jti = payload.get("jti")
        old_exp = payload.get("exp")
        if old_jti and old_exp:
            await revoke_jti(
                old_jti,
                payload["sub"],
                datetime.fromtimestamp(int(old_exp), tz=timezone.utc),
                reason="refresh_rotated",
            )
    except Exception as _e:
        logger.warning("refresh-token rotation revoke failed: %s", _e)
    return {"token": access, "refresh_token": new_refresh}


@api.put("/auth/plan", response_model=UserPublic)
async def update_plan(payload: PlanUpdate, user_id: str = Depends(get_current_user_id)):
    await db.users.update_one({"id": user_id}, {"$set": {"plan": payload.plan}})
    u = await _get_user(user_id)
    return await _user_public_with_sub(u)


# ----------------- emergent google auth -----------------
class GoogleSessionBody(BaseModel):
    session_id: str = Field(min_length=4, max_length=512)


@api.post("/auth/google-session", response_model=TokenResponse)
async def google_session(body: GoogleSessionBody, response: Response):
    """Exchange a session_id from #session_id=… for a JWT + persistent cookie."""
    try:
        data = await exchange_session_id(body.session_id)
    except Exception as e:
        logger.warning("Emergent OAuth exchange failed: %s", e)
        raise HTTPException(status_code=401, detail="Could not verify Google session")
    email = (data.get("email") or "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="No email returned from Google")
    name = data.get("name") or email.split("@")[0]
    picture = data.get("picture")
    session_token = data.get("session_token")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        await db.users.update_one(
            {"id": existing["id"]},
            {"$set": {"name": existing.get("name") or name, "picture": picture, "auth_method": "google"}},
        )
        user = await _get_user(existing["id"])
    else:
        user = {
            "id": new_id(),
            "email": email,
            "password_hash": "",
            "name": name,
            "picture": picture,
            "role": "caregiver",
            "plan": "free",
            "household_id": None,
            "auth_method": "google",
            "created_at": now_iso(),
        }
        await db.users.insert_one(user)
        # Adviser-portal auto-link for first-time Google sign-ups.
        try:
            from adviser_routes import link_client_by_email
            await link_client_by_email(user["id"], email)
        except Exception as _e:
            logger.warning("adviser auto-link (google) failed: %s", _e)

    if session_token:
        await db.user_sessions.update_one(
            {"user_id": user["id"]},
            {
                "$set": {
                    "user_id": user["id"],
                    "session_token": session_token,
                    "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
                }
            },
            upsert=True,
        )
        response.set_cookie(
            "session_token",
            session_token,
            max_age=7 * 24 * 3600,
            path="/",
            httponly=True,
            secure=True,
            samesite="none",
        )
    access, _jti, _exp = create_access_token(user["id"])
    refresh, _rjti, _rexp = create_refresh_token(user["id"])
    _obs.log_auth_login_success(user["id"], ip=None)
    return {
        "token": access,
        "refresh_token": refresh,
        "user": (await _user_public_with_sub(user)).model_dump(),
    }


@api.post("/auth/logout")
async def logout(
    response: Response,
    payload: dict = Depends(get_current_user_payload),
):
    user_id = payload["sub"]
    # Blocklist the current access token so it can't be re-used until expiry.
    try:
        jti = payload.get("jti")
        exp = payload.get("exp")
        if jti and exp:
            await revoke_jti(
                jti, user_id,
                datetime.fromtimestamp(int(exp), tz=timezone.utc),
                reason="logout",
            )
    except Exception as _e:
        logger.warning("logout blocklist failed: %s", _e)
    await db.user_sessions.delete_many({"user_id": user_id})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}


# ----------------- household -----------------
@api.post("/household", response_model=Household)
async def create_household(payload: HouseholdCreate, user_id: str = Depends(get_current_user_id)):
    user = await _get_user(user_id)
    if user.get("household_id"):
        raise HTTPException(status_code=409, detail="Household already exists for this user")
    h = Household(owner_id=user_id, **payload.model_dump())
    await db.households.insert_one(h.model_dump())
    await db.users.update_one({"id": user_id}, {"$set": {"household_id": h.id}})
    # Adviser-portal: now that the household exists, wire it into any linked roster row.
    try:
        from adviser_routes import link_client_household
        await link_client_household(user_id, h.id)
    except Exception as _e:
        logger.warning("adviser household-link failed: %s", _e)
    await _audit(h.id, user_id, user["name"], "HOUSEHOLD_CREATED",
                 f"Set up household for {payload.participant_name} (Classification {payload.classification})")
    return h


@api.get("/household", response_model=Optional[Household])
async def get_household(user_id: str = Depends(get_current_user_id)):
    h = await _get_user_household(user_id)
    return h


# ----------------- password reset & email verification -----------------
class ForgotBody(BaseModel):
    email: EmailStr


class ResetBody(BaseModel):
    token: str = Field(min_length=10, max_length=128)
    new_password: str = Field(min_length=8)


class VerifyBody(BaseModel):
    token: str = Field(min_length=10, max_length=128)


@api.post("/auth/forgot")
async def forgot_password(body: ForgotBody, request: Request):
    """Email enumeration-safe: always returns ok=True after a short delay."""
    await _rl.enforce(request, ("forgot_email", body.email.lower()))
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if user:
        token = new_id().replace("-", "") + new_id().replace("-", "")
        await db.password_resets.insert_one({
            "token": token,
            "user_id": user["id"],
            "email": user["email"],
            "expires_at": (datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_EXPIRY_MINUTES)).isoformat(),
            "used": False,
            "created_at": now_iso(),
        })
        origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
        reset_url = f"{origin}/reset?token={token}"
        try:
            await email_service.email_tool_result(
                to=user["email"],
                tool_name="Password reset",
                headline="Reset your Wayly password",
                body_html=(
                    f"<p>Someone (hopefully you) requested a password reset for your Wayly account.</p>"
                    f"<p><a href='{reset_url}' style='display:inline-block;background:#0E2A47;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none'>Reset password</a></p>"
                    f"<p style='color:#6B7280;font-size:13px'>This link expires in 60 minutes. If you didn't request this, ignore this email — your password has not changed.</p>"
                ),
            )
        except Exception as e:
            logger.warning("Password reset email send failed: %s", e)
    return {"ok": True}


@api.post("/auth/reset")
async def reset_password(body: ResetBody, request: Request):
    await _rl.enforce(request, ("reset_ip", _rl._client_ip(request)))
    # HIBP — refuse a reset to a known-compromised password.
    await assert_password_not_pwned(body.new_password)
    rec = await db.password_resets.find_one({"token": body.token, "used": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    expires = datetime.fromisoformat(rec["expires_at"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Reset link has expired — request a new one")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await db.password_resets.update_one({"token": body.token}, {"$set": {"used": True, "used_at": now_iso()}})
    _obs.log_auth_password_reset(rec["user_id"])
    # Kill every outstanding access / refresh token for this user.
    try:
        await revoke_all_user_tokens(rec["user_id"], reason="password_reset")
    except Exception as _e:
        logger.warning("revoke_all_user_tokens (reset) failed: %s", _e)
    u = await _get_user(rec["user_id"])
    return {"ok": True, "email": u["email"]}


# ----------------- caregiver MFA (TOTP, opt-in) -----------------
class MfaVerifyBody(BaseModel):
    temp_token: str
    code: str


class MfaEnableBody(BaseModel):
    setup_token: str
    code: str


class MfaDisableBody(BaseModel):
    password: str
    code: Optional[str] = None  # current TOTP or backup code


def _qr_data_uri(otpauth_uri: str) -> str:
    img = qrcode.make(otpauth_uri)
    buf = _io_for_qr.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


@api.post("/auth/mfa/setup")
async def mfa_setup(user_id: str = Depends(get_current_user_id)):
    """Generate a new TOTP secret + QR code. Secret lives inside the setup
    token (signed JWT, 10-min TTL) and is *not* stored until /mfa/enable
    confirms a valid first code."""
    u = await _get_user(user_id)
    if u.get("totp_enabled"):
        raise HTTPException(status_code=409, detail="Two-factor is already enabled on this account.")
    secret = pyotp.random_base32()
    otpauth = pyotp.totp.TOTP(secret).provisioning_uri(
        name=u["email"], issuer_name="Wayly",
    )
    setup_payload_token = jwt.encode(
        {
            "sub": user_id,
            "type": "mfa_setup",
            "totp_secret": secret,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
        },
        os.environ["JWT_SECRET"],
        algorithm=os.environ.get("JWT_ALGORITHM", "HS256"),
    )
    return {
        "setup_token": setup_payload_token,
        "qr_data_uri": _qr_data_uri(otpauth),
        "secret": secret,
    }


@api.post("/auth/mfa/enable")
async def mfa_enable(body: MfaEnableBody, user_id: str = Depends(get_current_user_id)):
    """Confirm the QR-scanned authenticator works, then persist the (encrypted)
    secret + 8 backup codes."""
    try:
        data = jwt.decode(
            body.setup_token,
            os.environ["JWT_SECRET"],
            algorithms=[os.environ.get("JWT_ALGORITHM", "HS256")],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Setup window expired — restart 2FA setup.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid setup token.")
    if data.get("type") != "mfa_setup" or data.get("sub") != user_id:
        raise HTTPException(status_code=401, detail="Invalid setup token.")
    secret = data.get("totp_secret")
    if not secret or not pyotp.TOTP(secret).verify(body.code, valid_window=1):
        raise HTTPException(status_code=401, detail="That code didn't match — try the latest 6 digits from your authenticator.")
    # generate 8 single-use backup codes
    plain_codes = [_secrets_mod.token_hex(4).upper() for _ in range(8)]
    import bcrypt as _bc
    hashed_codes = [_bc.hashpw(p.encode(), _bc.gensalt()).decode() for p in plain_codes]
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "totp_secret": encrypt_totp_secret(secret),
            "totp_enabled": True,
            "totp_backup_codes": hashed_codes,
            "totp_enabled_at": now_iso(),
        }},
    )
    _obs.log_auth_mfa_enabled(user_id)
    return {"ok": True, "backup_codes": plain_codes}


@api.post("/auth/mfa/verify")
async def mfa_verify(body: MfaVerifyBody):
    """Second leg of login: consume the short-lived challenge token + a 6-digit
    TOTP (or 8-char backup code) and return the real access/refresh pair."""
    data = decode_mfa_challenge_token(body.temp_token)
    user_id = data["sub"]
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u or not u.get("totp_secret"):
        raise HTTPException(status_code=401, detail="2FA not configured for this account.")
    code = (body.code or "").strip()
    accepted = False
    raw_secret = u.get("totp_secret")
    plain_secret = decrypt_totp_secret(raw_secret)
    if len(code) == 6 and code.isdigit() and plain_secret:
        if pyotp.TOTP(plain_secret).verify(code, valid_window=1):
            accepted = True
            if raw_secret and not is_totp_encrypted(raw_secret):
                try:
                    await db.users.update_one(
                        {"id": user_id},
                        {"$set": {"totp_secret": encrypt_totp_secret(plain_secret)}},
                    )
                except Exception:
                    pass
    if not accepted:
        # backup-code path (single-use)
        import bcrypt as _bc
        for h in list(u.get("totp_backup_codes") or []):
            try:
                if _bc.checkpw(code.upper().encode(), h.encode()):
                    remaining = [x for x in u.get("totp_backup_codes") or [] if x != h]
                    await db.users.update_one(
                        {"id": user_id},
                        {"$set": {"totp_backup_codes": remaining}},
                    )
                    accepted = True
                    break
            except Exception:
                continue
    if not accepted:
        await record_login_failure(user_id)
        _obs.log_auth_mfa_failure(user_id, ip=None)
        raise HTTPException(status_code=401, detail="Invalid 2FA code.")
    await clear_login_failures(user_id)
    access, _jti, _exp = create_access_token(user_id)
    refresh, _rjti, _rexp = create_refresh_token(user_id)
    _obs.log_auth_login_success(user_id, ip=None)
    return {
        "token": access,
        "refresh_token": refresh,
        "user": (await _user_public_with_sub(u)).model_dump(),
    }


@api.post("/auth/mfa/disable")
async def mfa_disable(body: MfaDisableBody, user_id: str = Depends(get_current_user_id)):
    """Disable 2FA — requires the current password AND (if a code is provided)
    the current TOTP. The code is optional only as a last-resort recovery
    if the user lost their authenticator AND their backup codes; the password
    confirmation alone is enough but is *strongly* discouraged in the UI."""
    u = await _get_user(user_id)
    if not verify_password(body.password, u["password_hash"]):
        raise HTTPException(status_code=401, detail="Password incorrect.")
    if body.code:
        # If they provided a code, it must match — extra defence.
        raw = u.get("totp_secret")
        plain = decrypt_totp_secret(raw)
        if not plain or not pyotp.TOTP(plain).verify(body.code, valid_window=1):
            raise HTTPException(status_code=401, detail="Invalid 2FA code.")
    await db.users.update_one(
        {"id": user_id},
        {"$unset": {"totp_secret": "", "totp_enabled": "", "totp_backup_codes": "", "totp_enabled_at": ""}},
    )
    return {"ok": True}


@api.post("/auth/verify/send")
async def send_verify(user_id: str = Depends(get_current_user_id), request: Request = None):
    u = await _get_user(user_id)
    if u.get("email_verified"):
        return {"ok": True, "already_verified": True}
    token = new_id().replace("-", "") + new_id().replace("-", "")
    await db.email_verifications.insert_one({
        "token": token, "user_id": user_id, "email": u["email"],
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=7)).isoformat(),
        "created_at": now_iso(),
    })
    origin = (request.headers.get("origin") if request else None) or "https://aged-care-os.preview.emergentagent.com"
    verify_url = f"{origin}/verify?token={token}"
    try:
        await email_service.email_tool_result(
            to=u["email"],
            tool_name="Verify your email",
            headline=f"Confirm your Wayly account, {u['name'].split(' ')[0]}",
            body_html=(
                f"<p>Welcome to Wayly. Tap the button below to confirm this email address.</p>"
                f"<p><a href='{verify_url}' style='display:inline-block;background:#2BC4D6;color:#0E2A47;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600'>Confirm email</a></p>"
                f"<p style='color:#6B7280;font-size:13px'>If you didn't create a Wayly account, ignore this email.</p>"
            ),
        )
    except Exception as e:
        logger.warning("Verify email failed: %s", e)
    return {"ok": True}


@api.post("/auth/verify")
async def verify_email(body: VerifyBody):
    rec = await db.email_verifications.find_one({"token": body.token}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid verification link")
    expires = datetime.fromisoformat(rec["expires_at"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Verification link has expired")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"email_verified": True, "email_verified_at": now_iso()}})
    await db.email_verifications.delete_many({"user_id": rec["user_id"]})
    return {"ok": True}


# ----------------- household member invites -----------------
class InviteBody(BaseModel):
    email: EmailStr
    role: _LiteralType["family_member", "advisor"]
    note: Optional[str] = None


class InviteAcceptBody(BaseModel):
    token: str = Field(min_length=10, max_length=128)


@api.post("/household/invite")
async def create_invite(body: InviteBody, request: Request, user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    # Plan gate first (clearer 402 for Solo/Free users)
    if u.get("plan") != "family":
        raise HTTPException(status_code=402, detail={"code": "plan_required", "message": "Family plan required to invite members."})
    household = await _get_user_household(user_id)
    if not household:
        raise HTTPException(status_code=400, detail="Create a household first")
    # max 5 active members including owner
    members = await db.household_members.count_documents({"household_id": household["id"], "status": {"$in": ["active", "pending"]}})
    if members >= (HOUSEHOLD_MAX_MEMBERS - 1):  # owner + up to MAX-1 invitees
        raise HTTPException(status_code=400, detail=f"Family plan limit: {HOUSEHOLD_MAX_MEMBERS} members (including you)")
    token = new_id().replace("-", "") + new_id().replace("-", "")
    invite = {
        "token": token,
        "household_id": household["id"],
        "household_name": household['participant_name'],
        "inviter_user_id": user_id,
        "inviter_name": u["name"],
        "email": body.email.lower(),
        "role": body.role,
        "note": body.note,
        "status": "pending",
        "expires_at": (datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRY_DAYS)).isoformat(),
        "created_at": now_iso(),
    }
    await db.invites.insert_one(invite)
    origin = request.headers.get("origin") or str(request.base_url).rstrip("/")
    accept_url = f"{origin}/invite?token={token}"
    hh_name = household['participant_name']
    try:
        await email_service.email_tool_result(
            to=body.email,
            tool_name="Wayly family invitation",
            headline=f"{u['name']} invited you to {hh_name}'s Wayly",
            body_html=(
                f"<p>{u['name']} wants you involved as a <strong>{body.role.replace('_', ' ')}</strong> on {hh_name}'s Wayly household.</p>"
                f"{('<p><em>Note from ' + u['name'].split(' ')[0] + ':</em> ' + body.note + '</p>') if body.note else ''}"
                f"<p><a href='{accept_url}' style='display:inline-block;background:#2BC4D6;color:#0E2A47;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600'>Accept invitation</a></p>"
                f"<p style='color:#6B7280;font-size:13px'>Invitation expires in {INVITE_EXPIRY_DAYS} days.</p>"
            ),
        )
    except Exception as e:
        logger.warning("Invite email failed: %s", e)
    await _audit(household["id"], user_id, u["name"], "INVITE_SENT", f"Invited {body.email} as {body.role}")
    invite.pop("_id", None)
    return invite


@api.get("/household/members")
async def list_members(user_id: str = Depends(get_current_user_id)):
    household = await _get_user_household(user_id)
    if not household:
        return {"members": [], "invites": []}
    invites_cur = db.invites.find({"household_id": household["id"], "status": "pending"}, {"_id": 0})
    invites = await invites_cur.to_list(50)
    mem_cur = db.household_members.find({"household_id": household["id"]}, {"_id": 0})
    members = await mem_cur.to_list(50)
    # Include the owner (current user) synthesised
    owner = await _get_user(household["owner_id"])
    owner_row = {
        "user_id": owner["id"], "email": owner["email"], "name": owner["name"],
        "role": "primary", "status": "active", "joined_at": household.get("created_at", ""),
    }
    return {"members": [owner_row] + members, "invites": invites}


# -- Share dashboard: email a snapshot to all family members or a custom list --
class ShareDashboardBody(BaseModel):
    extra_emails: List[EmailStr] = Field(default_factory=list, max_length=10)
    note: Optional[str] = Field(default="", max_length=600)


@api.post("/dashboard/share")
async def share_dashboard(body: ShareDashboardBody, user_id: str = Depends(get_current_user_id)):
    """Email an HTML snapshot of the current quarter dashboard to:
       - all active household members + pending invites
       - PLUS any extra recipients the caller supplied.
    Uses the same Resend pipeline as the weekly digest.
    Returns {sent_to: [emails], failures: [emails]}."""
    h = await _require_household(user_id)
    sender = await _get_user(user_id)
    # Build recipient list (deduped).
    recips: list[str] = []
    members = await db.household_members.find({"household_id": h["id"], "status": "active"}, {"_id": 0, "email": 1}).to_list(20)
    invites = await db.invites.find({"household_id": h["id"], "status": "pending"}, {"_id": 0, "email": 1}).to_list(20)
    for r in [*members, *invites]:
        em = (r.get("email") or "").strip().lower()
        if em and em not in recips:
            recips.append(em)
    for em in body.extra_emails:
        em = str(em).strip().lower()
        if em and em not in recips:
            recips.append(em)
    if not recips:
        raise HTTPException(status_code=400, detail="No recipients — invite family or add an email address.")
    if len(recips) > 15:
        raise HTTPException(status_code=400, detail="Too many recipients in a single send (max 15).")

    # Compute current-quarter snapshot (reuses budget logic)
    docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0, "file_b64": 0}).sort("uploaded_at", -1).to_list(50)
    all_items: list[dict] = []
    for s in docs:
        all_items.extend(s.get("line_items", []))
    q_start, q_end, q_label = budget_lib.get_quarter_window()
    burn = budget_lib.compute_burn(all_items, q_start, q_end)
    allocations = budget_lib.stream_allocations(h.get("classification") or 4)
    quarterly_total = budget_lib.quarterly_budget(h.get("classification") or 4)
    cap_amount = budget_lib.lifetime_cap(h.get("is_grandfathered", False))
    contributions_total = budget_lib.compute_contributions(all_items)
    # Top 5 anomalies across recent statements
    recent_anoms: list[dict] = []
    for s in docs[:3]:
        for a in s.get("anomalies") or []:
            recent_anoms.append({**a, "_period": s.get("period_label") or s.get("filename")})
    recent_anoms.sort(key=lambda a: {"alert": 0, "warning": 1, "info": 2}.get((a.get("severity") or "").lower(), 3))
    top_anoms = recent_anoms[:5]

    def fmt(n):
        try:
            return f"${float(n):,.2f}"
        except Exception:
            return "$0.00"

    streams_html = ""
    for s in budget_lib.STREAMS:
        spent = burn.get(s, 0.0)
        cap = allocations.get(s, 0.0)
        pct = (spent / cap * 100) if cap else 0
        streams_html += (
            f"<tr><td style='padding:6px 8px;'>{s}</td>"
            f"<td style='padding:6px 8px;text-align:right;'>{fmt(spent)} / {fmt(cap)}</td>"
            f"<td style='padding:6px 8px;text-align:right;color:{'#A0522D' if pct > 100 else '#0E2A47'};'>{pct:.0f}%</td></tr>"
        )

    anom_html = "".join(
        f"<li><strong>[{(a.get('severity') or 'info').upper()}]</strong> {a.get('title','')}<br>"
        f"<span style='color:#5A6470;font-size:13px;'>{(a.get('detail') or '')[:200]}{'…' if len(a.get('detail') or '') > 200 else ''}"
        f" <em style='color:#9aa3b0'>(from {a.get('_period','')})</em></span></li>"
        for a in top_anoms
    ) or "<li style='color:#5A6470;'>No anomalies caught this quarter — looking good!</li>"

    note_block = (
        f"<blockquote style='border-left:3px solid #D4A574;margin:12px 0;padding:6px 12px;color:#0E2A47;background:#DCEBF7;'>"
        f"{(body.note or '').replace('<', '&lt;').replace('>', '&gt;')}</blockquote>"
        if body.note and body.note.strip() else ""
    )

    body_html = f"""
        <p>Hi,</p>
        <p>{sender.get('name') or 'Your family caregiver'} is sharing this Wayly dashboard snapshot for <strong>{h.get('participant_name','')}</strong> ({q_label}).</p>
        {note_block}
        <h3 style='font-family:Georgia,serif;color:#0E2A47;margin-top:24px;'>Budget this quarter</h3>
        <table style='border-collapse:collapse;width:100%;font-size:14px;'>
            <thead>
                <tr style='background:#DCEBF7;color:#5A6470;text-align:left;'>
                    <th style='padding:6px 8px;'>Stream</th>
                    <th style='padding:6px 8px;text-align:right;'>Spent / Cap</th>
                    <th style='padding:6px 8px;text-align:right;'>%</th>
                </tr>
            </thead>
            <tbody>{streams_html}</tbody>
            <tfoot>
                <tr style='border-top:1px solid #d6c9b3;font-weight:600;'>
                    <td style='padding:8px;'>Quarterly budget</td>
                    <td style='padding:8px;text-align:right;'>{fmt(quarterly_total)}</td>
                    <td></td>
                </tr>
            </tfoot>
        </table>
        <h3 style='font-family:Georgia,serif;color:#0E2A47;margin-top:24px;'>Lifetime contribution cap</h3>
        <p>{fmt(contributions_total)} of {fmt(cap_amount)} ({(contributions_total / cap_amount * 100) if cap_amount else 0:.2f}% used)</p>
        <h3 style='font-family:Georgia,serif;color:#0E2A47;margin-top:24px;'>Top anomalies to know</h3>
        <ul style='font-size:14px;line-height:1.55;color:#0E2A47;'>{anom_html}</ul>
        <p style='margin-top:28px;color:#5A6470;font-size:13px;'>
            View the full dashboard at <a href='https://wayly.com.au/app'>wayly.com.au/app</a>.
            Forwarded by {sender.get('name','')} ({sender.get('email','')}).
        </p>
        <p style='color:#9aa3b0;font-size:11px;margin-top:24px;'>
            You're receiving this because you're part of the Wayly household for {h.get('participant_name','')}.
            To stop sharing, ask the primary caregiver to remove you from <em>Settings → Family members</em>.
        </p>
    """

    sent: list[str] = []
    failures: list[str] = []
    for em in recips:
        try:
            await email_service.email_tool_result(
                to=em,
                tool_name=f"Wayly snapshot: {h.get('participant_name','')} · {q_label}",
                headline=f"Dashboard for {h.get('participant_name','')} · {q_label}",
                body_html=body_html,
            )
            sent.append(em)
        except Exception as e:
            logger.warning("share_dashboard send failed to %s: %s", em, e)
            failures.append(em)

    return {"sent_to": sent, "failures": failures, "count": len(sent)}


@api.delete("/household/members/{member_user_id}")
async def remove_member(member_user_id: str, user_id: str = Depends(get_current_user_id)):
    household = await _get_user_household(user_id)
    if not household or household["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Only the primary caregiver can remove members")
    if member_user_id == user_id:
        raise HTTPException(status_code=400, detail="You can't remove yourself — transfer ownership first")
    await db.household_members.update_one(
        {"household_id": household["id"], "user_id": member_user_id},
        {"$set": {"status": "removed", "removed_at": now_iso()}},
    )
    await db.users.update_one({"id": member_user_id}, {"$unset": {"household_id": ""}})
    return {"ok": True}


@api.get("/invite/{token}")
async def get_invite(token: str):
    inv = await db.invites.find_one({"token": token, "status": "pending"}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found or already used")
    expires = datetime.fromisoformat(inv["expires_at"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Invitation has expired")
    return {
        "email": inv["email"],
        "role": inv["role"],
        "household_name": inv["household_name"],
        "inviter_name": inv["inviter_name"],
        "note": inv.get("note"),
    }


@api.post("/invite/accept")
async def accept_invite(body: InviteAcceptBody, user_id: str = Depends(get_current_user_id)):
    inv = await db.invites.find_one({"token": body.token, "status": "pending"}, {"_id": 0})
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")
    u = await _get_user(user_id)
    if u["email"].lower() != inv["email"]:
        raise HTTPException(status_code=403, detail=f"This invitation is for {inv['email']}.")
    await db.household_members.insert_one({
        "household_id": inv["household_id"], "user_id": user_id,
        "email": u["email"], "name": u["name"], "role": inv["role"],
        "status": "active", "joined_at": now_iso(),
    })
    await db.users.update_one({"id": user_id}, {"$set": {"household_id": inv["household_id"]}})
    await db.invites.update_one({"token": body.token}, {"$set": {"status": "accepted", "accepted_at": now_iso()}})
    await _audit(inv["household_id"], user_id, u["name"], "INVITE_ACCEPTED",
                 f"{u['name']} joined as {inv['role']}")
    # Notify the inviter
    try:
        await create_notification(
            inv["inviter_user_id"],
            "family_messages",
            f"{u['name']} joined your household",
            f"They're now on the Wayly household as {inv['role'].replace('_', ' ')}.",
            "/settings/members",
        )
    except Exception:
        pass
    return {"ok": True, "household_id": inv["household_id"]}


# ----------------- wellbeing check-in -----------------
class WellbeingBody(BaseModel):
    mood: _LiteralType["good", "okay", "not_great"]
    notify_caregiver: bool = False


@api.post("/participant/wellbeing")
async def log_wellbeing(body: WellbeingBody, user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    household = await _get_user_household(user_id)
    doc = {
        "id": new_id(), "user_id": user_id,
        "household_id": household["id"] if household else None,
        "mood": body.mood, "notify_caregiver": body.notify_caregiver,
        "created_at": now_iso(),
    }
    await db.wellbeing.insert_one(doc)
    if household:
        await _audit(household["id"], user_id, u["name"], "WELLBEING_LOGGED", f"Mood: {body.mood}")
        # Notify primary caregiver when participant flags "not_great"
        if body.mood == "not_great" and body.notify_caregiver and household.get("owner_id") and household["owner_id"] != user_id:
            try:
                await create_notification(
                    household["owner_id"],
                    "wellbeing_concerns",
                    f"{u['name']} flagged a hard day",
                    "Your participant marked today as not great. Worth checking in.",
                    "/participant",
                )
            except Exception:
                pass
    doc.pop("_id", None)
    return doc


@api.get("/participant/wellbeing")
async def recent_wellbeing(user_id: str = Depends(get_current_user_id)):
    household = await _get_user_household(user_id)
    if not household:
        return []
    cur = db.wellbeing.find({"household_id": household["id"]}, {"_id": 0}).sort("created_at", -1).limit(14)
    return await cur.to_list(14)


# ----------------- statements -----------------
def _extract_text(filename: str, raw: bytes) -> str:
    name = filename.lower()
    if name.endswith(".pdf"):
        try:
            reader = PdfReader(io.BytesIO(raw))
            return "\n".join((p.extract_text() or "") for p in reader.pages)
        except Exception as e:
            logger.warning("PDF extract failed: %s", e)
            return ""
    if name.endswith(".csv"):
        try:
            text = raw.decode("utf-8", errors="replace")
            # also normalize a bit
            return text
        except Exception:
            return ""
    # txt or other
    try:
        return raw.decode("utf-8", errors="replace")
    except Exception:
        return ""


def _detect_anomalies(
    new_items: List[dict],
    historical_items: List[dict],
    provider_published: dict,
) -> List[dict]:
    """Rule-based anomaly stubs. LLM later turns these into plain-English alerts."""
    alerts: List[dict] = []
    # Build historical median price per service_name
    hist_by_name: dict[str, list[float]] = {}
    for it in historical_items:
        name = (it.get("service_name") or "").lower()
        if not name or not it.get("unit_price"):
            continue
        hist_by_name.setdefault(name, []).append(float(it["unit_price"]))

    seen = set()
    for it in new_items:
        name = (it.get("service_name") or "").lower()
        # 1) duplicate detection within this statement
        key = (it.get("date"), name, it.get("units"), it.get("total"))
        if key in seen:
            alerts.append({
                "id": new_id(),
                "severity": "warning",
                "title": "Possible duplicate charge",
                "detail": f"Same service ({it.get('service_name')}) appears twice on {it.get('date')}.",
                "suggested_action": "Ask the provider to confirm whether this is a real duplicate.",
                "line_item_id": it.get("id"),
            })
        seen.add(key)

        # 2) rate spike vs historical median
        prices = hist_by_name.get(name)
        if prices and len(prices) >= 2:
            med = statistics.median(prices)
            up = float(it.get("unit_price", 0) or 0)
            if med > 0 and up > med * 1.2:
                alerts.append({
                    "id": new_id(),
                    "severity": "warning",
                    "title": "Rate higher than usual",
                    "detail": (
                        f"{it.get('service_name')} on {it.get('date')} was charged at "
                        f"${up:.2f}/unit; the typical rate has been ${med:.2f}/unit."
                    ),
                    "suggested_action": "Ask the provider why the rate increased.",
                    "line_item_id": it.get("id"),
                })

        # 3) above provider's published price
        pub = provider_published.get(name)
        if pub and float(it.get("unit_price", 0) or 0) > float(pub) * 1.05:
            alerts.append({
                "id": new_id(),
                "severity": "alert",
                "title": "Above published price",
                "detail": (
                    f"{it.get('service_name')} was charged above the provider's published rate."
                ),
                "suggested_action": "Request a corrected statement.",
                "line_item_id": it.get("id"),
            })
    return alerts


@api.post("/statements/upload")
async def upload_statement(
    request: Request,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Async upload — kicks off the chunked-parallel decode pipeline as a
    background task and returns {job_id} immediately. The frontend polls
    GET /statements/upload-job/{job_id} for progress + final statement.
    Solves the K8s ingress 60s timeout that was 502'ing long statements.
    """
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    # Phase 3: cap uploads at 20/hour/account.
    await _rl.enforce(request, ("upload_account", user_id))
    # Resolve the active participant so this statement is correctly scoped.
    active_p = await _resolve_active_participant(user_id, request)
    participant_id = active_p["id"] if active_p else None
    # Phase 4: signature-validate + virus-scan + UUID-rename before we touch it.
    from upload_security import secure_read_upload, PROFILE_STATEMENT, sanitize_for_prompt

    def _alert_malware(virus_name: str) -> None:
        # Fire-and-forget — we're in a sync callback inside an async handler.
        try:
            asyncio.create_task(_alerter.record_malware_upload(
                db, user_id=user_id, filename=(file.filename or "unknown")[:120],
                scan_result=f"infected:{virus_name}",
            ))
        except Exception:
            pass

    raw, safe_name, file_kind = await secure_read_upload(
        file, allowed_profiles=PROFILE_STATEMENT, on_malware=_alert_malware,
    )
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    from document_extract import (
        extract_document, UnsupportedFormatError, FileTooLargeError,
        CorruptFileError, PasswordProtectedError,
    )
    try:
        text, input_method, page_count, parse_warnings = await extract_document(safe_name, raw)
    except UnsupportedFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileTooLargeError as e:
        mb = e.limit_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"This {e.ext} file exceeds the {mb} MB limit. Try compressing it or splitting into smaller parts.")
    except PasswordProtectedError:
        raise HTTPException(status_code=400, detail="This PDF is password-protected. Open it in your PDF viewer, remove the password, save a new copy, and upload that file.")
    except CorruptFileError as e:
        raise HTTPException(status_code=400, detail=f"This file appears to be damaged or unreadable: {e}")
    # Phase 4: soft-redact prompt-injection lures before any LLM sees the text.
    text = sanitize_for_prompt(text)
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file. Try a clearer photo or paste the text directly.")
    # Stash the original bytes so the user can re-download the source PDF / CSV / TXT later.
    import base64 as _b64
    file_b64 = _b64.b64encode(raw).decode("ascii")
    mime = file.content_type or _guess_statement_mime(file.filename)
    job_id = _submit_upload_job(
        text, file.filename, h["id"], user_id, user["name"],
        file_b64=file_b64, file_mimetype=mime, file_size=len(raw),
        participant_id=participant_id,
    )
    return {"job_id": job_id, "status": "pending"}


def _guess_statement_mime(filename: str) -> str:
    name = (filename or "").lower()
    if name.endswith(".pdf"):
        return "application/pdf"
    if name.endswith(".csv"):
        return "text/csv"
    return "text/plain"


@api.get("/statements/{statement_id}/download")
async def download_statement_original(statement_id: str, user_id: str = Depends(get_current_user_id)):
    """Stream back the original uploaded statement file (PDF / CSV / TXT)."""
    h = await _require_household(user_id)
    s = await db.statements.find_one({"id": statement_id, "household_id": h["id"]}, {"_id": 0})
    if not s:
        raise HTTPException(status_code=404, detail="Statement not found")
    b64 = s.get("file_b64")
    if not b64:
        raise HTTPException(status_code=404, detail="Original file is not available for this statement")
    import base64 as _b64
    try:
        data = _b64.b64decode(b64)
    except Exception:
        raise HTTPException(status_code=500, detail="Stored file is corrupt")
    mime = s.get("file_mimetype") or _guess_statement_mime(s.get("filename") or "")
    filename = s.get("filename") or "statement"
    return Response(
        content=data,
        media_type=mime,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@api.get("/statements/upload-job/{job_id}")
async def upload_statement_job(job_id: str, user_id: str = Depends(get_current_user_id)):
    job = UPLOAD_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    if job.get("user_id") != user_id:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    out = {"status": job["status"], "phase": job.get("phase", job["status"])}
    if job["status"] == "done":
        out["statement_id"] = job.get("statement_id")
    elif job["status"] == "error":
        out["error"] = job.get("error") or "decode failed"
    return out


@api.get("/statements", response_model=List[Statement])
async def list_statements(request: Request, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    q = await _scope_query_to_participant(user_id, request, {"household_id": h["id"]})
    docs = (
        await db.statements
        .find(q, {"_id": 0, "file_b64": 1, "id": 1, "household_id": 1, "filename": 1, "period_label": 1, "uploaded_at": 1, "line_items": 1, "summary": 1, "anomalies": 1, "raw_text_preview": 1, "file_mimetype": 1, "file_size_bytes": 1})
        .sort("uploaded_at", -1)
        .to_list(100)
    )
    out: List[Statement] = []
    for d in docs:
        d["has_original_file"] = bool(d.get("file_b64"))
        d.pop("file_b64", None)
        out.append(Statement(**d))
    return out


@api.get("/statements/{statement_id}", response_model=Statement)
async def get_statement(statement_id: str, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    doc = await db.statements.find_one(
        {"id": statement_id, "household_id": h["id"]},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Statement not found")
    doc["has_original_file"] = bool(doc.get("file_b64"))
    doc.pop("file_b64", None)
    return Statement(**doc)


# ----------------- email forwarding (inbound statements) -----------------
import secrets as _secrets


def _generate_inbound_token() -> str:
    """Returns a URL-safe, 14-char token for the user's forwarding alias."""
    return "kndrd_" + _secrets.token_urlsafe(10)[:10].lower().replace("_", "x").replace("-", "x")


def _inbound_domain() -> str:
    """Domain the inbound webhook accepts mail at. Configure via env."""
    return os.environ.get("KINDRED_INBOUND_DOMAIN", "inbound.wayly.com.au")


async def _ensure_inbound_token(user_id: str) -> str:
    """Lazily mint an inbound token for the user on first read."""
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "inbound_token": 1, "email": 1})
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = user.get("inbound_token")
    if token:
        return token
    # Mint until we get a unique one (collisions extremely unlikely)
    for _ in range(5):
        candidate = _generate_inbound_token()
        existing = await db.users.find_one({"inbound_token": candidate}, {"_id": 0, "id": 1})
        if not existing:
            await db.users.update_one({"id": user_id}, {"$set": {"inbound_token": candidate}})
            return candidate
    raise HTTPException(status_code=500, detail="Could not generate inbound address — please retry.")


@api.get("/inbound/my-address")
async def get_my_inbound_address(user_id: str = Depends(get_current_user_id)):
    """Returns the user's unique forwarding email address + setup status."""
    token = await _ensure_inbound_token(user_id)
    domain = _inbound_domain()
    address = f"statements+{token}@{domain}"
    # Recent statements ingested via email
    h = await _get_user_household(user_id)
    recent = []
    if h:
        cursor = db.statements.find(
            {"household_id": h["id"], "input_method": "email_forward"},
            {"_id": 0, "id": 1, "filename": 1, "uploaded_at": 1, "period_label": 1, "received_from": 1},
        ).sort("uploaded_at", -1).limit(10)
        recent = await cursor.to_list(10)
    return {
        "address": address,
        "domain": domain,
        "token": token,
        "recent_inbound": recent,
        "ready": True,
    }


class InboundEmailAttachment(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    content_type: Optional[str] = Field(default=None, max_length=200)
    content_base64: str = Field(min_length=4)


class InboundEmailPayload(BaseModel):
    """Mirrors the shape of common inbound email webhooks (Resend, Postmark,
    SendGrid). Required fields are normalised by the email provider before they
    POST to us."""
    to: str = Field(min_length=3, max_length=400)
    from_email: EmailStr = Field(alias="from")
    subject: Optional[str] = Field(default="", max_length=400)
    text: Optional[str] = Field(default="", max_length=200_000)
    html: Optional[str] = Field(default="", max_length=400_000)
    attachments: List[InboundEmailAttachment] = Field(default_factory=list)

    class Config:
        populate_by_name = True


def _extract_token_from_address(addr: str) -> Optional[str]:
    """Pull out the kndrd_xxx token from an address like
    `statements+kndrd_xxx@inbound.wayly.com.au` or `kndrd_xxx@inbound.wayly.com.au`."""
    addr = addr.strip().lower()
    # Strip enclosing <...>
    if "<" in addr and ">" in addr:
        addr = addr[addr.find("<") + 1 : addr.rfind(">")]
    # Plus-addressing form
    m = re.search(r"\+([a-z0-9_]{6,40})@", addr)
    if m:
        return m.group(1)
    # Direct local-part form
    m = re.search(r"^([a-z0-9_]{6,40})@", addr)
    if m:
        return m.group(1)
    return None


@app.post("/api/inbound/email-statement")
async def inbound_email_webhook(payload: InboundEmailPayload, request: Request):
    """Public inbound webhook. Auth via shared secret in the
    X-Inbound-Webhook-Token header (set on the email provider's webhook config).
    Identifies the recipient user via the `to` address, ingests the first
    statement-shaped attachment, and runs it through the decoder pipeline as
    an async job."""
    expected = os.environ.get("INBOUND_WEBHOOK_TOKEN")
    if expected:
        provided = request.headers.get("X-Inbound-Webhook-Token", "")
        if provided != expected:
            raise HTTPException(status_code=403, detail="forbidden")

    token = _extract_token_from_address(payload.to)
    if not token:
        logger.warning("Inbound email rejected — no token in address: %s", payload.to)
        raise HTTPException(status_code=400, detail="Could not parse forwarding address")

    user = await db.users.find_one({"inbound_token": token}, {"_id": 0})
    if not user:
        logger.warning("Inbound email rejected — unknown token: %s", token)
        raise HTTPException(status_code=404, detail="Unknown forwarding address")

    h = await _get_user_household(user["id"])
    if not h:
        logger.info("Inbound email rejected — user %s has no household", user["id"])
        try:
            await email_service.email_tool_result(
                to=str(payload.from_email), tool_name="Couldn't import your statement",
                headline="We received your email, but your Wayly household isn't set up yet",
                body_html="<p>Please complete onboarding at <a href='https://wayly.com.au/onboarding'>wayly.com.au/onboarding</a> before forwarding statements.</p>",
            )
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="No household configured for this user")

    # Pick the first attachment that looks like a statement
    accepted_exts = (".pdf", ".docx", ".doc", ".txt", ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp")
    attachment = None
    for a in payload.attachments:
        ext = "." + a.filename.rsplit(".", 1)[-1].lower() if "." in a.filename else ""
        if ext in accepted_exts:
            attachment = a
            break

    if not attachment:
        # No usable attachment — try inline text body
        body_text = (payload.text or "").strip()
        if len(body_text) > 200:
            job_id = _submit_upload_job(
                body_text,
                f"email-{(payload.subject or 'statement')[:80]}.txt",
                h["id"],
                user["id"],
                user.get("name") or "",
                file_b64=None,
                file_mimetype="text/plain",
                file_size=len(body_text.encode("utf-8")),
            )
            try:
                await email_service.email_tool_result(
                    to=str(payload.from_email),
                    tool_name="Statement received — decoding now",
                    headline="We've received your statement and started decoding",
                    body_html=f"<p>Your forwarded email arrived safely. We're decoding it now and will save it to your dashboard within ~30 seconds.</p><p>Job ID: <code>{job_id}</code></p><p>— Wayly</p>",
                )
            except Exception:
                pass
            return {"ok": True, "job_id": job_id, "method": "email_forward_body"}
        try:
            await email_service.email_tool_result(
                to=str(payload.from_email), tool_name="Couldn't find a statement to decode",
                headline="We didn't find a statement attachment in your email",
                body_html=(
                    "<p>We received your email, but it didn't contain a PDF, Word doc, photo, or readable statement text.</p>"
                    "<p>Please forward the original email <em>with</em> the attachment, or upload the file directly at "
                    "<a href='https://wayly.com.au/ai-tools/statement-decoder'>wayly.com.au/ai-tools/statement-decoder</a>.</p>"
                ),
            )
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="No usable statement attachment or text body")

    # Decode the attachment via the document_extract pipeline
    import base64 as _b64
    try:
        raw = _b64.b64decode(attachment.content_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Attachment base64 was malformed")
    from document_extract import (
        extract_document as _extract_doc,
        UnsupportedFormatError as _UnsupportedFmt,
        FileTooLargeError as _FileTooLarge,
        CorruptFileError as _CorruptFile,
        PasswordProtectedError as _PwdProtected,
    )

    try:
        text, _input_method, _page_count, _parse_warnings = await _extract_doc(attachment.filename, raw)
    except _UnsupportedFmt as e:
        try:
            await email_service.email_tool_result(
                to=str(payload.from_email), tool_name="Couldn't read the attachment",
                headline="That attachment format isn't supported yet",
                body_html=f"<p>We couldn't read <strong>{attachment.filename}</strong>: {e}.</p><p>Try forwarding as PDF or photo instead.</p>",
            )
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=str(e))
    except _FileTooLarge as e:
        mb = e.limit_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Attachment exceeds the {mb} MB limit.")
    except (_PwdProtected, _CorruptFile) as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not text.strip():
        raise HTTPException(status_code=400, detail="Attachment contained no extractable text")

    job_id = _submit_upload_job(
        text,
        attachment.filename,
        h["id"],
        user["id"],
        user.get("name") or "",
        file_b64=attachment.content_base64,
        file_mimetype=attachment.content_type or "application/octet-stream",
        file_size=len(raw),
    )

    try:
        await email_service.email_tool_result(
            to=str(payload.from_email),
            tool_name="Statement received — decoding now",
            headline="We've received your statement and started decoding",
            body_html=(
                f"<p>Your forwarded statement <strong>{attachment.filename}</strong> arrived safely. "
                "We're decoding it now and will save it to your dashboard within ~30 seconds.</p>"
                f"<p>Sign in at <a href='https://wayly.com.au/app/statements'>wayly.com.au/app/statements</a> to see the decoded result.</p>"
                f"<p>Job ID: <code>{job_id}</code></p>"
                "<p>— Wayly</p>"
            ),
        )
    except Exception as e:
        logger.warning("Inbound confirmation email failed: %s", e)

    return {"ok": True, "job_id": job_id, "method": "email_forward", "filename": attachment.filename}


# ----------------- budget -----------------
@api.get("/budget/current")
async def current_budget(request: Request, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    # Honour the active participant — their classification overrides the
    # household-level one so budget views actually swap when caregivers switch.
    p = await _resolve_active_participant(user_id, request)
    classification = (p or {}).get("classification") or h["classification"]
    q_start, q_end, q_label = budget_lib.get_quarter_window()
    allocations = budget_lib.stream_allocations(classification)
    quarterly_usable = budget_lib.quarterly_budget(classification)
    annual_total = budget_lib.CLASSIFICATIONS[classification]["annual"]
    quarterly_gross = round(annual_total / 4.0, 2)
    care_management_quarterly = round(quarterly_gross - quarterly_usable, 2)

    q = await _scope_query_to_participant(user_id, request, {"household_id": h["id"]})
    docs = await db.statements.find(q, {"_id": 0}).to_list(200)
    all_items: List[dict] = []
    for s in docs:
        all_items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(all_items, q_start, q_end)
    contributions_total = budget_lib.compute_contributions(all_items)

    # Allocation source: prefer the most-recent statement's per-stream
    # quarterly allocation header. Falls back to the MVP-wide program average
    # when no statement has been decoded yet (or none carried the header).
    statement_allocations: Dict[str, float] | None = None
    statement_period_label: str | None = None
    statements_sorted = sorted(
        docs,
        key=lambda d: d.get("uploaded_at") or d.get("created_at") or "",
        reverse=True,
    )
    for s in statements_sorted:
        hsb = s.get("header_stream_budgets") or {}
        if not isinstance(hsb, dict):
            continue
        try:
            mapped = {
                "Clinical": float(hsb.get("Clinical") or 0.0),
                "Independence": float(hsb.get("Independence") or 0.0),
                "Everyday Living": float(
                    hsb.get("Everyday Living")
                    if hsb.get("Everyday Living") is not None
                    else hsb.get("EverydayLiving") or 0.0
                ),
            }
        except Exception:
            continue
        if any(v > 0 for v in mapped.values()):
            statement_allocations = mapped
            statement_period_label = s.get("period_label")
            break

    use_statement = statement_allocations is not None
    allocation_source = "statement" if use_statement else "program_average"
    indicative = not use_statement
    streams_note = (
        f"Stream allocation taken from your latest statement ({statement_period_label})."
        if use_statement and statement_period_label
        else "Stream allocation taken from your latest statement."
        if use_statement
        else "Indicative split only. Your participant's actual stream allocation is set in their "
             "individualised budget and care plan, and may differ substantially. Check the quarterly "
             "budget summary on your provider statement for the real split."
    )

    streams = []
    for s in budget_lib.STREAMS:
        spent = burn.get(s, 0.0)
        if use_statement and statement_allocations is not None:
            cap = round(statement_allocations.get(s, 0.0), 2)
        else:
            cap = allocations[s]
        streams.append({
            "stream": s,
            "allocated": cap,
            "spent": spent,
            "remaining": round(cap - spent, 2),
            "pct": round((spent / cap * 100) if cap else 0, 1),
            "indicative": indicative,
        })

    cap_amount = budget_lib.lifetime_cap(h.get("is_grandfathered", False))
    return {
        "classification": classification,
        "classification_label": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual_total": annual_total,
        "quarter_label": q_label,
        "quarter_start": q_start.isoformat(),
        "quarter_end": q_end.isoformat(),
        # F9: GROSS quarterly leads — that's what providers print on statements.
        "quarterly_gross": quarterly_gross,
        "care_management_quarterly": care_management_quarterly,
        "quarterly_usable": quarterly_usable,
        # DEPRECATED alias for one release — remove once clients migrate.
        "quarterly_total": quarterly_usable,
        "rollover_cap": budget_lib.rollover_cap(classification),
        "streams": streams,
        "allocation_source": allocation_source,
        "streams_note": streams_note,
        "lifetime_cap": cap_amount,
        "lifetime_contributions": contributions_total,
        "lifetime_pct": round((contributions_total / cap_amount * 100) if cap_amount else 0, 2),
        "is_grandfathered": h.get("is_grandfathered", False),
    }


# ----------------- chat -----------------
def _humanize_assistant_reply(text: str) -> str:
    """Strip the visual tells that make assistant copy feel robotic:

      * markdown bold/italic asterisks (``**foo**`` → ``foo``, ``*foo*`` → ``foo``)
      * em / en / horizontal-bar dashes → ", " (or a sentence break when alone on a line)
      * stray header markers (``### Heading`` → ``Heading``)
      * runs of more than two newlines compressed to two

    Keeps content intact — only the visual jaggedness is sanded down.
    """
    if not text:
        return text
    import re as _re
    t = text
    # Bold then italic — order matters
    t = _re.sub(r"\*\*(.+?)\*\*", r"\1", t)
    t = _re.sub(r"(?<!\*)\*(?!\s)([^*\n]+?)\*(?!\*)", r"\1", t)
    # Heading markers
    t = _re.sub(r"^\s{0,3}#{1,6}\s+", "", t, flags=_re.M)
    # Em/en/hyphen-bar variants → comma+space, but as a sentence break if line-leading
    t = _re.sub(r"\s*[—–―]\s*", ", ", t)
    # Two or more dashes used as a separator
    t = _re.sub(r"\s*-{2,}\s*", ", ", t)
    # Collapse paragraph breaks
    t = _re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


@api.post("/chat")
async def chat(payload: ChatRequest, request: Request, user_id: str = Depends(get_current_user_id)):
    # Phase 5 — route-out guard runs BEFORE we call the LLM. If the query
    # maps to a means-test, legal, or safeguarding topic, we return the
    # canonical route-out copy and the right contacts. The LLM is not
    # consulted on the substance.
    try:
        from scenario_engine.boundaries import (
            classify_boundary_for_query, route_out_response,
        )
        boundary, contacts, topic = classify_boundary_for_query(payload.message or "")
        if boundary in ("ROUTE_OUT", "ESCALATE"):
            reply = route_out_response(payload.message or "", contacts, boundary, topic)
            try:
                await db.chat_history.insert_one({
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "role": "user", "content": payload.message,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
                await db.chat_history.insert_one({
                    "id": str(uuid.uuid4()), "user_id": user_id,
                    "role": "assistant", "content": reply,
                    "advice_boundary": boundary, "topic": topic,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })
            except Exception:
                pass
            return {"reply": reply, "advice_boundary": boundary,
                    "topic": topic, "contacts": contacts,
                    "guarded": True}
    except Exception as _guard_err:
        logger.warning("route-out guard failed; proceeding to LLM: %s", _guard_err)

    h = await _require_household(user_id)
    user = await _get_user(user_id)
    # Honour the active participant — classification + provider follow them
    p = await _resolve_active_participant(user_id, request)
    classification = (p or {}).get("classification") or h["classification"]
    participant_name = (p or {}).get("first_name") or h.get("participant_name")
    provider_name = (p or {}).get("provider_name") or h.get("provider_name")
    q_start, q_end, q_label = budget_lib.get_quarter_window()

    base_q = await _scope_query_to_participant(user_id, request, {"household_id": h["id"]})
    latest = await db.statements.find(base_q, {"_id": 0}) \
        .sort("uploaded_at", -1).limit(1).to_list(1)
    latest_summary = latest[0].get("summary") if latest else "No statements uploaded yet."

    docs = await db.statements.find(base_q, {"_id": 0}).to_list(200)
    items: List[dict] = []
    for s in docs:
        items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(items, q_start, q_end)
    contributions_total = budget_lib.compute_contributions(items)
    cap_amount = budget_lib.lifetime_cap(h.get("is_grandfathered", False))

    burn_str = ", ".join(f"{k}: ${v:,.2f}" for k, v in burn.items())
    context = {
        "caregiver_name": user["name"],
        "participant_name": participant_name,
        "classification": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual": budget_lib.CLASSIFICATIONS[classification]["annual"],
        "quarterly": budget_lib.quarterly_budget(classification),
        "provider": provider_name,
        "quarter_label": q_label,
        "burn": burn_str or "no spend recorded yet",
        "contributions_total": contributions_total,
        "cap": cap_amount,
        "statement_summary": latest_summary or "No statements uploaded yet.",
    }
    pid_part = (p or {}).get("id") or "default"
    session_id = payload.session_id or f"chat-{h['id']}-{pid_part}"
    reply_text = await chat_with_kindred(payload.message, session_id, context)
    reply_text = _humanize_assistant_reply(reply_text)

    # persist
    user_turn = ChatTurn(household_id=h["id"], role="user", content=payload.message)
    asst_turn = ChatTurn(household_id=h["id"], role="assistant", content=reply_text)
    await db.chat_turns.insert_many([
        {**user_turn.model_dump(), "participant_id": pid_part if p else None},
        {**asst_turn.model_dump(), "participant_id": pid_part if p else None},
    ])
    return {"reply": reply_text, "session_id": session_id}


@api.get("/chat/history")
async def chat_history(request: Request, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    p = await _resolve_active_participant(user_id, request)
    q: Dict[str, Any] = {"household_id": h["id"]}
    if p:
        if p.get("is_primary"):
            q["$or"] = [{"participant_id": p["id"]}, {"participant_id": None}, {"participant_id": {"$exists": False}}]
        else:
            q["participant_id"] = p["id"]
    docs = await db.chat_turns.find(q, {"_id": 0}) \
        .sort("created_at", 1).to_list(500)
    return docs


@api.delete("/chat/history")
async def clear_chat_history(request: Request, user_id: str = Depends(get_current_user_id)):
    """Start a fresh Ask Wayly conversation. Scoped to the active participant
    so swapping participants leaves the other's chat untouched."""
    h = await _require_household(user_id)
    p = await _resolve_active_participant(user_id, request)
    q: Dict[str, Any] = {"household_id": h["id"]}
    if p and not p.get("is_primary"):
        q["participant_id"] = p["id"]
    elif p and p.get("is_primary"):
        q["$or"] = [{"participant_id": p["id"]}, {"participant_id": None}, {"participant_id": {"$exists": False}}]
    res = await db.chat_turns.delete_many(q)
    return {"ok": True, "deleted": res.deleted_count}


# ----------------- family thread -----------------
@api.post("/family-thread", response_model=FamilyMessage)
async def post_family_message(payload: FamilyMessageCreate, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    msg = FamilyMessage(
        household_id=h["id"],
        author_id=user_id,
        author_name=user["name"],
        body=payload.body,
        related_statement_id=payload.related_statement_id,
    )
    await db.family_messages.insert_one(msg.model_dump())
    await _audit(h["id"], user_id, user["name"], "FAMILY_MESSAGE_POSTED", payload.body[:120])
    return msg


@api.get("/family-thread", response_model=List[FamilyMessage])
async def list_family_messages(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = await db.family_messages.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("created_at", 1).to_list(500)
    return [FamilyMessage(**d) for d in docs]


# ----------------- audit log -----------------
@api.get("/audit-log", response_model=List[AuditEvent])
async def list_audit(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = await db.audit_events.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("created_at", -1).to_list(500)
    return [AuditEvent(**d) for d in docs]


# ----------------- participant view -----------------
@api.get("/participant/today")
async def participant_today(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    classification = h["classification"]
    q_start, q_end, q_label = budget_lib.get_quarter_window()
    quarterly_total = budget_lib.quarterly_budget(classification)
    docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0}).to_list(200)
    items: List[dict] = []
    for s in docs:
        items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(items, q_start, q_end)
    spent = sum(burn.values())
    remaining = max(0.0, quarterly_total - spent)

    today = datetime.now(timezone.utc).date()
    days_left = (q_end - today).days + 1

    # Static sample appointment for MVP — calendar agent comes later.
    appt = {
        "time": "10:00 AM",
        "name": "Sarah",
        "service": "Personal care",
        "duration": "1 hour",
    }

    return {
        "participant_name": h["participant_name"],
        "today_label": today.strftime("%A %d %B"),
        "appointment": appt,
        "quarter_remaining": round(remaining, 2),
        "quarter_remaining_sentence": (
            f"That's plenty for the {days_left} days left in this quarter."
            if remaining > spent * 0.2 or days_left < 30
            else f"Just keep an eye on it — {days_left} days to go this quarter."
        ),
        "caregiver_name": (await _get_user(h["owner_id"]))["name"],
    }


@api.post("/participant/concern")
async def flag_concern(payload: ConcernCreate, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    note = payload.note or "Something doesn't feel right."
    await _audit(h["id"], user_id, user["name"], "CONCERN_FLAGGED", note)
    # also drop into family thread for visibility
    msg = FamilyMessage(
        household_id=h["id"],
        author_id=user_id,
        author_name=user["name"],
        body=f"⚠ Concern flagged: {note}",
    )
    await db.family_messages.insert_one(msg.model_dump())
    return {"ok": True}


# ----------------- public AI tools (no auth, IP rate-limited) -----------------
RATE_LIMIT_BUCKET: dict[str, list[datetime]] = defaultdict(list)
RATE_LIMIT_WINDOW = timedelta(hours=RATE_LIMIT_WINDOW_HOURS)
RATE_LIMIT_MAX = RATE_LIMIT_MAX_PER_IP


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(ip: str) -> None:
    now = datetime.now(timezone.utc)
    RATE_LIMIT_BUCKET[ip] = [t for t in RATE_LIMIT_BUCKET[ip] if now - t < RATE_LIMIT_WINDOW]
    if len(RATE_LIMIT_BUCKET[ip]) >= RATE_LIMIT_MAX:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "rate_limit",
                "message": "You've used this tool 5 times in the last hour. Create a free account for unlimited access.",
            },
        )
    RATE_LIMIT_BUCKET[ip].append(now)


# ---------------------------------------------------------------------------
# Tool-access gating
# ---------------------------------------------------------------------------
SD_COOKIE_NAME = "kindred_sd_used"
SD_WINDOW_SECONDS = 24 * 60 * 60  # 24 hours
# Includes legacy "advisor"/"advisor_pro" plus current "adviser" (AU spelling).
PAID_PLANS = {"solo", "family", "adviser", "advisor", "advisor_pro"}
ADVISER_PLANS = {"adviser", "advisor", "advisor_pro"}
ADVISER_MAX_CLIENTS = {"adviser": 25, "advisor": 25, "advisor_pro": 200}


def _trial_active(u: dict) -> bool:
    """True if the user has an active 7-day trial."""
    ends = u.get("trial_ends_at")
    if not ends:
        return False
    try:
        if isinstance(ends, str):
            return datetime.fromisoformat(ends.replace("Z", "+00:00")) > datetime.now(timezone.utc)
    except Exception:
        return False
    return False


async def _user_from_request(request: Request) -> Optional[dict]:
    """Best-effort: return the calling user from Bearer JWT, else None."""
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return None
    token = auth.split(" ", 1)[1].strip()
    try:
        from auth import decode_token
        uid = decode_token(token)
        return await db.users.find_one({"id": uid}, {"_id": 0})
    except Exception:
        return None


async def _user_from_request_required(request: Request) -> dict:
    """Strict: 401 if no Bearer JWT or token doesn't resolve to a user."""
    user = await _user_from_request(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthenticated", "message": "Sign in required."},
        )
    return user


async def _require_paid_plan(request: Request, response: Response, tool_label: str = "This tool") -> dict:
    """Dependency: only Solo/Family/Advisor or active trial may call gated tools.

    401 for unauthenticated. 403 for Free / expired-trial. Returns the user.

    Phase 3: a per-IP burst limit (10/hour) is applied BEFORE the auth check so
    unauthenticated scrapers can't waste cycles on the AI tool router.
    """
    await _rl.enforce(request, ("tools_unauth_ip", _rl._client_ip(request)))
    user = await _user_from_request(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": "unauthenticated", "message": "Sign in required.", "redirect": "/signup"},
        )
    plan = (user.get("plan") or "free").lower()
    if plan in PAID_PLANS or _trial_active(user):
        return user
    raise HTTPException(
        status_code=403,
        detail={
            "error": "plan_required",
            "message": f"{tool_label} requires a Solo or Family plan.",
            "redirect": "/pricing",
        },
    )


def require_plan(*allowed: str, feature_label: str = "This feature"):
    """Factory: FastAPI dependency that hard-gates a route to the listed plans.

    Usage: `user: dict = Depends(require_plan("adviser"))`. Returns 401 for
    unauthenticated callers, 403 for users on the wrong plan. Active 7-day
    trial users count as their trial plan.
    """
    allowed_set = {p.lower() for p in allowed}

    async def _dep(request: Request) -> dict:
        user = await _user_from_request(request)
        if not user:
            raise HTTPException(
                status_code=401,
                detail={"error": "unauthenticated", "message": "Sign in required.", "redirect": "/login"},
            )
        plan = (user.get("plan") or "free").lower()
        if plan in allowed_set:
            return user
        # An active trial counts as the trial's plan — we already flip user.plan on trial start.
        raise HTTPException(
            status_code=403,
            detail={
                "error": "plan_required",
                "message": f"{feature_label} requires a {' or '.join(sorted(allowed_set))} plan.",
                "current_plan": plan,
                "required_plans": sorted(allowed_set),
                "redirect": "/pricing",
            },
        )

    return _dep


def _sd_cookie_used_recently(request: Request) -> Optional[datetime]:
    """If the visitor has used Statement Decoder within the last 24h, return ts."""
    raw = request.cookies.get(SD_COOKIE_NAME)
    if not raw:
        return None
    try:
        ts = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if datetime.now(timezone.utc) - ts < timedelta(seconds=SD_WINDOW_SECONDS):
            return ts
    except Exception:
        return None
    return None


def _set_sd_cookie(response: Response) -> None:
    """Stamp the visitor's 1-per-day cookie. HttpOnly, 24h, Lax, secure-by-host."""
    response.set_cookie(
        key=SD_COOKIE_NAME,
        value=datetime.now(timezone.utc).isoformat(),
        max_age=SD_WINDOW_SECONDS,
        httponly=True,
        samesite="lax",
        secure=True,
        path="/",
    )


async def _enforce_statement_decoder_limit(request: Request, response: Response) -> dict:
    """Gating logic for the public Statement Decoder.

    Batch3 update: 1 use per CALENDAR MONTH for non-logged-in and Free users
    (was 1 per 24h previously). Solo/Family/Adviser/trial users bypass entirely.

    - Logged-in Solo/Family/trial users: unlimited.
    - Logged-in Free users: 1 decode per calendar month (tracked by user_id).
    - Unauthenticated visitors: 1 decode per calendar month (tracked by
      browser fingerprint + IP fallback).

    Phase 3: a per-IP burst limit (10/hour) is applied to everyone — even paid
    users — to absorb scraping/abuse.
    """
    # Burst-protect first — fail-open if Redis is down (paid users still work).
    await _rl.enforce(request, ("tools_unauth_ip", _rl._client_ip(request)))
    user = await _user_from_request(request)
    if user:
        plan = (user.get("plan") or "free").lower()
        if plan in PAID_PLANS or _trial_active(user):
            return {"user": user, "is_free_use": False}
    user_id = user["id"] if user else None
    usage = await check_free_tool_usage(request, tool="STATEMENT_DECODER", user_id=user_id)
    if not usage["allowed"]:
        raise HTTPException(
            status_code=429,
            detail={
                "error": "monthly_limit",
                "message": "You've used your free decode for this month. Sign up or upgrade for unlimited access.",
                "reset_at": usage["reset_at"],
                "period_month": usage["period_month"],
                "used_count": usage["used_count"],
            },
        )
    # First use this month — also enforce the global IP rate limit as a soft cap
    _check_rate_limit(_client_ip(request))
    # Record the usage immediately so concurrent requests don't slip past the gate
    await record_free_tool_usage(request, tool="STATEMENT_DECODER", user_id=user_id)
    return {"user": user, "is_free_use": True}


class PublicTextBody(BaseModel):
    text: str = Field(min_length=10, max_length=40000)


class PublicBudgetBody(BaseModel):
    classification: int = Field(ge=1, le=8)
    is_grandfathered: bool = False
    current_lifetime_balance: float = 0.0
    expected_annual_burn: float | None = None


class PublicPriceBody(BaseModel):
    service: str
    rate: float = Field(gt=0)
    postcode: str | None = None
    provider: str | None = None


# Indicative network-median rates (AUD/hour or per-visit) — derived from public provider price lists.
# These are placeholder benchmarks for MVP; real medians come from accumulated user data over time.
# Note: National provider price caps were deferred indefinitely by the Australian Government in May 2026,
# so these benchmarks intentionally contain only network medians (no cap value).
PRICE_BENCHMARKS = {
    "Domestic assistance — cleaning": {"median": 76.0},
    "Personal care": {"median": 84.0},
    "Occupational therapy": {"median": 155.0},
    "Physiotherapy": {"median": 145.0},
    "Social support": {"median": 70.0},
    "Transport — community access": {"median": 35.0},
    "Home maintenance / gardening": {"median": 75.0},
    "Meal preparation": {"median": 68.0},
    "Nursing — registered": {"median": 165.0},
    "Allied health — podiatry": {"median": 130.0},
}


async def _run_public_decode(text: str) -> dict:
    """Two-pass statement decoder.
    Pass 1 (Haiku 4.5): extract every line item with the full Wayly schema.
    Pass 2 (Sonnet 4.6): audit the extraction against the 10 anomaly rules.
    Both passes must complete before the response is returned.
    """
    from agents import extract_statement, audit_statement
    extracted = await extract_statement(text, household_id="public")
    audit = await audit_statement(extracted, household_id="public")
    return _build_decode_payload(extracted, audit)


def _build_decode_payload(extracted: dict, audit: dict) -> dict:
    """Shape the extract + audit pair into the UI response payload."""
    period_label = extracted.get("statement_period") or audit.get("statement_summary", {}).get("period") or None
    legacy_items: List[dict] = []
    for li in extracted.get("line_items", []) or []:
        if li.get("is_cancellation"):
            continue
        stream = li.get("stream") or "Everyday Living"
        legacy_stream = {
            "Clinical": "Clinical",
            "Independence": "Independence",
            "EverydayLiving": "Everyday Living",
            "ATHM": "AT-HM",
            "CareMgmt": "Care Management",
        }.get(stream, stream)
        try:
            legacy_items.append({
                "date": str(li.get("date", "1970-01-01"))[:10],
                "service_code": li.get("service_code"),
                "service_name": li.get("service_description") or "Service",
                "stream": legacy_stream,
                "units": float(li.get("hours") or 0),
                "unit_price": float(li.get("unit_rate") or 0),
                "total": float(li.get("gross") or 0),
                "contribution_paid": float(li.get("participant_contribution") or 0),
                "government_paid": float(li.get("government_paid") or 0),
                "confidence": 0.9,
            })
        except Exception as e:
            logger.warning("public decode skipped line item: %s", e)

    summary = extracted.get("summary") or (
        f"{extracted.get('participant_name') or 'Participant'}'s {period_label or 'statement'} from "
        f"{extracted.get('provider_name') or 'the provider'}: {audit['statement_summary'].get('total_line_items', 0)} line items, "
        f"${audit['statement_summary'].get('total_gross', 0):,.2f} gross, "
        f"${audit['statement_summary'].get('total_participant_contribution', 0):,.2f} your contribution."
    ) if audit.get("statement_summary") else None

    return {
        "summary": summary,
        "period_label": period_label,
        "line_items": legacy_items,
        "anomalies": audit.get("anomalies", []),
        "extracted": extracted,
        "audit": audit,
        "partial_result": bool(extracted.get("_extraction_error")) or bool(audit.get("_audit_error")),
    }


# ---------------------------------------------------------------------------
# Async job pattern for the public Statement Decoder.
# The LLM pipeline can take 40-70s for long statements, exceeding the 60s
# K8s ingress timeout. We return a job_id immediately and run the pipeline
# as a background task; the frontend polls /api/public/decode-job/{job_id}.
# ---------------------------------------------------------------------------

DECODE_JOBS: Dict[str, dict] = {}  # job_id → {"status": "pending|running|done|error", "result": dict | None, "error": str | None, "created_at": float}
_DECODE_JOB_TTL = 600  # 10 minutes

# Authenticated dashboard upload jobs — same async pattern, scoped per-user.
UPLOAD_JOBS: Dict[str, dict] = {}
_UPLOAD_JOB_TTL = 1800  # 30 minutes

_STREAM_DISPLAY_MAP = {
    "Clinical": "Clinical",
    "Independence": "Independence",
    "EverydayLiving": "Everyday Living",
    "Everyday Living": "Everyday Living",
    "ATHM": "Everyday Living",
    "CareMgmt": "Everyday Living",
}

_SEVERITY_DISPLAY_MAP = {
    "high": "alert",
    "medium": "warning",
    "low": "info",
}


def _new_job_id() -> str:
    import uuid
    return uuid.uuid4().hex[:20]


def _prune_decode_jobs() -> None:
    import time
    cutoff = time.time() - _DECODE_JOB_TTL
    stale = [jid for jid, job in DECODE_JOBS.items() if job.get("created_at", 0) < cutoff]
    for jid in stale:
        DECODE_JOBS.pop(jid, None)


async def _run_decode_job(
    job_id: str, text: str,
    input_method: str = "text_paste",
    document_pages: int = 1,
    parsing_warnings: Optional[list] = None,
    original_filename: Optional[str] = None,
) -> None:
    """Background runner. Updates DECODE_JOBS[job_id] as it progresses.
    Runs the wrapper (PII bypass + abuse classifier) FIRST so the POST handler
    can return a job_id instantly without any LLM dependency on the synchronous
    request path."""
    from agents import extract_statement, audit_statement
    from wrapper import run_wrapper
    job = DECODE_JOBS.get(job_id)
    if job is None:
        return
    try:
        job["status"] = "running"
        job["phase"] = "wrapper"
        # PII redaction is OFF for the Statement Decoder — the visitor is uploading
        # their own statement and needs to see their own name in the result.
        # Abuse / distress / manipulation checks still run.
        wrapped = await run_wrapper(text, pii_redact=False)
        if wrapped.get("abuse_flag"):
            # Surface the abuse response as the final result so the frontend can render it.
            job["result"] = {
                "abuse_flag": wrapped["abuse_flag"],
                "abuse_response": wrapped["abuse_response"],
            }
            job["status"] = "done"
            job["phase"] = "done"
            return
        decode_text = wrapped.get("redacted_input") or text
        job["phase"] = "extract"
        extracted = await extract_statement(decode_text, household_id="public")
        job["phase"] = "audit"
        audit = await audit_statement(extracted, household_id="public")
        result = _build_decode_payload(extracted, audit)
        result["input_method"] = input_method
        result["document_pages"] = document_pages
        result["original_filename"] = original_filename
        if parsing_warnings:
            result["parsing_warnings"] = list(parsing_warnings)
        if wrapped.get("redaction_notice"):
            result["redaction_notice"] = wrapped["redaction_notice"]
            result["redaction_count"] = wrapped["redaction_count"]
        job["result"] = result
        job["status"] = "done"
        job["phase"] = "done"
    except Exception as e:
        logger.exception("decode job %s failed", job_id)
        job["status"] = "error"
        job["error"] = str(e)


def _submit_decode_job(
    text: str,
    input_method: str = "text_paste",
    document_pages: int = 1,
    parsing_warnings: Optional[list] = None,
    original_filename: Optional[str] = None,
) -> str:
    """Submit a decode job. Returns the job_id. Runs the pipeline as a
    fire-and-forget asyncio task."""
    import time
    _prune_decode_jobs()
    job_id = _new_job_id()
    DECODE_JOBS[job_id] = {
        "status": "pending",
        "phase": "pending",
        "result": None,
        "error": None,
        "created_at": time.time(),
    }
    asyncio.create_task(_run_decode_job(
        job_id, text,
        input_method=input_method,
        document_pages=document_pages,
        parsing_warnings=parsing_warnings,
        original_filename=original_filename,
    ))
    return job_id


def _prune_upload_jobs() -> None:
    import time
    cutoff = time.time() - _UPLOAD_JOB_TTL
    stale = [jid for jid, job in UPLOAD_JOBS.items() if job.get("created_at", 0) < cutoff]
    for jid in stale:
        UPLOAD_JOBS.pop(jid, None)


async def _run_upload_job(
    job_id: str,
    text: str,
    filename: str,
    household_id: str,
    user_id: str,
    user_name: str,
    file_b64: Optional[str] = None,
    file_mimetype: Optional[str] = None,
    file_size: Optional[int] = None,
    participant_id: Optional[str] = None,
) -> None:
    """Background runner for the dashboard statement upload — uses the same
    chunked-parallel extraction + audit pipeline as the public Statement
    Decoder, then persists a Statement document for the household."""
    from agents import extract_statement, audit_statement
    job = UPLOAD_JOBS.get(job_id)
    if job is None:
        return
    try:
        job["status"] = "running"
        job["phase"] = "extract"
        extracted = await extract_statement(
            text, household_id=household_id,
            user_id=user_id, participant_id=participant_id,
        )
        job["phase"] = "audit"
        audit = await audit_statement(
            extracted, household_id=household_id,
            user_id=user_id, participant_id=participant_id,
        )
        # Phase 5 monitoring: check if this user has crossed the $20/60min decoder spend.
        try:
            await _alerter.check_decoder_cost(db, user_id=user_id)
        except Exception:
            pass
        # Phase 5 monitoring: emit a structured DECODER_RUN summary log line.
        try:
            _obs.log_decoder_run(
                user_id=user_id,
                household_id=household_id,
                participant_id=participant_id,
                anomaly_count=int((audit.get("anomaly_count") or {}).get("high", 0)
                                  + (audit.get("anomaly_count") or {}).get("medium", 0)
                                  + (audit.get("anomaly_count") or {}).get("low", 0)),
                input_tokens=len(text) // 4,
                output_tokens=len(json.dumps(audit, default=str)) // 4,
                cost_aud=0.0,  # detailed per-phase costs are in db.llm_calls
                model="claude-haiku-4-5",
            )
        except Exception:
            pass

        # Map chunked-extraction line items into the dashboard's StatementLineItem shape.
        line_items: List[StatementLineItem] = []
        for li in (extracted.get("line_items") or []):
            if not isinstance(li, dict):
                continue
            try:
                stream_raw = (li.get("stream") or "Everyday Living").strip()
                stream_disp = _STREAM_DISPLAY_MAP.get(stream_raw, "Everyday Living")
                date_str = str(li.get("date") or "1970-01-01")[:10]
                # If date isn't ISO, leave a safe placeholder
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
                    date_str = "1970-01-01"
                line_items.append(StatementLineItem(
                    date=date_str,
                    service_code=li.get("service_code") or None,
                    service_name=str(li.get("service_description") or li.get("service_name") or "Service"),
                    stream=stream_disp,
                    units=float(li.get("hours") or li.get("units") or 0),
                    unit_price=float(li.get("unit_rate") or li.get("unit_price") or 0),
                    total=float(li.get("gross") or li.get("total") or 0),
                    contribution_paid=float(li.get("participant_contribution") or li.get("contribution_paid") or 0),
                    government_paid=float(li.get("government_paid") or 0),
                    confidence=0.9,
                ))
            except Exception as e:
                logger.warning("Skipping bad line item: %s — %s", li, e)

        # Map audit anomalies to the existing Anomaly model. The decoder
        # carries richer metadata (rule key, dollar_impact, evidence array,
        # raw severity); persist all of it so historical reports can answer
        # "how much in flagged overcharges this year" and "which rules fired
        # in August". Old documents loaded back through this model simply
        # have rule=None / dollar_impact=None / evidence=[] (extra="ignore"
        # + defaults make that a no-op).
        anomalies: List[Anomaly] = []
        anomaly_dollar_total = 0.0
        for a in (audit.get("anomalies") or []):
            if not isinstance(a, dict):
                continue
            raw_sev = (a.get("severity") or "").lower() or None
            sev = _SEVERITY_DISPLAY_MAP.get(raw_sev or "", "info")
            try:
                dollar_val = float(a.get("dollar_impact") or 0.0)
            except Exception:
                dollar_val = 0.0
            evidence_raw = a.get("evidence") or []
            evidence_list = [str(e) for e in evidence_raw if isinstance(evidence_raw, list) and e is not None]
            anomalies.append(Anomaly(
                severity=sev,
                title=str(a.get("headline") or a.get("title") or "Item flagged"),
                detail=str(a.get("detail") or ""),
                suggested_action=a.get("suggested_action"),
                rule=(a.get("rule") or None),
                dollar_impact=dollar_val if dollar_val else None,
                evidence=evidence_list,
                raw_severity=raw_sev,
            ))
            anomaly_dollar_total += max(0.0, dollar_val)

        informational_notes_raw = audit.get("informational_notes") or []
        informational_notes_list = [n for n in informational_notes_raw if isinstance(n, dict)]

        summary_text = audit.get("statement_summary", {}).get("period") or extracted.get("statement_period") or ""
        period_label = extracted.get("statement_period") or None

        statement = Statement(
            household_id=household_id,
            filename=filename,
            period_label=period_label,
            line_items=line_items,
            summary=summary_text or None,
            anomalies=anomalies,
            raw_text_preview=text[:1500],
            file_mimetype=file_mimetype,
            file_size_bytes=file_size,
            file_b64=file_b64,
            anomaly_dollar_impact_total=round(anomaly_dollar_total, 2),
            informational_notes=informational_notes_list,
        )
        await db.statements.insert_one({
            **statement.model_dump(),
            "participant_id": participant_id,
            # F-streams-source: persist the per-stream quarterly allocation
            # printed in the statement header (when present), so the dashboard
            # can show the participant's real allocation instead of the
            # MVP-wide proportion average.
            "header_stream_budgets": (extracted or {}).get("header_stream_budgets") or {},
        })
        await _audit(
            household_id, user_id, user_name, "STATEMENT_UPLOADED",
            f"Uploaded {filename} — {len(line_items)} line items, {len(anomalies)} alerts",
        )
        if anomalies:
            try:
                await create_notification(
                    user_id,
                    "anomaly_alerts",
                    f"{len(anomalies)} alert{'s' if len(anomalies) != 1 else ''} in {filename}",
                    f"Wayly flagged {len(anomalies)} thing{'s' if len(anomalies) != 1 else ''} worth a look in the latest statement.",
                    f"/app/statements/{statement.id}",
                )
            except Exception:
                pass
        # Phase 6 — emit participant_events so the timeline captures the
        # full journey. Always log statement_received; map decoder anomalies
        # to typed events (events.py). Parse-only / data-quality rules
        # (RULE_14, RULE_15, RULE_20, RULE_17/18 informational) are skipped.
        if participant_id:
            try:
                from scenario_engine.events import (
                    capture_event as _se_capture, EVENT_TYPES as _SE_EVENT_TYPES,
                )
                _ANOM_TO_EVENT = {
                    # Care management cap breaches
                    "RULE_1": "care_management_over_cap",
                    "RULE_1B": "care_management_over_cap",
                    "RULE_1_CARE_MGMT_CAP": "care_management_over_cap",
                    "RULE_1B_CARE_MGMT_MONTHLY": "care_management_over_cap",
                    # Stream / classification misallocation
                    "RULE_4": "wrong_stream_billing",
                    "RULE_9_WRONG_STREAM": "wrong_stream_billing",
                    "RULE_9_CLINICAL_CONTRIB": "wrong_stream_billing",
                    "RULE_9_CONTRIBUTION_MISMATCH": "wrong_stream_billing",
                    "RULE_11": "wrong_stream_billing",
                    "RULE_11_BROKERED_PREMIUM": "wrong_stream_billing",
                    "RULE_16_STREAM_DISCREPANCY": "wrong_stream_billing",
                    # Means / pension disclosure
                    "RULE_9_PENSION_STATUS_UNKNOWN": "means_not_disclosed",
                    # Backdated adjustments
                    "RULE_10": "backdated_adjustment",
                    "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS": "backdated_adjustment",
                    # AT-HM
                    "RULE_12_AT_HM_ACTIVE": "at_hm_expiring",
                    "RULE_19_AT_HM_LARGE_CLAIM": "at_hm_purchased",
                    # Quarter-end underspend
                    "RULE_13_QUARTERLY_UNDERSPEND": "quarter_end_underspend_risk",
                    "RULE_13_MID_QUARTER_UPDATE": "quarter_end_underspend_risk",
                }
                u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
                actor_name = (u or {}).get("name")
                today_iso = datetime.now(timezone.utc).date().isoformat()
                # Always log one statement_received event per upload — the
                # backbone of the timeline regardless of anomalies.
                if participant_id:
                    try:
                        await _se_capture(
                            db, participant_id=participant_id, account_id=None,
                            event_type="statement_received", trigger_source="statement",
                            effective_date=today_iso,
                            note=f"{filename} · {len(line_items)} line items, {len(anomalies)} alerts",
                            payload={"line_item_count": len(line_items),
                                     "anomaly_count": len(anomalies)},
                            source={"kind": "statement", "statement_id": statement.id,
                                    "filename": filename},
                            actor_id=user_id, actor_name=actor_name,
                        )
                    except Exception as _e:
                        logger.debug("statement_received event skipped: %s", _e)
                seen_event_keys: set = set()
                for a in anomalies:
                    rk = (a if isinstance(a, str) else a.get("rule_key") or a.get("rule") or "")
                    et = _ANOM_TO_EVENT.get(rk)
                    if not et or not participant_id:
                        continue
                    if et not in _SE_EVENT_TYPES:
                        continue
                    # Dedupe within this single upload (one event per type
                    # even if multiple anomalies map to it).
                    dedupe = (et, statement.id)
                    if dedupe in seen_event_keys:
                        continue
                    seen_event_keys.add(dedupe)
                    try:
                        await _se_capture(
                            db, participant_id=participant_id, account_id=None,
                            event_type=et, trigger_source="statement",
                            effective_date=today_iso,
                            note=f"From {filename}",
                            payload={"rule_key": rk},
                            source={"kind": "statement_anomaly",
                                    "statement_id": statement.id,
                                    "rule_key": rk,
                                    "filename": filename},
                            actor_id=user_id, actor_name=actor_name,
                        )
                    except Exception as _e:
                        logger.debug("scenario event emission skipped: %s", _e)
            except Exception:
                pass

        job["statement_id"] = statement.id
        job["status"] = "done"
        job["phase"] = "done"
    except Exception as e:
        logger.exception("upload job %s failed", job_id)
        job["status"] = "error"
        job["error"] = str(e)


def _submit_upload_job(
    text: str, filename: str, household_id: str, user_id: str, user_name: str,
    file_b64: Optional[str] = None, file_mimetype: Optional[str] = None,
    file_size: Optional[int] = None,
    participant_id: Optional[str] = None,
) -> str:
    import time
    _prune_upload_jobs()
    job_id = _new_job_id()
    UPLOAD_JOBS[job_id] = {
        "status": "pending",
        "phase": "pending",
        "statement_id": None,
        "error": None,
        "user_id": user_id,
        "created_at": time.time(),
    }
    asyncio.create_task(
        _run_upload_job(
            job_id, text, filename, household_id, user_id, user_name,
            file_b64=file_b64, file_mimetype=file_mimetype, file_size=file_size,
            participant_id=participant_id,
        )
    )
    return job_id


@api.get("/public/decode-job/{job_id}")
async def public_decode_job_status(job_id: str):
    job = DECODE_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found or expired")
    out = {"status": job["status"], "phase": job.get("phase", job["status"])}
    if job["status"] == "done":
        out["result"] = job["result"]
    elif job["status"] == "error":
        out["error"] = job["error"] or "decode failed"
    return out


@api.post("/public/decode-statement-text")
async def public_decode_text(body: PublicTextBody, request: Request, response: Response):
    await _enforce_statement_decoder_limit(request, response)
    job_id = _submit_decode_job(body.text, input_method="text_paste", document_pages=1, parsing_warnings=[])
    return {"job_id": job_id, "status": "pending"}


@api.post("/public/decode-statement")
async def public_decode_file(request: Request, response: Response, file: UploadFile = File(...)):
    await _enforce_statement_decoder_limit(request, response)
    # Phase 4: signature + virus scan + UUID rename before we touch it.
    from upload_security import secure_read_upload, PROFILE_STATEMENT, sanitize_for_prompt
    raw, safe_name, _kind = await secure_read_upload(
        file, allowed_profiles=PROFILE_STATEMENT,
    )
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    from document_extract import (
        extract_document, UnsupportedFormatError, FileTooLargeError,
        CorruptFileError, PasswordProtectedError,
    )
    try:
        text, input_method, page_count, parse_warnings = await extract_document(safe_name, raw)
    except UnsupportedFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileTooLargeError as e:
        mb = e.limit_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"This {e.ext} file exceeds the {mb} MB limit. Try compressing it or splitting into smaller parts.")
    except PasswordProtectedError:
        raise HTTPException(status_code=400, detail="This PDF is password-protected. Open it in your PDF viewer, remove the password (File → Properties → Security), save a new copy, and upload the new file.")
    except CorruptFileError as e:
        raise HTTPException(status_code=400, detail=f"This file appears to be damaged or unreadable: {e}")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file. Try a clearer photo or paste the text directly.")
    # Phase 4: prompt-injection sanitisation.
    text = sanitize_for_prompt(text)
    job_id = _submit_decode_job(
        text, input_method=input_method, document_pages=page_count,
        parsing_warnings=parse_warnings, original_filename=safe_name,
    )
    return {"job_id": job_id, "status": "pending"}


@api.post("/public/budget-calc")
async def public_budget_calc(body: PublicBudgetBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Budget Calculator")
    classification = body.classification
    annual = budget_lib.CLASSIFICATIONS[classification]["annual"]
    quarterly_gross = round(annual / 4.0, 2)
    quarterly_usable = budget_lib.quarterly_budget(classification)
    # Care management is the gross-minus-usable slice (mathematically
    # quarterly_gross * care_management.cap_pct, rounded the same way).
    care_management_quarterly = round(quarterly_gross - quarterly_usable, 2)
    allocations = budget_lib.stream_allocations(classification)
    rollover = budget_lib.rollover_cap(classification)
    cap_amount = budget_lib.lifetime_cap(body.is_grandfathered)
    contributions = max(0.0, body.current_lifetime_balance)
    pct = (contributions / cap_amount * 100) if cap_amount else 0.0
    years_to_cap = None
    if body.expected_annual_burn and body.expected_annual_burn > 0:
        remaining = max(0.0, cap_amount - contributions)
        years_to_cap = round(remaining / body.expected_annual_burn, 2)
    return {
        "classification": classification,
        "classification_label": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual_total": annual,
        # F9: GROSS quarterly is what users see on their statement — it leads.
        "quarterly_gross": quarterly_gross,
        "care_management_quarterly": care_management_quarterly,
        "quarterly_usable": quarterly_usable,
        # DEPRECATED: kept for one release so existing clients keep working.
        # TODO: remove ``quarterly_total`` once the frontend / mobile app stop
        # reading it (target: next major release after the F9 rollout).
        "quarterly_total": quarterly_usable,
        "rollover_cap": rollover,
        "streams": [
            {"stream": s, "allocated": allocations[s], "indicative": True}
            for s in budget_lib.STREAMS
        ],
        "allocation_source": "program_average",
        "streams_note": (
            "Indicative split only. Your participant's actual stream allocation is set in their "
            "individualised budget and care plan, and may differ substantially. Check the quarterly "
            "budget summary on your provider statement for the real split."
        ),
        "lifetime_cap": cap_amount,
        "lifetime_contributions": contributions,
        "lifetime_pct": round(pct, 2),
        "years_to_cap": years_to_cap,
        "is_grandfathered": body.is_grandfathered,
    }


@api.post("/public/price-check")
async def public_price_check(body: PublicPriceBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Provider Price Checker")
    bench = PRICE_BENCHMARKS.get(body.service, {"median": body.rate})
    median = bench["median"]
    delta_pct = ((body.rate - median) / median * 100) if median else 0.0
    if body.rate > median * 1.10:
        verdict, label = "high", "Higher than the typical rate"
        assessment = (
            f"At ${body.rate:.2f}/unit, this is about {delta_pct:.0f}% above the network median "
            f"of ${median:.2f} for {body.service.lower()}. Worth asking the provider for a written "
            "explanation of how they set the rate."
        )
        suggested = "Email the provider asking for a written explanation of the rate."
    elif body.rate < median * 0.85:
        verdict, label = "low", "Below the typical rate"
        assessment = (
            f"At ${body.rate:.2f}/unit, this is below the network median of ${median:.2f}. "
            "That's likely a good outcome — confirm the service quality is what you'd expect."
        )
        suggested = None
    else:
        verdict, label = "fair", "About what you'd expect"
        assessment = (
            f"At ${body.rate:.2f}/unit, you're within the typical range for {body.service.lower()} "
            f"(network median ${median:.2f})."
        )
        suggested = None

    return {
        "service": body.service,
        "charged": body.rate,
        "median": median,
        "delta_pct": round(delta_pct, 2),
        "verdict": verdict,
        "verdict_label": label,
        "assessment": assessment,
        "suggested_action": suggested,
        "caps_note": (
            "Government price caps for Support at Home were deferred indefinitely in May 2026. "
            "Providers set their own prices. This comparison uses indicative network medians. "
            "If you believe you have been overcharged, the Aged Care Quality and Safety Commission "
            "can order refunds."
        ),
    }


# ---- Tool 4: Classification self-check (12-question quiz) ----
class PublicClassificationBody(BaseModel):
    answers: List[int] = Field(min_length=12, max_length=12)  # each 0-4
    current_classification: int | None = None


@api.post("/public/classification-check")
async def public_classification_check(body: PublicClassificationBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Classification Self-Check")
    if not all(0 <= a <= 4 for a in body.answers):
        raise HTTPException(status_code=400, detail="Each answer must be 0–4")
    score = sum(body.answers)  # 0..48
    # Map to classification range
    if score <= 6:
        low, high = 1, 2
    elif score <= 12:
        low, high = 2, 3
    elif score <= 18:
        low, high = 3, 4
    elif score <= 24:
        low, high = 4, 5
    elif score <= 30:
        low, high = 5, 6
    elif score <= 36:
        low, high = 6, 7
    else:
        low, high = 7, 8
    annual_low = budget_lib.CLASSIFICATIONS[low]["annual"]
    annual_high = budget_lib.CLASSIFICATIONS[high]["annual"]
    suggest_reassess = body.current_classification is not None and (
        body.current_classification < low or body.current_classification > high + 1
    )
    return {
        "score": score,
        "score_max": 48,
        "likely_low": low,
        "likely_high": high,
        "likely_label": f"Classification {low}" if low == high else f"Classification {low}–{high}",
        "annual_range": [annual_low, annual_high],
        "current_classification": body.current_classification,
        "suggest_reassessment": suggest_reassess,
        "caveat": "This is informational only. Only the My Aged Care Independent Assessment Tool (IAT) determines the actual classification.",
    }


# ---- Tool 5: Reassessment letter drafter ----
class PublicReassessmentBody(BaseModel):
    participant_name: str = Field(min_length=1, max_length=120)
    current_classification: int = Field(ge=1, le=8)
    changes_summary: str = Field(min_length=10, max_length=4000)
    recent_events: str | None = None
    sender_name: str = Field(min_length=1, max_length=120)
    relationship: str | None = "family caregiver"


@api.post("/public/reassessment-letter")
async def public_reassessment_letter(body: PublicReassessmentBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Reassessment Letter Generator")
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="LLM unavailable")
    # Wrapper redacts PII from the free-text fields
    free_text = f"{body.changes_summary}\n{body.recent_events or ''}"
    wrapped = await run_wrapper(free_text)
    if wrapped["abuse_flag"]:
        return {"abuse_flag": wrapped["abuse_flag"], "abuse_response": wrapped["abuse_response"]}
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You are a paperwork drafter for Australian Support at Home. Draft a polite, factual "
        "reassessment request letter to My Aged Care. Australian English. 250–400 words. "
        "Plain professional tone. Use the participant's name and the sender's name. Use "
        "gender‑neutral language unless the user has supplied otherwise — never default to "
        "'Mum'. Reference Aged Care Act 2024 framework where relevant. End with a specific "
        "request and a 14‑day response timeframe. Output ONLY the letter body — no preamble, "
        "no markdown. NEVER claim a specific reassessment outcome ('they should be on L7') — "
        "frame as 'we'd like the assessor to consider whether the current classification still "
        "fits'."
    )
    chat = LlmChat(
        api_key=key, session_id=f"reassess-{datetime.now(timezone.utc).timestamp()}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    prompt = (
        f"Participant: {body.participant_name}\n"
        f"Current classification: Classification {body.current_classification}\n"
        f"What's changed: {wrapped['redacted_input']}\n"
        f"Letter sender: {body.sender_name} ({body.relationship or 'family caregiver'})"
    )
    letter = await chat.send_message(UserMessage(text=prompt))
    out = {"letter": letter.strip(), "word_count": len(letter.split())}
    if wrapped["redaction_notice"]:
        out["redaction_notice"] = wrapped["redaction_notice"]
    return out


# ---- Tool 6: Contribution estimator ----
# Each entry maps a pension cohort + stream to a (min_rate, max_rate) band.
# Exact-rate cohorts have min == max. Band cohorts (part Age Pension, CSHC) sit
# on a Services Australia means-tested range — for the estimator the band
# midpoint is used as an indicative rate and the response flags the basis.
PENSION_RATES = {
    "full":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.05),  "everyday_living": (0.175, 0.175)},
    "part":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.25),  "everyday_living": (0.175, 0.25)},
    "cshc":      {"clinical": (0.0, 0.0), "independence": (0.05, 0.50),  "everyday_living": (0.175, 0.80)},
    "self":      {"clinical": (0.0, 0.0), "independence": (0.50, 0.50),  "everyday_living": (0.80, 0.80)},
}


class PublicContributionBody(BaseModel):
    classification: int = Field(ge=1, le=8)
    pension_status: str = Field(pattern="^(full|part|cshc|self)$")
    is_grandfathered: bool = False
    expected_mix_clinical_pct: float = Field(ge=0, le=100, default=30)
    expected_mix_independence_pct: float = Field(ge=0, le=100, default=45)
    expected_mix_everyday_pct: float = Field(ge=0, le=100, default=25)
    # Optional: user can paste the exact rates from their Services Australia
    # contribution letter so the estimate is precise rather than a band range.
    independence_rate_pct: float | None = Field(default=None, ge=0, le=100)
    everyday_rate_pct: float | None = Field(default=None, ge=0, le=100)


@api.post("/public/contribution-estimator")
async def public_contribution_estimator(body: PublicContributionBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Contribution Estimator")
    total_pct = body.expected_mix_clinical_pct + body.expected_mix_independence_pct + body.expected_mix_everyday_pct
    if total_pct < 95 or total_pct > 105:
        raise HTTPException(status_code=400, detail="Service mix percentages should sum to 100")
    rates = PENSION_RATES[body.pension_status]

    clin_band = rates["clinical"]      # always (0.0, 0.0)
    ind_band = rates["independence"]
    ev_band = rates["everyday_living"]

    is_ind_band = abs(ind_band[1] - ind_band[0]) > 1e-9
    is_ev_band = abs(ev_band[1] - ev_band[0]) > 1e-9

    # ---- Validate any user-supplied rates against the cohort band -------
    user_ind = body.independence_rate_pct
    user_ev = body.everyday_rate_pct

    def _validate_rate(label: str, rate_pct: float, band: tuple[float, float]):
        lo_pct = round(band[0] * 100, 2)
        hi_pct = round(band[1] * 100, 2)
        # Allow a 0.5 percentage-point tolerance to absorb rounding from
        # the printed Services Australia letter.
        if rate_pct < lo_pct - 0.5 or rate_pct > hi_pct + 0.5:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"{label} rate {rate_pct}% is outside the {lo_pct}%-{hi_pct}% range "
                    f"that applies to a {body.pension_status} cohort. Double-check the "
                    "rate on your Services Australia contribution letter."
                ),
            )

    if user_ind is not None and is_ind_band:
        _validate_rate("Independence", user_ind, ind_band)
    if user_ev is not None and is_ev_band:
        _validate_rate("Everyday Living", user_ev, ev_band)

    # ---- Gross annual service base (F5 fix — no longer / 4 * 4 via post-CM) --
    annual_service = budget_lib.classification_annual(body.classification)
    clin = annual_service * (body.expected_mix_clinical_pct / 100)
    ind = annual_service * (body.expected_mix_independence_pct / 100)
    ev = annual_service * (body.expected_mix_everyday_pct / 100)

    # ---- Decide rate_basis ----------------------------------------------
    has_user_rates = (
        (is_ind_band and user_ind is not None)
        or (is_ev_band and user_ev is not None)
    )
    has_band = is_ind_band or is_ev_band
    if not has_band:
        rate_basis = "exact_rate"
    elif (
        (not is_ind_band or user_ind is not None)
        and (not is_ev_band or user_ev is not None)
    ):
        rate_basis = "user_supplied" if has_user_rates else "exact_rate"
    else:
        rate_basis = "band_range"

    # Clinical contribution is always $0 — outside the band-vs-exact axis.
    contrib_clin = 0.0

    cap = budget_lib.lifetime_cap(body.is_grandfathered)

    caveat: str | None = None
    if rate_basis == "band_range":
        caveat = (
            "Your exact contribution rate is set by Services Australia based on your "
            "income and assets. Enter the rates from your contribution letter for a "
            "precise estimate, or call Services Australia on 1800 227 475."
        )

    def _resolve_rate(user_pct: float | None, band: tuple[float, float]) -> float:
        if user_pct is not None:
            return user_pct / 100
        if abs(band[1] - band[0]) <= 1e-9:
            return band[0]
        # Band cohort with no user rate — caller must use low/high path.
        return float("nan")

    if rate_basis == "band_range":
        # Range output. annual_contribution + per-stream rate_pct stay null.
        ind_low_rate, ind_high_rate = ind_band
        ev_low_rate, ev_high_rate = ev_band
        if user_ind is not None:
            ind_low_rate = ind_high_rate = user_ind / 100
        if user_ev is not None:
            ev_low_rate = ev_high_rate = user_ev / 100

        contrib_ind_low = ind * ind_low_rate
        contrib_ind_high = ind * ind_high_rate
        contrib_ev_low = ev * ev_low_rate
        contrib_ev_high = ev * ev_high_rate

        annual_low = round(contrib_clin + contrib_ind_low + contrib_ev_low, 2)
        annual_high = round(contrib_clin + contrib_ind_high + contrib_ev_high, 2)
        quarterly_low = round(annual_low / 4, 2)
        quarterly_high = round(annual_high / 4, 2)
        years_to_cap_low = round(cap / annual_high, 1) if annual_high > 0 else None
        years_to_cap_high = round(cap / annual_low, 1) if annual_low > 0 else None

        per_stream = [
            {
                "stream": "Clinical",
                "annual_charged": round(clin, 2),
                "annual_contribution": 0.0,
                "annual_contribution_low": 0.0,
                "annual_contribution_high": 0.0,
                "rate_pct": 0.0,
                "rate_pct_low": 0.0,
                "rate_pct_high": 0.0,
                "rate_band_pct": [0.0, 0.0],
                "is_band": False,
            },
            {
                "stream": "Independence",
                "annual_charged": round(ind, 2),
                "annual_contribution": None,
                "annual_contribution_low": round(contrib_ind_low, 2),
                "annual_contribution_high": round(contrib_ind_high, 2),
                "rate_pct": None if is_ind_band and user_ind is None else round(_resolve_rate(user_ind, ind_band) * 100, 2),
                "rate_pct_low": round(ind_low_rate * 100, 2),
                "rate_pct_high": round(ind_high_rate * 100, 2),
                "rate_band_pct": [round(ind_band[0] * 100, 2), round(ind_band[1] * 100, 2)],
                "is_band": is_ind_band,
            },
            {
                "stream": "Everyday Living",
                "annual_charged": round(ev, 2),
                "annual_contribution": None,
                "annual_contribution_low": round(contrib_ev_low, 2),
                "annual_contribution_high": round(contrib_ev_high, 2),
                "rate_pct": None if is_ev_band and user_ev is None else round(_resolve_rate(user_ev, ev_band) * 100, 2),
                "rate_pct_low": round(ev_low_rate * 100, 2),
                "rate_pct_high": round(ev_high_rate * 100, 2),
                "rate_band_pct": [round(ev_band[0] * 100, 2), round(ev_band[1] * 100, 2)],
                "is_band": is_ev_band,
            },
        ]
        return {
            "annual_service_total": round(annual_service, 2),
            "annual_contribution": None,
            "annual_contribution_low": annual_low,
            "annual_contribution_high": annual_high,
            "quarterly_contribution": None,
            "quarterly_contribution_low": quarterly_low,
            "quarterly_contribution_high": quarterly_high,
            "per_stream": per_stream,
            "lifetime_cap": cap,
            "years_to_cap": None,
            "years_to_cap_low": years_to_cap_low,
            "years_to_cap_high": years_to_cap_high,
            "pension_status": body.pension_status,
            "rate_basis": rate_basis,
            "caveat": caveat,
        }

    # ---- Exact / user-supplied path -------------------------------------
    ind_rate = _resolve_rate(user_ind, ind_band)
    ev_rate = _resolve_rate(user_ev, ev_band)

    contrib_ind = ind * ind_rate
    contrib_ev = ev * ev_rate
    annual_contrib = round(contrib_clin + contrib_ind + contrib_ev, 2)
    quarterly_contrib = round(annual_contrib / 4, 2)
    years_to_cap = round(cap / annual_contrib, 1) if annual_contrib > 0 else None

    per_stream = [
        {
            "stream": "Clinical",
            "annual_charged": round(clin, 2),
            "annual_contribution": 0.0,
            "annual_contribution_low": None,
            "annual_contribution_high": None,
            "rate_pct": 0.0,
            "rate_pct_low": None,
            "rate_pct_high": None,
            "rate_band_pct": [0.0, 0.0],
            "is_band": False,
        },
        {
            "stream": "Independence",
            "annual_charged": round(ind, 2),
            "annual_contribution": round(contrib_ind, 2),
            "annual_contribution_low": None,
            "annual_contribution_high": None,
            "rate_pct": round(ind_rate * 100, 2),
            "rate_pct_low": None,
            "rate_pct_high": None,
            "rate_band_pct": [round(ind_band[0] * 100, 2), round(ind_band[1] * 100, 2)],
            "is_band": is_ind_band,
        },
        {
            "stream": "Everyday Living",
            "annual_charged": round(ev, 2),
            "annual_contribution": round(contrib_ev, 2),
            "annual_contribution_low": None,
            "annual_contribution_high": None,
            "rate_pct": round(ev_rate * 100, 2),
            "rate_pct_low": None,
            "rate_pct_high": None,
            "rate_band_pct": [round(ev_band[0] * 100, 2), round(ev_band[1] * 100, 2)],
            "is_band": is_ev_band,
        },
    ]
    return {
        "annual_service_total": round(annual_service, 2),
        "annual_contribution": annual_contrib,
        "annual_contribution_low": None,
        "annual_contribution_high": None,
        "quarterly_contribution": quarterly_contrib,
        "quarterly_contribution_low": None,
        "quarterly_contribution_high": None,
        "per_stream": per_stream,
        "lifetime_cap": cap,
        "years_to_cap": years_to_cap,
        "years_to_cap_low": None,
        "years_to_cap_high": None,
        "pension_status": body.pension_status,
        "rate_basis": rate_basis,
        "caveat": caveat,
    }


# ---- Tool 7: Care plan reviewer ----
class PublicCarePlanBody(BaseModel):
    text: str = Field(min_length=50, max_length=20000)


@api.post("/public/care-plan-review")
async def public_care_plan_review(body: PublicCarePlanBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Care Plan Reviewer")
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="LLM unavailable")
    wrapped = await run_wrapper(body.text)
    if wrapped["abuse_flag"]:
        return {"abuse_flag": wrapped["abuse_flag"], "abuse_response": wrapped["abuse_response"]}
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You review Australian Support at Home care plans. Check coverage against the "
        "Statement of Rights (Aged Care Act 2024) and the National Quality Standards. "
        "Use gender‑neutral language — never default to 'Mum'. "
        "Output STRICT JSON: {\"summary\":\"1 paragraph\",\"coverage\":[{\"item\":\"...\","
        "\"present\":true/false,\"note\":\"...\"}],\"gaps\":[\"...\"],"
        "\"questions_to_raise\":[\"...\"]}. Coverage items: goals stated, services listed "
        "with frequency, review date set, restorative focus, cultural/language preferences, "
        "advance care directive referenced, named worker preferences, complaint pathway, "
        "contribution amounts, rights statement. No markdown."
    )
    chat = LlmChat(
        api_key=key, session_id=f"careplan-{datetime.now(timezone.utc).timestamp()}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    raw = await chat.send_message(UserMessage(text=f"Care plan:\n\n{wrapped['redacted_input'][:18000]}"))
    import json as _json
    try:
        from agents import _strip_json
        out = _json.loads(_strip_json(raw))
    except Exception:
        out = {"summary": raw[:500], "coverage": [], "gaps": [], "questions_to_raise": []}
    if wrapped["redaction_notice"]:
        out["redaction_notice"] = wrapped["redaction_notice"]
    return out


# ---- Tool 8: Family Care Coordinator chat (public) ----
class PublicChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = None


@api.post("/public/family-coordinator-chat")
async def public_family_coordinator(body: PublicChatBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Family Care Coordinator")
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail="LLM unavailable")
    wrapped = await run_wrapper(body.message)
    if wrapped["abuse_flag"]:
        return {
            "reply": wrapped["abuse_response"],
            "session_id": body.session_id or f"public-chat-{_client_ip(request)}",
            "abuse_flag": wrapped["abuse_flag"],
        }
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    system = (
        "You are Wayly's Family Care Coordinator — a friendly, expert chat assistant for "
        "Australian families navigating the Support at Home program. Tone: the friendliest, "
        "most patient, most well‑informed niece in Australia — calm, specific, never "
        "breathless. Ground answers in: Aged Care Act 2024, Support at Home program manual, "
        "National Quality Standards. Australian English. Use gender‑neutral language; refer "
        "to 'the person you care for' or 'the participant', never default to 'Mum'. Lead "
        "with the answer (1‑2 sentences), then one paragraph of context, then cite sources "
        "where you can ('Aged Care Act 2024, section X'). NEVER invent dollar figures, "
        "dates, or section numbers — say 'I don't have a current figure for that — the "
        "authoritative source is My Aged Care on 1800 200 422'. NEVER give clinical or "
        "financial‑product advice; redirect to the GP / a FAAA‑registered advisor. NEVER "
        "recommend a specific provider. If asked, you are Wayly's AI; offer human handoff "
        "with 'type human and I'll connect you'. Keep responses 50–150 words by default, "
        "up to 250 only if needed. End with one soft next step (a relevant tool or guide)."
    )
    sid = body.session_id or f"public-chat-{_client_ip(request)}"
    chat = LlmChat(api_key=key, session_id=sid, system_message=system).with_model(
        "anthropic", "claude-sonnet-4-5-20250929"
    )
    reply = await chat.send_message(UserMessage(text=wrapped["redacted_input"]))
    out: dict = {"reply": reply, "session_id": sid}
    if wrapped["redaction_notice"]:
        out["redaction_notice"] = wrapped["redaction_notice"]
    return out


@api.get("/")
async def root():
    return {"service": "wayly", "ok": True}


# ---------------------------------------------------------------------------
# Phase 3 — Uptime & Health Monitoring
# ---------------------------------------------------------------------------
# `/api/health`   = unauthenticated, cheap. UptimeRobot polls this every 5 min.
# `/api/health/deep` = admin-only. Probes Mongo / Redis / ClamAV / LLM key.
#                     Used for incident triage + the public `/status` page.
# Never returns PII / secrets — only ok/fail booleans + timings.

WAYLY_VERSION = os.environ.get("WAYLY_VERSION", "preview")


def _human_uptime(seconds: int) -> str:
    if seconds < 60:
        return f"{seconds}s"
    if seconds < 3600:
        return f"{seconds // 60}m"
    if seconds < 86400:
        h = seconds // 3600
        m = (seconds % 3600) // 60
        return f"{h}h {m}m" if m else f"{h}h"
    d = seconds // 86400
    h = (seconds % 86400) // 3600
    return f"{d}d {h}h" if h else f"{d}d"


@api.get("/health")
async def health():
    """Liveness probe. Always returns 200 unless the process is dead. Designed
    for high-frequency unauthenticated polling (UptimeRobot, k8s, Cloudflare)."""
    return {
        "status": "ok",
        "ts": datetime.now(timezone.utc).isoformat(),
        "service": "wayly-api",
        "version": WAYLY_VERSION,
    }


async def _ping_mongo(timeout_s: float = 2.0) -> Dict[str, Any]:
    started = datetime.now(timezone.utc)
    try:
        await asyncio.wait_for(client.admin.command("ping"), timeout=timeout_s)
        return {"ok": True, "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}


async def _ping_redis(timeout_s: float = 2.0) -> Dict[str, Any]:
    started = datetime.now(timezone.utc)
    url = os.environ.get("REDIS_URL")
    if not url:
        return {"ok": False, "error": "REDIS_URL not set"}
    try:
        import redis.asyncio as redis_async
        r = redis_async.from_url(url)
        await asyncio.wait_for(r.ping(), timeout=timeout_s)
        try:
            await r.aclose()
        except Exception:
            pass
        return {"ok": True, "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}


async def _ping_clamav(timeout_s: float = 2.0) -> Dict[str, Any]:
    """Best-effort PING to the clamd unix socket (if configured)."""
    started = datetime.now(timezone.utc)
    sock = os.environ.get("CLAMD_SOCKET", "/var/run/clamav/clamd.ctl")
    if not os.path.exists(sock):
        return {"ok": False, "error": "clamd socket missing", "skipped": True}
    try:
        reader, writer = await asyncio.wait_for(
            asyncio.open_unix_connection(sock), timeout=timeout_s
        )
        writer.write(b"nPING\n")
        await writer.drain()
        data = await asyncio.wait_for(reader.readline(), timeout=timeout_s)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        ok = b"PONG" in data
        return {"ok": ok, "latency_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000)}
    except Exception as e:
        return {"ok": False, "error": type(e).__name__}


def _check_llm_key() -> Dict[str, Any]:
    """Sanity-check the Emergent LLM key is present + correctly shaped. Never
    transmits it; never includes it in the response."""
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        return {"ok": False, "error": "EMERGENT_LLM_KEY missing"}
    # Emergent keys are `sk-emergent-<token>`. We deliberately don't probe a
    # paid endpoint here — that would burn credit on every health check.
    return {
        "ok": key.startswith("sk-emergent-") and len(key) >= 20,
        "prefix": key[:12] + "…" if key else "",
    }


@api.get("/health/deep")
async def health_deep(user_id: str = Depends(get_current_admin_id)):
    """Deep liveness — checks every external dependency. Admin-only.
    Returns 200 with per-dep status; the orchestrator decides whether to
    page based on which dep is `ok=false`."""
    started = datetime.now(timezone.utc)
    mongo, redis_dep, clamav = await asyncio.gather(
        _ping_mongo(), _ping_redis(), _ping_clamav(),
    )
    llm = _check_llm_key()
    uptime_s = int((started - APP_STARTED_AT).total_seconds())
    all_ok = mongo.get("ok") and redis_dep.get("ok") and llm.get("ok") and (clamav.get("ok") or clamav.get("skipped"))
    return {
        "status": "ok" if all_ok else "degraded",
        "ts": started.isoformat(),
        "service": "wayly-api",
        "version": WAYLY_VERSION,
        "uptime_seconds": uptime_s,
        "uptime_human": _human_uptime(uptime_s),
        "dependencies": {
            "mongo": mongo,
            "redis": redis_dep,
            "clamav": clamav,
            "llm_key": llm,
        },
    }


# ---------------------------------------------------------------------------


@api.get("/health/clamav")
async def health_clamav():
    """Public liveness probe for the virus scanner. Used by the frontend's
    upload composer to show an inline readiness indicator without needing a
    failed upload to discover the daemon is down."""
    from upload_security import clamav_status
    return clamav_status()

# Public status — uptime, last ingestion, model versions, dependency health.
# Intentionally public + cache-friendly; safe values only.
# ---------------------------------------------------------------------------


@api.get("/status")
async def public_status():
    now = datetime.now(timezone.utc)
    uptime_seconds = int((now - APP_STARTED_AT).total_seconds())

    mongo_ok = True
    try:
        await client.admin.command("ping")
    except Exception as e:
        logger.warning("Status mongo ping failed: %s", e)
        mongo_ok = False

    last_ingest_iso: Optional[str] = None
    last_ingest_method: Optional[str] = None
    try:
        latest = await db.statements.find_one(
            {},
            {"_id": 0, "uploaded_at": 1, "input_method": 1},
            sort=[("uploaded_at", -1)],
        )
        if latest:
            last_ingest_iso = latest.get("uploaded_at")
            last_ingest_method = latest.get("input_method")
    except Exception as e:
        logger.warning("Status last-ingestion lookup failed: %s", e)

    def _round_bucket(n: int) -> int:
        if n < 10:
            return n
        if n < 100:
            return (n // 10) * 10
        return (n // 100) * 100

    try:
        total_statements = await db.statements.estimated_document_count()
        total_households = await db.households.estimated_document_count()
    except Exception:
        total_statements = 0
        total_households = 0

    llm_key_configured = bool(os.environ.get("EMERGENT_LLM_KEY"))
    resend_configured = bool(os.environ.get("RESEND_API_KEY"))
    stripe_configured = bool(os.environ.get("STRIPE_SECRET_KEY"))

    components = {
        "mongo": "ok" if mongo_ok else "down",
        "llm": "ok" if llm_key_configured else "not_configured",
        "email": "ok" if resend_configured else "not_configured",
        "billing": "ok" if stripe_configured else "not_configured",
    }
    overall = "ok" if mongo_ok and llm_key_configured else ("down" if not mongo_ok else "degraded")

    recent_24h = 0
    try:
        cutoff = (now - timedelta(hours=24)).isoformat()
        recent_24h = await db.statements.count_documents({"uploaded_at": {"$gte": cutoff}})
    except Exception:
        pass

    return {
        "service": "wayly",
        "status": overall,
        "components": components,
        "uptime_seconds": uptime_seconds,
        "uptime_human": _human_uptime(uptime_seconds),
        "last_ingestion_at": last_ingest_iso,
        "last_ingestion_method": last_ingest_method,
        "ingestion_24h": recent_24h,
        "totals": {
            "statements": _round_bucket(total_statements),
            "households": _round_bucket(total_households),
        },
        "versions": {
            "build": APP_BUILD_VERSION,
            "anomaly_engine": ANOMALY_ENGINE_VERSION,
            "document_extract": DOCUMENT_EXTRACT_VERSION,
            "claude_extractor": os.environ.get("KINDRED_EXTRACTOR_MODEL", "claude-haiku-4-5-20251001"),
            "claude_auditor": os.environ.get("KINDRED_AUDITOR_MODEL", "claude-haiku-4-5-20251001"),
            "claude_chat": "claude-sonnet-4-5-20250929",
        },
        "checked_at": now.isoformat(),
    }


# ---------------------------------------------------------------------------
# Public Help Chat — anonymous floating help-bot for every visitor
# ---------------------------------------------------------------------------
class HelpChatBody(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    session_id: Optional[str] = None
    page_path: Optional[str] = None  # current URL the user is on, for context


HELP_CHAT_SYSTEM = (
    "You are Wayly's help chat, sitting in the corner of every page on wayly.com.au. "
    "You are speaking with a family caregiver who is trying to figure out aged care while also living a full life. "
    "Be warm and direct — like a friend who actually knows this stuff, not a support bot. "
    "Plain Australian English. Two or three sentences is usually enough, never more than about 80 words. "
    "Do NOT use em-dashes, en-dashes, double asterisks, headings, or any markdown formatting. Plain sentences only.\n\n"
    "WHAT WAYLY IS\n"
    "Wayly is for the daughter or son who suddenly has to read their parent's monthly Support at Home statement and "
    "make sense of it. Provider-agnostic, never takes commissions, never sells data. We work alongside the caregiver, "
    "not on behalf of the provider.\n\n"
    "PLANS\n"
    "- Free $0/mo: 1 Statement Decoder use per calendar month. No card required.\n"
    "- Solo $19/mo: unlimited tools, dashboard, statement uploads, 1 participant, 1 caregiver seat.\n"
    "- Family $39/mo (most popular): everything in Solo + 2 participants included + 3 caregiver seats + priority support.\n"
    "- Add extra participants on Family for $19/month each, billed separately, cancel anytime.\n"
    "- Adviser $299/mo: up to 20 client households, 3 caregiver seats, scenario modeller, branded PDFs, priority support, offline mode.\n"
    "- Adviser Pro $3500/mo: unlimited clients, white-label, custom domain, multi-advisor team.\n"
    "- Paid plans get a 7-day free trial, 14 days with a referral code.\n\n"
    "AI TOOLS (8 total)\n"
    "1. Statement Decoder (free 1/month, unlimited on paid). Upload PDF, Word, photo (JPG/PNG/HEIC/WEBP), or paste text.\n"
    "2. Budget & Lifetime Cap Calculator (Solo+).\n"
    "3. Provider Price Checker (Solo+).\n"
    "4. Classification Self-Check (Solo+).\n"
    "5. Reassessment Letter Generator (Solo+).\n"
    "6. Contribution Estimator (Solo+).\n"
    "7. Care Plan Reviewer (Solo+).\n"
    "8. Family Care Coordinator chat (Solo+).\n\n"
    "KEY FEATURES\n"
    "Caregiver dashboard with per-stream budget cards, lifetime cap progress, anomaly alerts. "
    "Participant view designed for an older parent (huge text, voice-first, single-action UX). "
    "Family thread plus immutable audit log on Family. Resources hub with glossary, templates, and articles. "
    "Statement Decoder anomaly engine covers around 20 named rules including duplicates, weekend rates, brokered-rate premiums, and AT-HM tracking.\n\n"
    "WHAT YOU NEVER DO\n"
    "Never give clinical or financial advice. If a clinical question comes up, point them at their GP. "
    "If a financial-product question comes up, point them at a FAAA-registered adviser or My Aged Care on 1800 200 422. "
    "Never recommend a specific provider. Never invent dollar figures, dates, section numbers, or URLs. "
    "If you genuinely don't know, say so and point them at My Aged Care on 1800 200 422.\n"
    "- For account-specific questions (billing, password reset) point users to "
    "Settings → Plan & Billing or Sign in.\n"
    "- For crisis / distress: 1800ELDERHelp 1800 353 374, OPAN 1800 700 600, "
    "Lifeline 13 11 14, Beyond Blue 1300 22 4636.\n\n"
    "TONE\n"
    "Lead with the answer. One soft next step at the end where helpful (e.g. "
    "'Try the Statement Decoder free at /ai-tools/statement-decoder' or 'See plans at "
    "/pricing'). Use gender-neutral language; never default to 'Mum'."
)


@api.post("/public/help-chat")
async def public_help_chat(body: HelpChatBody, request: Request, response: Response):
    """Anonymous help bot for every site visitor. Rate-limited per IP."""
    _check_rate_limit(_client_ip(request))
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable", "message": "Help chat is temporarily unavailable. Try again in a moment."})
    wrapped = await run_wrapper(body.message)
    sid = body.session_id or f"help-{_client_ip(request)}"
    if wrapped.get("abuse_flag"):
        return {
            "reply": wrapped.get("abuse_response") or "I can only help with questions about Wayly and Support at Home.",
            "session_id": sid,
            "abuse_flag": True,
        }
    page_hint = ""
    if body.page_path:
        page_hint = f"\n\n[The user is currently on the page: {body.page_path[:200]}]"
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=key, session_id=sid,
        system_message=HELP_CHAT_SYSTEM + page_hint,
    ).with_model("anthropic", "claude-haiku-4-5-20251001").with_params(max_tokens=400)
    try:
        reply = await chat.send_message(UserMessage(text=wrapped.get("redacted_input") or body.message))
    except Exception as e:
        logger.warning("Help chat LLM call failed: %s", e)
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable", "message": "I'm having trouble right now. Try again in a moment, or email help@wayly.com.au."})
    out: dict = {"reply": _humanize_assistant_reply(str(reply or "")), "session_id": sid}
    if wrapped.get("redaction_notice"):
        out["redaction_notice"] = wrapped["redaction_notice"]
    return out


# ---------------------------------------------------------------------------
# Authenticated Help Chat — same widget, but injected with the user's actual
# household context (classification, budget burn, recent anomalies, statements)
# so it can answer "what's my biggest anomaly this quarter?" with real data.
# ---------------------------------------------------------------------------
async def _build_user_context(user_id: str) -> str:
    """Returns a compact plain-text snapshot of the user's current Wayly state
    for inclusion in the help-chat system prompt. Skips silently if no household."""
    try:
        u = await _get_user(user_id)
    except Exception:
        return ""
    lines: list[str] = []
    name = (u.get("name") or "").split(" ")[0] or "the caregiver"
    lines.append(f"USER: {name} ({u.get('email','')}). Plan: {u.get('plan','free')}.")

    h = await _get_user_household(user_id)
    if not h:
        lines.append("HOUSEHOLD: not yet set up — direct user to /onboarding when relevant.")
        return "\n".join(lines)

    classification = h.get("classification")
    participant_name = h.get("participant_name") or "the participant"
    provider = h.get("provider_name") or "their provider"
    grandfathered = h.get("is_grandfathered", False)
    lines.append(
        f"HOUSEHOLD: caring for {participant_name}, Classification {classification} "
        f"({budget_lib.CLASSIFICATIONS.get(classification, {}).get('label','')}), "
        f"provider {provider}, grandfathered={grandfathered}."
    )

    # Budget snapshot (current quarter)
    try:
        q_start, q_end, q_label = budget_lib.get_quarter_window()
        allocations = budget_lib.stream_allocations(classification)
        quarterly_total = budget_lib.quarterly_budget(classification)
        docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0, "file_b64": 0}).sort("uploaded_at", -1).to_list(50)
        all_items: list[dict] = []
        for s in docs:
            all_items.extend(s.get("line_items", []))
        burn = budget_lib.compute_burn(all_items, q_start, q_end)
        cap_amount = budget_lib.lifetime_cap(grandfathered)
        contributions_total = budget_lib.compute_contributions(all_items)
        lines.append(f"CURRENT QUARTER ({q_label}): quarterly budget ${quarterly_total:,.2f}.")
        for s in budget_lib.STREAMS:
            spent = burn.get(s, 0.0)
            cap = allocations[s]
            pct = (spent / cap * 100) if cap else 0
            lines.append(f"  - {s}: spent ${spent:,.2f} of ${cap:,.2f} ({pct:.0f}%, ${max(cap - spent,0):,.2f} remaining)")
        lifetime_pct = (contributions_total / cap_amount * 100) if cap_amount else 0
        lines.append(
            f"LIFETIME CAP: ${contributions_total:,.2f} of ${cap_amount:,.2f} contributed "
            f"({lifetime_pct:.1f}% used)."
        )
    except Exception as e:
        logger.warning("help-chat budget context failed: %s", e)

    # Statements (latest 3)
    try:
        recent = await db.statements.find(
            {"household_id": h["id"]},
            {"_id": 0, "id": 1, "filename": 1, "period_label": 1, "uploaded_at": 1, "summary": 1, "anomalies": 1, "line_items": 1},
        ).sort("uploaded_at", -1).to_list(3)
        if recent:
            lines.append(f"RECENT STATEMENTS ({len(recent)}):")
            for s in recent:
                gross = sum((li.get("total") or 0) for li in (s.get("line_items") or []))
                anomalies = s.get("anomalies") or []
                alerts = sum(1 for a in anomalies if (a.get("severity") or "").lower() == "alert")
                warns = sum(1 for a in anomalies if (a.get("severity") or "").lower() == "warning")
                infos = sum(1 for a in anomalies if (a.get("severity") or "").lower() == "info")
                lines.append(
                    f"  - {s.get('period_label') or s.get('filename')}: ${gross:,.2f} gross, "
                    f"{len(s.get('line_items') or [])} line items, "
                    f"anomalies {alerts}H/{warns}M/{infos}L."
                )
                # Top 3 anomalies for the most recent statement only
                if s is recent[0] and anomalies:
                    sorted_an = sorted(
                        anomalies,
                        key=lambda a: {"alert": 0, "warning": 1, "info": 2}.get((a.get("severity") or "").lower(), 3),
                    )
                    lines.append("    Top anomalies on the latest statement:")
                    for a in sorted_an[:3]:
                        sev = (a.get("severity") or "").upper()
                        title = a.get("title") or ""
                        detail = (a.get("detail") or "")[:200]
                        lines.append(f"      • [{sev}] {title} — {detail}")
        else:
            lines.append("STATEMENTS: none uploaded yet.")
    except Exception as e:
        logger.warning("help-chat statements context failed: %s", e)

    return "\n".join(lines)


HELP_CHAT_AUTHED_SYSTEM = (
    "You are Wayly's personal aged-care assistant for a logged-in caregiver. "
    "You combine knowledge of the Australian Support at Home program with the user's "
    "ACTUAL data (statements, budget, anomalies) which is provided below. Tone: the "
    "friendliest, most patient, most well-informed niece in Australia — calm, specific, "
    "never breathless. Australian English. Use gender-neutral language; never default to 'Mum'.\n\n"
    "REPLY STYLE\n"
    "- Lead with the answer in 1-2 sentences using their actual numbers when available.\n"
    "- Cite the source (e.g. 'on your latest statement', 'this quarter so far').\n"
    "- Keep replies under 120 words by default; up to 220 only if absolutely needed.\n"
    "- End with one soft next step (a relevant page or action: '/app/statements', "
    "'/app/audit', /settings/billing, /ai-tools/budget-calculator, etc.).\n\n"
    "GROUNDING (HARD)\n"
    "- Use ONLY the numbers from the USER CONTEXT block. NEVER invent dollar figures, "
    "dates, line items, or anomalies. If the answer isn't in the context, say so plainly "
    "('I don't see that on your latest statement — could you upload the most recent one?').\n"
    "- NEVER give clinical or financial-product advice; redirect to a GP or "
    "FAAA-registered adviser.\n"
    "- NEVER recommend a specific provider.\n"
    "- For crisis / distress mention: 1800ELDERHelp 1800 353 374, OPAN 1800 700 600, "
    "Lifeline 13 11 14, Beyond Blue 1300 22 4636.\n\n"
    "Reference info: ~20 anomaly rules cover duplicates, weekend rates, brokered-rate "
    "premiums, AT-HM commitments, pension-status contribution checks, quarterly underspend "
    "patterns, and care-plan review reminders. The 'lifetime cap' is the participant's "
    "lifetime contribution cap under Support at Home. Streams: Clinical, Independence, "
    "Everyday Living, ATHM (assistive technology / home modifications), CareMgmt.\n\n"
    "USER CONTEXT (verbatim — never invent beyond this):\n"
    "==========\n"
    "{user_context}\n"
    "=========="
)


@api.post("/help-chat")
async def authed_help_chat(body: HelpChatBody, request: Request, user_id: str = Depends(get_current_user_id)):
    """Authenticated help chat — same UX as the public bot, but with the
    user's household + statement + budget context injected so it can answer
    real questions about their data."""
    key = os.environ.get("EMERGENT_LLM_KEY", "")
    if not key:
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable", "message": "The assistant is temporarily unavailable. Try again in a moment."})
    wrapped = await run_wrapper(body.message, pii_redact=False)
    sid = body.session_id or f"app-help-{user_id}"
    if wrapped.get("abuse_flag"):
        return {
            "reply": wrapped.get("abuse_response") or "I can only help with questions about your Wayly account and Support at Home.",
            "session_id": sid,
            "abuse_flag": True,
        }

    user_context = await _build_user_context(user_id)
    page_hint = f"\n\n[The user is currently on the page: {(body.page_path or '/app')[:200]}]"
    system = HELP_CHAT_AUTHED_SYSTEM.format(user_context=user_context or "(no context available)") + page_hint

    from emergentintegrations.llm.chat import LlmChat, UserMessage
    chat = LlmChat(
        api_key=key, session_id=sid, system_message=system,
    ).with_model("anthropic", "claude-haiku-4-5-20251001").with_params(max_tokens=600)
    try:
        reply = await chat.send_message(UserMessage(text=body.message))
    except Exception as e:
        logger.warning("Authed help chat LLM call failed: %s", e)
        raise HTTPException(status_code=503, detail={"error": "llm_unavailable", "message": "I'm having trouble right now. Try again in a moment."})
    return {"reply": _humanize_assistant_reply(str(reply or "")), "session_id": sid}


# ---------------------------------------------------------------------------
# Contact / Book a demo
# ---------------------------------------------------------------------------
class ContactBody(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    role: str
    intent: str = "general"        # "general" | "demo"
    context: Optional[str] = None
    size: Optional[str] = None
    biggest_pain: Optional[str] = None
    success_in_six_months: Optional[str] = None
    preferred_time: Optional[str] = None


@api.post("/contact")
async def contact_submit(body: ContactBody):
    doc = body.model_dump()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.contact_requests.insert_one(doc)
    doc.pop("_id", None)
    # Notify the team — graceful no-op if Resend isn't configured
    try:
        await email_service.notify_team_contact(doc)
    except Exception as e:
        logger.warning("Contact notification failed: %s", e)
    return {"ok": True, "intent": body.intent}


# ---------------------------------------------------------------------------
# Email my result (public tools)
# ---------------------------------------------------------------------------
class EmailResultBody(BaseModel):
    email: EmailStr
    tool: str = Field(min_length=2, max_length=80)
    headline: str = Field(min_length=1, max_length=240)
    body_html: str = Field(min_length=1, max_length=80000)


@api.post("/public/email-result")
async def public_email_result(body: EmailResultBody, request: Request):
    _check_rate_limit(_client_ip(request))
    # Light HTML safety: forbid script/iframe tags in body_html
    cleaned = body.body_html
    for bad in ("<script", "</script>", "<iframe", "</iframe>", "javascript:"):
        cleaned = cleaned.replace(bad, "")
    res = await email_service.email_tool_result(
        to=body.email,
        tool_name=body.tool,
        headline=body.headline,
        body_html=cleaned,
    )
    # Persist for audit (24h TTL conceptually — we keep simple here)
    await db.tool_email_log.insert_one({
        "email": body.email,
        "tool": body.tool,
        "ok": bool(res.get("ok")),
        "mocked": bool(res.get("mocked")),
        "ts": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": bool(res.get("ok")), "mocked": bool(res.get("mocked"))}


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
async def create_notification(user_id: str, category: str, title: str, body: str, link: Optional[str] = None) -> None:
    """Respectful notification helper — checks user prefs before inserting."""
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "notification_prefs": 1})
    prefs = (u or {}).get("notification_prefs") or DEFAULT_NOTIFICATION_PREFS
    if not prefs.get(category, True):
        return
    await db.notifications.insert_one({
        "id": new_id(),
        "user_id": user_id,
        "category": category,
        "title": title,
        "body": body,
        "link": link,
        "read": False,
        "created_at": now_iso(),
    })


@api.get("/notifications")
async def list_notifications(user_id: str = Depends(get_current_user_id)):
    cur = db.notifications.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(30)
    items = await cur.to_list(30)
    unread = await db.notifications.count_documents({"user_id": user_id, "read": False})
    return {"items": items, "unread": unread}


class NotificationReadBody(BaseModel):
    ids: List[str] = Field(default_factory=list)


@api.post("/notifications/read")
async def mark_notifications_read(body: NotificationReadBody, user_id: str = Depends(get_current_user_id)):
    query: dict = {"user_id": user_id}
    if body.ids:
        query["id"] = {"$in": body.ids}
    res = await db.notifications.update_many(query, {"$set": {"read": True, "read_at": now_iso()}})
    return {"ok": True, "modified": res.modified_count}


class NotificationPrefsBody(BaseModel):
    prefs: dict = Field(default_factory=dict)


@api.get("/notifications/prefs")
async def get_notification_prefs(user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    prefs = u.get("notification_prefs") or DEFAULT_NOTIFICATION_PREFS
    return {"prefs": {c: bool(prefs.get(c, True)) for c in NOTIFICATION_CATEGORIES}}


@api.put("/notifications/prefs")
async def put_notification_prefs(body: NotificationPrefsBody, user_id: str = Depends(get_current_user_id)):
    clean = {c: bool(body.prefs.get(c, True)) for c in NOTIFICATION_CATEGORIES}
    await db.users.update_one({"id": user_id}, {"$set": {"notification_prefs": clean}})
    return {"ok": True, "prefs": clean}


@api.get("/notifications/stream")
async def stream_notifications(request: Request, token: Optional[str] = None):
    """Server-Sent Events stream for real-time bell updates.

    EventSource cannot send custom Authorization headers, so we accept the JWT
    via the ``?token=`` query string. The stream emits one ``notification``
    event per newly inserted row and a ``heartbeat`` every 25 seconds so
    proxies don't close the connection.
    """
    from fastapi.responses import StreamingResponse
    # Resolve user from query token or Authorization header
    auth_header = request.headers.get("authorization", "")
    jwt_str = None
    if token:
        jwt_str = token
    elif auth_header.lower().startswith("bearer "):
        jwt_str = auth_header.split(" ", 1)[1]
    if not jwt_str:
        raise HTTPException(status_code=401, detail="Missing token")
    try:
        from auth import decode_token
        user_id = decode_token(jwt_str)
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    async def event_stream():
        # Track last-seen created_at so we only send genuinely new rows.
        last_ts = datetime.now(timezone.utc).isoformat()
        # Send an initial unread count so the bell badge reconciles immediately.
        unread = await db.notifications.count_documents({"user_id": user_id, "read": False})
        yield f"event: snapshot\ndata: {json.dumps({'unread': unread})}\n\n"
        heartbeat = 0
        while True:
            if await request.is_disconnected():
                return
            try:
                cur = db.notifications.find(
                    {"user_id": user_id, "created_at": {"$gt": last_ts}},
                    {"_id": 0},
                ).sort("created_at", 1)
                docs = await cur.to_list(20)
                for doc in docs:
                    last_ts = doc.get("created_at", last_ts)
                    yield f"event: notification\ndata: {json.dumps(doc)}\n\n"
                heartbeat += 1
                if heartbeat % 25 == 0:
                    yield "event: heartbeat\ndata: {}\n\n"
            except Exception as e:
                logger.warning(f"SSE tick error: {e}")
            await asyncio.sleep(1)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ---------------------------------------------------------------------------
# Family weekly digest
# ---------------------------------------------------------------------------
@api.get("/digest/preview")
async def digest_preview(request: Request, user_id: str = Depends(get_current_user_id)):
    household = await _get_user_household(user_id)
    if not household:
        raise HTTPException(status_code=400, detail="Create a household first")
    participant = await _resolve_active_participant(user_id, request)
    return await digest_service.build_digest(db, household, participant=participant)


@api.post("/digest/send")
async def digest_send(request: Request, user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    if u.get("plan") != "family":
        raise HTTPException(status_code=402, detail={"code": "plan_required", "message": "Family plan required to send digests."})
    household = await _get_user_household(user_id)
    if not household:
        raise HTTPException(status_code=400, detail="Create a household first")
    participant = await _resolve_active_participant(user_id, request)
    recipients: List[str] = []
    owner = await _get_user(household["owner_id"])
    if (owner.get("notification_prefs") or DEFAULT_NOTIFICATION_PREFS).get("weekly_digest", True):
        recipients.append(owner["email"])
    mem_cur = db.household_members.find({"household_id": household["id"], "status": "active"}, {"_id": 0})
    async for m in mem_cur:
        member_user = await db.users.find_one({"id": m.get("user_id")}, {"_id": 0}) if m.get("user_id") else None
        if member_user:
            if (member_user.get("notification_prefs") or DEFAULT_NOTIFICATION_PREFS).get("weekly_digest", True):
                recipients.append(member_user["email"])
        elif m.get("email"):
            recipients.append(m["email"])
    seen = set()
    recipients = [r for r in recipients if not (r in seen or seen.add(r))]
    if not recipients:
        return {"ok": False, "reason": "No recipients opted in"}
    digest = await digest_service.build_digest(db, household, participant=participant)
    res = await digest_service.send_digest_to_members(db, household, recipients, digest, participant=participant)
    pname = (participant or {}).get("first_name") or household.get("participant_name") or "household"
    await _audit(household["id"], user_id, u["name"], "DIGEST_SENT", f"Sent {pname}'s digest to {len(recipients)} recipient(s)")
    try:
        await create_notification(user_id, "weekly_digest", f"Weekly digest sent — {pname}", f"Sent to {len(recipients)} people.", "/settings/digest")
    except Exception:
        pass
    return {"ok": True, "recipients": recipients, "participant_id": (participant or {}).get("id"), "summary": res.get("results")}


@api.get("/digest/history")
async def digest_history(request: Request, user_id: str = Depends(get_current_user_id)):
    household = await _get_user_household(user_id)
    if not household:
        return {"items": []}
    participant = await _resolve_active_participant(user_id, request)
    q: Dict[str, Any] = {"household_id": household["id"]}
    if participant:
        pid = participant["id"]
        if participant.get("is_primary"):
            q["$or"] = [
                {"participant_id": pid},
                {"participant_id": None},
                {"participant_id": {"$exists": False}},
            ]
        else:
            q["participant_id"] = pid
    cur = db.digest_sends.find(q, {"_id": 0}).sort("sent_at", -1).limit(12)
    items = await cur.to_list(12)
    return {"items": items}


# ---------------------------------------------------------------------------
# Usage stats
# ---------------------------------------------------------------------------
@api.get("/usage")
async def my_usage(user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    household = await _get_user_household(user_id)
    counts = {
        "chat_questions": 0, "statements_uploaded": 0, "family_messages": 0,
        "wellbeing_checkins": 0, "tool_emails_sent": 0, "digest_sends": 0,
    }
    if household:
        hid = household["id"]
        counts["chat_questions"] = await db.chat_turns.count_documents({"household_id": hid, "role": "user"})
        counts["statements_uploaded"] = await db.statements.count_documents({"household_id": hid})
        counts["family_messages"] = await db.family_messages.count_documents({"household_id": hid})
        counts["wellbeing_checkins"] = await db.wellbeing.count_documents({"household_id": hid})
        counts["digest_sends"] = await db.digest_sends.count_documents({"household_id": hid})
    counts["tool_emails_sent"] = await db.tool_email_log.count_documents({"email": u["email"], "ok": True})
    return {"plan": u.get("plan", "free"), "since": u.get("created_at"), "counts": counts}


# ---------------------------------------------------------------------------
# Danger Zone — soft-delete account
# ---------------------------------------------------------------------------
class AccountDeleteBody(BaseModel):
    confirm: str = Field(min_length=1)


@api.delete("/auth/account")
async def delete_account(body: AccountDeleteBody, user_id: str = Depends(get_current_user_id)):
    if body.confirm != "delete my account":
        raise HTTPException(status_code=400, detail="Type 'delete my account' to confirm")
    # Phase 9: full deletion cascade across every scoped collection +
    # immediate anonymisation; final hard-delete fires 60 days later.
    from privacy import soft_delete_account
    result = await soft_delete_account(user_id)
    _obs.log_account_deletion(user_id)
    return {
        "ok": True,
        "deletion_completes_at": result.get("deletion_completes_at"),
        "message": (
            "Your account has been deactivated. All your personal data will "
            "be permanently deleted from our systems in 60 days. If you change "
            "your mind, contact hello@wayly.com.au within that window."
        ),
    }


@api.get("/auth/account/export")
async def export_account_data(user_id: str = Depends(get_current_user_id)):
    """Phase 9 — Australian Privacy Act APP 12: user-initiated data export.

    Returns every piece of personal data Wayly holds about this user, across
    every collection that references their user / household / account scope.
    Sensitive fields like `password_hash`, `totp_secret`, JWT material are
    excluded — they're not "personal information" the user needs back."""
    from privacy import SCOPED_COLLECTIONS
    user = await db.users.find_one({"id": user_id}, {
        "_id": 0,
        "password_hash": 0, "totp_secret": 0, "totp_backup_codes": 0,
        "user_lockout_until": 0, "user_failed_login_count": 0,
        "token_invalid_before": 0, "token_invalid_reason": 0,
    })
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    hid = user.get("household_id")
    acct = await db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0})
    acct_id = (acct or {}).get("id")

    bundle: Dict[str, list] = {}
    bundle["user"] = [user]
    if acct:
        bundle["account"] = [acct]

    for coll, field in SCOPED_COLLECTIONS:
        if coll in ("revoked_tokens", "user_sessions", "admin_sessions", "admin_login_devices", "password_resets"):
            continue  # session/auth metadata — not personal data
        # Build the OR query
        clauses: list[dict] = []
        if field == "user_id":
            clauses.append({"user_id": user_id})
        elif field == "owner_user_id":
            clauses.append({"owner_user_id": user_id})
        elif field == "generated_by":
            clauses.append({"generated_by": user_id})
        elif field == "client_user_id":
            clauses.append({"client_user_id": user_id})
        elif field == "household_id" and hid:
            clauses.append({"household_id": hid})
        if acct_id:
            clauses.append({"account_id": acct_id})
        if not clauses:
            continue
        q = clauses[0] if len(clauses) == 1 else {"$or": clauses}
        cur = db[coll].find(q, {"_id": 0})
        rows = await cur.to_list(2000)
        # Strip raw file bytes from documents — let the user re-download
        # individual files via the existing `/documents/{id}/download`
        # endpoint if they want the binaries.
        for r in rows:
            for k in ("file_b64", "image_b64", "audio_b64"):
                if k in r:
                    r[k] = f"[redacted — re-download via /api/documents/{r.get('id', '')}/download]"
        if rows:
            bundle[coll] = rows

    return {
        "exported_at": now_iso(),
        "user_id": user_id,
        "note": "This is the complete personal data Wayly holds about you under Australian Privacy Act APP 12. File contents (PDFs, photos, audio) are referenced by ID — re-download them individually if needed.",
        "data": bundle,
    }



# ---------------------------------------------------------------------------
# Stripe billing
# ---------------------------------------------------------------------------
PLAN_PRICES = {
    "solo": {"amount": 19.00, "currency": "aud", "label": "Wayly Solo"},
    "family": {"amount": 39.00, "currency": "aud", "label": "Wayly Family"},
    "adviser": {"amount": 299.00, "currency": "aud", "label": "Wayly Adviser"},
}


class CheckoutBody(BaseModel):
    plan: _LiteralType["solo", "family", "adviser"]
    origin_url: str = Field(min_length=8, max_length=200)


class StartTrialBody(BaseModel):
    plan: _LiteralType["solo", "family", "adviser"]


async def _user_had_trial(user_id: str) -> bool:
    """Returns True if the user has previously started or completed a trial OR
    has an existing paid Stripe subscription. Free-plan users with no history
    are eligible for the 7-day trial."""
    sub = await db.subscriptions.find_one(
        {"user_id": user_id, "$or": [{"had_trial": True}, {"trial_ends_at": {"$ne": None}}]},
        {"_id": 0, "id": 1},
    )
    return bool(sub)


@api.get("/billing/trial-eligibility")
async def trial_eligibility(user_id: str = Depends(get_current_user_id)):
    """Fast lookup: is this user eligible for a free trial right now?"""
    used = await _user_had_trial(user_id)
    return {"eligible": not used, "trial_days": TRIAL_DAYS}


@api.post("/billing/start-trial")
async def start_trial(body: StartTrialBody, user_id: str = Depends(get_current_user_id)):
    """Start a 7-day free trial for the requested plan WITHOUT charging the
    user. Eligibility: the user must never have started a trial before (no
    `had_trial=True` subscription record). After the trial ends, the user
    falls back to Free unless they upgrade via /billing/checkout."""
    if body.plan not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail="Invalid plan")
    if await _user_had_trial(user_id):
        raise HTTPException(
            status_code=400,
            detail={"error": "trial_used", "message": "You've already used your free trial. Subscribe via Stripe Checkout to continue."},
        )
    now = datetime.now(timezone.utc)
    trial_ends = now + timedelta(days=TRIAL_DAYS)
    sub_doc = {
        "id": new_id(),
        "user_id": user_id,
        "plan": body.plan,
        "status": "trialing",
        "had_trial": True,
        "trial_ends_at": trial_ends.isoformat(),
        "current_period_end": trial_ends.isoformat(),
        "cancel_at_period_end": False,
        "stripe_session_id": None,
        "created_at": now.isoformat(),
        "updated_at": now.isoformat(),
    }
    await db.subscriptions.insert_one(sub_doc)
    await db.users.update_one({"id": user_id}, {"$set": {"plan": body.plan}})
    try:
        u = await _get_user(user_id)
        plan_label = PLAN_PRICES[body.plan]["label"]
        amount = PLAN_PRICES[body.plan]["amount"]
        await email_service.email_tool_result(
            to=u["email"], tool_name=f"Your {TRIAL_DAYS}-day {plan_label} trial has started",
            headline=f"Welcome to your free {plan_label} trial",
            body_html=(
                f"<p>Hi {u.get('name') or ''},</p>"
                f"<p>Your <strong>{TRIAL_DAYS}-day free trial</strong> of {plan_label} is now active. "
                f"You have full access to every feature in the {body.plan.capitalize()} plan until "
                f"<strong>{trial_ends.date().isoformat()}</strong>.</p>"
                "<p><strong>What's included:</strong></p>"
                "<ul>"
                "<li>Unlimited Statement Decoder uses (PDF, Word, photos, paste)</li>"
                "<li>All 8 AI tools — budget calculator, price checker, reassessment letter, family coordinator chat and more</li>"
                "<li>Caregiver dashboard with stream-by-stream budget burn and lifetime cap tracker</li>"
                + ("<li>Up to 5 family members + weekly Sunday digest + concierge support</li>" if body.plan == "family" else "")
                + ("<li>Multi-client portal — manage up to 25 clients, review-pack export, priority support</li>" if body.plan == "adviser" else "")
                + "</ul>"
                f"<p>No payment required during the trial. After {trial_ends.date().isoformat()}, your account "
                f"reverts to the Free plan unless you choose to subscribe at "
                f"<strong>${amount:.2f}/month</strong> from <em>Settings → Plan & Billing</em>.</p>"
                "<p><strong>Get started:</strong> upload your latest Support at Home statement at "
                "<a href='https://wayly.com.au/app/statements/upload'>app/statements/upload</a> "
                "and we'll decode it for you.</p>"
                "<p>Questions? Just reply to this email.</p>"
                "<p>— The Wayly team</p>"
            ),
        )
    except Exception as e:
        logger.warning("Trial-start email failed: %s", e)
    return {
        "ok": True,
        "plan": body.plan,
        "trial_days": TRIAL_DAYS,
        "trial_ends_at": trial_ends.isoformat(),
        "subscription_status": "trialing",
    }


@api.post("/billing/checkout")
async def billing_checkout(body: CheckoutBody, request: Request, user_id: str = Depends(get_current_user_id)):
    if body.plan not in PLAN_PRICES:
        raise HTTPException(status_code=400, detail="Invalid plan")
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    stripe = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    spec = PLAN_PRICES[body.plan]
    # Emulate a 7-day trial by charging the first month upfront but
    # recording trial_ends_at = now + 7 days. If the user cancels within the
    # window, we refund via the ops inbox.
    had_trial = await db.subscriptions.find_one({"user_id": user_id, "had_trial": True})
    trial_days = 0 if had_trial else TRIAL_DAYS
    success_url = f"{body.origin_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{body.origin_url}/pricing?cancelled=1"
    metadata = {"user_id": user_id, "plan": body.plan, "kind": "kindred_subscription", "trial_days": str(trial_days)}
    # Payment methods: "card" auto-enables Apple Pay (Safari iOS/macOS) and
    # Google Pay (Chrome/Android) wallets on Stripe-hosted Checkout. PayPal
    # must be turned on in the Stripe Dashboard (Settings → Payment methods
    # → PayPal); flip ENABLE_PAYPAL=true in backend/.env once activated.
    payment_methods = ["card"]
    if os.environ.get("ENABLE_PAYPAL", "").lower() in ("1", "true", "yes"):
        payment_methods.append("paypal")
    req = CheckoutSessionRequest(
        amount=float(spec["amount"]),
        currency=spec["currency"],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        payment_methods=payment_methods,
    )
    session = await stripe.create_checkout_session(req)
    await db.payment_transactions.insert_one({
        "session_id": session.session_id, "user_id": user_id, "plan": body.plan,
        "amount": float(spec["amount"]), "currency": spec["currency"],
        "metadata": metadata, "trial_days": trial_days,
        "payment_status": "initiated", "ts": now_iso(),
    })
    return {"url": session.url, "session_id": session.session_id, "trial_days": trial_days}


@api.get("/billing/status/{session_id}")
async def billing_status(session_id: str, user_id: str = Depends(get_current_user_id)):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    tx = await db.payment_transactions.find_one({"session_id": session_id, "user_id": user_id}, {"_id": 0})
    if not tx:
        raise HTTPException(status_code=404, detail="Session not found")
    stripe_client = StripeCheckout(api_key=api_key, webhook_url="")
    try:
        chk = await stripe_client.get_checkout_status(session_id)
    except Exception as e:
        logger.warning("Stripe status check failed for %s: %s", session_id, e)
        return {"status": "unknown", "payment_status": "unknown",
                "amount_total": None, "currency": None, "plan": tx["plan"]}
    payment_status = (chk.payment_status or "").lower()
    if payment_status == "paid" and tx["payment_status"] != "paid":
        plan = tx["plan"]
        trial_days = int(tx.get("trial_days", 0))
        now = datetime.now(timezone.utc)
        trial_ends_at = (now + timedelta(days=trial_days)).isoformat() if trial_days else None
        period_end = (now + timedelta(days=30)).isoformat()
        await db.users.update_one({"id": user_id}, {"$set": {"plan": plan, "plan_period_end": period_end}})
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "paid", "paid_at": now_iso()}},
        )
        await db.subscriptions.update_one(
            {"user_id": user_id},
            {"$set": {
                "user_id": user_id, "plan": plan,
                "status": "trialing" if trial_days else "active",
                "had_trial": bool(trial_days),
                "trial_ends_at": trial_ends_at,
                "current_period_end": period_end,
                "updated_at": now_iso(),
                "cancel_at_period_end": False,
            }},
            upsert=True,
        )
        try:
            u = await _get_user(user_id)
            await email_service.email_tool_result(
                to=u["email"],
                tool_name=f"Welcome to {plan.capitalize()}",
                headline=f"You're on Wayly {plan.capitalize()}.",
                body_html=(f"<p>Thanks {u['name'].split(' ')[0]}. "
                           + (f"Your {TRIAL_DAYS}-day refund window starts today." if trial_days else "Payment received — thanks for renewing.")
                           + "</p><p>Next step: complete onboarding to set up your household.</p>"),
            )
        except Exception as e:
            logger.warning("Welcome email failed: %s", e)
    elif chk.status == "expired":
        await db.payment_transactions.update_one(
            {"session_id": session_id},
            {"$set": {"payment_status": "expired"}},
        )
    return {
        "status": chk.status, "payment_status": chk.payment_status,
        "amount_total": chk.amount_total, "currency": chk.currency,
        "plan": tx["plan"], "trial_days": tx.get("trial_days", 0),
    }


@api.get("/billing/subscription")
async def my_subscription(user_id: str = Depends(get_current_user_id)):
    sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0}, sort=[("updated_at", -1)])
    if not sub:
        return {"plan": "free", "status": "none"}
    return sub


@api.post("/billing/cancel")
async def cancel_subscription(user_id: str = Depends(get_current_user_id)):
    sub = await db.subscriptions.find_one({"user_id": user_id, "status": {"$in": ["trialing", "active"]}}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=404, detail="No active plan to cancel")
    await db.subscriptions.update_one(
        {"user_id": user_id},
        {"$set": {"cancel_at_period_end": True, "updated_at": now_iso()}},
    )
    # Plan continues until current_period_end; we don't flip plan here.
    try:
        u = await _get_user(user_id)
        await email_service.email_tool_result(
            to=u["email"], tool_name="Cancellation confirmed",
            headline="Your Wayly plan is cancelled",
            body_html=f"<p>We've cancelled auto-renewal. Your {sub.get('plan','').capitalize()} plan stays active until {sub.get('current_period_end','').split('T')[0] or 'the end of your current period'}. Contact us any time to reactivate.</p>",
        )
    except Exception:
        pass
    return {"ok": True, "cancel_at_period_end": True}


@api.post("/billing/downgrade-to-free")
async def downgrade_to_free(user_id: str = Depends(get_current_user_id)):
    """Immediate downgrade to the Free plan. Marks subscription as canceled
    right now (no end-of-period grace) and flips user.plan to 'free' so the
    UI updates the moment the user reloads or refreshUser() runs."""
    u = await _get_user(user_id)
    prev_plan = u.get("plan") or "free"
    if prev_plan == "free":
        return {"ok": True, "unchanged": True, "plan": "free"}
    sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0}, sort=[("updated_at", -1)])
    now = now_iso()
    if sub:
        await db.subscriptions.update_one(
            {"user_id": user_id, "id": sub.get("id")} if sub.get("id") else {"user_id": user_id},
            {"$set": {"status": "canceled", "cancel_at_period_end": True, "canceled_at": now, "updated_at": now}},
        )
    await db.users.update_one({"id": user_id}, {"$set": {"plan": "free"}})
    try:
        await email_service.email_tool_result(
            to=u["email"], tool_name="Plan changed to Free",
            headline="You're now on the Free plan",
            body_html=(
                f"<p>Hi {u.get('name') or ''},</p>"
                f"<p>You've been downgraded from <strong>{prev_plan.capitalize()}</strong> to the <strong>Free</strong> plan, effective immediately.</p>"
                "<p><strong>What changes:</strong> the Statement Decoder remains free with one use per day. The other 7 AI tools, family members, weekly digest, and concierge support are no longer available on your account.</p>"
                "<p>You can re-subscribe any time from <em>Settings → Plan & Billing</em>. Any household data, statements, and audit log entries you've already saved are kept and become available again as soon as you upgrade.</p>"
                "<p>— The Wayly team</p>"
            ),
        )
    except Exception as e:
        logger.warning("Plan-change email failed: %s", e)
    return {"ok": True, "plan": "free", "previous_plan": prev_plan}


class UpgradeBody(BaseModel):
    plan: _LiteralType["solo", "family", "adviser"]


@api.post("/billing/upgrade")
async def upgrade_downgrade(body: UpgradeBody, user_id: str = Depends(get_current_user_id)):
    sub = await db.subscriptions.find_one({"user_id": user_id, "status": {"$in": ["trialing", "active"]}}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=400, detail="No active plan — start one from /pricing")
    if sub.get("plan") == body.plan:
        return {"ok": True, "unchanged": True}
    prev_plan = sub.get("plan") or "free"
    # Defense in depth: block Family→Solo when account has >1 active participant.
    if prev_plan == "family" and body.plan == "solo":
        acct = await db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
        if acct:
            active_count = await db.participants.count_documents({"account_id": acct["id"], "status": "ACTIVE"})
            if active_count > 1:
                raise HTTPException(status_code=409, detail={
                    "code": "remove_participants_first",
                    "message": f"Solo includes 1 participant. You currently have {active_count}. Remove the extras (or downgrade add-ons) before switching to Solo.",
                    "active_participants": active_count,
                })
    # Simple swap; bill difference on next cycle.
    await db.subscriptions.update_one({"user_id": user_id}, {"$set": {"plan": body.plan, "updated_at": now_iso()}})
    await db.users.update_one({"id": user_id}, {"$set": {"plan": body.plan}})
    try:
        u = await _get_user(user_id)
        direction = "upgraded" if (prev_plan == "solo" and body.plan == "family") else "switched"
        await email_service.email_tool_result(
            to=u["email"], tool_name=f"Plan {direction} to {body.plan.capitalize()}",
            headline=f"Your plan is now {body.plan.capitalize()}",
            body_html=(
                f"<p>Hi {u.get('name') or ''},</p>"
                f"<p>You've {direction} from <strong>{prev_plan.capitalize()}</strong> to <strong>{body.plan.capitalize()}</strong>, effective immediately.</p>"
                + (
                    "<p>The Family plan unlocks up to 5 household members, the weekly digest, and concierge support. Add family from <em>Settings → Family members</em>.</p>"
                    if body.plan == "family"
                    else "<p>The Solo plan keeps your full Statement Decoder, AI tools, and dashboard active for one caregiver.</p>"
                )
                + "<p>The price difference is reflected on your next billing cycle. Manage your plan any time at <em>Settings → Plan & Billing</em>.</p>"
                "<p>— The Wayly team</p>"
            ),
        )
    except Exception as e:
        logger.warning("Plan-change email failed: %s", e)
    return {"ok": True, "plan": body.plan, "previous_plan": prev_plan}


@api.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Phase 6 hardened Stripe webhook:
      • Verifies the Stripe-Signature header. Unsigned / mis-signed → 400.
      • Idempotent on `event.id` via Redis (24h hot path) + Mongo (durable
        history). A replayed event is a no-op (returns `{ok:true,deduped:true}`).
      • Every event is persisted into `stripe_webhook_events` for audit /
        admin visibility / DLQ.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"ok": False, "error": "stripe_disabled"}

    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    received_at = datetime.now(timezone.utc).isoformat()

    # 1. Signature verification — reject anything we can't authenticate.
    if not sig:
        try:
            await db.stripe_webhook_events.insert_one({
                "received_at": received_at, "result": "rejected_no_signature",
                "raw_len": len(body or b""),
            })
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Missing Stripe-Signature header")

    try:
        webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
        stripe = StripeCheckout(api_key=api_key, webhook_secret=webhook_secret, webhook_url="")
        ev = await stripe.handle_webhook(body, sig)
    except Exception as e:
        # `handle_webhook` raises on bad signatures.
        logger.warning("Stripe webhook signature verification failed: %s", e)
        try:
            await db.stripe_webhook_events.insert_one({
                "received_at": received_at, "result": "rejected_bad_signature",
                "raw_len": len(body or b""), "error": str(e)[:200],
            })
        except Exception:
            pass
        raise HTTPException(status_code=400, detail="Invalid Stripe signature")

    # Some emergentintegrations builds expose event.id; fall back to a hash
    # of the body so we still dedupe replays even if the field is missing.
    event_id = getattr(ev, "event_id", None) or getattr(ev, "id", None)
    if not event_id:
        import hashlib as _hash
        event_id = "sha256:" + _hash.sha256(body).hexdigest()[:32]

    # 2. Idempotency — Redis SET NX EX 24h (hot path) + Mongo (durable).
    redis_marked = False
    try:
        import redis.asyncio as _redis_async
        _r = _redis_async.from_url(os.environ["REDIS_URL"])
        # `set(..., nx=True)` returns True only the first time.
        redis_marked = bool(await _r.set(f"stripe:evt:{event_id}", "1", nx=True, ex=86400))
        try:
            await _r.aclose()
        except Exception:
            pass
    except Exception as e:
        logger.warning("Redis idempotency check failed (continuing): %s", e)

    # Mongo dedupe — if we've already processed this event_id with result=processed,
    # this is a no-op (defence even if Redis was unavailable).
    existing = await db.stripe_webhook_events.find_one(
        {"event_id": event_id, "result": "processed"},
        {"_id": 0, "event_id": 1, "processed_at": 1},
    )
    if existing or not redis_marked:
        try:
            await db.stripe_webhook_events.insert_one({
                "event_id": event_id, "received_at": received_at,
                "event_type": ev.event_type, "result": "deduped",
                "previously_processed_at": (existing or {}).get("processed_at"),
            })
        except Exception:
            pass
        return {"ok": True, "deduped": True}

    # 3. Process the event (legacy logic preserved, wrapped with timing + status capture).
    import time as _time
    _t0 = _time.time()
    handler_result = "no_op"
    handler_error: Optional[str] = None
    try:
        if (ev.payment_status or "").lower() == "paid" and ev.session_id:
            tx = await db.payment_transactions.find_one({"session_id": ev.session_id})
            if tx and tx.get("payment_status") != "paid":
                tx_kind = (tx.get("kind") or "")
                md = tx.get("metadata") or {}
                if tx_kind in ("plan_upgrade", "participant_addon"):
                    from batch3_billing import handle_batch3_paid_event
                    try:
                        await handle_batch3_paid_event(md, ev.session_id)
                        handler_result = f"paid:{tx_kind}"
                    except Exception as e:
                        logger.warning("Batch3 paid-event handler failed: %s", e)
                        handler_result = "paid_handler_error"
                        handler_error = str(e)[:300]
                else:
                    await db.users.update_one({"id": tx["user_id"]}, {"$set": {"plan": tx["plan"]}})
                    handler_result = "paid:legacy_plan"
                await db.payment_transactions.update_one(
                    {"session_id": ev.session_id},
                    {"$set": {"payment_status": "paid", "paid_at": now_iso(), "webhook_event": ev.event_type}},
                )
        # Mobile push trigger — failed payment
        if (ev.payment_status or "").lower() in ("failed", "unpaid", "requires_payment_method") and ev.session_id:
            tx = await db.payment_transactions.find_one({"session_id": ev.session_id}) or {}
            try:
                import asyncio as _asyncio
                import push_service as _push
                user = await db.users.find_one({"id": tx.get("user_id")}, {"_id": 0, "email": 1}) or {}
                _asyncio.create_task(_push.notify_role(
                    "payment_failed",
                    title="💳 Payment failed",
                    body=f"{user.get('email') or 'A customer'} — ${tx.get('amount', '')} {tx.get('currency', 'AUD').upper()}",
                    data={"type": "payment_failed", "session_id": ev.session_id, "user_id": tx.get("user_id")},
                ))
                handler_result = "failed_push"
            except Exception:
                pass
    except Exception as e:
        logger.exception("Stripe webhook handler exception")
        handler_result = "handler_exception"
        handler_error = str(e)[:300]

    # 4. Persist the durable history row.
    try:
        await db.stripe_webhook_events.insert_one({
            "event_id": event_id,
            "received_at": received_at,
            "processed_at": datetime.now(timezone.utc).isoformat(),
            "event_type": ev.event_type,
            "payment_status": (ev.payment_status or None),
            "session_id": getattr(ev, "session_id", None),
            "result": "processed",
            "handler_result": handler_result,
            "handler_error": handler_error,
            "duration_ms": int((_time.time() - _t0) * 1000),
        })
    except Exception:
        pass

    return {"ok": True, "event_id": event_id, "result": handler_result}


from admin_routes import admin as admin_router
from admin_auth import router as admin_auth_router
from admin_phase_d import phase_d_admin, phase_d_user
from admin_phase_e import phase_e, phase_e_public, phase_e_invite_public
from admin_phase_e2 import cms_admin, cms_public
from admin_devices import devices_router as admin_devices_router
from seo_routes import seo_public as seo_public_router
from adviser_routes import adviser_router, adviser_public_router, init_adviser_routes
from documents_routes import documents_router, init_documents_routes
from extended_routes import extended_router, init_extended_routes
from batch2_routes import batch2_router, init_batch2_routes, migrate_existing_households
from batch3_routes import (
    batch3_router, init_batch3_routes, migrate_batch3, run_purge_job,
    check_free_tool_usage, record_free_tool_usage,
)
from batch3_billing import billing_router as batch3_billing_router, init_billing_routes
init_adviser_routes(
    db=db,
    require_adviser_dep=require_plan("adviser", feature_label="The Adviser portal"),
    max_clients_for=lambda plan: ADVISER_MAX_CLIENTS.get((plan or "").lower(), 0),
)


async def _docvault_decode_statement(
    *, household_id: str, owner_user_id: str, file_bytes: bytes,
    filename: str, mimetype: str, source_document_id: str,
):
    """Bridge: when a vault doc with category='statement' is sent to the
    decoder, run the same pipeline /api/statements/upload uses and return
    the resulting job_id. The frontend polls /api/statements/upload-job/{id}
    just like the normal upload path."""
    import base64 as _b64
    from document_extract import (
        extract_document, UnsupportedFormatError, FileTooLargeError,
        CorruptFileError, PasswordProtectedError,
    )
    try:
        text, _input_method, _page_count, _warnings = await extract_document(filename or "", file_bytes)
    except UnsupportedFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileTooLargeError as e:
        mb = e.limit_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"This {e.ext} file exceeds the {mb} MB limit.")
    except PasswordProtectedError:
        raise HTTPException(status_code=400, detail="This PDF is password-protected.")
    except CorruptFileError as e:
        raise HTTPException(status_code=400, detail=f"File appears damaged: {e}")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file.")
    owner = await _get_user(owner_user_id)
    file_b64 = _b64.b64encode(file_bytes).decode("ascii")
    job_id = _submit_upload_job(
        text, filename, household_id, owner_user_id, owner["name"],
        file_b64=file_b64, file_mimetype=mimetype, file_size=len(file_bytes),
    )
    return {"job_id": job_id, "status": "pending", "source_document_id": source_document_id}


init_documents_routes(
    db=db,
    user_dep=_user_from_request_required,
    decode_statement=_docvault_decode_statement,
)
init_extended_routes(db=db, user_dep=_user_from_request_required)
init_batch2_routes(
    db=db,
    user_dep=_user_from_request_required,
    adviser_dep=require_plan("adviser", feature_label="The Adviser portal"),
    audit_log=_audit,
)
init_batch3_routes(db=db, user_dep=_user_from_request_required)
init_billing_routes(db=db, user_dep=_user_from_request_required)
api.include_router(admin_auth_router)
api.include_router(admin_router)
api.include_router(phase_d_admin)
api.include_router(phase_d_user)
api.include_router(phase_e)
api.include_router(phase_e_public)
api.include_router(phase_e_invite_public)
api.include_router(cms_admin)
api.include_router(cms_public)
api.include_router(admin_devices_router)
api.include_router(seo_public_router)
api.include_router(adviser_router)
api.include_router(adviser_public_router)
api.include_router(documents_router)
api.include_router(extended_router)
api.include_router(batch2_router)
api.include_router(batch3_router)
api.include_router(batch3_billing_router)

# Reports — 8 PDF reports + in-app preview
try:
    from reports_routes import router as reports_router
    api.include_router(reports_router)
except Exception as _e:
    import logging as _logging
    _logging.getLogger("wayly").warning(f"reports_routes failed to load: {_e}")

# Smoke-test status — wires the GH Actions smoke runner into /api/admin/smoke-status.
try:
    from smoke_status import attach_router as _attach_smoke
    _attach_smoke(api, db, get_current_admin_id)
except Exception as _e:
    import logging as _logging
    _logging.getLogger("wayly").warning(f"smoke_status failed to load: {_e}")


# Program reference — Phase 1 scenario engine. Public snapshot for the
# front-end loader + admin mutation + history audit.
try:
    import program_reference as _pr_mod

    @api.get("/program-reference/public", tags=["reference"])
    async def _program_reference_public():
        """Public-safe snapshot of current Support at Home figures. Used by
        the front-end (Onboarding, Budget Calculator, Demo hero) so any
        indexation update propagates without redeploy. No participant or
        billing data here."""
        try:
            return _pr_mod.public_snapshot()
        except Exception as e:
            logger.warning("program_reference public snapshot failed: %s", e)
            raise HTTPException(503, "Reference data temporarily unavailable")

    @api.get("/admin/program-reference", tags=["admin"])
    async def _program_reference_admin_list(
        key: Optional[str] = None,
        _admin_id: str = Depends(get_current_admin_id),
    ):
        """Admin-only — list all rows for one key (or all keys when no key is
        passed) so the on-call can verify which figures are in force."""
        if key:
            rows = []
            for eff_from, eff_to, value, row_id in (_pr_mod._CACHE.get(key) or []):
                rows.append({"key": key, "value": value,
                             "effective_from": eff_from,
                             "effective_to": eff_to, "row_id": row_id})
            return {"key": key, "rows": rows}
        # All keys: return current-effective row for each
        from datetime import datetime as _dt, timezone as _tz
        today = _dt.now(_tz.utc).date().isoformat()
        out = {}
        for k, rows in _pr_mod._CACHE.items():
            for eff_from, eff_to, value, row_id in rows:
                if eff_from <= today and (eff_to is None or today < eff_to):
                    out[k] = {"value": value, "effective_from": eff_from,
                              "effective_to": eff_to, "row_id": row_id}
                    break
        return {"as_of": today, "current": out}

    class _ProgramReferenceSet(BaseModel):
        key: str
        value: Any
        effective_from: str  # YYYY-MM-DD
        source_url: Optional[str] = None
        notes: Optional[str] = None

    @api.post("/admin/program-reference", tags=["admin"])
    async def _program_reference_admin_set(
        body: _ProgramReferenceSet,
        admin_id: str = Depends(get_current_admin_id),
    ):
        """Admin-only — insert a new effective row, closes the previous one.
        Refreshes the cache on success. Use this on indexation events."""
        row = await _pr_mod.set_value(
            body.key, body.value, body.effective_from,
            source_url=body.source_url, notes=body.notes, created_by=admin_id,
        )
        return {"ok": True, "row": row}

    @api.get("/admin/program-reference/history", tags=["admin"])
    async def _program_reference_admin_history(
        key: Optional[str] = None,
        _admin_id: str = Depends(get_current_admin_id),
    ):
        """Admin-only — full insert/close history for one key or all."""
        return {"items": await _pr_mod.list_history(key)}
except Exception as _e:
    import logging as _logging
    _logging.getLogger("wayly").warning(f"program_reference routes failed to load: {_e}")


# Scenario engine — Phase 2: lifecycle state machine + parallel flags + audit.
# These are caregiver-facing endpoints, gated by ``assert_participant_access``.
try:
    from scenario_engine import lifecycle as _se_lifecycle
    from scenario_engine import flags as _se_flags
    from security_utils import assert_participant_access as _assert_pa  # type: ignore

    @api.get("/scenario/participants/{participant_id}/state", tags=["scenario"])
    async def _scenario_state(
        participant_id: str,
        user_id: str = Depends(get_current_user_id),
    ):
        """Return current lifecycle_state + visible flags for the participant.
        Restricted flags (e.g. SAFEGUARDING_ALERT) are stripped for non-owner
        readers."""
        await _assert_pa(user_id, participant_id, require_active=False)
        p = await db.participants.find_one({"id": participant_id},
                                            {"_id": 0, "lifecycle_state": 1,
                                             "flags": 1, "account_id": 1,
                                             "lifecycle_state_updated_at": 1})
        if p is None:
            raise HTTPException(404, "participant not found")
        flags = await _se_flags.get_flags(db, participant_id,
                                          requesting_user_id=user_id,
                                          account_id=p.get("account_id"))
        return {
            "participant_id": participant_id,
            "lifecycle_state": p.get("lifecycle_state"),
            "lifecycle_state_updated_at": p.get("lifecycle_state_updated_at"),
            "flags": flags,
        }

    class _LifecycleTransitionBody(BaseModel):
        to_state: str
        reason: Optional[str] = None
        source: Optional[Dict[str, Any]] = None

    @api.post("/scenario/participants/{participant_id}/lifecycle-transition", tags=["scenario"])
    async def _scenario_lifecycle_transition(
        participant_id: str,
        body: _LifecycleTransitionBody,
        user_id: str = Depends(get_current_user_id),
    ):
        """Apply a lifecycle transition. Validates against the transition map
        and writes an audited row. Rejected attempts also write an audit
        row (kind=lifecycle_transition_rejected) so abuse is visible."""
        await _assert_pa(user_id, participant_id, require_active=False)
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
        try:
            res = await _se_lifecycle.apply_transition(
                db, participant_id=participant_id, account_id=None,
                to_state=body.to_state, actor_id=user_id,
                actor_name=(u or {}).get("name"),
                reason=body.reason, source=body.source,
            )
            return {"ok": True, **res}
        except _se_lifecycle.TransitionRejected as e:
            raise HTTPException(409, str(e))

    class _FlagBody(BaseModel):
        flag: str
        value: bool
        payload: Optional[Dict[str, Any]] = None
        reason: Optional[str] = None
        source: Optional[Dict[str, Any]] = None

    @api.post("/scenario/participants/{participant_id}/flags", tags=["scenario"])
    async def _scenario_set_flag(
        participant_id: str,
        body: _FlagBody,
        user_id: str = Depends(get_current_user_id),
    ):
        """Set or clear a parallel flag. SAFEGUARDING_ALERT may only be set by
        account owners — non-owners get 403."""
        await _assert_pa(user_id, participant_id, require_active=False)
        p = await db.participants.find_one({"id": participant_id},
                                            {"_id": 0, "account_id": 1})
        if p is None:
            raise HTTPException(404, "participant not found")
        if body.flag in _se_flags.RESTRICTED_VISIBILITY:
            is_owner = await _se_flags.is_account_owner(
                db, user_id=user_id, account_id=p.get("account_id"))
            if not is_owner:
                raise HTTPException(403, "Only account owners can set this flag")
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
        try:
            res = await _se_flags.set_flag(
                db, participant_id=participant_id, account_id=p.get("account_id"),
                flag=body.flag, value=body.value, payload=body.payload,
                actor_id=user_id, actor_name=(u or {}).get("name"),
                reason=body.reason, source=body.source,
            )
            return {"ok": True, **res}
        except _se_flags.FlagRejected as e:
            raise HTTPException(400, str(e))

    @api.get("/scenario/participants/{participant_id}/state-audit", tags=["scenario"])
    async def _scenario_state_audit(
        participant_id: str,
        limit: int = 50,
        user_id: str = Depends(get_current_user_id),
    ):
        """Return the participant's state-change history. Restricted flag
        changes are stripped for non-owner readers."""
        await _assert_pa(user_id, participant_id, require_active=False)
        rows = await _se_lifecycle.get_state_audit(db, participant_id, limit=limit)
        p = await db.participants.find_one({"id": participant_id},
                                            {"_id": 0, "account_id": 1})
        is_owner = await _se_flags.is_account_owner(
            db, user_id=user_id, account_id=(p or {}).get("account_id"))
        if not is_owner:
            visible: List[Dict[str, Any]] = []
            for r in rows:
                if r.get("kind") == "flag_change":
                    tv = r.get("to_value") or {}
                    fv = r.get("from_value") or {}
                    if any(k in _se_flags.RESTRICTED_VISIBILITY for k in
                           list(tv.keys()) + list(fv.keys())):
                        continue
                visible.append(r)
            rows = visible
        return {"participant_id": participant_id, "items": rows}

    @api.get("/scenario/lifecycle-map", tags=["scenario"])
    async def _scenario_lifecycle_map():
        """Public read-only map of states and their allowed transitions. Used
        by the timeline UI to render the 'what can happen next' picker."""
        return {
            "states": _se_lifecycle.LIFECYCLE_STATES,
            "terminal": list(_se_lifecycle.TERMINAL_STATES),
            "initial": list(_se_lifecycle.INITIAL_STATES),
            "transitions": {k: sorted(v) for k, v in
                            _se_lifecycle.ALLOWED_TRANSITIONS.items()},
            "flag_groups": _se_flags.FLAG_GROUPS,
            "restricted_flags": list(_se_flags.RESTRICTED_VISIBILITY),
            "payload_keys": _se_flags.FLAG_PAYLOAD_KEYS,
        }

    # ---- Phase 3: event capture --------------------------------------------
    from scenario_engine import events as _se_events

    @api.get("/scenario/event-types", tags=["scenario"])
    async def _scenario_event_types():
        """Public event taxonomy — used by the caregiver capture UI."""
        return _se_events.taxonomy()

    class _EventCaptureBody(BaseModel):
        event_type: str
        sub_type: Optional[str] = None
        effective_date: str  # YYYY-MM-DD
        trigger_source: str = "caregiver"
        note: Optional[str] = None
        payload: Optional[Dict[str, Any]] = None
        source: Optional[Dict[str, Any]] = None
        apply_transitions: bool = True

    @api.post("/scenario/participants/{participant_id}/events", tags=["scenario"])
    async def _scenario_capture_event(
        participant_id: str,
        body: _EventCaptureBody,
        user_id: str = Depends(get_current_user_id),
    ):
        """Log an event for a participant. Applies the proposed lifecycle
        transition and flag changes through the Phase 2 guard. If the
        proposed transition is blocked, the event is still persisted with
        ``proposed.transition_status='blocked'`` so the caregiver can confirm
        a different action — never fails silently."""
        await _assert_pa(user_id, participant_id, require_active=False)
        p = await db.participants.find_one({"id": participant_id},
                                            {"_id": 0, "account_id": 1})
        if p is None:
            raise HTTPException(404, "participant not found")
        u = await db.users.find_one({"id": user_id}, {"_id": 0, "name": 1})
        try:
            ev = await _se_events.capture_event(
                db, participant_id=participant_id,
                account_id=p.get("account_id"),
                event_type=body.event_type, sub_type=body.sub_type,
                trigger_source=body.trigger_source,
                effective_date=body.effective_date,
                note=body.note, payload=body.payload,
                source=body.source,
                actor_id=user_id, actor_name=(u or {}).get("name"),
                apply_transitions=body.apply_transitions,
            )
            return {"ok": True, "event": ev}
        except _se_events.EventRejected as e:
            raise HTTPException(400, str(e))

    @api.get("/scenario/participants/{participant_id}/events", tags=["scenario"])
    async def _scenario_list_events(
        participant_id: str,
        limit: int = 100,
        cursor_date: Optional[str] = None,
        user_id: str = Depends(get_current_user_id),
    ):
        await _assert_pa(user_id, participant_id, require_active=False)
        items = await _se_events.list_events(db, participant_id,
                                              limit=limit, cursor_date=cursor_date)
        return {"participant_id": participant_id, "items": items}

    # ---- Phase 4: alerts ---------------------------------------------------
    from scenario_engine import alerts as _se_alerts

    @api.get("/scenario/participants/{participant_id}/alerts", tags=["scenario"])
    async def _scenario_list_alerts(
        participant_id: str, status: Optional[str] = None, limit: int = 100,
        user_id: str = Depends(get_current_user_id),
    ):
        await _assert_pa(user_id, participant_id, require_active=False)
        items = await _se_alerts.list_alerts(db, participant_id, status=status, limit=limit)
        return {"participant_id": participant_id, "items": items}

    class _AlertStatusBody(BaseModel):
        status: str  # acknowledged | resolved | dismissed | open

    @api.post("/scenario/alerts/{alert_id}/status", tags=["scenario"])
    async def _scenario_update_alert_status(
        alert_id: str, body: _AlertStatusBody,
        user_id: str = Depends(get_current_user_id),
    ):
        a = await db.scenario_alerts.find_one({"id": alert_id},
                                                {"_id": 0, "participant_id": 1})
        if not a:
            raise HTTPException(404, "alert not found")
        await _assert_pa(user_id, a["participant_id"], require_active=False)
        ok = await _se_alerts.update_status(db, alert_id=alert_id,
                                              new_status=body.status, actor_id=user_id)
        return {"ok": ok}

    @api.post("/admin/scenario/evaluate-clocks", tags=["admin"])
    async def _scenario_evaluate_clocks_now(
        _admin_id: str = Depends(get_current_admin_id),
    ):
        """Admin trigger to run the deadline clocks immediately."""
        counts = await _se_alerts.evaluate_all_clocks(db)
        return {"ok": True, "counts": counts}

    # ---- Phase 5: route-out guardrails ------------------------------------
    from scenario_engine import boundaries as _se_bound

    @api.get("/scenario/contacts", tags=["scenario"])
    async def _scenario_contacts():
        """Public list of canonical contacts used by route-out and escalate
        alerts. Surfaced on the timeline and on any blocked AI response."""
        return {"contacts": _se_bound.CONTACTS}

    @api.get("/scenario/participants/{participant_id}/timeline", tags=["scenario"])
    async def _scenario_timeline(
        participant_id: str, limit: int = 200,
        user_id: str = Depends(get_current_user_id),
    ):
        """Single chronological stream that merges events, lifecycle
        transitions, and alerts. Restricted (safeguarding) items are stripped
        for non-owner readers."""
        await _assert_pa(user_id, participant_id, require_active=False)
        p = await db.participants.find_one({"id": participant_id},
                                            {"_id": 0, "account_id": 1, "first_name": 1,
                                             "lifecycle_state": 1, "flags": 1})
        if p is None:
            raise HTTPException(404, "participant not found")
        is_owner = await _se_flags.is_account_owner(
            db, user_id=user_id, account_id=p.get("account_id"))

        events = await _se_events.list_events(db, participant_id, limit=limit)
        audit = await _se_lifecycle.get_state_audit(db, participant_id, limit=limit)
        alerts = await _se_alerts.list_alerts(db, participant_id, limit=limit)

        items = []
        for ev in events:
            items.append({
                "type": "event", "at": ev.get("captured_date") or ev.get("created_at"),
                "data": ev,
            })
        for a in audit:
            # Drop restricted-flag changes for non-owners.
            if not is_owner and a.get("kind") == "flag_change":
                fv = list((a.get("from_value") or {}).keys())
                tv = list((a.get("to_value") or {}).keys())
                if any(k in _se_flags.RESTRICTED_VISIBILITY for k in fv + tv):
                    continue
            items.append({"type": "state", "at": a["created_at"], "data": a})
        for al in alerts:
            items.append({"type": "alert", "at": al["created_at"], "data": al})
        items.sort(key=lambda x: x["at"] or "", reverse=True)
        return {
            "participant_id": participant_id,
            "lifecycle_state": p.get("lifecycle_state"),
            "first_name": p.get("first_name"),
            "items": items[:limit],
        }

    @api.post("/scenario/boundary-probe", tags=["scenario"])
    async def _scenario_boundary_probe(body: dict,
                                         _user_id: str = Depends(get_current_user_id)):
        """Inspect a free-text question without consulting any LLM. Returns
        the boundary classification + the contacts the response would route
        to. Used by the UI to preview before sending to Ask Wayly."""
        q = (body or {}).get("query", "") if isinstance(body, dict) else ""
        boundary, contacts, topic = _se_bound.classify_boundary_for_query(q)
        return {"boundary": boundary, "topic": topic, "contacts": contacts}

    # ---- Phase 6: guided caregiver workflows ------------------------------
    from scenario_engine import workflows as _se_workflows

    @api.get("/scenario/workflows", tags=["scenario"])
    async def _scenario_list_workflows():
        """Public catalogue of guided wizards (reassessment, hospitalisation,
        death). The wizard UI renders each step inline and uses the existing
        POST /scenario/participants/{id}/events endpoint to capture each
        event_type — no separate mutation surface."""
        return _se_workflows.list_workflows()

    @api.get("/scenario/workflows/{workflow_key}", tags=["scenario"])
    async def _scenario_get_workflow(workflow_key: str,
                                       _user_id: str = Depends(get_current_user_id)):
        w = _se_workflows.get_workflow(workflow_key)
        if not w:
            raise HTTPException(404, "unknown workflow")
        return w

    # ---- Phase 7: shared types contract for the mobile app ----------------
    from scenario_engine import schema_export as _se_schema

    @api.get("/scenario/schema", tags=["scenario"])
    async def _scenario_schema():
        """Single source-of-truth contract for the scenario engine.

        Public — the schema is non-sensitive and identical for every
        participant. Mobile clients pin a minimum ``schema_version`` and
        compare ``section_revisions`` to skip downloading unchanged sections.
        """
        return _se_schema.build_schema()
except Exception as _e:
    import logging as _logging
    _logging.getLogger("wayly").warning(f"scenario_engine routes failed to load: {_e}")

app.include_router(api)

# Phase 5 — install the security-headers middleware AFTER CORS so the headers
# attach to every response (including preflight 204s).
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)
import security_headers as _security_headers
_security_headers.install(app)

# Phase-monitoring-1+2: Sentry + structured JSON logging + request IDs
import observability as _observability
_observability.install(app)

# Phase 8 — admin gate + IP allowlist + maintenance mode
# (maintenance toggle endpoints already exist in admin_phase_e.py;
# audit-chain verify is a fresh add)
import admin_hardening as _admin_hardening
_admin_hardening.install(app)


@api.get("/admin/audit-log/verify")
async def admin_verify_audit_chain(user_id: str = Depends(get_current_admin_id)):
    ok, broken_at = await _admin_hardening.verify_chain()
    await _admin_hardening.append_audit(
        actor_id=user_id, action="audit_chain_verify",
        result="success" if ok else "tampered",
        detail={"broken_at_seq": broken_at} if not ok else {},
    )
    return {"ok": ok, "broken_at_seq": broken_at}


# ---------------------------------------------------------------------------
# Phase 4 — Security Alerts admin API
# Endpoints live in `admin_routes.py` (real admin-realm gate via
# `get_current_admin`, which the AdminApp UI uses). Defined there so the
# legacy `/api/admin/security-alerts/*` paths from this file are unused.
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Trial lifecycle scheduler — sends T-1 reminder + auto-downgrades on expiry.
# Runs every 30 minutes. Idempotent via subscription doc flags.
# ---------------------------------------------------------------------------
import asyncio as _asyncio


async def _process_trial_reminders_once() -> dict:
    """Idempotent pass over trialing subscriptions:
       - day-4 (~3 days remaining): send mid-trial nudge with usage stats.
       - 24h-from-end: send reminder email, mark `trial_reminder_sent_at`.
       - past-end: flip user.plan to 'free', mark sub status 'expired', send
         expiry email, mark `trial_expired_handled_at`.
    Returns {midtrial_sent, reminders_sent, expired_handled}."""
    now = datetime.now(timezone.utc)
    in_24h = now + timedelta(hours=24)
    in_4d = now + timedelta(days=4)
    in_2d = now + timedelta(days=2)
    midtrial_sent = 0
    reminders_sent = 0
    expired_handled = 0

    def _sub_match(sub: dict) -> dict:
        """Build a unique match filter for a sub doc — prefer `id`, fall back
        to `user_id` for legacy records that don't have an `id`."""
        return {"id": sub["id"]} if sub.get("id") else {"user_id": sub["user_id"], "status": sub.get("status")}

    # Mid-trial nudge — between 2 and 4 days remaining, not yet sent.
    cursor_mid = db.subscriptions.find(
        {
            "status": "trialing",
            "trial_ends_at": {"$gte": in_2d.isoformat(), "$lte": in_4d.isoformat()},
            "trial_midtrial_sent_at": {"$exists": False},
        },
        {"_id": 0},
    ).limit(50)
    async for sub in cursor_mid:
        try:
            user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0})
            if not user:
                continue
            plan = sub.get("plan", "solo")
            label = PLAN_PRICES.get(plan, {}).get("label", plan.capitalize())
            amount = PLAN_PRICES.get(plan, {}).get("amount", 0)
            ends = (sub.get("trial_ends_at") or "").split("T")[0]
            # Pull usage stats
            household = await db.households.find_one({"id": user.get("household_id")}, {"_id": 0, "id": 1}) if user.get("household_id") else None
            stmt_count = await db.statements.count_documents({"household_id": household["id"]}) if household else 0
            anomaly_count = 0
            if household:
                cur = db.statements.find({"household_id": household["id"]}, {"_id": 0, "anomalies": 1}).limit(50)
                async for s in cur:
                    anomaly_count += len(s.get("anomalies") or [])
            await email_service.email_tool_result(
                to=user["email"],
                tool_name=f"You're halfway through your {label} trial",
                headline="Halfway there — here's what Wayly has done for you",
                body_html=(
                    f"<p>Hi {user.get('name') or ''},</p>"
                    f"<p>You're halfway through your free 7-day {label} trial (ends <strong>{ends}</strong>). "
                    "Quick recap of what's happened so far:</p>"
                    "<ul>"
                    f"<li><strong>{stmt_count}</strong> statement{'s' if stmt_count != 1 else ''} decoded</li>"
                    f"<li><strong>{anomaly_count}</strong> anomaly flag{'s' if anomaly_count != 1 else ''} caught for review</li>"
                    "</ul>"
                    + ("<p>If you haven't decoded a statement yet, here's the 30-second version: "
                       "<a href='https://wayly.com.au/ai-tools/statement-decoder'>paste, upload or photograph</a> any "
                       "monthly Support at Home statement and we'll explain what every line means.</p>"
                       if stmt_count == 0 else
                       "<p>Want to use the rest of your trial? Try one of these:</p>"
                       "<ul>"
                       "<li><strong>Provider Price Checker</strong> — see if your provider's rates are above the median (most users find at least one item that's overcharged)</li>"
                       "<li><strong>Reassessment Letter Generator</strong> — produce a polished letter to MyAgedCare asking for a higher classification</li>"
                       "<li><strong>Family Care Coordinator chat</strong> — ask anything about your statements, budget or anomalies</li>"
                       "</ul>")
                    + f"<p>After your trial, {label} is <strong>${amount:.2f}/month</strong> — cancel any time. "
                    "Add a card any time at <a href='https://wayly.com.au/settings/billing'>Settings → Plan & Billing</a>.</p>"
                    "<p>Questions? Just reply to this email.</p>"
                    "<p>— The Wayly team</p>"
                ),
            )
            await db.subscriptions.update_one(
                _sub_match(sub),
                {"$set": {"trial_midtrial_sent_at": now.isoformat()}},
            )
            midtrial_sent += 1
        except Exception as e:
            logger.warning("Mid-trial nudge failed for sub %s: %s", sub.get("id") or sub.get("user_id"), e)

    # Trial nudges — within 24h, not yet reminded
    cursor = db.subscriptions.find(
        {
            "status": "trialing",
            "trial_ends_at": {"$gte": now.isoformat(), "$lte": in_24h.isoformat()},
            "trial_reminder_sent_at": {"$exists": False},
        },
        {"_id": 0},
    ).limit(50)
    async for sub in cursor:
        try:
            user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0})
            if not user:
                continue
            plan = sub.get("plan", "solo")
            label = PLAN_PRICES.get(plan, {}).get("label", plan.capitalize())
            amount = PLAN_PRICES.get(plan, {}).get("amount", 0)
            ends = sub.get("trial_ends_at", "")
            ends_label = ends.split("T")[0] if ends else "tomorrow"
            await email_service.email_tool_result(
                to=user["email"],
                tool_name="Your free trial ends tomorrow",
                headline="Your free trial ends in 24 hours",
                body_html=(
                    f"<p>Hi {user.get('name') or ''},</p>"
                    f"<p>Your free 7-day {label} trial ends on <strong>{ends_label}</strong>. "
                    "Add a card now and you won't lose access to:</p>"
                    "<ul>"
                    "<li>All 8 AI tools (Statement Decoder, Budget Calculator, Reassessment Letter, and 5 more)</li>"
                    "<li>Unlimited statement decoding (PDF, Word, photos)</li>"
                    "<li>Caregiver dashboard with stream-by-stream budget burn</li>"
                    "<li>Anomaly alerts on every statement you upload</li>"
                    + ("<li>Up to 5 family seats and the weekly Sunday digest</li>" if plan == "family" else "")
                    + "</ul>"
                    f"<p><strong>Continue your {label} plan</strong> at <strong>${amount:.2f}/month</strong> — "
                    "<a href='https://wayly.com.au/settings/billing'>Settings → Plan & Billing</a>.</p>"
                    "<p>If you don't add a card, your account will move to the Free plan automatically tomorrow. "
                    "Your statements, household details, and audit log all stay safe — you'll just lose access to "
                    "the paid tools.</p>"
                    "<p>Questions? Just reply to this email.</p>"
                    "<p>— The Wayly team</p>"
                ),
            )
            await db.subscriptions.update_one(
                _sub_match(sub),
                {"$set": {"trial_reminder_sent_at": now.isoformat()}},
            )
            reminders_sent += 1
        except Exception as e:
            logger.warning("Trial reminder failed for sub %s: %s", sub.get("id") or sub.get("user_id"), e)

    # Trial expiries — past trial_ends_at, still status=trialing, not handled
    cursor2 = db.subscriptions.find(
        {
            "status": "trialing",
            "trial_ends_at": {"$lte": now.isoformat()},
            "trial_expired_handled_at": {"$exists": False},
        },
        {"_id": 0},
    ).limit(50)
    async for sub in cursor2:
        try:
            user_id = sub["user_id"]
            user = await db.users.find_one({"id": user_id}, {"_id": 0})
            await db.subscriptions.update_one(
                _sub_match(sub),
                {"$set": {"status": "expired", "trial_expired_handled_at": now.isoformat(), "updated_at": now.isoformat()}},
            )
            await db.users.update_one({"id": user_id}, {"$set": {"plan": "free"}})
            if user:
                plan = sub.get("plan", "solo")
                label = PLAN_PRICES.get(plan, {}).get("label", plan.capitalize())
                amount = PLAN_PRICES.get(plan, {}).get("amount", 0)
                try:
                    await email_service.email_tool_result(
                        to=user["email"],
                        tool_name="Your free trial has ended",
                        headline="Your free trial is over — you're now on Free",
                        body_html=(
                            f"<p>Hi {user.get('name') or ''},</p>"
                            f"<p>Your free trial of {label} has ended and your account has moved to the Free plan. "
                            "Your statements, household setup, and audit log are all safe — they're just on standby "
                            "until you upgrade.</p>"
                            f"<p>Ready to continue? Pick {label} at <strong>${amount:.2f}/month</strong> at "
                            "<a href='https://wayly.com.au/settings/billing'>Settings → Plan & Billing</a> — "
                            "you'll be back to full access in under a minute.</p>"
                            "<p>— The Wayly team</p>"
                        ),
                    )
                except Exception as e:
                    logger.warning("Trial-expired email failed: %s", e)
            expired_handled += 1
        except Exception as e:
            logger.warning("Trial expiry handling failed for sub %s: %s", sub.get("id") or sub.get("user_id"), e)

    return {"midtrial_sent": midtrial_sent, "reminders_sent": reminders_sent, "expired_handled": expired_handled}


async def _trial_scheduler_loop():
    """Runs every 30 minutes for the lifetime of the process."""
    while True:
        try:
            res = await _process_trial_reminders_once()
            if res["reminders_sent"] or res["expired_handled"]:
                logger.info("Trial scheduler pass: %s", res)
        except Exception as e:
            logger.warning("Trial scheduler pass error: %s", e)
        await _asyncio.sleep(30 * 60)


@app.on_event("startup")
async def _start_trial_scheduler():
    _asyncio.create_task(_trial_scheduler_loop())


@app.on_event("startup")
async def _program_reference_bootstrap():
    """Phase 1 scenario engine: seed program_reference and load the cache.

    Idempotent. Runs before anything that reads program figures (budget calc,
    statement decoder, adviser scenario modeller). If any step fails, the
    cache stays empty and ``get_value()`` calls raise — surfaced rather than
    masked with wrong literals."""
    try:
        import program_reference as _pr
        from seed_program_reference import get_seed_rows as _seed_rows
        _pr.init(db)
        await _pr.ensure_seeded(_seed_rows())
        await _pr.apply_data_migrations()
        await _pr.preload_cache()
        logger.info("program_reference ready")
    except Exception as e:
        logger.error("program_reference bootstrap failed: %s", e, exc_info=True)


@app.on_event("startup")
async def _scenario_engine_bootstrap():
    """Phase 2 scenario engine: ensure indexes, backfill lifecycle_state and
    flags on existing participants. Phase 3: events index. Phase 4: alerts
    index + scheduled deadline-clock evaluator. Idempotent."""
    try:
        from scenario_engine.lifecycle import ensure_indexes, backfill_initial_states
        from scenario_engine.flags import backfill_empty_flags
        from scenario_engine.events import ensure_indexes as ev_indexes
        from scenario_engine.alerts import ensure_indexes as al_indexes
        await ensure_indexes(db)
        await ev_indexes(db)
        await al_indexes(db)
        state_counts = await backfill_initial_states(db)
        flag_count = await backfill_empty_flags(db)
        logger.info("scenario_engine ready — lifecycle_state backfill=%s, flags backfill=%d",
                    state_counts, flag_count)
    except Exception as e:
        logger.error("scenario_engine bootstrap failed: %s", e, exc_info=True)


@app.on_event("startup")
async def _scenario_alerts_scheduler():
    """Phase 4 — evaluate deadline clocks for every participant every hour.
    First run fires 30s after boot so the smoke test sees consistent state."""
    async def _loop():
        import asyncio as _aio
        await _aio.sleep(30)
        while True:
            try:
                from scenario_engine.alerts import evaluate_all_clocks
                counts = await evaluate_all_clocks(db)
                logger.info("scenario_alerts evaluation: %s", counts)
            except Exception as e:
                logger.warning("scenario_alerts evaluation failed: %s", e)
            await _aio.sleep(3600)  # one hour
    _asyncio.create_task(_loop())


@app.on_event("startup")
async def _security_index_bootstrap():
    """Phase 1: ensure revoked-token TTL index + per-user lockout indexes exist."""
    try:
        await ensure_security_indexes()
    except Exception as e:
        logger.warning("security index bootstrap failed: %s", e)


@app.on_event("startup")
async def _rate_limit_bootstrap():
    """Phase 3: warm up the Redis client so the first request doesn't pay
    the connection cost (or — if Redis is unreachable — so we surface a
    single startup warning instead of a per-request one)."""
    try:
        r = await _rl._get_redis()
        if r is None:
            logger.warning("rate limiter: Redis not configured (REDIS_URL missing) — limits are fail-open")
        else:
            logger.info("rate limiter: Redis ready, %d buckets configured", len(_rl.LIMITS))
    except Exception as e:
        logger.warning("rate limiter bootstrap failed: %s", e)


@app.on_event("startup")
async def _privacy_purge_scheduler():
    """Phase 9: kick off the 60-day hard-delete background task."""
    try:
        import privacy as _privacy
        _privacy.start_scheduler()
        logger.info("privacy purge scheduler started (interval=%ds, window=%dd)",
                    _privacy._SCHEDULER_INTERVAL_S, _privacy.SOFT_DELETE_WINDOW_DAYS)
    except Exception as e:
        logger.warning("privacy purge scheduler failed to start: %s", e)


@app.on_event("startup")
async def _start_health_watchdog():
    import health_watchdog
    await health_watchdog.start()


@app.on_event("startup")
async def _start_reports_scheduler():
    try:
        import reports_scheduler
        await reports_scheduler.start()
    except Exception as e:
        logger.warning(f"reports_scheduler failed to start: {e}")


@app.on_event("startup")
async def _start_batch2_migration():
    """One-time idempotent migration: ensure every legacy household has a
    primary participant row. Safe to call repeatedly — no-ops if already done."""
    try:
        res = await migrate_existing_households()
        if res.get("migrated"):
            logger.info("Batch2 startup migration: %s", res)
    except Exception as e:
        logger.warning("Batch2 migration failed: %s", e)


@app.on_event("startup")
async def _start_batch3_migration_and_purge():
    """Batch3 idempotent migration: backfill accounts, account_members, and
    rebuild participants v2 from existing households. Then run the
    pending-removal purge job for participants whose 60-day window has expired."""
    try:
        res = await migrate_batch3()
        if any(res.values()):
            logger.info("Batch3 startup migration: %s", res)
    except Exception as e:
        logger.warning("Batch3 migration failed: %s", e)
    try:
        purge_res = await run_purge_job()
        if purge_res.get("purged"):
            logger.info("Batch3 purge job: %s", purge_res)
    except Exception as e:
        logger.warning("Batch3 purge job failed: %s", e)


# Manual trigger for testing/debugging.
@app.post("/api/internal/trial-tick")
async def trial_tick_manual(request: Request):
    """Internal endpoint to fire the trial pass on demand. Gated behind
    `INTERNAL_TICK_TOKEN` env var when set (otherwise open in dev)."""
    expected = os.environ.get("INTERNAL_TICK_TOKEN")
    if expected:
        provided = request.headers.get("X-Internal-Token", "")
        if provided != expected:
            raise HTTPException(status_code=403, detail="forbidden")
    return await _process_trial_reminders_once()


@app.on_event("shutdown")
async def shutdown_db_client():
    import health_watchdog
    await health_watchdog.stop()
    try:
        import reports_scheduler
        await reports_scheduler.stop()
    except Exception:
        pass
    client.close()
