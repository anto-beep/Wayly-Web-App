"""Clean non-admin (test) users from a Wayly database — KEEPS only the admins.

SAFETY:
  * Dry-run by default: prints exactly what WOULD be deleted, changes nothing.
  * Requires --apply to actually delete users.
  * Requires --purge-data (with --apply) to also delete those users' owned data.
  * Reads MONGO_URL / DB_NAME from the environment, so it targets whichever
    database that env points at. To clean PRODUCTION, run it in a context where
    MONGO_URL/DB_NAME point at the production database, AFTER taking a backup.

USAGE:
  python scripts/clean_prod_users.py                 # dry run (safe)
  python scripts/clean_prod_users.py --apply         # delete non-admin users
  python scripts/clean_prod_users.py --apply --purge-data   # + their data

ALWAYS back up the database before running with --apply.
"""
import argparse
import asyncio
import os
import sys

from motor.motor_asyncio import AsyncIOMotorClient

# The only accounts to KEEP. Everything else is treated as a test/demo user.
ADMIN_EMAILS = {
    "hello@wayly.com.au",
    "support@wayly.com.au",
    "hello@techglove.com.au",
}

# Collections that store per-user data, keyed by these fields.
USER_DATA_COLLECTIONS = [
    "statements", "invoices", "correspondence", "care_plans",
    "notifications", "sessions", "refresh_tokens", "households",
    "participants", "documents", "budget_scenarios",
]
USER_FK_FIELDS = ["user_id", "owner_id", "created_by", "household_id"]


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="actually delete (default: dry run)")
    ap.add_argument("--purge-data", action="store_true", help="also delete deleted users' data")
    args = ap.parse_args()

    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    if not mongo_url or not db_name:
        print("ERROR: MONGO_URL and DB_NAME must be set in the environment.")
        sys.exit(1)

    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]

    print(f"Database: {db_name}  ({mongo_url.split('@')[-1]})")
    print(f"Admins kept: {sorted(ADMIN_EMAILS)}")
    print(f"Mode: {'APPLY (destructive)' if args.apply else 'DRY RUN (no changes)'}"
          f"{' + PURGE DATA' if args.purge_data else ''}\n")

    admins_lower = {e.lower() for e in ADMIN_EMAILS}
    total = await db.users.count_documents({})
    victims = []
    kept = []
    async for u in db.users.find({}, {"_id": 0, "id": 1, "email": 1}):
        email = (u.get("email") or "").lower()
        (kept if email in admins_lower else victims).append(u)

    print(f"Total users: {total}")
    print(f"Would KEEP ({len(kept)}): {sorted([u.get('email') for u in kept])}")
    print(f"Would DELETE ({len(victims)}) test/non-admin users.")
    for u in victims[:25]:
        print(f"   - {u.get('email')}  ({u.get('id')})")
    if len(victims) > 25:
        print(f"   … and {len(victims) - 25} more")

    if not args.apply:
        print("\nDry run only. Re-run with --apply (after a backup) to delete.")
        client.close()
        return

    victim_ids = [u.get("id") for u in victims if u.get("id")]
    res = await db.users.delete_many({"id": {"$in": victim_ids}})
    print(f"\nDeleted {res.deleted_count} users.")

    if args.purge_data:
        for coll in USER_DATA_COLLECTIONS:
            q = {"$or": [{f: {"$in": victim_ids}} for f in USER_FK_FIELDS]}
            r = await db[coll].delete_many(q)
            if r.deleted_count:
                print(f"  purged {r.deleted_count} docs from {coll}")
    print("Done.")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
