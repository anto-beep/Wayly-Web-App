# Wayly — Monitoring & Observability Runbook

Last updated: 2026-02-07 (Phase 1+2 close-out)
Owner: hello@wayly.com.au

## What's wired today (code-level, shipped)

| Capability | How | Where |
|---|---|---|
| Sentry error capture + perf tracing (FastAPI + Motor + PyMongo auto-instrumented) | `observability.init_sentry()` — reads `SENTRY_DSN`, `SENTRY_ENV`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | `backend/observability.py` |
| Sentry user context (id only, no PII) | `set_sentry_user(user_id)` — call from auth dependency | `backend/observability.py` |
| **Frontend Sentry (React + browserTracing)** — PII scrub for emails/tokens/cookies; ErrorBoundary fallback in `index.js`; X-Request-ID auto-tagged from every axios response | `frontend/src/lib/sentry.js`, `frontend/src/index.js`, `frontend/src/lib/api.js`, `frontend/src/context/AuthContext.jsx` | reads `REACT_APP_SENTRY_DSN`, `REACT_APP_SENTRY_ENV`, `REACT_APP_SENTRY_RELEASE`, `REACT_APP_SENTRY_TRACES_SAMPLE_RATE` |
| Structured JSON logging (stderr — supervisor captures) | `JsonFormatter` — every line carries `ts`, `level`, `service`, `request_id`, `user_id`, plus `extra` fields | `backend/observability.py` |
| Per-request `X-Request-ID` header + access log | `RequestLoggingMiddleware` | installed via `_observability.install(app)` in `server.py` |
| **Phase 3 health endpoints** | `GET /api/health` (public, liveness) + `GET /api/health/deep` (admin-only — Mongo/Redis/ClamAV/LLM-key probes with per-dep `{ok, latency_ms}`). LLM key value is NEVER returned, only prefix. | `backend/server.py` |
| Security event taxonomy (13 event types) | `log_auth_login_success`, `log_decoder_run`, `log_file_upload`, `log_participant_access`, etc. | `backend/observability.py` |
| **Sec-events wired into hot code paths** (server.py) | `signup` ⇒ `LOGIN_SUCCESS`; `login` ⇒ `LOGIN_SUCCESS/LOGIN_FAILURE/LOCKOUT`; `google-session` ⇒ `LOGIN_SUCCESS`; `mfa/verify` ⇒ `LOGIN_SUCCESS/MFA_FAILURE`; `mfa/enable` ⇒ `MFA_ENABLED`; `/auth/reset` ⇒ `PASSWORD_RESET`; `DELETE /auth/account` ⇒ `ACCOUNT_DELETION` (hashed id) | `backend/server.py` |
| Account-deletion + data-export events | `log_account_deletion`, `log_data_export` (hashed user-id, no PII) | same |

## What's NOT wired (platform tasks — you do these in your dashboards)

These require Sentry / Cloudflare / Stripe / Anthropic / UptimeRobot dashboards. I cannot reach them from preview.

### Phase 1 — Sentry final wiring
1. Create a Sentry project for Wayly at https://sentry.io. Use one project for backend ("wayly-api"); a second for frontend ("wayly-web").
2. Copy the DSN. Set `SENTRY_DSN` (backend env) and `REACT_APP_SENTRY_DSN` (frontend env). Restart backend; frontend hot-reloads.
3. **Frontend is already wired** — `@sentry/react` v10 installed, `initSentry()` reads `REACT_APP_SENTRY_DSN` and is a no-op when blank. `Sentry.ErrorBoundary` wraps `<App />` in `index.js`. The axios response interceptor in `lib/api.js` auto-tags every Sentry scope with the backend's `X-Request-ID` for cross-stack correlation. `AuthContext` calls `setSentryUser(user.id)` / `clearSentryUser()` on login/logout (id only — never email).
4. **Source maps**: add to `frontend/package.json`:
   ```json
   "scripts": {"sentry:sourcemaps": "sentry-cli sourcemaps inject build && sentry-cli sourcemaps upload build --rewrite --validate"}
   ```
   Set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` in CI; run `yarn build && yarn sentry:sourcemaps` on deploy.
5. **Sentry alert rules** — create in the Sentry UI (Issues → Alerts → Create alert):
   - "New issue type" → email hello@wayly.com.au
   - "Issue affects > 5 users in 10 min" → email
   - "Issue contains tag transaction:decoder" → email
   - "Auth event spike > 10 in 5 min" → email

### Phase 3 — Uptime monitoring (UptimeRobot) — ENDPOINTS LIVE

The two health endpoints are now wired in `server.py`:

| Endpoint | Auth | What it checks | Used by |
|---|---|---|---|
| `GET /api/health` | none | Liveness only (process is up + serving HTTP). Returns `{status, ts, service, version}`. No DB hit. | UptimeRobot, k8s liveness probe |
| `GET /api/health/deep` | admin JWT | Probes Mongo, Redis, ClamAV unix socket, Emergent LLM key shape. Returns per-dependency `{ok, latency_ms}` + an aggregate `status: ok\|degraded`. Never returns the raw LLM key — only the `sk-emergent-…` prefix. | Incident triage, the existing `/status` page can later proxy a subset of this |

Live verified end-to-end:
```
$ curl -s $API/api/health
{"status":"ok","ts":"2026-…","service":"wayly-api","version":"preview"}

