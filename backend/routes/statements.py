"""Server-rendered Decoded statement exports, PDF + CSV.

Both endpoints take a statement_id, scope to the caller's household, and
stream back a byte-identical file regardless of whether the caller is web
or mobile. This replaces the previous client-side jsPDF/print-popup PDF
and client-side CSV blob, so the two surfaces no longer drift.

Layout spec for the PDF (user-approved):
  - Header: "Decoded statement, {period}" + AI disclaimer
  - Summary: participant + provider + period, then 3 KPI tiles
    (Gross / Participant contribution / Government paid)
  - Line items table, 8 columns: Date · Service · Stream · Qty · Unit · Rate
    · Gross · Contrib. · Gov paid
  - Anomalies, one card per anomaly with severity badge, headline,
    detail, suggested action, dollar impact
  - Brand footer with generation date + AI provenance

The CSV mirrors the legacy `downloadDecodedAsCsv` helper so existing
spreadsheets keep working.
"""
from __future__ import annotations
import os
import csv
import io
import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from motor.motor_asyncio import AsyncIOMotorClient

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether,
    Image as RLImage,
)


# Wayly brand assets (resolved at import, fail-soft if absent)
_BRAND_LOGO_PATH = os.path.join(
    "/app", "frontend", "public", "branding", "png",
    "wayly-lockup-navy-1024.png",
)
if not os.path.exists(_BRAND_LOGO_PATH):
    # Lockup not bundled in this env, try mark only.
    _BRAND_LOGO_PATH = os.path.join(
        "/app", "frontend", "public", "branding", "png", "wayly-mark-512.png",
    )
    if not os.path.exists(_BRAND_LOGO_PATH):
        _BRAND_LOGO_PATH = None  # silently skip the logo block


# ---- DB handle ----
_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]


# ---- Auth + scoping (mirror server.py helpers without circular import) ----

async def _require_statement(statement_id: str, user_id: str) -> dict:
    """Look up statement, ensure caller's household owns it."""
    from server import _require_household  # type: ignore  # noqa: WPS433
    h = await _require_household(user_id)
    s = await db.statements.find_one(
        {"id": statement_id, "household_id": h["id"]}, {"_id": 0}
    )
    if not s:
        raise HTTPException(status_code=404, detail="Statement not found")
    return s


def _current_user_dep():
    """Late-bound dependency, defers the server.py import until first use."""
    from server import get_current_user_id  # type: ignore
    return get_current_user_id


# ---- Shared helpers ----

def _aud(n: Any) -> str:
    try:
        v = float(n or 0)
    except (TypeError, ValueError):
        v = 0.0
    return f"${v:,.2f}"


def _safe_filename(label: str) -> str:
    """Slugify a period label into a filename-safe token."""
    s = re.sub(r"[^\w\-]+", "-", (label or "statement").strip())
    return s.strip("-") or "statement"


def _fmt_ddmmyyyy(v) -> str:
    """Render a stored ISO date (YYYY-MM-DD) as DD/MM/YYYY for display in
    the decoded CSV and PDF. Storage stays ISO, only presentation swaps."""
    if not v:
        return ""
    s = str(v)
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(3)}/{m.group(2)}/{m.group(1)}"
    return s


