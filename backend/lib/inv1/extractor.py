"""INV-1 v1.2 · WS2 · Line-item extractor.

Given the extracted-text of an invoice's payable section, return a list
of :class:`ExtractedLine` objects. Deterministic, regex-based, no LLM.

WS2 discipline (spec §5):
    Never fabricate an absent value. If we cannot read the unit price,
    ``unit_price`` stays ``None`` and ``read_confidence`` drops below
    0.5 so the "could not read" line-state can fire in the UI.

Design notes:
    - Currency values match `$1,234.56` and `1234.56` shapes.
    - Rates match `12%`, `12.5 %`, `50 per cent`.
    - Dates match `01/09/2026`, `1 Sep 2026`, `2026-09-01`.
    - Every line is classified into a :class:`ServiceCategory` using a
      keyword bank matched case-insensitively against the raw text.
    - GST detection is a first-class field: an "including GST" phrase on
      a line stamps ``gst_amount`` even without an itemised GST value.
"""
from __future__ import annotations

import logging
import re
import uuid
from datetime import date, datetime
from typing import List, Optional, Tuple

from lib.inv1.schema import ExtractedLine, ServiceCategory

logger = logging.getLogger("wayly.inv1.extractor")


# ---------------------------------------------------------------------------
# Regex library
# ---------------------------------------------------------------------------

# Money: matches "$1,234.56", "1234.56", "-$50.00", "($50.00)". A bare
# integer without a $ sign or decimals is NOT money, the regex captures
# it but the ``must_look_like_money`` filter in :func:`_parse_all_money`
# discards it. This prevents "4 hrs" being read as $4.
_MONEY_RE = re.compile(
    r"""(?P<neg>\()?\s*
        (?P<sign>-)?\s*
        (?P<dollar>\$)?\s*
        (?P<int>\d{1,3}(?:,\d{3})*|\d+)
        (?:\.(?P<frac>\d{1,2}))?
        \s*(?P<close>\))?""",
    re.VERBOSE,
)

# Rate: matches "12%", "12.5 %", "50 per cent", "10 pct"
_RATE_RE = re.compile(
    r"""(?P<val>\d{1,3}(?:\.\d{1,2})?)\s*
        (?:%|per\s*cent|percent|pct)""",
    re.VERBOSE | re.IGNORECASE,
)

# Units / hours: matches "2 hrs", "3.5 hours", "4 units", "1 visit"
_UNIT_RE = re.compile(
    r"""(?P<val>\d{1,3}(?:\.\d{1,2})?)\s*
        (?P<unit>hrs?|hours?|units?|visits?|km|kms)""",
    re.VERBOSE | re.IGNORECASE,
)

# A "row-start" line inside an invoice table is usually a date. When PDF
# extraction produces one column per line (a common shape for tabular
# invoices), we reassemble rows by treating each date line as the start
# of a new row and folding subsequent single-column lines into it until
# the next date line or a section boundary.
_ROW_START_DATE_RE = re.compile(
    r"""^\s*
        (?:(?P<wday>Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+)?     # optional weekday
        (?:
            \d{4}-\d{2}-\d{2}
          | \d{1,2}/\d{1,2}(?:/\d{2,4})?
          | \d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*(?:\s+\d{4})?
        )
        (?:[\s,]+\d{1,2}:\d{2}(?:\s*(?:to|-|–|—)\s*\d{1,2}:\d{2})?\s*(?:am|pm)?)?  # optional time range
        \s*$""",
    re.VERBOSE | re.IGNORECASE,
)

# End of the tabular section, the extractor stops folding here.
_ROW_END_TOKENS = (
    "total service value", "total amount payable", "amount payable",
    "government subsidy", "government contribution",
    "total contribution", "prior period", "adjustment applied",
    "bank details", "payment details", "how to pay",
    "about this document", "how we calculated",
    "subtotals by category", "services subtotal", "fees subtotal",
    "invoice total", "total payable", "care management and package",
    "funding application", "payment terms",
)

# Date: matches ISO, DMY (Australian), and short-month formats. Also
# handles bare month-day like "3 Oct" (no year), in that case the
# caller provides the invoice year via ``_default_year``.
_DATE_RE = re.compile(
    r"""(?:(?P<y1>\d{4})-(?P<m1>\d{2})-(?P<d1>\d{2}))|
        (?:(?P<d2>\d{1,2})/(?P<m2>\d{1,2})/(?P<y2>\d{4}))|
        (?:(?P<d3>\d{1,2})\s+(?P<mon3>Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*(?:\s+(?P<y3>\d{4}))?)""",
    re.VERBOSE | re.IGNORECASE,
)

