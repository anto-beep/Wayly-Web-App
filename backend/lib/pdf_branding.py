"""Wayly, shared PDF brand library.

Single source of truth for every PDF the app produces (Decoded statement
+ all 8 reports). Replaces the Chrome/Jinja pipeline with a pure-Python
ReportLab build so PDFs work in any container and the Wayly brand is
applied uniformly.

Palette mirrors `/app/frontend/src/index.css` --kindred-* tokens.
"""
from __future__ import annotations
import os
from datetime import datetime
from typing import Iterable, Optional, Sequence

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape as _landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
    PageBreak, Image as RLImage,
)


# ---------------------------------------------------------------------------
# Brand palette, matches /app/frontend/src/index.css :root tokens
# ---------------------------------------------------------------------------
INK_HEX, INK = "#0E4D52", colors.HexColor("#0E4D52")        # teal-ink 600, primary
TEXT_HEX, TEXT = "#1C2B2D", colors.HexColor("#1C2B2D")      # warm ink, body
GOLD_HEX, GOLD = "#A5512B", colors.HexColor("#A5512B")      # clay 500, accent
SAGE_HEX, SAGE = "#425F47", colors.HexColor("#425F47")      # sage 600
MUTED_HEX, MUTED = "#524B42", colors.HexColor("#524B42")    # neutral 700
BORDER = colors.HexColor("#E7E0D5")                          # neutral 200
SURFACE_2 = colors.HexColor("#F4EFE7")                       # neutral 100, sunken
BG = colors.HexColor("#FBF8F3")                              # neutral 50
ALERT_HEX, ALERT = "#B7791F", colors.HexColor("#B7791F")    # warning dark
ERROR_HEX, ERROR = "#C0392B", colors.HexColor("#C0392B")    # error
SUCCESS_HEX, SUCCESS = "#1B5733", colors.HexColor("#1B5733")  # success dark
GOLD_BG = colors.HexColor("#F5E9D8")                         # gold tint (badge bg)
SUCCESS_BG = colors.HexColor("#D9EDDC")
ERROR_BG = colors.HexColor("#F4D7D2")
ALERT_BG = colors.HexColor("#F7E6C9")
INK_BG = colors.HexColor("#D9DFDE")


# ---------------------------------------------------------------------------
# Logo lookup, silently degrade if asset missing in this env
# ---------------------------------------------------------------------------
_LOGO_CANDIDATES = (
    "/app/frontend/public/branding/png/wayly-lockup-navy-1024.png",
    "/app/frontend/public/branding/png/wayly-lockup-navy-512.png",
    "/app/frontend/public/branding/png/wayly-mark-512.png",
)
LOGO_PATH: Optional[str] = next(
    (p for p in _LOGO_CANDIDATES if os.path.exists(p)), None
)


# ---------------------------------------------------------------------------
# Paragraph styles, call get_styles() once per document
# ---------------------------------------------------------------------------
def get_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle(
            "h1", parent=base["Heading1"], textColor=INK,
            fontSize=18, leading=22, spaceAfter=2,
            fontName="Helvetica-Bold",
        ),
        "h2": ParagraphStyle(
            "h2", parent=base["Heading2"], textColor=INK,
            fontSize=12, leading=15, spaceBefore=14, spaceAfter=6,
            fontName="Helvetica-Bold",
        ),
        "h3": ParagraphStyle(
            "h3", parent=base["Heading3"], textColor=INK,
            fontSize=11, leading=14, spaceBefore=8, spaceAfter=4,
            fontName="Helvetica-Bold",
        ),
        "sub_hd": ParagraphStyle(
            "sub_hd", parent=base["BodyText"], textColor=GOLD,
            fontSize=11, leading=14, spaceAfter=2,
            fontName="Helvetica-Bold",
        ),
        "body": ParagraphStyle(
            "body", parent=base["BodyText"], textColor=TEXT,
            fontSize=10, leading=13,
        ),
        "muted": ParagraphStyle(
            "muted", parent=base["BodyText"], textColor=MUTED,
            fontSize=9, leading=11,
        ),
        "tiny": ParagraphStyle(
            "tiny", parent=base["BodyText"], textColor=MUTED,
            fontSize=8, leading=10,
        ),
        "kpi_label": ParagraphStyle(
            "kpi_label", parent=base["BodyText"], textColor=MUTED,
            fontSize=8, leading=10, spaceAfter=2,
            fontName="Helvetica-Bold",
        ),
        "kpi_val": ParagraphStyle(
            "kpi_val", parent=base["BodyText"], textColor=INK,
            fontSize=14, leading=17, fontName="Helvetica-Bold",
        ),
        "footer": ParagraphStyle(
            "footer", parent=base["BodyText"], textColor=MUTED,
            fontSize=8, leading=10,
        ),
    }


