"""Wayly PERSONA-1, Workstream B & D.

Sub-modules:
- ``models``, Pydantic models for the persona and care-recipient profile.
- ``registry``, Tier 2 tokens + Tier 1 variant store (single source of truth).
- ``resolver``, Renders a template (Tier 2) or looks up a Tier 1 key against
  the active persona + pronouns.
- ``migration``, Idempotent backfill for pre-existing accounts.
- ``routes``, HTTP endpoints (`/api/persona`, `/api/persona/resolve`).

Rollout is feature-flagged behind ``PERSONA_V1_ENABLED``. When the flag is
off, the resolver always returns the ``caregiver`` variant regardless of the
account's stored persona. This makes the migration non-breaking and mirrors
current production behaviour exactly.
"""
from __future__ import annotations

from .models import CareRecipient, PersonaProfile, Pronouns, ViewerPersona  # noqa: F401
from .registry import TIER1_VARIANTS, TIER2_TOKENS, tier2_tokens_for  # noqa: F401
from .resolver import resolve_tier1, resolve_tier2_template, persona_enabled  # noqa: F401
from .migration import backfill_persona  # noqa: F401
from .context import load_persona_context, render_persona_prompt_block  # noqa: F401