# Default year used for year-less dates (e.g. "3 Oct"). Set by the
# extractor from the invoice header's issue date. Falls back to the
# current calendar year.
_default_year: Optional[int] = None

_MONTH_MAP = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


# Category keyword bank. Order matters, earlier entries win.
_CATEGORY_KEYWORDS: List[Tuple[ServiceCategory, Tuple[str, ...]]] = [
    (ServiceCategory.clinical, (
        "nursing", "nurse", "registered nurse", "clinical", "podiatr",
        "physio", "occupational therap", "wound care", "medication review",
        "medication management", "dietitian", "speech pathology",
    )),
    (ServiceCategory.personal_care, (
        "personal care", "showering", "dressing", "toileting", "hygiene",
    )),
    (ServiceCategory.care_management, (
        "care management", "care coordination", "package management",
        "case manag",
    )),
    (ServiceCategory.everyday_living, (
        # Per the Support at Home category matrix, domestic assistance,
        # cleaning, meal prep, shopping, gardening, social support and
        # continence/consumables all live in the everyday-living stream
        # (higher contribution rate), not independence.
        "domestic assistance", "cleaning", "meal prep", "shopping",
        "gardening", "social support",
        "continence", "consumables", "nutrition", "everyday living",
    )),
    (ServiceCategory.independence, (
        # Independence is the lower-rate stream used for restorative
        # supports and mobility aids.
        "mobility", "restorative", "allied health assistant",
        "exercise physiology",
    )),
    (ServiceCategory.transport, (
        "transport", "taxi", "uber", "kms",
    )),
    (ServiceCategory.cancellation_fee, (
        "cancellation", "short notice",
    )),
    (ServiceCategory.exit_fee, (
        "exit fee", "termination fee", "leaving fee",
        "account closure", "package closure", "closure fee",
        "cancellation of package", "cessation fee",
    )),
    (ServiceCategory.admin_fee, (
        "admin fee", "administration fee", "administrative fee",
    )),
    (ServiceCategory.at_hm, (
        "assistive tech", "home modification", "at-hm", "ramp", "hoist",
        "grab rail", "shower chair", "commode", "walking frame",
    )),
    (ServiceCategory.consumable, (
        "wipes", "pads", "gloves",
    )),
]

_CANCEL_KEYWORDS = ("cancelled", "no charge", "voided")
_GST_INCLUSIVE_KEYWORDS = ("inclusive of gst", "including gst", "gst inclusive", "incl gst", "incl. gst")
_GST_LABEL_RE = re.compile(r"gst[:\s]*\$?\s*(\d+(?:\.\d{1,2})?)", re.IGNORECASE)


def _parse_money(text: str) -> Optional[float]:
    for m in _MONEY_RE.finditer(text):
        if not (m.group("dollar") or m.group("frac")):
            continue
        neg = bool(m.group("neg") or m.group("sign") or m.group("close"))
        int_part = m.group("int").replace(",", "")
        frac_part = m.group("frac") or "00"
        try:
            val = float(f"{int_part}.{frac_part}")
            return -val if neg else val
        except ValueError:
            continue
    return None


def _parse_all_money(text: str) -> List[float]:
    """Return every monetary amount on the line. A "money" match must
    have a ``$`` sign or explicit decimal digits, bare integers like
    "4 hrs" are filtered out. Numbers immediately followed by ``%`` or
    unit tokens (``hrs``, ``hours``, ``units``, ``visits``, ``km``) are
    also filtered out (they are rates or quantities, not amounts)."""
    _UNIT_TAIL = ("hrs", "hr", "hours", "hour", "units", "unit", "visits",
                  "visit", "km", "kms")
    out: List[float] = []
    for m in _MONEY_RE.finditer(text):
        if not (m.group("dollar") or m.group("frac")):
            continue
        end = m.end()
        tail = text[end:end + 8].lstrip().lower()
        if tail.startswith("%") or tail.startswith("per cent"):
            continue
        if any(tail.startswith(u) and (len(tail) <= len(u) or not tail[len(u)].isalpha())
               for u in _UNIT_TAIL):
            continue
        neg = bool(m.group("neg") or m.group("sign") or m.group("close"))
        int_part = m.group("int").replace(",", "")
        frac_part = m.group("frac") or "00"
        try:
            val = float(f"{int_part}.{frac_part}")
            out.append(-val if neg else val)
        except ValueError:
            continue
    return out


def _parse_rate(text: str) -> Optional[float]:
    m = _RATE_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group("val"))
    except ValueError:
        return None


