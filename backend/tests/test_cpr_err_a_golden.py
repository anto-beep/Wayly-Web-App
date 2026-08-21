"""CPR-ERR-A-golden-v1 · Workstream A7 CI regression fixture.

Asserts the CPR-1 findings engine against the Robert Henderson Q1 2027 plan:

* Anti-fabrication: NO finding references "minimum registered nurse hours"
  or an "s.194-5(1)(c) minimum" (the live-production hallucination from 21/08).
* The flagship Verification panel is emitted with all 5 checks passing.
* The goal-service gap finding (social support group vs men's shed / bowls)
  and the laundry-not-scheduled finding ARE emitted.
* Header extraction populates Provider and Effective dates.
* No finding title contradicts its own body.
* No banned rule exists in the Rule Registry.
* Every emitted finding carries a rule_id and an addressee_primary.

CI fails the build on any assertion failure.

Run: cd /app/backend && python -m pytest tests/test_cpr_err_a_golden.py -q
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from services.care_plan_analysis import analyse_care_plan
from services.care_plan_ingestion import structure_plan_text
from lib import cpr_rules

FIXTURE = Path("/app/tests/fixtures/CPR-ERR-A-golden-v1/robert_henderson_q1_2027.txt")


def _load_plan_text() -> str:
    return FIXTURE.read_text(encoding="utf-8")


async def _stub_llm(system: str, user_text: str, session_id: str) -> str:
    """Deterministic stub standing in for Claude. Returns three findings the
    real model would plausibly emit: a legitimate goal-service gap, a
    legitimate laundry gap, and a FABRICATED registered-nurse-minimum finding
    (the exact 21/08 hallucination) that the engine must suppress."""
    return json.dumps({
        "findings": [
            {
                "category": "choice",
                "severity": "choice",
                "confidence": "high",
                "rule_id": "CPR-R-0502",
                "title": "Social support group does not match the men's shed and bowls goal",
                "detail": "Goal 4 names the men's shed and lawn bowls, but the plan books a generic 'social support group'. The service could be tailored to those specific activities.",
                "citation_source": "Statement of Rights, Right 4 (Aged Care Act 2024)",
                "citation_url": "/help/statement-of-rights#right-4",
                "suggested_question": "Can the social support be the men's shed and lawn bowls specifically?",
            },
            {
                "category": "service_mix",
                "severity": "compliance",
                "confidence": "high",
                "rule_id": "CPR-R-0506",
                "title": "Laundry assistance is assessed but not scheduled",
                "detail": "The assessment notes weekly laundry help is required, but no laundry or domestic service is scheduled in the plan.",
                "citation_source": "Aged Care Rules 2025 (F2025L01173) s.194-3",
                "citation_url": "/help/aged-care-rules-2025#s194-3",
                "suggested_question": "Can weekly laundry assistance be added to the plan?",
            },
            {
                # FABRICATED — must be suppressed by the banned-content guard.
                "category": "clinical",
                "severity": "compliance",
                "confidence": "high",
                "title": "Registered Nurse Hours Below Classification 5 Minimum",
                "detail": "The plan provides fewer registered nurse hours than the minimum registered nurse hours required for Classification 5.",
                "citation_source": "Aged Care Rules 2025 (F2025L01173) s.194-5(1)(c)",
                "citation_url": "/help/aged-care-rules-2025#s194-5",
                "suggested_question": "Why are the RN hours below the classification 5 minimum?",
            },
        ]
    })


def _run():
    plan_text = _load_plan_text()
    extraction = structure_plan_text(plan_text, "golden-cpr-err-a")
    result = asyncio.new_event_loop().run_until_complete(
        analyse_care_plan(
            plan_text,
            extraction=extraction,
            classification=5,
            quarterly_budget=9924.25,
            llm_client=_stub_llm,
        )
    )
    return extraction, result


def test_no_fabricated_rn_minimum():
    _extraction, result = _run()
    for f in result["findings"]:
        blob = f"{f.get('title','')} {f.get('detail','')}".lower()
        assert "minimum registered nurse hours" not in blob
        assert "registered nurse hours below" not in blob
        assert "194-5(1)(c) minimum" not in blob


def test_verification_panel_all_pass():
    _extraction, result = _run()
    panel = result.get("verification_panel") or {}
    checks = panel.get("checks") or []
    assert len(checks) == 5, f"expected 5 flagship checks, got {len(checks)}"
    statuses = {c["check"]: c["status"] for c in checks}
    for name, status in statuses.items():
        assert status == "pass", f"{name} was {status}, expected pass: {statuses}"
    assert panel.get("flagged_count") == 0


def test_goal_service_gap_and_laundry_emitted():
    _extraction, result = _run()
    titles = " ".join(f.get("title", "").lower() for f in result["findings"])
    assert "social support" in titles or "men's shed" in titles or "bowls" in titles
    assert "laundry" in titles


def test_header_extraction():
    extraction, _result = _run()
    assert extraction.provider_name == "Capital Aged Care Services Pty Ltd"
    assert extraction.effective_from == "2027-01-01"
    assert extraction.effective_to == "2027-03-31"


def test_every_finding_has_rule_id_and_addressee():
    _extraction, result = _run()
    assert result["findings"], "expected at least one finding"
    for f in result["findings"]:
        assert f.get("rule_id"), f"finding missing rule_id: {f.get('title')}"
        assert f.get("addressee_primary"), f"finding missing addressee_primary: {f.get('title')}"


def test_no_title_body_contradiction():
    _extraction, result = _run()
    for f in result["findings"]:
        assert cpr_rules.title_body_coherent(f.get("title", ""), f.get("detail", ""))


def test_registry_has_no_banned_rules():
    assert cpr_rules.banned_rule_violations() == []


def test_registry_seeded_min_30_rules_across_6_categories():
    rules = cpr_rules.load_rules()
    assert len(rules) >= 30, f"expected >= 30 seeded rules, got {len(rules)}"
    cats = {r.get("category_id") for r in rules}
    assert len(cats) >= 6, f"expected rules across >= 6 categories, got {cats}"
    # Category sign-off received (20/06/2026); registry-bound citations now flow.
    for c in cpr_rules.load_categories().values():
        assert c.get("solicitor_signed_off") is True
