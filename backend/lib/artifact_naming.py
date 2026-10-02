"""Shared, single-source artefact filename builder (DOC-PARITY-1 v2, decision 4).

Every downloadable document type routes its filename through THIS function so a
download is named identically regardless of the surface that started it, and
all human-facing dates in the name render as DD-MM-YYYY (decision 8).
"""
from __future__ import annotations

import re
from typing import Any, Optional


def _slug(name: Any, default: str = "statement") -> str:
    s = re.sub(r"[^\w\s-]", "", str(name or "")).strip()
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s or default


def _ddmmyyyy(v: Any) -> str:
    if not v:
        return ""
    s = str(v)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    m = re.match(r"(\d{2})[/-](\d{2})[/-](\d{4})", s)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    return ""


def _period_segment(meta: dict) -> str:
    start = _ddmmyyyy(meta.get("period_start"))
    end = _ddmmyyyy(meta.get("period_end"))
    if start and end:
        return f"{start}-to-{end}"
    if start:
        return start
    if end:
        return end
    return _slug(meta.get("period_label"), "period")


# Canonical prefixes per document type.
_PREFIX = {
    "decoded_statement": "Wayly-Decoded-Statement",
    "complaint_evidence": "Wayly-Complaint-Evidence",
    "care_plan": "Wayly-Care-Plan",
    "invoice_check": "Wayly-Invoice-Check",
}


def build_filename(doc_type: str, meta: Optional[dict] = None, ext: str = "pdf") -> str:
    """Return the canonical filename for a downloadable document.

    doc_type: one of the keys in _PREFIX.
    meta: {participant_name, provider_name, period_start, period_end,
           period_label, date, title}.
    ext: extension without the dot.
    """
    meta = meta or {}
    prefix = _PREFIX.get(doc_type, "Wayly-Document")
    who = _slug(meta.get("participant_name") or meta.get("title") or meta.get("provider_name"))
    ext = (ext or "pdf").lstrip(".").lower()

    if doc_type == "decoded_statement":
        return f"{prefix}_{who}_{_period_segment(meta)}.{ext}"

    # Other document types are point-in-time: <prefix>_<who>_<DD-MM-YYYY>.
    when = _ddmmyyyy(meta.get("date") or meta.get("period_end") or meta.get("period_start"))
    tail = f"_{when}" if when else ""
    return f"{prefix}_{who}{tail}.{ext}"


def content_disposition(doc_type: str, meta: Optional[dict] = None, ext: str = "pdf") -> str:
    return f'attachment; filename="{build_filename(doc_type, meta, ext)}"'
