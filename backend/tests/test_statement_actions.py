"""Statement lifecycle Phase 2 — archive / restore / hard-delete +
retention sweep + storage cross-check. Unit tests over a real MongoDB
test database (per-test isolation)."""
from __future__ import annotations
import base64
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from fastapi import HTTPException  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

from lib.statement_actions import (  # noqa: E402
    archive_statement, restore_statement, hard_delete_statement,
    compute_archive_impact, run_retention_sweep, run_storage_crosscheck,
    RETENTION_DAYS,
)
from lib.statement_lifecycle import (  # noqa: E402
    STATE_ACTIVE, STATE_SUPERSEDED, STATE_ARCHIVED, STATE_DELETED,
)


@pytest_asyncio.fixture
async def db():
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        pytest.skip("MONGO_URL not configured")
    client = AsyncIOMotorClient(mongo_url)
    name = f"wayly_test_actions_{uuid.uuid4().hex[:8]}"
    yield client[name]
    await client.drop_database(name)
    client.close()


def _make_stmt(*, state: str = STATE_ACTIVE, household_id: str = "hh-1",
               participant_id: str | None = "p-1", period_label: str | None = "Q1 2026",
               archived_days_ago: int | None = None,
               with_payload: bool = True, size_bytes: int = 100) -> dict:
    """Build a minimal statement document matching the production shape."""
    sid = f"stmt-{uuid.uuid4().hex[:8]}"
    doc: dict = {
        "id": sid,
        "household_id": household_id,
        "participant_id": participant_id,
        "filename": "test.pdf",
        "period_label": period_label,
        "state": state,
        "file_sha256": uuid.uuid4().hex,
        "extracted_fingerprint": uuid.uuid4().hex,
        "row_version": 1,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "line_items": [{"date": "2026-01-05", "service_code": "DOM-1", "units": 2, "unit_price": 60.0, "total": 120.0}],
        "anomalies": [],
        "file_size_bytes": size_bytes,
    }
    if with_payload:
        doc["file_b64"] = base64.b64encode(b"X" * size_bytes).decode("ascii")
    if archived_days_ago is not None:
        doc["archived_at"] = (datetime.now(timezone.utc) - timedelta(days=archived_days_ago)).isoformat()
    return doc


# -------------------- archive --------------------
@pytest.mark.asyncio
async def test_archive_active_writes_audit_and_invalidates_cache(db):
    s = _make_stmt(state=STATE_ACTIVE)
    await db.statements.insert_one(s)
    out = await archive_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="user-1")
    assert out["state"] == STATE_ARCHIVED and out["archived_at"]
    stored = await db.statements.find_one({"id": s["id"]}, {"_id": 0})
    assert stored["state"] == STATE_ARCHIVED
    assert stored["row_version"] == 2  # optimistic concurrency bump
    events = await db.statement_audit_log.find({"statement_id": s["id"]}, {"_id": 0}).sort("event_at", 1).to_list(10)
    assert [e["event_type"] for e in events] == ["archived", "deleted_soft"]


@pytest.mark.asyncio
async def test_archive_superseded_is_allowed(db):
    s = _make_stmt(state=STATE_SUPERSEDED)
    await db.statements.insert_one(s)
    out = await archive_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    assert out["state"] == STATE_ARCHIVED


@pytest.mark.asyncio
async def test_archive_already_archived_returns_409(db):
    s = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=1)
    await db.statements.insert_one(s)
    with pytest.raises(HTTPException) as exc:
        await archive_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_archive_unknown_statement_returns_404(db):
    with pytest.raises(HTTPException) as exc:
        await archive_statement(db, statement_id="missing", household_id="hh-1", user_id="u")
    assert exc.value.status_code == 404


# -------------------- restore --------------------
@pytest.mark.asyncio
async def test_restore_within_window(db):
    s = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=5)
    await db.statements.insert_one(s)
    out = await restore_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    assert out["state"] == STATE_ACTIVE
    assert out["archived_at"] is None


@pytest.mark.asyncio
async def test_restore_after_window_returns_410(db):
    s = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=RETENTION_DAYS + 1)
    await db.statements.insert_one(s)
    with pytest.raises(HTTPException) as exc:
        await restore_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    assert exc.value.status_code == 410


@pytest.mark.asyncio
async def test_restore_blocked_when_other_active_exists(db):
    other_active = _make_stmt(state=STATE_ACTIVE)
    archived = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=2)
    archived["period_label"] = other_active["period_label"]
    archived["participant_id"] = other_active["participant_id"]
    archived["household_id"] = other_active["household_id"]
    await db.statements.insert_many([other_active, archived])
    with pytest.raises(HTTPException) as exc:
        await restore_statement(db, statement_id=archived["id"], household_id=archived["household_id"], user_id="u")
    assert exc.value.status_code == 409
    assert exc.value.detail["error"] == "ACTIVE_VERSION_EXISTS"
    assert exc.value.detail["blocking_version_id"] == other_active["id"]


# -------------------- hard delete --------------------
@pytest.mark.asyncio
async def test_hard_delete_blocked_before_retention_window(db):
    s = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=1)
    await db.statements.insert_one(s)
    with pytest.raises(HTTPException) as exc:
        await hard_delete_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    assert exc.value.status_code == 409


