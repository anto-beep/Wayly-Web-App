"""
build_terminology_variants_v1.py

Archetype: Provider terminology variants.
Different providers use different terminology for identical services —
"Nursing" instead of "Clinical care", "Cleaning" instead of "Domestic
Assistance", "Community access" instead of "Social Support".
Provider: Willowbrook Community Services. Participant: Ronald Fitzgerald.

Real-world defects tested:
  * Description strings use non-standard terminology
  * Stream classification is correct (LLM must classify by description, not
    just by keyword-match against Wayly's canonical terms)
  * Uses "visit" unit for nursing (real providers do this)
  * Line sum matches declared services total
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-04-06", "Nursing visit", "Wound care and dressing change",
             "Clinical", 1.0, "visit", 138.00, 138.00,
             contribution=13.80, government_paid=124.20),
        Line("2026-04-13", "Cleaning service", "Fortnightly house cleaning",
             "Everyday living", 2.0, "hr", 68.00, 136.00,
             contribution=13.60, government_paid=122.40),
        Line("2026-04-20", "Community access", "Day trip to local RSL",
             "Independence", 2.0, "hr", 70.00, 140.00,
             contribution=14.00, government_paid=126.00),
    ]
    line_sum = sum(li.total for li in lines)   # 414.00
    a = Archetype(
        filename="TERMINOLOGY_April_2026.pdf",
        provider_name="Willowbrook Community Services",
        provider_footer="Willowbrook Community Services | ABN 66 442 887 335 | Phone 1300 442 887",
        participant_name="Ronald Fitzgerald",
        participant_id="SAH-556614",
        care_partner="Margaret Fitzgerald (daughter)",
        statement_period="1 April 2026 to 30 April 2026",
        period_start_iso="2026-04-01",
        period_end_iso="2026-04-30",
        classification=None,
        lines=lines,
        declared_services_total=line_sum,
        declared_participant=sum(li.contribution for li in lines),
        declared_government=sum(li.government_paid for li in lines),
        care_management_amount=41.40,          # 10.00% exactly
        care_management_source_text=(
            "Provider administration and coordination fee: $41.40 (10% of billed services)."
        ),
        monthly_funding=3250.00,
        quarterly_allocation=None,
        closing_balance=3250.00 - line_sum - 41.40,
        per_line_contribution_source="per_line",
        pension_status_stated=True,
        pension_status_label="Part age pensioner",
        extra_notes=[
            "Note: this provider uses category names 'Nursing visit', 'Cleaning "
            "service' and 'Community access' — these correspond to the Support "
            "at Home Program's Clinical, Everyday Living, and Independence "
            "streams respectively.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("terminology-variants", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
