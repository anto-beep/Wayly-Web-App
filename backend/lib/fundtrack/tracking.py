"""FUNDTRACK-1 · Charge capture + tracking (server-side, Decimal).

The canonical figure ladder (``ladder.py``) turns classification funding and a
few numbers into the eight A..H figures. This module supplies the two numbers
that charge entry owns:

  E  Used so far        = confirmed statement burn + live ENTERED/INVOICE charges
  G  Care booked        = live BOOKED charges dated today..quarter end

plus everything the weekly screen and the capture layer need: the household's
saved services ("your usual care"), the booked-visit list behind G, catch-up
expected visits, a what-if "revised H" calculation, statement-supersedes-entered
reconciliation (the highest-risk area — superseded, never deleted), and the four
alerts.

Locked decisions honoured:
  * #2  one canonical ladder — this module only produces E and G and hands them
        to :func:`lib.fundtrack.compute_ladder`; it never renames a figure.
  * #6  statements supersede entered charges for their period; entered charges
        are archived (status="superseded"), never silently merged or deleted.
  * #9  no mandatory fields — a charge may be unpriced; category/share derived.
  * #10 Wayly never states "your balance"; figures are its own estimate.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional, Tuple

import budget as budget_lib
from lib.fundtrack.ladder import compute_ladder, STATEMENT_CYCLE_DAYS

# Streams money is tracked against (money is NOT fungible across streams).
STREAMS = ["Clinical", "Independence", "Everyday Living"]

# Participant-contribution FLOOR by stream (full Age Pension rate). Used only to
# show an ESTIMATED participant share on what-if and type-it entry; always
# labelled an estimate. Source: Dept. of Health "Support at Home participant
# contributions" (effective 1 Nov 2025). Clinical supports are always $0 to the
# participant. Part-pension / CSHC / self-funded pay MORE, so this is a floor.
CONTRIB_FLOOR = {"Clinical": Decimal("0.0"), "Independence": Decimal("0.05"), "Everyday Living": Decimal("0.175")}

_STREAM_ALIASES = {
    "clinical": "Clinical", "clinical supports": "Clinical", "clinical care": "Clinical",
    "independence": "Independence",
    "everyday living": "Everyday Living", "everyday": "Everyday Living", "everydayliving": "Everyday Living",
}


def _d(x: Any) -> Decimal:
    try:
        return Decimal(str(x if x is not None else 0))
    except Exception:
        return Decimal("0")


def _c(dv: Decimal) -> float:
    return float(dv.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def normalise_stream(s: Optional[str]) -> str:
    return _STREAM_ALIASES.get((s or "").strip().lower(), "Everyday Living")


def participant_share(amount: Any, stream: Optional[str]) -> float:
    """Estimated participant contribution at the full-pension FLOOR rate."""
    rate = CONTRIB_FLOOR.get(normalise_stream(stream), CONTRIB_FLOOR["Everyday Living"])
    return _c(_d(amount) * rate)


def _parse_date(v: Any) -> Optional[date]:
    if not v:
        return None
    try:
        if isinstance(v, datetime):
            return v.date()
        if isinstance(v, date):
            return v
        return date.fromisoformat(str(v)[:10])
    except Exception:
        return None


def _statement_coverage(stmt: dict) -> Optional[Tuple[date, date]]:
    """Coverage window a statement is authoritative for — the span of its line
    item dates (robust across statements that don't persist period_start/end)."""
    dates = [d for d in (_parse_date(li.get("date")) for li in (stmt.get("line_items") or [])) if d]
    if dates:
        return min(dates), max(dates)
    return None


# ---------------------------------------------------------------------------
# Core gather: produces E, G, the booked list, superseded list and anchors.
# ---------------------------------------------------------------------------
async def gather_tracking(
    db,
    *,
    household_id: str,
    participant_id: str,
    q_start: date,
    q_end: date,
    today: date,
    persist_supersession: bool = True,
) -> Dict[str, Any]:
    # --- statements for this participant (burn + coverage) -----------------
    sq = {
        "household_id": household_id,
        "state": {"$ne": "archived"},
        "$or": [{"participant_id": participant_id}, {"participant_id": None}, {"participant_id": {"$exists": False}}],
    }
    statements: List[dict] = await db.statements.find(
        sq, {"_id": 0, "id": 1, "line_items": 1, "period_label": 1, "uploaded_at": 1, "created_at": 1}
    ).to_list(200)

    all_items: List[dict] = []
    for s in statements:
        all_items.extend(s.get("line_items") or [])
    statement_burn = budget_lib.compute_burn(all_items, q_start, q_end)
    statement_burn_total = _d(sum(statement_burn.values()))

    coverages: List[Tuple[str, date, date]] = []
    for s in statements:
        cov = _statement_coverage(s)
        if cov:
            coverages.append((s.get("id"), cov[0], cov[1]))

    newest = max(statements, key=lambda s: str(s.get("uploaded_at") or s.get("created_at") or ""), default=None)
    anchor_age_days: Optional[int] = None
    newest_period: Optional[str] = None
    if newest:
        newest_period = newest.get("period_label")
        upl = newest.get("uploaded_at") or newest.get("created_at")
        try:
            if isinstance(upl, str):
                upl = datetime.fromisoformat(upl.replace("Z", "+00:00"))
            if isinstance(upl, datetime):
                upl = upl if upl.tzinfo else upl.replace(tzinfo=timezone.utc)
                anchor_age_days = max(0, (datetime.now(timezone.utc) - upl).days)
        except Exception:
            anchor_age_days = None

    # --- charges entered by the household ---------------------------------
    charges: List[dict] = await db.fundtrack_charges.find(
        {"participant_id": participant_id}, {"_id": 0}
    ).to_list(1000)

    # Supersession: a statement is authoritative for its coverage window. Any
    # ENTERED/INVOICE/CATCH_UP charge dated inside a covered window is
    # superseded — archived, kept inspectable, never deleted. Booked (future)
    # charges are never superseded.
    superseded_ids: List[str] = []
    for ch in charges:
        cd = _parse_date(ch.get("date"))
        if cd is None or ch.get("source") == "booked":
            continue
        for sid, cs, ce in coverages:
            if cs <= cd <= ce:
                if ch.get("status") != "superseded":
                    ch["status"] = "superseded"
                    ch["superseded_by"] = sid
                    superseded_ids.append(ch.get("id"))
                else:
                    ch["superseded_by"] = ch.get("superseded_by") or sid
                break
    if persist_supersession and superseded_ids:
        try:
            await db.fundtrack_charges.update_many(
                {"id": {"$in": superseded_ids}},
                {"$set": {"status": "superseded", "superseded_at": datetime.now(timezone.utc)}},
            )
            for sid in superseded_ids:
                ch = next((c for c in charges if c.get("id") == sid), None)
                if ch and ch.get("superseded_by"):
                    await db.fundtrack_charges.update_one({"id": sid}, {"$set": {"superseded_by": ch["superseded_by"]}})
        except Exception:
            pass

    entered_used = Decimal("0")
    booked_g = Decimal("0")
    unpriced_booked = 0
    booked_list: List[dict] = []
    used_list: List[dict] = []
    superseded_list: List[dict] = []
    pending_list: List[dict] = []
    missed_in_statement: List[dict] = []

    def _covered(d: Optional[date]) -> bool:
        return bool(d) and any(cs <= d <= ce for _sid, cs, ce in coverages)

    for ch in charges:
        cd = _parse_date(ch.get("date"))
        amt = _d(ch.get("amount")) if ch.get("amount") is not None else None
        row = {
            "id": ch.get("id"),
            "service_name": ch.get("service_name"),
            "stream": ch.get("stream"),
            "date": ch.get("date"),
            "amount": _c(amt) if amt is not None else None,
            "unpriced": ch.get("amount") is None,
            "source": ch.get("source"),
            "status": ch.get("status", "live"),
            "confirmed": bool(ch.get("confirmed", True)),
            "participant_share": ch.get("participant_share"),
            "note": ch.get("note") or "",
        }
        if ch.get("status") == "superseded":
            superseded_list.append(row)
            continue
        if ch.get("status") == "missed":
            if _covered(cd):
                missed_in_statement.append(row)
            continue
        if ch.get("source") == "booked":
            if cd and cd >= today and cd <= q_end:
                booked_list.append(row)
                if amt is not None:
                    booked_g += amt
                else:
                    unpriced_booked += 1
            elif cd and cd < today and not ch.get("confirmed"):
                # a booked visit whose date has passed but isn't confirmed yet:
                # shown separately as a possible pending charge, NOT folded into F.
                pending_list.append(row)
            continue
        # entered / invoice / catch_up → used so far (E), within the quarter
        if cd and q_start <= cd <= min(today, q_end):
            if amt is not None:
                entered_used += amt
            used_list.append(row)

    booked_list.sort(key=lambda r: r.get("date") or "")
    used_list.sort(key=lambda r: r.get("date") or "", reverse=True)

    return {
        "statement_burn": statement_burn,
        "statement_burn_total": _c(statement_burn_total),
        "entered_used_aud": _c(entered_used),
        "E_aud": _c(statement_burn_total + entered_used),
        "G_aud": _c(booked_g),
        "unpriced_booked": unpriced_booked,
        "anchor_age_days": anchor_age_days,
        "newest_period": newest_period,
        "booked": booked_list,
        "used": used_list,
        "superseded": superseded_list,
        "pending": pending_list,
        "missed_in_statement": missed_in_statement,
        "coverages": [(sid, cs.isoformat(), ce.isoformat()) for sid, cs, ce in coverages],
    }


# ---------------------------------------------------------------------------
# Saved services ("your usual care") — derived from the decoded statements so
# Path 1 ("from your usual care") offers exactly what the household actually
# gets, with the last amount recorded for each service as the default.
# ---------------------------------------------------------------------------
async def saved_services(db, *, household_id: str, participant_id: str) -> List[Dict[str, Any]]:
    sq = {
        "household_id": household_id,
        "state": {"$ne": "archived"},
        "$or": [{"participant_id": participant_id}, {"participant_id": None}, {"participant_id": {"$exists": False}}],
    }
    statements = await db.statements.find(sq, {"_id": 0, "line_items": 1}).to_list(200)
    by_service: Dict[str, Dict[str, Any]] = {}
    for s in statements:
        for li in s.get("line_items") or []:
            name = (li.get("service_name") or "").strip()
            if not name:
                continue
            d = _parse_date(li.get("date"))
            key = name.lower()
            cur = by_service.get(key)
            unit_price = li.get("unit_price") or li.get("total")
            cand = {
                "service_id": li.get("service_code") or key,
                "service_name": name,
                "stream": normalise_stream(li.get("stream")),
                "last_amount": round(float(li.get("total") or unit_price or 0), 2),
                "unit_price": round(float(unit_price or 0), 2),
                "last_date": d.isoformat() if d else None,
                "count": 1,
            }
            if not cur:
                by_service[key] = cand
            else:
                cur["count"] += 1
                if d and (not cur.get("last_date") or d.isoformat() > cur["last_date"]):
                    cur["last_date"] = d.isoformat()
                    cur["last_amount"] = cand["last_amount"]
                    cur["unit_price"] = cand["unit_price"]
    # Anything the household has entered manually against a new service, too.
    entered = await db.fundtrack_charges.find(
        {"participant_id": participant_id, "status": {"$ne": "superseded"}}, {"_id": 0}
    ).to_list(1000)
    for ch in entered:
        name = (ch.get("service_name") or "").strip()
        if not name:
            continue
        key = name.lower()
        if key in by_service:
            continue
        if ch.get("amount") is None:
            continue
        by_service[key] = {
            "service_id": ch.get("service_id") or key,
            "service_name": name,
            "stream": normalise_stream(ch.get("stream")),
            "last_amount": round(float(ch.get("amount") or 0), 2),
            "unit_price": round(float(ch.get("amount") or 0), 2),
            "last_date": ch.get("date"),
            "count": 1,
        }
    out = sorted(by_service.values(), key=lambda r: (-r["count"], r["service_name"]))
    return out


# ---------------------------------------------------------------------------
# What-if "add care" → revised H (locked: shows the real cost and the spare).
# ---------------------------------------------------------------------------
def _quarter_bounds(d: date) -> Tuple[date, date]:
    y = d.year
    if d.month <= 3:
        return date(y, 1, 1), date(y, 3, 31)
    if d.month <= 6:
        return date(y, 4, 1), date(y, 6, 30)
    if d.month <= 9:
        return date(y, 7, 1), date(y, 9, 30)
    return date(y, 10, 1), date(y, 12, 31)


def visit_dates(start: date, frequency: str, until: Optional[date], q_end: date, horizon: Optional[date] = None) -> List[date]:
    """Expand a visit plan into concrete dates. ``once`` → a single visit.
    ``weekly`` → every 7 days up to ``until`` (capped at ~26 weeks)."""
    out = [start]
    if (frequency or "once") == "weekly":
        stop = until or horizon or (q_end + timedelta(days=84))
        cur = start + timedelta(days=7)
        n = 0
        while cur <= stop and n < 60:
            out.append(cur)
            cur += timedelta(days=7)
            n += 1
    return out


def compute_what_if(
    *,
    current_F: Decimal,
    current_H: Decimal,
    unit_price: Decimal,
    stream: str,
    start: date,
    frequency: str,
    until: Optional[date],
    q_start: date,
    q_end: date,
) -> Dict[str, Any]:
    dates = visit_dates(start, frequency, until, q_end)
    this_q = [d for d in dates if q_start <= d <= q_end]
    later = [d for d in dates if d > q_end]
    price = _d(unit_price)
    share_rate = CONTRIB_FLOOR.get(normalise_stream(stream), CONTRIB_FLOOR["Everyday Living"])
    this_q_cost = price * len(this_q)
    total_cost = price * len(dates)
    revised_H = _d(current_H) - this_q_cost
    return {
        "visits": len(dates),
        "visits_this_quarter": len(this_q),
        "visits_next_quarter": len(later),
        "total_budget_impact_aud": _c(total_cost),
        "this_quarter_impact_aud": _c(this_q_cost),
        "participant_share_aud": _c(total_cost * share_rate),
        "participant_share_this_quarter_aud": _c(this_q_cost * share_rate),
        "revised_spare_aud": _c(revised_H),
        "revised_spare_is_negative": revised_H < 0,
        "quarter_boundary_crossed": len(later) > 0,
        "next_quarter_unconfirmed": len(later) > 0,
    }


# ---------------------------------------------------------------------------
# Catch-up: expected visits from the confirmed routine with suggested amounts.
# ---------------------------------------------------------------------------
async def catch_up_expected(db, *, household_id: str, participant_id: str, q_start: date, today: date, weeks: int = 3) -> List[Dict[str, Any]]:
    svcs = await saved_services(db, household_id=household_id, participant_id=participant_id)
    start = max(q_start, today - timedelta(days=weeks * 7))
    existing = await db.fundtrack_charges.find(
        {"participant_id": participant_id, "status": {"$ne": "superseded"}}, {"_id": 0, "service_name": 1, "date": 1}
    ).to_list(1000)
    have = {(str(e.get("service_name") or "").lower(), str(e.get("date") or "")) for e in existing}
    out: List[Dict[str, Any]] = []
    for svc in svcs[:8]:
        # Weekly cadence inferred: one visit a week on the service's weekday.
        anchor = _parse_date(svc.get("last_date")) or today
        wd = anchor.weekday()
        d = start
        while d.weekday() != wd:
            d += timedelta(days=1)
        while d <= today:
            key = (svc["service_name"].lower(), d.isoformat())
            if key not in have:
                out.append({
                    "service_id": svc["service_id"],
                    "service_name": svc["service_name"],
                    "stream": svc["stream"],
                    "date": d.isoformat(),
                    "suggested_amount": svc["last_amount"],
                })
            d += timedelta(days=7)
    out.sort(key=lambda r: r["date"], reverse=True)
    return out[:30]


# ---------------------------------------------------------------------------
# Alerts (decision #7). Returned ready to render; copy matches the spec.
# ---------------------------------------------------------------------------
def _money(n: Any) -> str:
    return "$" + format(int(round(abs(float(n or 0)))), ",")


def _fmt(d: date) -> str:
    return d.strftime("%-d %B %Y")


def _month_name(m: int) -> str:
    return date(2000, m, 1).strftime("%B")


def build_alerts(*, ladder: Dict[str, Any], tracking: Dict[str, Any], today: date, q_end: date) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    proj = ladder.get("projection", {})
    status = ladder.get("status")

    if status == "underspend_risk" and proj.get("forfeit_aud", 0) > 0:
        out.append({
            "id": "forfeit_risk", "kind": "forfeit_risk", "severity": "warning",
            "title": "Funding at risk of being returned",
            "body": (
                f"About {_money(proj['forfeit_aud'])} of this quarter's care funding looks likely to be returned on "
                f"{_fmt(q_end)}, based on the care you have booked. This is an estimate. It may be worth talking to your "
                f"provider about care you need but are not getting."
            ),
            "actions": [{"label": "What if I add care?", "action": "what_if"}],
        })
    if status == "overspend_risk" and proj.get("shortfall_aud", 0) > 0:
        out.append({
            "id": "shortfall_risk", "kind": "shortfall_risk", "severity": "danger",
            "title": "Booked care is above what's left",
            "body": (
                f"Your booked care is estimated to be {_money(proj['shortfall_aud'])} above what is left this quarter. "
                f"Check those prices or ask your provider to confirm your balance before changing any care. Your service "
                f"agreement sets out who pays if an overspend happens."
            ),
            "actions": [{"label": "Review booked care", "action": "weekly"}],
        })

    # Statement overdue: the previous month's statement is due by the end of the
    # following month. If the newest statement is older than one cycle (or none
    # exists), nudge to add it.
    age = tracking.get("anchor_age_days")
    if age is None or age > STATEMENT_CYCLE_DAYS:
        prev_month = (today.replace(day=1) - timedelta(days=1))
        due = (today.replace(day=1))  # end of the month the statement was due
        out.append({
            "id": "statement_overdue", "kind": "statement_overdue", "severity": "info",
            "title": "Statement may be overdue",
            "body": (
                f"Have you received your {_month_name(prev_month.month)} statement? It was due by "
                f"{_fmt(due - timedelta(days=1))}. Add it here, or draft a request to your provider."
            ),
            "actions": [{"label": "Add a statement", "action": "upload"}, {"label": "Draft a request", "action": "letter"}],
        })

    # Possible billing difference: a visit the household marked as missed falls
    # inside a statement's covered period (so the statement likely lists it).
    for row in tracking.get("missed_in_statement", []) or []:
        out.append({
            "id": f"billing_diff_{row.get('id')}", "kind": "possible_billing_difference", "severity": "info",
            "title": "Possible billing difference",
            "body": (
                "You marked this visit as missed. Your statement lists a charge. Would you like to check the reason?"
            ),
            "actions": [{"label": "Check the reason", "action": "weekly"}],
        })

    return out
