"""CMP-1 · Complaint Evidence Bundle PDF renderer.

Produces a print-ready PDF families can hand directly to ACQSC, the
Aged Care Ombudsman, a lawyer, or a provider senior manager.

Layout:
  1. Header:  "Complaint evidence bundle, <participant name>"
  2. Complaint summary panel (type, severity, provider, opened date, current stage)
  3. What happened (subject_matter_summary + desired_outcome)
  4. Stage history table (stage / entered / exited / outcome / notes)
  5. Confirmed evidence items list (each with source_type + source_id + note)
  6. Elder-abuse safeguard footer (if flag set)
  7. Footer: Wayly + Aged Care Act 2024 + not-legal-advice disclaimer
"""
from __future__ import annotations

import io
from datetime import datetime
from typing import Any, Dict, List, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
)

from services.wayly_pdf_branding import wayly_header, wayly_footer  # noqa: F401, reserved for v2

TEAL = colors.HexColor("#0E4D52")
CREAM = colors.HexColor("#FBF8F3")
CLAY = colors.HexColor("#A5512B")
SAGE = colors.HexColor("#425F47")
TERRACOTTA = colors.HexColor("#C0392B")


STAGE_LABEL = {
    "drafting": "Drafting",
    "stage_1_internal_provider": "Stage 1 · Internal provider",
    "stage_2_provider_senior": "Stage 2 · Provider senior mgmt",
    "stage_3_acqsc_referral": "Stage 3 · ACQSC referral",
    "stage_4_ombudsman_referral": "Stage 4 · Ombudsman referral",
    "stage_5_appeals": "Stage 5 · Appeals",
    "closed_resolved": "Closed · resolved",
    "closed_abandoned": "Closed · abandoned",
}

SOURCE_LABEL = {
    "statement": "Statement",
    "invoice": "Invoice",
    "invoice_check_result": "Invoice check result",
    "care_plan_review": "Care plan review",
    "contribution_estimate": "Contribution estimate",
    "contribution_reconciliation": "Contribution reconciliation",
    "correspondence": "Correspondence",
    "voice_check": "Voice check",
    "user_note": "User note",
    "external_upload": "External upload",
}


