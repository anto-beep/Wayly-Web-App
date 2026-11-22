"""Regression: Care Plan Reviewer six structured checks.

The two numeric checks (budget_fit + care_management_cap) have a
deterministic Python post-pass that overwrites the LLM's verdict when the
optional context inputs are supplied. The other four checks remain
LLM-graded; we only assert their presence + canonical key + valid status,
not the specific verdict the model returns.
"""
from __future__ import annotations
import os
import sys
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
load_dotenv("/app/backend/.env")


def _api_url() -> str:
    env_path = "/app/frontend/.env"
    if not os.path.exists(env_path):
        pytest.skip("frontend/.env missing")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    pytest.skip("REACT_APP_BACKEND_URL not configured")
    return ""


@pytest.fixture(scope="module")
def cathy_token() -> str:
    url = _api_url()
    r = requests.post(
        f"{url}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"login unavailable ({r.status_code})")
    tok = r.json().get("token")
    if not tok:
        pytest.skip("login did not return a token")
    return tok


PLAN_TEMPLATE = """
SUPPORT AT HOME CARE PLAN — Test fixture {uid}

PARTICIPANT GOALS
- Stay in the family home safely
- Maintain mobility and independence
- Continue weekly bridge club outings

SERVICES
- Personal care, $80 per hour, 5 hours per week
- Domestic assistance, $75 per hour, 2 hours per week
- Community transport, $35 per hour, 2 hours per week
- Occupational therapy review, $160 per visit, monthly

CARE MANAGEMENT
- {cm_label}

REVIEW DATE
- Next review: 2027-04-15
"""


def _post_review(token: str, *, classification: int | None,
                 quarterly_budget: float | None, cm_pct: float,
                 services_dollars: int) -> dict:
    cm_label = f"Care management fee: {cm_pct:.1f}% of monthly services"
    plan = PLAN_TEMPLATE.format(uid=uuid.uuid4(), cm_label=cm_label)
    # Pad the cost up when we want to force a budget_fit flag — append extra
    # high-cost lines.
    if services_dollars >= 1:
        extras = []
        for i in range(services_dollars):
            extras.append(f"- Specialist therapy block {i+1}, $250 per week, weekly")
        plan += "\nADDITIONAL SERVICES\n" + "\n".join(extras)
    payload: dict = {"text": plan}
    if classification is not None:
        payload["classification"] = classification
    if quarterly_budget is not None:
        payload["quarterly_budget"] = quarterly_budget
    r = requests.post(
        f"{_api_url()}/api/public/care-plan-review",
        headers={"Authorization": f"Bearer {token}"},
        json=payload,
        timeout=120,
    )
    if r.status_code == 429:
        pytest.skip(f"rate-limited: {r.text}")
    assert r.status_code == 200, r.text
    return r.json()


def _check_by_key(out: dict, key: str) -> dict:
    matches = [c for c in (out.get("checks") or []) if c.get("check") == key]
    assert len(matches) == 1, (
        f"Expected exactly one check with key {key!r}, got: {out.get('checks')}"
    )
    return matches[0]


# ---------------------------------------------------------------------------
# (1) care_management_cap deterministic flag
# ---------------------------------------------------------------------------
def test_care_management_above_cap_is_flagged(cathy_token):
    out = _post_review(
        cathy_token, classification=4, quarterly_budget=7424.0,
        cm_pct=12.0, services_dollars=0,
    )
    cm = _check_by_key(out, "care_management_cap")
    assert cm["status"] == "flag", out["checks"]
    assert "12" in (cm["note"] or ""), cm
    assert "10%" in (cm["note"] or ""), cm


def test_care_management_within_cap_is_pass(cathy_token):
    out = _post_review(
        cathy_token, classification=4, quarterly_budget=7424.0,
        cm_pct=8.0, services_dollars=0,
    )
    cm = _check_by_key(out, "care_management_cap")
    assert cm["status"] == "pass", out["checks"]


# ---------------------------------------------------------------------------
# (2) budget_fit deterministic flag when estimated quarterly exceeds 90% of
#     the supplied quarterly budget.
# ---------------------------------------------------------------------------
def test_budget_fit_flagged_when_services_exceed_90pct(cathy_token):
    # Quarterly budget 4000 → usable 3600. Plan above easily clears 3600.
    out = _post_review(
        cathy_token, classification=2, quarterly_budget=4000.0,
        cm_pct=8.0, services_dollars=4,
    )
    bf = _check_by_key(out, "budget_fit")
    assert bf["status"] == "flag", out["checks"]
    assert "exceeds" in (bf["note"] or "").lower(), bf


# ---------------------------------------------------------------------------
# (3) Omitting quarterly_budget leaves budget_fit + care_management_cap at
#     the LLM-graded value — at minimum the keys exist and have a valid status.
# ---------------------------------------------------------------------------
def test_missing_context_leaves_checks_unknown_or_llm_graded(cathy_token):
    out = _post_review(
        cathy_token, classification=None, quarterly_budget=None,
        cm_pct=8.0, services_dollars=0,
    )
    for key in (
        "budget_fit", "care_management_cap", "service_list",
        "stream_alignment", "review_date", "goals_alignment",
    ):
        c = _check_by_key(out, key)
        assert c["status"] in ("pass", "flag", "unknown"), c
    # budget_fit must NOT be a deterministic verdict when no quarterly_budget
    # was given — without numbers the code refuses to overwrite the LLM.
    # The LLM may have produced any of the three statuses; we don't assert
    # which, only that the field is still well-formed.


# ---------------------------------------------------------------------------
# (4) All six canonical check keys are always present
# ---------------------------------------------------------------------------
def test_all_six_checks_present(cathy_token):
    out = _post_review(
        cathy_token, classification=4, quarterly_budget=7424.0,
        cm_pct=8.0, services_dollars=0,
    )
    keys = [c["check"] for c in (out.get("checks") or [])]
    assert keys == [
        "budget_fit", "care_management_cap", "service_list",
        "stream_alignment", "review_date", "goals_alignment",
    ], keys
