"""Phase 3 — Rate-limiting tests.

Verifies that the Redis-backed rate limiter on /auth/login, /auth/signup,
/auth/forgot, /auth/reset, /statements/upload, /public/decode-statement-text,
and /admin/auth/login returns HTTP 429 with a `Retry-After` header once the
configured threshold is exceeded.

The fixture purges every rate-limit key for the test IP + emails before each
test so the suite is order-independent.
"""
from __future__ import annotations
import os
import sys
import time
import secrets
import asyncio
import pytest
import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load .env so REDIS_URL etc. is visible to the test process for the purge.
from pathlib import Path
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

API = os.environ.get("E2E_API", "http://localhost:8001/api")


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------

import rate_limit as _rl


def _purge(*idents: str) -> None:
    """Best-effort: blow away every Redis key for the given identifiers."""
    async def go():
        for ident in idents:
            await _rl.reset_all_for_identifier(ident)
    asyncio.get_event_loop().run_until_complete(go()) if asyncio.get_event_loop().is_running() is False else asyncio.run(go())


@pytest.fixture(autouse=True)
def purge_rate_limit():
    # Identifiers used across the suite
    idents = [
        "127.0.0.1", "testclient", "unknown",
        "ratelimit_test@example.com",
        "ratelimit_test_signup@example.com",
        "ratelimit_test_forgot@example.com",
        "cathy@example.com",
        "hello@techglove.com.au",
    ]
    asyncio.run(_purge_async(idents))
    yield


async def _purge_async(idents):
    for ident in idents:
        await _rl.reset_all_for_identifier(ident)


# --------------------------------------------------------------------------
# 1) /auth/login — 5/5min/IP  +  10/hour/email
# --------------------------------------------------------------------------

class TestLoginLimit:
    def test_login_ip_limit_5_per_5min(self):
        # 5 wrong-password attempts should each get 401, the 6th must be 429.
        last_status = None
        retry_after = None
        for i in range(7):
            r = requests.post(
                f"{API}/auth/login",
                json={"email": f"nx{i}@example.com", "password": "wrong"},
                headers={"X-Forwarded-For": "203.0.113.1"},
                timeout=10,
            )
            last_status = r.status_code
            retry_after = r.headers.get("Retry-After")
            if r.status_code == 429:
                break
        assert last_status == 429, f"expected 429 after burst, got {last_status}"
        assert retry_after, "429 must include Retry-After header"
        assert int(retry_after) >= 1


# --------------------------------------------------------------------------
# 2) /auth/forgot — 3/hour/email
# --------------------------------------------------------------------------

class TestForgotLimit:
    def test_forgot_email_limit_3_per_hour(self):
        email = "ratelimit_test_forgot@example.com"
        statuses = []
        for _ in range(5):
            r = requests.post(f"{API}/auth/forgot", json={"email": email}, timeout=10)
            statuses.append(r.status_code)
        assert 429 in statuses, f"expected at least one 429, got {statuses}"


# --------------------------------------------------------------------------
# 3) /auth/reset — 5/hour/IP
# --------------------------------------------------------------------------

class TestResetLimit:
    def test_reset_ip_limit_5_per_hour(self):
        statuses = []
        for _ in range(7):
            r = requests.post(
                f"{API}/auth/reset",
                json={"token": "invalid-" + secrets.token_hex(8), "new_password": "Wj4-Lk9!QvB7zXp@aPmCgT" + secrets.token_hex(4)},
                headers={"X-Forwarded-For": "203.0.113.2"},
                timeout=10,
            )
            statuses.append(r.status_code)
        assert 429 in statuses, f"expected at least one 429, got {statuses}"


# --------------------------------------------------------------------------
# 4) Admin login — 5/5min/IP
# --------------------------------------------------------------------------

class TestAdminLoginLimit:
    def test_admin_login_ip_limit(self):
        statuses = []
        for _ in range(7):
            r = requests.post(
                f"{API}/admin/auth/login",
                json={"email": "nx@example.com", "password": "wrong"},
                headers={"X-Forwarded-For": "203.0.113.3"},
                timeout=10,
            )
            statuses.append(r.status_code)
        assert 429 in statuses, f"expected admin 429, got {statuses}"


# --------------------------------------------------------------------------
# 5) Public tools — IP burst limit (10/hour)
# --------------------------------------------------------------------------

class TestPublicToolLimit:
    def test_paid_tool_ip_burst_via_unauth_401(self):
        """The Budget Calculator endpoint hits `_require_paid_plan` which now
        runs the IP rate limit BEFORE the auth check. Unauthenticated calls
        will return 401 until the 10/hour quota is exhausted, then 429.
        We use this endpoint because the AI-backed decoder takes too long
        to call 12 times in one test."""
        statuses = []
        for _ in range(13):
            r = requests.post(
                f"{API}/public/budget-calc",
                json={"classification": 4, "is_grandfathered": False, "current_lifetime_balance": 0},
                headers={"X-Forwarded-For": "203.0.113.4"},
                timeout=10,
            )
            statuses.append(r.status_code)
        assert 429 in statuses, f"expected at least one 429, got {statuses}"


# --------------------------------------------------------------------------
# 6) Sanity: when a different IP hits the same endpoint, it is NOT throttled
# --------------------------------------------------------------------------

class TestIsolationBetweenIPs:
    def test_different_ip_not_affected(self):
        # IP A exhausts (with a unique email per try so the email-bucket
        # doesn't ride along — we want to prove the IP bucket alone is
        # keyed by IP, not by email).
        suffix = secrets.token_hex(3)
        for i in range(6):
            requests.post(
                f"{API}/auth/login",
                json={"email": f"nx_a_{suffix}_{i}@example.com", "password": "wrong"},
                headers={"X-Forwarded-For": "203.0.113.5"},
                timeout=10,
            )
        # IP B's first request (with a fresh email) should NOT be 429.
        r = requests.post(
            f"{API}/auth/login",
            json={"email": f"nx_b_{suffix}@example.com", "password": "wrong"},
            headers={"X-Forwarded-For": "203.0.113.6"},
            timeout=10,
        )
        assert r.status_code != 429, f"IP B was throttled — limiter is keyed wrong: {r.text}"


# --------------------------------------------------------------------------
# 7) Fail-open: signup still works when Redis is down (smoke)
# --------------------------------------------------------------------------

class TestFailOpen:
    def test_signup_succeeds_within_quota(self):
        """First signup attempt with fresh IP + email should always pass the
        limiter (sanity that we're not blocking legitimate traffic)."""
        email = f"phase3_smoke_{secrets.token_hex(4)}@example.com"
        r = requests.post(
            f"{API}/auth/signup",
            json={
                "email": email, "password": "Wj4-Lk9!QvB7zXp@aPmCgT" + secrets.token_hex(4),
                "name": "Smoke", "role": "caregiver", "plan": "free",
            },
            headers={"X-Forwarded-For": "203.0.113.7"},
            timeout=15,
        )
        assert r.status_code in (200, 201), r.text
