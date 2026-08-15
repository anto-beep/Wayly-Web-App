"""PERSONA-1 unit tests — registry + resolver + acceptance tests §7-11.

Covers the deterministic pieces of Workstreams B & D: token substitution,
Tier-1 lookup, pronoun buckets, feature-flag gating. Live HTTP tests for
GET/PUT/POST /api/persona live in ``test_persona_routes.py``.
"""
from __future__ import annotations

import os
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from lib.persona.models import Pronouns, ViewerPersona  # noqa: E402
from lib.persona.registry import TIER1_VARIANTS, tier2_tokens_for  # noqa: E402
from lib.persona.resolver import (  # noqa: E402
    persona_enabled,
    resolve_bundle,
    resolve_tier1,
    resolve_tier2_template,
)


@pytest.fixture(autouse=True)
def enable_persona_flag(monkeypatch):
    """All tests here assume the flag is on unless a test flips it off."""
    monkeypatch.setenv("PERSONA_V1_ENABLED", "true")


class TestTier2Tokens:
    def test_participant_is_first_person(self):
        toks = tier2_tokens_for(persona=ViewerPersona.participant)
        assert toks["subject"] == "you"
        assert toks["subject_possessive"] == "your"
        assert toks["be_present"] == "are"
        assert toks["have_present"] == "have"
        assert toks["subject_reflexive"] == "yourself"

    def test_caregiver_she_her_with_name(self):
        toks = tier2_tokens_for(
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.she_her,
            first_name="Louisa",
        )
        assert toks["subject"] == "Louisa"
        assert toks["subject_possessive"] == "Louisa's"
        assert toks["subject_subjective"] == "she"
        assert toks["subject_objective"] == "her"
        assert toks["subject_reflexive"] == "herself"
        assert toks["be_present"] == "is"
        assert toks["have_present"] == "has"

    def test_caregiver_he_him_with_s_ending_name(self):
        # Australian English possessive on names ending in 's' → bare apostrophe.
        toks = tier2_tokens_for(
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.he_him,
            first_name="James",
        )
        assert toks["subject_possessive"] == "James'"
        assert toks["subject_subjective"] == "he"
        assert toks["subject_objective"] == "him"
        assert toks["subject_reflexive"] == "himself"

    def test_caregiver_they_them_plural_verbs(self):
        toks = tier2_tokens_for(
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.they_them,
            first_name="Alex",
        )
        assert toks["subject"] == "Alex"
        assert toks["be_present"] == "are"
        assert toks["have_present"] == "have"
        assert toks["was_past"] == "were"
        assert toks["subject_reflexive"] == "themself"

    def test_caregiver_unknown_pronouns_falls_back(self):
        toks = tier2_tokens_for(
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.unknown,
        )
        assert toks["subject"] == "the care recipient"
        assert toks["subject_possessive"] == "the care recipient's"
        assert toks["subject_subjective"] == "they"
        # Verbs agree with the singular noun subject ("the care recipient").
        assert toks["be_present"] == "is"
        assert toks["have_present"] == "has"
        assert toks["was_past"] == "was"


class TestTemplateResolver:
    def test_substitutes_known_tokens(self):
        out = resolve_tier2_template(
            "{subject} {have_present} received a statement.",
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.she_her,
            first_name="Louisa",
        )
        assert out == "Louisa has received a statement."

    def test_participant_pronoun_agnostic(self):
        out = resolve_tier2_template(
            "{subject} {have_present} received a statement.",
            persona=ViewerPersona.participant,
        )
        assert out == "you have received a statement."

    def test_leaves_unknown_tokens_intact(self):
        out = resolve_tier2_template(
            "Hello {unknown_token} and {subject}.",
            persona=ViewerPersona.participant,
        )
        assert "{unknown_token}" in out
        assert "you" in out


class TestTier1Resolver:
    """Acceptance-test coverage for PERSONA-1 §7-11."""

    def test_participant_dec1_hero_is_first_person(self):
        out = resolve_tier1("dec1.results.hero", persona=ViewerPersona.participant)
        assert out == "Here is what we found in your statement."
        # Belt-and-suspenders: no third-person markers at all.
        for banned in ("parent", "mother", "father", "she ", "he ", "her ", "his ", "they "):
            assert banned not in out.lower(), f"unexpected third-person marker: {banned!r}"

    def test_caregiver_dec1_hero_uses_name_and_pronouns(self):
        out = resolve_tier1(
            "dec1.results.hero",
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.she_her,
            first_name="Louisa",
        )
        assert out == "Here is what we found in Louisa's statement."

    def test_verb_agreement_participant_vs_caregiver(self):
        p = resolve_tier1("dec1.results.charged_correctly", persona=ViewerPersona.participant)
        c = resolve_tier1(
            "dec1.results.charged_correctly",
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.she_her,
            first_name="Louisa",
        )
        assert "you have" in p.lower()
        assert "louisa has" in c.lower()

    def test_unknown_pronoun_uses_care_recipient_fallback(self):
        out = resolve_tier1(
            "dec1.results.hero",
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.unknown,
        )
        assert "the care recipient's" in out.lower()

    def test_missing_key_raises(self):
        with pytest.raises(KeyError):
            resolve_tier1("nope.never.registered", persona=ViewerPersona.participant)


class TestFeatureFlag:
    def test_flag_off_returns_caregiver_variant(self, monkeypatch):
        monkeypatch.setenv("PERSONA_V1_ENABLED", "false")
        out = resolve_tier1(
            "dec1.results.hero",
            persona=ViewerPersona.participant,  # requested participant
            pronouns=Pronouns.she_her,
            first_name="Louisa",
        )
        # Flag off — falls back to caregiver.
        assert out == "Here is what we found in Louisa's statement."
        assert persona_enabled() is False

    def test_flag_on(self, monkeypatch):
        monkeypatch.setenv("PERSONA_V1_ENABLED", "on")
        assert persona_enabled() is True


class TestBundle:
    def test_bundle_shape(self):
        bundle = resolve_bundle(
            persona=ViewerPersona.caregiver,
            pronouns=Pronouns.she_her,
            first_name="Louisa",
        )
        assert set(bundle.keys()) >= {"persona", "pronouns", "tokens", "flag_enabled", "care_recipient_first_name"}
        assert bundle["persona"] == "caregiver"
        assert bundle["tokens"]["subject_possessive"] == "Louisa's"


class TestRegistrySeed:
    def test_every_key_has_both_variants(self):
        for key, variants in TIER1_VARIANTS.items():
            assert "participant" in variants, f"missing participant for {key}"
            assert "caregiver" in variants, f"missing caregiver for {key}"
            assert variants["participant"].strip(), f"empty participant string for {key}"
            assert variants["caregiver"].strip(), f"empty caregiver string for {key}"
