"""CE-3 v2 iteration 104 acceptance tests: pension-change wizard (preview + commit)."""
import os
import uuid
from datetime import date
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
    return next((p["id"] for p in r.json()["participants"] if p["is_primary"]),
                r.json()["participants"][0]["id"])


def test_status_reports_pension_wizard(session):
    body = session.get(f"{BASE}/api/ce3/status").json()
    assert "pension_change_wizard" in body["surfaces"]
    assert body["version"].startswith("v1+pension_wizard")


def test_preview_shape_and_delta_math(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/preview",
                     json={"new_pension_status": "self_funded"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["new_pension_status"] == "self_funded"
    assert body["current_pension_status"] in ("full_pension", "part_pension", "cshc", "self_funded")
    # Delta math is deterministic — new - prior across all periods.
    assert body["delta"]["weekly"] == round(body["new"]["contribution_weekly"] - body["prior"]["contribution_weekly"], 2)
    assert body["delta"]["annual"] == round(body["new"]["contribution_annual"] - body["prior"]["contribution_annual"], 2)
    assert "lifetime_cap_impact" in body
    assert "support_resources" in body


def test_preview_rejects_bad_pension_status(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/preview",
                     json={"new_pension_status": "nonsense"})
    assert r.status_code == 422


def test_preview_rejects_bad_reason(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/preview",
                     json={"new_pension_status": "self_funded", "reason": "made_up"})
    assert r.status_code == 422


def test_partner_deceased_surfaces_support_resources(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/preview",
                     json={"new_pension_status": "self_funded", "reason": "partner_deceased"})
    assert r.status_code == 200
    body = r.json()
    assert body["support_resources"] is not None
    assert body["support_resources"]["context"] == "partner_deceased"
    names = [r["name"] for r in body["support_resources"]["resources"]]
    assert "Lifeline" in names


def test_backdated_flag(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/preview",
                     json={"new_pension_status": "part_pension", "effective_date": "2025-06-01"})
    assert r.status_code == 200
    assert r.json()["backdated"] is True


def test_step_down_detection(session, pid):
    """Full → self_funded is a step-down (rank 3 → 0)."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    # Set participant to full_pension for this test
    original = (db.participants.find_one({"id": pid}) or {}).get("pension_status")
    db.participants.update_one({"id": pid}, {"$set": {"pension_status": "full_pension"}})
    try:
        r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/preview",
                         json={"new_pension_status": "self_funded"})
        assert r.status_code == 200
        assert r.json()["is_income_step_down"] is True
        # Reverse — self_funded → full_pension is NOT a step-down (rank 0 → 3)
        r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/preview",
                         json={"new_pension_status": "full_pension"})
        assert r.status_code == 200
    finally:
        # Restore
        if original:
            db.participants.update_one({"id": pid}, {"$set": {"pension_status": original}})


def test_commit_requires_confirmed_true(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/commit",
                     json={"new_pension_status": "self_funded", "confirmed": False})
    assert r.status_code == 422


def test_commit_flow_and_history(session, pid):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    original = (db.participants.find_one({"id": pid}) or {}).get("pension_status")
    try:
        # Commit
        r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/commit", json={
            "new_pension_status": "self_funded",
            "confirmed": True,
            "reason": "voluntary_reassessment",
            "prior_pdf_handling": "mark_superseded",
        })
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["prior_pension_status"] == original
        assert body["new_pension_status"] == "self_funded"
        history_id = body["id"]

        # Participant row updated
        fresh = db.participants.find_one({"id": pid})
        assert fresh["pension_status"] == "self_funded"

        # History endpoint lists this commit
        r = session.get(f"{BASE}/api/ce3/participants/{pid}/pension-change/history")
        assert r.status_code == 200
        ids = [h["id"] for h in r.json()["history"]]
        assert history_id in ids
    finally:
        if original:
            db.participants.update_one({"id": pid}, {"$set": {"pension_status": original}})
        db.pension_change_history.delete_many({"participant_id": pid, "new_pension_status": "self_funded"})


def test_commit_writes_timeline_event(session, pid):
    """After commit, the participant timeline should contain a
    pension_status_changed event."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    original = (db.participants.find_one({"id": pid}) or {}).get("pension_status")
    history_id = None
    try:
        r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/commit", json={
            "new_pension_status": "cshc", "confirmed": True,
        })
        history_id = r.json()["id"]
        # Look for the timeline event
        found = db.timeline_events.find_one(
            {"participant_id": pid, "event_type": "pension_status_changed", "metadata.history_id": history_id}
        )
        assert found is not None, "pension_status_changed timeline event not written"
    finally:
        if original:
            db.participants.update_one({"id": pid}, {"$set": {"pension_status": original}})
        if history_id:
            db.pension_change_history.delete_one({"id": history_id})
        db.timeline_events.delete_many({"participant_id": pid, "event_type": "pension_status_changed"})
