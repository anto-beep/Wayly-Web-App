"""DEC-1 reconciliation gates (P0).

Deterministic, model-independent trust checks that run AFTER extraction +
LLM audit and BEFORE the plain-English summary is rendered. They exist because
a summary that contradicts its own numbers is the core harm: the tool must
refuse to publish one.

Gates
-----
G1  Per-line arithmetic ..... rate x units must equal gross. A $0 gross with a
    valid rate x units is treated as a dropped figure, not a genuine zero.
G6  Charged cancellation ..... a line flagged as a cancellation that still
    carries a fee needs a policy check, not silent zeroing.
G3  Budget vs INDEX-1 ........ the stated quarterly budget must be a real
    Support at Home classification budget; QTD usage must not exceed it.
G2  Gross reconciliation ..... the line items must add up to the header total.

Any HIGH gate finding is a *publish blocker*: ``audit_result['publishable']``
is set False and ``audit_result['publish_block']`` carries the reasons so the
summary layer can hard-block.

All checks are defensive: they never raise, and they no-op when the required
figures are absent.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Optional

# How many per-line arithmetic flags to emit before we stop (avoids flooding a
# badly-extracted statement with dozens of rows). The publish gate still fires.
_ARITH_FLAG_CAP = 15
_CENT = 0.01


def _f(v) -> float:
    try:
        return float(v or 0)
    except Exception:
        return 0.0


def _aud(n) -> str:
    try:
        return f"${float(n or 0):,.2f}"
    except Exception:
        return "$0.00"


def _qty_str(q: float) -> str:
    return f"{q:g}"


def _parse_classification(ext: dict) -> Optional[int]:
    raw = str(ext.get("classification") or "")
    m = re.search(r"\b([1-8])\b", raw)
    return int(m.group(1)) if m else None


def _as_of(ext: dict):
    """Best-effort statement date so INDEX-1 lookups pick the right indexation."""
    src = f"{ext.get('statement_period') or ''} {ext.get('period_end') or ''}"
    iso = re.search(r"(20\d{2})-(\d{1,2})", src)
    if iso:
        try:
            return date(int(iso.group(1)), min(12, max(1, int(iso.group(2)))), 1)
        except Exception:
            pass
    au = re.search(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b", src)
    if au:
        try:
            return date(int(au.group(3)), min(12, max(1, int(au.group(2)))), 1)
        except Exception:
            pass
    yr = re.search(r"\b(20\d{2})\b", src)
    if yr:
        try:
            return date(int(yr.group(1)), 7, 1)
        except Exception:
            pass
    return None


def _valid_quarterly_budgets(as_of) -> Dict[int, float]:
    """Official SAH quarterly budget per classification = annual / 4 (this
    INCLUDES the 10% care-management slice, matching what a statement prints)."""
    out: Dict[int, float] = {}
    try:
        import budget as _b  # top-level module, cwd=/app/backend
    except Exception:
        return out
    for c in range(1, 9):
        try:
            annual = _b.classification_annual(c, as_of)
            if annual and annual > 0:
                out[c] = round(float(annual) / 4.0, 2)
        except Exception:
            continue
    return out


def run_reconciliation_gates(
    anomalies: List[Dict[str, Any]],
    extracted: Dict[str, Any],
    audit_result: Dict[str, Any],
) -> None:
    """Mutate ``anomalies`` (append gate findings, drop superseded softer ones)
    and set ``audit_result['publishable']`` / ``['publish_block']``."""
    ext = extracted or {}
    existing = {(a.get("rule") or "").upper() for a in anomalies if isinstance(a, dict)}
    blocker_rules: List[str] = []
    blocker_items: List[Dict[str, str]] = []

    def add(anom: Dict[str, Any], is_blocker: bool = False) -> None:
        rule = (anom.get("rule") or "").upper()
        if not rule or rule in existing:
            return
        anomalies.append(anom)
        existing.add(rule)
        if is_blocker:
            blocker_rules.append(rule)
            blocker_items.append({
                "headline": str(anom.get("headline") or ""),
                "detail": str(anom.get("detail") or ""),
            })

    line_items = [li for li in (ext.get("line_items") or []) if isinstance(li, dict)]

    # ---------- GATE 1: per-line arithmetic (+ G6 charged cancellations) ----------
    arith_count = 0
    for li in line_items:
        rate = _f(li.get("unit_rate"))
        qty = _f(li.get("hours") if li.get("hours") is not None else (li.get("units") or li.get("quantity")))
        gross = _f(li.get("gross") if li.get("gross") is not None else li.get("total"))
        desc = (str(li.get("service_description") or li.get("service_name") or "service").strip() or "service")
        dt = str(li.get("date") or "").strip()
        computed = round(rate * qty, 2)

        if li.get("is_cancellation"):
            charged = _f(li.get("charged_amount"))
            if charged <= _CENT:
                charged = computed if computed > _CENT else gross
            if charged > _CENT:
                add({
                    "severity": "medium",
                    "rule": "RULE_G6_CANCELLATION_CHARGED",
                    "headline": f"A cancelled service on {dt or 'this statement'} was still charged {_aud(charged)}.",
                    "detail": (
                        f"The line for \"{desc}\" is marked as a cancellation but carries a charge of {_aud(charged)} "
                        f"({_aud(rate)} times {_qty_str(qty)}). Under Support at Home a short-notice cancellation fee only "
                        f"applies when the provider's cancellation policy allows it and the required notice period was actually missed."
                    ),
                    "dollar_impact": round(charged, 2),
                    "evidence": [f"{dt} {desc}: {_aud(rate)} x {_qty_str(qty)} = {_aud(charged)}, marked as cancellation"],
                    "suggested_action": "Ask the provider to confirm their cancellation policy and that the notice period was missed before this fee applies.",
                    "date": dt,
                })
            continue

        if computed <= _CENT or arith_count >= _ARITH_FLAG_CAP:
            continue

        if abs(gross) < _CENT and computed > _CENT:
            arith_count += 1
            add({
                "severity": "high",
                "rule": "RULE_G1_ZERO_GROSS",
                "headline": f"A line on {dt or 'this statement'} reads $0.00 but the rate and units come to {_aud(computed)}.",
                "detail": (
                    f"\"{desc}\" lists {_aud(rate)} times {_qty_str(qty)}, which is {_aud(computed)}, yet the amount was read as $0.00. "
                    f"That looks like a figure that did not come through rather than a genuine zero."
                ),
                "dollar_impact": computed,
                "evidence": [f"{dt} {desc}: {_aud(rate)} x {_qty_str(qty)} = {_aud(computed)}, gross read as $0.00"],
                "suggested_action": "Re-check this line against the statement; the amount is missing from the decoded figures.",
                "date": dt,
            }, is_blocker=True)
        elif abs(gross - computed) > _CENT:
            arith_count += 1
            delta = round(gross - computed, 2)
            add({
                "severity": "high",
                "rule": "RULE_G1_LINE_ARITHMETIC",
                "headline": f"The maths on the {dt} \"{desc}\" line does not add up.".replace("  ", " "),
                "detail": (
                    f"The statement shows {_aud(gross)} for \"{desc}\", but {_aud(rate)} times {_qty_str(qty)} is {_aud(computed)}. "
                    f"That is a difference of {_aud(abs(delta))}."
                ),
                "dollar_impact": abs(delta),
                "evidence": [f"{dt} {desc}: stated {_aud(gross)} vs {_aud(rate)} x {_qty_str(qty)} = {_aud(computed)} (delta {_aud(delta)})"],
                "suggested_action": "Ask the provider to confirm the correct amount for this line.",
                "date": dt,
            }, is_blocker=True)

    # ---------- GATE 3: budget validity + QTD over budget ----------
    as_of = _as_of(ext)
    valid = _valid_quarterly_budgets(as_of)
    cls = _parse_classification(ext)
    stated_q = 0.0
    for k in ("quarterly_budget_total", "quarterly_allocation"):
        v = _f(ext.get(k))
        if v > 0:
            stated_q = v
            break

    if stated_q > 0 and valid:
        matches_any = any(abs(b - stated_q) <= 5.0 for b in valid.values())
        nearest = min(valid.items(), key=lambda kv: abs(kv[1] - stated_q))
        if not matches_any:
            add({
                "severity": "high",
                "rule": "RULE_G3_BUDGET_NOT_IN_INDEX",
                "headline": f"The quarterly budget on this statement ({_aud(stated_q)}) is not a recognised Support at Home amount.",
                "detail": (
                    f"Support at Home quarterly budgets are fixed per classification, and {_aud(stated_q)} does not match any of them. "
                    f"The closest is Class {nearest[0]} at {_aud(nearest[1])}. Because the budget figure looks wrong, we have not used it to "
                    f"work out how much is left."
                ),
                "dollar_impact": 0.0,
                "evidence": [f"stated quarterly budget {_aud(stated_q)}; valid range {_aud(min(valid.values()))} to {_aud(max(valid.values()))}"],
                "suggested_action": "Ask the provider which classification applies and confirm the correct quarterly budget.",
            }, is_blocker=True)
        elif cls and cls in valid and abs(valid[cls] - stated_q) > 5.0:
            add({
                "severity": "high",
                "rule": "RULE_G3_BUDGET_CLASS_MISMATCH",
                "headline": f"The quarterly budget shown ({_aud(stated_q)}) does not match Class {cls}.",
                "detail": (
                    f"The statement lists Class {cls}, whose quarterly budget is {_aud(valid[cls])}, but it shows {_aud(stated_q)}. "
                    f"We have not used the stated figure to work out how much is left."
                ),
                "dollar_impact": 0.0,
                "evidence": [f"Class {cls} budget {_aud(valid[cls])} vs stated {_aud(stated_q)}"],
                "suggested_action": "Ask the provider to confirm the classification and the quarterly budget.",
            }, is_blocker=True)

    true_budget = valid.get(cls) if cls else None
    remaining_raw = ext.get("budget_remaining_at_quarter_end")
    if true_budget and stated_q > 0 and remaining_raw is not None:
        used_qtd = round(stated_q - _f(remaining_raw), 2)
        if used_qtd > true_budget + 5.0:
            pct = round(used_qtd / true_budget * 100)
            add({
                "severity": "high",
                "rule": "RULE_G3_QTD_OVER_BUDGET",
                "headline": f"Spending this quarter ({_aud(used_qtd)}) is over the entire Class {cls} quarterly budget.",
                "detail": (
                    f"Class {cls} has {_aud(true_budget)} for the quarter, but usage so far works out to {_aud(used_qtd)}, about {pct}% of it. "
                    f"A quarterly budget cannot be exceeded from the ongoing envelope alone; extra spend should sit under a separate pathway "
                    f"(Restorative Care, End-of-Life, or the AT-HM scheme). If the statement does not separate those out, this needs explaining."
                ),
                "dollar_impact": round(used_qtd - true_budget, 2),
                "evidence": [f"stated budget {_aud(stated_q)} minus remaining {_aud(_f(remaining_raw))} = used {_aud(used_qtd)} vs Class {cls} {_aud(true_budget)}"],
                "suggested_action": "Ask the provider to explain how spending exceeds the quarterly budget and which funding pathway covers the excess.",
            }, is_blocker=True)

    # ---------- GATE 2: gross reconciliation ----------
    # The statement's bottom-line total sums the service line items PLUS a set
    # of amounts that are deliberately NOT stored as line items, care
    # management, package/administration management, GST, and any charged
    # cancellation fee, minus previous-period credits. Reconcile against ALL of
    # those so a statement with a perfectly normal care-management fee doesn't
    # falsely block.
    reported_gross = _f(ext.get("reported_total_gross"))
    line_gross = round(
        sum(
            _f(li.get("gross") if li.get("gross") is not None else li.get("total"))
            for li in line_items
            if not li.get("is_cancellation")
        ),
        2,
    )
    care_mgmt = _f(ext.get("care_management_deducted"))
    pkg_mgmt = _f(ext.get("package_management_deducted"))
    gst_total = _f(ext.get("gst_total"))
    charged_cancellations = round(
        sum(_f(li.get("charged_amount")) for li in line_items if li.get("is_cancellation")),
        2,
    )
    adj_credit = round(
        sum(_f(a.get("credit_amount")) for a in (ext.get("previous_period_adjustments") or []) if isinstance(a, dict)),
        2,
    )

    if reported_gross > 0:
        tol = max(5.0, 0.02 * reported_gross)
        # The statement's own total may or may not include the separately-listed
        # fees (care management, package management, GST) and charged
        # cancellations, providers differ, and some print a services-only
        # subtotal as the headline while others print an all-in total. So
        # reconcile against a BAND: from the services-only figure up to services
        # plus every known fee. Anything inside the band reconciles, which stops
        # a normal care-management fee from ever falsely blocking.
        lower_bound = round(line_gross - adj_credit, 2)
        upper_bound = round(line_gross + care_mgmt + pkg_mgmt + gst_total + charged_cancellations, 2)
        _evidence = [
            f"services {_aud(line_gross)}; adding known fees (care management {_aud(care_mgmt)}, package management {_aud(pkg_mgmt)}, "
            f"GST {_aud(gst_total)}, charged cancellations {_aud(charged_cancellations)}) and credits {_aud(adj_credit)} gives a "
            f"reconciled range {_aud(lower_bound)} to {_aud(upper_bound)}; statement's own total {_aud(reported_gross)}"
        ]

        # One issue, one flag: supersede the softer RULE_15 parse warning
        # whenever we are going to say something about the gross total.
        def _supersede_rule_15():
            for a in list(anomalies):
                if (a.get("rule") or "").upper() == "RULE_15_GROSS_TOTAL_PARSE_WARNING":
                    anomalies.remove(a)
                    existing.discard("RULE_15_GROSS_TOTAL_PARSE_WARNING")

        if lower_bound - tol <= reported_gross <= upper_bound + tol:
            pass  # the statement's parts reconcile to its own total.
        elif reported_gross > upper_bound + tol:
            # Even after adding every known fee we account for LESS than the
            # statement's total, so service lines are genuinely missing. A modest
            # shortfall (a fee line or one repeated visit we did not pick up) is
            # surfaced WITHOUT blocking; only when we are missing so much (>20%
            # of the total) that any breakdown would be materially wrong do we
            # hard-block.
            _supersede_rule_15()
            gap = round(reported_gross - upper_bound, 2)
            if gap / reported_gross > 0.20:
                add({
                    "severity": "high",
                    "rule": "RULE_G2_GROSS_RECONCILE",
                    "headline": f"We could only account for {_aud(upper_bound)} of the statement's {_aud(reported_gross)} total.",
                    "detail": (
                        f"Adding up everything we could read from this statement, services plus fees, comes to at most {_aud(upper_bound)}, but its own "
                        f"total is {_aud(reported_gross)}, a gap of {_aud(gap)}. That is too much to leave out, so we can't publish a reliable breakdown "
                        f"yet, some lines were most likely missed or could not be read."
                    ),
                    "dollar_impact": gap,
                    "evidence": _evidence,
                    "suggested_action": "Re-run the statement, and if the gap remains, check it against the original, some lines may be missing from the decoded figures.",
                }, is_blocker=True)
            else:
                add({
                    "severity": "medium",
                    "rule": "RULE_G2_GROSS_RECONCILE",
                    "headline": f"Our breakdown comes to a little under the statement's {_aud(reported_gross)} total.",
                    "detail": (
                        f"We matched up to {_aud(upper_bound)} of the statement's {_aud(reported_gross)} total, leaving about {_aud(gap)} unaccounted for. "
                        f"That is usually a fee line such as package management or GST, or a repeated visit we did not pick up, rather than an error on the "
                        f"statement. The headline figures use the statement's own total, so the who-paid split stays right, but the per-line breakdown below "
                        f"may be missing a row or two."
                    ),
                    "dollar_impact": gap,
                    "evidence": _evidence,
                    "suggested_action": "If you want the full breakdown, compare the decoded lines against your statement and let us know which line is missing.",
                })
        else:
            # reported_gross < lower_bound - tol: we account for MORE than even
            # the services-only total, which points to a doubled line in what we
            # are showing. Publishing it would overstate the spend, so block.
            _supersede_rule_15()
            gap = round(lower_bound - reported_gross, 2)
            add({
                "severity": "high",
                "rule": "RULE_G2_GROSS_RECONCILE",
                "headline": f"The services on this statement add up to more than its own total ({_aud(line_gross)} vs {_aud(reported_gross)}).",
                "detail": (
                    f"Adding up the services on this statement comes to {_aud(line_gross)}, which is {_aud(gap)} more than the statement's own total of "
                    f"{_aud(reported_gross)}. A line has most likely been counted twice, so the totals cannot be trusted until it is resolved."
                ),
                "dollar_impact": gap,
                "evidence": _evidence,
                "suggested_action": "Check for a service that appears twice on the statement; one copy may have been billed in error.",
            }, is_blocker=True)


    # ---------- GATE 7: transparency — surface Wayly's OWN recategorisations ----------
    # Never let one of our own interpretation decisions read as a provider error.
    def _norm_stream(v: str) -> str:
        return re.sub(r"[^a-z]", "", str(v or "").lower())

    _PRETTY = {
        "everydayliving": "Everyday Living", "independence": "Independence",
        "clinical": "Clinical Care", "clinicalcare": "Clinical Care",
        "athm": "Assistive Technology (AT-HM)", "caremgmt": "Care Management",
        "supplement": "Supplement",
    }

    def _pretty_stream(v: str) -> str:
        return _PRETTY.get(_norm_stream(v), str(v or "").strip())

    for li in line_items:
        src = li.get("source_stream")
        dst = li.get("stream")
        if not src or not dst:
            continue
        if _norm_stream(src) == _norm_stream(dst) or not _norm_stream(src):
            continue
        desc = (str(li.get("service_description") or li.get("service_name") or "service").strip() or "service")
        dt = str(li.get("date") or "").strip()
        add({
            "severity": "medium",
            "rule": "RULE_G7_WAYLY_RECATEGORISED",
            "headline": f"Wayly moved \"{desc}\" from {_pretty_stream(src)} to {_pretty_stream(dst)}.",
            "detail": (
                f"The statement placed the {dt or ''} \"{desc}\" line under {_pretty_stream(src)}, but Wayly has shown it under "
                f"{_pretty_stream(dst)} because that is where Support at Home rules put this type of service. This is Wayly's "
                f"decision, not a provider error, so any stream totals that shift are down to us. Confirm the correct stream with the provider if unsure."
            ).replace("  ", " "),
            "dollar_impact": 0.0,
            "evidence": [f"{dt} {desc}: statement stream '{src}' vs Wayly stream '{dst}'"],
            "suggested_action": "No action needed unless the provider's original stream was actually correct; then let us know so we can adjust.",
            "origin": "wayly",
            "date": dt,
        })

    # ---------- GATE 8: travel double-billing ----------
    def _has(*subs):
        for li in line_items:
            blob = f"{li.get('service_description') or ''} {li.get('service_code') or ''} {li.get('service_name') or ''}".lower()
            if any(sub in blob for sub in subs):
                return True
        return False

    travel_loading = _has("travel loading", "worker km", "worker travel", "km loading", "provider travel")
    participant_transport = any(
        ("transport" in f"{li.get('service_description') or ''} {li.get('service_name') or ''}".lower()
         or "per km" in f"{li.get('service_description') or ''}".lower()
         or _norm_stream(li.get("unit")) == "km")
        for li in line_items
    )
    if travel_loading and participant_transport:
        add({
            "severity": "medium",
            "rule": "RULE_G8_TRAVEL_DOUBLE_BILL",
            "headline": "Both a travel loading and a separate transport charge appear this period.",
            "detail": (
                "This statement has a worker travel/km loading as well as a separate per-kilometre transport charge. That can be "
                "correct if they cover different trips, but it can also mean the same trip was billed twice."
            ),
            "dollar_impact": 0.0,
            "evidence": ["travel loading line and per-km transport line both present"],
            "suggested_action": "Ask the provider to confirm the travel loading and the transport charge are for different trips, not the same one.",
        })

    # ---------- GATE 9: upcoming category transition (INDEX-1 policy dates) ----------
    try:
        import program_reference as _pr
        pcf = _pr.get_value("policy_date.personal_care_free", as_of)
    except Exception:
        pcf = None
    if pcf and _has("personal care", "personal-care"):
        try:
            from datetime import datetime as _dt
            eff = _dt.fromisoformat(str(pcf)[:10]).date()
            ref = as_of or eff
            days = (eff - ref).days
        except Exception:
            eff, days = None, 999
        if eff and -31 <= days <= 120:
            add({
                "severity": "info",
                "rule": "RULE_G9_CATEGORY_TRANSITION",
                "headline": f"From {eff.strftime('%-d %B %Y')} personal care moves to Clinical Care with no co-contribution.",
                "detail": (
                    f"Support at Home reclassifies personal care into Clinical Care from {eff.strftime('%-d %B %Y')}. From then on "
                    f"personal care carries no participant contribution, so expect the split on next quarter's statement to change."
                ),
                "dollar_impact": 0.0,
                "evidence": [f"INDEX-1 policy_date.personal_care_free = {pcf}; personal care present on statement"],
                "suggested_action": "No action needed now; just expect personal care to show as Clinical Care with $0 co-payment from that date.",
            })

    # ---------- GATE 10: package-management fee cap ----------
    def _pkg_lines():
        out = []
        for li in line_items:
            blob = f"{li.get('service_description') or ''} {li.get('service_name') or ''} {li.get('stream') or ''}".lower()
            if "package management" in blob or "package administration" in blob or "administration fee" in blob:
                out.append(li)
        return out

    pkg = _pkg_lines()
    if pkg:
        try:
            import program_reference as _pr2
            cap_pct = _pr2.get_value("package_management.cap_pct", as_of)
        except Exception:
            cap_pct = 0.05
        pkg_total = round(sum(_f(x.get("gross") if x.get("gross") is not None else x.get("total")) for x in pkg), 2)
        quarter_ref = true_budget or (stated_q if stated_q > 0 else 0.0)
        if cap_pct and quarter_ref and pkg_total > round(float(cap_pct) * quarter_ref, 2) + _CENT:
            cap_amt = round(float(cap_pct) * quarter_ref, 2)
            add({
                "severity": "medium",
                "rule": "RULE_G10_PKG_MGMT_CAP",
                "headline": f"The package management fee ({_aud(pkg_total)}) looks above the {round(float(cap_pct) * 100)}% cap.",
                "detail": (
                    f"From 1 July 2026 package management is capped at {round(float(cap_pct) * 100)}% of the quarterly budget "
                    f"({_aud(cap_amt)} here). The statement shows {_aud(pkg_total)}."
                ),
                "dollar_impact": round(pkg_total - cap_amt, 2),
                "evidence": [f"package management {_aud(pkg_total)} vs {round(float(cap_pct) * 100)}% cap {_aud(cap_amt)}"],
                "suggested_action": "Ask the provider to confirm the package management fee is within the 5% cap.",
            })

    # ---------- Low extraction confidence banner ----------
    confs = [_f(li.get("confidence")) for li in line_items if li.get("confidence") is not None]
    overall_conf = min(confs) if confs else None
    if overall_conf is not None and overall_conf < 0.7:
        audit_result["low_confidence"] = True
        audit_result["extraction_confidence"] = round(overall_conf, 3)
    else:
        audit_result.setdefault("low_confidence", False)

    # ---------- Publish gate ----------
    if blocker_rules:
        audit_result["publishable"] = False
        audit_result["publish_block"] = {
            "reason": "This statement's own numbers do not reconcile, so a plain-English summary could be misleading.",
            "rules": blocker_rules,
            "items": blocker_items,
        }
    else:
        audit_result.setdefault("publishable", True)
