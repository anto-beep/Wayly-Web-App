"""INV-1 · Supporting-records parser (WS-cross-check).

Given the extracted text of a participant's *supporting records* (service
agreement Schedule A agreed prices, the cancellation/hospital care diary, and
the Services Australia contribution advice), return a structured snapshot used
to cross-check the invoice for things that are NOT visible on the invoice
itself:

  * the agreed per-hour price for each service by day-type (weekday / Saturday
    / Sunday / public holiday), so a weekend rate billed on a weekday or a
    rate above the agreed schedule can be caught;
  * dates the participant was in hospital / on leave, so services billed on
    those dates can be flagged (Clause 9.5);
  * services the participant cancelled with notice, so a cancelled-but-billed
    service can be flagged (Clause 9.3).

Deterministic and regex-based; never fabricates a value.
"""
from __future__ import annotations

import re
from datetime import date
from typing import Any, Dict, List, Optional

_MONEY = re.compile(r"\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)")
_DATE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
_DATE_RANGE = re.compile(
    r"\b(\d{1,2})/(\d{1,2})/(\d{4})\s+to\s+(\d{1,2})/(\d{1,2})/(\d{4})\b",
    re.IGNORECASE,
)

_HEADER_WORDS = {
    "service", "category", "category from", "weekday", "saturday", "sunday",
    "public holiday", "effective", "date", "event", "mr burke's contribution rate",
}


def canonical_service(name: str) -> str:
    """Normalise a service name to a stable key shared by the invoice lines
    and the Schedule A rows."""
    n = (name or "").lower()
    if "personal care" in n:
        return "personal care"
    if "nursing" in n or "registered nurse" in n:
        return "nursing"
    if "social support" in n:
        return "social support"
    if "respite" in n:
        return "respite"
    if "domestic" in n:
        return "domestic assistance"
    if "meal" in n:
        return "meal preparation"
    if "garden" in n:
        return "gardening"
    return n.split("(")[0].strip()


def _iso(d: int, m: int, y: int) -> Optional[str]:
    try:
        return date(y, m, d).isoformat()
    except ValueError:
        return None


def _rate_cell(line: str):
    """Return (is_rate_cell, value) for a Schedule A rate column line.
    'not available' / 'n/a' count as a (present, None) cell."""
    low = line.strip().lower()
    if not low:
        return (False, None)
    if "not available" in low or low in ("n/a", "na", "-"):
        return (True, None)
    m = _MONEY.search(line)
    if m:
        try:
            return (True, float(m.group(1).replace(",", "")))
        except ValueError:
            return (False, None)
    return (False, None)


def _parse_schedule_a(lines: List[str]) -> Dict[str, Dict[str, Optional[float]]]:
    rates: Dict[str, Dict[str, Optional[float]]] = {}
    joined = "\n".join(lines).lower()
    try:
        start = next(i for i, l in enumerate(lines) if "schedule a" in l.lower() or "agreed price" in l.lower())
    except StopIteration:
        return rates
    end = len(lines)
    for i in range(start + 1, len(lines)):
        ll = lines[i].lower()
        if "relevant clause" in ll or "all prices are per hour" in ll or ll.strip().startswith("2."):
            end = i
            break
    section = [l.strip() for l in lines[start:end]]
    i = 0
    cols = ["weekday", "saturday", "sunday", "public_holiday"]
    while i < len(section):
        name = section[i].strip()
        low = name.lower()
        if (not name or _MONEY.search(name) or low in _HEADER_WORDS
                or low.startswith("category") or _DATE.search(name)
                or "schedule a" in low):
            i += 1
            continue
        # Candidate service name. Next line = category, then 4 rate cells.
        if i + 5 >= len(section):
            break
        cells = [_rate_cell(section[i + 2 + k]) for k in range(4)]
        if all(c[0] for c in cells):
            rates[canonical_service(name)] = {
                cols[k]: cells[k][1] for k in range(4)
            }
            i += 6
        else:
            i += 1
    return rates


def _parse_care_record(lines: List[str]) -> Dict[str, Any]:
    public_holidays: List[str] = []
    cancellations: List[Dict[str, Any]] = []
    absences: List[Dict[str, str]] = []

    # Find the care-record section.
    try:
        start = next(i for i, l in enumerate(lines) if "care record" in l.lower())
    except StopIteration:
        start = 0

    # Group into events: a date / date-range line starts an event; following
    # non-date lines are its description.
    events: List[Dict[str, Any]] = []
    cur: Optional[Dict[str, Any]] = None
    for raw in lines[start + 1:]:
        s = raw.strip()
        if not s:
            continue
        low = s.lower()
        if ("test fixture" in low or low.startswith("page ")
                or "supporting records for invoice" in low or low in _HEADER_WORDS):
            continue
        rng = _DATE_RANGE.search(s)
        single = _DATE.match(s)
        if rng:
            if cur:
                events.append(cur)
            st = _iso(int(rng.group(1)), int(rng.group(2)), int(rng.group(3)))
            en = _iso(int(rng.group(4)), int(rng.group(5)), int(rng.group(6)))
            cur = {"start": st, "end": en, "text": s[rng.end():].strip()}
        elif single:
            if cur:
                events.append(cur)
            st = _iso(int(single.group(1)), int(single.group(2)), int(single.group(3)))
            cur = {"start": st, "end": st, "text": s[single.end():].strip()}
        elif cur is not None:
            cur["text"] = (cur["text"] + " " + s).strip()
    if cur:
        events.append(cur)

    for ev in events:
        text = ev["text"]
        low = text.lower()
        if not ev.get("start"):
            continue
        if "public holiday" in low:
            public_holidays.append(ev["start"])
        if "cancel" in low:
            # Service that was cancelled + the date it was scheduled for.
            svc = canonical_service(text)
            inner = _DATE.search(text)
            sched = _iso(int(inner.group(1)), int(inner.group(2)), int(inner.group(3))) if inner else ev["start"]
            with_notice = True
            if "less than 24" in low or "short notice" in low or "without notice" in low:
                with_notice = False
            cancellations.append({
                "service_key": svc,
                "date": sched,
                "with_notice": with_notice,
            })
        if ("hospital" in low or "on leave" in low or "residential respite" in low) and "cancel" not in low:
            absences.append({"start": ev["start"], "end": ev.get("end") or ev["start"]})

    return {
        "public_holidays": sorted(set(public_holidays)),
        "cancellations": cancellations,
        "absences": absences,
    }


def parse_supporting_records(text: str) -> Dict[str, Any]:
    """Parse supporting-records text into a cross-check snapshot. Every field
    is best-effort; missing sections yield empty values."""
    empty = {
        "agreed_rates": {},
        "public_holidays": [],
        "cancellations": [],
        "absences": [],
    }
    if not text or not text.strip():
        return empty
    lines = text.splitlines()
    rates = _parse_schedule_a(lines)
    care = _parse_care_record(lines)
    return {
        "agreed_rates": rates,
        "public_holidays": care["public_holidays"],
        "cancellations": care["cancellations"],
        "absences": care["absences"],
    }
