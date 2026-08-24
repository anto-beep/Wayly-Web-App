"""Wayly Batch 3, accounts, participants v2, billing, free-tier monthly gate."""
from __future__ import annotations
import os
import re
import hashlib
import logging
import secrets
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Query
from pydantic import BaseModel, Field

from batch3_models import (
    BasePlan, PlanStatus, PLAN_PRICES_MONTHLY, ADDON_PRICE_MONTHLY,
    SEAT_LIMITS, PARTICIPANT_BASE_INCLUDED, MAX_PARTICIPANTS_PER_ACCOUNT,
    Account, ParticipantAddOn, ParticipantV2, AccountMember, FreeToolUsage,
    ParticipantCreateV2, ParticipantRemoveBody, HardDeleteBody,
    _new_id, _now_iso,
)
import email_service

logger = logging.getLogger("wayly.batch3")

batch3_router = APIRouter(tags=["batch3"])

_db = None
_user_dep = None  # async (Request) -> user, 401 if no JWT


def init_batch3_routes(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


# ============================================================================
# Migration, accounts + participants v2 backfill
# ============================================================================
async def migrate_batch3() -> Dict[str, int]:
    """Idempotent. Creates one account per user, one owner-row in account_members,
    and rebuilds the participants collection from existing households."""
    if _db is None:
        return {"accounts": 0, "members": 0, "participants": 0}
    accounts_created = 0
    members_created = 0
    participants_created = 0

    async for user in _db.users.find({}, {"_id": 0}):
        uid = user.get("id")
        if not uid:
            continue
        acct = await _db.accounts.find_one({"owner_user_id": uid}, {"_id": 0})
        if not acct:
            # Map existing user.plan → base_plan
            old_plan = (user.get("plan") or "free").lower()
            base_plan = {
                "free": "FREE", "solo": "SOLO", "family": "FAMILY",
                "adviser": "ADVISER", "adviser_pro": "ADVISER_PRO",
            }.get(old_plan, "FREE")
            acct_doc = Account(owner_user_id=uid, base_plan=base_plan).model_dump()
            await _db.accounts.insert_one(acct_doc)
            accounts_created += 1
            acct = acct_doc

        # Owner member row
        existing_member = await _db.account_members.find_one(
            {"account_id": acct["id"], "user_id": uid}, {"_id": 0}
        )
        if not existing_member:
            await _db.account_members.insert_one(AccountMember(
                account_id=acct["id"], user_id=uid, role="OWNER",
                accepted_at=_now_iso(), email=user.get("email"), name=user.get("name"),
            ).model_dump())
            members_created += 1

        # Backfill participants v2 from the user's household, if any
        hid = user.get("household_id")
        if not hid:
            continue
        existing_p = await _db.participants.find_one({"account_id": acct["id"]}, {"_id": 0})
        if existing_p:
            continue
        h = await _db.households.find_one({"id": hid}, {"_id": 0})
        if not h:
            continue
        name_full = (h.get("participant_name") or "Participant").strip()
        first = name_full.split()[0] if name_full else "Participant"
        last = " ".join(name_full.split()[1:]) if len(name_full.split()) > 1 else ""
        new_p = ParticipantV2(
            account_id=acct["id"],
            household_id=hid,
            first_name=first,
            last_name=last,
            classification=int(h.get("classification") or 4),
            provider_name=h.get("provider_name"),
            household_email=_make_household_email(first),
            is_primary=True,
            status="ACTIVE",
            color_index=0,
        ).model_dump()
        # Drop any legacy v1 docs for this account so the reset is clean
        await _db.participants.delete_many({"account_id": acct["id"]})
        await _db.participants.insert_one(new_p)
        participants_created += 1

    if accounts_created or participants_created:
        logger.info("Batch3 migration: accounts=%d members=%d participants=%d",
                    accounts_created, members_created, participants_created)
    return {"accounts": accounts_created, "members": members_created, "participants": participants_created}


def _make_household_email(first_name: str) -> str:
    safe = re.sub(r"[^a-z0-9]+", "", (first_name or "wayly").lower())[:24] or "wayly"
    shortcode = secrets.token_hex(3)  # 6-char hex
    return f"{safe}-{shortcode}@in.wayly.com.au"


def _strip(d: dict) -> dict:
    return {k: v for k, v in (d or {}).items() if k != "_id"}


# ============================================================================
# Account helpers
# ============================================================================
async def _account_for_user(user: dict) -> dict:
    """Return the account this user belongs to (as owner or member). Creates
    an empty FREE account on the fly if neither exists (defensive)."""
    member = await _db.account_members.find_one(
        {"user_id": user["id"], "status": "ACTIVE"}, {"_id": 0}
    )
    if member:
        acct = await _db.accounts.find_one({"id": member["account_id"]}, {"_id": 0})
        if acct:
            return acct
    acct = await _db.accounts.find_one({"owner_user_id": user["id"]}, {"_id": 0})
    if acct:
        return acct
    # Defensive auto-create
    new_acct = Account(owner_user_id=user["id"], base_plan=(user.get("plan") or "free").upper()).model_dump()
    await _db.accounts.insert_one(new_acct)
    await _db.account_members.insert_one(AccountMember(
        account_id=new_acct["id"], user_id=user["id"], role="OWNER",
        accepted_at=_now_iso(), email=user.get("email"), name=user.get("name"),
    ).model_dump())
    return new_acct


async def _require_owner(user: dict) -> dict:
    """Returns the account where this user is OWNER. 403 otherwise."""
    acct = await _account_for_user(user)
    if acct.get("owner_user_id") != user["id"]:
        raise HTTPException(status_code=403, detail={"error": "owner_only", "message": "Only the account owner can do this."})
    return acct


async def _active_participants(account_id: str) -> List[dict]:
    cur = _db.participants.find(
        {"account_id": account_id, "status": "ACTIVE"}, {"_id": 0}
    ).sort("is_primary", -1).limit(MAX_PARTICIPANTS_PER_ACCOUNT + 5)
    return [p async for p in cur]


async def _active_members(account_id: str) -> List[dict]:
    cur = _db.account_members.find(
        {"account_id": account_id, "status": "ACTIVE"}, {"_id": 0}
    ).limit(100)
    return [m async for m in cur]


def _account_summary(acct: dict, participants: List[dict], members: List[dict], addons: List[dict]) -> dict:
    base_plan = acct["base_plan"]
    base_price = PLAN_PRICES_MONTHLY.get(base_plan, 0.0)
    included = PARTICIPANT_BASE_INCLUDED.get(base_plan, 1)
    active_addons = [a for a in addons if a["status"] == "ACTIVE"]
    return {
        "account_id": acct["id"],
        "base_plan": base_plan,
        "base_plan_status": acct.get("base_plan_status", "ACTIVE"),
        "trial_ends_at": acct.get("trial_ends_at"),
        "base_price_monthly": base_price,
        "addon_price_monthly": ADDON_PRICE_MONTHLY,
        "addon_count": len(active_addons),
        "addon_monthly_total": len(active_addons) * ADDON_PRICE_MONTHLY,
        "monthly_total": base_price + len(active_addons) * ADDON_PRICE_MONTHLY,
        "participants_included": included,
        "participants_active": sum(1 for p in participants if p["status"] == "ACTIVE"),
        "participants_max": MAX_PARTICIPANTS_PER_ACCOUNT,
        "seat_limit": SEAT_LIMITS.get(base_plan, 1),
        "seats_used": len([m for m in members if m["status"] == "ACTIVE"]),
        "pending_downgrade_to": acct.get("pending_downgrade_to"),
        "pending_downgrade_at": acct.get("pending_downgrade_at"),
    }


# ============================================================================
# GET /api/account, full picture for the dashboard
# ============================================================================
@batch3_router.get("/account")
async def get_account(request: Request):
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    parts = await _active_participants(acct["id"])
    members = await _active_members(acct["id"])
    addons = [a async for a in _db.participant_add_ons.find({"account_id": acct["id"]}, {"_id": 0}).limit(100)]
    is_owner = acct.get("owner_user_id") == user["id"]
    return {
        "summary": _account_summary(acct, parts, members, addons),
        "participants": parts,
        "members": members,
        "addons": addons,
        "is_owner": is_owner,
    }


# ============================================================================
# PARTICIPANTS V2, list / add / remove / restore / hard-delete
# ============================================================================
@batch3_router.get("/v2/participants")
async def list_v2_participants(request: Request, include_removed: bool = Query(default=False)):
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    q: Dict[str, Any] = {"account_id": acct["id"]}
    if not include_removed:
        q["status"] = "ACTIVE"
    cur = _db.participants.find(q, {"_id": 0}).sort("is_primary", -1).limit(50)
    items = [p async for p in cur]
    return {"items": items, "max": MAX_PARTICIPANTS_PER_ACCOUNT}


@batch3_router.post("/v2/participants/preview")
async def preview_add_participant(request: Request, count: int = Query(default=1, ge=1, le=10)):
    """Pure-compute preview of what adding N participants will cost / which
    plan upgrade is triggered. Used by the Add-participant modal."""
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    parts = await _active_participants(acct["id"])
    base_plan = acct["base_plan"]
    current_count = len(parts)
    target_count = current_count + count

    addons_needed = 0
    new_base_plan = base_plan
    branch = "noop"
    if base_plan == "FREE":
        branch = "upgrade_required"
    elif base_plan == "SOLO":
        if target_count >= 2:
            new_base_plan = "FAMILY"
            addons_needed = max(0, target_count - 2)
            branch = "solo_to_family"
        else:
            branch = "noop"
    elif base_plan == "FAMILY":
        addons_needed = max(0, target_count - 2)
        branch = "family_addons" if addons_needed > 0 else "covered_by_family"
    elif base_plan in ("ADVISER", "ADVISER_PRO"):
        branch = "adviser_included"

    return {
        "branch": branch,
        "current_plan": base_plan,
        "new_plan": new_base_plan,
        "current_participants": current_count,
        "target_participants": target_count,
        "addons_needed": addons_needed,
        "addon_price_monthly": ADDON_PRICE_MONTHLY,
        "addon_monthly_total": addons_needed * ADDON_PRICE_MONTHLY,
        "base_price_monthly": PLAN_PRICES_MONTHLY.get(new_base_plan, 0.0),
        "new_monthly_total": PLAN_PRICES_MONTHLY.get(new_base_plan, 0.0) + addons_needed * ADDON_PRICE_MONTHLY,
    }


@batch3_router.post("/v2/participants")
async def add_v2_participant(payload: ParticipantCreateV2, request: Request):
    user = await _user_dep(request)
    acct = await _require_owner(user)
    parts = await _active_participants(acct["id"])
    base_plan = acct["base_plan"]
    target_count = len(parts) + 1

    # Plan gating
    if base_plan == "FREE":
        raise HTTPException(status_code=402, detail={
            "error": "upgrade_required",
            "message": "Adding a participant requires Solo ($19/mo) or Family ($39/mo).",
            "options": ["SOLO", "FAMILY"],
        })
    if target_count > MAX_PARTICIPANTS_PER_ACCOUNT:
        raise HTTPException(status_code=409, detail={
            "error": "limit",
            "message": f"This account already has {MAX_PARTICIPANTS_PER_ACCOUNT} active participants.",
        })

    # Auto-upgrade Solo → Family when adding participant #2
    plan_upgraded_to = None
    if base_plan == "SOLO" and target_count >= 2:
        await _db.accounts.update_one(
            {"id": acct["id"]},
            {"$set": {"base_plan": "FAMILY", "updated_at": _now_iso()}},
        )
        plan_upgraded_to = "FAMILY"
        # Update legacy user.plan field too so existing gates keep working
        await _db.users.update_one({"id": acct["owner_user_id"]}, {"$set": {"plan": "family"}})

    # Create participant
    # `is_first` is normally derived from count == 0, but the signup flow's
    # "Add one more person" toggle wants to pre-create the SECOND participant
    # before the primary exists (the primary is created a moment later by the
    # user's own onboarding). When the payload sets is_primary=False, honour
    # that so the primary slot stays open.
    default_is_primary = len(parts) == 0
    is_first = default_is_primary if payload.is_primary is None else bool(payload.is_primary and default_is_primary)
    p = ParticipantV2(
        account_id=acct["id"],
        first_name=payload.first_name.strip(),
        last_name=(payload.last_name or "").strip(),
        date_of_birth=payload.date_of_birth,
        classification=payload.classification,
        provider_name=(payload.provider_name or "").strip() or None,
        statement_format=payload.statement_format,
        household_email=_make_household_email(payload.first_name),
        is_primary=is_first,
        status="ACTIVE",
        color_index=(len(parts) % 5),
    )
    await _db.participants.insert_one(p.model_dump())

    # Add-on subscription if this is the 3rd+ on Family plan
    addon_created = None
    effective_plan = plan_upgraded_to or base_plan
    if effective_plan == "FAMILY" and target_count > PARTICIPANT_BASE_INCLUDED["FAMILY"]:
        addon = ParticipantAddOn(
            account_id=acct["id"],
            participant_id=p.id,
            status="ACTIVE",
            activated_at=_now_iso(),
        )
        await _db.participant_add_ons.insert_one(addon.model_dump())
        addon_created = addon.model_dump()

    return {"participant": p.model_dump(), "plan_upgraded_to": plan_upgraded_to, "addon": addon_created}


@batch3_router.delete("/v2/participants/{pid}")
async def remove_v2_participant(pid: str, payload: ParticipantRemoveBody, request: Request):
    user = await _user_dep(request)
    acct = await _require_owner(user)
    p = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    if p.get("is_primary"):
        # Need to promote another active first
        others = [pp for pp in await _active_participants(acct["id"]) if pp["id"] != pid]
        if not others:
            raise HTTPException(status_code=409, detail="Cannot remove the only participant on the account.")
        await _db.participants.update_one({"id": others[0]["id"]}, {"$set": {"is_primary": True}})
    purge_at = (datetime.now(timezone.utc) + timedelta(days=60)).isoformat()
    await _db.participants.update_one(
        {"id": pid, "account_id": acct["id"]},
        {"$set": {
            "status": "PENDING_REMOVAL",
            "is_primary": False,
            "removal_requested_at": _now_iso(),
            "removal_confirmed_at": _now_iso(),
            "data_purge_scheduled_at": purge_at,
            "updated_at": _now_iso(),
        }},
    )
    # Cancel add-on at end of billing period (effectively today since no Stripe attached yet)
    addon = await _db.participant_add_ons.find_one(
        {"account_id": acct["id"], "participant_id": pid, "status": "ACTIVE"}, {"_id": 0}
    )
    cancels_at = (datetime.now(timezone.utc).replace(day=1) + timedelta(days=32)).replace(day=1).isoformat()
    if addon:
        await _db.participant_add_ons.update_one(
            {"id": addon["id"]},
            {"$set": {"status": "PENDING_CANCELLATION", "cancels_at": cancels_at}},
        )
    # Optional Family → Solo downgrade
    plan_downgrade_scheduled = None
    if payload.downgrade and acct["base_plan"] == "FAMILY":
        active_after = [pp for pp in await _active_participants(acct["id"])]
        if len(active_after) <= 1:
            await _db.accounts.update_one(
                {"id": acct["id"]},
                {"$set": {"pending_downgrade_to": "SOLO", "pending_downgrade_at": cancels_at, "updated_at": _now_iso()}},
            )
            plan_downgrade_scheduled = {"to": "SOLO", "effective": cancels_at}
    return {
        "participant_id": pid,
        "status": "PENDING_REMOVAL",
        "data_purge_scheduled_at": purge_at,
        "addon_cancels_at": cancels_at if addon else None,
        "plan_downgrade_scheduled": plan_downgrade_scheduled,
    }


@batch3_router.post("/v2/participants/{pid}/restore")
async def restore_v2_participant(pid: str, request: Request):
    user = await _user_dep(request)
    acct = await _require_owner(user)
    p = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    if p["status"] != "PENDING_REMOVAL":
        raise HTTPException(status_code=409, detail="Participant is not pending removal.")
    purge_at = p.get("data_purge_scheduled_at")
    if purge_at and datetime.fromisoformat(purge_at.replace("Z", "+00:00")) < datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Restore window has passed (60-day data purge already executed).")
    await _db.participants.update_one(
        {"id": pid},
        {"$set": {
            "status": "ACTIVE",
            "removal_requested_at": None,
            "removal_confirmed_at": None,
            "data_purge_scheduled_at": None,
            "updated_at": _now_iso(),
        }},
    )
    # Reactivate add-on if any
    await _db.participant_add_ons.update_one(
        {"account_id": acct["id"], "participant_id": pid, "status": "PENDING_CANCELLATION"},
        {"$set": {"status": "ACTIVE", "cancels_at": None}},
    )
    # Cancel any pending downgrade
    if acct.get("pending_downgrade_to"):
        await _db.accounts.update_one({"id": acct["id"]}, {"$set": {"pending_downgrade_to": None, "pending_downgrade_at": None}})
    return {"ok": True, "participant_id": pid}


@batch3_router.post("/v2/participants/{pid}/hard-delete")
async def hard_delete_v2_participant(pid: str, payload: HardDeleteBody, request: Request):
    user = await _user_dep(request)
    acct = await _require_owner(user)
    p = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    full_name = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip()
    if (payload.confirm_full_name or "").strip().lower() != full_name.lower():
        raise HTTPException(status_code=400, detail="Confirmation name does not match. Type the full name exactly.")
    purged_at = _now_iso()
    # Purge associated data
    purge_collections = [
        ("statements", "household_id", p.get("household_id")),
        ("audit_events", "household_id", p.get("household_id")),
        ("family_wall_posts", "participant_id", pid),
        ("hospital_admissions", "participant_id", pid),
        ("care_plan_amendments", "participant_id", pid),
    ]
    purged = {}
    for coll, field, val in purge_collections:
        if not val:
            continue
        res = await _db[coll].delete_many({field: val})
        purged[coll] = res.deleted_count
    await _db.participants.update_one(
        {"id": pid},
        {"$set": {"status": "REMOVED", "data_purged_at": purged_at}},
    )
    return {"ok": True, "purged": purged, "purged_at": purged_at}


# ============================================================================
# Daily purge job, run at startup + as a background task
# ============================================================================
async def run_purge_job() -> Dict[str, int]:
    if _db is None:
        return {"purged": 0}
    now = _now_iso()
    cur = _db.participants.find(
        {"status": "PENDING_REMOVAL", "data_purged_at": None, "data_purge_scheduled_at": {"$lte": now}},
        {"_id": 0},
    )
    purged = 0
    async for p in cur:
        await _db.participants.update_one(
            {"id": p["id"]},
            {"$set": {"status": "REMOVED", "data_purged_at": now}},
        )
        purged += 1
    return {"purged": purged}


# ============================================================================
# CAREGIVER SEAT MANAGEMENT
# ============================================================================
class _InviteMemberBody(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    name: Optional[str] = Field(default=None, max_length=120)


@batch3_router.get("/v2/members")
async def list_members(request: Request):
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    cur = _db.account_members.find({"account_id": acct["id"]}, {"_id": 0}).limit(50)
    items = [m async for m in cur]
    return {"items": items, "seat_limit": SEAT_LIMITS.get(acct["base_plan"], 1)}


@batch3_router.post("/v2/members/invite")
async def invite_member(payload: _InviteMemberBody, request: Request):
    user = await _user_dep(request)
    acct = await _require_owner(user)
    active = await _active_members(acct["id"])
    limit = SEAT_LIMITS.get(acct["base_plan"], 1)
    if len(active) >= limit:
        raise HTTPException(status_code=409, detail={
            "error": "seat_limit",
            "message": f"Your {acct['base_plan']} plan allows {limit} seat(s). Upgrade to add more caregivers.",
        })
    email_lc = payload.email.lower().strip()
    existing = await _db.account_members.find_one({"account_id": acct["id"], "email": email_lc})
    if existing and existing.get("status") != "REMOVED":
        raise HTTPException(status_code=409, detail="That email is already a member of this account.")
    m = AccountMember(
        account_id=acct["id"],
        user_id=email_lc,  # placeholder; real user_id stamped on signup
        role="CAREGIVER",
        invited_by=user["id"],
        invited_at=_now_iso(),
        status="PENDING",
        email=email_lc,
        name=payload.name,
    )
    await _db.account_members.insert_one(m.model_dump())
    return m.model_dump()


@batch3_router.delete("/v2/members/{mid}")
async def remove_member(mid: str, request: Request):
    user = await _user_dep(request)
    acct = await _require_owner(user)
    member = await _db.account_members.find_one({"id": mid, "account_id": acct["id"]}, {"_id": 0})
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    if member.get("role") == "OWNER":
        raise HTTPException(status_code=409, detail="Cannot remove the account owner.")
    await _db.account_members.update_one({"id": mid}, {"$set": {"status": "REMOVED"}})
    return {"ok": True}


# ============================================================================
# FREE TOOL USAGE, monthly gate
# ============================================================================
def _current_period_month() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def _fingerprint_from_request(request: Request) -> str:
    """Server-side fingerprint: IP + UA + Accept-Language. Hashed."""
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")
    ua = request.headers.get("user-agent", "")
    al = request.headers.get("accept-language", "")
    raw = f"{ip}|{ua}|{al}".encode()
    return hashlib.sha256(raw).hexdigest()[:32]


def _client_ip(request: Request) -> str:
    return request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (request.client.host if request.client else "")


async def check_free_tool_usage(request: Request, tool: str = "STATEMENT_DECODER", *, user_id: Optional[str] = None) -> Dict[str, Any]:
    """Returns {allowed, days_until_next_use, last_used_at, reset_at}. Does NOT
    increment.

    §2.5 of the Dec 2026 refit: unauthenticated cooldown is a 120-day rolling
    window (was 1 per calendar month). After a successful use, the next is
    allowed once `now - last_used_at >= 120 days`.

    The legacy `period_month` / `used_count` fields stay populated for
    backwards-compatibility with the admin tooling that still reads them.
    """
    from datetime import timedelta as _td

    now = datetime.now(timezone.utc)
    cutoff = now - _td(days=120)
    cutoff_iso = cutoff.isoformat()

    if user_id:
        q: Dict[str, Any] = {"user_id": user_id, "tool": tool, "used_at": {"$gte": cutoff_iso}}
    else:
        fp = _fingerprint_from_request(request)
        ip = _client_ip(request)
        q = {
            "$and": [
                {"tool": tool, "used_at": {"$gte": cutoff_iso}},
                {"$or": [{"fingerprint": fp}, {"user_id": None, "ip_address": ip}]},
            ]
        }

    # Find the most recent use inside the rolling window (if any).
    latest = await _db.free_tool_usage.find_one(q, sort=[("used_at", -1)], projection={"_id": 0, "used_at": 1})
    last_used_at = (latest or {}).get("used_at")
    if last_used_at:
        try:
            ts = datetime.fromisoformat(str(last_used_at).replace("Z", "+00:00"))
            if ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
            elapsed_days = (now - ts).days
            days_until_next = max(0, 120 - elapsed_days)
            reset_at = (ts + _td(days=120)).isoformat()
        except Exception:
            days_until_next, reset_at = 0, now.isoformat()
    else:
        days_until_next, reset_at = 0, now.isoformat()

    return {
        "allowed": days_until_next == 0,
        "used_count": 1 if last_used_at else 0,
        "remaining": 0 if last_used_at else 1,
        "days_until_next_use": days_until_next,
        "last_used_at": last_used_at,
        "reset_at": reset_at,
        "period_month": _current_period_month(),  # legacy field, retained
        "window_days": 120,
    }


async def record_free_tool_usage(request: Request, tool: str = "STATEMENT_DECODER", *, user_id: Optional[str] = None, result_id: Optional[str] = None) -> None:
    doc = FreeToolUsage(
        user_id=user_id,
        fingerprint=_fingerprint_from_request(request) if not user_id else None,
        tool=tool,
        used_at=_now_iso(),
        period_month=_current_period_month(),
        ip_address=_client_ip(request),
        result_id=result_id,
    )
    await _db.free_tool_usage.insert_one(doc.model_dump())


@batch3_router.get("/free-tool/usage")
async def get_free_tool_usage(request: Request, tool: str = Query(default="STATEMENT_DECODER")):
    """Public endpoint, no auth required. Used by the public Statement Decoder."""
    user = None
    try:
        user = await _user_dep(request)
    except HTTPException:
        user = None
    user_id = user["id"] if user else None
    return await check_free_tool_usage(request, tool=tool, user_id=user_id)



class _V2PatchBody(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    classification: Optional[int] = None
    provider_name: Optional[str] = None
    date_of_birth: Optional[str] = None


@batch3_router.patch("/v2/participants/{pid}")
async def patch_v2_participant(pid: str, body: _V2PatchBody, request: Request):
    user = await _user_dep(request)
    acct = await _require_owner(user)
    p = await _db.participants.find_one({"id": pid, "account_id": acct["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items() if v is not None}
    if not patch:
        return p
    patch["updated_at"] = _now_iso()
    await _db.participants.update_one({"id": pid}, {"$set": patch})
    return await _db.participants.find_one({"id": pid}, {"_id": 0})


# ============================================================================
# INBOUND MAIL WEBHOOK, `<firstname>-<shortcode>@in.wayly.com.au`
# ============================================================================
def _verify_inbound_token(request: Request) -> bool:
    expected = os.environ.get("INBOUND_MAIL_TOKEN", "")
    if not expected:
        return True
    provided = request.query_params.get("token", "")
    return secrets.compare_digest(provided.encode(), expected.encode())


@batch3_router.post("/inbound/mail")
async def inbound_mail(request: Request):
    """Receive a forwarded statement from `<participant>@in.wayly.com.au`.

    Accepts Postmark-style or generic JSON payloads. Persists a
    `statement_intake_queue` row keyed to the participant. Decode is fired
    out-of-band so this endpoint stays snappy and idempotent.
    """
    if not _verify_inbound_token(request):
        raise HTTPException(status_code=401, detail="Invalid inbound token")
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    to_addr = (
        payload.get("to") or payload.get("To")
        or (payload.get("ToFull") or [{}])[0].get("Email") or ""
    ).lower().strip()
    from_addr = (
        payload.get("from_email") or payload.get("From")
        or payload.get("FromFull", {}).get("Email") or ""
    ).lower().strip()
    subject = payload.get("subject") or payload.get("Subject") or ""
    text_body = payload.get("text") or payload.get("TextBody") or ""
    html_body = payload.get("html") or payload.get("HtmlBody") or ""
    attachments = payload.get("attachments") or payload.get("Attachments") or []
    if not to_addr:
        raise HTTPException(status_code=400, detail="Missing 'to' address")
    participant = await _db.participants.find_one(
        {"household_email": to_addr, "status": "ACTIVE"}, {"_id": 0}
    )
    if not participant:
        await _db.inbound_mail_unmatched.insert_one({
            "id": _new_id(), "to": to_addr, "from": from_addr,
            "subject": subject, "received_at": _now_iso(),
        })
        return {"ok": True, "matched": False}
    intake = {
        "id": _new_id(),
        "account_id": participant["account_id"],
        "participant_id": participant["id"],
        "household_id": participant.get("household_id"),
        "to": to_addr, "from": from_addr, "subject": subject,
        "text_excerpt": (text_body or "")[:2000],
        "has_attachments": bool(attachments),
        "attachment_count": len(attachments or []),
        "status": "received",
        "received_at": _now_iso(),
        "_text_full": (text_body or "")[:50000],
        "_html_full": (html_body or "")[:50000],
        "_attachments_meta": [
            {"name": a.get("Name") or a.get("name"),
             "mime": a.get("ContentType") or a.get("content_type"),
             "size": a.get("ContentLength") or a.get("size") or len(a.get("Content", "") or "")}
            for a in (attachments or [])
        ],
    }
    await _db.statement_intake_queue.insert_one(intake)
    return {
        "ok": True, "matched": True, "intake_id": intake["id"],
        "participant_id": participant["id"], "queued": True,
    }


@batch3_router.get("/inbound/mail/queue")
async def inbound_mail_queue(request: Request, limit: int = Query(default=50, ge=1, le=200)):
    """Owner-visible list of received statement intakes for any of their participants."""
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    cur = _db.statement_intake_queue.find(
        {"account_id": acct["id"]},
        {"_id": 0, "_text_full": 0, "_html_full": 0, "_attachments_meta": 0},
    ).sort("received_at", -1).limit(limit)
    return {"items": [d async for d in cur]}


# ============================================================================
# ADMIN PANELS, Section 8 of the PRD
# ============================================================================
async def _require_admin(request: Request) -> dict:
    user = await _user_dep(request)
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


@batch3_router.get("/admin/v2/users/{user_id}/participants")
async def admin_user_participants(user_id: str, request: Request):
    """Section 8.1, participants tab on the admin user profile."""
    await _require_admin(request)
    acct = await _db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0})
    if not acct:
        return {"items": [], "account": None, "addons": []}
    cur = _db.participants.find({"account_id": acct["id"]}, {"_id": 0}).limit(50)
    parts = [p async for p in cur]
    addons = [a async for a in _db.participant_add_ons.find({"account_id": acct["id"]}, {"_id": 0}).limit(50)]
    return {"account": acct, "items": parts, "addons": addons}


@batch3_router.get("/admin/v2/addons")
async def admin_addon_subscriptions(
    request: Request,
    status_filter: Optional[str] = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
):
    """Section 8.2, add-on subscriptions table."""
    await _require_admin(request)
    q: Dict[str, Any] = {}
    if status_filter in ("ACTIVE", "CANCELLED", "PENDING_CANCELLATION"):
        q["status"] = status_filter
    cur = _db.participant_add_ons.find(q, {"_id": 0}).sort("activated_at", -1).limit(limit)
    items = [d async for d in cur]
    account_ids = list({a["account_id"] for a in items})
    accounts = {}
    async for a in _db.accounts.find({"id": {"$in": account_ids}}, {"_id": 0}):
        accounts[a["id"]] = a
    participant_ids = list({a["participant_id"] for a in items})
    parts = {}
    async for p in _db.participants.find({"id": {"$in": participant_ids}}, {"_id": 0}):
        parts[p["id"]] = p
    user_ids = list({a.get("owner_user_id") for a in accounts.values() if a.get("owner_user_id")})
    users = {}
    async for u in _db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "email": 1, "id": 1}):
        users[u["id"]] = u
    for a in items:
        acct = accounts.get(a["account_id"], {})
        a["account_owner_email"] = users.get(acct.get("owner_user_id"), {}).get("email")
        p = parts.get(a["participant_id"], {})
        a["participant_name"] = f"{p.get('first_name', '')} {p.get('last_name', '')}".strip() or None
        a["monthly_value"] = 19.0
    return {"items": items}


@batch3_router.get("/admin/v2/free-tier/usage")
async def admin_free_tier_usage(request: Request):
    """Section 8.3, free-tier monthly usage stats."""
    await _require_admin(request)
    period = datetime.now(timezone.utc).strftime("%Y-%m")
    total = await _db.free_tool_usage.count_documents({"period_month": period})
    logged_in = await _db.free_tool_usage.count_documents({"period_month": period, "user_id": {"$ne": None}})
    anon = total - logged_in
    fps = await _db.free_tool_usage.distinct("fingerprint", {"period_month": period, "user_id": None})
    user_ids = await _db.free_tool_usage.distinct("user_id", {"period_month": period, "user_id": {"$ne": None}})
    converted = 0
    if user_ids:
        cur = _db.accounts.find(
            {"owner_user_id": {"$in": user_ids}, "base_plan": {"$ne": "FREE"}},
            {"_id": 0, "owner_user_id": 1},
        )
        converted = len([a async for a in cur])
    conv_rate = round(100 * converted / len(user_ids), 1) if user_ids else 0.0
    return {
        "period_month": period,
        "total_uses": total,
        "anonymous_uses": anon,
        "logged_in_uses": logged_in,
        "unique_fingerprints": len([f for f in fps if f]),
        "unique_users": len(user_ids),
        "conversions_to_paid": converted,
        "conversion_rate_pct": conv_rate,
    }


@batch3_router.get("/admin/v2/purge-queue")
async def admin_purge_queue(request: Request, status_filter: Optional[str] = Query(default=None, alias="status")):
    """Section 8.4, data purge queue."""
    await _require_admin(request)
    q: Dict[str, Any] = {"data_purge_scheduled_at": {"$ne": None}}
    if status_filter == "SCHEDULED":
        q["status"] = "PENDING_REMOVAL"
        q["data_purged_at"] = None
    elif status_filter == "COMPLETED":
        q["data_purged_at"] = {"$ne": None}
    cur = _db.participants.find(q, {"_id": 0}).sort("data_purge_scheduled_at", 1).limit(200)
    items = []
    now = datetime.now(timezone.utc)
    async for p in cur:
        days_remaining = None
        try:
            if p.get("data_purge_scheduled_at"):
                purge_dt = datetime.fromisoformat(p["data_purge_scheduled_at"].replace("Z", "+00:00"))
                days_remaining = max(0, (purge_dt - now).days)
        except Exception:
            pass
        items.append({
            "id": p["id"], "account_id": p.get("account_id"),
            "first_name": p.get("first_name"), "last_name": p.get("last_name"),
            "removed_at": p.get("removal_confirmed_at"),
            "purge_at": p.get("data_purge_scheduled_at"),
            "days_remaining": days_remaining,
            "status": "COMPLETED" if p.get("data_purged_at") else "SCHEDULED",
            "purged_at": p.get("data_purged_at"),
        })
    return {"items": items}


@batch3_router.post("/admin/v2/purge-queue/{pid}/extend")
async def admin_extend_purge(pid: str, request: Request):
    """Super-admin only: extend the 60-day window by 30 days."""
    user = await _require_admin(request)
    p = await _db.participants.find_one({"id": pid, "status": "PENDING_REMOVAL"}, {"_id": 0})
    if not p or not p.get("data_purge_scheduled_at"):
        raise HTTPException(status_code=404, detail="Participant not found or no purge scheduled")
    new_dt = (datetime.fromisoformat(p["data_purge_scheduled_at"].replace("Z", "+00:00")) + timedelta(days=30)).isoformat()
    await _db.participants.update_one({"id": pid}, {"$set": {"data_purge_scheduled_at": new_dt}})
    await _db.audit_events.insert_one({
        "id": _new_id(), "actor_id": user["id"], "action": "PURGE_EXTENDED",
        "target": pid, "detail": f"Extended purge by 30 days to {new_dt}", "at": _now_iso(),
    })
    return {"ok": True, "new_purge_at": new_dt}
