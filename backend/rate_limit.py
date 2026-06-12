"""Phase 3 — Redis-backed rate limiting.

Design goals:
  * Fail OPEN. If Redis is unreachable we log and let the request through —
    a temporary Redis outage must not lock everyone out of the app. We DO
    bias closed for /auth/login + /admin/auth/login though, because those
    are the routes an attacker would most want Redis to vanish from.
  * Fixed-window counters via `INCR` + `EXPIRE`. Simple, atomic, accurate
    enough for human-scale abuse (we're not building DDoS protection — that
    sits at the Cloudflare layer).
  * Per-key configuration via the `LIMITS` table below — adding a new
    bucket is a one-line change.

Each `consume(key, limit, window)` call returns (allowed, remaining, ttl).
Callers turn that into a `429` with a `Retry-After` header.
"""
from __future__ import annotations
import os
import logging
import time
from typing import Optional, Tuple
from fastapi import HTTPException, Request

log = logging.getLogger("wayly.ratelimit")

# --------------------------------------------------------------------------
# limit table — single source of truth, easy to tweak per endpoint
# --------------------------------------------------------------------------
LIMITS: dict[str, tuple[int, int]] = {
    # (count, window_seconds)
    "login_ip":         (5,  5 * 60),
    "login_email":      (10, 60 * 60),
    "signup_ip":        (10, 15 * 60),    # generous: families behind one NAT
    "signup_email":     (10, 60 * 60),
    "forgot_email":     (3,  60 * 60),
    "reset_ip":         (5,  60 * 60),
    "upload_account":   (20, 60 * 60),
    "tools_unauth_ip":  (10, 60 * 60),
    "tools_account":    (60, 60 * 60),
    "admin_login_ip":   (5,  5 * 60),
    "admin_action":     (30, 60),
}

# Buckets where Redis failure means we deny (default is fail-open).
FAIL_CLOSED_BUCKETS = {"login_ip", "login_email", "admin_login_ip"}


# --------------------------------------------------------------------------
# redis client (lazy, async)
# --------------------------------------------------------------------------
_redis = None
_redis_ready = False


async def _get_redis():
    global _redis, _redis_ready
    if _redis is not None:
        return _redis
    url = os.environ.get("REDIS_URL")
    if not url:
        log.warning("REDIS_URL not set — rate limiting is disabled (fail-open).")
        return None
    try:
        import redis.asyncio as redis_async
        _redis = redis_async.from_url(url, encoding="utf-8", decode_responses=True)
        await _redis.ping()
        _redis_ready = True
        log.info("rate-limit Redis connected: %s", url.split("@")[-1])
        return _redis
    except Exception as e:
        log.warning("rate-limit Redis unavailable (%s) — disabling rate limiting.", e)
        _redis = None
        return None


async def _redis_is_healthy() -> bool:
    r = await _get_redis()
    if r is None:
        return False
    try:
        await r.ping()
        return True
    except Exception:
        return False


# --------------------------------------------------------------------------
# core: consume a single bucket
# --------------------------------------------------------------------------
async def consume(bucket: str, identifier: str) -> Tuple[bool, int, int]:
    """Atomically increment the counter for (bucket, identifier).

    Returns:
        (allowed, remaining, retry_after_seconds)

    If Redis is down:
        Bucket in FAIL_CLOSED_BUCKETS → (False, 0, 60)  — bias secure
        otherwise                     → (True,  -1, 0)  — fail open
    """
    if bucket not in LIMITS:
        raise ValueError(f"unknown bucket: {bucket}")
    limit, window = LIMITS[bucket]
    r = await _get_redis()
    if r is None:
        if bucket in FAIL_CLOSED_BUCKETS:
            return False, 0, 60
        return True, -1, 0

    key = f"rl:{bucket}:{identifier}"
    try:
        # Atomic: INCR + (set EXPIRE on first hit only) via pipeline.
        pipe = r.pipeline(transaction=True)
        pipe.incr(key)
        pipe.expire(key, window, nx=True)  # nx = only set TTL if no TTL yet
        pipe.ttl(key)
        count, _expired, ttl = await pipe.execute()
        if ttl is None or ttl < 0:
            # ttl=-1 means "no expire" — set one just in case nx race lost.
            await r.expire(key, window)
            ttl = window
        remaining = max(0, limit - int(count))
        allowed = int(count) <= limit
        if not allowed:
            log.info("rate-limit HIT bucket=%s id=%s count=%d limit=%d", bucket, identifier, count, limit)
        return allowed, remaining, int(ttl)
    except Exception as e:
        log.warning("rate-limit redis error on %s/%s: %s", bucket, identifier, e)
        if bucket in FAIL_CLOSED_BUCKETS:
            return False, 0, 60
        return True, -1, 0


