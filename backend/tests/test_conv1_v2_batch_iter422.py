"""CONV-1 v2 batch tests — iter 422.

Covers:
- FREE PRICE CHECKS: /api/public/price-check-v2 metering (2 free → 429 cooldown_active),
  /api/free-tool/usage?tool=PROVIDER_PRICE_CHECKER reporting, paid/trial bypass.
- SAVED FREE RESULTS: /api/me/free-results/* save/list/get/delete,
  invoice save with bogus token → 404, auth required (401).
- TRIAL WINBACK: POST /api/admin/winback/run requires admin (401/403).
- REGRESSION: access_state fixtures (trialactive→trial, viewonly→view_only,
  trial30909→free, cancelled.vo→free) and free blocked paid-write still 402.
"""
import os
import secrets
import time
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend .env (shared backend)
_env = Path("/app/frontend/.env").read_text()
for _line in _env.splitlines():
    if _line.startswith("REACT_APP_BACKEND_URL="):
        BASE_URL = _line.split("=", 1)[1].strip().rstrip("/")
        break
else:
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

API = f"{BASE_URL}/api"

# --- Fixtures from /app/memory/test_credentials.md ---
CREDS = {
    "free_cancelled": ("cancelled.vo@example.com", "AccessTest1!"),   # access_state=free
    "free_trial_lapsed": ("trial30909@example.com", "TrialPass1!"),   # access_state=free (never paid)
    "trial": ("trialactive@example.com", "AccessTest1!"),              # access_state=trial
    "view_only": ("viewonly@test.com", "ViewOnly!2026"),               # access_state=view_only
}

