"""Wayly, Email verification via 6-digit code (soft-block 7-day grace period).

New users land with `email_verified=False` and a `verification_deadline`
7 days in the future. They can use the app during the grace window, but a
banner nudges them to verify. Verification is done with a 6-digit numeric
code emailed to them (replaces the older click-a-link flow). Once the deadline
passes, /auth/login blocks them (PRODUCTION only) with HTTP 403 and the client
shows the same code-entry screen.

Endpoints (all under /api/auth):
- GET  /auth/verification-status      → status + days remaining + resend cooldown
- POST /auth/send-verification-email  → (re)send a code to the signed-in user
- POST /auth/resend-verification-email→ (re)send a code by email (public, for the
                                         locked-out-at-login case)
- POST /auth/verify-code              → verify {email, code}
- GET  /auth/verify-email?token=…     → legacy link consumer (kept so any old
                                         emails still resolve gracefully)

Security: the code is stored hashed (sha256), single active code per user,
15-minute TTL, 5-minute resend cooldown, and a 6-attempt cap before the code is
burned and a fresh one is required. In non-production (WAYLY_ENV unset) the code
is surfaced in API responses (`debug_code`) so the flow is testable without a
live inbox — never in production.
"""
from __future__ import annotations

import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user_id
from email_service import send_email

logger = logging.getLogger("wayly.email_verification")

email_verification_router = APIRouter(tags=["email_verification"])

_db = None
_frontend_url: str = ""
_grace_days: int = 7
_code_ttl_minutes: int = 15
_IS_PROD = os.environ.get("WAYLY_ENV") == "production"

# Per-user resend cooldown (in-memory; OK for single-pod preview).
_last_send_at: dict[str, datetime] = {}
# Ephemeral plaintext cache for preview/testing only (never populated in prod).
_debug_codes: dict[str, str] = {}
_RESEND_COOLDOWN_S = 300  # 5 minutes
_MAX_ATTEMPTS = 6


def init_email_verification_routes(*, db, frontend_url: str, grace_days: int = 7,
                                   token_ttl_hours: int = 24):
    global _db, _frontend_url, _grace_days
    _db = db
    _frontend_url = frontend_url.rstrip("/")
    _grace_days = grace_days


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def deadline_for(created_at_iso: str) -> str:
    """Returns the verification deadline (created_at + grace_days) as ISO."""
    try:
        ca = datetime.fromisoformat(created_at_iso.replace("Z", "+00:00"))
    except Exception:
        ca = _now()
    return _iso(ca + timedelta(days=_grace_days))


