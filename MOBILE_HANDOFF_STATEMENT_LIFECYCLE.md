# Mobile handoff — Statement Lifecycle UI parity

**For**: the Wayly mobile (React Native / Expo) agent.
**From**: web team. Phases 1–4 of the duplicate-statement lifecycle have shipped on the FastAPI backend + the React web client. Mobile only needs the **UI half** — every backend endpoint, state machine, audit log and reconciliation job is already live.

This brief is a trimmed extract of `/app/Wayly_Duplicate_statement_lifecycle_emergent_prompt.md` plus the API surface as actually implemented.

---

## What the mobile client must build

1. **Five modals** with copy + behaviour matching the web app exactly.
2. **An archived-statements screen** with restore + permanent-delete actions.
3. **A per-statement audit-log screen** rendered as a vertical timeline.
4. **A "needs review" banner** on the statement detail screen when `parsing_confidence < 0.85`.
5. **An archived-state banner** on the statement detail screen when `state === "archived"`.
6. **A "see your audit trail" CTA** on the Settings/Privacy/Security screen that deep-links to the latest statement's audit log.

The web equivalents are in:
- `/app/frontend/src/components/statements/StatementLifecycleModals.jsx`
- `/app/frontend/src/pages/statements/ArchivedStatements.jsx`
- `/app/frontend/src/pages/statements/StatementAuditLog.jsx`

Mirror the structure, copy, and CTAs exactly. Adapt the styling to the mobile design system.

---

## API contract (everything is live; nothing to build)

Base path: same `REACT_APP_BACKEND_URL` you already use. All paths are prefixed with `/api`.

### 1. Upload duplicate detection

**`POST /api/statements/upload`** (multipart, `file=...`)
Recommended header: **`Idempotency-Key`** — generate one per upload attempt (e.g. `upload-{timestamp}-{random}`). The server replays the same response for the same key for 24h, so accidental double-taps are harmless.

Possible responses:

| HTTP | Body | Meaning | UI |
|---|---|---|---|
| `200` | `{job_id, status: "pending"}` | Happy path | Poll job status |
| `409` | `{detail: {error: "DUPLICATE_EXACT", existing_statement_id, existing_filename, existing_period_label, existing_uploaded_at, message}}` | Same file bytes already uploaded | Open **Modal 1 — DupExact** |

### 2. Upload job polling

**`GET /api/statements/upload-job/{job_id}`**
Poll every ~2 s; jobs complete in 30–90 s for typical statements.

| `status` | Other fields | Meaning | UI |
|---|---|---|---|
| `pending` | — | Still parsing | Spinner |
| `done` | `statement_id` | Happy path | Navigate to detail |
| `done` | `statement_id`, `duplicate_kind: "DUPLICATE_LOGICAL_DIFFERENT_CONTENT"`, `supersedes_version_id` | Revised statement — new active, prior auto-superseded | Open **Modal 2b — DupLogicalDiff** before navigating |
| `duplicate` | `duplicate_kind: "DUPLICATE_LOGICAL_SAME_CONTENT"`, `existing_statement_id` | Same content, different file | Open **Modal 2a — DupLogicalSame** |
| `error` | `error` | Parse failed | Toast the error |

### 3. Archive (soft delete)

**`DELETE /api/statements/{id}/archive?preview=true`** — read-only impact preview. Returns:
```json
{
  "statement_id": "...",
  "is_active": true,
  "period_label": "Feb 2026",
  "statement_total_aud": 245.30,
  "has_superseded_versions": false,
  "leaves_period_gap": true,
  "filename": "feb.pdf",
  "uploaded_at": "..."
}
```
Drive **Modal 3 — ArchiveConfirm** from this payload. If `leaves_period_gap === true`, show the orange "this leaves a gap" warning. If `has_superseded_versions === true`, show the "you can restore an older version later" hint (mutually exclusive with the gap warning).

**`DELETE /api/statements/{id}/archive`** (no `preview`) — actually archives. Returns `{id, state: "archived", archived_at}`. Accepts `Idempotency-Key`.

### 4. Restore

**`POST /api/statements/{id}/restore`** — only valid for archived rows within 30 days. Returns `{id, state: "active"}`. Accepts `Idempotency-Key`.

Possible errors:
- `409 {detail: {error: "ACTIVE_VERSION_EXISTS", blocking_version_id, message}}` — another version is currently active for the same period. Show a toast: "Another version is currently active. Archive that one first."
- `410` — restore window expired.

### 5. Hard delete

**`DELETE /api/statements/{id}/permanent`** — only valid once the row has been archived for ≥ 30 days. Returns `{id, state: "deleted", deleted_at}`. Accepts `Idempotency-Key`.

Drive from **Modal 4 — PermanentDelete**. Gate the submit button on `typed.trim().toLowerCase() === period_label.trim().toLowerCase()`. Show a "Download original first" button when the statement has the file available (`has_original_file === true` on `GET /api/statements/{id}`).

### 6. List archived

**`GET /api/statements/archived`** → array of:
```json
{
  "id": "...",
  "filename": "feb.pdf",
  "period_label": "Feb 2026",
  "uploaded_at": "...",
  "archived_at": "...",
  "participant_id": "...",
  "file_size_bytes": 12345,
  "anomaly_dollar_impact_total": 0,
  "restore_until": "2026-07-24T...",
  "days_left_to_restore": 29
}
```

`days_left_to_restore <= 0` → disable restore button, enable permanent-delete button.
`days_left_to_restore <= 3` → highlight in orange ("expires soon").

### 7. Audit log

