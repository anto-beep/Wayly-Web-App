"""Wayly, Participant share link (caregiver → participant).

A caregiver can generate a **permanent, revocable** share link that gives the
participant a read-only view of their own care summary. Design intent:
- Optional (many caregivers won't want to share)
- Permanent until the caregiver rotates or revokes it
- No password on the participant side (target audience: 80+, low tech literacy)
- Elderly-friendly landing page (big text, short sentences, one action)

Endpoints:
- POST   /participants/{pid}/share-link              (create or return existing)
- POST   /participants/{pid}/share-link/rotate       (issue new token, invalidate old)
- DELETE /participants/{pid}/share-link              (revoke, participant can no longer view)
- GET    /participants/{pid}/share-link              (current status, last opened)
- GET    /public/shared-view/{token}                 (unauthenticated read-only view)
"""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Literal

logger = logging.getLogger("wayly.participant_share")

participant_share_router = APIRouter(tags=["participant_share"])

_db = None
_user_dep = None
_account_for_user = None
_frontend_url: str = ""


def init_participant_share_routes(*, db, user_dep, account_for_user, frontend_url: str):
    global _db, _user_dep, _account_for_user, _frontend_url
    _db = db
    _user_dep = user_dep
    _account_for_user = account_for_user
    _frontend_url = frontend_url.rstrip("/")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def _guard_owner(request: Request, pid: str):
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    doc = await _db.participants.find_one({"id": pid, "account_id": acct["id"]},
                                          {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Participant not found")
    return user, acct, doc


def _shared_view_url(token: str) -> str:
    """Share links must ALWAYS point at the customer-facing domain (wayly.com.au)
    so that a caregiver can hand the link to a participant without exposing a
    preview URL. `SHARE_LINK_BASE_URL` overrides for non-prod environments."""
    base = (
        os.environ.get("SHARE_LINK_BASE_URL")
        or "https://wayly.com.au"
    ).rstrip("/")
    return f"{base}/view/{token}"


# ----------------------------------------------------------------------------
# Authenticated endpoints (caregiver)
# ----------------------------------------------------------------------------
@participant_share_router.get("/participants/{pid}/share-link")
async def get_share_link(pid: str, request: Request):
    user, _acct, _doc = await _guard_owner(request, pid)
    row = await _db.participant_share_tokens.find_one(
        {"participant_id": pid, "revoked_at": None},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if not row:
        return {"has_link": False}
    return {
        "has_link": True,
        "url": _shared_view_url(row["token"]),
        "token": row["token"],
        "created_at": row.get("created_at"),
        "created_by": row.get("created_by_user_id"),
        "last_seen_at": row.get("last_seen_at"),
        "view_count": row.get("view_count", 0),
    }


@participant_share_router.post("/participants/{pid}/share-link")
async def create_share_link(pid: str, request: Request):
    """Create a share link if none exists. Otherwise return the current one."""
    user, _acct, doc = await _guard_owner(request, pid)
    existing = await _db.participant_share_tokens.find_one(
        {"participant_id": pid, "revoked_at": None},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    if existing:
        return {
            "has_link": True,
            "url": _shared_view_url(existing["token"]),
            "token": existing["token"],
            "created_at": existing.get("created_at"),
            "reused": True,
        }
    token = secrets.token_urlsafe(24)
    now = _iso(_now())
    row = {
        "token": token,
        "participant_id": pid,
        "account_id": doc.get("account_id"),
        "created_by_user_id": user["id"],
        "created_at": now,
        "revoked_at": None,
        "last_seen_at": None,
        "view_count": 0,
    }
    await _db.participant_share_tokens.insert_one(row)
    logger.info("share-link created participant=%s by=%s", pid, user["id"])
    return {
        "has_link": True,
        "url": _shared_view_url(token),
        "token": token,
        "created_at": now,
        "reused": False,
    }


@participant_share_router.post("/participants/{pid}/share-link/rotate")
async def rotate_share_link(pid: str, request: Request):
    """Issue a new token; revoke every previous active one."""
    user, _acct, doc = await _guard_owner(request, pid)
    now = _iso(_now())
    await _db.participant_share_tokens.update_many(
        {"participant_id": pid, "revoked_at": None},
        {"$set": {"revoked_at": now, "revoked_reason": "rotated"}},
    )
    token = secrets.token_urlsafe(24)
    await _db.participant_share_tokens.insert_one({
        "token": token,
        "participant_id": pid,
        "account_id": doc.get("account_id"),
        "created_by_user_id": user["id"],
        "created_at": now,
        "revoked_at": None,
        "last_seen_at": None,
        "view_count": 0,
    })
    return {
        "has_link": True,
        "url": _shared_view_url(token),
        "token": token,
        "created_at": now,
        "rotated": True,
    }


@participant_share_router.delete("/participants/{pid}/share-link")
async def revoke_share_link(pid: str, request: Request):
    user, _acct, _doc = await _guard_owner(request, pid)
    now = _iso(_now())
    res = await _db.participant_share_tokens.update_many(
        {"participant_id": pid, "revoked_at": None},
        {"$set": {"revoked_at": now, "revoked_reason": "revoked", "revoked_by": user["id"]}},
    )
    return {"ok": True, "revoked": res.modified_count}


# ----------------------------------------------------------------------------
# Public read-only view (unauthenticated)
# ----------------------------------------------------------------------------
@participant_share_router.get("/public/shared-view/{token}")
async def get_shared_view(token: str):
    """Elderly-friendly read-only view. No auth: the token IS the credential.

    Composes the same data that the caregiver-side ParticipantView shows:
    today's date, next appointment (best-effort), budget position for the
    current quarter, and the caregiver's phone as the primary action.
    """
    row = await _db.participant_share_tokens.find_one({"token": token}, {"_id": 0})
    if not row or row.get("revoked_at"):
        raise HTTPException(status_code=404, detail="This link is no longer active. Please ask the caregiver for a new one.")
    pid = row["participant_id"]
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p or p.get("status") not in (None, "ACTIVE"):
        raise HTTPException(status_code=404, detail="This participant's profile is no longer available.")

    # Best-effort caregiver contact so the participant has someone to call if
    # something looks wrong. Fall back to account owner if no per-participant
    # caregiver contact was captured during onboarding.
    caregiver_name: Optional[str] = None
    caregiver_phone: Optional[str] = p.get("caregiver_phone")
    if row.get("created_by_user_id"):
        u = await _db.users.find_one({"id": row["created_by_user_id"]},
                                     {"_id": 0, "name": 1, "first_name": 1, "mobile": 1, "email": 1})
        if u:
            first = u.get("first_name") or (u.get("name") or "").split(" ")[0]
            if first and not first.lower() in {"trial", "test", "user", "admin"}:
                caregiver_name = first
            caregiver_phone = caregiver_phone or u.get("mobile")

    # Mark viewed (best-effort, never fail the view because of the update).
    try:
        await _db.participant_share_tokens.update_one(
            {"token": token},
            {"$set": {"last_seen_at": _iso(_now())}, "$inc": {"view_count": 1}},
        )
    except Exception:  # pragma: no cover
        pass

    display_name = (p.get("preferred_name") or p.get("first_name") or "").strip() or "You"
    classification = p.get("classification_level") or p.get("classification")

    # Rich view, mirror what ParticipantView (/participant/today) shows.
    today = _now().date()
    today_label = today.strftime("%A %d %B")

    # Best-effort budget snapshot. Uses the participant's household statements
    # to compute quarter-remaining. Any failure here just leaves the block off.
    budget_snapshot: Optional[Dict[str, Any]] = None
    try:
        from budget import (
            quarterly_budget,
            get_quarter_window,
            compute_burn,
        )
        # Find the household that owns this participant. Participants store
        # `household_id` on the doc (see `participants` collection).
        hid = p.get("household_id")
        household = None
        if hid:
            household = await _db.households.find_one({"id": hid}, {"_id": 0})
        classif = int(classification) if isinstance(classification, (int, str)) and str(classification).isdigit() else None
        if household and classif:
            q_start, q_end, q_label = get_quarter_window()
            quarterly_total = quarterly_budget(classif)
            items: list = []
            async for s in _db.statements.find(
                {"household_id": household["id"]}, {"_id": 0, "line_items": 1},
            ):
                items.extend(s.get("line_items") or [])
            burn = compute_burn(items, q_start, q_end)
            spent = sum(burn.values())
            remaining = max(0.0, quarterly_total - spent)
            days_left = (q_end - today).days + 1
            sentence = (
                f"That's plenty for the {days_left} days left in this quarter."
                if remaining > spent * 0.2 or days_left < 30
                else f"Just keep an eye on it, {days_left} days to go this quarter."
            )
            budget_snapshot = {
                "quarter_remaining": round(remaining, 2),
                "sentence": sentence,
                "days_left": days_left,
            }
    except Exception:  # pragma: no cover, budget snapshot is best-effort
        budget_snapshot = None

    return {
        "participant": {
            "display_name": display_name,
            "full_name": f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip(),
            "classification": classification,
            "provider_name": p.get("provider_name"),
            "suburb": p.get("suburb"),
            "state": p.get("state"),
        },
        "caregiver": {
            "name": caregiver_name,
            "phone": caregiver_phone,
        },
        "today_label": today_label,
        "budget": budget_snapshot,
        "share_meta": {
            "created_at": row.get("created_at"),
            "last_seen_at": row.get("last_seen_at"),
        },
    }


# ----------------------------------------------------------------------------
# Public wellbeing / alert (unauthenticated, share-token gated)
# ----------------------------------------------------------------------------
class _PublicWellbeingBody(BaseModel):
    mood: Literal["good", "okay", "not_great"]


class _PublicAlertBody(BaseModel):
    reason: Optional[str] = None  # short free-text, never PII


async def _resolve_share_context(token: str):
    """Look up a live token and return (row, participant). 404 on any failure
    so callers never leak whether a token exists or is merely revoked."""
    row = await _db.participant_share_tokens.find_one({"token": token}, {"_id": 0})
    if not row or row.get("revoked_at"):
        raise HTTPException(status_code=404, detail="This link is no longer active. Please ask the caregiver for a new one.")
    p = await _db.participants.find_one({"id": row["participant_id"]}, {"_id": 0})
    if not p or p.get("status") not in (None, "ACTIVE"):
        raise HTTPException(status_code=404, detail="This participant's profile is no longer available.")
    return row, p


async def _notify_caregiver_from_share(row: Dict[str, Any], p: Dict[str, Any], title: str, message: str) -> None:
    """Best-effort notification to the caregiver who created the share link.
    Silent failure: the participant flow must not surface plumbing errors."""
    owner_id = row.get("created_by_user_id") or p.get("owner_id")
    if not owner_id:
        return
    try:
        from server import create_notification  # local import breaks cycle
        display = (p.get("preferred_name") or p.get("first_name") or "your participant").strip()
        await create_notification(
            owner_id,
            "wellbeing_concerns",
            title,
            message.replace("{name}", display),
            "/participant",
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("share notify failed: %s", exc)


@participant_share_router.post("/public/shared-view/{token}/wellbeing")
async def log_shared_wellbeing(token: str, body: _PublicWellbeingBody):
    """Record a mood check-in from the read-only shared view.
    Mirrors `/participant/wellbeing`. Notifies the caregiver only for
    the ``not_great`` mood so happy days don't generate noise."""
    row, p = await _resolve_share_context(token)
    doc = {
        "id": secrets.token_urlsafe(12),
        "user_id": None,
        "household_id": p.get("household_id"),
        "participant_id": p.get("id"),
        "mood": body.mood,
        "notify_caregiver": body.mood == "not_great",
        "source": "shared_view",
        "created_at": _iso(_now()),
    }
    try:
        await _db.wellbeing.insert_one(doc)
    except Exception as exc:  # pragma: no cover
        logger.warning("shared wellbeing insert failed: %s", exc)
    if body.mood == "not_great":
        await _notify_caregiver_from_share(
            row, p,
            "{name} flagged a hard day",
            "{name} marked today as not great from their shared view. Worth checking in.",
        )
    doc.pop("_id", None)
    return doc


@participant_share_router.post("/public/shared-view/{token}/alert")
async def raise_shared_alert(token: str, body: _PublicAlertBody):
    """Participant tapped 'Something's not right'. Soft signal, not an
    emergency: the UI still directs them to ring GP / triple-zero for that."""
    row, p = await _resolve_share_context(token)
    reason = (body.reason or "").strip()[:280]
    try:
        await _db.share_alerts.insert_one({
            "id": secrets.token_urlsafe(12),
            "participant_id": p.get("id"),
            "household_id": p.get("household_id"),
            "reason": reason or None,
            "created_at": _iso(_now()),
        })
    except Exception as exc:  # pragma: no cover
        logger.warning("share alert insert failed: %s", exc)
    await _notify_caregiver_from_share(
        row, p,
        "{name} asked for a check-in",
        (
            "{name} tapped 'Something's not right' on their shared view. "
            + (f"Reason: {reason}" if reason else "No reason given.")
        ).strip(),
    )
    return {"ok": True}


async def ensure_share_link_indexes(db_handle) -> None:
    try:
        await db_handle.participant_share_tokens.create_index("token", unique=True)
        await db_handle.participant_share_tokens.create_index("participant_id")
        await db_handle.participant_share_tokens.create_index(
            [("participant_id", 1), ("revoked_at", 1)],
        )
    except Exception as exc:  # pragma: no cover
        logger.warning("participant_share_tokens indexes skipped: %s", exc)
