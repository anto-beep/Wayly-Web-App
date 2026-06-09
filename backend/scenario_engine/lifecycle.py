"""Participant lifecycle state machine and per-state audit log.

The 14 mutually-exclusive states cover every place a Support at Home
participant can sit in their journey through the program. Transitions
between states are explicit, validated, and audited. Free-form writes to
``ParticipantV2.lifecycle_state`` are not allowed — every change goes
through ``apply_transition``.

This module deliberately exposes a small surface:
    LIFECYCLE_STATES, TERMINAL_STATES, INITIAL_STATES
    ALLOWED_TRANSITIONS         transition map (state -> set of next states)
    is_transition_allowed(...)
    apply_transition(...)        the guard + audit writer
    get_current_state(...)
    get_state_audit(...)         participant timeline of state changes

Audit
-----
Every accepted transition (and every REJECTED attempt) is written to the
``participant_state_audit`` Mongo collection. Each row is hash-chained to
the previous one so any tampering shows up at verify time. The hash is
``sha256(prev_hash || canonical_json(row_without_hash))``.

The SAFEGUARDING_ALERT flag does NOT live in this module — see
``scenario_engine.flags``. Its visibility wrapper applies the same access
restriction to state-audit rows that recorded a safeguarding transition.
"""
from __future__ import annotations
import hashlib
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

log = logging.getLogger("wayly.scenario_engine.lifecycle")


# ---------------------------------------------------------------------------
# States
# ---------------------------------------------------------------------------
LIFECYCLE_STATES: List[str] = [
    "AWAITING_ASSESSMENT",
    "ASSESSED_WAITLISTED",
    "INTERIM_FUNDED",
    "ACTIVE",
    "AWAITING_REASSESSMENT",
    "RESTORATIVE",
    "END_OF_LIFE",
    "HOSPITALISED",
    "IN_RESPITE",
    "SERVICES_PAUSED",
    "OVERSEAS",
    "MOVED_TO_RESIDENTIAL",
    "EXITED",
    "DECEASED",
]
LIFECYCLE_STATES_SET: Set[str] = set(LIFECYCLE_STATES)

# Terminal: once entered, no transitions out (except EXITED can re-enter as
# AWAITING_ASSESSMENT under the "temporarily ineligible then re-eligible"
# scenario 10.1; DECEASED is fully terminal).
TERMINAL_STATES: Set[str] = {"DECEASED"}

# A new participant starts here unless they're being onboarded as already on
# the program (then ACTIVE).
INITIAL_STATES: Set[str] = {"AWAITING_ASSESSMENT", "ACTIVE"}


