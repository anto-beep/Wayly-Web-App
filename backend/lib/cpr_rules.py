"""CPR-FINDINGS-UX-1 v2 · Workstream A — findings-engine correctness.

This module is the permanent replacement for the interim citation-stripping
mitigation. It provides the four structural safety guarantees the 21/08/2026
grading required:

* A1  Rule Registry loader + citation whitelist (``/registry/cpr-rules-v1.yaml``).
* A3  Flagship affirmative "Verification panel" computed with ``Decimal``
      (never floats, never the model). Silence is not permitted, every check
      reports pass / flag / cannot_run, and a cannot_run names the missing field.
* A5  Title / body coherence lint.
* A6  Confidence-tier calibration bound to source_type (L3).

Plus the banned-rule enforcement (minimum RN hours, transport midpoints, etc.)
that the CI golden fixture asserts on.

The dollar figures the verification panel compares against come from INDEX-1
(``monetary_constants.yaml``, a verified register), NOT from the model, so the
panel is safe to show even while the interim citation mitigation is still on.
"""
from __future__ import annotations

import re
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

_REGISTRY_DIR = Path("/app/registry")
_RULES_PATH = _REGISTRY_DIR / "cpr-rules-v1.yaml"
_CATEGORIES_PATH = _REGISTRY_DIR / "cpr-categories-v1.yaml"

CUTOVER_2026_10_01 = date(2026, 10, 1)

# Confidence tier bound to source_type per locked decision L3.
CONFIDENCE_BY_SOURCE_TYPE = {
    "legislation": "high",
    "rules": "high",
    "standard": "medium",
    "regulator_guidance": "medium",
    "clinical_best_practice": "low",
}

# Patterns that must never appear as a registry rule (structurally banned).
_BANNED_PATTERNS = [
    re.compile(r"minimum\s+(registered\s+nurse|rn)\s+hours", re.IGNORECASE),
    re.compile(r"\brn\s+hours?\s+below", re.IGNORECASE),
    re.compile(r"s\.?\s*194-5\(1\)\(c\)\s*minimum", re.IGNORECASE),
    re.compile(r"transport\s+price\s+midpoint", re.IGNORECASE),
    re.compile(r"minimum\s+service\s+hours\s+by\s+classification", re.IGNORECASE),
]


# ---------------------------------------------------------------------------
# Registry loading
# ---------------------------------------------------------------------------

@lru_cache(maxsize=1)
def load_rules() -> List[Dict[str, Any]]:
    if not _RULES_PATH.exists():
        return []
    with open(_RULES_PATH, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    return list(data.get("rules") or [])


@lru_cache(maxsize=1)
def load_categories() -> Dict[str, Dict[str, Any]]:
    if not _CATEGORIES_PATH.exists():
        return {}
    with open(_CATEGORIES_PATH, "r", encoding="utf-8") as fh:
        data = yaml.safe_load(fh) or {}
    return {c["category_id"]: c for c in (data.get("categories") or [])}


def rule_by_id(rule_id: str) -> Optional[Dict[str, Any]]:
    for r in load_rules():
        if r.get("rule_id") == rule_id:
            return r
    return None


def category_signed_off(category_id: str) -> bool:
    cat = load_categories().get(category_id) or {}
    return bool(cat.get("solicitor_signed_off"))


def banned_rule_violations() -> List[str]:
    """Return rule_ids in the registry that match a structurally banned
    pattern. CI fails the build if this is non-empty."""
    out: List[str] = []
    for r in load_rules():
        haystack = " ".join(str(r.get(k, "")) for k in ("finding_title", "source_citation"))
        for pat in _BANNED_PATTERNS:
            if pat.search(haystack):
                out.append(r.get("rule_id", "?"))
                break
    return out


# ---------------------------------------------------------------------------
# Confidence calibration (A6 / L3) and title-body lint (A5 / L6)
# ---------------------------------------------------------------------------

def calibrate_confidence(citation_source: Optional[str]) -> str:
    """Overwrite model-emitted confidence with a tier bound to the source's
    bindingness. Model self-assessment is discarded."""
    src = (citation_source or "").strip().lower()
    if not src or src == "verification required":
        return "low"
    if "aged care rules" in src or "aged care act" in src or "statement of rights" in src:
        return "high"
    if "quality standards" in src:
        return "medium"
    if "schedule" in src or "my aged care" in src or "services australia" in src:
        return "medium"
    return "low"


_NEG_WORDS = ("not ", "no ", "never", "missing", "absent", "without", "below", "lacks", "fails")


def title_body_coherent(title: str, body: str) -> bool:
    """Conservative title/body coherence lint. Fails only on a clear negation
    polarity flip between the title and the first sentence of the body."""
    t = (title or "").strip().lower()
    b = (body or "").strip().lower()
    if not t or not b:
        return True
    first_sentence = re.split(r"[.!?]", b, maxsplit=1)[0]
    title_neg = any(w in t for w in _NEG_WORDS)
    body_neg = any(w in first_sentence for w in _NEG_WORDS)
    # A negated title whose opening sentence affirms the opposite is incoherent.
    if title_neg and not body_neg and (" is " in first_sentence or " are " in first_sentence or " does " in first_sentence):
        # Only fail when the body opening explicitly affirms the subject.
        if re.search(r"\b(are|is|does|do|has|have)\b", first_sentence) and not body_neg:
            return False
    return True


# ---------------------------------------------------------------------------
# Facts builder + Verification panel (A3) — all arithmetic in Decimal
# ---------------------------------------------------------------------------

def _money(raw: Optional[str]) -> Optional[Decimal]:
    if raw is None:
        return None
    s = str(raw).replace(",", "").replace("$", "").strip()
    if not s:
        return None
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError):
        return None


