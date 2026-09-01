"""Server-authoritative decoded-statement artefact generator (DOC-PARITY-1 v2).

ONE generation path for the decoded-statement PDF and CSV. Both the web and
mobile clients POST the decode payload and download these exact bytes, so the
two surfaces are hash-identical (acceptance test 1) and carry every figure and
piece of metadata (test 4). Dates render DD/MM/YYYY (test 8); findings render
in canonical band order, fully expanded (Workstream B.3).
"""
from __future__ import annotations

import csv
import io
import re
from typing import Any, Dict, List

from reportlab.platypus import Paragraph, Spacer
from reportlab.lib.units import mm

from lib import pdf_branding as pb

_STREAM_LABEL = {
    "Clinical": "Clinical",
    "Independence": "Independence",
    "EverydayLiving": "Everyday Living",
    "ATHM": "AT-HM (assistive tech & home mods)",
    "CareMgmt": "Care Management",
}
_BAND_ORDER = ["high", "medium", "low", "informational"]
_BAND_HEADER = {"high": "High priority", "medium": "Medium", "low": "Low", "informational": "Informational"}


def _ddmm(v: Any) -> str:
    if not v:
        return ""
    s = str(v)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    m = re.match(r"(\d{2})[/-](\d{2})[/-](\d{4})", s)
    if m:
        return f"{m.group(1)}/{m.group(2)}/{m.group(3)}"
    return s


