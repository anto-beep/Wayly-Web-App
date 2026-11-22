"""Seed overdue + upcoming LF-1 follow-up letters for the demo account so the
mailbox Follow-ups panel and the bulk chase-up flow are exercisable end-to-end.

Usage: python3 /app/backend/scripts/seed_followups.py [email]
Idempotent: clears previously seeded rows (is_seed_followup=True) first.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import secrets
import sys

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


def _iso() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


def _date_offset(days: int) -> str:
    return (dt.date.today() + dt.timedelta(days=days)).isoformat()


async def main(email: str) -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    user = await db.users.find_one({"email": email}, {"_id": 0, "id": 1, "household_id": 1})
    if not user:
        print(f"[seed] no user for {email}")
        return
    uid = user["id"]
    hid = user.get("household_id")
    primary = await db.participants.find_one(
        {"household_id": hid, "is_primary": True, "status": {"$ne": "REMOVED"}}, {"_id": 0, "id": 1}
    ) if hid else None
    pid = (primary or {}).get("id")

    await db.lf1_correspondence.delete_many({"user_id": uid, "is_seed_followup": True})

    fixtures = [
        ("dispute", 3, "Dispute a Support at Home statement charge for Dorothy", -12),
        ("request", 6, "Request a review of Dorothy's support plan", -6),
        ("complaint", 4, "Complaint about a missed domestic assistance visit", -2),
        ("request", 1, "Request a reassessment for Dorothy", 2),
    ]
    made = []
    for archetype, situation_id, label, offset in fixtures:
        entry_id = secrets.token_urlsafe(12)
        due = _date_offset(offset)
        body = (
            f"Subject: {label}\n\n"
            "Dear BlueBerry Care team,\n\n"
            f"I am writing on behalf of my mother, Dorothy, regarding {label.lower()}. "
            "I am her adult daughter and recorded representative.\n\n"
            "Could you please review this matter and confirm the outcome in writing. I would appreciate a "
            "response within 14 days so we can keep her supports on track.\n\n"
            "If you need any further information from me, please let me know and I will provide it promptly.\n\n"
            "Kind regards,\nCathy"
        )
        doc = {
            "id": entry_id,
            "user_id": uid,
            "participant_id": pid,
            "direction": "outbound",
            "archetype": archetype,
            "situation_id": situation_id,
            "situation_label": label,
            "recipient_type": "provider_cm",
            "recipient_specific": {"entity_name": "BlueBerry Care"},
            "sender_identity": "family_caregiver",
            "sender_authority_basis": "Adult daughter and recorded representative",
            "complaint_mode": "open" if archetype == "complaint" else None,
            "atsi_preference": False,
            "content_draft": body,
            "content_final": body,
            "draft_versions": [],
            "output_formats_generated": ["pdf"],
            "status": "sent",
            "sent_at": _iso(),
            "sent_via": "email",
            "expected_response_by": due,
            "follow_up_date": due,
            "response_received_at": None,
            "response_summary": None,
            "next_action_suggested": None,
            "source_import": None,
            "intake": {"subject": label, "participant_name": "Dorothy"},
            "shared_with": [],
            "sign_off_required": False,
            "sign_off_by": None,
            "sign_off_at": None,
            "replies_to": None,
            "inbound_source": None,
            "inbound_received_at": None,
            "feedback": None,
            "terms_ack": True,
            "is_seed_followup": True,
            "created_at": _iso(),
            "updated_at": _iso(),
        }
        await db.lf1_correspondence.insert_one(doc)
        made.append((entry_id, label, due))

    print(f"[seed] inserted {len(made)} follow-up letters for {email} (user={uid}):")
    for eid, label, due in made:
        print(f"   {eid}  due {due}  {label}")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "cathy@example.com"
    asyncio.run(main(target))
