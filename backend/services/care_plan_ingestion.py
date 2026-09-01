"""CPR-1 · Care Plan ingestion service.

Handles the upload → parse → structure pipeline:

  1. Multi-file upload to GridFS bucket `care_plans` (region: ap-southeast-2).
  2. Text extraction per file via the existing `document_extract` module
     (PDF text layer, PDF vision fallback, DOCX, images, txt).
  3. HEIC decoding to JPEG before OCR (via pillow-heif).
  4. Concatenation in drop order.
  5. Structured extraction, regex-based extraction of participant name,
     effective dates, classification, provider, quarterly budget, and
     services list (see `_structure_plan_text`).
  6. Optional redaction pass on the analysis input (original file
     retained unredacted per spec §B.4).

The public surface is `ingest_care_plan(...)` returning a
`StructuredExtraction` and a `raw_text_redacted` string suitable for
feeding to the analysis engine.
"""
from __future__ import annotations

import io
import re
from typing import Any, Dict, List, Optional, Tuple

from care_plan_models import (
    ExtractedService, StructuredExtraction,
)


# ---------------------------------------------------------------------------
# Limits (spec §B.1)
# ---------------------------------------------------------------------------

MAX_BYTES_PER_FILE = 20 * 1024 * 1024        # 20 MB
MAX_FILES_PER_SUBMISSION = 5
MAX_TOTAL_PAGES = 60


ALLOWED_MIME_PREFIXES = (
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # DOCX
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "text/plain",
)


class UploadValidationError(ValueError):
    """Raised when a submitted upload violates B.1 limits."""


def validate_submission(files: List[Tuple[str, bytes, str]]) -> None:
    """Validate a submission of (filename, raw_bytes, content_type) tuples.

    Raises UploadValidationError on the first violation with a friendly
    error message.
    """
    if not files:
        raise UploadValidationError("No files were uploaded.")
    if len(files) > MAX_FILES_PER_SUBMISSION:
        raise UploadValidationError(
            f"Up to {MAX_FILES_PER_SUBMISSION} files per submission. "
            f"You uploaded {len(files)}."
        )
    for name, raw, ct in files:
        if len(raw) > MAX_BYTES_PER_FILE:
            raise UploadValidationError(
                f"{name} is too large. Maximum is 20 MB per file."
            )
        if not any((ct or "").lower().startswith(p) for p in ALLOWED_MIME_PREFIXES):
            raise UploadValidationError(
                f"{name} has an unsupported file type ({ct or 'unknown'}). "
                "Upload PDF, DOCX, JPG, PNG, HEIC, WebP, or paste as text."
            )


# ---------------------------------------------------------------------------
# HEIC decoder (pillow-heif) → JPEG bytes
# ---------------------------------------------------------------------------

def heic_to_jpeg(raw: bytes) -> bytes:
    """Decode a HEIC/HEIF image to JPEG bytes so downstream OCR / vision
    can consume it. Returns the JPEG payload."""
    try:
        import pillow_heif                          # type: ignore
        from PIL import Image
        pillow_heif.register_heif_opener()
        img = Image.open(io.BytesIO(raw))
        out = io.BytesIO()
        img.convert("RGB").save(out, format="JPEG", quality=90)
        return out.getvalue()
    except Exception as e:  # noqa: BLE001
        raise UploadValidationError(
            f"HEIC file could not be decoded: {e}. Re-export as JPG or PDF."
        )


# ---------------------------------------------------------------------------
# Redaction
# ---------------------------------------------------------------------------

_NAME_RE = re.compile(
    r"\b([A-Z][a-z]+(?:['\-][A-Z][a-z]+)*)\s+([A-Z][a-z]+(?:['\-][A-Z][a-z]+)*)\b",
)
_MEDICARE_RE = re.compile(r"\b\d{4}\s*\d{5}\s*\d{1,2}\b")
_ADDRESS_RE = re.compile(
    r"\b\d+\s+[A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*\s+"
    r"(Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Way|Boulevard|Blvd|Terrace|Tce|Crescent|Cres|Parade|Pde)\b",
    re.IGNORECASE,
)


