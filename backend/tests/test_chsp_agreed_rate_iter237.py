"""Iter 237 · CHSP-TOOLS-1 Agreed Rate Schedule + LF-1 correspondence GET."""
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


@pytest.fixture(scope="module")
def profile(h):
    r = requests.get(f"{API}/chsp1/profile", headers=h)
    if r.status_code == 404:
        r2 = requests.post(f"{API}/chsp1/profile", headers=h,
                           json={"current_chsp_status": "on_chsp", "chsp_start_date": "01/01/2025"})
        assert r2.status_code == 200
        return r2.json()["profile"]
    assert r.status_code == 200
    return r.json()["profile"]


# ---- Agreed rate schedule CRUD ----
def test_create_service_entry(h, profile):
    payload = {
        "service_type": "domestic_assistance",
        "provider_name": "Acme Care (TEST_iter237)",
        "hourly_rate_or_fee": 6.0,
        "start_date": "01/01/2026",
        "client_contribution_per_unit": 0,
    }
    r = requests.post(f"{API}/chsp1/service-entries", headers=h, json=payload)
    assert r.status_code == 200, r.text
    se = r.json()["service_entry"]
    assert se["id"]
    assert se["provider_name"] == payload["provider_name"]
    assert se["hourly_rate_or_fee"]["amount"] == 6.0
    assert se["start_date"] == "01/01/2026"
    assert se["is_active"] is True
    pytest.entry_id = se["id"]


def test_list_service_entries_includes_new(h):
    r = requests.get(f"{API}/chsp1/service-entries?is_active=true", headers=h)
    assert r.status_code == 200
    entries = r.json()["service_entries"]
    ids = [e["id"] for e in entries]
    assert pytest.entry_id in ids


def test_patch_service_entry_rate_and_date(h):
    r = requests.patch(
        f"{API}/chsp1/service-entries/{pytest.entry_id}",
        headers=h,
        json={"hourly_rate_or_fee": 7.5, "start_date": "15/03/2026"},
    )
    assert r.status_code == 200, r.text
    se = r.json()["service_entry"]
    assert se["hourly_rate_or_fee"]["amount"] == 7.5
    assert se["start_date"] == "15/03/2026"

    # GET verify persistence
    r2 = requests.get(f"{API}/chsp1/service-entries?is_active=true", headers=h)
    matched = next((e for e in r2.json()["service_entries"] if e["id"] == pytest.entry_id), None)
    assert matched is not None
    assert matched["hourly_rate_or_fee"]["amount"] == 7.5
    assert matched["start_date"] == "15/03/2026"


def test_expire_service_entry(h):
    r = requests.post(f"{API}/chsp1/service-entries/{pytest.entry_id}/expire", headers=h)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "expired"
    assert data["entry_id"] == pytest.entry_id

    # Active list no longer contains it
    r2 = requests.get(f"{API}/chsp1/service-entries?is_active=true", headers=h)
    ids = [e["id"] for e in r2.json()["service_entries"]]
    assert pytest.entry_id not in ids


# ---- LF-1 correspondence GET (mobile editor deep-link) ----
def test_lf1_correspondence_get_after_chsp_letter(h):
    r = requests.post(f"{API}/chsp1/letter", headers=h,
                      json={"kind": "service_continuity", "provider_name": "BlueBerry Care"})
    assert r.status_code == 200
    entry_id = r.json()["entry_id"]
    assert entry_id

    r2 = requests.get(f"{API}/lf1/correspondence/{entry_id}", headers=h)
    assert r2.status_code == 200, r2.text
    body = r2.json()
    # Accept either wrapped or top-level shape
    entry = body.get("entry") or body.get("correspondence") or body
    assert entry.get("id") == entry_id
    assert entry.get("situation_id") == 6
    assert entry.get("status") in ("draft", "in_progress")


def test_lf1_correspondence_get_hardship(h):
    r = requests.post(f"{API}/chsp1/letter", headers=h,
                      json={"kind": "hardship", "provider_name": "BlueBerry Care"})
    assert r.status_code == 200
    entry_id = r.json()["entry_id"]
    r2 = requests.get(f"{API}/lf1/correspondence/{entry_id}", headers=h)
    assert r2.status_code == 200
    entry = r2.json().get("entry") or r2.json().get("correspondence") or r2.json()
    assert entry.get("id") == entry_id
    assert entry.get("situation_id") == 9
