"""Wayly, unified LLM wrapper (Performance Hardening Section 5).

Single ingress for every LLM call in the codebase. Layered:

1. **Cache**, for deterministic calls (temperature=0), check
   `lib.llm_cache` first. Hits skip the network entirely.
2. **Circuit breaker**, per (provider, model) failure tracking. After
   N consecutive errors in a sliding window, fail fast for M seconds so
   we don't pile up timeouts during an upstream outage.
3. **Concurrency cap**, `asyncio.Semaphore` per model so a burst of
   requests doesn't blow our provider rate limit.
4. **Cost / token tracking**, every call records to `llm_calls` for
   the existing observability dashboards (`server.py` admin views).

This wrapper does NOT implement provider clients, it delegates to
`emergentintegrations` (the same library every existing call site uses).
This makes it a strictly additive layer: existing call sites can adopt
it incrementally.
"""
from __future__ import annotations
import asyncio
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Optional

from lib import llm_cache

log = logging.getLogger("wayly.llm")

# Dedicated thread pool for provider calls. MUST be separate from the default
# executor: LLM calls can run up to `_CALL_TIMEOUT_SEC`, and if they shared the
# default pool a burst of slow generations would starve every other
# `to_thread` user (notably bcrypt in the login path) and lock out the app.
_LLM_EXECUTOR = ThreadPoolExecutor(
    max_workers=int(os.environ.get("LLM_THREAD_WORKERS", "16")),
    thread_name_prefix="llm",
)


# ---------------------------------------------------------------------------
# Circuit-breaker state
# ---------------------------------------------------------------------------

class _Breaker:
    """Per-model breaker. Closed (ok) → Open (failing fast) → Half-open
    (one trial) → Closed."""

    def __init__(self, *, threshold: int = 5, cooldown_sec: float = 30.0):
        self.threshold = threshold
        self.cooldown = cooldown_sec
        self.fail_count = 0
        self.opened_at: Optional[float] = None

    def is_open(self) -> bool:
        if self.opened_at is None:
            return False
        if time.monotonic() - self.opened_at >= self.cooldown:
            # Half-open: allow exactly one trial through.
            self.opened_at = None
            self.fail_count = self.threshold - 1
            return False
        return True

    def record_success(self) -> None:
        self.fail_count = 0
        self.opened_at = None

    def record_failure(self) -> None:
        self.fail_count += 1
        if self.fail_count >= self.threshold and self.opened_at is None:
            self.opened_at = time.monotonic()
            log.warning("llm breaker OPEN (threshold=%d cooldown=%.0fs)",
                        self.threshold, self.cooldown)


_BREAKERS: dict[str, _Breaker] = {}
_SEMAPHORES: dict[str, asyncio.Semaphore] = {}
_STATS: dict[str, dict[str, int]] = {}


def _breaker_for(model: str) -> _Breaker:
    if model not in _BREAKERS:
        _BREAKERS[model] = _Breaker()
    return _BREAKERS[model]


def _sema_for(model: str, limit: int = 8) -> asyncio.Semaphore:
    if model not in _SEMAPHORES:
        _SEMAPHORES[model] = asyncio.Semaphore(limit)
    return _SEMAPHORES[model]


def _bump(model: str, kind: str) -> None:
    rec = _STATS.setdefault(model, {"req": 0, "ok": 0, "err": 0,
                                      "cache_hit": 0, "breaker_open": 0})
    rec[kind] = rec.get(kind, 0) + 1


def get_stats() -> dict:
    """Snapshot of per-model counters since boot. Surfaced via /metrics."""
    return {k: dict(v) for k, v in _STATS.items()}


class CircuitBreakerOpenError(RuntimeError):
    """Raised when a call is rejected because the breaker is open."""


# ---------------------------------------------------------------------------
# The wrapper itself
# ---------------------------------------------------------------------------

# Hard ceiling on any single provider call. A hung/slow upstream must not
# hold a concurrency slot open for LiteLLM's ~600s default, or a burst of
# stuck coroutines exhausts the per-model semaphore and every *new* request
# blocks indefinitely (observed: gateway spike poisoning the whole process
# until a manual restart). Kept below the ingress read-timeout so callers get
# a clean error instead of a 502. Override via LLM_CALL_TIMEOUT_SEC.
_CALL_TIMEOUT_SEC = float(os.environ.get("LLM_CALL_TIMEOUT_SEC", "75"))

