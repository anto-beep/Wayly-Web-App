"""Phase 3A.2 — Help Centre (Milestone 1) backend tests.

Covers:
- Public endpoints: categories, list, slug, feedback (no auth)
- Admin endpoints: list/get/create/update/workflow/feedback/reporting/knowledge-search
- Privacy guarantees: public endpoints never leak drafts, internal counters
  irrelevant comment data, etc.
- AI grounding: knowledge-search returns only approved/published
- Full workflow on a THROWAWAY test article (create→submit→approve→publish→
  appear publicly→unpublish→disappear→archive)
- Command Centre: /api/admin/command-centre/summary has blocks.help_centre
- Seed drafts intact and NEVER published by test
"""
import os
import re
import time
import pytest
import pyotp
import requests

def _read_backend_url() -> str:
    url = os.environ.get("REACT_APP_BACKEND_URL")
    if not url:
        try:
            with open("/app/frontend/.env", "r") as f:
                for line in f:
                    if line.startswith("REACT_APP_BACKEND_URL="):
                        url = line.split("=", 1)[1].strip().strip('"')
                        break
        except FileNotFoundError:
            pass
    if not url:
        raise RuntimeError("REACT_APP_BACKEND_URL not found")
    return url.rstrip("/")


BASE_URL = _read_backend_url()
ADMIN_EMAIL = "hello@wayly.com.au"
ADMIN_PASS = "Admin!2026"
ADMIN_TOTP = "M5A7R2XCCEXWYYKNJY55MVZYUHPYFA6W"

SEED_SLUGS = {
    "what-is-wayly", "how-to-cancel",  # subset used for verification
}


