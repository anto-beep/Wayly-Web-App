"""Wayly — backend API."""
import os
import io
import csv
import logging
import re
import statistics
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Optional, Dict
from typing import Literal as _LiteralType  # noqa: F401

from collections import defaultdict
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Request, Response, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pypdf import PdfReader

from auth import (
    hash_password,
    verify_password,
    create_token,
    get_current_user_id,
)
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
    )


async def _user_public_with_sub(u: dict) -> UserPublic:
    """Fetch the subscription doc and build a UserPublic with trial info."""
    sub = await db.subscriptions.find_one({"user_id": u["id"]}, {"_id": 0})
    return _user_public(u, sub)


# ----------------- auth -----------------
@api.post("/auth/signup", response_model=TokenResponse)
async def signup(payload: SignupRequest):
    existing = await db.users.find_one({"email": payload.email.lower()})
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
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
    token = create_token(user_doc["id"])
    return TokenResponse(token=token, user=await _user_public_with_sub(user_doc))


@api.post("/auth/login", response_model=TokenResponse)
async def login(payload: LoginRequest):
    user = await db.users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user["id"])
    return TokenResponse(token=token, user=await _user_public_with_sub(user))


@api.get("/auth/me", response_model=UserPublic)
async def me(user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    return await _user_public_with_sub(u)


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
    token = create_token(user["id"])
    return TokenResponse(token=token, user=await _user_public_with_sub(user))


@api.post("/auth/logout")
async def logout(response: Response, user_id: str = Depends(get_current_user_id)):
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
                    f"<p><a href='{reset_url}' style='display:inline-block;background:#1F3A5F;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none'>Reset password</a></p>"
                    f"<p style='color:#6B7280;font-size:13px'>This link expires in 60 minutes. If you didn't request this, ignore this email — your password has not changed.</p>"
                ),
            )
        except Exception as e:
            logger.warning("Password reset email send failed: %s", e)
    return {"ok": True}


