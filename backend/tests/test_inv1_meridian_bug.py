"""Meridian invoice bug-fix verification (iteration 88).

Uploads the actual Meridian Home Care October 2026 PDF and asserts the
reconciliation flags the expected C2/C3/C4/C11 issues per user's answer key.
"""
import os
import io
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://proration-preview.preview.emergentagent.com").rstrip("/")
PDF_URL = "https://customer-assets-cm19k8pv.emergentagent.net/job_057095ac-96bc-4e89-8c46-c61a3494a55f/artifacts/uuicyqln_meridian-invoice-october-2026.pdf"
CREDS = {"email": "cathy@example.com", "password": "testpass123"}


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CREDS, timeout=60)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def pdf_bytes():
    r = requests.get(PDF_URL, timeout=30)
    assert r.status_code == 200 and len(r.content) > 1000, f"pdf fetch failed: {r.status_code}"
    return r.content


@pytest.fixture(scope="module")
def upload_response(token, pdf_bytes):
    files = {"file": ("meridian.pdf", pdf_bytes, "application/pdf")}
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(f"{BASE_URL}/api/invoices/upload", files=files, headers=headers, timeout=90)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:400]}"
    return r.json()


def test_tools_registry_has_invoice_checker():
    r = requests.get(f"{BASE_URL}/api/tools", timeout=60)
    assert r.status_code == 200
    data = r.json()
    tools = data.get("tools") or data.get("items") or data
    count = data.get("count") if isinstance(data, dict) else None
    slugs = [t.get("slug") for t in tools] if isinstance(tools, list) else []
    print(f"tools count: {count} slugs: {slugs}")
    assert "invoice-checker" in slugs
    if count is not None:
        assert count == 9, f"expected 9 tools, got {count}"


def test_header_extraction(upload_response):
    r = upload_response
    print(f"HEADER: provider={r.get('provider_name')} abn={r.get('provider_abn')} date={r.get('invoice_date')} qb={r.get('quarterly_budget')}")
    assert r.get("provider_name") and "Meridian" in r["provider_name"]
    assert r.get("provider_abn") == "47831205619"
    assert r.get("invoice_date") == "2026-11-02"
    assert r.get("quarterly_budget") == 12904.0


def test_overall_verdict_not_all_clear(upload_response):
    recon = upload_response["reconciliation"]
    verdict = recon.get("overall_verdict")
    print(f"VERDICT: {verdict}")
    print(f"FINDINGS: {[(f.get('check_id'), f.get('tier')) for f in recon.get('findings', [])]}")
    assert verdict == "check_before_paying", f"expected check_before_paying, got {verdict}"


def _findings_by_check(recon, check_id):
    return [f for f in recon.get("findings", []) if f.get("check_id") == check_id]


def test_c2_personal_care_post_oct_2026(upload_response):
    recon = upload_response["reconciliation"]
    c2 = _findings_by_check(recon, "C2")
    print(f"C2 findings: {len(c2)}: {c2}")
    assert len(c2) >= 3, f"expected >=3 C2 findings, got {len(c2)}"


def test_c4_exit_fee(upload_response):
    recon = upload_response["reconciliation"]
    c4 = _findings_by_check(recon, "C4")
    print(f"C4 findings: {c4}")
    assert len(c4) >= 1, f"expected >=1 C4 exit fee finding, got {len(c4)}"


def test_c3_rate_mismatch_after_self_funded(upload_response, token):
    """C3 requires known pension_status; empty situation defaults to unknown
    where 17.5% falls within the whole plausible range. Set self_funded
    and re-check.
    """
    inv_id = upload_response["invoice_id"]
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(
        f"{BASE_URL}/api/invoices/{inv_id}/situation",
        json={"pension_status": "self_funded_no_cshc"},
        headers=headers, timeout=30,
    )
    assert r.status_code == 200
    recon = r.json()["reconciliation"]
    c3 = _findings_by_check(recon, "C3")
    print(f"C3 findings after self_funded_no_cshc: {len(c3)}: {c3}")
    assert len(c3) >= 1, f"expected >=1 C3 rate mismatch after self_funded, got {len(c3)}"


def test_c11_duplicates(upload_response):
    recon = upload_response["reconciliation"]
    c11 = _findings_by_check(recon, "C11")
    print(f"C11 findings: {c11}")
    assert len(c11) >= 1, f"expected >=1 C11 duplicate, got {len(c11)}"


def test_c10_lifetime_cap_tier1_present(upload_response):
    recon = upload_response["reconciliation"]
    c10 = _findings_by_check(recon, "C10")
    print(f"C10 findings: {c10}")
    assert len(c10) >= 1


def test_situation_update(upload_response, token):
    inv_id = upload_response["invoice_id"]
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(
        f"{BASE_URL}/api/invoices/{inv_id}/situation",
        json={"pension_status": "self_funded_no_cshc"},
        headers=headers, timeout=30,
    )
    print(f"situation update: {r.status_code} {r.text[:300]}")
    assert r.status_code == 200
    assert "reconciliation" in r.json()


def test_letter_from_finding(upload_response, token):
    recon = upload_response["reconciliation"]
    inv_id = upload_response["invoice_id"]
    # find a Tier-3 or Tier-4 finding index
    idx = None
    for i, f in enumerate(recon.get("findings", [])):
        if f.get("tier") in (3, 4, "3", "4", "tier_3", "tier_4"):
            idx = i
            break
    assert idx is not None, "no tier3/4 finding to draft letter from"
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(
        f"{BASE_URL}/api/invoices/{inv_id}/findings/{idx}/letter",
        headers=headers, timeout=30,
    )
    print(f"letter: {r.status_code} {r.text[:400]}")
    assert r.status_code == 200
    data = r.json()
    assert "editor_path" in data
    assert "/tools/letters-and-follow-ups/" in data["editor_path"]
