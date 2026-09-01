"""
build_rcp_v1.py

Archetype: Restorative Care Pathway (RCP).
Time-limited 12-week rehabilitation pathway with a separate budget envelope.
Line items reference occupational therapy, physiotherapy, exercise physiology.
Provider: Rehab At Home Services. Participant: Elena Vazquez.

Real-world defects tested:
  * Classification = "RCP" (a distinct pathway from the standard streams)
  * Line sum matches declared services total (no arithmetic gap)
  * All line items are on the Clinical stream (RCP services report as Clinical)
  * Uses "session" unit predominantly
  * Per-line contribution shown (full pensioner NWO shape)
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-05-06", "RCP Physiotherapy", "Baseline mobility assessment",
             "Clinical", 1.0, "session", 350.00, 350.00,
             contribution=0.00, government_paid=350.00),
        Line("2026-05-13", "RCP Occupational Therapy", "Home safety and equipment review",
             "Clinical", 1.5, "hr", 200.00, 300.00,
             contribution=0.00, government_paid=300.00),
        Line("2026-05-20", "RCP Physiotherapy", "Balance and strength session",
             "Clinical", 1.0, "session", 220.00, 220.00,
             contribution=0.00, government_paid=220.00),
        Line("2026-05-27", "RCP Exercise Physiology", "Progressive resistance training",
             "Clinical", 1.0, "session", 185.00, 185.00,
             contribution=0.00, government_paid=185.00),
    ]
    line_sum = sum(li.total for li in lines)  # 1055.00
    a = Archetype(
        filename="RCP_May_2026.pdf",
        provider_name="Rehab At Home Services",
        provider_footer="Rehab At Home Services | ABN 11 223 344 556 | Phone 1300 233 344",
        participant_name="Elena Vazquez",
        participant_id="SAH-611033",
        care_partner="Miguel Vazquez (son)",
        statement_period="1 May 2026 to 31 May 2026",
        period_start_iso="2026-05-01",
        period_end_iso="2026-05-31",
        classification="Restorative Care Pathway (RCP) — Week 4 of 12",
        lines=lines,
        declared_services_total=line_sum,
        declared_participant=0.00,
        declared_government=line_sum,
        care_management_amount=105.50,   # 10.00% exact
        care_management_source_text=(
            "RCP care coordination and case management: $105.50 (10% of pathway services)."
        ),
        monthly_funding=None,
        quarterly_allocation=None,
        closing_balance=6000.00 - line_sum - 105.50,   # RCP has separate 12-week budget
        per_line_contribution_source="per_line",
        pension_status_stated=True,
        pension_status_label="Full age pensioner (No-Worse-Off)",
        extra_notes=[
            "This statement covers services delivered under the Restorative Care "
            "Pathway (RCP), a time-limited 12-week rehabilitation program with a "
            "dedicated budget envelope. RCP budget remaining: $" + f"{6000.00 - line_sum - 105.50:,.2f}.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("restorative-care-pathway", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
