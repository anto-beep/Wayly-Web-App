"""Wayly, Email verification (soft-block 7-day grace period).

New users land with `email_verified=False` and a `verification_deadline`
7 days in the future. They can use the app, but a dashboard banner reminds
them to click the link. Once the deadline passes, /auth/login blocks them
with HTTP 403 and a "resend verification" CTA.

Endpoints (all under /api/auth):
- GET  /auth/verification-status     → status + days remaining
- POST /auth/send-verification-email → (re)send the email (rate-limited)
- GET  /auth/verify-email?token=…    → public verify-link landing
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr

from auth import get_current_user_id
from email_service import send_email

logger = logging.getLogger("wayly.email_verification")

email_verification_router = APIRouter(tags=["email_verification"])

_db = None
_frontend_url: str = ""
_grace_days: int = 7
_token_ttl_hours: int = 24

# Per-user resend cooldown (in-memory; OK for single-pod preview).
_last_send_at: dict[str, datetime] = {}
_RESEND_COOLDOWN_S = 60


def init_email_verification_routes(*, db, frontend_url: str, grace_days: int = 7,
                                   token_ttl_hours: int = 24):
    global _db, _frontend_url, _grace_days, _token_ttl_hours
    _db = db
    _frontend_url = frontend_url.rstrip("/")
    _grace_days = grace_days
    _token_ttl_hours = token_ttl_hours


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


# ----------------------------------------------------------------------------
# Brand-aligned email template, routes through wayly_email_branding so the
# palette + fonts stay in lockstep with every other Wayly email.
# ----------------------------------------------------------------------------
def _verification_email_html(name: str, verify_link: str) -> str:
    from wayly_email_branding import wrap_email_html, button_html, COLORS, BODY_FONT
    safe_name = (name or "there").split("@")[0]
    inner = f"""
      <h1 style="margin:0 0 14px 0;color:{COLORS["teal"]};font-family:{BODY_FONT};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-.01em;">
        Verify your email, {safe_name}.
      </h1>
      <p style="margin:0 0 4px 0;color:{COLORS["text"]};font-size:15px;line-height:1.65;">
        Welcome to Wayly. To finish setting up your account, please confirm this email address. It only takes a click.
      </p>
      {button_html(href=verify_link, label="Verify email", colour="clay")}
      <p style="margin:8px 0 0 0;color:{COLORS["muted"]};font-size:13px;line-height:1.6;">
        Or copy and paste this link into your browser:<br>
        <a href="{verify_link}" style="color:{COLORS["clay"]};word-break:break-all;text-decoration:underline;">{verify_link}</a>
      </p>
      <p style="margin:20px 0 0 0;color:{COLORS["muted"]};font-size:13px;line-height:1.6;">
        This link expires in {_token_ttl_hours} hours. You have {_grace_days} days from signup to verify before your account is locked.
      </p>
      <p style="margin:24px 0 0 0;color:{COLORS["muted"]};font-size:12px;line-height:1.55;border-top:1px solid {COLORS["border"]};padding-top:18px;opacity:.9;">
        Didn't sign up for Wayly? You can safely ignore this email, the account will be removed automatically if unverified.
      </p>
    """
    return wrap_email_html(
        title="Verify your email",
        eyebrow="Verify your email",
        inner_html=inner,
        footer_note="You received this because someone signed up for Wayly with this email address.",
    )


# ----------------------------------------------------------------------------
# Core helpers (also callable from server.py signup handler)
# ----------------------------------------------------------------------------
async def issue_verification_token(user: dict) -> str:
    """Generate a fresh token + persist it.

    Prior unused tokens for the same user are **left valid** until they
    expire (default 24h) or one is used. Aggressively invalidating them
    breaks a common flow: signup email + user-initiated resend produce two
    live emails, and if the user clicks the first the old-behaviour path
    served them "Link not valid". Standard SaaS practice (GitHub, Stripe,
    Google) is to accept whichever unexpired token the user presents; the
    other tokens die on their TTL.
    """
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(hours=_token_ttl_hours)
    await _db.email_verification_tokens.insert_one({
        "token": token,
        "user_id": user["id"],
        "email": user.get("email"),
        "created_at": _iso(_now()),
        "expires_at": expires_at,
        "used": False,
    })
    return token


async def send_verification_email_for(user: dict) -> dict:
    token = await issue_verification_token(user)
    # Point directly at the backend consumer, which validates the token and
    # 302-redirects to /verify-email?status=success|expired|invalid. The
    # frontend `/verify-email` React page only knows how to *read* the
    # status param, it doesn't consume tokens itself, so linking straight
    # to it (as we used to) made every click look "invalid".
    verify_link = f"{_frontend_url}/api/auth/verify-email?token={token}"
    html = _verification_email_html(user.get("name") or user.get("email", ""), verify_link)
    result = await send_email(
        to=user["email"],
        subject="Verify your email , Wayly",
        html=html,
    )
    logger.info("verification email queued user=%s ok=%s", user.get("id"), result.get("ok"))
    return {"ok": bool(result.get("ok")), "mocked": bool(result.get("mocked"))}


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
    return {
        "email": u.get("email"),
        "email_verified": verified,
        "email_verified_at": u.get("email_verified_at"),
        "verification_deadline": deadline,
        "days_remaining": 0 if verified else days_remaining(deadline),
        "past_deadline": is_past_deadline(deadline) and not verified,
        "grace_days": _grace_days,
    }


@email_verification_router.post("/auth/send-verification-email")
async def send_verification_email_route(user_id: str = Depends(get_current_user_id)):
    u = await _db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    if u.get("email_verified"):
        return {"ok": True, "already_verified": True}
    # Cooldown, prevent spam clicks.
    last = _last_send_at.get(user_id)
    if last and (_now() - last).total_seconds() < _RESEND_COOLDOWN_S:
        retry_in = int(_RESEND_COOLDOWN_S - (_now() - last).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {retry_in} seconds before requesting another email.",
        )
    _last_send_at[user_id] = _now()
    res = await send_verification_email_for(u)
    return {"ok": res["ok"], "mocked": res.get("mocked", False)}


@email_verification_router.get("/auth/verify-email")
async def verify_email(token: str = Query(...)):
    """Public landing for email-link clicks. Redirects to the frontend with
    a status query param so the UX is consistent across success/failure."""
    success_url = f"{_frontend_url}/verify-email?status=success"
    expired_url = f"{_frontend_url}/verify-email?status=expired"
    invalid_url = f"{_frontend_url}/verify-email?status=invalid"
    already_url = f"{_frontend_url}/verify-email?status=already_verified"

    row = await _db.email_verification_tokens.find_one({"token": token}, {"_id": 0})
    if not row:
        return RedirectResponse(invalid_url, status_code=302)
    if row.get("used"):
        # If the user is already verified, treat any prior token click as a
        # successful revisit, never confuse them with "invalid" when the
        # underlying account is fine.
        u = await _db.users.find_one({"id": row["user_id"]}, {"_id": 0})
        if u and u.get("email_verified"):
            return RedirectResponse(already_url, status_code=302)
        # User isn't verified yet but this token was already consumed ,
        # invite them to request a fresh link rather than showing a dead-end.
        return RedirectResponse(expired_url, status_code=302)
    expires_at = row.get("expires_at")
    if isinstance(expires_at, str):
        try:
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        except Exception:
            expires_at = None
    # Mongo round-trips datetimes as naive UTC, re-attach tzinfo so the
    # comparison below doesn't trip "offset-naive vs offset-aware".
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if not expires_at or _now() > expires_at:
        return RedirectResponse(expired_url, status_code=302)

    # Mark token used + user verified atomically.
    now_iso = _iso(_now())
    await _db.email_verification_tokens.update_one(
        {"token": token},
        {"$set": {"used": True, "used_at": now_iso}},
    )
    await _db.users.update_one(
        {"id": row["user_id"]},
        {"$set": {
            "email_verified": True,
            "email_verified_at": now_iso,
        }},
    )
    logger.info("email verified user=%s", row["user_id"])
    return RedirectResponse(success_url, status_code=302)


# ----------------------------------------------------------------------------
# Public (unauthenticated) resend, for users locked out past the deadline
# who can't log in to call the authenticated endpoint.
# ----------------------------------------------------------------------------
class PublicResendBody(BaseModel):
    email: EmailStr


@email_verification_router.post("/auth/resend-verification-email")
async def public_resend(body: PublicResendBody):
    u = await _db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    # Generic response: don't leak whether the email exists.
    if not u or u.get("email_verified"):
        return {"ok": True}
    last = _last_send_at.get(u["id"])
    if last and (_now() - last).total_seconds() < _RESEND_COOLDOWN_S:
        retry_in = int(_RESEND_COOLDOWN_S - (_now() - last).total_seconds())
        raise HTTPException(
            status_code=429,
            detail=f"Please wait {retry_in} seconds before requesting another email.",
        )
    _last_send_at[u["id"]] = _now()
    res = await send_verification_email_for(u)
    return {"ok": res["ok"], "mocked": res.get("mocked", False)}


# ----------------------------------------------------------------------------
# Migration, auto-verify all existing users so production doesn't break.
# Runs once on startup; idempotent (only touches rows missing the field).
# ----------------------------------------------------------------------------
async def migrate_existing_users_verified(db_handle) -> dict:
    """Sets email_verified=True on every legacy user that doesn't already
    have the field. New signups going forward will explicitly be False."""
    res = await db_handle.users.update_many(
        {"email_verified": {"$exists": False}},
        {"$set": {
            "email_verified": True,
            "email_verified_at": _iso(_now()),
            "verification_grandfathered": True,
        }},
    )
    return {"updated": res.modified_count}
