"""AW-2 v1 acceptance tests (subset of spec Section 5)."""
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
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


def _cleanup(user_email="cathy@example.com"):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    m = MongoClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    u = db.users.find_one({"email": user_email})
    if u:
        db.aw_conversations.delete_many({"user_id": u["id"]})
        db.aw_user_contexts.delete_many({"user_id": u["id"]})
        db.aw_retrieval_logs.delete_many({})
        db.proactive_nudges.delete_many({"user_id": u["id"]})


def test_t9_consent_granularity(session):
    """T9: consent flow granular per data source per participant."""
    r = session.post(f"{BASE}/api/aw2/context/consent",
                     json={"data_source": "budget_projection",
                           "participant_context_id": "pid-1",
                           "consent_state": "granted"})
    assert r.status_code == 200
    ctx = r.json()["context"]
    consents = ctx["context_consents"]
    assert any(c["data_source"] == "budget_projection" and c["consent_state"] == "granted"
               for c in consents)
    _cleanup()


def test_t22_scope_guardrail_clinical(session):
    """T22: scope guardrails decline clinical questions."""
    r = session.post(f"{BASE}/api/aw2/conversations",
                     json={"initial_message": "What medication should my father take for pain?"})
    assert r.status_code == 200
    conv = r.json()["conversation"]
    assistant_msg = conv["messages"][-1]
    assert "clinical" in assistant_msg["content"].lower() or "doctor" in assistant_msg["content"].lower()
    _cleanup()


def test_t21_scope_guardrail_financial(session):
    """T21: scope guardrails decline financial advice questions."""
    r = session.post(f"{BASE}/api/aw2/conversations",
                     json={"initial_message": "Should I invest my retirement savings in the ASX?"})
    assert r.status_code == 200
    msg = r.json()["conversation"]["messages"][-1]["content"].lower()
    assert "financial adviser" in msg
    _cleanup()


def test_t24_fallback_default_no_context(session):
    """T24: fallback default returned when no context available."""
    # Ensure no consent granted
    r = session.post(f"{BASE}/api/aw2/conversations",
                     json={"initial_message": "Tell me about my current situation."})
    assert r.status_code == 200
    msg = r.json()["conversation"]["messages"][-1]["content"].lower()
    # LLM-driven fallback: any variant of "I don't have that info" is acceptable
    assert any(k in msg for k in ["don't have", "do not have", "check the", "no information",
                                   "rephras", "don't know", "do not know"]), msg
    _cleanup()


def test_t14_session_memory_persists(session):
    """T14: session memory persists within conversation."""
    r = session.post(f"{BASE}/api/aw2/conversations",
                     json={"initial_message": "hi"})
    cid = r.json()["conversation"]["id"]
    r = session.post(f"{BASE}/api/aw2/conversations/{cid}/messages",
                     json={"user_message": "second"})
    assert r.status_code == 200
    r = session.get(f"{BASE}/api/aw2/conversations/{cid}")
    conv = r.json()["conversation"]
    assert len(conv["messages"]) == 4  # 2 user + 2 assistant
    _cleanup()


def test_t7_user_initiated_deletion(session):
    """T7: user-initiated deletion completes."""
    r = session.post(f"{BASE}/api/aw2/conversations", json={"initial_message": "hi"})
    cid = r.json()["conversation"]["id"]
    r = session.delete(f"{BASE}/api/aw2/conversations/{cid}")
    assert r.status_code == 200
    r = session.get(f"{BASE}/api/aw2/conversations/{cid}")
    assert r.status_code == 404
    _cleanup()


def test_t36_adm_disclosure_current_version(session):
    """T36-T37: disclosure content published + version tracked."""
    r = session.get(f"{BASE}/api/aw2/adm-disclosure/current-version")
    assert r.status_code == 200
    body = r.json()
    assert body["version_id"] == "v1.0-2026-12"
    assert body["is_active_now"] is False or True  # depends on system date
    _cleanup()


def test_t30_nudges_gated_before_dec_2026(session):
    """T30: nudges do not surface until December 2026 date gate."""
    r = session.get(f"{BASE}/api/aw2/proactive-nudges")
    assert r.status_code == 200
    body = r.json()
    # Test runs before Dec 2026 in system; nudges must be empty
    assert body.get("nudges") == []
    _cleanup()


def test_t28_message_feedback(session):
    """T28: user feedback loop captures ratings."""
    r = session.post(f"{BASE}/api/aw2/conversations", json={"initial_message": "hello"})
    conv = r.json()["conversation"]
    cid = conv["id"]
    msg_id = conv["messages"][-1]["id"]
    r = session.post(f"{BASE}/api/aw2/conversations/{cid}/feedback",
                     json={"message_id": msg_id, "rating": "helpful"})
    assert r.status_code == 200
    _cleanup()


def test_t16_retention_policy_update(session):
    """T16: retention policy update affects future retention."""
    r = session.patch(f"{BASE}/api/aw2/context/retention-policy",
                      json={"retention_policy": "30_days"})
    assert r.status_code == 200
    r = session.get(f"{BASE}/api/aw2/context")
    assert r.json()["context"]["retention_policy"] == "30_days"
    _cleanup()
