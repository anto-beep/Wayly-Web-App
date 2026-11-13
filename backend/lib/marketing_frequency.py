"""Central marketing-email frequency governor (web + mobile share one backend).

A SINGLE chokepoint that EVERY marketing send path must consult immediately
before sending — lifecycle emails, admin campaigns and any future newsletter.
It enforces, per recipient:

  * <= 2 marketing emails per rolling 7 days
  * <= 4 marketing emails per rolling 30 days
  * >= 72 hours between any two marketing emails
  * <= 1 OPTIONAL marketing email during the whole 7-day trial

Essential account / security / billing (transactional) email is NOT marketing
and is never throttled here.

Every actual marketing send records one row in `marketing_sends` (hash-only,
no address, no body) so the caps are computed from a shared ledger.
"""
from __future__ import annotations
import os
import uuid
import logging
from datetime import datetime, timezone, timedelta

from lib.email_governance import email_hash, normalize_email, EmailHashSecretMissing

log = logging.getLogger("wayly.marketing_freq")

try:
    from constants import TRIAL_DAYS as _TRIAL_DAYS
    TRIAL_DAYS = int(_TRIAL_DAYS)
except Exception:  # pragma: no cover
    TRIAL_DAYS = 7

MAX_PER_7D = int(os.environ.get("MARKETING_MAX_PER_7D", "2"))
MAX_PER_30D = int(os.environ.get("MARKETING_MAX_PER_30D", "4"))
MIN_GAP_HOURS = int(os.environ.get("MARKETING_MIN_GAP_HOURS", "72"))
TRIAL_OPTIONAL_MAX = int(os.environ.get("MARKETING_TRIAL_OPTIONAL_MAX", "1"))


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(iso: str):
    try:
        return datetime.fromisoformat((iso or "").replace("Z", "+00:00"))
    except Exception:
        return None


async def ensure_indexes(db) -> None:
    await db.marketing_sends.create_index([("email_hash", 1), ("sent_at", -1)])


async def can_send_now(db, email: str, *, now: datetime | None = None):
    """Return (ok, reason). Call IMMEDIATELY before a marketing send.

    Raises nothing for a missing hash secret — it returns
    (False, 'hash_unavailable') so callers fail closed.
    """
    now = now or _now()
    try:
        eh = email_hash(email)
    except EmailHashSecretMissing:
        return False, "hash_unavailable"

    # >= 72h since the last marketing email.
    last = await db.marketing_sends.find_one({"email_hash": eh}, sort=[("sent_at", -1)])
    if last and (lt := _parse(last.get("sent_at"))):
        if (now - lt) < timedelta(hours=MIN_GAP_HOURS):
            return False, "min_gap_72h"

    # Rolling 7-day cap.
    c7 = await db.marketing_sends.count_documents(
        {"email_hash": eh, "sent_at": {"$gte": (now - timedelta(days=7)).isoformat()}})
    if c7 >= MAX_PER_7D:
        return False, "cap_7d"

    # Rolling 30-day cap.
    c30 = await db.marketing_sends.count_documents(
        {"email_hash": eh, "sent_at": {"$gte": (now - timedelta(days=30)).isoformat()}})
    if c30 >= MAX_PER_30D:
        return False, "cap_30d"

    # <= 1 OPTIONAL marketing email during an ACTIVE trial.
    u = await db.users.find_one({"email": normalize_email(email)}, {"_id": 0, "id": 1})
    if u:
        sub = await db.subscriptions.find_one(
            {"user_id": u["id"]}, {"_id": 0, "status": 1, "trial_ends_at": 1})
        if sub and sub.get("status") == "trialing" and sub.get("trial_ends_at"):
            te = _parse(sub["trial_ends_at"])
            if te:
                trial_start = te - timedelta(days=TRIAL_DAYS)
                in_trial = await db.marketing_sends.count_documents(
                    {"email_hash": eh, "sent_at": {"$gte": trial_start.isoformat()}})
                if in_trial >= TRIAL_OPTIONAL_MAX:
                    return False, "trial_quota"
    return True, "ok"


async def record_send(db, email: str, *, category: str, kind: str,
                      now: datetime | None = None) -> None:
    """Record ONE marketing send in the shared ledger (hash only)."""
    now = now or _now()
    await db.marketing_sends.insert_one({
        "id": uuid.uuid4().hex,
        "email_hash": email_hash(email),
        "category": category,   # e.g. 'lifecycle' | 'admin_campaign' | 'newsletter'
        "kind": kind,           # e.g. 'trial_midtrial' | 'campaign'
        "sent_at": now.isoformat(),
    })
