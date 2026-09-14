"""Shared pytest fixtures.

Module-level Redis/Motor clients bind to whichever event loop first
touches them. pytest-asyncio's default function-scoped loop closes after
each test and the next test ends up with a client bound to a closed loop
(observed as `RuntimeError: Event loop is closed` or silent NO-OP after
the first test flipped `_REDIS_DOWN`).

Fix: reset our cache singleton between tests so the next test rebuilds
the client on its own loop.
"""
from __future__ import annotations
import pytest


@pytest.fixture(autouse=True)
def _reset_cache_singletons():
    """Wipe module-level Redis client + DOWN flag between tests so each
    test gets a freshly-bound client on its own event loop."""
    try:
        from lib import cache as _cache
        _cache._redis = None
        _cache._redis_init_lock = None
        _cache._REDIS_DOWN = False
    except Exception:
        pass
    yield


# BUD-1 v1: preload program_reference cache from seed data for all tests
@pytest.fixture(scope="session", autouse=True)
def _preload_program_reference_cache():
    try:
        import program_reference as _pr
        import seed_program_reference as _seed
    except ImportError:
        yield
        return
    if not _pr._CACHE_READY:
        fresh: dict = {}
        for row in _seed.SEED_ROWS:
            key = row.get("key")
            eff_from = row.get("effective_from")
            if not key or eff_from is None or "value" not in row:
                continue
            fresh.setdefault(key, []).append((
                eff_from,
                row.get("effective_to"),
                row["value"],
                row.get("id", f"seed-{key}-{eff_from}"),
            ))
        for key in fresh:
            fresh[key].sort(key=lambda r: r[0])
        _pr._CACHE = fresh
        _pr._CACHE_READY = True
    yield

