"""CPR-1 · Meeting Artefact PDF renderer.

Server-side reportlab renderer for the print-ready meeting artefact.

Layout (per spec §E):
  1. Header:  "Care Plan Review, For your provider meeting" (Teal on Cream)
  2. Plan overview panel (provider, effective dates, classification, budget)
  3. Findings summary (counts by severity)
  4. Verbatim question script (numbered)
  5. Findings by category (grouped, cited)
  6. Note-taking template (lined blocks)
  7. Footer: Wayly + Aged Care Act 2024 + rule of thumb text
"""
from __future__ import annotations

from typing import Any, Dict, List
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether,
)

from services.wayly_pdf_branding import wayly_header, wayly_footer


# Wayly palette (matches frontend --kindred-* tokens)
TEAL = colors.HexColor("#0E4D52")
CREAM = colors.HexColor("#FBF8F3")
CLAY = colors.HexColor("#A5512B")
SAGE = colors.HexColor("#425F47")
GOLD = colors.HexColor("#B7791F")
TERRACOTTA = colors.HexColor("#C0392B")


def _fmt_date(iso: str | None) -> str:
    if not iso:
        return ","
    try:
        return datetime.fromisoformat(iso[:10]).strftime("%d/%m/%Y")
    except Exception:      # noqa: BLE001
        return iso


def _sev_color(sev: str):
    return {
        "compliance": TERRACOTTA,
        "choice": CLAY,
        "efficiency": GOLD,
        "info": SAGE,
    }.get(sev, colors.grey)


_CATEGORY_LABELS = {
    "rights": "Statement of Rights",
    "clinical": "Clinical adequacy",
    "service_mix": "Service mix",
    "budget": "Budget",
    "cohort": "Cultural safety and cohort",
    "timebound": "Time-bound triggers",
    "choice": "Participant voice",
}