**`GET /api/statements/{id}/audit-log`** → `{statement_id, events}`. Events are ordered oldest first, each with:
```json
{
  "id": "...",
  "statement_id": "...",
  "version_id": "...",
  "event_type": "uploaded" | "accepted_as_active" | "superseded" | "archived" |
                "deleted_soft" | "restored" | "deleted_hard" |
                "duplicate_rejected" | "manual_review_passed" | "manual_review_failed",
  "event_at": "2026-02-15T03:14:11+00:00",
  "actor_user_id": "..." | null,
  "actor_kind": "user" | "system" | "retention_job",
  "prior_state": "active" | "archived" | "superseded" | "deleted" | null,
  "new_state":   "active" | "archived" | "superseded" | "deleted" | null,
  "metadata": {"reason": "...", "filename": "...", ...}
}
```

Render as a vertical timeline. Web uses these icons (Lucide); mobile can swap to any equivalent icon set:

| event_type | icon | label |
|---|---|---|
| `uploaded` | `Upload` | "Uploaded" |
| `accepted_as_active` | `CheckCircle2` | "Accepted as active" |
| `superseded` | `Archive` | "Superseded by new version" |
| `archived` | `Archive` | "Archived" |
| `deleted_soft` | `Archive` | "Soft-deleted (archived)" |
| `restored` | `RotateCcw` | "Restored to active" |
| `deleted_hard` | `Trash2` | "Permanently deleted" |
| `duplicate_rejected` | `FileWarning` | "Duplicate upload rejected" |

Actor labels:
- `actor_kind === "user"` → "By you"
- `actor_kind === "retention_job"` → "By the retention sweep"
- `actor_kind === "system"` → "By the system"

---

## Modal copy — Appendix A (verbatim — do not reword)

**Modal 1 — DupExact**
> **Title**: "You've uploaded this statement before"
> **Body**: "We compared the file you just dropped in against your history and found it's byte-for-byte identical to one we've already processed. We'd usually wave you through — but since nothing's changed, there's no new work to do."
> **CTAs**: "Cancel" · "View existing statement"

**Modal 2a — DupLogicalSame**
> **Title**: "Looks like the same statement, re-exported"
> **Body**: "The file is different on disk, but every line item, total and date is identical to a statement you've already uploaded. Most providers re-generate PDFs with a new timestamp — that's almost certainly what happened here."
> **CTAs**: "Cancel" · "View existing statement"

**Modal 2b — DupLogicalDiff**
> **Title**: "Looks like a revised statement — saved as a new version"
> **Body**: "The period matches a statement you already have, but the numbers don't. We've kept the old version in your audit trail and made this new one your active statement. Any reports or budget calculations now use the revised numbers."
> **CTAs**: "View audit log" · "View new statement"

**Modal 3 — ArchiveConfirm**
> **Title**: "Archive this statement?"
> **Body**: "Archiving hides this statement from your dashboard, reports, and AI assistant. You have **30 days** to restore it before it's permanently deleted."
> **Gap warning** (when `leaves_period_gap === true`): "This is the only active statement for this period. Archiving will leave a gap — your dashboard will show this period as **missing** until you upload another."
> **Restore-prior hint** (when `has_superseded_versions === true && !leaves_period_gap`): "An older version of this period is in your history. After archiving you can restore it from the archived statements page."
> **CTAs**: "Cancel" · "Archive statement" (terracotta)

**Modal 4 — PermanentDelete**
> **Title**: "Permanently delete this statement?"
> **Body**: "This **cannot be undone**. The file, every line item, and the parsed summary will be removed. We keep an audit-log entry showing that you deleted it, but nothing else."
> **Download CTA** (if `has_original_file`): "Download the original file first"
> **Confirm input**: "To confirm, type the period label below: {period_label}"
> **CTAs**: "Cancel" · "Permanently delete" (terracotta, disabled until typed value matches)

**NeedsReviewBanner** (shown on detail screen when `parsing_confidence < 0.85`)
> "**Low parsing confidence ({Math.round(confidence * 100)}%).** Some line items may be wrong — double-check against the original PDF before relying on this for any decisions."

**Archived-state banner** (shown on detail screen when `state === "archived"`)
> "**This statement is archived** and hidden from your dashboard, reports, and AI assistant. Restore it within 30 days to bring it back."

---

## Out of scope for mobile

- The retention sweep, reconciliation job, storage cross-check, and audit-log writes are all server-side. Mobile makes no decisions about state — only reflects what the API returns.
- Admin endpoints (`/api/admin/reconciliation/run`, etc.) are not exposed to consumer apps.

## Testing parity

The web app uses these `data-testid`s, kept stable. Mobile should use the same identifiers (or RN's `testID=`) so the e2e suite can drive both clients with one script:

```
dup-exact-modal, dup-exact-view-existing-btn, dup-exact-cancel-btn
dup-logical-same-modal, dup-logical-same-view-existing-btn
dup-logical-diff-modal, dup-logical-diff-view-new-btn, dup-logical-diff-view-audit-btn
archive-confirm-modal, archive-confirm-submit, archive-confirm-cancel,
  archive-gap-warning, archive-restore-prior-hint
permanent-delete-modal, permanent-delete-submit, permanent-delete-cancel,
  permanent-delete-confirm-input, permanent-delete-download-original
needs-review-banner
archived-statements-page, archived-row-{id}, archived-restore-{id}, archived-delete-{id},
  archived-empty-state
statement-audit-log-page, audit-log-timeline, audit-event-{event_type}, audit-log-empty
statement-archive-btn, statement-restore-btn, statement-permanent-delete-btn,
  statement-archived-banner, statement-audit-log-link
statements-archived-link  (the pill on the statements list)
security-audit-trail-card, security-view-audit-log  (Settings → Security)
```

---

End of handoff.
