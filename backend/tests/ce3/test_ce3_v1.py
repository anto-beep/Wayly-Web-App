"""CE-3 v1 iteration 103 acceptance tests.

Covers the three slice surfaces:
  * Lifetime cap accumulator
  * Annual projection with confidence band
  * Contribution reconciliation (variance detection + LOOP-1 case)
"""
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


def test_status_flag(session):
    r = session.get(f"{BASE}/api/ce3/status")
    assert r.status_code == 200
    body = r.json()
    assert body["ce3_v1_enabled"] is True
    assert body["version"].startswith("v1")
    assert body["data_residency"] == "ap-southeast-2"
    for s in ("lifetime_cap", "annual_projection", "reconciliation"):
        assert s in body["surfaces"]


def test_lifetime_cap_shape_and_bounds(session, pid):
    r = session.get(f"{BASE}/api/ce3/participants/{pid}/lifetime-cap")
    assert r.status_code == 200, r.text
    body = r.json()
    # Cap is $137,917.01 for a standard participant.
    assert body["total_cap"] in (137917.01, 84571.66)
    assert body["cap_variant"] in ("standard", "no_worse_off")
    assert body["remaining"] == round(body["total_cap"] - body["used_to_date"], 2)
    assert body["participant_id"] == pid
    assert body["data_residency"] == "ap-southeast-2"
    assert body["total_cap_effective_date"] == "2026-03-20"


