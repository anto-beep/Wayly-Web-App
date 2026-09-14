"""PPC-3 v1 acceptance tests (subset of spec Section 5)."""
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
    assert r.status_code == 200, r.text
    token = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture()
def provider_name():
    # Unique per test to keep aggregations isolated.
    return f"TestProv-{uuid.uuid4().hex[:8]}"


def _cleanup(provider_norm):
    from pymongo import MongoClient
    load_dotenv("/app/backend/.env")
    m = MongoClient(os.environ["MONGO_URL"])
    db = m[os.environ["DB_NAME"]]
    db.provider_quality_profiles.delete_many({"provider_name_normalised": provider_norm})
    db.wayly_provider_survey_responses.delete_many({"provider_name_normalised": provider_norm})
    db.provider_response_submissions.delete_many({"provider_name_normalised": provider_norm})


def test_t4_profile_creation_persists(session, provider_name):
    """T4: profile creation persists with data_residency."""
    r = session.get(f"{BASE}/api/ppc3/providers/{provider_name}/quality-profile")
    assert r.status_code == 200, r.text
    profile = r.json()["profile"]
    assert profile["provider_name_normalised"] == provider_name.lower()
    assert profile["composite_quality_summary"]["overall_signal"] == "insufficient_data_for_summary"
    _cleanup(provider_name.lower())


def test_t21_composite_many_positive_signals(session, provider_name):
    """T21: many positive signals rule triggers correctly."""
    # Set ACQSC compliant + Star Ratings 4
    r = session.patch(f"{BASE}/api/ppc3/providers/{provider_name}/acqsc-status",
                      json={"current_status": "compliant"})
    assert r.status_code == 200
    r = session.patch(f"{BASE}/api/ppc3/providers/{provider_name}/star-ratings",
                      json={"overall_rating": 4})
    assert r.status_code == 200
    prof = r.json()["profile"]["composite_quality_summary"]
    # Only 2 signals; need 3 for many_positive
    assert prof["overall_signal"] == "mixed_signals"
    # Add 5+ Wayly survey responses with variance
    for rating, rec in [(4, True), (5, True), (5, True), (4, False), (5, True)]:
        r = session.post(f"{BASE}/api/ppc3/survey-responses",
                         json={"provider_name": provider_name,
                               "care_quality": rating, "communication": rating,
                               "billing_accuracy": rating, "worker_reliability": rating,
                               "would_recommend": rec})
        assert r.status_code == 200
    r = session.get(f"{BASE}/api/ppc3/providers/{provider_name}/quality-profile")
    prof = r.json()["profile"]["composite_quality_summary"]
    assert prof["overall_signal"] == "many_positive_signals", prof
    _cleanup(provider_name.lower())


def test_t22_composite_several_concerns(session, provider_name):
    """T22: several concerns rule triggers when ACQSC non_compliant + Star < 2."""
    session.patch(f"{BASE}/api/ppc3/providers/{provider_name}/acqsc-status",
                  json={"current_status": "non_compliant"})
    r = session.patch(f"{BASE}/api/ppc3/providers/{provider_name}/star-ratings",
                      json={"overall_rating": 1})
    assert r.status_code == 200
    prof = r.json()["profile"]["composite_quality_summary"]
    assert prof["overall_signal"] == "several_concerns"
    _cleanup(provider_name.lower())


def test_t17_survey_threshold_not_published(session, provider_name):
    """T17: aggregation not published below 5-response threshold."""
    for i in range(3):
        r = session.post(f"{BASE}/api/ppc3/survey-responses",
                         json={"provider_name": provider_name,
                               "care_quality": 4, "communication": 4,
                               "billing_accuracy": 4, "worker_reliability": 4,
                               "would_recommend": True})
        assert r.status_code == 200
    r = session.get(f"{BASE}/api/ppc3/providers/{provider_name}/wayly-aggregate")
    agg = r.json()["aggregate"]
    assert agg["threshold_met_for_publication"] is False
    assert agg["survey_response_count"] == 3
    _cleanup(provider_name.lower())


def test_t18_variance_threshold_enforced(session, provider_name):
    """T18: identical responses fail variance threshold."""
    for _ in range(5):
        r = session.post(f"{BASE}/api/ppc3/survey-responses",
                         json={"provider_name": provider_name,
                               "care_quality": 4, "communication": 4,
                               "billing_accuracy": 4, "worker_reliability": 4,
                               "would_recommend": True})
        assert r.status_code == 200
    r = session.get(f"{BASE}/api/ppc3/providers/{provider_name}/wayly-aggregate")
    agg = r.json()["aggregate"]
    assert agg["survey_response_count"] == 5
    assert agg["response_variance_meets_privacy_threshold"] is False
    _cleanup(provider_name.lower())


def test_t28_provider_response_verification_flow(session, provider_name):
    """T28-T30: response submission requires verification; publish appends inline."""
    session.get(f"{BASE}/api/ppc3/providers/{provider_name}/quality-profile")
    r = session.post(f"{BASE}/api/ppc3/public/provider-responses",
                     json={"provider_name": provider_name,
                           "submitter_name": "Jane Provider",
                           "submitter_role": "Operations Manager",
                           "submitter_email": "jane@testprov.example",
                           "submitter_organisation_confirmation": "authorised signatory",
                           "response_content": "We take these concerns seriously.",
                           "responding_to_signal_type": "acqsc_compliance_status",
                           "responding_to_signal_reference": ""})
    assert r.status_code == 200
    sub_id = r.json()["submission_id"]
    token = r.json()["verification_token"]
    assert r.json()["verified"] is False

    # Attempt publish before verify → 422
    r = session.post(f"{BASE}/api/ppc3/provider-responses/{sub_id}/publish")
    assert r.status_code == 422

    # Verify
    r = session.post(f"{BASE}/api/ppc3/public/provider-responses/{sub_id}/verify",
                     json={"verification_token": token})
    assert r.status_code == 200

    # Now publish
    r = session.post(f"{BASE}/api/ppc3/provider-responses/{sub_id}/publish")
    assert r.status_code == 200

    r = session.get(f"{BASE}/api/ppc3/providers/{provider_name}/quality-profile")
    responses = r.json()["profile"]["provider_responses"]
    assert len(responses) == 1
    assert responses[0]["submitter_name"] == "Jane Provider"
    _cleanup(provider_name.lower())


def test_t27_provider_notification_window(session, provider_name):
    """T27: notify-publication sets 30-day response window."""
    r = session.post(f"{BASE}/api/ppc3/providers/{provider_name}/notify-publication")
    assert r.status_code == 200
    assert r.json()["notified_at"] is not None
    assert r.json()["response_window_expires_at"] is not None
    _cleanup(provider_name.lower())


def test_t37_comparison_shows_multiple_providers(session):
    """T37: comparison view returns side-by-side profiles."""
    p1 = f"CompA-{uuid.uuid4().hex[:6]}"
    p2 = f"CompB-{uuid.uuid4().hex[:6]}"
    r = session.post(f"{BASE}/api/ppc3/provider-comparison",
                     json={"provider_names": [p1, p2]})
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 2
    assert len(body["comparison"]) == 2
    _cleanup(p1.lower())
    _cleanup(p2.lower())
