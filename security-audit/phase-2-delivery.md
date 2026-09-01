# Phase 2 — Participant Data Isolation — DELIVERY REPORT

Date: 2026-02-06
Scope: backend `security_utils.py` (new helpers), `server.py` resolver,
`batch2_routes.py`, `reports_routes.py`, automated isolation test suite.

## What was shipped

### 1. Central isolation helper
New `assert_participant_access(user_id, participant_id, *, allow_none, require_active)` in `/app/backend/security_utils.py`. Contract:

- Returns the participant dict on success.
- Raises **HTTPException(404)** (never 403) for any of: participant doesn't exist, is archived/removed, OR doesn't belong to the caller's household/account.
- Logs a `security` channel warning whenever a mismatch is detected (audit trail).
- Companion `assert_household_access(user_id, household_id)` for household-scoped routes.

Every new endpoint that consumes a `participant_id` from path / query / body / header MUST call this first.

### 2. Hardened header resolver
`_resolve_active_participant` (server.py) now delegates the ownership check to the new helper when `X-Participant-Id` is present. Previously, an unrecognised pid silently fell back to the caller's primary participant — that masked frontend bugs. Now the resolver **raises 404 immediately** on a foreign pid.

### 3. Patched endpoints that accepted a raw `participant_id` query/body parameter
| File | Endpoint | Before | After |
|---|---|---|---|
| batch2_routes.py | GET /hospital/admissions | AND-filter only | + assert_participant_access |
| batch2_routes.py | GET /wall/posts | AND-filter only | + assert_participant_access |
| batch2_routes.py | GET /amendments | AND-filter only | + assert_participant_access |
| reports_routes.py | POST /reports/generate | inline 2-branch ownership check (403) | replaced with helper (404) |
| reports_routes.py | GET /reports | AND-filter only | + assert_participant_access |

The earlier AND-filter pattern was already non-leaky in practice (filter by `household_id` AND `participant_id` returned empty for mismatches) but it was **silent** — never told the developer they were probing the wrong row. The new helper is **loud + audited**.

### 4. Automated isolation test suite — `/app/backend/tests/test_phase2_isolation.py`
Creates two fresh accounts (`alice_isolation_test@example.com`, `bob_isolation_test@example.com`) and proves Alice can never read or write Bob's data across:

- The X-Participant-Id header (`/budget/current`, `/documents`, `/statements`)
- The `?participant_id=…` query parameter (`/hospital/admissions`, `/wall/posts`, `/amendments`, `/reports`)
- The `participant_id` body field (`/hospital/admissions`, `/wall/posts`, `/reports/generate`)
- Token scope (`/auth/me`)

**Result: 13/13 PASS.**

### 5. Regression
Full Phase 1 + Phase 2 sweep: **25/25 PASS**.
`tests/test_iter35_dashboard_sse_scheduler.py` (multi-participant switching): **18/18 PASS** — the legit X-Participant-Id flow is intact.

## Risk register impact (Phase 0 baseline → now)

* **MEDIUM** no central participant-scope helper → **FIXED**
* **MEDIUM** inconsistent ownership checks across reports/hospital/wall/amendments → **FIXED**
* The Phase 0 audit noted that *while no leak was demonstrable*, the lack of a single audited gate meant a future endpoint could easily forget to scope correctly. That class of bug is now caught by the new test harness.

## Files changed

```
backend/
  security_utils.py         + assert_participant_access, assert_household_access
  server.py                 _resolve_active_participant now uses the helper
  batch2_routes.py          /hospital/admissions, /wall/posts, /amendments hardened
  reports_routes.py         /reports/generate, /reports list hardened
  tests/test_phase2_isolation.py   NEW — 13 tests, all passing
```

No frontend changes were necessary — the frontend already sends the correct X-Participant-Id for the active participant, and the existing UI never crosses the line.

## Phase 2 design note for future endpoints

For any new endpoint that touches participant data, the canonical pattern is:

```python
from security_utils import assert_participant_access

@api.get("/some/new/endpoint")
async def some_new_endpoint(
    participant_id: Optional[str] = Query(default=None),
    request: Request = None,
    user_id: str = Depends(get_current_user_id),
):
    pid = participant_id or request.headers.get("x-participant-id")
    p = await assert_participant_access(user_id, pid)   # raises 404 on any mismatch
    # ... use p["id"] and p["household_id"] safely below
```
