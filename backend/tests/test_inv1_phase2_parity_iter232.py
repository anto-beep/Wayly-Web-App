"""INV-1 Phase 2 parity — download original/report, CSV export, letter draft."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"
SEEDED_INVOICE_ID = "2acaf9f3-0190-47e7-b9c7-c939c579b49b"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_get_invoice(headers):
    r = requests.get(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE_ID}", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("id") == SEEDED_INVOICE_ID
    rec = d.get("reconciliation") or {}
    assert rec.get("findings"), "expected findings"
    assert rec.get("lines"), "expected line items"


def test_download_original(headers):
    r = requests.get(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE_ID}/download?kind=original", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith(("application/pdf", "image/"))
    assert len(r.content) > 100


def test_download_report(headers):
    r = requests.get(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE_ID}/download?kind=report", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:4] == b"%PDF"


def test_export_csv(headers):
    r = requests.get(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE_ID}/export.csv", headers=headers, timeout=20)
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    text = r.content.decode("utf-8", errors="replace")
    assert "Wayly - Invoice Check" in text
    assert "Issues" in text
    assert "Line" in text  # line-item header


def test_letter_draft_source_aware(headers):
    r = requests.post(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE_ID}/findings/0/letter", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("entry_id")
    assert d.get("editor_path", "").startswith("/tools/letters-and-follow-ups/")
    assert d.get("situation_id") in (3, 10)


def test_download_unauthorized():
    r = requests.get(f"{BASE_URL}/api/invoices/{SEEDED_INVOICE_ID}/download?kind=original", timeout=10)
    assert r.status_code in (401, 403)
