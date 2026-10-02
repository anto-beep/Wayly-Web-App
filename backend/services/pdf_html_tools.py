"""HTML body builders for every Wayly tool PDF.

Each function returns a full HTML document (via ``lib.pdf_html_theme.document``)
that the tool's ``render_*`` entry point renders to PDF with headless Chromium,
matching the in-app screens and the decoded-statement design exactly. Graphics
are reproduced only where they genuinely exist on a tool's screen.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from lib import pdf_html_theme as T


def _ddmm(v) -> str:
    if not v:
        return ""
    s = str(v)
    try:
        d = date.fromisoformat(s[:10])
        return f"{d.day:02d}/{d.month:02d}/{d.year}"
    except Exception:
        return s


def _banner(title: str, body: str, color: str, *, dark_text: bool = False) -> str:
    fg = "#1C2B2D" if dark_text else "#fff"
    sub = (f'<div style="font-size:10pt;margin-top:6px;opacity:0.92;line-height:1.5">{T.esc(body)}</div>'
           if body else "")
    return (f'<div style="background:{color};color:{fg};border-radius:14px;padding:16px 20px;margin:12px 0 16px">'
            f'<div style="font-family:Fraunces,Georgia,serif;font-size:16pt;font-weight:600;line-height:1.15">'
            f'{T.esc(title)}</div>{sub}</div>')


def _meta(pairs) -> str:
    rows = "".join(f'<dt>{T.esc(T.title_case(k))}</dt><dd>{T.esc(v)}</dd>'
                   for k, v in pairs if v not in (None, "", "\u2014"))
    return f'<dl class="meta">{rows}</dl>' if rows else ""


def _paras(text: str, cls: str = "") -> str:
    out = []
    for p in str(text or "").split("\n\n"):
        p = p.strip()
        if p:
            out.append(f'<p class="{cls}">{T.esc(p).replace(chr(10), "<br/>")}</p>')
    return "".join(out)


# ---------------------------------------------------------------------------
# Invoice Checker (INV-1)
# ---------------------------------------------------------------------------
_INV_VERDICT = {
    "all_clear": ("Looks all clear",
                  "We checked this invoice against the current Support at Home rules and could not find anything worth raising.",
                  T.SAGE),
    "items_to_note": ("A few items to note",
                      "Nothing needs urgent action, but there are one or two informational items worth reading.",
                      T.INK),
    "questions_to_raise": ("Some questions to raise",
                           "We found lines worth asking your provider about before you pay.",
                           T.CLAY),
    "check_before_paying": ("Check before you pay",
                            "We found something that may breach the Support at Home rules. Please raise these with your provider before paying.",
                            T.TERRACOTTA),
}
_INV_TIER = {1: ("Informational", T.SAGE), 2: ("Worth noting", T.INK),
             3: ("Worth a question", T.CLAY), 4: ("Check before paying", T.TERRACOTTA)}
_SHAPE_LABEL = {"invoice": "Invoice", "combined": "Combined statement + invoice",
                "combined_unsplit": "Combined document", "statement": "Statement",
                "remittance": "Remittance advice", "receipt": "Receipt"}


def invoice_check_html(invoice: Dict[str, Any], reconciliation: Dict[str, Any]) -> str:
    provider = invoice.get("provider_name") or "Not detected"
    body = [T.brand_header("Invoice check report")]
    body.append(T.h1("Invoice Check Report"))
    body.append(T.subtitle(f"{provider} \u00b7 generated {T.today_au()}"))

    verdict = reconciliation.get("overall_verdict") or "all_clear"
    title, vbody, color = _INV_VERDICT.get(verdict, _INV_VERDICT["all_clear"])
    body.append(_banner(title, vbody, color, dark_text=(verdict == "items_to_note")))

    # Summary narrative leads the report (matches the on-screen "Wayly Summary").
    summary = (reconciliation.get("summary_md") or "").strip()
    if summary:
        body.append(T.section("Wayly summary"))
        body.append(T.card(_paras(summary)))

    abn = invoice.get("provider_abn")
    if abn:
        s = "".join(ch for ch in str(abn) if ch.isdigit())
        if len(s) == 11:
            abn = f"{s[:2]} {s[2:5]} {s[5:8]} {s[8:]}"
    body.append(T.section("Invoice details"))
    body.append(_meta([
        ("Provider", invoice.get("provider_name")),
        ("ABN", abn),
        ("Invoice date", _ddmm(invoice.get("invoice_date"))),
        ("Due date", _ddmm(invoice.get("due_date"))),
        ("Document shape", _SHAPE_LABEL.get(invoice.get("document_shape") or "invoice",
                                            invoice.get("document_shape"))),
    ]))

    findings = reconciliation.get("findings") or []
    if findings:
        n = len(findings)
        body.append(T.section(f"Things worth raising ({n} item{'s' if n != 1 else ''})"))
        for f in sorted(findings, key=lambda x: -int(x.get("tier") or 1)):
            tier = int(f.get("tier") or 1)
            label, color = _INV_TIER.get(tier, _INV_TIER[1])
            q = f.get("suggested_question") or ""
            tier_chip = T.chip(f"Tier {tier} \u00b7 {label}", color)
            inner = [f'<div style="margin-bottom:6px">{tier_chip}</div>']
            if q:
                inner.append(f'<div class="ttl">Suggested question</div>'
                             f'<div class="det">{T.esc(q)}</div>')
            if f.get("narrative"):
                inner.append(f'<div class="det" style="color:{T.MUTED}">{T.esc(f["narrative"])}</div>')
            if f.get("escalation") == "acqsc":
                inner.append('<div class="det"><b>Escalation:</b> Aged Care Quality and Safety '
                             'Commission \u00b7 1800 951 822</div>')
            body.append(f'<div class="flag" style="border-left-color:{color}">{"".join(inner)}</div>')
    else:
        body.append(T.section("Nothing worth raising"))
        body.append(T.card("Every check passed on this invoice."))

    clean = [c for c in (reconciliation.get("clean_reconciliation") or []) if c.get("ok")]
    if clean:
        body.append(T.section(f"We also checked ({len(clean)} passed)"))
        chips = "".join(f'<li>{T.esc(c.get("label", ""))}</li>' for c in clean)
        body.append(f'<ul class="steps">{chips}</ul>')

    body.append(T.footer("Guidance only, not legal or financial advice. Confirm items with "
                         "your provider before paying. wayly.com.au"))
    return T.document(f"Invoice check \u00b7 {provider}", "".join(body))


# ---------------------------------------------------------------------------
# Provider Price Check (PPC)
# ---------------------------------------------------------------------------
def ppc_html(*, service: str, provider: Optional[str], charged: float, unit: Optional[str],
             position: str, plain_language: str, distance_summary: Optional[str],
             lower: Optional[float], upper: Optional[float], median: Optional[float],
             stream: Optional[str], your_share_amount: Optional[float],
             your_share_explanation: Optional[str], source_date: Optional[str],
             notes: List[str], doh_caveat: Optional[str]) -> str:
    unit_word = {"hour": "per hour", "trip": "per trip", "meal": "per meal",
                 "month": "per month", "kilometre": "per kilometre"}.get(unit or "hour", "per unit")

    def _src():
        if not source_date:
            return "October 2025"
        try:
            return datetime.fromisoformat(str(source_date)[:10]).strftime("%B %Y")
        except Exception:
            return str(source_date)

    tone = T.TERRACOTTA if position == "above" else (T.SAGE if position == "in" else T.INK)
    body = [T.brand_header("Provider price check")]
    body.append(T.h1("Provider Price Check"))
    body.append(T.subtitle(f"{service} \u00b7 {provider or '(provider not entered)'} \u00b7 generated {T.today_au()}"))
    body.append(_banner(plain_language, distance_summary or "", tone))

    range_str = (f"{T.money(lower)} to {T.money(upper)}"
                 if lower is not None and upper is not None else "Not published")
    body.append(T.kpi_grid([
        ("You are charged", T.money(charged), unit_word),
        ("Your share", T.money(your_share_amount) if your_share_amount is not None else "\u2014", unit_word),
        ("Indicative range", range_str, f"DoH {_src()}"),
    ], cols=3))

    # Range position bar (genuine on-screen graphic): where charged sits vs DoH range.
    if lower is not None and upper is not None and upper > lower:
        lo, hi, ch = float(lower), float(upper), float(charged)
        span = hi - lo
        s_min = min(lo, ch) - span * 0.25
        s_max = max(hi, ch) + span * 0.25
        rng = (s_max - s_min) or 1.0
        band_l = (lo - s_min) / rng * 100
        band_w = (hi - lo) / rng * 100
        mark = max(0.0, min(100.0, (ch - s_min) / rng * 100))
        body.append(
            '<div style="margin:4px 0 16px;position:relative;height:46px">'
            f'<div style="position:absolute;top:16px;left:0;right:0;height:10px;border-radius:999px;background:{T.SURFACE_2}"></div>'
            f'<div style="position:absolute;top:16px;left:{band_l:.1f}%;width:{band_w:.1f}%;height:10px;border-radius:999px;background:{T.SAGE_SOFT}"></div>'
            f'<div style="position:absolute;top:8px;left:{mark:.1f}%;width:3px;height:26px;background:{tone};border-radius:2px;transform:translateX(-50%)"></div>'
            f'<div style="position:absolute;top:34px;left:{band_l:.1f}%;font-size:8pt;color:{T.MUTED}">{T.esc(T.money(lower))}</div>'
            f'<div style="position:absolute;top:34px;left:{(band_l+band_w):.1f}%;font-size:8pt;color:{T.MUTED};transform:translateX(-100%)">{T.esc(T.money(upper))}</div>'
            f'<div style="position:absolute;top:0;left:{mark:.1f}%;font-size:8pt;font-weight:600;color:{tone};transform:translateX(-50%)">Charged</div>'
            '</div>')

    bits = []
    if stream:
        extra = " Clinical supports carry no participant contribution." if stream == "Clinical" else ""
        bits.append(f"<b>Support stream:</b> {T.esc(stream)}.{extra}")
    if your_share_explanation:
        bits.append(T.esc(your_share_explanation))
    if doh_caveat:
        bits.append(f'<span style="color:{T.MUTED}"><i>{T.esc(doh_caveat)}</i></span>')
    if bits:
        body.append(T.card("<br/>".join(bits)))

    clean_notes = [n for n in (notes or []) if n]
    if clean_notes:
        body.append(T.section("Notes"))
        body.append('<ul class="steps">' + "".join(f"<li>{T.esc(n)}</li>" for n in clean_notes) + "</ul>")

    body.append(T.footer(
        f"Source: Department of Health, indicative Support at Home prices, {_src()}. "
        "For guidance only, not legal or financial advice. wayly.com.au"))
    return T.document(f"Price check \u00b7 {service}", "".join(body))


# ---------------------------------------------------------------------------
# Budget & Lifetime Cap
# ---------------------------------------------------------------------------
def budget_html(result: Dict[str, Any], person_name: Optional[str] = None) -> str:
    subtitle = result.get("classification_label") or "Support at Home budget"
    if person_name:
        subtitle = f"{person_name} \u00b7 {subtitle}"
    body = [T.brand_header("Budget & lifetime cap")]
    body.append(T.h1("Budget &amp; Lifetime Cap"))
    body.append(T.subtitle(f"{subtitle} \u00b7 generated {T.today_au()}"))

    body.append(T.section("Your budget at a glance"))
    body.append(T.kpi_grid([
        ("Annual budget", T.money(result.get("annual_total"))),
        ("Usable per quarter", T.money(result.get("quarterly_usable"))),
        ("Care mgmt (qtr)", T.money(result.get("care_management_quarterly"))),
        ("Rollover floor", T.money(result.get("rollover_cap"))),
    ], hero_first=True, cols=4))

    streams = result.get("streams") or []
    if streams:
        body.append(T.section("Per-stream allocation"))
        maxv = max((T.num(s.get("allocated")) for s in streams), default=0) or 1
        tones = [T.INK, T.CLAY, T.SAGE, "#8A4423", "#0A3E42"]
        rows = []
        for i, s in enumerate(streams):
            name = str(s.get("stream") or "")
            if s.get("indicative"):
                name += " (indicative)"
            v = T.num(s.get("allocated"))
            rows.append((name, T.money(v), v / maxv * 100, tones[i % len(tones)]))
        body.append(T.bars(rows))
        if result.get("streams_note"):
            body.append(f'<p class="sub" style="font-size:9pt">{T.esc(result["streams_note"])}</p>')

    if result.get("annual_supplements_total"):
        body.append(T.section("Supplements"))
        inner = f'Annual supplements: <b>{T.money(result.get("annual_supplements_total"))}</b>'
        if result.get("annual_total_with_supplements"):
            inner += f'<br/>Annual total incl. supplements: <b>{T.money(result.get("annual_total_with_supplements"))}</b>'
        body.append(T.card(inner))

    body.append(T.section("Lifetime cap"))
    pct = T.num(result.get("lifetime_pct"))
    body.append(T.progress(
        pct, left=f"{T.money(result.get('lifetime_contributions'))} contributed",
        right=f"{T.money(result.get('lifetime_cap'))} cap"))
    tail = f'{T.pct(pct, 1)} of your lifetime cap used.'
    if result.get("years_to_cap"):
        tail += f' At the level entered, about {T.esc(result.get("years_to_cap"))} years to reach the cap.'
    if result.get("is_grandfathered"):
        tail += " Grandfathered (Home Care Package no-worse-off arrangement)."
    body.append(f'<p class="sub">{tail}</p>')

    body.append(T.footer("Estimate using the current Support at Home rules. Guidance only, "
                         "not financial advice. Confirm with your provider and Services Australia. wayly.com.au"))
    return T.document("Budget & lifetime cap", "".join(body))


# ---------------------------------------------------------------------------
# Contribution Estimator (CE-2)
# ---------------------------------------------------------------------------
def contribution_html(result: Dict[str, Any], person_name: Optional[str] = None) -> str:
    body = [T.brand_header("Contribution estimator")]
    body.append(T.h1("Contribution Estimator"))
    body.append(T.subtitle((f"For {person_name} \u00b7 " if person_name else "") + f"generated {T.today_au()}"))

    who = f"{person_name}'s" if person_name else "Your"
    if result.get("is_fee_exempt"):
        body.append(T.hero_card(
            "Fee exempt", "You will not pay any contribution.",
            "Because you were on a Home Care Package before 12 September 2024 and paid no fees, "
            "the no-worse-off rule guarantees a permanent zero. No lifetime cap applies.", bg=T.SAGE))
    elif result.get("range_mode"):
        body.append(T.hero_card(
            f"{who} estimated weekly contribution",
            f"{T.money(result.get('range_min_weekly'))} to {T.money(result.get('range_max_weekly'))} per week",
            "Because your final classification is not yet known, the range spans Class 3, Class 5 and Class 8 outcomes."))
    else:
        govt = T.money(result.get("government_share_annual"))
        govt_pct = T.pct(result.get("government_share_percent"), 1)
        body.append(T.hero_card(
            f"{who} estimated weekly contribution",
            f"{T.money(result.get('contribution_weekly'))} per week",
            f"{T.money(result.get('contribution_annual'))} a year, or {T.money(result.get('contribution_quarterly'))} "
            f"a quarter. The Australian Government pays {govt} a year of your care, which is {govt_pct} of the total."))

    if not result.get("is_fee_exempt"):
        govt_pct = T.num(result.get("government_share_percent"))
        you_pct = max(0.0, 100 - govt_pct)
        body.append(T.section("Who pays what"))
        body.append(T.split_bar_light([
            (govt_pct, T.SAGE, "Government", f"{T.pct(govt_pct, 1)}, {T.money(result.get('government_share_annual'))}/yr"),
            (you_pct, T.INK, "You", f"{T.pct(you_pct, 1)}, {T.money(result.get('contribution_annual'))}/yr"),
        ]))

        body.append(T.section("Your rates by service type"))
        body.append(T.kpi_grid([
            ("Clinical care", "0%", "Always free"),
            ("Independence", T.pct(result.get("independence_rate"), 1), "Personal care, meals"),
            ("Everyday Living", T.pct(result.get("everyday_rate"), 1), "Cleaning, transport"),
        ], cols=3))

    if result.get("applicable_lifetime_cap") is not None:
        body.append(T.section("Lifetime cap"))
        body.append(T.card(
            f"Once your combined Independence and Everyday Living contributions reach "
            f"<b>{T.money(result.get('applicable_lifetime_cap'))}</b> across your lifetime, you pay nothing "
            f"further. Clinical care never counts towards this cap."))

    if not result.get("is_fee_exempt") and result.get("contribution_post_october_2026_weekly") is not None:
        now_w = T.num(result.get("contribution_weekly"))
        after_w = T.num(result.get("contribution_post_october_2026_weekly"))
        saving = now_w - after_w
        txt = (f"From 1 October 2026, personal care becomes fully government-funded. Your weekly "
               f"contribution changes from <b>{T.money(now_w)}</b> to <b>{T.money(after_w)}</b>")
        txt += (f", a saving of about <b>{T.money(saving)}</b> per week or <b>{T.money(saving*52)}</b> per year."
                if saving > 0.005 else ".")
        body.append(T.section("From 1 October 2026"))
        body.append(T.card(txt))

    hcp = result.get("hcp_comparison")
    if hcp and result.get("show_hcp_comparison") in ("always", "toggle"):
        body.append(T.section("Compared to your Home Care Package"))
        dw = T.num(hcp.get("delta_weekly"))
        body.append(T.data_table(
            ["", "Your HCP cost", "Support at Home", "Difference"],
            [["Weekly", f"{T.money(hcp.get('hcp_weekly'))}", f"{T.money(hcp.get('sah_weekly'))}",
              f"{T.money(abs(dw))} {'less' if dw < 0 else 'more'}"],
             ["Yearly", f"{T.money(hcp.get('hcp_annual'))}", f"{T.money(hcp.get('sah_annual'))}",
              f"{T.money(abs(T.num(hcp.get('delta_annual'))))} {'less' if T.num(hcp.get('delta_annual')) < 0 else 'more'}"]],
            right_from=1))

    body.append(T.footer("Plain-English estimate for household planning. Your final rate is set by "
                         "Services Australia. Not legal or financial advice. wayly.com.au"))
    return T.document("Contribution estimate", "".join(body))


# ---------------------------------------------------------------------------
# Classification Self-Check (CSC)
# ---------------------------------------------------------------------------
_DOMAIN_LABELS = {
    "self_care": "Self-care", "iadl": "IADLs", "cognition_behaviour": "Cognition and behaviour",
    "safety_hospitalisation": "Safety", "informal_support": "Informal support",
    "home_environment": "Home environment", "mood": "Mood",
}


def classification_html(payload: Dict[str, Any], person_name: Optional[str] = None,
                        persona_label: str = "Caregiver") -> str:
    c = payload["classification"]
    body = [T.brand_header("Classification self-check")]
    body.append(T.h1("Classification Self-Check"))
    body.append(T.subtitle(f"Persona: {persona_label} \u00b7 generated {T.today_au()}"))

    range_txt = (f"Classification {c['primary']}" if c["range_low"] == c["range_high"]
                 else f"Classification {c['range_low']} to {c['range_high']}")
    conf = c.get("confidence")
    conf_color = {"high": T.SAGE, "medium": T.GOLD, "low": T.CLAY}.get(conf, T.MUTED)
    conf_label = {"high": "High confidence", "medium": "Medium confidence",
                  "low": "Low confidence"}.get(conf, conf or "")
    body.append(T.hero_card(
        "Estimated classification", T.esc(range_txt),
        f'{T.money0(c["annual_budget_low"])} to {T.money0(c["annual_budget_high"])} per year '
        f'({T.money0(c["quarterly_budget_low"])} to {T.money0(c["quarterly_budget_high"])} per quarter)'))
    body.append(f'<div style="margin:-6px 0 14px">{T.chip(conf_label, conf_color)}</div>')

    if payload.get("gap_detected") and payload.get("gap_direction") == "up":
        body.append(_banner(
            "Gap detected",
            f'Your daily-life answers suggest higher needs than Classification '
            f'{payload.get("current_classification")} typically covers.', T.CLAY))

    if payload.get("profile_summary"):
        body.append(T.section("Profile match"))
        body.append(T.card(T.esc(payload["profile_summary"])))

    drivers = payload.get("top_drivers") or []
    if drivers:
        body.append(T.section("What drove this result"))
        body.append(T.data_table(
            ["Domain", "Answer"],
            [[_DOMAIN_LABELS.get(d["domain"], d["domain"]), d.get("answer", "")] for d in drivers],
            right_from=99))

    body.append(T.section("Next step"))
    branch = payload.get("branch")
    if branch == "A":
        nxt = ("This is a common reason to request a reassessment. Draft a reassessment letter using "
               "Wayly's Letters and Follow-ups tool, or contact My Aged Care on 1800 200 422.")
    elif branch == "B":
        nxt = ("Your answers line up with your current classification. If the situation changes, run this again.")
    else:
        nxt = ("This is a starting point. The formal assessment is arranged through My Aged Care on 1800 200 422.")
    body.append(T.card(nxt))

    ds = payload.get("domain_scores") or {}
    if ds:
        body.append(T.section("Domain scores"))
        rows = []
        for k, v in ds.items():
            p = round(T.num(v) * 100)
            color = T.SAGE if p < 40 else (T.GOLD if p < 70 else T.CLAY)
            rows.append((_DOMAIN_LABELS.get(k, k), f"{p}%", p, color))
        body.append(T.bars(rows))

    body.append(f'<p class="sub" style="font-size:9pt">This is informational only. Only the My Aged Care '
                f'Integrated Assessment Tool (IAT) determines actual classification.</p>')
    body.append(T.footer("Informational only, not a formal assessment. wayly.com.au"))
    return T.document("Classification self-check", "".join(body))


# ---------------------------------------------------------------------------
# Letters & Follow-ups (LF-1)
# ---------------------------------------------------------------------------
def letter_html(*, subject: str, body: str, cover_note: dict,
                sender_display_name: Optional[str], sender_authority_basis: Optional[str],
                sender_email: Optional[str], include_opan_footer: bool,
                archetype: str, situation_label: Optional[str]) -> str:
    situation = situation_label or archetype.replace("_", " ").title()
    out = [T.brand_header("Letters and follow-ups")]
    out.append(T.h1("Letters &amp; Follow-ups"))
    out.append(T.subtitle(f"{situation} \u00b7 {datetime.now().strftime('%d %B %Y')}"))

    recipient = cover_note.get("entity_name") or "Recipient"
    addr = []
    for k in ("postal_address", "email", "portal_url", "phone"):
        if cover_note.get(k):
            addr.append(T.esc(cover_note[k]))
    from_lines = T.esc(sender_display_name or "")
    if sender_authority_basis:
        from_lines += f'<br/><span style="color:{T.MUTED};font-size:9pt">{T.esc(sender_authority_basis)}</span>'
    if sender_email:
        from_lines += f'<br/><span style="color:{T.MUTED};font-size:9pt">{T.esc(sender_email)}</span>'
    out.append(
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:8px 0 18px">'
        f'<div><div class="overline">From</div><div style="margin-top:4px">{from_lines}</div></div>'
        f'<div><div class="overline">To</div><div style="margin-top:4px">{T.esc(recipient)}'
        f'{("<br/>" + "<br/>".join(addr)) if addr else ""}</div></div></div>')

    out.append(f'<div style="font-family:Fraunces,Georgia,serif;font-size:14pt;font-weight:600;'
               f'color:{T.INK};margin:0 0 12px">{T.esc(subject)}</div>')
    out.append(f'<div class="letter-body">{_paras(body)}</div>')

    if include_opan_footer:
        out.append(T.card(
            "<b>Reference:</b> Older Persons Advocacy Network (OPAN), 1800 700 600. Independent advocacy "
            "is available to older Australians under the Statement of Rights, section 3 of the Aged Care Act 2024."))
    ccs = cover_note.get("cc_recipients") or []
    if ccs:
        cc = ", ".join(f"{T.esc(c.get('label',''))} ({T.esc(c.get('phone',''))})" for c in ccs)
        out.append(f'<p class="sub"><b>cc:</b> {cc}</p>')

    out.append(T.footer("Drafted by an AI assistant with your intake. Review it in full before sending. "
                        "A drafting assistant, not legal advice. wayly.com.au"))
    return T.document(f"Letter \u00b7 {subject}", "".join(out))


# ---------------------------------------------------------------------------
# Care Plan Review (CPR-1)
# ---------------------------------------------------------------------------
_CPR_SEV = {"compliance": ("Compliance", T.TERRACOTTA), "choice": ("Choice", T.CLAY),
            "efficiency": ("Efficiency", T.GOLD), "info": ("Info", T.SAGE)}
_CPR_CAT = {"rights": "Statement of Rights", "clinical": "Clinical adequacy", "service_mix": "Service mix",
            "budget": "Budget", "cohort": "Cultural safety and cohort", "timebound": "Time-bound triggers",
            "choice": "Participant voice"}


def care_plan_html(*, plan: Dict[str, Any], extraction: Dict[str, Any], findings: List[Dict[str, Any]],
                   verification_panel: Optional[Dict[str, Any]] = None,
                   plan_summary_text: Optional[str] = None,
                   safety_notice: Optional[Dict[str, Any]] = None) -> str:
    body = [T.brand_header("Care plan review")]
    body.append(T.h1("Care Plan Review"))
    body.append(T.subtitle(f"Prepared for your next provider meeting \u00b7 {T.today_au()}"))

    if plan_summary_text:
        body.append(T.section("Plan summary"))
        body.append(T.card(_paras(plan_summary_text)))

    provider = plan.get("provider_name") or extraction.get("provider_name") or "Unspecified provider"
    eff_from = plan.get("effective_from") or extraction.get("effective_from")
    eff_to = plan.get("effective_to") or extraction.get("effective_to")
    cls = plan.get("classification_at_review") or extraction.get("classification")
    budget = plan.get("quarterly_budget_at_review") or extraction.get("quarterly_budget")
    body.append(T.section("Plan overview"))
    body.append(_meta([
        ("Provider", provider),
        ("Effective", f"{_ddmm(eff_from)} \u2192 {_ddmm(eff_to)}" if eff_from else None),
        ("Classification", str(cls) if cls else None),
        ("Quarterly budget", T.money(budget) if isinstance(budget, (int, float)) else None),
    ]))

    if safety_notice and (safety_notice.get("title") or safety_notice.get("body")):
        body.append(_banner(safety_notice.get("title") or "Safety notice",
                            safety_notice.get("body") or "", T.GOLD, dark_text=True))

    vp_checks = (verification_panel or {}).get("checks") or []
    if vp_checks:
        body.append(T.section("Safety checks we ran"))
        _sl = {"pass": ("All good", T.SAGE), "flag": ("Worth a look", T.CLAY),
               "cannot_run": ("Need more info", T.GOLD)}
        for c in vp_checks:
            lab, col = _sl.get(c.get("status"), ("Need more info", T.GOLD))
            body.append(f'<div class="flag" style="border-left-color:{col}">'
                        f'<div class="row"><div class="ttl">{T.esc(c.get("label",""))}</div>'
                        f'{T.chip(lab, col)}</div>'
                        f'<div class="det">{T.esc(c.get("detail",""))}</div></div>')

    by_sev = {"compliance": 0, "choice": 0, "efficiency": 0, "info": 0}
    for f in findings:
        s = f.get("severity") or "info"
        if s in by_sev:
            by_sev[s] += 1
    body.append(T.section("Findings summary"))
    tiles = []
    for key in ("compliance", "choice", "efficiency", "info"):
        lab, col = _CPR_SEV[key]
        tiles.append(f'<div class="kpi"><span class="val" style="color:{col}">{by_sev[key]}</span>'
                     f'<span class="lbl" style="margin-top:4px">{lab}</span></div>')
    body.append(f'<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr)">{"".join(tiles)}</div>')

    scripts = [f for f in findings if f.get("suggested_question")]
    if scripts:
        body.append(T.section("Verbatim question script"))
        body.append('<p class="sub" style="font-size:9pt">Read each question aloud during the meeting. '
                    'Space is provided below each for the provider\u2019s answer.</p>')
        for i, f in enumerate(scripts, 1):
            src = (f'<div class="det" style="color:{T.MUTED}">Source: {T.esc(f["citation_source"])}</div>'
                   if f.get("citation_source") else "")
            body.append(f'<div class="flag"><div class="ttl">{i}. {T.esc(f["suggested_question"])}</div>{src}'
                        f'<div class="notes-lines"><div class="line"></div><div class="line"></div></div></div>')

    body.append(T.section("All findings"))
    for sev in ("compliance", "choice", "efficiency", "info"):
        rows = [f for f in findings if f.get("severity") == sev]
        if not rows:
            continue
        lab, col = _CPR_SEV[sev]
        body.append(f'<div class="band-hd"><span class="pill" style="background:{col}">&#8226;</span>'
                    f'<span>{lab}</span><span class="ct">({len(rows)})</span></div>')
        for f in rows:
            cat = _CPR_CAT.get(f.get("category", ""), f.get("category", ""))
            det = f'<div class="det">{T.esc(f.get("detail",""))}</div>' if f.get("detail") else ""
            src = (f'<div class="det" style="color:{T.MUTED}">Source: {T.esc(f["citation_source"])}</div>'
                   if f.get("citation_source") else "")
            body.append(f'<div class="flag" style="border-left-color:{col}">'
                        f'<div class="ttl">{T.esc(f.get("title",""))} '
                        f'<span style="color:{T.MUTED};font-weight:400;font-size:9pt">\u00b7 {T.esc(cat)}</span></div>'
                        f'{det}{src}</div>')

    body.append(T.section("Your meeting notes"))
    body.append('<div class="notes-lines">' + ('<div class="line"></div>' * 12) + '</div>')

    body.append(T.footer("Take this to your next provider meeting. A preparation aid, not a formal audit. wayly.com.au"))
    return T.document("Care plan review", "".join(body))


# ---------------------------------------------------------------------------
# Complaint evidence bundle (CMP-1)
# ---------------------------------------------------------------------------
_STAGE_LABEL = {
    "drafting": "Drafting", "stage_1_internal_provider": "Stage 1 \u00b7 Internal provider",
    "stage_2_provider_senior": "Stage 2 \u00b7 Provider senior mgmt",
    "stage_3_acqsc_referral": "Stage 3 \u00b7 ACQSC referral",
    "stage_4_ombudsman_referral": "Stage 4 \u00b7 Ombudsman referral",
    "stage_5_appeals": "Stage 5 \u00b7 Appeals", "closed_resolved": "Closed \u00b7 resolved",
    "closed_abandoned": "Closed \u00b7 abandoned",
}
_SRC_LABEL = {"statement": "Statement", "invoice": "Invoice", "invoice_check_result": "Invoice check result",
              "care_plan_review": "Care plan review", "contribution_estimate": "Contribution estimate",
              "contribution_reconciliation": "Contribution reconciliation", "correspondence": "Correspondence",
              "voice_check": "Voice check", "user_note": "User note", "external_upload": "External upload"}


def _dt(v) -> str:
    if not v:
        return ""
    try:
        return datetime.fromisoformat(str(v).replace("Z", "+00:00")).strftime("%d/%m/%Y %H:%M")
    except Exception:
        return str(v)[:16]


def complaint_bundle_html(complaint: Dict[str, Any], evidence_items: List[Dict[str, Any]],
                          participant_name: str) -> str:
    body = [T.brand_header("Complaint evidence bundle")]
    body.append(T.h1("Complaint Evidence Bundle"))
    body.append(T.subtitle(f"Participant: {participant_name} \u00b7 generated {T.today_au()}"))

    body.append(T.section("Complaint summary"))
    body.append(_meta([
        ("Provider", complaint.get("provider_name")),
        ("Complaint type", (complaint.get("complaint_type") or "").replace("_", " ").title() or None),
        ("Severity", (complaint.get("severity") or "").replace("_", " ").title() or None),
        ("Current stage", _STAGE_LABEL.get(complaint.get("current_stage", ""), complaint.get("current_stage"))),
        ("Desired outcome", (complaint.get("desired_outcome") or "").replace("_", " ").title() or None),
        ("Opened", _dt(complaint.get("created_at"))),
    ]))

    body.append(T.section("What happened"))
    body.append(T.card(T.esc(complaint.get("subject_matter_summary") or "\u2014")))
    if complaint.get("desired_outcome_notes"):
        body.append(T.card(f'<b>Desired outcome (notes)</b><br/>{T.esc(complaint["desired_outcome_notes"])}'))

    stage_history = complaint.get("stage_history") or []
    if stage_history:
        body.append(T.section("Stage history"))
        rows = [[_STAGE_LABEL.get(h.get("stage", ""), h.get("stage", "")),
                 _dt(h.get("entered_at")),
                 _dt(h.get("exited_at")) if h.get("exited_at") else "current",
                 (h.get("outcome_at_exit") or "").replace("_", " ")] for h in stage_history]
        body.append(T.data_table(["Stage", "Entered", "Exited", "Outcome"], rows, right_from=99))

    confirmed = [e for e in evidence_items if e.get("user_confirmed_for_inclusion")]
    body.append(T.section(f"Confirmed evidence ({len(confirmed)} item{'s' if len(confirmed) != 1 else ''})"))
    if confirmed:
        for i, e in enumerate(confirmed, 1):
            note = f'<div class="det">{T.esc(e["notes"])}</div>' if e.get("notes") else ""
            src_label = _SRC_LABEL.get(e.get("source_type", ""), e.get("source_type", "Item"))
            ref = T.esc(e.get("source_id") or "\u2014")
            body.append(f'<div class="flag" style="border-left-color:{T.INK}">'
                        f'<div class="ttl">{i}. {T.esc(src_label)}</div>'
                        f'<div class="det">Reference: <b>{ref}</b></div>{note}</div>')
    else:
        body.append(T.card("No evidence items were confirmed for inclusion."))

    if complaint.get("contains_elder_abuse_indicators"):
        body.append(_banner("Safety resources",
                           "If there is immediate danger, phone 000. Elder Abuse Helpline 1800 353 374. "
                           "Lifeline 13 11 14. Aged Care Quality and Safety Commission 1800 951 822.", T.TERRACOTTA))

    body.append(T.footer("A compilation of information you recorded, not legal or clinical advice. wayly.com.au"))
    return T.document(f"Complaint bundle \u00b7 {participant_name}", "".join(body))


# ---------------------------------------------------------------------------
# Carer handover pack (CS-1)
# ---------------------------------------------------------------------------
def carer_handover_html(pack: Dict[str, Any], participant_name: str) -> str:
    body = [T.brand_header("Carer handover pack")]
    body.append(T.h1("Carer Handover Pack"))
    body.append(T.subtitle(f"Caring for: {participant_name} \u00b7 generated {T.today_au()}"))

    if pack.get("emergency_priorities"):
        body.append(T.section("If something goes wrong, do this first"))
        body.append(f'<div class="flag" style="border-left-color:{T.TERRACOTTA};background:#FBF0ED">'
                    f'<div class="det">{T.esc(pack["emergency_priorities"]).replace(chr(10), "<br/>")}</div></div>')
    for key, title in (("my_routines", "Daily routines"), ("my_key_information", "Key information"),
                       ("my_medical_needs", "Medical needs")):
        if pack.get(key):
            body.append(T.section(title))
            body.append(T.card(T.esc(pack[key]).replace("\n", "<br/>")))

    contacts = [c for c in (pack.get("backup_contacts") or []) if isinstance(c, dict) and (c.get("name") or c.get("phone"))]
    if contacts:
        body.append(T.section("Backup contacts"))
        body.append(T.data_table(["Name", "Relationship", "Phone"],
                                 [[c.get("name", ""), c.get("relationship", ""), c.get("phone", "")] for c in contacts],
                                 right_from=99))
    helpers = [h for h in (pack.get("who_can_help_with_what") or []) if isinstance(h, dict) and (h.get("who") or h.get("what"))]
    if helpers:
        body.append(T.section("Who can help with what"))
        body.append(T.data_table(["Who", "What they help with"],
                                 [[h.get("who", ""), h.get("what", "")] for h in helpers], right_from=99))

    if not (pack.get("emergency_priorities") or pack.get("my_routines") or pack.get("my_key_information")
            or pack.get("my_medical_needs") or contacts or helpers):
        body.append(T.card("This handover pack is empty. Add routines, key information and backup contacts "
                           "in Wayly, then download it again."))

    body.append(T.footer("Generated from information the primary carer recorded. Not clinical or medical advice. wayly.com.au"))
    return T.document(f"Carer handover \u00b7 {participant_name}", "".join(body))


# ---------------------------------------------------------------------------
# Family handover pack (FC-2)
# ---------------------------------------------------------------------------
_PURPOSE_LABEL = {"primary_caregiver_absence": "Primary caregiver is away", "hospital_visit": "Hospital visit",
                  "provider_change": "Provider change", "other": "Handover"}
_CAT_LABEL = {"preferences_care_style": "Care style", "preferences_daily_routine": "Daily routine",
              "preferences_communication": "Communication", "values_and_dignity": "Values and dignity"}


def family_handover_html(*, participant_name: str, purpose: str, purpose_notes: str,
                         tasks: List[Dict[str, Any]], upcoming: List[Dict[str, Any]],
                         preferences: List[Dict[str, Any]], incidents: List[Dict[str, Any]]) -> str:
    def _f(v):
        if not v:
            return ""
        try:
            return datetime.fromisoformat(str(v).replace("Z", "+00:00")).strftime("%a %d %b, %I:%M %p")
        except Exception:
            return str(v)[:16]

    body = [T.brand_header("Family handover pack")]
    body.append(T.h1("Family Handover Pack"))
    sub = f"For {participant_name} \u00b7 {_PURPOSE_LABEL.get(purpose, 'Handover')} \u00b7 {T.today_au()}"
    body.append(T.subtitle(sub))
    if purpose_notes:
        body.append(T.card(T.esc(purpose_notes)))

    def _sec(title, rows, render):
        body.append(T.section(title))
        if not rows:
            body.append(f'<p class="sub" style="font-size:9pt">Nothing recorded.</p>')
            return
        body.append('<ul class="steps">' + "".join(f"<li>{render(r)}</li>" for r in rows) + "</ul>")

    _sec("Upcoming services", upcoming,
         lambda e: f'<b>{_f(e.get("start_datetime"))}</b> \u2014 {T.esc(e.get("title","Service"))}'
                   + (f' \u00b7 {T.esc(e.get("provider_name"))}' if e.get("provider_name") else ""))
    _sec("Open tasks", tasks,
         lambda t: f'{T.esc(t.get("title",""))}'
                   + (f' (due {T.esc(t.get("due_date"))})' if t.get("due_date") else "")
                   + (f' \u2014 {T.esc(t.get("assignee_name"))}' if t.get("assignee_name") else ""))
    _sec("Care preferences", preferences,
         lambda n: f'<b>{T.esc(_CAT_LABEL.get(n.get("category"), "Preference"))}:</b> {T.esc(n.get("content",""))}')
    _sec("Open issues to be aware of", incidents,
         lambda i: f'{T.esc(i.get("summary",""))} ({T.esc(i.get("status",""))})')

    body.append(T.footer("Generated from information the household recorded. Not clinical advice. wayly.com.au"))
    return T.document(f"Family handover \u00b7 {participant_name}", "".join(body))


# ---------------------------------------------------------------------------
# CHSP tools
# ---------------------------------------------------------------------------
_CHSP_CAT = {"clinical": "Clinical care", "personal": "Personal care & respite",
             "everyday": "Everyday living", "social": "Social & transport", "other": "Other"}
_CHSP_VAR = {"within": ("OK", T.SAGE), "minor": ("Slightly high", T.GOLD), "material": ("Overcharged", T.TERRACOTTA)}


def chsp_invoice_html(payload: Dict[str, Any]) -> str:
    header = payload.get("header") or {}
    totals = payload.get("totals") or {}
    line_items = payload.get("line_items") or []
    by_category = payload.get("by_category") or []
    flags_count = int(payload.get("flags_count") or 0)

    body = [T.brand_header("CHSP invoice review")]
    body.append(T.h1("CHSP Invoice Review"))
    bits = [header.get("provider_name"),
            f"Invoice {header.get('invoice_reference')}" if header.get("invoice_reference") else None,
            header.get("client_name")]
    if header.get("period_start"):
        p = _ddmm(header["period_start"])
        if header.get("period_end"):
            p += f" to {_ddmm(header['period_end'])}"
        bits.append(p)
    body.append(T.subtitle(" \u00b7 ".join(str(b) for b in bits if b) + f" \u00b7 {T.today_au()}"))

    if payload.get("plain_summary"):
        body.append(T.section("Wayly summary"))
        body.append(T.card(T.esc(payload["plain_summary"]), accent=True))

    body.append(T.kpi_grid([
        ("Total billed", T.money(totals.get("grand_total"))),
        ("Your contribution", T.money(totals.get("client_contribution"))),
        ("Government subsidy", T.money(totals.get("government_subsidy"))),
        ("Lines flagged", str(flags_count), "above your saved rate" if flags_count else "none"),
    ], hero_first=True, cols=4))

    if by_category:
        body.append(T.section("Where the money went"))
        total = sum(T.num(c.get("amount")) for c in by_category) or 1
        tones = [T.INK, T.CLAY, T.SAGE, "#8A4423", "#0A3E42"]
        rows = []
        for i, c in enumerate(by_category):
            v = T.num(c.get("amount"))
            label = c.get("label") or _CHSP_CAT.get(c.get("key"), "Other")
            rows.append((label, T.money(v), v / total * 100, tones[i % len(tones)]))
        body.append(T.bars(rows))

    body.append(T.section(f"Line by line ({len(line_items)})"))
    rows = []
    for li in line_items:
        name = li.get("description") or (li.get("service_type") or "").replace("_", " ").title()
        units = li.get("units")
        unit_str = "" if units is None else f"{units}{(' ' + li.get('unit_label')) if li.get('unit_label') else ''}"
        vs = li.get("variance_status")
        chk = ""
        if vs and vs in _CHSP_VAR:
            lab, col = _CHSP_VAR[vs]
            chk = T.chip(lab, col)
        rows.append([
            name, li.get("dates") or "", unit_str,
            T.money(li.get("unit_rate")) if li.get("unit_rate") is not None else "",
            T.money(li.get("amount")), chk,
        ])
    body.append(T.data_table(["Service", "Dates", "Units", "Unit rate", "Amount", "Rate check"],
                             rows, right_from=2))

    steps = [s for s in (payload.get("next_steps") or []) if s]
    if steps:
        body.append(T.section("What to do next"))
        body.append('<ul class="steps">' + "".join(f"<li>{T.esc(s)}</li>" for s in steps[:4]) + "</ul>")

    body.append(T.footer("Reviewed by Wayly. Check figures against your original CHSP invoice. wayly.com.au"))
    return T.document("CHSP invoice review", "".join(body))


def chsp_fee_check_html(payload: Dict[str, Any]) -> str:
    fields = payload.get("fields") or {}
    result = payload.get("result") or {}
    provider = fields.get("provider_name") or "CHSP provider"
    service = fields.get("service_type_label") or (fields.get("service_type") or "").replace("_", " ").title()

    body = [T.brand_header("CHSP fee check")]
    body.append(T.h1("CHSP Fee Check"))
    body.append(T.subtitle(f"{provider} \u00b7 {service} \u00b7 generated {T.today_au()}"))

    overall = result.get("overall_verdict")
    _, accent = _CHSP_VAR.get(overall, ("", T.INK))
    body.append(_banner(result.get("verdict_headline") or result.get("verdict_label") or "Checked",
                       result.get("verdict_explanation") or "", accent))

    if result.get("degraded"):
        body.append(T.card("No verdict yet \u2014 add your provider\u2019s agreed per-unit rate to get a clear answer."))
    else:
        body.append(T.kpi_grid([
            ("Billed per unit", T.money(result.get("billed_per_unit"))),
            ("Agreed rate", T.money(result.get("agreed_rate") or fields.get("agreed_rate"))),
            ("Expected amount", T.money(result.get("expected_amount"))),
            ("Billed amount", T.money(result.get("billed_amount") or fields.get("billed_amount"))),
        ], cols=4))
        rows = [
            ["Rate check", _CHSP_VAR.get(result.get("rate_tier"), ("\u2014", ""))[0] if result.get("rate_tier") in _CHSP_VAR else (result.get("rate_tier_label") or "\u2014"),
             result.get("rate_explanation") or ""],
            ["Units check", _CHSP_VAR.get(result.get("units_tier"), ("\u2014", ""))[0] if result.get("units_tier") in _CHSP_VAR else (result.get("units_tier_label") or "\u2014"),
             result.get("units_explanation") or ""],
        ]
        body.append(T.data_table(["Check", "Result", "What it means"], rows, right_from=99))

    body.append(T.footer("Checked by Wayly against your provider\u2019s agreed per-unit rate. wayly.com.au"))
    return T.document("CHSP fee check", "".join(body))


def chsp_findings_letter_html(payload: Dict[str, Any]) -> str:
    letter = str(payload.get("letter") or "").strip()
    provider = payload.get("provider_name") or "your provider"
    bits = [provider, payload.get("client_name"),
            f"Invoice {payload.get('invoice_reference')}" if payload.get("invoice_reference") else None,
            payload.get("period")]
    body = [T.brand_header("Findings letter")]
    body.append(T.h1("Findings Letter"))
    body.append(T.subtitle(" \u00b7 ".join(str(b) for b in bits if b) + f" \u00b7 {T.today_au()}"))
    body.append(f'<div class="letter-body">{_paras(letter)}</div>')
    body.append(T.footer("Drafted by Wayly from your invoice review. Check the details before you send it. wayly.com.au"))
    return T.document("Findings letter", "".join(body))
