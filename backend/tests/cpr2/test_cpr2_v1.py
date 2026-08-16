"""CPR-2 v1 iteration 104 acceptance tests: rename, goal ledger, re-review prompts + LCA-1 subscriber."""
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


@pytest.fixture(scope="module")
def admin_session():
    """Superadmin login requires TOTP 2FA which is impractical for this suite;
    skip end-to-end LCA-1 admin publish tests and drive the CPR-2 subscriber
    directly instead."""
    pytest.skip("superadmin 2FA — using direct subscriber invocation below")


def test_status_flag(session):
    r = session.get(f"{BASE}/api/cpr2/status")
    assert r.status_code == 200
    body = r.json()
    assert body["cpr2_v1_enabled"] is True
    assert body["primary_label"] == "Support Plan Reviewer"
    assert "care_plan_reviewer" in body["aliases"]


def test_rename_notification_flow(session):
    """Fetch → acknowledge → subsequent fetch shows already_acknowledged."""
    # First fetch may or may not be already-acked from a prior test run; ack it and verify.
    ack = session.post(f"{BASE}/api/cpr2/rename-notification/acknowledge")
    assert ack.status_code == 200
    r = session.get(f"{BASE}/api/cpr2/rename-notification")
    assert r.status_code == 200
    assert r.json()["already_acknowledged"] is True
    assert r.json()["show"] is False


# ---------------------------------------------------------------------------
# Goal ledger
# ---------------------------------------------------------------------------


def test_goal_ledger_crud_full_cycle(session, pid):
    # Create
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/goals", json={
        "goal_text": "Walk with confidence to the local shops",
        "goal_type": "functional",
        "extraction_confidence": "high",
    })
    assert r.status_code == 200, r.text
    goal = r.json()
    assert goal["goal_text"] == "Walk with confidence to the local shops"
    assert goal["status"] == "active_ongoing"
    gid = goal["id"]

    # List — should include the new goal
    r = session.get(f"{BASE}/api/cpr2/participants/{pid}/goals")
    assert r.status_code == 200
    ids = [g["id"] for g in r.json()["goals"]]
    assert gid in ids

    # Filter list by status
    r = session.get(f"{BASE}/api/cpr2/participants/{pid}/goals?status=active_ongoing")
    assert r.status_code == 200
    assert all(g["status"] == "active_ongoing" for g in r.json()["goals"])

    # Bad status filter → 422
    r = session.get(f"{BASE}/api/cpr2/participants/{pid}/goals?status=nonsense")
    assert r.status_code == 422

    # Patch status
    r = session.patch(f"{BASE}/api/cpr2/goals/{gid}", json={"status": "partially_met", "status_reason": "Making steady progress"})
    assert r.status_code == 200
    assert r.json()["status"] == "partially_met"
    assert r.json()["status_reason"] == "Making steady progress"

    # Link to a plan
    plan_id = str(uuid.uuid4())
    r = session.post(f"{BASE}/api/cpr2/goals/{gid}/link-to-plan", json={"plan_id": plan_id})
    assert r.status_code == 200
    assert plan_id in r.json()["appears_in_plan_ids"]
    # Idempotent — repeat is a no-op (still only appears once)
    session.post(f"{BASE}/api/cpr2/goals/{gid}/link-to-plan", json={"plan_id": plan_id})
    r = session.get(f"{BASE}/api/cpr2/participants/{pid}/goals")
    match = next(g for g in r.json()["goals"] if g["id"] == gid)
    assert match["appears_in_plan_ids"].count(plan_id) == 1

    # Add meeting note
    r = session.post(f"{BASE}/api/cpr2/goals/{gid}/meeting-note", json={"note": "Discussed with care manager on 2026-08-01"})
    assert r.status_code == 200
    assert len(r.json()["meeting_notes"]) == 1
    assert r.json()["meeting_notes"][0]["note"] == "Discussed with care manager on 2026-08-01"

    # Supersede with a new goal
    r2 = session.post(f"{BASE}/api/cpr2/participants/{pid}/goals", json={
        "goal_text": "Walk with confidence and take the bus independently",
        "goal_type": "functional",
    })
    new_gid = r2.json()["id"]
    r = session.post(f"{BASE}/api/cpr2/goals/{gid}/supersede", json={"superseding_goal_id": new_gid})
    assert r.status_code == 200
    assert r.json()["status"] == "superseded_by_new_goal"
    assert r.json()["superseded_by_goal_id"] == new_gid

    # Cleanup
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    db.goal_ledger_entries.delete_many({"id": {"$in": [gid, new_gid]}})


def test_goal_create_rejects_bad_type(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/goals", json={
        "goal_text": "Test", "goal_type": "not_a_type",
    })
    assert r.status_code == 422


def test_goal_cross_household_access_denied(session):
    r = session.post(f"{BASE}/api/cpr2/participants/{uuid.uuid4()}/goals", json={
        "goal_text": "Test", "goal_type": "functional",
    })
    assert r.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Re-review prompts
# ---------------------------------------------------------------------------


