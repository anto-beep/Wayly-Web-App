"""Section 2 (Query Optimisation) — regression tests.

Each test exercises one of the four new pieces in `lib.query_helpers`:
1. `STATEMENT_LIGHT_PROJECTION` drops every heavy field.
2. `household_usage_counts` returns all 6 keys + matches per-collection counts.
3. `admin_users_with_subscription` returns the join in one round trip and never
   leaks `password_hash` / TOTP secrets.
4. `seek_filter` builds the correct `_id` cursor predicates.
"""
from __future__ import annotations
import os
import asyncio
import pytest
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

from lib.query_helpers import (
    STATEMENT_LIGHT_PROJECTION,
    USER_SAFE_PROJECTION,
    admin_users_with_subscription,
    household_usage_counts,
    seek_filter,
    parse_object_id,
)


@pytest.fixture
def db():
    """Function-scope client — motor binds to the running loop, so a
    module-scope client leaks across pytest-asyncio test loops."""
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    try:
        yield client[os.environ["DB_NAME"]]
    finally:
        client.close()


def test_statement_light_projection_drops_heavy_fields():
    heavy = {"file_b64", "raw_text", "pdf_text", "text_excerpt",
             "parsed_full_text", "ocr_text", "ocr_raw", "extracted_json"}
    for f in heavy:
        assert STATEMENT_LIGHT_PROJECTION.get(f) == 0, f"missing exclusion for {f}"
    assert STATEMENT_LIGHT_PROJECTION["_id"] == 0


def test_user_safe_projection_drops_secrets():
    for f in ["password_hash", "totp_secret",
              "totp_backup_codes", "totp_backup_codes_hashed"]:
        assert USER_SAFE_PROJECTION.get(f) == 0, f"missing exclusion for {f}"


def test_parse_object_id_valid_and_invalid():
    oid = parse_object_id("507f1f77bcf86cd799439011")
    assert isinstance(oid, ObjectId)
    assert parse_object_id(None) is None
    assert parse_object_id("") is None
    assert parse_object_id("not-an-oid") is None


def test_seek_filter_desc_uses_lt():
    f = seek_filter({"household_id": "h1"}, "507f1f77bcf86cd799439011", sort_dir=-1)
    assert "_id" in f
    assert "$lt" in f["_id"]
    assert isinstance(f["_id"]["$lt"], ObjectId)
    assert f["household_id"] == "h1"


def test_seek_filter_asc_uses_gt():
    f = seek_filter({}, "507f1f77bcf86cd799439011", sort_dir=1)
    assert "$gt" in f["_id"]


def test_seek_filter_no_token_passthrough():
    f = seek_filter({"x": 1}, None)
    assert "_id" not in f
    assert f["x"] == 1


@pytest.mark.asyncio
async def test_household_usage_counts_returns_all_keys(db):
    """Empty household_id is fine — should return all 6 zero counters."""
    counts = await household_usage_counts(db, "no-such-household", "nobody@example.com")
    expected = {"chat_questions", "statements_uploaded", "family_messages",
                "wellbeing_checkins", "digest_sends", "tool_emails_sent"}
    assert set(counts.keys()) == expected
    assert all(v == 0 for v in counts.values())


@pytest.mark.asyncio
async def test_household_usage_counts_matches_per_collection(db):
    """For a real household, our pipeline output should match the legacy
    per-collection count_documents calls."""
    user = await db.users.find_one({"email": "cathy@example.com"}, {"_id": 0})
    if not user or not user.get("household_id"):
        pytest.skip("cathy@example.com household not seeded")
    hid = user["household_id"]
    counts = await household_usage_counts(db, hid, user["email"])
    legacy = {
        "chat_questions": await db.chat_turns.count_documents({"household_id": hid, "role": "user"}),
        "statements_uploaded": await db.statements.count_documents({"household_id": hid}),
        "family_messages": await db.family_messages.count_documents({"household_id": hid}),
        "wellbeing_checkins": await db.wellbeing.count_documents({"household_id": hid}),
        "digest_sends": await db.digest_sends.count_documents({"household_id": hid}),
        "tool_emails_sent": await db.tool_email_log.count_documents(
            {"email": user["email"], "ok": True}
        ),
    }
    assert counts == legacy, f"pipeline ≠ legacy:\n  pipeline={counts}\n  legacy={legacy}"


@pytest.mark.asyncio
async def test_admin_users_with_subscription_strips_secrets(db):
    rows, total = await admin_users_with_subscription(
        db, {}, page=1, page_size=10, sort_field="created_at", sort_dir=-1
    )
    assert total >= len(rows)
    assert len(rows) <= 10
    for r in rows:
        for forbidden in ("password_hash", "totp_secret",
                          "totp_backup_codes", "totp_backup_codes_hashed",
                          "_id", "_sub"):
            assert forbidden not in r, f"{forbidden} leaked in admin user row"


@pytest.mark.asyncio
async def test_admin_users_with_subscription_attaches_sub_when_present(db):
    """Pick a user we know has a subscription row and confirm $lookup
    populated subscription_status/trial_ends_at/cancel_at_period_end."""
    sub = await db.subscriptions.find_one({}, {"_id": 0})
    if not sub or not sub.get("user_id"):
        pytest.skip("no subscriptions in test db")
    user = await db.users.find_one({"id": sub["user_id"]}, {"_id": 0, "email": 1})
    if not user:
        pytest.skip("user for first subscription not found")
    rows, _ = await admin_users_with_subscription(
        db, {"email": user["email"]}, page=1, page_size=1
    )
    assert rows, f"no row returned for {user['email']}"
    r = rows[0]
    # subscription_status either matches sub.status, or is None when the
    # underlying sub row has no `status` field. Either way the join ran.
    assert "subscription_status" in r, "join didn't attach subscription_status"
    if sub.get("status") is not None:
        assert r["subscription_status"] == sub.get("status")
