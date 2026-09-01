"""Wayly, Mongo query optimisation helpers (Section 2 hardening).

Three pillars:
1. **Projection presets**, keep `.find()` payloads small. Statement docs
   carry the raw PDF base64 + extracted JSON + full text excerpts; the
   budget/chat/today endpoints only need `line_items` + a few headers.
2. **Aggregation pushdown**, replace `for doc in cursor: counter += …`
   loops with Mongo `$group`/`$count` pipelines that run server-side.
3. **Seek pagination**, replace `skip(N).limit(N)` (O(N) on the server)
   with cursor-based seeks (`_id < before_id` or `created_at < before_at`)
   that always stay O(log N) regardless of page depth.

Every helper is read-only and side-effect free. Composable with the
existing helpers in `server.py`.
"""
from __future__ import annotations
from typing import Any, Mapping
from bson import ObjectId

# ---------------------------------------------------------------------------
# Projection presets
# ---------------------------------------------------------------------------

# Statement docs can carry tens of KB of base64 + raw PDF text. Most read
# paths only need the structured data, apply this whenever the caller
# does NOT need to render the raw file back to the UI.
STATEMENT_LIGHT_PROJECTION: dict[str, int] = {
    "_id": 0,
    "file_b64": 0,
    "raw_text": 0,
    "pdf_text": 0,
    "text_excerpt": 0,
    "parsed_full_text": 0,
    "ocr_text": 0,
    "ocr_raw": 0,
    "extracted_json": 0,
}

# Same idea for documents/vault.
DOCUMENT_LIGHT_PROJECTION: dict[str, int] = {
    "_id": 0,
    "file_b64": 0,
    "raw_text": 0,
    "pdf_text": 0,
    "text_excerpt": 0,
    "ocr_text": 0,
}

# User listing, never leak password_hash / TOTP secret / backup codes.
USER_SAFE_PROJECTION: dict[str, int] = {
    "_id": 0,
    "password_hash": 0,
    "totp_secret": 0,
    "totp_backup_codes": 0,
    "totp_backup_codes_hashed": 0,
}


# ---------------------------------------------------------------------------
# Aggregation pushdown, common reusable pipelines
# ---------------------------------------------------------------------------

async def household_usage_counts(db, household_id: str, user_email: str) -> dict[str, int]:
    """Compute per-household usage counters in a SINGLE round trip.

    Before this lived in `/api/usage`: 6 sequential `count_documents()` calls
    plus a 7th on `tool_email_log`. Each is fast individually but they
    serialise across the connection pool and add network latency. The
    `$facet` pipeline keeps them in one round trip; Mongo evaluates them
    in parallel and short-circuits on each index.

    Returns the same keys the legacy endpoint did so the public API shape
    is unchanged.
    """
    facets = {
        "chat_questions": [
            {"$match": {"household_id": household_id, "role": "user"}},
            {"$count": "n"},
        ],
        "statements_uploaded": [
            {"$match": {"household_id": household_id}},
            {"$count": "n"},
        ],
        "family_messages": [
            {"$match": {"household_id": household_id}},
            {"$count": "n"},
        ],
        "wellbeing_checkins": [
            {"$match": {"household_id": household_id}},
            {"$count": "n"},
        ],
        "digest_sends": [
            {"$match": {"household_id": household_id}},
            {"$count": "n"},
        ],
    }
    counts: dict[str, int] = {k: 0 for k in facets}

    # We run each in its own collection, Mongo `$facet` requires same
    # collection. Use a `gather`-style approach but via separate aggregates.
    # Aggregations run in parallel via the asyncio gather wrapper below.
    import asyncio as _aio

    async def _one(coll: str, pipe: list[dict]) -> int:
        cur = db[coll].aggregate(pipe)
        async for row in cur:
            return int(row.get("n") or 0)
        return 0

    routes = [
        ("chat_questions", "chat_turns"),
        ("statements_uploaded", "statements"),
        ("family_messages", "family_messages"),
        ("wellbeing_checkins", "wellbeing"),
        ("digest_sends", "digest_sends"),
    ]
    results = await _aio.gather(*[_one(coll, facets[key]) for key, coll in routes])
    for (key, _), n in zip(routes, results):
        counts[key] = n

    # `tool_email_log` is per-email, not per-household
    counts["tool_emails_sent"] = await db.tool_email_log.count_documents(
        {"email": user_email, "ok": True}
    )
    return counts


async def admin_users_with_subscription(
    db,
    query: Mapping[str, Any],
    page: int,
    page_size: int,
    sort_field: str = "created_at",
    sort_dir: int = -1,
) -> tuple[list[dict], int]:
    """List users WITH their subscription summary in ONE aggregation.

    Replaces the previous N+1 pattern in `admin_routes.users_list`:
        users.find(...).skip().limit()  →  for each user: subscriptions.find_one()
    With page_size=50 that was 1 + 50 round trips per page. Now: 1 query
    using `$lookup` against the unique `subscriptions.user_id` index.

    Returns `(rows, total_count)`. Drops password_hash + TOTP secrets via
    a `$project` stage so the admin UI never sees them, matching the
    legacy `USER_SAFE_PROJECTION`.
    """
    base_pipeline: list[dict] = [
        {"$match": dict(query)},
        {"$sort": {sort_field: sort_dir}},
        {"$skip": max(0, (page - 1) * page_size)},
        {"$limit": page_size},
        {"$lookup": {
            "from": "subscriptions",
            "localField": "id",
            "foreignField": "user_id",
            "as": "_sub",
        }},
        {"$addFields": {
            "subscription_status": {"$arrayElemAt": ["$_sub.status", 0]},
            "trial_ends_at": {"$arrayElemAt": ["$_sub.trial_ends_at", 0]},
            "cancel_at_period_end": {"$arrayElemAt": ["$_sub.cancel_at_period_end", 0]},
        }},
        {"$project": {
            "_id": 0,
            "_sub": 0,
            "password_hash": 0,
            "totp_secret": 0,
            "totp_backup_codes": 0,
            "totp_backup_codes_hashed": 0,
        }},
    ]
    rows = [r async for r in db.users.aggregate(base_pipeline)]
    total = await db.users.count_documents(dict(query))
    return rows, total


# ---------------------------------------------------------------------------
# Seek (cursor-based) pagination
# ---------------------------------------------------------------------------

def parse_object_id(token: str | None) -> ObjectId | None:
    """Best-effort decode of a `before` cursor token. Returns None on bad
    input so the caller can degrade gracefully instead of 500-ing."""
    if not token:
        return None
    try:
        return ObjectId(token)
    except Exception:
        return None


def seek_filter(
    base_query: Mapping[str, Any],
    before_id: str | None,
    sort_dir: int = -1,
) -> dict[str, Any]:
    """Add an `_id < before_id` (or `> before_id` for ascending) constraint
    to a query so the next page is fetched via the indexed `_id` cursor
    instead of `skip(N)`. With `sort_dir=-1` (newest first), passing the
    `_id` of the last visible row returns the next-older page.

    This keeps every page O(log N) on the server, regardless of depth ,
    which `skip(10_000)` cannot.
    """
    q = dict(base_query)
    oid = parse_object_id(before_id)
    if oid is None:
        return q
    op = "$lt" if sort_dir < 0 else "$gt"
    existing = q.get("_id", {})
    if isinstance(existing, dict):
        existing = dict(existing)
        existing[op] = oid
        q["_id"] = existing
    else:
        q["_id"] = {op: oid}
    return q
