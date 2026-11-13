"""Wayly BOS shared core — money, time, metrics helpers.

Used by the Marketing Investment Register (5A.1), the Founder Command Centre
(5A.2) and the Growth Engine (4A/4B). Pure helpers, no routes.

Money rules (founder decision):
  * AUD only. NEVER binary-float arithmetic for money — use Decimal.
  * New monetary fields persist as BSON Decimal128.
  * Reading legacy float fields is tolerated (wrapped via Decimal(str(x))).
  * NEVER assume a missing amount is zero or that an unpaid expense was paid —
    each financial lens reports its *basis* (explicit / derived / unknown).
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import datetime, timezone, timedelta
from typing import Optional, Any, Dict, Tuple

try:
    from bson.decimal128 import Decimal128
except Exception:  # pragma: no cover
    Decimal128 = None  # type: ignore

try:
    from zoneinfo import ZoneInfo
    SYD = ZoneInfo("Australia/Sydney")
except Exception:  # pragma: no cover - fallback if tzdata missing
    SYD = timezone(timedelta(hours=10))  # AEST (no DST) — documented fallback

GST_RATE = Decimal("0.10")
TWOPLACES = Decimal("0.01")
BUSINESS_TZ = "Australia/Sydney"


# --------------------------------------------------------------------------- money
def D(x: Any) -> Optional[Decimal]:
    """Coerce anything money-ish to Decimal. None stays None (unknown != 0)."""
    if x is None or x == "":
        return None
    if Decimal128 is not None and isinstance(x, Decimal128):
        return x.to_decimal()
    if isinstance(x, Decimal):
        return x
    try:
        return Decimal(str(x))
    except (InvalidOperation, ValueError):
        return None


def q2(x: Optional[Decimal]) -> Optional[Decimal]:
    if x is None:
        return None
    return x.quantize(TWOPLACES, rounding=ROUND_HALF_UP)


def to_decimal128(x: Any):
    """For persistence. None -> None. Rounds to cents."""
    d = q2(D(x))
    if d is None:
        return None
    return Decimal128(d) if Decimal128 is not None else float(d)


def to_aud(x: Any) -> Optional[float]:
    """For JSON responses — rounded float, or None when genuinely unknown."""
    d = q2(D(x))
    return float(d) if d is not None else None


def dsum(*vals: Any) -> Decimal:
    """Decimal sum treating None as 0 (used only for additive roll-ups)."""
    total = Decimal("0")
    for v in vals:
        d = D(v)
        if d is not None:
            total += d
    return q2(total)


def compute_gst(amount: Any, treatment: str) -> Dict[str, Optional[float]]:
    """Return ex/gst/inc for an AUD amount given its GST treatment.

    gst_inclusive:  amount already includes 10% GST.
    gst_exclusive:  amount excludes GST; add 10%.
    gst_free / no_gst_overseas: no GST.
    """
    a = D(amount)
    if a is None:
        return {"cost_ex_gst": None, "gst_amount": None, "cost_inc_gst": None}
    if treatment == "gst_exclusive":
        ex = a
        gst = (a * GST_RATE)
        inc = a + gst
    elif treatment in ("gst_free", "no_gst_overseas"):
        ex = a
        gst = Decimal("0")
        inc = a
    else:  # gst_inclusive (default)
        inc = a
        ex = a / (Decimal("1") + GST_RATE)
        gst = inc - ex
    return {"cost_ex_gst": to_aud(ex), "gst_amount": to_aud(gst), "cost_inc_gst": to_aud(inc)}


def expense_financials(e: dict) -> Dict[str, Any]:
    """Four DISTINCT financial lenses on ONE expense — never additive together.

    Honest about missing data: each lens carries a `basis`:
      explicit  — an explicit new field was supplied
      derived   — inferred from lifecycle/payment status (cost_inc_gst)
      unknown   — cannot be established safely (we do NOT guess 0 or paid)
    Voided expenses contribute nothing.
    """
    out = {
        "planned": None, "committed": None, "incurred": None, "paid": None,
        "outstanding": None, "credit": None,
        "basis": {"planned": "unknown", "committed": "unknown",
                  "incurred": "unknown", "paid": "unknown"},
    }
    if e.get("voided"):
        for k in ("planned", "committed", "incurred", "paid", "outstanding", "credit"):
            out[k] = 0.0
        out["basis"] = {k: "voided" for k in out["basis"]}
        return out

    status = e.get("status")
    pay = e.get("payment_status")
    cost = D(e.get("cost_inc_gst"))

    # explicit new fields win
    planned_x = D(e.get("planned_amount_aud"))
    committed_x = D(e.get("committed_amount_aud"))
    incurred_x = D(e.get("incurred_amount_aud"))
    paid_x = D(e.get("amount_paid_aud"))
    credit = D(e.get("credit_amount_aud"))
    if credit is None:
        credit = D(e.get("refund_amount_aud"))

    # PLANNED — expected future spend
    if planned_x is not None:
        out["planned"], out["basis"]["planned"] = to_aud(planned_x), "explicit"
    elif status == "planned":
        base = cost if cost is not None else D(e.get("planned_budget_aud"))
        if base is not None:
            out["planned"], out["basis"]["planned"] = to_aud(base), "derived"

    # COMMITTED — approved/contracted
    if committed_x is not None:
        out["committed"], out["basis"]["committed"] = to_aud(committed_x), "explicit"
    elif status in ("approved", "booked", "invoiced") and cost is not None:
        out["committed"], out["basis"]["committed"] = to_aud(cost), "derived"

    # INCURRED — cost actually incurred for the service/period
    if incurred_x is not None:
        out["incurred"], out["basis"]["incurred"] = to_aud(incurred_x), "explicit"
    elif status in ("booked", "invoiced") and cost is not None:
        out["incurred"], out["basis"]["incurred"] = to_aud(cost), "derived"

    # PAID — cash actually settled. Never assume paid.
    if paid_x is not None:
        out["paid"], out["basis"]["paid"] = to_aud(paid_x), "explicit"
    elif pay == "paid" and cost is not None:
        out["paid"], out["basis"]["paid"] = to_aud(cost), "derived"
    elif pay in (None, "unpaid"):
        out["paid"], out["basis"]["paid"] = 0.0, "derived"
    # partially_paid with no explicit amount => unknown (left as None)

    # OUTSTANDING = incurred - paid (only when both known)
    inc_d, paid_d = D(out["incurred"]), D(out["paid"])
    if inc_d is not None and paid_d is not None:
        out["outstanding"] = to_aud(max(Decimal("0"), inc_d - paid_d))
    out["credit"] = to_aud(credit) if credit is not None else None
    return out


# --------------------------------------------------------------------------- time
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.isoformat()


def syd_now() -> datetime:
    return datetime.now(SYD)


def period_range(period: str, date_from: Optional[str] = None,
                 date_to: Optional[str] = None) -> Tuple[datetime, datetime, str]:
    """Return (start_utc, end_utc, label) for a trend window, anchored to
    Australia/Sydney business days but returned as tz-aware UTC datetimes."""
    now = syd_now()
    end = now
    if period == "custom" and (date_from or date_to):
        try:
            start = datetime.fromisoformat(date_from).replace(tzinfo=SYD) if date_from else now - timedelta(days=30)
        except Exception:
            start = now - timedelta(days=30)
        try:
            end = datetime.fromisoformat(date_to).replace(tzinfo=SYD) if date_to else now
        except Exception:
            end = now
        return start.astimezone(timezone.utc), end.astimezone(timezone.utc), "Custom range"
    days = {"7d": 7, "30d": 30, "90d": 90}.get(period, 30)
    start = now - timedelta(days=days)
    label = {"7d": "Last 7 days", "30d": "Last 30 days", "90d": "Last 90 days"}.get(period, "Last 30 days")
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc), label


def previous_range(start_utc: datetime, end_utc: datetime) -> Tuple[datetime, datetime]:
    """The equally-long window immediately preceding [start, end)."""
    span = end_utc - start_utc
    return start_utc - span, start_utc


def pct_change(curr: Optional[float], prev: Optional[float]) -> Optional[float]:
    """Percentage change curr vs prev. None when prev is 0/None (honest N/A —
    never a misleading % against a zero base)."""
    if prev is None or curr is None:
        return None
    try:
        p = Decimal(str(prev))
        c = Decimal(str(curr))
    except (InvalidOperation, ValueError):
        return None
    if p == 0:
        return None
    return float(((c - p) / p * Decimal("100")).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


# --------------------------------------------------------------------------- support SLA policy
# First-response targets by priority (hours). Documented, configurable policy —
# a ticket older than its target WITHOUT a first staff response is a CURRENT breach.
SLA_FIRST_RESPONSE_HOURS: Dict[str, int] = {
    "urgent": 4, "high": 24, "normal": 72, "low": 120,
}


def sla_target_hours(priority: Optional[str]) -> int:
    return SLA_FIRST_RESPONSE_HOURS.get((priority or "normal").lower(), 72)
