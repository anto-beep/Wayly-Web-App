"""Idempotent PRODUCTION seed/migration for the 15 approved Help Centre articles.

WHY: On Emergent, preview and production use SEPARATE MongoDB databases. The first
deploy migrated preview→production as a one-time snapshot; every subsequent Publish
ships CODE ONLY. The 15 Help Centre articles were approved+published in PREVIEW
*after* the first deploy, so they are NOT in production yet and must be seeded once.

This script is idempotent and NON-DESTRUCTIVE:
  * inserts an article if its slug is missing in the target DB;
  * if the slug exists and is NOT yet published, updates it from the export;
  * if the slug exists and is ALREADY published, it is LEFT UNTOUCHED (never
    overwrites newer/edited production content) — reconcile, never duplicate.

USAGE (run against PRODUCTION — provide the production connection string; do NOT
hardcode secrets):
    PROD_MONGO_URL="mongodb+srv://..." PROD_DB_NAME="<app>-mydb" \
        python3 scripts/seed_help_articles_prod.py
Dry run (no writes):
    PROD_MONGO_URL=... PROD_DB_NAME=... python3 scripts/seed_help_articles_prod.py --dry-run

It reads scripts/help_articles_export.json (committed alongside this script).
"""
import asyncio
import json
import os
import sys
from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient

EXPORT = Path(__file__).with_name("help_articles_export.json")


async def main() -> None:
    dry = "--dry-run" in sys.argv
    url = os.environ.get("PROD_MONGO_URL") or os.environ.get("MONGO_URL")
    name = os.environ.get("PROD_DB_NAME") or os.environ.get("DB_NAME")
    if not url or not name:
        print("ERROR: set PROD_MONGO_URL and PROD_DB_NAME (production connection).")
        sys.exit(1)
    articles = json.loads(EXPORT.read_text())
    db = AsyncIOMotorClient(url)[name]
    inserted = updated = skipped = 0
    for a in articles:
        slug = a.get("slug")
        if not slug:
            continue
        existing = await db.help_articles.find_one({"slug": slug}, {"status": 1})
        if existing is None:
            print(f"INSERT  {slug}")
            if not dry:
                await db.help_articles.insert_one(a)
            inserted += 1
        elif existing.get("status") == "published":
            print(f"SKIP    {slug} (already published in production — preserved)")
            skipped += 1
        else:
            print(f"UPDATE  {slug} (existing status={existing.get('status')})")
            if not dry:
                await db.help_articles.update_one({"slug": slug}, {"$set": a})
            updated += 1
    print(f"\nDone{' (dry run)' if dry else ''}: inserted={inserted} updated={updated} "
          f"skipped={skipped} total_in_export={len(articles)}")


if __name__ == "__main__":
    asyncio.run(main())
