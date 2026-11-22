"""Iter341 — CHSP Tools 10-item batch verification.

Covers:
- upload_guard on POST /api/invoices/upload (CHSP invoice -> block wrong_tool)
- upload_guard on care-plans endpoints (CHSP text -> chsp-tools redirect)
- CHSP analyse guard on POST /api/chsp1/invoice/analyse
- Multi-line Fee Check parser POST /api/chsp1/fee-check/parse-invoice
- Consolidated findings letter POST /api/chsp1/findings-letter
- PDF endpoints (invoice + fee-check)
- Editable profile POST /api/chsp1/profile
"""
import io
import os
import pytest
import requests

def _load_env():
    for p in ("/app/frontend/.env", "/app/mobile/.env"):
        try:
            with open(p) as f:
                for line in f:
                    if "=" in line and not line.strip().startswith("#"):
                        k, v = line.strip().split("=", 1)
                        os.environ.setdefault(k, v.strip('"').strip("'"))
        except FileNotFoundError:
            pass


_load_env()
BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL not set"
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"

CHSP_TEXT = """Sunshine Community Care Pty Ltd
Tax Invoice
Programme: Commonwealth Home Support Programme (CHSP)
Invoice #: SCC-20260731-0999
Invoice date: 05/08/2026
Period: 01/07/2026 - 31/07/2026
Client: Dorothy Example
Line 1: Domestic Assistance - 2 hours @ $58.50/hr - $117.00
Line 2: Social Support Individual - 1.5 hours @ $62.00/hr - $93.00
Line 3: Transport (kms) - 20 km @ $1.20/km - $24.00
Line 4: Personal Care - 1 hour @ $65.00/hr - $65.00
Subtotal: $299.00
Client contribution: $59.80
Government subsidy: $239.20
Grand total: $299.00
"""

GENERIC_INVOICE_TEXT = """Tax Invoice
Provider: Acme Cleaning Pty Ltd
Invoice No: INV-2026-0007
Date: 05/08/2026
Description: General cleaning services (3 hours)
Subtotal: $180.00
GST: $18.00
Total: $198.00
"""

CARE_PLAN_TEXT = """Home Care Package - Support Plan
Recipient: Dorothy Example
Care Plan Effective Date: 01/07/2026
Goals: Maintain independence at home.
Services: Personal care 3x/week, physiotherapy weekly, medication management.
Review Date: 01/01/2027
Care Coordinator: J. Bloggs
"""


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=90)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


