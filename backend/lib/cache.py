"""Wayly, unified Redis cache layer (Performance Hardening Section 3).

Three pillars:
1. **Reference data**, slow-changing config (program_reference catalogue,
   PRICE_BENCHMARKS, PENSION_RATES). Cache for hours. Shared across pods.
2. **Computed state**, per-household dashboard counters, usage tallies,
   participant burn-rate. Cache for ~60 s. Invalidate on write.
3. **Deterministic LLM**, `(model, prompt_hash, params_hash)` → response.
   Cache for hours. Hook ready; wired in Section 5 (LLM wrapper).

Design choices
--------------
* Single async Redis client per process, connection pool from
  `redis.asyncio.from_url`. Lazy-init on first use so import order doesn't
  matter.
* All values JSON-serialised with `default=str` so datetimes / ObjectIds
  round-trip without surprises.
* **Fail-soft**: if `REDIS_URL` is missing, or Redis is unreachable, the
  cache becomes a pure pass-through (always MISS, always compute, never
  raise). The app keeps working, just without the caching speedup.
* In-memory hit/miss counters per namespace exposed for the `/metrics`
  endpoint Section 7 will add.

Key naming convention: `wayly:{namespace}:{id1}:{id2}...`, colon-separated,
lowercase, ASCII-only. Use `key_for(...)` so we never typo a prefix.
"""
from __future__ import annotations
import asyncio
import hashlib
import json
import logging
import os
import time
from typing import Any, Awaitable, Callable, Optional

log = logging.getLogger("wayly.cache")

_NAMESPACE_PREFIX = "wayly"

# Module-level singletons, lazy-initialised.
_redis = None  # redis.asyncio.Redis | None
_redis_init_lock: Optional[asyncio.Lock] = None
_REDIS_DOWN = False

# Per-namespace hit/miss counters (in-process, production reads via /metrics).
_stats: dict[str, dict[str, int]] = {}


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

def _stats_bump(namespace: str, kind: str) -> None:
    rec = _stats.setdefault(namespace, {"hit": 0, "miss": 0, "set": 0, "err": 0})
    rec[kind] = rec.get(kind, 0) + 1


def get_stats() -> dict:
    """Snapshot of in-process cache counters since boot. Used by /metrics."""
    return {k: dict(v) for k, v in _stats.items()}


async def _get_client():
    """Singleton lazy Redis client. Returns None when Redis is unavailable.

    `_REDIS_DOWN` is only set when `REDIS_URL` is missing OR initial
    connection setup fails. Transient errors after that don't flip the
    flag, they just degrade individual calls to MISS/no-op.
    """
    global _redis, _redis_init_lock, _REDIS_DOWN
    if _redis is not None:
        return _redis
    if _REDIS_DOWN:
        return None
    if _redis_init_lock is None:
        _redis_init_lock = asyncio.Lock()
    async with _redis_init_lock:
        if _redis is not None:
            return _redis
        url = os.environ.get("REDIS_URL")
        if not url:
            log.info("REDIS_URL not set, cache layer is a no-op pass-through")
            _REDIS_DOWN = True
            return None
        try:
            import redis.asyncio as redis_async  # noqa: WPS433
            client = redis_async.from_url(
                url,
                encoding="utf-8",
                decode_responses=True,
                max_connections=50,
                socket_timeout=2.0,
                socket_connect_timeout=2.0,
            )
            await client.ping()
            _redis = client
            log.info("cache: Redis connected (%s)", url.split("@")[-1])
            return _redis
        except Exception as e:
            log.warning("cache: Redis init failed (%s), degrading to no-op", e)
            _REDIS_DOWN = True
            return None


# ---------------------------------------------------------------------------
# Key helpers
# ---------------------------------------------------------------------------

def key_for(namespace: str, *parts: Any) -> str:
    """Build a colon-separated cache key. Parts are stringified + lowercased."""
    safe = [str(p).strip().replace(" ", "_") for p in parts if p is not None]
    return ":".join([_NAMESPACE_PREFIX, namespace, *safe])


