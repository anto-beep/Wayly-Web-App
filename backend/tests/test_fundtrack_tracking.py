"""FUNDTRACK-1 · tracking + capture-layer unit tests (Decimal-exact)."""
from __future__ import annotations

from datetime import date
from decimal import Decimal

from lib.fundtrack import tracking as T


def test_normalise_stream_aliases():
    assert T.normalise_stream("Clinical Supports") == "Clinical"
    assert T.normalise_stream("clinical care") == "Clinical"
    assert T.normalise_stream("EverydayLiving") == "Everyday Living"
    assert T.normalise_stream(None) == "Everyday Living"
    assert T.normalise_stream("Independence") == "Independence"


def test_participant_share_floor_rates():
    # Clinical supports are always $0 to the participant.
    assert T.participant_share(500, "Clinical") == 0.0
    # Independence floor 5%.
    assert T.participant_share(100, "Independence") == 5.0
    # Everyday Living floor 17.5%.
    assert T.participant_share(200, "Everyday Living") == 35.0
    # Unpriced-equivalent / zero.
    assert T.participant_share(0, "Everyday Living") == 0.0


def test_visit_dates_once_and_weekly():
    once = T.visit_dates(date(2026, 11, 25), "once", None, date(2026, 12, 31))
    assert once == [date(2026, 11, 25)]
    weekly = T.visit_dates(date(2026, 11, 25), "weekly", date(2026, 12, 16), date(2026, 12, 31))
    assert weekly == [date(2026, 11, 25), date(2026, 12, 2), date(2026, 12, 9), date(2026, 12, 16)]


def test_compute_what_if_within_quarter():
    r = T.compute_what_if(
        current_F=Decimal("2304.24"), current_H=Decimal("2304.24"),
        unit_price=Decimal("75.5"), stream="Everyday Living",
        start=date(2026, 11, 25), frequency="weekly", until=date(2026, 12, 30),
        q_start=date(2026, 10, 1), q_end=date(2026, 12, 31),
    )
    assert r["visits"] == 6
    assert r["visits_this_quarter"] == 6
    assert r["visits_next_quarter"] == 0
    assert r["total_budget_impact_aud"] == 453.0
    # revised spare = H - this-quarter cost.
    assert r["revised_spare_aud"] == 1851.24
    assert r["revised_spare_is_negative"] is False
    assert r["quarter_boundary_crossed"] is False
    # Everyday Living floor share 17.5% of 453.
    assert r["participant_share_aud"] == 79.28


def test_compute_what_if_crosses_quarter_boundary():
    r = T.compute_what_if(
        current_F=Decimal("500"), current_H=Decimal("500"),
        unit_price=Decimal("100"), stream="Independence",
        start=date(2026, 12, 20), frequency="weekly", until=date(2027, 1, 24),
        q_start=date(2026, 10, 1), q_end=date(2026, 12, 31),
    )
    assert r["quarter_boundary_crossed"] is True
    assert r["next_quarter_unconfirmed"] is True
    assert r["visits_this_quarter"] == 2       # 20 Dec, 27 Dec
    assert r["visits_next_quarter"] == 4        # Jan 3,10,17,24
    # revised H only reflects this quarter's 2 visits.
    assert r["revised_spare_aud"] == 300.0


def test_compute_what_if_can_go_negative():
    r = T.compute_what_if(
        current_F=Decimal("100"), current_H=Decimal("100"),
        unit_price=Decimal("150"), stream="Independence",
        start=date(2026, 11, 25), frequency="once", until=None,
        q_start=date(2026, 10, 1), q_end=date(2026, 12, 31),
    )
    assert r["revised_spare_aud"] == -50.0
    assert r["revised_spare_is_negative"] is True


def _ladder(status, forfeit=0.0, shortfall=0.0):
    return {"status": status, "projection": {"forfeit_aud": forfeit, "shortfall_aud": shortfall}}


def test_build_alerts_underspend_forfeit():
    alerts = T.build_alerts(
        ladder=_ladder("underspend_risk", forfeit=8514.0),
        tracking={"anchor_age_days": 10, "missed_in_statement": []},
        today=date(2026, 11, 22), q_end=date(2026, 12, 31),
    )
    kinds = [a["kind"] for a in alerts]
    assert "forfeit_risk" in kinds
    forfeit = next(a for a in alerts if a["kind"] == "forfeit_risk")
    assert "$8,514" in forfeit["body"]
    assert "31 December 2026" in forfeit["body"]


def test_build_alerts_overspend_shortfall():
    alerts = T.build_alerts(
        ladder=_ladder("overspend_risk", shortfall=390.0),
        tracking={"anchor_age_days": 10, "missed_in_statement": []},
        today=date(2026, 11, 22), q_end=date(2026, 12, 31),
    )
    shortfall = next(a for a in alerts if a["kind"] == "shortfall_risk")
    assert "$390" in shortfall["body"]
    assert "service agreement" in shortfall["body"]


def test_build_alerts_statement_overdue_when_stale_or_missing():
    # No statement anchoring the figures → overdue nudge.
    alerts = T.build_alerts(
        ladder=_ladder("on_track"),
        tracking={"anchor_age_days": None, "missed_in_statement": []},
        today=date(2026, 11, 22), q_end=date(2026, 12, 31),
    )
    overdue = next(a for a in alerts if a["kind"] == "statement_overdue")
    assert "October statement" in overdue["body"]
    # Fresh statement (within one cycle) → no overdue nudge.
    alerts2 = T.build_alerts(
        ladder=_ladder("on_track"),
        tracking={"anchor_age_days": 10, "missed_in_statement": []},
        today=date(2026, 11, 22), q_end=date(2026, 12, 31),
    )
    assert "statement_overdue" not in [a["kind"] for a in alerts2]


def test_build_alerts_possible_billing_difference():
    alerts = T.build_alerts(
        ladder=_ladder("on_track"),
        tracking={"anchor_age_days": 10, "missed_in_statement": [{"id": "x1"}]},
        today=date(2026, 11, 22), q_end=date(2026, 12, 31),
    )
    diff = next(a for a in alerts if a["kind"] == "possible_billing_difference")
    assert "marked this visit as missed" in diff["body"]
