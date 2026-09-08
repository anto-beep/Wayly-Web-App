"""Phase 5 — Performance monitoring tests.

Covers:
  • The new `phase` and `participant_id` fields land in `llm_calls` rows.
  • The cost rollup aggregation pipeline returns the contract shape.
  • `DECODER_COST_RUNAWAY` alert fires when summed cost exceeds the limit.
"""
from __future__ import annotations
import os
import pytest
import pytest_asyncio
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

import security_alerter as al
from llm_costs import record_llm_call

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def db():
    """Isolated test DB so we don't pollute prod data."""
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    test_db = client[os.environ["DB_NAME"] + "_test_phase5"]
    await test_db.llm_calls.delete_many({})
    await test_db.security_event_counters.delete_many({})
    await test_db.security_alerts.delete_many({})
    yield test_db
    await test_db.llm_calls.delete_many({})
    await test_db.security_event_counters.delete_many({})
    await test_db.security_alerts.delete_many({})
    client.close()


async def test_record_llm_call_persists_new_fields(db):
    """Verify `participant_id` and `phase` reach the persisted row."""
    # Point the llm_costs module at our isolated test DB.
    import llm_costs as lc
    orig_db = lc.db
    lc.db = db
    try:
        await record_llm_call(
            tool="chunk:extract-header",
            model="claude-haiku-4-5-20251001",
            user_id="user-123",
            household_id="h-1",
            participant_id="p-1",
            phase="extract_header",
            input_text="hello world " * 100,
            output_text='{"ok":1}',
            duration_ms=512,
            success=True,
        )
        rows = await db.llm_calls.find({}).to_list(length=10)
        assert len(rows) == 1
        r = rows[0]
        assert r["user_id"] == "user-123"
        assert r["household_id"] == "h-1"
        assert r["participant_id"] == "p-1"
        assert r["phase"] == "extract_header"
        assert r["tool"] == "chunk:extract-header"
        assert r["cost_aud_est"] > 0
        assert r["duration_ms"] == 512
        assert r["success"] is True
    finally:
        lc.db = orig_db


async def test_decoder_cost_runaway_fires(db):
    """If a single user's hourly cost > $20, the HIGH alert fires."""
    # Seed 25 rows × ~$1 each via direct insert for speed.
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "ts": now_iso, "tool": "chunk:extract-clinical",
            "model": "claude-haiku-4-5-20251001",
            "user_id": "expensive-user", "household_id": "h-1",
            "participant_id": "p-1", "phase": "extract_clinical",
            "input_chars": 50000, "output_chars": 2000,
            "input_tokens_est": 12500, "output_tokens_est": 500,
            "cost_aud_est": 1.0, "duration_ms": 1500,
            "success": True, "error": None,
        }
        for _ in range(25)
    ]
    await db.llm_calls.insert_many(docs)

    # Sanity check: aggregate returns ~25 AUD
    agg = await db.llm_calls.aggregate([
        {"$match": {"user_id": "expensive-user"}},
        {"$group": {"_id": None, "total": {"$sum": "$cost_aud_est"}}},
    ]).to_list(length=1)
    assert agg[0]["total"] == pytest.approx(25.0, rel=0.001)

    await al.check_decoder_cost(db, user_id="expensive-user")
    alerts = await al.list_alerts(db, limit=10)
    runaway = [a for a in alerts if a["rule"] == "DECODER_COST_RUNAWAY"]
    assert len(runaway) == 1
    assert runaway[0]["severity"] == "HIGH"
    assert runaway[0]["subject"] == "expensive-user"


async def test_decoder_cost_runaway_does_not_fire_below_threshold(db):
    """Under $20, no alert."""
    now_iso = datetime.now(timezone.utc).isoformat()
    docs = [
        {
            "ts": now_iso, "tool": "audit", "model": "claude-haiku-4-5",
            "user_id": "cheap-user", "household_id": "h-1",
            "participant_id": None, "phase": "audit",
            "input_chars": 0, "output_chars": 0,
            "input_tokens_est": 0, "output_tokens_est": 0,
            "cost_aud_est": 0.5, "duration_ms": 100, "success": True, "error": None,
        }
        for _ in range(10)
    ]
    await db.llm_calls.insert_many(docs)
    await al.check_decoder_cost(db, user_id="cheap-user")
    alerts = await al.list_alerts(db, limit=10)
    runaway = [a for a in alerts if a["rule"] == "DECODER_COST_RUNAWAY"]
    assert len(runaway) == 0


async def test_decoder_cost_runaway_window_excludes_old_rows(db):
    """Rows older than 60min must not count."""
    old_iso = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    docs = [
        {
            "ts": old_iso, "tool": "chunk:extract-clinical",
            "model": "claude-haiku-4-5", "user_id": "stale-user",
            "household_id": "h-1", "participant_id": None,
            "phase": "extract_clinical",
            "input_chars": 0, "output_chars": 0,
            "input_tokens_est": 0, "output_tokens_est": 0,
            "cost_aud_est": 5.0, "duration_ms": 100, "success": True, "error": None,
        }
        for _ in range(10)
    ]
    await db.llm_calls.insert_many(docs)
    await al.check_decoder_cost(db, user_id="stale-user")
    alerts = await al.list_alerts(db, limit=10)
    assert all(a["rule"] != "DECODER_COST_RUNAWAY" for a in alerts)


async def test_rule_thresholds_includes_decoder_cost(db):
    """The rule must show up in RULE_THRESHOLDS so the admin UI can display it."""
    assert "DECODER_COST_RUNAWAY" in al.RULE_THRESHOLDS
    rule = al.RULE_THRESHOLDS["DECODER_COST_RUNAWAY"]
    assert rule["severity"] == "HIGH"
    assert rule["limit_aud"] == 20.0
    assert rule["window_s"] == 3600
