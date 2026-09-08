"""CMP-1 v1 iteration 107 acceptance tests: complaints intake + stages + evidence bundle."""
import os
import uuid
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


def _cleanup(cid=None, bid=None, participant_id=None):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    m = MongoClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    if cid:
        db.complaints.delete_one({"id": cid})
        db.timeline_events.delete_many({"metadata.complaint_id": cid})
    if bid:
        db.complaint_evidence_bundles.delete_one({"id": bid})
        db.complaint_evidence_items.delete_many({"bundle_id": bid})
    if participant_id:
        # Clean up any auto-opened LOOP-1 cases for complaints in this test.
        cases = list(db.cases.find({"participant_id": participant_id, "source_tool": "cmp1"}))
        for c in cases:
            db.case_events.delete_many({"case_id": c["id"]})
            db.cases.delete_one({"id": c["id"]})


def _mk_complaint(session, pid, **overrides):
    body = {
        "complaint_type": "billing_dispute",
        "severity": "minor",
        "provider_name": "Test Provider Co",
        "provider_contact_details": {"email": "provider@example.com"},
        "subject_matter_summary": "Billed for services never received in July 2026.",
        "desired_outcome": "correction_of_billing",
    }
    body.update(overrides)
    return session.post(f"{BASE}/api/cmp1/participants/{pid}/complaints", json=body)


def test_status_flag(session):
    r = session.get(f"{BASE}/api/cmp1/status")
    assert r.status_code == 200
    body = r.json()
    assert body["cmp1_v1_enabled"] is True
    assert len(body["complaint_types"]) == 8
    assert "elder_abuse" in body["complaint_types"]


def test_complaint_crud_flow(session, pid):
    r = _mk_complaint(session, pid)
    assert r.status_code == 200, r.text
    complaint = r.json()
    assert complaint["current_stage"] == "drafting"
    assert complaint["provider_name"] == "Test Provider Co"
    assert complaint["primary_case_id"] is not None
    assert complaint["contains_elder_abuse_indicators"] is False
    cid = complaint["id"]

    # GET
    r = session.get(f"{BASE}/api/cmp1/complaints/{cid}")
    assert r.status_code == 200
    assert r.json()["id"] == cid

    # LIST
    r = session.get(f"{BASE}/api/cmp1/participants/{pid}/complaints")
    assert r.status_code == 200
    assert cid in [c["id"] for c in r.json()["complaints"]]

    # PATCH
    r = session.patch(f"{BASE}/api/cmp1/complaints/{cid}", json={"severity": "serious"})
    assert r.status_code == 200
    assert r.json()["severity"] == "serious"

    _cleanup(cid=cid, participant_id=pid)


def test_bad_types_rejected(session, pid):
    r = _mk_complaint(session, pid, complaint_type="not_a_type")
    assert r.status_code == 422
    r = _mk_complaint(session, pid, severity="mega")
    assert r.status_code == 422
    r = _mk_complaint(session, pid, desired_outcome="become_a_penguin")
    assert r.status_code == 422


def test_elder_abuse_type_gates_safeguard(session, pid):
    r = _mk_complaint(session, pid, complaint_type="elder_abuse",
                      subject_matter_summary="Worker has been intimidating my mother.")
    assert r.status_code == 200
    body = r.json()
    assert body["contains_elder_abuse_indicators"] is True
    assert "elder_abuse_safeguard" in body
    resources = body["elder_abuse_safeguard"]["resources"]
    phones = [r["phone"] for r in resources]
    assert "1800 353 374" in phones  # Elder Abuse Helpline
    assert "000" in phones
    _cleanup(cid=body["id"], participant_id=pid)


def test_elder_abuse_keyword_detection(session, pid):
    r = _mk_complaint(session, pid, complaint_type="worker_behaviour",
                      subject_matter_summary="Mum said she's scared of the new worker.")
    assert r.status_code == 200
    assert r.json()["contains_elder_abuse_indicators"] is True
    _cleanup(cid=r.json()["id"], participant_id=pid)


def test_cross_household_denied(session):
    r = _mk_complaint(session, str(uuid.uuid4()))
    assert r.status_code in (403, 404)


