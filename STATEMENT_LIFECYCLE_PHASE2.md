# Statement Lifecycle — Phase 2 (archive / restore / hard delete + retention + storage cross-check)

Phase 2 of the four-phase rebuild from
`Wayly_Duplicate_statement_lifecycle_emergent_prompt.md`. Builds on
Phase 1 (data model + audit log + duplicate detection). Phase 3 will
add the web UI; Phase 4 adds nightly reconciliation + the mobile
handoff brief.

## What shipped

### New module `/app/backend/lib/statement_actions.py`
The three user-initiated state transitions plus the system-initiated
retention sweep, each one writing to the immutable audit log and
publishing a state-change event for cache/embedding invalidators.

* `archive_statement(db, statement_id, household_id, user_id)` — soft
  delete. Permitted from `active` and `superseded`. Bumps `row_version`
  (optimistic concurrency) and emits both `archived` and `deleted_soft`
  audit events.
* `restore_statement(db, ...)` — only valid for `state=archived` and
  only within the 30-day window. Detects the partial-unique-index
  collision early (returns a friendly `ACTIVE_VERSION_EXISTS` error
  rather than letting the DB write blow up).
* `hard_delete_statement(db, ..., force=False)` — permanent erasure.
  Requires `state=archived` AND `archived_at` older than 30 days unless
  `force=True` (system-initiated, e.g. retention job or APP-11
  erasure). Nulls every PII field (`file_b64`, `raw_text_preview`,
  `filename`, `summary`, `line_items`, `anomalies`, ...) but **keeps the
  row** so audit-log foreign keys remain valid. Brief-compliant
  tombstone.
* `compute_archive_impact(db, ...)` — read-only preview powering Modal 3
  in Phase 3 (`is_active`, `statement_total_aud`, `has_superseded_versions`,
  `leaves_period_gap`, `period_label`).
* `run_retention_sweep(db)` — hard-deletes every archived row past the
  30-day cutoff, then runs the storage cross-check. Idempotent.
* `run_storage_crosscheck(db)` — brief §Observability requirement.
  Asserts every non-deleted statement still resolves to its underlying
  file payload (in our schema, `file_b64`). Flags rows whose payload is
  missing, corrupt, or substantially smaller than the recorded
  `file_size_bytes`. Read-only — logs WARN per drift row, returns a
  summary for monitoring.

### Pluggable invalidation hooks
`register_invalidator(fn)` lets future consumers (pgvector embedding
store, search index, etc.) subscribe to state-change events without
modifying this module. Hooks receive the brief-spec event shape:
`{event, statement_id, version_id, participant_id, prior_state,
new_state, occurred_at}`. Today the only built-in invalidator is the
Redis cache layer (`lib.cache.invalidate_household` +
`invalidate_participant`).

### New endpoints (mounted on `api` in `server.py`)
| Method | Path | Behaviour |
|---|---|---|
| `GET` | `/api/statements/archived` | List archived rows in the household, ordered by `archived_at desc`, with `restore_until` + `days_left_to_restore` pre-computed |
| `GET` | `/api/statements/{id}/audit-log` | Full audit trail for one statement, oldest first |
| `DELETE` | `/api/statements/{id}/archive?preview=true` | Returns impact preview (read-only) |
| `DELETE` | `/api/statements/{id}/archive` | Soft delete. Accepts `Idempotency-Key` header. |
| `POST` | `/api/statements/{id}/restore` | Restore from archive (30-day window). Accepts `Idempotency-Key`. |
| `DELETE` | `/api/statements/{id}/permanent` | Hard delete. Requires archived ≥ 30 days. Accepts `Idempotency-Key`. |

### Default-hide behaviour on existing list / get
* `GET /api/statements` now excludes `archived` and `deleted` by default.
  Pass `?include_archived=true` to opt in (`deleted` is never returned).
* `GET /api/statements/{id}` returns `410 Gone` for hard-deleted
  tombstones (the row exists for audit-log FK integrity, but its body
  is not accessible).

### Periodic retention sweeper
Wired into FastAPI startup as `_start_statement_retention_sweeper` (in
`server.py`). Runs every 6 hours after a 60-second startup delay. Each
run hard-deletes expired archives AND runs the storage cross-check —
both observability and retention in one pass.

### Tests
`/app/backend/tests/test_statement_actions.py` — 18 tests, all passing.
Coverage:
* archive happy path + audit log shape + row_version bump
* archive allowed from `superseded`, blocked from `archived`/`deleted`
* archive 404 on missing
* restore happy path + 410 outside window + 409 when another version is
  active
* hard delete 409 before window + happy path after window + force bypass
  + double-delete 410
* archive impact preview (no prior, with superseded prior)
* retention sweep deletes only expired archived rows; storage
  cross-check is part of the summary
* storage cross-check flags missing-payload, corrupt-base64, ignores
  hard-deleted rows, passes on valid payloads

### Live e2e verification (preview)
```
=== 1. ARCHIVE PREVIEW ===
{"statement_id":"…","is_active":true,"period_label":"…",
 "statement_total_aud":120.0,"has_superseded_versions":false,
 "leaves_period_gap":true,"filename":"phase2-test.pdf"}
=== 2. ARCHIVE ===
{"id":"…","state":"archived","archived_at":"2026-06-24T12:29:50…"}
=== 3. ARCHIVE IDEMPOTENT REPLAY ===
{"id":"…","state":"archived","archived_at":"2026-06-24T12:29:50…"}
  ↑ identical archived_at proves the replay served the cached response
=== 4. LIST ARCHIVED ===
  id=… archived_at=2026-06-24T12:29:50… days_left=29
=== 5. RESTORE ===
{"id":"…","state":"active"}
=== 6. HARD DELETE before 30 days → HTTP 409
=== 7. AUDIT LOG ===
  archived          user    active   -> archived
  deleted_soft      user    active   -> archived
  restored          user    archived -> active
  archived          user    active   -> archived
  deleted_soft      user    active   -> archived
```

## Phase 2 is NOT
* The 4 modals + archived-statements page + audit-log view + gap
  rendering + needs-review banner — that's Phase 3 (web UI), driven off
  the API surface above
* Nightly reconciliation job (Phase 4)
* Mobile handoff brief (Phase 4)

The API contract for Modal 3 is finalised — when Phase 3 starts, the
"archive impact" preview already returns exactly the fields the modal
must display.
