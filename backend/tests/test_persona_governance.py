"""PERSONA-1 Workstream — Copy governance lint tests.

Two structural checks that live in pytest so they run in the same suite as
every other backend test. Both are cheap file-scan tests that don't need
the app running.

Test #1  — adjacent-string-literal footgun in JS/JSX.
  The Feb-2026 CE-2 build break came from copy-pasting Python's
  implicit-adjacent-string idiom into a JS object literal. Babel treats
  that as a hard SyntaxError. We already have an ESLint flat config
  that catches this (verified locally), but there is no CI hook that
  guarantees it runs before ship. So we scan the source tree for the
  exact Python-idiom pattern:

      key: (
          "string one "
          "string two "
      ),

  If we find it, this test fails with the offending file + line so the
  author can fix at PR time. Zero runtime cost.

Test #2 — Tier-1 registry key usage.
  Every key registered in ``backend/lib/persona/registry.TIER1_VARIANTS``
  should be referenced somewhere in the codebase (frontend or backend).
  If a key is defined but never used, either the retrofit shipped
  incompletely or the key was retired but the registry entry left behind.
  Either way, the developer should know.
"""
from __future__ import annotations

import pathlib
import re
import sys

import pytest

ROOT = pathlib.Path("/app")
FRONTEND = ROOT / "frontend" / "src"
BACKEND = ROOT / "backend"

sys.path.insert(0, str(BACKEND))

# --- Test #1: adjacent-string-literal scanner ------------------------------

_ADJACENT_JSX_PATTERN = re.compile(
    r'"\s*\n\s*"',  # closing quote → newline (+ optional ws) → opening quote
)


def _js_files():
    for path in FRONTEND.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in {".js", ".jsx", ".ts", ".tsx"}:
            continue
        # Skip generated + third-party.
        parts = set(path.parts)
        if {"node_modules", "build", "dist", ".next"} & parts:
            continue
        if "components/ui" in str(path):
            continue  # shadcn-generated
        yield path


def test_no_adjacent_string_literals_in_jsx():
    """The specific footgun that broke /ai-tools/contribution-estimator in
    Iter 77. Adjacent JS string literals with only whitespace between them
    are a Babel SyntaxError and MUST NOT ship.
    """
    offenders: list[str] = []
    for path in _js_files():
        try:
            src = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        for m in _ADJACENT_JSX_PATTERN.finditer(src):
            # Cheap heuristic to skip false positives inside JSDoc / block
            # comments (no `*` on the affected line pair).
            start = src.rfind("\n", 0, m.start())
            end = src.find("\n", m.end())
            window = src[start:end]
            if window.lstrip().startswith("*") or "//" in window:
                continue
            line_no = src.count("\n", 0, m.start()) + 1
            offenders.append(f"{path.relative_to(ROOT)}:{line_no}")

    assert not offenders, (
        "Adjacent JS string literals detected (Python-style implicit "
        "concatenation is a JS SyntaxError). Add `+` between the strings:\n  "
        + "\n  ".join(offenders)
    )


# --- Test #2: Tier-1 registry key usage ------------------------------------


def test_every_tier1_key_is_referenced() -> None:
    """Every Tier-1 key in the persona registry must be referenced at
    least once outside the registry file itself. Unused keys either
    signal an incomplete retrofit or a retired variant.
    """
    from lib.persona.registry import TIER1_VARIANTS

    keys = sorted(TIER1_VARIANTS.keys())

    # Build a haystack of every source file that could reference the keys
    # (frontend JS/TS + backend Python routes/services/agents/reports).
    haystack: list[tuple[pathlib.Path, str]] = []

    for path in _js_files():
        try:
            haystack.append((path, path.read_text(encoding="utf-8")))
        except UnicodeDecodeError:
            continue

    for path in BACKEND.rglob("*.py"):
        rel = path.relative_to(ROOT)
        rel_parts = set(rel.parts)
        if {"__pycache__", "tests"} & rel_parts:
            continue
        # Exclude the registry file itself so a key being defined there
        # doesn't count as "used".
        if str(rel).endswith("lib/persona/registry.py"):
            continue
        try:
            haystack.append((path, path.read_text(encoding="utf-8")))
        except UnicodeDecodeError:
            continue

    orphans: list[str] = []
    for key in keys:
        if not any(key in src for _, src in haystack):
            orphans.append(key)

    if orphans:
        pytest.fail(
            "Tier-1 registry keys defined but never referenced anywhere "
            "in the codebase. Either wire the retrofit or retire the key:\n  "
            + "\n  ".join(orphans),
            pytrace=False,
        )
