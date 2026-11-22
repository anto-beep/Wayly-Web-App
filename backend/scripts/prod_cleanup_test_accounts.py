"""Production cleanup: remove TEST accounts (and their data) from a database,
keeping all admin accounts. DRY-RUN by default — nothing is deleted unless you
pass --confirm.

CONTEXT
    Test accounts (e.g. sam@test.com, *@example.com) were reportedly reachable
    in production. This script prepares a safe, auditable cleanup. It also
    documents that prod and test MUST use SEPARATE databases (distinct DB_NAME)
    so seed/test data can never leak into prod again — that separation is a
    deploy/config action and cannot be performed from this preview.

SAFETY
    - DRY-RUN by default: prints exactly what WOULD be deleted, changes nothing.
    - Never touches admin accounts (role == "admin" or is_admin == true).
    - Refuses to run unless you explicitly point it at the target DB via env
      (MONGO_URL / DB_NAME) and pass --confirm to actually delete.
    - Cascades cleanup across the per-user collections so no orphans remain.

USAGE (run against the PROD connection string, never from preview automatically):
    # 1. See what would be removed (safe):
    MONGO_URL="<prod-url>" DB_NAME="<prod-db>" python3 prod_cleanup_test_accounts.py
    # 2. Actually delete:
    MONGO_URL="<prod-url>" DB_NAME="<prod-db>" python3 prod_cleanup_test_accounts.py --confirm

Adjust TEST_EMAIL_PATTERNS / TEST_EMAIL_ALLOWLIST below to taste before running.
"""
from __future__ import annotations

import asyncio
import os
import re
import sys

from motor.motor_asyncio import AsyncIOMotorClient

# Emails matching ANY of these (case-insensitive) are considered test accounts.
TEST_EMAIL_PATTERNS = [
    r"@test\.com$",
    r"@example\.com$",
    r"@example\.org$",
    r"@mailinator\.com$",
    r"@wayly\.test$",
    r"\+test\d*@",
    r"^sam@test\.com$",
    r"^test[^@]*@",
    r"^qa[^@]*@",
    r"^demo[^@]*@",
]
# Emails here are ALWAYS kept even if they match a pattern (e.g. a real admin
# that happens to sit on example.com). Add known-good addresses before running.
TEST_EMAIL_ALLOWLIST: set[str] = set()

# Collections keyed by the account's user id (cascade cleanup).
USER_SCOPED_COLLECTIONS = [
    "households", "participants", "statements", "invoices", "lf1_correspondence",
    "care_plans", "cpr_reviews", "cpr_review_jobs", "budget_scenarios", "pacing_entries",
    "complaints", "contacts", "documents", "calendar_events", "family_messages",
    "notifications", "sessions", "audit_log", "llm_calls", "usage_events",
    "referrals", "ratings", "amendments", "handover_packs", "support_tickets",
]

_PATTERNS = [re.compile(p, re.IGNORECASE) for p in TEST_EMAIL_PATTERNS]


def _is_admin(u: dict) -> bool:
    if u.get("is_admin") is True:
        return True
    role = str(u.get("role") or "").lower()
    return role in ("admin", "superadmin", "owner_admin")


def _is_test_email(email: str) -> bool:
    e = (email or "").strip().lower()
    if not e or e in TEST_EMAIL_ALLOWLIST:
        return False
    return any(p.search(e) for p in _PATTERNS)


async def main(confirm: bool) -> None:
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("[abort] MONGO_URL and DB_NAME must be set (point at the TARGET db).")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    print(f"[db] {db_name}  (dry-run={not confirm})\n")

    users = await db.users.find({}, {"_id": 0, "id": 1, "email": 1, "role": 1, "is_admin": 1, "household_id": 1}).to_list(length=100000)
    admins = [u for u in users if _is_admin(u)]
    targets = [u for u in users if _is_test_email(u.get("email", "")) and not _is_admin(u)]

    print(f"[scan] {len(users)} users total · {len(admins)} admins (kept) · {len(targets)} test accounts to remove")
    for u in targets:
        print(f"   - {u.get('email')} (id={u.get('id')})")
    if not targets:
        print("[done] nothing to remove.")
        return

    if not confirm:
        print("\n[dry-run] no changes made. Re-run with --confirm to delete the above.")
        return

    user_ids = [u["id"] for u in targets if u.get("id")]
    household_ids = [u["household_id"] for u in targets if u.get("household_id")]
    total = 0
    res = await db.users.delete_many({"id": {"$in": user_ids}})
    total += res.deleted_count
    print(f"[delete] users: {res.deleted_count}")
    for coll in USER_SCOPED_COLLECTIONS:
        c = db[coll]
        q = {"$or": [{"user_id": {"$in": user_ids}}, {"household_id": {"$in": household_ids}}]}
        r = await c.delete_many(q)
        if r.deleted_count:
            print(f"[delete] {coll}: {r.deleted_count}")
            total += r.deleted_count
    print(f"\n[done] removed {total} documents across {len(targets)} test accounts. Admins untouched.")


if __name__ == "__main__":
    asyncio.run(main("--confirm" in sys.argv))
