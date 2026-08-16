"""
build_nwo_v1.py

Archetype: No-Worse-Off (full pensioner).
Full age pensioner under the NWO policy pays $0 per-line; government funds 100%.
Provider: Sunrise At-Home Care Group. Participant: Beryl Patterson.

Real-world defects tested:
  * per_line_contribution_source is "per_line" (columns explicitly shown)
  * Every line has participant_contribution=0.00 and government_paid=gross
  * Pension status IS stated ("Full age pensioner") — pension INFO must not fire
  * Line sum == declared services total (no arithmetic gap)
  * Care management is charged at exactly 10.00% (silent — within ±0.5% band)
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-04-05", "Personal Care", "Morning shower assistance",
             "Independence", 1.0, "hr", 78.00, 78.00,
             contribution=0.00, government_paid=78.00),
        Line("2026-04-09", "Domestic Assistance", "Weekly clean and laundry",
             "Everyday living", 2.0, "hr", 68.00, 136.00,
             contribution=0.00, government_paid=136.00),
        Line("2026-04-12", "Nursing", "Wound dressing change",
             "Clinical", 1.0, "visit", 138.00, 138.00,
             contribution=0.00, government_paid=138.00),
        Line("2026-04-16", "Personal Care", "Evening care routine",
             "Independence", 1.0, "hr", 78.00, 78.00,
             contribution=0.00, government_paid=78.00),
        Line("2026-04-23", "Domestic Assistance", "Fortnightly clean",
             "Everyday living", 2.0, "hr", 68.00, 136.00,
             contribution=0.00, government_paid=136.00),
        Line("2026-04-30", "Nursing", "Medication review and wound check",
             "Clinical", 1.0, "visit", 138.00, 138.00,
             contribution=0.00, government_paid=138.00),
    ]
    line_sum = sum(li.total for li in lines)   # 704.00
    a = Archetype(
        filename="NWO_April_2026.pdf",
        provider_name="Sunrise At-Home Care Group",
        provider_footer="Sunrise At-Home Care Group | ABN 55 668 811 224 | Phone 1300 777 999",
        participant_name="Beryl Patterson",
        participant_id="SAH-300112",
        care_partner="Michael Patterson (son)",
        statement_period="1 April 2026 to 30 April 2026",
        period_start_iso="2026-04-01",
        period_end_iso="2026-04-30",
        classification=None,
        lines=lines,
        declared_services_total=line_sum,
        declared_participant=0.00,
        declared_government=line_sum,
        care_management_amount=70.40,          # exactly 10.00% of 704.00
        care_management_source_text=(
            "Care management and administration fee (10% of services): $70.40."
        ),
        monthly_funding=3250.00,
        quarterly_allocation=None,
        closing_balance=3250.00 - line_sum - 70.40,
        per_line_contribution_source="per_line",
        pension_status_stated=True,
        pension_status_label="Full age pensioner (No-Worse-Off arrangement)",
        extra_notes=[
            "This participant is covered by the No-Worse-Off policy. Participant "
            "contribution is $0.00 for all services; Government funds 100% of "
            "delivered care.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("nwo-full-pensioner", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
