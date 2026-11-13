"""Phase 3A.1 — idempotent migration of legacy Phase-D support tickets into
the authoritative SUP-* system.

  support_tickets  -> sup_tickets   (channel="manual", provenance stamped)
  ticket_messages  -> sup_messages  (internal notes -> visibility="internal")
  (+ a 'created' sup_event per migrated ticket, stamped migrated=true)

Guarantees
----------
* Idempotent: a ticket already migrated (sup_tickets.migrated_from.legacy_id)
  is skipped. Re-running inserts nothing new.
* Non-destructive: legacy collections are READ ONLY here; nothing is deleted
  or mutated in support_tickets / ticket_messages.
* Every migrated document carries migration_batch_id + migrated_from so the
  rollback can remove exactly the migration-created docs and nothing else.

Usage
-----
  python scripts/migrate_legacy_tickets_to_sup.py --dry-run
  python scripts/migrate_legacy_tickets_to_sup.py --apply
  python scripts/migrate_legacy_tickets_to_sup.py --rollback
"""
from __future__ import annotations

import os
import sys
import uuid
import argparse
import asyncio
from datetime import datetime, timezone

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

db = AsyncIOMotorClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]

STATUS_MAP = {
    "open": "received", "in_progress": "under_review",
    "waiting_on_user": "awaiting_user", "resolved": "resolved", "closed": "closed",
}
PRIORITY_MAP = {"P1": "urgent", "P2": "high", "P3": "normal"}
CATEGORY_MAP = {
    "billing": "billing", "data_privacy": "privacy", "bug": "technical",
    "ai_result": "technical", "feature": "feature_request", "account": "account",
    "other": "other",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _next_reference() -> str:
    doc = await db.sup_counters.find_one_and_update(
        {"_id": "ticket_ref"}, {"$inc": {"seq": 1}}, upsert=True, return_document=True)
    seq = (doc or {}).get("seq") or 1
    return f"WAY-{seq:04d}"


async def migrate(dry_run: bool = False) -> dict:
    batch_id = f"legacy-migration-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}"
    migrated, skipped = [], []
    async for lt in db.support_tickets.find({}, {"_id": 0}):
        legacy_id = lt.get("id")
        existing = await db.sup_tickets.find_one(
            {"migrated_from.legacy_id": legacy_id}, {"_id": 0, "reference": 1})
        if existing:
            skipped.append({"legacy_id": legacy_id, "already": existing.get("reference")})
            continue
        reference = "DRY-RUN" if dry_run else await _next_reference()
        sup_id = uuid.uuid4().hex
        subject = lt.get("subject") or "Support request"
        status = STATUS_MAP.get(lt.get("status"), "received")
        ticket_doc = {
            "id": sup_id,
            "reference": reference,
            "user_id": lt.get("user_id"),
            "user_email": lt.get("user_email"),
            "user_name": lt.get("user_name"),
            "status": status,
            "channel": "manual",
            "category": CATEGORY_MAP.get(lt.get("category"), "other"),
            "subject": subject,
            "user_note": subject,
            "user_claimed_answer": None,
            "user_claimed_source": None,
            "user_claimed_source_detail": None,
            "consent_to_share_statement": False,
            "consent_text_version": None,
            "consent_at": None,
            "linked_defect_id": None,
            "csat_score": None,
            "csat_comment": None,
            "tool_name": None,
            "created_at": lt.get("created_at") or _now(),
            "updated_at": lt.get("last_message_at") or lt.get("created_at") or _now(),
            "resolved_at": lt.get("resolved_at"),
            "priority": PRIORITY_MAP.get(lt.get("priority"), "normal"),
            "assignee_id": lt.get("assigned_admin_id"),
            "assignee_name": None,
            "tags": ["migrated-legacy"],
            "last_activity_at": lt.get("last_message_at") or lt.get("created_at") or _now(),
            "message_count": 0,
            "closed_at": lt.get("resolved_at") if status == "closed" else None,
            "migration_batch_id": batch_id,
            "migrated_from": {"system": "phase_d", "collection": "support_tickets",
                              "legacy_id": legacy_id, "migrated_at": _now()},
        }

        # Messages
        legacy_msgs = [m async for m in db.ticket_messages.find(
            {"ticket_id": legacy_id}, {"_id": 0}).sort("ts", 1)]
        msg_docs = []
        for m in legacy_msgs:
            msg_docs.append({
                "id": uuid.uuid4().hex,
                "ticket_id": sup_id,
                "author_type": "staff" if m.get("author_type") == "admin" else "user",
                "author_id": m.get("author_id"),
                "visibility": "internal" if m.get("is_internal_note") else "public",
                "body": m.get("body") or "",
                "created_at": m.get("ts") or _now(),
                "migration_batch_id": batch_id,
                "migrated_from": {"legacy_message_id": m.get("id"), "legacy_ticket_id": legacy_id},
            })
        ticket_doc["message_count"] = len(msg_docs)

        event_doc = {
            "ticket_id": sup_id,
            "event_type": "created",
            "actor_type": "system",
            "actor_id": None,
            "metadata": {"migrated": True, "legacy_id": legacy_id, "batch": batch_id,
                         "reference": reference},
            "created_at": ticket_doc["created_at"],
            "migration_batch_id": batch_id,
            "migrated_from": {"legacy_ticket_id": legacy_id},
        }

        if not dry_run:
            await db.sup_tickets.insert_one(ticket_doc)
            if msg_docs:
                await db.sup_messages.insert_many(msg_docs)
            await db.sup_events.insert_one(event_doc)
        migrated.append({"legacy_id": legacy_id, "reference": reference,
                         "messages": len(msg_docs)})
    return {"batch_id": batch_id, "dry_run": dry_run,
            "migrated": migrated, "skipped": skipped,
            "migrated_count": len(migrated), "skipped_count": len(skipped)}


async def rollback() -> dict:
    """Delete ONLY migration-created documents (those carrying migrated_from).
    Post-migration legitimate activity (new messages/events without the stamp)
    is preserved and reported, never deleted."""
    tickets = [t async for t in db.sup_tickets.find(
        {"migrated_from.legacy_id": {"$ne": None}}, {"_id": 0, "id": 1, "reference": 1})]
    ticket_ids = [t["id"] for t in tickets]
    preserved = []
    for tid in ticket_ids:
        post = await db.sup_messages.count_documents(
            {"ticket_id": tid, "migrated_from": {"$exists": False}})
        if post:
            preserved.append({"ticket_id": tid, "post_migration_messages": post})
    del_msgs = await db.sup_messages.delete_many({"migrated_from.legacy_ticket_id": {"$ne": None}})
    del_events = await db.sup_events.delete_many({"migrated_from.legacy_ticket_id": {"$ne": None}})
    del_tickets = await db.sup_tickets.delete_many({"migrated_from.legacy_id": {"$ne": None}})
    return {
        "deleted_tickets": del_tickets.deleted_count,
        "deleted_messages": del_msgs.deleted_count,
        "deleted_events": del_events.deleted_count,
        "preserved_post_migration_activity": preserved,
    }


async def _main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--dry-run", action="store_true")
    g.add_argument("--apply", action="store_true")
    g.add_argument("--rollback", action="store_true")
    args = ap.parse_args()
    if args.rollback:
        res = await rollback()
    else:
        res = await migrate(dry_run=args.dry_run)
    import json
    print(json.dumps(res, indent=2, default=str))


if __name__ == "__main__":
    asyncio.run(_main())
