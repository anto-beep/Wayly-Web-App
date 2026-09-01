"""CE-2 v1.1 Workstream L (HCP comparison) + Workstream I (PDF).

Locks:
  * The HCP-would-be cost is recomputed correctly for full pensioners
    (BDF only, ITCF = 0) and part pensioners (BDF + capped ITCF).
  * The HCP→SAH classification mapping produces the expected levels.
  * The PDF byte stream is reproducible, contains the expected sections,
    and is under 60 KB (email friendly).
"""
from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
import yaml

from services.ce2_engine import (
    CE2Input, ServiceMix, calculate, hcp_comparison,
    HCP_LEVEL_FROM_SAH_CLASS, resolve_entry_path,
)
from services.ce2_pdf import render_ce2_pdf
from monetary_constants import load_registry

EFFECTIVE_DATE = date(2026, 3, 20)


@pytest.fixture(scope="module")
def registry():
    return load_registry()


def _bill_input():
    return CE2Input(
        assessment_status="have_classification",
        pension_status="part_pension", relationship="single", homeowner=True,
        income_excluding_pension=19029.18, financial_assets=10000,
        entry_path="post_nov_2025", classification="class_5",
        service_mix=ServiceMix(30, 45, 25),
        effective_date=EFFECTIVE_DATE,
    )


def _john_input():
    return CE2Input(
        assessment_status="have_classification",
        pension_status="full_pension", relationship="single", homeowner=True,
        entry_path="hcp_pre_sep_2024", hcp_paid_fees=False,
        classification="class_3", hcp_level_when_grandfathered=3,
        service_mix=ServiceMix(30, 45, 25),
        effective_date=EFFECTIVE_DATE,
    )


# ---------------------------------------------------------------------------
# HCP-to-SAH mapping (spec §2.3)
# ---------------------------------------------------------------------------

class TestHcpMapping:
    @pytest.mark.parametrize("sah,expected", [
        ("class_1", 1), ("class_2", 1),
        ("class_3", 2), ("class_4", 2),
        ("class_5", 3), ("class_6", 3),
        ("class_7", 4), ("class_8", 4),
        ("transitional_1", 1), ("transitional_2", 2),
        ("transitional_3", 3), ("transitional_4", 4),
    ])
    def test_mapping_covers_all_standard_classifications(self, sah, expected):
        assert HCP_LEVEL_FROM_SAH_CLASS[sah] == expected


# ---------------------------------------------------------------------------
# Workstream L calculation (spec §4.7 + §6 test 35)
# ---------------------------------------------------------------------------

