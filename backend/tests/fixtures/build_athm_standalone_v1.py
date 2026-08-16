"""
build_athm_standalone_v1.py

Archetype: AT-HM (Assistive Technology + Home Modifications) standalone.
No personal care, no cleaning — only AT + HM claims.
Provider: MediEquip Solutions. Participant: Frank Hollingsworth.

Real-world defects tested:
  * Every line is on the ATHM stream
  * "ea" unit is used (single grab rail, single shower stool, single ramp)
  * Line sum matches declared services total (no arithmetic gap)
  * No care management fee (AT-HM often has none)
  * per_line_contribution_source is "per_line"
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-04-08", "AT-HM Installation", "Bathroom grab rail (single, wall-mount)",
             "ATHM", 1.0, "ea", 550.00, 550.00,
             contribution=0.00, government_paid=550.00),
        Line("2026-04-15", "AT-HM Assistive Device", "Shower stool with adjustable legs",
             "ATHM", 1.0, "ea", 250.00, 250.00,
             contribution=0.00, government_paid=250.00),
        Line("2026-04-24", "AT-HM Home Modification", "Front entrance ramp — build and install",
             "ATHM", 1.0, "ea", 1000.00, 1000.00,
             contribution=0.00, government_paid=1000.00),
    ]
    line_sum = sum(li.total for li in lines)   # 1800.00
    a = Archetype(
        filename="ATHM_April_2026.pdf",
        provider_name="MediEquip Solutions",
        provider_footer="MediEquip Solutions | ABN 44 998 776 554 | Phone 1300 887 776",
        participant_name="Frank Hollingsworth",
        participant_id="SAH-780245",
        care_partner="Deborah Hollingsworth (wife)",
        statement_period="1 April 2026 to 30 April 2026",
        period_start_iso="2026-04-01",
        period_end_iso="2026-04-30",
        classification="AT-HM approved envelope: $6,500.00 remaining $4,700.00",
        lines=lines,
        declared_services_total=line_sum,
        declared_participant=0.00,
        declared_government=line_sum,
        care_management_amount=0.00,
        care_management_source_text="",
        monthly_funding=None,
        quarterly_allocation=None,
        closing_balance=4700.00,
        per_line_contribution_source="per_line",
        pension_status_stated=True,
        pension_status_label="Part age pensioner",
        extra_notes=[
            "This statement covers claims against the participant's Assistive "
            "Technology & Home Modifications (AT-HM) approved envelope. No "
            "personal care or domestic services were delivered under this "
            "statement.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("at-hm-standalone", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
