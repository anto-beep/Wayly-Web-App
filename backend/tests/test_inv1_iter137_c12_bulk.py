"""Iter 137 — C12 SaH pricebook fallback + bulk-draft prep verifications."""
import io
import os
import pytest
import requests

def _read_frontend_env():
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    return None

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _read_frontend_env()).rstrip("/")
SAMPLE_URL = "https://customer-assets-m6fa6gv7.emergentagent.net/job_3cdd07e9-184e-497d-a2b3-3c21bdcd0972/artifacts/1nb01lhw_glorious-services-invoice-INV-2026-07-4471.pdf"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "cathy@example.com", "password": "testpass123"
    }, timeout=30)
    assert r.status_code == 200, r.text
    return r.json().get("token") or r.json().get("access_token")


@pytest.fixture(scope="module")
def pdf_bytes():
    r = requests.get(SAMPLE_URL, timeout=60)
    assert r.status_code == 200
    return r.content


@pytest.fixture(scope="module")
def upload_result(token, pdf_bytes):
    files = {"file": ("glorious.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{BASE_URL}/api/invoices/upload", files=files, headers=headers, timeout=120)
    assert r.status_code == 200, r.text
    return r.json()


def test_c12_present_with_sah_snapshot(upload_result):
    reco = upload_result.get("reconciliation") or {}
    findings = reco.get("findings") or []
    c12 = [f for f in findings if f.get("check_id") == "C12"]
    assert c12, f"No C12 finding. IDs: {[f.get('check_id') for f in findings]}"
    # Verify observed > expected
    for f in c12:
        obs = f.get("observed", {}).get("unit_price")
        exp = f.get("expected", {}).get("published_price")
        assert obs is not None and exp is not None
        assert obs > exp


def test_ppc_snapshot_id_is_sah_indicative(upload_result):
    reco = upload_result.get("reconciliation") or {}
    assert reco.get("ppc_snapshot_id") == "sah_indicative_2026-02-01"


def test_domestic_assistance_c12_values(upload_result):
    reco = upload_result.get("reconciliation") or {}
    lines = reco.get("lines") or []
    findings = reco.get("findings") or []
    # Find any C12 with expected published_price 72.00 (domestic assistance ceiling)
    domestic = [f for f in findings if f.get("check_id") == "C12"
                and abs((f.get("expected") or {}).get("published_price", 0) - 72.00) < 0.01]
    assert domestic, f"No C12 finding matching domestic assistance ceiling ($72). Got: {[(f.get('observed'), f.get('expected')) for f in findings if f.get('check_id')=='C12']}"
    obs_prices = [f["observed"]["unit_price"] for f in domestic]
    # At least one should be around 102.50
    assert any(100 <= p <= 105 for p in obs_prices), f"Expected ~102.50 unit price, got {obs_prices}"


def test_total_findings_and_distinct_ids(upload_result):
    reco = upload_result.get("reconciliation") or {}
    findings = reco.get("findings") or []
    assert len(findings) >= 10, f"Expected >=10 findings, got {len(findings)}"
    ids = {f.get("check_id") for f in findings}
    for required in ["C1", "C6", "C8", "C10", "C11", "C12"]:
        assert required in ids, f"Missing {required} in {ids}"
