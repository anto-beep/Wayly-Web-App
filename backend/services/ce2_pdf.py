"""CE-2 v1.1 · One-to-two-page PDF export.

Server-side reportlab renderer emitted by ``POST /api/ce2/pdf``. Deliberately
mirrors the eight on-screen result sections plus the HCP-comparison table
(when applicable). Layout is intentionally simple, print-ready A4 with 2 cm
margins so caregivers can hand it to a My Aged Care case manager or a
financial adviser.

Design choices:

* No graphics library, just reportlab.platypus Paragraph + Table. Files stay
  under 40 KB, which keeps email attachments cheap.
* Wayly palette matches the on-screen result screen (deep teal + sage).
* No em / en dashes in any string (Wayly voice rules).
* Every dollar figure passes through ``_fmt_aud`` which rounds half-up and
  emits ``$1,234.56``.
"""
from __future__ import annotations

from datetime import date, datetime
from io import BytesIO
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (
    KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)

from services.wayly_pdf_branding import wayly_header, wayly_footer


# Wayly palette (matches frontend --kindred-* tokens + shared branding module)
TEAL = colors.HexColor("#0E4D52")
CREAM = colors.HexColor("#FBF8F3")
CLAY = colors.HexColor("#A5512B")
SAGE = colors.HexColor("#425F47")
INK = colors.HexColor("#1C2B2D")
MUTED = colors.HexColor("#524B42")
BORDER = colors.HexColor("#E7E0D5")
BAND_YOU = colors.HexColor("#0E4D52")
BAND_GOVT = colors.HexColor("#425F47")


def _fmt_aud(x: Optional[float]) -> str:
    if x is None:
        return "N/A"
    try:
        return f"${float(x):,.2f}"
    except (TypeError, ValueError):
        return "N/A"


def _fmt_pct(x: Optional[float]) -> str:
    if x is None:
        return "N/A"
    return f"{float(x):.1f}%"


def _styles() -> Dict[str, ParagraphStyle]:
    base = ParagraphStyle(
        "base", fontName="Helvetica", fontSize=10, leading=13, textColor=INK,
    )
    return {
        "h1": ParagraphStyle("h1", parent=base, fontName="Helvetica-Bold", fontSize=22, leading=26, textColor=TEAL, spaceAfter=6),
        "h2": ParagraphStyle("h2", parent=base, fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=TEAL, spaceAfter=4, spaceBefore=10),
        "eyebrow": ParagraphStyle("eyebrow", parent=base, fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=MUTED, spaceAfter=2),
        "body": ParagraphStyle("body", parent=base, spaceAfter=6),
        "muted": ParagraphStyle("muted", parent=base, textColor=MUTED, fontSize=9, leading=12),
        "small_muted": ParagraphStyle("small_muted", parent=base, textColor=MUTED, fontSize=8, leading=11),
        "footer": ParagraphStyle("footer", parent=base, textColor=MUTED, fontSize=8, leading=11, alignment=1),
        "hero_big": ParagraphStyle("hero_big", parent=base, fontName="Helvetica-Bold", fontSize=32, leading=36, textColor=colors.white, alignment=0),
        "hero_sub": ParagraphStyle("hero_sub", parent=base, fontSize=10, leading=13, textColor=colors.white),
        "hero_eyebrow": ParagraphStyle("hero_eyebrow", parent=base, fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=colors.white, spaceAfter=4),
    }


def render_ce2_pdf(*, result: Dict[str, Any], person_name: Optional[str] = None) -> bytes:
    """Render the CE-2 result to a PDF buffer and return the bytes.

    ``result`` is the JSON output from ``POST /api/ce2/calculate`` (already
    JSON-safe, no dataclasses).
    """
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        topMargin=1.6 * cm, bottomMargin=1.6 * cm,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        title="Wayly Contribution Estimate", author="Wayly",
    )
    S = _styles()
    story = []

    # Wayly-branded header, logo wordmark, tool title, generated date.
    subtitle = f"For {person_name}" if person_name else None
    story.extend(wayly_header(tool_title="Contribution Estimator", subtitle=subtitle))

    story.extend(_hero(result, person_name, S))
    story.append(Spacer(1, 0.35 * cm))

    if not result.get("is_fee_exempt"):
        story.extend(_govt_share_bar(result, S))
        story.append(Spacer(1, 0.3 * cm))

    if not result.get("is_fee_exempt"):
        story.extend(_rate_breakdown(result, S))
        story.append(Spacer(1, 0.25 * cm))

    if result.get("applicable_lifetime_cap") is not None:
        story.extend(_safety_net(result, S))
        story.append(Spacer(1, 0.25 * cm))

    if not result.get("is_fee_exempt") and result.get("contribution_post_october_2026_weekly") is not None:
        story.extend(_october(result, S))
        story.append(Spacer(1, 0.25 * cm))

    hcp = result.get("hcp_comparison")
    show_hcp = hcp and result.get("show_hcp_comparison") in ("always", "toggle")
    if show_hcp:
        story.extend(_hcp_comparison(result, hcp, S))
        story.append(Spacer(1, 0.25 * cm))

    story.extend(_how_calculated(result, S))
    story.extend(wayly_footer(
        disclaimer=(
            "Plain-English estimate for household planning. "
            "Your final rate is set by Services Australia based on your assessed income and assets. "
            "Not legal or financial advice."
        ),
    ))

    doc.build(story)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Sections
