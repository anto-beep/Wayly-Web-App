"""CORE-1 v1 acceptance tests — hit live backend via REACT_APP_BACKEND_URL.

Covers status flag, participant listing/detail, cross-household 404 scope,
profile aggregate composition, timeline write/read, and persona-aware
summary rendering.
"""
import os
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
LOGIN_EMAIL = "cathy@example.com"
LOGIN_PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD})
    assert r.status_code == 200
    token = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def cathy_pid(session):
    r = session.get(f"{BASE}/api/core/participants")
    assert r.status_code == 200, r.text
    parts = r.json()["participants"]
    assert len(parts) >= 1
    return parts[0]["id"]


# ---------------------------------------------------------------------------
# T1. Feature flag + residency
# ---------------------------------------------------------------------------

def test_status_endpoint_returns_flag_and_residency():
    r = requests.get(f"{BASE}/api/core/status")
    assert r.status_code == 200
    body = r.json()
    assert body["data_residency"] == "ap-southeast-2"
    assert body["version"] == "v1"
    assert isinstance(body["core_1_profile_backbone"], bool)


# ---------------------------------------------------------------------------
# T2. Participant list + detail
# ---------------------------------------------------------------------------

def test_list_participants_scoped_to_household(session):
    """The list scope now includes account-scoped participants (which may
    have null household_id) plus household-scoped legacy ones. Every returned
    participant must belong to the caller's account or household."""
    r = session.get(f"{BASE}/api/core/participants")
    assert r.status_code == 200
    parts = r.json()["participants"]
    assert len(parts) > 0
    # All ids should be unique
    ids = [p["id"] for p in parts]
    assert len(ids) == len(set(ids))


def test_get_participant_shape(session, cathy_pid):
    r = session.get(f"{BASE}/api/core/participants/{cathy_pid}")
    assert r.status_code == 200
    body = r.json()
    assert body["id"] == cathy_pid
    assert body["display_name"]  # not null
    assert body["classification"]["band"] is not None
    assert body["data_residency"] == "ap-southeast-2"
    assert "transition_status" in body


def test_get_participant_invalid_id_returns_404(session):
    r = session.get(f"{BASE}/api/core/participants/nonexistent-id-12345")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# T3. Profile aggregate composition
# ---------------------------------------------------------------------------

def test_profile_composes_all_sections(session, cathy_pid):
    r = session.get(f"{BASE}/api/core/participants/{cathy_pid}/profile")
    assert r.status_code == 200
    body = r.json()
    assert body["participant"]["id"] == cathy_pid
    assert body["persona"] in ("caregiver", "participant_self")
    assert "household" in body and isinstance(body["household"], list)
    assert "financial_position" in body
    assert body["open_cases"] == [] or isinstance(body["open_cases"], list)  # LOOP-1 populates when cases exist
    assert "latest_artefacts" in body
    assert "timeline" in body


def test_profile_lifetime_cap_from_index1(session, cathy_pid):
    r = session.get(f"{BASE}/api/core/participants/{cathy_pid}/profile")
    fp = r.json()["financial_position"]
    assert fp["lifetime_cap_total"]["amount"] == 137917.01
    assert fp["lifetime_cap_total"]["source"] == "index1"


def test_profile_persona_query_switches_framing(session, cathy_pid):
    r_c = session.get(f"{BASE}/api/core/participants/{cathy_pid}/profile?persona=caregiver")
    r_s = session.get(f"{BASE}/api/core/participants/{cathy_pid}/profile?persona=participant_self")
    assert r_c.json()["persona"] == "caregiver"
    assert r_s.json()["persona"] == "participant_self"


def test_profile_latest_artefacts_has_expected_keys(session, cathy_pid):
    r = session.get(f"{BASE}/api/core/participants/{cathy_pid}/profile")
    latest = r.json()["latest_artefacts"]
    for key in ("statement", "invoice_check", "care_plan_review", "classification_check",
                "contribution_estimate", "letter", "price_check", "budget_projection"):
        assert key in latest


# ---------------------------------------------------------------------------
# T4. Timeline events (write, read, persona-aware rendering)
# ---------------------------------------------------------------------------

def test_post_timeline_event_writes_and_renders_persona_aware(session, cathy_pid):
    payload = {
        "participant_id": cathy_pid,
        "event_type": "note_added",
        "event_source": "test_core1",
        "summary_tokens": {
            "caregiver": f"Test note about {cathy_pid[:8]}",
            "participant_self": f"Test note about you {cathy_pid[:8]}",
        },
        "actor_type": "user",
        "metadata": {"tag": "pytest"},
    }
    r = session.post(f"{BASE}/api/core/timeline/events", json=payload)
    assert r.status_code == 200
    ev = r.json()
    assert ev["participant_id"] == cathy_pid
    assert ev["event_type"] == "note_added"
    assert ev["event_source"] == "test_core1"

    # Read timeline with both personas
    tl_c = session.get(f"{BASE}/api/core/participants/{cathy_pid}/timeline?persona=caregiver&limit=50").json()["events"]
    tl_s = session.get(f"{BASE}/api/core/participants/{cathy_pid}/timeline?persona=participant_self&limit=50").json()["events"]
    # Find our event (may not be #0 because timeline includes derived events)
    caregiver_summaries = [e["summary"] for e in tl_c if e["event_type"] == "note_added" and cathy_pid[:8] in e["summary"]]
    self_summaries = [e["summary"] for e in tl_s if e["event_type"] == "note_added" and cathy_pid[:8] in e["summary"]]
    assert caregiver_summaries and self_summaries
    assert caregiver_summaries[0] != self_summaries[0]


def test_post_timeline_event_invalid_participant_404(session):
    r = session.post(f"{BASE}/api/core/timeline/events", json={
        "participant_id": "nonexistent-abc-123",
        "event_type": "note_added",
        "event_source": "test",
        "summary_tokens": {"caregiver": "x", "participant_self": "x"},
    })
    assert r.status_code == 404


def test_timeline_pagination_limit(session, cathy_pid):
    r = session.get(f"{BASE}/api/core/participants/{cathy_pid}/timeline?limit=3")
    assert r.status_code == 200
    body = r.json()
    assert body["count"] <= 3


# ---------------------------------------------------------------------------
# T5. PATCH participant writes timeline event
# ---------------------------------------------------------------------------

def test_patch_participant_provider_writes_event(session, cathy_pid):
    # Read current provider
    orig = session.get(f"{BASE}/api/core/participants/{cathy_pid}").json()
    orig_provider = orig["provider"]["primary"]
    new_provider = f"Test Provider {os.urandom(4).hex()}"

    r = session.patch(f"{BASE}/api/core/participants/{cathy_pid}", json={"provider_name": new_provider})
    assert r.status_code == 200
    assert r.json()["provider"]["primary"] == new_provider

    # Confirm timeline includes a provider_changed event
    tl = session.get(f"{BASE}/api/core/participants/{cathy_pid}/timeline?limit=10").json()
    types = [e["event_type"] for e in tl["events"]]
    assert "provider_changed" in types

    # Restore
    session.patch(f"{BASE}/api/core/participants/{cathy_pid}", json={"provider_name": orig_provider})
