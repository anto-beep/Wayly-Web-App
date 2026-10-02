"""IC-2 v1 iteration 108 acceptance tests + CMP-1 PDF bundle test."""
import os
import uuid
from datetime import date, datetime, timezone
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


@pytest.fixture
def db():
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    return MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]


def _seed_invoice_and_statement(db, pid, *, aligned_dates=True, add_orphan=False):
    """Create one invoice + one statement for correlation testing."""
    p = db.participants.find_one({"id": pid}) or {}
    inv_id = str(uuid.uuid4())
    stmt_id = str(uuid.uuid4())
    inv_lines = [
        {"id": "invL1", "date": "2027-05-10", "service_name": "Personal Care", "amount": 150.00},
        {"id": "invL2", "date": "2027-05-12", "service_name": "Domestic Assistance", "amount": 80.00},
    ]
    if add_orphan:
        inv_lines.append({"id": "invL3", "date": "2027-05-14", "service_name": "Nursing", "amount": 220.00})
    stmt_line_date_l1 = "2027-05-10" if aligned_dates else "2027-05-15"  # ±5 for medium
    stmt_lines = [
        {"id": "sL1", "service_date": stmt_line_date_l1, "service_name": "Personal Care", "amount": 150.00, "participant_contribution": 150.00},
        {"id": "sL2", "service_date": "2027-05-12", "service_name": "Domestic Assistance", "amount": 80.00, "participant_contribution": 80.00},
    ]
    db.invoices.insert_one({
        "id": inv_id, "participant_id": pid, "household_id": p.get("household_id"),
        "provider_name": "Test Provider Co", "uploaded_at": datetime.now(timezone.utc),
        "line_items": inv_lines, "status": "active",
    })
    db.statements.insert_one({
        "id": stmt_id, "participant_id": pid, "household_id": p.get("household_id"),
        "provider_name": "Test Provider Co", "uploaded_at": datetime.now(timezone.utc),
        "status": "active", "line_items": stmt_lines,
        "summary": {"period_start": "2027-05-01", "period_end": "2027-05-31"},
        "extracted_json": {"period_start": "2027-05-01", "period_end": "2027-05-31"},
    })
    return inv_id, stmt_id


def _cleanup_ic2(db, pid, inv_id=None, stmt_id=None):
    if inv_id:
        db.invoice_statement_correlations.delete_many({"invoice_check_id": inv_id})
        db.invoices.delete_one({"id": inv_id})
    if stmt_id:
        db.statements.delete_one({"id": stmt_id})
    # Any auto-opened LOOP-1 case
    cases = list(db.cases.find({"participant_id": pid, "source_tool": "ic2"}))
    for c in cases:
        db.case_events.delete_many({"case_id": c["id"]})
        db.cases.delete_one({"id": c["id"]})
    db.timeline_events.delete_many({"event_type": "invoice_correlation_run", "participant_id": pid})


def test_status_flag(session):
    r = session.get(f"{BASE}/api/ic2/status")
    assert r.status_code == 200
    body = r.json()
    assert body["ic2_v1_enabled"] is True
    assert body["timing_tolerance_days"] == 5


def test_correlation_exact_match_high_confidence(session, pid, db):
    inv_id, stmt_id = _seed_invoice_and_statement(db, pid, aligned_dates=True)
    try:
        r = session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        assert r.status_code == 200, r.text
        body = r.json()
        # Both invoice lines have exact-date matches
        assert body["correlation_status"] == "correlated_line_matches_statement"
        assert body["summary"]["high"] == 2
        assert body["summary"]["medium"] == 0
        assert body["summary"]["orphaned"] == 0
        for c in body["correlations"]:
            assert c["confidence"] == "high"
            assert c["match_reason"] == "same_service_same_date_same_amount"
            assert c["statement_id"] == stmt_id
    finally:
        _cleanup_ic2(db, pid, inv_id, stmt_id)


def test_correlation_close_date_medium_confidence(session, pid, db):
    inv_id, stmt_id = _seed_invoice_and_statement(db, pid, aligned_dates=False)
    try:
        r = session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        assert r.status_code == 200
        body = r.json()
        # invL1 is 5 days off → medium; invL2 same date → high.
        assert body["summary"]["high"] == 1
        assert body["summary"]["medium"] == 1
        # Because we have >=1 medium and 0 low/orphaned, status is partial_correlation
        assert body["correlation_status"] == "partial_correlation_needs_user_review"
    finally:
        _cleanup_ic2(db, pid, inv_id, stmt_id)


def test_correlation_orphan_opens_loop1_case(session, pid, db):
    inv_id, stmt_id = _seed_invoice_and_statement(db, pid, aligned_dates=True, add_orphan=True)
    try:
        r = session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        assert r.status_code == 200
        body = r.json()
        assert body["summary"]["orphaned"] == 1
        assert body["correlation_status"] == "partial_correlation_needs_user_review"
        # LOOP-1 case must have been opened
        cases = list(db.cases.find({"participant_id": pid, "source_tool": "ic2", "source_artefact_id": inv_id}))
        assert len(cases) == 1
        assert cases[0]["case_type"] == "invoice_error"
        assert cases[0]["metadata"]["orphaned_invoice_lines"] == 1
    finally:
        _cleanup_ic2(db, pid, inv_id, stmt_id)


