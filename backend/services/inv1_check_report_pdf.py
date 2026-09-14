"""INV-1 v1.2 · Invoice Check Report PDF.

Server-side reportlab renderer emitted by
``POST /api/invoices/{id}/save-to-vault``. Produces an A4 report that
summarises the Wayly Invoice Checker findings so the caregiver has a
durable paper-trail alongside the original invoice in the Vault.

Sections (top to bottom):
  1. Wayly header (brand + generated date)
  2. Verdict banner (all_clear / items_to_note / questions_to_raise /
     check_before_paying) with plain-English body
  3. Invoice metadata table (provider, ABN, invoice date, due date,
     document shape, quarterly budget, period end)
  4. Wayly Summary prose (AI-generated LLM narrative)
  5. Findings list, one card per finding, highest tier first
  6. "We also checked" clean-reconciliation grid
  7. Wayly footer (disclaimer + wayly.com.au)
"""
from __future__ import annotations

from io import BytesIO
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from services.wayly_pdf_branding import (
    WAYLY_BORDER,
    WAYLY_CLAY,
    WAYLY_INK,
    WAYLY_MUTED,
    WAYLY_SAGE,
    WAYLY_TEAL,
    WAYLY_TERRACOTTA,
    wayly_footer,
    wayly_header,
)

_SHAPE_LABEL = {
    "invoice": "Invoice",
    "combined": "Combined statement + invoice",
    "combined_unsplit": "Combined document",
    "statement": "Statement",
    "remittance": "Remittance advice",
    "receipt": "Receipt",
}

_VERDICT = {
    "all_clear": {
        "title": "Looks all clear",
        "body": "We checked this invoice against the current Support at Home rules and could not find anything worth raising.",
        "color": WAYLY_SAGE,
    },
    "items_to_note": {
        "title": "A few items to note",
        "body": "Nothing needs urgent action, but there are one or two informational items worth reading.",
        "color": WAYLY_TEAL,
    },
    "questions_to_raise": {
        "title": "Some questions to raise",
        "body": "We found lines worth asking your provider about before you pay.",
        "color": WAYLY_CLAY,
    },
    "check_before_paying": {
        "title": "Check before you pay",
        "body": "We found something that may breach the Support at Home rules. Please raise these with your provider before paying.",
        "color": WAYLY_TERRACOTTA,
    },
}

_TIER_LABEL = {
    1: ("Informational", WAYLY_SAGE),
    2: ("Worth noting", WAYLY_TEAL),
    3: ("Worth a question", WAYLY_CLAY),
    4: ("Check before paying", WAYLY_TERRACOTTA),
}


def _fmt_date_au(s: Optional[str]) -> Optional[str]:
    """Format an ISO YYYY-MM-DD string as DD/MM/YYYY. Returns the input
    unchanged if it can't be parsed."""
    if not s:
        return None
    try:
        from datetime import date as _date
        d = _date.fromisoformat(str(s)[:10])
        return f"{d.day:02d}/{d.month:02d}/{d.year}"
    except Exception:
        return str(s)


def _fmt_abn(abn: Optional[str]) -> Optional[str]:
    if not abn:
        return None
    s = "".join(ch for ch in abn if ch.isdigit())
    if len(s) == 11:
        return f"{s[:2]} {s[2:5]} {s[5:8]} {s[8:]}"
    return abn


def _styles() -> Dict[str, ParagraphStyle]:
    base = ParagraphStyle(
        "base", fontName="Helvetica", fontSize=10, leading=13, textColor=WAYLY_INK,
    )
    return {
        "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold",
                             fontSize=20, leading=24, textColor=WAYLY_TEAL,
                             spaceAfter=4),
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold",
                             fontSize=13, leading=16, textColor=WAYLY_TEAL,
                             spaceAfter=4, spaceBefore=10),
        "eyebrow": ParagraphStyle("eyebrow", parent=base, fontName="Helvetica-Bold",
                                  fontSize=8, leading=11, textColor=WAYLY_MUTED,
                                  spaceAfter=2),
        "body": ParagraphStyle("body", parent=base, spaceAfter=4),
        "muted": ParagraphStyle("muted", parent=base, textColor=WAYLY_MUTED,
                                fontSize=9, leading=12),
        "small_muted": ParagraphStyle("small_muted", parent=base,
                                      textColor=WAYLY_MUTED, fontSize=8, leading=11),
        "verdict_title": ParagraphStyle("verdict_title", parent=base,
                                        fontName="Helvetica-Bold", fontSize=18,
                                        leading=22, textColor=colors.white,
                                        spaceAfter=4),
        "verdict_body": ParagraphStyle("verdict_body", parent=base,
                                       fontSize=10, leading=14,
                                       textColor=colors.white, spaceAfter=0),
        "tier_pill": ParagraphStyle("tier_pill", parent=base,
                                    fontName="Helvetica-Bold", fontSize=7.5,
                                    leading=10, textColor=colors.white,
                                    spaceAfter=0),
        "finding_body": ParagraphStyle("finding_body", parent=base,
                                       fontSize=10, leading=13.5, spaceAfter=3),
        "finding_narrative": ParagraphStyle("finding_narrative", parent=base,
                                            fontSize=9, leading=12,
                                            textColor=WAYLY_MUTED, spaceAfter=0),
    }