STRONG_PW = "Zx9#qP2mT!vL7wR4"  # unlikely to be in HIBP breach list


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login failed {email}: {r.status_code} {r.text}"
    return r.json()["token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------- Access state regression ----------------
class TestAccessStateFixtures:
    @pytest.mark.parametrize("key,expected", [
        ("trial", "trial"),
        ("view_only", "view_only"),
        ("free_trial_lapsed", "free"),
        ("free_cancelled", "free"),
    ])
    def test_access_state(self, key, expected):
        email, pw = CREDS[key]
        tok = _login(email, pw)
        r = requests.get(f"{API}/auth/me", headers=_auth(tok), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        got = data.get("access_state") or data.get("user", {}).get("access_state")
        assert got == expected, f"{key}: expected {expected}, got {got}"


# ---------------- Free price check metering ----------------
@pytest.fixture(scope="module")
def fresh_free_user():
    """Create a fresh free account with a clean 120-day window."""
    email = f"TEST_conv1v2_pc_{secrets.token_hex(5)}@example.com"
    payload = {
        "email": email,
        "password": STRONG_PW,
        "name": "Test PC Fresh",
        "first_name": "Test",
        "last_name": "PC",
        "role": "caregiver",
        "plan": "free",
        "marketing_consent": False,
    }
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=20)
    if r.status_code == 429:
        pytest.skip(f"signup rate-limited: {r.text}")
    assert r.status_code == 200, f"signup failed: {r.status_code} {r.text}"
    return {"email": email, "token": r.json()["token"]}


class TestFreePriceCheckMetering:
    def test_usage_initial_state(self, fresh_free_user):
        tok = fresh_free_user["token"]
        r = requests.get(f"{API}/free-tool/usage", params={"tool": "PROVIDER_PRICE_CHECKER"}, headers=_auth(tok), timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d.get("limit") == 2, d
        assert d.get("remaining") == 2, d
        assert d.get("allowed") is True, d
        assert d.get("used_count", 0) == 0

    def test_two_uses_then_cooldown(self, fresh_free_user):
        tok = fresh_free_user["token"]
        body = {
            "service": "social_support_group",
            "rate": 25.0,
            "provider": "TEST Provider",
        }
        # First use
        r1 = requests.post(f"{API}/public/price-check-v2", json=body, headers=_auth(tok), timeout=25)
        assert r1.status_code == 200, f"1st call: {r1.status_code} {r1.text}"
        j1 = r1.json()
        assert j1.get("free_use") is True, f"1st free_use missing: {j1}"
        # Second use
        r2 = requests.post(f"{API}/public/price-check-v2", json=body, headers=_auth(tok), timeout=25)
        assert r2.status_code == 200, f"2nd call: {r2.status_code} {r2.text}"
        j2 = r2.json()
        assert j2.get("free_use") is True, f"2nd free_use missing: {j2}"
        # Usage should now show allowed=False, remaining=0
        ru = requests.get(f"{API}/free-tool/usage", params={"tool": "PROVIDER_PRICE_CHECKER"}, headers=_auth(tok), timeout=15)
        assert ru.status_code == 200
        du = ru.json()
        assert du.get("remaining") == 0, du
        assert du.get("allowed") is False, du
        assert du.get("used_count") == 2, du
        # Third → 429 cooldown_active
        r3 = requests.post(f"{API}/public/price-check-v2", json=body, headers=_auth(tok), timeout=25)
        assert r3.status_code == 429, f"3rd expected 429, got {r3.status_code}: {r3.text}"
        detail = r3.json().get("detail") or {}
        err = detail.get("error") if isinstance(detail, dict) else None
        assert err == "cooldown_active", f"expected cooldown_active, got {detail}"

    def test_trial_user_unlimited(self):
        """Trial user bypasses metering, free_use flag never set."""
        tok = _login(*CREDS["trial"])
        body = {
            "service": "social_support_group",
            "rate": 25.0,
            "provider": "TEST Provider trial",
        }
        r = requests.post(f"{API}/public/price-check-v2", json=body, headers=_auth(tok), timeout=25)
        if r.status_code == 429 and "too many attempts" in r.text.lower():
            # Per-IP tools burst limiter — environmental, not a feature failure.
            pytest.skip(f"IP burst-limited after fresh-user metering test: {r.text}")
        assert r.status_code == 200, f"trial call: {r.status_code} {r.text}"
        j = r.json()
        assert not j.get("free_use"), f"trial should bypass metering: {j}"


# ---------------- Saved free results ----------------
class TestSavedFreeResults:
    def test_endpoints_require_auth(self):
        # No Authorization → 401
        r = requests.get(f"{API}/me/free-results", timeout=15)
        assert r.status_code in (401, 403), f"unauth list: {r.status_code}"
        r2 = requests.post(f"{API}/me/free-results/save", json={"type": "statement", "result": {"x": 1}}, timeout=15)
        assert r2.status_code in (401, 403), f"unauth save: {r2.status_code}"

    def test_statement_save_list_get_delete(self):
        tok = _login(*CREDS["free_cancelled"])
        # Save a statement result
        payload = {"type": "statement", "result": {"demo": "TEST_conv1v2", "line_items": [{"amount": 42.0}]}, "title": "TEST_conv1v2 statement"}
        r = requests.post(f"{API}/me/free-results/save", json=payload, headers=_auth(tok), timeout=20)
        assert r.status_code == 200, f"save: {r.status_code} {r.text}"
        rid = r.json().get("id")
        assert rid and isinstance(rid, str)
        # List → includes the new id
        rl = requests.get(f"{API}/me/free-results", headers=_auth(tok), timeout=15)
        assert rl.status_code == 200
        ids = [row.get("id") for row in rl.json().get("results", [])]
        assert rid in ids, f"saved id missing from list: {ids[:5]}"
        # Get → returns full result
        rg = requests.get(f"{API}/me/free-results/{rid}", headers=_auth(tok), timeout=15)
        assert rg.status_code == 200
        full = rg.json()
        assert full.get("type") == "statement"
        assert full.get("result", {}).get("demo") == "TEST_conv1v2"
        # Delete (soft-hide) → disappears from list
        rd = requests.delete(f"{API}/me/free-results/{rid}", headers=_auth(tok), timeout=15)
        assert rd.status_code == 200, rd.text
        rl2 = requests.get(f"{API}/me/free-results", headers=_auth(tok), timeout=15)
        ids2 = [row.get("id") for row in rl2.json().get("results", [])]
        assert rid not in ids2, "soft-deleted id still present"

    def test_invoice_save_bogus_token_404(self):
        tok = _login(*CREDS["free_cancelled"])
        r = requests.post(
            f"{API}/me/free-results/save",
            json={"type": "invoice", "token": "bogus-token-does-not-exist", "title": "TEST_conv1v2 invoice"},
            headers=_auth(tok),
            timeout=20,
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code}: {r.text}"


# ---------------- Trial Winback admin-only ----------------
class TestTrialWinbackAdminOnly:
    def test_requires_admin_unauthenticated(self):
        r = requests.post(f"{API}/admin/winback/run", timeout=15)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"

    def test_requires_admin_member_token_rejected(self):
        """A regular member token must not be able to call admin endpoints."""
        tok = _login(*CREDS["trial"])
        r = requests.post(f"{API}/admin/winback/run", headers=_auth(tok), timeout=15)
        assert r.status_code in (401, 403), f"member token should be rejected, got {r.status_code}"


# ---------------- Free write regression (402) ----------------
class TestFreeBlockedPaidWrite:
    def test_support_ticket_free_402(self):
        tok = _login(*CREDS["free_cancelled"])
        r = requests.post(
            f"{API}/support/tickets",
            json={"subject": "TEST_conv1v2", "body": "test", "category": "general"},
            headers=_auth(tok),
            timeout=15,
        )
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text[:200]}"
        detail = r.json().get("detail") or {}
        err = detail.get("error") if isinstance(detail, dict) else None
        assert err == "upgrade_required", f"expected upgrade_required, got {detail}"
