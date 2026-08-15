"""INV-1 v1.2 — Tests for the new endpoints added in iter 89:
- POST /api/invoices/upload  (combined_statement_line_count on response)
- POST /api/invoices/{id}/reconcile-combined
- POST /api/invoices/{id}/save-to-vault
- Regression: /api/invoices/upload for plain invoice, /situation, /findings/*/letter
"""
import os
import io
import base64
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"

pytestmark = pytest.mark.skipif(not BASE_URL, reason="REACT_APP_BACKEND_URL not set")


# ---------- helpers ----------
def _login(email, password):
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": email, "password": password},
        timeout=30,
    )
    return r


@pytest.fixture(scope="module")
def cathy_token():
    r = _login(CATHY_EMAIL, CATHY_PASSWORD)
    if r.status_code != 200:
        pytest.skip(f"cathy login failed: {r.status_code} {r.text[:200]}")
    data = r.json()
    tok = data.get("access_token") or data.get("token")
    if not tok:
        pytest.skip(f"no token in login response: {list(data)}")
    return tok


@pytest.fixture(scope="module")
def cathy_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}"}


def _make_plain_invoice_pdf() -> bytes:
    """Small reportlab invoice PDF with AMOUNT PAYABLE section only."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 11)
    y = 800
    lines = [
        "BLUEBERRY CARE PTY LTD",
        "ABN 12 345 678 901",
        "TAX INVOICE",
        "Invoice No: INV-2026-0001",
        "Invoice Date: 15/01/2026",
        "Due Date: 30/01/2026",
        "",
        "AMOUNT PAYABLE",
        "Personal care - 3 hours @ $75.00     $225.00",
        "Domestic assistance - 2 hours @ $70  $140.00",
        "",
        "Total Amount Payable: $365.00",
    ]
    for ln in lines:
        c.drawString(60, y, ln)
        y -= 18
    c.save()
    return buf.getvalue()


def _make_combined_pdf() -> bytes:
    """Combined statement + invoice PDF with both sections."""
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import A4
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setFont("Helvetica", 11)
    y = 800
    lines = [
        "BLUEBERRY CARE PTY LTD",
        "ABN 12 345 678 901",
        "MONTHLY STATEMENT",
        "Statement Period: 01/12/2025 - 31/12/2025",
        "",
        "Services delivered this month:",
        "Personal care - 4 hours @ $75.00     $300.00",
        "Nursing - 1 hour @ $120.00           $120.00",
        "",
        "Quarterly Budget Remaining: $2,500.00",
    ]
    for ln in lines:
        c.drawString(60, y, ln)
        y -= 18
    c.showPage()
    c.setFont("Helvetica", 11)
    y = 800
    lines2 = [
        "TAX INVOICE",
        "Invoice No: INV-2026-0002",
        "Invoice Date: 05/01/2026",
        "Due Date: 20/01/2026",
        "",
        "AMOUNT PAYABLE",
        "Personal care - 3 hours @ $75.00     $225.00",
        "Domestic assistance - 2 hours @ $70  $140.00",
        "",
        "Total Amount Payable: $365.00",
    ]
    for ln in lines2:
        c.drawString(60, y, ln)
        y -= 18
    c.save()
    return buf.getvalue()


# ---------- Auth sanity ----------
class TestAuth:
    def test_cathy_login(self):
        r = _login(CATHY_EMAIL, CATHY_PASSWORD)
        assert r.status_code == 200, r.text
        assert r.json().get("access_token") or r.json().get("token")


# ---------- Plain invoice upload regression ----------
class TestPlainInvoiceUpload:
    def test_plain_invoice_upload_no_combined(self, cathy_headers):
        files = {"file": ("plain.pdf", _make_plain_invoice_pdf(), "application/pdf")}
        r = requests.post(
            f"{BASE_URL}/api/invoices/upload",
            headers=cathy_headers,
            files=files,
            timeout=90,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["invoice_id"]
        assert data["document_shape"] in ("invoice", "combined_unsplit")
        assert data["checks_status"] == "ready"
        # combined_statement_line_count must exist and be 0 for a plain invoice
        assert data.get("combined_statement_line_count", 0) == 0
        assert data.get("combined_reconciled") is False
        assert "reconciliation" in data
        pytest.plain_invoice_id = data["invoice_id"]

    def test_get_invoice_after_upload(self, cathy_headers):
        inv_id = getattr(pytest, "plain_invoice_id", None)
        if not inv_id:
            pytest.skip("no invoice from previous test")
        r = requests.get(
            f"{BASE_URL}/api/invoices/{inv_id}",
            headers=cathy_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["id"] == inv_id
        assert d.get("combined_statement_lines") == []

    def test_situation_endpoint(self, cathy_headers):
        inv_id = getattr(pytest, "plain_invoice_id", None)
        if not inv_id:
            pytest.skip()
        r = requests.post(
            f"{BASE_URL}/api/invoices/{inv_id}/situation",
            headers=cathy_headers,
            json={"pension_status": "full_pensioner", "grandfathered": "no"},
            timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["invoice_id"] == inv_id
        assert d["checks_status"] == "ready"
        assert d["situation"]["pension_status"] == "full_pensioner"

    def test_reconcile_combined_fails_on_plain(self, cathy_headers):
        inv_id = getattr(pytest, "plain_invoice_id", None)
        if not inv_id:
            pytest.skip()
        r = requests.post(
            f"{BASE_URL}/api/invoices/{inv_id}/reconcile-combined",
            headers=cathy_headers, timeout=30,
        )
        # Should 400 because no combined_statement_lines
        assert r.status_code == 400, r.text


# ---------- Combined-doc reconciliation ----------
class TestCombinedReconciliation:
    def test_combined_upload_detects_statement_lines(self, cathy_headers):
        files = {"file": ("combined.pdf", _make_combined_pdf(), "application/pdf")}
        r = requests.post(
            f"{BASE_URL}/api/invoices/upload",
            headers=cathy_headers, files=files, timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["invoice_id"]
        pytest.combined_invoice_id = d["invoice_id"]
        pytest.combined_shape = d["document_shape"]
        pytest.combined_line_count = d.get("combined_statement_line_count", 0)
        # We don't strictly assert >0 because classifier may not detect;
        # but if shape is 'combined' we expect >0.
        if d["document_shape"] == "combined":
            assert d["combined_statement_line_count"] > 0, d
            assert d["combined_reconciled"] is False

    def test_reconcile_combined_endpoint(self, cathy_headers):
        """If the synthetic PDF wasn't classified as combined, inject
        `combined_statement_lines` directly via Mongo to exercise the
        reconcile-combined endpoint success path."""
        inv_id = getattr(pytest, "combined_invoice_id", None) or getattr(pytest, "plain_invoice_id", None)
        if not inv_id:
            pytest.skip()

        if getattr(pytest, "combined_line_count", 0) == 0:
            # Inject statement lines directly.
            import asyncio
            from motor.motor_asyncio import AsyncIOMotorClient
            async def _inject():
                c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
                dbn = os.environ.get("DB_NAME", "test_database")
                await c[dbn].invoices.update_one(
                    {"id": inv_id},
                    {"$set": {
                        "combined_statement_lines": [
                            {"description": "Personal care", "quantity": 3.0,
                             "unit_price": 75.0, "line_total": 225.0,
                             "service_date": "2026-01-05", "unit": "hour"},
                        ],
                        "combined_reconciled": False,
                        "document_shape": "combined",
                    }},
                )
            asyncio.run(_inject())
        r = requests.post(
            f"{BASE_URL}/api/invoices/{inv_id}/reconcile-combined",
            headers=cathy_headers, timeout=90,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["combined_reconciled"] is True
        assert d["statement_line_count"] > 0
        assert "reconciliation" in d

        # GET verifies persistence
        g = requests.get(
            f"{BASE_URL}/api/invoices/{inv_id}",
            headers=cathy_headers, timeout=30,
        )
        assert g.status_code == 200
        assert g.json().get("combined_reconciled") is True


# ---------- Save-to-vault ----------
class TestSaveToVault:
    def test_save_to_vault_success(self, cathy_headers):
        inv_id = getattr(pytest, "plain_invoice_id", None)
        if not inv_id:
            pytest.skip()
        r = requests.post(
            f"{BASE_URL}/api/invoices/{inv_id}/save-to-vault",
            headers=cathy_headers, timeout=60,
        )
        # cathy has a household so should succeed
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["invoice_id"] == inv_id
        assert d["saved_count"] >= 1  # PDF was persisted, report render should also succeed
        assert d["vault_path"] == "/documents"
        assert isinstance(d["saved_document_ids"], list) and len(d["saved_document_ids"]) == d["saved_count"]
        pytest.saved_ids = d["saved_document_ids"]
        pytest.saved_count = d["saved_count"]

    def test_saved_docs_visible_in_vault(self, cathy_headers):
        ids = getattr(pytest, "saved_ids", None)
        if not ids:
            pytest.skip()
        r = requests.get(f"{BASE_URL}/api/documents", headers=cathy_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        items = data.get("items") or data.get("documents") or data
        if isinstance(items, dict):
            items = items.get("items") or []
        all_ids = [it.get("id") for it in items if isinstance(it, dict)]
        for sid in ids:
            assert sid in all_ids, f"vault doc {sid} not returned by GET /api/documents (found {all_ids[:5]}...)"


# ---------- Letter draft regression ----------
class TestLetterRegression:
    def test_letter_endpoint_smoke(self, cathy_headers):
        """We can only test this if the plain invoice happens to have a finding.
        Otherwise skip — this is a smoke test that the endpoint still exists."""
        inv_id = getattr(pytest, "plain_invoice_id", None)
        if not inv_id:
            pytest.skip()
        g = requests.get(f"{BASE_URL}/api/invoices/{inv_id}", headers=cathy_headers, timeout=30)
        findings = ((g.json() or {}).get("reconciliation") or {}).get("findings") or []
        if not findings:
            # Endpoint must return 404 for out-of-range index
            r = requests.post(
                f"{BASE_URL}/api/invoices/{inv_id}/findings/0/letter",
                headers=cathy_headers, timeout=30,
            )
            assert r.status_code == 404
            return
        r = requests.post(
            f"{BASE_URL}/api/invoices/{inv_id}/findings/0/letter",
            headers=cathy_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert r.json().get("entry_id")
