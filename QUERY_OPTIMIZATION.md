# Wayly — Query Optimisation Catalogue

> Companion to `/app/INDEXES.md`. Documents the **query patterns** we use
> in the codebase and the helpers in `/app/backend/lib/query_helpers.py`.
> Every pattern here either eliminated a hot Python-side loop, dropped a
> heavy wire payload, or replaced `skip()` with seek pagination.

## 1. Projection presets — `STATEMENT_LIGHT_PROJECTION` & friends

### Problem
Statement docs carry `file_b64` (the original PDF as base64), `raw_text`,
`pdf_text`, `text_excerpt`, `parsed_full_text`, `ocr_text`, `ocr_raw`,
`extracted_json`. Individually each is small; together a single statement
can hit ~80 KB. The budget/today/chat endpoints fetched up to 200 of these
just to consume `line_items`. That's ~16 MB pulled across the wire per call
in the worst case.

### Helper
```python
from lib.query_helpers import STATEMENT_LIGHT_PROJECTION
docs = await db.statements.find(q, STATEMENT_LIGHT_PROJECTION).to_list(200)
```

The projection lists every heavy field with `0` (exclude) and leaves all
business-data fields untouched.

### Where applied
| File | Endpoint | Hot field-set kept |
| --- | --- | --- |
| `server.py` `/api/budget/current` (L1742) | `line_items`, `participant_id`, period bounds |
| `server.py` `/api/chat/*` digest (L1908) | `summary`, `anomalies`, `line_items` |
| `server.py` `/api/participant/today` (L2016) | `line_items` |

Companion presets:
- `DOCUMENT_LIGHT_PROJECTION` — same idea for vault/documents
- `USER_SAFE_PROJECTION` — strips `password_hash`, `totp_secret`, backup codes

## 2. Aggregation pushdown

### 2.1 `household_usage_counts` — one round trip instead of six

**Before** (`/api/usage`):
```python
counts["chat_questions"]      = await db.chat_turns.count_documents(...)
counts["statements_uploaded"] = await db.statements.count_documents(...)
counts["family_messages"]     = await db.family_messages.count_documents(...)
counts["wellbeing_checkins"]  = await db.wellbeing.count_documents(...)
counts["digest_sends"]        = await db.digest_sends.count_documents(...)
counts["tool_emails_sent"]    = await db.tool_email_log.count_documents(...)
```
Six **sequential** `await`s — each fast (~5 ms) but they don't pipeline.

**After**:
```python
counts = await household_usage_counts(db, household_id, user_email)
```
The helper fires five `aggregate` calls in `asyncio.gather()`, each backed by
an indexed `$match → $count` pipeline. The latency floor drops from
`sum(times)` to `max(times)`.

### 2.2 `admin_users_with_subscription` — `$lookup` instead of N+1

**Before** (`admin_routes.users_list`, page_size=50):
```python
async for u in users.find(...).skip().limit():
    sub = await db.subscriptions.find_one({"user_id": u["id"]})
    if sub: u["subscription_status"] = sub.get("status")
```
1 + 50 round trips per page. Worst-case latency: **51 × RTT**.

**After**:
```python
rows, total = await admin_users_with_subscription(db, query, page, page_size)
```
Single aggregation:
```
$match → $sort → $skip → $limit → $lookup → $addFields → $project
```
Backed by the unique `subscriptions.user_id` index. **2 round trips total**
(aggregate + count).

The `$project` stage strips `password_hash`, `totp_secret`,
`totp_backup_codes`, `totp_backup_codes_hashed`, `_id`, `_sub` — the
projection runs server-side so the secrets never cross the wire.

## 3. Seek (cursor-based) pagination — `seek_filter`

### Problem
`db.collection.find(q).skip(N).limit(P)` is O(N) on the server — Mongo
has to walk every doc up to position N to discard them. Page 100 of a
50-per-page list costs 5 000 skipped docs. That cost is unavoidable with
`skip`, even with the perfect index.

### Helper
```python
from lib.query_helpers import seek_filter

# Caller passes the `_id` (or ts) of the last visible row as `before`.
q = seek_filter({"household_id": hid}, before_id=request.query_params.get("before"))
rows = await db.audit_events.find(q, projection) \
              .sort([("_id", -1)]).limit(50).to_list(50)
next_before = rows[-1]["_id"] if rows else None
```

**Why this stays O(log N)**: `_id < ObjectId(...)` lands at the right
position in the index in one B-tree walk and reads `limit` docs forward.
No skipping. Page 100 is the same cost as page 1.

`seek_filter` defaults to descending (`$lt`); pass `sort_dir=1` for ascending
(`$gt`). The helper degrades gracefully — an invalid `before` token returns
the unmodified base query so a bad cursor never 500s.

### When to migrate a list endpoint
- High N (>1000 rows) **and** users actually scroll deep → migrate
- Admin tables behind a paginator with `?page=` → leave as-is until measured
- Anything that does `.skip(page * page_size)` where page can exceed 100 → migrate

## 4. Verification (live preview pod)

```
$ python3 -m pytest tests/test_query_helpers.py -v
10 passed in 0.19s
```

Manual:
```
$ curl /api/usage           → 6-key counts object  ✓
$ curl /api/budget/current  → quarterly_usable + streams_note  ✓
$ curl /api/participant/today → quarter_remaining_sentence  ✓
```

Aggregation parity test
(`test_household_usage_counts_matches_per_collection`) asserts the new
helper returns **exactly** the same numbers as the legacy 6-call path
against the live preview database.

## 5. Backlog (not yet pushed-down — future passes)

| Pattern | File | Why deferred |
| --- | --- | --- |
| Iterate statements to sum `line_items` totals (compute_burn) | `server.py` L1742 | Needs `$unwind line_items` + a small business-logic rewrite; doable in Section 4 (background jobs) where we'd cache the per-quarter totals on write. |
| `for doc in scenario_alerts.find(...)` aggregating severity counts | `alerts.py` | Low-volume, fine for now. |
| Adviser anomaly count per client | `adviser_routes.py` | Push into Section 4 caching. |
| Admin audit log seek-pagination | `admin_routes.py` | Currently `skip`-based; migrate when pagination depth shows in metrics. |