@api.post("/auth/reset")
async def reset_password(body: ResetBody):
    rec = await db.password_resets.find_one({"token": body.token, "used": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    expires = datetime.fromisoformat(rec["expires_at"])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="Reset link has expired — request a new one")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}})
    await db.password_resets.update_one({"token": body.token}, {"$set": {"used": True, "used_at": now_iso()}})
    u = await _get_user(rec["user_id"])
    return {"ok": True, "email": u["email"]}


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
                f"<p><a href='{verify_url}' style='display:inline-block;background:#D4A24E;color:#1F3A5F;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600'>Confirm email</a></p>"
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
                f"<p><a href='{accept_url}' style='display:inline-block;background:#D4A24E;color:#1F3A5F;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600'>Accept invitation</a></p>"
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
            f"<td style='padding:6px 8px;text-align:right;color:{'#A0522D' if pct > 100 else '#1F3A5F'};'>{pct:.0f}%</td></tr>"
        )

    anom_html = "".join(
        f"<li><strong>[{(a.get('severity') or 'info').upper()}]</strong> {a.get('title','')}<br>"
        f"<span style='color:#5A6470;font-size:13px;'>{(a.get('detail') or '')[:200]}{'…' if len(a.get('detail') or '') > 200 else ''}"
        f" <em style='color:#9aa3b0'>(from {a.get('_period','')})</em></span></li>"
        for a in top_anoms
    ) or "<li style='color:#5A6470;'>No anomalies caught this quarter — looking good!</li>"

    note_block = (
        f"<blockquote style='border-left:3px solid #D4A574;margin:12px 0;padding:6px 12px;color:#1F3A5F;background:#fdf6ec;'>"
        f"{(body.note or '').replace('<', '&lt;').replace('>', '&gt;')}</blockquote>"
        if body.note and body.note.strip() else ""
    )

    body_html = f"""
        <p>Hi,</p>
        <p>{sender.get('name') or 'Your family caregiver'} is sharing this Wayly dashboard snapshot for <strong>{h.get('participant_name','')}</strong> ({q_label}).</p>
        {note_block}
        <h3 style='font-family:Georgia,serif;color:#1F3A5F;margin-top:24px;'>Budget this quarter</h3>
        <table style='border-collapse:collapse;width:100%;font-size:14px;'>
            <thead>
                <tr style='background:#F5F1EA;color:#5A6470;text-align:left;'>
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
        <h3 style='font-family:Georgia,serif;color:#1F3A5F;margin-top:24px;'>Lifetime contribution cap</h3>
        <p>{fmt(contributions_total)} of {fmt(cap_amount)} ({(contributions_total / cap_amount * 100) if cap_amount else 0:.2f}% used)</p>
        <h3 style='font-family:Georgia,serif;color:#1F3A5F;margin-top:24px;'>Top anomalies to know</h3>
        <ul style='font-size:14px;line-height:1.55;color:#1F3A5F;'>{anom_html}</ul>
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
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    from document_extract import (
        extract_document, UnsupportedFormatError, FileTooLargeError,
        CorruptFileError, PasswordProtectedError,
    )
    try:
        text, input_method, page_count, parse_warnings = await extract_document(file.filename or "", raw)
    except UnsupportedFormatError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except FileTooLargeError as e:
        mb = e.limit_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"This {e.ext} file exceeds the {mb} MB limit. Try compressing it or splitting into smaller parts.")
    except PasswordProtectedError:
        raise HTTPException(status_code=400, detail="This PDF is password-protected. Open it in your PDF viewer, remove the password, save a new copy, and upload that file.")
    except CorruptFileError as e:
        raise HTTPException(status_code=400, detail=f"This file appears to be damaged or unreadable: {e}")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Could not extract text from file. Try a clearer photo or paste the text directly.")
    # Stash the original bytes so the user can re-download the source PDF / CSV / TXT later.
    import base64 as _b64
    file_b64 = _b64.b64encode(raw).decode("ascii")
    mime = file.content_type or _guess_statement_mime(file.filename)
    job_id = _submit_upload_job(
        text, file.filename, h["id"], user_id, user["name"],
        file_b64=file_b64, file_mimetype=mime, file_size=len(raw),
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
async def list_statements(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = (
        await db.statements
        .find({"household_id": h["id"]}, {"_id": 0, "file_b64": 1, "id": 1, "household_id": 1, "filename": 1, "period_label": 1, "uploaded_at": 1, "line_items": 1, "summary": 1, "anomalies": 1, "raw_text_preview": 1, "file_mimetype": 1, "file_size_bytes": 1})
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
async def current_budget(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    classification = h["classification"]
    q_start, q_end, q_label = budget_lib.get_quarter_window()
    allocations = budget_lib.stream_allocations(classification)
    quarterly_total = budget_lib.quarterly_budget(classification)

    docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0}).to_list(200)
    all_items: List[dict] = []
    for s in docs:
        all_items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(all_items, q_start, q_end)
    contributions_total = budget_lib.compute_contributions(all_items)

    streams = []
    for s in budget_lib.STREAMS:
        spent = burn.get(s, 0.0)
        cap = allocations[s]
        streams.append({
            "stream": s,
            "allocated": cap,
            "spent": spent,
            "remaining": round(cap - spent, 2),
            "pct": round((spent / cap * 100) if cap else 0, 1),
        })

    cap_amount = budget_lib.lifetime_cap(h.get("is_grandfathered", False))
    return {
        "classification": classification,
        "classification_label": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual_total": budget_lib.CLASSIFICATIONS[classification]["annual"],
        "quarter_label": q_label,
        "quarter_start": q_start.isoformat(),
        "quarter_end": q_end.isoformat(),
        "quarterly_total": quarterly_total,
        "rollover_cap": budget_lib.rollover_cap(classification),
        "streams": streams,
        "lifetime_cap": cap_amount,
        "lifetime_contributions": contributions_total,
        "lifetime_pct": round((contributions_total / cap_amount * 100) if cap_amount else 0, 2),
        "is_grandfathered": h.get("is_grandfathered", False),
    }


# ----------------- chat -----------------
@api.post("/chat")
async def chat(payload: ChatRequest, user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    user = await _get_user(user_id)
    classification = h["classification"]
    q_start, q_end, q_label = budget_lib.get_quarter_window()

    # Latest statement summary
    latest = await db.statements.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("uploaded_at", -1).limit(1).to_list(1)
    latest_summary = latest[0].get("summary") if latest else "No statements uploaded yet."

    docs = await db.statements.find({"household_id": h["id"]}, {"_id": 0}).to_list(200)
    items: List[dict] = []
    for s in docs:
        items.extend(s.get("line_items", []))
    burn = budget_lib.compute_burn(items, q_start, q_end)
    contributions_total = budget_lib.compute_contributions(items)
    cap_amount = budget_lib.lifetime_cap(h.get("is_grandfathered", False))

    burn_str = ", ".join(f"{k}: ${v:,.2f}" for k, v in burn.items())
    context = {
        "caregiver_name": user["name"],
        "participant_name": h["participant_name"],
        "classification": budget_lib.CLASSIFICATIONS[classification]["label"],
        "annual": budget_lib.CLASSIFICATIONS[classification]["annual"],
        "quarterly": budget_lib.quarterly_budget(classification),
        "provider": h["provider_name"],
        "quarter_label": q_label,
        "burn": burn_str or "no spend recorded yet",
        "contributions_total": contributions_total,
        "cap": cap_amount,
        "statement_summary": latest_summary or "No statements uploaded yet.",
    }
    session_id = payload.session_id or f"chat-{h['id']}"
    reply_text = await chat_with_kindred(payload.message, session_id, context)

    # persist
    user_turn = ChatTurn(household_id=h["id"], role="user", content=payload.message)
    asst_turn = ChatTurn(household_id=h["id"], role="assistant", content=reply_text)
    await db.chat_turns.insert_many([user_turn.model_dump(), asst_turn.model_dump()])
    return {"reply": reply_text, "session_id": session_id}


@api.get("/chat/history")
async def chat_history(user_id: str = Depends(get_current_user_id)):
    h = await _require_household(user_id)
    docs = await db.chat_turns.find({"household_id": h["id"]}, {"_id": 0}) \
        .sort("created_at", 1).to_list(500)
    return docs


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
PAID_PLANS = {"solo", "family", "advisor", "advisor_pro"}


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


async def _require_paid_plan(request: Request, response: Response, tool_label: str = "This tool") -> dict:
    """Dependency: only Solo/Family/Advisor or active trial may call gated tools.

    401 for unauthenticated. 403 for Free / expired-trial. Returns the user.
    """
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

    - Logged-in Solo/Family/trial users bypass entirely (no cookie touch).
    - Logged-in Free users + unauthenticated visitors get 1 free decode per
      24h, tracked via HttpOnly cookie.
    - 429 with next_available_at when limit hit.
    """
    user = await _user_from_request(request)
    if user:
        plan = (user.get("plan") or "free").lower()
        if plan in PAID_PLANS or _trial_active(user):
            return {"user": user, "is_free_use": False}
    used_at = _sd_cookie_used_recently(request)
    if used_at:
        next_at = used_at + timedelta(seconds=SD_WINDOW_SECONDS)
        raise HTTPException(
            status_code=429,
            detail={
                "error": "daily_limit",
                "message": "You've used your free decode for today. Come back tomorrow — or sign up for unlimited access.",
                "next_available_at": next_at.isoformat(),
                "used_at": used_at.isoformat(),
            },
        )
    # First use today — also enforce the global IP rate limit as a soft cap
    _check_rate_limit(_client_ip(request))
    _set_sd_cookie(response)
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
PRICE_BENCHMARKS = {
    "Domestic assistance — cleaning": {"median": 76.0, "cap": 82.0},
    "Personal care": {"median": 84.0, "cap": 90.0},
    "Occupational therapy": {"median": 155.0, "cap": 165.0},
    "Physiotherapy": {"median": 145.0, "cap": 158.0},
    "Social support": {"median": 70.0, "cap": 78.0},
    "Transport — community access": {"median": 35.0, "cap": 38.0},
    "Home maintenance / gardening": {"median": 75.0, "cap": 82.0},
    "Meal preparation": {"median": 68.0, "cap": 74.0},
    "Nursing — registered": {"median": 165.0, "cap": 178.0},
    "Allied health — podiatry": {"median": 130.0, "cap": 140.0},
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
        extracted = await extract_statement(text, household_id=household_id)
        job["phase"] = "audit"
        audit = await audit_statement(extracted, household_id=household_id)

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

        # Map audit anomalies to the existing Anomaly model.
        anomalies: List[Anomaly] = []
        for a in (audit.get("anomalies") or []):
            if not isinstance(a, dict):
                continue
            sev = _SEVERITY_DISPLAY_MAP.get((a.get("severity") or "").lower(), "info")
            anomalies.append(Anomaly(
                severity=sev,
                title=str(a.get("headline") or a.get("title") or "Item flagged"),
                detail=str(a.get("detail") or ""),
                suggested_action=a.get("suggested_action"),
            ))

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
        )
        await db.statements.insert_one(statement.model_dump())
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
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    from document_extract import (
        extract_document, UnsupportedFormatError, FileTooLargeError,
        CorruptFileError, PasswordProtectedError,
    )
    try:
        text, input_method, page_count, parse_warnings = await extract_document(file.filename or "", raw)
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
    job_id = _submit_decode_job(
        text, input_method=input_method, document_pages=page_count,
        parsing_warnings=parse_warnings, original_filename=file.filename,
    )
    return {"job_id": job_id, "status": "pending"}


