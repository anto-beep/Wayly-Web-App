"""
PARITY-1 backend verification:
  - GET /api/invoices/{id} returns reconciliation.invoice_total
  - invoice_total == sum(gross_cost of reconciliation.lines)
  - Non-zero for cathy's invoices that have line items.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, r.json()
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_invoices_list_returns_items(headers):
    r = requests.get(f"{BASE_URL}/api/invoices", headers=headers, timeout=30)
    assert r.status_code == 200, r.text
    items = r.json() if isinstance(r.json(), list) else r.json().get("items") or r.json().get("invoices") or []
    assert len(items) > 0, "cathy should have invoices seeded"


def test_invoice_detail_invoice_total_matches_lines(headers):
    r = requests.get(f"{BASE_URL}/api/invoices", headers=headers, timeout=30)
    assert r.status_code == 200
    payload = r.json()
    items = payload if isinstance(payload, list) else payload.get("items") or payload.get("invoices") or []
    checked = 0
    zero_total_ok_ids = []
    for row in items[:10]:
        inv_id = row.get("id") or row.get("_id")
        if not inv_id:
            continue
        rr = requests.get(f"{BASE_URL}/api/invoices/{inv_id}", headers=headers, timeout=30)
        assert rr.status_code == 200, rr.text
        doc = rr.json()
        recon = doc.get("reconciliation") or {}
        lines = recon.get("lines") or []
        if not lines:
            continue
        expected = round(sum(float((ln or {}).get("gross_cost") or 0) for ln in lines), 2)
        actual = recon.get("invoice_total")
        assert actual is not None, f"invoice {inv_id}: invoice_total missing"
        assert abs(float(actual) - expected) < 0.01, (
            f"invoice {inv_id}: invoice_total {actual} != sum(gross_cost) {expected}"
        )
        if expected > 0:
            checked += 1
        else:
            zero_total_ok_ids.append(inv_id)
    assert checked >= 1, (
        f"expected at least one invoice with non-zero invoice_total; "
        f"zero-total invoices seen: {zero_total_ok_ids}"
    )
