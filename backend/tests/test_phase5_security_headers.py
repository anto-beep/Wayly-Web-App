"""Phase 5 — HTTP security headers tests.

Verifies that every API response carries the expected security headers, and
that the SPA-side `_headers` file mirrors the same directives so static
asset requests are equally protected.
"""
from __future__ import annotations
import os
import sys
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API = os.environ.get("E2E_API", "http://localhost:8001/api")

REQUIRED_HEADERS = [
    "strict-transport-security",
    "x-content-type-options",
    "x-frame-options",
    "referrer-policy",
    "permissions-policy",
    "cross-origin-opener-policy",
    "cross-origin-resource-policy",
    "content-security-policy",
]


@pytest.mark.parametrize("endpoint", [
    "/auth/me",                # 401
    "/public/contribution-estimator",  # 401/400 — still gets headers
    "/account",                # 401
])
def test_every_api_response_has_security_headers(endpoint):
    r = requests.get(f"{API}{endpoint}", timeout=10)
    headers_lower = {k.lower() for k in r.headers.keys()}
    for h in REQUIRED_HEADERS:
        assert h in headers_lower, f"missing {h} on {endpoint}: have {headers_lower}"


def test_hsts_two_year_max_age():
    r = requests.get(f"{API}/auth/me", timeout=10)
    hsts = r.headers.get("strict-transport-security", "")
    assert "max-age=63072000" in hsts, f"weak HSTS: {hsts}"
    assert "includeSubDomains" in hsts
    assert "preload" in hsts


def test_xframe_options_is_deny():
    r = requests.get(f"{API}/auth/me", timeout=10)
    assert r.headers.get("x-frame-options") == "DENY"


def test_csp_has_frame_ancestors_none():
    r = requests.get(f"{API}/auth/me", timeout=10)
    csp = r.headers.get("content-security-policy", "")
    assert "frame-ancestors 'none'" in csp, f"csp missing frame-ancestors: {csp}"
    assert "object-src 'none'" in csp
    assert "base-uri 'self'" in csp


def test_health_endpoint_skipped_for_performance():
    # /api/health is exempt by design — confirm that's still the case.
    r = requests.get(f"{API}/health", timeout=5)
    # Whatever the status, the headers should not be on this route.
    if r.status_code == 200:
        assert "content-security-policy" not in {k.lower() for k in r.headers.keys()}


def test_spa_headers_file_exists_and_matches():
    """The SPA-side `_headers` file (used by Cloudflare Pages / Netlify) must
    declare the same baseline so static asset requests aren't an under-protected
    sibling of /api."""
    path = Path("/app/frontend/public/_headers")
    assert path.exists(), "frontend/public/_headers is missing — SPA headers won't apply"
    text = path.read_text()
    for needle in [
        "Strict-Transport-Security: max-age=63072000",
        "X-Frame-Options: DENY",
        "X-Content-Type-Options: nosniff",
        "Referrer-Policy: strict-origin-when-cross-origin",
        "frame-ancestors 'none'",
        "object-src 'none'",
    ]:
        assert needle in text, f"_headers missing: {needle}"
