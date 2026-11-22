"""Switch Provider notice, PDF download (UI-1 §9 follow-up).

Builds a Wayly-branded PDF of the draft notice letter the user composes
in the 5-step wizard. Uses the existing reportlab pipeline in
backend/lib/pdf_branding.py.
"""
from __future__ import annotations
import io
import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from lib.pdf_branding import make_doc, header_block, footer_block, get_styles
from reportlab.platypus import Paragraph, Spacer
from reportlab.lib.units import mm


class NoticeRequest(BaseModel):
    participant_name: Optional[str] = Field(default=None, max_length=120)
    current_provider: str = Field(min_length=1, max_length=200)
    last_service_date: Optional[str] = Field(default=None)  # YYYY-MM-DD
    reason_short: Optional[str] = Field(default=None, max_length=400)
    sender_name: Optional[str] = Field(default=None, max_length=120)
    sender_relationship: Optional[str] = Field(default=None, max_length=120)
    sender_contact: Optional[str] = Field(default=None, max_length=200)


def _format_au_date(iso: Optional[str]) -> str:
    if not iso:
        return "[last service date]"
    try:
        d = datetime.fromisoformat(iso)
    except Exception:
        return iso
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


def build_switch_pdf_router():
    from server import get_current_user_id  # lazy

    r = APIRouter(tags=["switch-provider-pdf"])

    @r.post("/provider-switch/notice.pdf")
    async def build_pdf(body: NoticeRequest, user_id: str = Depends(get_current_user_id)):
        buf = io.BytesIO()
        doc = make_doc(buf, title="Notice of Provider Change")
        styles = get_styles()
        today = datetime.now(timezone.utc).strftime("%d/%m/%Y")
        last_day = _format_au_date(body.last_service_date)
        participant = body.participant_name or "the participant"

        flow = []
        flow += header_block(styles, title="Notice of Provider Change", subtitle="Under Support at Home")
        flow.append(Paragraph(today, styles["BodySmall"]))
        flow.append(Spacer(1, 10))
        flow.append(Paragraph(body.current_provider, styles["BodyLg"]))
        flow.append(Paragraph("[Provider address]", styles["Body"]))
        flow.append(Spacer(1, 14))
        flow.append(Paragraph(f"Dear {body.current_provider},", styles["Body"]))
        flow.append(Spacer(1, 8))
        flow.append(Paragraph(
            f"I am writing on behalf of {participant} to let you know that we have decided to move to a different Support at Home provider.",
            styles["Body"],
        ))
        if body.reason_short:
            flow.append(Paragraph(f"In short, our reason is: {body.reason_short}.", styles["Body"]))
        else:
            flow.append(Paragraph("We have made this decision after weighing up our options carefully.", styles["Body"]))
        flow.append(Spacer(1, 8))
        flow.append(Paragraph(
            f"Please treat this letter as formal notice. We would like the last day of service with you to be <b>{last_day}</b>.",
            styles["Body"],
        ))
        flow.append(Spacer(1, 8))
        flow.append(Paragraph("In line with the Support at Home program rules, please:", styles["Body"]))
        for line in [
            "Confirm in writing the last day you will deliver services.",
            "Confirm the balance of unspent budget that will carry across.",
            "Share a copy of the most recent care plan and any clinical notes with the new provider on request.",
            "Confirm there are no exit fees, transfer fees, or final invoices to settle outside published service rates.",
        ]:
            flow.append(Paragraph(f"&nbsp;&nbsp;&bull; {line}", styles["Body"]))
        flow.append(Spacer(1, 10))
        flow.append(Paragraph(
            f"Thank you for the services you have provided to date. We would like the handover to be as smooth as possible for {participant}.",
            styles["Body"],
        ))
        flow.append(Spacer(1, 14))
        flow.append(Paragraph("Kind regards,", styles["Body"]))
        flow.append(Spacer(1, 24))
        flow.append(Paragraph(body.sender_name or "[Your name]", styles["Body"]))
        flow.append(Paragraph(body.sender_relationship or f"[Your relationship to {participant}]", styles["BodySmall"]))
        flow.append(Paragraph(body.sender_contact or "[Your contact details]", styles["BodySmall"]))
        flow += footer_block(styles)

        doc.build(flow)
        pdf = buf.getvalue()
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={
                "Content-Disposition": 'attachment; filename="wayly-switch-provider-notice.pdf"',
            },
        )

    return r
