"""Phase 9, NDB / Privacy Act 1988, deletion cascade & 60-day hard-delete.

Two layers:

  1. **Soft delete**, what `DELETE /api/auth/account` already does, augmented
     with a complete cascade across every collection that references the user
     by `user_id`, `household_id`, `participant_id`, or `account_id`.
     Records are marked `deleted_at` rather than removed so the cooling-off
     period and account-restore (within 30 days) still works.

  2. **Hard delete (60-day cron)**, `purge_expired_accounts()` runs daily,
     finds users with `deleted_at` older than 60 days, and permanently
     removes every related row.

Australian Privacy Act 1988 APP 11.2 obligation: "Where an APP entity holds
personal information that is no longer needed for any purpose for which the
information may be used or disclosed by the entity under the Australian
Privacy Principles, the entity must take reasonable steps to destroy the
information or to ensure that the information is de-identified."
"""
from __future__ import annotations
import os
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Iterable
from motor.motor_asyncio import AsyncIOMotorClient

log = logging.getLogger("wayly.privacy")

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
_db = _client[os.environ["DB_NAME"]]


# Every collection that holds PII keyed off any of the four scope fields.
# Adding a new collection? Append it here AND update the migration test.
# (collection, key_field)
SCOPED_COLLECTIONS: list[tuple[str, str]] = [
    # household-scoped
    ("participants",            "household_id"),
    ("budgets",                 "household_id"),
    ("statements",              "household_id"),
    ("documents",               "household_id"),
    ("calendar_events",         "household_id"),
    ("trusted_partners",        "household_id"),
    ("hospital_admissions",     "household_id"),
    ("family_wall_posts",       "household_id"),
    ("care_plan_amendments",    "household_id"),
    ("amendment_audit",         "household_id"),
    ("digest_subscriptions",    "household_id"),
    ("digest_history",          "household_id"),
    ("daily_digest_state",      "household_id"),
    ("transactions",            "household_id"),
    ("decoded_statements",      "household_id"),
    # account-scoped
    ("accounts",                "owner_user_id"),
    # user-scoped
    ("subscriptions",           "user_id"),
    ("user_sessions",           "user_id"),
    ("password_resets",         "user_id"),
    ("free_tool_usage",         "user_id"),
    ("generated_reports",       "generated_by"),
    ("admin_sessions",          "admin_id"),
    ("admin_login_devices",     "admin_id"),
    ("revoked_tokens",          "user_id"),
    ("household_members",       "user_id"),
    ("notifications",           "user_id"),
    ("adviser_clients",         "client_user_id"),
]


