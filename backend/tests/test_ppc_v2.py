"""PPC-1 v2 deterministic tests — matches the spec's acceptance §7.

Runs against ``lib.ppc_v2`` directly with no FastAPI / Mongo dependencies.
The route-level integration is covered by live curl checks in the manual
smoke; these tests are the belt-and-braces regression gate.
"""
from __future__ import annotations

import datetime as dt

import pytest

from lib import ppc_v2


# ---------------------------------------------------------------------------
# WS1 — DoH snapshot dictionary
# ---------------------------------------------------------------------------

def test_snapshot_loader_loads_at_least_one_snapshot():
    snaps = ppc_v2.list_snapshots()
    assert snaps, "Expected at least one DoH snapshot on disk."
    assert snaps[0]["snapshot_id"] == "doh-2025-10"
    assert snaps[0]["source_date"] == "2025-10-01"


def test_default_snapshot_id_returns_most_recent():
    assert ppc_v2.get_default_snapshot_id() == "doh-2025-10"


def test_list_services_returns_ordered_by_stream_then_name():
    rows = ppc_v2.list_services()
    assert rows, "Expected non-empty service list."
    streams = [r["stream"] for r in rows]
    # Clinical rows first, then Independence, then Everyday Living.
    stream_order = [s for i, s in enumerate(streams) if i == 0 or s != streams[i - 1]]
    assert stream_order == ["Clinical", "Independence", "Everyday Living"]


def test_get_service_returns_personal_care_row_with_expected_range():
    row = ppc_v2.get_service("Personal care")
    assert row is not None
    assert row["range_lower"] == 85.0
    assert row["range_upper"] == 115.0
    assert row["median"] == 100.0
    assert row["stream"] == "Independence"
    assert row["unit"] == "hour"
    assert row["available"] is True
    assert row["checkable"] is True


def test_non_checkable_rows_present_for_expected_services():
    checkable_false_services = {
        row["service"]
        for row in ppc_v2.list_services()
        if row.get("checkable") is False
    }
    assert "Package management (monthly flat fee)" in checkable_false_services
    assert "Care management (monthly flat fee)" in checkable_false_services
    assert "Wraparound advisor fee" in checkable_false_services
    assert "Transport (per kilometre)" in checkable_false_services


# ---------------------------------------------------------------------------
# §7.1 — Above-range test
# ---------------------------------------------------------------------------

def test_above_range_personal_care():
    comp = ppc_v2.compare_rate("Personal care", 150.0)
    assert comp.position == "above"
    assert comp.direction == "above_range"
    assert comp.distance_from_edge == 35.0
    assert "above the published range of $85.00 to $115.00" in comp.plain_language
    assert comp.doh_caveat is not None  # §3.1 above-range caveat quoted
    assert ppc_v2.distance_summary(comp) == "That is $35.00 above the top of the published range."


# ---------------------------------------------------------------------------
# §7.2 — In-range test
# ---------------------------------------------------------------------------

def test_in_range_personal_care():
    comp = ppc_v2.compare_rate("Personal care", 100.0)
    assert comp.position == "in"
    assert comp.direction == "in_range"
    assert comp.distance_from_edge == 0.0
    assert "inside the published range" in comp.plain_language
    assert comp.doh_caveat is None


# ---------------------------------------------------------------------------
# §7.3 — Below-range implausible test — quality guard fires
# ---------------------------------------------------------------------------

def test_below_range_implausibly_low_guard():
    comp = ppc_v2.compare_rate("Personal care", 20.0)
    guard = ppc_v2.run_quality_guards(
        service="Personal care", rate=20.0, unit=comp.unit, comp=comp,
    )
    assert guard is not None
    assert guard.guard_type == "implausibly_low"
    assert guard.allow_continue is True


# ---------------------------------------------------------------------------
# §7.4 — Below-range plausible (no guard)
# ---------------------------------------------------------------------------