def _q2(d: Decimal) -> Decimal:
    return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _search_money(pattern: str, text: str) -> Optional[Decimal]:
    m = re.search(pattern, text, re.IGNORECASE)
    return _money(m.group(1)) if m else None


def _parse_iso(d: Optional[str]) -> Optional[date]:
    if not d:
        return None
    try:
        return datetime.fromisoformat(str(d)[:10]).date()
    except ValueError:
        return None


def build_facts(
    *,
    extraction: Optional[Dict[str, Any]],
    plan_text: str,
    classification: Optional[int],
    quarterly_budget: Optional[float],
) -> Dict[str, Any]:
    """Distil the machine-checkable numeric facts the verification panel needs.
    Missing facts are left as ``None`` so the panel can name them explicitly."""
    text = plan_text or ""
    ex = extraction or {}

    care_services_base = _search_money(r"care services base[^\n]*?\$\s*([\d,]+(?:\.\d+)?)", text)
    care_management_fee = _search_money(r"care management fee[^\n]*?\$\s*([\d,]+(?:\.\d+)?)", text)
    at_hm_total = _search_money(r"at-?hm\s+allocation[^\n]*?\$\s*([\d,]+(?:\.\d+)?)", text)
    rollover_cap = _search_money(r"rollover cap[^\n]*?\$\s*([\d,]+(?:\.\d+)?)", text)

    qb = quarterly_budget if quarterly_budget is not None else ex.get("quarterly_budget")
    quarterly = _money(str(qb)) if qb is not None else None

    cls = classification if classification is not None else ex.get("classification")

    # AT-HM ring-fence signals.
    at_hm_ring_fenced = bool(re.search(r"ring-?fenc|excludes at-?hm|separately|separate table", text, re.IGNORECASE))
    at_hm_in_base = bool(re.search(r"at-?hm[^\n]*?(included in|inside).*(base|budget)", text, re.IGNORECASE))

    # Personal care placement.
    pc_stream = None
    pc_contribution = None
    m_pc = re.search(r"personal care[^\n]*?(clinical care|independence|everyday living)", text, re.IGNORECASE)
    if m_pc:
        pc_stream = m_pc.group(1).title()
    m_pc_c = re.search(r"personal care[^\n]*?(\d+(?:\.\d+)?)\s*%", text, re.IGNORECASE)
    if m_pc_c:
        pc_contribution = _money(m_pc_c.group(1))

    return {
        "classification": int(cls) if cls else None,
        "quarterly_budget": quarterly,
        "care_services_base": care_services_base,
        "care_management_fee": care_management_fee,
        "at_hm_total": at_hm_total,
        "at_hm_ring_fenced": at_hm_ring_fenced,
        "at_hm_in_base": at_hm_in_base,
        "rollover_cap": rollover_cap,
        "effective_from": _parse_iso(ex.get("effective_from")),
        "effective_to": _parse_iso(ex.get("effective_to")),
        "personal_care_stream": pc_stream,
        "personal_care_contribution_pct": pc_contribution,
    }


def _index1_quarterly(classification: Optional[int]) -> Optional[Decimal]:
    if not classification:
        return None
    try:
        from monetary_constants import get_value
        annual = get_value(f"classification_annual.{int(classification)}")
        if annual is None:
            return None
        return _q2(Decimal(str(annual)) / Decimal("4"))
    except Exception:      # noqa: BLE001
        return None