# ---------------------------------------------------------------------------
# Transition map (from the scenario catalogue)
# ---------------------------------------------------------------------------
# Each key maps to the set of allowed next states. Read top to bottom; if a
# transition isn't listed it isn't allowed.
ALLOWED_TRANSITIONS: Dict[str, Set[str]] = {
    "AWAITING_ASSESSMENT": {
        "ASSESSED_WAITLISTED", "INTERIM_FUNDED", "ACTIVE", "EXITED", "DECEASED",
    },
    "ASSESSED_WAITLISTED": {
        "INTERIM_FUNDED", "ACTIVE", "EXITED", "DECEASED",
    },
    "INTERIM_FUNDED": {
        "ACTIVE", "EXITED", "DECEASED", "HOSPITALISED",
    },
    "ACTIVE": {
        "HOSPITALISED", "AWAITING_REASSESSMENT", "RESTORATIVE", "END_OF_LIFE",
        "IN_RESPITE", "SERVICES_PAUSED", "OVERSEAS", "MOVED_TO_RESIDENTIAL",
        "EXITED", "DECEASED",
    },
    "AWAITING_REASSESSMENT": {
        "ACTIVE", "HOSPITALISED", "END_OF_LIFE", "EXITED", "DECEASED",
    },
    "RESTORATIVE": {
        "ACTIVE", "END_OF_LIFE", "HOSPITALISED", "EXITED", "DECEASED",
    },
    "END_OF_LIFE": {
        # Scenario 1.11 — participant outlives the 12-week funding -> back to ACTIVE.
        "ACTIVE", "DECEASED", "HOSPITALISED", "MOVED_TO_RESIDENTIAL",
    },
    "HOSPITALISED": {
        # Common return path is ACTIVE; can move to residential or palliative;
        # TCP after hospital is modelled as a Restorative episode (scenario 2.3).
        "ACTIVE", "MOVED_TO_RESIDENTIAL", "DECEASED",
        "RESTORATIVE", "END_OF_LIFE",
    },
    "IN_RESPITE": {
        "ACTIVE", "MOVED_TO_RESIDENTIAL", "HOSPITALISED", "DECEASED",
    },
    "SERVICES_PAUSED": {
        "ACTIVE", "EXITED", "DECEASED",
    },
    "OVERSEAS": {
        # Temporary overseas -> back to ACTIVE; permanent -> EXITED.
        "ACTIVE", "EXITED", "DECEASED",
    },
    "MOVED_TO_RESIDENTIAL": {
        "DECEASED", "EXITED",
    },
    "EXITED": {
        # Re-eligibility (scenario 10.1) — start a new assessment journey.
        "AWAITING_ASSESSMENT",
    },
    "DECEASED": set(),  # terminal
}


def is_transition_allowed(from_state: Optional[str], to_state: str) -> bool:
    """``from_state=None`` means the participant has no recorded state yet
    (new participant). Only INITIAL_STATES are allowed in that case."""
    if to_state not in LIFECYCLE_STATES_SET:
        return False
    if from_state is None:
        return to_state in INITIAL_STATES
    if from_state not in LIFECYCLE_STATES_SET:
        return False
    return to_state in ALLOWED_TRANSITIONS.get(from_state, set())


# ---------------------------------------------------------------------------
# Audit chain
# ---------------------------------------------------------------------------
def _canonical_json(d: Dict[str, Any]) -> str:
    return json.dumps(d, sort_keys=True, separators=(",", ":"), default=str)


def _compute_row_hash(prev_hash: Optional[str], row: Dict[str, Any]) -> str:
    payload = (prev_hash or "") + _canonical_json(row)
    return hashlib.sha256(payload.encode()).hexdigest()


async def _latest_audit_row(db, participant_id: str) -> Optional[Dict[str, Any]]:
    return await db.participant_state_audit.find_one(
        {"participant_id": participant_id},
        {"_id": 0}, sort=[("created_at", -1)],
    )


# ---------------------------------------------------------------------------
# Mutation
# ---------------------------------------------------------------------------
class TransitionRejected(Exception):
    """Raised when a transition is not in the allowed map. The attempt is
    logged before the exception propagates."""


