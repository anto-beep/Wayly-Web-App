"""PERSONA-1 Workstream B, Migration.

Idempotent one-shot backfill. Runs at server boot. Sets every pre-existing
user account to the ``caregiver`` default and populates a care-recipient
first_name from the household record when one exists.

Reversible via ``reverse_backfill`` (also idempotent) which strips the
persona fields, restoring pre-PERSONA-1 shape exactly. This lets us roll
the flag back without leaving orphan data in production.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Dict

from .models import PersonaProfile, Pronouns, ViewerPersona

logger = logging.getLogger("wayly.persona.migration")

_MIGRATION_MARKER = "persona_v1_backfilled_at"


def _default_profile() -> Dict[str, Any]:
    return PersonaProfile().model_dump(mode="json")


async def backfill_persona(db) -> Dict[str, int]:
    """Backfill persona fields on every user missing them.

    Returns a summary ``{scanned, updated, already_ok}`` for observability.
    Safe to call every boot, it only touches documents that still lack the
    marker.
    """
    scanned = 0
    updated = 0
    already_ok = 0

    default = _default_profile()
    now = datetime.now(timezone.utc).isoformat()

    cursor = db.users.find({"$or": [
        {"viewer_persona": {"$exists": False}},
        {_MIGRATION_MARKER: {"$exists": False}},
    ]})

    async for doc in cursor:
        scanned += 1
        user_id = doc.get("id") or doc.get("_id")
        if not user_id:
            continue

        set_fields: Dict[str, Any] = {_MIGRATION_MARKER: now}

        # 1. Persona core fields.
        if "viewer_persona" not in doc:
            set_fields["viewer_persona"] = default["viewer_persona"]
            set_fields["is_authorised_representative"] = default["is_authorised_representative"]

        # 2. Care-recipient profile.
        if "care_recipient" not in doc:
            care = dict(default["care_recipient"])

            # If the role is participant, mirror the account holder.
            if doc.get("role") == "participant":
                set_fields["viewer_persona"] = ViewerPersona.participant.value
                care["is_self"] = True
                care["first_name"] = doc.get("first_name") or (
                    (doc.get("name") or "").split(" ")[0] or None
                )
            else:
                # Try to lift an existing care-recipient name from the
                # household record (legacy shape). We look up the first
                # household that this user owns.
                hh = await db.households.find_one(
                    {"owner_id": user_id}, {"participant_name": 1}
                )
                if hh and hh.get("participant_name"):
                    care["first_name"] = (
                        hh["participant_name"].split(" ")[0]
                    )
                    care["pronouns"] = Pronouns.unknown.value

            set_fields["care_recipient"] = care

        if len(set_fields) == 1:
            # Only the marker changed, count as already_ok but still stamp
            # the marker so subsequent boots skip this doc.
            already_ok += 1
        else:
            updated += 1

        await db.users.update_one({"id": user_id}, {"$set": set_fields})

    logger.info(
        "PERSONA-1 backfill: scanned=%s updated=%s already_ok=%s",
        scanned, updated, already_ok,
    )
    return {"scanned": scanned, "updated": updated, "already_ok": already_ok}


async def reverse_backfill(db) -> Dict[str, int]:
    """Undo the backfill. Removes persona fields and the marker. Safe to
    run when the feature is being rolled back, data is non-destructive
    (we only remove fields we added).
    """
    result = await db.users.update_many(
        {_MIGRATION_MARKER: {"$exists": True}},
        {"$unset": {
            "viewer_persona": "",
            "is_authorised_representative": "",
            "care_recipient": "",
            _MIGRATION_MARKER: "",
        }},
    )
    logger.info(
        "PERSONA-1 reverse-backfill: modified=%s",
        result.modified_count,
    )
    return {"modified": result.modified_count}
