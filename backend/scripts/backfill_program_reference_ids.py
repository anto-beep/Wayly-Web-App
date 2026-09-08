#!/usr/bin/env python3
"""One-shot migration: backfill `id` on legacy `program_reference` documents.

Background
----------
`program_reference.py preload_cache()` was raising `KeyError` on rows missing the
`id` field (see iteration 53 RCA). The loader was hardened to skip such rows
with a warning, but those keys are then unavailable in the cache. This migration
inserts a stable UUID into every row missing one so they appear in the cache on
the next reload.

Idempotent: only writes when `id` is missing. Safe to re-run.

Run
---
    cd /app/backend && python3 scripts/backfill_program_reference_ids.py
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid

from motor.motor_asyncio import AsyncIOMotorClient


async def main() -> int:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("MONGO_URL / DB_NAME missing in environment", file=sys.stderr)
        return 2
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    coll = db.program_reference

    cur = coll.find(
        {"$or": [{"id": {"$exists": False}}, {"id": None}, {"id": ""}]},
        {"_id": 1, "key": 1, "effective_from": 1},
    )

    updated = 0
    scanned = 0
    async for doc in cur:
        scanned += 1
        new_id = str(uuid.uuid4())
        await coll.update_one({"_id": doc["_id"]}, {"$set": {"id": new_id}})
        updated += 1
        print(f"  backfilled id={new_id} key={doc.get('key')!r} effective_from={doc.get('effective_from')!r}")

    print(f"\nScanned {scanned} candidate row(s); updated {updated}.")
    if updated:
        print("Next time the backend restarts, the cache will load these rows successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
