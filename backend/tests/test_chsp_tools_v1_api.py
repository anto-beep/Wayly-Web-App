"""CHSP-TOOLS-1 WS-1 + WS-3 backend API tests against the shared backend."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-checker-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": "cathy@example.com", "password": "testpass123"})
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_config_flag(h):
    r = requests.get(f"{API}/chsp1/config", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data.get("chsp_tools_v1") is True


def test_profile_exists_or_create(h):
    r = requests.get(f"{API}/chsp1/profile", headers=h)
    if r.status_code == 404:
        r2 = requests.post(f"{API}/chsp1/profile", headers=h, json={"current_chsp_status": "on_chsp"})
        assert r2.status_code == 200
    else:
        assert r.status_code == 200


def test_fix1_within(h):
    r = requests.post(f"{API}/chsp1/fee-check/preview", headers=h, json={
        "agreed_rate": 6, "units_received": 4, "units_billed": 4, "billed_amount": 24
    })
    assert r.status_code == 200, r.text
    res = r.json()["result"]
    assert res["overall_verdict"] == "within"
    assert res["dispute_offered"] is False


def test_fix2_material(h):
    r = requests.post(f"{API}/chsp1/fee-check/preview", headers=h, json={
        "agreed_rate": 6, "units_received": 1, "units_billed": 1, "billed_amount": 10
    })
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["overall_verdict"] == "material"
    assert res["billed_per_unit"] == "10.00"
    assert res["amount_delta"] == "4.00"
    assert res["dispute_offered"] is True


def test_fix3_units_material(h):
    r = requests.post(f"{API}/chsp1/fee-check/preview", headers=h, json={
        "agreed_rate": 6, "units_received": 4, "units_billed": 5, "billed_amount": 30
    })
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["units_tier"] == "material"
    assert res["amount_delta"] == "6.00"
    assert res["overall_verdict"] == "material"


def test_fix4_degraded(h):
    r = requests.post(f"{API}/chsp1/fee-check/preview", headers=h, json={
        "agreed_rate": None, "units_received": 4, "units_billed": 4, "billed_amount": 24
    })
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["degraded"] is True
    assert res["overall_verdict"] == "no_verdict"
    assert res["prompt_add_agreed_rate"] is True


def test_fix5_provisional(h):
    r = requests.post(f"{API}/chsp1/fee-check/preview", headers=h, json={
        "agreed_rate": 6, "units_received": 4, "units_billed": 4, "billed_amount": 24,
        "rate_effective_date": "01/01/2026", "billed_period_start": "01/07/2026"
    })
    assert r.status_code == 200
    res = r.json()["result"]
    assert res["rate_age_days"] == 181
    assert res["provisional"] is True
    assert res["overall_verdict"] == "within"


def test_letter_service_continuity(h):
    r = requests.post(f"{API}/chsp1/letter", headers=h, json={"kind": "service_continuity", "provider_name": "BlueBerry Care"})
    assert r.status_code == 200
    d = r.json()
    assert d.get("editor_path", "").startswith("/tools/letters-and-follow-ups/")
    assert d.get("entry_id")


def test_letter_hardship(h):
    r = requests.post(f"{API}/chsp1/letter", headers=h, json={"kind": "hardship", "provider_name": "BlueBerry Care"})
    assert r.status_code == 200
    d = r.json()
    assert d.get("editor_path", "").startswith("/tools/letters-and-follow-ups/")
    assert d.get("kind") == "hardship"
    assert d.get("situation_id") == 9
