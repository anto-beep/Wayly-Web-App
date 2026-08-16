"""Wayly, Email change with verification.

Flow (user stays logged in with the old email until they click the link):
1. POST /auth/email/change-request  { new_email, password }
   → validates password, checks new_email not taken, issues token, emails NEW address
2. GET  /auth/email/change-confirm?token=…
   → validates token + expiry, swaps user.email to new_email, revokes other pending
     tokens for the same user, sends a heads-up email to the OLD address for security
3. GET  /auth/email/change-status
   → returns pending change (if any) so Settings can show "verification pending"
4. DELETE /auth/email/change-request
   → cancels a pending change
"""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field

from auth import get_current_user_id, verify_password
from email_service import send_email

logger = logging.getLogger("wayly.email_change")

email_change_router = APIRouter(tags=["email_change"])

_db = None
_frontend_url: str = ""
_token_ttl_hours: int = 24


def init_email_change_routes(*, db, frontend_url: str, token_ttl_hours: int = 24):
    global _db, _frontend_url, _token_ttl_hours
    _db = db
    _frontend_url = frontend_url.rstrip("/")
    _token_ttl_hours = token_ttl_hours


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ----------------------------------------------------------------------------
# Emails
# ----------------------------------------------------------------------------
def _change_email_html(name: str, new_email: str, verify_link: str) -> str:
    from wayly_email_branding import wrap_email_html, button_html, COLORS, HEADING_FONT
    safe_name = (name or "there").split("@")[0]
    inner = f"""
      <h1 style="margin:0 0 14px 0;color:{COLORS["teal"]};font-family:{HEADING_FONT};font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-.01em;">
        Confirm your new email, {safe_name}.
      </h1>
      <p style="margin:0 0 4px 0;color:{COLORS["text"]};font-size:15px;line-height:1.65;">
        You (or someone with your account password) asked to change the email on your Wayly account to <strong>{new_email}</strong>. To finish the change, tap the button below.
      </p>
      {button_html(href=verify_link, label="Confirm new email", colour="clay")}
      <p style="margin:8px 0 0 0;color:{COLORS["muted"]};font-size:13px;line-height:1.6;">
        Or copy this link into your browser:<br>
        <a href="{verify_link}" style="color:{COLORS["clay"]};word-break:break-all;text-decoration:underline;">{verify_link}</a>
      </p>
      <p style="margin:20px 0 0 0;color:{COLORS["muted"]};font-size:13px;line-height:1.6;">
        This link expires in {_token_ttl_hours} hours. Until you confirm, your account keeps using your old email.
      </p>
      <p style="margin:24px 0 0 0;color:{COLORS["muted"]};font-size:12px;line-height:1.55;border-top:1px solid {COLORS["border"]};padding-top:18px;opacity:.9;">
        Didn&apos;t ask for this change? Ignore this email and let us know at support@wayly.com.au.
      </p>
    """
    return wrap_email_html(
        title="Confirm your new email",
        eyebrow="Confirm email change",
        inner_html=inner,
    )


def _security_heads_up_html(name: str, new_email: str) -> str:
    from wayly_email_branding import wrap_email_html, COLORS, HEADING_FONT
    safe_name = (name or "there").split("@")[0]
    inner = f"""
      <h1 style="margin:0 0 14px 0;color:{COLORS["teal"]};font-family:{HEADING_FONT};font-size:22px;line-height:1.3;font-weight:700;">
        Your Wayly email address has changed
      </h1>
      <p style="color:{COLORS["text"]};font-size:15px;line-height:1.65;margin:0 0 12px;">
        Hi {safe_name}, just a heads-up: the email on your Wayly account was changed to <strong>{new_email}</strong>. From now on, sign-in and account notices go to that address.
      </p>
      <p style="color:{COLORS["text"]};font-size:15px;line-height:1.65;margin:0;">
        If you did not make this change, contact us right away at
        <a href="mailto:support@wayly.com.au" style="color:{COLORS["clay"]};text-decoration:underline;">support@wayly.com.au</a>
        so we can lock the account and roll it back.
      </p>
    """
    return wrap_email_html(
        title="Your Wayly email has changed",
        eyebrow="Security notice",
        inner_html=inner,
    )


# ----------------------------------------------------------------------------
# Models
# ----------------------------------------------------------------------------
class ChangeRequestBody(BaseModel):
    new_email: EmailStr
    password: str = Field(min_length=1, max_length=200)


