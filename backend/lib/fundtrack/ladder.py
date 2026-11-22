"""FUNDTRACK-1 · The canonical figure ladder (server-side, Decimal).

This is the single place Support at Home quarterly budget figures are derived.
It fixes the BSC-1 / dashboard defect log (22/11/2026):

  D1  care management deducted from the budget but not from "left to spend".
  D2  severe underspend reported as "On track" with no forfeit warning.
  D3  "projected spend" was actual spend; "at this pace" ran no pace calc.
  D4  the date, not the utilisation %, decides where the quarter sits.
  D5  confidence derived from named inputs, never asserted.

Eight figures, computed once, rendered identically everywhere (locked #2):

  A  Your quarter's funding            classification funding + supplements, GROSS
  B  Care management                   10% of A, taken out automatically
  C  Carried over from last quarter    capped amount brought in
  D  Available for care this quarter    A - B + C   <- the ONLY base others derive from
  E  Used so far                       confirmed from statements + entered charges
  F  Left for care this quarter         D - E       <- the HEADLINE everywhere
  G  Care you already have booked       committed forward to quarter end
  H  Spare for extra care               F - G       <- always directly beneath F

Arithmetic notes (independently verified 22/11/2026):
  * Published classification amounts are GROSS (inclusive of care management).
    ``budget_lib.quarterly_budget()`` already returns the NET (post 10% care
    management) quarterly figure, so A - B == that net value by construction.
  * Carryover cap = higher of $1,000 or 10% of the NET quarterly budget
    (after the care management deduction, including supplements). Computed on
    the flat net quarterly figure to match the FUNDTRACK-1 acceptance evidence
    (Classification 6 -> $1,112.89; Classifications 1-5 take the $1,000 floor).
    Floor and percentage are INDEX-1 constants (``rollover.floor_aud`` /
    ``rollover.pct``) so a correction is a config change, not a code change.
  * Retained HCP unspent funds, AT-HM, Restorative Care and End-of-Life pools
    are SEPARATE and are never part of A..H or the forfeit projection.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Dict, List, Optional

import budget as budget_lib
from program_reference import get_value

# Status fires "underspend risk" only once the quarter is at least this far
# elapsed. Below this the linear projection is too noisy to act on (defect log:
# "7% used at 10% elapsed is fine; 7% used at 58% elapsed is not").
UNDERSPEND_MIN_ELAPSED = Decimal("0.5")

# One statement cycle: a provider must issue a monthly statement by the last
# day of the following month, so a statement can legitimately be up to ~2
# months old. Confidence can never be High when the anchoring statement is
# older than one cycle.
STATEMENT_CYCLE_DAYS = 62

LADDER_LABELS: Dict[str, str] = {
    "A": "Your quarter's funding",
    "B": "Care management",
    "C": "Carried over from last quarter",
    "D": "Available for care this quarter",
    "E": "Used so far",
    "F": "Left for care this quarter",
    "G": "Care you already have booked",
    "H": "Spare for extra care",
}


def _d(x: Any) -> Decimal:
    try:
        return Decimal(str(x if x is not None else 0))
    except Exception:
        return Decimal("0")


def _c(d: Decimal) -> float:
    return float(d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _today(today: Optional[date]) -> date:
    return today or datetime.now(timezone.utc).date()


def carryover_cap(
    classification: int,
    as_of: Optional[date | str] = None,
    supplements: Decimal = Decimal("0"),
) -> Decimal:
    """Carryover cap = max($1,000 floor, 10% of the NET quarterly budget).

    The 10% leg runs on the net budget (A - B, including supplements), so it
    only beats the $1,000 floor for Classifications 6, 7 and 8 at current
    rates. Both branches are exercised by the acceptance tests.
    """
    net = _d(budget_lib.quarterly_budget(classification, as_of)) + _d(supplements)
    floor = _d(get_value("rollover.floor_aud", as_of))
    pct = _d(get_value("rollover.pct", as_of))
    return max(floor, net * pct)


def _derive_confidence(
    *,
    anchor_statement_age_days: Optional[int],
    priced_share: Optional[float],
    confirmed_share: Optional[float],
    determination_changed: bool,
) -> Dict[str, Any]:
    """Confidence derived from named inputs, inspectable on tap, never asserted
    (defect D5). Never High when the anchoring statement is older than one
    statement cycle."""
    inputs: List[Dict[str, Any]] = []

    anchor_ok = anchor_statement_age_days is not None and anchor_statement_age_days <= STATEMENT_CYCLE_DAYS
    if anchor_statement_age_days is None:
        inputs.append({
            "key": "anchor_statement",
            "label": "Latest statement on file",
            "value": "none",
            "detail": "No decoded statement is anchoring these figures yet.",
            "ok": False,
        })
    else:
        inputs.append({
            "key": "anchor_statement",
            "label": "Age of the latest statement",
            "value": f"{anchor_statement_age_days} days",
            "detail": (
                "Within one statement cycle." if anchor_ok
                else "Older than one statement cycle, so these figures may have moved."
            ),
            "ok": anchor_ok,
        })

    if priced_share is not None:
        inputs.append({
            "key": "priced_share",
            "label": "Services with a confirmed price",
            "value": f"{round(priced_share * 100)}%",
            "detail": "Share of the care we are forecasting that carries a price you have confirmed.",
            "ok": priced_share >= 0.8,
        })
    if confirmed_share is not None:
        inputs.append({
            "key": "confirmed_share",
            "label": "Care confirmed rather than assumed",
            "value": f"{round(confirmed_share * 100)}%",
            "detail": "Share of the period covered by confirmed delivery rather than an assumed routine.",
            "ok": confirmed_share >= 0.8,
        })
    if determination_changed:
        inputs.append({
            "key": "determination_changed",
            "label": "Classification or contribution changed",
            "value": "yes",
            "detail": "A change in this period can shift the figures until the next statement confirms them.",
            "ok": False,
        })

    # Score. Start optimistic, then apply the hard caps.
    level = "high"
    if anchor_statement_age_days is None or not anchor_ok or determination_changed:
        level = "low"
    else:
        soft = [s for s in (priced_share, confirmed_share) if s is not None]
        if soft and min(soft) < 0.5:
            level = "low"
        elif soft and min(soft) < 0.8:
            level = "medium"
        elif not soft:
            # Anchored by a recent statement but no priced/confirmed signal yet.
            level = "medium"
    # Hard rule (D5): never High when the anchor is older than one cycle.
    if not anchor_ok and level == "high":
        level = "medium"
    return {"level": level, "inputs": inputs}


def compute_ladder(
    *,
    classification: int,
    used_so_far: Any = 0,
    committed_forward: Any = 0,
    carry_in: Any = 0,
    supplements: Any = 0,
    as_of: Optional[date | str] = None,
    today: Optional[date] = None,
    anchor_statement_age_days: Optional[int] = None,
    priced_share: Optional[float] = None,
    confirmed_share: Optional[float] = None,
    determination_changed: bool = False,
    quarter_window: Optional[tuple] = None,
    projected_total_override: Any = None,
    method_override: Optional[str] = None,
) -> Dict[str, Any]:
    """Compute the canonical A..H ladder plus status, forfeit and confidence.

    All monetary maths is Decimal. ``used_so_far`` (E) is confirmed spend from
    statements plus any entered charges. ``committed_forward`` (G) is care
    genuinely booked to quarter end (0 until the weekly screen / charge entry
    ships), and it is the ONLY thing that reduces H. A caller that runs its own
    projection (e.g. a Budget Scenarios what-if) may pass
    ``projected_total_override`` so the status, forfeit and shortfall reflect
    that projection WITHOUT inflating G/H — keeping F/G/H identical to the
    dashboard for the same baseline (locked decision #2 parity).
    """
    cls = int(classification or 4)
    if quarter_window:
        q_start, q_end, q_label = quarter_window
    else:
        q_start, q_end, q_label = budget_lib.get_quarter_window(today)

    # --- The eight figures -------------------------------------------------
    annual = _d(budget_lib.classification_annual(cls, as_of))
    A = (annual / Decimal("4")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    net = _d(budget_lib.quarterly_budget(cls, as_of))  # already A * 0.9, rounded
    sup = _d(supplements)
    B = (A - net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    C = _d(carry_in)
    D = net + sup + C
    E = _d(used_so_far)
    F = D - E
    G = _d(committed_forward)
    H = F - G

    cap = carryover_cap(cls, as_of, sup)

    # --- Elapsed quarter (D4: the date decides the pace, not utilisation) --
    td = _today(today)
    total_days = (q_end - q_start).days + 1
    elapsed_days = (td - q_start).days + 1
    elapsed_days = max(0, min(total_days, elapsed_days))
    elapsed_fraction = (Decimal(elapsed_days) / Decimal(total_days)) if total_days else Decimal("0")

    # --- Projection (D3: name the method, never label an actual) -----------
    if projected_total_override is not None:
        method = method_override or "scenario"
        projected_total = _d(projected_total_override)
    elif G > 0:
        method = "booked_care"
        projected_total = E + G
    elif elapsed_fraction > 0 and E > 0:
        method = "linear_pace"
        projected_total = E / elapsed_fraction
    else:
        method = "no_further_spend"
        projected_total = E
    projected_total = max(projected_total, E)  # never project below actual spend
    projected_unspent = D - projected_total
    forfeit = max(Decimal("0"), projected_unspent - cap)
    shortfall = max(Decimal("0"), projected_total - D)

    # --- Status (D2: three states, pace against elapsed quarter) -----------
    if projected_total > D:
        status = "overspend_risk"
    elif projected_unspent > cap and elapsed_fraction >= UNDERSPEND_MIN_ELAPSED:
        status = "underspend_risk"
    else:
        status = "on_track"

    confidence = _derive_confidence(
        anchor_statement_age_days=anchor_statement_age_days,
        priced_share=priced_share,
        confirmed_share=confirmed_share,
        determination_changed=determination_changed,
    )

    figures = {
        "A": _c(A), "B": _c(B), "C": _c(C), "D": _c(D),
        "E": _c(E), "F": _c(F), "G": _c(G), "H": _c(H),
    }
    return {
        "figures": figures,
        "labels": LADDER_LABELS,
        "classification": cls,
        "quarter": {
            "label": q_label,
            "start": q_start.isoformat(),
            "end": q_end.isoformat(),
            "total_days": total_days,
            "elapsed_days": elapsed_days,
            "elapsed_pct": int((elapsed_fraction * 100).to_integral_value(rounding=ROUND_HALF_UP)),
            "as_at": td.isoformat(),
        },
        "carryover_cap_aud": _c(cap),
        "status": status,
        "projection": {
            "method": method,
            "projected_total_aud": _c(projected_total),
            "projected_unspent_aud": _c(projected_unspent),
            "forfeit_aud": _c(forfeit),
            "shortfall_aud": _c(shortfall),
            "forfeit_date": q_end.isoformat(),
            "provisional_note": (
                "Provisional. Rollover happens 61 days after quarter end, or the "
                "day after the provider's final claim, whichever is sooner."
            ),
        },
        "confidence": confidence,
        # Utilisation ring: E as a share of D (never of A), plus how far through
        # the quarter today is, so underspend reads at a glance.
        "utilisation": {
            "used_pct_of_available": int(((E / D) * 100).to_integral_value(rounding=ROUND_HALF_UP)) if D > 0 else 0,
            "elapsed_pct": int((elapsed_fraction * 100).to_integral_value(rounding=ROUND_HALF_UP)),
        },
    }