# ---------------------------------------------------------------------------

def _hero(result: Dict[str, Any], person_name: Optional[str], S) -> list:
    if result.get("is_fee_exempt"):
        eyebrow = "Fee exempt"
        big = "You will not pay any contribution."
        sub = ("Because you were on a Home Care Package before 12 September 2024 and paid no fees, "
               "the no-worse-off rule guarantees a permanent zero. No lifetime cap applies.")
        bg = SAGE
    elif result.get("range_mode"):
        who = f"{person_name}'s" if person_name else "Your"
        eyebrow = f"{who} estimated weekly contribution"
        lo = _fmt_aud(result.get("range_min_weekly"))
        hi = _fmt_aud(result.get("range_max_weekly"))
        big = f"{lo} to {hi} per week"
        sub = "Because your final classification is not yet known, the range spans Class 3, Class 5 and Class 8 outcomes."
        bg = TEAL
    else:
        who = f"{person_name}'s" if person_name else "Your"
        eyebrow = f"{who} estimated weekly contribution"
        big = f"{_fmt_aud(result.get('contribution_weekly'))} per week"
        annual = _fmt_aud(result.get("contribution_annual"))
        quarterly = _fmt_aud(result.get("contribution_quarterly"))
        govt = _fmt_aud(result.get("government_share_annual"))
        govt_pct = _fmt_pct(result.get("government_share_percent"))
        sub = (f"{annual} a year, or {quarterly} a quarter. The Australian Government pays {govt} "
               f"a year of your care, which is {govt_pct} of the total.")
        bg = TEAL

    cell = [
        [Paragraph(eyebrow, S["hero_eyebrow"])],
        [Paragraph(big, S["hero_big"])],
        [Paragraph(sub, S["hero_sub"])],
    ]
    t = Table(cell, colWidths=[16.4 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("TEXTCOLOR", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 22),
        ("RIGHTPADDING", (0, 0), (-1, -1), 22),
        ("TOPPADDING", (0, 0), (0, 0), 18),
        ("TOPPADDING", (0, 1), (0, 1), 4),
        ("TOPPADDING", (0, 2), (0, 2), 8),
        ("BOTTOMPADDING", (0, -1), (-1, -1), 18),
        ("BOX", (0, 0), (-1, -1), 0, colors.white),
    ]))
    return [t]


def _govt_share_bar(result: Dict[str, Any], S) -> list:
    """Government / participant share bar.

    The visual bar carries NO text inside the segments so it can't clip when
    one side is much narrower than the other (e.g. a full pensioner where
    government pays 100%). All text lives in the legend row underneath.
    """
    govt_pct = float(result.get("government_share_percent") or 0)
    you_pct = max(0.0, 100.0 - govt_pct)
    total_w = 16.4 * cm
    # Give any nonzero segment at least a 1mm sliver so the fill is visible.
    govt_w = (govt_pct / 100.0) * total_w if govt_pct > 0 else 0.001 * cm
    you_w = (you_pct / 100.0) * total_w if you_pct > 0 else 0.001 * cm

    if you_pct <= 0.0001:
        bar_data = [[""]]
        col_widths = [total_w]
    elif govt_pct <= 0.0001:
        bar_data = [[""]]
        col_widths = [total_w]
    else:
        bar_data = [["", ""]]
        col_widths = [govt_w, you_w]

    bar = Table(bar_data, colWidths=col_widths, rowHeights=[0.9 * cm])
    if you_pct <= 0.0001:
        bar.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), BAND_GOVT),
            ("BOX", (0, 0), (-1, -1), 0, colors.white),
        ]))
    elif govt_pct <= 0.0001:
        bar.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), BAND_YOU),
            ("BOX", (0, 0), (-1, -1), 0, colors.white),
        ]))
    else:
        bar.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), BAND_GOVT),
            ("BACKGROUND", (1, 0), (1, 0), BAND_YOU),
            ("BOX", (0, 0), (-1, -1), 0, colors.white),
        ]))

    legend_style_govt = ParagraphStyle(
        "legend_govt", parent=S["body"], fontSize=9, leading=12, textColor=INK,
    )
    legend_style_you = ParagraphStyle(
        "legend_you", parent=S["body"], fontSize=9, leading=12, textColor=INK,
    )
    legend = Table(
        [[
            Paragraph(
                f"<font color='#425F47'><b>&#9679; Government</b></font> "
                f"{_fmt_pct(govt_pct)}, {_fmt_aud(result.get('government_share_annual'))} / year",
                legend_style_govt,
            ),
            Paragraph(
                f"<font color='#0E4D52'><b>&#9679; You</b></font> "
                f"{_fmt_pct(you_pct)}, {_fmt_aud(result.get('contribution_annual'))} / year",
                legend_style_you,
            ),
        ]],
        colWidths=[8.2 * cm, 8.2 * cm],
    )
    legend.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [
        Paragraph("WHO PAYS WHAT", S["eyebrow"]),
        bar,
        legend,
    ]


