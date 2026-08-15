"""Wayly, Background jobs (Performance Hardening Section 4).

Goal: move every request-path task that takes >200 ms off the request
thread, with retry + dead-letter + observability built in.

Two execution surfaces in one helper:

1. **Fire-and-forget** (`run_async`), uses asyncio.create_task with a
   wrapping retry/log shim. Fastest path; no persistence. Suitable for:
   email sends, push notifications, digest deliveries, audit-event writes.

2. **Persistent queue** (`enqueue`), Redis-list-backed queue with a single
   asyncio consumer running in-process at startup. Suitable for: report
   generation, anomaly rescan, lifecycle backfills. Survives a single-pod
   restart; jobs picked up next boot.

Either surface degrades to the other if its dependency is unavailable ,
no `REDIS_URL` → `enqueue` falls back to fire-and-forget.

Counters per job type expose hit/error counts to the `/metrics` endpoint
Section 7 ships.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any, Awaitable, Callable, Optional

from lib import cache as _cache

log = logging.getLogger("wayly.jobs")

# In-process registry of named handlers (so a queued job survives across
# requests, only its function name + args are stored).
_HANDLERS: dict[str, Callable[..., Awaitable[Any]]] = {}

# Counters per handler name: started / done / error / retried.
_stats: dict[str, dict[str, int]] = {}

_QUEUE_KEY = "wayly:jobs:queue"
_DEAD_KEY = "wayly:jobs:dead"
_CONSUMER_TASK: Optional[asyncio.Task] = None
_CONSUMER_STOP = False


def _bump(name: str, kind: str) -> None:
    rec = _stats.setdefault(name, {"started": 0, "done": 0, "error": 0, "retried": 0})
    rec[kind] = rec.get(kind, 0) + 1


def get_stats() -> dict:
    return {k: dict(v) for k, v in _stats.items()}


# ---------------------------------------------------------------------------
# Handler registry (decorator)
# ---------------------------------------------------------------------------

def task(name: str | None = None):
    """Register an async callable as a named background task.
    `enqueue("send_email", to=...)` resolves to the registered function.
    """
    def decorator(fn: Callable[..., Awaitable[Any]]):
        key = name or fn.__name__
        _HANDLERS[key] = fn
        fn.__wayly_task_name__ = key  # type: ignore[attr-defined]
        return fn
    return decorator


# ---------------------------------------------------------------------------
# Fire-and-forget
# ---------------------------------------------------------------------------

async def _run_with_retry(name: str, coro_factory: Callable[[], Awaitable[Any]],
                           *, max_attempts: int = 3, base_backoff: float = 0.5):
    """Run `coro_factory()` with exponential backoff. Errors logged but
    not raised, the request that scheduled this is already long gone."""
    attempt = 0
    while attempt < max_attempts:
        attempt += 1
        try:
            _bump(name, "started")
            await coro_factory()
            _bump(name, "done")
            return
        except Exception as e:
            _bump(name, "error")
            if attempt >= max_attempts:
                log.exception("bg task %s failed after %d attempts: %s",
                              name, attempt, e)
                # Send to dead-letter so an operator can replay manually.
                try:
                    client = await _cache._get_client()  # type: ignore[attr-defined]
                    if client is not None:
                        await client.lpush(_DEAD_KEY, json.dumps({
                            "name": name,
                            "error": str(e)[:500],
                            "ts": time.time(),
                        }, default=str))
                        await client.ltrim(_DEAD_KEY, 0, 999)  # cap at 1k
                except Exception:
                    pass
                return
            _bump(name, "retried")
            backoff = base_backoff * (2 ** (attempt - 1))
            log.warning("bg task %s attempt %d/%d failed (%s), retry in %.1fs",
                        name, attempt, max_attempts, e, backoff)
            await asyncio.sleep(backoff)


def run_async(coro_or_factory, *, name: str = "unnamed",
              max_attempts: int = 3) -> asyncio.Task:
    """Fire-and-forget with retry. Accepts either:
      - a coroutine (single-shot, retry can only log on failure since
        a coroutine cannot be awaited twice), or
      - a `Callable[[], Awaitable]` factory (preferred for retry, each
        attempt produces a fresh coroutine).
    """
    if callable(coro_or_factory) and not asyncio.iscoroutine(coro_or_factory):
        factory = coro_or_factory
    else:
        # Single coroutine path, runs at most once even with retry semantics.
        _coro = coro_or_factory
        _used = {"v": False}

        async def factory():
            if _used["v"]:
                raise RuntimeError(
                    "run_async was given a raw coroutine; cannot retry. "
                    "Pass a callable factory if you need retry."
                )
            _used["v"] = True
            return await _coro

    return asyncio.create_task(_run_with_retry(name, factory,
                                                max_attempts=max_attempts))


# ---------------------------------------------------------------------------
# Persistent queue (Redis-backed, with in-memory fallback)
# ---------------------------------------------------------------------------

async def enqueue(handler_name: str, *args, **kwargs) -> bool:
    """Push a (handler_name, args, kwargs) tuple onto the persistent queue.
    Returns True if Redis stored it; False if it fell back to in-process
    fire-and-forget. Caller doesn't usually care which."""
    if handler_name not in _HANDLERS:
        log.error("enqueue: no handler registered for %r", handler_name)
        return False
    payload = {
        "id": uuid.uuid4().hex,
        "name": handler_name,
        "args": list(args),
        "kwargs": dict(kwargs),
        "ts": time.time(),
    }
    client = await _cache._get_client()  # type: ignore[attr-defined]
    if client is None:
        # Fall back to fire-and-forget so caller code still works.
        fn = _HANDLERS[handler_name]
        run_async(fn(*args, **kwargs), name=handler_name)
        return False
    try:
        await client.rpush(_QUEUE_KEY, json.dumps(payload, default=str))
        return True
    except Exception as e:
        log.warning("enqueue: Redis push failed (%s), falling back", e)
        fn = _HANDLERS[handler_name]
        run_async(fn(*args, **kwargs), name=handler_name)
        return False


