"""Iteration 26 tests — Phase E2 CMS + Admin Invite + ReDoS fix + regression smoke."""
import os
import time
import pyotp
import pytest
import requests
from pymongo import MongoClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "hello@techglove.com.au"
ADMIN_PASSWORD = "AdminPass!2026"
TOTP_SECRET = "CYB5PKTKR4F2JM4ACWIFTY2C67RUVUTI"

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")


@pytest.fixture(scope="session")
def mongo():
    cli = MongoClient(MONGO_URL)
    yield cli[DB_NAME]
    cli.close()


@pytest.fixture(scope="session")
def admin_token():
    r = requests.post(f"{API}/admin/auth/login",
                      json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD}, timeout=20)
    assert r.status_code == 200, f"login: {r.status_code} {r.text}"
    d = r.json()
    assert d.get("requires_2fa") is True, f"unexpected: {d}"
    temp_token = d["temp_token"]
    code = pyotp.TOTP(TOTP_SECRET).now()
    r2 = requests.post(f"{API}/admin/auth/2fa/verify",
                       json={"temp_token": temp_token, "code": code}, timeout=20)
    assert r2.status_code == 200, f"2fa: {r2.status_code} {r2.text}"
    return r2.json()["token"]


@pytest.fixture(scope="session")
def H(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


# -------------------------------------------------------------
# 0. Cleanup of any TEST_ data from prior runs
# -------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def _cleanup(mongo):
    mongo.cms_articles.delete_many({"slug": {"$in": ["test-aged-care-os", "test-other", "TEST-aged-care-os"]}})
    mongo.cms_glossary.delete_many({"term": {"$regex": "^TEST_", "$options": "i"}})
    mongo.cms_templates.delete_many({"slug": {"$regex": "^(test|TEST)-"}})
    mongo.cms_changelog.delete_many({"version": {"$regex": "^(test|TEST)-"}})
    mongo.admin_invites.delete_many({"email": {"$regex": "^smoke-test-e2e"}})
    mongo.users.delete_many({"email": {"$regex": "^smoke-test-e2e"}})
    yield
    mongo.cms_articles.delete_many({"slug": {"$in": ["test-aged-care-os", "test-other", "TEST-aged-care-os"]}})
    mongo.cms_glossary.delete_many({"term": {"$regex": "^TEST_", "$options": "i"}})
    mongo.cms_templates.delete_many({"slug": {"$regex": "^(test|TEST)-"}})
    mongo.cms_changelog.delete_many({"version": {"$regex": "^(test|TEST)-"}})
    mongo.admin_invites.delete_many({"email": {"$regex": "^smoke-test-e2e"}})
    mongo.users.delete_many({"email": {"$regex": "^smoke-test-e2e"}})


# -------------------------------------------------------------
# 1. ReDoS fix on /admin/search
# -------------------------------------------------------------
class TestReDoSFix:
    def test_regex_meta_dotstar(self, H):
        t0 = time.time()
        r = requests.get(f"{API}/admin/search", params={"q": ".*"}, headers=H, timeout=5)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 2.0, f"search took {elapsed:.2f}s"

    def test_regex_meta_evil(self, H):
        t0 = time.time()
        r = requests.get(f"{API}/admin/search", params={"q": "(a+)+b"}, headers=H, timeout=5)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text
        assert elapsed < 2.0

    def test_normal_search_still_works(self, H):
        r = requests.get(f"{API}/admin/search", params={"q": "hello@techglove"}, headers=H, timeout=10)
        assert r.status_code == 200
        emails = [u["primary"] for u in r.json().get("users", [])]
        assert any("hello@techglove" in e for e in emails), f"expected match in {emails}"


# -------------------------------------------------------------
# 2. CMS Articles
# -------------------------------------------------------------
class TestCMSArticles:
    SLUG = "test-aged-care-os"

    def test_create_article(self, H):
        body = {
            "slug": self.SLUG,
            "title": "TEST Aged Care OS",
            "excerpt": "An overview of the aged-care operating system.",
            "body_md": "# Heading\n\nLong-enough body text for the operating system.",
            "tags": ["aged-care", "os"],
            "published": False,
        }
        r = requests.post(f"{API}/admin/cms/articles", json=body, headers=H, timeout=10)
        assert r.status_code == 200, r.text
        assert r.json()["article"]["slug"] == self.SLUG

    def test_duplicate_slug_409(self, H):
        body = {
            "slug": self.SLUG, "title": "TEST dup", "excerpt": "duplicate slug test",
            "body_md": "body that is long enough for validation.", "published": False,
        }
        r = requests.post(f"{API}/admin/cms/articles", json=body, headers=H, timeout=10)
        assert r.status_code == 409, r.text

    def test_invalid_slug_400(self, H):
        body = {
            "slug": "BadSlug With Spaces", "title": "TEST bad slug",
            "excerpt": "Invalid slug check 1234", "body_md": "body that is sufficiently long.",
            "published": False,
        }
        r = requests.post(f"{API}/admin/cms/articles", json=body, headers=H, timeout=10)
        assert r.status_code == 400, r.text

    def test_list_filter_q(self, H):
        r = requests.get(f"{API}/admin/cms/articles", params={"q": "Aged"}, headers=H, timeout=10)
        assert r.status_code == 200
        assert any(a["slug"] == self.SLUG for a in r.json()["rows"])

    def test_get_returns_body_md(self, H):
        r = requests.get(f"{API}/admin/cms/articles/{self.SLUG}", headers=H, timeout=10)
        assert r.status_code == 200
        assert "body_md" in r.json()

    def test_public_404_on_draft(self):
        r = requests.get(f"{API}/public/cms/articles/{self.SLUG}", timeout=10)
        assert r.status_code == 404

    def test_publish_via_put(self, H):
        body = {
            "title": "TEST Aged Care OS", "excerpt": "An overview of the OS now published.",
            "body_md": "# Updated\n\nUpdated long body text for the operating system.",
            "tags": ["aged-care"], "published": True,
        }
        r = requests.put(f"{API}/admin/cms/articles/{self.SLUG}", json=body, headers=H, timeout=10)
        assert r.status_code == 200, r.text

    def test_public_get_after_publish(self):
        r = requests.get(f"{API}/public/cms/articles/{self.SLUG}", timeout=10)
        assert r.status_code == 200
        assert r.json()["slug"] == self.SLUG

    def test_public_list_only_published(self):
        r = requests.get(f"{API}/public/cms/articles", timeout=10)
        assert r.status_code == 200
        slugs = [a["slug"] for a in r.json()["articles"]]
        assert self.SLUG in slugs

    def test_delete_article(self, H):
        r = requests.delete(f"{API}/admin/cms/articles/{self.SLUG}", headers=H, timeout=10)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/admin/cms/articles/{self.SLUG}", headers=H, timeout=10)
        assert r2.status_code == 404


# -------------------------------------------------------------
# 3. CMS Glossary
# -------------------------------------------------------------
class TestCMSGlossary:
    def test_create_and_duplicate_409(self, H):
        body = {"term": "TEST_NDIS", "definition": "Australian disability scheme test entry.", "published": True}
        r = requests.post(f"{API}/admin/cms/glossary", json=body, headers=H, timeout=10)
        assert r.status_code == 200, r.text
        # case-insensitive duplicate
        body2 = {"term": "test_ndis", "definition": "duplicate test", "published": True}
        r2 = requests.post(f"{API}/admin/cms/glossary", json=body2, headers=H, timeout=10)
        assert r2.status_code == 409, r2.text

    def test_list_q_case_insensitive(self, H):
        r = requests.get(f"{API}/admin/cms/glossary", params={"q": "test_ndis"}, headers=H, timeout=10)
        assert r.status_code == 200
        terms = [g["term"] for g in r.json()["rows"]]
        assert "TEST_NDIS" in terms

    def test_bulk_import(self, H):
        body = {"items": [
            {"term": "TEST_FOO", "definition": "Foo test definition long enough.", "published": True},
            {"term": "TEST_BAR", "definition": "Bar test definition long enough.", "published": True},
            {"term": "TEST_NDIS", "definition": "Should be skipped duplicate.", "published": True},
        ]}
        r = requests.post(f"{API}/admin/cms/glossary/bulk-import", json=body, headers=H, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["added"] == 2 and d["skipped"] == 1, d

    def test_update_glossary(self, H, mongo):
        ent = mongo.cms_glossary.find_one({"term": "TEST_FOO"})
        r = requests.put(f"{API}/admin/cms/glossary/{ent['id']}",
                         json={"term": "TEST_FOO", "definition": "Updated foo def long enough.", "published": True},
                         headers=H, timeout=10)
        assert r.status_code == 200

    def test_public_glossary(self):
        r = requests.get(f"{API}/public/cms/glossary", timeout=10)
        assert r.status_code == 200
        terms = [t["term"] for t in r.json()["terms"]]
        assert "TEST_NDIS" in terms and "TEST_FOO" in terms

    def test_delete_glossary(self, H, mongo):
        for t in ["TEST_NDIS", "TEST_FOO", "TEST_BAR"]:
            ent = mongo.cms_glossary.find_one({"term": t})
            if ent:
                r = requests.delete(f"{API}/admin/cms/glossary/{ent['id']}", headers=H, timeout=10)
                assert r.status_code == 200


# -------------------------------------------------------------
# 4. CMS Templates
# -------------------------------------------------------------
class TestCMSTemplates:
    SLUG = "test-budget-walk"

    def test_full_crud(self, H):
        body = {"slug": self.SLUG, "title": "TEST Budget Walk", "description": "Budget walk template description.",
                "cta_label": "Use this", "cta_href": "/x", "body_md": "Body", "published": True}
        r = requests.post(f"{API}/admin/cms/templates", json=body, headers=H, timeout=10)
        assert r.status_code == 200, r.text
        r2 = requests.get(f"{API}/admin/cms/templates", headers=H, timeout=10)
        assert any(t["slug"] == self.SLUG for t in r2.json()["rows"])
        # Public
        r3 = requests.get(f"{API}/public/cms/templates", timeout=10)
        assert r3.status_code == 200
        # Update
        body["title"] = "TEST Budget Walk Updated"
        r4 = requests.put(f"{API}/admin/cms/templates/{self.SLUG}", json=body, headers=H, timeout=10)
        assert r4.status_code == 200
        # Delete
        r5 = requests.delete(f"{API}/admin/cms/templates/{self.SLUG}", headers=H, timeout=10)
        assert r5.status_code == 200


# -------------------------------------------------------------
# 5. CMS Changelog
# -------------------------------------------------------------
class TestCMSChangelog:
    VERSION = "test-1.0.0"

    def test_full_crud_and_duplicate(self, H, mongo):
        body = {"version": self.VERSION, "title": "TEST Release", "body_md": "Release notes body.",
                "tags": ["feature"], "published": True}
        r = requests.post(f"{API}/admin/cms/changelog", json=body, headers=H, timeout=10)
        assert r.status_code == 200, r.text
        # Duplicate 409
        r2 = requests.post(f"{API}/admin/cms/changelog", json=body, headers=H, timeout=10)
        assert r2.status_code == 409
        # Update via id
        ent = mongo.cms_changelog.find_one({"version": self.VERSION})
        body["title"] = "TEST Updated"
        r3 = requests.put(f"{API}/admin/cms/changelog/{ent['id']}", json=body, headers=H, timeout=10)
        assert r3.status_code == 200
        # Public
        r4 = requests.get(f"{API}/public/cms/changelog", timeout=10)
        assert r4.status_code == 200
        assert any(c["version"] == self.VERSION for c in r4.json()["entries"])
        # Delete
        r5 = requests.delete(f"{API}/admin/cms/changelog/{ent['id']}", headers=H, timeout=10)
        assert r5.status_code == 200


# -------------------------------------------------------------
# 6. Admin Invite flow
# -------------------------------------------------------------
class TestAdminInvite:
    EMAIL = "smoke-test-e2e@example.com"

    def test_invite_create(self, H, mongo):
        body = {"email": self.EMAIL, "name": "Smoke Test", "admin_role": "support_admin"}
        r = requests.post(f"{API}/admin/admins/invite", json=body, headers=H, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "accept_url" in d and "invite_id" in d and "expires_at" in d
        # Stash token
        inv = mongo.admin_invites.find_one({"id": d["invite_id"]})
        pytest.invite_token = inv["token"]
        pytest.invite_id = d["invite_id"]

    def test_invite_duplicate_supersedes(self, H, mongo):
        # Re-issuing invite to same pending email should mark old as superseded, new pending
        body = {"email": self.EMAIL, "name": "Smoke Test 2", "admin_role": "support_admin"}
        r = requests.post(f"{API}/admin/admins/invite", json=body, headers=H, timeout=15)
        assert r.status_code == 200
        # Old invite now superseded
        old = mongo.admin_invites.find_one({"id": pytest.invite_id})
        assert old["status"] == "superseded"
        # Update to latest
        latest = mongo.admin_invites.find_one({"email": self.EMAIL, "status": "pending"})
        pytest.invite_token = latest["token"]
        pytest.invite_id = latest["id"]

    def test_list_invites(self, H):
        r = requests.get(f"{API}/admin/admins/invites", headers=H, timeout=10)
        assert r.status_code == 200
        assert any(i["email"] == self.EMAIL for i in r.json()["invites"])

    def test_public_fetch_invite_valid(self):
        r = requests.get(f"{API}/admin/invite/{pytest.invite_token}", timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["status"] == "pending" and d.get("expired") is False
        assert d["email"] == self.EMAIL
        assert d["admin_role"] == "support_admin"

    def test_public_fetch_invite_unknown_404(self):
        r = requests.get(f"{API}/admin/invite/this-token-does-not-exist-abcdef", timeout=10)
        assert r.status_code == 404

    def test_accept_invite(self):
        r = requests.post(f"{API}/admin/invite/accept",
                          json={"token": pytest.invite_token, "password": "NewAdminPass1!"},
                          timeout=15)
        assert r.status_code == 200, r.text

    def test_accept_again_400(self):
        r = requests.post(f"{API}/admin/invite/accept",
                          json={"token": pytest.invite_token, "password": "NewAdminPass1!"},
                          timeout=15)
        assert r.status_code == 400

    def test_public_fetch_invite_now_accepted(self):
        r = requests.get(f"{API}/admin/invite/{pytest.invite_token}", timeout=10)
        assert r.status_code == 200
        assert r.json()["status"] == "accepted"

    def test_login_with_new_admin(self):
        r = requests.post(f"{API}/admin/auth/login",
                          json={"email": self.EMAIL, "password": "NewAdminPass1!"}, timeout=15)
        assert r.status_code == 200, r.text
        d = r.json()
        # Fresh admin: no TOTP yet → expects requires_2fa_setup
        assert d.get("requires_2fa_setup") is True, d

    def test_invite_existing_admin_409(self, H):
        body = {"email": self.EMAIL, "name": "Smoke User", "admin_role": "support_admin"}
        r = requests.post(f"{API}/admin/admins/invite", json=body, headers=H, timeout=10)
        assert r.status_code == 409

    def test_revoke_nonpending_404(self, H):
        r = requests.delete(f"{API}/admin/admins/invites/{pytest.invite_id}", headers=H, timeout=10)
        assert r.status_code == 404  # already accepted

    def test_revoke_pending_invite_ok(self, H, mongo):
        # Create a brand new invite and revoke it
        r = requests.post(f"{API}/admin/admins/invite",
                          json={"email": "smoke-test-e2e+revoke@example.com",
                                "name": "Revoke Me", "admin_role": "content_admin"},
                          headers=H, timeout=15)
        assert r.status_code == 200
        invite_id = r.json()["invite_id"]
        r2 = requests.delete(f"{API}/admin/admins/invites/{invite_id}", headers=H, timeout=10)
        assert r2.status_code == 200
        mongo.admin_invites.delete_many({"email": "smoke-test-e2e+revoke@example.com"})


# -------------------------------------------------------------
# 7. Regression smoke — Phase D + E1
# -------------------------------------------------------------
class TestRegression:
    @pytest.mark.parametrize("path", [
        "/admin/tickets",
        "/admin/feature-flags",
        "/admin/system-health",
        "/admin/admins",
    ])
    def test_endpoints_200(self, H, path):
        r = requests.get(f"{API}{path}", headers=H, timeout=15)
        assert r.status_code == 200, f"{path}: {r.status_code} {r.text[:200]}"
