"""Iter318 · Letters & Follow-ups overhaul backend test.
Validates POST /api/care-plans/letter-from-finding routes source findings to
the correct LF-1 letter type and phrasing, participant full-name, and dispute
type. Also verifies DELETE /api/lf1/correspondence/{id} works.
"""
import os
import pytest
import requests

BASE = os.environ.get("TEST_BASE_URL") or os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
TIMEOUT = int(os.environ.get("TEST_TIMEOUT", "90"))


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": "cathy@example.com", "password": "testpass123"},
                      timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def dorothy_id(headers):
    r = requests.get(f"{BASE}/api/participants", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    parts = r.json().get("participants") or r.json().get("items") or []
    for p in parts:
        name = (p.get("display_name") or p.get("name")
                or f"{p.get('first_name','')} {p.get('last_name','')}".strip())
        if "Dorothy" in name:
            return p["id"]
    pytest.skip("Dorothy participant not found")


def _get_correspondence(headers, entry_id):
    r = requests.get(f"{BASE}/api/lf1/correspondence/{entry_id}", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    return r.json().get("entry") or r.json()


def test_statement_decoder_maps_to_dispute(headers, dorothy_id):
    body = {
        "participant_id": dorothy_id,
        "source_tool": "statement-decoder",
        "addressee": "provider",
        "provider_name": "BlueBerry Care",
        "finding": {
            "title": "Cancellation charged despite cancellation",
            "detail": "$76.50 charged for a cancelled visit",
            "suggested_question": "Please refund the $76.50 cancellation charge",
        },
    }
    r = requests.post(f"{BASE}/api/care-plans/letter-from-finding",
                      headers=headers, json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    data = r.json()
    entry_id = data.get("entry_id")
    assert entry_id
    assert "/tools/letters-and-follow-ups/" in (data.get("editor_path") or "")

    entry = _get_correspondence(headers, entry_id)
    assert entry.get("archetype") == "dispute", f"expected dispute, got {entry.get('archetype')}"
    assert entry.get("situation_id") == 3, f"expected situation 3, got {entry.get('situation_id')}"
    intake = entry.get("intake") or {}
    assert intake.get("participant_name") == "Dorothy Smith", intake.get("participant_name")
    assert intake.get("dispute_type") == "charge_disputed", intake.get("dispute_type")
    summary = intake.get("disputed_charge_summary") or ""
    assert "Support at Home statement" in summary, summary
    assert "review of the support plan" not in summary, summary

    # Cleanup
    requests.delete(f"{BASE}/api/lf1/correspondence/{entry_id}", headers=headers, timeout=TIMEOUT)


def test_care_plan_reviewer_maps_to_request(headers, dorothy_id):
    body = {
        "participant_id": dorothy_id,
        "source_tool": "care-plan-reviewer",
        "addressee": "provider",
        "provider_name": "BlueBerry Care",
        "finding": {
            "title": "Missing shower assistance",
            "detail": "Assessed as needing daily shower but plan lists 3x weekly",
            "suggested_question": "Please review the shower assistance schedule",
        },
    }
    r = requests.post(f"{BASE}/api/care-plans/letter-from-finding",
                      headers=headers, json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    entry_id = r.json().get("entry_id")
    assert entry_id
    entry = _get_correspondence(headers, entry_id)
    assert entry.get("archetype") == "request", entry.get("archetype")
    assert entry.get("situation_id") == 6, entry.get("situation_id")
    intake = entry.get("intake") or {}
    assert intake.get("participant_name") == "Dorothy Smith"
    summary = intake.get("change_summary") or ""
    assert "support plan" in summary.lower(), summary

    # Cleanup + verify delete
    d = requests.delete(f"{BASE}/api/lf1/correspondence/{entry_id}",
                        headers=headers, timeout=TIMEOUT)
    assert d.status_code in (200, 204)
    g = requests.get(f"{BASE}/api/lf1/correspondence/{entry_id}",
                     headers=headers, timeout=TIMEOUT)
    assert g.status_code == 404


def test_regulator_addressee_overrides_source_tool(headers, dorothy_id):
    """When addressee is a regulator (acqsc/opan/etc), letter type follows
    addressee mapping, not source_tool."""
    body = {
        "participant_id": dorothy_id,
        "source_tool": "statement-decoder",
        "addressee": "acqsc",
        "finding": {"title": "Poor quality", "detail": "Concerns raised repeatedly."},
    }
    r = requests.post(f"{BASE}/api/care-plans/letter-from-finding",
                      headers=headers, json=body, timeout=TIMEOUT)
    assert r.status_code == 200, r.text
    entry_id = r.json().get("entry_id")
    entry = _get_correspondence(headers, entry_id)
    assert entry.get("situation_id") == 10, entry.get("situation_id")
    requests.delete(f"{BASE}/api/lf1/correspondence/{entry_id}",
                    headers=headers, timeout=TIMEOUT)


def test_situations_and_list_endpoints(headers):
    r = requests.get(f"{BASE}/api/lf1/situations", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200
    sits = r.json().get("situations") or []
    assert len(sits) >= 10
    r = requests.get(f"{BASE}/api/lf1/correspondence", headers=headers, timeout=TIMEOUT)
    assert r.status_code == 200
    assert "entries" in r.json()