# Per-request timeout handed to LiteLLM/httpx (the layer that actually aborts a
# hung upstream). Kept just below `_CALL_TIMEOUT_SEC` and the ingress read
# timeout so slow calls raise a clean provider error instead of a 502/hang.
_PROVIDER_TIMEOUT_SEC = float(os.environ.get("LLM_HTTP_TIMEOUT_SEC", "70"))


def _run_in_thread(invoker: Any) -> Any:
    """Execute an async `invoker` in a fresh event loop on a worker thread.

    The provider client blocks whatever loop it runs on; keeping it off the
    request loop is what lets the main app stay responsive (and lets the
    `wait_for` budget fire) during a slow/hung gateway.
    """
    return asyncio.run(invoker())


class LlmCallTimeout(RuntimeError):
    """Raised when a single provider call exceeds `_CALL_TIMEOUT_SEC`."""


async def call(
    *,
    model: str,
    prompt: Any,
    system: Optional[str] = None,
    invoker: Optional[Any] = None,  # async callable that performs the actual call
    params: Optional[dict] = None,
    cache_ttl: int = 24 * 60 * 60,
    concurrency: int = 8,
    timeout_sec: Optional[float] = None,
) -> Any:
    """Run an LLM call through cache + breaker + concurrency cap.

    `invoker` is an async callable that, when awaited, performs the actual
    provider request and returns the response. Keeping it injectable
    means this module has zero dependency on a specific SDK, callers
    pass a closure that uses whatever client they already wired up.

    Example:
        async def _ask():
            return await my_client.chat.completions.create(...)

        return await llm_wrapper.call(
            model="gpt-5.2", prompt=..., system=...,
            invoker=_ask, params={"temperature": 0},
        )
    """
    params = params or {}
    _bump(model, "req")

    # 1. Cache lookup (deterministic calls only, gating is inside llm_cache)
    cached = await llm_cache.get_cached(model, prompt, system, params)
    if cached is not None:
        _bump(model, "cache_hit")
        return cached

    # 2. Circuit breaker
    breaker = _breaker_for(model)
    if breaker.is_open():
        _bump(model, "breaker_open")
        raise CircuitBreakerOpenError(
            f"LLM circuit for {model!r} is open, cooling down"
        )

    # 3. Concurrency cap
    sema = _sema_for(model, limit=concurrency)
    budget = timeout_sec if timeout_sec is not None else _CALL_TIMEOUT_SEC
    async with sema:
        if invoker is None:
            raise ValueError("call(...) needs an `invoker` callable")
        try:
            t0 = time.monotonic()
            # Run the provider call in a dedicated worker thread (its own event
            # loop) off a dedicated executor. The vendored litellm/openai client
            # blocks the running event loop while awaiting a slow upstream —
            # observed freezing the WHOLE backend (every request 502s) and
            # defeating any async timeout, since a blocked loop can't fire its
            # own timer. Off-loading keeps the main loop free so `wait_for` can
            # actually enforce `budget`.
            loop = asyncio.get_running_loop()
            result = await asyncio.wait_for(
                loop.run_in_executor(_LLM_EXECUTOR, _run_in_thread, invoker),
                timeout=budget,
            )
            breaker.record_success()
            _bump(model, "ok")
            log.debug("llm %s call ok in %.2fs", model, time.monotonic() - t0)
        except asyncio.TimeoutError:
            breaker.record_failure()
            _bump(model, "err")
            log.warning("llm %s call timed out after %.0fs", model, budget)
            raise LlmCallTimeout(f"LLM call to {model!r} exceeded {budget:.0f}s")
        except Exception as e:
            breaker.record_failure()
            _bump(model, "err")
            log.warning("llm %s call failed (%s)", model, e)
            raise

    # 4. Cache the response (only deterministic, gating inside llm_cache)
    # Sanitise em/en dashes and enforce "%" symbol on string replies as global
    # tone guardrails.
    if isinstance(result, str):
        from lib.text_sanitiser import enforce_percent_symbol, strip_wayly_dashes
        result = strip_wayly_dashes(result)
        result = enforce_percent_symbol(result)
    await llm_cache.put(model, prompt, result, system, params,
                         ttl_seconds=cache_ttl)
    return result