def _verdict_banner(verdict: str, styles) -> Table:
    meta = _VERDICT.get(verdict) or _VERDICT["all_clear"]
    cell = [
        Paragraph(meta["title"], styles["verdict_title"]),
        Paragraph(meta["body"], styles["verdict_body"]),
    ]
    tbl = Table([[cell]], colWidths=[16.4 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), meta["color"]),
        ("LEFTPADDING", (0, 0), (-1, -1), 16),
        ("RIGHTPADDING", (0, 0), (-1, -1), 16),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ]))
    return tbl


def _meta_table(invoice: Dict[str, Any], styles) -> Table:
    rows: List[List[Any]] = []
    fields = [
        ("Provider", invoice.get("provider_name")),
        ("ABN", _fmt_abn(invoice.get("provider_abn"))),
        ("Invoice date", _fmt_date_au(invoice.get("invoice_date"))),
        ("Due date", _fmt_date_au(invoice.get("due_date"))),
        ("Document shape", _SHAPE_LABEL.get(invoice.get("document_shape") or "invoice", invoice.get("document_shape"))),
    ]
    for label, value in fields:
        if not value:
            continue
        rows.append([
            Paragraph(label.upper(), styles["small_muted"]),
            Paragraph(str(value), styles["body"]),
        ])
    if not rows:
        return None
    tbl = Table(rows, colWidths=[4.5 * cm, 11.9 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.5, WAYLY_BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, WAYLY_BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return tbl


def _finding_card(finding: Dict[str, Any], styles) -> KeepTogether:
    tier = int(finding.get("tier") or 1)
    label, color = _TIER_LABEL.get(tier, _TIER_LABEL[1])
    pill = Table(
        [[Paragraph(f"TIER {tier} · {label.upper()}", styles["tier_pill"])]],
        colWidths=[6.5 * cm],
    )
    pill.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), color),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    parts: List[Any] = [pill, Spacer(1, 0.15 * cm)]
    q = finding.get("suggested_question") or ""
    if q:
        parts.append(Paragraph(f"<b>Suggested question:</b> {q}", styles["finding_body"]))
    narrative = finding.get("narrative") or ""
    if narrative:
        parts.append(Paragraph(narrative, styles["finding_narrative"]))
    if finding.get("escalation") == "acqsc":
        parts.append(Spacer(1, 0.1 * cm))
        parts.append(Paragraph(
            "<b>Escalation:</b> Aged Care Quality and Safety Commission · 1800 951 822",
            styles["finding_narrative"],
        ))
    parts.append(Spacer(1, 0.3 * cm))
    return KeepTogether(parts)


def render_invoice_check_report(*, invoice: Dict[str, Any],
                                reconciliation: Dict[str, Any]) -> bytes:
    """Render the Invoice Checker findings to an A4 PDF as bytes."""
    styles = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Invoice Check Report", author="Wayly",
    )
    story: list = []
    story.extend(wayly_header(
        tool_title="Invoice Check Report",
        subtitle=f"Provider: {invoice.get('provider_name') or 'Not detected'}",
    ))

    # Verdict banner
    verdict = (reconciliation.get("overall_verdict") or "all_clear")
    story.append(_verdict_banner(verdict, styles))
    story.append(Spacer(1, 0.4 * cm))

    # Meta table
    meta = _meta_table(invoice, styles)
    if meta is not None:
        story.append(Paragraph("Invoice details", styles["h2"]))
        story.append(meta)
        story.append(Spacer(1, 0.3 * cm))

    # AI Summary
    summary = (reconciliation.get("summary_md") or "").strip()
    if summary:
        story.append(Paragraph("Wayly Summary", styles["h2"]))
        for para in summary.split("\n\n"):
            if para.strip():
                story.append(Paragraph(para.strip().replace("\n", "<br/>"), styles["body"]))
        story.append(Spacer(1, 0.3 * cm))

    # Findings
    findings = reconciliation.get("findings") or []
    if findings:
        story.append(Paragraph(
            f"Things worth raising ({len(findings)} item{'s' if len(findings) != 1 else ''})",
            styles["h2"],
        ))
        findings_sorted = sorted(findings, key=lambda f: -int(f.get("tier") or 1))
        for f in findings_sorted:
            story.append(_finding_card(f, styles))
    else:
        story.append(Paragraph("Nothing worth raising", styles["h2"]))
        story.append(Paragraph(
            "Every check passed on this invoice.",
            styles["body"],
        ))
        story.append(Spacer(1, 0.2 * cm))

    # Clean reconciliation
    clean = [c for c in (reconciliation.get("clean_reconciliation") or []) if c.get("ok")]
    if clean:
        story.append(Paragraph(f"We also checked ({len(clean)} passed)", styles["h2"]))
        cells: List[List[Any]] = []
        row: List[Any] = []
        for c in clean:
            row.append(Paragraph(f"• {c.get('label', '')}", styles["small_muted"]))
            if len(row) == 2:
                cells.append(row)
                row = []
        if row:
            row.append(Paragraph("", styles["small_muted"]))
            cells.append(row)
        if cells:
            tbl = Table(cells, colWidths=[8.2 * cm, 8.2 * cm])
            tbl.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
                ("RIGHTPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))
            story.append(tbl)

    story.extend(wayly_footer(
        disclaimer=(
            "This report is generated by the Wayly Invoice Checker and is intended as "
            "guidance only. It is not legal or financial advice. Please confirm any "
            "items with your provider before paying."
        ),
    ))

    doc.build(story)
    return buf.getvalue()
