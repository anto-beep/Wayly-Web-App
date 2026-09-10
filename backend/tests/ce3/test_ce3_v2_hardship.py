"""CE-3 hardship pathway acceptance tests (Section J)."""
import os
import uuid
from datetime import datetime, timezone
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


def _cleanup_hardship(pid, source_artefact_id=None):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    m = MongoClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    q = {"participant_id": pid}
    if source_artefact_id:
        q["source_artefact_id"] = source_artefact_id
    db.hardship_pathway_triggers.delete_many(q)
    db.timeline_events.delete_many({"event_type": "hardship_pathway_triggered", "participant_id": pid})


def test_status_reports_hardship(session):
    r = session.get(f"{BASE}/api/ce3/status")
    assert r.status_code == 200
    assert "hardship_pathway" in r.json()["surfaces"]
    assert r.json()["version"].endswith("hardship")


def test_user_indication_creates_trigger(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "user_indication", "notes": "My rent just went up."})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["source"] == "user_indication"
    assert body["notes"] == "My rent just went up."
    assert body["notification_tokens"]["caregiver"].startswith("We noticed")
    assert body["walkthrough_route"] == "/app/tools/contribution-estimator/hardship-walkthrough"
    _cleanup_hardship(pid)


def test_trigger_idempotent_on_artefact(session, pid):
    art = str(uuid.uuid4())
    r1 = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                      json={"source": "step_change_variance", "reconciliation_id": art})
    r2 = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                      json={"source": "step_change_variance", "reconciliation_id": art})
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json()["id"] == r2.json()["id"]
    _cleanup_hardship(pid, art)


def test_bad_source_rejected(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "not_a_source"})
    assert r.status_code == 422


def test_list_and_only_open(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "user_indication"})
    tid = r.json()["id"]
    # Respond to close it
    session.post(f"{BASE}/api/ce3/hardship/triggers/{tid}/user-response",
                 json={"response": "dismissed"})
    all_r = session.get(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers")
    open_r = session.get(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers?only_open=true")
    assert tid in [t["id"] for t in all_r.json()["triggers"]]
    assert tid not in [t["id"] for t in open_r.json()["triggers"]]
    _cleanup_hardship(pid)


def test_user_response_persists(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "user_indication"})
    tid = r.json()["id"]
    r = session.post(f"{BASE}/api/ce3/hardship/triggers/{tid}/user-response",
                     json={"response": "took_hand_off", "hand_off_target": "provider_letter"})
    assert r.status_code == 200
    body = r.json()
    assert body["user_response"] == "took_hand_off"
    assert body["hand_off_target"] == "provider_letter"
    assert body["user_responded_at"] is not None
    _cleanup_hardship(pid)


def test_bad_response_rejected(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "user_indication"})
    tid = r.json()["id"]
    r = session.post(f"{BASE}/api/ce3/hardship/triggers/{tid}/user-response",
                     json={"response": "nonsense"})
    assert r.status_code == 422
    _cleanup_hardship(pid)


def test_walkthrough_content(session):
    r = session.get(f"{BASE}/api/ce3/hardship/walkthrough")
    assert r.status_code == 200
    body = r.json()
    step_ids = [s["id"] for s in body["steps"]]
    assert step_ids == ["intro", "eligibility", "documents", "how_to_apply", "what_to_expect"]
    assert "channels" in [k for s in body["steps"] for k in s.keys() if s["id"] == "how_to_apply"]
    handoff_keys = [h["key"] for h in body["hand_offs"]]
    assert "provider_letter" in handoff_keys
    assert "maca_letter" in handoff_keys


