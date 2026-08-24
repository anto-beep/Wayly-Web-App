"""CE-3 v1: Contribution Estimator v3, contribution position slice.

Adds three surfaces on top of CE-2:

  1. Lifetime cap accumulator     , how much of the $137,917 lifetime cap
                                     has been used, remaining, and
                                     "years at current pace" (the flagship
                                     reassurance figure).

  2. Annual projection            , annual estimate + confidence band
                                     (high/medium/low) computed from the
                                     current CE-2 projection and the number
                                     of decoded statements this financial year.

  3. Contribution reconciliation  , month-by-month comparison of estimated
                                     vs actual contribution, flagged at 5
                                     severity levels. Step-change variances
                                     open a LOOP-1 case for follow-up.

All endpoints scoped by household membership (CORE-1 pattern) and
feature-flagged via ``CE3_ENABLED`` env (default "1", set "0" to hide).

Ships behind ``/api/ce3/*``. Deferred to CE-3 v2:
  - Pension-status change wizard (Section I of spec)
  - Hardship pathway walkthrough (Section J)
  - Extended PDF export with new sections
  - Prior year comparison chart
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import date, datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.ce3")

ce3_router = APIRouter(prefix="/ce3", tags=["ce3"])

_db = None
_user_dep = None
_core1_assert_access = None
_core1_write_event = None
_loop1_open_case = None

# INDEX-1 lifetime cap constants (fallback if registry lookup fails)
LIFETIME_CAP_STANDARD = 137917.01
LIFETIME_CAP_NO_WORSE_OFF = 84571.66
LIFETIME_CAP_EFFECTIVE_FROM = "2026-03-20"


def init_ce3_routes(*, db, user_dep, core1_assert_access, core1_write_timeline, loop1_open_case):
    global _db, _user_dep, _core1_assert_access, _core1_write_event, _loop1_open_case
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access
    _core1_write_event = core1_write_timeline
    _loop1_open_case = loop1_open_case


def _flag_enabled() -> bool:
    return os.environ.get("CE3_ENABLED", "1") != "0"


async def _assert_flag():
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if isinstance(dt, str):
        return dt
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt.isoformat()
    return dt.astimezone(timezone.utc).isoformat()


async def ensure_ce3_indexes(db) -> None:
    """Idempotent index creation for the CE-3 collections."""
    try:
        await db.lifetime_cap_accumulators.create_index([("participant_id", 1), ("calculated_at", -1)])
        await db.contribution_reconciliations.create_index(
            [("participant_id", 1), ("reconciliation_period_month", 1)], unique=True
        )
        await db.pension_change_history.create_index([("participant_id", 1), ("committed_at", -1)])
        await db.hardship_pathway_triggers.create_index([("participant_id", 1), ("created_at", -1)])
        await db.hardship_pathway_triggers.create_index(
            [("participant_id", 1), ("source_artefact_id", 1)], unique=False
        )
    except Exception as e:  # pragma: no cover, defensive
        logger.warning("ce3 index creation skipped: %s", e)


# ---------------------------------------------------------------------------
# Lifetime cap accumulator
# ---------------------------------------------------------------------------


def _lifetime_cap_for_participant(p: dict) -> tuple[float, str, str]:
    """Return (cap, effective_date, cap_variant) for a participant.

    Grandfathered "no-worse-off" HCP transitioned participants get the
    lower $84,571.66 cap; everyone else the standard $137,917.01 cap.
    """
    is_no_worse_off = bool(p.get("is_no_worse_off") or p.get("no_worse_off"))
    if is_no_worse_off:
        return LIFETIME_CAP_NO_WORSE_OFF, LIFETIME_CAP_EFFECTIVE_FROM, "no_worse_off"
    return LIFETIME_CAP_STANDARD, LIFETIME_CAP_EFFECTIVE_FROM, "standard"


def _summary_dict(s: dict) -> dict:
    """Defensive: some legacy statements have `summary` as a string, not dict."""
    v = s.get("summary")
    return v if isinstance(v, dict) else {}


def _sum_contribution_from_statement(s: dict) -> float:
    """Best-effort contribution total from a statement doc.

    Order of preference:
      1. summary.total_participant_contribution (v5+)
      2. line_items[].participant_contribution / contribution_paid sum
      3. 0.0
    """
    summary = _summary_dict(s)
    total = summary.get("total_participant_contribution")
    if total is not None:
        try:
            return float(total)
        except (TypeError, ValueError):
            pass
    lines = s.get("line_items") or []
    if isinstance(lines, list) and lines:
        total = 0.0
        for li in lines:
            if not isinstance(li, dict):
                continue
            v = li.get("participant_contribution")
            if v is None:
                v = li.get("contribution_paid")
            try:
                total += float(v or 0)
            except (TypeError, ValueError):
                continue
        return total
    return 0.0


def _years_at_current_pace_bucket(years: Optional[float]) -> Optional[str]:
    if years is None:
        return None
    if years > 50:
        return "gt_50"
    if years > 20:
        return "20_to_50"
    if years > 10:
        return "10_to_20"
    if years > 5:
        return "5_to_10"
    return "lt_5"


async def _compute_lifetime_cap(participant_id: str) -> dict:
    """Compute the lifetime cap accumulator (fresh, no cache)."""
    p = await _db.participants.find_one({"id": participant_id}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    cap, cap_effective, cap_variant = _lifetime_cap_for_participant(p)

    # Sum used-to-date from every ACTIVE decoded statement for this participant.
    used = 0.0
    statement_ids: List[str] = []
    program_entry: Optional[date] = None
    q = {"participant_id": participant_id, "status": {"$ne": "archived"}}
    async for s in _db.statements.find(q, {"_id": 0, "id": 1, "summary": 1, "line_items": 1, "extracted_json": 1}):
        used += _sum_contribution_from_statement(s)
        sid = s.get("id")
        if sid:
            statement_ids.append(sid)
        ext = s.get("extracted_json") or {}
        if not isinstance(ext, dict):
            ext = {}
        p_start = ext.get("period_start") or _summary_dict(s).get("period_start")
        if p_start:
            try:
                d = date.fromisoformat(p_start[:10])
                if program_entry is None or d < program_entry:
                    program_entry = d
            except Exception:
                pass

    # Program entry date fallbacks: participant.program_entry_date > earliest
    # statement period start > participant.created_at
    entry_str = p.get("program_entry_date")
    if entry_str:
        try:
            program_entry = date.fromisoformat(entry_str[:10])
        except Exception:
            pass
    if program_entry is None:
        created_iso = p.get("created_at")
        if created_iso:
            try:
                program_entry = date.fromisoformat(str(created_iso)[:10])
            except Exception:
                pass

    today = date.today()
    days_since = (today - program_entry).days if program_entry else 0
    remaining = max(cap - used, 0.0)

    # Years at current pace, null under 30 days per spec G.6.
    if days_since < 30 or used <= 0:
        annual_pace = None
        years_at_pace: Optional[float] = None
        cap_reach_date: Optional[date] = None
    else:
        annual_pace = (used / days_since) * 365.0
        years_at_pace = remaining / annual_pace if annual_pace > 0 else None
        cap_reach_date = None
        if years_at_pace and years_at_pace > 0:
            try:
                from datetime import timedelta
                cap_reach_date = today + timedelta(days=int(years_at_pace * 365))
            except Exception:
                cap_reach_date = None

    is_approaching = (
        remaining < (cap * 0.2)
        or (years_at_pace is not None and years_at_pace < 5)
    )

    return {
        "id": str(uuid.uuid4()),
        "participant_id": participant_id,
        "household_id": p.get("household_id"),
        "total_cap": round(cap, 2),
        "total_cap_effective_date": cap_effective,
        "cap_variant": cap_variant,
        "used_to_date": round(used, 2),
        "used_to_date_source": "actual_from_statements" if statement_ids else "projected_from_estimator",
        "based_on_statement_ids": statement_ids,
        "based_on_projection_ids": [],
        "program_entry_date": program_entry.isoformat() if program_entry else None,
        "days_since_program_entry": days_since,
        "remaining": round(remaining, 2),
        "annual_pace": round(annual_pace, 2) if annual_pace is not None else None,
        "years_at_current_pace": round(years_at_pace, 1) if years_at_pace is not None else None,
        "years_at_current_pace_bucket": _years_at_current_pace_bucket(years_at_pace),
        "cap_projected_reach_date": cap_reach_date.isoformat() if cap_reach_date else None,
        "is_cap_approaching": is_approaching,
        "calculated_at": _iso(_now()),
        "data_residency": "ap-southeast-2",
    }


@ce3_router.get("/participants/{pid}/lifetime-cap")
async def get_lifetime_cap(pid: str, request: Request):
    """Return the current lifetime cap accumulator, refreshing if cache stale."""
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    acc = await _compute_lifetime_cap(pid)
    # Persist the latest snapshot (append-only for auditable lineage per C.5).
    try:
        await _db.lifetime_cap_accumulators.insert_one({**acc})
    except Exception as e:  # pragma: no cover
        logger.warning("lifetime_cap persist skipped: %s", e)
    return acc


@ce3_router.post("/participants/{pid}/lifetime-cap/refresh")
async def refresh_lifetime_cap(pid: str, request: Request):
    """Force-refresh the lifetime cap and return the fresh accumulator."""
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    acc = await _compute_lifetime_cap(pid)
    try:
        await _db.lifetime_cap_accumulators.insert_one({**acc})
    except Exception:  # pragma: no cover
        pass
    return acc


# ---------------------------------------------------------------------------
# Annual projection
# ---------------------------------------------------------------------------


def _financial_year_bounds(today: date) -> tuple[date, date]:
    """Australian FY: 1 July → 30 June."""
    if today.month >= 7:
        return date(today.year, 7, 1), date(today.year + 1, 6, 30)
    return date(today.year - 1, 7, 1), date(today.year, 6, 30)


def _confidence_from_signals(fy_statement_count: int) -> tuple[str, float, str]:
    """(confidence, +/-percent, human explanation)."""
    if fy_statement_count >= 3:
        return "high", 0.05, "3 or more decoded statements in this financial year"
    if fy_statement_count >= 1:
        return "medium", 0.15, "1 or 2 decoded statements this financial year"
    return "low", 0.30, "no decoded statements yet this financial year"


async def _latest_projection(participant_id: str) -> Optional[dict]:
    """Fetch the most recent CE-2 contribution_estimate for this participant."""
    p = await _db.participants.find_one({"id": participant_id}, {"_id": 0, "household_id": 1})
    if not p:
        return None
    users_in_hh = []
    async for u in _db.users.find({"household_id": p.get("household_id")}, {"_id": 0, "id": 1}):
        if u.get("id"):
            users_in_hh.append(u["id"])
    q = {"user_id": {"$in": users_in_hh}} if users_in_hh else {"_impossible_": True}
    doc = await _db.contribution_estimates.find_one(q, {"_id": 0}, sort=[("created_at", -1)])
    return doc


@ce3_router.get("/participants/{pid}/annual-projection")
async def get_annual_projection(pid: str, request: Request):
    """Return the annual projection with a confidence-banded range.

    Sources the quarterly estimate from the participant's most recent CE-2
    saved estimate; multiplies by 4 for annual; applies +/-5% / 15% / 30%
    range based on decoded-statement count this financial year.
    """
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)

    today = date.today()
    fy_start, fy_end = _financial_year_bounds(today)

    # Count decoded statements whose period overlaps this FY.
    fy_stmt_count = 0
    q = {"participant_id": pid, "status": {"$ne": "archived"}}
    async for s in _db.statements.find(q, {"_id": 0, "extracted_json": 1, "summary": 1}):
        ext = s.get("extracted_json") or {}
        if not isinstance(ext, dict):
            ext = {}
        p_start = ext.get("period_start") or _summary_dict(s).get("period_start")
        if not p_start:
            continue
        try:
            d = date.fromisoformat(p_start[:10])
            if fy_start <= d <= fy_end:
                fy_stmt_count += 1
        except Exception:
            continue

    confidence, band, band_reason = _confidence_from_signals(fy_stmt_count)

    proj = await _latest_projection(pid)
    quarterly = 0.0
    weekly = 0.0
    government_annual = 0.0
    pension_status = None
    if proj:
        payload = proj.get("output") or proj.get("payload") or proj
        quarterly = float(payload.get("contribution_quarterly") or 0.0)
        weekly = float(payload.get("contribution_weekly") or 0.0)
        government_annual = float(payload.get("government_share_annual") or 0.0)
        pension_status = payload.get("pension_status")

    annual = round(quarterly * 4, 2)
    low = round(annual * (1 - band), 2)
    high = round(annual * (1 + band), 2)

    caregiver_explain = (
        f"This annual estimate is based on {fy_stmt_count} of their decoded "
        f"statement{'s' if fy_stmt_count != 1 else ''} this financial year. "
        f"We're confident within about {int(band * 100)}%. Actual amounts may "
        f"vary depending on how many services are used across the year."
    ) if quarterly > 0 else (
        "Once you save a contribution estimate, we'll show the annual projection here."
    )
    participant_explain = caregiver_explain.replace("their decoded statement", "your decoded statement")

    return {
        "participant_id": pid,
        "financial_year_start": fy_start.isoformat(),
        "financial_year_end": fy_end.isoformat(),
        "financial_year_label": f"{fy_start.year}-{str(fy_end.year)[-2:]}",
        "annual_estimate": annual,
        "annual_estimate_range": {
            "low": low,
            "high": high,
            "confidence": confidence,
            "band_percent": int(band * 100),
            "range_explanation_tokens": {
                "caregiver": caregiver_explain,
                "participant_self": participant_explain,
            },
            "range_reason": band_reason,
        },
        "weekly_estimate": weekly,
        "quarterly_estimate": quarterly,
        "government_share_annual": round(government_annual, 2),
        "pension_status_at_projection": pension_status,
        "based_on_projection_id": (proj or {}).get("id"),
        "fy_statement_count": fy_stmt_count,
        "data_residency": "ap-southeast-2",
        "computed_at": _iso(_now()),
    }


# ---------------------------------------------------------------------------
# Contribution reconciliation
# ---------------------------------------------------------------------------


def _variance_flag(variance_pct: float) -> str:
    v = abs(variance_pct)
    if v < 5:
        return "minor_variance"
    if v < 15:
        return "notable_variance"
    if v < 30:
        return "significant_variance"
    return "step_change_variance"


def _explanation_for_variance(flag: str, month_label: str, variance_pct: float) -> Dict[str, str]:
    """Deterministic (not AI) explanation per spec H.4."""
    if flag == "minor_variance":
        c = (f"For {month_label}, actual was within 5% of what was estimated. "
             f"That's a good sign, no action needed.")
        return {"caregiver": c, "participant_self": c.replace("what was estimated", "what you were estimated to pay")}
    if flag == "step_change_variance":
        c = (f"For {month_label}, actual was {abs(variance_pct):.0f}% different from "
             f"estimated. This is unusually large and may indicate a billing error or "
             f"a change in circumstance. Consider reviewing the statement and discussing "
             f"with the provider.")
        return {"caregiver": c, "participant_self": c}
    if flag == "significant_variance":
        c = (f"For {month_label}, actual was {abs(variance_pct):.0f}% different from "
             f"estimated. Worth understanding why, the statement or a recent change "
             f"may explain it.")
        return {"caregiver": c, "participant_self": c}
    # notable_variance
    c = (f"For {month_label}, actual was {abs(variance_pct):.0f}% different from "
         f"estimated. Small variation is normal; nothing to act on unless the pattern "
         f"continues.")
    return {"caregiver": c, "participant_self": c}


async def _reconcile_month(pid: str, period_month: str, actor_id: Optional[str] = None) -> dict:
    """Reconcile a single month (YYYY-MM). Idempotent per participant/period."""
    try:
        y, m = period_month.split("-")
        month_start = date(int(y), int(m), 1)
        if int(m) == 12:
            month_end = date(int(y) + 1, 1, 1)
        else:
            month_end = date(int(y), int(m) + 1, 1)
    except (ValueError, IndexError):
        raise HTTPException(status_code=422, detail="period_month must be YYYY-MM")

    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    # Actual: sum contribution from every statement whose period overlaps this month.
    actual = 0.0
    based_on_statement_ids: List[str] = []
    q = {"participant_id": pid, "status": {"$ne": "archived"}}
    async for s in _db.statements.find(q, {"_id": 0, "id": 1, "summary": 1, "line_items": 1, "extracted_json": 1}):
        ext = s.get("extracted_json") or {}
        if not isinstance(ext, dict):
            ext = {}
        p_start_str = ext.get("period_start") or _summary_dict(s).get("period_start")
        p_end_str = ext.get("period_end") or _summary_dict(s).get("period_end")
        if not p_start_str or not p_end_str:
            continue
        try:
            p_start = date.fromisoformat(p_start_str[:10])
            p_end = date.fromisoformat(p_end_str[:10])
        except Exception:
            continue
        # Overlap check: statement covers this month if periods overlap.
        if p_start <= month_end and p_end >= month_start:
            actual += _sum_contribution_from_statement(s)
            if s.get("id"):
                based_on_statement_ids.append(s["id"])

    # Estimated: use the CE-2 monthly slice (quarterly / 3).
    proj = await _latest_projection(pid)
    if proj:
        payload = proj.get("output") or proj.get("payload") or proj
        estimated = float(payload.get("contribution_quarterly") or 0.0) / 3.0
    else:
        estimated = 0.0
    variance_amount = actual - estimated
    if estimated > 0:
        variance_pct = (variance_amount / estimated) * 100
    elif actual > 0:
        # No CE-2 estimate but a real charge landed, treat as unexpected
        # step change so it surfaces for follow-up.
        variance_pct = 100.0
    else:
        variance_pct = 0.0
    if not based_on_statement_ids:
        flag = "none_reconciled"
    else:
        flag = _variance_flag(variance_pct)

    explanation = None
    if flag in {"notable_variance", "significant_variance", "step_change_variance"}:
        explanation = _explanation_for_variance(flag, month_start.strftime("%B %Y"), variance_pct)

    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "household_id": p.get("household_id"),
        "reconciliation_period_month": period_month,
        "month_start": month_start.isoformat(),
        "month_end": (month_end.isoformat() if flag != "none_reconciled" else month_end.isoformat()),
        "estimated_contribution": round(estimated, 2),
        "estimated_from_projection_id": (proj or {}).get("id"),
        "actual_contribution": round(actual, 2),
        "based_on_statement_ids": based_on_statement_ids,
        "variance_amount": round(variance_amount, 2),
        "variance_percentage": round(variance_pct, 2),
        "variance_flag": flag,
        "case_id": None,
        "case_created_at": None,
        "automated_explanation_tokens": explanation,
        "user_notes": None,
        "computed_at": _iso(now),
        "data_residency": "ap-southeast-2",
    }

    # Upsert on (participant_id, reconciliation_period_month), spec D.3 idempotent.
    filt = {"participant_id": pid, "reconciliation_period_month": period_month}
    existing = await _db.contribution_reconciliations.find_one(filt, {"_id": 0})
    if existing:
        # Preserve id + user_notes + case linkage from prior run.
        doc["id"] = existing["id"]
        doc["user_notes"] = existing.get("user_notes")
        doc["case_id"] = existing.get("case_id")
        doc["case_created_at"] = existing.get("case_created_at")
    await _db.contribution_reconciliations.update_one(
        filt, {"$set": doc}, upsert=True
    )

    # Open a LOOP-1 case on step_change_variance (idempotent via dedupe_key
    # per Section H.5). Only fire if the case doesn't already exist for this
    # month, and only if we actually reconciled real data.
    if flag == "step_change_variance" and _loop1_open_case and not existing:
        try:
            case = await _loop1_open_case(
                participant_id=pid,
                case_type="statement_anomaly_ready",
                title=f"Contribution variance for {month_start.strftime('%B %Y')}",
                summary=(
                    f"Actual contribution was {abs(variance_pct):.0f}% different from "
                    f"estimated for {month_start.strftime('%B %Y')}. May indicate a "
                    f"billing error or a change in circumstance."
                ),
                source_tool="ce3",
                source_artefact_type="contribution_reconciliation",
                source_artefact_id=doc["id"],
                severity="high",
                actor_type="system",
                actor_id=actor_id,
                metadata={
                    "contribution_variance": True,
                    "variance_amount": doc["variance_amount"],
                    "variance_percentage": doc["variance_percentage"],
                    "period_month": period_month,
                },
                dedupe_key=f"ce3_variance:{pid}:{period_month}",
            )
            if case and case.get("id"):
                doc["case_id"] = case["id"]
                doc["case_created_at"] = _iso(now)
                await _db.contribution_reconciliations.update_one(
                    filt, {"$set": {"case_id": case["id"], "case_created_at": doc["case_created_at"]}}
                )
        except Exception as e:  # pragma: no cover
            logger.warning("ce3 case-open failed: %s", e)
        # Auto-open a hardship trigger per spec Section J.1
        try:
            await _open_hardship_trigger(
                pid=pid,
                source="step_change_variance",
                source_artefact_id=doc["id"],
                notes=f"Auto-triggered by {abs(variance_pct):.0f}% step-change in {month_start.strftime('%B %Y')}",
                actor_user_id=actor_id,
            )
        except Exception as e:  # pragma: no cover
            logger.warning("ce3 hardship trigger auto-open failed: %s", e)

    # Timeline event on first reconcile of the month.
    if not existing and _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=pid,
                event_type="contribution_reconciled",
                event_source="ce3",
                actor_type="system",
                actor_id=actor_id,
                summary_tokens={
                    "caregiver": (
                        f"{month_start.strftime('%B %Y')} contribution reconciled, "
                        f"{flag.replace('_', ' ')}"
                    ),
                    "participant_self": (
                        f"Your {month_start.strftime('%B %Y')} contribution reconciled, "
                        f"{flag.replace('_', ' ')}"
                    ),
                },
                metadata={"period_month": period_month, "variance_flag": flag},
            )
        except Exception:  # pragma: no cover
            pass

    return doc


class ReconcileBody(BaseModel):
    period_month: str = Field(pattern=r"^\d{4}-\d{2}$")


@ce3_router.get("/participants/{pid}/reconciliations")
async def list_reconciliations(pid: str, request: Request, months_back: int = Query(12, ge=1, le=36)):
    """List the last N months of reconciliation records."""
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    rows: List[Dict[str, Any]] = []
    async for r in _db.contribution_reconciliations.find(
        {"participant_id": pid}, {"_id": 0}
    ).sort("reconciliation_period_month", -1).limit(months_back):
        rows.append(r)
    return {"reconciliations": rows, "count": len(rows)}


@ce3_router.post("/participants/{pid}/reconciliations/reconcile")
async def reconcile(pid: str, body: ReconcileBody, request: Request):
    """Reconcile a single month (idempotent per participant/period)."""
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    return await _reconcile_month(pid, body.period_month, actor_id=user.get("id"))


class ReconcileNoteBody(BaseModel):
    user_notes: str = Field(min_length=1, max_length=2000)


@ce3_router.post("/reconciliations/{rid}/add-user-note")
async def add_user_note(rid: str, body: ReconcileNoteBody, request: Request):
    """Attach a user note to a reconciliation."""
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.contribution_reconciliations.find_one({"id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    await _core1_assert_access(user, existing["participant_id"])
    await _db.contribution_reconciliations.update_one(
        {"id": rid}, {"$set": {"user_notes": body.user_notes}}
    )
    return {"ok": True}


class ReconcileActionBody(BaseModel):
    action: str = Field(pattern=r"^(confirmed_correct|disputed|explained|unsure)$")


@ce3_router.post("/reconciliations/{rid}/action")
async def reconciliation_action(rid: str, body: ReconcileActionBody, request: Request):
    """Record a per-row user action per spec H.6."""
    await _assert_flag()
    user = await _user_dep(request)
    existing = await _db.contribution_reconciliations.find_one({"id": rid}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Reconciliation not found")
    await _core1_assert_access(user, existing["participant_id"])
    await _db.contribution_reconciliations.update_one(
        {"id": rid}, {"$set": {
            "user_action": body.action,
            "user_action_at": _iso(_now()),
            "user_action_by_user_id": user.get("id"),
        }}
    )
    return {"ok": True, "action": body.action}


# ---------------------------------------------------------------------------
# CE-3 v2 hardship pathway (Section J)
# ---------------------------------------------------------------------------


HARDSHIP_TRIGGER_SOURCES = {
    "step_change_variance",
    "pension_step_down",
    "persistent_variance_pattern",
    "user_indication",
}

HARDSHIP_USER_RESPONSES = {"started", "completed", "dismissed", "took_hand_off"}


class HardshipTriggerBody(BaseModel):
    source: str = Field(pattern=r"^(user_indication|step_change_variance|pension_step_down|persistent_variance_pattern)$")
    reconciliation_id: Optional[str] = None
    pension_change_history_id: Optional[str] = None
    notes: Optional[str] = None


class HardshipUserResponseBody(BaseModel):
    response: str
    hand_off_target: Optional[str] = Field(default=None, pattern=r"^(provider_letter|maca_letter|other)?$")


class HardshipNotesBody(BaseModel):
    notes: str = Field(min_length=1, max_length=2000)


def _hardship_view(h: dict) -> dict:
    return {
        "id": h["id"],
        "participant_id": h["participant_id"],
        "source": h["source"],
        "source_artefact_id": h.get("source_artefact_id"),
        "notes": h.get("notes"),
        "notification_tokens": {
            "caregiver": (
                "We noticed a change in your contribution pattern. If circumstances "
                "have changed and paying the contribution has become difficult, "
                "there may be a financial hardship supplement available."
            ),
            "participant_self": (
                "We noticed a change in your contribution pattern. If your circumstances "
                "have changed and paying your contribution has become difficult, you may "
                "qualify for a financial hardship supplement."
            ),
        },
        "user_response": h.get("user_response"),
        "hand_off_target": h.get("hand_off_target"),
        "user_responded_at": _iso(h.get("user_responded_at")),
        "created_at": _iso(h.get("created_at")),
        "walkthrough_route": "/app/tools/contribution-estimator/hardship-walkthrough",
    }


async def _open_hardship_trigger(pid: str, source: str, source_artefact_id: Optional[str],
                                  notes: Optional[str], actor_user_id: Optional[str]) -> dict:
    """Create a hardship trigger with idempotent dedupe on (pid, source_artefact_id)."""
    # Dedupe when we have a real artefact reference so the same reconciliation
    # or pension change can only ever produce one trigger.
    if source_artefact_id:
        existing = await _db.hardship_pathway_triggers.find_one(
            {"participant_id": pid, "source_artefact_id": source_artefact_id},
            {"_id": 0},
        )
        if existing:
            return existing
    now = _now()
    doc = {
        "id": str(uuid.uuid4()),
        "participant_id": pid,
        "source": source,
        "source_artefact_id": source_artefact_id,
        "notes": notes,
        "user_response": None,
        "hand_off_target": None,
        "user_responded_at": None,
        "created_at": now,
        "actor_user_id": actor_user_id,
        "data_residency": "ap-southeast-2",
    }
    await _db.hardship_pathway_triggers.insert_one(dict(doc))
    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=pid,
                event_type="hardship_pathway_triggered",
                event_source="ce3",
                actor_type="user" if source == "user_indication" else "system",
                actor_id=actor_user_id,
                summary_tokens={
                    "caregiver": "Hardship pathway suggested, review the walkthrough for options.",
                    "participant_self": "Hardship pathway suggested, you may qualify for a hardship supplement.",
                },
                metadata={"trigger_id": doc["id"], "source": source, "artefact_id": source_artefact_id},
            )
        except Exception:  # pragma: no cover
            pass
    return doc


@ce3_router.post("/participants/{pid}/hardship/triggers")
async def create_hardship_trigger(pid: str, body: HardshipTriggerBody, request: Request):
    """Open a hardship trigger. Used by:
      - Frontend "my situation has changed" affordance (source=user_indication)
      - Internal auto-triggers from reconciliation/pension flows

    Idempotent when source_artefact_id is supplied.
    """
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    artefact = body.reconciliation_id or body.pension_change_history_id
    doc = await _open_hardship_trigger(pid, body.source, artefact, body.notes, user.get("id"))
    return _hardship_view(doc)


@ce3_router.get("/participants/{pid}/hardship/triggers")
async def list_hardship_triggers(pid: str, request: Request, only_open: bool = False):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    q: Dict[str, Any] = {"participant_id": pid}
    if only_open:
        q["user_response"] = {"$in": [None, "started"]}
    rows = []
    async for h in _db.hardship_pathway_triggers.find(q, {"_id": 0}).sort("created_at", -1).limit(50):
        rows.append(_hardship_view(h))
    return {"triggers": rows, "count": len(rows)}


@ce3_router.get("/hardship/triggers/{tid}")
async def get_hardship_trigger(tid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    trig = await _db.hardship_pathway_triggers.find_one({"id": tid}, {"_id": 0})
    if not trig:
        raise HTTPException(status_code=404, detail="Trigger not found")
    await _core1_assert_access(user, trig["participant_id"])
    return _hardship_view(trig)


@ce3_router.post("/hardship/triggers/{tid}/user-response")
async def hardship_user_response(tid: str, body: HardshipUserResponseBody, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    trig = await _db.hardship_pathway_triggers.find_one({"id": tid}, {"_id": 0})
    if not trig:
        raise HTTPException(status_code=404, detail="Trigger not found")
    await _core1_assert_access(user, trig["participant_id"])
    if body.response not in HARDSHIP_USER_RESPONSES:
        raise HTTPException(status_code=422, detail=f"Unknown response: {body.response}")
    update: Dict[str, Any] = {
        "user_response": body.response,
        "user_responded_at": _now(),
    }
    if body.hand_off_target:
        update["hand_off_target"] = body.hand_off_target
    await _db.hardship_pathway_triggers.update_one({"id": tid}, {"$set": update})
    fresh = await _db.hardship_pathway_triggers.find_one({"id": tid}, {"_id": 0})
    return _hardship_view(fresh)


@ce3_router.patch("/hardship/triggers/{tid}/notes")
async def update_hardship_notes(tid: str, body: HardshipNotesBody, request: Request):
    """Companion notes: caregiver-authored context that will prefill the LF-1
    letter draft when the walkthrough hand-off is opened. Idempotent."""
    await _assert_flag()
    user = await _user_dep(request)
    trig = await _db.hardship_pathway_triggers.find_one({"id": tid}, {"_id": 0})
    if not trig:
        raise HTTPException(status_code=404, detail="Trigger not found")
    await _core1_assert_access(user, trig["participant_id"])
    await _db.hardship_pathway_triggers.update_one(
        {"id": tid},
        {"$set": {"notes": body.notes, "notes_updated_at": _now(), "notes_updated_by_user_id": user.get("id")}},
    )
    fresh = await _db.hardship_pathway_triggers.find_one({"id": tid}, {"_id": 0})
    return _hardship_view(fresh)


@ce3_router.get("/hardship/walkthrough")
async def hardship_walkthrough_content(request: Request):
    """Return the hardship walkthrough content per spec J.3/J.4.

    Content is static, sourced from Aged Care Act 2024 primary instruments.
    Not personalised. Users still apply through the appropriate channel;
    this walkthrough only educates.
    """
    await _assert_flag()
    await _user_dep(request)
    return {
        "version": "v1",
        "route": "/app/tools/contribution-estimator/hardship-walkthrough",
        "steps": [
            {
                "id": "intro",
                "title": "Financial hardship under the Aged Care Act 2024",
                "body_tokens": {
                    "caregiver": (
                        "The Aged Care Act 2024 provides a financial hardship supplement "
                        "for people who cannot reasonably pay their contribution without "
                        "affecting their standard of living. This walkthrough explains what's "
                        "available and how to apply, it does not submit anything for you."
                    ),
                    "participant_self": (
                        "Australia's Aged Care Act 2024 provides a financial hardship "
                        "supplement for people who cannot reasonably pay their contribution "
                        "without affecting their standard of living. This walkthrough explains "
                        "what's available and how to apply, you'll do the applying yourself."
                    ),
                },
            },
            {
                "id": "eligibility",
                "title": "Eligibility overview",
                "body_tokens": {
                    "caregiver": (
                        "Broadly, hardship applies if paying the contribution would leave the "
                        "person unable to cover essential living costs (rent, food, medication, "
                        "utilities). Assessment considers income, assets, essential expenses, "
                        "and any exceptional circumstances (e.g. sudden loss of a partner, "
                        "unexpected medical costs, house needing urgent repairs)."
                    ),
                    "participant_self": (
                        "Broadly, hardship applies if paying your contribution would leave you "
                        "unable to cover essential living costs like rent, food, medication, or "
                        "utilities. The assessment considers your income, assets, essential "
                        "expenses, and any exceptional circumstances."
                    ),
                },
                "self_check_items": [
                    "Recent income change (job loss, partner deceased, reduced pension)",
                    "Unexpected essential expense (medical, urgent home repair, funeral)",
                    "Assets that can't be readily converted to cash",
                    "Existing debt commitments",
                ],
                "authoritative": False,
            },
            {
                "id": "documents",
                "title": "Documents to gather",
                "body_tokens": {
                    "caregiver": "Have these ready before applying:",
                    "participant_self": "Have these ready before applying:",
                },
                "checklist": [
                    "Recent bank statements (3 months)",
                    "Centrelink or pension statement",
                    "Rent or mortgage statement",
                    "Bills for essential utilities (electricity, water, phone)",
                    "Medical expense receipts",
                    "Provider's contribution statement (Wayly has these decoded)",
                    "Details of any exceptional circumstance",
                ],
            },
            {
                "id": "how_to_apply",
                "title": "How to apply",
                "channels": [
                    {"key": "provider", "label": "Talk to the provider first",
                     "note": "Some providers can adjust or waive contribution before a formal application."},
                    {"key": "my_aged_care", "label": "My Aged Care", "phone": "1800 200 422",
                     "url": "https://www.myagedcare.gov.au"},
                    {"key": "services_australia", "label": "Services Australia (for age pension changes)",
                     "phone": "13 23 00"},
                ],
            },
            {
                "id": "what_to_expect",
                "title": "What to expect",
                "body_tokens": {
                    "caregiver": (
                        "Once submitted, an assessment typically takes 4-8 weeks. If approved, "
                        "the supplement is backdated to the application date. If declined, an "
                        "internal review can be requested within 90 days; further review is "
                        "available via the Aged Care Quality and Safety Commission (ACQSC)."
                    ),
                    "participant_self": (
                        "Once you apply, an assessment typically takes 4-8 weeks. If approved, "
                        "the supplement is backdated to your application date. If declined, you "
                        "can request an internal review within 90 days; further review is "
                        "available via the Aged Care Quality and Safety Commission."
                    ),
                },
            },
        ],
        "hand_offs": [
            {
                "key": "provider_letter",
                "label": "Draft a letter to your provider requesting hardship consideration",
                "lf1_archetype": "notification",
                "lf1_situation_id": 9,
                "situation_label": "We can't afford the current contributions",
            },
            {
                "key": "maca_letter",
                "label": "Draft a letter to My Aged Care requesting the hardship supplement",
                "lf1_archetype": "notification",
                "lf1_situation_id": 9,
                "situation_label": "We can't afford the current contributions",
            },
        ],
        "disclosures": [
            "Wayly does not submit hardship applications on your behalf.",
            "This information is educational and not legal or financial advice.",
        ],
    }


# ---------------------------------------------------------------------------
# Reconciliation → hardship trigger auto-wire (Section J.1)
# ---------------------------------------------------------------------------





PENSION_STATUSES = {"full_pension", "part_pension", "cshc", "self_funded"}
PENSION_CHANGE_REASONS = {
    "partner_deceased",
    "partner_no_longer_receiving_pension",
    "income_changed",
    "assets_changed",
    "voluntary_reassessment",
    "other",
}


class PensionPreviewBody(BaseModel):
    new_pension_status: str
    effective_date: Optional[str] = None
    reason: Optional[str] = None
    reason_notes: Optional[str] = None


class PensionCommitBody(BaseModel):
    new_pension_status: str
    effective_date: Optional[str] = None
    reason: Optional[str] = None
    reason_notes: Optional[str] = None
    prior_pdf_handling: str = Field(default="mark_superseded",
                                    pattern=r"^(mark_superseded|delete|keep_unmarked)$")
    confirmed: bool = False


def _support_resources_for(reason: Optional[str]) -> Optional[Dict[str, Any]]:
    """Return support resources tuned to sensitive reason contexts (Section I.6)."""
    if reason == "partner_deceased":
        return {
            "context": "partner_deceased",
            "tone": "factual, not clinical",
            "resources": [
                {"name": "Lifeline", "phone": "13 11 14", "when": "24/7 crisis support"},
                {"name": "Bereavement Care Programme", "phone": "13 24 68",
                 "when": "Support for people bereaved by a partner's death"},
            ],
            "note_tokens": {
                "caregiver": "Take the time you need. You can pause and return to this at any time.",
                "participant_self": "Take the time you need. You can pause and return to this at any time.",
            },
        }
    return None


async def _compute_projection_for_pension_status(participant_id: str,
                                                  new_pension_status: str,
                                                  effective_date: Optional[str]) -> Dict[str, Any]:
    """Rerun CE-2 for this participant with a new pension_status. Returns
    contribution_weekly/quarterly/annual + government_share_annual.

    Sources the rest of the CE-2 input from the participant's most recent
    saved projection (payload snapshot). If no saved projection exists yet,
    returns zeros so the UI can prompt the user to run the standard estimator
    first.
    """
    proj = await _latest_projection(participant_id)
    if not proj:
        return {"contribution_weekly": 0.0, "contribution_quarterly": 0.0,
                "contribution_annual": 0.0, "government_share_annual": 0.0,
                "no_prior_projection": True}
    payload = dict(proj.get("input") or proj.get("payload") or {})
    if not payload:
        return {"contribution_weekly": 0.0, "contribution_quarterly": 0.0,
                "contribution_annual": 0.0, "government_share_annual": 0.0,
                "no_prior_projection": True}
    payload["pension_status"] = new_pension_status
    if effective_date:
        payload["effective_date"] = effective_date

    # CE-2's engine is synchronous; call from thread pool to avoid blocking.
    import asyncio as _aio
    from services.ce2_engine import build_input, calculate

    def _run():
        return calculate(build_input(payload))

    out = await _aio.get_event_loop().run_in_executor(None, _run)
    return {
        "contribution_weekly": float(out.contribution_weekly or 0),
        "contribution_quarterly": float(out.contribution_quarterly or 0),
        "contribution_annual": float(out.contribution_annual or 0),
        "government_share_annual": float(out.government_share_annual or 0),
        "no_prior_projection": False,
    }


@ce3_router.post("/participants/{pid}/pension-change/preview")
async def preview_pension_change(pid: str, body: PensionPreviewBody, request: Request):
    """CE-3 v2 pension wizard Step 2, impact preview.

    Recomputes CE-2 with the new pension_status and returns a prior vs new
    comparison across weekly / quarterly / annual, plus government-share
    delta and effect on the lifetime cap projection. No persistence.
    """
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    if body.new_pension_status not in PENSION_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown pension_status: {body.new_pension_status}")
    if body.reason and body.reason not in PENSION_CHANGE_REASONS:
        raise HTTPException(status_code=422, detail=f"Unknown reason: {body.reason}")

    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    current_status = p.get("pension_status") or "self_funded"

    # PRIOR, read latest saved CE-2 projection
    proj = await _latest_projection(pid)
    prior = {"contribution_weekly": 0.0, "contribution_quarterly": 0.0,
             "contribution_annual": 0.0, "government_share_annual": 0.0}
    if proj:
        payload = proj.get("output") or proj.get("payload") or proj
        prior = {
            "contribution_weekly": float(payload.get("contribution_weekly") or 0),
            "contribution_quarterly": float(payload.get("contribution_quarterly") or 0),
            "contribution_annual": float((payload.get("contribution_quarterly") or 0) * 4),
            "government_share_annual": float(payload.get("government_share_annual") or 0),
        }

    # NEW, rerun CE-2 with the new pension_status
    new_proj = await _compute_projection_for_pension_status(pid, body.new_pension_status, body.effective_date)

    delta_weekly = round(new_proj["contribution_weekly"] - prior["contribution_weekly"], 2)
    delta_quarterly = round(new_proj["contribution_quarterly"] - prior["contribution_quarterly"], 2)
    delta_annual = round(new_proj["contribution_annual"] - prior["contribution_annual"], 2)
    delta_gov = round(new_proj["government_share_annual"] - prior["government_share_annual"], 2)

    # Lifetime cap impact: use the *new* annual pace to reproject years remaining.
    cap = await _compute_lifetime_cap(pid)
    remaining = cap.get("remaining") or 0.0
    new_annual_pace = new_proj["contribution_annual"] if new_proj["contribution_annual"] > 0 else None
    new_years_at_pace = (remaining / new_annual_pace) if (new_annual_pace and new_annual_pace > 0) else None

    # Prior PDF handling preview, list superseding candidates
    prior_pdfs: List[Dict[str, Any]] = []
    async for e in _db.contribution_estimates.find(
        {"user_id": p.get("owner_user_id") or (p.get("household_id") and {"$exists": True})},
        {"_id": 0, "id": 1, "created_at": 1, "pdf_id": 1}
    ).sort("created_at", -1).limit(5):
        if e.get("pdf_id"):
            prior_pdfs.append({"estimate_id": e["id"], "pdf_id": e["pdf_id"],
                               "created_at": _iso(e.get("created_at"))})

    is_step_down = _is_income_step_down(current_status, body.new_pension_status)

    return {
        "current_pension_status": current_status,
        "new_pension_status": body.new_pension_status,
        "effective_date": body.effective_date or date.today().isoformat(),
        "reason": body.reason,
        "prior": prior,
        "new": {
            "contribution_weekly": round(new_proj["contribution_weekly"], 2),
            "contribution_quarterly": round(new_proj["contribution_quarterly"], 2),
            "contribution_annual": round(new_proj["contribution_annual"], 2),
            "government_share_annual": round(new_proj["government_share_annual"], 2),
        },
        "delta": {
            "weekly": delta_weekly,
            "quarterly": delta_quarterly,
            "annual": delta_annual,
            "government_share_annual": delta_gov,
        },
        "lifetime_cap_impact": {
            "remaining": remaining,
            "new_annual_pace": round(new_annual_pace, 2) if new_annual_pace else None,
            "new_years_at_current_pace": round(new_years_at_pace, 1) if new_years_at_pace else None,
        },
        "prior_pdf_artefacts": prior_pdfs,
        "no_prior_projection": new_proj.get("no_prior_projection", False),
        "is_income_step_down": is_step_down,
        "hardship_pathway_suggested": is_step_down and (delta_annual > 0),
        "support_resources": _support_resources_for(body.reason),
        "backdated": bool(body.effective_date and body.effective_date < date.today().isoformat()),
        "computed_at": _iso(_now()),
    }


def _is_income_step_down(prior: str, new: str) -> bool:
    """A pension step-down is a move to a status with LOWER income support
    (e.g. full → part, part → cshc, cshc → self_funded)."""
    rank = {"full_pension": 3, "part_pension": 2, "cshc": 1, "self_funded": 0}
    return rank.get(new, 0) < rank.get(prior, 0)


@ce3_router.post("/participants/{pid}/pension-change/commit")
async def commit_pension_change(pid: str, body: PensionCommitBody, request: Request):
    """CE-3 v2 pension wizard Step 4, persist the change.

    Snapshots the prior projection into `pension_change_history`, updates
    the participant's pension_status, marks prior CE-2 PDF artefacts per the
    caller's handling choice, and writes a CORE-1 timeline event. Returns
    the confirmation summary.
    """
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    if not body.confirmed:
        raise HTTPException(status_code=422, detail="confirmed must be true to commit")
    if body.new_pension_status not in PENSION_STATUSES:
        raise HTTPException(status_code=422, detail=f"Unknown pension_status: {body.new_pension_status}")

    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    prior_status = p.get("pension_status") or "self_funded"
    proj = await _latest_projection(pid)
    effective_date = body.effective_date or date.today().isoformat()
    now = _now()

    # Snapshot prior projection into history
    history_id = str(uuid.uuid4())
    await _db.pension_change_history.insert_one({
        "id": history_id,
        "participant_id": pid,
        "household_id": p.get("household_id"),
        "prior_pension_status": prior_status,
        "new_pension_status": body.new_pension_status,
        "effective_date": effective_date,
        "reason": body.reason,
        "reason_notes": body.reason_notes,
        "prior_projection_id": (proj or {}).get("id"),
        "prior_projection_snapshot": proj if proj else None,
        "prior_pdf_handling": body.prior_pdf_handling,
        "actor_user_id": user.get("id"),
        "committed_at": now,
        "data_residency": "ap-southeast-2",
    })

    # Update the participant's pension_status
    await _db.participants.update_one(
        {"id": pid},
        {"$set": {"pension_status": body.new_pension_status, "updated_at": now}},
    )

    # Prior PDF handling
    pdfs_touched = 0
    if body.prior_pdf_handling in ("mark_superseded", "delete") and proj and proj.get("id"):
        target = {"user_id": proj.get("user_id"), "id": {"$lt": proj["id"]}}
        if body.prior_pdf_handling == "mark_superseded":
            r = await _db.contribution_estimates.update_many(
                {"user_id": proj.get("user_id")},
                {"$set": {"superseded_by_pension_change": history_id,
                          "superseded_at": now}},
            )
            pdfs_touched = r.modified_count if hasattr(r, "modified_count") else 0
        elif body.prior_pdf_handling == "delete":
            # Never actually delete, flag deletable and let a scheduled job
            # remove after a retention window. Safer for audit trail.
            r = await _db.contribution_estimates.update_many(
                {"user_id": proj.get("user_id")},
                {"$set": {"pending_delete_due_to_pension_change": history_id,
                          "pending_delete_at": now}},
            )
            pdfs_touched = r.modified_count if hasattr(r, "modified_count") else 0

    # CORE-1 timeline event
    if _core1_write_event:
        try:
            await _core1_write_event(
                participant_id=pid,
                event_type="pension_status_changed",
                event_source="ce3",
                actor_type="user",
                actor_id=user.get("id"),
                summary_tokens={
                    "caregiver": f"Pension status changed: {prior_status} → {body.new_pension_status}",
                    "participant_self": f"Your pension status changed: {prior_status} → {body.new_pension_status}",
                },
                metadata={
                    "history_id": history_id,
                    "prior": prior_status,
                    "new": body.new_pension_status,
                    "effective_date": effective_date,
                    "reason": body.reason,
                },
            )
        except Exception:  # pragma: no cover
            pass

    # Auto-open a hardship trigger on income step-downs per spec J.1
    is_step_down = _is_income_step_down(prior_status, body.new_pension_status)
    if is_step_down:
        try:
            await _open_hardship_trigger(
                pid=pid,
                source="pension_step_down",
                source_artefact_id=history_id,
                notes=f"Pension moved from {prior_status} to {body.new_pension_status} (reason: {body.reason or 'not stated'})",
                actor_user_id=user.get("id"),
            )
        except Exception as e:  # pragma: no cover
            logger.warning("ce3 pension-triggered hardship failed: %s", e)

    return {
        "id": history_id,
        "participant_id": pid,
        "prior_pension_status": prior_status,
        "new_pension_status": body.new_pension_status,
        "effective_date": effective_date,
        "prior_pdf_handling": body.prior_pdf_handling,
        "prior_pdfs_touched": pdfs_touched,
        "committed_at": _iso(now),
        "hardship_pathway_suggested": is_step_down,
    }


@ce3_router.get("/participants/{pid}/pension-change/history")
async def list_pension_change_history(pid: str, request: Request):
    await _assert_flag()
    user = await _user_dep(request)
    await _core1_assert_access(user, pid)
    rows = []
    async for h in _db.pension_change_history.find({"participant_id": pid}, {"_id": 0, "prior_projection_snapshot": 0}).sort("committed_at", -1).limit(50):
        h["committed_at"] = _iso(h.get("committed_at"))
        rows.append(h)
    return {"history": rows, "count": len(rows)}


# ---------------------------------------------------------------------------
# Status
# ---------------------------------------------------------------------------


@ce3_router.get("/status")
async def status():
    # Update surfaces list to include pension_change
    return {
        "ce3_v1_enabled": _flag_enabled(),
        "version": "v1+pension_wizard+hardship",
        "data_residency": "ap-southeast-2",
        "surfaces": ["lifetime_cap", "annual_projection", "reconciliation", "pension_change_wizard", "hardship_pathway"],
        "deferred_to_v2": ["extended_pdf", "prior_year_comparison"],
    }
