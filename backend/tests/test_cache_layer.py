"""Section 3 (Caching Layer) — regression tests.

Covers:
1. Cache primitives (get/set/delete/cache_aside) hit Redis and round-trip values.
2. `cache_aside` calls the fetch fn ONCE on miss, then serves from cache.
3. Invalidation helpers (`invalidate_household`, `invalidate_pattern`) drop
   only the matching keys.
4. LLM cache rejects non-deterministic params (temperature > 0, stream=True).
5. Hit/miss counters increment correctly.

Each test uses a unique key namespace so they can run in parallel against
the same Redis without colliding.
"""
from __future__ import annotations
import os
import asyncio
import pytest
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from lib import cache  # noqa: E402
from lib import llm_cache  # noqa: E402


@pytest.mark.asyncio
async def test_set_get_roundtrip():
    ns = "test_roundtrip"
    key = cache.key_for(ns, "hello")
    ok = await cache.set_(ns, key, {"a": 1, "b": "two"}, ttl_seconds=30)
    assert ok, "set returned False — is Redis up?"
    got = await cache.get(ns, key)
    assert got == {"a": 1, "b": "two"}
    await cache.delete(key)


@pytest.mark.asyncio
async def test_get_miss_returns_none():
    ns = "test_miss"
    key = cache.key_for(ns, "absent-key")
    await cache.delete(key)  # ensure not present
    assert await cache.get(ns, key) is None


@pytest.mark.asyncio
async def test_cache_aside_fetches_once_then_serves_cached():
    ns = "test_aside"
    key = cache.key_for(ns, "single-fetch")
    await cache.delete(key)
    call_count = 0

    async def fetch():
        nonlocal call_count
        call_count += 1
        return {"hits": call_count}

    a = await cache.cache_aside(ns, key, ttl_seconds=30, fetch=fetch)
    b = await cache.cache_aside(ns, key, ttl_seconds=30, fetch=fetch)
    c = await cache.cache_aside(ns, key, ttl_seconds=30, fetch=fetch)
    assert a == b == c == {"hits": 1}
    assert call_count == 1
    await cache.delete(key)


@pytest.mark.asyncio
async def test_cache_aside_skips_caching_empty_results():
    """Empty list / empty dict shouldn't get cached — the consumer may
    want to retry on those (eventual consistency)."""
    ns = "test_empty"
    key = cache.key_for(ns, "empty")
    await cache.delete(key)
    calls = 0

    async def fetch_empty():
        nonlocal calls
        calls += 1
        return []

    a = await cache.cache_aside(ns, key, 30, fetch_empty)
    b = await cache.cache_aside(ns, key, 30, fetch_empty)
    assert a == b == []
    assert calls == 2, "empty result should not be cached"


@pytest.mark.asyncio
async def test_invalidate_household_pattern():
    hid = "test-hh-001"
    k1 = cache.key_for("hh", hid, "usage", "x@y.com")
    k2 = cache.key_for("hh", hid, "burn", "Q1")
    k3 = cache.key_for("hh", "other-household", "usage", "z@y.com")
    await cache.set_("hh", k1, {"v": 1}, 60)
    await cache.set_("hh", k2, {"v": 2}, 60)
    await cache.set_("hh", k3, {"v": 3}, 60)

    n = await cache.invalidate_household(hid)
    assert n >= 2, f"expected ≥ 2 deleted, got {n}"
    assert await cache.get("hh", k1) is None
    assert await cache.get("hh", k2) is None
    # Untouched key for a different household survives
    assert await cache.get("hh", k3) == {"v": 3}
    await cache.delete(k3)


def test_llm_cache_skips_nondeterministic():
    assert llm_cache.is_deterministic({}) is True
    assert llm_cache.is_deterministic({"temperature": 0}) is True
    assert llm_cache.is_deterministic({"temperature": 0.7}) is False
    assert llm_cache.is_deterministic({"stream": True}) is False
    assert llm_cache.is_deterministic({"top_p": 0.9}) is False
    assert llm_cache.is_deterministic({"n": 3}) is False


@pytest.mark.asyncio
async def test_llm_cache_returns_none_for_nondeterministic():
    """Even if we'd previously cached the response somehow, asking with
    temperature>0 must not return cached bytes — caller relies on this."""
    got = await llm_cache.get_cached(
        "claude-haiku", "hello", system="s",
        params={"temperature": 0.9},
    )
    assert got is None


@pytest.mark.asyncio
async def test_llm_cache_put_and_get_for_deterministic():
    model = "claude-test"
    prompt = "what's 2+2"
    params = {"temperature": 0}
    # Ensure clean
    key = llm_cache.cache_key(model, prompt, "", params)
    await cache.delete(key)
    assert await llm_cache.get_cached(model, prompt, "", params) is None
    assert await llm_cache.put(model, prompt, {"text": "4"}, "", params, ttl_seconds=10)
    assert await llm_cache.get_cached(model, prompt, "", params) == {"text": "4"}
    await cache.delete(key)


@pytest.mark.asyncio
async def test_stats_hit_miss_counters_increment():
    ns = "test_stats"
    key = cache.key_for(ns, "counter-key")
    await cache.delete(key)
    before = cache.get_stats().get(ns, {"hit": 0, "miss": 0, "set": 0, "err": 0}).copy()
    # MISS
    await cache.get(ns, key)
    # SET + HIT
    await cache.set_(ns, key, {"x": 1}, 30)
    await cache.get(ns, key)
    after = cache.get_stats().get(ns, {})
    assert after.get("miss", 0) >= before.get("miss", 0) + 1
    assert after.get("set", 0) >= before.get("set", 0) + 1
    assert after.get("hit", 0) >= before.get("hit", 0) + 1
    await cache.delete(key)