def days_remaining(deadline_iso: Optional[str]) -> int:
    if not deadline_iso:
        return _grace_days
    try:
        d = datetime.fromisoformat(deadline_iso.replace("Z", "+00:00"))
    except Exception:
        return 0
    delta = d - _now()
    return max(0, int(delta.total_seconds() // 86400))


def is_past_deadline(deadline_iso: Optional[str]) -> bool:
    if not deadline_iso:
        return False
    try:
        d = datetime.fromisoformat(deadline_iso.replace("Z", "+00:00"))
    except Exception:
        return False
    return _now() > d


def _resend_available_in(user_id: str) -> int:
    """Seconds remaining before the user may request another code (0 = ready)."""
    last = _last_send_at.get(user_id)
    if not last:
        return 0
    elapsed = (_now() - last).total_seconds()
    return max(0, int(_RESEND_COOLDOWN_S - elapsed))


# ----------------------------------------------------------------------------
# Code helpers
# ----------------------------------------------------------------------------
def _gen_code() -> str:
    return f"{secrets.randbelow(10 ** 6):06d}"


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.strip().encode("utf-8")).hexdigest()


async def issue_verification_code(user: dict) -> str:
    """Generate a fresh 6-digit code, invalidate any prior codes, persist it
    hashed, and return the plaintext (for emailing / preview surfacing)."""
    code = _gen_code()
    # Single active code per user: drop any earlier ones.
    await _db.email_verification_codes.delete_many({"user_id": user["id"]})
    await _db.email_verification_codes.insert_one({
        "user_id": user["id"],
        "email": user.get("email"),
        "code_hash": _hash_code(code),
        "attempts": 0,
        "created_at": _iso(_now()),
        "expires_at": _now() + timedelta(minutes=_code_ttl_minutes),
        "consumed": False,
    })
    return code


# ----------------------------------------------------------------------------
# Brand-aligned code email.
# ----------------------------------------------------------------------------
def _verification_email_html(name: str, code: str) -> str:
    from wayly_email_branding import wrap_email_html, COLORS, BODY_FONT
    safe_name = (name or "there").split("@")[0]
    inner = f"""
      <h1 style="margin:0 0 14px 0;color:{COLORS["teal"]};font-family:{BODY_FONT};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-.01em;">
        Confirm your email, {safe_name}.
      </h1>
      <p style="margin:0 0 4px 0;color:{COLORS["text"]};font-size:15px;line-height:1.65;">
        Enter this 6-digit code in Wayly to verify your email address:
      </p>
      <div style="margin:22px 0;text-align:center;">
        <span style="display:inline-block;font-family:{BODY_FONT};font-size:34px;font-weight:700;letter-spacing:12px;color:{COLORS["teal"]};background:{COLORS["warm_surface"]};border:1px solid {COLORS["border"]};border-radius:14px;padding:18px 20px 18px 32px;">{code}</span>
      </div>
      <p style="margin:8px 0 0 0;color:{COLORS["muted"]};font-size:13px;line-height:1.6;">
        This code expires in {_code_ttl_minutes} minutes. You have {_grace_days} days from signup to verify before your account is locked.
      </p>
      <p style="margin:20px 0 0 0;color:{COLORS["muted"]};font-size:12px;line-height:1.55;border-top:1px solid {COLORS["border"]};padding-top:18px;opacity:.9;">
        Didn't sign up for Wayly? You can safely ignore this email. For your security, we will never ask you to share this code with anyone.
      </p>
    """
    return wrap_email_html(
        title="Verify your email",
        eyebrow="Verify your email",
        inner_html=inner,
        footer_note="You received this because someone signed up for Wayly with this email address.",
    )


async def send_verification_email_for(user: dict) -> dict:
    """Issue a code and email it. Returns {ok, mocked, code}. Callers decide
    whether to surface `code` (only in non-production)."""
    code = await issue_verification_code(user)
    if not _IS_PROD:
        _debug_codes[user["id"]] = code
    html = _verification_email_html(user.get("name") or user.get("email", ""), code)
    try:
        result = await send_email(to=user["email"], subject="Your Wayly verification code", html=html)
    except Exception as e:
        logger.warning("verification code email failed user=%s: %s", user.get("id"), e)
        result = {"ok": False, "mocked": False}
    logger.info("verification code issued user=%s ok=%s", user.get("id"), result.get("ok"))
    _last_send_at[user["id"]] = _now()
    return {"ok": bool(result.get("ok")), "mocked": bool(result.get("mocked")), "code": code}


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------
@email_verification_router.get("/auth/verification-status")
async def verification_status(user_id: str = Depends(get_current_user_id)):
    u = await _db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    verified = bool(u.get("email_verified"))
    deadline = u.get("verification_deadline")
    out = {
        "email": u.get("email"),
        "email_verified": verified,
        "email_verified_at": u.get("email_verified_at"),
        "verification_deadline": deadline,
        "days_remaining": 0 if verified else days_remaining(deadline),
        "past_deadline": is_past_deadline(deadline) and not verified,
        "grace_days": _grace_days,
        "resend_available_in": 0 if verified else _resend_available_in(user_id),
    }
    # Non-prod: surface the active code so the flow is testable without an inbox.
    if not _IS_PROD and not verified:
        dbg = _debug_codes.get(user_id)
        if dbg:
            out["debug_code"] = dbg
    return out


async def _send_for_user(u: dict) -> dict:
    res = await send_verification_email_for(u)
    _last_send_at[u["id"]] = _now()
    payload = {"ok": res["ok"], "mocked": res.get("mocked", False),
               "resend_available_in": _RESEND_COOLDOWN_S}
    if not _IS_PROD:
        payload["debug_code"] = res.get("code")
    return payload


@email_verification_router.post("/auth/send-verification-email")
async def send_verification_email_route(user_id: str = Depends(get_current_user_id)):
    u = await _db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.get("email_verified"):
        return {"ok": True, "already_verified": True}
    wait = _resend_available_in(user_id)
    if wait > 0:
        raise HTTPException(status_code=429,
                            detail=f"Please wait {wait} seconds before requesting another code.")
    return await _send_for_user(u)


class PublicResendBody(BaseModel):
    email: EmailStr


@email_verification_router.post("/auth/resend-verification-email")
async def public_resend(body: PublicResendBody):
    u = await _db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    # Generic response: don't leak whether the email exists / is verified.
    if not u or u.get("email_verified"):
        return {"ok": True, "resend_available_in": _RESEND_COOLDOWN_S}
    wait = _resend_available_in(u["id"])
    if wait > 0:
        raise HTTPException(status_code=429,
                            detail=f"Please wait {wait} seconds before requesting another code.")
    return await _send_for_user(u)


class VerifyCodeBody(BaseModel):
    email: EmailStr
    code: str = Field(min_length=4, max_length=10)


@email_verification_router.post("/auth/verify-code")
async def verify_code(body: VerifyCodeBody):
    u = await _db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    # Anti-enumeration: same generic error whether the user is missing or the
    # code is wrong.
    generic = HTTPException(status_code=400, detail="That code is incorrect or has expired. Request a new one.")
    if not u:
        raise generic
    if u.get("email_verified"):
        return {"ok": True, "email_verified": True, "already_verified": True}

    row = await _db.email_verification_codes.find_one({"user_id": u["id"], "consumed": False}, {"_id": 0})
    if not row:
        raise generic

    expires_at = row.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except Exception:
            expires_at = None
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or _now() > expires_at:
        await _db.email_verification_codes.delete_many({"user_id": u["id"]})
        raise HTTPException(status_code=400, detail="That code has expired. Request a new one.")

    if int(row.get("attempts", 0)) >= _MAX_ATTEMPTS:
        await _db.email_verification_codes.delete_many({"user_id": u["id"]})
        raise HTTPException(status_code=429, detail="Too many incorrect attempts. Request a new code.")

    if _hash_code(body.code) != row.get("code_hash"):
        new_attempts = int(row.get("attempts", 0)) + 1
        if new_attempts >= _MAX_ATTEMPTS:
            await _db.email_verification_codes.delete_many({"user_id": u["id"]})
            raise HTTPException(status_code=429, detail="Too many incorrect attempts. Request a new code.")
        await _db.email_verification_codes.update_one(
            {"user_id": u["id"], "consumed": False}, {"$set": {"attempts": new_attempts}}
        )
        remaining = _MAX_ATTEMPTS - new_attempts
        raise HTTPException(status_code=400,
                            detail=f"That code is incorrect. {remaining} attempt{'s' if remaining != 1 else ''} left.")

    # Success.
    await _db.email_verification_codes.delete_many({"user_id": u["id"]})
    _debug_codes.pop(u["id"], None)
    await _db.users.update_one(
        {"id": u["id"]},
        {"$set": {"email_verified": True, "email_verified_at": _iso(_now())}},
    )
    logger.info("email verified via code user=%s", u["id"])
    return {"ok": True, "email_verified": True}


# ----------------------------------------------------------------------------
# Legacy link consumer, kept so any verification emails already sitting in an
# inbox from the previous (link) flow still resolve without a dead-end.
# ----------------------------------------------------------------------------
@email_verification_router.get("/auth/verify-email")
async def verify_email_legacy(token: str = Query(...)):
    success_url = f"{_frontend_url}/verify-email?status=success"
    expired_url = f"{_frontend_url}/verify-email?status=expired"
    invalid_url = f"{_frontend_url}/verify-email?status=invalid"
    already_url = f"{_frontend_url}/verify-email?status=already_verified"

    row = await _db.email_verification_tokens.find_one({"token": token}, {"_id": 0})
    if not row:
        return RedirectResponse(invalid_url, status_code=302)
    u = await _db.users.find_one({"id": row["user_id"]}, {"_id": 0})
    if u and u.get("email_verified"):
        return RedirectResponse(already_url, status_code=302)
    if row.get("used"):
        return RedirectResponse(expired_url, status_code=302)
    expires_at = row.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except Exception:
            expires_at = None
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or _now() > expires_at:
        return RedirectResponse(expired_url, status_code=302)
    now_iso = _iso(_now())
    await _db.email_verification_tokens.update_one({"token": token}, {"$set": {"used": True, "used_at": now_iso}})
    await _db.users.update_one({"id": row["user_id"]}, {"$set": {"email_verified": True, "email_verified_at": now_iso}})
    return RedirectResponse(success_url, status_code=302)


# ----------------------------------------------------------------------------
# Migration, auto-verify all existing users so production doesn't break.
# ----------------------------------------------------------------------------
async def migrate_existing_users_verified(db_handle) -> dict:
    res = await db_handle.users.update_many(
        {"email_verified": {"$exists": False}},
        {"$set": {
            "email_verified": True,
            "email_verified_at": _iso(_now()),
            "verification_grandfathered": True,
        }},
    )
    return {"updated": res.modified_count}
