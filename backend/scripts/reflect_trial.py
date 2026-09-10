"""Reflect the real Stripe TEST trial (created via a completed 4242 checkout)
onto the demo user so the billing screen shows a genuine trialing state.
Writes the db.subscriptions doc that GET /api/billing/subscription reads.
Used because the preview slug has no Stripe webhook wired."""
import os, uuid
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
DB = os.environ["DB_NAME"].strip('"')
db = MongoClient(os.environ["MONGO_URL"])[DB]

now = datetime.now(timezone.utc)
trial_ends = (now + timedelta(days=7)).isoformat()

EMAIL = "mobtrial+1786972023@example.com"
u = db.users.find_one({"email": EMAIL})
if not u:
    print(f"user {EMAIL} not found"); raise SystemExit(0)

db.users.update_one({"id": u["id"]}, {"$set": {
    "plan": "solo",
    "stripe_subscription_id": "sub_1U5QL9FXu1wTzvp0e6a2JNmv",
    "subscription_status": "trialing",
}})
db.subscriptions.update_one(
    {"user_id": u["id"]},
    {"$set": {
        "user_id": u["id"], "plan": "solo", "status": "trialing", "had_trial": True,
        "trial_ends_at": trial_ends, "current_period_end": trial_ends,
        "cancel_at_period_end": False,
        "stripe_subscription_id": "sub_1U5QL9FXu1wTzvp0e6a2JNmv",
        "updated_at": now.isoformat(),
    }, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now.isoformat()}},
    upsert=True,
)
print(f"OK reflected trialing/solo subscription for {EMAIL} (trial_ends {trial_ends})")