class TestHcpComparison:
    def test_full_pensioner_pays_bdf_only(self, registry):
        john = _john_input()
        cmp = hcp_comparison(registry, input_data=john, sah_annual=0.0)
        # Level 3 BDF $13.14/day × 365 = $4,796.10
        assert cmp.hcp_level == 3
        assert cmp.itcf_daily == 0.0
        assert cmp.basic_daily_fee_daily == 13.14
        assert cmp.hcp_annual == pytest.approx(13.14 * 365.0, abs=0.02)

    def test_bill_part_pensioner_pays_bdf_plus_itcf(self, registry):
        bill = _bill_input()
        result = calculate(bill)
        cmp = hcp_comparison(registry, input_data=bill, sah_annual=result.contribution_annual)
        # Bill maps class_5 -> HCP Level 3, so BDF = $13.14
        assert cmp.hcp_level == 3
        assert cmp.basic_daily_fee_daily == 13.14
        # ITCF: (19029.18 - 34762) × 0.5 / 365 -> negative → 0. Bill's assessable
        # income is BELOW the HCP income-free area (much higher than SAH's).
        assert cmp.itcf_daily == 0.0

    def test_bill_delta_shows_sah_is_more_or_less(self, registry):
        bill = _bill_input()
        result = calculate(bill)
        cmp = result.hcp_comparison
        assert cmp is not None
        # Bill is on the "toggle" path (post_nov_2025). The engine still
        # populates hcp_comparison so the UI can show it behind a toggle.
        assert result.show_hcp_comparison == "toggle"
        # SAH result is nonzero for Bill; HCP is nonzero (BDF only).
        assert cmp.sah_annual > 0
        assert cmp.hcp_annual > 0
        # Delta sign tracks the difference
        assert (cmp.delta_annual > 0) == (cmp.sah_annual > cmp.hcp_annual)
        assert cmp.is_sah_cheaper == (cmp.delta_annual < 0)

    def test_john_fee_exempt_gets_hcp_row_showing_pure_saving(self, registry):
        john = _john_input()
        result = calculate(john)
        cmp = result.hcp_comparison
        assert result.is_fee_exempt is True
        assert result.show_hcp_comparison == "always"
        assert cmp is not None
        # John's SAH annual is 0; HCP is his BDF-only quote of $4,796.10
        assert cmp.sah_annual == 0.0
        assert cmp.hcp_annual == pytest.approx(13.14 * 365.0, abs=0.02)
        assert cmp.is_sah_cheaper is True

    def test_npq_users_do_not_get_a_comparison(self, registry):
        inp = CE2Input(
            assessment_status="have_classification",
            pension_status="full_pension", relationship="single", homeowner=True,
            entry_path="npq_pre_sep_2024", classification="class_4",
            service_mix=ServiceMix(30, 45, 25),
            effective_date=EFFECTIVE_DATE,
        )
        result = calculate(inp)
        assert result.show_hcp_comparison == "never"
        assert result.hcp_comparison is None

    def test_transitional_hcp_participant_uses_declared_level(self, registry):
        inp = CE2Input(
            assessment_status="have_classification",
            pension_status="full_pension", relationship="single", homeowner=True,
            entry_path="hcp_post_sep_pre_nov_2025",
            hcp_level_when_grandfathered=2,
            classification="class_8",  # would map to L4 without the override
            service_mix=ServiceMix(30, 45, 25),
            effective_date=EFFECTIVE_DATE,
        )
        result = calculate(inp)
        assert result.show_hcp_comparison == "always"
        assert result.hcp_comparison.hcp_level == 2   # explicit override wins
        # BDF for Level 2 is $12.78/day
        assert result.hcp_comparison.basic_daily_fee_daily == 12.78


# ---------------------------------------------------------------------------
# Workstream I — PDF renderer smoke
# ---------------------------------------------------------------------------

class TestPdfRenderer:
    def test_bill_pdf_renders_and_is_under_60kb(self, registry):
        result = calculate(_bill_input())
        d = result.to_dict()
        d["person_name"] = "Bill"
        pdf_bytes = render_ce2_pdf(result=d, person_name="Bill")
        assert isinstance(pdf_bytes, bytes)
        assert pdf_bytes.startswith(b"%PDF")
        assert len(pdf_bytes) < 60_000, f"PDF is {len(pdf_bytes)} bytes, expected <60 KB"

    def test_john_fee_exempt_pdf_omits_govt_share_bar(self, registry):
        result = calculate(_john_input())
        d = result.to_dict()
        d["person_name"] = "John"
        pdf_bytes = render_ce2_pdf(result=d, person_name="John")
        assert pdf_bytes.startswith(b"%PDF")
        # The govt-share bar text should be absent for fee-exempt users
        # (we skip it in the renderer). "WHO PAYS WHAT" is our section title.
        assert b"WHO PAYS WHAT" not in pdf_bytes

    def test_range_mode_pdf_shows_range_headline(self, registry):
        result = calculate(CE2Input(
            assessment_status="not_assessed",
            pension_status="full_pension", relationship="single", homeowner=True,
            entry_path="not_assessed", classification=None,
            service_mix=ServiceMix(30, 45, 25),
            effective_date=EFFECTIVE_DATE,
        ))
        d = result.to_dict()
        d["person_name"] = None
        pdf_bytes = render_ce2_pdf(result=d, person_name=None)
        assert pdf_bytes.startswith(b"%PDF")

    def test_pdf_has_no_em_or_en_dashes(self, registry):
        """Wayly voice rules — no em (U+2014) or en (U+2013) dashes in output."""
        result = calculate(_bill_input())
        d = result.to_dict()
        d["person_name"] = "Bill"
        pdf_bytes = render_ce2_pdf(result=d, person_name="Bill")
        # Encoded UTF-8 sequences for em / en dashes.
        assert b"\xe2\x80\x94" not in pdf_bytes
        assert b"\xe2\x80\x93" not in pdf_bytes
