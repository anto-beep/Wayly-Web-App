"""CPR-1 interim safety mitigation (CPR-FINDINGS-UX-1 v2, M1-M4).

The 21/08/2026 grading found the Care Plan Reviewer emitting fabricated
statutory citations at high confidence in production. Pending the full
CPR-FINDINGS-UX-1 rebuild (Rule Registry + two-stage pipeline), this module
reduces live harm without violating the single-gate model:

* M1 strip statutory citations from every currently-emitted finding.
* M2 expose a prominent safety notice for the findings list banner.
* M3 cap the confidence tier (nothing may be shown as "high").
* M4 gated by env flag ``CPR_SAFETY_MITIGATION_ACTIVE`` (default on).
"""
from __future__ import annotations

import os
import re
from typing import Any, Dict, List, Optional, Tuple

SAFETY_NOTICE = {
    "active": True,
    "title": "Legal references are being reviewed",
    "body": (
        "To keep things accurate, Wayly has temporarily removed statutory "
        "references from these findings while we verify every citation against "
        "an approved legal register. The plain-English findings still stand, "
        "but please confirm any legal point with My Aged Care or a professional "
        "before you act on it."
    ),
}

# Statutory / legislative reference patterns to scrub from free text.
_CITATION_PATTERNS = [
    re.compile(r"\bsections?\s*\d+[A-Za-z]?(\([^)]*\))*", re.IGNORECASE),
    re.compile(r"\bss?\.?\s*\d+[A-Za-z]?(\([^)]*\))*", re.IGNORECASE),
    re.compile(r"\bAged Care Act(\s+\d{4})?\b", re.IGNORECASE),
    re.compile(r"\bSupport at Home Program Manual\b", re.IGNORECASE),
    re.compile(r"\b(Chapter|Part|Division|Schedule|Clause)\s+\d+[A-Za-z]?\b", re.IGNORECASE),
    re.compile(r"\bs\s?\d+[A-Za-z]?\b"),
]

_TEXT_FIELDS = ("narrative", "detail", "description", "recommendation", "explanation", "body", "why", "action")


def is_active() -> bool:
    return os.environ.get("CPR_SAFETY_MITIGATION_ACTIVE", "1") != "0"


def _scrub(text: Optional[str]) -> Optional[str]:
    if not text or not isinstance(text, str):
        return text
    out = text
    for pat in _CITATION_PATTERNS:
        out = pat.sub("", out)
    # Tidy the whitespace/punctuation left behind by removals.
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"\s{2,}", " ", out)
    out = re.sub(r"\s+([,.;:])", r"\1", out)
    out = re.sub(r"[,;]\s*([.)])", r"\1", out)
    return out.strip()


def _cap_confidence(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    if value.strip().lower() in ("high", "very high", "certain", "definite"):
        return "moderate"
    return value


def mitigate_finding(finding: Dict[str, Any]) -> Dict[str, Any]:
    f = dict(finding)
    # M1 remove structured citations.
    for key in ("citation_source", "citation_url", "citation", "statute", "legislation", "legal_basis"):
        if key in f:
            f[key] = None
    # M1 scrub inline statutory references from free text.
    for key in _TEXT_FIELDS:
        if key in f:
            f[key] = _scrub(f.get(key))
    # M3 cap confidence tier.
    if "confidence" in f:
        f["confidence"] = _cap_confidence(f.get("confidence"))
    f["citation_mitigated"] = True
    return f


def mitigate_findings(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not is_active() or not findings:
        return findings
    return [mitigate_finding(f) for f in findings]


def safety_notice() -> Optional[Dict[str, Any]]:
    return SAFETY_NOTICE if is_active() else None


def apply(findings: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Return (mitigated_findings, safety_notice_or_None)."""
    return mitigate_findings(findings), safety_notice()
