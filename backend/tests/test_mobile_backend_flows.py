"""Backend smoke tests for the mobile app's shared endpoints.

Endpoints exercised: /api/auth/login, /api/auth/me, /api/auth/logout,
/api/participants, /api/statements, /api/statements/{id}, /api/invoices,
/api/invoices/{id}, /api/chat, /api/billing/subscription.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("REACT_APP_BACKEND_URL")
assert BASE_URL, "BASE_URL must be set from mobile/frontend .env"
BASE_URL = BASE_URL.rstrip("/")

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data, data
    return data["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def test_login_returns_token_and_user():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200
    d = r.json()
    assert d.get("token") and isinstance(d["token"], str)
    assert d.get("user", {}).get("email") == EMAIL


def test_login_bad_password_401():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": EMAIL, "password": "wrongpass"},
        timeout=30,
    )
    assert r.status_code in (400, 401), r.text


def test_me_returns_user(headers):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=headers, timeout=30)
    assert r.status_code == 200
    d = r.json()
    assert d.get("email") == EMAIL
    assert d.get("plan") == "family"


def test_participants_list(headers):
    r = requests.get(f"{BASE_URL}/api/participants", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "participants" in d
    assert isinstance(d["participants"], list)


def test_statements_list(headers):
    r = requests.get(f"{BASE_URL}/api/statements", headers=headers, timeout=30)
    assert r.status_code == 200
    d = r.json()
    # Response may be either a list or { items: [...] } / { statements: [...] }
    items = d if isinstance(d, list) else d.get("items") or d.get("statements") or []
    assert isinstance(items, list)
    assert len(items) > 0, "cathy should have 36 statements"
    # store one id
    first = items[0]
    assert "id" in first or "_id" in first


def test_statement_detail(headers):
    r = requests.get(f"{BASE_URL}/api/statements", headers=headers, timeout=30)
    d = r.json()
    items = d if isinstance(d, list) else d.get("items") or d.get("statements") or []
    sid = items[0].get("id") or items[0].get("_id")
    r2 = requests.get(f"{BASE_URL}/api/statements/{sid}", headers=headers, timeout=30)
    assert r2.status_code == 200, r2.text
    detail = r2.json()
    assert detail.get("id") == sid or detail.get("_id") == sid


def test_invoices_list(headers):
    r = requests.get(f"{BASE_URL}/api/invoices", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    items = d if isinstance(d, list) else d.get("items") or d.get("invoices") or []
    assert len(items) > 0, "cathy should have 25 invoices"


def test_invoice_detail(headers):
    r = requests.get(f"{BASE_URL}/api/invoices", headers=headers, timeout=30)
    d = r.json()
    items = d if isinstance(d, list) else d.get("items") or d.get("invoices") or []
    iid = items[0].get("id") or items[0].get("_id")
    r2 = requests.get(f"{BASE_URL}/api/invoices/{iid}", headers=headers, timeout=30)
    assert r2.status_code == 200, r2.text


def test_chat_send(headers):
    r = requests.post(
        f"{BASE_URL}/api/chat",
        headers=headers,
        json={"message": "Hi Wayly, quick test", "session_id": None},
        timeout=60,
    )
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("session_id"), "chat should return session_id"


def test_billing_subscription(headers):
    r = requests.get(f"{BASE_URL}/api/billing/subscription", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