def _parse_units(text: str) -> Optional[float]:
    m = _UNIT_RE.search(text)
    if not m:
        return None
    try:
        return float(m.group("val"))
    except ValueError:
        return None


def _parse_date(text: str, default_year: Optional[int] = None) -> Optional[str]:
    m = _DATE_RE.search(text)
    if not m:
        return None
    try:
        if m.group("y1"):
            return date(int(m.group("y1")), int(m.group("m1")), int(m.group("d1"))).isoformat()
        if m.group("y2"):
            return date(int(m.group("y2")), int(m.group("m2")), int(m.group("d2"))).isoformat()
        mon = _MONTH_MAP.get(m.group("mon3").lower())
        if mon:
            year_str = m.group("y3")
            if year_str:
                year = int(year_str)
            elif default_year is not None:
                year = default_year
            elif _default_year is not None:
                year = _default_year
            else:
                from datetime import datetime as _dt
                year = _dt.now().year
            return date(year, mon, int(m.group("d3"))).isoformat()
    except (ValueError, KeyError):
        return None
    return None


def _classify_category(line_text: str) -> ServiceCategory:
    lower = line_text.lower()
    for category, keywords in _CATEGORY_KEYWORDS:
        for kw in keywords:
            if kw in lower:
                return category
    return ServiceCategory.unknown


def _is_line_header(line: str) -> bool:
    """Detect column-header lines so they are skipped."""
    stripped = line.strip().lower()
    if not stripped:
        return True
    if any(hdr in stripped for hdr in (
        "service", "description", "unit price", "quantity", "amount",
        "total", "subtotal", "period", "date range",
    )):
        # Header lines have several of these words together and few numbers
        digits = sum(c.isdigit() for c in stripped)
        if digits < 4:
            return True
    return False


def _looks_like_line_item(line: str) -> bool:
    """A candidate line-item has a monetary amount and some description."""
    if not line.strip():
        return False
    if _is_line_header(line):
        return False
    monies = _parse_all_money(line)
    if not monies:
        return False
    # At least one non-monetary character run of length >= 4
    stripped = _MONEY_RE.sub(" ", line).strip()
    return len(re.sub(r"[\d,.\s%$-]", "", stripped)) >= 4


def _extract_gst(line_text: str, gross: Optional[float]) -> Tuple[Optional[float], bool]:
    """Return `(gst_amount, gst_inclusive_flag)`.

    - Explicit ``GST: $X`` → use $X.
    - "Inclusive of GST" phrase → back-calculate from gross (gross / 11).
    - Explicit percentage label like ``10%`` next to the amount column when
      the surrounding context indicates GST → back-calculate at 10%.
    - Otherwise → None (never inferred).
    """
    m = _GST_LABEL_RE.search(line_text)
    if m:
        try:
            return float(m.group(1)), False
        except ValueError:
            pass
    if gross is not None:
        lower = line_text.lower()
        if any(k in lower for k in _GST_INCLUSIVE_KEYWORDS):
            return round(gross / 11.0, 2), True
        # Fallback: a bare "10%" GST rate label in the row (common on tabular
        # tax invoices) implies a 10% GST inclusive amount. We only treat it
        # as GST when the line is a service line (has a gross), not a rate
        # column note.
        if re.search(r"\b10\s*%(?!\s*(?:cap|of|off))", line_text, re.IGNORECASE):
            return round(gross / 11.0, 2), True
    return None, False


def _read_confidence(line: str, gross: Optional[float]) -> float:
    """A crude confidence score in [0, 1]. Below 0.5 fires the
    "could not read" line-state in the UI (spec §5)."""
    score = 1.0
    if gross is None:
        score -= 0.6
    monies = _parse_all_money(line)
    if len(monies) < 2:
        score -= 0.15         # only one dollar figure, no unit×qty×gross triangulation
    if not _parse_date(line):
        score -= 0.1
    if len(line.strip()) < 15:
        score -= 0.15
    return max(0.0, min(1.0, score))


