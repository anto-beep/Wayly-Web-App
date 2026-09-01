"""LOOP-1 v1 + LCA-1 acceptance tests via live backend."""
import os
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "cathy@example.com", "password": "testpass123"})
    assert r.status_code == 200
    token = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def pid(session):
    r = session.get(f"{BASE}/api/core/participants")
    parts = r.json()["participants"]
    return next((p["id"] for p in parts if p["is_primary"]), parts[0]["id"])


# ---------------------------------------------------------------------------
# T1. Status + registry
# ---------------------------------------------------------------------------

def test_status_endpoint():
    r = requests.get(f"{BASE}/api/loop/status")
    assert r.status_code == 200
    body = r.json()
    assert body["version"] == "v1"
    assert body["data_residency"] == "ap-southeast-2"
    assert body["case_type_count"] == 8


def test_registry(session):
    r = session.get(f"{BASE}/api/loop/cases/registry")
    assert r.status_code == 200
    body = r.json()
    assert set(body["case_types"].keys()) >= {
        "statement_anomaly_ready", "invoice_issue_review", "care_plan_review_findings",
        "letter_awaiting_reply", "price_over_reference", "reclassification_review",
        "manual", "system",
    }
    assert "open" in body["open_statuses"]


# ---------------------------------------------------------------------------
# T2. Scan opens cases and is idempotent
# ---------------------------------------------------------------------------

def test_scan_opens_cases_idempotent(session, pid):
    # First scan
    r1 = session.post(f"{BASE}/api/loop/cases/scan?participant_id={pid}")
    assert r1.status_code == 200
    total_before = r1.json()["opened"] + r1.json()["skipped_deduped"]

    # Second scan — nothing new
    r2 = session.post(f"{BASE}/api/loop/cases/scan?participant_id={pid}")
    assert r2.status_code == 200
    assert r2.json()["opened"] == 0
    assert r2.json()["skipped_deduped"] >= 1 or total_before == 0


def test_list_cases_scoped_by_participant(session, pid):
    r = session.get(f"{BASE}/api/loop/cases?participant_id={pid}&status=open_any")
    assert r.status_code == 200
    body = r.json()
    assert "cases" in body
    for c in body["cases"]:
        assert c["participant_id"] == pid
        assert c["status"] in ("open", "in_progress", "waiting_on_provider")


def test_list_cases_across_participants(session):
    r = session.get(f"{BASE}/api/loop/cases?status=open_any&limit=200")
    assert r.status_code == 200
    body = r.json()
    assert "cases" in body


# ---------------------------------------------------------------------------
# T3. Case detail + status transition + notes
# ---------------------------------------------------------------------------

def test_case_detail_status_flow_and_notes(session, pid):
    # Ensure there's at least one case
    session.post(f"{BASE}/api/loop/cases/scan?participant_id={pid}")
    r = session.get(f"{BASE}/api/loop/cases?participant_id={pid}&status=open_any")
    cases = r.json()["cases"]
    if not cases:
        # Create one manually
        c = session.post(f"{BASE}/api/loop/cases", json={
            "participant_id": pid, "case_type": "manual",
            "title": "Test manual case", "summary": "for pytest",
        }).json()
        cid = c["id"]
    else:
        cid = cases[0]["id"]

    # Detail returns events
    det = session.get(f"{BASE}/api/loop/cases/{cid}").json()
    assert det["id"] == cid
    assert isinstance(det["events"], list)
    assert any(e["event_type"] == "opened" for e in det["events"])

    # Add a note
    n = session.post(f"{BASE}/api/loop/cases/{cid}/events", json={
        "event_type": "note_added", "note": "pytest note"
    })
    assert n.status_code == 200

    # Change status to in_progress
    upd = session.patch(f"{BASE}/api/loop/cases/{cid}", json={"status": "in_progress"})
    assert upd.status_code == 200
    assert upd.json()["status"] == "in_progress"

    # Detail should now include status_changed event
    det2 = session.get(f"{BASE}/api/loop/cases/{cid}").json()
    types = [e["event_type"] for e in det2["events"]]
    assert "status_changed" in types
    assert "note_added" in types

    # Resolve
    r_resolve = session.patch(f"{BASE}/api/loop/cases/{cid}", json={"status": "resolved", "resolution_notes": "done"})
    assert r_resolve.status_code == 200
    assert r_resolve.json()["status"] == "resolved"
    assert r_resolve.json()["closed_at"] is not None


# ---------------------------------------------------------------------------
# T4. Profile aggregate populates open_cases from LOOP-1
# ---------------------------------------------------------------------------

def test_profile_populates_open_cases(session, pid):
    # Ensure at least one open case exists
    session.post(f"{BASE}/api/loop/cases/scan?participant_id={pid}")
    r = session.get(f"{BASE}/api/core/participants/{pid}/profile")
    assert r.status_code == 200
    body = r.json()
    assert isinstance(body["open_cases"], list)
    # If there are any open cases, each must have title/severity/status
    for c in body["open_cases"]:
        assert c["title"]
        assert c["severity"] in ("high", "medium", "low")
        assert c["status"] in ("open", "in_progress", "waiting_on_provider")


# ---------------------------------------------------------------------------
# T5. Timeline gets a case_opened event
# ---------------------------------------------------------------------------

def test_timeline_includes_case_events(session, pid):
    # Create a manual case then check timeline
    c = session.post(f"{BASE}/api/loop/cases", json={
        "participant_id": pid, "case_type": "manual",
        "title": "Timeline verification case", "summary": "for pytest",
    }).json()
    r = session.get(f"{BASE}/api/core/participants/{pid}/timeline?limit=20").json()
    types = [e["event_type"] for e in r["events"]]
    assert "case_opened" in types


# ---------------------------------------------------------------------------
# T6. LCA-1 scan endpoint returns structured result
# ---------------------------------------------------------------------------

def test_lca1_scan_endpoint(session, pid):
    r = session.post(f"{BASE}/api/loop/lca1/scan?participant_id={pid}")
    assert r.status_code == 200
    body = r.json()
    assert "opened" in body
    if body["opened"]:
        assert "case_id" in body
        assert "signal" in body
    else:
        assert body["reason"] == "no_signal"


# ---------------------------------------------------------------------------
# T7. Access control — cannot access cases in other households
# ---------------------------------------------------------------------------

def test_cross_participant_case_access_forbidden(session):
    r = session.get(f"{BASE}/api/loop/cases?participant_id=nonexistent-id-abc")
    assert r.status_code == 404


def test_create_case_bad_type(session, pid):
    r = session.post(f"{BASE}/api/loop/cases", json={
        "participant_id": pid, "case_type": "nonsense_type",
        "title": "bad", "summary": "bad",
    })
    assert r.status_code == 422
