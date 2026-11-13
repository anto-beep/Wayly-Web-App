"""Marketing preference + unsubscribe endpoints (web + mobile share these).

Routes (mounted under /api):
  GET  /api/email/preferences            ?token=  → current marketing status
  POST /api/email/preferences            {token, marketing_opted_in}
  GET  /api/email/unsubscribe            ?token=  → scanner-safe confirm PAGE
  POST /api/email/unsubscribe            ?token=  → performs unsubscribe
                                                    (RFC 8058 one-click + form)
  GET   /api/account/marketing-preferences         (authenticated)
  PATCH /api/account/marketing-preferences {marketing_opted_in} (authenticated)

Scanner safety: a GET on /email/unsubscribe NEVER opts the user out — it only
renders a confirmation page whose button issues a POST. Link-prefetchers and
security scanners issue GETs, so they can't accidentally unsubscribe anyone.
"""
from __future__ import annotations
import os
from html import escape
from typing import Optional

from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from lib.email_governance import (
    verify_email_token, record_consent, suppress, is_suppressed,
)

email_prefs_router = APIRouter(tags=["email-prefs"])

# A MUTATING opt-in via an email link must use a recent, preferences-scoped
# token (not a long-lived one-click unsubscribe link). Opt-OUT has no age limit.
PREFS_OPTIN_MAX_AGE_DAYS = 30

_db = None
_user_dep = None


