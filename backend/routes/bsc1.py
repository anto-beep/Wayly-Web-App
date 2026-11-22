"""BSC-1 · Budget Scenarios ("Will the money last?").

A question-led, forward-looking scenario tool. One server-side engine
(Python Decimal) exposed by one API; web and mobile render results only
(locked decision D1). Monetary figures come from the same budget source the
dashboard/BC-2 uses (D14) so a family sees the same remaining figure here.

v1 ships Mode A (spend-to-date from decoded statements or a user estimate).
Mode B (live statement tracking of a saved scenario) is a later increment.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Callable, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

import budget as budget_lib
from lib import ppc_v2

logger = logging.getLogger("bsc1")

bsc1_router = APIRouter(prefix="/bsc1", tags=["bsc1"])

_db: AsyncIOMotorDatabase = None  # type: ignore
_user_dep: Optional[Callable] = None
_core1_assert_access: Optional[Callable] = None

WEEKS_PER_QUARTER = Decimal("13")
INDEX1_VERSION = "20/09/2026"


def init_bsc1_routes(*, db, user_dep, core1_assert_access=None) -> None:
    global _db, _user_dep, _core1_assert_access
    _db = db
    _user_dep = user_dep
    _core1_assert_access = core1_assert_access


# ---------------------------------------------------------------------------
# Service catalogue (D9: the picker reads only from the in-system catalogue).
# Sourced from the SAME Provider Price Checker dictionary (lib.ppc_v2) so the
# BSC-1 service picker always offers EXACTLY the services the Price Checker
# does, using the canonical price-guide names (the client title-cases them for
# display). Median prices are indicative only — the user enters the price they
# actually pay in the change editor, so the engine re-prices server side.
# ---------------------------------------------------------------------------
_STREAM_TO_CATEGORY = {"Clinical": "Clinical Supports", "Independence": "Independence", "Everyday Living": "Everyday Living"}


def _build_service_catalogue(snapshot_id: Optional[str] = None) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for r in ppc_v2.list_services(snapshot_id):
        unit = r.get("unit") or "hour"
        median = r.get("median")
        out.append({
            "service_id": r.get("service_code"),
            "name": r.get("service"),
            "plain_name": r.get("service"),
            "category": _STREAM_TO_CATEGORY.get(r.get("stream"), r.get("stream") or "Everyday Living"),
            "pricing_model": "per_hour" if unit == "hour" else "per_unit",
            "unit": unit,
            "unit_price": float(median) if median is not None else 0.0,
            "default_quantity": 1,
            "default_frequency_per_week": 1,
            "funding_route": "quarterly",
            "checkable": bool(r.get("checkable")),
            "aliases": [],
        })
    return out


_CAT_KEYS = ["Clinical Supports", "Independence", "Everyday Living"]


def _q(n) -> Decimal:
    try:
        return Decimal(str(n or 0))
    except Exception:
        return Decimal("0")


def _cents(d: Decimal) -> float:
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Pydantic contract
# ---------------------------------------------------------------------------
class Change(BaseModel):
    id: str
    type: str  # add_service | change_service | remove_service | pause_services
    #            | spending_pace | price_change | one_off_cost | classification_change
    label: Optional[str] = None
    service_id: Optional[str] = None
    name: Optional[str] = None
    unit_price: Optional[float] = None
    quantity: Optional[float] = None
    frequency_per_week: Optional[float] = None
    new_quantity: Optional[float] = None
    new_frequency_per_week: Optional[float] = None
    weeks: Optional[float] = None
    weekly_cost: Optional[float] = None
    pct: Optional[float] = None
    amount: Optional[float] = None
    quarter_index: Optional[int] = Field(0, ge=0, le=3)
    to_classification: Optional[int] = Field(None, ge=1, le=8)


class ComputeBody(BaseModel):
    participant_id: str
    changes: List[Change] = []
    spend_to_date_aud: Optional[float] = None  # user estimate (Mode A); overrides decoded burn
    pace_pct: Optional[float] = None           # custom spending-pace override (whole projection)
    carry_forward_in_aud: Optional[float] = None
    as_of: Optional[str] = None


class SaveBody(BaseModel):
    name: str = Field(..., max_length=120)
    changes: List[Change] = []
    spend_to_date_aud: Optional[float] = None
    pace_pct: Optional[float] = None
    carry_forward_in_aud: Optional[float] = None


class PatchBody(BaseModel):
    name: Optional[str] = Field(None, max_length=120)
    changes: Optional[List[Change]] = None
    status: Optional[str] = None


# ---------------------------------------------------------------------------
# Baseline gathering
# ---------------------------------------------------------------------------
async def _gather_baseline(pid: str, request: Request) -> dict:
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    p = await _db.participants.find_one({"id": pid}, {"_id": 0})
    if not p:
        raise HTTPException(status_code=404, detail="Participant not found")

    cls = int(p.get("classification") or 4)
    q_start, q_end, q_label = budget_lib.get_quarter_window()

    # Line items for burn/contribution (same source as BC-2 / dashboard).
    q = {
        "household_id": p.get("household_id"),
        "$or": [{"participant_id": pid}, {"participant_id": None}, {"participant_id": {"$exists": False}}],
    }
    items: List[dict] = []
    async for s in _db.statements.find(q, {"_id": 0, "line_items": 1}):
        items.extend(s.get("line_items") or [])
    burn_by_stream = budget_lib.compute_burn(items, q_start, q_end)
    burn_total = sum(burn_by_stream.values())
    contributed_total = budget_lib.compute_contributions(items)

    gf = bool(p.get("is_grandfathered"))
    cap = budget_lib.lifetime_cap(gf)

    name = (p.get("first_name") or p.get("name") or "this person").split(" ")[0]
    return {
        "participant": p,
        "participant_name": name,
        "classification": cls,
        "quarter_start": q_start,
        "quarter_end": q_end,
        "quarter_label": q_label,
        "burn_by_stream": burn_by_stream,
        "burn_total": burn_total,
        "has_decoded_spend": len(items) > 0,
        "contributed_to_date": contributed_total,
        "lifetime_cap": cap,
        "is_grandfathered": gf,
    }


def _quarterly_available(cls: int) -> Decimal:
    # Gross quarterly budget (annual/4, incl. the 10% care-management share),
    # matching the dashboard/calculator (quarterly_budget() is post-CM).
    return _q(budget_lib.quarterly_budget(cls)) / Decimal("0.9")


def _label_for(start: date) -> str:
    if start.month in (1, 2, 3):
        return f"Jan–Mar {start.year}"
    if start.month in (4, 5, 6):
        return f"Apr–Jun {start.year}"
    if start.month in (7, 8, 9):
        return f"Jul–Sep {start.year}"
    return f"Oct–Dec {start.year}"


def _quarter_windows(first_start: date, first_end: date) -> List[Dict[str, Any]]:
    # current + next 3 Australian FY quarters.
    def bounds(start: date):
        if start.month == 1:
            return date(start.year, 3, 31), f"Jan–Mar {start.year}"
        if start.month == 4:
            return date(start.year, 6, 30), f"Apr–Jun {start.year}"
        if start.month == 7:
            return date(start.year, 9, 30), f"Jul–Sep {start.year}"
        return date(start.year, 12, 31), f"Oct–Dec {start.year}"

    def next_start(after: date):
        if after.month <= 3:
            return date(after.year, 4, 1)
        if after.month <= 6:
            return date(after.year, 7, 1)
        if after.month <= 9:
            return date(after.year, 10, 1)
        return date(after.year + 1, 1, 1)

    out = [{"start": first_start, "end": first_end, "label": _label_for(first_start)}]
    s = next_start(first_end)
    for _ in range(3):
        e, label = bounds(s)
        out.append({"start": s, "end": e, "label": label})
        s = next_start(e)
    return out


# ---------------------------------------------------------------------------
# The engine
# ---------------------------------------------------------------------------
def _recurring_quarterly_delta(c: Change) -> Decimal:
    """Per-quarter spend delta for a recurring change (add/change/remove)."""
    price = _q(c.unit_price)
    freq = _q(c.frequency_per_week if c.frequency_per_week is not None else 1)
    if c.type == "add_service":
        qty = _q(c.quantity if c.quantity is not None else 1)
        return price * qty * freq * WEEKS_PER_QUARTER
    if c.type == "remove_service":
        qty = _q(c.quantity if c.quantity is not None else 1)
        return -(price * qty * freq * WEEKS_PER_QUARTER)
    if c.type == "change_service":
        old_qty = _q(c.quantity if c.quantity is not None else 0)
        new_qty = _q(c.new_quantity if c.new_quantity is not None else old_qty)
        new_freq = _q(c.new_frequency_per_week if c.new_frequency_per_week is not None else freq)
        old_cost = price * old_qty * freq * WEEKS_PER_QUARTER
        new_cost = price * new_qty * new_freq * WEEKS_PER_QUARTER
        return new_cost - old_cost
    return Decimal("0")


def _project(base: dict, changes: List[Change], *, spend_to_date: Decimal,
             pace_pct: Optional[float], carry_in: Decimal, confidence: str) -> dict:
    windows = _quarter_windows(base["quarter_start"], base["quarter_end"])
    cls = base["classification"]

    # classification_change (D5): recompute available from the new level.
    new_cls = cls
    for c in changes:
        if c.type == "classification_change" and c.to_classification:
            new_cls = int(c.to_classification)

    base_available = _quarterly_available(cls)
    avail = _quarterly_available(new_cls)

    # Baseline projected variable spend per quarter: extrapolate the current
    # quarter's pace; if nothing decoded, assume ~85% of the budget.
    base_burn = _q(base["burn_total"])
    pace = base_burn if base_burn > 0 else (base_available * Decimal("0.85"))

    # Recurring deltas (all quarters) and pace/price multipliers.
    recurring_delta = Decimal("0")
    pace_mult = Decimal("1")
    price_mult = Decimal("1")
    oneoff = {0: Decimal("0"), 1: Decimal("0"), 2: Decimal("0"), 3: Decimal("0")}
    deltas_out: List[dict] = []
    for c in changes:
        if c.type in ("add_service", "remove_service", "change_service"):
            d = _recurring_quarterly_delta(c)
            recurring_delta += d
            deltas_out.append({"change_id": c.id, "label": c.label or c.name or c.type, "delta_aud": _cents(d)})
        elif c.type == "pause_services":
            weeks = _q(c.weeks)
            weekly = _q(c.weekly_cost)
            d = -(weeks * weekly)
            qi = int(c.quarter_index or 0)
            oneoff[qi] += d
            deltas_out.append({"change_id": c.id, "label": c.label or "Pause services", "delta_aud": _cents(d)})
        elif c.type == "spending_pace":
            pace_mult *= (Decimal("1") + _q(c.pct) / Decimal("100"))
            deltas_out.append({"change_id": c.id, "label": c.label or f"Spend {c.pct:+g}%", "delta_aud": None})
        elif c.type == "price_change":
            price_mult *= (Decimal("1") + _q(c.pct) / Decimal("100"))
            deltas_out.append({"change_id": c.id, "label": c.label or f"Prices {c.pct:+g}%", "delta_aud": None})
        elif c.type == "one_off_cost":
            qi = int(c.quarter_index or 0)
            amt = _q(c.amount)
            oneoff[qi] += amt
            deltas_out.append({"change_id": c.id, "label": c.label or "One-off cost", "delta_aud": _cents(amt)})

    if pace_pct is not None:
        pace_mult *= (Decimal("1") + _q(pace_pct) / Decimal("100"))

    quarters: List[dict] = []
    carry = carry_in
    run_out_date: Optional[str] = None
    for i, w in enumerate(windows):
        available = avail + carry
        # Projected variable spend for this quarter.
        q_spend = (pace * pace_mult * price_mult) + (recurring_delta * price_mult) + oneoff[i]
        if i == 0:
            # Current quarter: never below what's already been spent.
            q_spend = max(q_spend, spend_to_date)
        q_spend = max(q_spend, Decimal("0"))
        unspent = available - q_spend
        # Run-out date: first quarter whose projection exceeds available.
        if run_out_date is None and q_spend > available and available > 0:
            days = (w["end"] - w["start"]).days + 1
            daily = q_spend / Decimal(days)
            if daily > 0:
                day_offset = int((available / daily).to_integral_value(rounding=ROUND_HALF_UP))
                day_offset = max(0, min(days - 1, day_offset))
                from datetime import timedelta
                run_out_date = (w["start"] + timedelta(days=day_offset)).isoformat()
        carry_fwd = max(Decimal("0"), unspent)
        # Per-category split from baseline burn proportions (fallback even split).
        cats = _split_categories(base["burn_by_stream"], q_spend)
        quarters.append({
            "quarter_label": w["label"],
            "quarter_start": w["start"].isoformat(),
            "quarter_end": w["end"].isoformat(),
            "available_aud": _cents(available),
            "spent_to_date_aud": _cents(spend_to_date) if i == 0 else 0.0,
            "projected_total_aud": _cents(q_spend),
            "projected_unspent_aud": _cents(unspent),
            "run_out_date": run_out_date if (run_out_date and _date_in(run_out_date, w)) else None,
            "carry_forward_out_aud": _cents(carry_fwd),
            "categories": cats,
        })
        carry = carry_fwd

    q0 = quarters[0]
    status = _status_for(_q(q0["available_aud"]), _q(q0["projected_total_aud"]),
                         _q(q0["spent_to_date_aud"]), run_out_date, windows[0])
    return {
        "classification_used": new_cls,
        "base_available_aud": _cents(base_available),
        "available_aud": _cents(avail),
        "quarters": quarters,
        "status": status,
        "run_out_date": q0["run_out_date"],
        "change_deltas": deltas_out,
        "confidence": confidence,
    }


def _date_in(iso: str, w: dict) -> bool:
    try:
        d = date.fromisoformat(iso)
        return w["start"] <= d <= w["end"]
    except Exception:
        return False


def _split_categories(burn_by_stream: dict, total: Decimal) -> Dict[str, float]:
    mapping = {
        "clinical": "Clinical Supports", "clinical_supports": "Clinical Supports",
        "independence": "Independence",
        "everyday": "Everyday Living", "everyday_living": "Everyday Living",
    }
    agg = {k: Decimal("0") for k in _CAT_KEYS}
    s = Decimal("0")
    for k, v in (burn_by_stream or {}).items():
        cat = mapping.get(str(k).lower())
        if cat:
            agg[cat] += _q(v)
            s += _q(v)
    if s <= 0:
        # even split fallback
        each = total / Decimal(len(_CAT_KEYS))
        return {k: _cents(each) for k in _CAT_KEYS}
    return {k: _cents(total * (agg[k] / s)) for k in _CAT_KEYS}


def _status_for(available: Decimal, projected: Decimal, spent: Decimal,
                run_out: Optional[str], w0: dict) -> str:
    if spent > available:
        return "already_over"
    if run_out and _date_in(run_out, w0):
        return "runs_out"
    unspent = available - projected
    if available > 0 and unspent < (available * Decimal("0.10")):
        return "tight" if unspent >= 0 else "runs_out"
    return "on_track"


def _hero(base: dict, result: dict) -> dict:
    name = base["participant_name"]
    q0 = result["quarters"][0]
    status = result["status"]
    unspent = q0["projected_unspent_aud"]
    ql = q0["quarter_label"]
    qend = _fmt_date(q0["quarter_end"])
    money = lambda n: "$" + format(int(round(abs(n))), ",")
    if status == "on_track":
        answer = f"At this pace, {name}'s {ql} budget lasts the whole quarter, finishing with about {money(unspent)} unspent."
        action = "Nothing to action."
    elif status == "tight":
        answer = f"At this pace, {name}'s {ql} budget just lasts, with about {money(unspent)} left at {qend}."
        action = "Worth keeping an eye on."
    elif status == "runs_out":
        rod = _fmt_date(result["run_out_date"]) if result.get("run_out_date") else f"late in {ql}"
        answer = f"At this pace, the budget runs out around {rod}."
        action = "Worth raising with the care coordinator now."
    else:  # already_over
        answer = f"Spending this quarter is already about {money(unspent)} over the budget."
        action = "Ask the provider how the overspend is being handled."
    return {
        "status": status,
        "answer": answer,
        "action_line": action,
        "name": name,
        "quarter_label": ql,
        "quarter_end": q0["quarter_end"],
        "unspent_aud": unspent,
        "run_out_date": result.get("run_out_date"),
        "available_aud": q0["available_aud"],
        "projected_total_aud": q0["projected_total_aud"],
    }


def _fmt_date(iso: Optional[str]) -> str:
    if not iso:
        return ""
    try:
        d = date.fromisoformat(iso[:10])
        return d.strftime("%-d %b %Y")
    except Exception:
        return iso


async def _compute(pid: str, request: Request, body: ComputeBody) -> dict:
    base = await _gather_baseline(pid, request)

    # spend-to-date: user estimate (medium confidence) or decoded burn (high),
    # else 0 (low confidence).
    if body.spend_to_date_aud is not None:
        spend_to_date = _q(body.spend_to_date_aud)
        confidence = "medium"
    elif base["has_decoded_spend"]:
        spend_to_date = _q(base["burn_total"])
        confidence = "high"
    else:
        spend_to_date = Decimal("0")
        confidence = "low"
    carry_in = _q(body.carry_forward_in_aud)

    scenario = _project(base, body.changes, spend_to_date=spend_to_date,
                        pace_pct=body.pace_pct, carry_in=carry_in, confidence=confidence)
    baseline = _project(base, [], spend_to_date=spend_to_date,
                        pace_pct=None, carry_in=carry_in, confidence=confidence)
    hero = _hero(base, scenario)

    delta_vs_baseline = (_q(scenario["quarters"][0]["projected_total_aud"])
                         - _q(baseline["quarters"][0]["projected_total_aud"]))

    return {
        "participant_id": pid,
        "participant_name": base["participant_name"],
        "classification": base["classification"],
        "as_of": (body.as_of or date.today().isoformat()),
        "index1_version": INDEX1_VERSION,
        "funding": {
            "label": "government funding",
            "quarterly_budget_aud": scenario["available_aud"],
            "note": "This is the government-funded budget for the quarter, not what you pay.",
        },
        "contribution": {
            "note": "What you pay depends on your means assessment. See the Contribution Estimator for your figure.",
            "to_date_aud": _cents(_q(base["contributed_to_date"])),
            "lifetime_cap_aud": _cents(_q(base["lifetime_cap"])),
            "lifetime_remaining_aud": _cents(_q(base["lifetime_cap"]) - _q(base["contributed_to_date"])),
            "is_grandfathered": base["is_grandfathered"],
        },
        "confidence": scenario["confidence"],
        "hero": hero,
        "quarters": scenario["quarters"],
        "baseline": {"quarters": baseline["quarters"]},
        "change_deltas": scenario["change_deltas"],
        "delta_vs_baseline_aud": _cents(delta_vs_baseline),
        "classification_used": scenario["classification_used"],
        "disclaimer": "This is an estimate to help you plan, not financial advice. Figures use the current Schedule of Subsidies.",
    }


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@bsc1_router.get("/service-catalogue")
async def service_catalogue(request: Request, as_of: Optional[str] = None):
    await _user_dep(request)  # authenticated
    return {"as_of": as_of or date.today().isoformat(), "services": _build_service_catalogue()}


@bsc1_router.get("/participants/{pid}/budget-baseline")
async def budget_baseline(pid: str, request: Request):
    base = await _gather_baseline(pid, request)
    body = ComputeBody(participant_id=pid, changes=[])
    return await _compute(pid, request, body)


@bsc1_router.post("/compute")
async def compute(body: ComputeBody, request: Request):
    return await _compute(body.participant_id, request, body)


@bsc1_router.get("/participants/{pid}/scenarios")
async def list_scenarios(pid: str, request: Request):
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    cursor = _db.budget_scenarios.find({"participant_id": pid, "status": {"$ne": "archived"}}, {"_id": 0}).sort("created_at", -1).limit(20)
    rows = await cursor.to_list(20)
    for r in rows:
        for k in ("created_at", "updated_at"):
            if isinstance(r.get(k), datetime):
                r[k] = r[k].isoformat()
    return {"scenarios": rows}


@bsc1_router.post("/participants/{pid}/scenarios")
async def save_scenario(pid: str, body: SaveBody, request: Request):
    user = await _user_dep(request)
    if _core1_assert_access:
        await _core1_assert_access(user, pid)
    existing = await _db.budget_scenarios.count_documents({"participant_id": pid, "status": {"$ne": "archived"}})
    if existing >= 5:
        raise HTTPException(status_code=400, detail="You can save up to 5 scenarios. Archive one to add another.")
    cbody = ComputeBody(participant_id=pid, changes=body.changes,
                        spend_to_date_aud=body.spend_to_date_aud, pace_pct=body.pace_pct,
                        carry_forward_in_aud=body.carry_forward_in_aud)
    last_result = await _compute(pid, request, cbody)
    now = _now()
    doc = {
        "id": str(uuid4()),
        "participant_id": pid,
        "name": body.name.strip(),
        "changes": [c.dict() for c in body.changes],
        "spend_to_date_aud": body.spend_to_date_aud,
        "pace_pct": body.pace_pct,
        "carry_forward_in_aud": body.carry_forward_in_aud,
        "last_result": last_result,
        "status": "active",
        "created_at": now,
        "updated_at": now,
        "created_by_user_id": user.get("id") if isinstance(user, dict) else None,
    }
    await _db.budget_scenarios.insert_one(doc)
    doc.pop("_id", None)
    doc["created_at"] = now.isoformat()
    doc["updated_at"] = now.isoformat()
    try:
        await _db.scenario_events.insert_one({
            "id": str(uuid4()), "scenario_id": doc["id"], "participant_id": pid,
            "event": "created", "at": now,
        })
    except Exception:
        pass
    return {"scenario": doc}


@bsc1_router.patch("/scenarios/{scenario_id}")
async def patch_scenario(scenario_id: str, body: PatchBody, request: Request):
    user = await _user_dep(request)
    existing = await _db.budget_scenarios.find_one({"id": scenario_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if _core1_assert_access:
        await _core1_assert_access(user, existing["participant_id"])
    update: Dict[str, Any] = {"updated_at": _now()}
    if body.name is not None:
        update["name"] = body.name.strip()
    if body.status is not None:
        update["status"] = body.status
    if body.changes is not None:
        update["changes"] = [c.dict() for c in body.changes]
        cbody = ComputeBody(participant_id=existing["participant_id"], changes=body.changes,
                            spend_to_date_aud=existing.get("spend_to_date_aud"),
                            pace_pct=existing.get("pace_pct"),
                            carry_forward_in_aud=existing.get("carry_forward_in_aud"))
        update["last_result"] = await _compute(existing["participant_id"], request, cbody)
    await _db.budget_scenarios.update_one({"id": scenario_id}, {"$set": update})
    doc = await _db.budget_scenarios.find_one({"id": scenario_id}, {"_id": 0})
    for k in ("created_at", "updated_at"):
        if isinstance(doc.get(k), datetime):
            doc[k] = doc[k].isoformat()
    return {"scenario": doc}


@bsc1_router.delete("/scenarios/{scenario_id}")
async def delete_scenario(scenario_id: str, request: Request):
    user = await _user_dep(request)
    existing = await _db.budget_scenarios.find_one({"id": scenario_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Scenario not found")
    if _core1_assert_access:
        await _core1_assert_access(user, existing["participant_id"])
    await _db.budget_scenarios.delete_one({"id": scenario_id})
    return {"deleted": True}


async def ensure_bsc1_indexes() -> None:
    if _db is None:
        return
    await _db.budget_scenarios.create_index("participant_id")
    await _db.budget_scenarios.create_index("created_at")


@bsc1_router.get("/status")
async def status():
    return {"spec": "BSC-1 v1", "mode": "A"}
