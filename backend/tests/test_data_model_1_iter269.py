"""DATA-MODEL-1 v1 foundation tests (iter269).

Validates:
- Migration correctness (account_holder membership + participant_record + household $set fields).
- Idempotency of data_model.backfill_data_model.
- Invariants via data_model.verify_invariants + scripts/verify_data_model_invariants.py.
- Legacy caregiver migration mapping (seeded fixture, cleaned up).
- Additive change regression: login / auth me / GET /api/household/members still function.
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

# Ensure backend module importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import data_model as dm  # noqa: E402

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if "REACT_APP_BACKEND_URL" in os.environ else None
# Fall back to reading frontend .env if env var not set in this shell
if not BASE_URL:
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().strip('"').rstrip("/")
            break

MONGO_URL = os.environ.get("MONGO_URL") or "mongodb://localhost:27017"
DB_NAME = os.environ.get("DB_NAME") or "test_database"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]


@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "cathy@example.com", "password": "testpass123"},
                      timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json()["token"]


# ---------- Migration correctness ----------

def test_all_households_have_account_holder_and_participant_record(event_loop, db):
    async def _run():
        bad = []
        async for h in db.households.find({}, {"_id": 0, "id": 1, "owner_id": 1,
                                                "account_holder_user_id": 1,
                                                "bereavement_grace_expires_at": 1,
                                                "classification": 1, "provider_name": 1}):
            hid = h["id"]
            owner_id = h.get("owner_id")
            # additive fields must be present
            if h.get("account_holder_user_id") != owner_id:
                bad.append({"hid": hid, "why": "account_holder_user_id missing/mismatch",
                            "got": h.get("account_holder_user_id"), "owner": owner_id})
                continue
            if "bereavement_grace_expires_at" not in h:
                bad.append({"hid": hid, "why": "bereavement_grace_expires_at missing"})
                continue
            # account_holder membership must exist exactly once (revoked_at null)
            ah_count = await db.household_memberships.count_documents(
                {"household_id": hid, "user_id": owner_id,
                 "role": dm.ROLE_ACCOUNT_HOLDER, "revoked_at": None})
            if ah_count != 1:
                bad.append({"hid": hid, "why": f"account_holder count={ah_count}"})
                continue
            # participant_record with user_id=owner exists, live
            pr = await db.participant_records.find_one(
                {"household_id": hid, "user_id": owner_id,
                 "deceased_at": None, "archived_at": None},
                {"_id": 0})
            if not pr:
                bad.append({"hid": hid, "why": "no live self participant_record"})
                continue
            # classification/provider carried over
            if pr.get("classification") != h.get("classification"):
                bad.append({"hid": hid, "why": "classification mismatch",
                            "pr": pr.get("classification"), "h": h.get("classification")})
            if pr.get("provider_name") != h.get("provider_name"):
                bad.append({"hid": hid, "why": "provider_name mismatch",
                            "pr": pr.get("provider_name"), "h": h.get("provider_name")})
        return bad

    bad = event_loop.run_until_complete(_run())
    assert not bad, f"Migration invariants failed for {len(bad)} households: {bad[:5]}"


# ---------- Idempotency ----------

def test_backfill_is_idempotent(event_loop, db):
    async def _run():
        c_pr_before = await db.participant_records.count_documents({})
        c_hm_before = await db.household_memberships.count_documents({})
        c_link_before = await db.caregiver_participant_links.count_documents({})
        stats = await dm.backfill_data_model(db)
        c_pr_after = await db.participant_records.count_documents({})
        c_hm_after = await db.household_memberships.count_documents({})
        c_link_after = await db.caregiver_participant_links.count_documents({})
        return stats, (c_pr_before, c_hm_before, c_link_before), (c_pr_after, c_hm_after, c_link_after)

    stats, before, after = event_loop.run_until_complete(_run())
    assert before == after, f"Counts changed on re-run: before={before} after={after} stats={stats}"
    assert stats["participant_records_created"] == 0
    assert stats["memberships_created"] == 0
    assert stats["caregivers_migrated"] == 0
    assert stats["links_created"] == 0


# ---------- Invariants (python API) ----------

def test_verify_invariants_python_api(event_loop, db):
    async def _run():
        return await dm.verify_invariants(db)
    report = event_loop.run_until_complete(_run())
    assert report["ok"] is True, f"violations={report['violations'][:10]}"
    assert report["violations"] == []


# ---------- Invariants (CLI script) ----------

def test_verify_invariants_cli_script_exits_zero():
    env = os.environ.copy()
    env["MONGO_URL"] = MONGO_URL
    env["DB_NAME"] = DB_NAME
    proc = subprocess.run(
        [sys.executable, "/app/scripts/verify_data_model_invariants.py"],
        capture_output=True, text=True, timeout=60, env=env,
    )
    assert proc.returncode == 0, f"stdout={proc.stdout}\nstderr={proc.stderr}"
    assert "ok: True" in proc.stdout


# ---------- Caregiver migration mapping (seeded) ----------

def test_caregiver_migration_maps_legacy_active_member(event_loop, db):
    """Seed a legacy db.household_members active row (non-owner) and re-run backfill;
    verify a caregiver membership + caregiver_participant_link are created and linked
    to the household's participant_record. Clean up after."""
    async def _run():
        # pick cathy's household
        h = await db.households.find_one({"owner_id": {"$exists": True}},
                                          {"_id": 0, "id": 1, "owner_id": 1})
        assert h, "no household to test against"
        hid = h["id"]
        owner_id = h["owner_id"]
        pr = await db.participant_records.find_one(
            {"household_id": hid, "user_id": owner_id,
             "deceased_at": None, "archived_at": None},
            {"_id": 0, "id": 1})
        assert pr, "expected self participant_record"
        pr_id = pr["id"]

        legacy_uid = f"TEST_iter269_{uuid.uuid4().hex[:8]}"
        legacy_hm_id = f"TEST_hm_{uuid.uuid4().hex[:8]}"
        legacy_doc = {
            "id": legacy_hm_id,
            "household_id": hid,
            "user_id": legacy_uid,
            "status": "active",
            "role": "family_member",
            "joined_at": "2026-01-01T00:00:00+00:00",
        }
        await db.household_members.insert_one(legacy_doc)
        try:
            stats = await dm.backfill_data_model(db)
            # verify caregiver membership created
            mem = await db.household_memberships.find_one(
                {"household_id": hid, "user_id": legacy_uid,
                 "role": dm.ROLE_CAREGIVER, "revoked_at": None},
                {"_id": 0})
            assert mem, f"caregiver membership not created; stats={stats}"
            assert mem["relationship"] == "Other"
            assert mem["requires_relationship_update"] is True
            # link exists
            link = await db.caregiver_participant_links.find_one(
                {"caregiver_membership_id": mem["id"], "participant_record_id": pr_id},
                {"_id": 0})
            assert link, "caregiver_participant_link not created"
            # owner not duplicated as caregiver
            owner_cg = await db.household_memberships.count_documents(
                {"household_id": hid, "user_id": owner_id, "role": dm.ROLE_CAREGIVER,
                 "revoked_at": None})
            assert owner_cg == 0, "owner incorrectly duplicated as caregiver"
            # second run: no new records for this seed
            stats2 = await dm.backfill_data_model(db)
            mem_count = await db.household_memberships.count_documents(
                {"household_id": hid, "user_id": legacy_uid, "revoked_at": None})
            link_count = await db.caregiver_participant_links.count_documents(
                {"caregiver_membership_id": mem["id"], "participant_record_id": pr_id})
            assert mem_count == 1
            assert link_count == 1
            # invariants still ok after seed
            report = await dm.verify_invariants(db)
            assert report["ok"] is True, f"invariants broken by seed: {report['violations'][:5]}"
            return mem["id"]
        finally:
            await db.household_members.delete_one({"id": legacy_hm_id})
            mem = await db.household_memberships.find_one(
                {"household_id": hid, "user_id": legacy_uid}, {"_id": 0, "id": 1})
            if mem:
                await db.caregiver_participant_links.delete_many(
                    {"caregiver_membership_id": mem["id"]})
                await db.household_memberships.delete_one({"id": mem["id"]})

    event_loop.run_until_complete(_run())


# ---------- Regression: existing flows still work ----------

def test_login_still_works(cathy_token):
    assert isinstance(cathy_token, str) and len(cathy_token) > 20


def test_auth_me_still_works(cathy_token):
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {cathy_token}"}, timeout=15)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    assert body.get("email") == "cathy@example.com"


def test_household_members_v3_shape(cathy_token):
    r = requests.get(f"{BASE_URL}/api/household/members",
                     headers={"Authorization": f"Bearer {cathy_token}"}, timeout=15)
    assert r.status_code == 200, r.text[:200]
    body = r.json()
    # v3 caregiver-only capacity shape lives under body.capacity
    assert "capacity" in body, f"missing capacity in members response: {list(body.keys())}"
    cap = body["capacity"]
    for k in ("caregivers_included", "caregivers_used", "caregiver_spaces_remaining",
              "participants_summary"):
        assert k in cap, f"missing key {k} in capacity: {list(cap.keys())}"


def test_participant_today_still_200(cathy_token):
    r = requests.get(f"{BASE_URL}/api/participant/today",
                     headers={"Authorization": f"Bearer {cathy_token}"}, timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text[:200]}"
