# Statement Lifecycle — Phase 1 (data model + audit log + duplicate detection)

This is the first phase of the four-phase rebuild specified in
`Wayly_Duplicate_statement_lifecycle_emergent_prompt.md`. Subsequent
phases (2: archive/restore/hard-delete + retention + invalidation hooks;
3: web modals + archived-statements page + audit-log view; 4: integration
tests + nightly reconciliation + mobile handoff brief) extend this
foundation without modifying it.

## What shipped in Phase 1

### New module
`/app/backend/lib/statement_lifecycle.py` — single source of truth for:
- state machine constants (`active`, `superseded`, `archived`, `deleted`,
  `manual_review`)
- audit event types
- `compute_file_sha256(raw)` — exact-duplicate signal
- `compute_extracted_fingerprint(extracted, line_items=...)` — semantic
  duplicate signal; canonical, order-insensitive, case-insensitive on
  provider
- `find_exact_dupe_by_file_sha(db, household_id, file_sha256)`
- `find_active_for_period(db, household_id, participant_id, period_label)`
- `write_audit(db, ...)` — append-only writer for `statement_audit_log`
- `lookup_idempotency` / `store_idempotency` — 24h replay protection
- `MANUAL_REVIEW_CONFIDENCE_THRESHOLD = 0.85`
- `PARSER_VERSION` tag stamped on every persisted statement

### New collections
- `statement_audit_log` — append-only, immutable at the app layer
- `idempotency_keys` — TTL-expired after 24h
- `derived_calculation_runs` — empty in Phase 1, indexes ready for Phase 2

### Index additions in `perf_indexes.py`
- `statements (household_id, file_sha256)` sparse — exact-dupe lookup
- `statements (household_id, extracted_fingerprint)` sparse — logical-dupe
  lookup
- **`statements partial unique` on `(household_id, participant_id,
  period_label)` where `state = "active"`** — the **structural guarantee**
  from the brief that at most one active version can exist for a logical
  statement
- `statements (state, archived_at)` sparse — retention sweeper
- `statement_audit_log (statement_id, event_at desc)` — single-statement
  audit trail
- `statement_audit_log (actor_user_id, event_at desc)` — per-user trail
- `derived_calculation_runs (participant_id, calculation_kind,
  calculated_at desc)` — dashboard read path
- `idempotency_keys (key, scope, user_id)` unique + `created_at` TTL 24h

### Upload pipeline (`POST /api/statements/upload`)
The sync path now:
1. Reads `Idempotency-Key` header (optional, recommended). Replays cached
   response if seen within 24h.
2. Computes `file_sha256` from the raw bytes.
3. Calls `find_exact_dupe_by_file_sha` — if a hit exists (and isn't
   hard-deleted), returns **`409 DUPLICATE_EXACT`** with
   `existing_statement_id`, `existing_filename`, `existing_period_label`,
   `existing_uploaded_at`. Writes a `duplicate_rejected` audit row.
4. Otherwise kicks off the existing async decode pipeline, threading
   `file_sha256` and `upload_idempotency_key` into the background job.

The background job (`_run_upload_job`) now:
1. Runs the existing extract + audit pipeline.
2. Computes `extracted_fingerprint` from the parsed content (provider +
   period + line-item canonical projection + grand total).
3. Looks up the currently-active statement for the same `(household,
   participant, period_label)`.
4. If found and fingerprints match → marks the job
   `status=duplicate, duplicate_kind=DUPLICATE_LOGICAL_SAME_CONTENT`,
   writes a `duplicate_rejected` audit row, and does NOT insert.
5. If found and fingerprints differ → supersedes the prior active version
   (demote to `superseded`, set `superseded_by` + `superseded_at`, bump
   `row_version`), inserts the new doc as `active`, writes audit rows for
   both `superseded` and `uploaded` + `accepted_as_active`.
6. If not found → inserts as `active`, writes `uploaded` + `accepted_as_active`.

Every persisted statement now carries: `state`, `file_sha256`,
`extracted_fingerprint`, `parser_version`, `parsing_confidence`,
`row_version`, `superseded_by`, `superseded_at`, `archived_at`,
`deleted_at`, `upload_idempotency_key`, `supersedes_version_id`.

### Job status endpoint (`GET /api/statements/upload-job/{job_id}`)
Now returns:
- `duplicate_kind` (when the job ended in a logical-dupe rejection)
- `existing_statement_id` (the statement the duplicate matched)
- `supersedes_version_id` (when the job created a revised version)

This is the contract the web/mobile UIs will read in Phase 3 to drive
Modal 2.

## What does NOT change in Phase 1
- Existing `GET /api/statements`, `GET /api/statements/{id}` are unchanged.
  By default they continue to surface only `state=active` because every
  legacy doc is treated as active (state field absent ≠ archived).
- All dashboard reads continue to work.
- No frontend UI changes yet (modals are Phase 3).

## Tests
`/app/backend/tests/test_statement_lifecycle.py` — 13 tests, all passing:
- file SHA determinism
- fingerprint determinism, order-insensitivity, case-insensitivity, and
  sensitivity to provider/total changes
- exact-dupe lookup scoped to household, skips hard-deleted
- logical-active lookup ignores superseded versions
- audit writer shape + actor_kind enum enforcement
- idempotency key round-trip + per-user/per-scope isolation

## End-to-end verification (live preview)
```
=== UPLOAD 1 ===
{"job_id":"...","status":"pending"}
=== UPLOAD 2 (same bytes, different idem key) ===
{"detail":{"error":"DUPLICATE_EXACT","existing_statement_id":"...",
            "existing_filename":"stmt.txt", "message":"This exact file
            has already been uploaded."}}
=== UPLOAD 3 (replay same idem key) ===
{"error":"DUPLICATE_EXACT", ...same body, no second audit row...}
```

Audit log after the run:
```
uploaded            user    None -> active   filename=stmt.txt
accepted_as_active  system  None -> active
duplicate_rejected  user    None -> None     reason=exact_file_sha_match
```
