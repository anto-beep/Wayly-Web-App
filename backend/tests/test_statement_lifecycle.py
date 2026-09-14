"""Statement lifecycle — Phase 1 unit tests.

Covers:
1. file SHA-256 is deterministic and changes when bytes change.
2. semantic fingerprint is deterministic and order-insensitive on line items.
3. semantic fingerprint differs when any salient field changes (provider,
   period, line-item totals, grand total).
4. audit-log writes append rows with the right shape.
5. exact-dupe lookup matches on (household, sha) and excludes deleted versions.
6. logical lookup finds only the ACTIVE version for the same period.
7. idempotency helpers round-trip a stored response.
"""
from __future__ import annotations
import os
import uuid
import pytest
import pytest_asyncio
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from lib.statement_lifecycle import (  # noqa: E402
    compute_file_sha256, compute_extracted_fingerprint,
    find_exact_dupe_by_file_sha, find_active_for_period,
    write_audit, lookup_idempotency, store_idempotency,
    STATE_ACTIVE, STATE_SUPERSEDED, STATE_DELETED,
    EVT_UPLOADED, EVT_ACCEPTED_ACTIVE,
)


@pytest_asyncio.fixture
async def db():
    """Spin up a per-test database so each test is isolated."""
    mongo_url = os.environ.get("MONGO_URL")
    if not mongo_url:
        pytest.skip("MONGO_URL not configured")
    client = AsyncIOMotorClient(mongo_url)
    name = f"wayly_test_lifecycle_{uuid.uuid4().hex[:8]}"
    yield client[name]
    # tear down — drop the whole test db
    await client.drop_database(name)
    client.close()


# ---------------- hashing ----------------
def test_file_sha_is_deterministic():
    a = compute_file_sha256(b"hello world")
    b = compute_file_sha256(b"hello world")
    assert a == b
    assert len(a) == 64


def test_file_sha_changes_with_bytes():
    a = compute_file_sha256(b"hello world")
    b = compute_file_sha256(b"hello WORLD")
    assert a != b


# ---------------- semantic fingerprint ----------------
def _items(*tuples):
    return [
        {"date": d, "service_code": c, "units": u, "unit_price": p, "total": t}
        for (d, c, u, p, t) in tuples
    ]


def test_fingerprint_is_deterministic():
    extracted = {"provider_name": "Acme Care", "statement_period": "Q1 2026", "grand_total": 1234.56}
    items = _items(("2026-01-05", "DOM-1", 2, 60.0, 120.0), ("2026-01-12", "TRA-1", 1, 30.0, 30.0))
    a = compute_extracted_fingerprint(extracted, line_items=items)
    b = compute_extracted_fingerprint(extracted, line_items=list(reversed(items)))
    assert a == b, "line-item order must not affect the fingerprint"


def test_fingerprint_changes_when_provider_changes():
    items = _items(("2026-01-05", "DOM-1", 2, 60.0, 120.0))
    a = compute_extracted_fingerprint({"provider_name": "Acme", "statement_period": "Q1 2026"}, line_items=items)
    b = compute_extracted_fingerprint({"provider_name": "Other", "statement_period": "Q1 2026"}, line_items=items)
    assert a != b


def test_fingerprint_changes_when_total_changes():
    base = {"provider_name": "Acme", "statement_period": "Q1 2026", "grand_total": 100}
    items = _items(("2026-01-05", "DOM-1", 2, 60.0, 120.0))
    a = compute_extracted_fingerprint(base, line_items=items)
    b = compute_extracted_fingerprint({**base, "grand_total": 999}, line_items=items)
    assert a != b


def test_fingerprint_is_case_insensitive_on_provider():
    items = _items(("2026-01-05", "DOM-1", 2, 60.0, 120.0))
    a = compute_extracted_fingerprint({"provider_name": "Acme Care", "statement_period": "Q1 2026"}, line_items=items)
    b = compute_extracted_fingerprint({"provider_name": "ACME CARE", "statement_period": "q1 2026"}, line_items=items)
    assert a == b