def test_stage_advance_legal_and_illegal(session, pid):
    r = _mk_complaint(session, pid)
    cid = r.json()["id"]
    try:
        # Legal: drafting → stage_1_internal_provider
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/advance-stage",
                         json={"to_stage": "stage_1_internal_provider", "reason": "Ready to send"})
        assert r.status_code == 200
        assert r.json()["current_stage"] == "stage_1_internal_provider"
        assert len(r.json()["stage_history"]) == 2

        # Illegal: stage_1 → stage_5 (skips)
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/advance-stage",
                         json={"to_stage": "stage_5_appeals", "reason": "Skip ahead"})
        assert r.status_code == 422

        # Legal: stage_1 → stage_2
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/advance-stage",
                         json={"to_stage": "stage_2_provider_senior", "reason": "Escalate"})
        assert r.status_code == 200

        # Legal: stage_2 → stage_3
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/advance-stage",
                         json={"to_stage": "stage_3_acqsc_referral", "reason": "Provider stalled"})
        assert r.status_code == 200
    finally:
        _cleanup(cid=cid, participant_id=pid)


def test_close_complaint(session, pid):
    r = _mk_complaint(session, pid)
    cid = r.json()["id"]
    try:
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/close",
                         json={"final_resolution": "resolved_satisfied",
                               "final_resolution_notes": "Provider refunded on 2026-09-01."})
        assert r.status_code == 200
        body = r.json()
        assert body["current_stage"] == "closed_resolved"
        assert body["final_resolution"] == "resolved_satisfied"
        assert body["final_resolution_date"] is not None
    finally:
        _cleanup(cid=cid, participant_id=pid)


def test_close_with_bad_resolution_rejected(session, pid):
    r = _mk_complaint(session, pid)
    cid = r.json()["id"]
    try:
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/close",
                         json={"final_resolution": "made_up"})
        assert r.status_code == 422
    finally:
        _cleanup(cid=cid, participant_id=pid)


def test_evidence_bundle_full_cycle(session, pid):
    r = _mk_complaint(session, pid)
    cid = r.json()["id"]
    try:
        # Create bundle
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/evidence-bundle")
        assert r.status_code == 200
        bid = r.json()["id"]
        assert r.json()["already_existed"] is False

        # Idempotent
        r2 = session.post(f"{BASE}/api/cmp1/complaints/{cid}/evidence-bundle")
        assert r2.json()["id"] == bid
        assert r2.json()["already_existed"] is True

        # Propose
        r = session.post(f"{BASE}/api/cmp1/evidence-bundles/{bid}/propose",
                         json={"source_type": "statement", "source_id": "stmt-abc-123",
                               "notes": "This statement shows the disputed charge."})
        assert r.status_code == 200
        iid = r.json()["id"]
        assert r.json()["proposed_for_inclusion"] is True
        assert r.json()["user_confirmed_for_inclusion"] is False

        # Propose again — same source → dedupes
        r = session.post(f"{BASE}/api/cmp1/evidence-bundles/{bid}/propose",
                         json={"source_type": "statement", "source_id": "stmt-abc-123"})
        assert r.json()["id"] == iid  # same item id

        # Propose with unknown source_type → 422
        r = session.post(f"{BASE}/api/cmp1/evidence-bundles/{bid}/propose",
                         json={"source_type": "made_up", "source_id": "x"})
        assert r.status_code == 422

        # Confirm inclusion
        r = session.post(f"{BASE}/api/cmp1/evidence-items/{iid}/confirm", json={"include": True})
        assert r.status_code == 200
        assert r.json()["user_confirmed_for_inclusion"] is True

        # GET bundle
        r = session.get(f"{BASE}/api/cmp1/evidence-bundles/{bid}")
        assert r.status_code == 200
        assert r.json()["confirmed_count"] == 1
        assert r.json()["proposed_count"] == 0

        _cleanup(cid=cid, bid=bid, participant_id=pid)
    finally:
        _cleanup(cid=cid, participant_id=pid)


def test_list_filters(session, pid):
    r1 = _mk_complaint(session, pid, severity="serious")
    r2 = _mk_complaint(session, pid, severity="minor")
    ids = [r1.json()["id"], r2.json()["id"]]
    try:
        r = session.get(f"{BASE}/api/cmp1/participants/{pid}/complaints?severity=serious")
        assert r.status_code == 200
        listed = [c["id"] for c in r.json()["complaints"]]
        assert r1.json()["id"] in listed
        assert r2.json()["id"] not in listed

        r = session.get(f"{BASE}/api/cmp1/participants/{pid}/complaints?stage=drafting")
        assert r.status_code == 200
    finally:
        for c in ids:
            _cleanup(cid=c, participant_id=pid)


def test_loop1_case_created_on_complaint(session, pid):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    m = MongoClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    r = _mk_complaint(session, pid)
    cid = r.json()["id"]
    case_id = r.json()["primary_case_id"]
    try:
        assert case_id is not None
        case = db.cases.find_one({"id": case_id})
        assert case is not None
        assert case["source_tool"] == "cmp1"
        assert case["metadata"]["complaint_type"] == "billing_dispute"
    finally:
        _cleanup(cid=cid, participant_id=pid)
