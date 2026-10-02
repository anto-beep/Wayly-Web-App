"""PERSONA-1 HTTP layer.

Endpoints:
- GET  /api/persona                 → the caller's persona profile + resolver bundle
- PUT  /api/persona                 → patch persona and care-recipient
- POST /api/persona/resolve         → server-side resolver (Tier 1 + Tier 2)

Feature-flag rule: when ``PERSONA_V1_ENABLED`` is off, GET / resolve still
work but always return ``caregiver`` semantics so the frontend can call
freely without breaking. PUT still writes to the account so the owner can
prepare data ahead of flag flip.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from lib.persona.models import CareRecipient, PersonaProfile, PersonaUpdate, Pronouns, ViewerPersona
from lib.persona.registry import TIER1_VARIANTS
from lib.persona.resolver import persona_enabled, resolve_bundle, resolve_tier1, resolve_tier2_template

logger = logging.getLogger("wayly.persona.routes")

persona_router = APIRouter(tags=["persona"])

_db = None
_user_dep = None


def init_persona_routes(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


async def _current_user(request: Request) -> dict:
    if _user_dep is None:
        raise HTTPException(status_code=500, detail="persona not initialised")
    return await _user_dep(request)


def _profile_from_user(user_doc: dict) -> PersonaProfile:
    """Read a persona profile off a user doc, tolerating legacy shape.

    Resolution order for the viewer persona:
      1. Explicit ``viewer_persona`` field (persona settings page)
      2. Signup ``role`` (``caregiver`` / ``participant``), OJ-1 v1.1 auto-lock
      3. Default caregiver
    """
    explicit = user_doc.get("viewer_persona")
    if not explicit:
        role = (user_doc.get("role") or "").lower().strip()
        if role in ("caregiver", "participant"):
            explicit = role
    payload: Dict[str, Any] = {
        "viewer_persona": explicit or ViewerPersona.caregiver.value,
        "is_authorised_representative": bool(user_doc.get("is_authorised_representative") or False),
        "care_recipient": user_doc.get("care_recipient") or {},
    }
    return PersonaProfile(**payload)


@persona_router.get("/persona")
async def get_persona(request: Request):
    user = await _current_user(request)
    doc = await _db.users.find_one({"id": user["id"]}) or user
    profile = _profile_from_user(doc)
    bundle = resolve_bundle(
        persona=profile.viewer_persona,
        pronouns=profile.care_recipient.pronouns,
        first_name=profile.care_recipient.first_name,
    )
    return {
        "profile": profile.model_dump(mode="json"),
        "resolver": bundle,
    }


@persona_router.put("/persona")
async def put_persona(payload: PersonaUpdate, request: Request):
    user = await _current_user(request)
    doc = await _db.users.find_one({"id": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")

    current = _profile_from_user(doc)
    # Merge patch semantics.
    new_persona = payload.viewer_persona or current.viewer_persona
    new_rep = (
        payload.is_authorised_representative
        if payload.is_authorised_representative is not None
        else current.is_authorised_representative
    )
    # ``is_authorised_representative`` is meaningful only for caregiver
    # (PERSONA-1 §2). Force to False on participant.
    if new_persona == ViewerPersona.participant:
        new_rep = False

    if payload.care_recipient is not None:
        care = payload.care_recipient
    else:
        care = current.care_recipient

    # Participant → mirror the account holder onto the care recipient.
    if new_persona == ViewerPersona.participant:
        # Prefer the explicit first/last stored on the user doc; fall back
        # to splitting the legacy ``name`` field so older accounts still
        # round-trip cleanly. Both halves must survive the PUT so the
        # Signup → Onboarding carryover can pre-fill the participant name.
        name_parts = (doc.get("name") or "").split(" ", 1)
        first_name = doc.get("first_name") or (name_parts[0] if name_parts and name_parts[0] else None)
        last_name = doc.get("last_name") or (name_parts[1] if len(name_parts) > 1 and name_parts[1] else None)
        care = CareRecipient(
            is_self=True,
            first_name=first_name,
            last_name=last_name,
            pronouns=care.pronouns,
            relationship_to_account=None,
        )

    new_profile = PersonaProfile(
        viewer_persona=new_persona,
        is_authorised_representative=new_rep,
        care_recipient=care,
    )
    await _db.users.update_one(
        {"id": user["id"]},
        {"$set": {
            "viewer_persona": new_profile.viewer_persona.value,
            "is_authorised_representative": new_profile.is_authorised_representative,
            "care_recipient": new_profile.care_recipient.model_dump(mode="json"),
        }},
    )
    return {"profile": new_profile.model_dump(mode="json")}


class ResolveRequest(BaseModel):
    tier1_keys: Optional[List[str]] = Field(default=None, description="Tier-1 IDs to resolve")
    tier2_templates: Optional[Dict[str, str]] = Field(
        default=None, description="Ad-hoc Tier-2 templates keyed by any client label"
    )
    # Admin-only preview override, lets a super admin eyeball copy from
    # either persona without editing their own account. Silently ignored
    # for non-admin users.
    override_persona: Optional[ViewerPersona] = None
    override_pronouns: Optional[Pronouns] = None
    override_first_name: Optional[str] = None


@persona_router.post("/persona/resolve")
async def post_resolve(payload: ResolveRequest, request: Request):
    user = await _current_user(request)
    doc = await _db.users.find_one({"id": user["id"]}) or user
    profile = _profile_from_user(doc)

    # Admin-only preview override (persona, pronouns, first name).
    persona_used = profile.viewer_persona
    pronouns_used = profile.care_recipient.pronouns
    first_name_used = profile.care_recipient.first_name
    if doc.get("admin_role"):
        if payload.override_persona is not None:
            persona_used = payload.override_persona
        if payload.override_pronouns is not None:
            pronouns_used = payload.override_pronouns
        if payload.override_first_name is not None:
            first_name_used = payload.override_first_name or None

    tier1_out: Dict[str, str] = {}
    tier1_missing: List[str] = []
    for key in payload.tier1_keys or []:
        try:
            tier1_out[key] = resolve_tier1(
                key,
                persona=persona_used,
                pronouns=pronouns_used,
                first_name=first_name_used,
            )
        except KeyError:
            tier1_missing.append(key)

    tier2_out: Dict[str, str] = {}
    for label, template in (payload.tier2_templates or {}).items():
        tier2_out[label] = resolve_tier2_template(
            template,
            persona=persona_used,
            pronouns=pronouns_used,
            first_name=first_name_used,
        )

    return {
        "tier1": tier1_out,
        "tier1_missing": tier1_missing,
        "tier2": tier2_out,
        "flag_enabled": persona_enabled(),
        "preview_active": bool(doc.get("admin_role") and (
            payload.override_persona is not None
            or payload.override_pronouns is not None
            or payload.override_first_name is not None
        )),
    }


@persona_router.get("/persona/tier1-keys")
async def list_tier1_keys():
    """Diagnostic, the current registered Tier-1 key set. Used by the
    lint rule in Workstream E and by developer tools.
    """
    return {"keys": sorted(TIER1_VARIANTS.keys())}
