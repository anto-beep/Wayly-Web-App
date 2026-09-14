"""
iter336: CHSP WS1 fee-check parse/save/list/delete + AT/HM project create + OT referral attach.
Backend regression tests to confirm the endpoints under review are healthy.
"""
import os
import io
import uuid
import pytest
import requests

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://final-verify-web.preview.emergentagent.com").rstrip("/")

FAM_EMAIL = "cathy@example.com"
FAM_PASS = "testpass123"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def token(s):
    r = s.post(f"{BASE}/api/auth/login", json={"email": FAM_EMAIL, "password": FAM_PASS})
    assert r.status_code == 200, r.text
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# --- CHSP WS1 ------------------------------------------------------------


def test_chsp_fee_check_preview(s, auth_headers):
    body = {
        "provider_name": "Test Provider",
        "service_type": "domestic_assistance",
        "agreed_rate": 60.0,
        "units_billed": 2,
        "units_received": 2,
        "billed_amount": 132.0,
    }
    r = s.post(f"{BASE}/api/chsp1/fee-check/preview", json=body, headers=auth_headers)
    assert r.status_code == 200, r.text
    j = r.json()
    # verdict shape
    assert "result" in j or "verdict" in j or "status" in j


def test_chsp_parse_invoice_multipart(s, auth_headers):
    # Sample invoice text
    txt = (
        b"BlueBerry Care Pty Ltd\nInvoice INV-TEST-001\nService: Domestic Assistance\n"
        b"Agreed rate: $60.00 per hour\nUnits billed: 2\nAmount: $132.00\n"
        b"Period: 01/06/2026 to 30/06/2026\nRate effective: 01/06/2026\n"
    )
    files = {"file": ("invoice.txt", io.BytesIO(txt), "text/plain")}
    r = requests.post(f"{BASE}/api/chsp1/fee-check/parse-invoice",
                      files=files, headers=auth_headers)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "fields" in j and "plain_summary" in j and "next_steps" in j
    assert isinstance(j["next_steps"], list)
    # fields should be a dict with expected keys
    for k in ["provider_name", "service_type", "agreed_rate", "units_billed", "billed_amount"]:
        assert k in j["fields"]


def test_chsp_save_list_delete_saved_check(s, auth_headers):
    body = {
        "invoice_reference": f"TEST-{uuid.uuid4().hex[:6]}",
        "provider_name": "TEST Provider",
        "service_type": "domestic_assistance",
        "agreed_rate": 60.0,
        "units_billed": 2,
        "billed_amount": 132.0,
        "result": {"status": "ok"},
    }
    r = s.post(f"{BASE}/api/chsp1/fee-check/save", json=body, headers=auth_headers)
    assert r.status_code == 200, r.text
    saved = r.json()["saved_check"]
    assert saved["id"]
    check_id = saved["id"]
    # list
    r2 = s.get(f"{BASE}/api/chsp1/fee-check/saved", headers=auth_headers)
    assert r2.status_code == 200
    ids = [c["id"] for c in r2.json()["saved_checks"]]
    assert check_id in ids
    # delete
    r3 = s.delete(f"{BASE}/api/chsp1/fee-check/saved/{check_id}", headers=auth_headers)
    assert r3.status_code == 200
    assert r3.json().get("deleted") is True
    # verify gone
    r4 = s.get(f"{BASE}/api/chsp1/fee-check/saved", headers=auth_headers)
    ids2 = [c["id"] for c in r4.json()["saved_checks"]]
    assert check_id not in ids2


# --- AT/HM ---------------------------------------------------------------


def test_athm_create_project_and_attach_doc(s, auth_headers):
    # 1. Pick an active participant on cathy
    r = s.get(f"{BASE}/api/v2/participants", headers=auth_headers)
    assert r.status_code == 200, r.text
    parts = r.json().get("participants") or r.json().get("items") or []
    active = [p for p in parts if str(p.get("status", "active")).lower() == "active"]
    assert active, f"no active participants for cathy: {parts}"
    pid = active[0]["id"]

    # 2. Create a project
    body = {
        "project_type": "assistive_technology_only",
        "title": f"TEST project {uuid.uuid4().hex[:6]}",
        "description": "iter336 test",
        "primary_need_summary": "Mobility support for hallway",
    }
    r2 = s.post(f"{BASE}/api/athm1/participants/{pid}/projects", json=body, headers=auth_headers)
    assert r2.status_code == 200, r2.text
    project = r2.json()["project"]
    project_id = project["id"]

    # 3. Upload a doc to Document Vault with category=ot_referral
    files = {"file": ("referral.txt", io.BytesIO(b"OT referral test doc"), "text/plain")}
    data = {"category": "ot_referral", "title": "TEST OT Referral"}
    r3 = requests.post(f"{BASE}/api/documents",
                       files=files, data=data,
                       headers=auth_headers)
    assert r3.status_code in (200, 201), r3.text
    doc = r3.json()
    doc_id = doc.get("id") or doc.get("document", {}).get("id")
    assert doc_id, f"unexpected upload response: {doc}"

    # 4. Attach doc to project
    r4 = s.post(f"{BASE}/api/athm1/projects/{project_id}/ot-referrals/attach",
                json={"document_id": doc_id, "notes": "test attach"},
                headers=auth_headers)
    assert r4.status_code == 200, r4.text
    j = r4.json()
    assert "referrals" in j
    # verify listing shows it
    r5 = s.get(f"{BASE}/api/athm1/projects/{project_id}/ot-referrals", headers=auth_headers)
    assert r5.status_code == 200
    refs = r5.json().get("referrals") or r5.json().get("items") or []
    assert any((rf.get("document_id") == doc_id) for rf in refs), f"attached doc not listed: {refs}"