# ---------------- DB integration ----------------
@pytest.mark.asyncio
async def test_exact_dupe_lookup_matches_household_and_sha(db):
    sha = compute_file_sha256(b"sample-pdf-bytes")
    await db.statements.insert_one({
        "id": "stmt-1", "household_id": "hh-A", "file_sha256": sha, "state": STATE_ACTIVE,
        "filename": "feb.pdf", "period_label": "Feb 2026",
    })
    hit = await find_exact_dupe_by_file_sha(db, household_id="hh-A", file_sha256=sha)
    assert hit and hit["id"] == "stmt-1"
    miss_other_hh = await find_exact_dupe_by_file_sha(db, household_id="hh-B", file_sha256=sha)
    assert miss_other_hh is None


@pytest.mark.asyncio
async def test_exact_dupe_skips_hard_deleted(db):
    sha = compute_file_sha256(b"deleted-bytes")
    await db.statements.insert_one({
        "id": "stmt-d", "household_id": "hh-X", "file_sha256": sha, "state": STATE_DELETED,
    })
    hit = await find_exact_dupe_by_file_sha(db, household_id="hh-X", file_sha256=sha)
    assert hit is None, "hard-deleted versions must not block re-upload"


@pytest.mark.asyncio
async def test_logical_lookup_finds_only_active(db):
    await db.statements.insert_many([
        {"id": "v1", "household_id": "hh", "participant_id": "p1", "period_label": "Q1", "state": STATE_SUPERSEDED, "extracted_fingerprint": "fp-old"},
        {"id": "v2", "household_id": "hh", "participant_id": "p1", "period_label": "Q1", "state": STATE_ACTIVE, "extracted_fingerprint": "fp-new"},
    ])
    hit = await find_active_for_period(db, household_id="hh", participant_id="p1", period_label="Q1")
    assert hit and hit["id"] == "v2"
    miss_different_period = await find_active_for_period(db, household_id="hh", participant_id="p1", period_label="Q2")
    assert miss_different_period is None


# ---------------- audit log ----------------
@pytest.mark.asyncio
async def test_write_audit_appends_row_with_correct_shape(db):
    row = await write_audit(
        db,
        statement_id="stmt-1", version_id="stmt-1",
        event_type=EVT_UPLOADED, actor_user_id="user-1", actor_kind="user",
        new_state=STATE_ACTIVE, metadata={"foo": "bar"},
    )
    assert row["event_type"] == EVT_UPLOADED
    assert row["statement_id"] == "stmt-1"
    assert row["actor_kind"] == "user"
    assert row["metadata"] == {"foo": "bar"}
    count = await db.statement_audit_log.count_documents({"statement_id": "stmt-1"})
    assert count == 1


@pytest.mark.asyncio
async def test_write_audit_rejects_invalid_actor_kind(db):
    with pytest.raises(ValueError):
        await write_audit(
            db, statement_id="s", event_type=EVT_ACCEPTED_ACTIVE,
            actor_user_id="u", actor_kind="bogus",
        )


# ---------------- idempotency ----------------
@pytest.mark.asyncio
async def test_idempotency_roundtrip(db):
    key = uuid.uuid4().hex
    assert await lookup_idempotency(db, key=key, scope="statements_upload", user_id="u1") is None
    await store_idempotency(db, key=key, scope="statements_upload", user_id="u1", response={"job_id": "j-1"})
    found = await lookup_idempotency(db, key=key, scope="statements_upload", user_id="u1")
    assert found and found["response"] == {"job_id": "j-1"}


@pytest.mark.asyncio
async def test_idempotency_is_scoped_per_user_and_scope(db):
    key = uuid.uuid4().hex
    await store_idempotency(db, key=key, scope="statements_upload", user_id="u1", response={"x": 1})
    # Different user → not found.
    assert await lookup_idempotency(db, key=key, scope="statements_upload", user_id="u2") is None
    # Different scope → not found.
    assert await lookup_idempotency(db, key=key, scope="archive", user_id="u1") is None