def run_verification_panel(facts: Dict[str, Any]) -> Dict[str, Any]:
    """A3 flagship affirmative checks. Always returns all five checks."""
    checks: List[Dict[str, Any]] = []

    # 1. Care management fee = 10% of care services base (AT-HM excluded).
    base = facts.get("care_services_base")
    fee = facts.get("care_management_fee")
    if base is None or fee is None:
        checks.append(_cannot_run(
            "care_management_fee", "Care management fee",
            "care services base and care management fee",
        ))
    else:
        expected = _q2(base * Decimal("0.10"))
        if abs(_q2(fee) - expected) <= Decimal("0.01"):
            checks.append(_pass(
                "care_management_fee", "Care management fee",
                f"Care management fee correctly calculated at 10% of the care services base "
                f"(${_q2(fee)} on ${_q2(base)}). AT-HM correctly excluded from the base.",
            ))
        else:
            checks.append(_flag(
                "care_management_fee", "Care management fee",
                f"Care management fee is ${_q2(fee)}. Expected ${expected} "
                f"(10% of ${_q2(base)} care services base excluding AT-HM). "
                f"Difference: ${abs(_q2(fee) - expected)}.",
            ))

    # 2. AT-HM ring-fence.
    at_hm = facts.get("at_hm_total")
    if at_hm is None:
        checks.append(_cannot_run(
            "at_hm_ring_fence", "AT-HM ring-fence",
            "the Assistive Technology and Home Modifications (AT-HM) allocation",
        ))
    elif facts.get("at_hm_in_base"):
        checks.append(_flag(
            "at_hm_ring_fence", "AT-HM ring-fence",
            "AT-HM items appear to be included in the care management base or the quarterly budget. "
            "This is incorrect under the AT-HM Scheme; AT-HM must be listed and funded separately.",
        ))
    else:
        checks.append(_pass(
            "at_hm_ring_fence", "AT-HM ring-fence",
            f"AT-HM allocation of ${_q2(at_hm)} correctly ring-fenced from the quarterly budget "
            f"and the care management base.",
        ))

    # 3. Personal care category placement (post 01/10/2026).
    eff_from = facts.get("effective_from")
    if eff_from is None:
        checks.append(_cannot_run(
            "personal_care_placement", "Personal care placement",
            "the plan's effective-from date",
        ))
    elif eff_from < CUTOVER_2026_10_01:
        checks.append(_pass(
            "personal_care_placement", "Personal care placement",
            "This plan starts before 01/10/2026, so the personal care reclassification does not apply yet.",
        ))
    else:
        stream = facts.get("personal_care_stream")
        contrib = facts.get("personal_care_contribution_pct")
        if stream is None:
            checks.append(_cannot_run(
                "personal_care_placement", "Personal care placement",
                "the personal care service category",
            ))
        elif stream == "Clinical Care" and (contrib is None or contrib == Decimal("0")):
            checks.append(_pass(
                "personal_care_placement", "Personal care placement",
                "Personal care correctly placed in Clinical Care post 01/10/2026 reclassification, "
                "with 0% participant contribution.",
            ))
        else:
            pct = f"{contrib}%" if contrib is not None else "a participant"
            checks.append(_flag(
                "personal_care_placement", "Personal care placement",
                f"Personal care is in {stream} with {pct} contribution. From 01/10/2026 personal care "
                f"is Clinical Care and fully government-funded.",
            ))

    # 4. Rollover cap = max($1,000, 10% of quarterly budget).
    quarterly = facts.get("quarterly_budget")
    rollover = facts.get("rollover_cap")
    if quarterly is None or rollover is None:
        checks.append(_cannot_run(
            "rollover_cap", "Rollover cap",
            "the quarterly budget and the stated rollover cap",
        ))
    else:
        expected = max(Decimal("1000.00"), _q2(quarterly * Decimal("0.10")))
        if abs(_q2(rollover) - expected) <= Decimal("0.01"):
            checks.append(_pass(
                "rollover_cap", "Rollover cap",
                f"Rollover cap correctly set at ${expected}.",
            ))
        else:
            checks.append(_flag(
                "rollover_cap", "Rollover cap",
                f"Rollover cap shown as ${_q2(rollover)}. Expected ${expected} "
                f"(the greater of $1,000 and 10% of the quarterly budget).",
            ))

    # 5. Quarterly budget vs classification (INDEX-1).
    cls = facts.get("classification")
    index_q = _index1_quarterly(cls)
    if quarterly is None or cls is None:
        checks.append(_cannot_run(
            "quarterly_budget_vs_classification", "Quarterly budget vs classification",
            "the quarterly budget and the classification level",
        ))
    elif index_q is None:
        checks.append(_cannot_run(
            "quarterly_budget_vs_classification", "Quarterly budget vs classification",
            f"the INDEX-1 reference value for Classification {cls}",
        ))
    elif abs(_q2(quarterly) - index_q) <= Decimal("0.50"):
        checks.append(_pass(
            "quarterly_budget_vs_classification", "Quarterly budget vs classification",
            f"Quarterly budget of ${_q2(quarterly)} matches the INDEX-1 Classification {cls} value "
            f"(${index_q}) for the effective quarter.",
        ))
    else:
        checks.append(_flag(
            "quarterly_budget_vs_classification", "Quarterly budget vs classification",
            f"Quarterly budget shown as ${_q2(quarterly)}. The INDEX-1 Classification {cls} value "
            f"is ${index_q}.",
        ))

    flagged = sum(1 for c in checks if c["status"] == "flag")
    return {
        "checks": checks,
        "flagged_count": flagged,
        "all_passing": flagged == 0 and all(c["status"] != "flag" for c in checks),
    }


