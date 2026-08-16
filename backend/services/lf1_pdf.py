"""LF-1 letter PDF renderer (WS7 §output-format switcher · pdf).

Renders the generated draft into an A4 PDF suitable for printing and
posting. Kept in a standalone module so the tests can call it without
touching the FastAPI stack.

The design mirrors the PPC-1 v2 PDF renderer: Wayly palette, tabular
header, section headings, and a footer with disclaimer + generation
timestamp.
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

TEAL = colors.HexColor("#0E4D52")
CREAM = colors.HexColor("#FBF8F3")
CLAY = colors.HexColor("#A5512B")
INK = colors.HexColor("#1C2B2D")
MUTED = colors.HexColor("#524B42")


def _esc(text: str | None) -> str:
    """Escape user-provided text for safe embedding inside a ReportLab Paragraph.

    Only escapes the three characters that break ReportLab's mini-HTML parser.
    Callers pass the escaped result into f-strings alongside intentional
    ``<b>`` / ``<br/>`` tags.
    """
    if text is None:
        return ""
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _p(text: str, style) -> Paragraph:
    """Wrap text into a Paragraph. Caller is responsible for escaping user content."""
    return Paragraph(text or "", style)


def render_letter_pdf(
    *,
    subject: str,
    body: str,
    cover_note: dict,
    sender_display_name: str | None,
    sender_authority_basis: str | None,
    sender_email: str | None,
    include_opan_footer: bool,
    archetype: str,
    situation_label: str | None,
) -> bytes:
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=2.2 * cm,
        rightMargin=2.2 * cm,
        topMargin=1.8 * cm,
        bottomMargin=1.8 * cm,
        title=f"Wayly, {subject}",
        author="Wayly",
    )

    st_header = ParagraphStyle(
        "hdr", fontName="Helvetica-Bold", fontSize=11, textColor=TEAL,
        leading=14, spaceAfter=4,
    )
    st_subhead = ParagraphStyle(
        "sub", fontName="Helvetica", fontSize=9, textColor=MUTED,
        leading=12, spaceAfter=2,
    )
    st_body = ParagraphStyle(
        "body", fontName="Helvetica", fontSize=11, textColor=INK,
        leading=15, spaceAfter=8, alignment=0,  # left
    )
    st_label = ParagraphStyle(
        "label", fontName="Helvetica-Bold", fontSize=8, textColor=MUTED,
        leading=11, spaceAfter=2,
    )
    st_subject = ParagraphStyle(
        "subj", fontName="Helvetica-Bold", fontSize=13, textColor=TEAL,
        leading=17, spaceAfter=8,
    )
    st_footer = ParagraphStyle(
        "footer", fontName="Helvetica", fontSize=8, textColor=MUTED,
        leading=11, spaceAfter=4,
    )
    st_opan = ParagraphStyle(
        "opan", fontName="Helvetica-Oblique", fontSize=9, textColor=INK,
        leading=12, spaceAfter=4,
    )

    story: list[Any] = []

    # Wayly-branded header, wordmark, tool title, generated date.
    situation_line = situation_label or archetype.replace("_", " ").title()
    story.extend(wayly_header(
        tool_title="Letters and Follow-ups",
        subtitle=situation_line,
        content_width_cm=16.6,
    ))

    # Header: sender + recipient columns.
    header_table = Table(
        [
            [
                _p(f"<b>From</b><br/>{_esc(sender_display_name)}", st_subhead),
                _p(
                    f"<b>To</b><br/>{_esc(cover_note.get('entity_name') or 'Recipient')}",
                    st_subhead,
                ),
            ],
            [
                _p(
                    _esc(sender_authority_basis or "")
                    + (f"<br/>{_esc(sender_email)}" if sender_email else ""),
                    st_subhead,
                ),
                _p(_recipient_address_lines(cover_note), st_subhead),
            ],
        ],
        colWidths=[8.5 * cm, 8.5 * cm],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 0.6 * cm))

    # Situation label + date.
    now = datetime.now().strftime("%d %B %Y")
    story.append(_p(f"{now}<br/><i>{_esc(situation_label or archetype.title())}</i>", st_subhead))
    story.append(Spacer(1, 0.3 * cm))

    # Subject line.
    story.append(_p(_esc(subject), st_subject))

    # Body paragraphs.
    for para in (body or "").split("\n\n"):
        cleaned = para.strip()
        if cleaned:
            story.append(_p(_esc(cleaned).replace("\n", "<br/>"), st_body))

    # OPAN footer (WS9 escalation / complaint archetype).
    if include_opan_footer:
        story.append(Spacer(1, 0.4 * cm))
        story.append(_p("<b>Reference:</b> Older Persons Advocacy Network (OPAN), 1800 700 600. "
                        "Independent advocacy is available to older Australians under the Statement "
                        "of Rights, section 3 of the Aged Care Act 2024.", st_opan))

    # cc list.
    ccs = cover_note.get("cc_recipients") or []
    if ccs:
        story.append(Spacer(1, 0.2 * cm))
        cc_labels = ", ".join(f"{_esc(c['label'])} ({_esc(c['phone'])})" for c in ccs)
        story.append(_p(f"<b>cc:</b> {cc_labels}", st_subhead))

    # Wayly-branded footer with disclaimer.
    story.extend(wayly_footer(
        disclaimer=(
            "This letter was drafted by an AI assistant with your intake. "
            "Review it in full before sending. Wayly Letters and Follow-ups is "
            "a drafting assistant, not legal advice."
        ),
        content_width_cm=16.6,
    ))

    doc.build(story)
    buf.seek(0)
    return buf.getvalue()


def _recipient_address_lines(cover_note: dict) -> str:
    lines: list[str] = []
    if cover_note.get("postal_address"):
        lines.append(_esc(cover_note["postal_address"]))
    if cover_note.get("email"):
        lines.append(_esc(cover_note["email"]))
    if cover_note.get("portal_url"):
        lines.append(_esc(cover_note["portal_url"]))
    if cover_note.get("phone"):
        lines.append(_esc(cover_note["phone"]))
    return "<br/>".join(lines) or "&nbsp;"