def _line_item_view(li: dict) -> dict:
    # DEC-1 v5 · Phase 2b: prefer the v5 (quantity, unit) pair; fall back to
    # legacy `hours` (assumed to be unit='hr' per the read-time backfill).
    _qty = li.get("quantity")
    if _qty is None:
        _qty = li.get("units")
    if _qty is None:
        _qty = li.get("hours")
    _unit = li.get("unit")
    if not _unit:
        # Pre-v5 rows: hours>0 → 'hr'; hours==0 → unknown unit.
        try:
            _h = float(li.get("hours") or 0.0)
            _unit = "hr" if _h > 0 else ""
        except Exception:
            _unit = ""
    return {
        "date": _fmt_ddmmyyyy(li.get("date")),
        "service": (li.get("service_name")
                    or li.get("service_description")
                    or li.get("service_code")
                    or ""),
        "stream": li.get("stream") or "",
        "quantity": _qty,
        "unit": _unit,
        "hours": li.get("units", li.get("hours", "")),
        "unit_rate": li.get("unit_price", li.get("unit_rate", 0)),
        "gross": li.get("total", li.get("gross", 0)),
        "contribution": li.get("contribution_paid",
                               li.get("participant_contribution", 0)),
        "government_paid": li.get("government_paid", 0),
        "is_cancellation": bool(li.get("is_cancellation")),
        "worker": li.get("worker_name") or "",
        "notes": li.get("provider_notes") or "",
    }


def _fmt_qty_unit(li_view: dict) -> str:
    """DEC-1 v5 · Phase 2b: render `quantity + unit` for the PDF/CSV export.
    Returns "2.00 hr", "18 km", "1 session", or "" when nothing is known."""
    q = li_view.get("quantity")
    u = (li_view.get("unit") or "").strip()
    if q in (None, ""):
        return ""
    try:
        n = float(q)
    except (TypeError, ValueError):
        return ""
    if n <= 0:
        return ""
    if u == "hr":
        disp = f"{n:.2f}"
    elif n.is_integer():
        disp = f"{int(n)}"
    else:
        disp = f"{n:.2f}"
    return f"{disp} {u}".rstrip()


def _anomaly_view(a: dict) -> dict:
    return {
        "severity": (a.get("severity") or "").lower(),
        "rule": a.get("rule") or "",
        "title": a.get("headline") or a.get("title") or "",
        "detail": a.get("detail") or "",
        "dollar_impact": a.get("dollar_impact") or 0,
        "suggested_action": a.get("suggested_action") or "",
    }


# ---- PDF / CSV rendering ----