$ curl -s -H "Authorization: Bearer <admin-jwt>" $API/api/health/deep
{
  "status":"ok",
  "dependencies":{
    "mongo":{"ok":true,"latency_ms":1},
    "redis":{"ok":true,"latency_ms":2},
    "clamav":{"ok":true,"latency_ms":1},
    "llm_key":{"ok":true,"prefix":"sk-emergent-…"}
  },
  "uptime_seconds":42,"uptime_human":"42s"
}
```
Unauth `/api/health/deep` returns 401; non-admin user JWT returns 403.

### UptimeRobot configuration

Sign in at https://uptimerobot.com (free tier covers 50 monitors / 5-min interval). Create these HTTP(s) monitors:

| Friendly Name | URL | Interval | Alert contacts | Alert when |
|---|---|---|---|---|
| Wayly Marketing | `https://wayly.com.au` | 5 min | hello@wayly.com.au | non-200 for 2 consecutive checks |
| Wayly API Health | `https://wayly.com.au/api/health` | 5 min | hello@wayly.com.au | non-200 for 2 consecutive checks OR body does not contain `"status":"ok"` |
| Wayly Articles | `https://wayly.com.au/articles` | 5 min | hello@wayly.com.au | non-200 for 2 consecutive checks |
| Wayly Login | `https://wayly.com.au/login` | 15 min | hello@wayly.com.au | non-200 for 2 consecutive checks |

For the API Health monitor:
- **Monitor type**: Keyword
- **Keyword**: `"status":"ok"` (alert when keyword NOT exists)
- **HTTP method**: GET
- **Add notification contact** in the UptimeRobot dashboard for hello@wayly.com.au (and optionally a Slack/Discord webhook).

For `/api/health/deep`, do NOT poll from UptimeRobot — it requires an admin JWT and the LLM-key probe is heavier. Use it from the incident-response runbook only.

### Phase 4 — Cloudflare WAF (replaces AWS WAF)
1. In Cloudflare → Security → WAF, enable these Managed Rulesets in `Log` mode for 48 h:
   - Cloudflare OWASP Core
   - Cloudflare Managed Ruleset (high sensitivity)
2. Review the Security Events log for false positives (Wayly file uploads can look suspicious to OWASP rules — whitelist `/api/statements/upload`).
3. Flip to `Block` mode.
4. Create a **Cloudflare Rate Limiting rule**: `(http.host eq "wayly.com.au" and http.request.uri.path contains "/api/auth/login") → block when > 30 req / 5 min per IP`. This is layered defence on top of the Phase 3 Redis limit.

### Phase 4 — In-process security alerter (SHIPPED)

A Mongo-backed sliding-window alerter is wired into `server.py` (no external aggregator needed). Rules:

| Rule | Event | Threshold | Severity | Cooldown |
|---|---|---|---|---|
| `LOGIN_FAILURE_PER_IP` | `AUTH_LOGIN_FAILURE` | > 20 / 5 min / single IP | HIGH | 30 min |
| `LOGIN_FAILURE_PER_EMAIL_HASH` | `AUTH_LOGIN_FAILURE` | > 50 / 5 min / single email (SHA-256 hashed) | HIGH | 30 min |
| `PARTICIPANT_SCRAPE` | `PARTICIPANT_ACCESS` | > 50 distinct participant_ids / 10 min / single user_id | HIGH | 30 min |
| `ADMIN_ACTION_SPIKE` | `ADMIN_ACTION` (admin_audit_log row) | > 30 / 5 min / single admin_id | CRITICAL | 30 min |
| `MALWARE_UPLOAD` | `FILE_UPLOAD` with `scan_result:"infected"` | every event | CRITICAL | n/a |

When a threshold is crossed:
1. A row is inserted into `security_alerts` (Mongo, idempotent by `(rule, subject)` while the existing alert is open + within cooldown).
2. An `ALERT_FIRED` JSON log line is emitted (downstream aggregators can ingest it as-is).
3. A best-effort Resend email goes to `hello@wayly.com.au` (override via `SECURITY_ALERT_EMAIL` env var).
4. The alert surfaces on **/admin/security-alerts** in the AdminApp UI with severity badges, stats tiles (open / critical-open / 24h count), filter toggle (all / open only), and a `Resolve` action that records an audit-log entry.

