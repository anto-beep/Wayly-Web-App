"""PERSONA-1 Workstream D, Copy-token registry.

Tier 2 tokens conjugate short strings (labels, buttons, headings). Tier 1
strings store a full hand-authored variant per persona keyed by string ID.

Every user-facing surface (frontend, PDF, email, Ask Wayly system prompt)
must eventually resolve strings through this registry so there is exactly
one source of truth per PERSONA-1 §D.
"""
from __future__ import annotations

from typing import Dict

from .models import Pronouns, ViewerPersona


# ---------------------------------------------------------------------------
# Tier 2, verb & pronoun tokens.
# ---------------------------------------------------------------------------
# Structure: {token_name: {persona: {pronouns: value}}}. Participant is
# first-person and pronoun-agnostic; caregiver depends on care-recipient
# pronouns (unknown → "the care recipient" / "they" / plural verbs).

_CAREGIVER_TOKENS_BY_PRONOUNS: Dict[str, Dict[str, str]] = {
    "subject": {
        Pronouns.she_her.value: "{first_name}",
        Pronouns.he_him.value: "{first_name}",
        Pronouns.they_them.value: "{first_name}",
        Pronouns.unknown.value: "the care recipient",
    },
    "subject_possessive": {
        Pronouns.she_her.value: "{first_name_possessive}",
        Pronouns.he_him.value: "{first_name_possessive}",
        Pronouns.they_them.value: "{first_name_possessive}",
        Pronouns.unknown.value: "the care recipient's",
    },
    "subject_subjective": {
        Pronouns.she_her.value: "she",
        Pronouns.he_him.value: "he",
        Pronouns.they_them.value: "they",
        Pronouns.unknown.value: "they",
    },
    "subject_objective": {
        Pronouns.she_her.value: "her",
        Pronouns.he_him.value: "him",
        Pronouns.they_them.value: "them",
        Pronouns.unknown.value: "them",
    },
    "subject_reflexive": {
        Pronouns.she_her.value: "herself",
        Pronouns.he_him.value: "himself",
        Pronouns.they_them.value: "themself",
        Pronouns.unknown.value: "themself",
    },
    "be_present": {
        Pronouns.she_her.value: "is",
        Pronouns.he_him.value: "is",
        Pronouns.they_them.value: "are",
        # "the care recipient" is a singular noun subject; verbs agree
        # singular. When Tier-1 wants pronoun-subject copy ("they have")
        # it should render `{subject_subjective}` separately, not `{subject}`.
        Pronouns.unknown.value: "is",
    },
    "have_present": {
        Pronouns.she_her.value: "has",
        Pronouns.he_him.value: "has",
        Pronouns.they_them.value: "have",
        Pronouns.unknown.value: "has",
    },
    "was_past": {
        Pronouns.she_her.value: "was",
        Pronouns.he_him.value: "was",
        Pronouns.they_them.value: "were",
        Pronouns.unknown.value: "was",
    },
}

_PARTICIPANT_TOKENS: Dict[str, str] = {
    "subject": "you",
    "subject_possessive": "your",
    "subject_subjective": "you",
    "subject_objective": "you",
    "subject_reflexive": "yourself",
    "be_present": "are",
    "have_present": "have",
    "was_past": "were",
}


TIER2_TOKENS = {
    "participant": _PARTICIPANT_TOKENS,
    "caregiver": _CAREGIVER_TOKENS_BY_PRONOUNS,
}


def _possessive(first_name: str) -> str:
    """Australian English possessive rule with the standard exception for
    names ending in ``s`` (e.g. James → James'). We keep it simple: if the
    name ends with ``s``, append a bare apostrophe; otherwise ``'s``."""
    if not first_name:
        return "the care recipient's"
    return f"{first_name}'" if first_name.endswith("s") else f"{first_name}'s"


def tier2_tokens_for(
    *,
    persona: ViewerPersona,
    pronouns: Pronouns = Pronouns.unknown,
    first_name: str | None = None,
) -> Dict[str, str]:
    """Return the flat, ready-to-substitute token map for the active
    persona + pronouns + optional care-recipient name.

    Callers substitute these via a template renderer (``resolve_tier2_template``
    below) or Jinja/format-map depending on layer.
    """
    if persona == ViewerPersona.participant:
        # Participant strings are pronoun-agnostic (first person).
        return dict(_PARTICIPANT_TOKENS)

    # Caregiver, pick the right pronoun bucket, then substitute the care
    # recipient's name if we have one.
    key = (pronouns or Pronouns.unknown).value
    resolved: Dict[str, str] = {}
    for token, by_pronouns in _CAREGIVER_TOKENS_BY_PRONOUNS.items():
        value = by_pronouns.get(key) or by_pronouns[Pronouns.unknown.value]
        if "{first_name}" in value:
            if first_name:
                value = value.replace("{first_name}", first_name)
            else:
                # No name known, fall back to the ``unknown`` bucket entry.
                value = by_pronouns[Pronouns.unknown.value]
        if "{first_name_possessive}" in value:
            value = value.replace("{first_name_possessive}", _possessive(first_name or ""))
        resolved[token] = value
    return resolved


