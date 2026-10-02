"""
build_post_oct_2026_v1.py

Archetype: post-1-October-2026 personal care — the PC-RECLASS-1 SEEDED ERROR.
Statement period starts AFTER the 1-Oct-2026 Support at Home transition where
personal care became fully government-funded ($0 participant share). These
personal-care lines still carry an $8.20 participant contribution, so the
Statement Decoder must raise RULE_PC_RECLASS_CONTRIB (the provider has not yet
repriced personal care into Clinical Supports). The boundary is tested by
SERVICE DELIVERY date, not the statement issue date.
Provider: Southern Cross Home Care. Participant: Ivan Kowalski.

Real-world defects tested:
  * personal-care line dated >= 2026-10-01 WITH a participant contribution
    (> $0) → RULE_PC_RECLASS_CONTRIB flagged (new error class)
  * No F1 fabrication — statement is otherwise well-formed
  * Line sum == declared services total (no arithmetic gap)
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-11-04", "Personal Care", "Morning shower and dressing",
             "Independence", 1.0, "hr", 82.00, 82.00,
             contribution=8.20, government_paid=73.80),
        Line("2026-11-11", "Personal Care", "Toileting and mobility support",
             "Independence", 1.0, "hr", 82.00, 82.00,
             contribution=8.20, government_paid=73.80),
        Line("2026-11-18", "Personal Care", "Evening routine assistance",
             "Independence", 1.0, "hr", 82.00, 82.00,
             contribution=8.20, government_paid=73.80),
        Line("2026-11-25", "Personal Care", "Weekend showering support",
             "Independence", 1.0, "hr", 88.00, 88.00,    # weekend rate
             contribution=8.80, government_paid=79.20),
    ]
    line_sum = sum(li.total for li in lines)  # 334.00
    a = Archetype(
        filename="POST_OCT_2026_November_2026.pdf",
        provider_name="Southern Cross Home Care",
        provider_footer="Southern Cross Home Care | ABN 33 887 665 442 | Phone 1300 456 789",
        participant_name="Ivan Kowalski",
        participant_id="SAH-455788",
        care_partner=None,
        statement_period="1 November 2026 to 30 November 2026",
        period_start_iso="2026-11-01",
        period_end_iso="2026-11-30",
        classification=None,
        lines=lines,
        declared_services_total=line_sum,
        declared_participant=sum(li.contribution for li in lines),
        declared_government=sum(li.government_paid for li in lines),
        care_management_amount=33.40,           # 10.00% of 334
        care_management_source_text=(
            "Care management fee (November): $33.40 (10% of services delivered)."
        ),
        monthly_funding=3400.00,
        quarterly_allocation=None,
        closing_balance=3400.00 - line_sum - 33.40,
        per_line_contribution_source="per_line",
        pension_status_stated=True,
        pension_status_label="Part age pensioner",
        extra_notes=[
            "Rates on this statement reflect the post-1-October-2026 personal-care "
            "schedule as gazetted by the Department of Health and Aged Care.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("post-oct-2026-personal-care", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