def _band_of(sev: Any) -> str:
    s = (sev or "").strip().lower()
    if s in ("info", "informational", "advisory"):
        return "informational"
    if s in ("high", "medium", "low"):
        return s
    return "low"


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def _esc(s: Any) -> str:
    return (str(s or "")).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _meta(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Normalise the naming metadata from a decode payload."""
    ext = payload.get("extracted") or {}
    summ = (payload.get("audit") or {}).get("statement_summary") or {}
    return {
        "participant_name": summ.get("participant_name") or ext.get("participant_name"),
        "provider_name": summ.get("provider") or ext.get("provider_name"),
        "period_start": ext.get("period_start"),
        "period_end": ext.get("period_end"),
        "period_label": summ.get("period") or ext.get("statement_period"),
    }


def render_decoded_csv(payload: Dict[str, Any]) -> str:
    ext = payload.get("extracted") or {}
    items = ext.get("line_items") or []
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Date", "Service", "Code", "Stream", "Qty", "Unit", "Rate", "Gross", "You paid", "Govt paid"])
    for li in items:
        w.writerow([
            _ddmm(li.get("date")),
            li.get("service_description") or "",
            li.get("service_code") or "",
            _STREAM_LABEL.get(li.get("stream"), li.get("stream") or ""),
            li.get("quantity") if li.get("quantity") is not None else "",
            li.get("unit") or "",
            f"{_num(li.get('unit_rate')):.2f}" if li.get("unit_rate") else "",
            f"{_num(li.get('gross')):.2f}",
            f"{_num(li.get('participant_contribution')):.2f}",
            f"{_num(li.get('government_paid')):.2f}",
        ])
    return buf.getvalue()


def render_decoded_pdf(payload: Dict[str, Any]) -> bytes:
    ext = payload.get("extracted") or {}
    audit = payload.get("audit") or {}
    summ = audit.get("statement_summary") or {}
    anomalies = audit.get("anomalies") or []
    streams = audit.get("stream_breakdown") or []
    items = ext.get("line_items") or []
    styles = pb.get_styles()

    subtitle_bits = [
        summ.get("period") or ext.get("statement_period") or "Statement",
        summ.get("participant_name") or ext.get("participant_name"),
        summ.get("classification"),
        summ.get("provider") or ext.get("provider_name"),
    ]
    cadence = summ.get("cadence")
    if cadence and cadence != "irregular":
        subtitle_bits.append(cadence[:1].upper() + cadence[1:])
    subtitle = " · ".join(_esc(b) for b in subtitle_bits if b)

    story: List[Any] = []
    story += pb.header_block(
        styles, title="Decoded statement", subtitle=subtitle,
        disclaimer="Decoded by Wayly. Verify figures against your original provider statement.",
    )

    # KPI tiles
    budget_remaining = summ.get("adjusted_budget_remaining")
    if budget_remaining is None:
        budget_remaining = summ.get("budget_remaining")
    story.append(pb.kpi_tiles(styles, [
        ("Gross billed", pb.fmt_money(summ.get("total_gross")), None),
        ("Your contribution", pb.fmt_money(summ.get("total_participant_contribution")), None),
        ("Government paid", pb.fmt_money(summ.get("total_government_paid")), None),
        ("Budget remaining", pb.fmt_money(budget_remaining) if budget_remaining is not None else ", ", None),
    ]))
    story.append(Spacer(1, 8))

    # Care management fee headline
    if summ.get("care_management_fee"):
        story.append(Paragraph(
            f'Care management fee this period: <b>{pb.fmt_money(summ.get("care_management_fee"))}</b>',
            styles["body"]))
        story.append(Spacer(1, 6))

    # Budget continuity
    opening = ext.get("opening_balance") or ext.get("rollover_from_prior_quarter")
    allocation = ext.get("quarterly_allocation_received") or ext.get("quarterly_budget_total")
    closing = ext.get("closing_balance") or ext.get("remaining_quarterly_budget")
    if sum(1 for v in (opening, allocation, closing) if v not in (None, "")) >= 2:
        story.append(Paragraph("Budget continuity", styles["h3"]))
        story.append(pb.data_table(
            ["Opening balance", "Quarterly allocation", "Closing balance"],
            [[pb.fmt_money(opening), pb.fmt_money(allocation), pb.fmt_money(closing)]],
            right_align_from=0,
        ))
        story.append(Spacer(1, 8))

    # Plain-English summary
    if payload.get("summary"):
        story.append(Paragraph("In plain English", styles["h3"]))
        for para in re.split(r"\n{2,}", str(payload["summary"]).strip()):
            story.append(Paragraph(_esc(para), styles["body"]))
        story.append(Spacer(1, 8))

    # Findings — canonical band order, fully expanded
    if anomalies:
        story.append(Paragraph("What we found", styles["h2"]))
        by_band: Dict[str, List[dict]] = {b: [] for b in _BAND_ORDER}
        for a in anomalies:
            by_band[_band_of(a.get("severity"))].append(a)
        for band in _BAND_ORDER:
            group = by_band[band]
            if not group:
                continue
            story.append(Spacer(1, 4))
            story.append(Paragraph(
                f'{pb.badge_html(_BAND_HEADER[band], band)} &nbsp; ({len(group)})', styles["body"]))
            for a in group:
                inner: List[Any] = [
                    Paragraph(f'<b>{_esc(a.get("headline"))}</b>', styles["body"]),
                ]
                if a.get("detail"):
                    inner.append(Paragraph(_esc(a.get("detail")), styles["muted"]))
                if _num(a.get("dollar_impact")) > 0:
                    inner.append(Paragraph(f'Potential impact: <b>{pb.fmt_money(a.get("dollar_impact"))}</b>', styles["body"]))
                for e in (a.get("evidence") or []):
                    inner.append(Paragraph(f'▸ {_esc(e)}', styles["tiny"]))
                if a.get("suggested_action"):
                    inner.append(Paragraph(f'→ {_esc(a.get("suggested_action"))}', styles["body"]))
                accent = {"high": pb.ERROR, "medium": pb.ALERT, "low": pb.SAGE, "informational": pb.SAGE}.get(band, pb.BORDER)
                story.append(pb.cream_card(inner, left_accent=accent))
                story.append(Spacer(1, 4))
        story.append(Spacer(1, 8))

    # Stream breakdown
    if streams:
        story.append(Paragraph("Stream breakdown", styles["h3"]))
        story.append(pb.data_table(
            ["Stream", "Items", "You paid", "Gross"],
            [[_STREAM_LABEL.get(s.get("stream"), s.get("stream") or ""),
              str(s.get("line_item_count") or 0),
              pb.fmt_money(s.get("participant_contribution")),
              pb.fmt_money(s.get("gross_total"))] for s in streams],
            right_align_from=1,
        ))
        story.append(Spacer(1, 8))

    # Full line-item table
    if items:
        story.append(Paragraph(f"Line items ({len(items)})", styles["h3"]))
        rows = []
        for li in items:
            qty_unit = ""
            if li.get("quantity") is not None and li.get("unit"):
                qty_unit = f'{li.get("quantity")} {li.get("unit")}'
            rows.append([
                _ddmm(li.get("date")),
                _esc(li.get("service_description") or ""),
                _STREAM_LABEL.get(li.get("stream"), li.get("stream") or ""),
                qty_unit,
                pb.fmt_money(li.get("unit_rate")) if li.get("unit_rate") else ", ",
                pb.fmt_money(li.get("gross")),
                pb.fmt_money(li.get("participant_contribution")),
                pb.fmt_money(li.get("government_paid")),
            ])
        pw = pb.page_width_mm() * mm
        widths = [w * pw for w in (0.11, 0.30, 0.15, 0.09, 0.09, 0.09, 0.09, 0.08)]
        story.append(pb.data_table(
            ["Date", "Service", "Stream", "Qty", "Rate", "Gross", "You paid", "Govt paid"],
            rows, col_widths=widths, right_align_from=4,
        ))

    # Deterministic "generated" marker so the PDF is hash-identical across
    # renders of the same decode (DOC-PARITY-1 acceptance test 1). Derived from
    # the statement period, not the wall clock.
    _gen = _ddmm(ext.get("period_end") or ext.get("period_start")) or "this period"
    story += pb.footer_block(styles, generated=_gen)

    buf = io.BytesIO()
    doc = pb.make_doc(buf, title="Wayly decoded statement")
    from reportlab import rl_config as _rl
    _prev_invariant = _rl.invariant
    _rl.invariant = 1
    try:
        doc.build(story)
    finally:
        _rl.invariant = _prev_invariant
    return buf.getvalue()
