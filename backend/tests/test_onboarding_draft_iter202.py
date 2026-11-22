"""Iter 202 - Cross-App Resume backend tests for /api/onboarding/draft.

Verifies:
- 401 without auth
- PUT round-trips {tier1, tier2, auth, step} opaque data
- GET returns the same shape (interoperable with web + mobile hydration)
- DELETE clears and subsequent GET returns {draft: null}
- 413 for payloads > 32 KB
- One-draft-per-user (user-scoped upsert)
"""
import os
import time
import uuid
import requests

def _load_env(path):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip())
    except FileNotFoundError:
        pass

_load_env("/app/frontend/.env")
_load_env("/app/mobile/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


def _signup_user():
    """Create a fresh user and return (token, email)."""
    email = f"TEST_iter202_{uuid.uuid4().hex[:8]}@example.com"
    password = f"Iter202-{uuid.uuid4().hex[:6]}!Zx"
    r = requests.post(
        f"{BASE_URL}/api/auth/signup",
        json={"email": email, "password": password, "name": "Iter202 Tester", "first_name": "Iter202", "last_name": "Tester", "plan": "family"},
        timeout=20,
    )
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"no token in signup response: {r.json()}"
    return tok, email


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


def test_get_draft_unauth_returns_401():
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", timeout=10)
    assert r.status_code in (401, 403), f"expected 401/403 unauth, got {r.status_code}"


def test_put_draft_unauth_returns_401():
    r = requests.put(
        f"{BASE_URL}/api/onboarding/draft",
        json={"data": {"tier1": {"first_name": "X"}}},
        timeout=10,
    )
    assert r.status_code in (401, 403)


def test_put_get_delete_roundtrip():
    tok, _ = _signup_user()

    # Initial: no draft
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    assert r.json() == {"draft": None}

    # PUT a full draft shape mirroring web + mobile
    payload = {
        "data": {
            "tier1": {
                "first_name": "Dorothy",
                "last_name": "Kowalski",
                "dob": "1948-04-11",
                "pension_status": "full_pension",
                "classification_level": 4,
                "provider_name": "BlueBerry Care",
                "statement_delivery": "email",
            },
            "tier2": {
                "preferred_name": "Mum",
                "suburb": "Ballarat",
                "state": "VIC",
                "caregiver_relationship": "daughter",
            },
            "auth": {"confirmed": True},
            "step": 2,
        }
    }
    r = requests.put(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), json=payload, timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("saved") is True
    assert "updated_at" in body

    # GET returns the same opaque shape (interoperability guarantee)
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    got = r.json().get("draft")
    assert got is not None
    assert got["data"]["tier1"]["first_name"] == "Dorothy"
    assert got["data"]["tier1"]["classification_level"] == 4
    assert got["data"]["tier2"]["state"] == "VIC"
    assert got["data"]["auth"]["confirmed"] is True
    assert got["data"]["step"] == 2

    # Upsert: PUT again with different step; verify one-draft-per-user semantics
    payload["data"]["step"] = 3
    r = requests.put(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), json=payload, timeout=10)
    assert r.status_code == 200
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), timeout=10)
    assert r.json()["draft"]["data"]["step"] == 3

    # DELETE clears
    r = requests.delete(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), timeout=10)
    assert r.status_code == 200
    assert r.json().get("deleted") is True

    # GET now null
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), timeout=10)
    assert r.json() == {"draft": None}


def test_put_draft_413_on_large_payload():
    tok, _ = _signup_user()
    big = {"junk": "x" * 40000}  # > 32 KB
    r = requests.put(
        f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), json={"data": big}, timeout=10
    )
    assert r.status_code == 413, f"expected 413, got {r.status_code} {r.text}"


def test_user_scoped_isolation():
    """Draft written by user A must NOT be visible to user B."""
    tok_a, _ = _signup_user()
    tok_b, _ = _signup_user()
    payload = {"data": {"tier1": {"first_name": "OnlyA"}, "step": 1}}
    r = requests.put(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok_a), json=payload, timeout=10)
    assert r.status_code == 200
    # user B should see no draft
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok_b), timeout=10)
    assert r.status_code == 200
    assert r.json() == {"draft": None}
    # user A still sees theirs
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok_a), timeout=10)
    assert r.json()["draft"]["data"]["tier1"]["first_name"] == "OnlyA"


def test_cross_app_interop_shape():
    """Simulate: web PUTs a draft; mobile GETs and must see identical fields."""
    tok, _ = _signup_user()
    web_payload = {
        "data": {
            "tier1": {"first_name": "Cross", "last_name": "App", "pension_status": "part_pension", "classification_level": 3, "dob": "1950-01-01", "provider_name": "P", "statement_delivery": "post"},
            "tier2": {"state": "NSW"},
            "auth": {"confirmed": False},
            "step": 1,
        }
    }
    r = requests.put(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), json=web_payload, timeout=10)
    assert r.status_code == 200
    # small wait to ensure updated_at differs across writes if needed
    time.sleep(0.05)
    r = requests.get(f"{BASE_URL}/api/onboarding/draft", headers=_auth(tok), timeout=10)
    d = r.json()["draft"]["data"]
    # Keys the mobile hydrator reads: tier1, tier2, auth.confirmed, step
    assert set(["tier1", "tier2", "auth", "step"]).issubset(d.keys())
    assert d["tier1"]["classification_level"] == 3
    assert d["auth"]["confirmed"] is False
    assert d["step"] == 1
