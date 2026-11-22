"""
Shared archetype-builder helpers.

Every archetype builder mirrors build_margaret_v1.py's pattern:
  * Line class with schema invariants (qty * unit_rate == total, unit in enum).
  * q() rounding helper.
  * money() display helper.
  * build_statement_pdf() with header / summary / service table / footer.
  * Prints golden values on completion so a test-file mirror is up to date.

Each archetype adds its own quirks (zero services, NWO shape, RCP flavour,
AT-HM only, interim funding, adjustments, terminology variants,
post-Oct-2026 personal care) but every builder ends with a byte-identical
PDF at /app/backend/tests/fixtures/{FILENAME}.pdf.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, Tuple

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

TEAL = colors.HexColor("#0E4D52")
SAGE = colors.HexColor("#6B8F71")
CREAM = colors.HexColor("#F5F0E8")
UNIT_VOCAB = ("hr", "km", "session", "ea", "visit", "day")

_styles = getSampleStyleSheet()


def _mk(name: str, parent: str, **kw) -> ParagraphStyle:
    return ParagraphStyle(name, parent=_styles[parent], **kw)


H1 = _mk("h1", "Heading1", fontSize=16, spaceAfter=8, textColor=TEAL)
H2 = _mk("h2", "Heading2", fontSize=12, spaceAfter=6, textColor=TEAL)
BODY = _styles["Normal"]
SMALL = _mk("small", "Normal", fontSize=8, leading=11, textColor=colors.grey)


def q(x) -> float:
    """Round to 2dp with banker-neutral half-up (matches Australian invoicing)."""
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def money(x) -> str:
    return f"${x:,.2f}"


@dataclass
class Line:
    """One statement line. Enforces the schema invariants at build time."""
    date: str
    service: str
    description: str
    category: str
    quantity: float
    unit: str
    unit_rate: float
    total: float
    contribution: Optional[float] = None
    government_paid: Optional[float] = None

    def __post_init__(self) -> None:
        assert self.date and self.date != "1970-01-01", f"invalid date {self.date!r}"
        assert self.unit in UNIT_VOCAB, (
            f"unknown unit {self.unit!r} on {self.description!r}"
        )
        computed = q(self.quantity * self.unit_rate)
        assert computed == q(self.total), (
            f"line arithmetic fail: {self.service} on {self.date}: "
            f"{self.quantity} {self.unit} * {self.unit_rate} = {money(computed)}, "
            f"declared {money(self.total)}"
        )
        self.total = q(self.total)


@dataclass
class Archetype:
    """Complete archetype definition. Passed to build_statement_pdf()."""
    filename: str                        # output filename (no path)
    provider_name: str
    provider_footer: str                 # what the footer literally prints
    participant_name: str
    participant_id: str
    care_partner: Optional[str]
    statement_period: str                # human-readable
    period_start_iso: str                # "YYYY-MM-DD"
    period_end_iso: str
    classification: Optional[str]        # e.g. "RCP", "AT-HM", or None
    lines: List[Line]
    declared_services_total: float
    declared_participant: float
    declared_government: float
    care_management_amount: float
    care_management_source_text: str     # verbatim source string
    monthly_funding: Optional[float]     # None if quarterly
    quarterly_allocation: Optional[float]
    closing_balance: float
    per_line_contribution_source: str    # "aggregate_only" / "per_line" / ...
    pension_status_stated: bool
    pension_status_label: Optional[str]  # only if stated
    extra_notes: List[str] = field(default_factory=list)
    # Real-world defects — spec §Additional archetype fixtures
    intentional_arithmetic_gap: bool = False    # declared != sum(lines)
    contains_gst_mention: bool = False           # anti-fab test flag


def build_statement_pdf(
    outdir: str,
    a: Archetype,
) -> Tuple[str, dict]:
    """Build a PDF fixture on disk. Returns (path, golden_values_dict)."""
    import os
    os.makedirs(outdir, exist_ok=True)
    path = f"{outdir}/{a.filename}"
    story = [
        Paragraph(a.provider_name, H1),
        Paragraph("Support at Home — Monthly Statement", H2),
        Spacer(1, 6),
    ]
    header_rows = [
        ["Participant:", a.participant_name],
        ["Participant ID:", a.participant_id],
        ["Statement period:", a.statement_period],
    ]
    if a.care_partner:
        header_rows.append(["Care partner:", a.care_partner])
    if a.classification:
        header_rows.append(["Classification:", a.classification])
    if a.pension_status_stated and a.pension_status_label:
        header_rows.append(["Pension status:", a.pension_status_label])
    story.append(Table(header_rows, colWidths=[4 * cm, 12 * cm]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Account Summary", H2))
    summary_rows: List[List[str]] = [["Opening balance", money(0.00)]]
    if a.monthly_funding is not None:
        summary_rows.append(["Government funding available this month",
                             money(a.monthly_funding)])
    if a.quarterly_allocation is not None:
        summary_rows.append(["Quarterly allocation", money(a.quarterly_allocation)])
    summary_rows += [
        ["Total value of services delivered", money(a.declared_services_total)],
        ["Participant contributions", money(a.declared_participant)],
        ["Government contribution applied", money(a.declared_government)],
        ["Unspent budget remaining", money(a.closing_balance)],
    ]
    story.append(Table(summary_rows, colWidths=[10 * cm, 4 * cm]))
    story.append(Spacer(1, 12))

    if not a.lines:
        story.append(Paragraph("Services Delivered", H2))
        story.append(Paragraph(
            "No individual services were delivered during this statement period.",
            BODY,
        ))
    else:
        story.append(Paragraph("Services Delivered", H2))
        # Include per-line contribution columns ONLY when the source itemises them.
        show_contrib_cols = a.per_line_contribution_source == "per_line"
        if show_contrib_cols:
            hdr = ["Date", "Service", "Description", "Qty", "Unit rate",
                   "Amount", "You paid", "Gov paid"]
            col_widths = [1.5 * cm, 3 * cm, 4 * cm, 1.5 * cm, 2 * cm,
                          1.8 * cm, 1.5 * cm, 1.5 * cm]
        else:
            hdr = ["Date", "Service", "Description", "Qty", "Unit rate", "Amount"]
            col_widths = [1.5 * cm, 3.5 * cm, 5 * cm, 2 * cm, 2.5 * cm, 2 * cm]
        rows: List[List] = [hdr]
        for li in a.lines:
            qty_display = f"{li.quantity:g} {li.unit}"
            rate_display = money(li.unit_rate)
            if li.unit != "hr":
                rate_display += f"/{li.unit}"
            row = [li.date, li.service, li.description, qty_display,
                   rate_display, money(li.total)]
            if show_contrib_cols:
                row.append(money(li.contribution or 0.0))
                row.append(money(li.government_paid or 0.0))
            rows.append(row)
        # Subtotal row — MAY or may not match line sum, depending on archetype
        subtotal_row = ["", "Total services this month", "", "", "",
                        money(a.declared_services_total)]
        if show_contrib_cols:
            subtotal_row += [money(a.declared_participant), money(a.declared_government)]
        rows.append(subtotal_row)
        t = Table(rows, colWidths=col_widths)
        style_cmds = [
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
            ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
            ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
            ("BACKGROUND", (0, -1), (-1, -1), CREAM),
            ("SPAN", (1, -1), (4 if not show_contrib_cols else 4, -1)),
        ]
        t.setStyle(TableStyle(style_cmds))
        story.append(t)

    if a.care_management_amount > 0:
        story.append(Spacer(1, 12))
        story.append(Paragraph("Care Management and Administration", H2))
        story.append(Paragraph(a.care_management_source_text, BODY))

    for note in a.extra_notes:
        story.append(Spacer(1, 8))
        story.append(Paragraph(note, BODY))

    story.append(Spacer(1, 18))
    story.append(Paragraph(a.provider_footer, SMALL))
    # DEC-1 v5 realism: every compliant SAH statement includes an Aged Care
    # Act reference in the footer. Without this, RULE_29_MISSING_ACT_DISCLOSURE
    # would fire on every fixture (accurate — that's the missing signal).
    story.append(Paragraph(
        "This statement has been prepared in accordance with the Aged Care Act 2024 "
        "and the Support at Home Program Manual.",
        SMALL,
    ))

    SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
    ).build(story)

    golden = {
        "filename": a.filename,
        "path": path,
        "period_start": a.period_start_iso,
        "period_end": a.period_end_iso,
        "provider": a.provider_name,
        "participant": a.participant_name,
        "line_count": len(a.lines),
        "line_sum": q(sum(li.total for li in a.lines)),
        "declared_services_total": a.declared_services_total,
        "arithmetic_gap": q(a.declared_services_total - q(sum(li.total for li in a.lines))),
        "care_mgmt": a.care_management_amount,
        "per_line_contribution_source": a.per_line_contribution_source,
        "pension_stated": a.pension_status_stated,
        "classification": a.classification,
        "contains_gst_mention": a.contains_gst_mention,
        "units_used": sorted({li.unit for li in a.lines}) if a.lines else [],
    }
    return path, golden


def print_golden(name: str, golden: dict) -> None:
    print(f"[BUILT] {name}")
    print(f"  path              : {golden['path']}")
    print(f"  period            : {golden['period_start']} → {golden['period_end']}")
    print(f"  line count        : {golden['line_count']}")
    print(f"  line sum          : {money(golden['line_sum'])}")
    print(f"  declared services : {money(golden['declared_services_total'])}")
    print(f"  arithmetic gap    : {money(golden['arithmetic_gap'])}")
    print(f"  care mgmt amount  : {money(golden['care_mgmt'])}")
    print(f"  contrib source    : {golden['per_line_contribution_source']}")
    print(f"  pension stated    : {golden['pension_stated']}")
    print(f"  classification    : {golden['classification']}")
    print(f"  units used        : {golden['units_used']}")
