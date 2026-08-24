"""
build_adjustments_v1.py

Archetype: Previous-period adjustments — credit line for prior overcharge.
Provider corrects a prior-period billing error via a negative adjustment.
Provider: Coastal Care Alliance. Participant: Colin Whitmore.

Real-world defects tested:
  * Adjustment line CANNOT be extracted as a service — it belongs in a
    top-level `previous_period_adjustments` block
  * Line sum + adjustment != declared services total (adjustment is separate)
  * per_line_contribution_source is "per_line"
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-04-05", "Personal Care", "Morning showering",
             "Independence", 1.0, "hr", 78.00, 78.00,
             contribution=7.80, government_paid=70.20),
        Line("2026-04-12", "Domestic Assistance", "Cleaning and laundry",
             "Everyday living", 2.0, "hr", 68.00, 136.00,
             contribution=13.60, government_paid=122.40),
        Line("2026-04-19", "Meal Preparation", "Weekly meal prep",
             "Everyday living", 0.5, "hr", 72.00, 36.00,
             contribution=3.60, government_paid=32.40),
    ]
    line_sum = sum(li.total for li in lines)   # 250.00
    a = Archetype(
        filename="ADJUSTMENTS_April_2026.pdf",
        provider_name="Coastal Care Alliance",
        provider_footer="Coastal Care Alliance | ABN 88 771 664 552 | Phone 1300 771 664",
        participant_name="Colin Whitmore",
        participant_id="SAH-100889",
        care_partner="Patricia Whitmore (wife)",
        statement_period="1 April 2026 to 30 April 2026",
        period_start_iso="2026-04-01",
        period_end_iso="2026-04-30",
        classification=None,
        lines=lines,
        declared_services_total=line_sum,      # this month's services only
        declared_participant=25.00,
        declared_government=225.00,
        care_management_amount=25.00,          # 10% exactly
        care_management_source_text=(
            "Care management fee (April): $25.00 (10% of services delivered)."
        ),
        monthly_funding=3250.00,
        quarterly_allocation=None,
        closing_balance=3250.00 - line_sum - 25.00 + 15.60,  # adjustment credit
        per_line_contribution_source="per_line",
        pension_status_stated=True,
        pension_status_label="Part age pensioner",
        extra_notes=[
            "**Previous-period adjustments:** Credit of $15.60 applied for a "
            "billing correction on 15 March 2026 (a duplicate transport charge "
            "was refunded to the participant's account this period).",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("previous-period-adjustments", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
