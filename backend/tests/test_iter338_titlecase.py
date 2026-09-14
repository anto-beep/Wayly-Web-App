"""iter338 — verify Title Case names for peter@test.com (login/me + participants)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")


@pytest.fixture(scope="module")
def peter_token():
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": "peter@test.com", "password": "Peter!2026"})
    assert r.status_code == 200, r.text
    return r.json()


def test_login_returns_titlecase(peter_token):
    """Login response returns user.name/first_name/last_name Title-Cased."""
    u = peter_token["user"]
    assert u["name"] == "Peter Smith", f"login name={u.get('name')!r}"
    assert u["first_name"] == "Peter"
    assert u["last_name"] == "Smith"


def test_me_returns_titlecase(peter_token):
    """GET /auth/me returns Title-Cased user fields."""
    tok = peter_token["token"]
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    u = r.json()
    assert u["name"] == "Peter Smith", f"me name={u.get('name')!r}"
    assert u["first_name"] == "Peter"
    assert u["last_name"] == "Smith"


def test_core1_participants_titlecase(peter_token):
    """GET /api/participants returns participants with Title-Cased names."""
    tok = peter_token["token"]
    r = requests.get(f"{BASE_URL}/api/participants",
                     headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    items = r.json() if isinstance(r.json(), list) else r.json().get("items", [])
    assert len(items) > 0, "peter should have at least one participant"
    for p in items:
        for k in ("first_name", "last_name", "preferred_name", "display_name", "name"):
            v = p.get(k)
            if isinstance(v, str) and v:
                # First char should be upper (or non-alpha)
                assert v[0] == v[0].upper(), f"{k}={v!r} first char lowercase"
                # Not entirely lowercase
                assert not (v.islower() and any(c.isalpha() for c in v)), \
                    f"participant {k} is all-lowercase: {v!r}"


def test_v2_participants_titlecase(peter_token):
    """GET /api/v2/participants (batch3) returns Title-Cased participant names."""
    tok = peter_token["token"]
    r = requests.get(f"{BASE_URL}/api/v2/participants",
                     headers={"Authorization": f"Bearer {tok}"})
    assert r.status_code == 200, r.text
    body = r.json()
    items = body if isinstance(body, list) else body.get("items", body.get("participants", []))
    assert len(items) > 0
    for p in items:
        for k in ("first_name", "last_name", "preferred_name", "name"):
            v = p.get(k)
            if isinstance(v, str) and v:
                assert v[0] == v[0].upper(), f"v2 {k}={v!r} first char lowercase"
                assert not (v.islower() and any(c.isalpha() for c in v)), \
                    f"v2 participant {k} is all-lowercase: {v!r}"


def test_titlecase_edge_mcdonald_obrien():
    """Verify edge-case title-case util preserves McDonald and capitalises O'Brien."""
    from lib.text_utils import title_case_name
    assert title_case_name("McDonald") == "McDonald"
    assert title_case_name("mcdonald") == "Mcdonald"  # spec: only first letter forced upper
    ob = title_case_name("o'brien")
    # First letter must be upper; internal apostrophe preserved
    assert ob.startswith("O"), f"o'brien -> {ob!r}"
    assert "'" in ob
