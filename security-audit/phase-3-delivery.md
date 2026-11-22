# Phase 3 — Rate Limiting — DELIVERY REPORT

Date: 2026-02-06
Scope: new `rate_limit.py` module, `.env`, hooks in `server.py` and
`admin_auth.py`, comprehensive pytest suite.

## What was shipped

### 1. New `/app/backend/rate_limit.py`
- Redis-backed fixed-window counters (`INCR` + `EXPIRE` atomically via pipeline).
- 11 configurable buckets in a single `LIMITS` table — adding a new bucket is a one-line change.
- **Fail-open by default**: a temporary Redis outage does not lock everyone out.
- **Fail-closed for high-value buckets** (`login_ip`, `login_email`, `admin_login_ip`) — biases security on the routes an attacker would most want Redis to vanish from.
- Friendly `429` responses with `Retry-After` header so clients can show a count-down.
- IP detection prefers `X-Forwarded-For` then `X-Real-IP` then socket peer (works with Kubernetes ingress + Cloudflare).
- Helper exports: `consume(bucket, identifier)`, `enforce(request, *checks)`, `reset(bucket, identifier)`, `reset_all_for_identifier(identifier)`.

### 2. Bucket configuration (matches user-approved limits)

| Bucket | Limit | Applied to |
|---|---|---|
| `login_ip` | 5 / 5 min | `/api/auth/login` |
| `login_email` | 10 / hour | `/api/auth/login` |
| `signup_ip` | 5 / 5 min | `/api/auth/signup` |
| `signup_email` | 10 / hour | `/api/auth/signup` |
| `forgot_email` | 3 / hour | `/api/auth/forgot` |
| `reset_ip` | 5 / hour | `/api/auth/reset` |
| `upload_account` | 20 / hour | `/api/statements/upload` |
| `tools_unauth_ip` | 10 / hour | All `/api/public/*` AI tools (via `_require_paid_plan` + `_enforce_statement_decoder_limit`) |
| `tools_account` | 60 / hour | Reserved for authed-tool burst (not yet applied) |
| `admin_login_ip` | 5 / 5 min | `/api/admin/auth/login` |
| `admin_action` | 30 / min | Reserved for admin write endpoints (not yet applied) |

### 3. Startup hook
`_rate_limit_bootstrap` warms up the Redis connection at process start and logs the bucket count: `rate limiter: Redis ready, 11 buckets configured` on a clean boot.

### 4. Frontend remains unchanged
The existing axios 429 interceptor in `/app/frontend/src/lib/api.js` already shows the friendly warning toast. Nothing else to do client-side.

### 5. Automated test suite — `/app/backend/tests/test_phase3_rate_limit.py`
7 tests, all passing:

* `test_login_ip_limit_5_per_5min` — 6th login from same IP → 429 with `Retry-After`
* `test_forgot_email_limit_3_per_hour` — 4th `/forgot` for same email → 429
* `test_reset_ip_limit_5_per_hour` — 6th reset attempt → 429
* `test_admin_login_ip_limit` — 6th admin login from same IP → 429
* `test_paid_tool_ip_burst_via_unauth_401` — 11th public-tool call → 429 (vs the normal 401 from `_require_paid_plan`)
* `test_different_ip_not_affected` — IP B's first request succeeds after IP A exhausts its bucket (proves keying is correct)
* `test_signup_succeeds_within_quota` — happy-path sanity

### 6. Regression
Full test sweep with Phase 1 + Phase 2 + Phase 3: **32 / 32 PASS**.

Phase 1 fixtures gained an autouse rate-limit purge so the lockout / blocklist / MFA tests don't trip the new IP limits when they intentionally repeat login attempts.

## Production rollout checklist

Preview env: ✅ `redis://localhost:6379/0` is configured in `/app/backend/.env`.

Production:
1. Provision a Redis instance — Upstash free tier (10k commands/day) is plenty for the current load.
2. Set `REDIS_URL=rediss://default:<password>@<host>:<port>` in the production deployment dashboard.
3. **No code changes required** — if `REDIS_URL` is missing in prod, the limiter logs a single startup warning and fails open. The app continues to work; only the abuse protection is disabled.

## Risk register impact (Phase 0 baseline → now)

* **HIGH** no rate limit on login/signup/reset → **FIXED**
* **HIGH** no rate limit on file uploads → **FIXED**
* **HIGH** no rate limit on admin login → **FIXED**
* **MEDIUM** no rate limit on public AI tools → **FIXED** (10/hour/IP burst on top of existing monthly quota)
* **MEDIUM** in-memory `RATE_LIMIT_BUCKET` dict in `server.py` → Still present, but is now legacy and superseded — can be removed in a follow-up cleanup.

## Files changed

```
backend/
  rate_limit.py             NEW — Redis-backed limiter with 11 buckets
  .env                      + REDIS_URL=redis://localhost:6379/0
  server.py                 _rate_limit_bootstrap startup; enforce() on
                            /auth/{signup,login,forgot,reset}, /statements/upload,
                            _require_paid_plan, _enforce_statement_decoder_limit
  admin_auth.py             enforce() on /admin/auth/login
  tests/test_phase3_rate_limit.py  NEW — 7 tests, all passing
  tests/test_phase1_security.py    autouse fixture now purges rate-limit keys
```