def _reassemble_rows(text: str) -> List[str]:
    """Group column-per-line PDF text back into row-per-line strings.

    Two modes:

    - **Column-per-line mode.** When the input contains at least one
      single-value date line (matching ``_ROW_START_DATE_RE``), each
      such line starts a new row and subsequent lines are folded into
      it. Anything before the first date-line is header and dropped.
    - **Row-per-line mode.** When no such date lines exist, we assume
      the extractor already gave us one row per line and pass every
      dense line through verbatim.
    """
    if not text:
        return []
    lines = text.splitlines()
    has_column_mode = any(_ROW_START_DATE_RE.match(l.strip()) for l in lines)
    rows: List[str] = []

    if not has_column_mode:
        # Row-per-line: emit each dense line directly.
        for raw in lines:
            line = raw.strip()
            if line:
                rows.append(line)
        return rows

    # Column-per-line: fold under date-line rows.
    buf: List[str] = []
    in_tail = False
    saw_first_row = False

    def flush():
        if buf:
            joined = " ".join(part.strip() for part in buf if part.strip())
            if joined:
                rows.append(joined)
        buf.clear()

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        lower = line.lower()
        if any(tok in lower for tok in _ROW_END_TOKENS):
            flush()
            in_tail = True
            continue
        if in_tail:
            rows.append(line)
            continue
        if _ROW_START_DATE_RE.match(line):
            flush()
            buf.append(line)
            saw_first_row = True
            continue
        if not saw_first_row:
            continue
        buf.append(line)

    flush()
    return rows


def extract_line_items(text: str, invoice_year: Optional[int] = None) -> List[ExtractedLine]:
    """Parse the payable section into a list of :class:`ExtractedLine`.

    Lines that do not look like line-items are silently skipped. Never
    infer an absent value: ``None`` is preferred over a guess.

    :param invoice_year: year to use for year-less dates like "3 Oct".
        Callers typically pass the year of the invoice's issue date.

    Handles both row-per-line and column-per-line PDF text via
    :func:`_reassemble_rows`.
    """
    global _default_year
    if not text or not text.strip():
        return []

    # Set module-level year for year-less dates. Restored to previous
    # value at function exit so parallel calls don't clobber each other
    # (extraction is not called concurrently in practice, but be safe).
    previous_year = _default_year
    if invoice_year is not None:
        _default_year = invoice_year
    try:
        lines = _reassemble_rows(text)
        items: List[ExtractedLine] = []

        for line in lines:
            if not _looks_like_line_item(line):
                continue

            monies = _parse_all_money(line)
            rate = _parse_rate(line)
            units = _parse_units(line)
            service_date = _parse_date(line)
            category = _classify_category(line)

            gross: Optional[float] = None
            unit_price: Optional[float] = None
            contribution_amount: Optional[float] = None

            if monies:
                if len(monies) >= 3 and rate is not None:
                    unit_price = monies[0]
                    gross = monies[-2]
                    contribution_amount = monies[-1]
                elif len(monies) == 2 and rate is not None:
                    # Two-column table with rate stripped:
                    #   "Care management (October portion) $430.13 17.5% $75.27"
                    #   monies = [gross, contribution_amount]
                    gross = monies[0]
                    contribution_amount = monies[1]
                elif len(monies) >= 2:
                    unit_price = monies[0]
                    gross = monies[-1]
                else:
                    gross = monies[-1]
                if contribution_amount is None and rate is not None and gross is not None:
                    contribution_amount = round(gross * rate / 100.0, 2)

            gst_amount, gst_inclusive = _extract_gst(line, gross)

            item = ExtractedLine(
                line_id=str(uuid.uuid4()),
                service_category=category,
                service_type=re.sub(r"\s{2,}", " ", line).strip()[:120],
                service_date=service_date,
                units_or_hours=units,
                unit_price=unit_price,
                gross_cost=gross,
                contribution_rate=rate,
                contribution_amount=contribution_amount,
                gst_amount=gst_amount,
                read_confidence=_read_confidence(line, gross),
                raw_text=line.strip()[:400],
            )
            items.append(item)

        return items
    finally:
        _default_year = previous_year


def find_duplicates(lines: List[ExtractedLine]) -> List[Tuple[str, str, str]]:
    """Return a list of `(line_id_a, line_id_b, reason)` tuples for lines
    that appear to be duplicates. Two lines are considered duplicates when:

    - Their gross_cost matches to the cent.
    - Their service_date matches, if both are present.
    - Their service_type (first 40 chars, lowercased) matches.

    Used by C11.
    """
    dupes: List[Tuple[str, str, str]] = []
    for i, a in enumerate(lines):
        for b in lines[i + 1:]:
            if a.gross_cost is None or b.gross_cost is None:
                continue
            if round(a.gross_cost, 2) != round(b.gross_cost, 2):
                continue
            key_a = (a.service_type or "")[:40].lower()
            key_b = (b.service_type or "")[:40].lower()
            if not key_a or key_a != key_b:
                continue
            if a.service_date and b.service_date and a.service_date != b.service_date:
                continue
            dupes.append((a.line_id, b.line_id, "same amount, same service, same date"))
    return dupes


def find_negative_lines(lines: List[ExtractedLine]) -> List[ExtractedLine]:
    """Return every line with a negative gross (adjustment/refund). Used by C9."""
    return [ln for ln in lines if ln.gross_cost is not None and ln.gross_cost < 0]