@api.post("/public/budget-calc")
async def public_budget_calc(body: PublicBudgetBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Budget Calculator")
    classification = body.classification
    annual = budget_lib.CLASSIFICATIONS[classification]["annual"]
    quarterly = budget_lib.quarterly_budget(classification)
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
        "quarterly_total": quarterly,
        "rollover_cap": rollover,
        "streams": [
            {"stream": s, "allocated": allocations[s]} for s in budget_lib.STREAMS
        ],
        "lifetime_cap": cap_amount,
        "lifetime_contributions": contributions,
        "lifetime_pct": round(pct, 2),
        "years_to_cap": years_to_cap,
        "is_grandfathered": body.is_grandfathered,
    }


@api.post("/public/price-check")
async def public_price_check(body: PublicPriceBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Provider Price Checker")
    bench = PRICE_BENCHMARKS.get(body.service, {"median": body.rate, "cap": body.rate})
    median = bench["median"]
    cap = bench["cap"]
    delta_pct = ((body.rate - median) / median * 100) if median else 0.0
    if body.rate > cap:
        verdict, label = "high", "Above the 1 July 2026 cap"
        assessment = (
            f"At ${body.rate:.2f}/unit, this is above the published 1 July 2026 cap of "
            f"${cap:.2f}. From that date, providers cannot exceed the cap."
        )
        suggested = "Ask the provider for a corrected rate, or raise it with the Aged Care Quality and Safety Commission."
    elif body.rate > median * 1.10:
        verdict, label = "high", "Higher than the typical rate"
        assessment = (
            f"At ${body.rate:.2f}/unit, this is about {delta_pct:.0f}% above the network median "
            f"of ${median:.2f}. Worth asking the provider why."
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
            f"At ${body.rate:.2f}/unit, you're within typical range for {body.service.lower()} "
            f"(network median ${median:.2f}, 1 Jul 2026 cap ${cap:.2f})."
        )
        suggested = None

    return {
        "service": body.service,
        "charged": body.rate,
        "median": median,
        "cap": cap,
        "delta_pct": round(delta_pct, 2),
        "verdict": verdict,
        "verdict_label": label,
        "assessment": assessment,
        "suggested_action": suggested,
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
PENSION_RATES = {
    "full":      {"clinical": 0.0, "independence": 0.05, "everyday_living": 0.175},
    "part":      {"clinical": 0.0, "independence": 0.175, "everyday_living": 0.50},
    "self":      {"clinical": 0.0, "independence": 0.50, "everyday_living": 0.80},
}


class PublicContributionBody(BaseModel):
    classification: int = Field(ge=1, le=8)
    pension_status: str = Field(pattern="^(full|part|self)$")
    is_grandfathered: bool = False
    expected_mix_clinical_pct: float = Field(ge=0, le=100, default=30)
    expected_mix_independence_pct: float = Field(ge=0, le=100, default=45)
    expected_mix_everyday_pct: float = Field(ge=0, le=100, default=25)


@api.post("/public/contribution-estimator")
async def public_contribution_estimator(body: PublicContributionBody, request: Request, response: Response):
    await _require_paid_plan(request, response, "Contribution Estimator")
    total_pct = body.expected_mix_clinical_pct + body.expected_mix_independence_pct + body.expected_mix_everyday_pct
    if total_pct < 95 or total_pct > 105:
        raise HTTPException(status_code=400, detail="Service mix percentages should sum to 100")
    rates = PENSION_RATES[body.pension_status]
    quarterly = budget_lib.quarterly_budget(body.classification)
    annual_service = quarterly * 4
    clin = annual_service * (body.expected_mix_clinical_pct / 100)
    ind = annual_service * (body.expected_mix_independence_pct / 100)
    ev = annual_service * (body.expected_mix_everyday_pct / 100)
    contrib_clin = clin * rates["clinical"]
    contrib_ind = ind * rates["independence"]
    contrib_ev = ev * rates["everyday_living"]
    annual_contrib = round(contrib_clin + contrib_ind + contrib_ev, 2)
    quarterly_contrib = round(annual_contrib / 4, 2)
    cap = budget_lib.lifetime_cap(body.is_grandfathered)
    years_to_cap = round(cap / annual_contrib, 1) if annual_contrib > 0 else None
    return {
        "annual_service_total": round(annual_service, 2),
        "annual_contribution": annual_contrib,
        "quarterly_contribution": quarterly_contrib,
        "per_stream": [
            {"stream": "Clinical", "annual_charged": round(clin, 2), "annual_contribution": round(contrib_clin, 2), "rate_pct": rates["clinical"] * 100},
            {"stream": "Independence", "annual_charged": round(ind, 2), "annual_contribution": round(contrib_ind, 2), "rate_pct": rates["independence"] * 100},
            {"stream": "Everyday Living", "annual_charged": round(ev, 2), "annual_contribution": round(contrib_ev, 2), "rate_pct": rates["everyday_living"] * 100},
        ],
        "lifetime_cap": cap,
        "years_to_cap": years_to_cap,
        "pension_status": body.pension_status,
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
# Public status — uptime, last ingestion, model versions, dependency health.
# Intentionally public + cache-friendly; safe values only.
# ---------------------------------------------------------------------------
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
    "You are Wayly's friendly help bot, available on every page of wayly.com.au. "
    "You answer site-visitor questions about Wayly itself — pricing, plans, AI tools, "
    "the Support at Home program, and how to use the product. Keep replies short: "
    "1-3 sentences ideally, max 80 words. Use Australian English and a calm, plain tone.\n\n"
    "WHAT KINDRED IS\n"
    "Wayly is an aged-care concierge for Australian families navigating the Support at "
    "Home program (effective 1 Nov 2025). It is provider-agnostic — never takes commissions, "
    "never sells data. The primary user is the adult-child caregiver; the participant is "
    "the older parent.\n\n"
    "PLANS\n"
    "- Free $0/mo: 1 free Statement Decoder use per day. No card required.\n"
    "- Solo $19/mo: unlimited use of all 8 AI tools, dashboard, statement uploads.\n"
    "- Family $39/mo (most popular): everything in Solo + up to 5 household members + "
    "weekly digest + concierge support.\n"
    "- Advisor plans for financial advisors at $299 and $999. New paid users get a "
    "7-day free trial — no card required for the trial.\n\n"
    "AI TOOLS (8 total)\n"
    "1. Statement Decoder (free, 1/day) — upload, photograph or paste a Support at Home "
    "monthly statement; get plain-English breakdown + anomaly flags. Accepts PDF, Word, "
    "TXT, and photos (JPG/PNG/HEIC/WEBP).\n"
    "2. Budget & Lifetime Cap Calculator (Solo+).\n"
    "3. Provider Price Checker (Solo+).\n"
    "4. Classification Self-Check (Solo+).\n"
    "5. Reassessment Letter Generator (Solo+).\n"
    "6. Contribution Estimator (Solo+).\n"
    "7. Care Plan Reviewer (Solo+).\n"
    "8. Family Care Coordinator chat (Solo+).\n\n"
    "KEY FEATURES\n"
    "- Caregiver dashboard: per-stream budget cards, lifetime cap progress, anomaly alerts.\n"
    "- Participant view: huge text, voice-first, single-action UX with wellbeing check-in.\n"
    "- Family thread + immutable audit log (Family plan).\n"
    "- Resources hub: glossary (37 terms), templates, articles.\n"
    "- Statement Decoder anomaly engine: ~20 named rules including duplicate detection, "
    "weekend-rate checks, brokered-rate premiums, AT-HM commitment tracking.\n\n"
    "BOUNDARIES (HARD RULES)\n"
    "- Never give clinical or financial-product advice. Redirect to a GP / FAAA-registered "
    "adviser / My Aged Care on 1800 200 422.\n"
    "- Never recommend a specific provider.\n"
    "- Never invent dollar figures, dates, section numbers, or URLs. If unsure say "
    "'I'm not sure — the best place to confirm is My Aged Care on 1800 200 422'.\n"
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
    out: dict = {"reply": str(reply or ""), "session_id": sid}
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
    return {"reply": str(reply or ""), "session_id": sid}


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


# ---------------------------------------------------------------------------
# Family weekly digest
# ---------------------------------------------------------------------------
@api.get("/digest/preview")
async def digest_preview(user_id: str = Depends(get_current_user_id)):
    household = await _get_user_household(user_id)
    if not household:
        raise HTTPException(status_code=400, detail="Create a household first")
    return await digest_service.build_digest(db, household)


@api.post("/digest/send")
async def digest_send(user_id: str = Depends(get_current_user_id)):
    u = await _get_user(user_id)
    if u.get("plan") != "family":
        raise HTTPException(status_code=402, detail={"code": "plan_required", "message": "Family plan required to send digests."})
    household = await _get_user_household(user_id)
    if not household:
        raise HTTPException(status_code=400, detail="Create a household first")
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
    digest = await digest_service.build_digest(db, household)
    res = await digest_service.send_digest_to_members(db, household, recipients, digest)
    await _audit(household["id"], user_id, u["name"], "DIGEST_SENT", f"Sent to {len(recipients)} recipient(s)")
    try:
        await create_notification(user_id, "weekly_digest", "Weekly digest sent", f"Sent to {len(recipients)} people.", "/settings/members")
    except Exception:
        pass
    return {"ok": True, "recipients": recipients, "summary": res.get("results")}


@api.get("/digest/history")
async def digest_history(user_id: str = Depends(get_current_user_id)):
    household = await _get_user_household(user_id)
    if not household:
        return {"items": []}
    cur = db.digest_sends.find({"household_id": household["id"]}, {"_id": 0}).sort("sent_at", -1).limit(12)
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
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "email": f"deleted+{user_id}@kindred.local",
            "name": "Deleted user",
            "password_hash": "",
            "deleted_at": now_iso(),
            "plan": "free",
            "household_id": None,
        }},
    )
    await db.subscriptions.update_many({"user_id": user_id}, {"$set": {"status": "cancelled", "cancel_at_period_end": True}})
    await db.household_members.update_many({"user_id": user_id}, {"$set": {"status": "removed", "removed_at": now_iso()}})
    await db.user_sessions.delete_many({"user_id": user_id})
    return {"ok": True}