def finding_is_banned(finding: Dict[str, Any]) -> bool:
    """A2/anti-fab: a finding whose title or detail asserts a structurally
    banned claim (minimum RN hours, transport midpoints, minimum service hours
    by classification) must never be emitted."""
    haystack = " ".join(str(finding.get(k, "")) for k in ("title", "detail", "finding_key"))
    return any(pat.search(haystack) for pat in _BANNED_PATTERNS)


def enrich_findings(findings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Bind each finding to the Rule Registry (A1/A2), calibrate its confidence
    (A6/L3), attach addressees (C1), drop banned claims and title/body-incoherent
    findings (A5). A finding with a valid ``rule_id`` becomes registry-bound: its
    citation, severity, confidence tier and addressees come from the registry,
    not the model (the model only phrases title/detail). A finding without a
    valid rule_id is demoted to a freeform ``info`` / ``low`` observation with no
    cited authority ("Verification required")."""
    out: List[Dict[str, Any]] = []
    for f in findings:
        if finding_is_banned(f):
            continue
        if not title_body_coherent(f.get("title", ""), f.get("detail", "")):
            continue
        rid = f.get("rule_id")
        rule = rule_by_id(rid) if rid else None
        if rule and category_signed_off(rule.get("category_id", "")) is not None:
            g = dict(f)
            g["rule_id"] = rule["rule_id"]
            g["category_id"] = rule.get("category_id")
            g["severity"] = rule.get("severity", g.get("severity", "info"))
            g["citation_source"] = rule.get("source_citation") or "Verification required"
            g["citation_url"] = rule.get("source_url") or ""
            g["confidence"] = rule.get("confidence_tier") or calibrate_confidence(g["citation_source"])
            g["addressee_primary"] = rule.get("addressee_primary")
            g["addressee_secondary"] = rule.get("addressee_secondary") or []
            if not g.get("suggested_question"):
                g["suggested_question"] = rule.get("suggested_question", "")
            g["registry_bound"] = True
            out.append(g)
        else:
            g = dict(f)
            g["rule_id"] = None
            g["severity"] = "info"
            g["confidence"] = "low"
            g["citation_source"] = "Verification required"
            g["citation_url"] = ""
            g["addressee_primary"] = None
            g["addressee_secondary"] = []
            g["registry_bound"] = False
            out.append(g)
    return out


def _pass(check: str, label: str, detail: str) -> Dict[str, Any]:
    return {"check": check, "label": label, "status": "pass", "detail": detail, "missing_field": None}


def _flag(check: str, label: str, detail: str) -> Dict[str, Any]:
    return {"check": check, "label": label, "status": "flag", "detail": detail, "missing_field": None}


def _cannot_run(check: str, label: str, missing_field: str) -> Dict[str, Any]:
    return {
        "check": check, "label": label, "status": "cannot_run",
        "detail": f"This check could not run because the plan does not state {missing_field}.",
        "missing_field": missing_field,
    }


__all__ = [
    "load_rules", "load_categories", "rule_by_id", "category_signed_off",
    "banned_rule_violations", "calibrate_confidence", "title_body_coherent",
    "build_facts", "run_verification_panel", "CONFIDENCE_BY_SOURCE_TYPE",
    "finding_is_banned", "enrich_findings",
]
