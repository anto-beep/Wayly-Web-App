"""Iteration 72 backend tests — ticket attachments (user + admin uploads/downloads).

Covers:
- User POST/GET /api/support/tickets/{id}/attachments (create/download/list)
- Size (413), MIME (415), empty (400), closed ticket (409) errors
- Ownership: another user cannot download
- Admin POST/GET /api/admin/support/tickets/{id}/attachments (2FA login helper)
- Admin can download user-uploaded attachments
- 401 unauthenticated

Run:
    pytest /app/backend/tests/test_iter72_ticket_attachments.py -v \
        --junitxml=/app/test_reports/pytest/iter72.xml
"""
from __future__ import annotations

import os
import sys
import io
import uuid
import zlib
from typing import Optional

import pytest
import requests

# Load backend env so we can reach TOTP_ENC_KEY + Mongo the same way the server does.
try:
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
except Exception:
    pass

sys.path.insert(0, "/app/backend")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://mobile-exact-parity.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

USER_EMAIL = "trial30909@example.com"
USER_PASSWORD = "TrialPass1!"

ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASSWORD = "AdminPass!2026"


# -----------------------------
# Tiny PNG bytes (valid 1x1 red)
# -----------------------------
def _tiny_png() -> bytes:
    """Return the smallest valid PNG (1x1)."""
    # Minimal 1x1 red PNG hex-encoded so we don't rely on Pillow.
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000D49444154789C63F80CF80F000001010001A5F645400000000049454E"
        "44AE426082"
    )


def _tiny_pdf() -> bytes:
    """Return a minimal valid-ish PDF (renders as empty page)."""
    return (
        b"%PDF-1.4\n"
        b"1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
        b"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
        b"3 0 obj <</Type /Page /Parent 2 0 R /MediaBox [0 0 72 72]>> endobj\n"
        b"xref\n0 4\n0000000000 65535 f \n"
        b"0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \n"
        b"trailer <</Size 4 /Root 1 0 R>>\nstartxref\n162\n%%EOF\n"
    )


