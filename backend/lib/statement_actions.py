"""Statement lifecycle actions, Phase 2.

Builds on `statement_lifecycle.py` (Phase 1, hashing + dedupe + audit log)
with the user-initiated and system-initiated state transitions:

  active     -> archived     (user: soft delete)
  superseded -> archived     (user: soft delete)
  archived   -> active       (user: restore, only within 30 days)
  archived   -> deleted      (user erasure OR retention sweep, only after 30 days)

The "supersede" transition is owned by the upload pipeline (Phase 1) and
stays in `_run_upload_job`.

Every transition:
  1. validates the source state
  2. mutates the statement document (single update)
  3. writes an audit-log row via `statement_lifecycle.write_audit`
  4. publishes a state-change event for downstream invalidators

Downstream invalidators today:
  - Redis cache (lib/cache.invalidate_household + invalidate_participant)
  - placeholder hook `EMBEDDING_INVALIDATORS` so when the AI assistant
    later adds pgvector RAG, it just appends a callback here without
    touching this module.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from fastapi import HTTPException

from lib import cache
from lib.statement_lifecycle import (
    STATE_ACTIVE, STATE_SUPERSEDED, STATE_ARCHIVED, STATE_DELETED,
    EVT_ARCHIVED, EVT_RESTORED, EVT_DELETED_SOFT, EVT_DELETED_HARD,
    write_audit,
)

log = logging.getLogger("wayly.statement_actions")

# 30-day soft-delete window, per the brief.
RETENTION_DAYS = 30

# Pluggable invalidator hooks. Each callable is invoked with the same
# `event` dict the brief specifies. New consumers (e.g. embedding store)
# register themselves at import time by appending to this list.
StateChangeEvent = dict  # {event, statement_id, version_id, participant_id, prior_state, new_state, occurred_at}
INVALIDATOR_HOOKS: list[Callable[[StateChangeEvent], Awaitable[None]]] = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def register_invalidator(fn: Callable[[StateChangeEvent], Awaitable[None]]) -> None:
    """Add a downstream consumer that should be notified on every state
    change. Called at app startup."""
    INVALIDATOR_HOOKS.append(fn)


async def _publish_state_change(
    *,
    statement_id: str,
    version_id: str,
    participant_id: str | None,
    household_id: str | None,
    prior_state: str,
    new_state: str,
) -> None:
    """Drop Redis caches scoped to the affected household/participant and
    run any registered downstream invalidators (e.g. pgvector RAG, when
    we add it)."""
    event: StateChangeEvent = {
        "event": "statement_version_state_changed",
        "statement_id": statement_id,
        "version_id": version_id,
        "participant_id": participant_id,
        "prior_state": prior_state,
        "new_state": new_state,
        "occurred_at": _now_iso(),
    }
    # Cache invalidation is the only invariant, always run it.
    try:
        if household_id:
            await cache.invalidate_household(household_id)
        if participant_id:
            await cache.invalidate_participant(participant_id)
    except Exception as e:
        log.debug("cache invalidation failed: %s", e)
    # Downstream hooks (best-effort; one bad hook must not block others).
    for hook in INVALIDATOR_HOOKS:
        try:
            await hook(event)
        except Exception as e:
            log.warning("invalidator hook %s failed: %s", getattr(hook, "__name__", hook), e)


# ---------------- archive (soft delete) ----------------
async def archive_statement(
    db,
    *,
    statement_id: str,
    household_id: str,
    user_id: str,
    reason: str | None = None,
) -> dict:
    """Move a statement to `archived`. Permitted from `active` or `superseded`.

    Returns the updated statement document (without binary fields). Raises
    HTTPException on permission/state errors.
    """
    doc = await db.statements.find_one(
        {"id": statement_id, "household_id": household_id},
        {"_id": 0, "file_b64": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Statement not found")
    prior_state = doc.get("state") or STATE_ACTIVE
    if prior_state not in (STATE_ACTIVE, STATE_SUPERSEDED):
        raise HTTPException(
            status_code=409,
            detail=f"Statement is already {prior_state}; cannot archive.",
        )
    now = _now_iso()
    result = await db.statements.update_one(
        {"id": statement_id, "household_id": household_id, "state": prior_state},
        {
            "$set": {"state": STATE_ARCHIVED, "archived_at": now},
            "$inc": {"row_version": 1},
        },
    )
    if result.modified_count != 1:
        # Lost the race against another writer (optimistic concurrency).
        raise HTTPException(status_code=409, detail="Statement state changed concurrently; please retry.")
    await write_audit(
        db,
        statement_id=statement_id,
        version_id=statement_id,
        event_type=EVT_ARCHIVED,
        actor_user_id=user_id,
        actor_kind="user",
        prior_state=prior_state,
        new_state=STATE_ARCHIVED,
        metadata={"reason": reason or "user_requested"},
    )
    # Brief §Cache: also publish EVT_DELETED_SOFT for invalidators that
    # treat archive as "no longer authoritative".
    await write_audit(
        db,
        statement_id=statement_id,
        version_id=statement_id,
        event_type=EVT_DELETED_SOFT,
        actor_user_id=user_id,
        actor_kind="user",
        prior_state=prior_state,
        new_state=STATE_ARCHIVED,
        metadata={"reason": reason or "user_requested"},
    )
    await _publish_state_change(
        statement_id=statement_id, version_id=statement_id,
        participant_id=doc.get("participant_id"),
        household_id=household_id,
        prior_state=prior_state, new_state=STATE_ARCHIVED,
    )
    doc["state"] = STATE_ARCHIVED
    doc["archived_at"] = now
    return doc


# ---------------- restore ----------------
async def restore_statement(
    db,
    *,
    statement_id: str,
    household_id: str,
    user_id: str,
) -> dict:
    """Move a statement from `archived` back to `active`. Permitted only
    within the 30-day window and only if no OTHER version is currently
    active for the same logical key (the partial unique index would
    otherwise reject the update).
    """
    doc = await db.statements.find_one(
        {"id": statement_id, "household_id": household_id},
        {"_id": 0, "file_b64": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Statement not found")
    if (doc.get("state") or "") != STATE_ARCHIVED:
        raise HTTPException(status_code=409, detail="Only archived statements can be restored.")

    archived_at_str = doc.get("archived_at")
    if archived_at_str:
        try:
            archived_at = datetime.fromisoformat(str(archived_at_str).replace("Z", "+00:00"))
            if archived_at.tzinfo is None:
                archived_at = archived_at.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) - archived_at > timedelta(days=RETENTION_DAYS):
                raise HTTPException(
                    status_code=410,
                    detail=f"Restore window has expired ({RETENTION_DAYS} days). The statement can no longer be restored.",
                )
        except HTTPException:
            raise
        except Exception:
            pass

    # Conflict check, partial unique index will block the update if another
    # active version exists for the same logical key. Surface that early
    # with a friendlier error.
    period_label = doc.get("period_label")
    pid = doc.get("participant_id")
    if period_label:
        clash = await db.statements.find_one(
            {
                "household_id": household_id,
                "participant_id": pid,
                "period_label": period_label,
                "state": STATE_ACTIVE,
            },
            {"_id": 0, "id": 1},
        )
        if clash:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "ACTIVE_VERSION_EXISTS",
                    "blocking_version_id": clash["id"],
                    "message": "Another version of this statement is currently active. Archive it before restoring this one.",
                },
            )

    result = await db.statements.update_one(
        {"id": statement_id, "household_id": household_id, "state": STATE_ARCHIVED},
        {
            "$set": {"state": STATE_ACTIVE, "archived_at": None},
            "$inc": {"row_version": 1},
        },
    )
    if result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Statement state changed concurrently; please retry.")
    await write_audit(
        db,
        statement_id=statement_id,
        version_id=statement_id,
        event_type=EVT_RESTORED,
        actor_user_id=user_id,
        actor_kind="user",
        prior_state=STATE_ARCHIVED,
        new_state=STATE_ACTIVE,
    )
    await _publish_state_change(
        statement_id=statement_id, version_id=statement_id,
        participant_id=pid, household_id=household_id,
        prior_state=STATE_ARCHIVED, new_state=STATE_ACTIVE,
    )
    doc["state"] = STATE_ACTIVE
    doc["archived_at"] = None
    return doc


# ---------------- hard delete ----------------
async def hard_delete_statement(
    db,
    *,
    statement_id: str,
    household_id: str,
    user_id: str | None,
    actor_kind: str = "user",
    force: bool = False,
) -> dict:
    """Permanent delete. Requires either:
      (a) state = archived AND archived_at > RETENTION_DAYS ago, OR
      (b) `force=True` (explicit erasure under Privacy Principles, only
          callable by privileged code paths, not exposed to the client
          directly except through the dedicated erasure flow).

    The row is kept (so audit-log foreign keys remain valid) but all PII
    fields are nulled out and the binary file is dropped.
    """
    doc = await db.statements.find_one(
        {"id": statement_id, "household_id": household_id},
        {"_id": 0, "file_b64": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Statement not found")
    prior_state = doc.get("state") or STATE_ACTIVE
    if prior_state == STATE_DELETED:
        raise HTTPException(status_code=410, detail="Statement is already permanently deleted.")

    if not force:
        if prior_state != STATE_ARCHIVED:
            raise HTTPException(
                status_code=409,
                detail="Statement must be archived for at least 30 days before permanent delete.",
            )
        archived_at_str = doc.get("archived_at")
        try:
            archived_at = datetime.fromisoformat(str(archived_at_str).replace("Z", "+00:00")) if archived_at_str else None
            if archived_at and archived_at.tzinfo is None:
                archived_at = archived_at.replace(tzinfo=timezone.utc)
        except Exception:
            archived_at = None
        if archived_at is None or (datetime.now(timezone.utc) - archived_at) < timedelta(days=RETENTION_DAYS):
            raise HTTPException(
                status_code=409,
                detail=f"Statement must be archived for at least {RETENTION_DAYS} days before permanent delete.",
            )

    now = _now_iso()
    # Null out PII fields per brief; keep the row so audit log FKs hold.
    pii_fields_to_unset = [
        "file_b64", "raw_text_preview", "filename", "summary",
        "line_items", "anomalies", "informational_notes", "header_stream_budgets",
    ]
    unset_doc = {f: "" for f in pii_fields_to_unset}
    await db.statements.update_one(
        {"id": statement_id, "household_id": household_id},
        {
            "$set": {
                "state": STATE_DELETED, "deleted_at": now,
                "file_sha256": None, "extracted_fingerprint": None,
            },
            "$unset": unset_doc,
            "$inc": {"row_version": 1},
        },
    )
    await write_audit(
        db,
        statement_id=statement_id,
        version_id=statement_id,
        event_type=EVT_DELETED_HARD,
        actor_user_id=user_id,
        actor_kind=actor_kind,
        prior_state=prior_state,
        new_state=STATE_DELETED,
        metadata={"force": force, "retention_days": RETENTION_DAYS},
    )
    await _publish_state_change(
        statement_id=statement_id, version_id=statement_id,
        participant_id=doc.get("participant_id"),
        household_id=household_id,
        prior_state=prior_state, new_state=STATE_DELETED,
    )
    return {"id": statement_id, "state": STATE_DELETED, "deleted_at": now}


# ---------------- archive preview ----------------
async def compute_archive_impact(
    db,
    *,
    statement_id: str,
    household_id: str,
) -> dict:
    """Returns a preview of what archiving this statement would change.
    Read-only; never mutates.

    Phase 2 contract (Phase 3 will use these fields to populate Modal 3):
      - statement_total: this statement's grand total (AUD)
      - is_active: whether this is currently the active version
      - period_label
      - has_superseded_versions: whether older versions exist that the
        user could manually restore after archiving
      - leaves_period_gap: true iff archiving will leave NO active version
        for this period (so the dashboard will render a gap)
    """
    doc = await db.statements.find_one(
        {"id": statement_id, "household_id": household_id},
        {"_id": 0, "file_b64": 0, "raw_text_preview": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Statement not found")
    is_active = (doc.get("state") or STATE_ACTIVE) == STATE_ACTIVE
    period_label = doc.get("period_label")
    pid = doc.get("participant_id")

    total = 0.0
    for li in (doc.get("line_items") or []):
        try:
            total += float(li.get("total") or 0)
        except Exception:
            pass

    has_superseded = False
    if period_label:
        sib = await db.statements.find_one(
            {
                "household_id": household_id,
                "participant_id": pid,
                "period_label": period_label,
                "state": STATE_SUPERSEDED,
            },
            {"_id": 0, "id": 1},
        )
        has_superseded = sib is not None

    leaves_period_gap = is_active and not has_superseded
    return {
        "statement_id": statement_id,
        "is_active": is_active,
        "period_label": period_label,
        "statement_total_aud": round(total, 2),
        "has_superseded_versions": has_superseded,
        "leaves_period_gap": leaves_period_gap,
        "filename": doc.get("filename"),
        "uploaded_at": doc.get("uploaded_at"),
    }


# ---------------- retention sweep ----------------
async def run_retention_sweep(db) -> dict:
    """Hard-delete every archived statement whose `archived_at` is older
    than `RETENTION_DAYS`. Returns a summary suitable for logging.

    Designed to be called from a periodic background task. Idempotent ,
    re-running over the same window is a no-op since hard-deleted rows
    are already in `state=deleted` and excluded by the query.

    Also runs a storage cross-check (brief §Observability) over every
    non-deleted statement and reports rows that are missing their
    underlying file payload. The cross-check is read-only, alerts only.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    cutoff_iso = cutoff.isoformat()
    # Find expired archived rows. archived_at is ISO string in our schema.
    cursor = db.statements.find(
        {"state": STATE_ARCHIVED, "archived_at": {"$lt": cutoff_iso}},
        {"_id": 0, "id": 1, "household_id": 1},
    )
    deleted = 0
    errors = 0
    async for row in cursor:
        try:
            await hard_delete_statement(
                db,
                statement_id=row["id"],
                household_id=row["household_id"],
                user_id=None,
                actor_kind="retention_job",
                force=True,
            )
            deleted += 1
        except Exception as e:
            log.warning("retention sweep failed for %s: %s", row.get("id"), e)
            errors += 1

    crosscheck = await run_storage_crosscheck(db)
    return {
        "deleted": deleted,
        "errors": errors,
        "cutoff": cutoff_iso,
        "storage_crosscheck": crosscheck,
    }


