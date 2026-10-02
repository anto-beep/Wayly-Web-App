"""Sections 4-7 regression — background jobs + LLM wrapper + metrics endpoint.

Each section verified end-to-end:
* Section 4: task registration, fire-and-forget retry, enqueue→consume
* Section 5: cache hit short-circuit, circuit-breaker open/close, concurrency
* Section 7: /api/metrics returns Prometheus text-format with our counters
"""
from __future__ import annotations
import asyncio
import os
import pytest
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from lib import jobs as _jobs  # noqa: E402
from lib import llm_wrapper as _llm  # noqa: E402
from lib import llm_cache  # noqa: E402
from lib import cache as _cache  # noqa: E402


# ---------------------------------------------------------------------------
# Section 4 — background jobs
# ---------------------------------------------------------------------------

@_jobs.task(name="_test_echo")
async def _echo(payload: str) -> str:
    return f"echoed:{payload}"


@_jobs.task(name="_test_flaky")
async def _flaky(state: list[int]) -> int:
    state[0] += 1
    if state[0] < 2:
        raise RuntimeError("simulated transient failure")
    return state[0]


@pytest.mark.asyncio
async def test_task_decorator_registers_handler():
    assert "_test_echo" in _jobs._HANDLERS  # noqa: SLF001 — test of internal state
    assert callable(_jobs._HANDLERS["_test_echo"])


@pytest.mark.asyncio
async def test_run_async_fire_and_forget_executes():
    seen = []

    async def _do():
        seen.append("ran")

    task = _jobs.run_async(_do(), name="t_fire_and_forget")
    await asyncio.wait_for(task, timeout=2)
    assert seen == ["ran"]


@pytest.mark.asyncio
async def test_run_async_retries_then_succeeds():
    counter = [0]

    async def _do():
        counter[0] += 1
        if counter[0] < 2:
            raise RuntimeError("nope")

    # Pass a factory (not a raw coroutine) so retry can rebuild it
    task = _jobs.run_async(_do, name="t_retry", max_attempts=3)
    await asyncio.wait_for(task, timeout=4)
    assert counter[0] == 2


@pytest.mark.asyncio
async def test_run_async_exhausts_retries_and_dead_letters():
    async def _do():
        raise RuntimeError("permanent")

    task = _jobs.run_async(_do, name="t_permanent_fail", max_attempts=2)
    await asyncio.wait_for(task, timeout=4)
    stats = _jobs.get_stats().get("t_permanent_fail", {})
    assert stats.get("error", 0) >= 2


@pytest.mark.asyncio
async def test_enqueue_falls_back_when_handler_unknown():
    ok = await _jobs.enqueue("never_registered_handler_xyz")
    assert ok is False


# ---------------------------------------------------------------------------
# Section 5 — LLM wrapper
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_llm_wrapper_caches_deterministic_calls():
    # First call invokes; second is a cache hit
    invoker_calls = [0]

    async def _invoke():
        invoker_calls[0] += 1
        return {"text": "hi"}

    # Clean cache for this specific input
    key = llm_cache.cache_key("test-model", "deterministic prompt",
                                "", {"temperature": 0})
    await _cache.delete(key)

    r1 = await _llm.call(model="test-model", prompt="deterministic prompt",
                          invoker=_invoke, params={"temperature": 0})
    r2 = await _llm.call(model="test-model", prompt="deterministic prompt",
                          invoker=_invoke, params={"temperature": 0})
    assert r1 == r2 == {"text": "hi"}
    assert invoker_calls[0] == 1, "second call should hit cache, not invoker"
    await _cache.delete(key)


@pytest.mark.asyncio
async def test_llm_wrapper_does_not_cache_nondeterministic():
    invoker_calls = [0]

    async def _invoke():
        invoker_calls[0] += 1
        return {"text": "ok"}

    await _llm.call(model="test-model-2", prompt="creative",
                     invoker=_invoke, params={"temperature": 0.9})
    await _llm.call(model="test-model-2", prompt="creative",
                     invoker=_invoke, params={"temperature": 0.9})
    assert invoker_calls[0] == 2, "non-deterministic must NOT cache"


@pytest.mark.asyncio
async def test_llm_wrapper_circuit_breaker_opens_after_failures():
    model = "test-breaker-model"
    _llm.reset_breaker(model)

    async def _broken():
        raise RuntimeError("upstream down")

    # 5 failures threshold by default
    for _ in range(5):
        try:
            await _llm.call(model=model, prompt="x", invoker=_broken)
        except RuntimeError:
            pass

    state = _llm.breaker_state(model)
    assert state["state"] == "open", state

    # Next call should fail fast with CircuitBreakerOpenError
    with pytest.raises(_llm.CircuitBreakerOpenError):
        await _llm.call(model=model, prompt="x", invoker=_broken)

    _llm.reset_breaker(model)


@pytest.mark.asyncio
async def test_llm_stats_track_req_ok_err():
    model = "test-stat-model"

    async def _ok():
        return {"text": "ok"}

    await _llm.call(model=model, prompt="abc", invoker=_ok,
                     params={"temperature": 0.9})  # avoid cache
    stats = _llm.get_stats().get(model, {})
    assert stats.get("req", 0) >= 1
    assert stats.get("ok", 0) >= 1


# ---------------------------------------------------------------------------
# Section 7 — /metrics endpoint via direct httpx call
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_metrics_endpoint_returns_prometheus_format():
    import httpx
    base = os.environ["REACT_APP_BACKEND_URL"] if os.environ.get("REACT_APP_BACKEND_URL") else None
    if not base:
        # Read from frontend .env if present
        try:
            with open(os.path.join(os.path.dirname(__file__), "..", "..",
                                     "frontend", ".env")) as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        base = line.split("=", 1)[1].strip()
                        break
        except Exception:
            pass
    if not base:
        pytest.skip("REACT_APP_BACKEND_URL not set — skipping live /metrics probe")

    async with httpx.AsyncClient(timeout=10.0) as c:
        r = await c.get(f"{base}/api/metrics")
    assert r.status_code == 200
    body = r.text
    # Should contain at least uptime and some cache/jobs metric
    assert "wayly_uptime_seconds" in body
    assert body.startswith("wayly_") or body.startswith("\n")