# ---------------------------------------------------------------------------
# Stripe billing
# ---------------------------------------------------------------------------
PLAN_PRICES = {
    "solo": {"amount": 19.00, "currency": "aud", "label": "Wayly Solo"},
    "family": {"amount": 39.00, "currency": "aud", "label": "Wayly Family"},
}


class CheckoutBody(BaseModel):
    plan: _LiteralType["solo", "family"]
    origin_url: str = Field(min_length=8, max_length=200)


class StartTrialBody(BaseModel):
    plan: _LiteralType["solo", "family"]


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
    plan: _LiteralType["solo", "family"]


@api.post("/billing/upgrade")
async def upgrade_downgrade(body: UpgradeBody, user_id: str = Depends(get_current_user_id)):
    sub = await db.subscriptions.find_one({"user_id": user_id, "status": {"$in": ["trialing", "active"]}}, {"_id": 0})
    if not sub:
        raise HTTPException(status_code=400, detail="No active plan — start one from /pricing")
    if sub.get("plan") == body.plan:
        return {"ok": True, "unchanged": True}
    prev_plan = sub.get("plan") or "free"
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
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"ok": False}
    body = await request.body()
    sig = request.headers.get("Stripe-Signature", "")
    try:
        stripe = StripeCheckout(api_key=api_key, webhook_url="")
        ev = await stripe.handle_webhook(body, sig)
    except Exception as e:
        logger.warning("Stripe webhook parse failed: %s", e)
        return {"ok": False}
    if (ev.payment_status or "").lower() == "paid" and ev.session_id:
        tx = await db.payment_transactions.find_one({"session_id": ev.session_id})
        if tx and tx.get("payment_status") != "paid":
            await db.users.update_one({"id": tx["user_id"]}, {"$set": {"plan": tx["plan"]}})
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
        except Exception:
            pass
    return {"ok": True}


from admin_routes import admin as admin_router
from admin_auth import router as admin_auth_router
from admin_phase_d import phase_d_admin, phase_d_user
from admin_phase_e import phase_e, phase_e_public, phase_e_invite_public
from admin_phase_e2 import cms_admin, cms_public
from admin_devices import devices_router as admin_devices_router
from seo_routes import seo_public as seo_public_router
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

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    )
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
    )
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
    )
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
async def _start_health_watchdog():
    import health_watchdog
    await health_watchdog.start()


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
    client.close()
