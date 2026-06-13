"""Regression: ``budget.rollover_cap()`` must compute against the GROSS
quarterly budget (annual / 4), not the post-care-management figure.

Previously the helper called ``quarterly_budget()`` which already deducts
the 10% care-management slice. That understated the rollover cap for
Levels 6, 7 and 8 — e.g. Level 8 returned $1,757.39 when the correct
figure is $1,952.65 (10% of $19,526.50 gross quarterly).
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


def _gross_q(classification: int) -> float:
    from budget import classification_annual
    return classification_annual(classification) / 4.0


def test_level_1_floor_wins():
    """Level 1 gross quarterly is ~$2,682.75 → 10% = $268.28 < $1,000 floor."""
    from budget import rollover_cap
    assert rollover_cap(1) == pytest.approx(1000.00, abs=0.01)


def test_level_4_floor_still_wins():
    """Level 4 gross quarterly is $7,424.00 → 10% = $742.40 < $1,000 floor."""
    from budget import rollover_cap
    assert rollover_cap(4) == pytest.approx(1000.00, abs=0.01)


def test_level_6_uses_gross_quarterly_pct():
    """Level 6 gross quarterly × 10% must be returned (formula, not literal —
    the seeded Level 6 annual figure is under separate review)."""
    from budget import rollover_cap
    expected = round(_gross_q(6) * 0.10, 2)
    assert expected > 1000.00, (
        f"Test pre-condition: Level 6 gross × 10% must exceed the $1,000 floor; got {expected}"
    )
    assert rollover_cap(6) == pytest.approx(expected, abs=0.01)


def test_level_7_uses_gross_quarterly_pct():
    from budget import rollover_cap
    expected = round(_gross_q(7) * 0.10, 2)
    assert expected > 1000.00, (
        f"Test pre-condition: Level 7 gross × 10% must exceed the $1,000 floor; got {expected}"
    )
    assert rollover_cap(7) == pytest.approx(expected, abs=0.01)


def test_level_8_returns_1952_65():
    """Level 8 annual is $78,106 (seeded). Gross quarterly is $19,526.50 →
    10% = $1,952.65 — the canonical regression number from the bug report."""
    from budget import rollover_cap, classification_annual
    assert classification_annual(8) == pytest.approx(78106.00, abs=0.01), (
        "Test depends on the seeded Level 8 annual being $78,106"
    )
    assert rollover_cap(8) == pytest.approx(1952.65, abs=0.01)


def test_level_8_is_not_the_buggy_post_cm_value():
    """Sanity guard against accidental regression: the old (incorrect) value
    using the post-CM quarterly was $1,757.39. Make sure we never return that."""
    from budget import rollover_cap
    assert rollover_cap(8) != pytest.approx(1757.39, abs=0.01)


def test_rollover_cap_never_below_floor():
    """For every classification, the returned cap must be >= $1,000."""
    from budget import rollover_cap
    for c in range(1, 9):
        assert rollover_cap(c) >= 1000.00


def test_quarterly_budget_semantics_unchanged():
    """Other callers rely on quarterly_budget() being POST care-management.
    Confirm that contract did not silently change with the rollover fix."""
    from budget import quarterly_budget, classification_annual
    for c in range(1, 9):
        annual = classification_annual(c)
        gross_q = annual / 4.0
        post_cm = quarterly_budget(c)
        assert post_cm == pytest.approx(round(gross_q * 0.90, 2), abs=0.01)
