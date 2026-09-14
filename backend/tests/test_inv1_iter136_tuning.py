"""Test INV1 extractor tuning: Glorious Services sample must extract 25+ lines
with 5+ findings including C6, C8, C10, C11."""
import io
import os
import time

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
SAMPLE_PDF_URL = (
    "https://customer-assets-m6fa6gv7.emergentagent.net/job_3cdd07e9-184e-497d-a2b3-3c21bdcd0972/"
    "artifacts/1nb01lhw_glorious-services-invoice-INV-2026-07-4471.pdf"
)


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def pdf_bytes():
    r = requests.get(SAMPLE_PDF_URL, timeout=60)
    assert r.status_code == 200
    return r.content


@pytest.fixture(scope="module")
def upload_response(token, pdf_bytes):
    headers = {"Authorization": f"Bearer {token}"}
    files = {"file": ("glorious-INV-2026-07-4471.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    r = requests.post(f"{BASE_URL}/api/invoices/upload", headers=headers, files=files, timeout=180)
    assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:500]}"
    return r.json()


def test_extractor_lines_at_least_25(upload_response, token):
    # Fetch the persisted invoice to get payable_section, then count lines
    payload = upload_response
    invoice_id = payload.get("invoice_id")
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    doc = r.json()
    payable = doc.get("payable_section") or ""
    # Use the extractor directly to count lines from the persisted payable text
    import sys
    sys.path.insert(0, "/app/backend")
    from lib.inv1.extractor import extract_line_items
    year = None
    try:
        year = int((doc.get("invoice_date") or "")[:4])
    except Exception:
        pass
    lines = extract_line_items(payable, invoice_year=year)
    print(f"[INV1] extracted lines (via extractor on payable_section): {len(lines)}")
    for i, ln in enumerate(lines[:3]):
        print(f"   sample {i}: {ln.to_dict() if hasattr(ln, 'to_dict') else ln}")
    assert len(lines) >= 25, f"Expected >=25 line items, got {len(lines)}"
    print(f"[INV1] extracted lines: {len(lines)}")
    assert len(lines) >= 25, f"Expected >=25 line items, got {len(lines)}"


def test_reconciliation_findings_min_5_and_includes_key_checks(upload_response):
    payload = upload_response
    reconciliation = (
        payload.get("reconciliation")
        or (payload.get("invoice") or {}).get("reconciliation")
        or {}
    )
    findings = reconciliation.get("findings") or []
    print(f"[INV1] finding count: {len(findings)}; check ids: {[f.get('check_id') for f in findings]}")
    assert len(findings) >= 5, f"Expected >=5 findings, got {len(findings)}"
    check_ids = {f.get("check_id") for f in findings}
    for expected in ("C6", "C8", "C10", "C11"):
        assert expected in check_ids, f"Missing check {expected}. Present: {check_ids}"


def test_c6_finding_has_numeric_difference(upload_response):
    payload = upload_response
    reconciliation = (
        payload.get("reconciliation")
        or (payload.get("invoice") or {}).get("reconciliation")
        or {}
    )
    findings = reconciliation.get("findings") or []
    c6 = [f for f in findings if f.get("check_id") == "C6"]
    assert c6, "No C6 findings present"
    for f in c6:
        observed = f.get("observed") or {}
        diff = observed.get("difference")
        assert isinstance(diff, (int, float)), f"C6 observed.difference must be numeric, got {observed}"
        print(f"[INV1] C6 diff = {diff}")