# ---------------------------------------------------------------------------
# Money / date formatters (mirror reports_routes._fmt_money)
# ---------------------------------------------------------------------------
def fmt_money(v) -> str:
    try:
        return f"${float(v or 0):,.2f}"
    except (TypeError, ValueError):
        return "$0.00"


def fmt_int(v) -> str:
    try:
        return f"{int(v or 0):,}"
    except (TypeError, ValueError):
        return "0"


def fmt_date(v) -> str:
    if not v:
        return ", "
    s = str(v)
    if "T" in s:
        s = s.split("T", 1)[0]
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").strftime("%-d %b %Y")
    except Exception:
        return s


# ---------------------------------------------------------------------------
# Reusable building blocks
# ---------------------------------------------------------------------------
def make_doc(buf, *, title: str, author: str = "Wayly",
             landscape: bool = False) -> SimpleDocTemplate:
    pagesize = _landscape(A4) if landscape else A4
    return SimpleDocTemplate(
        buf, pagesize=pagesize,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=14 * mm, bottomMargin=16 * mm,
        title=title, author=author,
    )


def page_width_mm(landscape: bool = False) -> float:
    # A4 - margins.
    return (297 if landscape else 210) - 32  # 16mm each side


def header_block(styles: dict, *, title: str, subtitle: Optional[str] = None,
                 caregiver: Optional[str] = None, meta: Optional[str] = None,
                 disclaimer: Optional[str] = None,
                 landscape: bool = False) -> list:
    """Logo + title row + gold underline. Used at the top of every PDF."""
    pw = page_width_mm(landscape) * mm

    title_block: list = [Paragraph(title, styles["h1"])]
    if subtitle:
        title_block.append(Paragraph(subtitle, styles["sub_hd"]))
    if caregiver:
        title_block.append(
            Paragraph(f'<font color="{MUTED_HEX}">{caregiver}</font>',
                      styles["body"])
        )
    if meta:
        title_block.append(Paragraph(meta, styles["muted"]))
    if disclaimer:
        title_block.append(Paragraph(disclaimer, styles["muted"]))

    if LOGO_PATH:
        try:
            logo = RLImage(LOGO_PATH, width=34 * mm, height=12 * mm)
            logo.hAlign = "LEFT"
            header = Table([[logo, title_block]],
                           colWidths=[36 * mm, pw - 36 * mm])
        except Exception:
            header = Table([[title_block]], colWidths=[pw])
    else:
        header = Table([[title_block]], colWidths=[pw])

    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.75, GOLD),
    ]))
    return [header, Spacer(1, 6)]


def footer_block(styles: dict) -> list:
    today = datetime.now().strftime("%-d %b %Y")
    return [
        Spacer(1, 12),
        Paragraph(
            f'<font color="{INK_HEX}"><b>Wayly</b></font> &nbsp;·&nbsp; '
            f'Generated {today} &nbsp;·&nbsp; wayly.com.au &nbsp;·&nbsp; '
            f'AI-generated summary based on caregiver records and decoded '
            f'provider statements. Verify against your original provider '
            f'records before acting. Not financial or legal advice.',
            styles["footer"],
        ),
    ]


def kpi_tiles(styles: dict, items: Sequence[tuple[str, str, Optional[str]]],
              landscape: bool = False) -> Table:
    """`items` is a list of (LABEL, VALUE, optional sub-text)."""
    pw = page_width_mm(landscape) * mm
    cell_w = pw / len(items)
    cells = []
    for label, value, sub in items:
        block = [
            Paragraph(label.upper(), styles["kpi_label"]),
            Paragraph(value, styles["kpi_val"]),
        ]
        if sub:
            block.append(Paragraph(sub, styles["muted"]))
        cells.append(block)
    tbl = Table([cells], colWidths=[cell_w] * len(items))
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE_2),
        ("LINEAFTER", (0, 0), (-2, 0), 4, BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEBELOW", (0, 0), (-1, -1), 2, GOLD),
    ]))
    return tbl


