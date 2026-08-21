"""Statement lifecycle helpers, Phase 1 of the duplicate-handling rebuild.

Implements the building blocks the upload pipeline needs:

* file-content SHA-256
* semantic fingerprint over the extracted statement (provider + period +
  line-item totals + grand total)
* dedupe lookups (exact and logical)
* state machine constants
* the immutable audit log writer

This module is intentionally pure, no FastAPI imports, no LLM calls.
All database access goes through a passed-in motor collection so the
helpers are trivially unit-testable.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable

# ---------- state machine ----------
STATE_ACTIVE = "active"
STATE_SUPERSEDED = "superseded"
STATE_ARCHIVED = "archived"
STATE_DELETED = "deleted"
STATE_MANUAL_REVIEW = "manual_review"

VALID_STATES = {STATE_ACTIVE, STATE_SUPERSEDED, STATE_ARCHIVED, STATE_DELETED, STATE_MANUAL_REVIEW}

# Audit event types (kept in lock-step with the brief).
EVT_UPLOADED = "uploaded"
EVT_ACCEPTED_ACTIVE = "accepted_as_active"
EVT_SUPERSEDED = "superseded"
EVT_ARCHIVED = "archived"
EVT_RESTORED = "restored"
EVT_DELETED_SOFT = "deleted_soft"
EVT_DELETED_HARD = "deleted_hard"
EVT_DUPLICATE_REJECTED = "duplicate_rejected"
EVT_MANUAL_REVIEW_PASSED = "manual_review_passed"
EVT_MANUAL_REVIEW_FAILED = "manual_review_failed"

# Duplicate error codes returned to the upload client. Match the brief.
DUP_EXACT = "DUPLICATE_EXACT"                          # same file SHA, same household
DUP_LOGICAL_SAME = "DUPLICATE_LOGICAL_SAME_CONTENT"    # same period + same fingerprint
DUP_LOGICAL_DIFF = "DUPLICATE_LOGICAL_DIFFERENT_CONTENT"  # same period, different content

# Confidence threshold below which a parse goes to manual review (per brief §Upload pipeline).
MANUAL_REVIEW_CONFIDENCE_THRESHOLD = 0.85

# Current parser version tag. Bump when the extraction pipeline materially changes.
PARSER_VERSION = "wayly-decoder-2026.02"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- hashing ----------
def compute_file_sha256(raw: bytes) -> str:
    """SHA-256 of the raw uploaded bytes. Used for exact-duplicate detection."""
    return hashlib.sha256(raw).hexdigest()


def _normalise_line_item(li: dict) -> dict:
    """Reduce a line item to the fields that define semantic identity.

    We deliberately exclude free-text fields (service_name) because two
    providers can describe the same service differently in different
    statement re-exports. The signal is dates + amounts.
    """
    def _f(x: Any) -> float:
        try:
            return round(float(x or 0), 2)
        except Exception:
            return 0.0
    return {
        "d": str(li.get("date") or "")[:10],
        "c": (li.get("service_code") or "").strip().upper(),
        "u": _f(li.get("units") or li.get("hours")),
        "p": _f(li.get("unit_price") or li.get("unit_rate")),
        "t": _f(li.get("total") or li.get("gross")),
    }


def compute_extracted_fingerprint(extracted: dict, *, line_items: Iterable[dict] | None = None) -> str:
    """SHA-256 of a canonical projection of the parsed statement.

    The fingerprint catches re-downloads of the same statement (the file
    bytes may differ, PDF metadata, generation timestamps, but the
    content is identical). Two statements with the same fingerprint must
    have the same provider, the same period, and exactly the same line
    items by date / code / units / unit price / total.
    """
    items_source = list(line_items) if line_items is not None else (extracted.get("line_items") or [])
    normalised_items = [_normalise_line_item(li) for li in items_source if isinstance(li, dict)]
    # Sort so order-of-line-items doesn't shift the hash.
    normalised_items.sort(key=lambda x: (x["d"], x["c"], x["t"], x["u"], x["p"]))
    payload = {
        "provider": (extracted.get("provider_name") or extracted.get("provider") or "").strip().lower(),
        "period": (extracted.get("statement_period") or extracted.get("period_label") or "").strip().lower(),
        "items": normalised_items,
        "grand_total": round(float(extracted.get("grand_total") or extracted.get("total") or 0), 2),
    }
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


# ---------- dedupe lookups ----------
async def find_exact_dupe_by_file_sha(db, *, household_id: str, file_sha256: str) -> dict | None:
    """An identical file already uploaded for this household? Search excludes
    deleted versions (so a user who hard-deleted can re-upload)."""
    return await db.statements.find_one(
        {
            "household_id": household_id,
            "file_sha256": file_sha256,
            "state": {"$ne": STATE_DELETED},
        },
        {"_id": 0, "id": 1, "state": 1, "uploaded_at": 1, "filename": 1, "period_label": 1, "participant_id": 1},
    )


async def find_active_for_period(db, *, household_id: str, participant_id: str | None, period_label: str | None) -> dict | None:
    """Find the currently-active statement for the same logical key
    (household + participant + period_label). Used to detect logical
    duplicates after parsing."""
    if not period_label:
        return None
    q: dict = {
        "household_id": household_id,
        "period_label": period_label,
        "state": STATE_ACTIVE,
    }
    if participant_id:
        q["participant_id"] = participant_id
    return await db.statements.find_one(
        q,
        {"_id": 0, "id": 1, "state": 1, "uploaded_at": 1, "filename": 1, "extracted_fingerprint": 1, "participant_id": 1, "period_label": 1, "row_version": 1},
    )


# ---------- audit log ----------
async def write_audit(
    db,
    *,
    statement_id: str,
    version_id: str | None = None,
    event_type: str,
    actor_user_id: str | None,
    actor_kind: str = "user",
    prior_state: str | None = None,
    new_state: str | None = None,
    metadata: dict | None = None,
) -> dict:
    """Append-only audit-log row. Returns the inserted doc (with `_id` stripped).

    Immutability is enforced at the application layer for now, the
    collection has no update path exposed anywhere in the codebase.
    """
    if actor_kind not in {"user", "system", "retention_job"}:
        raise ValueError(f"invalid actor_kind: {actor_kind}")
    doc = {
        "id": str(uuid.uuid4()),
        "statement_id": statement_id,
        "version_id": version_id,
        "event_type": event_type,
        "event_at": _now_iso(),
        "actor_user_id": actor_user_id,
        "actor_kind": actor_kind,
        "prior_state": prior_state,
        "new_state": new_state,
        "metadata": metadata or {},
    }
    await db.statement_audit_log.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ---------- idempotency ----------
async def lookup_idempotency(db, *, key: str, scope: str, user_id: str) -> dict | None:
    """Return the stored response for a previously-seen idempotency key,
    or None if first time. Scope namespaces keys so /upload and /archive
    don't collide."""
    return await db.idempotency_keys.find_one(
        {"key": key, "scope": scope, "user_id": user_id},
        {"_id": 0},
    )


async def store_idempotency(
    db,
    *,
    key: str,
    scope: str,
    user_id: str,
    response: dict,
    ttl_hours: int = 24,
) -> None:
    """Persist a response under an idempotency key. A TTL index on the
    `idempotency_keys` collection (created in perf_indexes.py) expires
    rows after 24h."""
    doc = {
        "key": key,
        "scope": scope,
        "user_id": user_id,
        "response": response,
        "created_at": _now_iso(),
        "expires_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
    }
    # Upsert so a retry from the same key is harmless.
    await db.idempotency_keys.update_one(
        {"key": key, "scope": scope, "user_id": user_id},
        {"$setOnInsert": doc},
        upsert=True,
    )
