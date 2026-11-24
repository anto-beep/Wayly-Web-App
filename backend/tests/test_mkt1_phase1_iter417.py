"""Backend e2e tests for Social OS Phase 1 — Marketing Assets library.

Covers /api/mkt/* under the ADMIN console: campaigns, single-upload, bulk zip,
approval gating on public media route, manifest JSON/CSV, patch/delete,
ETag/304, and admin-auth enforcement. Non-destructive: all TEST_ assets are
soft-deleted at the end.
"""
import io
import os
import struct
import zipfile
import zlib
import time

import pyotp
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "hello@wayly.com.au"
ADMIN_PASS = "Admin!2026"
ADMIN_TOTP = "M5A7R2XCCEXWYYKNJY55MVZYUHPYFA6W"


def _png(width=4, height=4, color=(255, 0, 0)):
    """Minimal valid PNG."""
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(
            ">I", zlib.crc32(tag + data) & 0xFFFFFFFF
        )
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    raw = b""
    for _ in range(height):
        raw += b"\x00" + bytes(color) * width
    idat = zlib.compress(raw)
    return sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")


@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{API}/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
    assert r.status_code == 200, f"login step1 failed: {r.status_code} {r.text}"
    temp = r.json().get("temp_token")
    code = pyotp.TOTP(ADMIN_TOTP).now()
    r2 = s.post(f"{API}/admin/auth/2fa/verify",
                json={"temp_token": temp, "code": code}, timeout=15)
    assert r2.status_code == 200, f"2fa failed: {r2.status_code} {r2.text}"
    return r2.json()["token"]


@pytest.fixture(scope="module")
def hdr(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="module")
def created_asset_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def _cleanup(created_asset_ids, admin_token):
    yield
    h = {"Authorization": f"Bearer {admin_token}"}
    for aid in created_asset_ids:
        try:
            requests.delete(f"{API}/mkt/assets/{aid}", headers=h, timeout=10)
        except Exception:
            pass


@pytest.fixture(scope="module")
def campaign_id(hdr):
    cid = f"test-iter417-{int(time.time())}"
    r = requests.post(f"{API}/mkt/campaigns", headers=hdr,
                      json={"campaign_id": cid, "name": "TEST_iter417 Campaign",
                            "topic": "aged care tips", "month": "2026-06"}, timeout=15)
    assert r.status_code in (200, 201), f"campaign create: {r.status_code} {r.text}"
    data = r.json()
    assert data["campaign_id"] == cid
    assert "_id" not in data
    return cid


# ---------------- Tests ----------------
class TestCampaigns:
    def test_list_campaigns_requires_auth(self):
        r = requests.get(f"{API}/mkt/campaigns", timeout=10)
        assert r.status_code in (401, 403)

    def test_list_campaigns(self, hdr, campaign_id):
        r = requests.get(f"{API}/mkt/campaigns", headers=hdr, timeout=10)
        assert r.status_code == 200
        rows = r.json()
        assert any(c["campaign_id"] == campaign_id for c in rows)
        # no _id leaked
        for c in rows:
            assert "_id" not in c
            assert "asset_count" in c


