"""In-app nudges, dismissible dashboard prompts.

Nudges are lightweight, server-computed prompts that show up in the app UI
(e.g. a small pill on the dashboard). Unlike toasts, they persist across
sessions until the user either satisfies the underlying condition or
explicitly dismisses them.

Rules baked in
--------------
``family_add_second_participant``
    Shown when: user's plan is Family AND account is at least 3 days old
    AND fewer than 2 ACTIVE participants have been created AND the nudge
    hasn't been dismissed. Prompts the caregiver to onboard the second
    participant their Family plan covers.

Endpoints
---------
GET    /api/nudges               , list active in-app nudges
POST   /api/nudges/{key}/dismiss , dismiss a nudge (idempotent)

Wire in server.py:
    from routes.nudges import build_nudges_router
    api.include_router(build_nudges_router(
        db=db, user_dep=_user_from_request,
    ))
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Callable, List

from fastapi import APIRouter, Depends, HTTPException


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_iso(s: Any) -> datetime | None:
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except Exception:
        return None


async def _compute_family_add_second_participant(db, user: dict) -> dict | None:
    plan = (user.get("plan") or "").lower()
    if plan != "family":
        return None
    created = _parse_iso(user.get("created_at"))
    if not created:
        return None
    if datetime.now(timezone.utc) - created < timedelta(days=3):
        return None
    # Household required to count participants.
    household_id = user.get("household_id")
    if not household_id:
        return None
    active_count = await db.participants.count_documents(
        {"household_id": household_id, "status": {"$in": ["ACTIVE", None]}},
    )
    if active_count >= 2:
        return None
    # Grab the first (and only) participant's first name for a warmer prompt.
    first = await db.participants.find_one(
        {"household_id": household_id, "status": {"$in": ["ACTIVE", None]}},
        {"_id": 0, "first_name": 1},
    )
    first_name = (first or {}).get("first_name") or ""
    return {
        "key": "family_add_second_participant",
        "title": "Ready to add your second participant?",
        "body": (
            f"You're on the Family plan, it covers a second person at no extra "
            f"cost. Add them now so Wayly can help you coordinate care for both"
            f"{(' alongside ' + first_name) if first_name else ''}."
        ),
        "cta_label": "Add now",
        "cta_href": "/onboarding?new=1",
        "tone": "gold",
        "dismissible": True,
    }


NUDGE_BUILDERS: List[Callable] = [
    _compute_family_add_second_participant,
]


def build_nudges_router(*, db, user_dep) -> APIRouter:
    router = APIRouter(prefix="/nudges", tags=["nudges"])

    async def _current_user(user: dict = Depends(user_dep)) -> dict:
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user

    @router.get("")
    async def list_nudges(user: dict = Depends(_current_user)) -> dict:
        user_id = user.get("id") or user.get("user_id")
        # Load all dismissed nudge keys once so we can filter cheaply.
        dismissed = await db.user_nudges.find(
            {"user_id": user_id, "dismissed_at": {"$exists": True}},
            {"_id": 0, "key": 1},
        ).to_list(50)
        dismissed_keys = {d["key"] for d in dismissed}
        nudges: list = []
        for builder in NUDGE_BUILDERS:
            try:
                n = await builder(db, user)
                if n and n["key"] not in dismissed_keys:
                    nudges.append(n)
            except Exception:      # pragma: no cover - defensive
                continue
        return {"nudges": nudges}

    @router.post("/{key}/dismiss")
    async def dismiss_nudge(key: str, user: dict = Depends(_current_user)) -> dict:
        user_id = user.get("id") or user.get("user_id")
        # Whitelist keys so users can't spam arbitrary dismiss rows.
        valid_keys = {"family_add_second_participant"}
        if key not in valid_keys:
            raise HTTPException(status_code=404, detail="Unknown nudge key")
        await db.user_nudges.update_one(
            {"user_id": user_id, "key": key},
            {"$set": {"user_id": user_id, "key": key, "dismissed_at": _now_iso()}},
            upsert=True,
        )
        return {"key": key, "dismissed": True}

    return router