def _fmt_dt(v) -> str:
    if not v:
        return ","
    if isinstance(v, str):
        try:
            return datetime.fromisoformat(v.replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
        except Exception:
            return v[:16]
    if isinstance(v, datetime):
        return v.strftime("%d/%m/%Y %H:%M")
    return str(v)


def _fmt_date(v) -> str:
    if not v:
        return ","
    s = str(v)[:10]
    try:
        return datetime.fromisoformat(s).strftime("%d/%m/%Y")
    except Exception:
        return s


def render_complaint_bundle_pdf(
    *,
    complaint: Dict[str, Any],
    evidence_items: List[Dict[str, Any]],
    participant_name: str,
) -> bytes:
    """Return the PDF as raw bytes."""
    buf = io.BytesIO()
    styles = getSampleStyleSheet()

    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=18, textColor=TEAL,
                        spaceAfter=6)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=13, textColor=TEAL,
                        spaceAfter=4, spaceBefore=12)
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10, leading=13,
                          textColor=colors.HexColor("#1E1E1E"))
    small = ParagraphStyle("small", parent=body, fontSize=9, textColor=colors.HexColor("#555555"))
    label = ParagraphStyle("label", parent=small, textColor=colors.HexColor("#0E4D52"),
                           fontName="Helvetica-Bold")

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=2.4 * cm, bottomMargin=2.4 * cm,
        title=f"Complaint bundle, {participant_name}",
    )

    story: List[Any] = []

    # Header
    story.append(Paragraph("Complaint evidence bundle", h1))
    story.append(Paragraph(f"Participant: <b>{participant_name}</b>", body))
    story.append(Paragraph(f"Generated: {_fmt_dt(datetime.utcnow())}", small))
    story.append(Spacer(1, 0.4 * cm))

    # 1. Summary panel
    story.append(Paragraph("Complaint summary", h2))
    summary_rows = [
        ["Provider", complaint.get("provider_name") or ","],
        ["Complaint type", (complaint.get("complaint_type") or "").replace("_", " ").title()],
        ["Severity", (complaint.get("severity") or "").replace("_", " ").title()],
        ["Current stage", STAGE_LABEL.get(complaint.get("current_stage", ""), complaint.get("current_stage", ","))],
        ["Desired outcome", (complaint.get("desired_outcome") or "").replace("_", " ").title()],
        ["Opened", _fmt_dt(complaint.get("created_at"))],
        ["Incident window", f"{_fmt_date(complaint.get('incident_start_date'))}, {_fmt_date(complaint.get('incident_end_date')) if complaint.get('incident_end_date') else ('ongoing' if complaint.get('is_ongoing') else ',')}"],
    ]
    if complaint.get("final_resolution"):
        summary_rows.append(["Final resolution", complaint["final_resolution"].replace("_", " ").title()])
        summary_rows.append(["Resolution date", _fmt_date(complaint.get("final_resolution_date"))])
    summary_tbl = Table(summary_rows, colWidths=[4.8 * cm, 12 * cm], hAlign="LEFT")
    summary_tbl.setStyle(TableStyle([
        ("FONT", (0, 0), (-1, -1), "Helvetica", 9),
        ("TEXTCOLOR", (0, 0), (0, -1), TEAL),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (0, -1), CREAM),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDD")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#EEE")),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(summary_tbl)

    # 2. What happened
    story.append(Paragraph("What happened", h2))
    story.append(Paragraph(complaint.get("subject_matter_summary") or ",", body))
    if complaint.get("desired_outcome_notes"):
        story.append(Spacer(1, 0.2 * cm))
        story.append(Paragraph("Desired outcome (notes)", label))
        story.append(Paragraph(complaint["desired_outcome_notes"], body))

    # 3. Stage history
    stage_history = complaint.get("stage_history") or []
    if stage_history:
        story.append(Paragraph("Stage history", h2))
        rows: List[List[Any]] = [["Stage", "Entered", "Exited", "Outcome"]]
        for h in stage_history:
            rows.append([
                Paragraph(STAGE_LABEL.get(h.get("stage", ""), h.get("stage", ",")), small),
                _fmt_dt(h.get("entered_at")),
                _fmt_dt(h.get("exited_at")) if h.get("exited_at") else "current",
                Paragraph((h.get("outcome_at_exit") or ",").replace("_", " "), small),
            ])
        tbl = Table(rows, colWidths=[5 * cm, 3.5 * cm, 3.5 * cm, 4.5 * cm], hAlign="LEFT")
        tbl.setStyle(TableStyle([
            ("FONT", (0, 0), (-1, -1), "Helvetica", 8),
            ("BACKGROUND", (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#DDD")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#EEE")),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(tbl)

    # 4. Evidence items (confirmed only for the printable pack)
    confirmed = [e for e in evidence_items if e.get("user_confirmed_for_inclusion")]
    proposed_only = [e for e in evidence_items if not e.get("user_confirmed_for_inclusion")]

    story.append(Paragraph(f"Confirmed evidence ({len(confirmed)} item{'s' if len(confirmed) != 1 else ''})", h2))
    if confirmed:
        for i, e in enumerate(confirmed, 1):
            block: List[Any] = [
                Paragraph(f"{i}. {SOURCE_LABEL.get(e.get('source_type', ''), e.get('source_type', 'Item'))}", label),
                Paragraph(f"Reference: <b>{e.get('source_id') or ','}</b>", small),
            ]
            if e.get("notes"):
                block.append(Spacer(1, 0.1 * cm))
                block.append(Paragraph(e["notes"], body))
            block.append(Spacer(1, 0.3 * cm))
            story.append(KeepTogether(block))
    else:
        story.append(Paragraph(
            "No evidence items were confirmed for inclusion. Consider reviewing "
            "the bundle in Wayly and confirming the items relevant to this complaint.",
            small,
        ))
    if proposed_only:
        story.append(Paragraph(
            f"({len(proposed_only)} additional item{'s' if len(proposed_only) != 1 else ''} proposed but not confirmed, not included in this pack.)",
            small,
        ))

    # 5. Elder-abuse safeguard footer (only when relevant)
    if complaint.get("contains_elder_abuse_indicators"):
        story.append(Spacer(1, 0.4 * cm))
        story.append(Paragraph("Safety resources", h2))
        story.append(Paragraph(
            "This complaint contains indicators the person receiving care may be at risk. "
            "If there is immediate danger, phone <b>000</b>. For confidential guidance, "
            "the <b>Elder Abuse Helpline</b> is <b>1800 353 374</b>. "
            "<b>Lifeline</b> is available 24/7 on <b>13 11 14</b>. "
            "The <b>Aged Care Quality and Safety Commission</b> is <b>1800 951 822</b>.",
            body,
        ))

    # 6. Boilerplate footer
    story.append(Spacer(1, 0.6 * cm))
    story.append(Paragraph(
        "This bundle was generated by Wayly. It is a compilation of information the "
        "participant or their family has already recorded, not legal or clinical "
        "advice. Recipients may find it useful as a starting point for a formal "
        "response under the Aged Care Act 2024.",
        small,
    ))

    def on_page(canvas, _doc):
        # Just page numbers, wayly_header/footer are flowable-based, not canvas callbacks
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(colors.HexColor("#888888"))
        canvas.drawRightString(A4[0] - 1.8 * cm, 1.2 * cm,
                                f"Page {_doc.page}  ·  Wayly complaint bundle")
        canvas.restoreState()

    doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
    return buf.getvalue()