async def _render_pdf(statement_id: str, user_id: str) -> Response:
    s = await _require_statement(statement_id, user_id)
    line_items = [_line_item_view(li) for li in (s.get("line_items") or [])]
    anomalies = [_anomaly_view(a) for a in (s.get("anomalies") or [])]

    period = s.get("period_label") or s.get("filename") or "Statement"
    provider = s.get("provider_name") or ""

    # Participant: try the statement's own field, then look up the linked
    # participant doc. Both `display_name` and `name` are used across the
    # codebase, accept either.
    participant = (s.get("participant_name") or "").strip()
    if not participant and s.get("participant_id"):
        try:
            p = await db.participants.find_one(
                {"id": s["participant_id"]},
                {"_id": 0, "display_name": 1, "name": 1,
                 "first_name": 1, "last_name": 1},
            )
            if p:
                participant = (
                    p.get("display_name")
                    or p.get("name")
                    or " ".join(filter(None, [p.get("first_name"), p.get("last_name")]))
                    or ""
                ).strip()
        except Exception:
            pass

    total_gross = sum(float(li.get("gross") or 0) for li in line_items)
    total_contrib = sum(float(li.get("contribution") or 0) for li in line_items)
    total_gov = sum(float(li.get("government_paid") or 0) for li in line_items)
    # If the doc has its own summary, prefer that (provider-asserted totals).
    summary = s.get("summary_totals") or {}
    if isinstance(summary, dict):
        total_gross = float(summary.get("total_gross") or total_gross)
        total_contrib = float(summary.get("total_participant_contribution") or total_contrib)
        total_gov = float(summary.get("total_government_paid") or total_gov)

    # Build PDF
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=16 * mm, rightMargin=16 * mm,
        topMargin=14 * mm, bottomMargin=16 * mm,
        title=f"Decoded Statement: {period}",
        author="Wayly",
    )

    styles = getSampleStyleSheet()
    # ---- Wayly brand palette (matches /app/frontend/src/index.css) ----
    INK_HEX, INK = "#0E4D52", colors.HexColor("#0E4D52")          # teal-ink 600, primary brand
    TEXT_HEX, TEXT = "#1C2B2D", colors.HexColor("#1C2B2D")        # warm ink, body text
    GOLD_HEX, GOLD = "#A5512B", colors.HexColor("#A5512B")        # clay 500, accent / CTA
    SAGE_HEX, SAGE = "#425F47", colors.HexColor("#425F47")        # sage 600, secondary accent
    MUTED_HEX, MUTED = "#524B42", colors.HexColor("#524B42")      # neutral 700, muted body
    BORDER = colors.HexColor("#E7E0D5")                            # neutral 200, default border
    SURFACE_2 = colors.HexColor("#F4EFE7")                         # neutral 100, sunken tile bg
    BG = colors.HexColor("#FBF8F3")                                # neutral 50, warm off-white
    ALERT_HEX, ALERT = "#B7791F", colors.HexColor("#B7791F")      # warning dark
    ERROR_HEX, ERROR = "#C0392B", colors.HexColor("#C0392B")      # error base

    h1 = ParagraphStyle("h1", parent=styles["Heading1"], textColor=INK,
                       fontSize=18, leading=22, spaceAfter=2,
                       fontName="Helvetica-Bold")
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=INK,
                       fontSize=12, leading=15, spaceBefore=14, spaceAfter=6,
                       fontName="Helvetica-Bold")
    sub_hd = ParagraphStyle("sub", parent=styles["BodyText"], textColor=GOLD,
                           fontSize=11, leading=14, spaceAfter=2,
                           fontName="Helvetica-Bold")
    muted = ParagraphStyle("muted", parent=styles["BodyText"], textColor=MUTED,
                          fontSize=9, leading=11)
    body = ParagraphStyle("body", parent=styles["BodyText"], textColor=TEXT,
                         fontSize=10, leading=13)
    kpi_label = ParagraphStyle("kl", parent=body, textColor=MUTED,
                              fontSize=8, leading=10, spaceAfter=2,
                              fontName="Helvetica-Bold")
    kpi_val = ParagraphStyle("kv", parent=body, textColor=INK,
                            fontSize=14, leading=17, fontName="Helvetica-Bold")
    footer_st = ParagraphStyle("ft", parent=muted, fontSize=8,
                              textColor=MUTED, leading=10)

    flow = []

    # ---- Header row: Wayly lockup logo (left) + title block (right) ----
    title_block_cells = [Paragraph(f"Decoded Statement: {period}", h1)]
    if participant:
        title_block_cells.append(Paragraph(participant, sub_hd))
    if provider:
        title_block_cells.append(
            Paragraph(f"<font color=\"#524B42\">{provider}</font>", body)
        )
    title_block_cells.append(Paragraph(
        "Decoded by Wayly, AI-generated summary. Please verify against "
        "the original statement before acting.", muted,
    ))

    if _BRAND_LOGO_PATH:
        try:
            logo = RLImage(_BRAND_LOGO_PATH, width=34 * mm, height=12 * mm)
            logo.hAlign = "LEFT"
            header_tbl = Table(
                [[logo, title_block_cells]],
                colWidths=[36 * mm, 142 * mm],
            )
        except Exception:
            header_tbl = Table([[title_block_cells]], colWidths=[178 * mm])
    else:
        header_tbl = Table([[title_block_cells]], colWidths=[178 * mm])
    header_tbl.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.75, GOLD),
    ]))
    flow.append(header_tbl)

    # ---- Summary section ----
    flow.append(Paragraph("Summary", h2))
    meta_bits = []
    if participant: meta_bits.append(f"<b>Participant:</b> {participant}")
    if provider: meta_bits.append(f"<b>Provider:</b> {provider}")
    if period: meta_bits.append(f"<b>Period:</b> {period}")
    if meta_bits:
        flow.append(Paragraph(" &nbsp;·&nbsp; ".join(meta_bits), body))

    # KPI tiles
    kpi_cells = [[
        [Paragraph("GROSS TOTAL", kpi_label), Paragraph(_aud(total_gross), kpi_val)],
        [Paragraph("PARTICIPANT CONTRIBUTION", kpi_label), Paragraph(_aud(total_contrib), kpi_val)],
        [Paragraph("GOVERNMENT PAID", kpi_label), Paragraph(_aud(total_gov), kpi_val)],
    ]]
    kpi_tbl = Table(kpi_cells, colWidths=[60 * mm, 60 * mm, 60 * mm])
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), SURFACE_2),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LINEAFTER", (0, 0), (1, 0), 4, BG),
        ("LINEBELOW", (0, 0), (-1, 0), 2, GOLD),
    ]))
    flow.append(Spacer(1, 6))
    flow.append(kpi_tbl)

    # Line items table
    flow.append(Paragraph(f"Line items ({len(line_items)})", h2))
    if not line_items:
        flow.append(Paragraph("No line items extracted from this statement.", muted))
    else:
        header = ["Date", "Service", "Stream", "Qty · Unit", "Rate",
                  "Gross", "Contrib.", "Gov paid"]
        rows = [header]
        for li in line_items:
            svc = li["service"]
            if li["is_cancellation"]:
                svc = f"{svc}  (cancelled)"
            rows.append([
                li["date"],
                Paragraph(svc, body),
                li["stream"],
                _fmt_qty_unit(li),
                _aud(li["unit_rate"]) if li["unit_rate"] else "",
                _aud(li["gross"]),
                _aud(li["contribution"]) if li["contribution"] not in (None, "") else "",
                _aud(li["government_paid"]) if li["government_paid"] not in (None, "") else "",
            ])
        col_widths = [22 * mm, 55 * mm, 24 * mm, 20 * mm, 18 * mm,
                      20 * mm, 20 * mm, 20 * mm]
        items_tbl = Table(rows, colWidths=col_widths, repeatRows=1)
        items_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), INK),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TEXTCOLOR", (0, 1), (-1, -1), TEXT),
            ("LINEBELOW", (0, 0), (-1, 0), 1.5, GOLD),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG]),
            ("LINEBELOW", (0, 1), (-1, -2), 0.25, BORDER),
            ("LEFTPADDING", (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        flow.append(items_tbl)

    # Anomalies
    if anomalies:
        flow.append(Paragraph(f"Anomalies ({len(anomalies)})", h2))
        for a in anomalies:
            sev = (a["severity"] or "info").lower()
            if sev in ("alert", "high", "critical", "error"):
                border_color, sev_hex = ERROR, ERROR_HEX
            elif sev in ("warning", "warn", "medium"):
                border_color, sev_hex = ALERT, ALERT_HEX
            else:
                border_color, sev_hex = SAGE, SAGE_HEX
            cell_content = [
                Paragraph(
                    f'<font color="{sev_hex}" size="8"><b>{sev.upper()}</b></font> '
                    f'&nbsp; <font color="{INK_HEX}"><b>{a["title"]}</b></font>', body,
                ),
            ]
            if a["detail"]:
                cell_content.append(Paragraph(a["detail"], body))
            if a["suggested_action"]:
                cell_content.append(Paragraph(
                    f'<font color="{GOLD_HEX}"><i>&rarr; {a["suggested_action"]}</i></font>', body,
                ))
            if a["dollar_impact"]:
                cell_content.append(Paragraph(
                    f'<font color="{MUTED_HEX}" size="8">Estimated dollar impact: '
                    f'<b>{_aud(a["dollar_impact"])}</b></font>', body,
                ))
            tbl = Table([[cell_content]], colWidths=[178 * mm])
            tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE_2),
                ("LINEBEFORE", (0, 0), (0, -1), 3, border_color),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            flow.append(Spacer(1, 6))
            flow.append(KeepTogether(tbl))

    # Footer
    flow.append(Spacer(1, 16))
    today = datetime.now().strftime("%d %b %Y")
    flow.append(Paragraph(
        f'<font color="{INK_HEX}"><b>Wayly</b></font> &nbsp;·&nbsp; '
        f'Generated {today} &nbsp;·&nbsp; '
        'wayly.com.au &nbsp;·&nbsp; '
        'AI-generated summary, original statement remains the source of truth.',
        footer_st,
    ))

    doc.build(flow)
    pdf_bytes = buf.getvalue()
    buf.close()

    filename = f"{_safe_filename(period)}-decoded.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # Force every download to hit origin, these PDFs are
            # per-statement, per-user, and we never want a stale branded /
            # unbranded mix while we're iterating on layout. Also stops
            # Cloudflare's default edge cache from holding old copies.
            "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


async def _render_csv(statement_id: str, user_id: str) -> Response:
    s = await _require_statement(statement_id, user_id)
    line_items = [_line_item_view(li) for li in (s.get("line_items") or [])]
    anomalies = [_anomaly_view(a) for a in (s.get("anomalies") or [])]

    period = s.get("period_label") or s.get("filename") or "statement"
    participant = s.get("participant_name") or ""
    provider = s.get("provider_name") or ""
    total_gross = sum(float(li.get("gross") or 0) for li in line_items)
    total_contrib = sum(float(li.get("contribution") or 0) for li in line_items)
    total_gov = sum(float(li.get("government_paid") or 0) for li in line_items)

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["Wayly, Decoded Statement"])
    if participant: w.writerow(["Participant", participant])
    if provider: w.writerow(["Provider", provider])
    w.writerow(["Period", period])
    w.writerow(["Gross total", f"{total_gross:.2f}"])
    w.writerow(["Participant contribution", f"{total_contrib:.2f}"])
    w.writerow(["Government paid", f"{total_gov:.2f}"])
    w.writerow([])
    w.writerow([
        "Date", "Service code", "Service", "Stream", "Hours/Units", "Unit rate",
        "Gross", "Participant contribution", "Government paid",
        "Cancelled", "Worker", "Provider notes",
    ])
    for li_orig, li in zip((s.get("line_items") or []), line_items):
        w.writerow([
            li["date"],
            li_orig.get("service_code") or "",
            li["service"],
            li["stream"],
            li["hours"],
            li["unit_rate"],
            li["gross"],
            li["contribution"],
            li["government_paid"],
            "Y" if li["is_cancellation"] else "",
            li["worker"],
            li["notes"],
        ])
    if anomalies:
        w.writerow([])
        w.writerow(["Anomalies"])
        w.writerow(["Severity", "Rule", "Headline", "Detail",
                    "Dollar impact", "Suggested action"])
        for a in anomalies:
            w.writerow([a["severity"], a["rule"], a["title"], a["detail"],
                       a["dollar_impact"], a["suggested_action"]])

    body = buf.getvalue().encode("utf-8")
    filename = f"statement-decoded-{_safe_filename(period)}.csv"
    return Response(
        content=body,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
        },
    )


def build_statements_router():
    """Return an APIRouter wired up with the live get_current_user_id dep
    from server.py. Lazy import avoids the circular module load at startup."""
    from server import get_current_user_id  # noqa: WPS433, intentional lazy import

    r = APIRouter(prefix="/statements", tags=["statements-export"])

    @r.get("/{statement_id}/decoded.pdf")
    async def _pdf(statement_id: str,
                   user_id: str = Depends(get_current_user_id)):
        return await _render_pdf(statement_id, user_id)

    @r.get("/{statement_id}/decoded.csv")
    async def _csv(statement_id: str,
                   user_id: str = Depends(get_current_user_id)):
        return await _render_csv(statement_id, user_id)

    return r
