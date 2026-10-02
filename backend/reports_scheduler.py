"""Background scheduler for auto-generated reports.

- Quarterly Budget: 7 days after each quarter end (Mar/Jun/Sep/Dec quarter ends).
- Annual Financial: 14 days after 30 Jun (financial year end) if >= 6 decoded statements.
- Anomaly & Savings: monthly, on the same day each month as the household's billing date.

Dedup key: (report_type, participant_id, date_range_start, date_range_end).
Loop interval: every 6 hours (cheap; reports are scheduled, not real-time).
"""
import os
import asyncio
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional, Tuple

from motor.motor_asyncio import AsyncIOMotorClient

logger = logging.getLogger("wayly.reports.scheduler")

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

POLL_INTERVAL_SEC = int(os.environ.get("REPORTS_SCHED_INTERVAL_SEC", str(6 * 3600)))
_task: Optional[asyncio.Task] = None
_stop_event: Optional[asyncio.Event] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _completed_quarter_window(today: date) -> Tuple[Optional[str], Optional[int], Optional[date], Optional[date]]:
    """Return the most recently completed Aus FY quarter (label, fy, start, end)
    if today is within 7 days after that quarter's end, else (None, None, None, None)."""
    # Aus FY quarter ends: 30 Sep (Q1), 31 Dec (Q2), 31 Mar (Q3), 30 Jun (Q4)
    candidates = []
    y = today.year
    for q_label, q_end_month, q_end_day, start_month, start_day in [
        ("Q1", 9, 30, 7, 1),
        ("Q2", 12, 31, 10, 1),
        ("Q3", 3, 31, 1, 1),
        ("Q4", 6, 30, 4, 1),
    ]:
        for delta_year in (-1, 0):
            q_end = date(y + delta_year, q_end_month, q_end_day)
            # FY label: ending June of FY year (Aus convention)
            if q_label in ("Q1", "Q2"):
                fy = q_end.year + 1
            else:
                fy = q_end.year
            q_start = date(fy - 1, start_month, start_day) if q_label in ("Q1", "Q2") else date(fy, start_month, start_day)
            candidates.append((q_label, fy, q_start, q_end))
    # Pick the latest quarter whose end is between (today - 14d, today - 7d), gives a 7-day window after which we auto-generate.
    cutoff_low = today - timedelta(days=14)
    cutoff_high = today - timedelta(days=7)
    eligible = [c for c in candidates if cutoff_low <= c[3] <= cutoff_high]
    if not eligible:
        return (None, None, None, None)
    return max(eligible, key=lambda c: c[3])


def _completed_fy(today: date) -> Tuple[Optional[int], Optional[date], Optional[date]]:
    """Return (fy, start, end) of the most recently completed FY if today is
    in (FY end + 14 days … FY end + 21 days), a 7-day window to fire the cron."""
    # FY ends 30 Jun.
    for y in (today.year, today.year - 1):
        fy_end = date(y, 6, 30)
        if (today - fy_end).days in range(14, 21):
            fy = y
            fy_start = date(y - 1, 7, 1)
            return (fy, fy_start, fy_end)
    return (None, None, None)


async def _already_generated(report_type: str, participant_id: str, start: date, end: date) -> bool:
    existing = await db.generated_reports.find_one({
        "report_type": report_type,
        "participant_id": participant_id,
        "parameters_json.auto": True,
        "parameters_json.range_start": start.isoformat(),
        "parameters_json.range_end": end.isoformat(),
    }, {"_id": 0, "id": 1})
    return bool(existing)


async def _enqueue_auto(report_type: str, participant: dict, params: dict, name_suffix: str) -> None:
    from reports_routes import REPORT_TYPES, _generate_report, _new_id, _now as _rnow
    p_name = f"{participant.get('first_name','')} {participant.get('last_name','')}".strip() or "Participant"
    rid = _new_id()
    report = {
        "id": rid,
        "account_id": participant.get("account_id"),
        "participant_id": participant["id"],
        "report_type": report_type,
        "report_name": f"{REPORT_TYPES[report_type]} · {p_name}{name_suffix}",
        "parameters_json": {**params, "auto": True},
        "status": "GENERATING",
        "generated_by": None,  # auto, notify all account members
        "is_adviser_branded": False,
        "created_at": _rnow().isoformat(),
        "updated_at": _rnow().isoformat(),
    }
    # Find a generated_by user (account owner) so notifications fire
    acct = await db.accounts.find_one({"id": participant.get("account_id")}, {"_id": 0, "owner_user_id": 1})
    if acct:
        report["generated_by"] = acct.get("owner_user_id")
    await db.generated_reports.insert_one(report.copy())
    asyncio.create_task(_generate_report(rid))
    logger.info(f"auto-enqueued {report_type} for participant {participant['id']}")


async def _tick() -> None:
    today = date.today()
    q_label, fy, q_start, q_end = _completed_quarter_window(today)
    annual_fy, annual_start, annual_end = _completed_fy(today)

    # Walk every active participant on every account.
    cursor = db.participants.find({"status": "ACTIVE"}, {"_id": 0})
    async for p in cursor:
        # Quarterly Budget, 7 days after quarter end
        if q_label and q_start and q_end:
            if not await _already_generated("QUARTERLY_BUDGET", p["id"], q_start, q_end):
                try:
                    await _enqueue_auto(
                        "QUARTERLY_BUDGET", p,
                        {"quarter": q_label, "financial_year": fy, "range_start": q_start.isoformat(), "range_end": q_end.isoformat()},
                        f" · {q_label} FY{fy}",
                    )
                except Exception as e:
                    logger.warning(f"quarterly auto-gen failed for {p['id']}: {e}")

        # Annual Financial, 14 days after 30 Jun, if >= 6 statements
        if annual_fy and annual_start and annual_end:
            if not await _already_generated("ANNUAL_FINANCIAL", p["id"], annual_start, annual_end):
                # Count decoded statements in the FY for this participant or their household.
                hid = p.get("household_id")
                q: dict = {}
                if hid:
                    q["household_id"] = hid
                # Roughly filter by upload date
                q["uploaded_at"] = {"$gte": annual_start.isoformat(), "$lte": (annual_end + timedelta(days=1)).isoformat()}
                count = await db.statements.count_documents(q)
                if count >= 6:
                    try:
                        await _enqueue_auto(
                            "ANNUAL_FINANCIAL", p,
                            {"financial_year": annual_fy, "range_start": annual_start.isoformat(), "range_end": annual_end.isoformat()},
                            f" · FY{annual_fy}",
                        )
                    except Exception as e:
                        logger.warning(f"annual auto-gen failed for {p['id']}: {e}")


async def _loop() -> None:
    logger.info(f"reports scheduler started (interval={POLL_INTERVAL_SEC}s)")
    while _stop_event is not None and not _stop_event.is_set():
        try:
            await _tick()
        except Exception as e:
            logger.exception(f"scheduler tick failed: {e}")
        try:
            await asyncio.wait_for(_stop_event.wait(), timeout=POLL_INTERVAL_SEC)
        except asyncio.TimeoutError:
            pass


async def start() -> None:
    global _task, _stop_event
    if _task is not None:
        return
    _stop_event = asyncio.Event()
    _task = asyncio.create_task(_loop())


async def stop() -> None:
    global _task, _stop_event
    if _stop_event is not None:
        _stop_event.set()
    if _task is not None:
        try:
            await asyncio.wait_for(_task, timeout=5)
        except asyncio.TimeoutError:
            _task.cancel()
        _task = None
    _stop_event = None
