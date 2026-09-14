"""CPR-1 · Care Plan Analysis Engine.

This module orchestrates the analysis run. It:

1. Calls the LLM with the CPR-1 prompt (v1) against the plan text.
2. Applies a deterministic post-pass to enforce anti-hallucination rules:
   * Every citation_source must exist in the reference snapshot.
   * Any citation not in the snapshot is replaced with
     "Verification required" and confidence downgraded to low, severity
     downgraded to info.
   * Any finding with a fabricated citation is not silently dropped, it
     is preserved as an info-severity "worth checking" item, mirroring
     the STMT-UI-1 pattern.
3. Runs deterministic checks that do NOT need the LLM (budget maths,
   care management cap, plan age, service-list categorisation). These
   run alongside the LLM's findings and merge deterministically.

The public surface is `analyse_care_plan(...)` which returns a list of
`CarePlanFinding` model instances plus a `CarePlanReviewRun` describing
the run.
"""
from __future__ import annotations

import json as _json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from care_plan_models import (
    CarePlanFinding,
    CarePlanReviewRun,
    StructuredExtraction,
    utcnow_iso,
)
from reference import (
    statement_of_rights,
    quality_standards,
    aged_care_rules_2025,
)
from prompts.care_plan_reviewer import (
    CPR1_SYSTEM_PROMPT,
    PROMPT_VERSION,
    build_user_message,
)


# ---------------------------------------------------------------------------
# Reference snapshot, the union of every citation string emitted by any
# structured reference this build knows about. Any citation not in this set
# is treated as fabricated by the deterministic post-pass.
# ---------------------------------------------------------------------------

def build_citation_allowlist() -> set[str]:
    """Return the set of every citation_source string the analysis engine
    considers valid at review time. Union of Statement of Rights, Quality
    Standards, and Aged Care Rules 2025 sections we ship references for.
    """
    allow: set[str] = set()
    allow.update(statement_of_rights.all_citation_sources())
    allow.update(quality_standards.all_citation_sources())
    allow.update(aged_care_rules_2025.all_citation_sources())
    # Sentinel used by the post-pass when the LLM cannot cite.
    allow.add("Verification required")
    return allow


CITATION_ALLOWLIST = build_citation_allowlist()


# Fuzzy citation matcher, used because the LLM tends to emit slight
# variations of the canonical citation strings (dropped "(Aged Care Act
# 2024)" suffix, different capitalisation of "s." vs "S." etc.). We keep
# the strict allowlist above for anti-fab checks in tests, but at runtime
# we normalise the LLM's citation to a canonical form via key extractors.

import re as _cite_re

_CITE_KEY_PATTERNS = [
    # Statement of Rights, Right 4 / Right 4 (Aged Care Act 2024)
    (_cite_re.compile(r"Statement\s+of\s+Rights.*?Right\s*(\d+)", _cite_re.I),
     lambda m: f"Statement of Rights, Right {int(m.group(1))} (Aged Care Act 2024)"),
    # National Aged Care Quality Standards, Standard 3 / NQS 3
    (_cite_re.compile(r"(?:National\s+Aged\s+Care\s+)?(?:Quality\s+Standards?|NQS).*?Standard\s*(\d+)", _cite_re.I),
     lambda m: f"National Aged Care Quality Standards, Standard {int(m.group(1))}"),
    # Aged Care Rules 2025 s.194-3 / F2025L01173 s.194-5(1)(c)
    (_cite_re.compile(r"(?:Aged\s+Care\s+Rules\s+2025|F2025L01173).*?s\.?\s*(194-\d+(?:\(\d+\)(?:\([a-z]\))?)?)", _cite_re.I),
     lambda m: (
         f"Aged Care Rules 2025 (F2025L01173) s.{m.group(1)}"
         if "(1)(c)" in m.group(1)
         else f"Aged Care Rules 2025 (F2025L01173) s.{m.group(1).split('(')[0]}"
     )),
]


def _url_for_canonical_citation(canonical: str) -> str:
    """Look up the Wayly help-centre URL for a canonical citation string."""
    for r in statement_of_rights.STATEMENT_OF_RIGHTS:
        if r.citation_source == canonical:
            return r.citation_url
    for s in quality_standards.QUALITY_STANDARDS:
        if s.citation_source == canonical:
            return s.citation_url
    for sec in aged_care_rules_2025.AGED_CARE_RULES_2025_CARE_PLAN_SECTIONS:
        if sec.citation_source == canonical:
            return sec.citation_url
    return ""


def _canonicalise_citation(raw: str) -> str | None:
    """Return the canonical citation string if `raw` matches one of the
    known instruments; otherwise None."""
    if not raw:
        return None
    for pat, resolver in _CITE_KEY_PATTERNS:
        m = pat.search(raw)
        if m:
            canonical = resolver(m)
            if canonical in CITATION_ALLOWLIST:
                return canonical
    return None