# ----------------------------------------------------------------------------
# Routes
# ----------------------------------------------------------------------------
@email_change_router.post("/auth/email/change-request")
async def request_email_change(body: ChangeRequestBody,
                                user_id: str = Depends(get_current_user_id)):
    """Kick off an email change. User stays logged in with old email until they
    click the confirmation link sent to the new address."""
    u = await _db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="User not found")
    new_email = body.new_email.lower().strip()
    if new_email == (u.get("email") or "").lower():
        raise HTTPException(status_code=400, detail="That is already your email address.")
    # Refuse if new_email is used by anyone else (including the same account ,
    # we already checked above).
    taken = await _db.users.find_one({"email": new_email}, {"_id": 0, "id": 1})
    if taken:
        raise HTTPException(
            status_code=409,
            detail="That email is already in use. Try signing in with it, or use a different address.",
        )
    if not verify_password(body.password, u.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Password is incorrect.")

    # Invalidate any prior unused change tokens for this user.
    await _db.email_change_tokens.update_many(
        {"user_id": user_id, "used": False, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": _iso(_now())}},
    )
    token = secrets.token_urlsafe(32)
    expires_at = _now() + timedelta(hours=_token_ttl_hours)
    await _db.email_change_tokens.insert_one({
        "token": token,
        "user_id": user_id,
        "old_email": u.get("email"),
        "new_email": new_email,
        "created_at": _iso(_now()),
        "expires_at": expires_at,
        "used": False,
        "used_at": None,
        "revoked": False,
        "revoked_at": None,
    })
    # Point directly at the backend consumer (see the matching comment in
    # routes/email_verification.py). The frontend /verify-email-change
    # React page only reads the status param, it does not consume tokens.
    verify_link = f"{_frontend_url}/api/auth/email/change-confirm?token={token}"
    res = await send_email(
        to=new_email,
        subject="Confirm your new email, Wayly",
        html=_change_email_html(u.get("name") or u.get("email", ""), new_email, verify_link),
    )
    logger.info("email change requested user=%s new=%s ok=%s",
                user_id, new_email, res.get("ok"))
    return {
        "ok": True,
        "new_email": new_email,
        "expires_at": _iso(expires_at),
        "mocked": bool(res.get("mocked")),
    }


@email_change_router.get("/auth/email/change-status")
async def get_email_change_status(user_id: str = Depends(get_current_user_id)):
    """Any pending (unused, unrevoked, unexpired) change request."""
    now = _now()
    row = await _db.email_change_tokens.find_one(
        {"user_id": user_id, "used": False, "revoked": False},
        {"_id": 0, "token": 0},
        sort=[("created_at", -1)],
    )
    if not row:
        return {"pending": False}
    exp = row.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        except Exception:
            exp = None
    if isinstance(exp, datetime) and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not exp or now > exp:
        return {"pending": False}
    return {
        "pending": True,
        "new_email": row.get("new_email"),
        "expires_at": row.get("expires_at") if isinstance(row.get("expires_at"), str) else _iso(exp),
        "requested_at": row.get("created_at"),
    }


@email_change_router.delete("/auth/email/change-request")
async def cancel_email_change(user_id: str = Depends(get_current_user_id)):
    res = await _db.email_change_tokens.update_many(
        {"user_id": user_id, "used": False, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": _iso(_now())}},
    )
    return {"ok": True, "cancelled": res.modified_count}


@email_change_router.get("/auth/email/change-confirm")
async def confirm_email_change(token: str = Query(...)):
    """Public landing for the confirmation link (no auth required, the
    knowledge of the token proves the user controls the target inbox)."""
    success_url = f"{_frontend_url}/verify-email-change?status=success"
    expired_url = f"{_frontend_url}/verify-email-change?status=expired"
    invalid_url = f"{_frontend_url}/verify-email-change?status=invalid"
    taken_url = f"{_frontend_url}/verify-email-change?status=email_taken"

    row = await _db.email_change_tokens.find_one({"token": token}, {"_id": 0})
    if not row or row.get("revoked"):
        return RedirectResponse(invalid_url, status_code=302)
    if row.get("used"):
        # Idempotent, already applied.
        return RedirectResponse(success_url, status_code=302)
    exp = row.get("expires_at")
    if isinstance(exp, str):
        try:
            exp = datetime.fromisoformat(exp.replace("Z", "+00:00"))
        except Exception:
            exp = None
    if isinstance(exp, datetime) and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not exp or _now() > exp:
        return RedirectResponse(expired_url, status_code=302)

    new_email = row["new_email"]
    # Guard: race, if someone else grabbed the email since the request, refuse.
    taken = await _db.users.find_one(
        {"email": new_email, "id": {"$ne": row["user_id"]}}, {"_id": 0, "id": 1},
    )
    if taken:
        await _db.email_change_tokens.update_one(
            {"token": token},
            {"$set": {"revoked": True, "revoked_at": _iso(_now())}},
        )
        return RedirectResponse(taken_url, status_code=302)

    # Apply the change.
    now = _iso(_now())
    u = await _db.users.find_one({"id": row["user_id"]}, {"_id": 0})
    if not u:
        return RedirectResponse(invalid_url, status_code=302)
    old_email = u.get("email")
    await _db.users.update_one(
        {"id": row["user_id"]},
        {"$set": {
            "email": new_email,
            "email_verified": True,
            "email_verified_at": now,
            "email_last_changed_at": now,
        }},
    )
    await _db.email_change_tokens.update_one(
        {"token": token},
        {"$set": {"used": True, "used_at": now}},
    )
    # Revoke any other pending requests for this user.
    await _db.email_change_tokens.update_many(
        {"user_id": row["user_id"], "used": False, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now}},
    )
    # Security heads-up to the OLD address.
    try:
        await send_email(
            to=old_email,
            subject="Your Wayly email address has changed",
            html=_security_heads_up_html(u.get("name") or "", new_email),
        )
    except Exception as e:  # pragma: no cover
        logger.warning("email change heads-up send failed: %s", e)

    logger.info("email changed user=%s old=%s new=%s",
                row["user_id"], old_email, new_email)
    return RedirectResponse(success_url, status_code=302)


async def ensure_email_change_indexes(db_handle) -> None:
    try:
        await db_handle.email_change_tokens.create_index("token", unique=True)
        await db_handle.email_change_tokens.create_index("user_id")
        await db_handle.email_change_tokens.create_index("expires_at")
    except Exception as exc:  # pragma: no cover
        logger.warning("email_change_tokens indexes skipped: %s", exc)