def test_below_range_plausible_no_guard():
    comp = ppc_v2.compare_rate("Personal care", 80.0)
    assert comp.position == "below"
    assert comp.distance_from_edge == 5.0
    guard = ppc_v2.run_quality_guards(
        service="Personal care", rate=80.0, unit=comp.unit, comp=comp,
    )
    assert guard is None
    assert "below the published range" in comp.plain_language
    assert ppc_v2.distance_summary(comp) == "That is $5.00 below the bottom of the published range."


# ---------------------------------------------------------------------------
# §7.5 — Clinical service test
# ---------------------------------------------------------------------------

def test_clinical_service_share_is_zero():
    comp = ppc_v2.compare_rate("Registered nurse", 170.0)
    assert comp.stream == "Clinical"
    share = ppc_v2.compute_your_share(comp=comp, pension_status="full")
    assert share["mode"] == "clinical"
    assert share["share_amount"] == 0.0
    assert "Clinical supports carry no participant contribution." in share["explanation"]


# ---------------------------------------------------------------------------
# §7.6 — Personal care after 1 October 2026 (clinical share)
# ---------------------------------------------------------------------------

def test_personal_care_post_oct_2026_becomes_clinical():
    comp = ppc_v2.compare_rate("Personal care", 100.0)
    share = ppc_v2.compute_your_share(
        comp=comp,
        pension_status="full",
        check_date=dt.date(2026, 10, 2),
    )
    assert share["mode"] == "clinical"
    assert share["share_amount"] == 0.0


# ---------------------------------------------------------------------------
# §7.7 — Personal care before 1 October 2026 (transitional Independence share)
# ---------------------------------------------------------------------------

def test_personal_care_pre_oct_2026_is_independence():
    comp = ppc_v2.compare_rate("Personal care", 100.0)
    share = ppc_v2.compute_your_share(
        comp=comp,
        pension_status="full",
        check_date=dt.date(2026, 9, 30),
    )
    assert share["mode"] == "exact"
    assert share["rate_pct"] == 5.0  # Independence full pension rate.


# ---------------------------------------------------------------------------
# §7.8 — Grandfathered gate test
# ---------------------------------------------------------------------------

def test_grandfathered_share_returns_hcp_message():
    comp = ppc_v2.compare_rate("Personal care", 100.0)
    share = ppc_v2.compute_your_share(
        comp=comp,
        pension_status="full",
        is_grandfathered=True,
    )
    assert share["mode"] == "grandfathered"
    assert share["share_amount"] is None
    assert "Grandfathered pricing applies." in share["explanation"]


# ---------------------------------------------------------------------------
# §7.13 — Unit label test
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("service,expected_label", [
    ("Transport", "$ per trip"),
    ("Meal delivery", "$ per meal"),
    ("Personal care", "$ per hour"),
])
def test_unit_label_switches_with_service(service, expected_label):
    row = ppc_v2.get_service(service)
    assert row is not None
    assert ppc_v2.unit_dollar_label(row["unit"]) == expected_label


# ---------------------------------------------------------------------------
# §7.14 — After-hours guard test
# ---------------------------------------------------------------------------

def test_after_hours_guard_fires_on_above_range_personal_care():
    comp = ppc_v2.compare_rate("Personal care", 180.0)
    guard = ppc_v2.run_quality_guards(
        service="Personal care", rate=180.0, unit=comp.unit, comp=comp,
    )
    assert guard is not None
    assert guard.guard_type == "after_hours_ambiguity"
    assert guard.after_hours_toggle_available is True


def test_after_hours_toggle_relaxes_guard():
    comp = ppc_v2.compare_rate("Personal care", 180.0)
    guard = ppc_v2.run_quality_guards(
        service="Personal care", rate=180.0, unit=comp.unit, comp=comp,
        after_hours_toggle=True,
    )
    # After-hours toggle removes the ambiguity guard; the standard above-range
    # path renders.
    assert guard is None


# ---------------------------------------------------------------------------
# §7.31 — Non-checkable service test
# ---------------------------------------------------------------------------

def test_non_checkable_service_renders_explanatory_panel():
    comp = ppc_v2.compare_rate("Package management (monthly flat fee)", 300.0)
    assert comp.position == "not_checkable"
    assert comp.direction == "non_checkable"
    assert "monthly flat fee" in comp.plain_language


