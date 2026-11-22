"""Iter 56 — AT-HM file uploads + Participant Contacts enrichment.

Covers:
  • POST /api/athm/{iid}/files (multipart) — PDF success, .exe rejected, >25MB 413
  • GET  /api/athm/{iid}/files/{fid} — binary download, attachment header, mime
  • DELETE /api/athm/{iid}/files/{fid} — soft delete, removed from attachments
  • POST /api/participants/{pid}/contacts — new kinds (pharmacist, care_manager,
    friend, emergency) + role_or_title + is_primary; legacy kind (gp) still works.
"""
import os
import io
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
CATHY_EMAIL = "cathy@example.com"
CATHY_PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": CATHY_EMAIL, "password": CATHY_PASSWORD},
        timeout=60,
    )
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response: {r.json()}"
    return tok


@pytest.fixture(scope="module")
def auth_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}"}


@pytest.fixture(scope="module")
def cathy_participant_id(auth_headers):
    """Find Cathy's seeded participant (Dorothy)."""
    r = requests.get(f"{BASE_URL}/api/participants", headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"GET /api/participants failed: {r.status_code} {r.text}"
    data = r.json()
    items = data.get("items") or data.get("participants") or (data if isinstance(data, list) else [])
    assert items, f"No participants returned: {data}"
    return items[0]["id"]


@pytest.fixture(scope="module")
def athm_item_id(auth_headers):
    """Find or create an AT-HM item for upload tests."""
    r = requests.get(f"{BASE_URL}/api/athm", headers=auth_headers, timeout=20)
    assert r.status_code == 200, f"GET /api/athm failed: {r.status_code} {r.text}"
    items = r.json()
    if items:
        return items[0]["id"]
    # Seed one if none exists
    body = {"kind": "AT", "name": "TEST_iter56_seed", "status": "proposed"}
    r2 = requests.post(f"{BASE_URL}/api/athm", json=body, headers=auth_headers, timeout=20)
    assert r2.status_code == 200, f"Could not create AT-HM seed: {r2.status_code} {r2.text}"
    return r2.json()["id"]


# ------------------------ AT-HM File Upload Tests --------------------------
class TestAthmFiles:
    def test_upload_pdf_success(self, auth_headers, athm_item_id):
        # Minimal valid PDF
        pdf_bytes = (
            b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\n"
            b"xref\n0 3\n0000000000 65535 f\n0000000009 00000 n\n0000000052 00000 n\n"
            b"trailer<</Size 3/Root 1 0 R>>\nstartxref\n96\n%%EOF\n"
        )
        files = {"file": ("TEST_iter56.pdf", pdf_bytes, "application/pdf")}
        data = {"kind": "quote"}
        r = requests.post(
            f"{BASE_URL}/api/athm/{athm_item_id}/files",
            headers=auth_headers,
            files=files,
            data=data,
            timeout=30,
        )
        assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
        j = r.json()
        assert "id" in j
        assert j["filename"] == "TEST_iter56.pdf"
        assert "storage_path" in j and j["storage_path"].startswith(f"athm/{athm_item_id}/")
        assert j["mime_type"] == "application/pdf"
        assert j["size_bytes"] == len(pdf_bytes)
        assert j["has_binary"] is True
        # store fid on class for chained tests
        TestAthmFiles._fid = j["id"]
        TestAthmFiles._iid = athm_item_id

    def test_upload_exe_rejected(self, auth_headers, athm_item_id):
        files = {"file": ("evil.exe", b"MZ\x90\x00fakebinary", "application/octet-stream")}
        r = requests.post(
            f"{BASE_URL}/api/athm/{athm_item_id}/files",
            headers=auth_headers,
            files=files,
            timeout=20,
        )
        assert r.status_code == 400, f"Expected 400 for .exe, got {r.status_code}: {r.text}"
        body = r.json()
        detail = (body.get("detail") or "").lower() if isinstance(body.get("detail"), str) else str(body).lower()
        assert "supported" in detail or "allowed" in detail or "not supported" in detail, f"Unexpected detail: {body}"

    def test_upload_oversize_rejected(self, auth_headers, athm_item_id):
        # 26 MB payload
        big = b"%PDF-1.4\n" + (b"A" * (26 * 1024 * 1024))
        files = {"file": ("big.pdf", big, "application/pdf")}
        r = requests.post(
            f"{BASE_URL}/api/athm/{athm_item_id}/files",
            headers=auth_headers,
            files=files,
            timeout=60,
        )
        assert r.status_code == 413, f"Expected 413 for >25MB, got {r.status_code}: {r.text[:200]}"

    def test_download_file_binary(self, auth_headers):
        fid = getattr(TestAthmFiles, "_fid", None)
        iid = getattr(TestAthmFiles, "_iid", None)
        if not fid:
            pytest.skip("Upload test did not produce a file id")
        r = requests.get(
            f"{BASE_URL}/api/athm/{iid}/files/{fid}",
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"Download failed: {r.status_code} {r.text[:200]}"
        cd = r.headers.get("Content-Disposition", "")
        assert "attachment" in cd.lower(), f"Expected attachment disposition, got: {cd}"
        assert r.headers.get("Content-Type", "").startswith("application/pdf"), f"Bad mime: {r.headers.get('Content-Type')}"
        assert r.content.startswith(b"%PDF"), "Downloaded content not a PDF"

    def test_delete_soft_removes_from_attachments(self, auth_headers):
        fid = getattr(TestAthmFiles, "_fid", None)
        iid = getattr(TestAthmFiles, "_iid", None)
        if not fid:
            pytest.skip("Upload test did not produce a file id")
        r = requests.delete(
            f"{BASE_URL}/api/athm/{iid}/files/{fid}",
            headers=auth_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"Delete failed: {r.status_code} {r.text}"
        # Verify it's gone from the parent's attachments list
        lst = requests.get(f"{BASE_URL}/api/athm", headers=auth_headers, timeout=20).json()
        parent = next((x for x in lst if x["id"] == iid), None)
        assert parent is not None, "Parent AT-HM item not found"
        attachments = parent.get("attachments") or []
        assert not any(a.get("id") == fid for a in attachments), \
            f"File {fid} still in attachments after delete: {attachments}"
        # Re-download should now 410
        r2 = requests.get(f"{BASE_URL}/api/athm/{iid}/files/{fid}", headers=auth_headers, timeout=20)
        assert r2.status_code == 410, f"Expected 410 after soft-delete, got {r2.status_code}"


# ------------------------ Participant Contacts Tests -----------------------
class TestParticipantContacts:
    NEW_KINDS = ["pharmacist", "care_manager", "friend", "emergency"]

    def test_create_pharmacist_with_role(self, auth_headers, cathy_participant_id):
        body = {
            "name": "TEST_PharmacyOne",
            "kind": "pharmacist",
            "role_or_title": "Community Pharmacist",
            "is_primary": True,
            "phone": "0400000001",
        }
        r = requests.post(
            f"{BASE_URL}/api/participants/{cathy_participant_id}/contacts",
            json=body, headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        c = r.json().get("contact") or r.json()
        assert c["kind"] == "pharmacist"
        assert c["role_or_title"] == "Community Pharmacist"
        assert c["is_primary"] is True
        TestParticipantContacts._created_ids = [c["id"]]

    @pytest.mark.parametrize("kind", ["care_manager", "friend", "emergency"])
    def test_create_other_new_kinds(self, auth_headers, cathy_participant_id, kind):
        body = {"name": f"TEST_{kind}_one", "kind": kind, "is_primary": False}
        r = requests.post(
            f"{BASE_URL}/api/participants/{cathy_participant_id}/contacts",
            json=body, headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200, f"{kind}: {r.status_code} {r.text}"
        c = r.json().get("contact") or r.json()
        assert c["kind"] == kind
        TestParticipantContacts._created_ids = getattr(TestParticipantContacts, "_created_ids", []) + [c["id"]]

    def test_legacy_kind_gp_still_works(self, auth_headers, cathy_participant_id):
        body = {"name": "TEST_GP_Smith", "kind": "gp", "organisation": "Local Clinic"}
        r = requests.post(
            f"{BASE_URL}/api/participants/{cathy_participant_id}/contacts",
            json=body, headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200
        c = r.json().get("contact") or r.json()
        assert c["kind"] == "gp"
        TestParticipantContacts._created_ids = getattr(TestParticipantContacts, "_created_ids", []) + [c["id"]]

    def test_list_contains_all_new_kinds(self, auth_headers, cathy_participant_id):
        r = requests.get(
            f"{BASE_URL}/api/participants/{cathy_participant_id}/contacts",
            headers=auth_headers, timeout=20,
        )
        assert r.status_code == 200
        rows = r.json().get("contacts") or []
        kinds_present = {c["kind"] for c in rows if c["name"].startswith("TEST_")}
        for k in ["pharmacist", "care_manager", "friend", "emergency"]:
            assert k in kinds_present, f"Missing kind {k} in contacts list. Got: {kinds_present}"

    def test_cleanup(self, auth_headers, cathy_participant_id):
        ids = getattr(TestParticipantContacts, "_created_ids", [])
        for cid in ids:
            requests.delete(
                f"{BASE_URL}/api/participants/{cathy_participant_id}/contacts/{cid}",
                headers=auth_headers, timeout=10,
            )
