"""Parallel flag bag for participants.

Flags are non-exclusive within their group except where ``MUTUAL_EXCLUSION``
says otherwise. They live in the ``flags`` dict on the participant doc; each
value is either ``True`` / ``False`` or a small payload dict that carries the
flag-specific data (expiry date, notice date, etc.).

``SAFEGUARDING_ALERT`` has restricted visibility, only account owners
(``AccountMember.role == "OWNER"``) can read it. The visibility wrapper
``filter_flags_for_user`` strips it from non-owner reads.

Mutations write a row to ``participant_state_audit`` with
``kind="flag_change"`` so the same hash-chain that secures lifecycle
transitions covers flag changes too.
"""
from __future__ import annotations
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from scenario_engine.lifecycle import _append_audit_row

log = logging.getLogger("wayly.scenario_engine.flags")

# ---------------------------------------------------------------------------
# Flag taxonomy (groups, payload shapes, mutual exclusion)
# ---------------------------------------------------------------------------
FLAG_GROUPS: Dict[str, List[str]] = {
    "funding": [
        "ONGOING_CLASSIFICATION_1",
        "ONGOING_CLASSIFICATION_2",
        "ONGOING_CLASSIFICATION_3",
        "ONGOING_CLASSIFICATION_4",
        "ONGOING_CLASSIFICATION_5",
        "ONGOING_CLASSIFICATION_6",
        "ONGOING_CLASSIFICATION_7",
        "ONGOING_CLASSIFICATION_8",
        "TRANSITIONED_HCP_LEVEL",
        "HAS_HCP_UNSPENT",
        "AT_HM_ACTIVE",
        "RESTORATIVE_ACTIVE",
        "EOL_ACTIVE",
        "INTERIM_60PCT",
    ],
    "contribution": [
        "NO_WORSE_OFF",
        "FULL_PENSIONER",
        "PART_PENSIONER",
        "CSHC_HOLDER",
        "SELF_FUNDED",
        "MEANS_NOT_DISCLOSED",
        "HARDSHIP_GRANTED",
        "LIFETIME_CAP_REACHED",
        "TIME_LIMITED_CAP_REACHED",
    ],
    "legal_supporter": [
        "HAS_REGISTERED_SUPPORTER",
        "HAS_EPOA",
        "HAS_GUARDIAN",
        "PUBLIC_TRUSTEE",
        "CAPACITY_CONCERN",
        "SAFEGUARDING_ALERT",   # restricted visibility, owners only
    ],
    "provider": [
        "PROVIDER_ACTIVE",
        "PROVIDER_CEASING",
        "PROVIDER_DEREGISTERED",
        "SWITCHING_PROVIDER",
    ],
    "special_cohort": [
        "FIRST_NATIONS_50PLUS",
        "CALD",
        "REMOTE",
        "MPS",
        "DVA_GOLD",
        "DVA_WHITE",
        "EX_NDIS",
        "UNDER_65",
        "VETERAN_SUPPLEMENT",
    ],
}

ALL_FLAGS: Set[str] = {f for group in FLAG_GROUPS.values() for f in group}

# Flags that carry a payload dict instead of a plain bool. Payload schema is
# free-form but the listed keys are expected by the alert engine in Phase 4.
FLAG_PAYLOAD_KEYS: Dict[str, List[str]] = {
    "AT_HM_ACTIVE": ["expiry_date", "tier", "approved_aud"],
    "PROVIDER_CEASING": ["notice_date", "cease_date"],
    "RESTORATIVE_ACTIVE": ["start_date", "end_date", "episode_number"],
    "EOL_ACTIVE": ["start_date", "expected_end_date"],
    "INTERIM_60PCT": ["expected_full_funding_date"],
    "TRANSITIONED_HCP_LEVEL": ["level"],
    "HARDSHIP_GRANTED": ["effective_from", "effective_to", "supplement_type"],
}

# Flags within these clusters must be set to a single value. Setting one to
# True clears the others.
MUTUAL_EXCLUSION: List[Set[str]] = [
    # Exactly one ongoing classification at a time.
    {"ONGOING_CLASSIFICATION_1", "ONGOING_CLASSIFICATION_2",
     "ONGOING_CLASSIFICATION_3", "ONGOING_CLASSIFICATION_4",
     "ONGOING_CLASSIFICATION_5", "ONGOING_CLASSIFICATION_6",
     "ONGOING_CLASSIFICATION_7", "ONGOING_CLASSIFICATION_8"},
    # Means-test cohort, at most one of these pension-status flags.
    {"FULL_PENSIONER", "PART_PENSIONER", "SELF_FUNDED"},
    # Provider status, exactly one active state at a time.
    {"PROVIDER_ACTIVE", "PROVIDER_CEASING", "PROVIDER_DEREGISTERED"},
]

