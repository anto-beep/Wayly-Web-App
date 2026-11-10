"""
Backend regression for Adviser-plan full-removal + Decoder tense fix.
Iteration 390.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-renderer.preview.emergentagent.com").rstrip("/")


# ---- Adviser routes/paths should no longer exist ----
class TestAdviserRoutesRemoved:
    def test_adviser_summary_404(self):
        r = requests.get(f"{BASE_URL}/api/adviser/summary", timeout=15)
        assert r.status_code == 404, f"/api/adviser/summary expected 404, got {r.status_code}"

    def test_public_adviser_invite_404(self):
        r = requests.get(f"{BASE_URL}/api/public/adviser/invite/x", timeout=15)
        assert r.status_code == 404, f"/api/public/adviser/invite/x expected 404, got {r.status_code}"

    def test_adviser_portal_variants_404(self):
        # a couple more surface checks
        for path in ("/api/adviser/brand", "/api/adviser/scenarios", "/api/adviser/alerts"):
            r = requests.get(f"{BASE_URL}{path}", timeout=15)
            assert r.status_code == 404, f"{path} expected 404, got {r.status_code}"


# ---- Checkout: plan=adviser must be rejected; solo/family still accepted ----
class TestCheckoutPlanValidation:
    def _login(self):
        s = requests.Session()
        r = s.post(f"{BASE_URL}/api/auth/login",
                   json={"email": "cathy@example.com", "password": "testpass123"},
                   timeout=20)
        if r.status_code != 200:
            pytest.skip(f"login failed {r.status_code}: {r.text[:200]}")
        tok = r.json().get("access_token") or r.json().get("token")
        if tok:
            s.headers.update({"Authorization": f"Bearer {tok}"})
        return s

    def test_adviser_plan_rejected(self):
        s = self._login()
        r = s.post(f"{BASE_URL}/api/payments/checkout",
                   json={"plan": "adviser", "origin_url": BASE_URL},
                   timeout=20)
        # Must NOT be 2xx. Accept 400/404/422.
        assert r.status_code >= 400, f"adviser plan should be rejected, got {r.status_code}: {r.text[:200]}"
        body = (r.text or "").lower()
        assert "adviser" not in body or "invalid" in body or "unsupported" in body or "not" in body, \
            f"adviser plan should be rejected cleanly, got {r.text[:200]}"

    @pytest.mark.parametrize("plan", ["solo", "family"])
    def test_solo_family_still_valid(self, plan):
        s = self._login()
        r = s.post(f"{BASE_URL}/api/payments/checkout",
                   json={"plan": plan, "origin_url": BASE_URL},
                   timeout=30)
        # Must NOT fail with "invalid plan"
        assert r.status_code != 404, f"{plan} checkout returned 404 {r.text[:200]}"
        if r.status_code >= 400:
            body = r.text.lower()
            assert "plan" not in body or "invalid" not in body, \
                f"{plan} should not be rejected as invalid: {r.text[:200]}"


# ---- Decoder tense fix (RULE_G9) ----
class TestDecoderTense:
    def _call(self, period_start, period_end, anomaly):
        payload = {
            "page_key": "statement-decoder-run",
            "context": {
                "period": f"{period_start} to {period_end}",
                "services": ["personal care", "nursing"],
                "anomaly_headlines": [anomaly],
            },
        }
        r = requests.post(f"{BASE_URL}/api/insights/summarise", json=payload, timeout=60)
        return r

    def test_post_oct_present_tense(self):
        r = self._call(
            "1 November 2026", "30 November 2026",
            "Since 1 October 2026 personal care sits in Clinical Care with no co-contribution.",
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"
        summary = (r.json().get("summary") or r.json().get("text") or "").lower()
        assert summary, f"empty summary response: {r.json()}"
        # No future-tense wording when the period is after Oct 1 2026
        forbidden = ["will shift", "upcoming", "plan ahead", "will move"]
        hits = [w for w in forbidden if w in summary]
        assert not hits, f"post-Oct summary used future-tense wording {hits}: {summary[:400]}"

    def test_pre_oct_future_tense_ok(self):
        r = self._call(
            "1 September 2026", "30 September 2026",
            "From 1 October 2026 personal care will shift to Clinical Care.",
        )
        # For a Sep-period, 'will' wording is acceptable - just check endpoint works
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:200]}"


# ---- Sitemap content ----
class TestSitemap:
    def test_sitemap_hcp_and_no_advisers(self):
        r = requests.get(f"{BASE_URL}/sitemap.xml", timeout=20)
        assert r.status_code == 200, f"sitemap fetch failed {r.status_code}"
        body = r.text
        assert "/for-advisors" not in body, "sitemap still contains /for-advisors"
        must = [
            "/home-care-packages",
            "/resources/articles/what-happened-to-my-home-care-package",
            "/resources/articles/home-care-package-levels-support-at-home-classifications",
            "/resources/articles/home-care-package-statement-vs-support-at-home-statement",
            "/resources/articles/will-i-pay-more-under-support-at-home-than-home-care-package",
        ]
        missing = [u for u in must if u not in body]
        assert not missing, f"sitemap missing HCP URLs: {missing}"
