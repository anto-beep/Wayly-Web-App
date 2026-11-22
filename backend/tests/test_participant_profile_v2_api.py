"""Integration tests for the participant profile v2 API endpoints.

Hits the live backend via REACT_APP_BACKEND_URL using cathy@example.com.
Covers POST /participants validation + create, GET list/detail, PATCH update,
GET profile-prompts, and verifies completeness scoring round-trips.
"""
import os
import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent.parent / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
LOGIN_EMAIL = "cathy@example.com"
LOGIN_PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    data = r.json()
    token = data.get("token") or data.get("access_token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def created_pid(session):
    """Create a fresh participant for tests that mutate / patch."""
    payload = {
        "first_name": "TESTDorothy",
        "last_name": "TESTSmith",
        "dob": "1948-05-12",
        "classification_level": 4,
        "pension_status": "full_pension",
        "provider_name": "TEST BlueBerry Care",
        "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    r = session.post(f"{BASE}/api/participants", json=payload)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    yield pid
    # no DELETE endpoint exposed — leave the test doc behind (TEST_-prefixed)


# -------------------- POST validation --------------------
def test_post_missing_all_tier1_returns_422(session):
    r = session.post(f"{BASE}/api/participants", json={})
    assert r.status_code == 422, r.text
    body = r.json()
    detail_str = str(body.get("detail", body)).lower()
    for fld in ("first_name", "last_name", "dob", "classification_level",
                "pension_status", "provider_name", "statement_delivery",
                "authorisation_confirmed"):
        assert fld in detail_str, f"expected `{fld}` in 422 detail; got {detail_str}"


def test_post_authorisation_false_returns_authorisation_required(session):
    payload = {
        "first_name": "X", "last_name": "Y", "dob": "1948-05-12",
        "classification_level": 4, "pension_status": "full_pension",
        "provider_name": "X", "statement_delivery": "email",
        "authorisation_confirmed": False,
    }
    r = session.post(f"{BASE}/api/participants", json=payload)
    assert r.status_code == 422, r.text
    detail = r.json().get("detail", {})
    assert isinstance(detail, dict)
    assert detail.get("error") == "authorisation_required"


def test_post_full_tier1_returns_201_with_completeness(session):
    payload = {
        "first_name": "TESTAlice",
        "last_name": "TESTJones",
        "dob": "1950-01-01",
        "classification_level": 3,
        "pension_status": "full_pension",
        "provider_name": "TEST Provider",
        "statement_delivery": "post",
        "authorisation_confirmed": True,
    }
    r = session.post(f"{BASE}/api/participants", json=payload)
    assert r.status_code == 201, r.text
    data = r.json()
    assert data["profile_completeness_pct"] >= 60
    assert data["missing_required_fields"] == []
    assert data["requires_completion"] is False
    assert "id" in data


# -------------------- GET list/detail --------------------
def test_get_list_participants_has_decoration(session, created_pid):
    r = session.get(f"{BASE}/api/participants")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and isinstance(body["items"], list)
    assert len(body["items"]) >= 1
    for it in body["items"]:
        for key in ("profile_completeness_pct", "missing_required_fields",
                    "recommended_next_fields", "requires_completion"):
            assert key in it, f"missing {key} in list item"


def test_get_legacy_participant_requires_completion(session):
    """The migration reset authorisation_confirmed=False on legacy docs.
    Cathy has a pre-existing Dorothy that should now report requires_completion."""
    r = session.get(f"{BASE}/api/participants")
    assert r.status_code == 200
    items = r.json()["items"]
    # At least one of cathy's participants should be a legacy one with
    # requires_completion=True (the migrated Dorothy).
    legacy_flagged = [
        p for p in items
        if p.get("requires_completion") is True
        and not str(p.get("first_name", "")).startswith("TEST")
    ]
    assert legacy_flagged, "expected at least one legacy participant with requires_completion=True"


# -------------------- PATCH --------------------
def test_patch_all_tier2_brings_completeness_to_90(session, created_pid):
    patch = {
        "preferred_name": "Mum",
        "mac_reference_number": "AC-TEST-001",
        "suburb": "Manly",
        "state": "NSW",
        "is_grandfathered_hcp": "no",
        "caregiver_relationship": "daughter",
        "caregiver_phone": "+61400000000",
    }
    r = session.patch(f"{BASE}/api/participants/{created_pid}", json=patch)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["profile_completeness_pct"] == 90.0, data
    # Verify persistence via GET
    r2 = session.get(f"{BASE}/api/participants/{created_pid}")
    assert r2.json()["preferred_name"] == "Mum"
    assert r2.json()["profile_completeness_pct"] == 90.0


def test_patch_tier3_pushes_above_90(session, created_pid):
    patch = {
        "care_manager_name": "Jane Carer",
        "full_address": "12 Pine St, Manly NSW 2095",
        "applicable_supplements": ["oxygen"],
    }
    r = session.patch(f"{BASE}/api/participants/{created_pid}", json=patch)
    assert r.status_code == 200, r.text
    pct = r.json()["profile_completeness_pct"]
    assert pct > 90.0, f"expected >90, got {pct}"


# -------------------- profile-prompts --------------------
def test_profile_prompts_returns_structured_prompts(session):
    # Make a part_pension participant so we can verify the Services Australia letter prompt
    payload = {
        "first_name": "TESTPart",
        "last_name": "TESTPension",
        "dob": "1948-06-12",
        "classification_level": 4,
        "pension_status": "part_pension",
        "provider_name": "TEST Provider",
        "statement_delivery": "email",
        "authorisation_confirmed": True,
    }
    cr = session.post(f"{BASE}/api/participants", json=payload)
    assert cr.status_code == 201
    pid = cr.json()["id"]

    r = session.get(f"{BASE}/api/participants/{pid}/profile-prompts")
    assert r.status_code == 200
    body = r.json()
    assert "prompts" in body and isinstance(body["prompts"], list)
    assert body["prompts"], "expected at least one prompt"
    for p in body["prompts"]:
        for k in ("field", "prompt", "where", "tier"):
            assert k in p, f"prompt missing key {k}: {p}"
    # Part-pension + no actual % set → expect Services Australia letter prompt
    sa = [p for p in body["prompts"] if "Services Australia" in p["prompt"]]
    assert sa, "expected a Services Australia letter prompt for part_pension"


# -------------------- migration script importability --------------------
def test_migration_script_importable():
    import importlib
    mod = importlib.import_module("scripts.migrate_participants_v2")
    # Either the script exposes the function directly or imports it
    assert hasattr(mod, "migrate_participants_to_v2") or hasattr(mod, "main")