def redact_plan_text(text: str) -> str:
    """Best-effort redaction: replace person names, addresses, and
    Medicare numbers with [REDACTED_*] tokens. Not a compliance-grade
    filter (per spec §B.4 warning)."""
    if not text:
        return text
    out = text
    out = _MEDICARE_RE.sub("[REDACTED_MEDICARE]", out)
    out = _ADDRESS_RE.sub("[REDACTED_ADDRESS]", out)

    # First pass, match two-word cap-cap sequences (first + last name)
    # and remember the individual first/last names so we can strip solo
    # occurrences in the second pass.
    solo_names: set[str] = set()
    _COMMON = {
        "Support", "At", "Home", "Care", "Plan", "Provider", "Participant",
        "Effective", "From", "To", "Classification", "Quarterly", "Budget",
        "Care", "Cultural", "Background", "Not", "Stated", "Services",
        "Delivered", "Narrative", "Goals", "Prepared", "Under", "Aged",
        "Act", "Type", "Independence", "Everyday", "Living", "Clinical",
        "Personal", "Domestic", "Nursing", "Administration", "Program",
        "Manual", "Signed", "Reviewed", "Better", "Community",
    }

    def _mask_two_word(m: re.Match) -> str:
        first, last = m.group(1), m.group(2)
        if first in _COMMON and last in _COMMON:
            return m.group(0)
        if first not in _COMMON:
            solo_names.add(first)
        if last not in _COMMON:
            solo_names.add(last)
        return "[REDACTED_NAME]"

    out = _NAME_RE.sub(_mask_two_word, out)

    # Second pass, replace solo occurrences of names captured above.
    for name in sorted(solo_names, key=len, reverse=True):
        out = re.sub(rf"\b{re.escape(name)}\b", "[REDACTED_NAME]", out)
    return out


# ---------------------------------------------------------------------------
# Structured extraction, regex-based, deterministic
# ---------------------------------------------------------------------------

_STREAM_MAP = {
    "clinical": "Clinical",
    "nursing": "Clinical",
    "allied": "Clinical",
    "wound": "Clinical",
    "medication": "Clinical",
    "physiotherapy": "Clinical",
    "occupational therapy": "Clinical",
    "podiatry": "Clinical",
    "personal care": "Independence",
    "personal-care": "Independence",
    "shower": "Independence",
    "respite": "Independence",
    "social support": "Independence",
    "transport": "Independence",
    "community access": "Independence",
    "domestic": "EverydayLiving",
    "cleaning": "EverydayLiving",
    "gardening": "EverydayLiving",
    "meal": "EverydayLiving",
    "shopping": "EverydayLiving",
    "home maintenance": "EverydayLiving",
    "everyday living": "EverydayLiving",
}


def _classify_stream(desc: str) -> str:
    """Rough stream classification for a service description."""
    d = (desc or "").lower()
    for key, stream in _STREAM_MAP.items():
        if key in d:
            return stream
    return "Unknown"


def _first_name_from(text: str) -> Optional[str]:
    """Extract the participant's first name from an unredacted plan.

    Look for `Participant:` labels first, fall back to the first
    capitalised two-word span near the top of the document.
    """
    m = re.search(r"Participant\s*:?\s*([A-Z][a-z]+)", text)
    if m:
        return m.group(1)
    m2 = re.search(r"For\s*:?\s*([A-Z][a-z]+)", text)
    if m2:
        return m2.group(1)
    return None


def _extract_date_range(text: str) -> Tuple[Optional[str], Optional[str]]:
    """Try to pull `effective_from` / `effective_to` as ISO YYYY-MM-DD."""
    ef = re.search(
        r"[Ee]ffective\s+from\s*:?\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", text,
    )
    et = re.search(
        r"[Ee]ffective\s+to\s*:?\s*(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", text,
    )

    def _iso(m: re.Match | None) -> Optional[str]:
        if not m:
            return None
        day, month, year = m.group(1), m.group(2), m.group(3)
        try:
            return f"{int(year):04d}-{int(month):02d}-{int(day):02d}"
        except ValueError:
            return None
    return _iso(ef), _iso(et)


def _extract_classification(text: str) -> Optional[int]:
    m = re.search(r"[Cc]lassification\s*:?\s*(\d)", text)
    if m:
        try:
            n = int(m.group(1))
            if 1 <= n <= 8:
                return n
        except ValueError:
            return None
    return None


