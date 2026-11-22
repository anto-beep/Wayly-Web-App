# Production smoke test

A tiny Playwright script that runs against the live `wayly.com.au` deployment
every 15 minutes and verifies the user-facing path stays healthy. If anything
breaks, the on-call inbox gets a styled email within seconds, and the failure
shows up on `/admin → System health → Smoke test` for triage.

## What it checks

```text
1. Log in as smoke@wayly.com.au         (auth pipeline)
2. GET /app                              (dashboard renders)
3. GET /app/chat                         (chat page mounts — catches the RotateCcw class of bug)
4. GET /app/statements                   (statement list renders)
5. GET /app/budget                       (Support at Home budget renders)
```

Each step must complete within 20 s, no page-errors, and the expected text
must be present.

## Where it runs

`.github/workflows/smoke.yml` on GitHub Actions, scheduled `*/15 * * * *`
(every 15 minutes UTC). Also triggers on every push to `main` that touches
the workflow or `scripts/smoke.py`, and can be run manually from the
**Actions** tab (Run workflow → smoke).

## How alerts work

```text
script  →  POST /api/internal/smoke-report  (HMAC-signed)
         →  Mongo `smoke_runs` collection (last 200 runs)
         →  /admin → System Health → Smoke test panel (auto-refresh 60s)
         →  on failure: email to TEAM_INBOX via Resend
```

The POST endpoint is HMAC-only (no JWT) so the CI runner doesn't need an
admin token. The shared secret is `SMOKE_HMAC_SECRET` in `backend/.env`
and must match the GitHub Actions secret of the same name.

## First-time setup

1. **Seed the sentinel account** on production Mongo:

   ```bash
   MONGO_URL=... DB_NAME=... python3 scripts/seed_smoke_account.py
   ```

   This prints the password once. Copy it.

2. **Add 5 GitHub secrets** (Repo → Settings → Secrets → Actions):

   | Secret name | Value |
   |---|---|
   | `SMOKE_TARGET_URL` | `https://wayly.com.au` |
   | `SMOKE_API_BASE`   | `https://wayly.com.au` |
   | `SMOKE_EMAIL`      | `smoke@wayly.com.au` |
   | `SMOKE_PASSWORD`   | (from step 1) |
   | `SMOKE_HMAC_SECRET`| same as backend `.env` |

3. **Make sure the backend has `SMOKE_HMAC_SECRET`** set in production env.
   Generate one with `python3 -c "import secrets; print(secrets.token_hex(32))"`.

4. Run the workflow manually once (Actions tab → Wayly Production Smoke →
   Run workflow) to verify everything is wired. The result should appear
   in the admin panel within seconds.

## Local dry-run

```bash
cd /app
pip install playwright==1.49.1
python -m playwright install chromium
SMOKE_TARGET_URL=https://wayly.com.au \
SMOKE_API_BASE=https://wayly.com.au \
SMOKE_EMAIL=smoke@wayly.com.au \
SMOKE_PASSWORD=... \
SMOKE_HMAC_SECRET=... \
  python3 scripts/smoke.py
```

The script prints the report as JSON, POSTs it, and exits non-zero on any
failed step.

## Tuning

- **Cadence**: change the cron in `smoke.yml`. Every 5 min is fine if you
  want tighter MTTD; remember each run uses ~30 s of free-tier minutes.
- **Coverage**: edit `STEPS` in `smoke.py` — add `/app/family-wall`,
  `/app/documents`, etc. Keep it under 8 steps so the whole run stays < 60 s.
- **Email volume**: a failing scheduled run sends one email per 15 min until
  fixed. If the noise is too much, add a "first failure only" guard in
  `smoke_status.py::_alert_on_failure`.
