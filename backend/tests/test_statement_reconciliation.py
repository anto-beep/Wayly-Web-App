"""Statement reconciliation — Phase 4 unit tests."""
from __future__ import annotations
import os
import uuid
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from lib.statement_reconciliation import (  # noqa: E402
    reconcile_participant_ytd, run_nightly_reconciliation,
    DRIFT_THRESHOLD_AUD, CALCULATION_KIND_YTD,
)


@pytest_asyncio.fixture
async def db():
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        pytest.skip("MONGO_URL not configured")
    client = AsyncIOMotorClient(mongo_url)
    name = f"wayly_test_recon_{uuid.uuid4().hex[:8]}"
    yield client[name]
    await client.drop_database(name)
    client.close()


def _year_bounds():
    y = datetime.now(timezone.utc).year
    return y, datetime(y, 1, 1, tzinfo=timezone.utc).isoformat(), datetime(y, 12, 31, 23, 59, 59, tzinfo=timezone.utc).isoformat()


@pytest.mark.asyncio
async def test_reconcile_sums_active_statements_only(db):
    y, ps, pe = _year_bounds()
    await db.statements.insert_many([
        {"id": "s1", "household_id": "hh", "participant_id": "p1", "state": "active",
         "uploaded_at": datetime(y, 3, 1, tzinfo=timezone.utc).isoformat(),
         "line_items": [{"total": 100.0}, {"total": 200.0}]},
        {"id": "s2", "household_id": "hh", "participant_id": "p1", "state": "archived",
         "uploaded_at": datetime(y, 4, 1, tzinfo=timezone.utc).isoformat(),
         "line_items": [{"total": 999.0}]},
        {"id": "s3", "household_id": "hh", "participant_id": "p1", "state": "active",
         "uploaded_at": datetime(y, 5, 1, tzinfo=timezone.utc).isoformat(),
         "line_items": [{"total": 50.5}]},
    ])
    run = await reconcile_participant_ytd(db, household_id="hh", participant_id="p1", year=y, period_start=ps, period_end=pe)
    assert run["value_aud"] == 350.5  # 100 + 200 + 50.5; archived ignored
    assert sorted(run["contributing_version_ids"]) == ["s1", "s3"]
    assert run["calculation_kind"] == CALCULATION_KIND_YTD
    assert run["drift_aud"] is None  # first run, no prior


@pytest.mark.asyncio
async def test_reconcile_detects_drift(db):
    y, ps, pe = _year_bounds()
    # First run: $100
    await db.statements.insert_one({
        "id": "s1", "household_id": "hh", "participant_id": "p1", "state": "active",
        "uploaded_at": datetime(y, 6, 1, tzinfo=timezone.utc).isoformat(),
        "line_items": [{"total": 100.0}],
    })
    await reconcile_participant_ytd(db, household_id="hh", participant_id="p1", year=y, period_start=ps, period_end=pe)
    # Add a second statement → $250 total
    await db.statements.insert_one({
        "id": "s2", "household_id": "hh", "participant_id": "p1", "state": "active",
        "uploaded_at": datetime(y, 7, 1, tzinfo=timezone.utc).isoformat(),
        "line_items": [{"total": 150.0}],
    })
    run2 = await reconcile_participant_ytd(db, household_id="hh", participant_id="p1", year=y, period_start=ps, period_end=pe)
    assert run2["value_aud"] == 250.0
    assert run2["prior_value_aud"] == 100.0
    assert run2["drift_aud"] == 150.0


@pytest.mark.asyncio
async def test_idempotent_when_no_changes(db):
    y, ps, pe = _year_bounds()
    await db.statements.insert_one({
        "id": "s1", "household_id": "hh", "participant_id": "p1", "state": "active",
        "uploaded_at": datetime(y, 6, 1, tzinfo=timezone.utc).isoformat(),
        "line_items": [{"total": 42.0}],
    })
    a = await reconcile_participant_ytd(db, household_id="hh", participant_id="p1", year=y, period_start=ps, period_end=pe)
    b = await reconcile_participant_ytd(db, household_id="hh", participant_id="p1", year=y, period_start=ps, period_end=pe)
    assert a["value_aud"] == b["value_aud"] == 42.0
    # Second run sees the first as prior, drift = 0
    assert b["prior_value_aud"] == 42.0 and b["drift_aud"] == 0.0


@pytest.mark.asyncio
async def test_run_nightly_reconciliation_aggregates_all_pairs(db):
    y, ps, pe = _year_bounds()
    await db.statements.insert_many([
        {"id": "a1", "household_id": "hh1", "participant_id": "p1", "state": "active",
         "uploaded_at": datetime(y, 3, 1, tzinfo=timezone.utc).isoformat(),
         "line_items": [{"total": 10.0}]},
        {"id": "a2", "household_id": "hh1", "participant_id": "p2", "state": "active",
         "uploaded_at": datetime(y, 4, 1, tzinfo=timezone.utc).isoformat(),
         "line_items": [{"total": 20.0}]},
        {"id": "b1", "household_id": "hh2", "participant_id": "p3", "state": "active",
         "uploaded_at": datetime(y, 5, 1, tzinfo=timezone.utc).isoformat(),
         "line_items": [{"total": 30.0}]},
    ])
    summary = await run_nightly_reconciliation(db)
    assert summary["households_scanned"] == 3  # 3 distinct (hh, pid) tuples
    assert summary["runs_persisted"] == 3
    assert summary["drift_alerts"] == 0  # no priors → no drift
    snaps = await db.derived_calculation_runs.count_documents({"year": y})
    assert snaps == 3


@pytest.mark.asyncio
async def test_drift_threshold_respected(db):
    y, ps, pe = _year_bounds()
    await db.statements.insert_one({
        "id": "s1", "household_id": "hh", "participant_id": None, "state": "active",
        "uploaded_at": datetime(y, 6, 1, tzinfo=timezone.utc).isoformat(),
        "line_items": [{"total": 100.00}],
    })
    await reconcile_participant_ytd(db, household_id="hh", participant_id=None, year=y, period_start=ps, period_end=pe)
    # Tiny change ($0.10) — under the 50¢ drift threshold; recon should still
    # persist but not surface as a drift alert.
    await db.statements.update_one({"id": "s1"}, {"$set": {"line_items": [{"total": 100.10}]}})
    sweep = await run_nightly_reconciliation(db)
    assert sweep["drift_alerts"] == 0
    assert sweep["runs_persisted"] >= 1
