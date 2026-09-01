"""Budget & Lifetime Cap Calculator · A4 PDF renderer.

Server-side reportlab renderer for the Budget Calculator result payload
returned by ``POST /api/public/budget-calc``. Uses the shared Wayly brand
so it matches every other tool export.
"""
from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from services.wayly_pdf_branding import (
    WAYLY_BORDER, WAYLY_CREAM, WAYLY_INK, WAYLY_MUTED, WAYLY_SAGE, WAYLY_TEAL,
    wayly_footer, wayly_header,
)


def _money(v: Any) -> str:
    try:
        return f"${float(v or 0):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def _styles() -> Dict[str, ParagraphStyle]:
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=10,
                          leading=13, textColor=WAYLY_INK)
    return {
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold",
                             fontSize=13, leading=16, textColor=WAYLY_TEAL,
                             spaceBefore=12, spaceAfter=6),
        "label": ParagraphStyle("label", parent=base, fontName="Helvetica-Bold",
                                fontSize=8, leading=11, textColor=WAYLY_MUTED,
                                spaceAfter=2),
        "kpi": ParagraphStyle("kpi", parent=base, fontName="Helvetica-Bold",
                              fontSize=15, leading=18, textColor=WAYLY_TEAL),
        "body": ParagraphStyle("body", parent=base, spaceAfter=4),
        "muted": ParagraphStyle("muted", parent=base, textColor=WAYLY_MUTED,
                                fontSize=9, leading=12),
        "cell": ParagraphStyle("cell", parent=base, fontSize=10, leading=13),
        "cell_r": ParagraphStyle("cell_r", parent=base, fontSize=10,
                                 leading=13, alignment=2),
    }


def _kpi_grid(items: List[tuple], styles) -> Table:
    cells = [[
        [Paragraph(label.upper(), styles["label"]), Paragraph(value, styles["kpi"])]
        for label, value in items
    ]]
    tbl = Table(cells, colWidths=[4.25 * cm] * len(items))
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), WAYLY_CREAM),
        ("BOX", (0, 0), (-1, -1), 0.5, WAYLY_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.white),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return tbl


def render_budget_pdf(*, result: Dict[str, Any],
                      person_name: Optional[str] = None) -> bytes:
    styles = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Budget & Lifetime Cap", author="Wayly",
    )
    story: list = []
    subtitle = result.get("classification_label") or "Support at Home budget"
    if person_name:
        subtitle = f"{person_name} · {subtitle}"
    story.extend(wayly_header(
        tool_title="Budget & Lifetime Cap",
        subtitle=subtitle,
    ))

    # KPI tiles
    story.append(Paragraph("Your budget at a glance", styles["h2"]))
    story.append(_kpi_grid([
        ("Annual budget", _money(result.get("annual_total"))),
        ("Usable per quarter", _money(result.get("quarterly_usable"))),
        ("Care mgmt (qtr)", _money(result.get("care_management_quarterly"))),
        ("Rollover floor", _money(result.get("rollover_cap"))),
    ], styles))
    story.append(Spacer(1, 0.3 * cm))

    # Per-stream allocation
    streams = result.get("streams") or []
    if streams:
        story.append(Paragraph("Per-stream allocation", styles["h2"]))
        rows: List[List[Any]] = [[
            Paragraph("Stream", styles["label"]),
            Paragraph("Allocated", styles["label"]),
        ]]
        for s in streams:
            name = str(s.get("stream") or "")
            if s.get("indicative"):
                name += " · indicative"
            rows.append([
                Paragraph(name, styles["cell"]),
                Paragraph(_money(s.get("allocated")), styles["cell_r"]),
            ])
        tbl = Table(rows, colWidths=[11.5 * cm, 4.9 * cm])
        tbl.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 1, WAYLY_TEAL),
            ("LINEBELOW", (0, 1), (-1, -1), 0.25, WAYLY_BORDER),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)
        if result.get("streams_note"):
            story.append(Spacer(1, 0.15 * cm))
            story.append(Paragraph(str(result["streams_note"]), styles["muted"]))
        story.append(Spacer(1, 0.3 * cm))

    # Supplements (optional)
    if result.get("annual_supplements_total"):
        story.append(Paragraph("Supplements", styles["h2"]))
        story.append(Paragraph(
            f"Annual supplements: {_money(result.get('annual_supplements_total'))}",
            styles["body"]))
        if result.get("annual_total_with_supplements"):
            story.append(Paragraph(
                f"Annual total incl. supplements: "
                f"<b>{_money(result.get('annual_total_with_supplements'))}</b>",
                styles["body"]))
        story.append(Spacer(1, 0.3 * cm))

    # Lifetime cap
    story.append(Paragraph("Lifetime cap", styles["h2"]))
    pct = result.get("lifetime_pct") or 0
    story.append(Paragraph(
        f"{_money(result.get('lifetime_contributions'))} of "
        f"{_money(result.get('lifetime_cap'))} contributed "
        f"({float(pct):.1f}%).", styles["body"]))
    if result.get("years_to_cap"):
        story.append(Paragraph(
            f"At the contribution level entered, about "
            f"{result.get('years_to_cap')} years to reach the cap.",
            styles["muted"]))
    if result.get("is_grandfathered"):
        story.append(Paragraph(
            "Grandfathered (Home Care Package no-worse-off arrangement).",
            styles["muted"]))

    story.extend(wayly_footer(
        disclaimer=(
            "This budget is an estimate generated by the Wayly Budget & "
            "Lifetime Cap Calculator using the current Support at Home rules. "
            "It is guidance only, not financial advice. Confirm figures against "
            "your provider statements and Services Australia."
        ),
    ))
    doc.build(story)
    return buf.getvalue()


__all__ = ["render_budget_pdf"]
