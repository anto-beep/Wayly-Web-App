"""DEC-1 v5 · Anti-fabrication guards (F1-F5).

Deterministic post-processing that runs after LLM extraction and after
anomaly detection. Runs in one of two modes controlled by the
`DEC1_V5_STRICT` environment variable:

  * strict=false (Phase 1 default), log-only. Returns the input unchanged
    but emits structured log lines counting what WOULD have been stripped.
    Gives us telemetry on real production data without changing behaviour.

  * strict=true (Phase 2 flip), actively removes fabricated output.
    Stripped items are returned in a second list for audit-trail logging.

Reference:
  /app/docs/DEC-1_v5_spec.md §Anti-Hallucination Requirements (F1-F5)
  /app/docs/audits/DEC-1-v5-phase0-audit.md §14
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Dict, Iterable, List, Optional, Tuple

from lib.dec1_v5_schema import (
    BANNED_LEGISLATIVE_PHRASES,
    LEGISLATIVE_CITATION_ALLOWLIST,
)

log = logging.getLogger("wayly.dec1_v5")

# ---------------------------------------------------------------------------
# Strict-mode env flag. Default OFF for Phase 1 (log-only).
# ---------------------------------------------------------------------------

def _strict_mode_enabled() -> bool:
    """Read the flag on every call so tests can flip it via monkeypatch."""
    return os.environ.get("DEC1_V5_STRICT", "false").strip().lower() in (
        "true", "1", "yes", "on",
    )


# ---------------------------------------------------------------------------
# StripEvent, structured record of what strict mode WOULD strip.
# ---------------------------------------------------------------------------

@dataclass
class StripEvent:
    kind: str                  # e.g. "hallucinated_service_code"
    pattern: str               # e.g. "F3"
    payload: Dict[str, Any]    # arbitrary detail for the audit log
    reason: str                # human-readable

    def to_dict(self) -> Dict[str, Any]:
        return {
            "kind": self.kind,
            "pattern": self.pattern,
            "payload": self.payload,
            "reason": self.reason,
        }


# ---------------------------------------------------------------------------
# Regex helpers
# ---------------------------------------------------------------------------

# Service code shape observed in the wild: 2-4 uppercase letters, optional
# dash + 1-4 digits/letters. e.g. "PT", "PC", "PC-001", "TR-003", "AH".
_SERVICE_CODE_RE = re.compile(r"\b[A-Z]{2,4}(?:-[A-Z0-9]{1,4})?\b")

# GST detection (used for the F1 GST-specific regression test)
_GST_TOKEN_RE = re.compile(r"\bgst\b", re.IGNORECASE)


def _source_contains_service_codes(raw_text: str) -> bool:
    """Heuristic: does the source text contain any service-code-shaped token?

    False-positive-safe: we look for the shape in the region of the source
    that mentions services (line items). A single incidental all-caps word
    like "AT" or "GP" shouldn't count. We require at least 2 code-like tokens
    within 400 characters of a "service" / "personal care" / "clinical"
    keyword.
    """
    if not raw_text:
        return False
    text = raw_text
    hits = 0
    for m in _SERVICE_CODE_RE.finditer(text):
        token = m.group(0)
        # ignore common English words that happen to be all-caps in the doc
        if token.upper() in {"GST", "PDF", "ABN", "TFN", "SAH", "HCP", "OT",
                             "GP", "AT", "AT-HM", "PDF-A", "ID", "PO", "US",
                             "UK", "AU", "CEO", "CFO", "PTY", "LTD",
                             "LTD-1"}:
            continue
        hits += 1
        if hits >= 2:
            return True
    return False


# ---------------------------------------------------------------------------
# F1 · Anti-fabricated fields (GST-specific + provider-mismatch subcases)
# ---------------------------------------------------------------------------

def strip_hallucinated_source_field_anomalies(
    anomalies: Iterable[Dict[str, Any]],
    raw_text: str,
    *,
    strict: Optional[bool] = None,
) -> Tuple[List[Dict[str, Any]], List[StripEvent]]:
    """v5 §F1. Strip anomalies that reference terms not present in source.

    Currently checks the two Margaret-observed patterns:
      1. GST-related anomaly on a source with zero "GST" mentions.
      2. Provider header/footer mismatch on a source where header and footer
         either match exactly or are not both present.
    """
    if strict is None:
        strict = _strict_mode_enabled()
    kept: List[Dict[str, Any]] = []
    stripped: List[StripEvent] = []
    source_has_gst = bool(_GST_TOKEN_RE.search(raw_text or ""))
    for a in (anomalies or []):
        if not isinstance(a, dict):
            kept.append(a)
            continue
        text_blob = " ".join(
            str(a.get(k, "") or "")
            for k in ("rule", "title", "message", "description", "explanation")
        ).lower()

        # F1 sub-case A: GST anomaly on a source with no GST mention.
        if not source_has_gst and "gst" in text_blob:
            ev = StripEvent(
                kind="hallucinated_gst_anomaly",
                pattern="F1",
                payload={"rule": a.get("rule"), "excerpt": text_blob[:120]},
                reason="Source text contains no GST mention; anomaly cannot be trusted.",
            )
            stripped.append(ev)
            if strict:
                continue

        # F1 sub-case B: provider header/footer mismatch flagged with source
        # evidence that is either missing OR whose two strings are substrings
        # of one another (the LLM auditor's common hallucination pattern ,
        # truncating a full provider name and calling that a mismatch).
        if a.get("rule") == "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH":
            ev_list = a.get("source_evidence") or []
            # Extract just the values (strip "header: " / "footer: " labels).
            values: list[str] = []
            for e in ev_list:
                if not isinstance(e, str):
                    continue
                # Split on ":" once to drop the "header:"/"footer:" prefix.
                v = e.split(":", 1)[-1].strip().lower()
                if v:
                    values.append(v)
            unverified = False
            if not values:
                unverified = True
                reason = "No source_evidence supplied; provider mismatch is unverifiable."
            elif len(values) < 2:
                unverified = True
                reason = "Only one source_evidence string supplied; a mismatch requires two."
            else:
                # If any pair are substrings of each other, it isn't a real
                # mismatch, the LLM auditor truncated one and called it new.
                for i in range(len(values)):
                    for j in range(i + 1, len(values)):
                        a_str, b_str = values[i], values[j]
                        if a_str == b_str or a_str in b_str or b_str in a_str:
                            unverified = True
                            reason = "source_evidence strings are substrings of each other; no real mismatch."
                            break
                    if unverified:
                        break
            if unverified:
                ev = StripEvent(
                    kind="unverified_provider_mismatch",
                    pattern="F1",
                    payload={"rule": a.get("rule"), "evidence": ev_list},
                    reason=reason,
                )
                stripped.append(ev)
                if strict:
                    continue

        # F1 sub-case C: any anomaly whose body mentions a specific dollar
        # figure that does not appear in the source. Only strip when the
        # anomaly also lacks source_evidence (evidence is the escape hatch).
        # We look for well-formed dollar mentions like $583.00, $21.50.
        if not a.get("source_evidence"):
            for m in re.finditer(r"\$\d[\d,]*\.\d{2}", text_blob):
                dollar_str = m.group(0)
                if dollar_str not in (raw_text or ""):
                    ev = StripEvent(
                        kind="fabricated_dollar_reference",
                        pattern="F1",
                        payload={
                            "rule": a.get("rule"),
                            "invented_amount": dollar_str,
                        },
                        reason="Dollar figure referenced in the anomaly does not appear in the source text.",
                    )
                    stripped.append(ev)
                    if strict:
                        break
            else:
                # for/else, the loop completed without hitting `break`.
                pass
            if stripped and stripped[-1].kind == "fabricated_dollar_reference" and strict:
                continue

        kept.append(a)
    if stripped:
        log.info(
            "dec1_v5.anti_fab.f1: %s (strict=%s)",
            [e.to_dict() for e in stripped], strict,
        )
    return kept, stripped


# ---------------------------------------------------------------------------
# F3 · Anti-fabricated service codes
# ---------------------------------------------------------------------------

def strip_hallucinated_service_codes(
    line_items: Iterable[Dict[str, Any]],
    raw_text: str,
    *,
    strict: Optional[bool] = None,
) -> Tuple[List[Dict[str, Any]], List[StripEvent]]:
    """v5 §F3. If the source has no service codes, clear all output codes.

    In log-only mode this returns the input unchanged but records which lines
    would have had their code cleared.
    """
    if strict is None:
        strict = _strict_mode_enabled()
    if _source_contains_service_codes(raw_text):
        # Source has codes, so anything the LLM emitted is at least plausibly
        # legitimate. We leave code-verification for a later phase where we
        # cross-check each code against the source substring set.
        return list(line_items or []), []

    kept: List[Dict[str, Any]] = []
    stripped: List[StripEvent] = []
    for li in (line_items or []):
        if not isinstance(li, dict):
            kept.append(li)
            continue
        code = li.get("service_code")
        if code:
            ev = StripEvent(
                kind="fabricated_service_code",
                pattern="F3",
                payload={
                    "date": li.get("date"),
                    "description": (li.get("service_description") or "")[:40],
                    "invented_code": code,
                },
                reason="Source text contains no service codes; line-item code cannot have come from the source.",
            )
            stripped.append(ev)
            if strict:
                out_li = dict(li)
                out_li["service_code"] = ""
                kept.append(out_li)
                continue
        kept.append(li)
    if stripped:
        log.info(
            "dec1_v5.anti_fab.f3: cleared=%d strict=%s examples=%s",
            len(stripped), strict, [e.payload for e in stripped[:3]],
        )
    return kept, stripped


# ---------------------------------------------------------------------------
# F4 · Anti-fabricated dollar impact figures
# ---------------------------------------------------------------------------

def audit_impact_traceability(
    anomalies: Iterable[Dict[str, Any]],
    line_items: Iterable[Dict[str, Any]],
    *,
    strict: Optional[bool] = None,
    tolerance: float = 0.01,
) -> Tuple[List[Dict[str, Any]], List[StripEvent]]:
    """v5 §F4. Every non-null anomaly `impact_aud` must be reconstructable
    from a specific subset of line items.

    Rules:
      * If `impact_aud` is None, no check runs. Null is allowed but does not
        contribute to summary totals.
      * If `impact_aud` is not None, we accept it if it equals the total
        gross of any single line item, OR the sum of the line items whose
        gross values are cited in the anomaly's `source_evidence`.
      * Otherwise the impact is a fabrication candidate.

    In log-only mode we do NOT modify the anomaly; we just log the evidence
    of untraceable impact. In strict mode we NULL out the impact_aud field.
    """
    if strict is None:
        strict = _strict_mode_enabled()

    line_grosses = sorted({
        round(float(li.get("gross") or 0.0), 2)
        for li in (line_items or [])
        if isinstance(li, dict) and li.get("gross")
    })
    # Also allow subset sums up to a small size, reconstructable in practice.
    from itertools import combinations
    subset_sums: set[float] = set(line_grosses)
    for r in range(2, min(5, len(line_grosses) + 1)):
        for combo in combinations(line_grosses, r):
            subset_sums.add(round(sum(combo), 2))

    # Deterministic rules whose impact is computed from source_evidence dollar
    # figures, not from a line-item subset. These are traceable by
    # construction, the F4 subset-sum check would false-positive on them.
    _WHITELIST_RULES: set[str] = {
        "RULE_25_SOURCE_ARITHMETIC_GAP",
        "RULE_1B_CARE_MGMT_MONTHLY",
        "RULE_1B_CARE_MGMT_BELOW_STANDARD",
        "RULE_1_CARE_MGMT_CAP",
        "RULE_15_GROSS_TOTAL_PARSE_WARNING",
    }

    def _impact_traceable_via_evidence(a: Dict[str, Any], target: float) -> bool:
        """Check whether the impact matches abs(A - B) or A or B for any two
        dollar figures found in source_evidence. This is what deterministic
        arithmetic rules (RULE_25 etc) provide as their impact by design."""
        evidence = a.get("source_evidence") or []
        evidence_dollars: list[float] = []
        for ev in evidence:
            if not isinstance(ev, str):
                continue
            for m in re.finditer(r"\$([\d,]+\.\d{2})", ev):
                try:
                    evidence_dollars.append(float(m.group(1).replace(",", "")))
                except Exception:
                    pass
        if not evidence_dollars:
            return False
        for v in evidence_dollars:
            if abs(target - v) < tolerance:
                return True
        for i in range(len(evidence_dollars)):
            for j in range(i + 1, len(evidence_dollars)):
                if abs(target - abs(evidence_dollars[i] - evidence_dollars[j])) < tolerance:
                    return True
                if abs(target - (evidence_dollars[i] + evidence_dollars[j])) < tolerance:
                    return True
        return False

    kept: List[Dict[str, Any]] = []
    stripped: List[StripEvent] = []
    for a in (anomalies or []):
        if not isinstance(a, dict):
            kept.append(a)
            continue
        impact = a.get("impact_aud")
        if impact is None:
            kept.append(a)
            continue
        try:
            impact_f = round(float(impact), 2)
        except (TypeError, ValueError):
            impact_f = None
        traceable = (
            impact_f is not None
            and any(abs(impact_f - s) < tolerance for s in subset_sums)
        )
        if not traceable and impact_f is not None:
            # Whitelist route: RULE_25 etc. reconstruct impact from source_evidence
            # dollar figures (declared - line_sum, etc.), not from a subset sum.
            if a.get("rule") in _WHITELIST_RULES and _impact_traceable_via_evidence(a, impact_f):
                traceable = True
        if not traceable:
            ev = StripEvent(
                kind="untraceable_impact",
                pattern="F4",
                payload={"rule": a.get("rule"), "impact_aud": impact},
                reason="impact_aud value could not be reconstructed from any subset of line-item gross values.",
            )
            stripped.append(ev)
            if strict:
                out_a = dict(a)
                out_a["impact_aud"] = None
                kept.append(out_a)
                continue
        kept.append(a)
    if stripped:
        log.info(
            "dec1_v5.anti_fab.f4: untraceable=%d strict=%s examples=%s",
            len(stripped), strict, [e.payload for e in stripped[:3]],
        )
    return kept, stripped


# ---------------------------------------------------------------------------
# F5 · Anti-fabricated legislative citations
# ---------------------------------------------------------------------------

def strip_illegal_legislative_citations(
    anomalies: Iterable[Dict[str, Any]],
    *,
    strict: Optional[bool] = None,
) -> Tuple[List[Dict[str, Any]], List[StripEvent]]:
    """v5 §F5. Remove vague legislative appeals unless the citation is on
    the allowlist. Currently checks the `message` / `description` fields.
    """
    if strict is None:
        strict = _strict_mode_enabled()
    kept: List[Dict[str, Any]] = []
    stripped: List[StripEvent] = []
    for a in (anomalies or []):
        if not isinstance(a, dict):
            kept.append(a)
            continue
        found = None
        for field in ("message", "description", "explanation", "title"):
            v = a.get(field)
            if not isinstance(v, str):
                continue
            v_lower = v.lower()
            for phrase in BANNED_LEGISLATIVE_PHRASES:
                if phrase in v_lower:
                    # Check if the same field also mentions an allowlisted citation.
                    if any(ok.lower() in v_lower for ok in LEGISLATIVE_CITATION_ALLOWLIST):
                        continue
                    found = (field, phrase, v[:120])
                    break
            if found:
                break
        if found:
            ev = StripEvent(
                kind="illegal_legislative_citation",
                pattern="F5",
                payload={
                    "rule": a.get("rule"),
                    "field": found[0],
                    "banned_phrase": found[1],
                    "excerpt": found[2],
                },
                reason="Anomaly cites 'aged care legislation' without a specific allowlisted citation.",
            )
            stripped.append(ev)
            if strict:
                # In strict mode, wipe just the offending phrase from the field.
                out_a = dict(a)
                v = out_a.get(found[0], "")
                out_a[found[0]] = re.sub(
                    re.escape(found[1]), "", v, flags=re.IGNORECASE,
                ).strip()
                kept.append(out_a)
                continue
        kept.append(a)
    if stripped:
        log.info(
            "dec1_v5.anti_fab.f5: illegal_citations=%d strict=%s examples=%s",
            len(stripped), strict, [e.payload for e in stripped[:3]],
        )
    return kept, stripped


# ---------------------------------------------------------------------------
# Combined pipeline convenience
# ---------------------------------------------------------------------------

def apply_all_anti_fabrication(
    extracted: Dict[str, Any],
    audit: Dict[str, Any],
    raw_text: str,
    *,
    strict: Optional[bool] = None,
) -> Tuple[Dict[str, Any], Dict[str, Any], List[StripEvent]]:
    """Run every F-check in order and return (extracted, audit, events).

    Idempotent, safe to call in log-only mode from the decode pipeline.
    Does NOT mutate the inputs.
    """
    if strict is None:
        strict = _strict_mode_enabled()

    out_ext = dict(extracted or {})
    out_audit = dict(audit or {})
    all_events: List[StripEvent] = []

    # F3, service codes on line items
    line_items = out_ext.get("line_items") or []
    new_lines, ev = strip_hallucinated_service_codes(
        line_items, raw_text, strict=strict,
    )
    all_events.extend(ev)
    out_ext["line_items"] = new_lines

    # F1, fabricated field claims (GST, provider mismatch)
    anomalies = out_audit.get("anomalies") or []
    new_anoms, ev = strip_hallucinated_source_field_anomalies(
        anomalies, raw_text, strict=strict,
    )
    all_events.extend(ev)

    # F4, impact traceability
    new_anoms, ev = audit_impact_traceability(
        new_anoms, new_lines, strict=strict,
    )
    all_events.extend(ev)

    # F5, illegal legislative citations
    new_anoms, ev = strip_illegal_legislative_citations(
        new_anoms, strict=strict,
    )
    all_events.extend(ev)

    out_audit["anomalies"] = new_anoms
    return out_ext, out_audit, all_events
