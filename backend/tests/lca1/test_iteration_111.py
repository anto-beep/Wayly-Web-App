"""Iteration 111 acceptance tests: LCA-1 admin, digest builder, alerts bell
endpoints, SD-3 AI/heuristic + case propagation."""
import os
import uuid
from pathlib import Path
from datetime import datetime, timezone

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


# LCA-1 admin: non-staff cathy sees 404 on all admin endpoints
def test_admin_non_staff_404(session):
    r1 = session.get(f"{BASE}/api/lca1/admin/changes")
    assert r1.status_code == 404
    r2 = session.post(f"{BASE}/api/lca1/admin/changes", json={"slug": "x", "title": "x", "category": "other", "short_summary_tokens": {"caregiver": "a", "participant_self": "b"}, "detailed_explanation_tokens": {"caregiver": "a", "participant_self": "b"}, "effective_date": "2026-10-01"})
    assert r2.status_code == 404


# LCA-1 alerts bell endpoints
def test_lca1_unread_count_endpoint(session):
    r = session.get(f"{BASE}/api/lca1/alerts/unread-count")
    assert r.status_code == 200
    assert "unread_count" in r.json()


def test_lca1_alerts_status_all_filter(session):
    r = session.get(f"{BASE}/api/lca1/alerts?status=all&limit=20")
    assert r.status_code == 200
    body = r.json()
    assert "alerts" in body


# Digest builder — direct DB
def test_digest_builder_returns_none_when_no_cases():
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    import asyncio
    from routes.lca1 import build_digest_for_user
    from motor.motor_asyncio import AsyncIOMotorClient
    async def run():
        m = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = m[os.environ["DB_NAME"]]
        # Fresh user with no cases
        uid = str(uuid.uuid4())
        await db.users.insert_one({"id": uid, "email": f"pytest-{uid[:6]}@example.com", "household_id": str(uuid.uuid4())})
        try:
            digest = await build_digest_for_user(db, uid)
            assert digest is None or digest.get("case_count", 0) == 0
        finally:
            await db.users.delete_one({"id": uid})
    asyncio.run(run())


# LCA-1 admin editor UI: page not authed for non-staff shows 404 (backend returns 404)
def test_admin_list_status_filter_non_staff_still_404(session):
    r = session.get(f"{BASE}/api/lca1/admin/changes?status=draft")
    assert r.status_code == 404


# SD-3 AI-assisted pair creation + LOOP-1 case propagation
def test_sd3_pair_heuristic_creates_loop1_case(session, pid):
    """Seed two statements with intentional duplicates; POST /sd3/pairs with
    use_ai=false should create the pair, candidates, and a LOOP-1 case."""
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    a_id = str(uuid.uuid4())
    b_id = str(uuid.uuid4())
    for sid, month in [(a_id, "TestA"), (b_id, "TestB")]:
        db.statements.insert_one({
            "id": sid, "participant_id": pid, "household_id": None,
            "period_label": month, "uploaded_at": datetime.now(timezone.utc),
            "line_items": [
                {"id": f"{sid}-l1", "date": "2026-05-05", "description": "Care Management", "amount": 89.55},
                {"id": f"{sid}-l2", "date": "2026-05-10", "description": "Personal Care Support", "amount": 240.00},
            ],
        })

    try:
        r = session.post(f"{BASE}/api/sd3/pairs", json={
            "participant_id": pid,
            "statement_a_id": a_id,
            "statement_b_id": b_id,
            "use_ai": False,
        })
        assert r.status_code == 200
        body = r.json()
        assert body["id"]
        assert body["duplicate_candidate_count"] > 0

        # GET pair returns candidates
        detail = session.get(f"{BASE}/api/sd3/pairs/{body['id']}").json()
        assert detail["duplicate_candidate_count"] > 0
        assert len(detail["candidates"]) > 0
        cand_id = detail["candidates"][0]["id"]

        # PATCH candidate decision
        r_patch = session.patch(f"{BASE}/api/sd3/candidates/{cand_id}", json={"decision": "confirmed_duplicate"})
        assert r_patch.status_code == 200

        # LOOP-1 case exists
        r_cases = session.get(f"{BASE}/api/loop/cases?participant_id={pid}&status=open_any").json()
        sd3_cases = [c for c in r_cases["cases"] if c.get("source_tool") == "sd3" and body["id"] in (c.get("source_artefact_id") or "")]
        assert len(sd3_cases) >= 1

        # Idempotency: second POST returns existing pair (no new case)
        r2 = session.post(f"{BASE}/api/sd3/pairs", json={
            "participant_id": pid, "statement_a_id": a_id, "statement_b_id": b_id, "use_ai": False,
        })
        assert r2.status_code == 200
        assert r2.json()["id"] == body["id"]
    finally:
        # Cleanup
        pair = db.statement_pairs.find_one({"statement_a_id": {"$in": sorted([a_id, b_id])}, "statement_b_id": {"$in": sorted([a_id, b_id])}})
        if pair:
            db.duplicate_candidates.delete_many({"statement_pair_id": pair["id"]})
            if pair.get("case_id"):
                db.cases.delete_many({"id": pair["case_id"]})
                db.case_events.delete_many({"case_id": pair["case_id"]})
            db.statement_pairs.delete_one({"id": pair["id"]})
        db.statements.delete_many({"id": {"$in": [a_id, b_id]}})


# Digest cron endpoint requires staff
def test_digest_cron_endpoint_requires_staff(session):
    r = session.post(f"{BASE}/api/loop/cron/digest-now")
    assert r.status_code == 403
