"""Phase 8 — Seed sample households for end-to-end scenario validation.

Creates three illustrative households under Cathy's account so the scenario
engine can be walked through real journeys:

  1. Dorothy Anderson — already exists; left untouched.
  2. Robert Kowalski (82) — recently hospitalised, on restorative pathway.
  3. Patricia Holloway (76) — pension status unknown, means_not_disclosed.

Idempotent: re-running will reuse existing seeded participants if found by
the ``is_seed: true`` + ``seed_key`` markers. Use ``--reset`` to wipe and
reseed (handy for clean validation runs).

Run from the supervisor host:
    cd /app/backend && \
      MONGO_URL=mongodb://localhost:27017 DB_NAME=test_database \
      python scripts/seed_phase8_households.py
"""
from __future__ import annotations
import argparse
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

# Ensure we can import the backend modules whether run directly or via -m.
HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)
sys.path.insert(0, BACKEND)

from motor.motor_asyncio import AsyncIOMotorClient
from scenario_engine.events import capture_event
from scenario_engine.lifecycle import apply_transition


SEED_USER_EMAIL = "cathy@example.com"


async def _get_seed_owner(db):
    u = await db.users.find_one({"email": SEED_USER_EMAIL}, {"_id": 0, "id": 1, "name": 1})
    if not u:
        raise SystemExit(f"Seed owner {SEED_USER_EMAIL} not found — seed the caregiver account first")
    return u


async def _ensure_household(db, owner):
    """Reuse Cathy's existing household."""
    h = await db.households.find_one({"owner_id": owner["id"]}, {"_id": 0})
    if not h:
        raise SystemExit("Cathy has no household yet — onboard her before seeding Phase 8")
    return h


async def _existing_template_participant(db, household):
    """Find an existing v2-shape participant in the household to mirror
    schema fields (account_id pattern, status keys, etc)."""
    return await db.participants.find_one(
        {"household_id": household["id"], "account_id": {"$ne": None}},
        {"_id": 0},
    )


async def _upsert_participant(db, *, owner, household, template, seed_key, payload):
    p = await db.participants.find_one({"seed_key": seed_key, "is_seed": True}, {"_id": 0})
    if p:
        return p
    pid = f"seed-{seed_key}-{uuid.uuid4().hex[:8]}"
    doc = {
        "id": pid,
        "account_id": (template or {}).get("account_id"),
        "household_id": household.get("id"),
        "primary_user_id": owner["id"],
        "first_name": payload["first_name"],
        "last_name": payload["last_name"],
        "classification": payload["classification"],
        "provider_name": payload.get("provider_name", "BlueBerry Care"),
        "lifecycle_state": payload.get("lifecycle_state", "ACTIVE"),
        "flags": payload.get("flags", {}),
        "status": "ACTIVE",
        "is_seed": True,
        "seed_key": seed_key,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.participants.insert_one(dict(doc))
    return doc


async def seed_robert(db, owner, household, template):
    p = await _upsert_participant(db, owner=owner, household=household, template=template, seed_key="robert_kowalski", payload={
        "first_name": "Robert", "last_name": "Kowalski", "classification": 6,
        "provider_name": "Mercy Home Care", "lifecycle_state": "ACTIVE",
    })
    # Walk through hospitalisation → restorative path.
    today = datetime.now(timezone.utc).date()
    one_week_ago = (today - timedelta(days=7)).isoformat()
    three_days_ago = (today - timedelta(days=3)).isoformat()
    await capture_event(
        db, participant_id=p["id"], account_id=p["account_id"],
        event_type="hospitalised", trigger_source="caregiver",
        effective_date=one_week_ago,
        note="Robert had a fall and was admitted with a hip fracture",
        payload={"hospital_name": "Royal Melbourne", "admission_reason": "Fall — hip fracture"},
        source={"kind": "seed", "seed_key": "robert_kowalski"},
        actor_id=owner["id"], actor_name=owner.get("name"),
    )
    await capture_event(
        db, participant_id=p["id"], account_id=p["account_id"],
        event_type="discharged_from_hospital", trigger_source="caregiver",
        effective_date=three_days_ago,
        note="Discharge plan includes 12-week restorative pathway",
        payload={"discharge_date": three_days_ago},
        source={"kind": "seed", "seed_key": "robert_kowalski"},
        actor_id=owner["id"], actor_name=owner.get("name"),
    )
    await capture_event(
        db, participant_id=p["id"], account_id=p["account_id"],
        event_type="restorative_pathway_started", trigger_source="caregiver",
        effective_date=three_days_ago,
        note="Episode 1 — physiotherapy + OT",
        payload={"start_date": three_days_ago,
                 "end_date": (today + timedelta(days=81)).isoformat(),
                 "episode_number": 1},
        source={"kind": "seed", "seed_key": "robert_kowalski"},
        actor_id=owner["id"], actor_name=owner.get("name"),
    )
    return p


async def seed_patricia(db, owner, household, template):
    p = await _upsert_participant(db, owner=owner, household=household, template=template, seed_key="patricia_holloway", payload={
        "first_name": "Patricia", "last_name": "Holloway", "classification": 3,
        "provider_name": "Acacia Aged Care", "lifecycle_state": "ACTIVE",
        "flags": {"MEANS_NOT_DISCLOSED": True},
    })
    today = datetime.now(timezone.utc).date()
    await capture_event(
        db, participant_id=p["id"], account_id=p["account_id"],
        event_type="means_not_disclosed", trigger_source="system",
        effective_date=today.isoformat(),
        note="No Services Australia income assessment on file — paying highest-rate contributions",
        payload=None,
        source={"kind": "seed", "seed_key": "patricia_holloway"},
        actor_id=owner["id"], actor_name=owner.get("name"),
    )
    return p


async def reset_seeds(db):
    cursor = db.participants.find({"is_seed": True}, {"_id": 0, "id": 1})
    pids = [d["id"] async for d in cursor]
    if not pids:
        print("no seed participants to reset")
        return
    await db.participants.delete_many({"id": {"$in": pids}})
    await db.participant_events.delete_many({"participant_id": {"$in": pids}})
    await db.scenario_alerts.delete_many({"participant_id": {"$in": pids}})
    await db.participant_state_audit.delete_many({"participant_id": {"$in": pids}})
    print(f"reset {len(pids)} seed participants and their events/alerts/audit rows")


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="wipe existing seeded participants first")
    args = parser.parse_args()

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    # Bootstrap program reference cache so capture_event's downstream alert
    # evaluation has budget figures available.
    from program_reference import init as _pref_init, preload_cache as _pref_preload
    _pref_init(db)
    await _pref_preload()

    if args.reset:
        await reset_seeds(db)

    owner = await _get_seed_owner(db)
    household = await _ensure_household(db, owner)
    template = await _existing_template_participant(db, household)

    robert = await seed_robert(db, owner, household, template)
    patricia = await seed_patricia(db, owner, household, template)
    print("seeded:")
    print(f"  - Robert Kowalski   ({robert['id']})")
    print(f"  - Patricia Holloway ({patricia['id']})")
    print("Dorothy Anderson left untouched (existing participant).")


if __name__ == "__main__":
    asyncio.run(main())
