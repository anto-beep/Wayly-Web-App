"""Participant-identity guard (anti account-sharing).

Compares the participant/client name read off an uploaded document
(statement or invoice) against the participant the user is currently
viewing and everyone else on their household. Returns a *non-blocking*
advisory warning when the document appears to belong to a different
participant, to no-one on the account, or has no readable name.

This is intentionally advisory (never a hard block): name variations,
nicknames and OCR noise mean we must not lock a user out of their own
document. The warning is surfaced in the tool result so the user can
switch participant, re-upload the right file, or dismiss it.
"""
from __future__ import annotations

import re
from typing import List, Optional, Dict, Any

# Single-token relationship placeholders users often use instead of a real
# name ("Mum", "Dad"). When the ACTIVE participant is stored as one of these
# we cannot confirm identity from the document name, so we suppress the
# "doesn't match anyone" warning to avoid false positives. The
# "other participant" warning still fires because it matches a real name.
_PLACEHOLDERS = {
    "mum", "mom", "mother", "dad", "father", "nan", "nana", "pop", "poppy",
    "gran", "grandma", "grandad", "grandpa", "granny", "mummy", "daddy",
    "parent", "participant", "client", "self", "me", "him", "her",
    "husband", "wife", "partner", "aunt", "uncle", "nanna",
}

_TITLES = {"mr", "mrs", "ms", "miss", "dr", "prof", "sir", "madam", "mx"}


def _tokens(name: Optional[str]) -> List[str]:
    if not name:
        return []
    # Keep only alpha, split on non-alpha, drop titles + very short tokens.
    raw = re.split(r"[^a-zA-Z]+", str(name).lower())
    out = [t for t in raw if len(t) >= 2 and t not in _TITLES]
    return out


def _is_match(a: List[str], b: List[str]) -> bool:
    """Lenient person-name match.

    - Single-token names (first-name-only / nickname): match when that
      token appears in the other name.
    - Multi-token names: require the surname (last token) to match plus at
      least one more shared token OR a shared first-initial; or two shared
      tokens in any position.
    """
    if not a or not b:
        return False
    sa, sb = set(a), set(b)
    common = sa & sb
    if not common:
        return False
    if len(a) == 1 or len(b) == 1:
        return True
    surname_match = a[-1] == b[-1]
    if surname_match and len(common) >= 2:
        return True
    if surname_match and (a[0][0] == b[0][0]):
        return True
    return len(common) >= 2


def _is_placeholder(name: Optional[str]) -> bool:
    toks = _tokens(name)
    return len(toks) == 1 and toks[0] in _PLACEHOLDERS


def check_document_identity(
    extracted_name: Optional[str],
    active_participant: Optional[Dict[str, Any]],
    other_participants: Optional[List[Dict[str, Any]]] = None,
    *,
    tool_label: str = "document",
) -> Optional[Dict[str, Any]]:
    """Return an advisory identity warning, or None when all is well.

    ``active_participant`` / ``other_participants`` items are dicts with at
    least ``name`` (display name) and ``id``. ``extracted_name`` is the name
    read off the uploaded document.
    """
    others = other_participants or []
    active_name = (active_participant or {}).get("name") or (active_participant or {}).get("first_name")
    active_toks = _tokens(active_name)
    ext_toks = _tokens(extracted_name)

    # 1) No readable name on the document.
    if not ext_toks:
        return {
            "status": "no_name",
            "title": "We couldn't find a name on this " + tool_label,
            "message": (
                "This " + tool_label + " doesn't show a participant name we could read, so we "
                "can't confirm it belongs to " + (active_name or "this participant") + ". "
                "Please upload a " + tool_label + " that clearly shows the participant's name."
            ),
            "extracted_name": None,
            "active_participant_name": active_name,
        }

    ext_display = " ".join(w.capitalize() for w in ext_toks)

    # 2) Matches the participant currently being viewed → all good.
    if _is_match(ext_toks, active_toks):
        return None

    # 3) Matches a DIFFERENT participant on the account → wrong view / switch.
    for o in others:
        if o.get("id") and (active_participant or {}).get("id") == o.get("id"):
            continue
        o_name = o.get("name") or o.get("first_name")
        if _is_match(ext_toks, _tokens(o_name)):
            return {
                "status": "other_participant",
                "title": "This looks like " + (o_name or "another participant") + "'s " + tool_label,
                "message": (
                    "The name on this " + tool_label + " (" + ext_display + ") matches "
                    + (o_name or "another participant") + ", but you're currently viewing "
                    + (active_name or "someone else") + ". Switch to " + (o_name or "that participant")
                    + " before running this, or upload " + (active_name or "this participant") + "'s " + tool_label + "."
                ),
                "extracted_name": ext_display,
                "active_participant_name": active_name,
                "matched_participant_id": o.get("id"),
                "matched_participant_name": o_name,
            }

    # 4) Matches no-one on the account.
    #    Suppress when the active participant is only a nickname (can't confirm)
    #    and there is no OTHER real-named participant to compare against.
    other_real = [
        o for o in others
        if o.get("id") != (active_participant or {}).get("id")
        and not _is_placeholder(o.get("name") or o.get("first_name"))
    ]
    if _is_placeholder(active_name) and not other_real:
        return None
    return {
        "status": "no_match",
        "title": "This " + tool_label + " may not be for this participant",
        "message": (
            "The name on this " + tool_label + " (" + ext_display + ") doesn't match "
            + (active_name or "this participant") + " or anyone else on your account. Each Wayly "
            "account is for your own household — please upload a " + tool_label + " for a participant "
            "on this account, or add them as a participant first."
        ),
        "extracted_name": ext_display,
        "active_participant_name": active_name,
    }
