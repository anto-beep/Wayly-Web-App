"""One-off: Title Case the 15 starter Help Centre article titles (founder
request). Updates by slug only; status stays 'draft'. Idempotent."""
from __future__ import annotations
import os, asyncio
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

TITLES = {
    "what-is-wayly": "What Is Wayly and Who Is It For?",
    "is-wayly-a-provider": "Is Wayly a Support at Home Provider?",
    "how-the-free-trial-works": "How the 7-Day Free Trial Works",
    "why-card-details-at-signup": "Why Do You Ask for Card Details at Sign-Up?",
    "wayly-plans-and-pricing": "Wayly Plans and Pricing",
    "how-to-cancel": "How to Cancel Your Subscription",
    "how-statement-decoder-works": "How the Statement Decoder Works",
    "decoder-no-account": "Do I Need an Account to Use the Statement Decoder?",
    "how-invoice-checker-works": "How the Invoice Checker Works",
    "what-is-ask-wayly": "What Is Ask Wayly and What Can It Answer?",
    "where-is-my-data-stored": "Where Is My Data Stored and Is It Safe?",
    "export-or-delete-data": "How to Export or Delete Your Data",
    "didnt-get-email": "I Didn't Get My Verification or Reset Email",
    "what-is-support-at-home": "What Is Support at Home?",
    "wayly-tools-overview": "Wayly Tools at a Glance",
}


async def main():
    updated = 0
    for slug, title in TITLES.items():
        res = await db.help_articles.update_one(
            {"slug": slug},
            {"$set": {"title": title, "updated_at": datetime.now(timezone.utc).isoformat()}})
        updated += res.modified_count
    print(f"updated {updated} / {len(TITLES)} titles")


if __name__ == "__main__":
    asyncio.run(main())