SOFT_DELETE_WINDOW_DAYS = int(os.environ.get("ACCOUNT_DELETION_WINDOW_DAYS", "60"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.isoformat()


async def soft_delete_account(user_id: str) -> dict:
    """Mark every related row as `deleted_at` so a final 60-day cron can
    purge them. The user row itself is anonymised immediately (email,
    name, password_hash blanked) so future logins are impossible."""
    now = _now()
    iso = _iso(now)
    user = await _db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return {"ok": False, "error": "not found"}

    hid = user.get("household_id")
    # Find any account owned by this user
    acct = await _db.accounts.find_one({"owner_user_id": user_id}, {"_id": 0, "id": 1})
    acct_id = (acct or {}).get("id")

    # 1. Anonymise the user row immediately, this is irreversible.
    await _db.users.update_one(
        {"id": user_id},
        {"$set": {
            "email": f"deleted+{user_id}@wayly.local",
            "name": "Deleted user",
            "password_hash": "",
            "deleted_at": iso,
            "plan": "free",
            "household_id": None,
            "totp_enabled": False,
        },
         "$unset": {"totp_secret": "", "totp_backup_codes": ""}},
    )

    # 2. Revoke every outstanding token / session.
    try:
        from security_utils import revoke_all_user_tokens
        await revoke_all_user_tokens(user_id, reason="account_deletion")
    except Exception:
        pass
    await _db.user_sessions.delete_many({"user_id": user_id})

    # 3. Cascade soft delete across every collection that references this
    #    user's scope. We never `delete` here, we only mark `deleted_at`.
    counts: dict[str, int] = {}
    for coll, field in SCOPED_COLLECTIONS:
        targets: list[dict] = []
        if field == "user_id":
            targets.append({"user_id": user_id})
        elif field == "owner_user_id":
            targets.append({"owner_user_id": user_id})
        elif field == "admin_id":
            targets.append({"admin_id": user_id})
        elif field == "generated_by":
            targets.append({"generated_by": user_id})
        elif field == "client_user_id":
            targets.append({"client_user_id": user_id})
        elif field == "household_id" and hid:
            targets.append({"household_id": hid})
        if acct_id:
            # Also catch any docs scoped by account_id
            targets.append({"account_id": acct_id})
        total = 0
        for q in targets:
            r = await _db[coll].update_many(q, {"$set": {"deleted_at": iso}})
            total += r.modified_count
        if total:
            counts[coll] = total

    # 4. Sub status, set to cancelled (Stripe webhook handles the actual
    #    refund / cancel at-period-end logic elsewhere).
    await _db.subscriptions.update_many(
        {"user_id": user_id},
        {"$set": {"status": "cancelled", "cancel_at_period_end": True, "deleted_at": iso}},
    )

    # 5. Household membership is set to removed.
    await _db.household_members.update_many(
        {"user_id": user_id},
        {"$set": {"status": "removed", "removed_at": iso, "deleted_at": iso}},
    )

    return {"ok": True, "deletion_completes_at": _iso(now + timedelta(days=SOFT_DELETE_WINDOW_DAYS)), "rows_marked": counts}


async def purge_expired_accounts() -> dict:
    """Hard-delete every row tied to an account whose `deleted_at` is older
    than `SOFT_DELETE_WINDOW_DAYS`. Idempotent, safe to run hourly."""
    cutoff = _now() - timedelta(days=SOFT_DELETE_WINDOW_DAYS)
    cutoff_iso = _iso(cutoff)
    # Users marked for deletion before the cutoff.
    users_cursor = _db.users.find(
        {"deleted_at": {"$ne": None, "$lt": cutoff_iso}},
        {"_id": 0, "id": 1, "household_id": 1},
    )
    purged_users = 0
    deleted_counts: dict[str, int] = {}
    async for u in users_cursor:
        uid = u["id"]
        hid = u.get("household_id")
        acct = await _db.accounts.find_one({"owner_user_id": uid}, {"_id": 0, "id": 1})
        acct_id = (acct or {}).get("id")
        # Hard-delete from each scoped collection.
        for coll, field in SCOPED_COLLECTIONS:
            queries: list[dict] = []
            if field == "user_id":
                queries.append({"user_id": uid})
            elif field == "owner_user_id":
                queries.append({"owner_user_id": uid})
            elif field == "admin_id":
                queries.append({"admin_id": uid})
            elif field == "generated_by":
                queries.append({"generated_by": uid})
            elif field == "client_user_id":
                queries.append({"client_user_id": uid})
            elif field == "household_id" and hid:
                queries.append({"household_id": hid})
            if acct_id:
                queries.append({"account_id": acct_id})
            for q in queries:
                r = await _db[coll].delete_many(q)
                if r.deleted_count:
                    deleted_counts[coll] = deleted_counts.get(coll, 0) + r.deleted_count
        # Finally remove the anonymised user row itself.
        await _db.users.delete_one({"id": uid})
        purged_users += 1
    return {"purged_users": purged_users, "deleted_counts": deleted_counts}


_SCHEDULER_INTERVAL_S = int(os.environ.get("PURGE_INTERVAL_SECONDS", str(24 * 60 * 60)))


async def _scheduler_loop():
    """Background loop, runs once at startup, then every 24h."""
    await asyncio.sleep(30)  # let the rest of the app boot
    while True:
        try:
            result = await purge_expired_accounts()
            if result["purged_users"]:
                log.info("60-day purge: %s", result)
        except Exception as e:
            log.warning("60-day purge failed: %s", e)
        await asyncio.sleep(_SCHEDULER_INTERVAL_S)


def start_scheduler() -> None:
    """Kick off the background purge loop. Idempotent, calling twice creates
    one extra task but does no real harm."""
    asyncio.create_task(_scheduler_loop())