def _extract_quarterly_budget(text: str) -> Optional[float]:
    m = re.search(
        r"[Qq]uarterly\s+budget\s*:?\s*\$?\s*([\d,]+(?:\.\d+)?)", text,
    )
    if m:
        try:
            return float(m.group(1).replace(",", ""))
        except ValueError:
            return None
    return None


def _extract_provider(text: str) -> Optional[str]:
    """Extract provider name. Recognises two patterns:
    1. `Provider: XXX`
    2. `SUPPORT AT HOME CARE PLAN, XXX` (header em-dash / hyphen)
    """
    m = re.search(
        r"[Pp]rovider\s*:?\s*([A-Z][A-Za-z0-9 &,'\-]{2,80})", text,
    )
    if m:
        candidate = m.group(1).strip().rstrip(".,;:")
        candidate = re.split(r"[\n\r]", candidate)[0].strip()
        return candidate or None
    # Header pattern
    m2 = re.search(
        r"(?:SUPPORT\s+AT\s+HOME\s+CARE\s+PLAN|CARE\s+PLAN)\s*[\u2014\-,:]\s*([A-Z][A-Za-z0-9 &,'\-]{2,80})",
        text,
    )
    if m2:
        candidate = m2.group(1).strip().rstrip(".,;:")
        candidate = re.split(r"[\n\r]", candidate)[0].strip()
        return candidate or None
    return None


_SERVICE_LINE_RE = re.compile(
    r"^\s*([A-Z][A-Za-z][A-Za-z \-\(\)/&]+?)\s{2,}"                     # description
    r"([A-Z][a-zA-Z ]+?)?\s{2,}?"                                        # optional category
    r"(\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|session|sessions|visit|visits|day|days|km|ea)?"
    r"(?:\s*[/]\s*(?:week|wk|fortnight|month|day))?)\s{2,}"              # frequency
    r"\$?\s*([\d,]+(?:\.\d+)?)\s*$",                                     # amount
    re.MULTILINE,
)


def _extract_services(text: str) -> List[ExtractedService]:
    """Best-effort service extractor. Handles two common shapes:
    1. Horizontal (source is plain-text or copy-paste with wide spacing):
       ``Personal care  Independence  1 hr / week  $68.00``
    2. Vertical (PDF text-layer extraction, each cell on its own line):
       ``Personal care\nIndependence\n1 hr / week\n$68.00``
    """
    out: List[ExtractedService] = []

    # Path 1, horizontal
    for m in _SERVICE_LINE_RE.finditer(text):
        desc = m.group(1).strip()
        freq_txt = m.group(3).strip()
        if any(kw in desc.lower() for kw in ("total", "subtotal", "budget summary")):
            continue
        if "care management" in desc.lower():
            continue
        stream = _classify_stream(desc)
        hours_pw = _parse_weekly_hours(freq_txt)
        out.append(ExtractedService(
            stream=stream, description=desc,
            hours_per_week=hours_pw, frequency_text=freq_txt,
            unit_rate=None, provider=None,
        ))

    if out:
        return out

    # Path 2, vertical (PDF text-layer output). Look for the "Services
    # Delivered" section then walk lines 4-at-a-time skipping headers.
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    try:
        header_idx = next(
            i for i, l in enumerate(lines)
            if l.lower() in ("services delivered", "services", "services this period")
        )
    except StopIteration:
        return out

    # Detect the column-header row (Service, Category, Frequency, Amount)
    header_labels = {"service", "category", "frequency", "amount", "description", "stream"}
    start = header_idx + 1
    while start < len(lines) and lines[start].lower() in header_labels:
        start += 1

    i = start
    stopwords = ("goals", "narrative", "allied health", "prepared", "signed", "authorised", "reviewed")
    freq_re = re.compile(
        r"\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|session|sessions|visit|visits|day|days|ea)?\s*(?:/|per)\s*(?:week|wk|fortnight|month|day)",
        re.IGNORECASE,
    )
    amount_re = re.compile(r"^\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*$")
    stream_words = {"independence", "clinical", "everyday living", "care management", "administration", "athm"}

    while i + 3 < len(lines):
        # Stop on next section boundary
        if any(sw in lines[i].lower() for sw in stopwords):
            break
        desc = lines[i]
        stream_raw = lines[i + 1]
        freq_txt = lines[i + 2]
        amount_txt = lines[i + 3]
        # Sanity: freq must look like a frequency and amount must look like $X
        if not (freq_re.search(freq_txt) and amount_re.match(amount_txt)):
            i += 1
            continue
        # Skip admin/care mgmt row (belongs in care_management field)
        if "care management" in desc.lower() or "administration" in stream_raw.lower():
            i += 4
            continue
        # Stream mapping (prefer explicit column, fall back to description)
        stream = _classify_stream(desc)
        stream_low = stream_raw.lower()
        if stream_low in stream_words:
            if "clinical" in stream_low:
                stream = "Clinical"
            elif "independence" in stream_low:
                stream = "Independence"
            elif "everyday" in stream_low:
                stream = "EverydayLiving"
        hours_pw = _parse_weekly_hours(freq_txt)
        out.append(ExtractedService(
            stream=stream, description=desc,
            hours_per_week=hours_pw, frequency_text=freq_txt,
            unit_rate=None, provider=None,
        ))
        i += 4

    return out


