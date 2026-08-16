"""Pydantic models for PERSONA-1 Workstream B."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ViewerPersona(str, Enum):
    """Locked persona set (PERSONA-1 §1).

    The vocabulary matches the existing signup toggle, so there is no new
    concept for users to learn; the choice already exists, it just now
    matters downstream.
    """

    participant = "participant"
    caregiver = "caregiver"


class Pronouns(str, Enum):
    """PERSONA-1 §6, care-recipient pronouns.

    ``unknown`` is the default so we never guess. When unknown, third-person
    copy falls back to "the care recipient" and "they".
    """

    she_her = "she_her"
    he_him = "he_him"
    they_them = "they_them"
    unknown = "unknown"


class CareRecipient(BaseModel):
    """Care-recipient profile embedded on the account."""

    model_config = ConfigDict(extra="ignore")

    is_self: bool = False
    first_name: Optional[str] = Field(default=None, max_length=80)
    # PERSONA-1 · signup last-name capture (Feb 2026 signup enhancement).
    # Optional; frontend prefills onboarding StepEssentials.last_name from
    # this when the caregiver entered it at signup.
    last_name: Optional[str] = Field(default=None, max_length=80)
    pronouns: Pronouns = Pronouns.unknown
    relationship_to_account: Optional[str] = Field(default=None, max_length=80)


class PersonaProfile(BaseModel):
    """Full persona state for a single account.

    Backfill semantics (PERSONA-1 §B):
    - Existing accounts default to ``caregiver`` with ``is_authorised_representative = False``.
    - When a legacy account already has a care-recipient name in another
      field (e.g. Household.participant_name), migration lifts it into
      ``care_recipient.first_name`` and leaves pronouns as ``unknown``.
    """

    model_config = ConfigDict(extra="ignore")

    viewer_persona: ViewerPersona = ViewerPersona.caregiver
    is_authorised_representative: bool = False
    care_recipient: CareRecipient = Field(default_factory=CareRecipient)


class PersonaUpdate(BaseModel):
    """PUT body for /api/persona.

    All fields optional so the client can patch subsets.
    """

    viewer_persona: Optional[ViewerPersona] = None
    is_authorised_representative: Optional[bool] = None
    care_recipient: Optional[CareRecipient] = None