@pytest.mark.asyncio
async def test_hard_delete_after_retention_window(db):
    s = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=RETENTION_DAYS + 1)
    await db.statements.insert_one(s)
    res = await hard_delete_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    assert res["state"] == STATE_DELETED
    stored = await db.statements.find_one({"id": s["id"]}, {"_id": 0})
    assert stored["state"] == STATE_DELETED
    # PII fields are gone
    assert "file_b64" not in stored
    assert "raw_text_preview" not in stored
    assert "filename" not in stored
    assert stored["file_sha256"] is None
    # Audit log row was written
    evt = await db.statement_audit_log.find_one({"statement_id": s["id"], "event_type": "deleted_hard"})
    assert evt is not None and evt["actor_kind"] == "user"


@pytest.mark.asyncio
async def test_hard_delete_force_bypasses_window(db):
    s = _make_stmt(state=STATE_ACTIVE)
    await db.statements.insert_one(s)
    res = await hard_delete_statement(
        db, statement_id=s["id"], household_id=s["household_id"],
        user_id=None, actor_kind="retention_job", force=True,
    )
    assert res["state"] == STATE_DELETED


@pytest.mark.asyncio
async def test_hard_delete_double_call_returns_410(db):
    s = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=RETENTION_DAYS + 1)
    await db.statements.insert_one(s)
    await hard_delete_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    with pytest.raises(HTTPException) as exc:
        await hard_delete_statement(db, statement_id=s["id"], household_id=s["household_id"], user_id="u")
    assert exc.value.status_code == 410


# -------------------- archive impact preview --------------------
@pytest.mark.asyncio
async def test_archive_impact_no_prior_version_flags_gap(db):
    s = _make_stmt(state=STATE_ACTIVE)
    await db.statements.insert_one(s)
    impact = await compute_archive_impact(db, statement_id=s["id"], household_id=s["household_id"])
    assert impact["is_active"] is True
    assert impact["has_superseded_versions"] is False
    assert impact["leaves_period_gap"] is True
    assert impact["statement_total_aud"] == 120.0


@pytest.mark.asyncio
async def test_archive_impact_with_prior_superseded(db):
    active = _make_stmt(state=STATE_ACTIVE)
    prior = _make_stmt(state=STATE_SUPERSEDED)
    prior["household_id"] = active["household_id"]
    prior["participant_id"] = active["participant_id"]
    prior["period_label"] = active["period_label"]
    await db.statements.insert_many([active, prior])
    impact = await compute_archive_impact(db, statement_id=active["id"], household_id=active["household_id"])
    assert impact["has_superseded_versions"] is True
    assert impact["leaves_period_gap"] is False


# -------------------- retention sweep --------------------
@pytest.mark.asyncio
async def test_retention_sweep_only_deletes_expired_archived(db):
    keep = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=10)
    expire = _make_stmt(state=STATE_ARCHIVED, archived_days_ago=RETENTION_DAYS + 2)
    active = _make_stmt(state=STATE_ACTIVE)
    await db.statements.insert_many([keep, expire, active])
    summary = await run_retention_sweep(db)
    assert summary["deleted"] == 1
    assert summary["errors"] == 0
    assert "storage_crosscheck" in summary
    # The expired one is now state=deleted
    assert (await db.statements.find_one({"id": expire["id"]}, {"_id": 0}))["state"] == STATE_DELETED
    # The fresh archived one is untouched
    assert (await db.statements.find_one({"id": keep["id"]}, {"_id": 0}))["state"] == STATE_ARCHIVED


# -------------------- storage cross-check --------------------
@pytest.mark.asyncio
async def test_storage_crosscheck_flags_missing_payload_when_size_set(db):
    s = _make_stmt(state=STATE_ACTIVE, with_payload=False, size_bytes=2000)
    await db.statements.insert_one(s)
    res = await run_storage_crosscheck(db)
    assert res["scanned"] == 1 and res["drift_count"] == 1
    assert res["drift_examples"][0]["problem"] == "file_b64_missing_but_size_nonzero"


@pytest.mark.asyncio
async def test_storage_crosscheck_ignores_deleted_rows(db):
    s = _make_stmt(state=STATE_DELETED, with_payload=False, size_bytes=2000)
    await db.statements.insert_one(s)
    res = await run_storage_crosscheck(db)
    assert res["drift_count"] == 0


@pytest.mark.asyncio
async def test_storage_crosscheck_passes_on_valid_payload(db):
    s = _make_stmt(state=STATE_ACTIVE, with_payload=True, size_bytes=500)
    await db.statements.insert_one(s)
    res = await run_storage_crosscheck(db)
    assert res["scanned"] == 1 and res["drift_count"] == 0


@pytest.mark.asyncio
async def test_storage_crosscheck_flags_corrupt_base64(db):
    s = _make_stmt(state=STATE_ACTIVE, with_payload=False, size_bytes=200)
    s["file_b64"] = "@@@not_base64@@@"
    await db.statements.insert_one(s)
    res = await run_storage_crosscheck(db)
    # base64 with validate=False is permissive — only flag if decoded length is small
    assert res["drift_count"] == 1
    assert res["drift_examples"][0]["problem"].startswith("file_b64") or res["drift_examples"][0]["problem"] == "file_b64_decodes_smaller_than_recorded_size"
