"""Server-side HTML for the decoded-statement report.

Mirrors the in-app statement screen exactly: the Wayly Summary banner, the
"Where the money went" / "What we found" donut graphics, the fee breakdown,
the anomaly findings and the line-item table. Rendered to a pixel-faithful PDF
via headless Chromium (see ``lib.html_pdf``) so web and mobile download the
same bytes and both surfaces match the on-screen design.
"""
from __future__ import annotations

from datetime import date

from . import pdf_html_theme as T


def _fmt_date(v) -> str:
    if not v:
        return ""
    s = str(v)
    try:
        d = date.fromisoformat(s[:10])
        return f"{d.day:02d}/{d.month:02d}/{d.year}"
    except Exception:
        return s


_STREAM_LABEL = {
    "Clinical": "Clinical", "Independence": "Independence",
    "EverydayLiving": "Everyday Living", "ATHM": "AT-HM",
    "CareMgmt": "Care Management",
}
_STREAM_TONES = ["#0E4D52", "#A5512B", "#B23A2E", "#425F47", "#8A4423", "#0A3E42"]

_BANDS = ["high", "medium", "low", "informational"]
_BAND_META = {
    "high": ("High Priority", T.TERRACOTTA, "!"),
    "medium": ("Medium", T.GOLD, "?"),
    "low": ("Low", T.SAGE_SOFT, "\u2022"),
    "informational": ("Informational", T.SAGE_SOFT, "i"),
}


def _band_of(sev) -> str:
    s = (sev or "").lower()
    if s in ("info", "informational", "advisory"):
        return "informational"
    if s in ("high", "alert"):
        return "high"
    if s in ("medium", "warn", "warning"):
        return "medium"
    if s == "low":
        return "low"
    return "low"


def _sev_counts(audit: dict, anomalies: list) -> dict:
    ac = audit.get("anomaly_count") or {}
    if ac and (ac.get("high") or ac.get("medium") or ac.get("low") or ac.get("advisory")):
        return {"high": ac.get("high", 0), "medium": ac.get("medium", 0),
                "low": (ac.get("low", 0) or 0) + (ac.get("advisory", 0) or 0)}
    out = {"high": 0, "medium": 0, "low": 0}
    for a in anomalies:
        s = (a.get("severity") or "").lower()
        if s in ("high", "alert"):
            out["high"] += 1
        elif s in ("info", "low", "advisory", "informational"):
            out["low"] += 1
        else:
            out["medium"] += 1
    return out


