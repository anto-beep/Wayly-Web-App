"""Seed/promote the system owner admin account.
Run with: cd /app/backend && python seed_admin.py
"""
import os
import asyncio
import secrets
import sys
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_NAME = "TechGlove Admin"
DEFAULT_PASSWORD = "AdminPass!2026"  # change immediately after first login


async def main():
    from auth import hash_password
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if existing:
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"is_admin": True}})
        print(f"Existing user {ADMIN_EMAIL} promoted to admin.")
        return

    password = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PASSWORD
    new_id = secrets.token_urlsafe(12)
    user = {
        "id": new_id,
        "email": ADMIN_EMAIL,
        "password_hash": hash_password(password),
        "name": ADMIN_NAME,
        "role": "caregiver",
        "plan": "family",
        "household_id": None,
        "is_admin": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    print(f"Created new admin user: {ADMIN_EMAIL}")
    print(f"Password: {password}")
    print("CHANGE THIS PASSWORD IMMEDIATELY AFTER FIRST LOGIN.")


if __name__ == "__main__":
    asyncio.run(main())