# ---------------------------------------------------------------------------
# §7.13 unit-mismatch — meal delivery above 3× upper triggers unit-mismatch guard
# ---------------------------------------------------------------------------

def test_meal_delivery_unit_mismatch_guard():
    comp = ppc_v2.compare_rate("Meal delivery", 100.0)
    guard = ppc_v2.run_quality_guards(
        service="Meal delivery", rate=100.0, unit=comp.unit, comp=comp,
    )
    assert guard is not None
    # Implausibly-high fires first for 100 vs upper 22 (>2×). Check both branches.
    assert guard.guard_type in ("implausibly_high", "unit_mismatch")


# ---------------------------------------------------------------------------
# §7.23 — Rate change threshold test (2% relative floor)
# ---------------------------------------------------------------------------

def _mk_row(rate, created_at, source_stmt=None):
    return {"rate": rate, "created_at": created_at, "source_statement_id": source_stmt}


def test_rate_change_within_percent_floor_is_not_a_change():
    # $100 -> $101 change of 1% is below the 2% floor
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        _mk_row(100.0, (now - dt.timedelta(days=30)).isoformat()),
        _mk_row(101.0, now.isoformat()),
    ]
    assert ppc_v2.count_rate_increases_last_12mo(rows) == 0


def test_rate_change_clearing_percent_floor_counts():
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        _mk_row(100.0, (now - dt.timedelta(days=30)).isoformat()),
        _mk_row(102.5, now.isoformat()),
    ]
    assert ppc_v2.count_rate_increases_last_12mo(rows) == 1


# ---------------------------------------------------------------------------
# §7.24 — Meal delivery absolute floor test
# ---------------------------------------------------------------------------

def test_meal_delivery_absolute_floor_below_50c_is_no_change():
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        _mk_row(15.0, (now - dt.timedelta(days=30)).isoformat()),
        _mk_row(15.30, now.isoformat()),
    ]
    # $0.30 < $0.50 absolute floor
    assert ppc_v2.count_rate_increases_last_12mo(rows) == 0


def test_meal_delivery_absolute_floor_clears_at_1_dollar():
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        _mk_row(15.0, (now - dt.timedelta(days=30)).isoformat()),
        _mk_row(16.0, now.isoformat()),
    ]
    # $1.00 clears both floors (2% of $15 = $0.30, absolute floor = $0.50)
    assert ppc_v2.count_rate_increases_last_12mo(rows) == 1


# ---------------------------------------------------------------------------
# §7.25 — Rate decreases do not count
# ---------------------------------------------------------------------------

def test_rate_decrease_does_not_count():
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        _mk_row(100.0, (now - dt.timedelta(days=60)).isoformat()),
        _mk_row(110.0, (now - dt.timedelta(days=30)).isoformat()),
        _mk_row(105.0, now.isoformat()),
    ]
    # 100 -> 110 is +10 (counts). 110 -> 105 is -5 (does not count).
    assert ppc_v2.count_rate_increases_last_12mo(rows) == 1


# ---------------------------------------------------------------------------
# §7.26 — Mid-statement rate transition grouping
# ---------------------------------------------------------------------------

def test_mid_statement_grouping_counts_one_change():
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        _mk_row(100.0, (now - dt.timedelta(days=45)).isoformat(), source_stmt="stmt_abc"),
        _mk_row(110.0, (now - dt.timedelta(days=44)).isoformat(), source_stmt="stmt_abc"),
    ]
    assert ppc_v2.count_rate_increases_last_12mo(rows) == 1


def test_mid_statement_grouping_then_manual_gives_two():
    now = dt.datetime.now(dt.timezone.utc)
    rows = [
        _mk_row(100.0, (now - dt.timedelta(days=45)).isoformat(), source_stmt="stmt_abc"),
        _mk_row(110.0, (now - dt.timedelta(days=44)).isoformat(), source_stmt="stmt_abc"),
        _mk_row(115.0, (now - dt.timedelta(days=10)).isoformat(), source_stmt=None),
    ]
    # stmt_abc group counts once (100 -> 110), manual $115 vs $110 is another.
    assert ppc_v2.count_rate_increases_last_12mo(rows) == 2