# -----------------------------
# Fixtures
# -----------------------------
@pytest.fixture(scope="module")
def user_token():
    r = requests.post(f"{API}/auth/login", json={"email": USER_EMAIL, "password": USER_PASSWORD}, timeout=45)
    if r.status_code != 200:
        pytest.skip(f"user login failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    return j.get("token") or j.get("access_token")


@pytest.fixture(scope="module")
def user_headers(user_token):
    return {"Authorization": f"Bearer {user_token}"}


@pytest.fixture(scope="module")
def admin_token():
    """Do a real password + TOTP admin login for hello@techglove.com.au."""
    import pyotp
    from pymongo import MongoClient
    from security_utils import decrypt_totp_secret

    db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
    u = db.users.find_one({"email": ADMIN_EMAIL}, {"totp_secret": 1, "totp_enabled": 1})
    if not u:
        pytest.skip(f"admin user {ADMIN_EMAIL} not found in db")
    secret = decrypt_totp_secret(u.get("totp_secret"))
    if not secret:
        pytest.skip("could not decrypt admin totp secret")

    r = requests.post(f"{API}/admin/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=45)
    if r.status_code != 200:
        pytest.skip(f"admin login step-1 failed: {r.status_code} {r.text[:200]}")
    j = r.json()
    if j.get("token"):
        return j["token"]
    if not j.get("requires_2fa") or not j.get("temp_token"):
        pytest.skip(f"unexpected admin login shape: {j}")
    code = pyotp.TOTP(secret).now()
    r2 = requests.post(f"{API}/admin/auth/2fa/verify", json={"temp_token": j["temp_token"], "code": code}, timeout=45)
    if r2.status_code != 200 or not r2.json().get("token"):
        pytest.skip(f"admin 2fa verify failed: {r2.status_code} {r2.text[:200]}")
    return r2.json()["token"]


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def open_ticket_id(user_headers):
    """Pick an existing open ticket (received/under_review/awaiting_user). If none, create one."""
    r = requests.get(f"{API}/support/tickets", headers=user_headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    items = body.get("items") if isinstance(body, dict) else body
    for t in items or []:
        if t.get("status") in ("received", "under_review", "awaiting_user"):
            return t["id"]
    # Fall back: create one
    payload = {
        "tool_name": "statement_decoder",
        "tool_version": "v1",
        "tool_input": {"x": 1},
        "tool_output": {"y": 2},
        "category": "figure_incorrect",
        "user_note": "TEST iter72 ticket for attachment tests",
        "consent_to_share_statement": False,
    }
    r = requests.post(f"{API}/support/tickets", json=payload, headers={**user_headers, "Content-Type": "application/json"}, timeout=15)
    assert r.status_code == 200, f"could not create fallback ticket: {r.status_code} {r.text[:200]}"
    body = r.json()
    return body.get("ticket", body).get("id")


# -----------------------------
# USER — happy path
# -----------------------------
class TestUserAttachmentUploadDownload:
    def test_a_upload_png_ok(self, user_headers, open_ticket_id):
        png = _tiny_png()
        files = {"file": ("iter72.png", png, "image/png")}
        r = requests.post(
            f"{API}/support/tickets/{open_ticket_id}/attachments",
            headers=user_headers, files=files, timeout=20,
        )
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:300]}"
        j = r.json()
        assert j.get("ok") is True
        att = j.get("attachment") or {}
        assert att.get("id")
        assert att.get("type") == "user_upload"
        assert att.get("filename") == "iter72.png"
        assert att.get("mime_type") == "image/png"
        assert att.get("size_bytes") == len(png)
        assert att.get("uploaded_by_type") == "user"
        pytest.iter72_png_att_id = att["id"]
        pytest.iter72_png_bytes = png

    def test_b_download_png_roundtrip(self, user_headers, open_ticket_id):
        aid = pytest.iter72_png_att_id
        r = requests.get(
            f"{API}/support/tickets/{open_ticket_id}/attachments/{aid}/download",
            headers=user_headers, timeout=20,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("image/png")
        assert r.content == pytest.iter72_png_bytes, "downloaded bytes do not match upload"

    def test_c_upload_pdf_ok(self, user_headers, open_ticket_id):
        pdf = _tiny_pdf()
        files = {"file": ("iter72.pdf", pdf, "application/pdf")}
        r = requests.post(
            f"{API}/support/tickets/{open_ticket_id}/attachments",
            headers=user_headers, files=files, timeout=20,
        )
        assert r.status_code == 200, f"pdf upload failed: {r.status_code} {r.text[:300]}"
        j = r.json()
        att = j["attachment"]
        assert att["mime_type"] == "application/pdf"
        assert att["size_bytes"] == len(pdf)
        assert att["filename"].endswith(".pdf")

    def test_d_ticket_detail_lists_attachment(self, user_headers, open_ticket_id):
        r = requests.get(f"{API}/support/tickets/{open_ticket_id}", headers=user_headers, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        atts = j.get("attachments") or []
        assert any(a.get("id") == pytest.iter72_png_att_id for a in atts), \
            f"uploaded attachment not present in ticket detail: {[a.get('id') for a in atts]}"
        # uploaded_by_type populated for user_upload rows
        our = next(a for a in atts if a["id"] == pytest.iter72_png_att_id)
        assert our.get("uploaded_by_type") == "user"
        assert our.get("type") == "user_upload"


# -----------------------------
# USER — errors
# -----------------------------
class TestUserAttachmentErrors:
    def test_a_too_big_returns_413(self, user_headers, open_ticket_id):
        big = b"\x00" * (11 * 1024 * 1024)
        files = {"file": ("big.png", big, "image/png")}
        r = requests.post(
            f"{API}/support/tickets/{open_ticket_id}/attachments",
            headers=user_headers, files=files, timeout=30,
        )
        assert r.status_code == 413, f"expected 413 got {r.status_code}: {r.text[:200]}"
        assert "too big" in (r.json().get("detail") or "").lower()

    def test_b_bad_mime_returns_415(self, user_headers, open_ticket_id):
        files = {"file": ("evil.exe", b"MZ\x90\x00", "application/x-msdownload")}
        r = requests.post(
            f"{API}/support/tickets/{open_ticket_id}/attachments",
            headers=user_headers, files=files, timeout=15,
        )
        assert r.status_code == 415, f"expected 415 got {r.status_code}: {r.text[:200]}"
        assert "png" in (r.json().get("detail") or "").lower()

    def test_c_empty_file_returns_400(self, user_headers, open_ticket_id):
        files = {"file": ("empty.png", b"", "image/png")}
        r = requests.post(
            f"{API}/support/tickets/{open_ticket_id}/attachments",
            headers=user_headers, files=files, timeout=15,
        )
        assert r.status_code == 400, f"expected 400 got {r.status_code}: {r.text[:200]}"

    def test_d_closed_ticket_returns_409(self, user_headers):
        # Create a dedicated ticket, close it, then try to attach.
        payload = {
            "tool_name": "statement_decoder", "tool_version": "v1",
            "tool_input": {"x": 1}, "tool_output": {"y": 2},
            "category": "other", "user_note": "TEST iter72 close-then-attach",
            "consent_to_share_statement": False,
        }
        r = requests.post(f"{API}/support/tickets", json=payload,
                          headers={**user_headers, "Content-Type": "application/json"}, timeout=15)
        assert r.status_code == 200, r.text
        tid = r.json().get("ticket", r.json()).get("id")
        assert tid, "no ticket id"
        # Close the ticket (user-initiated close endpoint)
        rc = requests.post(f"{API}/support/tickets/{tid}/close",
                           headers={**user_headers, "Content-Type": "application/json"},
                           json={"reason": "test"}, timeout=15)
        # Some backends may 200 or 204; both are fine
        if rc.status_code not in (200, 204):
            # try 'resolved' via other means — fall back to DB write
            from pymongo import MongoClient
            db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
            db.sup_tickets.update_one({"id": tid}, {"$set": {"status": "resolved"}})
        # Attempt upload
        png = _tiny_png()
        files = {"file": ("closed.png", png, "image/png")}
        r2 = requests.post(
            f"{API}/support/tickets/{tid}/attachments",
            headers=user_headers, files=files, timeout=15,
        )
        assert r2.status_code == 409, f"expected 409 for closed ticket, got {r2.status_code}: {r2.text[:200]}"


# -----------------------------
# USER — ownership check
# -----------------------------
class TestOwnership:
    def test_other_user_cannot_download(self, open_ticket_id):
        # Create rando
        rand = uuid.uuid4().hex[:8]
        email = f"iter72-rando-{rand}@example.com"
        signup = requests.post(f"{API}/auth/signup", json={
            "name": "Iter72 Rando", "email": email, "password": "RandoPass1!", "plan": "family",
        }, timeout=15)
        if signup.status_code not in (200, 201):
            pytest.skip(f"could not create rando user: {signup.status_code} {signup.text[:200]}")
        login = requests.post(f"{API}/auth/login", json={"email": email, "password": "RandoPass1!"}, timeout=15)
        assert login.status_code == 200
        tok = login.json().get("token") or login.json().get("access_token")
        rh = {"Authorization": f"Bearer {tok}"}

        aid = pytest.iter72_png_att_id
        r = requests.get(
            f"{API}/support/tickets/{open_ticket_id}/attachments/{aid}/download",
            headers=rh, timeout=15,
        )
        assert r.status_code == 404, f"expected 404 (ownership), got {r.status_code}: {r.text[:200]}"


# -----------------------------
# ADMIN
# -----------------------------
class TestAdminAttachments:
    def test_a_unauthenticated_admin_upload_returns_401(self, open_ticket_id):
        files = {"file": ("x.png", _tiny_png(), "image/png")}
        r = requests.post(f"{API}/admin/support/tickets/{open_ticket_id}/attachments", files=files, timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403 unauth, got {r.status_code}"

    def test_b_admin_upload_png_ok(self, admin_headers, open_ticket_id):
        png = _tiny_png()
        files = {"file": ("admin.png", png, "image/png")}
        r = requests.post(
            f"{API}/admin/support/tickets/{open_ticket_id}/attachments",
            headers=admin_headers, files=files, timeout=20,
        )
        assert r.status_code == 200, f"admin upload failed: {r.status_code} {r.text[:300]}"
        j = r.json()
        att = j["attachment"]
        assert att["type"] == "admin_upload"
        assert att["uploaded_by_type"] == "staff"
        assert att["mime_type"] == "image/png"
        assert att["size_bytes"] == len(png)
        pytest.iter72_admin_att_id = att["id"]

    def test_c_admin_download_own(self, admin_headers, open_ticket_id):
        aid = pytest.iter72_admin_att_id
        r = requests.get(
            f"{API}/admin/support/tickets/{open_ticket_id}/attachments/{aid}/download",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("image/png")

    def test_d_admin_can_download_user_upload(self, admin_headers, open_ticket_id):
        aid = pytest.iter72_png_att_id  # the user_upload from earlier
        r = requests.get(
            f"{API}/admin/support/tickets/{open_ticket_id}/attachments/{aid}/download",
            headers=admin_headers, timeout=15,
        )
        assert r.status_code == 200, r.text[:300]
        assert r.content == pytest.iter72_png_bytes