# ---------------------------------------------------------------------------
# Anti-hallucination post-pass on LLM findings
# ---------------------------------------------------------------------------

def _strip_json(raw: str) -> str:
    """Strip ```json fences and any preamble the model might have added."""
    s = (raw or "").strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    # Find the first { and last } to guard against preamble/postamble.
    lo = s.find("{")
    hi = s.rfind("}")
    if lo >= 0 and hi > lo:
        return s[lo:hi + 1]
    return s


def normalise_finding(raw: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Normalise a single LLM finding dict, applying the anti-hallucination
    guardrails. Returns None if the finding is un-recoverably malformed.
    """
    if not isinstance(raw, dict):
        return None
    category = str(raw.get("category") or "").strip().lower()
    if category not in ("rights", "clinical", "service_mix", "budget",
                       "cohort", "timebound", "choice"):
        return None

    severity = str(raw.get("severity") or "").strip().lower()
    if severity not in ("compliance", "efficiency", "choice", "info"):
        severity = "info"

    confidence = str(raw.get("confidence") or "").strip().lower()
    if confidence not in ("high", "medium", "low"):
        confidence = "low"

    title = str(raw.get("title") or "").strip()
    detail = str(raw.get("detail") or "").strip()
    suggested_question = str(raw.get("suggested_question") or "").strip()
    if not title or not detail:
        return None

    citation_source = str(raw.get("citation_source") or "").strip()
    citation_url = str(raw.get("citation_url") or "").strip()

    # Anti-hallucination: if the citation is not in the allowlist, try
    # to canonicalise it (LLMs often drop the "(Aged Care Act 2024)"
    # suffix or vary spacing). If canonicalisation succeeds, promote it.
    # Only if BOTH the exact match AND the fuzzy match fail do we strip.
    if citation_source and citation_source not in CITATION_ALLOWLIST:
        canonical = _canonicalise_citation(citation_source)
        if canonical:
            citation_source = canonical
            # Back-fill the canonical URL if the LLM's URL was empty
            # or clearly did not match one of our help-centre pages.
            if not citation_url or "/help/" not in citation_url:
                citation_url = _url_for_canonical_citation(canonical)
        else:
            # Extra safety: if the citation looks like an obviously-fabricated
            # section (e.g. "s.999-9"), always replace, never trust.
            citation_source = "Verification required"
            citation_url = ""
            confidence = "low"
            severity = "info"

    # If citation is empty AND confidence is high/medium, downgrade, a
    # finding at high confidence with no citation is a hallucination.
    if not citation_source and confidence in ("high", "medium"):
        citation_source = "Verification required"
        confidence = "low"
        severity = "info"

    # If citation is "Verification required", clamp severity to info per
    # spec §D.2 ("cannot cite → info").
    if citation_source == "Verification required":
        severity = "info"
        confidence = "low"

    finding_key = str(raw.get("finding_key") or "").strip().lower() or (
        f"{category}_" + re.sub(r"[^a-z0-9]+", "_", title.lower())[:40].strip("_")
    )
    related = raw.get("related_tool_slug")
    if isinstance(related, str):
        related = related.strip().lower()
        if related in ("null", "none", ""):
            related = None
    else:
        related = None

    return {
        "category": category,
        "severity": severity,
        "confidence": confidence,
        "finding_key": finding_key,
        "title": title,
        "detail": detail,
        "citation_source": citation_source,
        "citation_url": citation_url,
        "suggested_question": suggested_question,
        "related_tool_slug": related,
        "rule_id": (str(raw.get("rule_id")).strip() or None) if raw.get("rule_id") else None,
    }


def apply_post_pass(llm_json: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Apply anti-hallucination + normalisation to every LLM finding."""
    findings = llm_json.get("findings") if isinstance(llm_json, dict) else None
    if not isinstance(findings, list):
        return []
    normalised: List[Dict[str, Any]] = []
    seen_keys: set[str] = set()
    for f in findings:
        n = normalise_finding(f)
        if n is None:
            continue
        # De-dupe on finding_key to prevent double-emissions.
        if n["finding_key"] in seen_keys:
            continue
        seen_keys.add(n["finding_key"])
        normalised.append(n)
    return normalised


# ---------------------------------------------------------------------------
# Deterministic checks (run alongside the LLM, don't depend on it)
# ---------------------------------------------------------------------------

_CARE_MGMT_CAP_PCT = 10.0  # per spec §D.1.4 and BUD-1


def deterministic_budget_checks(
    extraction: StructuredExtraction | None,
    plan_text: str,
    classification: int | None = None,
    quarterly_budget: float | None = None,
) -> List[Dict[str, Any]]:
    """Deterministic budget checks that don't need the LLM.

    Currently covers:
    - Care management fee > 10% cap (RULE_1_CARE_MGMT_CAP mirror).
    - Plan age > 12 months (RULE_17_CARE_PLAN_REVIEW_DUE mirror).
    """
    out: List[Dict[str, Any]] = []
    text = (plan_text or "").lower()

    # ------------------------------------------------------------------
    # Care management > 10% detection via regex on plan text.
    # ------------------------------------------------------------------
    cm_pct = None
    m = re.search(r"care[\s\-]*management[^%\n]{0,60}?(\d{1,3}(?:\.\d+)?)\s*%", text)
    if m:
        try:
            cm_pct = float(m.group(1))
        except ValueError:
            cm_pct = None
    if cm_pct is not None and cm_pct > _CARE_MGMT_CAP_PCT + 0.001:
        out.append({
            "category": "budget",
            "severity": "compliance",
            "confidence": "high",
            "finding_key": "budget_care_mgmt_cap_exceeded",
            "title": "Care Management Fee Above 10% Cap",
            "rule_id": "CPR-R-0001",
            "detail": (
                f"The plan states a care management fee of {cm_pct:.1f}%. "
                "The Support at Home cap is 10%. Ask the provider to explain "
                "the difference and reconcile."
            ),
            "citation_source": "Aged Care Rules 2025 (F2025L01173) s.194-3",
            "citation_url": "/help/aged-care-rules-2025#s194-3",
            "suggested_question": (
                f"The plan lists a care management fee of {cm_pct:.1f}% but "
                "the Support at Home cap is 10%. Can you walk me through "
                "the difference?"
            ),
            "related_tool_slug": None,
        })

    # ------------------------------------------------------------------
    # Plan age > 12 months (compare effective_from to today).
    # ------------------------------------------------------------------
    if extraction and extraction.effective_from:
        try:
            eff = datetime.fromisoformat(extraction.effective_from).replace(
                tzinfo=timezone.utc,
            )
            now = datetime.now(timezone.utc)
            months_old = (now - eff).days / 30.44
            if months_old > 12.0:
                out.append({
                    "category": "timebound",
                    "severity": "efficiency",
                    "confidence": "high",
                    "finding_key": "timebound_plan_age_over_12mo",
                    "title": "Care Plan Older Than 12 Months",
                    "rule_id": "CPR-R-0201",
                    "detail": (
                        f"This plan came into effect on {extraction.effective_from}, "
                        f"which is about {months_old:.1f} months ago. Plans should be "
                        "reviewed at least every 12 months to keep pace with changing "
                        "needs."
                    ),
                    "citation_source": "Aged Care Rules 2025 (F2025L01173) s.194-3",
                    "citation_url": "/help/aged-care-rules-2025#s194-3",
                    "suggested_question": (
                        "The current plan is over 12 months old. Can we book a "
                        "review to make sure the services still match the needs?"
                    ),
                    "related_tool_slug": "reassessment-letter-generator",
                })
        except ValueError:
            pass

    # ------------------------------------------------------------------
    # 1 October 2026 personal-care straddle warning.
    # ------------------------------------------------------------------
    if extraction and extraction.effective_from and extraction.effective_to:
        try:
            eff_from = datetime.fromisoformat(extraction.effective_from).date()
            eff_to = datetime.fromisoformat(extraction.effective_to).date()
            cutover = datetime(2026, 10, 1).date()
            if eff_from < cutover <= eff_to:
                out.append({
                    "category": "timebound",
                    "severity": "info",
                    "confidence": "high",
                    "finding_key": "timebound_straddles_oct_2026",
                    "title": "Plan Spans 1 October 2026 Change",
                    "rule_id": "CPR-R-0103",
                    "detail": (
                        "The personal-care funding change lands on 01/10/2026. "
                        "The plan spans that date, so re-run the review after "
                        "01/10/2026 to check nothing moves."
                    ),
                    "citation_source": "Aged Care Rules 2025 (F2025L01173) s.194-3",
                    "citation_url": "/help/aged-care-rules-2025#s194-3",
                    "suggested_question": (
                        "The rules change on 01/10/2026. Will the plan need "
                        "adjusting after that date?"
                    ),
                    "related_tool_slug": None,
                })
        except ValueError:
            pass

    return out


def merge_findings(
    llm_findings: List[Dict[str, Any]],
    deterministic_findings: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """De-dupe by finding_key, deterministic wins on collision."""
    by_key: Dict[str, Dict[str, Any]] = {}
    for f in llm_findings:
        by_key[f["finding_key"]] = f
    for f in deterministic_findings:
        by_key[f["finding_key"]] = f      # override

    # Sort per spec §D.4: compliance, choice, efficiency, info.
    sev_order = {"compliance": 0, "choice": 1, "efficiency": 2, "info": 3}
    return sorted(
        by_key.values(),
        key=lambda f: (sev_order.get(f["severity"], 99), f["category"], f["title"]),
    )


# ---------------------------------------------------------------------------
# Public entry point, returns raw dicts. Persistence layer wraps them in
# CarePlanFinding model instances and writes to Mongo.
# ---------------------------------------------------------------------------

async def analyse_care_plan(
    plan_text: str,
    *,
    extraction: StructuredExtraction | None = None,
    classification: int | None = None,
    quarterly_budget: float | None = None,
    reference_snapshot_id: str = "static-v1-2026-07-01",
    llm_client=None,
    model: str = "claude-sonnet-4-5-20250929",
    cross_tool_signal_summary: str = "",
) -> Dict[str, Any]:
    """Run the full CPR-1 analysis pipeline.

    Returns:
        {
          "findings":   [ ... normalised finding dicts ... ],
          "review_run": { model_used, prompt_version, reference_snapshot_id,
                          status, ... },
          "raw_llm":    "<raw LLM response for debugging>",
        }

    `llm_client` is a callable that accepts (system, user_text, session_id)
    and returns the raw LLM string. Kept as a parameter so tests can inject
    a deterministic stub.

    `cross_tool_signal_summary` is a pre-computed 5-10 line summary of
    Statement Decoder / Budget Calc / Price Checker signals for this
    participant (see services/care_plan_cross_tool_signal.py). The LLM
    can weave it into findings but MUST NOT fabricate one if it is empty.
    """
    review_run_start = utcnow_iso()

    # ------------------------------------------------------------------
    # LLM call
    # ------------------------------------------------------------------
    user_msg = build_user_message(
        plan_text,
        classification=classification,
        quarterly_budget=quarterly_budget,
        reference_snapshot_id=reference_snapshot_id,
        cross_tool_signal_summary=cross_tool_signal_summary,
    )

    raw = ""
    llm_findings: List[Dict[str, Any]] = []
    llm_error: Optional[str] = None

    if llm_client is not None:
        try:
            raw = await _maybe_await(llm_client(
                CPR1_SYSTEM_PROMPT,
                user_msg,
                f"cpr1-review-{datetime.now(timezone.utc).timestamp()}",
            ))
            parsed = _json.loads(_strip_json(raw))
            llm_findings = apply_post_pass(parsed)
        except Exception as e:  # noqa: BLE001
            llm_error = f"LLM call failed: {e}"

    # ------------------------------------------------------------------
    # Deterministic checks
    # ------------------------------------------------------------------
    det_findings = deterministic_budget_checks(
        extraction, plan_text, classification, quarterly_budget,
    )

    # ------------------------------------------------------------------
    # Merge + return
    # ------------------------------------------------------------------
    findings = merge_findings(llm_findings, det_findings)

    # CPR-FINDINGS-UX-1 v2 · Workstream A: bind findings to the Rule Registry
    # (citation/severity/confidence/addressees from the registry, not the
    # model), drop banned claims + title-body-incoherent findings, and compute
    # the deterministic flagship Verification panel (A3).
    verification_panel: Dict[str, Any] = {}
    try:
        from lib import cpr_rules
        findings = cpr_rules.enrich_findings(findings)
        facts = cpr_rules.build_facts(
            extraction=extraction.model_dump() if extraction else None,
            plan_text=plan_text,
            classification=classification,
            quarterly_budget=quarterly_budget,
        )
        verification_panel = cpr_rules.run_verification_panel(facts)
    except Exception:      # noqa: BLE001 — never block a review on the panel
        verification_panel = {}

    return {
        "findings": findings,
        "verification_panel": verification_panel,
        "review_run": {
            "model_used": model,
            "prompt_version": PROMPT_VERSION,
            "reference_snapshot_id": reference_snapshot_id,
            "status": "failed" if llm_error else "complete",
            "failure_reason": llm_error,
            "triggered_at": review_run_start,
            "completed_at": utcnow_iso(),
        },
        "raw_llm": raw,
    }


async def _maybe_await(x):
    """Small helper: return x directly if it's not a coroutine, else await."""
    import inspect
    if inspect.isawaitable(x):
        return await x
    return x


__all__ = [
    "analyse_care_plan",
    "apply_post_pass",
    "normalise_finding",
    "deterministic_budget_checks",
    "merge_findings",
    "build_citation_allowlist",
    "CITATION_ALLOWLIST",
]
