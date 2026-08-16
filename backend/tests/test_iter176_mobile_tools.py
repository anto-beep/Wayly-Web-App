"""Iter 176: verify backend endpoints powering the 3 mobile tools
(Statement Decoder / Budget & Lifetime Cap Calculator / Classification Self-Check)."""
import os, time
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-exact-parity.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
EMAIL = "cathy@example.com"
PWD = "testpass123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PWD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="session")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# --- Budget Calculator ---
def test_budget_calc_class4(headers):
    r = requests.post(f"{API}/public/budget-calc", headers=headers, timeout=15,
                      json={"classification": 4, "is_grandfathered": False,
                            "current_lifetime_balance": 500, "expected_annual_burn": 1500,
                            "applicable_supplements": None})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("annual_total") == 29696 or round(d.get("annual_total"), 0) == 29696
    assert d.get("quarterly_usable")
    assert d.get("care_management_quarterly")
    assert "streams" in d and len(d["streams"]) >= 3
    assert d.get("lifetime_cap")


def test_budget_calc_with_supplements(headers):
    r = requests.post(f"{API}/public/budget-calc", headers=headers, timeout=15,
                      json={"classification": 4, "is_grandfathered": False,
                            "current_lifetime_balance": 0, "expected_annual_burn": None,
                            "applicable_supplements": ["oxygen", "enteral_bolus"]})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("annual_supplements_total") and d["annual_supplements_total"] > 0
    assert d.get("annual_total_with_supplements") > d.get("annual_total")


def test_budget_calc_grandfathered_cap(headers):
    r = requests.post(f"{API}/public/budget-calc", headers=headers, timeout=15,
                      json={"classification": 4, "is_grandfathered": True,
                            "current_lifetime_balance": 0, "expected_annual_burn": None,
                            "applicable_supplements": None})
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("lifetime_cap") in (86185.23, 86185.24, 86185) or round(d["lifetime_cap"], 0) == 86185


# --- Classification Self-Check ---
def test_csc_run_all_answered(headers):
    ids = [
        "Q1_self_care_shower","Q2_self_care_dress","Q3_self_care_mobility","Q4_self_care_continence",
        "Q5_iadl_meals","Q6_iadl_cleaning_laundry","Q7_iadl_medication","Q8_iadl_shopping","Q9_iadl_transport",
        "Q10_cognition","Q11_mood","Q12_behaviour","Q13_falls_6mo","Q14_hospital_12mo",
        "Q15_home_environment","Q16_informal_support",
    ]
    answers = {q: "moderate" for q in ids}
    answers["Q12_behaviour"] = "sometimes"
    answers["Q13_falls_6mo"] = "one"
    answers["Q14_hospital_12mo"] = "zero"
    answers["Q16_informal_support"] = "a_little"
    r = requests.post(f"{API}/public/csc/run", headers=headers, timeout=30,
                      json={"persona": "caregiver", "current_classification": 4, "answers": answers})
    assert r.status_code == 200, r.text
    d = r.json()
    # accept any of the potential result-shape keys the mobile UI reads
    label = d.get("classification", {}).get("label") if isinstance(d.get("classification"), dict) else None
    label = label or d.get("likely_classification_label") or d.get("band_label")
    assert label, f"No classification label in response: {d}"


# --- Statement Decoder ---
def test_decode_statement_text(headers):
    sample = ("Home Care Package monthly statement\n"
              "Personal care 5 hrs @ $85.00 = $425.00\n"
              "Domestic assistance 2 hrs @ $75.00 = $150.00\n"
              "Care management fee = $180.00\n"
              "Package management fee = $95.00\n"
              "Total: $850.00\n")
    r = requests.post(f"{API}/public/decode-statement-text", headers=headers, timeout=20,
                      json={"text": sample})
    assert r.status_code == 200, r.text
    jid = r.json().get("job_id")
    assert jid
    # poll
    final = None
    for _ in range(30):
        time.sleep(2)
        jr = requests.get(f"{API}/public/decode-job/{jid}", headers=headers, timeout=15)
        if jr.status_code != 200:
            continue
        j = jr.json()
        if j.get("status") == "done":
            final = j.get("result"); break
        if j.get("status") == "error":
            pytest.fail(f"decode-job errored: {j}")
    assert final, "decode-job did not finish in time"
    assert "line_items" in final or "summary" in final or "anomalies" in final
