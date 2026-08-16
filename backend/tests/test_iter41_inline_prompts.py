"""Iter 41 — Tests for inline Tier-3 progressive-disclosure prompts routing.

Verifies that GET /api/participants/{pid}/profile-prompts emits prompts with
the expected `where` slugs for the 4 AI tools:
  - budget_calculator (applicable_supplements empty)
  - contribution_estimator (pension in part_pension/cshc + null rates)
  - reassessment_letter (mac_reference_number / care_manager_name / full_address null)
  - statement_decoder (care_manager_name null)

Also verifies the deep-link onboarding PATCH flow does NOT create duplicates.
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent.parent / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
EMAIL = "cathy@example.com"
PWD = "testpass123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login", json={"email": EMAIL, "password": PWD})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    if tok:
        s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def part_pension_pid(session):
    """Make a fresh part_pension participant with NULL rates, NULL care manager,
    NULL full_address, NULL mac_ref, EMPTY supplements — so every slug fires."""
    payload = {
        "first_name": "TESTIter41",
        "last_name": "TESTPrompts",
        "dob": "1948-04-04",
        "classification_level": 4,
        "pension_status": "part_pension",
        "provider_name": "TEST Provider",
        "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    r = session.post(f"{BASE}/api/participants", json=payload)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    # Ensure all the Tier3 fields that drive prompts are NULL / empty.
    session.patch(f"{BASE}/api/participants/{pid}", json={
        "applicable_supplements": [],
        "part_pension_actual_independence_pct": None,
        "part_pension_actual_everyday_pct": None,
        "care_manager_name": None,
        "full_address": None,
        "mac_reference_number": None,
    })
    yield pid


def _wheres(prompts):
    return [p["where"] for p in prompts]


def test_prompts_emit_budget_calculator_slug(session, part_pension_pid):
    r = session.get(f"{BASE}/api/participants/{part_pension_pid}/profile-prompts")
    assert r.status_code == 200
    prompts = r.json()["prompts"]
    bc = [p for p in prompts if p["where"] == "budget_calculator"]
    assert bc, f"expected budget_calculator slug, got wheres={_wheres(prompts)}"
    assert bc[0]["field"] == "applicable_supplements"


def test_prompts_emit_contribution_estimator_slugs(session, part_pension_pid):
    r = session.get(f"{BASE}/api/participants/{part_pension_pid}/profile-prompts")
    assert r.status_code == 200
    prompts = r.json()["prompts"]
    ce = [p for p in prompts if p["where"] == "contribution_estimator"]
    fields = {p["field"] for p in ce}
    assert "part_pension_actual_independence_pct" in fields
    assert "part_pension_actual_everyday_pct" in fields


def test_prompts_emit_reassessment_letter_slugs(session, part_pension_pid):
    r = session.get(f"{BASE}/api/participants/{part_pension_pid}/profile-prompts")
    prompts = r.json()["prompts"]
    rl = [p for p in prompts if p["where"] == "reassessment_letter"]
    fields = {p["field"] for p in rl}
    # Three fields drive this slug
    assert "care_manager_name" in fields
    assert "full_address" in fields
    assert "mac_reference_number" in fields


def test_prompts_emit_statement_decoder_slug(session, part_pension_pid):
    """Iter 41 added care_manager_name → statement_decoder mapping."""
    r = session.get(f"{BASE}/api/participants/{part_pension_pid}/profile-prompts")
    prompts = r.json()["prompts"]
    sd = [p for p in prompts if p["where"] == "statement_decoder"]
    assert sd, f"expected statement_decoder slug, got wheres={_wheres(prompts)}"
    assert sd[0]["field"] == "care_manager_name"


def test_prompts_disappear_after_patch(session, part_pension_pid):
    """Saving care_manager_name should remove BOTH statement_decoder and the
    reassessment_letter care_manager_name prompts."""
    session.patch(f"{BASE}/api/participants/{part_pension_pid}",
                  json={"care_manager_name": "Jane Care Manager"})
    r = session.get(f"{BASE}/api/participants/{part_pension_pid}/profile-prompts")
    prompts = r.json()["prompts"]
    sd = [p for p in prompts if p["where"] == "statement_decoder"]
    assert not sd, f"statement_decoder prompt should be gone, got {sd}"
    cm = [p for p in prompts if p["field"] == "care_manager_name"]
    assert not cm, f"all care_manager_name prompts should be gone, got {cm}"


def test_prompts_full_profile_returns_empty(session):
    """A 100%-complete profile should return no prompts (panel hides itself)."""
    payload = {
        "first_name": "TESTFull",
        "last_name": "TESTComplete",
        "dob": "1948-04-04",
        "classification_level": 4,
        "pension_status": "full_pension",  # no contribution prompts
        "provider_name": "TEST Provider",
        "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    pid = session.post(f"{BASE}/api/participants", json=payload).json()["id"]
    session.patch(f"{BASE}/api/participants/{pid}", json={
        "preferred_name": "Mum", "mac_reference_number": "AC-Z",
        "suburb": "Manly", "state": "NSW", "is_grandfathered_hcp": "no",
        "caregiver_relationship": "daughter", "caregiver_phone": "+61400",
        "care_manager_name": "Jane", "full_address": "12 Pine St",
        "applicable_supplements": ["oxygen"],
    })
    r = session.get(f"{BASE}/api/participants/{pid}/profile-prompts")
    assert r.status_code == 200
    assert r.json()["prompts"] == []


def test_patch_does_not_create_duplicate_participant(session, part_pension_pid):
    """Iter 41 deep-link onboarding PATCHes existing participant — never creates new."""
    before = len(session.get(f"{BASE}/api/participants").json()["items"])
    # Simulate the deep-link wizard's Step 2 PATCH
    r = session.patch(f"{BASE}/api/participants/{part_pension_pid}",
                      json={"authorisation_confirmed": True,
                            "preferred_name": "Updated"})
    assert r.status_code == 200
    after = len(session.get(f"{BASE}/api/participants").json()["items"])
    assert before == after, f"participant count changed from {before} → {after}"
