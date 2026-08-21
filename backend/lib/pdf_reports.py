"""Wayly, server-side PDF renderers for all 8 generated reports.

Each `render_<report_type>(data, *, report_title, report_id, generated_at,
landscape)` function takes the same `data: dict` that the legacy Jinja
templates consumed and emits a fully-branded PDF as bytes. The dispatcher
`render_report(rtype, data, ...)` is what `reports_routes._generate_report`
calls instead of running Jinja+headless Chrome.

Data shapes follow what the existing builders in `reports_routes.py` already
produce , see `_build_household_summary`, `_build_quarterly_budget`, etc.
"""
from __future__ import annotations
import io
from typing import Any, Optional

from reportlab.platypus import (
    Paragraph, Spacer, PageBreak, Table, TableStyle, KeepTogether,
)
from reportlab.lib.units import mm

from lib.pdf_branding import (
    INK_HEX, GOLD_HEX, MUTED_HEX, SAGE_HEX, ERROR_HEX, ALERT_HEX, SUCCESS_HEX,
    INK, GOLD, MUTED, SAGE, ERROR, ALERT, SUCCESS, SURFACE_2, BG, BORDER,
    LOGO_PATH,
    get_styles, make_doc, header_block, footer_block,
    kpi_tiles, data_table, cream_card, badge_html, severity_badge,
    traffic_bar, fmt_money, fmt_date, fmt_int, page_width_mm,
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------
def _participant_caregiver_line(data: dict) -> str:
    p = data.get("participant") or {}
    h = data.get("household") or {}
    bits = []
    name = " ".join(filter(None, [p.get("first_name"), p.get("last_name")])).strip()
    if name:
        bits.append(name)
    if p.get("classification") or h.get("classification"):
        bits.append(f"Classification {p.get('classification') or h.get('classification')}")
    if h.get("provider_name"):
        bits.append(h["provider_name"])
    return " · ".join(bits)


def _exec_summary_card(data: dict, styles, landscape: bool = False):
    txt = data.get("exec_summary")
    if not txt:
        return None
    return cream_card([
        Paragraph("Summary", styles["h3"]),
        Paragraph(str(txt), styles["body"]),
    ], landscape=landscape)


# ---------------------------------------------------------------------------
# 1) HOUSEHOLD_SUMMARY
# ---------------------------------------------------------------------------
def render_household_summary(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []

    flow.extend(header_block(
        styles, title=report_title,
        caregiver=_participant_caregiver_line(data) or None,
    ))

    q = data.get("quarter") or {}
    stats = data.get("stats") or {}

    flow.append(kpi_tiles(styles, [
        (f"Budget used · {q.get('label', '')}",
         f"{q.get('pct', 0)}%",
         f"{fmt_money(q.get('spent'))} of {fmt_money(q.get('budget'))}"),
        ("Services this quarter", fmt_int(stats.get("services_count")), None),
        ("Anomalies flagged", fmt_int(stats.get("anomalies_count")),
         (stats.get("anomalies_severity") or "").upper()),
        ("Open concerns", fmt_int(stats.get("open_concerns")), None),
    ]))

    s = _exec_summary_card(data, styles)
    if s: flow.append(s)

    # Active services + Care team (two-up tables)
    flow.append(Paragraph("Active services", styles["h2"]))
    services = data.get("active_services") or []
    if services:
        rows = [[s.get("service") or "",
                 s.get("worker") or "",
                 s.get("stream") or "",
                 fmt_money(s.get("rate")) if s.get("rate") else ""]
                for s in services]
        flow.append(data_table(
            ["Service", "Worker", "Stream", "Rate"], rows,
            col_widths=[70 * mm, 50 * mm, 38 * mm, 20 * mm],
            right_align_from=3,
        ))
    else:
        flow.append(Paragraph("No active services recorded.", styles["muted"]))

    flow.append(Paragraph("Care team", styles["h2"]))
    team = data.get("care_team") or []
    if team:
        rows = []
        for m in team:
            name = m.get("name") or ""
            if m.get("is_emergency"):
                name = f"{name} {badge_html('EMERGENCY', 'red')}"
            rows.append([
                Paragraph(name, styles["body"]),
                m.get("role") or "",
                m.get("phone") or "",
            ])
        flow.append(data_table(
            ["Name", "Role", "Phone"], rows,
            col_widths=[80 * mm, 48 * mm, 50 * mm], right_align_from=3,
        ))
    else:
        flow.append(Paragraph("No care team members recorded.", styles["muted"]))

    flow.append(Paragraph("Upcoming", styles["h2"]))
    nv = data.get("next_visit") or {}
    na = data.get("next_athm") or {}
    upcoming_lines = []
    if nv:
        upcoming_lines.append(Paragraph(
            f"<b>Next scheduled visit:</b> {fmt_date(nv.get('starts_at'))} · "
            f"{nv.get('service') or ''} · {nv.get('worker') or ''}",
            styles["body"]))
    else:
        upcoming_lines.append(Paragraph(
            "<b>Next scheduled visit:</b> "
            "<font color=\"#524B42\">No upcoming visits in the calendar.</font>",
            styles["body"]))
    if na:
        upcoming_lines.append(Paragraph(
            f"<b>Next AT-HM expiry:</b> {na.get('item_description', '')} · "
            f"expires {fmt_date(na.get('expires_at'))} · "
            f"{fmt_money(na.get('amount_remaining'))} remaining",
            styles["body"]))
    else:
        upcoming_lines.append(Paragraph(
            "<b>Next AT-HM expiry:</b> "
            "<font color=\"#524B42\">No AT-HM commitments recorded.</font>",
            styles["body"]))
    upcoming_lines.append(Paragraph(
        "<b>Next care plan review:</b> "
        "<font color=\"#524B42\">Not recorded</font>", styles["body"]))
    flow.append(cream_card(upcoming_lines))

    flow.append(Paragraph("Recent concerns", styles["h2"]))
    concerns = data.get("recent_concerns") or []
    if concerns:
        rows = [[
            fmt_date(c.get("created_at")),
            c.get("type") or "",
            c.get("title") or c.get("headline") or "",
            Paragraph(severity_badge(c.get("status") or "open",
                                      "green" if c.get("status") == "resolved"
                                      else "red" if c.get("status") == "escalated"
                                      else "amber"), styles["body"]),
        ] for c in concerns]
        flow.append(data_table(
            ["Date", "Type", "Headline", "Status"], rows,
            col_widths=[28 * mm, 40 * mm, 80 * mm, 30 * mm],
            right_align_from=3,
        ))
    else:
        flow.append(Paragraph("No concerns recorded.", styles["muted"]))

    flow.append(Paragraph("Hospitalisation (last 12 months)", styles["h2"]))
    hosp = data.get("hospitalisations") or []
    if hosp:
        rows = [[
            fmt_date(h.get("admitted_at")),
            fmt_date(h.get("discharged_at")),
            h.get("hospital_name") or "",
            f"{h.get('duration_days') or ''} d",
            "yes" if h.get("rcp_requested") else "no",
        ] for h in hosp]
        flow.append(data_table(
            ["Admitted", "Discharged", "Hospital", "Duration", "RCP"], rows,
            col_widths=[28 * mm, 28 * mm, 70 * mm, 24 * mm, 28 * mm],
            right_align_from=3,
        ))
    else:
        flow.append(Paragraph(
            "No hospitalisations recorded in the last 12 months.", styles["muted"]))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# 2) QUARTERLY_BUDGET
# ---------------------------------------------------------------------------
def render_quarterly_budget(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []

    q = data.get("quarter") or {}
    ov = data.get("overview") or {}
    cm = data.get("care_management") or {}
    ro = data.get("rollover") or {}

    flow.extend(header_block(
        styles, title=report_title,
        caregiver=_participant_caregiver_line(data) or None,
        meta=(f"{q.get('label', '')} FY{q.get('fy', '')} · "
              f"{q.get('start', '')} to {q.get('end', '')}"),
    ))

    s = _exec_summary_card(data, styles)
    if s: flow.append(s)

    flow.append(Paragraph("Budget overview", styles["h2"]))
    flow.append(traffic_bar(ov.get("pct", 0), ov.get("traffic", "green"),
                             width_mm=178))
    flow.append(Paragraph(
        f"<b>{ov.get('pct', 0)}%</b> used · {fmt_money(ov.get('spent'))} "
        f"spent of {fmt_money(ov.get('budget'))} · "
        f"{fmt_money(ov.get('remaining'))} remaining", styles["body"]))

    if (ro.get("above_cap") or 0) > 0:
        kind = "red" if ro.get("traffic") == "red" else "amber"
        flow.append(cream_card([
            Paragraph(
                f"<b>Rollover alert.</b> At the current rate, around "
                f"{fmt_money(ro.get('projected_unspent'))} may be unspent at "
                f"quarter end ({fmt_date(ro.get('q_end'))}). Only "
                f"{fmt_money(ro.get('rollover_cap'))} rolls over , "
                f"{fmt_money(ro.get('above_cap'))} above the cap may be "
                f"forfeited.", styles["body"])
        ], left_accent=ERROR if kind == "red" else ALERT))

    flow.append(Paragraph("Spending by stream", styles["h2"]))
    for st in (data.get("streams") or []):
        flow.append(Paragraph(
            f"<b>{st.get('name')}</b> &nbsp;·&nbsp; "
            f"{fmt_money(st.get('spent'))} of {fmt_money(st.get('cap'))} "
            f"({st.get('pct', 0)}%)", styles["body"]))
        flow.append(traffic_bar(st.get("pct", 0), st.get("traffic", "green"),
                                 width_mm=178))
        flow.append(Paragraph(
            f"<font color=\"{MUTED_HEX}\">Your contribution "
            f"{fmt_money(st.get('contribution'))} · Government paid "
            f"{fmt_money(st.get('government'))}</font>", styles["muted"]))
        flow.append(Spacer(1, 4))

    flow.append(Paragraph("Month-by-month", styles["h2"]))
    months = data.get("months") or []
    if months:
        headers = ["Stream"] + [m.get("label", "") for m in months]
        stream_names = ["Clinical", "Independence", "Everyday Living"]
        rows = []
        for sn in stream_names:
            row = [sn]
            for m in months:
                by_stream = m.get("by_stream") or {}
                row.append(fmt_money(by_stream.get(sn) or 0))
            rows.append(row)
        # totals row
        rows.append(["Total"] + [fmt_money(m.get("total") or 0) for m in months])
        flow.append(data_table(headers, rows, right_align_from=1))

    flow.append(Paragraph("Care management", styles["h2"]))
    flow.append(Paragraph(
        f"Cap: {fmt_money(cm.get('cap'))} (10% of monthly budget per Support "
        f"at Home rules).", styles["body"]))
    flow.append(traffic_bar(cm.get("pct", 0), cm.get("traffic", "green"),
                             width_mm=178))
    flow.append(Paragraph(
        f"<b>{cm.get('pct', 0)}%</b> used · {fmt_money(cm.get('used'))} of "
        f"{fmt_money(cm.get('cap'))} &nbsp; "
        f"{badge_html(cm.get('traffic', 'green').upper(), cm.get('traffic', 'green'))}",
        styles["body"]))

    flow.append(Paragraph("AT-HM commitments", styles["h2"]))
    athm = data.get("athm") or []
    if athm:
        rows = [[
            a.get("item_description") or "",
            fmt_money(a.get("amount_approved")),
            fmt_money(a.get("amount_claimed")),
            fmt_money(a.get("amount_remaining")),
            fmt_date(a.get("expires_at")),
            Paragraph(badge_html("ON TRACK", "green"), styles["body"]),
        ] for a in athm]
        flow.append(data_table(
            ["Item", "Approved", "Claimed", "Remaining", "Expiry", "Status"],
            rows, right_align_from=1,
        ))
    else:
        flow.append(Paragraph("No active AT-HM commitments.", styles["muted"]))

    flow.append(Paragraph("Anomalies this quarter", styles["h2"]))
    anomalies = data.get("anomalies") or []
    if anomalies:
        rows = [[
            Paragraph(severity_badge(a.get("severity", "LOW"),
                                      a.get("severity", "low")),
                      styles["body"]),
            a.get("headline") or "",
            fmt_money(a.get("dollar_impact")),
        ] for a in anomalies]
        flow.append(data_table(
            ["Severity", "Headline", "$ impact"], rows,
            col_widths=[30 * mm, 118 * mm, 30 * mm], right_align_from=2,
        ))
    else:
        flow.append(Paragraph("No anomalies flagged this quarter.", styles["muted"]))

    flow.append(Paragraph("Rollover at quarter end", styles["h2"]))
    flow.append(Paragraph(
        f"Estimated rollover: <b>{fmt_money(ro.get('projected_unspent'))}</b>",
        styles["body"]))
    flow.append(Paragraph(
        f"Amount above rollover cap ({fmt_money(ro.get('rollover_cap'))}): "
        f"<b>{fmt_money(ro.get('above_cap'))}</b> &nbsp; "
        f"{badge_html(ro.get('traffic', 'green').upper(), ro.get('traffic', 'green'))}",
        styles["body"]))
    if (ro.get("above_cap") or 0) > 0:
        flow.append(Paragraph(
            f"Consider requesting additional services before "
            f"{fmt_date(ro.get('q_end'))} to use this budget.", styles["body"]))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# 3) ANOMALY_SAVINGS
# ---------------------------------------------------------------------------
def render_anomaly_savings(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []

    flow.extend(header_block(
        styles, title=report_title,
        caregiver=_participant_caregiver_line(data) or None,
    ))

    hero = data.get("hero") or {}
    # Hero "tile", single big card
    flow.append(cream_card([
        Paragraph(
            f"<font color=\"{MUTED_HEX}\" size=\"9\">"
            "IN POTENTIAL BILLING ERRORS IDENTIFIED</font>", styles["muted"]),
        Paragraph(
            f"<font color=\"{INK_HEX}\"><b>{fmt_money(hero.get('total_value'))}</b></font>",
            styles["h1"]),
        Paragraph(
            f"Across {hero.get('statements_count', 0)} statements · "
            f"{hero.get('anomalies_count', 0)} flagged · "
            f"{hero.get('resolved_count', 0)} resolved", styles["muted"]),
        Spacer(1, 4),
        Paragraph(
            f"<font color=\"{SUCCESS_HEX}\"><b>Resolved:</b> "
            f"{fmt_money(hero.get('resolved_value'))}</font>  "
            f"&nbsp;&nbsp;&nbsp;  "
            f"<font color=\"{ERROR_HEX}\"><b>Outstanding:</b> "
            f"{fmt_money(hero.get('outstanding_value'))}</font>",
            styles["body"]),
    ], bg=SURFACE_2, left_accent=GOLD))

    s = _exec_summary_card(data, styles)
    if s: flow.append(s)

    flow.append(Paragraph("Anomalies by type", styles["h2"]))
    by_type = data.get("by_type") or []
    if by_type:
        rows = [[t.get("type") or "",
                 fmt_int(t.get("count")),
                 fmt_money(t.get("value")),
                 fmt_money(t.get("resolved")),
                 fmt_money(t.get("outstanding"))] for t in by_type]
        rows.append(["Total",
                      fmt_int(hero.get("anomalies_count")),
                      fmt_money(hero.get("total_value")),
                      fmt_money(hero.get("resolved_value")),
                      fmt_money(hero.get("outstanding_value"))])
        flow.append(data_table(
            ["Type", "Count", "Total value", "Resolved", "Outstanding"], rows,
            right_align_from=1,
        ))
    else:
        flow.append(cream_card([Paragraph(
            "No anomalies have been flagged in this period. Keep decoding "
            "your statements , each one is another chance to catch errors.",
            styles["body"])]))

    if data.get("timeline"):
        flow.append(Paragraph("Timeline of anomalies", styles["h2"]))
        rows = [[
            fmt_date(t.get("date")),
            t.get("statement") or "",
            Paragraph(severity_badge(t.get("severity", "LOW"),
                                      t.get("severity", "low")),
                      styles["body"]),
            t.get("headline") or "",
            fmt_money(t.get("value")),
            Paragraph(severity_badge(t.get("status", "pending").title(),
                                      "green" if t.get("status") == "resolved"
                                      else "red" if t.get("status") == "escalated"
                                      else "grey" if t.get("status") == "informational"
                                      else "amber"), styles["body"]),
        ] for t in data["timeline"]]
        flow.append(data_table(
            ["Date", "Statement", "Severity", "Anomaly", "Value", "Status"],
            rows,
            col_widths=[24 * mm, 36 * mm, 22 * mm, 56 * mm, 20 * mm, 20 * mm],
            right_align_from=4,
        ))

    if data.get("outstanding_items"):
        flow.append(Paragraph("Outstanding items", styles["h2"]))
        rows = [[
            Paragraph(
                f"{severity_badge(t.get('severity', 'LOW'), t.get('severity', 'low'))} "
                f"{t.get('headline', '')}", styles["body"]),
            fmt_money(t.get("value")),
            fmt_date(t.get("date")),
        ] for t in data["outstanding_items"]]
        flow.append(cream_card([
            Paragraph(
                f"<b>These {len(data['outstanding_items'])} items need attention:</b>",
                styles["body"]),
            data_table(["Item", "Value", "Date"], rows,
                       col_widths=[110 * mm, 30 * mm, 38 * mm],
                       right_align_from=1),
        ], bg=SURFACE_2, left_accent=ERROR))

    sub = data.get("subscription") or {}
    flow.append(Paragraph("Subscription value", styles["h2"]))
    sub_content = [
        Paragraph(
            f"Wayly subscription cost over this period: "
            f"<b>{fmt_money(sub.get('total'))}</b> ({sub.get('plan', '')} plan)",
            styles["body"]),
        Paragraph(f"Anomalies identified: <b>{fmt_money(hero.get('total_value'))}</b>",
                  styles["body"]),
        Paragraph(f"Anomalies resolved: <b>{fmt_money(hero.get('resolved_value'))}</b>",
                  styles["body"]),
    ]
    if (hero.get("resolved_value") or 0) > (sub.get("total") or 0):
        sub_content.append(Paragraph(
            f"<font color=\"{INK_HEX}\" size=\"14\"><b>Wayly has more than "
            f"paid for itself. {sub.get('roi', 0)}× return.</b></font>",
            styles["body"]))
    else:
        sub_content.append(Paragraph(
            "Keep decoding your monthly statements , each one is another "
            "chance to catch errors.", styles["body"]))
    sub_content.append(Paragraph(
        "<font size=\"8\" color=\"" + MUTED_HEX + "\">Dollar values reflect "
        "amounts flagged as potential billing errors. Resolved amounts reflect "
        "credits received or errors confirmed by your provider. Not all flagged "
        "amounts may result in credits.</font>", styles["muted"]))
    flow.append(cream_card(sub_content, bg=SURFACE_2, left_accent=GOLD))

    if data.get("monthly_trend"):
        flow.append(Paragraph("Monthly anomaly trend", styles["h2"]))
        flow.append(data_table(
            [m.get("label", "") for m in data["monthly_trend"]],
            [[fmt_int(m.get("flagged")) for m in data["monthly_trend"]]],
            right_align_from=0,
        ))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# 4) ANNUAL_FINANCIAL
# ---------------------------------------------------------------------------
def render_annual_financial(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []

    fy = data.get("fy")
    flow.extend(header_block(
        styles, title=report_title,
        caregiver=_participant_caregiver_line(data) or None,
        meta=(f"FY{fy} · 1 July {fy - 1 if fy else ''} , 30 June {fy or ''}"
              if fy else None),
    ))

    s = _exec_summary_card(data, styles)
    if s: flow.append(s)

    st = data.get("stats") or {}
    flow.append(Paragraph("Year in numbers", styles["h2"]))
    flow.append(kpi_tiles(styles, [
        ("Annual entitlement", fmt_money(st.get("annual_entitlement")), None),
        ("Total gross services", fmt_money(st.get("gross")), None),
        ("Your contribution", fmt_money(st.get("contribution")), None),
    ]))
    flow.append(Spacer(1, 4))
    flow.append(kpi_tiles(styles, [
        ("Government paid", fmt_money(st.get("government")), None),
        ("Lifetime cap used", fmt_money(st.get("lifetime_cap_used")), None),
        ("Lifetime cap remaining", fmt_money(st.get("lifetime_cap_remaining")), None),
    ]))

    flow.append(Paragraph("Contributions by month", styles["h2"]))
    monthly = data.get("monthly") or []
    if monthly:
        rows = [[m.get("label", ""), fmt_money(m.get("contribution"))]
                for m in monthly]
        flow.append(data_table(
            ["Month", "Contribution"], rows,
            col_widths=[120 * mm, 58 * mm], right_align_from=1,
        ))
    else:
        flow.append(Paragraph(
            "No monthly contribution data recorded for this financial year.",
            styles["muted"]))

    flow.append(Paragraph("Contributions by stream", styles["h2"]))
    by_stream = data.get("by_stream") or []
    if by_stream:
        rows = [[s.get("name", ""),
                 fmt_money(s.get("total")),
                 fmt_money(s.get("contribution")),
                 fmt_money(s.get("government"))] for s in by_stream]
        flow.append(data_table(
            ["Stream", "Annual total", "Your contribution", "Government"],
            rows, right_align_from=1,
        ))

    flow.append(Paragraph("Lifetime cap", styles["h2"]))
    flow.append(traffic_bar(st.get("lifetime_cap_pct", 0), "green", width_mm=178))
    flow.append(Paragraph(
        f"{fmt_money(st.get('lifetime_cap_used'))} of "
        f"{fmt_money(st.get('lifetime_cap'))} used "
        f"({st.get('lifetime_cap_pct', 0)}%) · "
        f"{fmt_money(st.get('lifetime_cap_remaining'))} remaining",
        styles["body"]))
    flow.append(Paragraph(
        "When the lifetime cap is reached, all Support at Home costs are "
        "government-funded.", styles["muted"]))

    flow.append(Paragraph("For your accountant or financial adviser", styles["h2"]))
    p = data.get("participant") or {}
    h = data.get("household") or {}
    fa_content = [
        Paragraph(
            f"<b>Total participant contributions paid in FY{fy}: "
            f"{fmt_money(st.get('contribution'))}</b>", styles["body"]),
    ]
    for stm in by_stream:
        if stm.get("name") in ("Independence", "Everyday Living"):
            fa_content.append(Paragraph(
                f"{stm['name']} stream: {fmt_money(stm.get('contribution'))}",
                styles["body"]))
    abn = h.get("provider_abn")
    fa_content.append(Paragraph(
        f"<font size=\"9\" color=\"{MUTED_HEX}\">Participant contributions do "
        "not apply to Clinical, Care Management, or AT-HM streams. Participant "
        f"ID: {p.get('id', '')}"
        f"{f' · Provider ABN: {abn}' if abn else ''}.</font>", styles["muted"]))
    fa_content.append(Paragraph(
        f"<font size=\"9\" color=\"{MUTED_HEX}\">Participant contributions may "
        "be relevant to your tax position. Discuss with your financial adviser."
        "</font>", styles["muted"]))
    flow.append(cream_card(fa_content, bg=SURFACE_2, left_accent=GOLD))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# 5) PROVIDER_PERFORMANCE
# ---------------------------------------------------------------------------
def render_provider_performance(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []

    flow.extend(header_block(
        styles, title=report_title,
        caregiver=_participant_caregiver_line(data) or None,
    ))

    if data.get("locked"):
        flow.append(cream_card([
            Paragraph("Provider Performance Report is locked", styles["h3"]),
            Paragraph(
                f"This report requires at least {data.get('statements_needed', 6)} "
                f"decoded statements. You have <b>{data.get('statements_available', 0)}</b>.",
                styles["body"]),
            Paragraph(
                "Keep decoding your monthly statements to show you the full "
                "performance scorecard.", styles["muted"]),
        ], left_accent=ALERT))
        flow.extend(footer_block(styles))
        doc.build(flow)
        out = buf.getvalue(); buf.close(); return out

    flow.append(cream_card([Paragraph(
        f"<font color=\"{INK_HEX}\"><b>Private.</b></font> This report is "
        "for your records only. It is not visible to your provider and will "
        "never be shared by Wayly.", styles["body"])], left_accent=INK))
    dr = data.get("date_range") or {}
    flow.append(Paragraph(
        f"{data.get('provider', '')} · {dr.get('start', '')} to {dr.get('end', '')}",
        styles["muted"]))

    # Grade banner, full width strip
    grade_inner = [
        Paragraph(
            f"<font color=\"{GOLD_HEX}\" size=\"32\"><b>{data.get('grade', '')}</b></font>",
            styles["body"]),
        Paragraph(
            f"<font color=\"#FBF8F3\">{data.get('grade_label', '')}</font>",
            styles["body"]),
    ]
    grade_tbl = Table([[grade_inner]], colWidths=[178 * mm])
    grade_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), INK),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 14),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
    ]))
    flow.append(Spacer(1, 4))
    flow.append(grade_tbl)
    summary_card = _exec_summary_card(data, styles)
    if summary_card:
        flow.append(Spacer(1, 6))
        flow.append(summary_card)

    flow.append(Paragraph("Service delivery", styles["h2"]))
    d = data.get("delivery") or {}
    flow.append(Paragraph(
        f"Of <b>{d.get('total', 0)}</b> scheduled visits, "
        f"<b>{d.get('delivered', 0)}</b> were delivered ({d.get('pct', 0)}%).",
        styles["body"]))
    flow.append(data_table(
        ["Outcome", "Count", "Status"], [
            ["Delivered as scheduled", fmt_int(d.get("delivered")),
             Paragraph(badge_html("DELIVERED", "green"), styles["body"])],
            ["Delivered with substitute worker", fmt_int(d.get("substituted")),
             Paragraph(badge_html("SUBSTITUTED", "amber"), styles["body"])],
            ["Not delivered , no record", fmt_int(d.get("not_delivered")),
             Paragraph(badge_html("MISSING", "red"), styles["body"])],
            ["Cancelled by provider", fmt_int(d.get("cancelled_provider")),
             Paragraph(badge_html("CANCELLED", "amber"), styles["body"])],
            ["Cancelled by participant", fmt_int(d.get("cancelled_participant")),
             Paragraph(badge_html("PARTICIPANT", "grey"), styles["body"])],
        ],
        col_widths=[100 * mm, 30 * mm, 48 * mm], right_align_from=1,
    ))

    flow.append(Paragraph("Billing accuracy", styles["h2"]))
    b = data.get("billing") or {}
    flow.append(Paragraph(
        f"Of <b>{b.get('statements_count', 0)}</b> statements, "
        f"<b>{b.get('with_anomaly', 0)}</b> contained at least one anomaly. "
        f"<b>{b.get('anomaly_free_pct', 0)}%</b> were anomaly-free.",
        styles["body"]))
    per = b.get("per_statement") or []
    if per:
        rows = [[r.get("statement") or "",
                 fmt_int(r.get("anomaly_count")),
                 fmt_money(r.get("value")),
                 f"{r.get('resolved_count', 0)} of {r.get('anomaly_count', 0)}"]
                for r in per]
        flow.append(data_table(
            ["Statement", "Anomalies", "Total value", "Resolved"], rows,
            right_align_from=1,
        ))
    flow.append(Paragraph(
        f"Average anomaly value per statement: {fmt_money(b.get('avg_value'))}",
        styles["muted"]))

    flow.append(Paragraph("Correspondence and responsiveness", styles["h2"]))
    c = data.get("correspondence") or {}
    flow.append(Paragraph(
        f"Of <b>{c.get('total', 0)}</b> letters or concerns raised, "
        f"<b>{c.get('responded', 0)}</b> received a response.", styles["body"]))

    if data.get("ratings"):
        flow.append(Paragraph("Your private ratings", styles["h2"]))
        rows = [[fmt_date(r.get("created_at")),
                 f"{r.get('rating', 0)} / 5",
                 r.get("note") or ""] for r in data["ratings"]]
        flow.append(data_table(
            ["Date", "Rating", "Note"], rows,
            col_widths=[30 * mm, 22 * mm, 126 * mm], right_align_from=3,
        ))

    flow.append(Paragraph("What to do if you have concerns", styles["h2"]))
    flow.append(cream_card([
        Paragraph(
            f"If you have unresolved concerns about {data.get('provider', 'this provider')}:",
            styles["body"]),
        Paragraph("1. Log a concern in Wayly's Concern Log with full details and dates.", styles["body"]),
        Paragraph("2. Use the Correspondence Tracker to record any letters or calls.", styles["body"]),
        Paragraph("3. If the provider does not respond satisfactorily, contact OPAN (free, confidential): <b>1800 700 600</b>.", styles["body"]),
        Paragraph("4. For serious or ongoing issues, contact the Aged Care Quality and Safety Commission: <b>1800 951 822</b>.", styles["body"]),
        Paragraph("5. If you are considering switching, Wayly's Provider Switching Workflow guides you through every step.", styles["body"]),
    ]))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# 6) COMPLAINT_DOSSIER
