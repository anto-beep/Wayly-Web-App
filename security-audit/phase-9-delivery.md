# Phase 9 — NDB & Privacy Act Readiness — DELIVERY REPORT

Date: 2026-02-07
Scope: new `privacy.py` module, deletion-cascade rewrite in `server.py`,
new `/api/auth/account/export` endpoint, breach runbook, privacy policy
review, pytest suite.

## What was shipped

### 1. New `/app/backend/privacy.py`

Two layers fulfilling the Privacy Act 1988 APP 11.2 "destroy or de-identify" obligation:

**Layer A — Soft delete with full cascade (`soft_delete_account`)**:
* Immediately anonymises the user row (`email`, `name`, `password_hash`, `totp_secret`, `totp_backup_codes` all blanked).
* Cascades `deleted_at` across **26 scoped collections** keyed by `user_id`, `owner_user_id`, `admin_id`, `generated_by`, `client_user_id`, `household_id`, AND `account_id` — every PII surface in the codebase.
* Revokes all outstanding access / refresh tokens via the Phase 1 `revoke_all_user_tokens()` sentinel.
* Cancels subscriptions, removes household memberships.
* Returns `deletion_completes_at` (now + 60 days) for the user-facing message.

**Layer B — 60-day hard delete cron (`purge_expired_accounts`)**:
* Background scheduler runs every 24h (env-configurable via `PURGE_INTERVAL_SECONDS`).
* Finds users with `deleted_at < now - SOFT_DELETE_WINDOW_DAYS` (default 60).
* Hard-deletes every related row across the same 26 collections, then removes the anonymised user.
* Idempotent: safe to run hourly.

### 2. Deletion cascade endpoint rewrite

`DELETE /api/auth/account` now:

* Calls `soft_delete_account()` (full cascade).
* Returns `{ok: true, deletion_completes_at: <60d>, message: "..."}` so the UI can render a friendly "deletion scheduled for X" notice + a path back via support email.

### 3. New `GET /api/auth/account/export`

* Privacy Act APP 12 fulfilment — synchronous JSON dump of every record about the user across the 26-collection map.
* Strips sensitive auth material (`password_hash`, `totp_secret`, lockout counters, JWT sentinels).
* Redacts raw file bytes in returned documents — caller can re-download each individually via the existing `/api/documents/{id}/download` route.
* Response payload self-cites `"This is the complete personal data Wayly holds about you under Australian Privacy Act APP 12."`

### 4. Documents shipped

* **`/app/security-audit/ndb-breach-runbook.md`** — 8-section playbook covering trigger criteria, T+0 containment, T+24-72h EDB assessment, OAIC + individual notification templates, post-incident review.
* **`/app/security-audit/privacy-policy-review.md`** — APP-by-APP audit mapping each principle to the concrete control now in place, with open follow-ups.

### 5. Tests — `/app/backend/tests/test_phase8_9_admin_privacy.py`
Phase 9 coverage:

* `test_export_returns_all_personal_data` — `/auth/account/export` returns the user record, cites APP 12 in the note, never leaks `password_hash` / `totp_secret`.
* `test_soft_delete_marks_related_rows` — full sign-up → delete → confirm token invalid + `deletion_completes_at` populated.
* `test_scoped_collections_table_includes_all_phase4_collections` — regression guard: every PII-bearing collection (participants, documents, statements, hospital_admissions, family_wall_posts, care_plan_amendments, generated_reports, subscriptions, user_sessions, household_members) is in the cascade table.

### 6. Background scheduler
Startup hook `_privacy_purge_scheduler` in `server.py` launches the loop on every backend boot. Log line: `privacy purge scheduler started (interval=86400s, window=60d)`.

## Regression
Full sweep across all 6 test files (Phase 1+2+3+4+5+8+9): **55 / 55 PASS**.

## Risk register impact

* **HIGH** no full deletion cascade (some PII orphaned after delete) → **FIXED** (26 collections covered)
* **HIGH** no 60-day hard-delete schedule → **FIXED** (background loop)
* **HIGH** no `/account/export` route (APP 12 risk) → **FIXED**
* **MEDIUM** no NDB response runbook → **FIXED**
* **MEDIUM** no privacy-policy / APP mapping → **FIXED**

## Files changed

```
backend/
  privacy.py                  NEW — soft_delete_account + purge_expired_accounts + scheduler
  server.py                   DELETE /auth/account rewritten; GET /auth/account/export added;
                              _privacy_purge_scheduler startup hook

security-audit/
  ndb-breach-runbook.md       NEW — 8-section incident playbook
  privacy-policy-review.md    NEW — APP-by-APP audit

tests/
  test_phase8_9_admin_privacy.py   covers Phase 9 (combined file)
```

## Open follow-ups (logged in privacy-policy-review.md)
1. Update the public `/privacy` page copy with MFA + 60-day deletion language.
2. Publish a public `/trust` page mapping each APP to plain-English controls.
3. Add the `templates/breach_notification.html` email template.
4. Schedule quarterly tabletop exercises (first within 90 days).
5. Document CSFLE migration plan for free-text PII columns (longer-term).
