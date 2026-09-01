"""PERSONA-1, Persona context helper for LLM prompt injection.

One helper to pull the persona profile off a user document and render a
compact "PERSONA CONTEXT" block that can be injected into any LLM system
prompt. Used by Ask Wayly, help chat, LF-1 letter generation, and the
reports executive summary.

Keeps the "how to speak in-persona" rules in ONE place so voice is
consistent across every LLM surface. When PERSONA_V1_ENABLED is off the
block still renders (using caregiver defaults) so nothing regresses on
rollback.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from .models import Pronouns, ViewerPersona
from .resolver import persona_enabled


PERSONA_VOICE_RULES = """PERSONA VOICE RULES
- If viewer_persona is 'participant': address the reader in second person
  ('you', 'your'). The care recipient IS the reader, never refer to a third
  party. Do not use 'your parent', 'your loved one', 'they', or the care
  recipient's name to describe the reader.
- If viewer_persona is 'caregiver': address the reader in second person BUT
  refer to the care recipient in third person, using their first name when
  known ('{first_name} has been charged...') and pronouns per the
  care_recipient.pronouns field. If pronouns are 'unknown', use 'the care
  recipient' + singular verbs ('the care recipient has been charged'), not
  'they have'.
- If is_authorised_representative is true, sign 'on behalf of {first_name}'
  in letters and formal correspondence. Otherwise use the caregiver's own
  name.
- Never invent a relationship to the care recipient beyond what is provided
  in relationship_to_account. Do not assume 'mother' or 'parent'."""


def _persona_from_user_doc(user_doc: Dict[str, Any]) -> Dict[str, Any]:
    """Read a persona snapshot off a user document, tolerating legacy shape."""
    persona_raw = user_doc.get("viewer_persona") or ViewerPersona.caregiver.value
    care = user_doc.get("care_recipient") or {}
    return {
        "viewer_persona": persona_raw,
        "is_authorised_representative": bool(user_doc.get("is_authorised_representative") or False),
        "first_name": care.get("first_name") or None,
        "pronouns": care.get("pronouns") or Pronouns.unknown.value,
        "relationship_to_account": care.get("relationship_to_account") or None,
        "is_self": bool(care.get("is_self") or False),
    }


async def load_persona_context(db, user_id: str) -> Dict[str, Any]:
    """Fetch the user's persona snapshot from Mongo. Returns caregiver
    defaults when the document is missing or the feature flag is off.
    """
    if not persona_enabled():
        return {
            "viewer_persona": ViewerPersona.caregiver.value,
            "is_authorised_representative": False,
            "first_name": None,
            "pronouns": Pronouns.unknown.value,
            "relationship_to_account": None,
            "is_self": False,
            "flag_enabled": False,
        }
    try:
        doc = await db.users.find_one({"id": user_id}) or {}
    except Exception:
        doc = {}
    snap = _persona_from_user_doc(doc)
    snap["flag_enabled"] = True
    return snap


def render_persona_prompt_block(profile: Optional[Dict[str, Any]]) -> str:
    """Return a compact 'PERSONA CONTEXT' block for LLM prompt injection.

    Callers append this to their existing system message. Empty when the
    flag is off, so downstream prompts stay identical to pre-PERSONA-1
    behaviour under rollback.
    """
    if not profile or not profile.get("flag_enabled"):
        return ""
    lines = [
        "PERSONA CONTEXT (verbatim, do not paraphrase):",
        f"- viewer_persona: {profile.get('viewer_persona') or 'caregiver'}",
        f"- is_authorised_representative: {profile.get('is_authorised_representative') and 'true' or 'false'}",
        f"- care_recipient.first_name: {profile.get('first_name') or 'unknown'}",
        f"- care_recipient.pronouns: {profile.get('pronouns') or 'unknown'}",
        f"- care_recipient.relationship_to_account: {profile.get('relationship_to_account') or 'unknown'}",
        f"- care_recipient.is_self: {profile.get('is_self') and 'true' or 'false'}",
        "",
        PERSONA_VOICE_RULES,
    ]
    return "\n".join(lines)