# ---------------------------------------------------------------------------
def render_complaint_dossier(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []

    flow.extend(header_block(
        styles, title="Support at Home Complaint Record",
        caregiver=_participant_caregiver_line(data) or None,
        subtitle=f"Prepared for: {data.get('addressed_to', '')}",
    ))

    p = data.get("participant") or {}
    h = data.get("household") or {}
    dr = data.get("date_range") or {}
    flow.append(cream_card([
        Paragraph(
            f"<b>Participant:</b> {p.get('first_name', '')} {p.get('last_name', '')}"
            f"{(' · DOB ' + fmt_date(p.get('date_of_birth'))) if p.get('date_of_birth') else ''}",
            styles["body"]),
        Paragraph(f"<b>Participant ID:</b> {p.get('id', '')}", styles["body"]),
        Paragraph(
            f"<b>Provider:</b> {h.get('provider_name', '')}"
            f"{(' · ABN ' + h.get('provider_abn')) if h.get('provider_abn') else ''}",
            styles["body"]),
        Paragraph(
            f"<b>Report period:</b> {dr.get('start', '')} to {dr.get('end', '')}",
            styles["body"]),
        Paragraph(
            f"<b>Report prepared:</b> {fmt_date(data.get('generated_at'))}",
            styles["body"]),
    ]))

    concerns = data.get("concerns") or []
    flow.append(Paragraph("Summary of concerns", styles["h2"]))
    if concerns:
        for i, c in enumerate(concerns, 1):
            flow.append(Paragraph(
                f"{i}. {fmt_date(c.get('created_at'))} , {c.get('type') or 'Concern'} , "
                f"{c.get('title') or c.get('headline') or ''} , "
                f"<b>{(c.get('status') or 'OPEN').upper()}</b>", styles["body"]))
        flow.append(Paragraph(
            "<i>Details of each concern follow below.</i>", styles["muted"]))
    else:
        flow.append(Paragraph(
            "No concerns recorded in this period.", styles["muted"]))

    if concerns:
        flow.append(Paragraph("Concerns (detailed)", styles["h2"]))
        for i, c in enumerate(concerns, 1):
            flow.append(cream_card([
                Paragraph(f"{i}. {c.get('title') or 'Concern'}", styles["h3"]),
                Paragraph(
                    f"<b>Date:</b> {fmt_date(c.get('created_at'))} · "
                    f"<b>Severity:</b> {c.get('severity') or 'MEDIUM'} · "
                    f"<b>Status:</b> {c.get('status') or 'open'}",
                    styles["body"]),
                Paragraph("<b>What happened:</b>", styles["body"]),
                Paragraph(c.get("description") or c.get("body") or "",
                          styles["body"]),
                *([Paragraph(f"<b>Resolution:</b> {c.get('resolution')}",
                              styles["body"])] if c.get("resolution") else []),
            ]))

    flow.append(Paragraph("Correspondence history", styles["h2"]))
    corres = data.get("correspondence") or []
    if corres:
        rows = [[
            fmt_date(c.get("sent_at")),
            c.get("type") or "",
            c.get("recipient") or "",
            c.get("channel") or "",
            fmt_date(c.get("response_received_at"))
                if c.get("response_received_at")
                else Paragraph(badge_html("NO RESPONSE", "red"), styles["body"]),
        ] for c in corres]
        flow.append(data_table(
            ["Date sent", "Type", "Recipient", "Sent via", "Response"], rows,
            col_widths=[28 * mm, 38 * mm, 46 * mm, 30 * mm, 36 * mm],
            right_align_from=4,
        ))
    else:
        flow.append(Paragraph("No correspondence recorded.", styles["muted"]))

    flow.append(Paragraph("Billing anomaly evidence", styles["h2"]))
    anomalies = data.get("anomalies") or []
    if anomalies:
        rows = [[
            a.get("statement") or "",
            a.get("headline") or "",
            Paragraph(severity_badge(a.get("severity", "LOW"),
                                      a.get("severity", "low")),
                      styles["body"]),
            fmt_money(a.get("dollar_impact")),
            a.get("status") or "pending",
        ] for a in anomalies]
        flow.append(data_table(
            ["Statement", "Type", "Severity", "$ impact", "Status"], rows,
            col_widths=[36 * mm, 80 * mm, 22 * mm, 20 * mm, 20 * mm],
            right_align_from=2,
        ))
    else:
        flow.append(Paragraph(
            "No relevant anomalies in this period.", styles["muted"]))

    flow.append(Paragraph("Service non-deliveries", styles["h2"]))
    nondel = data.get("non_deliveries") or []
    if nondel:
        rows = [[
            fmt_date(n.get("starts_at")),
            n.get("service") or "",
            n.get("worker") or "",
            "Yes" if n.get("notice_given") else "No",
        ] for n in nondel]
        flow.append(data_table(
            ["Date", "Service", "Worker", "Notice given?"], rows,
            col_widths=[28 * mm, 70 * mm, 50 * mm, 30 * mm], right_align_from=3,
        ))
    else:
        flow.append(Paragraph("No non-deliveries recorded.", styles["muted"]))

    flow.append(cream_card([Paragraph(
        "This document has been prepared using Wayly. The information is "
        "based on records logged by the caregiver and data decoded by Wayly's "
        "AI system from provider statements. Original statement documents are "
        "available on request.", styles["body"])]))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# 7) CARE_TIMELINE  (landscape)
# ---------------------------------------------------------------------------
def render_care_timeline(data, *, report_title, generated_at, landscape=True) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title, landscape=True)
    styles = get_styles()
    flow = []

    p = data.get("participant") or {}
    flow.extend(header_block(
        styles, title=report_title, landscape=True,
        caregiver=_participant_caregiver_line(data) or None,
        meta=(f"A chronological view of significant events in "
              f"{p.get('first_name', 'the participant')}'s care."),
    ))

    events = data.get("events") or []
    if events:
        dot_palette = {
            "navy": INK, "gold": GOLD, "teal": SAGE, "red": ERROR,
            "purple": GOLD, "green": SUCCESS,
        }
        for ev in events:
            colour = dot_palette.get(ev.get("color", "navy"), INK)
            row = Table([[
                "●",
                [
                    Paragraph(
                        f"<font color=\"{INK_HEX}\"><b>{fmt_date(ev.get('date'))}</b></font> "
                        f"&nbsp; {ev.get('headline') or ''}", styles["body"]),
                    *([Paragraph(
                        f"<font color=\"{MUTED_HEX}\" size=\"9\">{ev['detail']}</font>",
                        styles["muted"])] if ev.get("detail") else []),
                ]
            ]], colWidths=[8 * mm, 257 * mm])
            row.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TEXTCOLOR", (0, 0), (0, 0), colour),
                ("FONTSIZE", (0, 0), (0, 0), 14),
                ("ALIGN", (0, 0), (0, 0), "CENTER"),
                ("LINEBELOW", (0, 0), (-1, 0), 0.25, BORDER),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ]))
            flow.append(row)
    else:
        flow.append(cream_card([Paragraph(
            "No significant events recorded yet. Events appear here as you "
            "log hospitalisations, Care-Plan Changes, AT-HM installations, "
            "and concerns.", styles["body"])]))

    flow.append(Spacer(1, 8))
    flow.append(cream_card([
        Paragraph("Legend", styles["h3"]),
        Paragraph(
            f"<font color=\"{INK_HEX}\">●</font> Classification / admin &nbsp;·&nbsp; "
            f"<font color=\"{GOLD_HEX}\">●</font> Financial / budget &nbsp;·&nbsp; "
            f"<font color=\"{SAGE_HEX}\">●</font> Care plan &nbsp;·&nbsp; "
            f"<font color=\"{ERROR_HEX}\">●</font> Concern &nbsp;·&nbsp; "
            f"<font color=\"{GOLD_HEX}\">●</font> Hospitalisation &nbsp;·&nbsp; "
            f"<font color=\"{SUCCESS_HEX}\">●</font> Positive / resolved",
            styles["body"]),
    ]))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# 8) STATEMENT_DIGEST
