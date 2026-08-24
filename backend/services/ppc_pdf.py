"""PPC-1 v2 · One-page PDF export renderer (WS8).

Server-side reportlab renderer for the "Save + share" PDF. Emitted by
`POST /api/ppc/pdf-export`. Single A4 page containing:

  1. Title header ("Provider Price Check")
  2. Provider + service header line
  3. "How this compares" position statement + distance
  4. DoH indicative range vs the charged rate
  5. Your Share (if computed)
  6. Notes block (nursing consumables, transitional, after-hours)
  7. Footer with DoH source + caveats
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from services.wayly_pdf_branding import wayly_header, wayly_footer


# Wayly palette (matches frontend --kindred-* tokens)
TEAL = colors.HexColor("#0E4D52")
CREAM = colors.HexColor("#FBF8F3")
CLAY = colors.HexColor("#A5512B")
SAGE = colors.HexColor("#425F47")
TERRACOTTA = colors.HexColor("#C0392B")
INK = colors.HexColor("#1C2B2D")
MUTED = colors.HexColor("#524B42")


def _fmt_aud(x: float | None) -> str:
    if x is None:
        return ","
    return f"${x:,.2f}"


def _fmt_source_date(iso: str | None) -> str:
    if not iso:
        return "October 2025"
    try:
        d = datetime.fromisoformat(iso[:10])
        return d.strftime("%B %Y")
    except Exception:
        return iso


def render_ppc_pdf(
    *,
    service: str,
    provider: str | None,
    charged: float,
    unit: str | None,
    position: str,
    plain_language: str,
    distance_summary: str | None,
    lower: float | None,
    upper: float | None,
    median: float | None,
    stream: str | None,
    your_share_amount: float | None,
    your_share_explanation: str | None,
    source_date: str | None,
    notes: list[str],
    doh_caveat: str | None,
) -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=1.8 * cm,
        rightMargin=1.8 * cm,
        topMargin=1.6 * cm,
        bottomMargin=1.6 * cm,
        title="Wayly Provider Price Check",
        author="Wayly",
    )

    header = ParagraphStyle(
        "h1", fontName="Helvetica-Bold", fontSize=18, textColor=TEAL, leading=22, spaceAfter=8,
    )
    subhead = ParagraphStyle(
        "sub", fontName="Helvetica", fontSize=10, textColor=MUTED, leading=14, spaceAfter=6,
    )
    body = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=10.5, textColor=INK, leading=15, spaceAfter=8,
    )
    body_bold = ParagraphStyle(
        "bodyb", fontName="Helvetica-Bold", fontSize=10.5, textColor=INK, leading=15, spaceAfter=8,
    )
    label = ParagraphStyle(
        "label", fontName="Helvetica-Bold", fontSize=8, textColor=MUTED, leading=12, spaceAfter=2,
    )
    caveat = ParagraphStyle(
        "caveat", fontName="Helvetica-Oblique", fontSize=9, textColor=INK, leading=13, spaceAfter=6,
    )
    footer_note = ParagraphStyle(
        "footer", fontName="Helvetica", fontSize=8, textColor=MUTED, leading=11, spaceAfter=4,
    )

    unit_word = {
        "hour": "per hour", "trip": "per trip", "meal": "per meal",
        "month": "per month", "kilometre": "per kilometre",
    }.get(unit or "hour", "per unit")

    story: list[Any] = []

    provider_display = provider or "(provider name not entered)"
    # Wayly-branded header replaces the old "Provider Price Check" wordmark.
    story.extend(wayly_header(
        tool_title="Provider Price Check",
        subtitle=f"{service} · {provider_display}",
        content_width_cm=17.4,
    ))
    story.append(Spacer(1, 0.15 * cm))

    # Position band.
    tone = TERRACOTTA if position == "above" else (SAGE if position == "in" else TEAL)
    story.append(Paragraph(f"<font color='{tone.hexval()}'><b>{plain_language}</b></font>", body))
    if distance_summary:
        story.append(Paragraph(distance_summary, body))
    story.append(Spacer(1, 0.2 * cm))

    # Three-column stats table.
    charged_str = _fmt_aud(charged)
    share_str = _fmt_aud(your_share_amount) if your_share_amount is not None else ","
    range_str = (f"{_fmt_aud(lower)} to {_fmt_aud(upper)}" if lower is not None and upper is not None else "Not published")

    stats_data = [
        [Paragraph("YOU ARE CHARGED", label), Paragraph("YOUR SHARE", label), Paragraph("INDICATIVE RANGE", label)],
        [Paragraph(f"<b>{charged_str}</b><br/><font size=8 color='{MUTED.hexval()}'>{unit_word}</font>", body),
         Paragraph(f"<b>{share_str}</b><br/><font size=8 color='{MUTED.hexval()}'>{unit_word}</font>", body),
         Paragraph(f"<b>{range_str}</b><br/><font size=8 color='{MUTED.hexval()}'>DoH {_fmt_source_date(source_date)}</font>", body)],
    ]
    stats_tbl = Table(stats_data, colWidths=[5.4 * cm, 5.4 * cm, 5.4 * cm])
    stats_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), CREAM),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8D0C3")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8D0C3")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(stats_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # Stream + share explanation.
    if stream:
        story.append(Paragraph(f"<b>Support stream:</b> {stream}. "
                                f"{'Clinical supports carry no participant contribution.' if stream == 'Clinical' else ''}",
                                body))
    if your_share_explanation:
        story.append(Paragraph(your_share_explanation, body))

    # DoH caveat.
    if doh_caveat:
        story.append(Spacer(1, 0.15 * cm))
        story.append(Paragraph(doh_caveat, caveat))

    # Notes.
    if notes:
        story.append(Spacer(1, 0.15 * cm))
        story.append(Paragraph("Notes", body_bold))
        for n in notes:
            if not n:
                continue
            story.append(Paragraph(f"• {n}", body))

    # Footer.
    story.append(Spacer(1, 0.5 * cm))
    story.append(Paragraph(
        f"Source: Department of Health, Summary of indicative Support at Home prices, "
        f"{_fmt_source_date(source_date)}. The Australian Government has deferred the planned "
        f"1 July 2026 national price caps under Support at Home indefinitely.",
        footer_note,
    ))

    # Wayly-branded footer with disclaimer.
    story.extend(wayly_footer(
        disclaimer="For guidance only. Not legal or financial advice.",
        content_width_cm=17.4,
    ))

    doc.build(story)
    buffer.seek(0)
    return buffer.getvalue()