async def _consumer_loop():
    """Single in-process consumer. BLPOP-style pull from Redis with a
    short timeout so the loop responds to shutdown promptly."""
    global _CONSUMER_STOP
    while not _CONSUMER_STOP:
        client = await _cache._get_client()  # type: ignore[attr-defined]
        if client is None:
            await asyncio.sleep(2)
            continue
        try:
            res = await client.blpop(_QUEUE_KEY, timeout=2)
        except Exception as e:
            log.debug("queue blpop error: %s", e)
            await asyncio.sleep(1)
            continue
        if not res:
            continue
        _, raw = res
        try:
            payload = json.loads(raw)
        except Exception:
            continue
        name = payload.get("name")
        fn = _HANDLERS.get(name)
        if fn is None:
            log.error("queue: unknown handler %r, dropping payload", name)
            continue
        args = payload.get("args") or []
        kwargs = payload.get("kwargs") or {}
        async def _factory(_fn=fn, _a=args, _kw=kwargs):
            return await _fn(*_a, **_kw)
        # Each job gets its own retry budget; failure doesn't kill the loop.
        await _run_with_retry(name, _factory, max_attempts=3)


async def start_consumer():
    """Kick off the single in-process queue consumer. Idempotent."""
    global _CONSUMER_TASK, _CONSUMER_STOP
    if _CONSUMER_TASK is not None and not _CONSUMER_TASK.done():
        return
    _CONSUMER_STOP = False
    _CONSUMER_TASK = asyncio.create_task(_consumer_loop())
    log.info("background-jobs consumer started")


async def stop_consumer():
    global _CONSUMER_STOP, _CONSUMER_TASK
    _CONSUMER_STOP = True
    if _CONSUMER_TASK is not None:
        try:
            _CONSUMER_TASK.cancel()
            await asyncio.gather(_CONSUMER_TASK, return_exceptions=True)
        except Exception:
            pass
        _CONSUMER_TASK = None


# ---------------------------------------------------------------------------
# Observability helpers
# ---------------------------------------------------------------------------

async def queue_depth() -> int:
    client = await _cache._get_client()  # type: ignore[attr-defined]
    if client is None:
        return 0
    try:
        return int(await client.llen(_QUEUE_KEY))
    except Exception:
        return 0


async def dead_letter_recent(limit: int = 20) -> list[dict]:
    client = await _cache._get_client()  # type: ignore[attr-defined]
    if client is None:
        return []
    try:
        raw = await client.lrange(_DEAD_KEY, 0, max(0, limit - 1))
    except Exception:
        return []
    out = []
    for r in raw:
        try:
            out.append(json.loads(r))
        except Exception:
            pass
    return out
