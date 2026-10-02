"""Iter 191 — Backend contract test for POST /api/documents multipart upload
(mobile parity). Verifies auth-onboarded household can upload, that the file
appears in GET /api/documents, and unauthenticated/no-household edge cases.
"""
import io
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

CATHY = {"email": "cathy@example.com", "password": "testpass123"}


@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json=CATHY, timeout=20)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}"}


def test_get_documents_list_ok(auth_headers):
    r = requests.get(f"{BASE_URL}/api/documents", headers=auth_headers, timeout=20)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "documents" in body and isinstance(body["documents"], list)
    assert "limits" in body
    assert body["limits"]["max_file_bytes"] == 10 * 1024 * 1024


def test_upload_document_multipart(auth_headers):
    marker = f"TEST_iter191_{uuid.uuid4().hex[:8]}"
    file_bytes = (
        b"%PDF-1.4\n%\xE2\xE3\xCF\xD3\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
    )
    files = {"file": (f"{marker}.pdf", io.BytesIO(file_bytes), "application/pdf")}
    data = {"category": "statement", "title": marker}
    r = requests.post(
        f"{BASE_URL}/api/documents",
        headers=auth_headers,
        files=files,
        data=data,
        timeout=30,
    )
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("category") == "statement"
    assert body.get("title") == marker
    assert body.get("file_size_bytes") == len(file_bytes)
    assert body.get("id")
    assert body.get("has_file") is True
    assert "_id" not in body
    assert "file_b64" not in body
    doc_id = body["id"]

    # Verify persisted via GET list
    lst = requests.get(
        f"{BASE_URL}/api/documents", headers=auth_headers, timeout=20
    ).json()
    ids = [d["id"] for d in lst["documents"]]
    assert doc_id in ids, "uploaded doc did not appear in GET /api/documents"

    # Fetch single
    single = requests.get(
        f"{BASE_URL}/api/documents/{doc_id}", headers=auth_headers, timeout=20
    )
    assert single.status_code == 200
    assert single.json()["title"] == marker

    # Cleanup
    d = requests.delete(
        f"{BASE_URL}/api/documents/{doc_id}", headers=auth_headers, timeout=20
    )
    assert d.status_code == 200


def test_upload_bad_category_rejected(auth_headers):
    files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
    data = {"category": "NOT_A_REAL_CATEGORY", "title": "TEST_iter191_badcat"}
    r = requests.post(
        f"{BASE_URL}/api/documents",
        headers=auth_headers,
        files=files,
        data=data,
        timeout=20,
    )
    assert r.status_code == 400, r.text


def test_upload_requires_auth():
    files = {"file": ("x.txt", io.BytesIO(b"hello"), "text/plain")}
    data = {"category": "other"}
    r = requests.post(
        f"{BASE_URL}/api/documents", files=files, data=data, timeout=20
    )
    assert r.status_code in (401, 403), r.text
