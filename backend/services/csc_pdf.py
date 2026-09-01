"""CSC-1 v1 PDF export.

Server-side reportlab renderer emitted by ``POST /api/public/csc/pdf``.
Mirrors the results-screen sections (§6.1) at print-ready A4 with 2 cm
margins. Reuses the shared Wayly palette from ``services.ce2_pdf``.

Design notes:
* No em / en dashes anywhere.
* Every dollar figure formatted via ``_fmt_aud`` (no cents).
* Confidence pill rendered as a coloured cell (Sage / off-white / Clay).
* Footer surfaces the payload schema and INDEX-1 budget source version.
"""
from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from services.wayly_pdf_branding import wayly_header, wayly_footer

# Palette
TEAL = colors.HexColor("#0E4D52")
SAGE = colors.HexColor("#425F47")
CLAY = colors.HexColor("#A5512B")
INK = colors.HexColor("#1C2B2D")
MUTED = colors.HexColor("#524B42")
BORDER = colors.HexColor("#E7E0D5")
CREAM = colors.HexColor("#FBF8F3")

DOMAIN_LABELS = {
    "self_care": "Self-care",
    "iadl": "IADLs",
    "cognition_behaviour": "Cognition and behaviour",
    "safety_hospitalisation": "Safety",
    "informal_support": "Informal support",
    "home_environment": "Home environment",
    "mood": "Mood",
}


def _fmt_aud(x: Optional[float]) -> str:
    if x is None:
        return "N/A"
    try:
        return f"${int(round(float(x))):,}"
    except (TypeError, ValueError):
        return "N/A"


def _styles() -> Dict[str, ParagraphStyle]:
    base = ParagraphStyle("base", fontName="Helvetica", fontSize=10, leading=13, textColor=INK)
    return {
        "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=TEAL, spaceAfter=4),
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=TEAL, spaceAfter=4, spaceBefore=8),
        "eyebrow": ParagraphStyle("eyebrow", parent=base, fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=MUTED, spaceAfter=2),
        "body": ParagraphStyle("body", parent=base, spaceAfter=4),
        "muted": ParagraphStyle("muted", parent=base, textColor=MUTED, fontSize=9, leading=12),
        "small_muted": ParagraphStyle("small_muted", parent=base, textColor=MUTED, fontSize=8, leading=11),
        "big_class": ParagraphStyle("big_class", parent=base, fontName="Helvetica-Bold", fontSize=28, leading=32, textColor=TEAL, spaceAfter=4),
    }


def _confidence_cell(conf: str, styles) -> Table:
    label = {"high": "High confidence", "medium": "Medium confidence", "low": "Low confidence"}.get(conf, conf)
    bg = {"high": SAGE, "medium": CREAM, "low": CLAY}.get(conf, colors.grey)
    fg = colors.white if conf != "medium" else TEAL
    tbl = Table([[Paragraph(f'<font color="{fg.hexval()}"><b>{label}</b></font>', styles["small_muted"])]], colWidths=[4.2 * cm])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.5, bg),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return tbl


def render_csc_pdf(*, payload: Dict[str, Any], person_name: Optional[str] = None,
                   persona_label: str = "Caregiver") -> bytes:
    """Render a CSC run payload to A4 PDF bytes."""
    styles = _styles()
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm,
        topMargin=2 * cm, bottomMargin=2 * cm,
        title="Classification Self-Check", author="Wayly",
    )
    story: list = []
    story.extend(wayly_header(tool_title="Classification Self-Check", subtitle=f"Persona: {persona_label}"))

    c = payload["classification"]
    range_txt = (
        f"Classification {c['primary']}" if c["range_low"] == c["range_high"]
        else f"Classification {c['range_low']} to {c['range_high']}"
    )
    story.append(Paragraph(range_txt, styles["big_class"]))
    story.append(_confidence_cell(c["confidence"], styles))
    story.append(Spacer(1, 6))

    story.append(Paragraph(
        f"<b>{_fmt_aud(c['annual_budget_low'])}</b> to <b>{_fmt_aud(c['annual_budget_high'])}</b> per year "
        f"({_fmt_aud(c['quarterly_budget_low'])} to {_fmt_aud(c['quarterly_budget_high'])} per quarter)",
        styles["body"],
    ))

    if payload.get("gap_detected") and payload.get("gap_direction") == "up":
        story.append(Paragraph(
            f'<font color="#A5512B"><b>Gap detected:</b> your daily-life answers suggest higher '
            f'needs than Classification {payload.get("current_classification")} typically covers.</font>',
            styles["muted"],
        ))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Profile match", styles["h2"]))
    story.append(Paragraph(payload.get("profile_summary", ""), styles["body"]))

    # Top drivers
    drivers = payload.get("top_drivers", [])
    if drivers:
        story.append(Paragraph("What drove this result", styles["h2"]))
        driver_rows = [
            [Paragraph(f"<b>{DOMAIN_LABELS.get(d['domain'], d['domain'])}</b>", styles["small_muted"]),
             Paragraph(d["answer"], styles["body"])]
            for d in drivers
        ]
        tbl = Table(driver_rows, colWidths=[5 * cm, 11 * cm])
        tbl.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
            ("BACKGROUND", (0, 0), (0, -1), CREAM),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(tbl)

    # Next step
    story.append(Paragraph("Next step", styles["h2"]))
    branch = payload.get("branch")
    if branch == "A":
        story.append(Paragraph(
            "This is a common reason to request a reassessment. "
            "Draft a reassessment letter using Wayly's Letters and Follow-ups tool, or contact "
            "My Aged Care on 1800 200 422.",
            styles["body"],
        ))
    elif branch == "B":
        story.append(Paragraph(
            "Your answers line up with your current classification. If the situation changes, "
            "run this again.",
            styles["body"],
        ))
    else:
        story.append(Paragraph(
            "This is a starting point. The formal assessment is arranged through My Aged Care "
            "on 1800 200 422.",
            styles["body"],
        ))

    # Domain scores summary
    story.append(Paragraph("Domain scores", styles["h2"]))
    ds = payload.get("domain_scores", {})
    ds_rows = [[Paragraph(f"<b>{DOMAIN_LABELS.get(k, k)}</b>", styles["small_muted"]),
                Paragraph(f"{round(v * 100)}%", styles["small_muted"])]
               for k, v in ds.items()]
    if ds_rows:
        tbl = Table(ds_rows, colWidths=[8 * cm, 4 * cm])
        tbl.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.25, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(tbl)

    story.append(Spacer(1, 10))
    story.append(Paragraph(
        "This is informational only. Only the My Aged Care Integrated Assessment Tool (IAT) "
        "determines actual classification.",
        styles["small_muted"],
    ))

    footer_disclaimer = (
        f"Payload {payload.get('schema_version', 'csc.payload.v1')} · "
        f"Budgets from {c['budget_source_version']} · "
        f"Run {payload.get('csc_run_id', '')[:8]} · "
        f"{datetime.fromisoformat(payload.get('run_at').replace('Z', '+00:00')).strftime('%d %b %Y')} · "
        "Informational only, not a formal assessment."
    ) if payload.get("run_at") else "Informational only, not a formal assessment."
    story.extend(wayly_footer(disclaimer=footer_disclaimer))

    doc.build(story)
    return buf.getvalue()