# --- Fixtures ---------------------------------------------------------------
@pytest.fixture(scope="module")
def admin_token():
    s = requests.Session()
    r = s.post(f"{BASE_URL}/api/admin/auth/login",
               json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    temp = r.json().get("temp_token")
    assert temp, f"no temp_token in response: {r.json()}"
    code = pyotp.TOTP(ADMIN_TOTP).now()
    r = s.post(f"{BASE_URL}/api/admin/auth/2fa/verify",
               json={"temp_token": temp, "code": code}, timeout=30)
    assert r.status_code == 200, f"2fa failed: {r.status_code} {r.text}"
    tok = r.json().get("token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def created_article_ids():
    return []


@pytest.fixture(scope="module", autouse=True)
def cleanup(created_article_ids, admin_headers):
    yield
    for aid in created_article_ids:
        try:
            requests.delete(f"{BASE_URL}/api/admin/help/articles/{aid}",
                            headers=admin_headers, timeout=15)
        except Exception:
            pass


# --- Public endpoints -------------------------------------------------------
class TestPublicHelp:
    def test_public_categories_returns_11(self):
        r = requests.get(f"{BASE_URL}/api/public/help/categories", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "categories" in data
        cats = data["categories"]
        assert len(cats) == 11, f"expected 11 categories, got {len(cats)}"
        slugs = {c["slug"] for c in cats}
        expected = {"getting-started", "registration-trial", "onboarding",
                    "billing-subscriptions", "statement-decoder",
                    "invoice-checker", "ask-wayly", "account-privacy",
                    "technical-troubleshooting", "support-at-home-chsp",
                    "other-tools"}
        assert slugs == expected
        # All counts are 0 right now (seed drafts unpublished).
        for c in cats:
            assert c["count"] == 0, f"category {c['slug']} count != 0"

    def test_public_list_empty_initial(self):
        r = requests.get(f"{BASE_URL}/api/public/help/articles", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["articles"] == []
        assert data["total"] == 0

    def test_public_list_query_logs_search(self):
        """Search with q= logs search for knowledge-gap reporting."""
        r = requests.get(f"{BASE_URL}/api/public/help/articles",
                         params={"q": "TEST_unanswered_zzz_iter398"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["articles"] == []

    def test_public_get_draft_returns_404(self):
        """Draft articles must NOT be publicly visible."""
        r = requests.get(f"{BASE_URL}/api/public/help/articles/what-is-wayly",
                         timeout=15)
        assert r.status_code == 404

    def test_public_tool_key_filter_empty(self):
        r = requests.get(f"{BASE_URL}/api/public/help/articles",
                         params={"tool_key": "statement-decoder"}, timeout=15)
        assert r.status_code == 200
        assert r.json()["articles"] == []

    def test_public_feedback_nonexistent_slug_404(self):
        r = requests.post(
            f"{BASE_URL}/api/public/help/articles/does-not-exist-iter398/feedback",
            json={"helpful": True}, timeout=15)
        assert r.status_code == 404


# --- Admin basics -----------------------------------------------------------
class TestAdminHelpBasics:
    def test_admin_categories(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/help/categories",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert len(data["categories"]) == 11
        assert set(data["statuses"]) == {"draft", "in_review", "approved",
                                         "published", "archived"}

    def test_admin_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/admin/help/articles", timeout=15)
        assert r.status_code in (401, 403)

    def test_admin_list_has_15_seed_drafts(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/help/articles",
                         params={"status": "draft", "page_size": 200},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        # Expect at least 15 seeded drafts
        assert data["total"] >= 15, f"expected ≥15 drafts, got {data['total']}"
        counts = data["status_counts"]
        assert counts["draft"] >= 15
        slugs = {a["slug"] for a in data["rows"]}
        # Check a couple of expected seed slugs
        assert "what-is-wayly" in slugs, f"seed slug missing; got sample={list(slugs)[:5]}"

    def test_admin_knowledge_search_empty_until_published(self, admin_headers):
        """AI grounding must return [] while all 15 drafts unpublished."""
        r = requests.get(f"{BASE_URL}/api/admin/help/knowledge-search",
                         params={"q": "cancel"}, headers=admin_headers,
                         timeout=15)
        assert r.status_code == 200
        assert r.json()["results"] == [], \
            "knowledge-search must be empty when nothing is approved/published"

    def test_admin_reporting_block(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/help/reporting",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert "metrics" in data
        m = data["metrics"]
        assert m["published_articles"] == 0
        assert m["pending_approval"] >= 15

    def test_admin_feedback_endpoint(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/help/feedback",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert "rows" in r.json()


# --- Full throwaway workflow ------------------------------------------------
class TestWorkflow:
    def _unique_slug(self):
        return f"test-iter398-throwaway-{int(time.time())}"

    def test_full_workflow(self, admin_headers, created_article_ids):
        slug = self._unique_slug()
        # CREATE draft
        create_body = {
            "title": "TEST_iter398 throwaway article",
            "summary": "A throwaway test article exercising the full workflow.",
            "body_md": "# Hello\n\nThis is a TEST_iter398 test article body with enough content.",
            "category": "other-tools",
            "slug": slug,
            "tags": ["test", "iter398"],
            "tool_keys": ["statement-decoder"],
        }
        r = requests.post(f"{BASE_URL}/api/admin/help/articles",
                          headers=admin_headers, json=create_body, timeout=15)
        assert r.status_code == 200, r.text
        art = r.json()["article"]
        article_id = art["id"]
        created_article_ids.append(article_id)
        assert art["status"] == "draft"
        assert art["version"] == 1

        # VERIFY not public yet
        r = requests.get(f"{BASE_URL}/api/public/help/articles/{slug}", timeout=15)
        assert r.status_code == 404, "draft must not be publicly visible"

        # UPDATE should bump version + create snapshot
        r = requests.put(f"{BASE_URL}/api/admin/help/articles/{article_id}",
                         headers=admin_headers,
                         json={"summary": "Updated summary for TEST_iter398 version bump."},
                         timeout=15)
        assert r.status_code == 200
        assert r.json()["version"] == 2

        # SUBMIT -> in_review
        r = requests.post(f"{BASE_URL}/api/admin/help/articles/{article_id}/submit",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "in_review"

        # Still not public
        assert requests.get(
            f"{BASE_URL}/api/public/help/articles/{slug}", timeout=15
        ).status_code == 404

        # APPROVE -> approved
        r = requests.post(f"{BASE_URL}/api/admin/help/articles/{article_id}/approve",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "approved"

        # Approved but unpublished must STILL be 404 publicly
        assert requests.get(
            f"{BASE_URL}/api/public/help/articles/{slug}", timeout=15
        ).status_code == 404

        # Knowledge-search should now include this article (approved = grounding)
        r = requests.get(f"{BASE_URL}/api/admin/help/knowledge-search",
                         params={"q": "throwaway"},
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        assert any(x["slug"] == slug for x in r.json()["results"]), \
            "approved article must be grounded in knowledge-search"

        # PUBLISH
        r = requests.post(f"{BASE_URL}/api/admin/help/articles/{article_id}/publish",
                          headers=admin_headers, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "published"

        # NOW public
        r = requests.get(f"{BASE_URL}/api/public/help/articles/{slug}", timeout=15)
        assert r.status_code == 200
        pub = r.json()
        assert pub["slug"] == slug
        assert pub["title"] == create_body["title"]
        assert "related" in pub
        # Public projection must not leak private fields
        for private in ("approved_by", "approved_at", "created_by",
                         "updated_by", "is_outdated"):
            assert private not in pub, f"public leaked {private}"

        # Also appears in public list
        r = requests.get(f"{BASE_URL}/api/public/help/articles",
                         params={"q": "throwaway"}, timeout=15)
        assert r.status_code == 200
        assert any(a["slug"] == slug for a in r.json()["articles"])

        # Feedback happy path
        r = requests.post(
            f"{BASE_URL}/api/public/help/articles/{slug}/feedback",
            json={"helpful": True, "comment": "TEST_iter398 helpful"}, timeout=15)
        assert r.status_code == 200
        # Spam reject (3+ links)
        r = requests.post(
            f"{BASE_URL}/api/public/help/articles/{slug}/feedback",
            json={"helpful": False,
                  "comment": "see https://a.com and http://b.com and https://c.com"},
            timeout=15)
        assert r.status_code == 400

        # Public endpoint must NOT return feedback comments
        r = requests.get(f"{BASE_URL}/api/public/help/articles/{slug}", timeout=15)
        pub = r.json()
        txt = str(pub)
        assert "TEST_iter398 helpful" not in txt, \
            "feedback comment leaked to public endpoint"

        # But admin detail DOES show private comments
        r = requests.get(f"{BASE_URL}/api/admin/help/articles/{article_id}",
                         headers=admin_headers, timeout=15)
        assert r.status_code == 200
        detail = r.json()
        comments = detail["feedback"]["comments"]
        assert any("TEST_iter398 helpful" in (c.get("comment") or "")
                   for c in comments), "admin should see private comment"
        # versions snapshotted
        assert len(detail["versions"]) >= 2

        # UNPUBLISH
        r = requests.post(
            f"{BASE_URL}/api/admin/help/articles/{article_id}/unpublish",
            headers=admin_headers, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "approved"

        # Must disappear publicly
        assert requests.get(
            f"{BASE_URL}/api/public/help/articles/{slug}", timeout=15
        ).status_code == 404

        # ARCHIVE
        r = requests.post(
            f"{BASE_URL}/api/admin/help/articles/{article_id}/archive",
            headers=admin_headers, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "archived"

    def test_seed_drafts_remain_unpublished(self, admin_headers):
        """Guardrail: the 15 seeded drafts must still all be drafts."""
        r = requests.get(f"{BASE_URL}/api/admin/help/articles",
                         params={"page_size": 200}, headers=admin_headers,
                         timeout=15)
        assert r.status_code == 200
        counts = r.json()["status_counts"]
        assert counts["draft"] >= 15, \
            f"seed drafts tampered; drafts={counts['draft']}"
        assert counts["published"] == 0, \
            f"NO seed article should be published; published={counts['published']}"


# --- Command Centre integration --------------------------------------------
class TestCommandCentre:
    def test_summary_has_help_centre_block(self, admin_headers):
        r = requests.get(f"{BASE_URL}/api/admin/command-centre/summary",
                         headers=admin_headers, timeout=30)
        assert r.status_code == 200
        data = r.json()
        blocks = data["blocks"]
        assert "help_centre" in blocks, "missing help_centre block"
        hc = blocks["help_centre"]
        assert "data" in hc
        for k in ("published_articles", "pending_approval",
                  "unanswered_searches_30d", "feedback_helpful_pct_30d",
                  "outdated_articles"):
            assert k in hc["data"], f"help_centre missing key {k}"
        # No regression in other blocks
        for block in ("revenue", "growth", "support", "marketing",
                      "alerts", "approvals"):
            assert block in blocks, f"regression: missing {block}"
