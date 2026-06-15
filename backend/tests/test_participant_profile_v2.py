"""Tests for the participant profile v2 schema, endpoints, and migration."""
import os
import pytest
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from participant_profile import (
    compute_profile_completeness,
    missing_required_fields,
    recommended_next_fields,
    TIER1_FIELDS,
    TIER2_FIELDS,
    TIER3_FIELDS,
    migrate_participants_to_v2,
)


# -------------------- pure-Python (no DB) --------------------
def test_completeness_empty_doc_zero():
    assert compute_profile_completeness({}) == 0.0


def test_completeness_only_tier1_returns_60():
    doc = {
        "first_name": "Dorothy",
        "last_name": "Smith",
        "dob": "1948-05-12",
        "classification_level": 4,
        "pension_status": "full_pension",
        "provider_name": "BlueBerry",
        "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    assert compute_profile_completeness(doc) == 60.0


def test_completeness_tier1_plus_tier2_returns_90():
    doc = {
        "first_name": "Dorothy", "last_name": "Smith", "dob": "1948-05-12",
        "classification_level": 4, "pension_status": "full_pension",
        "provider_name": "BlueBerry", "statement_delivery": "email",
        "authorisation_confirmed": True,
        "preferred_name": "Mum",
        "mac_reference_number": "AC123",
        "suburb": "Manly", "state": "NSW",
        "is_grandfathered_hcp": "no",
        "caregiver_relationship": "daughter",
        "caregiver_phone": "+61400000000",
    }
    assert compute_profile_completeness(doc) == 90.0


def test_completeness_all_tiers_returns_100():
    doc = {
        # Tier 1
        "first_name": "Dorothy", "last_name": "Smith", "dob": "1948-05-12",
        "classification_level": 4, "pension_status": "full_pension",
        "provider_name": "BlueBerry", "statement_delivery": "email",
        "authorisation_confirmed": True,
        # Tier 2
        "preferred_name": "Mum", "mac_reference_number": "AC123",
        "suburb": "Manly", "state": "NSW", "is_grandfathered_hcp": "no",
        "caregiver_relationship": "daughter", "caregiver_phone": "+61400000000",
        # Tier 3
        "care_manager_name": "Jane", "care_manager_phone": "+61400000001",
        "care_manager_email": "jane@example.com",
        "full_address": "12 Pine St",
        "part_pension_actual_independence_pct": 17.5,
        "part_pension_actual_everyday_pct": 50.0,
        "applicable_supplements": ["oxygen"],
        "enteral_feeding_type": "bolus",
        "active_pathway": "restorative_care",
        "primary_language": "English",
        "veteran_status": "none",
    }
    assert compute_profile_completeness(doc) == 100.0


def test_authorisation_false_counts_as_missing():
    doc = {
        "first_name": "Dorothy", "last_name": "Smith", "dob": "1948-05-12",
        "classification_level": 4, "pension_status": "full_pension",
        "provider_name": "BlueBerry", "statement_delivery": "email",
        "authorisation_confirmed": False,
    }
    missing = missing_required_fields(doc)
    assert "authorisation_confirmed" in missing
    assert compute_profile_completeness(doc) < 60.0


def test_empty_supplements_list_is_not_filled():
    """Tier 3 `applicable_supplements: []` should not count as filled."""
    doc = {"applicable_supplements": []}
    assert compute_profile_completeness(doc) == 0.0
    doc2 = {"applicable_supplements": ["oxygen"]}
    # Only 1 of 11 Tier 3 fields → 1/11 * 10 ≈ 0.9%
    assert 0.5 < compute_profile_completeness(doc2) < 1.5


def test_missing_required_fields_complete_doc():
    doc = {
        "first_name": "Dorothy", "last_name": "Smith", "dob": "1948-05-12",
        "classification_level": 4, "pension_status": "full_pension",
        "provider_name": "BlueBerry", "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    assert missing_required_fields(doc) == []


def test_recommended_next_fields_priority_order():
    doc = {"mac_reference_number": "AC1", "suburb": "Manly"}
    recs = recommended_next_fields(doc)
    # mac_reference_number + suburb filled → should not appear
    assert "mac_reference_number" not in recs
    assert "suburb" not in recs
    # is_grandfathered_hcp comes before state in priority order
    assert recs.index("is_grandfathered_hcp") < recs.index("state")


# -------------------- migration (uses real DB) --------------------
@pytest.mark.asyncio
async def test_migration_is_idempotent():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    # Insert a synthetic legacy doc
    test_id = "test-migration-fixture-doc"
    await db.participants.delete_many({"id": test_id})
    await db.participants.insert_one({
        "id": test_id,
        "household_id": "test-hh",
        "first_name": "MigTest",
        "last_name": "Legacy",
        "classification": 4,  # legacy field
        "provider_name": "Old Provider",
        "status": "ACTIVE",
        "is_primary": False,
    })
    res1 = await migrate_participants_to_v2(db)
    res2 = await migrate_participants_to_v2(db)
    # On second run, the same doc should not need updating again
    assert res2["scanned"] == res1["scanned"]
    assert res2["updated"] < res1["updated"] or res2["updated"] == 0
    # Verify doc now has migrated fields
    doc = await db.participants.find_one({"id": test_id}, {"_id": 0})
    assert doc["pension_status"] == "unsure"
    assert doc["statement_delivery"] in ("email", "post", "portal", "other")
    assert doc["classification_level"] == 4
    assert doc["authorisation_confirmed"] is False
    assert doc["applicable_supplements"] == []
    assert isinstance(doc["profile_completeness_pct"], (int, float))
    # Cleanup
    await db.participants.delete_one({"id": test_id})
    client.close()


@pytest.mark.asyncio
async def test_migration_preserves_already_confirmed_authorisation():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    test_id = "test-migration-already-confirmed"
    await db.participants.delete_many({"id": test_id})
    await db.participants.insert_one({
        "id": test_id,
        "household_id": "test-hh",
        "first_name": "Pre",
        "last_name": "Confirmed",
        "status": "ACTIVE",
        "authorisation_confirmed": True,
        "authorisation_confirmed_at": "2026-01-01T00:00:00+00:00",
    })
    await migrate_participants_to_v2(db)
    doc = await db.participants.find_one({"id": test_id}, {"_id": 0})
    # Migration must NOT clobber a pre-existing True back to False
    assert doc["authorisation_confirmed"] is True
    assert doc["authorisation_confirmed_at"] == "2026-01-01T00:00:00+00:00"
    # Cleanup
    await db.participants.delete_one({"id": test_id})
    client.close()
