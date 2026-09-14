"""
build_hcp_legacy_v1.py

Archetype: HCP Legacy fields (transition).
Statement mixes SAH terminology WITH legacy Home Care Package (HCP) fields
because the participant hasn't yet fully transitioned. Per v5 §Open Item 4:
extract legacy_hcp fields to a separate section, don't merge, don't flag.
Provider: Legacy Home Care Group. Participant: Winifred Ashton.

Real-world defects tested:
  * Statement uses HCP-era terminology ("Package Level 3", "core supports")
  * Line items reference legacy HCP service codes (e.g. "HCP-CBA-01")
  * Line sum matches declared services total
  * `per_line_contribution_source` is "per_line"
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from _builder_lib import Archetype, Line, build_statement_pdf, print_golden

OUTDIR = os.path.dirname(__file__)


def build() -> None:
    lines = [
        Line("2026-05-04", "HCP-CBA-01", "Core supports — personal care",
             "Independence", 2.0, "hr", 78.00, 156.00,
             contribution=15.60, government_paid=140.40),
        Line("2026-05-11", "HCP-DA-02", "Domestic assistance",
             "Everyday living", 3.0, "hr", 68.00, 204.00,
             contribution=20.40, government_paid=183.60),
        Line("2026-05-18", "HCP-NR-01", "Nursing visit",
             "Clinical", 1.0, "visit", 138.00, 138.00,
             contribution=13.80, government_paid=124.20),
    ]
    line_sum = sum(li.total for li in lines)   # 498.00
    a = Archetype(
        filename="HCP_LEGACY_May_2026.pdf",
        provider_name="Legacy Home Care Group",
        provider_footer="Legacy Home Care Group | ABN 77 335 998 224 | Phone 1300 998 224",
        participant_name="Winifred Ashton",
        participant_id="HCP-L3-118844 (SAH-pending)",
        care_partner="George Ashton (husband)",
        statement_period="1 May 2026 to 31 May 2026",
        period_start_iso="2026-05-01",
        period_end_iso="2026-05-31",
        classification="HCP Level 3 (transitioning to SAH Classification 4)",
        lines=lines,
        declared_services_total=line_sum,
        declared_participant=sum(li.contribution for li in lines),
        declared_government=sum(li.government_paid for li in lines),
        care_management_amount=49.80,          # 10.00% exactly
        care_management_source_text=(
            "Package management fee (HCP methodology): $49.80 (10% of core supports)."
        ),
        monthly_funding=3450.00,
        quarterly_allocation=None,
        closing_balance=3450.00 - line_sum - 49.80,
        per_line_contribution_source="per_line",
        pension_status_stated=True,
        pension_status_label="Part age pensioner",
        extra_notes=[
            "Note: this statement still uses Home Care Package (HCP) terminology "
            "and service codes because the participant's Support at Home Program "
            "transition is pending. The classification will move to SAH "
            "Classification 4 in the next billing cycle.",
        ],
    )
    path, golden = build_statement_pdf(OUTDIR, a)
    print_golden("hcp-legacy-transition", golden)


if __name__ == "__main__":
    try:
        build()
    except Exception as e:
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