def render_artefact_pdf(
    buf,
    *,
    plan: Dict[str, Any],
    extraction: Dict[str, Any],
    findings: List[Dict[str, Any]],
) -> None:
    styles = getSampleStyleSheet()
    H1 = ParagraphStyle(
        "H1", parent=styles["Heading1"],
        fontName="Helvetica-Bold", textColor=TEAL, fontSize=20,
        spaceAfter=6, leading=24,
    )
    H_LABEL = ParagraphStyle(
        "H_LABEL", parent=styles["BodyText"],
        fontName="Helvetica-Bold", textColor=colors.grey, fontSize=8,
        leading=11, spaceBefore=8, spaceAfter=2,
    )
    H2 = ParagraphStyle(
        "H2", parent=styles["Heading2"],
        fontName="Helvetica-Bold", textColor=TEAL, fontSize=13,
        spaceBefore=14, spaceAfter=6, leading=18,
    )
    BODY = ParagraphStyle(
        "BODY", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=10, leading=14, spaceAfter=3,
    )
    QUESTION = ParagraphStyle(
        "QUESTION", parent=styles["BodyText"],
        fontName="Helvetica-Oblique", fontSize=10, leading=14, spaceAfter=6,
        leftIndent=16, bulletIndent=0,
    )
    CITE = ParagraphStyle(
        "CITE", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=8, textColor=colors.grey,
        leading=10, spaceAfter=8, leftIndent=16,
    )
    SMALL = ParagraphStyle(
        "SMALL", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=8, textColor=colors.grey, leading=10,
    )

    story: list = []

    # ---------------- Wayly-branded header ----------------
    story.extend(wayly_header(
        tool_title="Care Plan Review",
        subtitle="Prepared for your next provider meeting.",
        content_width_cm=18.0,
    ))

    # ---------------- Plan overview ----------------
    provider = plan.get("provider_name") or extraction.get("provider_name") or "Unspecified provider"
    eff_from = plan.get("effective_from") or extraction.get("effective_from")
    eff_to = plan.get("effective_to") or extraction.get("effective_to")
    cls = plan.get("classification_at_review") or extraction.get("classification")
    budget = plan.get("quarterly_budget_at_review") or extraction.get("quarterly_budget")

    overview_rows = [
        ["Provider", provider],
        ["Effective", f"{_fmt_date(eff_from)} → {_fmt_date(eff_to)}" if eff_from else ","],
        ["Classification", str(cls) if cls else ","],
        ["Quarterly budget", f"${budget:,.2f}" if isinstance(budget, (int, float)) else ","],
    ]
    story.append(Paragraph("PLAN OVERVIEW", H_LABEL))
    t = Table(overview_rows, colWidths=[4 * cm, 13 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, -1), CREAM),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("TEXTCOLOR", (0, 0), (0, -1), TEAL),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E8E1D5")),
    ]))
    story.append(t)

    # ---------------- Findings summary ----------------
    by_sev = {"compliance": 0, "choice": 0, "efficiency": 0, "info": 0}
    for f in findings:
        s = f.get("severity") or "info"
        if s in by_sev:
            by_sev[s] += 1
    story.append(Paragraph("FINDINGS SUMMARY", H_LABEL))
    counts_rows = [[
        Paragraph(f'<font color="{TERRACOTTA.hexval()}"><b>{by_sev["compliance"]}</b> Compliance</font>', BODY),
        Paragraph(f'<font color="{CLAY.hexval()}"><b>{by_sev["choice"]}</b> Choice</font>', BODY),
        Paragraph(f'<font color="{GOLD.hexval()}"><b>{by_sev["efficiency"]}</b> Efficiency</font>', BODY),
        Paragraph(f'<font color="{SAGE.hexval()}"><b>{by_sev["info"]}</b> Info</font>', BODY),
    ]]
    t2 = Table(counts_rows, colWidths=[4.25 * cm] * 4)
    t2.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#E8E1D5")),
    ]))
    story.append(t2)

    # ---------------- Verbatim question script ----------------
    story.append(Paragraph("VERBATIM QUESTION SCRIPT", H2))
    story.append(Paragraph(
        "Read each question aloud during the meeting. Space is provided below "
        "each for the provider's answer.",
        BODY,
    ))
    story.append(Spacer(1, 6))

    for i, f in enumerate((q for q in findings if q.get("suggested_question")), start=1):
        block = [
            Paragraph(f"<b>{i}.</b> {f['suggested_question']}", QUESTION),
        ]
        if f.get("citation_source"):
            block.append(Paragraph(f"Source: {f['citation_source']}", CITE))
        # Note-taking lines
        for _ in range(2):
            block.append(Paragraph("_____________________________________________________________", SMALL))
        block.append(Spacer(1, 6))
        story.append(KeepTogether(block))

    # ---------------- Findings by category ----------------
    story.append(PageBreak())
    story.append(Paragraph("ALL FINDINGS", H2))
    story.append(Paragraph(
        "Grouped by severity, each finding cites the specific instrument. "
        "Take this list to the meeting alongside the questions above.",
        BODY,
    ))
    story.append(Spacer(1, 8))

    order = ["compliance", "choice", "efficiency", "info"]
    for sev in order:
        rows = [f for f in findings if f.get("severity") == sev]
        if not rows:
            continue
        badge_colour = _sev_color(sev)
        story.append(Paragraph(
            f'<font color="{badge_colour.hexval()}"><b>{sev.upper()}</b></font> · {len(rows)} finding{"s" if len(rows) != 1 else ""}',
            ParagraphStyle(
                "SEV_HDR", parent=BODY,
                fontName="Helvetica-Bold", fontSize=10, leading=14,
                spaceBefore=12, spaceAfter=4,
            ),
        ))
        for f in rows:
            cat_label = _CATEGORY_LABELS.get(f.get("category", ""), f.get("category", ""))
            story.append(Paragraph(
                f"<b>{f.get('title', '')}</b>  <font color='#888888' size='8'>· {cat_label} · confidence: {f.get('confidence', ',')}</font>",
                BODY,
            ))
            if f.get("detail"):
                story.append(Paragraph(f.get("detail", ""), BODY))
            if f.get("citation_source"):
                story.append(Paragraph(f"Source: {f.get('citation_source')}", CITE))
            story.append(Spacer(1, 3))

    # ---------------- Note-taking template ----------------
    story.append(PageBreak())
    story.append(Paragraph("YOUR MEETING NOTES", H2))
    story.append(Paragraph("Jot the provider's answers, any follow-ups, and decisions taken.", BODY))
    story.append(Spacer(1, 6))
    for _ in range(24):
        story.append(Paragraph("_____________________________________________________________", SMALL))
        story.append(Spacer(1, 4))

    # ---------------- Footer ----------------
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        "The Statement of Rights, National Aged Care Quality Standards, and "
        "Aged Care Rules 2025 provide the legal framework for this review. "
        "This artefact is a conversation prompt, not a formal audit.",
        SMALL,
    ))

    # Wayly-branded footer.
    story.extend(wayly_footer(
        disclaimer=(
            "Take this to your next provider meeting. Wayly Care Plan Review "
            "is a preparation aid, not a formal audit."
        ),
        content_width_cm=18.0,
    ))

    SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
        title="Care Plan Meeting Artefact",
        author="Wayly",
    ).build(story)


__all__ = ["render_artefact_pdf"]