def _rate_breakdown(result: Dict[str, Any], S) -> list:
    ind_rate = result.get("independence_rate")
    ev_rate = result.get("everyday_rate")
    is_nwo = bool(result.get("is_no_worse_off"))
    header_row = [
        Paragraph("<b>Clinical care</b>", S["muted"]),
        Paragraph("<b>Independence</b>", S["muted"]),
        Paragraph("<b>Everyday Living</b>", S["muted"]),
    ]
    value_row = [
        Paragraph("<font size='16'><b>0%</b></font>", S["body"]),
        Paragraph(f"<font size='16'><b>{_fmt_pct(ind_rate)}</b></font>", S["body"]),
        Paragraph(f"<font size='16'><b>{_fmt_pct(ev_rate)}</b></font>", S["body"]),
    ]
    caption_row = [
        Paragraph("Always free", S["small_muted"]),
        Paragraph("Personal care, meals", S["small_muted"]),
        Paragraph("Cleaning, transport", S["small_muted"]),
    ]
    t = Table([header_row, value_row, caption_row],
              colWidths=[5.47 * cm, 5.47 * cm, 5.46 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    if is_nwo:
        prose = ("You are on the no-worse-off track, which caps your rates at 25% for both Independence "
                 "and Everyday Living. Clinical care is always free.")
    else:
        prose = (f"Under standard arrangements, Independence services (personal care, meals) cost you "
                 f"{_fmt_pct(ind_rate)} and Everyday Living services (cleaning, transport, gardening) "
                 f"cost you {_fmt_pct(ev_rate)}. Clinical care is always fully funded by the government.")
    return [Paragraph("YOUR RATES BY SERVICE TYPE", S["eyebrow"]), t, Spacer(1, 0.15 * cm), Paragraph(prose, S["body"])]


def _safety_net(result: Dict[str, Any], S) -> list:
    cap = result.get("applicable_lifetime_cap")
    body = (f"Once your combined Independence and Everyday Living contributions reach "
            f"<b>{_fmt_aud(cap)}</b> across your lifetime, you pay nothing further. Clinical care never "
            f"counts towards this cap.")
    return [
        Paragraph("LIFETIME CAP", S["eyebrow"]),
        Paragraph(body, S["body"]),
    ]


def _october(result: Dict[str, Any], S) -> list:
    now_w = _fmt_aud(result.get("contribution_weekly"))
    after_w = _fmt_aud(result.get("contribution_post_october_2026_weekly"))
    saving = float(result.get("contribution_weekly") or 0) - float(result.get("contribution_post_october_2026_weekly") or 0)
    body = (f"From 1 October 2026, personal care becomes fully government-funded under the Aged Care Act 2024. "
            f"Your weekly contribution changes from <b>{now_w}</b> to <b>{after_w}</b>")
    if saving > 0.005:
        body += f", a saving of about <b>{_fmt_aud(saving)}</b> per week or <b>{_fmt_aud(saving * 52)}</b> per year."
    else:
        body += "."
    tail = ("Personal care is assumed to be about 40% of your Independence spend. This is Wayly's "
            "illustrative default; if your care mix differs, the saving will differ too.")
    return [
        Paragraph("FROM 1 OCTOBER 2026", S["eyebrow"]),
        Paragraph(body, S["body"]),
        Paragraph(tail, S["small_muted"]),
    ]


def _hcp_comparison(result: Dict[str, Any], hcp: Dict[str, Any], S) -> list:
    header = [
        Paragraph("<b>Your would-be HCP cost</b>", S["muted"]),
        Paragraph("<b>Support at Home cost</b>", S["muted"]),
        Paragraph("<b>Difference</b>", S["muted"]),
    ]
    row_weekly = [
        Paragraph(f"<font size='13'><b>{_fmt_aud(hcp.get('hcp_weekly'))}</b></font> / week", S["body"]),
        Paragraph(f"<font size='13'><b>{_fmt_aud(hcp.get('sah_weekly'))}</b></font> / week", S["body"]),
        Paragraph(f"<font size='13'><b>{_fmt_aud(abs(hcp.get('delta_weekly') or 0))}</b></font> "
                  f"{'less' if (hcp.get('delta_weekly') or 0) < 0 else 'more'} / week", S["body"]),
    ]
    row_annual = [
        Paragraph(f"{_fmt_aud(hcp.get('hcp_annual'))} / year", S["small_muted"]),
        Paragraph(f"{_fmt_aud(hcp.get('sah_annual'))} / year", S["small_muted"]),
        Paragraph(f"{_fmt_aud(abs(hcp.get('delta_annual') or 0))} "
                  f"{'less' if (hcp.get('delta_annual') or 0) < 0 else 'more'} / year", S["small_muted"]),
    ]
    t = Table([header, row_weekly, row_annual], colWidths=[5.47 * cm, 5.47 * cm, 5.46 * cm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CREAM),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, BORDER),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    bdf = _fmt_aud(hcp.get("basic_daily_fee_daily"))
    itcf = _fmt_aud(hcp.get("itcf_daily"))
    footnote = (f"HCP figures use the last-indexation (September 2025) fees for a Level "
                f"{hcp.get('hcp_level')} package: Basic Daily Fee {bdf} per day plus Income-Tested "
                f"Care Fee {itcf} per day. Support at Home superseded HCP on 1 November 2025.")
    return [
        Paragraph("COMPARED TO YOUR HOME CARE PACKAGE", S["eyebrow"]),
        t,
        Spacer(1, 0.15 * cm),
        Paragraph(footnote, S["small_muted"]),
    ]


def _how_calculated(result: Dict[str, Any], S) -> list:
    citations = result.get("source_citations") or []
    lines = [
        Paragraph("HOW THIS WAS CALCULATED", S["eyebrow"]),
        Paragraph(
            "1. Income reduction = (your assessable income minus income-free area) x 50%.<br/>"
            "2. Asset reduction = (your assessable assets minus assets-free area) x 7.8%.<br/>"
            "3. Max reduction = (income limit minus income-free area) x 50%.<br/>"
            "4. Input rate = max(income reduction, asset reduction) / max reduction x 100.<br/>"
            "5. Independence rate = input rate x 0.45 + 5%.<br/>"
            "6. Everyday rate = input rate x 0.625 + 17.5%.",
            S["small_muted"],
        ),
    ]
    if citations:
        rows = [[Paragraph("<b>Constant</b>", S["small_muted"]),
                 Paragraph("<b>Value</b>", S["small_muted"]),
                 Paragraph("<b>Source</b>", S["small_muted"])]]
        for c in citations[:6]:
            src = c.get("source_url") or ""
            src_short = "DoH / BT" if "bt.com" in src or "health.gov" in src else "Registry"
            rows.append([
                Paragraph(c.get("label", ""), S["small_muted"]),
                Paragraph(c.get("value", ""), S["small_muted"]),
                Paragraph(src_short, S["small_muted"]),
            ])
        table = Table(rows, colWidths=[7.4 * cm, 4.5 * cm, 4.5 * cm])
        table.setStyle(TableStyle([
            ("LINEBELOW", (0, 0), (-1, 0), 0.4, BORDER),
            ("LINEBELOW", (0, -1), (-1, -1), 0.4, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ]))
        lines += [Spacer(1, 0.2 * cm), table]
    lines += [
        Spacer(1, 0.2 * cm),
        Paragraph(
            "Personal care is assumed to be 40% of your Independence spend. "
            "This is Wayly's illustrative default, not a published Department of Health figure.",
            S["small_muted"],
        ),
    ]
    return lines


def _footer(S) -> list:
    stamp = datetime.now().strftime("%d %B %Y")
    return [
        Paragraph(
            f"Generated by Wayly on {stamp}. Plain-English estimate for household planning. "
            "Your final rate is set by Services Australia based on your assessed income and assets. "
            "Not legal or financial advice.",
            S["footer"],
        ),
    ]
