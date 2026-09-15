"""Branded PDF artefacts for the CHSP Tools (CHSP-DL-1).

Two server-authoritative renderers used by both web and mobile:
  * ``render_invoice_pdf`` — a full CHSP invoice analysis (header, money split,
    spend by category, line-by-line table with rate-check flags, next steps).
  * ``render_fee_check_pdf`` — a single per-unit Fee Check result.

Both reuse ``lib.pdf_branding`` so they carry the Wayly brand and match the
Decoded-statement / report artefacts.
"""
from __future__ import annotations

import io
import re
from typing import Any, Dict, List

from reportlab.platypus import Paragraph, Spacer
from reportlab.lib.units import mm

from lib import pdf_branding as pb

_CAT_LABEL = {
    "clinical": "Clinical care",
    "personal": "Personal care & respite",
    "everyday": "Everyday living",
    "social": "Social & transport",
    "other": "Other",
}
_VAR_LABEL = {"within": "OK", "minor": "Slightly high", "material": "Overcharged"}
_VAR_KIND = {"within": "green", "minor": "amber", "material": "red"}


def _ddmm(v: Any) -> str:
    if not v:
        return ""
    s = str(v)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return s


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def _esc(s: Any) -> str:
    return (str(s if s is not None else "")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def render_invoice_pdf(payload: Dict[str, Any]) -> bytes:
    header = payload.get("header") or {}
    totals = payload.get("totals") or {}
    line_items: List[Dict[str, Any]] = payload.get("line_items") or []
    by_category = payload.get("by_category") or []
    plain_summary = payload.get("plain_summary") or ""
    next_steps = [s for s in (payload.get("next_steps") or []) if s]
    flags_count = int(payload.get("flags_count") or 0)

    styles = pb.get_styles()
    subtitle_bits = [
        header.get("provider_name"),
        f"Invoice {header.get('invoice_reference')}" if header.get("invoice_reference") else None,
        header.get("client_name"),
    ]
    period = None
    if header.get("period_start"):
        period = _ddmm(header.get("period_start"))
        if header.get("period_end"):
            period += f" to {_ddmm(header.get('period_end'))}"
    if period:
        subtitle_bits.append(period)
    subtitle = " · ".join(_esc(b) for b in subtitle_bits if b)

    story: List[Any] = []
    story += pb.header_block(
        styles, title="CHSP invoice review", subtitle=subtitle,
        disclaimer="Reviewed by Wayly. Check figures against your original CHSP invoice.",
    )

    story.append(pb.kpi_tiles(styles, [
        ("Total billed", pb.fmt_money(totals.get("grand_total")), None),
        ("Your contribution", pb.fmt_money(totals.get("client_contribution")), None),
        ("Government subsidy", pb.fmt_money(totals.get("government_subsidy")), None),
        ("Lines flagged", str(flags_count), "above your saved rate" if flags_count else "none"),
    ]))
    story.append(Spacer(1, 8))

    if plain_summary:
        story.append(pb.cream_card(
            [Paragraph(_esc(plain_summary), styles["body"])],
            left_accent=pb.INK,
        ))
        story.append(Spacer(1, 8))

    # Spend by category.
    if by_category:
        story.append(Paragraph("Where the money went", styles["h2"]))
        rows = [[_esc(c.get("label") or _CAT_LABEL.get(c.get("key"), "Other")), pb.fmt_money(c.get("amount"))]
                for c in by_category]
        pw_pts = pb.page_width_mm() * mm
        story.append(pb.data_table(["Category", "Amount"], rows,
                                    col_widths=[pw_pts * 0.7, pw_pts * 0.3]))
        story.append(Spacer(1, 8))

    # Line by line.
    story.append(Paragraph(f"Line by line ({len(line_items)})", styles["h2"]))
    headers = ["Service", "Dates", "Units", "Unit rate", "Amount", "Rate check"]
    rows = []
    for li in line_items:
        st_lbl = li.get("description") or (li.get("service_type") or "").replace("_", " ").title()
        units = li.get("units")
        unit_str = "" if units is None else f"{units}{(' ' + li.get('unit_label')) if li.get('unit_label') else ''}"
        vs = li.get("variance_status")
        rate_chk = pb.badge_html(_VAR_LABEL.get(vs, ""), _VAR_KIND.get(vs, "grey")) if vs else ""
        rows.append([
            _esc(st_lbl), _esc(li.get("dates") or ""), _esc(unit_str),
            pb.fmt_money(li.get("unit_rate")) if li.get("unit_rate") is not None else "",
            pb.fmt_money(li.get("amount")),
            Paragraph(rate_chk, styles["body"]) if rate_chk else "",
        ])
    story.append(pb.data_table(headers, rows, right_align_from=2))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f'<b>Total</b> &nbsp; <font color="{pb.INK_HEX}">{pb.fmt_money(totals.get("grand_total"))}</font>',
        styles["body"],
    ))

    if next_steps:
        story.append(Spacer(1, 8))
        story.append(Paragraph("What to do next", styles["h2"]))
        for s in next_steps[:4]:
            story.append(Paragraph(f"• {_esc(s)}", styles["body"]))

    story += pb.footer_block(styles)

    buf = io.BytesIO()
    doc = pb.make_doc(buf, title="CHSP invoice review")
    doc.build(story)
    out = buf.getvalue()
    buf.close()
    return out