async def apply_transition(
    db,
    *,
    participant_id: str,
    account_id: Optional[str],
    to_state: str,
    actor_id: str,
    actor_name: Optional[str] = None,
    reason: Optional[str] = None,
    source: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Apply a lifecycle transition. Validates, writes the new state on the
    participant doc, and appends a hash-chained audit row.

    ``source`` lets the caller pin the transition to its trigger — e.g.
    ``{"kind": "event", "event_id": "..."}`` or
    ``{"kind": "statement_anomaly", "statement_id": "...", "rule_key": "..."}``.

    Raises ``TransitionRejected`` if the transition isn't allowed.
    """
    p = await db.participants.find_one({"id": participant_id}, {"_id": 0})
    if p is None:
        raise TransitionRejected(f"participant {participant_id} not found")

    from_state = p.get("lifecycle_state")
    now_iso = datetime.now(timezone.utc).isoformat()

    if not is_transition_allowed(from_state, to_state):
        # Log the rejection so attempts are visible.
        await _append_audit_row(db,
            participant_id=participant_id, account_id=account_id or p.get("account_id"),
            kind="lifecycle_transition_rejected",
            from_value=from_state, to_value=to_state,
            actor_id=actor_id, actor_name=actor_name,
            reason=reason or "rejected by transition map",
            source=source, created_at=now_iso,
        )
        raise TransitionRejected(
            f"Transition {from_state!r} -> {to_state!r} is not allowed"
        )

    # Write the new state on the participant.
    await db.participants.update_one(
        {"id": participant_id},
        {"$set": {"lifecycle_state": to_state,
                  "lifecycle_state_updated_at": now_iso}},
    )
    audit_row = await _append_audit_row(db,
        participant_id=participant_id, account_id=account_id or p.get("account_id"),
        kind="lifecycle_transition",
        from_value=from_state, to_value=to_state,
        actor_id=actor_id, actor_name=actor_name,
        reason=reason, source=source, created_at=now_iso,
    )
    return {"participant_id": participant_id,
            "from_state": from_state, "to_state": to_state,
            "audit_id": audit_row["id"]}


async def _append_audit_row(db, *, participant_id, account_id, kind,
                             from_value, to_value, actor_id, actor_name,
                             reason, source, created_at) -> Dict[str, Any]:
    prev = await _latest_audit_row(db, participant_id)
    prev_hash = (prev or {}).get("hash")
    row = {
        "id": str(uuid.uuid4()),
        "participant_id": participant_id,
        "account_id": account_id,
        "kind": kind,
        "from_value": from_value,
        "to_value": to_value,
        "actor_id": actor_id,
        "actor_name": actor_name,
        "reason": reason,
        "source": source,
        "created_at": created_at,
        "prev_hash": prev_hash,
    }
    row["hash"] = _compute_row_hash(prev_hash, row)
    await db.participant_state_audit.insert_one(dict(row))
    return row


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
async def get_current_state(db, participant_id: str) -> Optional[str]:
    p = await db.participants.find_one(
        {"id": participant_id}, {"_id": 0, "lifecycle_state": 1},
    )
    return (p or {}).get("lifecycle_state")


async def get_state_audit(db, participant_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    cur = db.participant_state_audit.find(
        {"participant_id": participant_id}, {"_id": 0},
    ).sort("created_at", -1).limit(limit)
    return [d async for d in cur]


# ---------------------------------------------------------------------------
# Backfill (called from server startup)
# ---------------------------------------------------------------------------
async def backfill_initial_states(db) -> Dict[str, int]:
    """Set lifecycle_state on every participant that lacks one.
       - status=REMOVED  -> EXITED
       - otherwise       -> ACTIVE
    Writes a single 'backfill' audit row per participant so the timeline
    starts from a known origin."""
    counts = {"set_active": 0, "set_exited": 0, "skipped": 0}
    now_iso = datetime.now(timezone.utc).isoformat()
    cur = db.participants.find({"lifecycle_state": {"$exists": False}},
                                {"_id": 0, "id": 1, "status": 1, "account_id": 1})
    async for p in cur:
        target = "EXITED" if p.get("status") == "REMOVED" else "ACTIVE"
        await db.participants.update_one(
            {"id": p["id"]},
            {"$set": {"lifecycle_state": target,
                      "lifecycle_state_updated_at": now_iso}},
        )
        await _append_audit_row(db,
            participant_id=p["id"], account_id=p.get("account_id"),
            kind="lifecycle_backfill", from_value=None, to_value=target,
            actor_id="system", actor_name="backfill",
            reason="initial state inferred from participant.status",
            source={"kind": "phase_2_backfill"}, created_at=now_iso,
        )
        counts["set_active" if target == "ACTIVE" else "set_exited"] += 1
    return counts


async def ensure_indexes(db) -> None:
    """Mongo indexes for fast audit reads and uniqueness."""
    await db.participant_state_audit.create_index([("participant_id", 1), ("created_at", -1)])
    await db.participant_state_audit.create_index([("account_id", 1), ("created_at", -1)])
    await db.participant_state_audit.create_index("id", unique=True)