def test_reconciliation_step_change_auto_triggers_hardship(session, pid):
    """A step_change_variance reconciliation must automatically open a
    hardship pathway trigger with source='step_change_variance'."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    period_month = "2027-04"
    sid = str(uuid.uuid4())
    db.statements.insert_one({
        "id": sid, "participant_id": pid, "provider_name": "Hardship Test Co",
        "uploaded_at": datetime.now(timezone.utc), "status": "active",
        "line_items": [{"id": f"{sid}-l1", "date": "2027-04-15", "description": "Personal Care",
                        "amount": 3000.0, "participant_contribution": 3000.0}],
        "summary": {"total_participant_contribution": 3000.0,
                    "period_start": "2027-04-01", "period_end": "2027-04-30"},
        "extracted_json": {"period_start": "2027-04-01", "period_end": "2027-04-30"},
    })
    try:
        db.contribution_reconciliations.delete_many({"participant_id": pid, "reconciliation_period_month": period_month})
        db.hardship_pathway_triggers.delete_many({"participant_id": pid})

        r = session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                         json={"period_month": period_month})
        assert r.status_code == 200
        rec = r.json()
        assert rec["variance_flag"] == "step_change_variance"

        # Assert a hardship trigger was opened for this reconciliation
        r2 = session.get(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers?only_open=true")
        triggers = r2.json()["triggers"]
        auto = [t for t in triggers if t["source_artefact_id"] == rec["id"] and t["source"] == "step_change_variance"]
        assert len(auto) == 1
    finally:
        db.contribution_reconciliations.delete_many({"participant_id": pid, "reconciliation_period_month": period_month})
        db.hardship_pathway_triggers.delete_many({"participant_id": pid})
        # Case cleanup if opened
        if rec.get("case_id"):
            db.cases.delete_one({"id": rec["case_id"]})
            db.case_events.delete_many({"case_id": rec["case_id"]})
        db.statements.delete_one({"id": sid})


def test_pension_step_down_auto_triggers_hardship(session, pid):
    """Committing a pension step-down (full → self_funded) must auto-open a
    hardship trigger with source='pension_step_down'."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    original = (db.participants.find_one({"id": pid}) or {}).get("pension_status")
    db.participants.update_one({"id": pid}, {"$set": {"pension_status": "full_pension"}})
    history_id = None
    try:
        db.hardship_pathway_triggers.delete_many({"participant_id": pid})
        r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/commit",
                         json={"new_pension_status": "self_funded", "confirmed": True,
                               "reason": "voluntary_reassessment"})
        assert r.status_code == 200
        history_id = r.json()["id"]

        # Trigger should exist referencing this history_id
        r2 = session.get(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers?only_open=true")
        auto = [t for t in r2.json()["triggers"]
                if t["source"] == "pension_step_down" and t["source_artefact_id"] == history_id]
        assert len(auto) == 1
    finally:
        if original:
            db.participants.update_one({"id": pid}, {"$set": {"pension_status": original}})
        db.hardship_pathway_triggers.delete_many({"participant_id": pid})
        if history_id:
            db.pension_change_history.delete_one({"id": history_id})
        db.timeline_events.delete_many({"participant_id": pid, "event_type": "pension_status_changed"})
        db.timeline_events.delete_many({"participant_id": pid, "event_type": "hardship_pathway_triggered"})


def test_pension_up_move_does_NOT_trigger_hardship(session, pid):
    """A move from self_funded → full_pension (income up) must NOT trigger hardship."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    original = (db.participants.find_one({"id": pid}) or {}).get("pension_status")
    db.participants.update_one({"id": pid}, {"$set": {"pension_status": "self_funded"}})
    history_id = None
    try:
        db.hardship_pathway_triggers.delete_many({"participant_id": pid})
        r = session.post(f"{BASE}/api/ce3/participants/{pid}/pension-change/commit",
                         json={"new_pension_status": "full_pension", "confirmed": True})
        assert r.status_code == 200
        history_id = r.json()["id"]
        assert r.json()["hardship_pathway_suggested"] is False

        r2 = session.get(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers")
        auto = [t for t in r2.json()["triggers"] if t["source_artefact_id"] == history_id]
        assert len(auto) == 0
    finally:
        if original:
            db.participants.update_one({"id": pid}, {"$set": {"pension_status": original}})
        if history_id:
            db.pension_change_history.delete_one({"id": history_id})
        db.timeline_events.delete_many({"participant_id": pid, "event_type": "pension_status_changed"})


# ---------------------------------------------------------------------------
# Companion notes (iteration 106)
# ---------------------------------------------------------------------------


def test_single_trigger_get(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "user_indication"})
    tid = r.json()["id"]
    r2 = session.get(f"{BASE}/api/ce3/hardship/triggers/{tid}")
    assert r2.status_code == 200
    assert r2.json()["id"] == tid
    _cleanup_hardship(pid)


def test_notes_patch_persists_and_returns_fresh(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "user_indication"})
    tid = r.json()["id"]
    r2 = session.patch(f"{BASE}/api/ce3/hardship/triggers/{tid}/notes",
                       json={"notes": "Rent went up 12% in July after landlord did renos."})
    assert r2.status_code == 200
    assert r2.json()["notes"] == "Rent went up 12% in July after landlord did renos."
    # GET reflects the update
    r3 = session.get(f"{BASE}/api/ce3/hardship/triggers/{tid}")
    assert r3.json()["notes"] == "Rent went up 12% in July after landlord did renos."
    _cleanup_hardship(pid)


def test_notes_patch_rejects_empty(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/hardship/triggers",
                     json={"source": "user_indication"})
    tid = r.json()["id"]
    r2 = session.patch(f"{BASE}/api/ce3/hardship/triggers/{tid}/notes", json={"notes": ""})
    assert r2.status_code == 422
    _cleanup_hardship(pid)


def test_notes_patch_404_on_missing_trigger(session):
    r = session.patch(f"{BASE}/api/ce3/hardship/triggers/{uuid.uuid4()}/notes",
                      json={"notes": "test"})
    assert r.status_code == 404


def test_notes_cross_household_forbidden(session):
    # Fabricate a trigger in another household directly in Mongo.
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    fake_pid = str(uuid.uuid4())
    fake_hh = str(uuid.uuid4())
    tid = str(uuid.uuid4())
    db.participants.insert_one({"id": fake_pid, "household_id": fake_hh, "pension_status": "self_funded"})
    db.hardship_pathway_triggers.insert_one({
        "id": tid, "participant_id": fake_pid, "source": "user_indication",
        "created_at": datetime.now(timezone.utc),
    })
    try:
        r = session.patch(f"{BASE}/api/ce3/hardship/triggers/{tid}/notes",
                          json={"notes": "unauthorised"})
        assert r.status_code in (403, 404)
    finally:
        db.participants.delete_one({"id": fake_pid})
        db.hardship_pathway_triggers.delete_one({"id": tid})