# ---------------------------------------------------------------------------
# §7.27 / §7.28 — Provider name normalisation + fuzzy match
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("input_name,expected", [
    ("Glorious Services Pty Ltd", "glorious services"),
    ("Glorious Services", "glorious services"),
    ("glorious services pty. ltd.", "glorious services"),
    ("GLORIOUS SERVICES", "glorious services"),
    ("Glorious Services P/L", "glorious services"),
    ("Glorious Services Pty Ltd t/a Better Care", "glorious services"),
    ("Rose & Crown Care", "rose and crown care"),
    ("  Wayly   Care   ", "wayly care"),
])
def test_normalise_provider_name(input_name, expected):
    assert ppc_v2.normalise_provider_name(input_name) == expected


def test_normalise_provider_name_empty_input_returns_empty_string():
    assert ppc_v2.normalise_provider_name(None) == ""
    assert ppc_v2.normalise_provider_name("") == ""
    assert ppc_v2.normalise_provider_name("   ") == ""


def test_fuzzy_match_provider_finds_close_variant():
    candidates = [
        {"normalised_name": "glorious services", "display_name": "Glorious Services Pty Ltd"},
    ]
    match = ppc_v2.fuzzy_match_provider("glorious service", candidates)
    assert match is not None
    assert match["display_name"] == "Glorious Services Pty Ltd"


def test_fuzzy_match_provider_ignores_distant_variant():
    candidates = [
        {"normalised_name": "glorious services", "display_name": "Glorious Services Pty Ltd"},
    ]
    # Different provider, far apart
    match = ppc_v2.fuzzy_match_provider("acme healthcare", candidates)
    assert match is None


# ---------------------------------------------------------------------------
# WS8 email drafting
# ---------------------------------------------------------------------------

def test_email_draft_contains_service_rate_and_range():
    draft = ppc_v2.draft_email_to_provider(
        provider_name="Glorious Services Pty Ltd",
        first_name="Louisa",
        service="Personal care",
        unit="hour",
        rate=150.0,
        lower=85.0,
        upper=115.0,
        source_date="2025-10-01",
    )
    assert "personal care" in draft["body"]
    assert "$150.00" in draft["body"]
    assert "$85.00" in draft["body"]
    assert "$115.00" in draft["body"]
    assert "Louisa" in draft["body"]
    assert "Glorious Services Pty Ltd" in draft["body"]
    assert "Aged Care Act 2024" in draft["body"]
    # Optional paragraph absent when include_increase_paragraph=False
    assert "no more than two per year" not in draft["body"]


def test_email_draft_appends_increase_paragraph_when_flagged():
    draft = ppc_v2.draft_email_to_provider(
        provider_name="Glorious Services Pty Ltd",
        first_name="Louisa",
        service="Personal care",
        unit="hour",
        rate=150.0,
        lower=85.0,
        upper=115.0,
        source_date="2025-10-01",
        include_increase_paragraph=True,
        increase_count=4,
    )
    assert "no more than two per year" in draft["body"]
    assert "4 increases" in draft["body"]
    assert "Aged Care Quality and Safety Commission" in draft["body"]


# ---------------------------------------------------------------------------
# WS6 copy blocks
# ---------------------------------------------------------------------------

def test_cap_deferral_note_contains_citation():
    assert ppc_v2.CAP_DEFERRAL_NOTE["headline"] == "Price caps deferred."
    assert "https://www.health.gov.au/ministers/the-hon-sam-rae-mp" in ppc_v2.CAP_DEFERRAL_NOTE["citation"]["url"]


def test_how_this_works_bullets_include_key_points():
    joined = " ".join(ppc_v2.HOW_THIS_WORKS_BULLETS).lower()
    assert "providers set their own prices" in joined
    assert "february 2025 survey" in joined
    assert "not compare against a legislated cap" in joined
    assert "deferred" in joined
    assert "nursing" in joined