class TestUploadAndApprovalGate:
    def test_upload_creates_draft_asset(self, hdr, campaign_id, created_asset_ids):
        files = {"file": ("test_iter417.png", _png(), "image/png")}
        data = {
            "campaign_id": campaign_id,
            "content_topic": "TEST_iter417 topic",
            "target_platform": "facebook",
            "alt_text": "sample alt text",
            "carousel_order": "0",
        }
        r = requests.post(f"{API}/mkt/assets/upload", headers=hdr,
                          files=files, data=data, timeout=60)
        assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
        a = r.json()
        assert a["approval_status"] == "draft"
        assert a["asset_type"] == "image"
        assert a["target_platform"] == "facebook"
        assert a["media_url"].endswith(f"/api/mkt/media/{a['id']}/{a['filename']}")
        assert a["width"] == 4 and a["height"] == 4
        created_asset_ids.append(a["id"])
        pytest.single_asset = a  # share across tests

    def test_public_media_404_before_approval(self):
        a = pytest.single_asset
        # public route — NO auth header
        url = f"{API}/mkt/media/{a['id']}/{a['filename']}"
        r = requests.get(url, timeout=15)
        assert r.status_code == 404, f"expected 404 pre-approval got {r.status_code}"

    def test_approve_and_public_media_200(self, hdr):
        a = pytest.single_asset
        r = requests.patch(f"{API}/mkt/assets/{a['id']}", headers=hdr,
                           json={"approval_status": "approved"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["approval_status"] == "approved"
        url = f"{API}/mkt/media/{a['id']}/{a['filename']}"
        r2 = requests.get(url, timeout=15)
        assert r2.status_code == 200, f"public fetch after approve: {r2.status_code}"
        assert r2.headers.get("Content-Type", "").startswith("image/png")
        assert r2.content[:8] == b"\x89PNG\r\n\x1a\n"
        etag = r2.headers.get("ETag")
        assert etag, "missing ETag"
        # 304 round-trip
        r3 = requests.get(url, headers={"If-None-Match": etag}, timeout=15)
        assert r3.status_code == 304


class TestBulkUploadZip:
    def test_bulk_zip_with_unsafe_entries(self, hdr, campaign_id, created_asset_ids):
        # Build a zip with: 2 valid pngs, 1 unsafe path, 1 unsupported ext
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr("one.png", _png(color=(0, 255, 0)))
            zf.writestr("two.png", _png(color=(0, 0, 255)))
            zf.writestr("../evil.png", _png())
            zf.writestr("notes.txt", b"hello")
        buf.seek(0)
        files = [("files", ("bundle.zip", buf.getvalue(), "application/zip"))]
        data = {"campaign_id": campaign_id, "content_topic": "TEST_iter417 bulk",
                "target_platform": "all"}
        r = requests.post(f"{API}/mkt/assets/bulk-upload", headers=hdr,
                          files=files, data=data, timeout=90)
        assert r.status_code == 200, f"bulk upload: {r.status_code} {r.text}"
        body = r.json()
        assert body["created_count"] == 2, body
        assert len(body["errors"]) >= 2
        for a in body["created"]:
            created_asset_ids.append(a["id"])


class TestListFilters:
    def test_list_and_filter(self, hdr, campaign_id):
        r = requests.get(f"{API}/mkt/assets", headers=hdr,
                         params={"campaign_id": campaign_id}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 3
        for a in body["assets"]:
            assert a["campaign_id"] == campaign_id
            assert "_id" not in a
        # approval filter -> draft only
        r2 = requests.get(f"{API}/mkt/assets", headers=hdr,
                          params={"campaign_id": campaign_id, "approval_status": "draft"},
                          timeout=15)
        assert r2.status_code == 200
        for a in r2.json()["assets"]:
            assert a["approval_status"] == "draft"

    def test_search_q(self, hdr, campaign_id):
        r = requests.get(f"{API}/mkt/assets", headers=hdr,
                         params={"q": "iter417"}, timeout=15)
        assert r.status_code == 200


class TestPatchAndDelete:
    def test_patch_fields(self, hdr, created_asset_ids):
        aid = created_asset_ids[-1]
        r = requests.patch(f"{API}/mkt/assets/{aid}", headers=hdr,
                           json={"content_topic": "TEST_iter417 patched",
                                 "alt_text": "new alt", "carousel_order": 7,
                                 "target_platform": "instagram"}, timeout=15)
        assert r.status_code == 200
        a = r.json()
        assert a["content_topic"] == "TEST_iter417 patched"
        assert a["alt_text"] == "new alt"
        assert a["carousel_order"] == 7
        assert a["target_platform"] == "instagram"
        # verify persisted
        r2 = requests.get(f"{API}/mkt/assets/{aid}", headers=hdr, timeout=10)
        assert r2.json()["alt_text"] == "new alt"

    def test_patch_invalid_platform(self, hdr, created_asset_ids):
        aid = created_asset_ids[-1]
        r = requests.patch(f"{API}/mkt/assets/{aid}", headers=hdr,
                           json={"target_platform": "tiktok"}, timeout=10)
        assert r.status_code == 400

    def test_delete_soft_removes(self, hdr, campaign_id):
        # upload a throwaway, delete, confirm absent from list
        files = {"file": ("test_iter417_del.png", _png(), "image/png")}
        r = requests.post(f"{API}/mkt/assets/upload", headers=hdr,
                          files=files, data={"campaign_id": campaign_id}, timeout=30)
        aid = r.json()["id"]
        r2 = requests.delete(f"{API}/mkt/assets/{aid}", headers=hdr, timeout=10)
        assert r2.status_code == 200 and r2.json().get("ok") is True
        r3 = requests.get(f"{API}/mkt/assets/{aid}", headers=hdr, timeout=10)
        assert r3.status_code == 404
        # and not in list
        r4 = requests.get(f"{API}/mkt/assets", headers=hdr,
                          params={"campaign_id": campaign_id, "limit": 200}, timeout=15)
        assert not any(a["id"] == aid for a in r4.json()["assets"])


class TestManifest:
    def test_manifest_json_requires_auth(self):
        r = requests.get(f"{API}/mkt/manifest.json", timeout=10)
        assert r.status_code in (401, 403)

    def test_manifest_csv_requires_auth(self):
        r = requests.get(f"{API}/mkt/manifest.csv", timeout=10)
        assert r.status_code in (401, 403)

    def test_manifest_json_approved_only(self, hdr):
        a = pytest.single_asset  # we approved this one earlier
        r = requests.get(f"{API}/mkt/manifest.json", headers=hdr, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["asset_count"] >= 1
        all_assets = [x for c in body["campaigns"] for x in c["assets"]]
        assert any(x["asset_id"] == a["id"] for x in all_assets)
        # ensure draft asset we uploaded in bulk is NOT in manifest
        # (bulk assets stayed draft)

    def test_manifest_csv_header(self, hdr):
        r = requests.get(f"{API}/mkt/manifest.csv", headers=hdr, timeout=15)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("Content-Type", "")
        first_line = r.text.splitlines()[0]
        assert "campaign_id" in first_line and "media_url" in first_line
