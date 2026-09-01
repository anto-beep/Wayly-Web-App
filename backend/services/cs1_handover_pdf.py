"""CS-1 · Carer Handover Pack PDF renderer.

Produces a print-ready one-page-plus handover a primary carer can hand to a
backup carer, respite provider, or family member so care continues smoothly
while they are away.

Layout:
  1. Header:  "Carer handover pack, <participant name>"
  2. Emergency priorities panel (surfaced first, most important)
  3. Daily routines
  4. Key information
  5. Medical needs (only when the carer opted in)
  6. Backup contacts table (name / relationship / phone)
  7. Who can help with what table
  8. Footer: Wayly + not-clinical-advice disclaimer
"""
from __future__ import annotations

import io
from datetime import datetime, timezone
from typing import Any, Dict, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

TEAL = colors.HexColor("#0E4D52")
CREAM = colors.HexColor("#FBF8F3")
TERRACOTTA = colors.HexColor("#C0392B")


def _fmt_dt(v) -> str:
    if not v:
        return ""
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
        except Exception:
            return v[:16]
    if isinstance(v, datetime):
        return v.strftime("%d/%m/%Y %H:%M")
    return str(v)


def render_handover_pack_pdf(*, pack: Dict[str, Any], participant_name: str) -> bytes:
    """Return the handover pack PDF as raw bytes."""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()

    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=18, textColor=TEAL, spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=13, textColor=TEAL,
                        spaceAfter=4, spaceBefore=12)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10, leading=14,
                          textColor=colors.HexColor("#1E1E1E"))
    small = ParagraphStyle("small", parent=body, fontSize=9, textColor=colors.HexColor("#555555"))
    label = ParagraphStyle("label", parent=small, textColor=TEAL, fontName="Helvetica-Bold")

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=2.4 * cm, bottomMargin=2.4 * cm,
        title=f"Carer handover pack, {participant_name}",
    )

    def _tbl_style():
        return TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDD")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#EEE")),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ])

    story: List[Any] = []

    # Header
    story.append(Paragraph("Carer handover pack", h1))
    story.append(Paragraph(f"Caring for: <b>{participant_name}</b>", body))
    story.append(Paragraph(f"Generated: {_fmt_dt(datetime.now(timezone.utc))}", small))
    story.append(Spacer(1, 0.3 * cm))

    # 1. Emergency priorities (surfaced first)
    if pack.get("emergency_priorities"):
        story.append(Paragraph("If something goes wrong, do this first", h2))
        prio = Table(
            [[Paragraph(pack["emergency_priorities"], body)]],
            colWidths=[16.4 * cm], hAlign="LEFT",
        )
        prio.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FBEAE7")),
            ("BOX", (0, 0), (-1, -1), 0.8, TERRACOTTA),
            ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(prio)

    # 2. Daily routines
    if pack.get("my_routines"):
        story.append(Paragraph("Daily routines", h2))
        story.append(Paragraph(pack["my_routines"].replace("\n", "<br/>"), body))

    # 3. Key information
    if pack.get("my_key_information"):
        story.append(Paragraph("Key information", h2))
        story.append(Paragraph(pack["my_key_information"].replace("\n", "<br/>"), body))

    # 4. Medical needs (only when present, i.e. carer opted in)
    if pack.get("my_medical_needs"):
        story.append(Paragraph("Medical needs", h2))
        story.append(Paragraph(pack["my_medical_needs"].replace("\n", "<br/>"), body))

    # 5. Backup contacts
    contacts = pack.get("backup_contacts") or []
    contacts = [c for c in contacts if isinstance(c, dict) and (c.get("name") or c.get("phone"))]
    if contacts:
        story.append(Paragraph("Backup contacts", h2))
        rows: List[List[Any]] = [["Name", "Relationship", "Phone"]]
        for c in contacts:
            rows.append([
                Paragraph(str(c.get("name") or ""), small),
                Paragraph(str(c.get("relationship") or ""), small),
                Paragraph(str(c.get("phone") or ""), small),
            ])
        tbl = Table(rows, colWidths=[6 * cm, 5.4 * cm, 5 * cm], hAlign="LEFT")
        tbl.setStyle(_tbl_style())
        story.append(KeepTogether(tbl))

    # 6. Who can help with what
    helpers = pack.get("who_can_help_with_what") or []
    helpers = [h for h in helpers if isinstance(h, dict) and (h.get("who") or h.get("what"))]
    if helpers:
        story.append(Paragraph("Who can help with what", h2))
        rows2: List[List[Any]] = [["Who", "What they help with"]]
        for h in helpers:
            rows2.append([
                Paragraph(str(h.get("who") or ""), small),
                Paragraph(str(h.get("what") or ""), small),
            ])
        tbl2 = Table(rows2, colWidths=[6 * cm, 10.4 * cm], hAlign="LEFT")
        tbl2.setStyle(_tbl_style())
        story.append(KeepTogether(tbl2))

    if not any([
        pack.get("emergency_priorities"), pack.get("my_routines"),
        pack.get("my_key_information"), pack.get("my_medical_needs"),
        contacts, helpers,
    ]):
        story.append(Paragraph(
            "This handover pack is empty. Add routines, key information and "
            "backup contacts in Wayly, then download it again.", small))

    # Footer boilerplate
    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph(
        "This handover pack was generated by Wayly from information the primary "
        "carer recorded. It is not clinical or medical advice. Keep it somewhere "
        "your backup carer can find it.", small))

    def on_page(canvas, _doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.drawRightString(A4[0] - 1.8 * cm, 1.2 * cm,
                               f"Page {_doc.page}  ·  Wayly carer handover pack")
        canvas.restoreState()

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
