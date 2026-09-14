"""build_sample_louisa_davids_2026_07.py — CPR-1 §11.1 fixture.

Fictional care plan for Louisa Davids, Classification 8, under Glorious
Services Pty Ltd. Content is fictional; values chosen to trigger the
known-good set of golden findings per the spec §11.1.

Corrected per CE-2 v1.1 Phase 0 §2.5 (Louisa is canonically Class 8, provider
Glorious Services, full pensioner, single, homeowner, not grandfathered).

Runnable: ``python /app/backend/tests/fixtures/care_plans/build_sample_louisa_davids_2026_07.py``

Emits a PDF at ``sample_louisa_davids_2026_07.pdf`` alongside this file.
"""
from __future__ import annotations

import os
import sys

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)


TEAL = colors.HexColor("#0E4D52")
CREAM = colors.HexColor("#FBF8F3")

OUTDIR = os.path.dirname(__file__)
FILENAME = "sample_louisa_davids_2026_07.pdf"


def build() -> str:
    path = os.path.join(OUTDIR, FILENAME)
    styles = getSampleStyleSheet()
    H1 = ParagraphStyle(
        "H1", parent=styles["Heading1"],
        fontName="Helvetica-Bold", textColor=TEAL, fontSize=16, spaceAfter=8,
    )
    H2 = ParagraphStyle(
        "H2", parent=styles["Heading2"],
        fontName="Helvetica-Bold", textColor=TEAL, fontSize=12, spaceAfter=6,
    )
    BODY = ParagraphStyle(
        "BODY", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=10, leading=14, spaceAfter=4,
    )
    SMALL = ParagraphStyle(
        "SMALL", parent=styles["BodyText"],
        fontName="Helvetica", fontSize=8, leading=11, textColor=colors.grey,
    )

    story = []
    story.append(Paragraph("Support at Home Care Plan", H1))
    story.append(Paragraph("Provider: Glorious Services Pty Ltd", BODY))
    story.append(Spacer(1, 6))

    header_rows = [
        ["Participant:", "Louisa Davids"],
        ["Participant ID:", "SAH-500711"],
        ["Effective from:", "01/07/2026"],
        ["Effective to:", "30/09/2026"],
        ["Classification:", "8"],
        ["Quarterly budget:", "$19,527"],
        ["Care partner:", "Andrew Davids (son)"],
        ["Cultural background:", "Not stated"],
    ]
    story.append(Table(header_rows, colWidths=[4 * cm, 12 * cm]))
    story.append(Spacer(1, 12))

    story.append(Paragraph("Narrative", H2))
    story.append(Paragraph(
        "Louisa Davids is an 82-year-old woman living alone in her own home. "
        "She has Type 2 diabetes managed with insulin injections twice daily, and mild "
        "cognitive impairment documented by her GP. She reports feeling socially "
        "isolated since her husband passed away last year and does not currently "
        "attend any community activities.",
        BODY,
    ))
    story.append(Paragraph(
        "Louisa is independent for most activities of daily living but requires "
        "prompting for personal hygiene and support with grocery shopping.",
        BODY,
    ))
    story.append(Spacer(1, 6))

    story.append(Paragraph("Services Delivered", H2))
    rows = [
        ["Service", "Category", "Frequency", "Amount"],
        ["Personal care assistance", "Independence", "1.5 hrs / week", "$117.00"],
        ["Domestic assistance", "Everyday Living", "1 hr / week", "$68.00"],
        ["Nursing (insulin support)", "Clinical", "0.5 hr / fortnight", "$69.00"],
        ["Care management", "Administration", "10% of services", "$25.40"],
    ]
    t = Table(rows, colWidths=[6 * cm, 4 * cm, 3 * cm, 3 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TEAL),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("ALIGN", (2, 0), (-1, -1), "RIGHT"),
        ("GRID", (0, 0), (-1, -1), 0.3, colors.grey),
        ("BACKGROUND", (0, -1), (-1, -1), CREAM),
    ]))
    story.append(t)
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "Allied health, social support, and transport are not currently included "
        "in this plan.",
        BODY,
    ))
    story.append(Spacer(1, 8))

    story.append(Paragraph("Goals", H2))
    story.append(Paragraph(
        "To be recorded at the next review meeting.",
        BODY,
    ))
    story.append(Spacer(1, 12))

    story.append(Paragraph(
        "Prepared by Glorious Services Pty Ltd under the Aged Care Act 2024 and "
        "the Support at Home Program Manual.",
        SMALL,
    ))

    SimpleDocTemplate(
        path, pagesize=A4,
        leftMargin=1.5 * cm, rightMargin=1.5 * cm,
        topMargin=1.5 * cm, bottomMargin=1.5 * cm,
    ).build(story)
    return path


# ---------------------------------------------------------------------------
# Text version — used by unit tests that don't want a PDF round-trip.
# ---------------------------------------------------------------------------

SAMPLE_TEXT = """
SUPPORT AT HOME CARE PLAN — Glorious Services Pty Ltd

Participant: Louisa Davids
Participant ID: SAH-500711
Effective from: 01/07/2026
Effective to: 30/09/2026
Classification: 8
Quarterly budget: $19,527
Care partner: Andrew Davids (son)
Cultural background: Not stated

NARRATIVE
Louisa Davids is an 82-year-old woman living alone in her own home. She has
Type 2 diabetes managed with insulin injections twice daily, and mild
cognitive impairment documented by her GP. She reports feeling socially
isolated since her husband passed away last year and does not currently
attend any community activities. Louisa is independent for most activities
of daily living but requires prompting for personal hygiene and support
with grocery shopping.

SERVICES DELIVERED
Personal care assistance    Independence     1.5 hrs / week    $117.00
Domestic assistance         Everyday Living  1 hr / week       $68.00
Nursing (insulin support)   Clinical         0.5 hr / fortnight $69.00
Care management             Administration   10% of services   $25.40

Allied health, social support, and transport are not currently included in
this plan.

GOALS
To be recorded at the next review meeting.

Prepared by Glorious Services Pty Ltd under the Aged Care Act 2024 and
the Support at Home Program Manual.
"""


# ---------------------------------------------------------------------------
# Golden findings — the finding_keys that the analysis engine is expected
# to produce on the sample plan under the initial reference snapshot.
# ---------------------------------------------------------------------------

GOLDEN_FINDING_KEYS = [
    "rights_no_social_support_despite_isolation",       # R4
    "clinical_no_allied_health_despite_diabetes",       # NQS 3
    "clinical_nursing_hours_light_for_insulin",         # AC Rules s.194-5
    "choice_no_participant_goal",
    "timebound_straddles_oct_2026",                     # deterministic
    "info_no_after_hours_contact",
]


if __name__ == "__main__":
    try:
        out = build()
        print(f"[BUILT] Louisa Davids sample plan -> {out}")
    except Exception as e:  # noqa: BLE001
        print(f"BUILD FAILED: {e}", file=sys.stderr)
        sys.exit(1)
