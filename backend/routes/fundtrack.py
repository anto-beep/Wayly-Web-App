"""FUNDTRACK-1 · Budget tracking + charge entry router.

Ships INSIDE BSC-1 and the Today dashboard (locked decision #1 — no new tool or
nav item). Exposes the capture layer (charge entry's three paths + catch-up),
the weekly screen payload, the what-if "revised H" calculation and the alerts.
All budget maths flows through the canonical ladder (``compute_ladder``) with
E (used so far) and G (booked care) supplied by ``lib.fundtrack.tracking``.

Feature-flagged per household (decision: rollout/rollback). The flag defaults
ON in preview so the demo households can exercise it; a household doc may carry
``fundtrack_enabled: false`` to force it off.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

import budget as budget_lib
from lib.fundtrack import compute_ladder
from lib.fundtrack import tracking as T

logger = logging.getLogger("fundtrack")

fundtrack_router = APIRouter(prefix="/fundtrack", tags=["fundtrack"])

_db: AsyncIOMotorDatabase = None  # type: ignore
_user_dep: Optional[Callable] = None
_core1_assert_access: Optional[Callable] = None


def init_fundtrack_routes(*, db, user_dep, core1_assert_access=None) -> None:
    global _db, _user_dep, _core1_assert_access
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _flag_default() -> bool:
    return os.environ.get("FUNDTRACK_1_FLAG", "true").lower() != "false"


def _today(as_of: Optional[str]) -> date:
    try:
        return date.fromisoformat(as_of[:10]) if as_of else date.today()
    except Exception:
        return date.today()


async def _baseline(pid: str, request: Request) -> dict:
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")
    hh = await _db.households.find_one({"id": p.get("household_id")}, {"_id": 0}) or {}
    enabled = hh.get("fundtrack_enabled")
    if enabled is None:
        enabled = _flag_default()
    cls = int(p.get("classification") or hh.get("classification") or 4)
    q_start, q_end, q_label = budget_lib.get_quarter_window()
    name = (p.get("first_name") or p.get("name") or "this person").split(" ")[0]
    return {
        "user": user,
        "participant": p,
        "household_id": p.get("household_id"),
        "classification": cls,
        "is_grandfathered": bool(hh.get("is_grandfathered") or p.get("is_grandfathered")),
        "quarter": (q_start, q_end, q_label),
        "name": name,
        "enabled": bool(enabled),
    }


async def _ladder_for(base: dict, tracking: dict, today: date):
    q_start, q_end, q_label = base["quarter"]
    return compute_ladder(
        classification=base["classification"],
        used_so_far=tracking["E_aud"],
        committed_forward=tracking["G_aud"],
        anchor_statement_age_days=tracking.get("anchor_age_days"),
        today=today,
        quarter_window=(q_start, q_end, q_label),
    )


def _svc_price(svc: dict) -> Decimal:
    return Decimal(str(svc.get("unit_price") or svc.get("last_amount") or 0))


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------
class ChargeIn(BaseModel):
    source: str = Field("entered", pattern="^(entered|invoice|booked|catch_up)$")
    service_id: Optional[str] = None
    service_name: str = Field(..., max_length=160)
    stream: Optional[str] = None
    date: str
    amount: Optional[float] = None  # None = unpriced visit (counts, no $)
    note: Optional[str] = Field(None, max_length=500)
    frequency: str = Field("once", pattern="^(once|weekly)$")
    until: Optional[str] = None  # for weekly booked plans
    confirmed: bool = True


class ChargePatch(BaseModel):
    amount: Optional[float] = None
    date: Optional[str] = None
    service_name: Optional[str] = None
    stream: Optional[str] = None
    status: Optional[str] = Field(None, pattern="^(live|missed|superseded)$")
    confirmed: Optional[bool] = None
    note: Optional[str] = Field(None, max_length=500)


class WhatIfIn(BaseModel):
    service_id: Optional[str] = None
    service_name: Optional[str] = None
    stream: Optional[str] = None
    unit_price: Optional[float] = None
    date: str
    time_band: Optional[str] = None
    frequency: str = Field("once", pattern="^(once|weekly)$")
    until: Optional[str] = None
    save: bool = False


class CatchUpVisit(BaseModel):
    service_id: Optional[str] = None
    service_name: str
    stream: Optional[str] = None
    date: str
    amount: Optional[float] = None


class CatchUpIn(BaseModel):
    visits: List[CatchUpVisit] = []


class VisitChangeIn(BaseModel):
    charge_id: Optional[str] = None
    service_name: Optional[str] = None
    stream: Optional[str] = None
    date: str
    change: str = Field(..., pattern="^(did_not_happen|shorter|longer|extra_visit|cancelled)$")
    amount: Optional[float] = None
    scope: str = Field("just_this", pattern="^(just_this|and_future)$")


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@fundtrack_router.get("/status")
async def status():
    return {"spec": "FUNDTRACK-1 v2", "flag_default_on": _flag_default()}


@fundtrack_router.get("/participants/{pid}/overview")
async def overview(pid: str, request: Request, as_of: Optional[str] = None):
    base = await _baseline(pid, request)
    today = _today(as_of)
    q_start, q_end, q_label = base["quarter"]
    tracking = await T.gather_tracking(
        _db, household_id=base["household_id"], participant_id=pid,
        q_start=q_start, q_end=q_end, today=today,
    )
    ladder = await _ladder_for(base, tracking, today)
    alerts = T.build_alerts(ladder=ladder, tracking=tracking, today=today, q_end=q_end)
    svcs = await T.saved_services(_db, household_id=base["household_id"], participant_id=pid)
    return {
        "enabled": base["enabled"],
        "participant_id": pid,
        "participant_name": base["name"],
        "classification": base["classification"],
        "quarter_label": q_label,
        "ladder": ladder,
        "booked": tracking["booked"],
        "booked_unpriced_count": tracking["unpriced_booked"],
        "used": tracking["used"],
        "superseded": tracking["superseded"],
        "pending": tracking["pending"],
        "saved_services": svcs,
        "alerts": alerts,
        "source_note": "These are Wayly's estimates from your statements and the charges you've added, not an official balance. Your provider is the source of record.",
    }


@fundtrack_router.get("/participants/{pid}/saved-services")
async def get_saved_services(pid: str, request: Request):
    base = await _baseline(pid, request)
    svcs = await T.saved_services(_db, household_id=base["household_id"], participant_id=pid)
    return {"services": svcs}


async def _apply_and_message(base: dict, pid: str, today: date) -> Dict[str, Any]:
    q_start, q_end, q_label = base["quarter"]
    tracking = await T.gather_tracking(
        _db, household_id=base["household_id"], participant_id=pid,
        q_start=q_start, q_end=q_end, today=today,
    )
    ladder = await _ladder_for(base, tracking, today)
    f = ladder["figures"]["F"]
    aud = "$" + format(f, ",.2f")
    msg = f"Added. Left for care this quarter is now {aud}."
    if tracking["unpriced_booked"]:
        n = tracking["unpriced_booked"]
        msg += f" ({n} unpriced visit{'s' if n != 1 else ''} not yet counted.)"
    return {"ladder": ladder, "message": msg,
            "booked": tracking["booked"], "used": tracking["used"]}


@fundtrack_router.post("/participants/{pid}/charges")
async def add_charge(pid: str, body: ChargeIn, request: Request, as_of: Optional[str] = None):
    base = await _baseline(pid, request)
    today = _today(as_of)
    q_start, q_end, _ = base["quarter"]
    stream = T.normalise_stream(body.stream)
    share = T.participant_share(body.amount, stream) if body.amount is not None else None
    uid = base["user"].get("id") if isinstance(base["user"], dict) else None

    # A weekly booked plan expands into one charge per visit date.
    dates: List[date]
    if body.source == "booked" and body.frequency == "weekly":
        start = T._parse_date(body.date) or today
        until = T._parse_date(body.until)
        dates = T.visit_dates(start, "weekly", until, q_end)
    else:
        d0 = T._parse_date(body.date)
        dates = [d0] if d0 else [today]

    created: List[dict] = []
    for d in dates:
        doc = {
            "id": str(uuid4()),
            "household_id": base["household_id"],
            "participant_id": pid,
            "source": body.source,
            "service_id": body.service_id,
            "service_name": body.service_name.strip(),
            "stream": stream,
            "date": d.isoformat(),
            "amount": body.amount,
            "participant_share": share,
            "frequency": body.frequency,
            "status": "live",
            "confirmed": bool(body.confirmed),
            "unpriced": body.amount is None,
            "superseded_by": None,
            "note": (body.note or "").strip(),
            "created_at": _now(),
            "created_by_user_id": uid,
            "updated_at": _now(),
        }
        await _db.fundtrack_charges.insert_one(doc)
        doc.pop("_id", None)
        doc["created_at"] = doc["created_at"].isoformat()
        doc["updated_at"] = doc["updated_at"].isoformat()
        created.append(doc)

    applied = await _apply_and_message(base, pid, today)
    return {"charges": created, **applied}


@fundtrack_router.get("/participants/{pid}/charges")
async def list_charges(pid: str, request: Request):
    await _baseline(pid, request)
    rows = await _db.fundtrack_charges.find({"participant_id": pid}, {"_id": 0}).sort("date", -1).to_list(500)
    for r in rows:
        for k in ("created_at", "updated_at", "superseded_at"):
            if isinstance(r.get(k), datetime):
                r[k] = r[k].isoformat()
    return {"charges": rows}


@fundtrack_router.patch("/charges/{charge_id}")
async def patch_charge(charge_id: str, body: ChargePatch, request: Request, as_of: Optional[str] = None):
    existing = await _db.fundtrack_charges.find_one({"id": charge_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Charge not found")
    base = await _baseline(existing["participant_id"], request)
    today = _today(as_of)
    update: Dict[str, Any] = {"updated_at": _now()}
    if body.amount is not None or (body.amount is None and body.status is None and "amount" in body.model_fields_set):
        update["amount"] = body.amount
        update["unpriced"] = body.amount is None
        st = T.normalise_stream(body.stream or existing.get("stream"))
        update["participant_share"] = T.participant_share(body.amount, st) if body.amount is not None else None
    if body.date is not None:
        update["date"] = body.date
    if body.service_name is not None:
        update["service_name"] = body.service_name.strip()
    if body.stream is not None:
        update["stream"] = T.normalise_stream(body.stream)
    if body.status is not None:
        update["status"] = body.status
    if body.confirmed is not None:
        update["confirmed"] = body.confirmed
    if body.note is not None:
        update["note"] = body.note.strip()
    await _db.fundtrack_charges.update_one({"id": charge_id}, {"$set": update})
    applied = await _apply_and_message(base, existing["participant_id"], today)
    return {"updated": True, **applied}


@fundtrack_router.delete("/charges/{charge_id}")
async def delete_charge(charge_id: str, request: Request, as_of: Optional[str] = None):
    existing = await _db.fundtrack_charges.find_one({"id": charge_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Charge not found")
    base = await _baseline(existing["participant_id"], request)
    today = _today(as_of)
    await _db.fundtrack_charges.delete_one({"id": charge_id})
    applied = await _apply_and_message(base, existing["participant_id"], today)
    return {"deleted": True, **applied}


@fundtrack_router.post("/participants/{pid}/what-if")
async def what_if(pid: str, body: WhatIfIn, request: Request, as_of: Optional[str] = None):
    base = await _baseline(pid, request)
    today = _today(as_of)
    q_start, q_end, _ = base["quarter"]
    tracking = await T.gather_tracking(
        _db, household_id=base["household_id"], participant_id=pid,
        q_start=q_start, q_end=q_end, today=today,
    )
    ladder = await _ladder_for(base, tracking, today)

    # Resolve the price: explicit, else from the household's saved service.
    stream = body.stream
    unit_price = body.unit_price
    if unit_price is None and (body.service_id or body.service_name):
        svcs = await T.saved_services(_db, household_id=base["household_id"], participant_id=pid)
        match = next((s for s in svcs if s["service_id"] == body.service_id
                      or (body.service_name and s["service_name"].lower() == body.service_name.lower())), None)
        if match:
            unit_price = match["last_amount"]
            stream = stream or match["stream"]
    stream = T.normalise_stream(stream)
    start = T._parse_date(body.date) or today
    until = T._parse_date(body.until)

    result = T.compute_what_if(
        current_F=Decimal(str(ladder["figures"]["F"])),
        current_H=Decimal(str(ladder["figures"]["H"])),
        unit_price=Decimal(str(unit_price or 0)),
        stream=stream, start=start, frequency=body.frequency, until=until,
        q_start=q_start, q_end=q_end,
    )
    result["current_spare_aud"] = ladder["figures"]["H"]
    result["unit_price_aud"] = float(unit_price or 0)
    result["service_name"] = body.service_name
    result["stream"] = stream

    saved = None
    if body.save and (body.service_name):
        add_body = ChargeIn(
            source="booked", service_id=body.service_id, service_name=body.service_name,
            stream=stream, date=start.isoformat(), amount=float(unit_price or 0) or None,
            frequency=body.frequency, until=body.until, confirmed=True,
        )
        saved = await add_charge(pid, add_body, request, as_of=as_of)
    return {"what_if": result, "saved": saved}


@fundtrack_router.get("/participants/{pid}/catch-up")
async def catch_up_list(pid: str, request: Request, as_of: Optional[str] = None, weeks: int = 3):
    base = await _baseline(pid, request)
    today = _today(as_of)
    q_start, _, _ = base["quarter"]
    visits = await T.catch_up_expected(_db, household_id=base["household_id"], participant_id=pid, q_start=q_start, today=today, weeks=weeks)
    return {"expected_visits": visits}


@fundtrack_router.post("/participants/{pid}/catch-up")
async def catch_up_save(pid: str, body: CatchUpIn, request: Request, as_of: Optional[str] = None):
    base = await _baseline(pid, request)
    today = _today(as_of)
    uid = base["user"].get("id") if isinstance(base["user"], dict) else None
    now = _now()
    docs = []
    for v in body.visits:
        stream = T.normalise_stream(v.stream)
        docs.append({
            "id": str(uuid4()), "household_id": base["household_id"], "participant_id": pid,
            "source": "catch_up", "service_id": v.service_id, "service_name": v.service_name.strip(),
            "stream": stream, "date": v.date, "amount": v.amount,
            "participant_share": T.participant_share(v.amount, stream) if v.amount is not None else None,
            "frequency": "once", "status": "live", "confirmed": True, "unpriced": v.amount is None,
            "superseded_by": None, "note": "", "created_at": now, "created_by_user_id": uid, "updated_at": now,
        })
    if docs:
        await _db.fundtrack_charges.insert_many(docs)
    applied = await _apply_and_message(base, pid, today)
    return {"saved_count": len(docs), **applied}


@fundtrack_router.post("/participants/{pid}/something-changed")
async def something_changed(pid: str, body: VisitChangeIn, request: Request, as_of: Optional[str] = None):
    base = await _baseline(pid, request)
    today = _today(as_of)
    uid = base["user"].get("id") if isinstance(base["user"], dict) else None
    now = _now()

    if body.charge_id:
        existing = await _db.fundtrack_charges.find_one({"id": body.charge_id}, {"_id": 0})
    else:
        existing = None

    if body.change in ("did_not_happen", "cancelled"):
        if existing:
            await _db.fundtrack_charges.update_one(
                {"id": body.charge_id}, {"$set": {"status": "missed", "confirmed": True, "updated_at": now,
                                                  "note": "Late cancellation" if body.change == "cancelled" else "Did not happen"}},
            )
    elif body.change in ("shorter", "longer", "extra_visit"):
        if existing and body.change in ("shorter", "longer") and body.amount is not None:
            st = T.normalise_stream(body.stream or existing.get("stream"))
            await _db.fundtrack_charges.update_one(
                {"id": body.charge_id},
                {"$set": {"amount": body.amount, "unpriced": False, "confirmed": True,
                          "participant_share": T.participant_share(body.amount, st), "updated_at": now}},
            )
        else:  # extra_visit → a new confirmed charge
            st = T.normalise_stream(body.stream)
            await _db.fundtrack_charges.insert_one({
                "id": str(uuid4()), "household_id": base["household_id"], "participant_id": pid,
                "source": "entered", "service_id": None, "service_name": (body.service_name or "Extra visit").strip(),
                "stream": st, "date": body.date, "amount": body.amount,
                "participant_share": T.participant_share(body.amount, st) if body.amount is not None else None,
                "frequency": "once", "status": "live", "confirmed": True, "unpriced": body.amount is None,
                "superseded_by": None, "note": "Added via Something changed",
                "created_at": now, "created_by_user_id": uid, "updated_at": now,
            })
    applied = await _apply_and_message(base, pid, today)
    return {"applied": True, **applied}


async def ensure_fundtrack_indexes() -> None:
    if _db is None:
        return
    await _db.fundtrack_charges.create_index("participant_id")
    await _db.fundtrack_charges.create_index("household_id")
    await _db.fundtrack_charges.create_index([("participant_id", 1), ("date", -1)])