# ---------------------------------------------------------------------------
def render_statement_digest(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []

    p = data.get("participant") or {}
    dr = data.get("date_range") or {}
    flow.extend(header_block(
        styles, title="Statement Digest",
        caregiver=_participant_caregiver_line(data) or None,
        meta=(f"{p.get('first_name', '')} {p.get('last_name', '')} · "
              f"{dr.get('start', '')} to {dr.get('end', '')}"),
    ))

    t = data.get("totals") or {}
    flow.append(kpi_tiles(styles, [
        ("Statements", fmt_int(t.get("statements")), None),
        ("Total gross", fmt_money(t.get("gross")), None),
        ("Total contributions", fmt_money(t.get("contribution")), None),
        ("Anomalies", fmt_int(t.get("anomalies")), None),
    ]))

    flow.append(Paragraph("Summary table", styles["h2"]))
    rows = []
    for r in (data.get("rows") or []):
        ac = r.get("anomaly_counts") or {}
        sev_html_parts = []
        if ac.get("HIGH"):   sev_html_parts.append(severity_badge(f"{ac['HIGH']} H", "red"))
        if ac.get("MEDIUM"): sev_html_parts.append(severity_badge(f"{ac['MEDIUM']} M", "amber"))
        if ac.get("LOW"):    sev_html_parts.append(severity_badge(f"{ac['LOW']} L", "grey"))
        rows.append([
            r.get("period") or "",
            r.get("provider") or "",
            fmt_money(r.get("gross")),
            fmt_money(r.get("contribution")),
            fmt_money(r.get("government")),
            Paragraph(" ".join(sev_html_parts) or "", styles["body"]),
        ])
    rows.append([
        "Total",
        fmt_int(t.get("statements")),
        fmt_money(t.get("gross")),
        fmt_money(t.get("contribution")),
        "",
        fmt_int(t.get("anomalies")),
    ])
    flow.append(data_table(
        ["Month", "Provider", "Gross", "Contribution", "Govt", "Anomalies"],
        rows,
        col_widths=[26 * mm, 44 * mm, 24 * mm, 28 * mm, 24 * mm, 32 * mm],
        right_align_from=2,
    ))

    if data.get("detail_level") == "full":
        for r in (data.get("rows") or []):
            flow.append(PageBreak())
            flow.append(Paragraph(r.get("period", ""), styles["h2"]))
            flow.append(Paragraph(
                f"{r.get('provider', '')} · {fmt_date(r.get('uploaded_at'))}",
                styles["muted"]))
            flow.append(Paragraph(
                f"Gross {fmt_money(r.get('gross'))} · Contribution "
                f"{fmt_money(r.get('contribution'))} · Govt "
                f"{fmt_money(r.get('government'))}", styles["body"]))
            flow.append(Paragraph("Line items", styles["h3"]))
            li_rows = [[
                fmt_date(li.get("date")),
                li.get("description") or li.get("service_code") or "",
                li.get("stream") or "",
                str(li.get("hours") or ""),
                fmt_money(li.get("unit_rate")),
                fmt_money(li.get("total")),
            ] for li in (r.get("line_items") or [])]
            if li_rows:
                flow.append(data_table(
                    ["Date", "Service", "Stream", "Hours", "Rate", "Total"],
                    li_rows, right_align_from=3,
                ))
            if r.get("anomalies"):
                flow.append(Paragraph("Anomalies", styles["h3"]))
                a_rows = [[
                    Paragraph(severity_badge(a.get("severity", "LOW"),
                                              a.get("severity", "low")),
                              styles["body"]),
                    a.get("headline") or "",
                    fmt_money(a.get("dollar_impact")),
                ] for a in r["anomalies"]]
                flow.append(data_table(
                    ["Severity", "Headline", "$ impact"], a_rows,
                    col_widths=[30 * mm, 118 * mm, 30 * mm], right_align_from=2,
                ))
    else:
        for r in (data.get("rows") or []):
            ac = r.get("anomaly_counts") or {}
            sev_summary = []
            if ac.get("HIGH"): sev_summary.append(f"{ac['HIGH']} HIGH")
            if ac.get("MEDIUM"): sev_summary.append(f"{ac['MEDIUM']} MEDIUM")
            if ac.get("LOW"): sev_summary.append(f"{ac['LOW']} LOW")
            sev_str = " · ".join(sev_summary) if sev_summary else "<font color=\"#524B42\">No anomalies</font>"
            inner = [
                Paragraph(
                    f"{r.get('period', '')} · {r.get('provider', '')}",
                    styles["h3"]),
                Paragraph(
                    f"Gross {fmt_money(r.get('gross'))} · Contribution "
                    f"{fmt_money(r.get('contribution'))} · Govt "
                    f"{fmt_money(r.get('government'))}", styles["body"]),
                Paragraph(sev_str, styles["body"]),
            ]
            for h in (r.get("anomaly_headlines") or []):
                inner.append(Paragraph(f"• {h}", styles["body"]))
            flow.append(cream_card(inner))

    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# Generic fallback, used when an unknown report_type is requested
# ---------------------------------------------------------------------------
def render_generic(data, *, report_title, generated_at, landscape=False) -> bytes:
    buf = io.BytesIO()
    doc = make_doc(buf, title=report_title)
    styles = get_styles()
    flow = []
    flow.extend(header_block(
        styles, title=report_title,
        caregiver=_participant_caregiver_line(data) or None,
        meta=f"Generated {generated_at}",
    ))
    s = _exec_summary_card(data, styles)
    if s: flow.append(s)
    # Dump remaining structured data as plain text (no surprises)
    import json
    snippet = json.dumps({k: v for k, v in (data or {}).items()
                          if k not in ("participant", "household", "exec_summary")},
                         indent=2, default=str)[:6000]
    flow.append(Paragraph(
        f"<font face=\"Courier\" size=\"8\">{snippet}</font>", styles["body"]))
    flow.extend(footer_block(styles))
    doc.build(flow)
    out = buf.getvalue(); buf.close(); return out


# ---------------------------------------------------------------------------
# Dispatcher
# ---------------------------------------------------------------------------
_RENDERERS = {
    "HOUSEHOLD_SUMMARY": render_household_summary,
    "QUARTERLY_BUDGET": render_quarterly_budget,
    "ANOMALY_SAVINGS": render_anomaly_savings,
    "ANNUAL_FINANCIAL": render_annual_financial,
    "PROVIDER_PERFORMANCE": render_provider_performance,
    "COMPLAINT_DOSSIER": render_complaint_dossier,
    "CARE_TIMELINE": render_care_timeline,
    "STATEMENT_DIGEST": render_statement_digest,
}


def render_report(rtype: str, data: dict, *, report_title: str,
                  report_id: str, generated_at: str) -> bytes:
    fn = _RENDERERS.get(rtype, render_generic)
    landscape = rtype == "CARE_TIMELINE"
    return fn(data, report_title=report_title,
              generated_at=generated_at, landscape=landscape)
