"""Tests for the situation label personalisation helper.

Situations 1, 2, and 11 carry a `{name}` placeholder that should be
substituted with the active participant's first name. When no
participant is available, a warm gender-neutral fallback is used.
"""
from __future__ import annotations

import pytest

from lib import lf1


def test_gendered_situations_carry_placeholder():
    assert "{name}" in lf1.get_situation(1)["label"]
    assert "{name}" in lf1.get_situation(2)["label"]
    assert "{name}" in lf1.get_situation(11)["label"]


def test_neutral_situations_have_no_placeholder():
    for sid in (3, 4, 5, 6, 7, 8, 9, 10, 12):
        assert "{name}" not in lf1.get_situation(sid)["label"], sid


def test_render_uses_first_name_only():
    tpl = "{name}'s condition has changed and they need more help"
    assert lf1.render_situation_label(tpl, "Louisa Chen") == (
        "Louisa's condition has changed and they need more help"
    )


def test_render_falls_back_when_no_name():
    tpl = "{name} has just been in hospital or had a significant health event"
    assert lf1.render_situation_label(tpl, "") == (
        "your loved one has just been in hospital or had a significant health event"
    )
    assert lf1.render_situation_label(tpl, None) == (
        "your loved one has just been in hospital or had a significant health event"
    )


def test_render_leaves_non_templated_labels_unchanged():
    tpl = "I don't agree with a charge on the statement"
    assert lf1.render_situation_label(tpl, "Louisa") == tpl


def test_safeguarding_situation_shows_named_possessive():
    tpl = lf1.get_situation(11)["label"]
    assert lf1.render_situation_label(tpl, "Frank") == "I'm worried about Frank's safety"


def test_render_handles_extra_whitespace_in_name():
    tpl = lf1.get_situation(1)["label"]
    assert lf1.render_situation_label(tpl, "  Louisa   Chen  ") == (
        "Louisa's condition has changed and they need more help"
    )