# ---------------------------------------------------------------------------
# Tier 1, hand-authored per-persona variants keyed by string ID.
# ---------------------------------------------------------------------------
# Each key is a short, stable slug. Values are the exact strings surfaced in
# empathy-critical copy. Editorial standards: Australian English, sentence
# case body, "%" symbol, no em dashes, banned-vocabulary safe.
#
# NEW: this is the seed set covering the four Tier-1 surfaces we know we
# will retrofit first (DEC-1, LF-1, CE-2, reports summary). Additional
# variants land in later workstreams (F, G, H).

TIER1_VARIANTS: Dict[str, Dict[str, str]] = {
    # DEC-1, Statement Decoder headline strings.
    "dec1.results.hero": {
        "participant": "Here is what we found in your statement.",
        "caregiver": "Here is what we found in {subject_possessive} statement.",
    },
    "dec1.results.no_anomalies": {
        "participant": "Good news. Nothing in this statement needs your attention right now.",
        "caregiver": "Good news. Nothing in this statement needs {subject_possessive} attention right now.",
    },
    "dec1.results.charged_correctly": {
        "participant": "You have been charged in line with your Support at Home plan.",
        "caregiver": "{subject} {have_present} been charged in line with {subject_possessive} Support at Home plan.",
    },
    # December 2026 automated-decision-making disclosure (PERSONA-1 §F).
    "dec1.adm_disclosure": {
        "participant": (
            "Automated decision-making disclosure. Wayly uses automated tools "
            "to flag anomalies in your statement. A human reviews any finding "
            "before it appears in your report. You can ask for a manual "
            "review of any item flagged here."
        ),
        "caregiver": (
            "Automated decision-making disclosure. Wayly uses automated tools "
            "to flag anomalies in {subject_possessive} statement. A human "
            "reviews any finding before it appears in this report. You can "
            "ask for a manual review of any item flagged here on {subject_possessive} behalf."
        ),
    },

    # CE-2, Contribution Estimator results.
    "ce2.results.hero_label": {
        "participant": "Your estimated weekly contribution",
        "caregiver": "{subject_possessive} estimated weekly contribution",
    },
    "ce2.results.hero": {
        "participant": "This is what you can expect to pay.",
        "caregiver": "This is what {subject} can expect to pay.",
    },
    "ce2.results.government_share": {
        "participant": "The government covers the rest, based on your income assessment.",
        "caregiver": "The government covers the rest, based on {subject_possessive} income assessment.",
    },
    "ce2.results.fee_exempt_hero": {
        "participant": "You will not pay any contribution.",
        "caregiver": "{subject} will not pay any contribution.",
    },
    "ce2.results.fee_exempt_body": {
        "participant": (
            "Because you were on a Home Care Package before 12 September 2024 "
            "and paid no HCP fees, the no-worse-off rule guarantees a permanent "
            "zero. No lifetime cap applies. Your rate will not change if you "
            "are reassessed later."
        ),
        "caregiver": (
            "Because {subject} {was_past} on a Home Care Package before 12 "
            "September 2024 and paid no HCP fees, the no-worse-off rule "
            "guarantees a permanent zero for {subject_objective}. No lifetime "
            "cap applies. {subject_possessive} rate will not change if {subject_subjective} {be_present} "
            "reassessed later."
        ),
    },

    # LF-1 letter openings and reports intros are handled by full LLM
    # generation with a PERSONA CONTEXT injection block (see
    # lib/persona/context.py). They do not need Tier-1 registry keys, so
    # earlier seed entries were removed to keep the registry honest ,
    # every registered key is now referenced in the codebase (see
    # tests/test_persona_governance.py). Retired seed keys:
    #   - lf1.letter.rate_query.opening
    #   - lf1.signature.representative
    #   - reports.summary.intro
    # If you re-add any of these, wire the retrofit at the same PR.

    # Reports, executive-summary framing.
}


def tier1_keys() -> list[str]:
    """List every registered Tier-1 key. Used by the lint rule."""
    return list(TIER1_VARIANTS.keys())
