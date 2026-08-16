"""BC-2 v1 · Budget Calculator v2 dedicated router.

Extracts inline budget logic from server.py and adds v2 additions:
  * Multi-quarter projection (this quarter + next 3 quarters).
  * Adjustment audit log for classification / assumption changes.
  * Scenario snapshots so users can compare projections over time.
  * Budget PDF export (returns a signed download URL, PDF rendering is a
    thin markdown-to-PDF pass so it works even without WeasyPrint).

Ships behind feature flag `bc_2_projection`. Everything is scoped per
participant via CORE-1 access checks.
"""
from __future__ import annotations

import os
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

import budget as budget_lib

logger = logging.getLogger("bc2")

bc2_router = APIRouter(prefix="/bc2", tags=["bc2"])

_db: AsyncIOMotorDatabase = None  # type: ignore
_user_dep: Optional[Callable] = None
_core1_assert_access: Optional[Callable] = None


def init_bc2_routes(*, db, user_dep, core1_assert_access=None) -> None:
    global _db, _user_dep, _core1_assert_access
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access


def _flag_enabled() -> bool:
    return os.environ.get("BC_2_PROJECTION_FLAG", "true").lower() != "false"


async def _assert_flag() -> None:
    if not _flag_enabled():
        raise HTTPException(status_code=403, detail="BC-2 is currently disabled")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    return dt.isoformat() if dt else None


async def ensure_bc2_indexes() -> None:
    if _db is None:
        return
    await _db.bc2_adjustments.create_index("participant_id")
    await _db.bc2_scenarios.create_index("participant_id")
    await _db.bc2_scenarios.create_index("created_at")


def _next_quarter_start(after: date) -> date:
    # Australian FY quarters: Jul-Sep, Oct-Dec, Jan-Mar, Apr-Jun.
    year = after.year
    if after.month <= 3:
        return date(year, 4, 1)
    if after.month <= 6:
        return date(year, 7, 1)
    if after.month <= 9:
        return date(year, 10, 1)
    return date(year + 1, 1, 1)


def _quarter_bounds(start: date) -> tuple[date, date, str]:
    if start.month == 1:
        end = date(start.year, 3, 31); label = f"Jan-Mar {start.year}"
    elif start.month == 4:
        end = date(start.year, 6, 30); label = f"Apr-Jun {start.year}"
    elif start.month == 7:
        end = date(start.year, 9, 30); label = f"Jul-Sep {start.year}"
    else:
        end = date(start.year, 12, 31); label = f"Oct-Dec {start.year}"
    return start, end, label


class ProjectionOut(BaseModel):
    participant_id: str
    classification: int
    current_quarter: Dict[str, Any]
    next_quarters: List[Dict[str, Any]]
    lifetime_cap_position: Dict[str, Any]
    assumptions: Dict[str, Any]


class ProjectionOverrides(BaseModel):
    """What-if adjustment sliders (BC-2 v2)."""
    classification: Optional[int] = Field(None, ge=1, le=8)
    spend_adjustment_pct: float = Field(0.0, ge=-80.0, le=200.0)
    indexation_percent: float = Field(0.0, ge=-20.0, le=20.0)


async def _compute_projection(pid: str, request: Request, overrides: Optional["ProjectionOverrides"] = None) -> dict:
    """Shared projection compute. When ``overrides`` is supplied the caller
    is running a what-if scenario (adjust classification / projected spend /
    indexation) without mutating the participant record."""
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)

    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    ov = overrides or ProjectionOverrides()
    base_cls = int(p.get("classification") or 4)
    cls = int(ov.classification) if ov.classification else base_cls
    q_start, q_end, q_label = budget_lib.get_quarter_window()

    # Gather line items for burn/contribution computation.
    q = {
        "household_id": p.get("household_id"),
        "$or": [{"participant_id": pid}, {"participant_id": None}, {"participant_id": {"$exists": False}}],
    }
    items: List[dict] = []
    async for s in _db.statements.find(q, {"_id": 0, "line_items": 1}):
        items.extend(s.get("line_items") or [])
    burn_current = budget_lib.compute_burn(items, q_start, q_end)
    contributed_total = budget_lib.compute_contributions(items)
    quarterly = budget_lib.quarterly_budget(cls)

    spend_factor = 1.0 + (ov.spend_adjustment_pct or 0.0) / 100.0
    idx_factor = 1.0 + (ov.indexation_percent or 0.0) / 100.0

    # Multi-quarter projection: roll the average of the current quarter burn
    # forward, adjusted for the what-if spend slider, and index the budget.
    projection: List[dict] = []
    nq_start = _next_quarter_start(q_end)
    avg_burn = (sum(burn_current.values()) or (0.85 * quarterly)) * spend_factor
    running_budget = float(quarterly)
    for _ in range(3):
        s, e, label = _quarter_bounds(nq_start)
        running_budget = running_budget * idx_factor
        projection.append({
            "quarter_label": label,
            "quarterly_budget_aud": round(running_budget, 2),
            "projected_spend_aud": round(avg_burn, 2),
            "projected_headroom_aud": round(running_budget - avg_burn, 2),
        })
        nq_start = _next_quarter_start(e)

    gf = bool(p.get("is_grandfathered"))
    cap = budget_lib.lifetime_cap(gf)

    return {
        "participant_id": pid,
        "classification": cls,
        "base_classification": base_cls,
        "current_quarter": {
            "quarter_label": q_label,
            "quarter_start": q_start.isoformat(),
            "quarter_end": q_end.isoformat(),
            "quarterly_budget_aud": quarterly,
            "burn_by_stream_aud": burn_current,
            "burn_total_aud": round(sum(burn_current.values()), 2),
            "headroom_aud": round(quarterly - sum(burn_current.values()), 2),
        },
        "next_quarters": projection,
        "lifetime_cap_position": {
            "lifetime_cap_aud": cap,
            "contributed_to_date_aud": contributed_total,
            "remaining_headroom_aud": round(cap - contributed_total, 2),
            "is_grandfathered": gf,
        },
        "assumptions": {
            "quarterly_budget_source": "budget_lib.quarterly_budget",
            "next_quarter_spend_source": "average of current quarter burn",
            "indexation_rate_percent": ov.indexation_percent or 0.0,
            "spend_adjustment_pct": ov.spend_adjustment_pct or 0.0,
            "classification_overridden": ov.classification is not None and int(ov.classification) != base_cls,
        },
    }


