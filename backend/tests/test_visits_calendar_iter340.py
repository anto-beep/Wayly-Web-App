"""Iter 340 — Phase B Calendar Overhaul backend tests.

Covers:
- /api/visits CRUD (GET/POST/PATCH/DELETE)
- VisitBody accepts new kinds + all_day boolean
- VisitBody rejects invalid kind with 422
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
LOGIN = {"email": "cathy@example.com", "password": "testpass123"}

NEW_KINDS = [
    "gp", "specialist", "allied_health", "nurse", "home_visit", "telehealth",
    "assessment", "social_support", "transport", "respite", "medication",
    "reminder", "personal", "other",
]


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=LOGIN, timeout=90)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_ids():
    return []


def test_list_visits(headers):
    r = requests.get(f"{BASE_URL}/api/visits", headers=headers, timeout=30)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)


def test_create_visit_basic(headers, created_ids):
    payload = {
        "title": "TEST_iter340 basic appointment",
        "starts_at": "2026-10-15T10:00:00Z",
        "duration_minutes": 30,
        "kind": "appointment",
    }
    r = requests.post(f"{BASE_URL}/api/visits", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d["title"] == payload["title"]
    assert d["kind"] == "appointment"
    assert d["duration_minutes"] == 30
    assert d["status"] == "active"
    assert d.get("all_day") is False
    assert "id" in d
    created_ids.append(d["id"])


@pytest.mark.parametrize("kind", NEW_KINDS)
def test_create_visit_accepts_new_kind(headers, created_ids, kind):
    payload = {
        "title": f"TEST_iter340 kind={kind}",
        "starts_at": "2026-10-16T09:00:00Z",
        "duration_minutes": 45,
        "kind": kind,
        "all_day": False,
    }
    r = requests.post(f"{BASE_URL}/api/visits", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, f"{kind} rejected: {r.status_code} {r.text[:200]}"
    d = r.json()
    assert d["kind"] == kind
    created_ids.append(d["id"])


def test_create_visit_all_day_true(headers, created_ids):
    payload = {
        "title": "TEST_iter340 all-day",
        "starts_at": "2026-10-17T00:00:00Z",
        "duration_minutes": 60,
        "kind": "reminder",
        "all_day": True,
    }
    r = requests.post(f"{BASE_URL}/api/visits", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d["all_day"] is True
    created_ids.append(d["id"])


def test_create_visit_rejects_invalid_kind(headers):
    payload = {
        "title": "TEST_iter340 bad kind",
        "starts_at": "2026-10-18T10:00:00Z",
        "duration_minutes": 30,
        "kind": "not_a_real_kind_xyz",
    }
    r = requests.post(f"{BASE_URL}/api/visits", headers=headers, json=payload, timeout=30)
    assert r.status_code == 422, f"expected 422, got {r.status_code}: {r.text[:200]}"


def test_custom_duration_minutes(headers, created_ids):
    # Duration presets 15/30/45/60/90/... plus custom (e.g. 22)
    payload = {
        "title": "TEST_iter340 custom duration",
        "starts_at": "2026-10-19T14:00:00Z",
        "duration_minutes": 22,
        "kind": "personal",
    }
    r = requests.post(f"{BASE_URL}/api/visits", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d["duration_minutes"] == 22
    created_ids.append(d["id"])


def test_update_visit_and_persist(headers, created_ids):
    vid = created_ids[0]
    payload = {
        "title": "TEST_iter340 basic appointment UPDATED",
        "starts_at": "2026-10-15T11:00:00Z",
        "duration_minutes": 90,
        "kind": "specialist",
        "notes": "updated by iter340 tests",
    }
    r = requests.patch(f"{BASE_URL}/api/visits/{vid}", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text[:200]
    d = r.json()
    assert d["title"].endswith("UPDATED")
    assert d["kind"] == "specialist"
    assert d["duration_minutes"] == 90

    # Verify persistence via list
    r2 = requests.get(f"{BASE_URL}/api/visits", headers=headers, timeout=30)
    assert r2.status_code == 200
    found = next((v for v in r2.json() if v["id"] == vid), None)
    assert found is not None
    assert found["kind"] == "specialist"
    assert found["duration_minutes"] == 90


def test_cancel_visit_via_status(headers, created_ids):
    # UI "cancel" sets status=cancelled via PATCH
    vid = created_ids[1]
    payload = {
        "title": "TEST_iter340 to-cancel",
        "starts_at": "2026-10-16T09:00:00Z",
        "duration_minutes": 45,
        "kind": "gp",
        "status": "cancelled",
    }
    r = requests.patch(f"{BASE_URL}/api/visits/{vid}", headers=headers, json=payload, timeout=30)
    assert r.status_code == 200, r.text[:200]
    assert r.json()["status"] == "cancelled"


def test_delete_visits_cleanup(headers, created_ids):
    for vid in created_ids:
        r = requests.delete(f"{BASE_URL}/api/visits/{vid}", headers=headers, timeout=30)
        assert r.status_code in (200, 404), f"delete {vid}: {r.status_code} {r.text[:200]}"

    # Verify one is gone
    r = requests.delete(f"{BASE_URL}/api/visits/{created_ids[0]}", headers=headers, timeout=30)
    assert r.status_code == 404
