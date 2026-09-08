"""Regression tests for lib.text_sanitiser.enforce_percent_symbol.

Guards the Feb 2026 fix: reports summaries must always render "%" instead of
the spelled-out word "percentage", "percent", or "per cent".
"""
from __future__ import annotations

import pathlib
import sys

# Allow ``python -m pytest tests/`` from /app/backend.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from lib.text_sanitiser import enforce_percent_symbol  # noqa: E402


def test_percent_word_after_number() -> None:
    assert enforce_percent_symbol("18 percent") == "18%"
    assert enforce_percent_symbol("18 percentage") == "18%"
    assert enforce_percent_symbol("18 per cent") == "18%"
    assert enforce_percent_symbol("18.5 percent") == "18.5%"


def test_percent_word_with_hyphen() -> None:
    assert enforce_percent_symbol("A 15-percent contribution") == "A 15% contribution"


def test_percentage_points_preserved_after_symbol() -> None:
    # "percentage points" is a real statistical term; after conversion the
    # sentence still reads naturally.
    out = enforce_percent_symbol("A 0.5 percentage point margin")
    assert out == "A 0.5% point margin"
    out2 = enforce_percent_symbol("A 2.5 percentage points margin")
    assert out2 == "A 2.5% points margin"


def test_bare_concept_word_untouched() -> None:
    # No number attached, keep the word to preserve grammar.
    assert (
        enforce_percent_symbol("The percentage of your budget spent")
        == "The percentage of your budget spent"
    )


def test_already_symbol() -> None:
    assert enforce_percent_symbol("Rate went from 18% to 22%") == "Rate went from 18% to 22%"


def test_empty_and_none() -> None:
    assert enforce_percent_symbol("") == ""
    assert enforce_percent_symbol(None) is None  # type: ignore[arg-type]
