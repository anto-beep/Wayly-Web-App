"""
build_interim_funding_v1.py

Archetype: Interim (bridge) funding line during HCP → SAH transition.
Participant received a bridge allowance while their SAH classification
was pending. Statement carries a distinct interim-funding line.
Provider: Rainbow Home Care. Participant: Yvonne Chen.

Real-world defects tested:
  * A single interim-funding line (unit="ea", lump-sum)
  * per_line_contribution_source is "aggregate_only" (source shows totals only)
  * Line sum matches declared services total
  * Provider note explicitly mentions HCP → SAH transition
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-04-15", "Interim funding", "HCP → SAH transition bridge allowance",
             "Independence", 1.0, "ea", 500.00, 500.00),
    ]
    line_sum = sum(li.total for li in lines)   # 500.00
    a = Archetype(
        filename="INTERIM_FUNDING_April_2026.pdf",
        provider_name="Rainbow Home Care",
        provider_footer="Rainbow Home Care | ABN 22 445 668 811 | Phone 1300 665 998",
        participant_name="Yvonne Chen",
        participant_id="SAH-908712",
        care_partner="Wei Chen (son)",
        statement_period="1 April 2026 to 30 April 2026",
        period_start_iso="2026-04-01",
        period_end_iso="2026-04-30",
        classification="Pending assessment — interim bridging",
        lines=lines,
        declared_services_total=line_sum,
        declared_participant=50.00,           # 10% aggregate
        declared_government=450.00,
        care_management_amount=0.00,
        care_management_source_text="",
        monthly_funding=None,
        quarterly_allocation=None,
        closing_balance=0.00,
        per_line_contribution_source="aggregate_only",
        pension_status_stated=False,
        pension_status_label=None,
        extra_notes=[
            "This is a one-time bridging allowance paid during the participant's "
            "transition from Home Care Package (HCP) Level 3 to the Support at "
            "Home Program. A full SAH statement will follow once classification "
            "is finalised by My Aged Care.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("interim-funding", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