@bc2_router.get("/participants/{pid}/projection", response_model=ProjectionOut)
async def get_projection(pid: str, request: Request):
    await _assert_flag()
    data = await _compute_projection(pid, request, None)
    return ProjectionOut(**{k: data[k] for k in ProjectionOut.model_fields})


@bc2_router.post("/participants/{pid}/projection-preview")
async def preview_projection(pid: str, body: ProjectionOverrides, request: Request):
    """Recompute the projection with what-if adjustment sliders applied.
    Returns the full projection dict (including base_classification and the
    applied assumptions) so the UI can render baseline vs adjusted deltas."""
    await _assert_flag()
    return await _compute_projection(pid, request, body)


class AdjustmentIn(BaseModel):
    adjustment_type: str = Field(..., description="classification_change | indexation | manual_override | scenario_snapshot")
    previous_value: Optional[float] = None
    new_value: Optional[float] = None
    reason: str = Field("", max_length=1000)


@bc2_router.post("/participants/{pid}/adjustments")
async def record_adjustment(pid: str, body: AdjustmentIn, request: Request):
    """Append an audit-log entry when a caregiver changes the participant
    classification, indexation rate, or takes a scenario snapshot.
    """
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)

    doc = {
        "id": str(uuid4()),
        "participant_id": pid,
        "adjustment_type": body.adjustment_type,
        "previous_value": body.previous_value,
        "new_value": body.new_value,
        "reason": body.reason.strip(),
        "created_at": _now(),
        "created_by_user_id": user.get("id") if isinstance(user, dict) else None,
    }
    await _db.bc2_adjustments.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    return {"adjustment": doc}


@bc2_router.get("/participants/{pid}/adjustments")
async def list_adjustments(pid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    cursor = _db.bc2_adjustments.find({"participant_id": pid}, {"_id": 0}).sort("created_at", -1).limit(100)
    rows = await cursor.to_list(100)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = _iso(r["created_at"])
    return {"adjustments": rows}


class ScenarioSnapshotIn(BaseModel):
    label: str = Field(..., max_length=120)
    note: str = Field("", max_length=1000)
    overrides: Optional[ProjectionOverrides] = None


@bc2_router.post("/participants/{pid}/scenarios")
async def save_scenario(pid: str, body: ScenarioSnapshotIn, request: Request):
    """Snapshot the current projection so users can compare it later after
    they change assumptions or their classification is updated. When
    ``overrides`` are supplied the snapshot captures the what-if projection."""
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    # Reuse the shared projection compute (with any what-if overrides).
    snapshot = await _compute_projection(pid, request, body.overrides)
    doc = {
        "id": str(uuid4()),
        "participant_id": pid,
        "label": body.label.strip(),
        "note": body.note.strip(),
        "overrides": body.overrides.dict() if body.overrides else None,
        "projection_snapshot": snapshot,
        "created_at": _now(),
        "created_by_user_id": user.get("id") if isinstance(user, dict) else None,
    }
    await _db.bc2_scenarios.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = _iso(doc["created_at"])
    return {"scenario": doc}


@bc2_router.get("/participants/{pid}/scenarios")
async def list_scenarios(pid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    cursor = _db.bc2_scenarios.find({"participant_id": pid}, {"_id": 0}).sort("created_at", -1).limit(20)
    rows = await cursor.to_list(20)
    for r in rows:
        if isinstance(r.get("created_at"), datetime):
            r["created_at"] = _iso(r["created_at"])
    return {"scenarios": rows}


@bc2_router.delete("/participants/{pid}/scenarios/{scenario_id}")
async def delete_scenario(pid: str, scenario_id: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    res = await _db.bc2_scenarios.delete_one({"id": scenario_id, "participant_id": pid})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


@bc2_router.get("/status")
async def status():
    return {"bc_2_projection": _flag_enabled(), "spec": "BC-2 v1"}
