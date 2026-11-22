"""Iteration 112: Letter-from-Duplicate export + Digest Preference UI acceptance tests."""
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


# ---------------------------------------------------------------------------
# Letter-from-Duplicate export
# ---------------------------------------------------------------------------


def test_draft_letter_from_candidate_creates_lf1_and_is_idempotent(session, pid):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    a_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    for sid, month in [(a_id, "TestJan"), (b_id, "TestFeb")]:
        db.statements.insert_one({
            "id": sid, "participant_id": pid, "provider_name": "TestCare Pty Ltd",
            "period_label": month, "uploaded_at": datetime.now(timezone.utc),
            "line_items": [
                {"id": f"{sid}-l1", "date": "2026-01-15", "description": "Personal Care Support", "amount": 240.00},
            ],
        })
    try:
        # Create pair (heuristic)
        pair = session.post(f"{BASE}/api/sd3/pairs", json={
            "participant_id": pid, "statement_a_id": a_id, "statement_b_id": b_id, "use_ai": False,
        }).json()
        assert pair["duplicate_candidate_count"] >= 1

        # Fetch candidates
        detail = session.get(f"{BASE}/api/sd3/pairs/{pair['id']}").json()
        cand_id = detail["candidates"][0]["id"]

        # First draft call — creates LF-1
        r1 = session.post(f"{BASE}/api/sd3/candidates/{cand_id}/draft-letter")
        assert r1.status_code == 200
        body1 = r1.json()
        assert body1["lf1_entry_id"]
        assert body1["already_existed"] is False
        assert body1["provider_name"] == "TestCare Pty Ltd"

        # Verify the LF-1 doc exists and has our prefill
        letter = db.lf1_correspondence.find_one({"id": body1["lf1_entry_id"]})
        assert letter is not None
        assert letter["archetype"] == "billing_query"
        assert letter["direction"] == "outbound_to_provider"
        assert "TestCare Pty Ltd" in letter["content_draft"]
        assert "Personal Care Support" in letter["content_draft"]
        assert letter["source_import"]["source_tool"] == "sd3"
        assert letter["source_import"]["candidate_id"] == cand_id

        # Second call — idempotent
        r2 = session.post(f"{BASE}/api/sd3/candidates/{cand_id}/draft-letter")
        assert r2.status_code == 200
        assert r2.json()["lf1_entry_id"] == body1["lf1_entry_id"]
        assert r2.json()["already_existed"] is True
    finally:
        pair_doc = db.statement_pairs.find_one({"statement_a_id": {"$in": sorted([a_id, b_id])}, "statement_b_id": {"$in": sorted([a_id, b_id])}})
        if pair_doc:
            cands = list(db.duplicate_candidates.find({"statement_pair_id": pair_doc["id"]}))
            for c in cands:
                if c.get("lf1_entry_id"):
                    db.lf1_correspondence.delete_one({"id": c["lf1_entry_id"]})
            db.duplicate_candidates.delete_many({"statement_pair_id": pair_doc["id"]})
            if pair_doc.get("case_id"):
                db.cases.delete_many({"id": pair_doc["case_id"]})
                db.case_events.delete_many({"case_id": pair_doc["case_id"]})
            db.statement_pairs.delete_one({"id": pair_doc["id"]})
        db.statements.delete_many({"id": {"$in": [a_id, b_id]}})


def test_draft_letter_bad_candidate_404(session):
    r = session.post(f"{BASE}/api/sd3/candidates/nonexistent-abc/draft-letter")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# Digest Preference API (drives the frontend Notification Settings page)
# ---------------------------------------------------------------------------


def test_preferences_defaults_and_patch_persist(session):
    # Reset to a known state
    session.patch(f"{BASE}/api/lca1/preferences", json={
        "digest_frequency": "immediate",
        "channels": {"in_app_banner": True, "in_app_notification": True, "email": False},
        "topic_subscriptions": [],
        "targeted_alerts_enabled": True,
    })
    r = session.get(f"{BASE}/api/lca1/preferences")
    assert r.status_code == 200
    body = r.json()
    assert body["digest_frequency"] == "immediate"
    assert body["channels"]["email"] is False
    assert body["targeted_alerts_enabled"] is True

    # PATCH: switch to weekly digest, opt in to email, subscribe to two topics
    r2 = session.patch(f"{BASE}/api/lca1/preferences", json={
        "digest_frequency": "weekly_digest",
        "channels": {"in_app_banner": True, "in_app_notification": True, "email": True},
        "topic_subscriptions": ["classification", "contribution"],
    })
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["digest_frequency"] == "weekly_digest"
    assert body2["channels"]["email"] is True
    assert "classification" in body2["topic_subscriptions"]
    assert "contribution" in body2["topic_subscriptions"]

    # Reset
    session.patch(f"{BASE}/api/lca1/preferences", json={
        "digest_frequency": "immediate",
        "channels": {"in_app_banner": True, "in_app_notification": True, "email": False},
        "topic_subscriptions": [],
        "targeted_alerts_enabled": True,
    })


def test_preferences_rejects_bad_frequency(session):
    r = session.patch(f"{BASE}/api/lca1/preferences", json={"digest_frequency": "nonsense"})
    assert r.status_code in (422, 400)