# ---------------------------------------------------------------------------
# Convenience: one-shot LlmChat.send_message through the wrapper.
# Most Wayly call sites are single-turn deterministic prompts against
# emergentintegrations. This helper saves them constructing an `invoker`
# closure by hand.
# ---------------------------------------------------------------------------

async def chat_send(
    *,
    model: str,
    system: str,
    user_text: str,
    session_id: Optional[str] = None,
    provider: str = "anthropic",
    cache_ttl: int = 24 * 60 * 60,
    concurrency: int = 8,
    deterministic: bool = True,
    model_params: Optional[dict] = None,
    apply_tone_rules: bool = True,
    sanitise_output: bool = True,
) -> str:
    """One-shot ``LlmChat.send_message`` wrapped through ``call()``.

    Returns the raw string reply. Use this when you don't need multi-turn
    state, the wrapper creates a fresh chat per call and discards it.
    For genuinely multi-turn conversations, keep the LlmChat lifecycle in
    the caller and pass an invoker closure to ``call()`` directly.

    ``model_params`` is forwarded via ``.with_params(**model_params)``,
    use it for things like ``{"max_tokens": 400}``.

    ``apply_tone_rules`` (default True) appends the shared Wayly voice block
    to the system message. Turn it off for structured-JSON extraction
    prompts where extra prose is undesirable.
    ``sanitise_output`` (default True) strips em and en dashes from the
    reply. Safe for JSON payloads.
    """
    from datetime import datetime, timezone
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    from lib.text_sanitiser import append_tone_rules, enforce_percent_symbol, strip_wayly_dashes

    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise RuntimeError("EMERGENT_LLM_KEY not configured")
    sid = session_id or f"wayly-{datetime.now(timezone.utc).timestamp()}"
    effective_system = append_tone_rules(system) if apply_tone_rules else system

    # Bound the request at the provider (httpx) layer with num_retries=0 so a
    # slow/hung gateway fails fast instead of holding a concurrency slot for
    # LiteLLM's ~600s default (which froze the whole event loop during gateway
    # spikes). Callers can still override `timeout`/`num_retries` via model_params.
    call_params: dict = {"timeout": _PROVIDER_TIMEOUT_SEC, "num_retries": 0}
    if model_params:
        call_params.update(model_params)

    async def _invoke():
        chat = LlmChat(
            api_key=api_key,
            session_id=sid,
            system_message=effective_system,
        ).with_model(provider, model)
        chat = chat.with_params(**call_params)
        return await chat.send_message(UserMessage(text=user_text))

    reply = await call(
        model=model,
        prompt=user_text,
        system=effective_system,
        invoker=_invoke,
        params={"temperature": 0} if deterministic else {},
        cache_ttl=cache_ttl,
        concurrency=concurrency,
    )
    if sanitise_output and isinstance(reply, str):
        reply = strip_wayly_dashes(reply)
        reply = enforce_percent_symbol(reply)
    return reply


def stats(model: Optional[str] = None) -> dict:
    """In-memory call counters (req/cache_hit/ok/err/breaker_open)."""
    if model is None:
        return {m: dict(counters) for m, counters in _STATS.items()}
    return dict(_STATS.get(model, {}))


# ---------------------------------------------------------------------------
# Manual breaker controls (admin)
# ---------------------------------------------------------------------------

def reset_breaker(model: str) -> bool:
    if model in _BREAKERS:
        _BREAKERS[model].record_success()
        return True
    return False


def breaker_state(model: str) -> dict:
    b = _BREAKERS.get(model)
    if b is None:
        return {"state": "no-state", "fail_count": 0}
    return {
        "state": "open" if b.is_open() else "closed",
        "fail_count": b.fail_count,
        "threshold": b.threshold,
        "cooldown_sec": b.cooldown,
        "opened_at": b.opened_at,
    }