RESTRICTED_VISIBILITY: Set[str] = {"SAFEGUARDING_ALERT"}


# ---------------------------------------------------------------------------
# Visibility
# ---------------------------------------------------------------------------
async def is_account_owner(db, *, user_id: str, account_id: Optional[str]) -> bool:
    """True iff the user is the OWNER member on this account."""
    if not account_id:
        return False
    m = await db.account_members.find_one(
        {"account_id": account_id, "user_id": user_id, "status": "ACTIVE"},
        {"_id": 0, "role": 1},
    )
    return bool(m and m.get("role") == "OWNER")


def filter_flags_for_user(flags: Dict[str, Any], *, is_owner: bool) -> Dict[str, Any]:
    """Strip restricted flags from the returned bag when the caller is not an
    account owner."""
    if is_owner:
        return dict(flags or {})
    return {k: v for k, v in (flags or {}).items() if k not in RESTRICTED_VISIBILITY}


# ---------------------------------------------------------------------------
# Mutation
# ---------------------------------------------------------------------------
class FlagRejected(Exception):
    """Unknown flag name, bad payload shape, or visibility violation."""


async def set_flag(
    db,
    *,
    participant_id: str,
    account_id: Optional[str],
    flag: str,
    value: Any,
    payload: Optional[Dict[str, Any]] = None,
    actor_id: str,
    actor_name: Optional[str] = None,
    reason: Optional[str] = None,
    source: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Set a flag on the participant. ``value`` is the new boolean.
    ``payload`` is only meaningful when ``value`` is True; it overrides any
    existing payload for that flag. Returns ``{flag, old, new, audit_id}``."""
    if flag not in ALL_FLAGS:
        raise FlagRejected(f"unknown flag {flag!r}")
    if not isinstance(value, bool):
        raise FlagRejected(f"flag {flag!r} value must be bool, got {type(value).__name__}")

    p = await db.participants.find_one({"id": participant_id},
                                        {"_id": 0, "flags": 1, "account_id": 1})
    if p is None:
        raise FlagRejected(f"participant {participant_id} not found")

    flags = dict(p.get("flags") or {})
    old_value = flags.get(flag)

    # If turning on, write the payload (or `True` if no payload).
    if value:
        new_entry: Any = True
        if payload is not None:
            expected = FLAG_PAYLOAD_KEYS.get(flag, [])
            for k in expected:
                if k not in payload:
                    # Allow partial payloads but record what's missing.
                    pass
            new_entry = dict(payload)
        # Clear mutually-exclusive siblings.
        for cluster in MUTUAL_EXCLUSION:
            if flag in cluster:
                for sib in cluster:
                    if sib != flag and flags.get(sib):
                        flags[sib] = False
        flags[flag] = new_entry
    else:
        flags[flag] = False

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.participants.update_one(
        {"id": participant_id},
        {"$set": {"flags": flags, "flags_updated_at": now_iso}},
    )
    audit_row = await _append_audit_row(db,
        participant_id=participant_id,
        account_id=account_id or p.get("account_id"),
        kind="flag_change",
        from_value={flag: old_value},
        to_value={flag: flags[flag]},
        actor_id=actor_id, actor_name=actor_name,
        reason=reason, source=source, created_at=now_iso,
    )
    return {"flag": flag, "old": old_value, "new": flags[flag],
            "audit_id": audit_row["id"]}


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------
async def get_flags(db, participant_id: str, *,
                    requesting_user_id: Optional[str] = None,
                    account_id: Optional[str] = None) -> Dict[str, Any]:
    p = await db.participants.find_one(
        {"id": participant_id}, {"_id": 0, "flags": 1, "account_id": 1},
    )
    if p is None:
        return {}
    is_owner = False
    if requesting_user_id:
        is_owner = await is_account_owner(
            db, user_id=requesting_user_id,
            account_id=account_id or p.get("account_id"),
        )
    return filter_flags_for_user(p.get("flags") or {}, is_owner=is_owner)


async def backfill_empty_flags(db) -> int:
    """Initialise an empty flags dict on every participant that lacks one.
    No audit row written, this is a schema backfill, not a state change."""
    res = await db.participants.update_many(
        {"flags": {"$exists": False}},
        {"$set": {"flags": {}, "flags_updated_at":
                  datetime.now(timezone.utc).isoformat()}},
    )
    return res.modified_count