# ---------------------------------------------------------------------------
# Header extraction (WS7 · invoice_date + provider name + ABN)
# ---------------------------------------------------------------------------

_ABN_RE = re.compile(r"\bABN[:\s]*((?:\d[\s]?){11})\b", re.IGNORECASE)
_INVOICE_DATE_LABEL_RE = re.compile(
    r"""(?:invoice[\s-]*date|date\s*of\s*invoice|date\s*issued|issue\s*date|billing\s*date|dated)
        [:\s]*
        (?P<val>[^\n\r]{4,30})""",
    re.VERBOSE | re.IGNORECASE,
)
_DUE_DATE_LABEL_RE = re.compile(
    r"""(?:due\s*date|pay\s*by|payment\s*due)[:\s]*
        (?P<val>[^\n\r]{4,30})""",
    re.VERBOSE | re.IGNORECASE,
)
_PROVIDER_LEADING_RE = re.compile(
    r"^[ \t]*([A-Z][A-Za-z0-9&'\-, ]{2,60}(?:Pty\s*Ltd|Ltd|Inc|LLC|Care|Services|Group))\b",
    re.MULTILINE,
)


_QUARTERLY_BUDGET_RE = re.compile(
    r"quarterly\s+budget[:\s]*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)",
    re.IGNORECASE,
)

# Period-covered range: "Period covered: 1 to 30 September 2026" or
# "Billing period: 1/09/2026 to 30/09/2026". Captures the end date.
_PERIOD_END_RE = re.compile(
    r"""(?:period\s*(?:covered|of\s*service)?|billing\s*period|service\s*period)
        [:\s]*[^\n]*?(?:to|through|-|,|,)\s+
        (?P<val>(?:\d{1,2}[/\s-]?\d{1,2}[/\s-]?\d{2,4}|
                    \d{1,2}\s+(?:January|February|March|April|May|June|July|
                        August|September|October|November|December|
                        Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*
                    (?:\s+\d{4})?))""",
    re.VERBOSE | re.IGNORECASE,
)


def extract_invoice_header(text: str) -> dict:
    """Return `{invoice_date, due_date, provider_name, provider_abn,
    quarterly_budget}` from the top of the payable section. Every field
    is optional; missing values stay `None`.

    Only the first 1500 characters are scanned so a long invoice body
    cannot spoof the header. Every match is best-effort: an ABN that
    fails the checksum still returns as-read (the checks engine does
    not depend on the checksum being valid).
    """
    if not text or not text.strip():
        return {
            "invoice_date": None,
            "due_date": None,
            "provider_name": None,
            "provider_abn": None,
            "quarterly_budget": None,
        }

    head = text[:1500]

    invoice_date: Optional[str] = None
    m = _INVOICE_DATE_LABEL_RE.search(head)
    if m:
        invoice_date = _parse_date(m.group("val")) or invoice_date

    due_date: Optional[str] = None
    m = _DUE_DATE_LABEL_RE.search(head)
    if m:
        due_date = _parse_date(m.group("val"))

    if invoice_date is None:
        candidates: List[str] = []
        for match in _DATE_RE.finditer(head):
            iso = _parse_date(match.group(0))
            if iso:
                candidates.append(iso)
        if candidates:
            invoice_date = min(candidates)

    provider_abn: Optional[str] = None
    m = _ABN_RE.search(head)
    if m:
        digits = re.sub(r"\s+", "", m.group(1))
        if len(digits) == 11:
            provider_abn = digits

    provider_name: Optional[str] = None
    m = _PROVIDER_LEADING_RE.search(head)
    if m:
        provider_name = m.group(1).strip()

    quarterly_budget: Optional[float] = None
    m = _QUARTERLY_BUDGET_RE.search(head)
    if m:
        try:
            quarterly_budget = float(m.group(1).replace(",", ""))
        except ValueError:
            pass

    period_end: Optional[str] = None
    m = _PERIOD_END_RE.search(head)
    if m:
        # The period-end capture may lack a year (e.g. "30 September").
        # Fall back to the invoice_date's year for that case.
        year_hint = None
        if invoice_date:
            try:
                year_hint = int(invoice_date[:4])
            except ValueError:
                year_hint = None
        period_end = _parse_date(m.group("val"), default_year=year_hint)

    return {
        "invoice_date": invoice_date,
        "due_date": due_date,
        "provider_name": provider_name,
        "provider_abn": provider_abn,
        "quarterly_budget": quarterly_budget,
        "period_end": period_end,
    }
