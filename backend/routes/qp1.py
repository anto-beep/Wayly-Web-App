"""QP-1 v1 (MVP), Quarterly Pacing HTTP surface.

Scope
-----
* ``ServiceSchedule``, recurring service definitions per participant.
* ``LedgerEntry``, per-event records; state machine:
    ``expected → confirmed | changed | missed | assumed``  (plus ``ad_hoc``)
* ``PacingSnapshot``, computed on-demand from the ledger (no persistence
  in v1 MVP; recomputed each call). Historical view + reconciliation +
  mid-quarter envelope transitions are v1.5.

Endpoints (all under /api/qp1)
------------------------------
POST   /schedules                      , create a schedule + materialise
                                          ledger for the current quarter
GET    /schedules?participant_id=...   , list schedules
PUT    /schedules/{id}                 , supersede (creates new version)
DELETE /schedules/{id}                 , soft delete + drop future entries

GET    /ledger?participant_id=&from=&to=, list ledger entries in a range
POST   /ledger/{id}/confirm            , mark expected → confirmed
POST   /ledger/{id}/missed             , mark expected → missed
POST   /ledger/{id}/changed            , capture actuals (partial or full)
POST   /ledger/ad_hoc                  , log an unscheduled service
POST   /ledger/auto_assume             , internal, marks stale expected → assumed

GET    /pacing?participant_id=...      , compute live pacing snapshot

Wire in server.py:
    from routes.qp1 import build_qp1_router
    api.include_router(build_qp1_router(db=db, user_dep=_user_from_request))
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone, timedelta, date
from typing import Any, Callable, Optional, Literal, List

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from budget import get_quarter_window, quarterly_budget as _classification_quarterly_budget

logger = logging.getLogger("wayly.qp1.routes")

# --- Constants (default rollover cap fallback; INDEX-1 authoritative) -------
DEFAULT_ROLLOVER_CAP_AUD = 1000.0

Cadence = Literal["weekly", "fortnightly", "monthly", "one_off"]
LedgerState = Literal["expected", "confirmed", "missed", "changed", "assumed", "ad_hoc", "reconciled"]

# --- Reconciliation tolerances ---------------------------------------------
RECONCILE_DATE_WINDOW_DAYS = 3     # ±3 days tolerance on the statement line date
RECONCILE_AMOUNT_TOLERANCE = 0.10  # ±10% amount tolerance

# ---------------------------------------------------------------------------
# Pydantic models (request bodies)
# ---------------------------------------------------------------------------

class ScheduleCreate(BaseModel):
    participant_id: str = Field(min_length=1)
    service_type: str = Field(min_length=1, max_length=120)
    provider_name: Optional[str] = Field(default=None, max_length=160)
    cadence: Cadence
    cadence_day: Optional[int] = Field(default=None, ge=0, le=6)  # 0=Mon
    cadence_day_of_month: Optional[int] = Field(default=None, ge=1, le=31)
    duration_hours: float = Field(gt=0, le=24)
    hourly_rate: float = Field(gt=0, le=1000)
    effective_from: str  # ISO date
    effective_to: Optional[str] = None

    @field_validator("effective_from", "effective_to")
    @classmethod
    def _iso(cls, v):
        if v is None:
            return v
        # Accept YYYY-MM-DD or full ISO
        try:
            date.fromisoformat(v[:10])
        except Exception as e:
            raise ValueError(f"invalid ISO date: {v}") from e
        return v[:10]


class ScheduleUpdate(BaseModel):
    duration_hours: Optional[float] = Field(default=None, gt=0, le=24)
    hourly_rate: Optional[float] = Field(default=None, gt=0, le=1000)
    provider_name: Optional[str] = Field(default=None, max_length=160)
    effective_to: Optional[str] = None
    status: Optional[Literal["active", "ended"]] = None


class LedgerConfirm(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=500)


class LedgerChanged(BaseModel):
    actual_duration_hours: Optional[float] = Field(default=None, gt=0, le=24)
    actual_rate: Optional[float] = Field(default=None, gt=0, le=1000)
    actual_amount: Optional[float] = Field(default=None, ge=0, le=100000)
    notes: Optional[str] = Field(default=None, max_length=500)


class LedgerAdHoc(BaseModel):
    participant_id: str
    service_type: str = Field(min_length=1, max_length=120)
    provider_name: Optional[str] = Field(default=None, max_length=160)
    actual_date: str  # ISO date
    actual_duration_hours: float = Field(gt=0, le=24)
    actual_rate: float = Field(gt=0, le=1000)
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("actual_date")
    @classmethod
    def _iso_date(cls, v):
        try:
            date.fromisoformat(v[:10])
        except Exception as e:
            raise ValueError("invalid ISO date") from e
        return v[:10]


class StatementLine(BaseModel):
    line_date: str  # ISO
    amount: float = Field(ge=0)
    description: Optional[str] = Field(default=None, max_length=240)

    @field_validator("line_date")
    @classmethod
    def _iso(cls, v):
        try:
            date.fromisoformat(v[:10])
        except Exception as e:
            raise ValueError("invalid ISO date") from e
        return v[:10]


class ReconcileBody(BaseModel):
    participant_id: str
    statement_ref: Optional[str] = Field(default=None, max_length=120)
    lines: List[StatementLine] = Field(min_length=1, max_length=500)
    create_adhoc_for_unmatched: bool = True


class ReconcileFromStatementBody(BaseModel):
    """Auto-feed from a decoded Wayly statement, the frontend passes just
    the statement id and we build the ``lines[]`` payload from
    ``statement.line_items``. Removes the paste-CSV step entirely.
    """
    participant_id: str
    statement_id: str
    create_adhoc_for_unmatched: bool = True
    exclude_zero_amounts: bool = True   # skip refunds / $0 rows by default


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _iso_d(d: date) -> str:
    return d.isoformat()


def _dates_for_cadence(sched: dict, start: date, end: date) -> List[date]:
    """Return the list of expected event dates within [start, end] inclusive."""
    cad = sched["cadence"]
    dur_start = date.fromisoformat(sched["effective_from"])
    dur_end = date.fromisoformat(sched["effective_to"]) if sched.get("effective_to") else end
    win_start = max(start, dur_start)
    win_end = min(end, dur_end)
    if win_start > win_end:
        return []
    dates: List[date] = []
    if cad == "one_off":
        if win_start <= dur_start <= win_end:
            dates.append(dur_start)
        return dates
    if cad in ("weekly", "fortnightly"):
        day = sched.get("cadence_day") or 0  # 0=Mon
        step = 7 if cad == "weekly" else 14
        # walk from first target day-of-week on/after win_start
        d = win_start
        offset = (day - d.weekday()) % 7
        d = d + timedelta(days=offset)
        while d <= win_end:
            dates.append(d)
            d = d + timedelta(days=step)
        return dates
    if cad == "monthly":
        dom = sched.get("cadence_day_of_month") or 1
        y, m = win_start.year, win_start.month
        while True:
            try:
                candidate = date(y, m, dom)
            except ValueError:
                # month with fewer days than dom → last day of month
                # walk backwards
                next_m = m + 1 if m < 12 else 1
                next_y = y if m < 12 else y + 1
                candidate = date(next_y, next_m, 1) - timedelta(days=1)
            if candidate > win_end:
                break
            if candidate >= win_start:
                dates.append(candidate)
            m += 1
            if m > 12:
                m = 1
                y += 1
        return dates
    return dates


def _ledger_amount(entry: dict) -> float:
    """Amount to attribute to the pacing calculation for this entry."""
    st = entry.get("state")
    if st == "reconciled":
        # Reconciled uses the statement-verified actual amount.
        return float(entry.get("actual_amount") or entry.get("expected_amount") or 0.0)
    if st in ("confirmed", "assumed", "expected"):
        return float(entry.get("expected_amount") or 0.0)
    if st in ("changed", "ad_hoc"):
        return float(entry.get("actual_amount") or 0.0)
    return 0.0  # missed → zero contribution


def _pace_status(projected: float, envelope: float) -> str:
    """Spec §9: Green ±5%, Amber ±15%, Red >15% *over*. Below 0.85 is
    surfaced via the separate underspend flag, not a red status colour."""
    if envelope <= 0:
        return "unknown"
    ratio = projected / envelope
    if 0.95 <= ratio <= 1.05:
        return "green"
    if 0.85 <= ratio <= 1.15:
        return "amber"
    if ratio > 1.15:
        return "red"
    return "underspend"


# ---------------------------------------------------------------------------
# Router builder
# ---------------------------------------------------------------------------

def build_qp1_router(*, db, user_dep: Callable) -> APIRouter:
    router = APIRouter(prefix="/qp1", tags=["quarterly-pacing"])

    async def _require_user(request: Request) -> dict:
        u = await user_dep(request)
        if not u:
            raise HTTPException(status_code=401, detail="Authentication required")
        return u

    async def _assert_owns_participant(user: dict, participant_id: str) -> None:
        """Confirm the caller shares the participant's household (or is the
        direct owner). Participants belong to households; users on the same
        household can manage them."""
        p = await db.participants.find_one(
            {"id": participant_id},
            {"account_id": 1, "user_id": 1, "household_id": 1, "_id": 0},
        )
        if not p:
            raise HTTPException(status_code=404, detail="Participant not found")
        if p.get("user_id") == user["id"]:
            return
        # Match on household_id (primary ownership signal) or account_id.
        u_hh = user.get("household_id")
        u_acc = user.get("account_id")
        if not u_hh or not u_acc:
            fresh = await db.users.find_one({"id": user["id"]}, {"household_id": 1, "account_id": 1, "_id": 0})
            u_hh = u_hh or (fresh or {}).get("household_id")
            u_acc = u_acc or (fresh or {}).get("account_id")
        if u_hh and p.get("household_id") == u_hh:
            return
        if u_acc and p.get("account_id") == u_acc:
            return
        raise HTTPException(status_code=403, detail="Not your participant")

    async def _materialise_ledger(schedule: dict) -> int:
        """Create expected LedgerEntries for the current quarter (and any
        remaining portion of the schedule that falls in it)."""
        q_start, q_end, _ = get_quarter_window()
        dates = _dates_for_cadence(schedule, q_start, q_end)
        # Skip any dates already covered by an existing entry for this schedule.
        existing = await db.qp1_ledger.find(
            {"schedule_id": schedule["id"]},
            {"expected_date": 1, "_id": 0},
        ).to_list(1000)
        already = {e["expected_date"] for e in existing}
        rows = []
        expected_amt = round(schedule["duration_hours"] * schedule["hourly_rate"], 2)
        for d in dates:
            iso = d.isoformat()
            if iso in already:
                continue
            rows.append({
                "id": str(uuid.uuid4()),
                "participant_id": schedule["participant_id"],
                "schedule_id": schedule["id"],
                "service_type": schedule["service_type"],
                "provider_name": schedule.get("provider_name"),
                "expected_date": iso,
                "actual_date": None,
                "expected_duration_hours": schedule["duration_hours"],
                "actual_duration_hours": None,
                "expected_rate": schedule["hourly_rate"],
                "actual_rate": None,
                "expected_amount": expected_amt,
                "actual_amount": None,
                "state": "expected",
                "source": "schedule",
                "confirmed_at": None,
                "confirmed_by_user_id": None,
                "notes": None,
                "version": 1,
                "created_at": _now_iso(),
            })
        if rows:
            await db.qp1_ledger.insert_many(rows)
        return len(rows)

    # ---------- SCHEDULES ----------
    @router.post("/schedules")
    async def create_schedule(body: ScheduleCreate, request: Request):
        user = await _require_user(request)
        await _assert_owns_participant(user, body.participant_id)
        sched = {
            "id": str(uuid.uuid4()),
            "user_id": user["id"],
            "participant_id": body.participant_id,
            "service_type": body.service_type,
            "provider_name": body.provider_name,
            "cadence": body.cadence,
            "cadence_day": body.cadence_day,
            "cadence_day_of_month": body.cadence_day_of_month,
            "duration_hours": body.duration_hours,
            "hourly_rate": body.hourly_rate,
            "expected_amount": round(body.duration_hours * body.hourly_rate, 2),
            "effective_from": body.effective_from,
            "effective_to": body.effective_to,
            "status": "active",
            "superseded_by": None,
            "source": "user",
            "version": 1,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await db.qp1_schedules.insert_one({**sched})
        materialised = await _materialise_ledger(sched)
        return {"schedule": sched, "ledger_entries_created": materialised}

    @router.get("/schedules")
    async def list_schedules(request: Request, participant_id: str):
        user = await _require_user(request)
        await _assert_owns_participant(user, participant_id)
        docs = await db.qp1_schedules.find(
            {"user_id": user["id"], "participant_id": participant_id, "status": "active"},
            {"_id": 0},
        ).to_list(200)
        return {"schedules": docs}

    @router.put("/schedules/{schedule_id}")
    async def update_schedule(schedule_id: str, body: ScheduleUpdate, request: Request):
        user = await _require_user(request)
        doc = await db.qp1_schedules.find_one({"id": schedule_id, "user_id": user["id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Schedule not found")
        upd = {k: v for k, v in body.model_dump(exclude_none=True).items()}
        if upd.get("duration_hours") is not None and upd.get("hourly_rate") is not None:
            upd["expected_amount"] = round(upd["duration_hours"] * upd["hourly_rate"], 2)
        elif upd.get("duration_hours") is not None:
            upd["expected_amount"] = round(upd["duration_hours"] * float(doc["hourly_rate"]), 2)
        elif upd.get("hourly_rate") is not None:
            upd["expected_amount"] = round(float(doc["duration_hours"]) * upd["hourly_rate"], 2)
        upd["updated_at"] = _now_iso()
        upd["version"] = int(doc.get("version") or 1) + 1
        await db.qp1_schedules.update_one({"id": schedule_id}, {"$set": upd})
        # Drop any future expected entries so re-materialisation reflects the
        # new rate/duration.
        today = datetime.now(timezone.utc).date().isoformat()
        await db.qp1_ledger.delete_many({
            "schedule_id": schedule_id,
            "state": "expected",
            "expected_date": {"$gte": today},
        })
        fresh = await db.qp1_schedules.find_one({"id": schedule_id}, {"_id": 0})
        await _materialise_ledger(fresh)
        return {"schedule": fresh}

    @router.delete("/schedules/{schedule_id}")
    async def delete_schedule(schedule_id: str, request: Request):
        user = await _require_user(request)
        doc = await db.qp1_schedules.find_one({"id": schedule_id, "user_id": user["id"]}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Schedule not found")
        await db.qp1_schedules.update_one(
            {"id": schedule_id},
            {"$set": {"status": "ended", "updated_at": _now_iso(), "effective_to": datetime.now(timezone.utc).date().isoformat()}},
        )
        # Drop future expected entries only (past ones stay for history).
        today = datetime.now(timezone.utc).date().isoformat()
        r = await db.qp1_ledger.delete_many({
            "schedule_id": schedule_id,
            "state": "expected",
            "expected_date": {"$gte": today},
        })
        return {"ok": True, "future_entries_removed": r.deleted_count}

    # ---------- LEDGER ----------
    @router.get("/ledger")
    async def list_ledger(request: Request, participant_id: str,
                          date_from: Optional[str] = None,
                          date_to: Optional[str] = None):
        user = await _require_user(request)
        await _assert_owns_participant(user, participant_id)
        q_start, q_end, _ = get_quarter_window()
        df = (date_from or _iso_d(q_start))[:10]
        dt = (date_to or _iso_d(q_end))[:10]
        entries = await db.qp1_ledger.find(
            {"participant_id": participant_id, "expected_date": {"$gte": df, "$lte": dt}},
            {"_id": 0},
        ).sort("expected_date", 1).to_list(1000)
        return {"entries": entries, "window": {"from": df, "to": dt}}

    async def _mutate_ledger(entry_id: str, user: dict, updates: dict) -> dict:
        doc = await db.qp1_ledger.find_one({"id": entry_id}, {"_id": 0})
        if not doc:
            raise HTTPException(status_code=404, detail="Ledger entry not found")
        # Ownership: check via schedule owner OR direct participant ownership
        # (covers ad-hoc entries with schedule_id=None).
        owned = False
        if doc.get("schedule_id"):
            sch = await db.qp1_schedules.find_one({"id": doc["schedule_id"]}, {"user_id": 1, "_id": 0})
            if sch and sch.get("user_id") == user["id"]:
                owned = True
        if not owned and doc.get("participant_id"):
            try:
                await _assert_owns_participant(user, doc["participant_id"])
                owned = True
            except HTTPException:
                pass
        if not owned:
            raise HTTPException(status_code=403, detail="Not your ledger entry")
        upd = dict(updates)
        upd["confirmed_at"] = _now_iso()
        upd["confirmed_by_user_id"] = user["id"]
        upd["version"] = int(doc.get("version") or 1) + 1
        await db.qp1_ledger.update_one({"id": entry_id}, {"$set": upd})
        return await db.qp1_ledger.find_one({"id": entry_id}, {"_id": 0})

    @router.post("/ledger/{entry_id}/confirm")
    async def confirm_entry(entry_id: str, body: LedgerConfirm, request: Request):
        user = await _require_user(request)
        return {"entry": await _mutate_ledger(entry_id, user, {
            "state": "confirmed",
            "actual_amount": None,
            "notes": body.notes,
        })}

    @router.post("/ledger/{entry_id}/missed")
    async def missed_entry(entry_id: str, body: LedgerConfirm, request: Request):
        user = await _require_user(request)
        return {"entry": await _mutate_ledger(entry_id, user, {
            "state": "missed",
            "actual_amount": 0.0,
            "notes": body.notes,
        })}

    @router.post("/ledger/{entry_id}/changed")
    async def changed_entry(entry_id: str, body: LedgerChanged, request: Request):
        user = await _require_user(request)
        # If amount not supplied, derive from duration × rate; fall back to
        # the original expected values for anything omitted.
        cur = await db.qp1_ledger.find_one({"id": entry_id}, {"_id": 0})
        if not cur:
            raise HTTPException(status_code=404, detail="Ledger entry not found")
        d = body.actual_duration_hours if body.actual_duration_hours is not None else cur.get("expected_duration_hours")
        r = body.actual_rate if body.actual_rate is not None else cur.get("expected_rate")
        amt = body.actual_amount if body.actual_amount is not None else round(float(d) * float(r), 2)
        return {"entry": await _mutate_ledger(entry_id, user, {
            "state": "changed",
            "actual_duration_hours": d,
            "actual_rate": r,
            "actual_amount": amt,
            "notes": body.notes,
        })}

    @router.post("/ledger/ad_hoc")
    async def ad_hoc_entry(body: LedgerAdHoc, request: Request):
        user = await _require_user(request)
        await _assert_owns_participant(user, body.participant_id)
        actual_amount = round(body.actual_duration_hours * body.actual_rate, 2)
        row = {
            "id": str(uuid.uuid4()),
            "participant_id": body.participant_id,
            "schedule_id": None,
            "service_type": body.service_type,
            "provider_name": body.provider_name,
            "expected_date": body.actual_date,
            "actual_date": body.actual_date,
            "expected_duration_hours": None,
            "actual_duration_hours": body.actual_duration_hours,
            "expected_rate": None,
            "actual_rate": body.actual_rate,
            "expected_amount": None,
            "actual_amount": actual_amount,
            "state": "ad_hoc",
            "source": "user",
            "confirmed_at": _now_iso(),
            "confirmed_by_user_id": user["id"],
            "notes": body.notes,
            "version": 1,
            "created_at": _now_iso(),
        }
        await db.qp1_ledger.insert_one({**row})
        return {"entry": row}

    @router.post("/ledger/auto_assume")
    async def auto_assume(request: Request, participant_id: str,
                          days_stale: int = 7):
        """Transition ``expected`` entries older than ``days_stale`` days to
        ``assumed`` state for a specific participant. Callers must own the
        participant."""
        user = await _require_user(request)
        await _assert_owns_participant(user, participant_id)
        cutoff = (datetime.now(timezone.utc).date() - timedelta(days=days_stale)).isoformat()
        q = {"state": "expected", "expected_date": {"$lt": cutoff}, "participant_id": participant_id}
        r = await db.qp1_ledger.update_many(q, {"$set": {"state": "assumed"}})
        return {"assumed": r.modified_count}

    # ---------- PACING ----------
    @router.get("/pacing")
    async def pacing(request: Request, participant_id: str,
                     envelope_override: Optional[float] = None,
                     classification: Optional[int] = None):
        """Compute a live PacingSnapshot on demand.

        ``envelope_override`` and ``classification`` are convenience knobs so
        the frontend (or a caller who already knows the participant's level)
        can drive the calculation without a separate lookup.
        """
        user = await _require_user(request)
        await _assert_owns_participant(user, participant_id)
        q_start, q_end, q_label = get_quarter_window()
        # Envelope: prefer override → classification → participant lookup.
        envelope: Optional[float] = None
        if envelope_override is not None:
            envelope = float(envelope_override)
        elif classification is not None:
            envelope = float(_classification_quarterly_budget(int(classification)))
        else:
            # Look up participant → household classification.
            part = await db.participants.find_one({"id": participant_id}, {"classification_level": 1, "_id": 0})
            level = (part or {}).get("classification_level")
            if isinstance(level, int) and 1 <= level <= 8:
                envelope = float(_classification_quarterly_budget(level))
        if envelope is None or envelope <= 0:
            envelope = 0.0

        entries = await db.qp1_ledger.find(
            {"participant_id": participant_id,
             "expected_date": {"$gte": q_start.isoformat(), "$lte": q_end.isoformat()}},
            {"_id": 0},
        ).to_list(2000)

        reconciled_total = 0.0
        confirmed_total = 0.0
        assumed_total = 0.0
        adhoc_total = 0.0
        expected_remaining_total = 0.0
        today = datetime.now(timezone.utc).date().isoformat()

        for e in entries:
            st = e.get("state")
            amt = _ledger_amount(e)
            if st == "reconciled":
                reconciled_total += amt
            elif st == "confirmed":
                confirmed_total += amt
            elif st == "assumed":
                assumed_total += amt
            elif st == "changed":
                confirmed_total += amt  # counts as actual spent
            elif st == "ad_hoc":
                adhoc_total += amt
            elif st == "expected":
                if (e.get("expected_date") or "") >= today:
                    expected_remaining_total += amt
                else:
                    # past-dated but still 'expected', treat as assumed
                    assumed_total += amt
            # missed → 0

        actual_spent = round(reconciled_total + confirmed_total + assumed_total + adhoc_total, 2)
        projected_total = round(actual_spent + expected_remaining_total, 2)

        # Expected pace at today (linear).
        total_days = (q_end - q_start).days + 1
        elapsed_days = min(total_days, max(0, (datetime.now(timezone.utc).date() - q_start).days + 1))
        expected_pace_today = round(envelope * (elapsed_days / total_days), 2) if total_days else 0.0

        status = _pace_status(projected_total, envelope) if envelope else "unknown"

        # Underspend flag: projected << envelope AND (envelope - projected) > rollover cap.
        underspend = False
        if envelope > 0 and projected_total < envelope:
            underspend = (envelope - projected_total) > DEFAULT_ROLLOVER_CAP_AUD

        # Confidence: statement-verified > user-confirmed > assumed.
        # High when reconciled share of actual spend ≥ 60%.
        # Medium when (reconciled + confirmed) share ≥ 60%.
        # Low otherwise.
        if actual_spent <= 0:
            confidence = "low"
        else:
            rec_share = reconciled_total / actual_spent
            verified_share = (reconciled_total + confirmed_total) / actual_spent
            if rec_share >= 0.60:
                confidence = "high"
            elif verified_share >= 0.60:
                confidence = "medium"
            else:
                confidence = "low"

        return {
            "participant_id": participant_id,
            "computed_at": _now_iso(),
            "quarter": {"start": q_start.isoformat(), "end": q_end.isoformat(), "label": q_label,
                        "total_days": total_days, "elapsed_days": elapsed_days},
            "envelope": round(envelope, 2),
            "reconciled_total": round(reconciled_total, 2),
            "confirmed_total": round(confirmed_total, 2),
            "assumed_total": round(assumed_total, 2),
            "adhoc_total": round(adhoc_total, 2),
            "actual_spent": actual_spent,
            "expected_remaining_total": round(expected_remaining_total, 2),
            "expected_pace_today": expected_pace_today,
            "projected_end_of_quarter_total": projected_total,
            "pace_status": status,
            "underspend_flag": underspend,
            "rollover_cap_aud": DEFAULT_ROLLOVER_CAP_AUD,
            "confidence": confidence,
            "entries_counted": len(entries),
        }

    # ---------- RECONCILIATION ----------
    @router.post("/reconciliations")
    async def reconcile_statement(body: ReconcileBody, request: Request):
        """Match statement lines against ledger entries and mark matches as
        ``reconciled``. Best-match by same-participant date proximity
        (±3 days) and amount tolerance (±10%). Optionally logs any unmatched
        lines as ``ad_hoc`` entries with source=``statement`` so pacing
        picks them up.

        Returns a per-line disposition list so the UI can show what changed.
        """
        user = await _require_user(request)
        await _assert_owns_participant(user, body.participant_id)
        stmt_ref = body.statement_ref or f"stmt-{uuid.uuid4().hex[:8]}"
        now_iso = _now_iso()

        # Load candidate ledger entries in a wide window around the earliest
        # and latest statement lines (± window days).
        dates = sorted(l.line_date for l in body.lines)
        d_min = (date.fromisoformat(dates[0])  - timedelta(days=RECONCILE_DATE_WINDOW_DAYS)).isoformat()
        d_max = (date.fromisoformat(dates[-1]) + timedelta(days=RECONCILE_DATE_WINDOW_DAYS)).isoformat()

        candidates = await db.qp1_ledger.find(
            {"participant_id": body.participant_id,
             "expected_date": {"$gte": d_min, "$lte": d_max},
             "state": {"$in": ["expected", "confirmed", "assumed", "changed"]}},
            {"_id": 0},
        ).to_list(2000)
        candidates_by_id = {c["id"]: c for c in candidates}
        available_ids = set(candidates_by_id.keys())

        dispositions = []
        matched_count = 0
        unmatched_count = 0

        for line in body.lines:
            best_id, best_score = None, None
            for cid in available_ids:
                c = candidates_by_id[cid]
                # Amount tolerance check.
                c_amt = float(c.get("expected_amount") or c.get("actual_amount") or 0.0)
                if c_amt <= 0:
                    continue
                amt_diff = abs(c_amt - line.amount) / max(c_amt, line.amount, 1.0)
                if amt_diff > RECONCILE_AMOUNT_TOLERANCE:
                    continue
                # Date window check.
                c_d = date.fromisoformat(c["expected_date"])
                l_d = date.fromisoformat(line.line_date)
                date_gap = abs((c_d - l_d).days)
                if date_gap > RECONCILE_DATE_WINDOW_DAYS:
                    continue
                score = (amt_diff, date_gap)  # lower is better
                if best_score is None or score < best_score:
                    best_score = score
                    best_id = cid
            if best_id:
                # Mark reconciled with statement metadata.
                await db.qp1_ledger.update_one(
                    {"id": best_id},
                    {"$set": {
                        "state": "reconciled",
                        "actual_amount": line.amount,
                        "actual_date": line.line_date,
                        "reconciled_at": now_iso,
                        "reconciled_by_user_id": user["id"],
                        "statement_ref": stmt_ref,
                        "statement_description": line.description,
                        "version": int(candidates_by_id[best_id].get("version") or 1) + 1,
                    }},
                )
                dispositions.append({
                    "line_date": line.line_date, "line_amount": line.amount,
                    "matched_entry_id": best_id, "outcome": "matched",
                })
                available_ids.discard(best_id)
                matched_count += 1
            else:
                unmatched_count += 1
                if body.create_adhoc_for_unmatched:
                    row = {
                        "id": str(uuid.uuid4()),
                        "participant_id": body.participant_id,
                        "schedule_id": None,
                        "service_type": (line.description or "Statement line")[:120],
                        "provider_name": None,
                        "expected_date": line.line_date,
                        "actual_date": line.line_date,
                        "expected_duration_hours": None,
                        "actual_duration_hours": None,
                        "expected_rate": None,
                        "actual_rate": None,
                        "expected_amount": None,
                        "actual_amount": line.amount,
                        "state": "ad_hoc",
                        "source": "statement",
                        "statement_ref": stmt_ref,
                        "statement_description": line.description,
                        "confirmed_at": now_iso,
                        "confirmed_by_user_id": user["id"],
                        "notes": None,
                        "version": 1,
                        "created_at": now_iso,
                    }
                    await db.qp1_ledger.insert_one({**row})
                    dispositions.append({
                        "line_date": line.line_date, "line_amount": line.amount,
                        "matched_entry_id": None, "outcome": "created_adhoc",
                        "entry_id": row["id"],
                    })
                else:
                    dispositions.append({
                        "line_date": line.line_date, "line_amount": line.amount,
                        "matched_entry_id": None, "outcome": "unmatched",
                    })

        # Persist a lightweight audit record.
        await db.qp1_reconciliations.insert_one({
            "id": str(uuid.uuid4()),
            "participant_id": body.participant_id,
            "user_id": user["id"],
            "statement_ref": stmt_ref,
            "line_count": len(body.lines),
            "matched_count": matched_count,
            "unmatched_count": unmatched_count,
            "created_at": now_iso,
        })

        return {
            "statement_ref": stmt_ref,
            "matched_count": matched_count,
            "unmatched_count": unmatched_count,
            "dispositions": dispositions,
        }

    @router.post("/reconciliations/from-statement")
    async def reconcile_from_statement(body: ReconcileFromStatementBody, request: Request):
        """Auto-feed reconciliation from a decoded Wayly statement.

        Loads ``statement.line_items``, converts each into a StatementLine
        (``date`` → ``line_date``, ``total`` → ``amount``, ``service_name``
        → ``description``), then delegates to :func:`reconcile_statement`.
        The statement must belong to a household the caller is on.
        """
        user = await _require_user(request)
        await _assert_owns_participant(user, body.participant_id)

        stmt = await db.statements.find_one({"id": body.statement_id}, {"_id": 0})
        if not stmt:
            raise HTTPException(status_code=404, detail="Statement not found")
        # Ownership: statement's household must match either the caller or
        # the participant we're reconciling into.
        stmt_hh = stmt.get("household_id")
        p = await db.participants.find_one({"id": body.participant_id}, {"household_id": 1, "_id": 0})
        if stmt_hh and p and stmt_hh != p.get("household_id"):
            raise HTTPException(status_code=403, detail="Statement is not in this participant's household")

        line_items = stmt.get("line_items") or []
        if not line_items:
            raise HTTPException(status_code=400, detail="Statement has no line items to reconcile")

        lines: List[StatementLine] = []
        for li in line_items:
            iso_date = (li.get("date") or "")[:10]
            amount = float(li.get("total") or 0.0)
            if not iso_date or (body.exclude_zero_amounts and amount <= 0):
                continue
            desc = li.get("service_name") or li.get("service_code") or ""
            try:
                lines.append(StatementLine(line_date=iso_date, amount=amount, description=desc[:240] or None))
            except Exception:  # pragma: no cover, malformed row, skip
                continue

        if not lines:
            raise HTTPException(status_code=400, detail="No usable line items on this statement")

        # Delegate, same matching logic, so any future tuning applies to both flows.
        forwarded = ReconcileBody(
            participant_id=body.participant_id,
            statement_ref=f"stmt-{body.statement_id[:8]}",
            lines=lines,
            create_adhoc_for_unmatched=body.create_adhoc_for_unmatched,
        )
        result = await reconcile_statement(forwarded, request)
        result["statement_id"] = body.statement_id
        result["source"] = "wayly_statement"
        result["lines_considered"] = len(lines)
        return result

    # ---------- HISTORY ----------
    @router.get("/pacing/history")
    async def pacing_history(request: Request, participant_id: str,
                             quarters: int = 4,
                             classification: Optional[int] = None):
        """Compute pacing summaries for the previous ``quarters`` completed
        quarters (default 4). The current quarter is *excluded*, clients
        should call /pacing for the live snapshot.
        """
        user = await _require_user(request)
        await _assert_owns_participant(user, participant_id)
        quarters = max(1, min(int(quarters), 12))

        # Determine current quarter start; walk backwards.
        q_start, _, _ = get_quarter_window()

        # Envelope resolver (mirrors /pacing).
        async def _resolve_envelope() -> float:
            if classification is not None:
                return float(_classification_quarterly_budget(int(classification)))
            part = await db.participants.find_one({"id": participant_id}, {"classification_level": 1, "_id": 0})
            level = (part or {}).get("classification_level")
            if isinstance(level, int) and 1 <= level <= 8:
                return float(_classification_quarterly_budget(level))
            return 0.0

        envelope = await _resolve_envelope()

        # Australian FY quarters. Walk back N quarters from q_start.
        def _prev_quarter_start(qs: date) -> date:
            # Q starts on the 1st of Jan/Apr/Jul/Oct.
            m = qs.month
            new_m = m - 3 if m > 3 else 12 + (m - 3)
            new_y = qs.year if m > 3 else qs.year - 1
            return date(new_y, new_m, 1)

        def _quarter_end(qs: date) -> date:
            # End = last day of month qs.month+2.
            end_m = qs.month + 2
            end_y = qs.year
            if end_m > 12:
                end_m -= 12; end_y += 1
            # First of the next month, minus a day.
            nxt_m = end_m + 1 if end_m < 12 else 1
            nxt_y = end_y if end_m < 12 else end_y + 1
            return date(nxt_y, nxt_m, 1) - timedelta(days=1)

        def _label(qs: date) -> str:
            month_names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                           "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
            end = _quarter_end(qs)
            return f"{month_names[qs.month - 1]}-{month_names[end.month - 1]} {qs.year}"

        history = []
        cursor = _prev_quarter_start(q_start)
        for _ in range(quarters):
            qe = _quarter_end(cursor)
            entries = await db.qp1_ledger.find(
                {"participant_id": participant_id,
                 "expected_date": {"$gte": cursor.isoformat(), "$lte": qe.isoformat()}},
                {"_id": 0},
            ).to_list(2000)

            reconciled = confirmed = assumed = adhoc = missed_ct = 0.0
            for e in entries:
                st = e.get("state")
                amt = _ledger_amount(e)
                if st == "reconciled": reconciled += amt
                elif st in ("confirmed", "changed"): confirmed += amt
                elif st == "assumed": assumed += amt
                elif st == "ad_hoc": adhoc += amt
                elif st == "missed": missed_ct += 1

            actual = round(reconciled + confirmed + assumed + adhoc, 2)
            status = _pace_status(actual, envelope) if envelope else "unknown"
            under = envelope > 0 and actual < envelope and (envelope - actual) > DEFAULT_ROLLOVER_CAP_AUD

            history.append({
                "quarter": {"start": cursor.isoformat(), "end": qe.isoformat(), "label": _label(cursor)},
                "envelope": round(envelope, 2),
                "reconciled_total": round(reconciled, 2),
                "confirmed_total": round(confirmed, 2),
                "assumed_total": round(assumed, 2),
                "adhoc_total": round(adhoc, 2),
                "actual_spent": actual,
                "pace_status": status,
                "underspend_flag": under,
                "entries_counted": len(entries),
                "missed_count": int(missed_ct),
            })
            cursor = _prev_quarter_start(cursor)

        return {"history": history, "rollover_cap_aud": DEFAULT_ROLLOVER_CAP_AUD}

    return router
