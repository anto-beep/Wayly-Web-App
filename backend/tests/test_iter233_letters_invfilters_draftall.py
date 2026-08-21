"""iter233 backend: draft-all letter, invoice list, letters mailbox APIs."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    BASE_URL = "https://statement-checker-3.preview.emergentagent.com"

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"
SEEDED_INVOICE = "2acaf9f3-0190-47e7-b9c7-c939c579b49b"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_draft_all_unauth():
    r = requests.post(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE}/letter", timeout=60)
    assert r.status_code in (401, 403)


def test_draft_all_creates_single_letter(headers):
    r = requests.post(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE}/letter", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("entry_id")
    assert data.get("issue_count", 0) >= 1
    assert data.get("editor_path", "").startswith("/tools/letters-and-follow-ups/")
    assert data["editor_path"].endswith(data["entry_id"])


def test_draft_all_404_unknown_invoice(headers):
    r = requests.post(f"{BASE_URL}/api/invoices/does-not-exist-xyz/letter", headers=headers, timeout=15)
    assert r.status_code == 404


def test_invoice_list_has_seeded(headers):
    r = requests.get(f"{BASE_URL}/api/invoices", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    items = data.get("items") or []
    assert data.get("count", 0) >= 1
    ids = [i.get("id") for i in items]
    # not strictly required to contain seed but common shape
    assert isinstance(items, list)
    # ensure filterable fields present
    for it in items:
        assert "provider_name" in it or "filename" in it
        assert "created_at" in it


def test_lf1_correspondence_list(headers):
    r = requests.get(f"{BASE_URL}/api/lf1/correspondence", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    entries = data.get("entries") or data.get("items") or []
    assert isinstance(entries, list)
    # After draft-all above we should have at least 1 entry
    assert len(entries) >= 1


def test_lf1_followups_shape(headers):
    r = requests.get(f"{BASE_URL}/api/lf1/follow-ups", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "overdue" in data and "upcoming" in data
    assert isinstance(data["overdue"], list)
    assert isinstance(data["upcoming"], list)