def data_table(headers: Sequence, rows: Sequence[Sequence],
               col_widths: Optional[Sequence[float]] = None,
               *, right_align_from: int = 1,
               landscape: bool = False,
               repeat_header: bool = True) -> Table:
    """Standard branded table, INK header, alternating BG/white rows."""
    pw = page_width_mm(landscape) * mm
    n_cols = len(headers)
    if col_widths is None:
        col_widths = [pw / n_cols] * n_cols

    full_rows = [list(headers), *[list(r) for r in rows]]
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (right_align_from, 0), (-1, -1), "RIGHT"),
        ("ALIGN", (0, 0), (right_align_from - 1, -1), "LEFT"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TEXTCOLOR", (0, 1), (-1, -1), TEXT),
        ("LINEBELOW", (0, 0), (-1, 0), 1.5, GOLD),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG]),
        ("LINEBELOW", (0, 1), (-1, -2), 0.25, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    tbl = Table(full_rows, colWidths=col_widths,
                repeatRows=1 if repeat_header else 0)
    tbl.setStyle(TableStyle(style))
    return tbl


def cream_card(content: list, *, landscape: bool = False,
               border: colors.Color = BORDER,
               bg: colors.Color = SURFACE_2,
               left_accent: Optional[colors.Color] = None) -> KeepTogether:
    pw = page_width_mm(landscape) * mm
    tbl = Table([[content]], colWidths=[pw])
    style = [
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.5, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]
    if left_accent is not None:
        style.append(("LINEBEFORE", (0, 0), (0, -1), 3, left_accent))
    tbl.setStyle(TableStyle(style))
    return KeepTogether(tbl)


def badge_html(label: str, kind: str = "grey") -> str:
    """Render an inline 'badge' as coloured bold text. ReportLab paragraph
    parser doesn't support background colours reliably, so we use strong
    foreground colour + bold + uppercase as the visual cue. Brackets give
    the chip-like outline."""
    palette = {
        "green":   SUCCESS_HEX,
        "success": SUCCESS_HEX,
        "amber":   ALERT_HEX,
        "warning": ALERT_HEX,
        "medium":  ALERT_HEX,
        "red":     ERROR_HEX,
        "error":   ERROR_HEX,
        "high":    ERROR_HEX,
        "grey":    MUTED_HEX,
        "navy":    INK_HEX,
        "gold":    GOLD_HEX,
        "low":     MUTED_HEX,
    }
    fg = palette.get((kind or "grey").lower(), MUTED_HEX)
    return f'<font color="{fg}" size="8"><b>[ {label.upper()} ]</b></font>'


def severity_badge(label: str, severity: str) -> str:
    """Map severity strings used across the codebase to badge kinds."""
    s = (severity or "").lower()
    if s in ("high", "critical", "alert", "error"):
        return badge_html(label, "red")
    if s in ("medium", "warning", "warn"):
        return badge_html(label, "amber")
    if s in ("low", "info", "informational"):
        return badge_html(label, "grey")
    if s in ("resolved", "delivered", "success", "ok"):
        return badge_html(label, "green")
    return badge_html(label, "grey")


def traffic_bar(pct: float, kind: str = "green",
                landscape: bool = False, width_mm: float = 80) -> Table:
    pct = max(0.0, min(100.0, float(pct or 0)))
    fill_w = (pct / 100.0) * width_mm * mm
    bg_w = width_mm * mm - fill_w
    bar_color = {
        "green": SUCCESS, "amber": ALERT, "red": ERROR,
    }.get((kind or "green").lower(), SUCCESS)
    tbl = Table([[" ", " "]], colWidths=[fill_w or 0.1, bg_w or 0.1],
                rowHeights=[3.5 * mm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), bar_color),
        ("BACKGROUND", (1, 0), (1, 0), SURFACE_2),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return tbl


def build_pdf_bytes(buf_factory, build_flow, *, title: str,
                    landscape: bool = False) -> bytes:
    """Helper that runs a flow-building callback and returns PDF bytes.

    `buf_factory()` returns an io.BytesIO (kept abstract so a future
    in-memory cache can swap it out).
    `build_flow(doc, styles)` populates a list and returns it.
    """
    buf = buf_factory()
    doc = make_doc(buf, title=title, landscape=landscape)
    styles = get_styles()
    flow = build_flow(doc, styles)
    doc.build(flow)
    out = buf.getvalue()
    buf.close()
    return out
