#!/usr/bin/env python3
"""DATA-MODEL-1 v1 invariant checker. Run against the live DB.

Usage: python scripts/verify_data_model_invariants.py
Exits non-zero if any invariant is violated.
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
import data_model as dm  # noqa: E402


async def main() -> int:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    report = await dm.verify_invariants(db)
    print("ok:", report["ok"], "violations:", len(report["violations"]))
    for v in report["violations"][:50]:
        print("  -", v)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