def render_fee_check_pdf(payload: Dict[str, Any]) -> bytes:
    fields = payload.get("fields") or {}
    result = payload.get("result") or {}
    styles = pb.get_styles()

    provider = fields.get("provider_name") or "CHSP provider"
    service = fields.get("service_type_label") or (fields.get("service_type") or "").replace("_", " ").title()
    ref = fields.get("invoice_reference")
    subtitle_bits = [provider, service, (f"Invoice {ref}" if ref else None)]
    subtitle = " · ".join(_esc(b) for b in subtitle_bits if b)

    story: List[Any] = []
    story += pb.header_block(
        styles, title="CHSP fee check", subtitle=subtitle,
        disclaimer="Checked by Wayly against your provider's agreed per-unit rate.",
    )

    headline = result.get("verdict_headline") or result.get("verdict_label") or "Checked"
    explanation = result.get("verdict_explanation") or ""
    overall = result.get("overall_verdict")
    accent = {"within": pb.SUCCESS, "minor": pb.ALERT, "material": pb.ERROR}.get(overall, pb.INK)
    verdict_block = [Paragraph(_esc(headline), styles["h2"])]
    if explanation:
        verdict_block.append(Paragraph(_esc(explanation), styles["body"]))
    story.append(pb.cream_card(verdict_block, left_accent=accent))
    story.append(Spacer(1, 8))

    if result.get("degraded"):
        story.append(Paragraph(
            "No verdict yet — add your provider's agreed per-unit rate to get a clear answer.",
            styles["body"],
        ))
    else:
        story.append(pb.kpi_tiles(styles, [
            ("Billed per unit", pb.fmt_money(result.get("billed_per_unit")), None),
            ("Agreed rate", pb.fmt_money(result.get("agreed_rate") or fields.get("agreed_rate")), None),
            ("Expected amount", pb.fmt_money(result.get("expected_amount")), None),
            ("Billed amount", pb.fmt_money(result.get("billed_amount") or fields.get("billed_amount")), None),
        ]))
        story.append(Spacer(1, 8))
        rows = [
            ["Rate check", _VAR_LABEL.get(result.get("rate_tier"), result.get("rate_tier_label") or "—"),
             _esc(result.get("rate_explanation") or "")],
            ["Units check", _VAR_LABEL.get(result.get("units_tier"), result.get("units_tier_label") or "—"),
             _esc(result.get("units_explanation") or "")],
        ]
        story.append(pb.data_table(["Check", "Result", "What it means"], rows, right_align_from=3))

    story += pb.footer_block(styles)

    buf = io.BytesIO()
    doc = pb.make_doc(buf, title="CHSP fee check")
    doc.build(story)
    out = buf.getvalue()
    buf.close()
    return out
