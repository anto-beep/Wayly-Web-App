#!/usr/bin/env python3
"""Seed (or reset) the dedicated smoke-test sentinel account.

The smoke runner (GitHub Actions) logs into wayly.com.au every 15 min using
this account, navigates a few key pages, then POSTs the result back to
/api/internal/smoke-report (HMAC-signed).

Why a dedicated account?
  * Keeps real-user accounts (e.g. cathy@example.com) clean — no fake browser
    sessions polluting their audit trail or analytics.
  * Lets us narrow access. The smoke account only needs to *read* the basic
    dashboard. It owns no real participant data.
  * Easy to spot in logs: any access from `smoke@wayly.com.au` is the bot.

Run:
    SMOKE_PASSWORD=... python3 /app/scripts/seed_smoke_account.py

If SMOKE_PASSWORD is not set, a random one is generated and printed once.
"""
from __future__ import annotations
import asyncio
import os
import secrets
import sys

# Make `backend` importable when this runs from /app/scripts/
sys.path.insert(0, "/app/backend")

from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402
from auth import hash_password  # noqa: E402

SMOKE_EMAIL = "smoke@wayly.com.au"


async def main() -> None:
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    pwd = os.environ.get("SMOKE_PASSWORD")
    generated = False
    if not pwd:
        pwd = "Sm0ke!" + secrets.token_urlsafe(20)
        generated = True

    existing = await db.users.find_one({"email": SMOKE_EMAIL})
    if existing:
        await db.users.update_one(
            {"email": SMOKE_EMAIL},
            {"$set": {
                "password_hash": hash_password(pwd),
                "role": "caregiver",
                "plan": "family",
                "name": "Wayly Smoke",
                "is_smoke_account": True,
            }},
        )
        action = "updated"
    else:
        from uuid import uuid4
        from datetime import datetime, timezone
        await db.users.insert_one({
            "id": str(uuid4()),
            "email": SMOKE_EMAIL,
            "password_hash": hash_password(pwd),
            "name": "Wayly Smoke",
            "role": "caregiver",
            "plan": "family",
            "household_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "is_smoke_account": True,
        })
        action = "created"

    print(f"smoke account {action}: {SMOKE_EMAIL}")
    if generated:
        print("PASSWORD (shown once — store as SMOKE_PASSWORD secret in GitHub):")
        print(pwd)
    else:
        print("password: <provided via SMOKE_PASSWORD env>")

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
