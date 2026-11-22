"""Phase 6 scenario engine tests — statement→event mapping, budget projection
clock, and guided workflow catalogue.

These run live against the supervisor-managed backend and a temporary MongoDB
participant + statement. They do NOT touch the heavyweight statement
decoder; we synthesise the anomaly payload directly and exercise the
event-emission helper.
"""
import asyncio
import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
import pytest_asyncio

from motor.motor_asyncio import AsyncIOMotorClient

BASE = os.environ.get("BACKEND_BASE_URL", "http://localhost:8001")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def db():
    client = AsyncIOMotorClient(MONGO_URL)
    database = client[DB_NAME]
    # Bootstrap program reference cache so budget helpers work without
    # depending on the supervisor-managed startup hook.
    from program_reference import init as _pref_init, preload_cache as _pref_preload
    _pref_init(database)
    try:
        await _pref_preload()
    except Exception:
        pass
    yield database
    client.close()


async def _get_token() -> str | None:
    """Login once and cache — avoids brute-force lockout when running the
    full Phase 6+8 suite back-to-back."""
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.post(
            f"{BASE}/api/auth/login",
            json={"email": "cathy@example.com", "password": "testpass123"},
        )
    if r.status_code != 200:
        return None
    return r.json().get("token")


_TOKEN_CACHE: dict = {}


async def _get_token_cached() -> str | None:
    if "t" in _TOKEN_CACHE:
        return _TOKEN_CACHE["t"]
    t = await _get_token()
    _TOKEN_CACHE["t"] = t
    return t



# -------------------------------------------------------------------------
# Workflows catalogue
# -------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_workflows_catalogue_lists_three_workflows():
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{BASE}/api/scenario/workflows")
    assert r.status_code == 200
    body = r.json()
    keys = {w["key"] for w in body["workflows"]}
    assert {"reassessment", "hospitalisation", "death"} <= keys


@pytest.mark.asyncio
async def test_workflow_detail_includes_steps_with_event_types():
    token = await _get_token_cached()
    if not token:
        pytest.skip("auth lockout or smoke account not seeded")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{BASE}/api/scenario/workflows/reassessment",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    w = r.json()
    assert w["key"] == "reassessment"
    assert len(w["steps"]) >= 3
    # Step 1 should map to reassessment_requested event.
    assert w["steps"][0]["event_type"] == "reassessment_requested"
    # Final outcome step should be reassessment_completed.
    assert any(s["event_type"] == "reassessment_completed" for s in w["steps"])


@pytest.mark.asyncio
async def test_workflow_death_returns_route_out_contacts():
    token = await _get_token_cached()
    if not token:
        pytest.skip("auth lockout or smoke account not seeded")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{BASE}/api/scenario/workflows/death",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200
    w = r.json()
    assert w["advice_boundary"] == "ESCALATE"
    # ESCALATE workflows must surface resolved contact contacts.
    assert len(w.get("route_out_contacts_resolved") or []) >= 1


