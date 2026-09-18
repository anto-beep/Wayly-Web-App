"""Phase F backend test — POST /api/chsp1/findings-letter/pdf.

Covers:
  * 401 without auth token (auth required).
  * 400 when the letter body is empty / blank.
  * 200 branded PDF with Content-Disposition attachment naming when body is valid.
"""
import os
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

CATHY_EMAIL = "cathy@example.com"
CATHY_PW = "testpass123"


@pytest.fixture(scope="module")
def cathy_token() -> str:
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": CATHY_EMAIL, "password": CATHY_PW},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"login failed: {r.status_code} {r.text[:200]}")
    tok = r.json().get("token")
    assert tok, "no token in login response"
    return tok


BODY_OK = {
    "letter": (
        "Dear BlueBerry Care,\n\nWe have reviewed invoice INV-9001 for Dorothy for the "
        "period 01/09/2026-30/09/2026 and noticed some rates above what was agreed.\n\n"
        "Please review and confirm.\n\nRegards,\nCathy"
    ),
    "provider_name": "BlueBerry Care",
    "client_name": "Dorothy",
    "invoice_reference": "INV-9001",
    "period": "01/09/2026-30/09/2026",
}


def test_findings_letter_pdf_requires_auth():
    r = requests.post(f"{BASE_URL}/api/chsp1/findings-letter/pdf", json=BODY_OK, timeout=60)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"


def test_findings_letter_pdf_empty_letter_rejected(cathy_token: str):
    headers = {"Authorization": f"Bearer {cathy_token}"}
    body = {**BODY_OK, "letter": "   \n\t  "}
    r = requests.post(f"{BASE_URL}/api/chsp1/findings-letter/pdf", json=body, headers=headers, timeout=30)
    assert r.status_code == 400, f"expected 400 for blank letter, got {r.status_code}: {r.text[:200]}"


def test_findings_letter_pdf_ok(cathy_token: str):
    headers = {"Authorization": f"Bearer {cathy_token}"}
    r = requests.post(f"{BASE_URL}/api/chsp1/findings-letter/pdf", json=BODY_OK, headers=headers, timeout=60)
    assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"
    assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers.get("content-type")
    disp = r.headers.get("content-disposition", "")
    assert "attachment" in disp.lower(), disp
    assert "Wayly-CHSP-Findings-Letter_" in disp, disp
    assert disp.lower().endswith('.pdf"'), disp
    assert r.content[:4] == b"%PDF", "response body is not a PDF"
    assert len(r.content) > 1000, f"pdf suspiciously small: {len(r.content)} bytes"
