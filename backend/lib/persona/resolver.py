"""PERSONA-1 Workstream D, Single resolver.

One entry point per copy tier. Every layer (frontend via HTTP, PDF, email,
Ask Wayly prompt injection) calls into this resolver so there is exactly
one source of truth for persona-aware copy.

Feature flag: ``PERSONA_V1_ENABLED``. When unset or falsy, the resolver
returns the ``caregiver`` variant regardless of the account's stored
persona. This reproduces current production behaviour exactly, per the
Rollback Plan in PERSONA-1 v1 spec.
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict

from .models import Pronouns, ViewerPersona
from .registry import TIER1_VARIANTS, tier2_tokens_for

_TOKEN_RE = re.compile(r"\{([a-z_][a-z0-9_]*)\}", flags=re.IGNORECASE)


def persona_enabled() -> bool:
    """Feature-flag check. Default off."""
    val = (os.environ.get("PERSONA_V1_ENABLED") or "").strip().lower()
    return val in ("1", "true", "yes", "on")


def _effective_persona(persona: ViewerPersona | None) -> ViewerPersona:
    if not persona_enabled():
        return ViewerPersona.caregiver
    return persona or ViewerPersona.caregiver


def resolve_tier2_template(
    template: str,
    *,
    persona: ViewerPersona | None,
    pronouns: Pronouns | None = None,
    first_name: str | None = None,
) -> str:
    """Substitute Tier-2 tokens in ``template``.

    Unknown tokens are left as-is (so upstream can still see broken keys
    during rollout). Missing/unset persona falls back to caregiver, which
    is the current production behaviour.
    """
    if not template:
        return template
    tokens = tier2_tokens_for(
        persona=_effective_persona(persona),
        pronouns=pronouns or Pronouns.unknown,
        first_name=first_name,
    )

    def _sub(m: "re.Match[str]") -> str:
        key = m.group(1)
        return tokens.get(key, m.group(0))

    return _TOKEN_RE.sub(_sub, template)


def resolve_tier1(
    key: str,
    *,
    persona: ViewerPersona | None,
    pronouns: Pronouns | None = None,
    first_name: str | None = None,
) -> str:
    """Look up a Tier-1 string ID and return the persona-correct variant.

    Raises ``KeyError`` if the ID is not registered, Tier-1 keys are
    stable and must exist. Any Tier-2 tokens embedded in the variant
    (e.g. ``{subject_possessive}``) are resolved in the same pass.
    """
    variants = TIER1_VARIANTS.get(key)
    if variants is None:
        raise KeyError(f"Unknown persona Tier-1 key: {key}")
    persona_eff = _effective_persona(persona)
    template = variants.get(persona_eff.value) or variants["caregiver"]
    return resolve_tier2_template(
        template,
        persona=persona_eff,
        pronouns=pronouns,
        first_name=first_name,
    )


def resolve_bundle(
    *,
    persona: ViewerPersona | None,
    pronouns: Pronouns | None = None,
    first_name: str | None = None,
) -> Dict[str, Any]:
    """Return a single struct with all Tier-2 tokens resolved. Handy for
    frontend prefetch, the client can then substitute in-place without
    another round-trip.
    """
    persona_eff = _effective_persona(persona)
    return {
        "persona": persona_eff.value,
        "pronouns": (pronouns or Pronouns.unknown).value,
        "care_recipient_first_name": first_name,
        "tokens": tier2_tokens_for(
            persona=persona_eff,
            pronouns=pronouns or Pronouns.unknown,
            first_name=first_name,
        ),
        "flag_enabled": persona_enabled(),
    }