Wired call sites in `server.py`:
- `auth/login` failure → `_alerter.record_login_failure(ip, email)`
- `_resolve_active_participant` → `_alerter.record_participant_access(user_id, participant_id)`
- `statements/upload` → ClamAV `on_malware` callback → `_alerter.record_malware_upload`
- `admin_hardening.append_audit` → every admin action → `_alerter.record_admin_action`

Env vars:
- `WAYLY_ALERT_COOLDOWN_S` — defaults to `1800` (30 min). Prevents alert-spam for a long-running incident.
- `SECURITY_ALERT_EMAIL` — defaults to `hello@wayly.com.au`. Email destination for fired alerts.

Admin API:
- `GET /api/admin/security-alerts?only_open=true&limit=50` — list alerts + stats + threshold metadata.
- `POST /api/admin/security-alerts/{id}/resolve` body `{note}` — marks resolved, records `security_alert_resolve` in the admin audit chain.

### Phase 4 — Alerts via Mongo+Resend (no CloudWatch in this stack)
Already covered by the in-process alerter above. If you also pipe stdout into Logflare/BetterStack/Axiom, you can layer a second set of saved queries on the `ALERT_FIRED` log lines for off-host redundancy.

### Phase 6 — Cost & billing
1. **Anthropic / Emergent LLM**: log into your Emergent dashboard → Universal Key → set auto top-up cap.
2. **Stripe**: webhook signature verification is already implemented via `StripeCheckout.handle_webhook()` in `server.py` (the `signature` header is required). Verify by sending an unsigned webhook — it should 400.
3. **Stripe webhook idempotency**: the existing handler at `server.py:stripe_webhook` should be augmented to dedupe on `event.id` via Redis (24h TTL). Quick implementation:
   ```python
   import redis.asyncio as redis_async
   r = redis_async.from_url(os.environ["REDIS_URL"])
   if not await r.set(f"stripe:evt:{event_id}", "1", nx=True, ex=86400):
       return {"ok": True, "deduped": True}
   ```

## Daily security digest (cron pattern)
A daily cron Lambda is NOT available here. Use a simple scheduler in `server.py`:

```python
@app.on_event("startup")
async def _daily_security_digest():
    async def loop():
        await asyncio.sleep(60)
        while True:
            # Pull yesterday's counts from Mongo: revoked_tokens, admin_audit_log,
            # decoder_cost_log, family_wall_posts uploads, etc.
            # Email via email_service.send_email() to hello@wayly.com.au.
            await asyncio.sleep(86400)
    asyncio.create_task(loop())
```

Already-shipping data sources:
- `revoked_tokens` (Phase 1 blocklist) — count by `reason`
- `admin_audit_log` (Phase 8 hash chain) — count by `action`
- `admin_login_devices` (Phase 8 new-device) — count new IPs
- A `decoder_cost_log` collection — wire `log_decoder_run` to also `insert_one` into Mongo

## Incident playbooks (one-page each)

### "Site down" — UptimeRobot fires
1. `curl https://wayly.com.au/api/health` — confirm.
2. Check Sentry → Issues for spike in 5xx.
3. `sudo supervisorctl status backend` (preview) / Emergent dashboard logs (prod).
4. If Mongo Atlas — check Atlas status page.
5. If still down > 15 min — toggle maintenance mode + post on `/status`.

### "Decoder cost runaway"
1. Check `decoder_cost_log` daily sum in Mongo.
2. If > $20 in 60 min — flip `HIBP_BLOCK_COMPROMISED=true` momentarily? No — instead set Free-tier `free_tool_usage` to fully consumed for current month.
3. Identify the user via `decoder_cost_log.user_id` — manually block via `users.is_admin=false, role=suspended`.

### "Data breach suspected"
Follow `/app/security-audit/ndb-breach-runbook.md` (Phase 9). T+0 rotation of `JWT_SECRET` + `ADMIN_JWT_SECRET` is the first action.

## Open items intentionally not auto-implemented
- Lighthouse CI workflow (`.github/workflows/lighthouse.yml`) — add when GitHub Actions is configured.
- Performance budgets in webpack config — CRA hides webpack; needs eject or `react-app-rewired`.
- `decoder_cost_log` Mongo collection writes — wire from inside the existing decoder pipeline by calling `log_decoder_run()` AND inserting into `db.decoder_cost_log`.
- Stripe webhook idempotency snippet (see Phase 6 above) — 5-line add to the handler.

## Doc index
- `/app/security-audit/encryption-runbook.md` — key rotation, TLS, at-rest encryption.
- `/app/security-audit/ndb-breach-runbook.md` — 72-hour incident playbook.
- `/app/security-audit/privacy-policy-review.md` — APP-by-APP control mapping.
- `/docs/monitoring-runbook.md` — this file.