def render_decoded_html(payload: dict) -> str:
    audit = payload.get("audit") or {}
    extracted = payload.get("extracted") or {}
    summ = audit.get("statement_summary") or {}
    anomalies = audit.get("anomalies") or []
    streams = audit.get("stream_breakdown") or []
    items = extracted.get("line_items") or []

    provider = (extracted.get("provider_name") or summ.get("provider")
                or summ.get("provider_name") or "your provider")
    if extracted.get("period_start") and extracted.get("period_end"):
        period = f"{_fmt_date(extracted['period_start'])} to {_fmt_date(extracted['period_end'])}"
    else:
        period = (summ.get("period") or extracted.get("statement_period")
                  or summ.get("period_label") or "this period")

    gross = T.num(summ.get("total_gross"))
    you = T.num(summ.get("total_participant_contribution"))
    gov = T.num(summ.get("total_government_paid"))
    budget_rem = summ.get("adjusted_budget_remaining")
    if budget_rem is None:
        budget_rem = summ.get("budget_remaining")
    care_mgmt = T.num(extracted.get("care_management_deducted") or summ.get("care_management_fee"))

    counts = _sev_counts(audit, anomalies)
    total_flags = counts["high"] + counts["medium"] + counts["low"]

    body = [T.brand_header("Decoded aged-care statement")]

    # Hero
    body.append(T.h1(f'Here&#39;s what <em>{T.esc(provider)}</em> is charging.'))
    sub_bits = [period]
    if summ.get("participant_name"):
        sub_bits.append(str(summ["participant_name"]))
    if summ.get("classification"):
        sub_bits.append(str(summ["classification"]))
    sub_bits.append(f"decoded {T.today_au()}")
    body.append(T.subtitle(" \u00b7 ".join(sub_bits)))

    # Plain-English summary narrative, when the decode produced one, leads the report.
    summary_text = payload.get("summary")
    if isinstance(summary_text, str) and summary_text.strip():
        paras = "".join(f"<p>{T.esc(p.strip())}</p>"
                        for p in summary_text.split("\n\n") if p.strip())
        body.append(T.section("Wayly summary"))
        body.append(f'<div class="card">{paras}</div>')

    # Wayly Summary banner
    tiles = (
        f'<div class="b-tile"><span class="lbl">Gross Billed</span>'
        f'<span class="val">{T.esc(T.money(gross))}</span></div>'
        f'<div class="b-tile"><span class="lbl">Your Contribution</span>'
        f'<span class="val gold">{T.esc(T.money(you))}</span></div>'
        f'<div class="b-tile"><span class="lbl">Government Paid</span>'
        f'<span class="val">{T.esc(T.money(gov))}</span></div>'
        f'<div class="b-tile"><span class="lbl">Budget Remaining</span>'
        f'<span class="val">{T.esc(T.money(budget_rem))}</span></div>'
    )
    meta_bits = []
    if summ.get("cadence") and summ.get("cadence") != "irregular":
        meta_bits.append(f'Cadence <b>{T.esc(str(summ["cadence"]).capitalize())}</b>')
    if care_mgmt > 0:
        meta_bits.append(f'Care management fee <b>{T.esc(T.money(care_mgmt))}</b>')
    if summ.get("rollover_applied"):
        meta_bits.append(f'Rollover applied <b>{T.esc(T.money(summ["rollover_applied"]))}</b>')
    if summ.get("lifetime_cap_remaining") is not None:
        meta_bits.append(f'Lifetime cap remaining <b>{T.esc(T.money(summ["lifetime_cap_remaining"]))}</b>')
    meta_html = f'<div class="b-meta">{"".join("<span>"+m+"</span>" for m in meta_bits)}</div>' if meta_bits else ""

    split_html = ""
    tot_split = you + gov
    if tot_split > 0:
        gov_pct = round(gov / tot_split * 100)
        you_pct = 100 - gov_pct
        gov_seg = (f'<span style="width:{gov_pct}%;background:#6E8B74;color:#fff">'
                   f'{str(gov_pct)+"%" if gov_pct >= 18 else ""}</span>')
        you_seg = (f'<span style="width:{you_pct}%;background:#E0A64B;color:#1C2B2D">'
                   f'{str(you_pct)+"%" if you_pct >= 18 else ""}</span>')
        split_html = (
            '<div class="splitwrap">'
            '<div class="b-head" style="margin-bottom:8px">Who Paid What</div>'
            f'<div class="splitbar">{gov_seg}{you_seg}</div>'
            '<div class="split-legend">'
            f'<span><span class="dot" style="background:#6E8B74"></span>Government <b>{gov_pct}%</b></span>'
            f'<span><span class="dot" style="background:#E0A64B"></span>You paid <b>{you_pct}%</b></span>'
            '</div>'
            f'<div class="split-note">The government covered {T.esc(T.money(gov))} of this statement; '
            f'your share was {T.esc(T.money(you))}.</div></div>'
        )
    body.append(
        f'<div class="banner"><div class="b-head">Wayly Summary</div>'
        f'<div class="b-grid">{tiles}</div>{meta_html}{split_html}</div>'
    )

    # Insight donuts
    insight_cards = []
    if gov > 0 or you > 0:
        gov_pct = round(gov / (gov + you) * 100) if (gov + you) > 0 else 0
        legend = (T.legend_row("Government", T.GOV_GREEN, T.money(gov))
                  + T.legend_row("You paid", T.YOU_GOLD, T.money(you)))
        insight_cards.append(T.donut(
            [(gov, T.GOV_GREEN), (you, T.YOU_GOLD)],
            f"{gov_pct}%", "funded",
            legend_rows=legend, head="Where the money went", card_class="teal"))
    if total_flags > 0:
        segs, legend_parts = [], []
        for name, key, color in (("Needs attention", "high", T.SEV_HIGH),
                                  ("Worth a look", "medium", T.SEV_MED),
                                  ("For your info", "low", T.SEV_LOW)):
            if counts[key] > 0:
                segs.append((counts[key], color))
                legend_parts.append(T.legend_row(name, color, str(counts[key])))
        insight_cards.append(T.donut(
            segs, str(total_flags), "to know",
            legend_rows="".join(legend_parts), head="What we found", card_class="clay"))
    if insight_cards:
        if len(insight_cards) == 1:
            body.append(f'<div class="insight-grid" style="grid-template-columns:1fr">{insight_cards[0]}</div>')
        else:
            body.append(f'<div class="insight-grid">{"".join(insight_cards)}</div>')

    # Budget continuity
    opening = (extracted.get("opening_balance") or extracted.get("rollover_from_prior_quarter")
               or extracted.get("unused_funding_rolled_over") or summ.get("rollover_applied"))
    allocation = (extracted.get("quarterly_allocation_received")
                  or extracted.get("quarterly_subsidy_this_period")
                  or extracted.get("quarterly_budget_total"))
    closing = (extracted.get("closing_balance") or extracted.get("budget_remaining_at_quarter_end")
               or extracted.get("remaining_quarterly_budget")
               or summ.get("adjusted_budget_remaining") or summ.get("budget_remaining"))
    known = [v for v in (opening, allocation, closing) if v not in (None, "")]
    if len(known) >= 2:
        body.append(T.section("Budget continuity"))
        body.append(T.kpi_grid([
            ("Opening balance", T.money(opening) if opening not in (None, "") else "\u2014"),
            ("Quarterly allocation", T.money(allocation) if allocation not in (None, "") else "\u2014"),
            ("Closing balance", T.money(closing) if closing not in (None, "") else "\u2014"),
        ], cols=3))

    # Fee breakdown
    body.append(_fee_breakdown(extracted, summ))

    # What we found — top banner + bands
    body.append(T.section("What we found"))
    if counts["high"] > 0:
        tb = (T.TERRACOTTA, "#fff", "!", f'{counts["high"]} high-priority thing{"" if counts["high"]==1 else "s"} to review.')
    elif counts["medium"] > 0:
        tb = ("#F7EDD6", T.INK, "?", f'{counts["medium"]} thing{"" if counts["medium"]==1 else "s"} worth a closer look.')
    elif counts["low"] > 0:
        tb = ("#EAF1EA", "#0F5648", "\u2022", f'{counts["low"]} small note{"" if counts["low"]==1 else "s"}, mostly informational.')
    else:
        tb = ("#EAF1EA", "#0F5648", "\u2713", "Statement looks clean. Nothing unusual found.")
    ic_color = {"!": T.TERRACOTTA, "?": T.GOLD, "\u2022": T.SAGE_SOFT, "\u2713": T.SAGE_SOFT}[tb[2]]
    body.append(
        f'<div class="topban" style="background:{tb[0]};color:{tb[1]};border-left-color:{ic_color}">'
        f'<span class="ic" style="background:{ic_color}">{tb[2]}</span>{T.esc(tb[3])}</div>'
    )
    bands = [(b, [a for a in anomalies if _band_of(a.get("severity")) == b]) for b in _BANDS]
    accent_map = {"high": T.TERRACOTTA, "medium": T.GOLD, "low": T.SAGE_SOFT, "informational": T.SAGE_SOFT}
    for band, rows in bands:
        if not rows:
            continue
        label, color, icon = _BAND_META[band]
        body.append(
            f'<div class="band-hd"><span class="pill" style="background:{color}">{icon}</span>'
            f'<span>{T.esc(label)}</span><span class="ct">({len(rows)})</span></div>'
        )
        for a in rows:
            impact = T.num(a.get("dollar_impact"))
            imp_html = f'<div class="imp">{T.esc(T.money(impact))} impact</div>' if impact > 0 else ""
            body.append(T.flag_card(
                a.get("headline") or a.get("title") or "Something worth checking",
                (a.get("detail") or "")[:400],
                impact_html=imp_html,
                accent=accent_map[band],
                action=(a.get("suggested_action") or "")[:300],
            ))

    # Stream breakdown
    if streams:
        body.append(T.section("Where the money went"))
        cards = []
        for i, s in enumerate(streams):
            tone = _STREAM_TONES[i % len(_STREAM_TONES)]
            n = s.get("line_item_count") or 0
            cards.append(
                f'<div class="stream-card" style="background:{tone}">'
                f'<div class="s-lbl">{T.esc(_STREAM_LABEL.get(s.get("stream"), s.get("stream") or ""))}</div>'
                f'<div class="s-val">{T.esc(T.money(s.get("gross_total")))}</div>'
                f'<div class="s-meta">{n} item{"" if n == 1 else "s"} \u00b7 you paid '
                f'{T.esc(T.money(s.get("participant_contribution")))}</div></div>'
            )
        body.append(f'<div class="stream-grid">{"".join(cards)}</div>')

    # Line items
    if items:
        body.append(T.section(f"Line items ({len(items)})"))
        rows = []
        for li in items:
            cancelled = bool(li.get("is_cancellation"))
            name = li.get("service_description") or li.get("service_name") or "Service"
            if cancelled:
                name = f"<em style='color:{T.CLAY}'>{T.esc(name)} (cancelled)</em>"
            else:
                name = T.esc(name)
            rows.append([
                _fmt_date(li.get("date")) or "\u2014",
                name,
                T.esc(_STREAM_LABEL.get(li.get("stream"), li.get("stream") or "")),
                T.money(li.get("gross") if li.get("gross") is not None else li.get("total")),
                T.money(li.get("participant_contribution")),
                T.money(li.get("government_paid")),
            ])
        body.append(T.data_table(
            ["Date", "Service", "Stream", "Gross", "Your share", "Gov share"],
            rows, right_from=3))

    body.append(T.footer(
        "AI-assisted summary; the original statement remains the source of truth. "
        "Not financial or legal advice. wayly.com.au"))

    return T.document(f"Decoded by Wayly \u00b7 {provider}", "".join(body))