@pytest.mark.asyncio
async def test_unknown_workflow_returns_404():
    token = await _get_token_cached()
    if not token:
        pytest.skip("auth lockout or smoke account not seeded")
    async with httpx.AsyncClient(timeout=10) as c:
        r = await c.get(f"{BASE}/api/scenario/workflows/not-a-workflow",
                         headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 404


# -------------------------------------------------------------------------
# Statement-decoder anomaly → event mapping
# -------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_anomaly_to_event_mapping_emits_typed_events(db):
    from scenario_engine.events import capture_event, EVENT_TYPES

    participant_id = f"test-pid-{uuid.uuid4()}"
    account_id = f"test-acct-{uuid.uuid4()}"
    await db.participants.insert_one({
        "id": participant_id, "account_id": account_id,
        "first_name": "Test", "last_name": "Participant",
        "lifecycle_state": "ACTIVE", "flags": {}, "status": "ACTIVE",
        "classification": 4, "primary_user_id": "test-uid",
    })
    try:
        # Simulate the anomaly→event mapping that the upload pipeline performs.
        anomaly_to_event = {
            "RULE_1_CARE_MGMT_CAP": "care_management_over_cap",
            "RULE_9_WRONG_STREAM": "wrong_stream_billing",
            "RULE_9_PENSION_STATUS_UNKNOWN": "means_not_disclosed",
            "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS": "backdated_adjustment",
            "RULE_12_AT_HM_ACTIVE": "at_hm_expiring",
            "RULE_13_QUARTERLY_UNDERSPEND": "quarter_end_underspend_risk",
        }
        for rk, et in anomaly_to_event.items():
            assert et in EVENT_TYPES, f"event type {et!r} missing from taxonomy"
            await capture_event(
                db, participant_id=participant_id, account_id=account_id,
                event_type=et, trigger_source="statement",
                effective_date="2026-02-01",
                note=f"From regression test ({rk})",
                payload={"rule_key": rk},
                source={"kind": "statement_anomaly", "rule_key": rk},
                actor_id="test-uid", actor_name="Test User",
            )

        rows = [d async for d in db.participant_events.find({"participant_id": participant_id})]
        emitted_types = {r["event_type"] for r in rows}
        assert emitted_types == set(anomaly_to_event.values())
    finally:
        await db.participants.delete_one({"id": participant_id})
        await db.participant_events.delete_many({"participant_id": participant_id})
        await db.scenario_alerts.delete_many({"participant_id": participant_id})
        await db.participant_state_audit.delete_many({"participant_id": participant_id})


# -------------------------------------------------------------------------
# Budget exhaustion projection clock
# -------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_budget_exhaustion_projected_clock_fires_when_overspending(db):
    from scenario_engine.alerts import _clock_budget_exhaustion_projected
    from budget import get_quarter_window

    today = datetime.now(timezone.utc).date()
    q_start, q_end, _ = get_quarter_window(today)
    days_into = (today - q_start).days + 1
    if days_into < 14:
        pytest.skip("too early in the quarter to project budget exhaustion")

    participant_id = f"test-pid-{uuid.uuid4()}"
    await db.participants.insert_one({
        "id": participant_id, "account_id": None,
        "first_name": "Burny", "last_name": "Tester",
        "lifecycle_state": "ACTIVE", "flags": {}, "status": "ACTIVE",
        "classification": 1, "primary_user_id": "test-uid",
    })
    # Class 1 quarterly budget ~= 2682.75. Pump in $5000 spent over the
    # quarter so projection definitely exceeds 110%.
    line_items = [{
        "date": q_start.isoformat(),
        "stream": "Clinical care",
        "total": 5000,
        "contribution_paid": 0,
    }]
    await db.statements.insert_one({
        "id": f"stmt-{uuid.uuid4()}",
        "participant_id": participant_id,
        "household_id": "test-h", "filename": "test.pdf",
        "line_items": line_items, "anomalies": [], "summary": "",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        p = await db.participants.find_one({"id": participant_id})
        result = await _clock_budget_exhaustion_projected(db, p)
        assert len(result) == 1
        alert = result[0]
        assert alert["alert_type"] == "budget_exhaustion_projected"
        assert "exhaust" in alert["title"].lower() or "exceed" in alert["body"].lower()
    finally:
        await db.participants.delete_one({"id": participant_id})
        await db.statements.delete_many({"participant_id": participant_id})


@pytest.mark.asyncio
async def test_budget_exhaustion_does_not_fire_on_low_burn(db):
    from scenario_engine.alerts import _clock_budget_exhaustion_projected
    from budget import get_quarter_window

    today = datetime.now(timezone.utc).date()
    q_start, q_end, _ = get_quarter_window(today)
    days_into = (today - q_start).days + 1
    if days_into < 14:
        pytest.skip("too early in the quarter")

    participant_id = f"test-pid-{uuid.uuid4()}"
    await db.participants.insert_one({
        "id": participant_id, "account_id": None,
        "first_name": "Lo", "last_name": "Burn",
        "lifecycle_state": "ACTIVE", "flags": {}, "status": "ACTIVE",
        "classification": 4, "primary_user_id": "test-uid",
    })
    # Tiny $50 spend — projection will be well under budget.
    line_items = [{
        "date": q_start.isoformat(), "stream": "Clinical care",
        "total": 50, "contribution_paid": 0,
    }]
    await db.statements.insert_one({
        "id": f"stmt-{uuid.uuid4()}",
        "participant_id": participant_id,
        "household_id": "test-h", "filename": "test.pdf",
        "line_items": line_items, "anomalies": [], "summary": "",
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    })
    try:
        p = await db.participants.find_one({"id": participant_id})
        result = await _clock_budget_exhaustion_projected(db, p)
        assert result == []
    finally:
        await db.participants.delete_one({"id": participant_id})
        await db.statements.delete_many({"participant_id": participant_id})
