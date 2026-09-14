# Wayly — Caching Layer (Performance Hardening Section 3)

> Companion to `/app/INDEXES.md` and `/app/QUERY_OPTIMIZATION.md`. Documents
> the unified Redis cache layer in `/app/backend/lib/cache.py` and how
> we use it across the app.

## Why
Sections 1–2 ensured the database queries themselves are fast and don't
return excess bytes. Section 3 stops the app from running those queries
in the first place when nothing has changed. Each cache hit is roughly
**3-5× faster** than the underlying aggregation, regardless of how
optimised the query is, because we never round-trip Mongo at all.

## Architecture

```
┌─────────────────┐    ┌────────────────────────┐    ┌──────────────┐
│  FastAPI route  │──▶ │  lib/cache.cache_aside │──▶ │   Redis 8.x  │
└─────────────────┘    │  (singleton client)    │    └──────────────┘
                       │  fail-soft if down     │
                       └────────────┬───────────┘
                                    │ miss → fetch_fn()
                                    ▼
                       ┌────────────────────────┐
                       │      MongoDB           │
                       └────────────────────────┘
```

- **Singleton client** — one `redis.asyncio.from_url()` per process,
  pooled (50 connections, 2s socket timeout). Lazy init on first call.
- **Fail-soft** — if `REDIS_URL` is unset, or Redis is unreachable on
  init/ping, the cache becomes a no-op pass-through. The app keeps
  working, just slower. Every error is logged at DEBUG so we don't spam
  prod logs if Redis flaps.
- **JSON serialisation** with `default=str` so datetimes / ObjectIds
  round-trip safely.
- **Key namespacing** — every key starts `wayly:<namespace>:<...>`. The
  `key_for()` helper builds these so we can't accidentally type
  `wayl:hh:` and silently miss every lookup.

## Where it's applied

| Endpoint / call site | Key | TTL | Why |
| --- | --- | --- | --- |
| `GET /api/usage` (`server.py`) | `wayly:hh:{hid}:usage:{email}` | 60 s | Hit on every dashboard load; 5 aggregations behind it. Verified 1361 ms → 371 ms warm. |
| LLM responses (hook in `lib/llm_cache.py`) | `wayly:llm:{sha256(model,prompt,system,params)[:24]}` | 24 h | Hook ready; wired in Section 5. Only caches when `temperature == 0` (otherwise output is non-deterministic). |

## What's deliberately NOT cached

| Caller | Why |
| --- | --- |
| `program_reference.get_value` | Already an in-process dict load at startup — O(1). Redis would be slower (network RTT > dict lookup). Cross-pod invalidation happens via the existing `preload_cache()` re-run after admin edits. |
| `db.statements.find(...).to_list(...)` in budget/today | Statement docs already use the Section 2 light projection; the Python aggregation that follows is also bounded and small (max 200 docs). Section 4 background-job pass will pre-compute these instead. |
| Anything per-statement-id | Statements are immutable after upload (re-decoding creates a new doc). No invalidation logic needed — TTL would just be a CDN-style optimisation we don't need yet. |

## Invalidation patterns

Each cache key sits in one of three families. Pick the right invalidator
for the write you're doing:

| Helper | Pattern wiped | Call after |
| --- | --- | --- |
| `cache.invalidate_household(hid)` | `wayly:hh:{hid}:*` | statement upload, line-item edit, anomaly resolve, family-message create, wellbeing checkin, digest send |
| `cache.invalidate_participant(pid)` | `wayly:p:{pid}:*` | participant profile edit, lifecycle change |
| `cache.invalidate_user(uid)` | `wayly:u:{uid}:*` | notification read, settings change |
| `cache.invalidate_ref(namespace?)` | `wayly:ref:{ns}*` | admin edits a `program_reference`, price benchmark, pension rate |

Uses `SCAN` (not `KEYS`) under the hood, capped at 500 keys per call so
a runaway pattern can't take down Redis.

Today the `/api/usage` cache TTL is short enough (60 s) that we don't
explicitly invalidate from write paths. A user sees fresh counts within
a minute of any write. If a future endpoint needs <60 s freshness, the
caller adds one line:

```python
await cache.invalidate_household(household_id)
```

## Observability

Two endpoints, super-admin only:

```
GET  /api/admin/cache/stats
POST /api/admin/cache/invalidate?household_id=...
                              ?participant_id=...
                              ?user_id=...
                              ?namespace=ref
```

`/cache/stats` returns:
```json
{
  "redis_url_set": true,
  "hit_rate_pct": 86.7,
  "totals": {"hit": 1043, "miss": 159, "set": 159, "err": 0},
  "namespaces": { "usage": {...}, "llm": {...}, "test_aside": {...} }
}
```

These counters are **in-process** — each pod has its own. Section 7
(Observability) will ship them through `/metrics` so Prometheus/Sentry
can scrape across the fleet.

## Cache-busting on the wire (PDF downloads)

Companion fix to Section 3's caching. The Decoded PDF route at
`/api/statements/{id}/decoded.pdf` now sends
`Cache-Control: private, no-store, no-cache, must-revalidate, max-age=0`
+ `Pragma: no-cache` + `Expires: 0` so neither Cloudflare nor a mobile
HTTP cache ever holds the response. The web frontend additionally appends
`?v={statement.updated_at}` to the URL — belt-and-braces — so even a
broken proxy that ignores `no-store` sees a fresh URL when the underlying
data changes.

The same headers apply to `/api/reports/{rid}/download`.

## Verification (live preview pod)

```
$ python3 -m pytest tests/test_cache_layer.py -v
9 passed in 9.67s

$ curl …/api/usage          → 1361 ms (cold)
$ curl …/api/usage          → 371 ms (warm — Redis hit)
$ curl …/api/usage          → 344 ms (warm — Redis hit)

$ python3 -c 'redis SCAN wayly:hh:*:usage:*'
  matching keys: 1
  wayly:hh:b6228253-…-d:usage:cathy@example.com  ttl=58s
```

Full backend regression (`test_cache_layer + test_query_helpers +
test_participant_profile_v2 + test_email_verification +
test_iter34_reports + test_iter56_admin_email_verified_toggle`) →
**77/77 PASS**.

## Backlog (Section 4 / 5)

| Item | Section |
| --- | --- |
| Pre-compute per-quarter `compute_burn` totals on statement upload + cache them; remove the Python loop from the request path. | Section 4 (background jobs) |
| Wire `lib/llm_cache` into the unified LLM wrapper so deterministic LLM calls hit Redis. | Section 5 |
| Cache the participant `lifecycle_state` view (cross-collection join from `participants` + `participant_state_audit`). | Section 4 |
| Cache notifications `unread_count` per user with explicit invalidation on read/dismiss. | Section 5 |
