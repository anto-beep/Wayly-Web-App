"""Regression: ensure the "1 July 2026 price caps" concept has been
fully purged after the Australian Government deferred them indefinitely
in May 2026.

These are static / import-time checks — they do NOT hit Mongo or the live
API. The companion integration test (run via the API) confirms the
``/api/public/price-check`` response shape end-to-end.
"""
from __future__ import annotations
import importlib
import sys
from pathlib import Path

import pytest

# Make ``backend/`` importable when running pytest from the repo root.
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


# ---------------------------------------------------------------------------
# PRICE_BENCHMARKS no longer carries a "cap" key
# ---------------------------------------------------------------------------
def test_price_benchmarks_have_no_cap_key():
    server = importlib.import_module("server")
    benchmarks = server.PRICE_BENCHMARKS
    assert benchmarks, "PRICE_BENCHMARKS should not be empty"
    for service, row in benchmarks.items():
        assert "median" in row, f"{service!r} missing median"
        assert "cap" not in row, (
            f"{service!r} still has a 'cap' key — caps were deferred "
            "indefinitely in May 2026 and must not appear in the benchmark"
        )


# ---------------------------------------------------------------------------
# Seed contains a closed price_caps_start row and a deferred status row
# ---------------------------------------------------------------------------
def test_seed_rows_reflect_deferral():
    seed_mod = importlib.import_module("seed_program_reference")
    rows = seed_mod.get_seed_rows()

    start_rows = [r for r in rows if r["key"] == "policy_date.price_caps_start"]
    status_rows = [r for r in rows if r["key"] == "policy.price_caps_status"]

    assert start_rows, "policy_date.price_caps_start seed row missing"
    for r in start_rows:
        # Every seed row for the original commencement date must now be closed.
        assert r.get("effective_to") == "2026-05-19", (
            "policy_date.price_caps_start must be closed at 2026-05-19 to "
            "reflect the May 2026 indefinite deferral"
        )

    assert status_rows, "policy.price_caps_status seed row missing"
    deferred = [r for r in status_rows if r["value"] == "deferred_indefinitely"]
    assert deferred, "Expected a price_caps_status row with value 'deferred_indefinitely'"


# ---------------------------------------------------------------------------
# Chat system prompt instructs Ask Wayly about the deferral
# ---------------------------------------------------------------------------
def test_chat_prompt_mentions_deferral():
    agents = importlib.import_module("agents")
    template = agents.CHAT_SYSTEM_TEMPLATE
    lowered = template.lower()
    assert "deferred" in lowered, "Chat prompt must explain caps are deferred"
    assert "acqsc" in lowered or "aged care quality" in lowered, (
        "Chat prompt must route pricing complaints to ACQSC"
    )
    # The old line that mentioned the live 1 Jul 2026 caps must be gone.
    assert "mention the 1 july 2026 government price caps" not in lowered


# ---------------------------------------------------------------------------
# public_snapshot exposes the policy_status block
# ---------------------------------------------------------------------------
def test_public_snapshot_exposes_caps_status(monkeypatch):
    pr = importlib.import_module("program_reference")

    # Stub the cache so public_snapshot() can resolve get_value() without DB.
    monkeypatch.setattr(pr, "_CACHE_READY", True, raising=False)
    sentinel = "deferred_indefinitely"
    monkeypatch.setattr(
        pr, "get_value",
        lambda key, *a, **kw: sentinel if key == "policy.price_caps_status" else kw.get("default"),
    )
    snap = pr.public_snapshot()
    assert "policy_status" in snap, "public_snapshot must include policy_status block"
    assert snap["policy_status"].get("price_caps") == sentinel


# ---------------------------------------------------------------------------
# Live price-check response shape includes caps_note (smoke-level type check)
# ---------------------------------------------------------------------------
@pytest.mark.parametrize("service,rate", [
    ("Personal care", 100.0),
    ("Domestic assistance — cleaning", 60.0),
])
def test_price_check_response_contract(service, rate):
    """The price-check endpoint always returns caps_note and never returns a
    'cap' field. Verified by calling the underlying handler directly."""
    import asyncio

    server = importlib.import_module("server")
    body = server.PublicPriceBody(service=service, rate=rate)

    # Bypass the paid-plan gate by stubbing it.
    async def _no_op(*a, **kw):
        return None
    server._require_paid_plan = _no_op  # type: ignore[attr-defined]

    class _FakeRequest:
        headers = {}
        cookies = {}
        client = type("c", (), {"host": "127.0.0.1"})()

    class _FakeResponse:
        def set_cookie(self, *a, **kw): ...

    result = asyncio.get_event_loop().run_until_complete(
        server.public_price_check(body, _FakeRequest(), _FakeResponse())
    )
    assert "caps_note" in result, "Price check response must include caps_note"
    assert "deferred" in result["caps_note"].lower()
    assert "cap" not in result, (
        "Top-level 'cap' field must not be present in the price-check response"
    )
    assert result["median"] > 0
    assert result["verdict"] in {"high", "low", "fair"}