def test_re_review_prompt_create_and_respond(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/re-review-prompts", json={
        "triggered_by": "user_request",
        "change_summary": "Personal care service line changed classification",
    })
    assert r.status_code == 200
    prompt = r.json()
    assert prompt["user_response"] is None

    # List — status=open filter must include this new prompt
    r = session.get(f"{BASE}/api/cpr2/participants/{pid}/re-review-prompts?status=open")
    assert r.status_code == 200
    assert prompt["id"] in [p["id"] for p in r.json()["prompts"]]

    # Respond → dismissed
    r = session.post(f"{BASE}/api/cpr2/re-review-prompts/{prompt['id']}/user-response", json={"response": "dismissed"})
    assert r.status_code == 200
    assert r.json()["user_response"] == "dismissed"
    assert r.json()["user_responded_at"] is not None

    # Cleanup
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    db.re_review_prompts.delete_one({"id": prompt["id"]})


def test_re_review_prompt_defer_persists_date(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/re-review-prompts", json={
        "triggered_by": "user_request",
    })
    prid = r.json()["id"]
    r = session.post(f"{BASE}/api/cpr2/re-review-prompts/{prid}/user-response",
                     json={"response": "deferred_to_date", "deferred_until": "2027-01-01"})
    assert r.status_code == 200
    assert r.json()["deferred_until"] == "2027-01-01"

    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    db.re_review_prompts.delete_one({"id": prid})


def test_re_review_prompt_rejects_bad_response(session, pid):
    r = session.post(f"{BASE}/api/cpr2/participants/{pid}/re-review-prompts", json={
        "triggered_by": "user_request",
    })
    prid = r.json()["id"]
    r = session.post(f"{BASE}/api/cpr2/re-review-prompts/{prid}/user-response",
                     json={"response": "nonsense"})
    assert r.status_code == 422

    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]
    db.re_review_prompts.delete_one({"id": prid})


# ---------------------------------------------------------------------------
# LCA-1 subscriber — publishing a change affecting support_plan_reviewer
# must create ReReviewPrompt rows for every participant with a plan review.
# ---------------------------------------------------------------------------


def test_lca1_publish_fires_cpr2_re_review_prompts(session, pid):
    """Direct invocation of the CPR-2 subscriber (skips the 2FA-gated admin
    publish path). Seeds a plan_review row for cathy's participant then calls
    `cpr2_on_lca1_publish` with a synthetic change; asserts one prompt
    created and idempotent on repeat.
    """
    import asyncio
    from pymongo import MongoClient
    from motor.motor_asyncio import AsyncIOMotorClient
    import sys
    sys.path.insert(0, "/app/backend")
    from routes.cpr2 import init_cpr2_routes, cpr2_on_lca1_publish

    load_dotenv("/app/backend/.env")
    mongo = MongoClient(os.environ["MONGO_URL"])
    db = mongo[os.environ["DB_NAME"]]

    # Wire the module with a Motor client for the async subscriber.
    async_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    async_db = async_client[os.environ["DB_NAME"]]

    async def _noop_assert(*_a, **_kw): return None
    async def _noop_write(*_a, **_kw): return None
    init_cpr2_routes(db=async_db, user_dep=_noop_assert,
                     core1_assert_access=_noop_assert,
                     core1_write_timeline=_noop_write)

    prid = str(uuid.uuid4())
    change_id = str(uuid.uuid4())
    db.plan_reviews.insert_one({
        "id": prid, "participant_id": pid, "household_id": None,
        "created_at": datetime.now(timezone.utc),
    })
    try:
        change = {
            "id": change_id,
            "title": "Personal care reclassification (test)",
            "affects_wayly_tools": ["support_plan_reviewer"],
        }
        # First call — should create at least 1 prompt (for cathy's participant).
        res1 = asyncio.get_event_loop().run_until_complete(cpr2_on_lca1_publish(change))
        assert res1.get("created", 0) >= 1
        assert "support_plan_reviewer" in res1.get("tool_slugs_matched", [])

        # Second call — idempotent (no new prompts).
        res2 = asyncio.get_event_loop().run_until_complete(cpr2_on_lca1_publish(change))
        assert res2.get("created", 0) == 0

        # Prompt visible via API to cathy
        r = session.get(f"{BASE}/api/cpr2/participants/{pid}/re-review-prompts?status=open")
        assert r.status_code == 200
        matches = [p for p in r.json()["prompts"] if p.get("lca_1_change_id") == change_id]
        assert len(matches) == 1
        assert matches[0]["triggered_by"] == "legislative_change"
    finally:
        db.re_review_prompts.delete_many({"lca_1_change_id": change_id})
        db.plan_reviews.delete_one({"id": prid})


def test_change_not_affecting_cpr2_creates_no_prompts():
    """A change with affects_wayly_tools NOT containing support_plan_reviewer
    or care_plan_reviewer must produce zero re-review prompts."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    import sys
    sys.path.insert(0, "/app/backend")
    from routes.cpr2 import init_cpr2_routes, cpr2_on_lca1_publish

    load_dotenv("/app/backend/.env")
    async_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    async_db = async_client[os.environ["DB_NAME"]]

    async def _noop(*_a, **_kw): return None
    init_cpr2_routes(db=async_db, user_dep=_noop, core1_assert_access=_noop, core1_write_timeline=_noop)

    change = {
        "id": str(uuid.uuid4()),
        "title": "Contribution rates (test)",
        "affects_wayly_tools": ["contribution_estimator"],
    }
    res = asyncio.get_event_loop().run_until_complete(cpr2_on_lca1_publish(change))
    assert res.get("created", 0) == 0
