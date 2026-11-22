"""Wayly, Price Checker savings milestone tracking.

Records which per-user savings milestones have been celebrated so a caregiver
sees each threshold ($100, $250, $500, $1,000) exactly once, not on every
refresh. Milestone value is computed client-side from saved checks and posted
back with the threshold key when the banner is dismissed or shown.

Endpoints:
- GET  /api/ppc/milestones             → {crossed_100, crossed_250, ...}
- POST /api/ppc/milestones/mark        → body {threshold: 100|250|500|1000}

Data model (Mongo collection ``ppc_milestones``):
    {
        user_id: str,
        crossed_100:  iso str | null,
        crossed_250:  iso str | null,
        crossed_500:  iso str | null,
        crossed_1000: iso str | null,
        updated_at:   iso str,
    }
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.ppc_milestones")

ppc_milestones_router = APIRouter(tags=["ppc_milestones"])

_db = None
_user_dep = None

MILESTONE_KEYS = (100, 250, 500, 1000)


def init_ppc_milestone_routes(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class MarkPayload(BaseModel):
    threshold: int = Field(..., description="One of 100 / 250 / 500 / 1000")


async def _current_user(request: Request) -> dict:
    if _user_dep is None:
        raise HTTPException(status_code=500, detail="ppc_milestones not initialised")
    return await _user_dep(request)


def _empty_milestones() -> Dict[str, Any]:
    return {f"crossed_{k}": None for k in MILESTONE_KEYS}


@ppc_milestones_router.get("/ppc/milestones")
async def get_milestones(request: Request):
    user = await _current_user(request)
    doc = await _db.ppc_milestones.find_one({"user_id": user["id"]}, {"_id": 0})
    if not doc:
        return _empty_milestones()
    out = _empty_milestones()
    for k in MILESTONE_KEYS:
        key = f"crossed_{k}"
        out[key] = doc.get(key)
    return out


@ppc_milestones_router.post("/ppc/milestones/mark")
async def mark_milestone(payload: MarkPayload, request: Request):
    user = await _current_user(request)
    if payload.threshold not in MILESTONE_KEYS:
        raise HTTPException(status_code=400, detail=f"Invalid threshold. Use one of {MILESTONE_KEYS}.")
    # SEC audit Feb 2026, recompute eligibility server-side so a caller
    # cannot mark a $1,000 milestone they have not actually earned. The
    # savings estimate mirrors the same computation the frontend uses
    # (sum of positive "highest_seen - latest" per provider group).
    saved = await _compute_total_saved(user["id"])
    if saved < payload.threshold:
        raise HTTPException(
            status_code=400,
            detail=f"Not eligible. Estimated tracked savings ${saved:.2f} < ${payload.threshold}.",
        )
    key = f"crossed_{payload.threshold}"
    now = _now_iso()
    await _db.ppc_milestones.update_one(
        {"user_id": user["id"]},
        {
            "$set": {key: now, "updated_at": now},
            "$setOnInsert": {"user_id": user["id"], "created_at": now},
        },
        upsert=True,
    )
    doc = await _db.ppc_milestones.find_one({"user_id": user["id"]}, {"_id": 0})
    return {k: doc.get(k) for k in [f"crossed_{n}" for n in MILESTONE_KEYS]}


async def _compute_total_saved(user_id: str) -> float:
    """Recompute the estimated tracked savings for a user.

    Groups saved price checks by (service, provider_normalised_name) and
    sums the positive delta between the highest historical rate and the
    latest saved rate. Matches the frontend SavingsBlock computation so
    the server-side eligibility gate is consistent with the UI display.
    """
    cursor = _db.ppc_saved_checks.find({"user_id": user_id}, {"_id": 0}).sort("created_at", 1)
    groups: Dict[str, Dict[str, Any]] = {}
    async for c in cursor:
        key = f"{c.get('service')}::{c.get('provider_normalised_name') or ''}"
        rate = c.get("rate")
        if not isinstance(rate, (int, float)):
            try:
                rate = float(rate)
            except (TypeError, ValueError):
                continue
        g = groups.setdefault(key, {"highest": rate, "latest": rate})
        g["latest"] = rate
        if rate > g["highest"]:
            g["highest"] = rate
    total = 0.0
    for g in groups.values():
        delta = g["highest"] - g["latest"]
        if delta > 0:
            total += delta
    return total


async def ensure_ppc_milestone_indexes(db):
    await db.ppc_milestones.create_index("user_id", unique=True)
