"""LOOP-1 v1.2 addons: pattern dismissal + background cron.

Pattern dismissal:
  POST /api/loop/patterns/{case_type}/dismiss  (snooze 7 days for the caller)
  Adds a `pattern_dismissals` collection: {user_id, case_type, snoozed_until}

Cron:
  Started on app startup as an asyncio task. Runs LCA-1 sweep nightly at
  02:15 UTC and the digest job weekly on Monday at 07:00 UTC.
"""
from __future__ import annotations

import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

logger = logging.getLogger("wayly.loop1.cron")

extras_router = APIRouter(prefix="/loop", tags=["loop1-extras"])

_db = None
_user_dep = None
_lca1_scan = None       # single-participant LCA-1 scanner
_send_email = None      # optional email sender
_build_digest = None    # callable: (db, user_id) -> {subject, text, html, case_count}

_cron_task: Optional[asyncio.Task] = None


def init_extras(*, db, user_dep, lca1_scan_for_participant, send_email=None, build_digest_for_user=None):
    global _db, _user_dep, _lca1_scan, _send_email, _build_digest
    _db = db
    _user_dep = user_dep
    _lca1_scan = lca1_scan_for_participant
    _send_email = send_email
    _build_digest = build_digest_for_user


def _flag_enabled() -> bool:
    return os.environ.get("LOOP1_CASES_ENABLED", "1") != "0"


def _cron_enabled() -> bool:
    return os.environ.get("LOOP1_CRON_ENABLED", "1") != "0"


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# Pattern dismissal
# ---------------------------------------------------------------------------


@extras_router.post("/patterns/{case_type}/dismiss")
async def dismiss_pattern(case_type: str, request: Request):
    """Snooze a pattern alert for the caller for 7 days."""
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    user = await _user_dep(request)
    uid = user.get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="unauthenticated")
    snoozed_until = _now() + timedelta(days=7)
    await _db.pattern_dismissals.update_one(
        {"user_id": uid, "case_type": case_type},
        {"$set": {"user_id": uid, "case_type": case_type, "snoozed_until": snoozed_until, "updated_at": _now()}},
        upsert=True,
    )
    return {"dismissed": True, "case_type": case_type, "snoozed_until": snoozed_until.isoformat()}


async def get_dismissed_case_types_for_user(db, user_id: str) -> set:
    """Return the set of case_types this user has actively snoozed."""
    now = datetime.now(timezone.utc)
    cur = db.pattern_dismissals.find(
        {"user_id": user_id, "snoozed_until": {"$gt": now}},
        {"_id": 0, "case_type": 1},
    )
    return {d["case_type"] async for d in cur}


# ---------------------------------------------------------------------------
# Background cron
# ---------------------------------------------------------------------------


async def _sweep_all_lca1() -> dict:
    """Sweep every Level 2/3 participant globally."""
    opened = 0
    scanned = 0
    async for p in _db.participants.find(
        {"is_archived": {"$ne": True}, "status": {"$ne": "REMOVED"}, "classification": {"$in": [2, 3]}},
        {"_id": 0, "id": 1},
    ):
        scanned += 1
        try:
            result = await _lca1_scan(p["id"])
            if result:
                opened += 1
        except Exception as e:
            logger.warning("lca1 sweep failed for %s: %s", p.get("id"), e)
    return {"scanned": scanned, "opened": opened}


async def _run_weekly_digest_delivery() -> dict:
    """Iterate users with digest_frequency=weekly_digest AND opt-in email, build
    each user's digest, and send it. Returns a summary."""
    if not _send_email or not _build_digest:
        return {"sent": 0, "skipped_no_prefs": 0, "skipped_no_email": 0, "reason": "delivery_not_configured"}
    sent = 0
    skipped = 0
    async for pref in _db.user_alert_preferences.find(
        {"digest_frequency": "weekly_digest", "channels.email": True},
        {"_id": 0, "user_id": 1},
    ):
        uid = pref.get("user_id")
        if not uid:
            continue
        try:
            digest = await _build_digest(_db, uid)
        except Exception as e:
            logger.warning("build_digest failed for %s: %s", uid, e)
            continue
        if not digest or not digest.get("case_count"):
            skipped += 1
            continue
        u = await _db.users.find_one({"id": uid}, {"_id": 0, "email": 1})
        if not u or not u.get("email"):
            skipped += 1
            continue
        try:
            await _send_email(
                to=u["email"],
                subject=digest["subject"],
                html=digest["html"],
                plain_text=digest["text"],
            )
            await _db.cron_jobs.insert_one({
                "job": "lca1_digest_email",
                "user_id": uid,
                "email": u["email"],
                "run_at": _now(),
                "case_count": digest.get("case_count"),
            })
            sent += 1
        except Exception as e:
            logger.warning("digest email send failed for %s: %s", uid, e)
    return {"sent": sent, "skipped": skipped}


