"""Wayly-branded header and footer for every PDF the platform emits.

Used by ce2_pdf.py, ppc_pdf.py, lf1_pdf.py, care_plan_pdf.py so every
document caregivers receive carries the same corner-piece brand mark and
tagline, and every last page carries the same compliance footer.

The header uses the real Wayly navy lockup PNG shipped in
``services/branding/wayly-lockup-navy.png`` (a 512-pixel horizontal
lockup of the "W" mark + wordmark). This is the same lockup rendered in
the web app header, keeping print-out branding pixel-consistent with the
on-screen product.

All colour tokens mirror the frontend design tokens declared in
``frontend/src/index.css`` (``--kindred-*``).
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Optional

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import Image, Paragraph, Spacer, Table, TableStyle

# Wayly brand tokens, sourced from frontend/src/index.css --kindred-*.
WAYLY_TEAL = colors.HexColor("#0E4D52")     # --kindred-primary  (teal-ink 600)
WAYLY_CLAY = colors.HexColor("#A5512B")     # --kindred-gold     (clay 500)
WAYLY_SAGE = colors.HexColor("#425F47")     # --kindred-sage
WAYLY_CREAM = colors.HexColor("#FBF8F3")    # --kindred-bg
WAYLY_INK = colors.HexColor("#1C2B2D")      # --kindred-text
WAYLY_MUTED = colors.HexColor("#524B42")    # --kindred-muted
WAYLY_BORDER = colors.HexColor("#E7E0D5")   # --kindred-border
WAYLY_TERRACOTTA = colors.HexColor("#C0392B")   # --kindred-terracotta
WAYLY_GOLD_WARN = colors.HexColor("#B7791F")    # --kindred-alert
WAYLY_SUCCESS = colors.HexColor("#1B5733")      # --kindred-success

_HERE = os.path.dirname(os.path.abspath(__file__))
LOCKUP_PATH = os.path.join(_HERE, "branding", "wayly-lockup-navy.png")
MARK_PATH = os.path.join(_HERE, "branding", "wayly-mark.png")


def wayly_header(*, tool_title: str, subtitle: Optional[str] = None, content_width_cm: float = 16.4) -> list:
    """Consistent header block for every Wayly PDF.

    Left cell: navy lockup (W mark + Wayly wordmark) + tool title stack.
    Right cell: "Generated" label + formatted date, right-aligned.
    Teal divider rule underneath. Returns a list of flowables ready to be
    added to the story.
    """
    tool_style = ParagraphStyle(
        "wayly_tool", fontName="Helvetica", fontSize=10, leading=13,
        textColor=WAYLY_MUTED, spaceBefore=2,
    )
    date_label_style = ParagraphStyle(
        "wayly_date_lbl", fontName="Helvetica-Bold", fontSize=7.5, leading=10,
        textColor=WAYLY_MUTED, alignment=2, spaceAfter=1,
    )
    date_style = ParagraphStyle(
        "wayly_date", fontName="Helvetica", fontSize=9, leading=12,
        textColor=WAYLY_INK, alignment=2,
    )

    # Lockup: 3.4 cm wide keeps it crisp without dominating the page.
    logo = Image(LOCKUP_PATH, width=3.4 * cm, height=(3.4 / 3.2) * cm)
    logo.hAlign = "LEFT"

    left_stack = [logo, Paragraph(tool_title, tool_style)]
    if subtitle:
        left_stack.append(Paragraph(subtitle, tool_style))
    right_stack = [
        Paragraph("GENERATED", date_label_style),
        Paragraph(datetime.now().strftime("%d %B %Y"), date_style),
    ]

    inner_left_width = content_width_cm * 0.62
    inner_right_width = content_width_cm - inner_left_width

    t = Table(
        [[left_stack, right_stack]],
        colWidths=[inner_left_width * cm, inner_right_width * cm],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (0, 0), "TOP"),
        ("VALIGN", (1, 0), (1, 0), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.75, WAYLY_TEAL),
    ]))
    return [t, Spacer(1, 0.4 * cm)]


def wayly_footer(*, disclaimer: str, content_width_cm: float = 16.4) -> list:
    """Consistent footer for every Wayly PDF.

    Left cell: disclaimer prose (muted). Right cell: bold ``wayly.com.au``
    in brand teal. Thin cream-tinted rule above.
    """
    left_style = ParagraphStyle(
        "wayly_footer_left", fontName="Helvetica", fontSize=8, leading=11,
        textColor=WAYLY_MUTED,
    )
    right_style = ParagraphStyle(
        "wayly_footer_right", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
        textColor=WAYLY_TEAL, alignment=2,
    )
    inner_left = content_width_cm * 0.72
    inner_right = content_width_cm - inner_left
    t = Table(
        [[Paragraph(disclaimer, left_style),
          Paragraph("wayly.com.au", right_style)]],
        colWidths=[inner_left * cm, inner_right * cm],
    )
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("LINEABOVE", (0, 0), (-1, -1), 0.5, WAYLY_BORDER),
    ]))
    return [Spacer(1, 0.5 * cm), t]