def hash_key(*parts: Any) -> str:
    """Stable short hash for inputs whose raw form is too long to use as
    a key (LLM prompts, big config dicts)."""
    blob = json.dumps(parts, sort_keys=True, default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()[:24]


# ---------------------------------------------------------------------------
# Primitive get/set/delete
# ---------------------------------------------------------------------------

async def get(namespace: str, key: str) -> Optional[Any]:
    """Return cached JSON value or None on miss / Redis-down."""
    client = await _get_client()
    if client is None:
        _stats_bump(namespace, "miss")
        return None
    try:
        raw = await client.get(key)
    except Exception as e:
        log.debug("cache GET error key=%s err=%s", key, e)
        _stats_bump(namespace, "err")
        return None
    if raw is None:
        _stats_bump(namespace, "miss")
        return None
    _stats_bump(namespace, "hit")
    try:
        return json.loads(raw)
    except Exception:
        # Corrupt value, drop it so the next call recomputes.
        try:
            await client.delete(key)
        except Exception:
            pass
        return None


async def set_(namespace: str, key: str, value: Any,
               ttl_seconds: int = 60) -> bool:
    client = await _get_client()
    if client is None:
        return False
    try:
        payload = json.dumps(value, default=str)
        await client.set(key, payload, ex=ttl_seconds)
        _stats_bump(namespace, "set")
        return True
    except Exception as e:
        log.debug("cache SET error key=%s err=%s", key, e)
        _stats_bump(namespace, "err")
        return False


async def delete(*keys: str) -> int:
    client = await _get_client()
    if client is None or not keys:
        return 0
    try:
        return int(await client.delete(*keys))
    except Exception:
        return 0


async def invalidate_pattern(pattern: str, *, max_keys: int = 500) -> int:
    """Drop every key matching `pattern` (uses SCAN, not KEYS, so it's safe
    on production-sized DBs). Caps deletions per call so a runaway pattern
    can't take down Redis.
    """
    client = await _get_client()
    if client is None:
        return 0
    deleted = 0
    try:
        async for k in client.scan_iter(match=pattern, count=200):
            await client.delete(k)
            deleted += 1
            if deleted >= max_keys:
                break
    except Exception as e:
        log.debug("cache scan/del error pattern=%s err=%s", pattern, e)
    return deleted


# ---------------------------------------------------------------------------
# Cache-aside helper, the main pattern callers use
# ---------------------------------------------------------------------------

async def cache_aside(namespace: str, key: str, ttl_seconds: int,
                       fetch: Callable[[], Awaitable[Any]]) -> Any:
    """Standard cache-aside:
        cached = await get(...)
        if cached: return cached
        fresh = await fetch()
        await set_(..., fresh)
        return fresh
    The `fetch` callable is only invoked on miss / Redis-down, so caller
    code stays linear.
    """
    cached = await get(namespace, key)
    if cached is not None:
        return cached
    fresh = await fetch()
    # Only cache truthy values, avoids re-caching empty results that the
    # caller might want to retry on (e.g. transient empty list from
    # eventual-consistency).
    if fresh is not None and fresh != [] and fresh != {}:
        await set_(namespace, key, fresh, ttl_seconds)
    return fresh


# ---------------------------------------------------------------------------
# Convenience invalidators for the common write-paths
# ---------------------------------------------------------------------------

async def invalidate_household(household_id: str) -> int:
    """Drop every key tied to a household, usage counters, burn, etc.
    Call this after a statement upload, line-item edit, anomaly resolve,
    family-message create, wellbeing checkin, digest send."""
    if not household_id:
        return 0
    return await invalidate_pattern(f"{_NAMESPACE_PREFIX}:hh:{household_id}:*")


async def invalidate_participant(participant_id: str) -> int:
    if not participant_id:
        return 0
    return await invalidate_pattern(f"{_NAMESPACE_PREFIX}:p:{participant_id}:*")


async def invalidate_user(user_id: str) -> int:
    if not user_id:
        return 0
    return await invalidate_pattern(f"{_NAMESPACE_PREFIX}:u:{user_id}:*")


async def invalidate_ref(namespace: Optional[str] = None) -> int:
    """Wipe reference-data namespace, call after admin edits a program
    reference row, price benchmark, pension rate, etc. Without an
    explicit namespace, wipes everything under `wayly:ref:*`."""
    pat = f"{_NAMESPACE_PREFIX}:ref:{namespace or ''}*"
    return await invalidate_pattern(pat)


# ---------------------------------------------------------------------------
# Shutdown helper (called from app.on_event('shutdown'))
# ---------------------------------------------------------------------------

async def close() -> None:
    global _redis
    if _redis is not None:
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None