def init_email_prefs_routes(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


def _frontend_base() -> str:
    return (os.environ.get("FRONTEND_URL") or os.environ.get("PUBLIC_APP_URL")
            or "https://wayly.com.au").rstrip("/")


def _mask(email: str) -> str:
    try:
        name, dom = email.split("@", 1)
        host = dom.split(".")[0]
        tld = dom.rsplit(".", 1)[-1]
        return f"{name[0]}***@{host[0]}***.{tld}"
    except Exception:
        return "your email"


def _confirm_page(token: str, *, done: bool = False, invalid: bool = False) -> str:
    base = _frontend_base()
    action = f"{base}/api/email/unsubscribe?token={escape(token)}"
    if invalid:
        inner = "<h1>Link not recognised</h1><p>This unsubscribe link is invalid or has expired.</p>"
    elif done:
        inner = ("<h1>You're unsubscribed</h1>"
                 "<p>You will no longer receive marketing emails from Wayly. "
                 "Account and service emails (verification, security and billing) still apply.</p>")
    else:
        inner = (
            "<h1>Unsubscribe from Wayly marketing emails?</h1>"
            "<p>Click the button to stop receiving guides, product updates and news. "
            "This does not affect account, security or billing emails.</p>"
            f"<form method='POST' action='{action}'>"
            "<button type='submit' style='background:#0E4D52;color:#fff;border:0;border-radius:999px;"
            "padding:12px 24px;font-size:16px;cursor:pointer'>Unsubscribe</button></form>"
        )
    return (
        "<!doctype html><html lang='en'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<meta name='robots' content='noindex'><title>Wayly email preferences</title></head>"
        "<body style='font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#FBF8F3;"
        "color:#13303A;margin:0;padding:48px 20px'>"
        f"<div style='max-width:520px;margin:0 auto;background:#fff;border:1px solid #e7e0d6;"
        f"border-radius:16px;padding:32px'>{inner}"
        "<p style='color:#8a8378;font-size:13px;margin-top:24px'>Wayly Pty Ltd · wayly.com.au</p>"
        "</div></body></html>"
    )


# --------------------------------------------------------------------------
# Token-based (logged-out, from email links)
# --------------------------------------------------------------------------
@email_prefs_router.get("/email/preferences")
async def get_prefs(token: str = Query(...)):
    data = verify_email_token(token)
    if not data:
        raise HTTPException(status_code=400, detail="Invalid or expired link")
    user = await _db.users.find_one({"id": data["u"]}, {"_id": 0})
    if not user or user.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Account not found")
    return {
        "ok": True,
        "email_masked": _mask(user.get("email", "")),
        "marketing_opted_in": bool(user.get("marketing_consent")),
        "suppressed": await is_suppressed(_db, user.get("email", "")),
    }


class _PrefsBody(BaseModel):
    token: str
    marketing_opted_in: bool


@email_prefs_router.post("/email/preferences")
async def set_prefs(body: _PrefsBody):
    if body.marketing_opted_in:
        # Re-subscribing is a MUTATING opt-in → require an affirmative, recent,
        # preferences-scoped token. A one-click unsubscribe (purpose="unsub")
        # or a stale link can NEVER turn marketing back on.
        data = verify_email_token(body.token, expected_purpose="prefs",
                                  max_age_days=PREFS_OPTIN_MAX_AGE_DAYS)
        if not data:
            raise HTTPException(status_code=403, detail=(
                "To turn marketing emails back on, use the toggle in your Wayly "
                "account settings, or request a fresh preferences link."))
    else:
        data = verify_email_token(body.token)
        if not data:
            raise HTTPException(status_code=400, detail="Invalid or expired link")
    user = await _db.users.find_one({"id": data["u"]}, {"_id": 0})
    if not user or user.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Account not found")
    await record_consent(_db, user_id=user["id"], email=user.get("email", ""),
                         opted_in=body.marketing_opted_in, source="preferences_page")
    if not body.marketing_opted_in:
        await suppress(_db, email=user.get("email", ""), reason="unsubscribe",
                       permanent=True, meta={"source": "preferences_page"})
    return {"ok": True, "marketing_opted_in": body.marketing_opted_in}


@email_prefs_router.get("/email/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_confirm(token: str = Query(...)):
    # SCANNER-SAFE: a GET never mutates. We only render a confirm page.
    data = verify_email_token(token)
    return HTMLResponse(_confirm_page(token, invalid=not data))


@email_prefs_router.post("/email/unsubscribe", response_class=HTMLResponse)
async def unsubscribe_do(request: Request, token: Optional[str] = Query(None)):
    tok = token
    if not tok:
        try:
            form = await request.form()
            tok = form.get("token")
        except Exception:
            tok = None
    data = verify_email_token(tok or "")
    if not data:
        return HTMLResponse(_confirm_page(tok or "", invalid=True), status_code=400)
    user = await _db.users.find_one({"id": data["u"]}, {"_id": 0})
    if user and not user.get("deleted_at"):
        await record_consent(_db, user_id=user["id"], email=user.get("email", ""),
                             opted_in=False, source="unsubscribe")
        await suppress(_db, email=user.get("email", ""), reason="unsubscribe",
                       permanent=True, meta={"source": "list-unsubscribe"})
    return HTMLResponse(_confirm_page(tok or "", done=True))


# --------------------------------------------------------------------------
# Authenticated (in-app Settings toggle, web + mobile)
# --------------------------------------------------------------------------
@email_prefs_router.get("/account/marketing-preferences")
async def get_my_prefs(request: Request):
    user = await _user_dep(request)
    return {
        "marketing_opted_in": bool(user.get("marketing_consent")),
        "suppressed": await is_suppressed(_db, user.get("email", "")),
    }


class _MyPrefsBody(BaseModel):
    marketing_opted_in: bool


@email_prefs_router.patch("/account/marketing-preferences")
async def set_my_prefs(body: _MyPrefsBody, request: Request):
    user = await _user_dep(request)
    await record_consent(_db, user_id=user["id"], email=user.get("email", ""),
                         opted_in=body.marketing_opted_in, source="settings")
    if not body.marketing_opted_in:
        await suppress(_db, email=user.get("email", ""), reason="unsubscribe",
                       permanent=True, meta={"source": "settings"})
    return {"ok": True, "marketing_opted_in": body.marketing_opted_in}
