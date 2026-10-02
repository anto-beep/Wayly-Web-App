# Production test-account cleanup + environment separation

Two separate concerns. Do them in order.

---

## 1. Keep PREVIEW and PRODUCTION databases separate (do this ONCE)

The whole reason test accounts appeared "in production" is that preview and
production were reading/writing the **same** MongoDB. They must use different
databases so seed/test data can never leak into prod again.

The database a backend talks to is decided entirely by two env vars in
`backend/.env`:

    MONGO_URL   # the MongoDB connection string (cluster)
    DB_NAME     # the database name inside that cluster

### This preview environment
    MONGO_URL="mongodb://localhost:27017"
    DB_NAME="test_database"

This is a throwaway local Mongo. Nothing here reaches real users. All the
`@example.com` / `@test.com` accounts live here — that is fine and expected.

### Production
Production must point at your real cluster with a DISTINCT `DB_NAME`, e.g.

    MONGO_URL="mongodb+srv://<user>:<pass>@<your-cluster>/?retryWrites=true&w=majority"
    DB_NAME="wayly_prod"

Rules to guarantee separation:
- **Never** share one `DB_NAME` across preview and prod, even on the same cluster.
- Preview may keep `test_database`; prod uses something like `wayly_prod`.
- The Emergent "Publish/Deploy" flow injects the production `MONGO_URL`/`DB_NAME`.
  Set them in the deployment config (NOT in this preview `.env`, which is local
  only). Confirm the deployed backend logs the prod `DB_NAME` at startup.
- After separating, do a one-time cleanup of prod (section 2) to remove any test
  accounts that already leaked in before the split.

You cannot change production config from this preview — it is a deploy action.

---

## 2. Remove test accounts already sitting in PRODUCTION (one-time)

Script: `scripts/prod_cleanup_test_accounts.py`
- DRY-RUN by default (prints what WOULD be deleted, changes nothing).
- NEVER touches admin accounts (role == admin / is_admin == true).
- Cascades deletion across all per-user collections so no orphans remain.
- Matches test emails by pattern: `@test.com`, `@example.com`, `@example.org`,
  `@mailinator.com`, `@wayly.test`, `+test@`, `sam@test.com`, `test*@`, `qa*@`,
  `demo*@`. Edit `TEST_EMAIL_PATTERNS` / `TEST_EMAIL_ALLOWLIST` in the script if
  a real user matches one of these.

### Run it AGAINST PRODUCTION (never from this preview automatically)

You need the production `MONGO_URL` and `DB_NAME`. Run from any machine that can
reach the prod cluster (or the Emergent MongoDB Viewer shell), pointing the two
env vars at prod:

    # Step 1 — DRY RUN (safe, deletes nothing, just lists targets):
    MONGO_URL="<prod-mongo-url>" DB_NAME="wayly_prod" \
        python3 /app/backend/scripts/prod_cleanup_test_accounts.py

    # Review the printed list carefully. Add any real address you want to keep
    # to TEST_EMAIL_ALLOWLIST in the script, then re-run the dry run.

    # Step 2 — ACTUALLY DELETE (irreversible — take a DB backup/snapshot first):
    MONGO_URL="<prod-mongo-url>" DB_NAME="wayly_prod" \
        python3 /app/backend/scripts/prod_cleanup_test_accounts.py --confirm

### Safety checklist before `--confirm`
- [ ] Took a production snapshot/backup.
- [ ] Dry-run list contains ONLY genuine test accounts.
- [ ] No real customer address matched (if one did, add it to the allowlist).
- [ ] Admin accounts (hello@wayly.com.au, support@wayly.com.au, etc.) are NOT in
      the list (they never should be — the script skips admins).

After it completes it prints how many documents were removed across how many
accounts. Admins are always left untouched.