def _parse_weekly_hours(freq: str) -> Optional[float]:
    """Convert '1.5 hrs / week', '0.5 hr / fortnight', '1 session / week' to
    hours_per_week float. Sessions and visits are counted as 1 hour each
    for a rough time-based comparison."""
    if not freq:
        return None
    m = re.search(
        r"(\d+(?:\.\d+)?)\s*(hr|hrs|hour|hours|session|sessions|visit|visits|day|days)?\s*/?\s*(week|wk|fortnight|month|day)?",
        freq.lower(),
    )
    if not m:
        return None
    try:
        n = float(m.group(1))
    except ValueError:
        return None
    unit = (m.group(2) or "hr").rstrip("s")
    period = m.group(3) or "week"
    unit_hours = {"hr": 1.0, "hour": 1.0, "session": 1.0, "visit": 1.0, "day": 8.0}.get(unit, 1.0)
    per_week = {"week": 1.0, "wk": 1.0, "fortnight": 0.5, "month": 0.2308, "day": 7.0}.get(period, 1.0)
    return round(n * unit_hours * per_week, 3)


def _extract_narrative(text: str) -> str:
    """Grab the narrative section, everything between 'NARRATIVE' and the
    next all-caps heading (SERVICES / GOALS / etc)."""
    m = re.search(
        r"(?im)^\s*(?:NARRATIVE|SUMMARY|BACKGROUND)\s*[:\n]([\s\S]*?)^\s*(?:[A-Z][A-Z\s]{3,}|$)",
        text,
    )
    if m:
        return m.group(1).strip()
    return ""


def structure_plan_text(text: str, care_plan_id: str) -> StructuredExtraction:
    """Given plain text, produce a StructuredExtraction. Deterministic."""
    return StructuredExtraction(
        care_plan_id=care_plan_id,
        participant_first_name=_first_name_from(text),
        effective_from=_extract_date_range(text)[0],
        effective_to=_extract_date_range(text)[1],
        classification=_extract_classification(text),
        provider_name=_extract_provider(text),
        quarterly_budget=_extract_quarterly_budget(text),
        services=_extract_services(text),
        narrative_text=_extract_narrative(text),
        unread_sections=[],
        extraction_engine="regex-v1",
    )


# ---------------------------------------------------------------------------
# Public entry, text-only ingest (no file I/O). File-upload wrapper lives
# in the routes module which handles GridFS storage before calling this.
# ---------------------------------------------------------------------------

def ingest_care_plan_text(
    plan_text: str,
    *,
    care_plan_id: str,
    redact: bool = False,
) -> Dict[str, Any]:
    """Structure a plan from plain text.

    Returns:
        {
          "extraction": StructuredExtraction,
          "analysis_text": str,     # what the analysis engine will see
          "raw_text": str,          # full unredacted text (for storage)
        }
    """
    extraction = structure_plan_text(plan_text, care_plan_id)
    analysis_text = redact_plan_text(plan_text) if redact else plan_text
    return {
        "extraction": extraction,
        "analysis_text": analysis_text,
        "raw_text": plan_text,
    }


__all__ = [
    "MAX_BYTES_PER_FILE",
    "MAX_FILES_PER_SUBMISSION",
    "MAX_TOTAL_PAGES",
    "ALLOWED_MIME_PREFIXES",
    "UploadValidationError",
    "validate_submission",
    "heic_to_jpeg",
    "redact_plan_text",
    "structure_plan_text",
    "ingest_care_plan_text",
]
