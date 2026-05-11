"""Background watchdog that probes critical services every 60s.

Pushes super_admin (+ operations_admin) when a service transitions
UP→DOWN or DOWN→UP. Per-service cooldown of 5 min prevents flap-spam.

State is persisted in `db.health_state` so a restart doesn't trigger a
duplicate "everything is back" notification.

Services probed:
  - MongoDB        — live `ping` command (most likely real outage signal)
  - LLM            — rolling 5-min error rate from `db.llm_calls`
  - Resend (email) — rolling 30-min failure count from `db.notification_log`
  - Stripe         — env-var presence (no live probe to avoid burning quota;
                     real outages surface via payment webhook errors which
                     get caught by the LLM/Resend log paths if they cascade)

Disable by setting `WATCHDOG_ENABLED=0` in env (defaults to enabled).
"""
from __future__ import annotations
import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Tuple, Dict
from motor.motor_asyncio import AsyncIOMotorClient

import push_service

log = logging.getLogger("health_watchdog")
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

POLL_INTERVAL_SEC = int(os.environ.get("WATCHDOG_POLL_INTERVAL", "60"))
ALERT_COOLDOWN_SEC = 300  # 5 min between alerts for the same service
LLM_WINDOW_MIN = 5
LLM_ERROR_RATE_THRESHOLD = 0.5  # >50% error rate over the window
LLM_MIN_SAMPLE = 5              # need >=5 calls in window before flagging
RESEND_WINDOW_MIN = 30
RESEND_FAIL_THRESHOLD = 5

_running = False


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


# ---------------------- PROBES ----------------------

async def _probe_mongodb() -> Tuple[bool, str]:
    try:
        await db.command("ping")
        return True, "ping ok"
    except Exception as e:
        return False, f"ping failed: {str(e)[:120]}"


async def _probe_llm() -> Tuple[bool, str]:
    cutoff = _iso(_now() - timedelta(minutes=LLM_WINDOW_MIN))
    total = await db.llm_calls.count_documents({"ts": {"$gte": cutoff}})
    if total < LLM_MIN_SAMPLE:
        return True, f"{total} calls in last {LLM_WINDOW_MIN}m"
    errors = await db.llm_calls.count_documents(
        {"ts": {"$gte": cutoff}, "$or": [{"ok": False}, {"success": False}]}
    )
    rate = errors / total if total else 0
    if rate > LLM_ERROR_RATE_THRESHOLD:
        return False, f"{errors}/{total} failed ({int(rate * 100)}%) last {LLM_WINDOW_MIN}m"
    return True, f"{errors}/{total} failed last {LLM_WINDOW_MIN}m"


async def _probe_resend() -> Tuple[bool, str]:
    key = os.environ.get("RESEND_API_KEY") or ""
    if not key:
        return False, "RESEND_API_KEY not configured"
    if key.startswith(("re_test_", "re_demo_")):
        return True, "test/demo key — mocked sends"
    cutoff = _iso(_now() - timedelta(minutes=RESEND_WINDOW_MIN))
    failed = await db.notification_log.count_documents({"ts": {"$gte": cutoff}, "status": "failed"})
    if failed >= RESEND_FAIL_THRESHOLD:
        return False, f"{failed} failed sends last {RESEND_WINDOW_MIN}m"
    return True, f"{failed} failed sends last {RESEND_WINDOW_MIN}m"


async def _probe_stripe() -> Tuple[bool, str]:
    key = os.environ.get("STRIPE_API_KEY") or ""
    if not key:
        return False, "STRIPE_API_KEY not configured"
    return True, "key configured"


PROBES = {
    "mongodb": _probe_mongodb,
    "llm": _probe_llm,
    "resend": _probe_resend,
    "stripe": _probe_stripe,
}


# ---------------------- STATE + ALERTING ----------------------

async def _load_state(service: str) -> Dict:
    rec = await db.health_state.find_one({"service": service}, {"_id": 0}) or {}
    return rec


async def _save_state(service: str, status: str, detail: str,
                      changed: bool, alerted: bool):
    update = {
        "service": service,
        "status": status,
        "detail": detail,
        "last_check": _iso(_now()),
    }
    if changed:
        update["last_change"] = _iso(_now())
    if alerted:
        update["last_alert_at"] = _iso(_now())
    await db.health_state.update_one(
        {"service": service}, {"$set": update}, upsert=True,
    )


def _within_cooldown(state: Dict) -> bool:
    last = state.get("last_alert_at")
    if not last:
        return False
    try:
        last_dt = datetime.fromisoformat(last)
    except Exception:
        return False
    return (_now() - last_dt).total_seconds() < ALERT_COOLDOWN_SEC


async def _alert(service: str, going_down: bool, detail: str):
    if going_down:
        title = f"🔥 {service.upper()} is DOWN"
        body = detail
    else:
        title = f"✅ {service.upper()} recovered"
        body = detail
    try:
        await push_service.notify_role(
            "system_health", title=title, body=body,
            data={"type": "system_health", "service": service,
                  "status": "down" if going_down else "up"},
        )
    except Exception as e:
        log.warning("watchdog push failed for %s: %s", service, e)


async def _check_one(service: str):
    probe = PROBES[service]
    try:
        ok, detail = await probe()
    except Exception as e:
        ok, detail = False, f"probe crashed: {str(e)[:100]}"
    new_status = "up" if ok else "down"

    state = await _load_state(service)
    old_status = state.get("status")  # None on first run

    changed = old_status != new_status
    alerted = False

    if changed and old_status is not None:
        # Transition — fire alert unless within cooldown
        if not _within_cooldown(state):
            await _alert(service, going_down=not ok, detail=detail)
            alerted = True
    # First-run boot: just record state, don't alert (avoid noise on restart)

    await _save_state(service, new_status, detail, changed, alerted)


async def _loop():
    global _running
    _running = True
    log.info("Health watchdog started (interval=%ss)", POLL_INTERVAL_SEC)
    while _running:
        try:
            await asyncio.gather(*[_check_one(s) for s in PROBES.keys()])
        except Exception as e:
            log.warning("watchdog tick error: %s", e)
        await asyncio.sleep(POLL_INTERVAL_SEC)


# ---------------------- LIFECYCLE ----------------------

_task: asyncio.Task | None = None


async def start():
    global _task
    if (os.environ.get("WATCHDOG_ENABLED", "1") or "1").lower() in ("0", "false", "no"):
        log.info("Watchdog disabled via WATCHDOG_ENABLED=0")
        return
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_loop())


async def stop():
    global _running, _task
    _running = False
    if _task:
        _task.cancel()
        try:
            await _task
        except Exception:
            pass
        _task = None


# ---------------------- INTROSPECTION ----------------------

async def current_state() -> Dict:
    rows = []
    async for r in db.health_state.find({}, {"_id": 0}):
        rows.append(r)
    return {
        "services": rows,
        "running": _running,
        "poll_interval_sec": POLL_INTERVAL_SEC,
        "alert_cooldown_sec": ALERT_COOLDOWN_SEC,
    }


async def force_check() -> Dict:
    """Manually trigger one round of checks. Returns the new state."""
    await asyncio.gather(*[_check_one(s) for s in PROBES.keys()])
    return await current_state()
