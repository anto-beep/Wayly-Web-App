"""QP-1 v1 (Quarterly Pacing) backend tests.

Covers ServiceSchedule CRUD, LedgerEntry state transitions, ad-hoc entries,
auto-assume, pacing computation, auth & ownership rules.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta, date

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def participant_id(headers):
    # find Dorothy from cathy's participants list
    r = requests.get(f"{API}/participants", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    parts = r.json() if isinstance(r.json(), list) else r.json().get("participants") or r.json().get("items") or []
    assert parts, f"no participants for cathy: {r.text[:400]}"
    return parts[0].get("id")


@pytest.fixture(scope="module")
def created_schedule(headers, participant_id):
    today = date.today().isoformat()
    body = {
        "participant_id": participant_id,
        "service_type": "TEST_Cleaning",
        "provider_name": "TEST_Provider",
        "cadence": "weekly",
        "cadence_day": 1,  # Tuesday
        "duration_hours": 1.5,
        "hourly_rate": 72.5,
        "effective_from": today,
    }
    r = requests.post(f"{API}/qp1/schedules", headers=headers, json=body, timeout=15)
    assert r.status_code == 200, f"create schedule failed: {r.status_code} {r.text}"
    return r.json()


# ---------- auth ----------
def test_qp1_requires_auth():
    r = requests.get(f"{API}/qp1/schedules?participant_id=x", timeout=10)
    assert r.status_code == 401


# ---------- SCHEDULES ----------
def test_create_schedule_materialises_ledger(created_schedule):
    assert "schedule" in created_schedule
    sched = created_schedule["schedule"]
    assert sched["expected_amount"] == round(1.5 * 72.5, 2)
    assert created_schedule["ledger_entries_created"] >= 1, "expected weekly ledger entries in current quarter"


def test_list_schedules(headers, participant_id, created_schedule):
    r = requests.get(f"{API}/qp1/schedules", headers=headers,
                     params={"participant_id": participant_id}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    ids = [s["id"] for s in data["schedules"]]
    assert created_schedule["schedule"]["id"] in ids
    # active only
    for s in data["schedules"]:
        assert s["status"] == "active"


def test_update_schedule_recalculates_amount(headers, created_schedule):
    sid = created_schedule["schedule"]["id"]
    r = requests.put(f"{API}/qp1/schedules/{sid}", headers=headers,
                     json={"duration_hours": 2.0, "hourly_rate": 80.0}, timeout=15)
    assert r.status_code == 200
    updated = r.json()["schedule"]
    assert updated["expected_amount"] == 160.0
    assert updated["duration_hours"] == 2.0


def test_ledger_lists_entries(headers, participant_id, created_schedule):
    r = requests.get(f"{API}/qp1/ledger", headers=headers,
                     params={"participant_id": participant_id}, timeout=15)
    assert r.status_code == 200
    data = r.json()
    assert "entries" in data and "window" in data
    entries_for_sched = [e for e in data["entries"] if e.get("schedule_id") == created_schedule["schedule"]["id"]]
    assert entries_for_sched, "expected ledger entries for created schedule"


# ---------- LEDGER TRANSITIONS ----------
@pytest.fixture(scope="module")
def ledger_ids(headers, participant_id, created_schedule):
    r = requests.get(f"{API}/qp1/ledger", headers=headers,
                     params={"participant_id": participant_id}, timeout=15)
    assert r.status_code == 200
    entries = [e for e in r.json()["entries"] if e.get("schedule_id") == created_schedule["schedule"]["id"]]
    assert len(entries) >= 3, f"need at least 3 entries, got {len(entries)}"
    return [e["id"] for e in entries]


def test_confirm_entry(headers, ledger_ids):
    eid = ledger_ids[0]
    r = requests.post(f"{API}/qp1/ledger/{eid}/confirm", headers=headers,
                      json={"notes": "TEST_confirm"}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json()["entry"]["state"] == "confirmed"


def test_missed_entry(headers, ledger_ids):
    eid = ledger_ids[1]
    r = requests.post(f"{API}/qp1/ledger/{eid}/missed", headers=headers,
                      json={"notes": "TEST_missed"}, timeout=15)
    assert r.status_code == 200, r.text
    entry = r.json()["entry"]
    assert entry["state"] == "missed"
    assert entry["actual_amount"] == 0.0


def test_changed_entry(headers, ledger_ids):
    eid = ledger_ids[2]
    r = requests.post(f"{API}/qp1/ledger/{eid}/changed", headers=headers,
                      json={"actual_duration_hours": 3.0, "actual_rate": 100.0}, timeout=15)
    assert r.status_code == 200, r.text
    entry = r.json()["entry"]
    assert entry["state"] == "changed"
    assert entry["actual_amount"] == 300.0


def test_ad_hoc_entry(headers, participant_id):
    body = {
        "participant_id": participant_id,
        "service_type": "TEST_AdHoc",
        "actual_date": date.today().isoformat(),
        "actual_duration_hours": 2.0,
        "actual_rate": 90.0,
        "notes": "TEST_adhoc",
    }
    r = requests.post(f"{API}/qp1/ledger/ad_hoc", headers=headers, json=body, timeout=15)
    assert r.status_code == 200, r.text
    entry = r.json()["entry"]
    assert entry["state"] == "ad_hoc"
    assert entry["actual_amount"] == 180.0
    assert entry["source"] == "user"


def test_auto_assume(headers, participant_id):
    r = requests.post(f"{API}/qp1/ledger/auto_assume", headers=headers,
                      params={"participant_id": participant_id, "days_stale": 7}, timeout=15)
    assert r.status_code == 200, r.text
    assert "assumed" in r.json()


# ---------- PACING ----------
def test_pacing_computes_snapshot(headers, participant_id):
    r = requests.get(f"{API}/qp1/pacing", headers=headers,
                     params={"participant_id": participant_id, "classification": 4}, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    # basic shape
    for k in ("envelope", "actual_spent", "projected_end_of_quarter_total",
              "pace_status", "underspend_flag", "confidence", "quarter"):
        assert k in data, f"missing {k}: {data}"
    assert data["envelope"] > 0
    assert data["pace_status"] in ("green", "amber", "red", "underspend", "unknown")
    assert data["confidence"] in ("high", "medium", "low")
    # projected = actual_spent + expected_remaining
    assert abs(data["projected_end_of_quarter_total"] -
               (data["actual_spent"] + data["expected_remaining_total"])) < 0.05


def test_pacing_envelope_override(headers, participant_id):
    r = requests.get(f"{API}/qp1/pacing", headers=headers,
                     params={"participant_id": participant_id, "envelope_override": 5000}, timeout=15)
    assert r.status_code == 200
    assert r.json()["envelope"] == 5000.0


# ---------- OWNERSHIP / AUTH ----------
def test_ownership_ledger_mutation_forbidden(headers, participant_id, created_schedule):
    """Try mutating a ledger entry belonging to cathy from a fresh (no-account) token: expect 401."""
    r = requests.get(f"{API}/qp1/ledger", headers=headers,
                     params={"participant_id": participant_id}, timeout=15)
    entry_id = r.json()["entries"][0]["id"]
    # No auth
    r2 = requests.post(f"{API}/qp1/ledger/{entry_id}/confirm", json={}, timeout=10)
    assert r2.status_code == 401


# ---------- SCHEDULE DELETE (soft) ----------
def test_delete_schedule_soft_ends(headers, participant_id, created_schedule):
    sid = created_schedule["schedule"]["id"]
    r = requests.delete(f"{API}/qp1/schedules/{sid}", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    # list schedules — should not contain (status=ended is filtered out)
    r2 = requests.get(f"{API}/qp1/schedules", headers=headers,
                      params={"participant_id": participant_id}, timeout=15)
    ids = [s["id"] for s in r2.json()["schedules"]]
    assert sid not in ids