async def _cron_loop():
    """Cron loop: run every hour, dispatch jobs when time bucket matches."""
    logger.info("LOOP1 cron loop starting")
    last_sweep_utc_date = None
    last_digest_utc_iso_week = None
    # Guard: don't run all jobs immediately on boot; wait 60s first
    await asyncio.sleep(60)
    while True:
        try:
            now = _now()
            utc_date = now.date().isoformat()
            utc_iso_week = f"{now.isocalendar().year}-W{now.isocalendar().week:02d}"

            # Nightly LCA-1 sweep at 02:15 UTC
            if now.hour == 2 and now.minute >= 15 and utc_date != last_sweep_utc_date:
                logger.info("LOOP1 cron: starting nightly LCA-1 sweep")
                result = await _sweep_all_lca1()
                logger.info("LOOP1 cron: sweep complete %s", result)
                last_sweep_utc_date = utc_date

            # Weekly digest emails on Monday 07:00 UTC
            if now.weekday() == 0 and now.hour == 7 and utc_iso_week != last_digest_utc_iso_week:
                logger.info("LOOP1 cron: weekly digest at %s", utc_iso_week)
                dr = await _run_weekly_digest_delivery()
                logger.info("LOOP1 cron: digest delivered %s", dr)
                await _db.cron_jobs.insert_one({
                    "job": "lca1_weekly_digest_batch",
                    "run_at": now,
                    "iso_week": utc_iso_week,
                    "delivery_summary": dr,
                })
                last_digest_utc_iso_week = utc_iso_week

            # Sleep an hour between checks
            await asyncio.sleep(3600)
        except asyncio.CancelledError:
            logger.info("LOOP1 cron cancelled")
            return
        except Exception as e:
            logger.exception("LOOP1 cron loop error: %s", e)
            await asyncio.sleep(300)


def start_cron():
    global _cron_task
    if not _cron_enabled():
        logger.info("LOOP1 cron disabled by env")
        return None
    if _cron_task and not _cron_task.done():
        return _cron_task
    _cron_task = asyncio.create_task(_cron_loop())
    logger.info("LOOP1 cron task started")
    return _cron_task


async def stop_cron():
    global _cron_task
    if _cron_task and not _cron_task.done():
        _cron_task.cancel()
        try:
            await _cron_task
        except Exception:
            pass
    _cron_task = None


# ---------------------------------------------------------------------------
# Admin trigger (manual "run now" endpoints)
# ---------------------------------------------------------------------------


@extras_router.post("/cron/digest-now")
async def cron_run_digest_now(request: Request):
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    user = await _user_dep(request)
    role = (user.get("role") or "").lower()
    if role not in ("staff", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="staff_only")
    return await _run_weekly_digest_delivery()


@extras_router.post("/cron/lca1-sweep-now")
async def cron_run_sweep_now(request: Request):
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    user = await _user_dep(request)
    role = (user.get("role") or "").lower()
    if role not in ("staff", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="staff_only")
    result = await _sweep_all_lca1()
    return result


@extras_router.get("/cron/status")
async def cron_status(request: Request):
    if not _flag_enabled():
        raise HTTPException(status_code=404, detail="Not found")
    user = await _user_dep(request)
    role = (user.get("role") or "").lower()
    if role not in ("staff", "admin", "super_admin"):
        raise HTTPException(status_code=403, detail="staff_only")
    running = _cron_task is not None and not _cron_task.done()
    recent = []
    async for row in _db.cron_jobs.find({}, {"_id": 0}).sort("run_at", -1).limit(5):
        row["run_at"] = row["run_at"].isoformat() if isinstance(row.get("run_at"), datetime) else row.get("run_at")
        recent.append(row)
    return {"running": running, "cron_enabled": _cron_enabled(), "recent_jobs": recent}
