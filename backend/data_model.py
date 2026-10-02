"""
DATA-MODEL-1 v1 foundation.

Introduces the canonical entity model (User / Participant record / Household
membership) alongside the existing household-centric storage. This module is
ADDITIVE: it creates and maintains the new collections via an idempotent
backfill and provides an invariant checker. Existing reads keep working off
`households`; downstream milestones (PARTICIPANTS-1) rewire reads to
`participant_records`.

Canonical terms (DATA-MODEL-1): account_holder, participant_user, caregiver,
participant record, household membership. In code/DB never use "family_member"
as a role value (that is a user-facing synonym only).

Collections owned here:
  participant_records, household_memberships, caregiver_participant_links
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any


def _new_id() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# Wayly roles (household_memberships.role)
ROLE_ACCOUNT_HOLDER = "account_holder"
ROLE_PARTICIPANT_USER = "participant_user"
ROLE_CAREGIVER = "caregiver"
VALID_ROLES = {ROLE_ACCOUNT_HOLDER, ROLE_PARTICIPANT_USER, ROLE_CAREGIVER}

# Legacy household_members.role values that map to caregiver on migration.
LEGACY_CAREGIVER_ROLES = {"family_member", "advisor", "member"}


def build_participant_record(household: dict, user_id: str | None) -> dict:
    classification = household.get("classification")
    provider_name = household.get("provider_name")
    return {
        "id": _new_id(),
        "household_id": household["id"],
        "user_id": user_id,  # set for self-managing / participant_user; None = managed-only
        "full_name": household.get("participant_name") or "Participant",
        "date_of_birth": household.get("date_of_birth"),  # nullable; not captured in legacy data
        "classification": classification,
        "classification_status": "assessed" if classification else "unknown",
        "provider_name": provider_name,
        "provider_status": "selected" if provider_name else "not_selected",
        "care_plan_status": "not_started",
        "is_billable_extra": False,
        "stripe_subscription_item_id": None,
        "deceased_at": None,
        "archived_at": None,
        "created_at": household.get("created_at") or _now(),
        "updated_at": _now(),
    }


def build_membership(household_id: str, user_id: str, role: str, *, relationship: str = "Other",
                     invited_by: str | None = None, requires_relationship_update: bool = False,
                     legal_role_declared: bool = False, accepted_at: str | None = None) -> dict:
    ts = _now()
    return {
        "id": _new_id(),
        "household_id": household_id,
        "user_id": user_id,
        "role": role,
        "relationship": relationship,
        "relationship_note": None,
        "requires_relationship_update": requires_relationship_update,
        "invited_by": invited_by,
        "invited_at": None,
        "accepted_at": accepted_at or ts,
        "revoked_at": None,
        "last_active_at": None,
        "legal_role_declared": legal_role_declared,
        "created_at": ts,
        "updated_at": ts,
    }


def build_caregiver_link(caregiver_membership_id: str, participant_record_id: str) -> dict:
    return {
        "id": _new_id(),
        "caregiver_membership_id": caregiver_membership_id,
        "participant_record_id": participant_record_id,
        "created_at": _now(),
    }


async def ensure_indexes(db) -> None:
    await db.participant_records.create_index("household_id")
    await db.participant_records.create_index("user_id")
    await db.household_memberships.create_index("household_id")
    await db.household_memberships.create_index([("household_id", 1), ("user_id", 1)])
    await db.caregiver_participant_links.create_index("caregiver_membership_id")
    await db.caregiver_participant_links.create_index("participant_record_id")


async def backfill_data_model(db) -> dict:
    """Idempotent migration of existing households into the new model.

    - Every household gets exactly one account_holder membership (owner).
    - Every household gets at least one participant_record (owner assumed
      self-managing => user_id = owner).
    - Legacy household_members rows become caregiver memberships
      (relationship 'Other', requires_relationship_update=True) + caregiver links.
    - households gets account_holder_user_id + bereavement_grace_expires_at.
    Safe to run repeatedly.
    """
    stats = {"households": 0, "participant_records_created": 0, "memberships_created": 0,
             "caregivers_migrated": 0, "links_created": 0}
    await ensure_indexes(db)
    async for h in db.households.find({}, {"_id": 0}):
        stats["households"] += 1
        hid = h["id"]
        owner_id = h.get("owner_id")
        if not owner_id:
            continue

        # households denormalised fields
        set_fields = {}
        if not h.get("account_holder_user_id"):
            set_fields["account_holder_user_id"] = owner_id
        if "bereavement_grace_expires_at" not in h:
            set_fields["bereavement_grace_expires_at"] = None
        if set_fields:
            await db.households.update_one({"id": hid}, {"$set": set_fields})

        # participant record (self-managing owner)
        pr = await db.participant_records.find_one({"household_id": hid, "archived_at": None, "deceased_at": None})
        if not pr:
            pr = build_participant_record(h, owner_id)
            await db.participant_records.insert_one(pr)
            stats["participant_records_created"] += 1
        owner_pr_id = pr["id"]

        # account_holder membership
        ah = await db.household_memberships.find_one({"household_id": hid, "user_id": owner_id, "revoked_at": None})
        if not ah:
            await db.household_memberships.insert_one(
                build_membership(hid, owner_id, ROLE_ACCOUNT_HOLDER, relationship="Self",
                                 accepted_at=h.get("created_at"))
            )
            stats["memberships_created"] += 1

        # legacy invited members -> caregiver memberships + links
        async for m in db.household_members.find({"household_id": hid}, {"_id": 0}):
            m_uid = m.get("user_id")
            if not m_uid or m_uid == owner_id:
                continue
            if (m.get("status") or "active") != "active":
                continue
            existing = await db.household_memberships.find_one({"household_id": hid, "user_id": m_uid, "revoked_at": None})
            if existing:
                cg_mem_id = existing["id"]
            else:
                mem = build_membership(hid, m_uid, ROLE_CAREGIVER, relationship="Other",
                                       invited_by=owner_id, requires_relationship_update=True,
                                       accepted_at=m.get("joined_at"))
                await db.household_memberships.insert_one(mem)
                cg_mem_id = mem["id"]
                stats["caregivers_migrated"] += 1
            # link caregiver to the (single) participant record
            link = await db.caregiver_participant_links.find_one(
                {"caregiver_membership_id": cg_mem_id, "participant_record_id": owner_pr_id})
            if not link:
                await db.caregiver_participant_links.insert_one(build_caregiver_link(cg_mem_id, owner_pr_id))
                stats["links_created"] += 1
    return stats


async def verify_invariants(db) -> dict:
    """Checks the DATA-MODEL-1 CI invariants that are enforceable in this store.
    Returns {ok: bool, violations: [...], checked: int}."""
    violations: list[dict[str, Any]] = []
    async for h in db.households.find({}, {"_id": 0, "id": 1, "plan": 1}):
        hid = h["id"]
        plan = h.get("plan") or "family"
        # inv1: exactly one account_holder
        ah = await db.household_memberships.count_documents({"household_id": hid, "role": ROLE_ACCOUNT_HOLDER, "revoked_at": None})
        if ah != 1:
            violations.append({"household_id": hid, "invariant": 1, "detail": f"account_holder count={ah}"})
        # inv2: >=1 live participant_record
        live_pr = await db.participant_records.count_documents({"household_id": hid, "deceased_at": None, "archived_at": None})
        if live_pr < 1:
            violations.append({"household_id": hid, "invariant": 2, "detail": "no live participant_record"})
        # inv6: no caregiver has a participant record with same user_id
        async for cg in db.household_memberships.find({"household_id": hid, "role": ROLE_CAREGIVER, "revoked_at": None}, {"_id": 0, "user_id": 1}):
            clash = await db.participant_records.count_documents({"household_id": hid, "user_id": cg.get("user_id")})
            if clash:
                violations.append({"household_id": hid, "invariant": 6, "detail": f"caregiver {cg.get('user_id')} has participant_record"})
        # inv9/10/11: plan caps
        if plan == "solo":
            if await db.participant_records.count_documents({"household_id": hid, "deceased_at": None, "archived_at": None}) > 1:
                violations.append({"household_id": hid, "invariant": 9, "detail": "solo >1 participant"})
            if await db.household_memberships.count_documents({"household_id": hid, "role": ROLE_CAREGIVER, "revoked_at": None}) > 1:
                violations.append({"household_id": hid, "invariant": 10, "detail": "solo >1 caregiver"})
        elif plan == "family":
            if await db.household_memberships.count_documents({"household_id": hid, "role": ROLE_CAREGIVER, "revoked_at": None}) > 3:
                violations.append({"household_id": hid, "invariant": 11, "detail": "family >3 caregivers"})
    return {"ok": len(violations) == 0, "violations": violations}
