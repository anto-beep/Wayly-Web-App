"""Regression: ``budget.rollover_cap()`` computes against the POST-care-
management quarterly budget per Aged Care Rules 2025, section 193-5.

Section 193-5 defines the quarterly rollover credit as
``max($1,000, 10% × base individual daily amount × days in the quarter)``.
The "base individual daily amount" is the post-CM portion (the base
provider amount — the 10% care management slice — is excluded). So
``rollover_cap()`` multiplies the post-CM ``quarterly_budget(c)`` by 10%
and floors at $1,000, rounded to 2 dp.
"""
from __future__ import annotations
import asyncio
import os
import sys
from pathlib import Path

import pytest
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

load_dotenv("/app/backend/.env")


@pytest.fixture(scope="module", autouse=True)
def _bootstrap_program_reference():
    """Load the program_reference cache once for the module."""
    from motor.motor_asyncio import AsyncIOMotorClient
    import program_reference as pr

    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    pr.init(db)

    async def _load():
        await pr.preload_cache()

    asyncio.get_event_loop().run_until_complete(_load())
    yield
    client.close()


def _post_cm_quarterly(classification: int) -> float:
    from budget import quarterly_budget
    return quarterly_budget(classification)


def test_level_1_floor_wins():
    """Level 1 post-CM quarterly is ~$2,414.48 → 10% = $241.45 < $1,000 floor."""
    from budget import rollover_cap
    assert rollover_cap(1) == pytest.approx(1000.00, abs=0.01)


def test_level_4_floor_still_wins():
    """Level 4 post-CM quarterly is $6,681.60 → 10% = $668.16 < $1,000 floor."""
    from budget import rollover_cap
    assert rollover_cap(4) == pytest.approx(1000.00, abs=0.01)


def test_level_6_uses_post_cm_quarterly_pct():
    """Aged Care Rules 2025 section 193-5: rollover = 10% of the post-CM
    quarterly. Formula-based assertion so it survives a re-seed of L6."""
    from budget import rollover_cap
    expected = round(_post_cm_quarterly(6) * 0.10, 2)
    assert expected > 1000.00, (
        f"Test pre-condition: L6 post-CM × 10% must exceed the floor; got {expected}"
    )
    assert rollover_cap(6) == pytest.approx(expected, abs=0.01)


def test_level_7_uses_post_cm_quarterly_pct():
    from budget import rollover_cap
    expected = round(_post_cm_quarterly(7) * 0.10, 2)
    assert expected > 1000.00, (
        f"Test pre-condition: L7 post-CM × 10% must exceed the floor; got {expected}"
    )
    assert rollover_cap(7) == pytest.approx(expected, abs=0.01)


def test_level_8_returns_post_cm_value():
    """Level 8 annual $78,106 → quarterly_usable $17,573.85 → 10% = $1,757.39
    (the canonical pre-Prompt-C value)."""
    from budget import rollover_cap, classification_annual
    assert classification_annual(8) == pytest.approx(78106.00, abs=0.01)
    assert rollover_cap(8) == pytest.approx(1757.39, abs=0.01)


def test_rollover_cap_never_below_floor():
    from budget import rollover_cap
    for c in range(1, 9):
        assert rollover_cap(c) >= 1000.00


def test_quarterly_budget_semantics_unchanged():
    """quarterly_budget() must stay POST care-management."""
    from budget import quarterly_budget, classification_annual
    for c in range(1, 9):
        annual = classification_annual(c)
        gross_q = annual / 4.0
        post_cm = quarterly_budget(c)
        assert post_cm == pytest.approx(round(gross_q * 0.90, 2), abs=0.01)
