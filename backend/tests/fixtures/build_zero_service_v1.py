"""
build_zero_service_v1.py

Archetype: zero-service month.
Participant billed no services this month. Care management fee still charged.
Provider: Kindred Care Pty Ltd. Participant: Bruce Anderson.

Real-world defects tested:
  * Line sum == declared services total == $0.00 (no arithmetic gap)
  * Care management fee is charged despite zero services (some providers do this)
  * per_line_contribution_source stays "unknown" (nothing to itemise)
  * RULE_25 must not false-positive on 0-vs-0
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    a = Archetype(
        filename="ZERO_SERVICE_April_2026.pdf",
        provider_name="Kindred Care Pty Ltd",
        provider_footer="Kindred Care Pty Ltd | ABN 12 345 678 901 | Phone 1300 111 222",
        participant_name="Bruce Anderson",
        participant_id="SAH-200456",
        care_partner="Helen Anderson (wife)",
        statement_period="1 April 2026 to 30 April 2026",
        period_start_iso="2026-04-01",
        period_end_iso="2026-04-30",
        classification=None,
        lines=[],
        declared_services_total=0.00,
        declared_participant=0.00,
        declared_government=0.00,
        care_management_amount=142.50,
        care_management_source_text=(
            "Care management fee for the period (participant retained but "
            "no service delivery occurred): $142.50."
        ),
        monthly_funding=3250.00,
        quarterly_allocation=None,
        closing_balance=3107.50,
        per_line_contribution_source="unknown",
        pension_status_stated=False,
        pension_status_label=None,
        extra_notes=[
            "No care visits were delivered this month due to a family holiday. "
            "Government funding remained accessible and is available for use next month.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("zero-service", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