def _fee_breakdown(extracted: dict, summ: dict) -> str:
    def r2(n):
        return round(n * 100) / 100
    items = extracted.get("line_items") or []
    services = r2(sum(T.num(li.get("gross") if li.get("gross") is not None else li.get("total"))
                      for li in items if not li.get("is_cancellation")))
    care_mgmt = T.num(extracted.get("care_management_deducted") or summ.get("care_management_fee"))
    pkg_mgmt = T.num(extracted.get("package_management_deducted"))
    gst = T.num(extracted.get("gst_total"))
    cancellations = r2(sum(T.num(li.get("charged_amount")) for li in items if li.get("is_cancellation")))
    credits = r2(sum(T.num(a.get("credit_amount")) for a in (extracted.get("previous_period_adjustments") or [])))
    reported = T.num(extracted.get("reported_total_gross") or summ.get("total_gross"))
    computed = r2(services + care_mgmt + pkg_mgmt + gst + cancellations - credits)
    rows = [("Services", services, True, False), ("Care management", care_mgmt, False, False),
            ("Package management", pkg_mgmt, False, False), ("GST", gst, False, False),
            ("Charged cancellations", cancellations, False, False),
            ("Credits applied", credits, False, True)]
    rows = [r for r in rows if r[2] or abs(r[1]) > 0.005]
    if len(rows) <= 1 and reported <= 0:
        return ""
    total = reported if reported > 0 else computed
    reconciles = abs(computed - total) <= max(5, 0.02 * total)

    out = ['<div class="fee"><div class="fee-head">'
           '<div class="t">Where The Money Goes</div><div class="s">Every fee, broken out</div></div>']
    for label, value, _always, neg in rows:
        p = min(100, round(abs(value) / total * 100)) if total > 0 else 0
        vtxt = (f"\u2212 {T.money(abs(value))}" if neg else T.money(value))
        out.append(
            f'<div class="fee-row"><div class="r1"><span class="k">{T.esc(label)}</span>'
            f'<span class="v{" neg" if neg else ""}">{T.esc(vtxt)}</span></div>'
            f'<div class="fee-bar-wrap"><div class="fee-bar"><i class="{"neg" if neg else ""}" '
            f'style="width:{p}%"></i></div><span class="fee-bar-pct">{p}%</span></div></div>'
        )
    out.append(f'<div class="fee-total"><span class="k">Total billed</span>'
               f'<span class="v">{T.esc(T.money(total))}</span></div>')
    if reported > 0:
        if reconciles:
            out.append('<div class="fee-note ok">\u2713 These rows add up to the statement\u2019s own total.</div>')
        else:
            out.append(f'<div class="fee-note bad">\u26a0 Heads up: these rows add to {T.esc(T.money(computed))}, '
                       f'but the statement\u2019s own total is {T.esc(T.money(reported))}.</div>')
    out.append("</div>")
    return "".join(out)