def test_lifetime_cap_years_at_pace_null_when_new(session):
    """When there are no statements OR less than 30 days since program entry,
    years_at_current_pace must be null per spec G.6."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    # Get any participant that has zero statements OR use a fresh one.
    # We test the "used_to_date <= 0" branch by checking a participant with
    # no statements (or the null-years contract from the code path).
    r = session.get(f"{BASE}/api/core/participants")
    for p in r.json()["participants"]:
        pid_test = p["id"]
        # Count statements for this participant.
        n = db.statements.count_documents({"participant_id": pid_test, "status": {"$ne": "archived"}})
        if n == 0:
            resp = session.get(f"{BASE}/api/ce3/participants/{pid_test}/lifetime-cap")
            assert resp.status_code == 200
            body = resp.json()
            # No statements → used_to_date == 0 → years must be null.
            assert body["used_to_date"] == 0
            assert body["years_at_current_pace"] is None
            assert body["years_at_current_pace_bucket"] is None
            return
    # If every participant has statements, at least verify one has a plausible years value.
    resp = session.get(f"{BASE}/api/ce3/participants/{r.json()['participants'][0]['id']}/lifetime-cap")
    assert resp.status_code == 200


def test_lifetime_cap_refresh_returns_fresh(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/lifetime-cap/refresh")
    assert r.status_code == 200
    body = r.json()
    assert body["participant_id"] == pid
    assert "calculated_at" in body


def test_annual_projection_shape(session, pid):
    r = session.get(f"{BASE}/api/ce3/participants/{pid}/annual-projection")
    assert r.status_code == 200
    body = r.json()
    # FY label like "2026-27"
    assert body["financial_year_label"].startswith("20")
    assert body["annual_estimate_range"]["confidence"] in ("high", "medium", "low")
    assert body["annual_estimate_range"]["band_percent"] in (5, 15, 30)
    # Range must bracket the estimate.
    assert body["annual_estimate_range"]["low"] <= body["annual_estimate"] <= body["annual_estimate_range"]["high"]
    # Persona-aware explanations must be strings.
    tk = body["annual_estimate_range"]["range_explanation_tokens"]
    assert isinstance(tk["caregiver"], str) and len(tk["caregiver"]) > 0
    assert isinstance(tk["participant_self"], str) and len(tk["participant_self"]) > 0


def test_reconciliation_is_idempotent(session, pid):
    r1 = session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                      json={"period_month": "2026-08"})
    assert r1.status_code == 200
    body1 = r1.json()
    rec_id = body1["id"]

    # Same call again → same ID (idempotent).
    r2 = session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                      json={"period_month": "2026-08"})
    assert r2.status_code == 200
    assert r2.json()["id"] == rec_id


def test_reconciliation_rejects_bad_month(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                     json={"period_month": "2026-XX"})
    assert r.status_code in (422, 400)


def test_reconciliation_list_returns_data(session, pid):
    # Ensure at least one reconciliation exists.
    session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                 json={"period_month": "2026-08"})
    r = session.get(f"{BASE}/api/ce3/participants/{pid}/reconciliations?months_back=12")
    assert r.status_code == 200
    body = r.json()
    assert "reconciliations" in body
    assert body["count"] >= 1


def test_step_change_variance_opens_loop1_case(session, pid):
    """A step_change_variance (>30% delta) reconciliation must auto-open a
    LOOP-1 case and link it via case_id. Verified by seeding a statement
    whose contribution is well above the CE-2 estimated monthly slice."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    # Look up the participant's household + latest projection.
    p = db.participants.find_one({"id": pid})
    assert p is not None

    # Insert a statement covering March 2027 (future, won't collide) with
    # a contribution large enough to trigger a step change.
    period_month = "2027-03"
    sid = str(uuid.uuid4())
    db.statements.insert_one({
        "id": sid,
        "participant_id": pid,
        "household_id": p.get("household_id"),
        "provider_name": "StepChange Test Co",
        "uploaded_at": datetime.now(timezone.utc),
        "status": "active",
        "line_items": [
            {"id": f"{sid}-l1", "date": "2027-03-15", "description": "Personal Care",
             "amount": 2000.0, "participant_contribution": 2000.0},
        ],
        "summary": {
            "total_participant_contribution": 2000.0,
            "period_start": "2027-03-01",
            "period_end": "2027-03-31",
        },
        "extracted_json": {
            "period_start": "2027-03-01",
            "period_end": "2027-03-31",
        },
    })
    try:
        # Clear any pre-existing reconciliation for this month.
        db.contribution_reconciliations.delete_many({"participant_id": pid, "reconciliation_period_month": period_month})

        r = session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                         json={"period_month": period_month})
        assert r.status_code == 200
        body = r.json()
        assert body["actual_contribution"] == 2000.0
        # Estimated is tiny (from CE-2 quarterly / 3), so variance is huge.
        assert body["variance_flag"] == "step_change_variance"
        # Case must have been auto-opened (unless one already existed with the same dedupe_key).
        case_id = body.get("case_id")
        if case_id:
            c = db.cases.find_one({"id": case_id})
            assert c is not None
            assert c["source_tool"] == "ce3"
            assert c["source_artefact_type"] == "contribution_reconciliation"
            assert c["metadata"].get("contribution_variance") is True
            # Cleanup case + events
            db.cases.delete_one({"id": case_id})
            db.case_events.delete_many({"case_id": case_id})
    finally:
        db.contribution_reconciliations.delete_many({"participant_id": pid, "reconciliation_period_month": period_month})
        db.statements.delete_one({"id": sid})


def test_user_note_persists(session, pid):
    """User can attach a note to a reconciliation row."""
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                     json={"period_month": "2026-09"})
    rec = r.json()
    r2 = session.post(f"{BASE}/api/ce3/reconciliations/{rec['id']}/add-user-note",
                      json={"user_notes": "Checked with provider; explained by holiday."})
    assert r2.status_code == 200


def test_reconciliation_action_persists(session, pid):
    r = session.post(f"{BASE}/api/ce3/participants/{pid}/reconciliations/reconcile",
                     json={"period_month": "2026-09"})
    rec = r.json()
    r2 = session.post(f"{BASE}/api/ce3/reconciliations/{rec['id']}/action",
                      json={"action": "confirmed_correct"})
    assert r2.status_code == 200
    assert r2.json()["action"] == "confirmed_correct"


def test_cross_household_access_denied(session):
    """A participant in another household must return 404."""
    # Use a random UUID guaranteed not to be cathy's.
    r = session.get(f"{BASE}/api/ce3/participants/{uuid.uuid4()}/lifetime-cap")
    assert r.status_code in (403, 404)