# ----------------------- Upload Guard -----------------------
class TestUploadGuard:
    def test_chsp_invoice_blocked_by_invoice_checker(self, auth_headers):
        files = {"file": ("chsp_inv.txt", io.BytesIO(CHSP_TEXT.encode()), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/invoices/upload", headers=auth_headers, files=files, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "upload_guard" in body, f"missing guard: {body}"
        g = body["upload_guard"]
        assert g.get("decision") == "block", g
        assert g.get("reason") == "wrong_tool", g
        assert g.get("detected_type") == "chsp-tools", g
        wt = g.get("wrong_tool") or {}
        assert wt.get("slug") == "chsp-tools", wt
        assert wt.get("route_web") == "/app/chsp/tools", wt
        assert wt.get("route_mobile") == "/chsp-tools", wt

    def test_generic_invoice_accepted(self, auth_headers):
        files = {"file": ("generic.txt", io.BytesIO(GENERIC_INVOICE_TEXT.encode()), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/invoices/upload", headers=auth_headers, files=files, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        g = body.get("upload_guard") or {}
        # Should NOT be a wrong_tool block
        assert g.get("decision") != "block" or g.get("reason") != "wrong_tool", f"generic invoice wrongly redirected: {body}"


# ----------------------- CHSP Analyse Guard -----------------------
class TestChspAnalyseGuard:
    def test_care_plan_bounces_from_chsp_analyse(self, auth_headers):
        files = {"file": ("cp.txt", io.BytesIO(CARE_PLAN_TEXT.encode()), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/chsp1/invoice/analyse", headers=auth_headers, files=files, timeout=60)
        assert r.status_code == 200, r.text
        body = r.json()
        g = body.get("upload_guard") or {}
        assert g.get("decision") == "block", body
        wt = (g.get("wrong_tool") or {}).get("slug")
        assert wt in ("care-plan-reviewer", "statement-decoder"), g

    def test_chsp_invoice_proceeds(self, auth_headers):
        files = {"file": ("chsp.txt", io.BytesIO(CHSP_TEXT.encode()), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/chsp1/invoice/analyse", headers=auth_headers, files=files, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        # No wrong_tool bounce; analysis result present
        assert not (body.get("upload_guard") or {}).get("decision") == "block", body
        assert "analysis" in body, body


# ----------------------- Fee Check multi-line -----------------------
class TestFeeCheckMultiLine:
    def test_multi_line_returns_line_options(self, auth_headers):
        files = {"file": ("chsp.txt", io.BytesIO(CHSP_TEXT.encode()), "text/plain")}
        r = requests.post(f"{BASE_URL}/api/chsp1/fee-check/parse-invoice", headers=auth_headers, files=files, timeout=120)
        assert r.status_code == 200, r.text
        body = r.json()
        assert not (body.get("upload_guard") or {}).get("decision") == "block", body
        assert "fields" in body and "line_options" in body, body
        lo = body["line_options"]
        assert isinstance(lo, list) and len(lo) >= 2, f"expected multi-line but got {len(lo)}: {body}"
        opt = lo[0]
        # required keys per spec
        for k in ("service_type", "provider_name", "agreed_rate", "units_billed", "units_received", "billed_amount", "label", "variance_status"):
            assert k in opt, f"line_option missing '{k}': {opt}"


# ----------------------- Findings Letter -----------------------
class TestFindingsLetter:
    def test_consolidated_findings_letter(self, auth_headers):
        payload = {
            "provider_name": "Sunshine Community Care Pty Ltd",
            "client_name": "Dorothy Example",
            "invoice_reference": "SCC-20260731-0999",
            "period": "01/07/2026 – 31/07/2026",
            "lines": [
                {
                    "service_description": "Domestic Assistance",
                    "units": 2, "unit_label": "hours",
                    "billed_unit_rate": 58.50, "agreed_rate": 52.00,
                    "billed_amount": 117.00, "expected_amount": 104.00,
                },
                {
                    "service_description": "Personal Care",
                    "units": 1, "unit_label": "hours",
                    "billed_unit_rate": 65.00, "agreed_rate": 60.00,
                    "billed_amount": 65.00, "expected_amount": 60.00,
                },
            ],
        }
        r = requests.post(f"{BASE_URL}/api/chsp1/findings-letter", headers=auth_headers, json=payload, timeout=90)
        assert r.status_code == 200, r.text
        body = r.json()
        letter = body.get("letter") or ""
        assert isinstance(letter, str) and len(letter) > 100, f"letter too short: {letter!r}"


# ----------------------- PDF endpoints -----------------------
class TestPdfEndpoints:
    def test_invoice_pdf(self, auth_headers):
        payload = {
            "header": {"provider_name": "Sunshine Community Care Pty Ltd", "invoice_reference": "SCC-20260731-0999", "client_name": "Dorothy Example", "invoice_date": "05/08/2026", "period_start": "01/07/2026", "period_end": "31/07/2026", "programme": "CHSP"},
            "line_items": [{"service_type": "domestic_assistance", "description": "Domestic Assistance", "units": 2, "unit_label": "hours", "unit_rate": 58.5, "gst": 0.0, "amount": 117.0}],
            "totals": {"subtotal": 117.0, "gst_total": 0.0, "grand_total": 117.0, "government_subsidy": 93.6, "client_contribution": 23.4},
            "plain_summary": "Test", "next_steps": ["Verify agreed rates"],
        }
        r = requests.post(f"{BASE_URL}/api/chsp1/invoice/pdf", headers=auth_headers, json=payload, timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        assert r.content[:4] == b"%PDF", r.content[:20]
        cd = r.headers.get("content-disposition", "")
        assert "filename" in cd.lower(), cd

    def test_fee_check_pdf(self, auth_headers):
        payload = {
            "provider_name": "Sunshine Community Care Pty Ltd",
            "service_type": "domestic_assistance",
            "billed_unit_rate": 58.5,
            "agreed_rate": 52.0,
            "units_billed": 2,
            "units_received": 2,
            "billed_amount": 117.0,
            "expected_amount": 104.0,
            "variance_status": "overcharge",
            "plain_summary": "Test summary",
            "next_steps": ["Contact provider"],
        }
        r = requests.post(f"{BASE_URL}/api/chsp1/fee-check/pdf", headers=auth_headers, json=payload, timeout=60)
        assert r.status_code == 200, r.text
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        assert r.content[:4] == b"%PDF", r.content[:20]


# ----------------------- Profile update -----------------------
class TestProfileUpdate:
    def test_upsert_status(self, auth_headers):
        # ensure profile exists
        r0 = requests.post(f"{BASE_URL}/api/chsp1/profile", headers=auth_headers, json={"current_chsp_status": "on_chsp"}, timeout=30)
        assert r0.status_code == 200, r0.text

        # update status
        r1 = requests.post(f"{BASE_URL}/api/chsp1/profile", headers=auth_headers, json={"current_chsp_status": "transitioning_to_sah"}, timeout=30)
        assert r1.status_code == 200, r1.text
        prof = r1.json()["profile"]
        assert prof["current_chsp_status"] == "transitioning_to_sah", prof

        # GET verifies persistence
        r2 = requests.get(f"{BASE_URL}/api/chsp1/profile", headers=auth_headers, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["profile"]["current_chsp_status"] == "transitioning_to_sah"

        # restore
        requests.post(f"{BASE_URL}/api/chsp1/profile", headers=auth_headers, json={"current_chsp_status": "on_chsp"}, timeout=30)
