"""CLI: migrate every participant in db.participants to the v2 profile schema.

Usage (from /app/backend/):
    python -m scripts.migrate_participants_v2

Idempotent, safe to re-run. Prints how many participants were updated and
how many are now flagged for completion (i.e. still have at least one
mandatory Tier 1 field missing).
"""
from __future__ import annotations
import asyncio
import os
import sys
from pathlib import Path

# Make `backend/` importable when run as a script
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from participant_profile import migrate_participants_to_v2  # noqa: E402


async def main() -> int:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    print(f"Connecting to {db_name}…")
    result = await migrate_participants_to_v2(db)
    print(
        f"\nMigration complete:\n"
        f"  Scanned:                 {result['scanned']}\n"
        f"  Updated:                 {result['updated']}\n"
        f"  Flagged for completion:  {result['flagged_for_completion']}\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
