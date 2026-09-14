"""CS-1 v1 acceptance tests (subset of spec Section 5)."""
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
        db.carer_assessments.delete_many({"caregiver_user_id": u["id"]})
        db.carer_handover_packs.delete_many({"caregiver_user_id": u["id"]})
        db.respite_plans.delete_many({"caregiver_user_id": u["id"]})


def test_t1_assessment_creation_persists(session):
    """T1: carer assessment persists with data_residency."""
    r = session.post(f"{BASE}/api/cs1/assessments",
                     json={"self_reported_strengths": ["patience", "organisation"],
                           "constraints_reported": ["time_pressure"]})
    assert r.status_code == 200, r.text
    a = r.json()["assessment"]
    assert "id" in a and a["self_reported_strengths"] == ["patience", "organisation"]
    _cleanup()


def test_t2_field_opt_in_enforced(session):
    """T2: sensitive fields only persist on explicit opt-in."""
    r = session.post(f"{BASE}/api/cs1/assessments",
                     json={"capacity_indicators": {"hours_per_week_caring": 40,
                                                   "has_own_health_conditions": True},
                           "opt_in_health_conditions": False})
    assert r.status_code == 200
    a = r.json()["assessment"]
    assert "has_own_health_conditions" not in a["capacity_indicators"]
    assert a["capacity_indicators"]["hours_per_week_caring"] == 40
    _cleanup()


def test_t15_burnout_composite_high(session):
    """T15: composite signal calculated per rules — severe fatigue → high."""
    r = session.post(f"{BASE}/api/cs1/burnout-check",
                     json={"fatigue_level": "severe",
                           "emotional_exhaustion": "high",
                           "isolation_feelings": "moderate",
                           "sleep_quality": "very_poor",
                           "self_care_time": "none"})
    assert r.status_code == 200
    body = r.json()
    assert body["composite_signal"] == "high"
    assert "lifeline" in body["response"]["recommended_resources"]
    assert "emergency_note" in body["response"]


def test_t15_burnout_composite_low(session):
    """T15: all fine → low signal."""
    r = session.post(f"{BASE}/api/cs1/burnout-check",
                     json={"fatigue_level": "none",
                           "emotional_exhaustion": "none",
                           "isolation_feelings": "none",
                           "sleep_quality": "good",
                           "self_care_time": "adequate"})
    assert r.status_code == 200
    assert r.json()["composite_signal"] == "low"


def test_t21_support_service_directory(session):
    """T21: directory renders with curated services + featured helplines."""
    r = session.get(f"{BASE}/api/cs1/support-services")
    assert r.status_code == 200
    svcs = r.json()["services"]
    slugs = {s["slug"] for s in svcs}
    assert {"carer_gateway", "lifeline", "1800respect", "opan"}.issubset(slugs)


def test_t22_directory_category_filter(session):
    """T22: category filter works."""
    r = session.get(f"{BASE}/api/cs1/support-services?category=crisis_support")
    assert r.status_code == 200
    for s in r.json()["services"]:
        assert s["category"] == "crisis_support"


def test_t27_respite_plan_creation(session):
    """T27: respite plan creation persists."""
    r = session.post(f"{BASE}/api/cs1/respite-plans",
                     json={"respite_type": "day_respite",
                           "planned_start_date": "2026-09-01",
                           "planned_end_date": "2026-09-05",
                           "budget_source": "standard_sah_budget",
                           "participant_confirmed_awareness": True})
    assert r.status_code == 200
    plan = r.json()["plan"]
    assert plan["respite_type"] == "day_respite"
    assert plan["status"] == "planning"
    _cleanup()


def test_t32_handover_pack_creation_opt_in_medical(session):
    """T32-T33: handover pack creation with opt-in fields; medical requires opt-in."""
    r = session.post(f"{BASE}/api/cs1/handover-packs",
                     json={"my_routines": "Morning: breakfast at 8am, meds at 9am.",
                           "my_medical_needs": "Type 2 diabetes; carer needs to know",
                           "opt_in_medical": False})
    assert r.status_code == 200
    pack = r.json()["pack"]
    assert pack["my_routines"] is not None
    assert pack["my_medical_needs"] is None  # opt-in was False
    _cleanup()

    r = session.post(f"{BASE}/api/cs1/handover-packs",
                     json={"my_medical_needs": "Diabetes",
                           "opt_in_medical": True})
    assert r.status_code == 200
    assert r.json()["pack"]["my_medical_needs"] == "Diabetes"
    _cleanup()


def test_t5_retention_extension(session):
    """T5: retention extension by caregiver persists."""
    r = session.post(f"{BASE}/api/cs1/assessments", json={})
    aid = r.json()["assessment"]["id"]
    r = session.post(f"{BASE}/api/cs1/assessments/{aid}/extend-retention")
    assert r.status_code == 200
    assert r.json()["extended"] is True
    _cleanup()
