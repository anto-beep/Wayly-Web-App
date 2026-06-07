# Wayly — Monitoring & Observability Runbook

Last updated: 2026-02-07
Owner: hello@wayly.com.au

## What's wired today (code-level, shipped)

| Capability | How | Where |
|---|---|---|
| Sentry error capture + perf tracing (FastAPI + Motor + PyMongo auto-instrumented) | `observability.init_sentry()` — reads `SENTRY_DSN`, `SENTRY_ENV`, `SENTRY_RELEASE`, `SENTRY_TRACES_SAMPLE_RATE` | `backend/observability.py` |
| Sentry user context (id only, no PII) | `set_sentry_user(user_id)` — call from auth dependency | `backend/observability.py` |
| Structured JSON logging (stdout) | `JsonFormatter` — every line carries `ts`, `level`, `service`, `request_id`, `user_id`, plus `extra` fields | `backend/observability.py` |
| Per-request `X-Request-ID` header + access log | `RequestLoggingMiddleware` | installed via `_observability.install(app)` in `server.py` |
| Security event taxonomy (13 event types) | `log_auth_login_success`, `log_decoder_run`, `log_file_upload`, `log_participant_access`, etc. | `backend/observability.py` |
| Account-deletion + data-export events | `log_account_deletion`, `log_data_export` (hashed user-id, no PII) | same |

## What's NOT wired (platform tasks — you do these in your dashboards)

These require Sentry / Cloudflare / Stripe / Anthropic / UptimeRobot dashboards. I cannot reach them from preview.

### Phase 1 — Sentry final wiring
1. Create a Sentry project for Wayly at https://sentry.io. Use one project for backend ("wayly-api"); a second for frontend is optional.
2. Copy the DSN. Set `SENTRY_DSN` in your production env. Restart backend.
3. **Frontend**: `yarn add @sentry/react`; add `src/sentry.instrument.js` that calls `Sentry.init({dsn: process.env.REACT_APP_SENTRY_DSN, environment: process.env.REACT_APP_SENTRY_ENV, tracesSampleRate: 0.2, sendDefaultPii: false})`, import as first line of `src/index.js`. Set `REACT_APP_SENTRY_DSN` in frontend env.
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

### Phase 3 — Uptime monitoring (UptimeRobot)
Sign in at https://uptimerobot.com (free tier covers 50 monitors / 5-min interval). Create 3 HTTP(s) monitors:

| Friendly Name | URL | Interval | Alert contacts | Alert when |
|---|---|---|---|---|
| Wayly Marketing | `https://wayly.com.au` | 5 min | hello@wayly.com.au | non-200 for 2 consecutive checks |
| Wayly API | `https://wayly.com.au/api/health` | 5 min | hello@wayly.com.au | non-200 for 2 consecutive checks |
| Wayly Articles | `https://wayly.com.au/articles` | 5 min | hello@wayly.com.au | non-200 for 2 consecutive checks |

(A `/api/health` endpoint already exists in the codebase — verify with `curl https://wayly.com.au/api/health`.)

### Phase 4 — Cloudflare WAF (replaces AWS WAF)
1. In Cloudflare → Security → WAF, enable these Managed Rulesets in `Log` mode for 48 h:
   - Cloudflare OWASP Core
   - Cloudflare Managed Ruleset (high sensitivity)
2. Review the Security Events log for false positives (Wayly file uploads can look suspicious to OWASP rules — whitelist `/api/statements/upload`).
3. Flip to `Block` mode.
4. Create a **Cloudflare Rate Limiting rule**: `(http.host eq "wayly.com.au" and http.request.uri.path contains "/api/auth/login") → block when > 30 req / 5 min per IP`. This is layered defence on top of the Phase 3 Redis limit.

### Phase 4 — Alerts via Mongo+Resend (no CloudWatch in this stack)
The structured `AUTH_LOGIN_FAILURE`, `PARTICIPANT_ACCESS`, `DECODER_RUN` events are emitted to stdout as JSON. To wire alerts:
- Pipe stdout into Logflare/BetterStack/Axiom (your choice — `kubectl logs` or sidecar).
- In that tool, create saved queries + alert rules matching the brief's thresholds:
  - `event_type:AUTH_LOGIN_FAILURE | by ip | count > 20 / 5min` → email hello@wayly.com.au
  - `event_type:PARTICIPANT_ACCESS | by user_id | count(distinct participant_id) > 50 / 10min` → email
  - `event_type:DECODER_RUN | sum(cost_aud) over 60min > 20` → email

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