async def run_storage_crosscheck(db, *, alert_limit: int = 50) -> dict:
    """Brief §Observability: assert every non-deleted statement still
    resolves to its underlying file. Wayly stores the file payload
    inline (`file_b64`), so the check is "row has file_b64 and it
    base64-decodes to ≥ file_size_bytes / 2 of bytes".

    Runs read-only. Emits a structured WARN log per drift row up to
    `alert_limit`, plus returns a summary so monitoring can surface
    drift count. Hooked into the retention sweep so the daily job
    catches storage drift the same time it catches retention drift.
    """
    import base64 as _b64

    cursor = db.statements.find(
        {"state": {"$ne": STATE_DELETED}},
        {"_id": 0, "id": 1, "household_id": 1, "filename": 1, "file_b64": 1, "file_size_bytes": 1, "state": 1},
    )
    scanned = 0
    drift_rows: list[dict] = []
    async for row in cursor:
        scanned += 1
        b64 = row.get("file_b64")
        size = int(row.get("file_size_bytes") or 0)
        problem: str | None = None
        if not b64:
            # Allow rows that never had a payload (legacy / inbound-email
            # ingestion). Only flag when file_size_bytes claims content.
            if size > 0:
                problem = "file_b64_missing_but_size_nonzero"
        else:
            try:
                decoded = _b64.b64decode(b64, validate=False)
                # Quarter-of-size lower bound to avoid false positives for
                # very small statements where base64 overhead matters.
                if size and len(decoded) < max(64, size // 2):
                    problem = "file_b64_decodes_smaller_than_recorded_size"
            except Exception as e:
                problem = f"file_b64_corrupt:{type(e).__name__}"
        if problem:
            drift_rows.append({
                "id": row["id"],
                "household_id": row.get("household_id"),
                "filename": row.get("filename"),
                "state": row.get("state"),
                "problem": problem,
            })
            if len(drift_rows) >= alert_limit:
                break

    if drift_rows:
        for drift in drift_rows[:10]:  # first 10 in logs
            log.warning(
                "storage crosscheck DRIFT id=%s problem=%s state=%s filename=%s",
                drift["id"], drift["problem"], drift["state"], drift.get("filename"),
            )
        # Phase 4 bolt-in: surface drift in the Admin dashboard via the
        # same `system_alerts` pipeline used by malware uploads. Best-effort;
        # never let an alerter failure mask the cross-check result.
        try:
            from security_alerter import record_storage_drift
            await record_storage_drift(db, drift_rows=drift_rows)
        except Exception as e:
            log.warning("failed to publish storage drift to system_alerts: %s", e)

    return {
        "scanned": scanned,
        "drift_count": len(drift_rows),
        "drift_capped_at": alert_limit,
        "drift_examples": drift_rows[:10],
        "ran_at": _now_iso(),
    }
