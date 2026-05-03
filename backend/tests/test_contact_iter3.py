"""Iteration 3 — /api/contact + regression on existing public tools + login."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")


def _ip(n):
    return {"x-forwarded-for": f"10.123.0.{n}"}


def test_contact_demo_submit():
    payload = {
        "name": "TEST Demo User",
        "email": "test_demo@example.com",
        "role": "advisor",
        "intent": "demo",
        "biggest_pain": "Statements take too long",
        "preferred_time": "morning",
        "phone": "0400000000",
        "size": "25 clients",
        "success_in_six_months": "Calmer team",
    }
    r = requests.post(f"{BASE_URL}/api/contact", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert data.get("intent") == "demo"


def test_contact_general_submit():
    payload = {
        "name": "TEST General User",
        "email": "test_general@example.com",
        "role": "family",
        "intent": "general",
        "context": "Just a question",
    }
    r = requests.post(f"{BASE_URL}/api/contact", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("ok") is True
    assert data.get("intent") == "general"


# ----- Regression on public AI tools -----
def test_public_budget_calc():
    r = requests.post(
        f"{BASE_URL}/api/public/budget-calc",
        json={"classification": 4, "is_grandfathered": False, "current_lifetime_balance": 0},
        headers=_ip(1),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["classification"] == 4
    assert d["annual_total"] > 0


def test_public_price_check():
    r = requests.post(
        f"{BASE_URL}/api/public/price-check",
        json={"service": "Personal care", "rate": 90.0},
        headers=_ip(2),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "verdict" in d and "median" in d


def test_public_classification_check():
    r = requests.post(
        f"{BASE_URL}/api/public/classification-check",
        json={"answers": [2] * 12},
        headers=_ip(3),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "score" in d and "likely_low" in d


def test_public_contribution_estimator():
    r = requests.post(
        f"{BASE_URL}/api/public/contribution-estimator",
        json={
            "classification": 4,
            "pension_status": "part",
            "is_grandfathered": False,
            "expected_mix_clinical_pct": 30,
            "expected_mix_independence_pct": 45,
            "expected_mix_everyday_pct": 25,
        },
        headers=_ip(4),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "annual_contribution" in d


def test_public_decode_text():
    sample = "Statement period: 1 Jan - 31 Mar 2026\nDate,Service,Units,Rate,Total\n2026-01-05,Personal care,2,84.00,168.00\n"
    r = requests.post(
        f"{BASE_URL}/api/public/decode-statement-text",
        json={"text": sample},
        headers=_ip(5),
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "summary" in d


def test_public_reassessment_letter():
    r = requests.post(
        f"{BASE_URL}/api/public/reassessment-letter",
        json={
            "participant_name": "Dorothy Anderson",
            "current_classification": 4,
            "changes_summary": "Multiple falls in last 3 months and increased confusion at night.",
            "sender_name": "Cathy Anderson",
            "relationship": "daughter",
        },
        headers=_ip(6),
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "letter" in d and len(d["letter"]) > 100


def test_public_care_plan_review():
    sample = (
        "Care plan for participant: Goals — maintain independence at home. Services: "
        "personal care 3x/week, physio fortnightly. Review: 2026-06-01. Worker preferences: female."
    ) * 3
    r = requests.post(
        f"{BASE_URL}/api/public/care-plan-review",
        json={"text": sample},
        headers=_ip(7),
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "summary" in d


def test_public_family_coordinator():
    r = requests.post(
        f"{BASE_URL}/api/public/family-coordinator-chat",
        json={"message": "What is Support at Home?"},
        headers=_ip(8),
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "reply" in d and len(d["reply"]) > 0


# ----- Auth regression -----
def test_login_cathy():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert "token" in d and d["user"]["email"] == "cathy@example.com"
