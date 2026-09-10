"""Event-loop lag monitor (Backend Stability Pass).

A cheap background task that measures scheduling drift on the asyncio event
loop. If the loop is blocked by a synchronous/CPU-bound call (heavy PDF
rasterisation, image processing, a hung C-extension, etc.) the actual sleep
overshoots its target — that gap IS the lag. When it exceeds a threshold we
log a WARNING so an operator can see *when* the loop stalled and correlate it
with the request in flight.

This does not "fix" anything on its own; it makes the previously-invisible
`/api/health` 502 hang diagnosable, so a regression can't silently return.

Disable with EVENT_LOOP_MONITOR_ENABLED=0.
"""
from __future__ import annotations

import asyncio
import logging
import os
import time

log = logging.getLogger("wayly.loop_monitor")

# How often we probe (seconds) and how much overshoot counts as a real stall.
_PROBE_INTERVAL_S = float(os.environ.get("EVENT_LOOP_PROBE_INTERVAL", "0.5"))
_LAG_WARN_S = float(os.environ.get("EVENT_LOOP_LAG_WARN_SECONDS", "1.0"))

_task: asyncio.Task | None = None
_running = False
_max_lag_s = 0.0


async def _loop() -> None:
    global _running, _max_lag_s
    _running = True
    log.info(
        "event-loop monitor started (probe=%.2fs, warn>%.2fs)",
        _PROBE_INTERVAL_S, _LAG_WARN_S,
    )
    while _running:
        start = time.monotonic()
        await asyncio.sleep(_PROBE_INTERVAL_S)
        lag = (time.monotonic() - start) - _PROBE_INTERVAL_S
        if lag > _max_lag_s:
            _max_lag_s = lag
        if lag >= _LAG_WARN_S:
            log.warning(
                "event loop stalled for %.2fs (something blocked the loop; "
                "check for a sync/CPU-bound call not offloaded to a thread)",
                lag,
            )


async def start() -> None:
    global _task
    if (os.environ.get("EVENT_LOOP_MONITOR_ENABLED", "1") or "1").lower() in ("0", "false", "no"):
        log.info("event-loop monitor disabled via EVENT_LOOP_MONITOR_ENABLED=0")
        return
    if _task and not _task.done():
        return
    _task = asyncio.create_task(_loop())


async def stop() -> None:
    global _running, _task
    _running = False
    if _task:
        _task.cancel()
        try:
            await _task
        except Exception:
            pass
        _task = None


def stats() -> dict:
    return {"running": _running, "max_lag_seconds": round(_max_lag_s, 3),
            "probe_interval_seconds": _PROBE_INTERVAL_S,
            "warn_threshold_seconds": _LAG_WARN_S}
