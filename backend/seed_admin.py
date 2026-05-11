"""Seed/promote admin accounts. Idempotent.

Run: cd /app/backend && python seed_admin.py

What it does:
- Ensures every existing user with is_admin=True has admin_role="super_admin".
- Promotes hello@techglove.com.au to super_admin (creates if missing).
- Creates the secondary super admin a.chiware2@gmail.com (default password
  Admin!2026 — user is forced to change on first login via Settings).
"""
import os
import asyncio
import secrets
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

ADMINS = [
    {"email": "hello@techglove.com.au", "name": "TechGlove Admin", "password": "AdminPass!2026", "role": "super_admin"},
    {"email": "a.chiware2@gmail.com", "name": "Antony", "password": "Admin!2026", "role": "super_admin"},
]


async def main():
    from auth import hash_password
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    # 1. Backfill admin_role for legacy is_admin users
    legacy = await db.users.update_many(
        {"is_admin": True, "$or": [{"admin_role": None}, {"admin_role": {"$exists": False}}]},
        {"$set": {"admin_role": "super_admin"}},
    )
    if legacy.modified_count:
        print(f"Backfilled admin_role on {legacy.modified_count} legacy admin user(s).")

    # 2. Ensure named admins
    for spec in ADMINS:
        existing = await db.users.find_one({"email": spec["email"]})
        if existing:
            await db.users.update_one(
                {"email": spec["email"]},
                {"$set": {
                    "is_admin": True,
                    "admin_role": spec["role"],
                    "name": existing.get("name") or spec["name"],
                }},
            )
            print(f"Existing user {spec['email']} → role={spec['role']}.")
        else:
            new_id = secrets.token_urlsafe(12)
            await db.users.insert_one({
                "id": new_id,
                "email": spec["email"],
                "password_hash": hash_password(spec["password"]),
                "name": spec["name"],
                "role": "caregiver",
                "plan": "family",
                "household_id": None,
                "is_admin": True,
                "admin_role": spec["role"],
                "totp_enabled": False,
                "failed_login_count": 0,
                "lockout_until": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            print(f"Created {spec['email']} (password: {spec['password']}) — CHANGE ON FIRST LOGIN.")

    # 3. Print summary
    count = await db.users.count_documents({"admin_role": {"$in": ["super_admin", "operations_admin", "support_admin", "content_admin"]}})
    print(f"\nTotal admins: {count}")
    super_count = await db.users.count_documents({"admin_role": "super_admin"})
    print(f"Super admins: {super_count} (minimum 2 required by policy)")


if __name__ == "__main__":
    asyncio.run(main())