# --------------------------------------------------------------------------
# convenience helpers
# --------------------------------------------------------------------------
def _client_ip(request: Request) -> str:
    """Prefer X-Forwarded-For (Kubernetes / Cloudflare) then the socket peer."""
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return (request.client.host if request.client else "unknown") or "unknown"


async def enforce(request: Request, *checks: tuple[str, str]) -> None:
    """Run a set of `(bucket, identifier)` checks. Raises 429 on first hit,
    setting a friendly `Retry-After` header so clients back off cleanly.

    Example:
        await enforce(
            request,
            ("login_ip", _client_ip(request)),
            ("login_email", email.lower()),
        )
    """
    worst_retry = 0
    worst_bucket = None
    for bucket, ident in checks:
        if not ident:
            continue
        allowed, _remaining, retry = await consume(bucket, ident)
        if not allowed:
            if retry > worst_retry:
                worst_retry = retry
                worst_bucket = bucket
    if worst_bucket:
        # Friendly, user-facing copy. Includes Retry-After so the UI / clients
        # can show a count-down rather than a generic "try again" message.
        raise HTTPException(
            status_code=429,
            detail=(
                "You've made too many attempts. "
                f"Please wait {max(1, worst_retry // 60)} minute(s) and try again."
            ),
            headers={"Retry-After": str(max(1, worst_retry))},
        )


# --------------------------------------------------------------------------
# peek — check if any bucket is already over budget WITHOUT incrementing.
# Used by paths that want to count failures only, not successful attempts.
# --------------------------------------------------------------------------
async def peek(bucket: str, identifier: str) -> Tuple[bool, int]:
    """Return (allowed, retry_after_seconds) without consuming the counter.

    Fail-open on Redis outage even for FAIL_CLOSED_BUCKETS — `peek` is for
    *checking*, not for enforcement of attempts; the matching `consume` on
    the failure branch still enforces fail-closed if Redis is down.
    """
    if bucket not in LIMITS:
        raise ValueError(f"unknown bucket: {bucket}")
    limit, _window = LIMITS[bucket]
    r = await _get_redis()
    if r is None:
        return True, 0
    key = f"rl:{bucket}:{identifier}"
    try:
        cur = await r.get(key)
        if cur is None:
            return True, 0
        count = int(cur)
        if count <= limit:
            return True, 0
        ttl = await r.ttl(key)
        return False, int(max(1, ttl))
    except Exception:
        return True, 0


async def enforce_peek(request: Request, *checks: tuple[str, str]) -> None:
    """Like `enforce` but read-only — raises 429 if any bucket is already
    exhausted, but never increments the counter. Pair with `consume` on the
    failure branch so only abusive attempts burn budget."""
    worst_retry = 0
    worst_bucket = None
    for bucket, ident in checks:
        if not ident:
            continue
        allowed, retry = await peek(bucket, ident)
        if not allowed and retry > worst_retry:
            worst_retry = retry
            worst_bucket = bucket
    if worst_bucket:
        raise HTTPException(
            status_code=429,
            detail=(
                "You've made too many attempts. "
                f"Please wait {max(1, worst_retry // 60)} minute(s) and try again."
            ),
            headers={"Retry-After": str(max(1, worst_retry))},
        )


# --------------------------------------------------------------------------
# admin helper — let us reset a key for tests / unblock real users
# --------------------------------------------------------------------------
async def reset(bucket: str, identifier: str) -> bool:
    r = await _get_redis()
    if r is None:
        return False
    try:
        await r.delete(f"rl:{bucket}:{identifier}")
        return True
    except Exception:
        return False


async def reset_all_for_identifier(identifier: str) -> int:
    """Useful in tests — purges every bucket key tied to one IP / email."""
    r = await _get_redis()
    if r is None:
        return 0
    purged = 0
    try:
        for bucket in LIMITS.keys():
            n = await r.delete(f"rl:{bucket}:{identifier}")
            purged += n
    except Exception:
        pass
    return purged
