"""Regression: the Reassessment Letter Generator now supports three
letter types — classification_reassessment (default, unchanged),
rcp_assessment, and care_plan_amendment.
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


def _post(token: str, body: dict) -> requests.Response:
    return requests.post(
        f"{_api_url()}/api/public/reassessment-letter",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=120,
    )


def _check_rate_limit(r: requests.Response):
    if r.status_code == 429:
        pytest.skip(f"rate-limited: {r.text}")


# ---------------------------------------------------------------------------
# (1) rcp_assessment letter mentions Restorative Care Pathway
# ---------------------------------------------------------------------------
def test_rcp_assessment_letter_uses_rcp_phrasing(cathy_token):
    r = _post(cathy_token, {
        "participant_name": "Robert Okafor",
        "current_classification": 4,
        "changes_summary": "Following a recent hospital stay, Robert is now unsteady when transferring "
                           "from bed to chair and needs supervision with the shower.",
        "recent_events": "Discharged after a week of rehab. Two falls in the previous month.",
        "sender_name": "Catherine Okafor",
        "relationship": "daughter and primary caregiver",
        "letter_type": "rcp_assessment",
        "hospital_name": "Royal Melbourne Hospital",
        "discharge_date": "2026-02-10",
    })
    _check_rate_limit(r)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["letter_type"] == "rcp_assessment"
    letter = body["letter"]
    assert "Restorative Care Pathway" in letter, letter
    # Should reference the hospital + discharge date.
    assert "Royal Melbourne Hospital" in letter or "hospital" in letter.lower(), letter
    # Must clarify RCP funding is separate from the quarterly budget.
    lower = letter.lower()
    assert "separate" in lower or "does not reduce" in lower or "not deducted" in lower, letter


# ---------------------------------------------------------------------------
# (2) care_plan_amendment letter references the care plan
# ---------------------------------------------------------------------------
def test_care_plan_amendment_references_care_plan(cathy_token):
    r = _post(cathy_token, {
        "participant_name": "Dorothy Chen",
        "current_classification": 5,
        "changes_summary": "Personal-care hours should increase from 3 to 5 per week, and weekend "
                           "social-support transport needs to be added.",
        "sender_name": "Mei Chen",
        "relationship": "daughter",
        "letter_type": "care_plan_amendment",
    })
    _check_rate_limit(r)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["letter_type"] == "care_plan_amendment"
    assert "care plan" in body["letter"].lower(), body["letter"]


# ---------------------------------------------------------------------------
# (3) Invalid letter_type rejected with 422
# ---------------------------------------------------------------------------
def test_invalid_letter_type_returns_422(cathy_token):
    r = _post(cathy_token, {
        "participant_name": "Test Person",
        "current_classification": 4,
        "changes_summary": "Some functional changes affecting daily activities.",
        "sender_name": "Pytest",
        "letter_type": "bogus_type",
    })
    _check_rate_limit(r)
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# (4) Default behaviour without letter_type unchanged
# ---------------------------------------------------------------------------
def test_default_letter_type_is_classification_reassessment(cathy_token):
    r = _post(cathy_token, {
        "participant_name": f"Test Person {uuid.uuid4().hex[:6]}",
        "current_classification": 4,
        "changes_summary": "Functional decline over the last three months — slower transfers, "
                           "increased prompting needed for showering and dressing.",
        "sender_name": "Pytest",
    })
    _check_rate_limit(r)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["letter_type"] == "classification_reassessment"
    assert body["word_count"] >= 100, body
