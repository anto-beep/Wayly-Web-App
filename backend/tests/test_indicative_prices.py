"""Regression: indicative price benchmarks must reflect the DoH October 2025
"Summary of indicative Support at Home prices" PDF.

When DoH publishes a refreshed PDF, update `PRICE_BENCHMARKS` in
`lib/tool_helpers.py` AND update the corresponding `indicative_price.*`
rows in `seed_program_reference.py` AND update the spot-check values in
this test."""
from __future__ import annotations
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


# A handful of services from each stream, locked to the published medians.
_DOH_OCT_2025_MEDIANS = {
    # Clinical
    "Nursing care":                                 (150.0, 125.0, 179.0, "hour", "Clinical"),
    "Registered nurse":                             (160.0, 144.0, 186.0, "hour", "Clinical"),
    "Physiotherapist":                              (185.0, 160.0, 210.0, "hour", "Clinical"),
    "Occupational therapist":                       (200.0, 174.0, 220.0, "hour", "Clinical"),
    "Psychologist":                                 (228.0, 210.0, 250.0, "hour", "Clinical"),
    # Independence
    "Personal care":                                (100.0,  85.0, 115.0, "hour", "Independence"),
    "Care management":                              (120.0,  80.0, 150.0, "hour", "Independence"),
    "Respite":                                      ( 99.0,  85.0, 112.0, "hour", "Independence"),
    # Everyday Living
    "Domestic assistance":                          ( 95.0,  83.0, 109.0, "hour", "Everyday Living"),
    "Transport":                                    ( 70.0,  40.0,  97.0, "trip", "Everyday Living"),
    "Meal delivery":                                ( 15.0,  11.0,  22.0, "meal", "Everyday Living"),
    "Home maintenance and repairs":                 (103.0,  85.0, 120.0, "hour", "Everyday Living"),
}


def test_price_benchmarks_match_doh_oct_2025_pdf():
    from lib.tool_helpers import PRICE_BENCHMARKS

    for service, (median, lower, upper, unit, stream) in _DOH_OCT_2025_MEDIANS.items():
        row = PRICE_BENCHMARKS.get(service)
        assert row is not None, f"{service!r} missing from PRICE_BENCHMARKS"
        assert row["median"] == median, f"{service}: median {row['median']} != PDF {median}"
        assert row["lower"] == lower, f"{service}: lower {row['lower']} != PDF {lower}"
        assert row["upper"] == upper, f"{service}: upper {row['upper']} != PDF {upper}"
        assert row["unit"] == unit, f"{service}: unit {row['unit']!r} != {unit!r}"
        assert row["stream"] == stream, f"{service}: stream {row['stream']!r} != {stream!r}"
        assert "DoH" in row["source"] and "Oct 2025" in row["source"]


def test_legacy_aliases_resolve_to_canonical_doh_row():
    from lib.tool_helpers import PRICE_BENCHMARKS

    legacy_to_canonical = {
        "Domestic assistance, cleaning":  "Domestic assistance",
        "Occupational therapy":            "Occupational therapist",
        "Physiotherapy":                   "Physiotherapist",
        "Transport, community access":    "Transport",
        "Nursing, registered":            "Registered nurse",
        "Allied health, podiatry":        "Podiatrist",
    }
    for legacy, canonical in legacy_to_canonical.items():
        legacy_row = PRICE_BENCHMARKS.get(legacy)
        canonical_row = PRICE_BENCHMARKS.get(canonical)
        assert legacy_row is not None, f"legacy alias {legacy!r} missing"
        assert canonical_row is not None, f"canonical {canonical!r} missing"
        # Legacy row should mirror the canonical median + range.
        assert legacy_row["median"] == canonical_row["median"]
        assert legacy_row.get("lower") == canonical_row.get("lower")
        assert legacy_row.get("upper") == canonical_row.get("upper")
        assert legacy_row.get("_alias_of") == canonical


def test_seed_program_reference_has_indicative_price_rows():
    from seed_program_reference import get_seed_rows

    rows = get_seed_rows()
    indicative_keys = {r["key"] for r in rows if r["key"].startswith("indicative_price.")}
    # 27 services × 3 rows (median + lower + upper) = 81 keys.
    assert len(indicative_keys) >= 81, (
        f"Expected at least 81 indicative_price.* rows, got {len(indicative_keys)}"
    )
    # Spot-check a few.
    assert "indicative_price.personal_care.median_aud_hour" in indicative_keys
    assert "indicative_price.personal_care.lower_aud_hour" in indicative_keys
    assert "indicative_price.personal_care.upper_aud_hour" in indicative_keys
    assert "indicative_price.transport.median_aud_trip" in indicative_keys
    assert "indicative_price.meal_delivery.median_aud_meal" in indicative_keys