def test_correlation_is_idempotent(session, pid, db):
    """Running correlation twice produces the same output and doesn't stack correlations."""
    inv_id, stmt_id = _seed_invoice_and_statement(db, pid, aligned_dates=True)
    try:
        r1 = session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        assert r1.status_code == 200
        n1 = db.invoice_statement_correlations.count_documents({"invoice_check_id": inv_id})
        r2 = session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        assert r2.status_code == 200
        n2 = db.invoice_statement_correlations.count_documents({"invoice_check_id": inv_id})
        assert n1 == n2
        # Same summary counts
        assert r1.json()["summary"] == r2.json()["summary"]
    finally:
        _cleanup_ic2(db, pid, inv_id, stmt_id)


def test_get_invoice_with_correlation(session, pid, db):
    inv_id, stmt_id = _seed_invoice_and_statement(db, pid, aligned_dates=True)
    try:
        session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        r = session.get(f"{BASE}/api/ic2/invoice-checks/{inv_id}?include_correlation=true")
        assert r.status_code == 200
        body = r.json()
        assert body["correlation_status"] == "correlated_line_matches_statement"
        assert stmt_id in body["correlated_with_statement_ids"]
        assert len(body["correlations"]) == 2
    finally:
        _cleanup_ic2(db, pid, inv_id, stmt_id)


def test_orphans_endpoint(session, pid, db):
    inv_id, stmt_id = _seed_invoice_and_statement(db, pid, aligned_dates=True, add_orphan=True)
    try:
        session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        r = session.get(f"{BASE}/api/ic2/participants/{pid}/orphans")
        assert r.status_code == 200
        body = r.json()
        assert body["invoice_orphan_count"] >= 1
        # The invL3 line should show up as an invoice orphan
        orphan_refs = [o["invoice_line_ref"] for o in body["invoice_orphans"]]
        assert "invL3" in orphan_refs
    finally:
        _cleanup_ic2(db, pid, inv_id, stmt_id)


def test_correlate_unlinked_invoice_returns_422(session, pid, db):
    inv_id = str(uuid.uuid4())
    db.invoices.insert_one({"id": inv_id, "participant_id": None,
                             "provider_name": "Unlinked", "line_items": [],
                             "uploaded_at": datetime.now(timezone.utc)})
    try:
        r = session.post(f"{BASE}/api/ic2/invoice-checks/{inv_id}/correlate")
        assert r.status_code == 422
    finally:
        db.invoices.delete_one({"id": inv_id})


def test_cross_household_denied(session):
    r = session.post(f"{BASE}/api/ic2/invoice-checks/{uuid.uuid4()}/correlate")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# CMP-1 PDF bundle
# ---------------------------------------------------------------------------


def test_cmp1_bundle_pdf_export(session, pid, db):
    # Create a complaint + bundle + one confirmed item
    r = session.post(f"{BASE}/api/cmp1/participants/{pid}/complaints", json={
        "complaint_type": "billing_dispute", "severity": "serious",
        "provider_name": "Bundle Test Co",
        "provider_contact_details": {"email": "hello@bundle.test"},
        "subject_matter_summary": "Billed for July services that were not delivered.",
        "desired_outcome": "correction_of_billing",
    })
    cid = r.json()["id"]
    bid = None
    try:
        r = session.post(f"{BASE}/api/cmp1/complaints/{cid}/evidence-bundle")
        bid = r.json()["id"]
        r = session.post(f"{BASE}/api/cmp1/evidence-bundles/{bid}/propose",
                         json={"source_type": "statement", "source_id": "stmt-abc-1",
                               "notes": "This statement shows the disputed July charge."})
        iid = r.json()["id"]
        session.post(f"{BASE}/api/cmp1/evidence-items/{iid}/confirm", json={"include": True})

        # Advance stage so history has multiple entries
        session.post(f"{BASE}/api/cmp1/complaints/{cid}/advance-stage",
                     json={"to_stage": "stage_1_internal_provider", "reason": "Ready to send"})

        # Export
        r = session.get(f"{BASE}/api/cmp1/evidence-bundles/{bid}/export.pdf")
        assert r.status_code == 200
        assert r.headers["content-type"] == "application/pdf"
        assert r.headers["content-disposition"].startswith('attachment; filename="complaint-bundle-')
        # PDFs start with %PDF
        assert r.content[:4] == b"%PDF"
        assert len(r.content) > 2000
    finally:
        if bid:
            db.complaint_evidence_bundles.delete_one({"id": bid})
            db.complaint_evidence_items.delete_many({"bundle_id": bid})
        db.complaints.delete_one({"id": cid})
        db.timeline_events.delete_many({"metadata.complaint_id": cid})
        cases = list(db.cases.find({"participant_id": pid, "source_tool": "cmp1"}))
        for c in cases:
            db.case_events.delete_many({"case_id": c["id"]})
            db.cases.delete_one({"id": c["id"]})


def test_cmp1_bundle_pdf_missing_bundle_returns_404(session):
    r = session.get(f"{BASE}/api/cmp1/evidence-bundles/{uuid.uuid4()}/export.pdf")
    assert r.status_code == 404
