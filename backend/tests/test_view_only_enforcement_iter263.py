"""iter263 — verify view-only (INACTIVE plan) users cannot run tools/edits.

Covers the prod bug fix: backend middleware now reads authoritative
subscription doc (not the users.subscription_status mirror), and writes
from view-only users must 402. Also confirms ACTIVE/TRIAL users are NOT
blocked (regression).

BASE_URL comes from REACT_APP_BACKEND_URL (shared backend).
"""
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

USERS = {
    "view_only": ("cancelled.vo@example.com", "AccessTest1!"),
    "active":    ("cathy@example.com",         "testpass123"),
    "trial":     ("trialactive@example.com",   "AccessTest1!"),
}


def _login(email: str, password: str) -> str | None:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    if r.status_code != 200:
        return None
    j = r.json()
    return j.get("access_token") or j.get("token")


@pytest.fixture(scope="module")
def tokens():
    return {k: _login(e, p) for k, (e, p) in USERS.items()}


def _auth(tok):
    return {"Authorization": f"Bearer {tok}"}


# --- 1. /auth/me returns access_state correctly for each fixture -------------
@pytest.mark.parametrize("key,expected", [
    ("view_only", "view_only"),
    ("active",    "active"),
    ("trial",     "trial"),
])
def test_auth_me_access_state(tokens, key, expected):
    tok = tokens.get(key)
    if not tok:
        pytest.skip(f"login failed for {key}")
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_auth(tok), timeout=30)
    assert r.status_code == 200
    assert r.json().get("access_state") == expected


# --- 2. VIEW-ONLY: writes to tool/feature endpoints return 402 ---------------
# Endpoints called out in review request (statement upload, invoice upload,
# provider ratings, save-to-profile). Payloads are minimal; middleware runs
# BEFORE route validation so we don't need valid bodies.
VIEW_ONLY_WRITES = [
    ("POST",  "/api/provider-ratings",        {"provider_name": "TEST_iter263", "rating": 4}),
    ("POST",  "/api/documents",               {"name": "TEST_iter263.pdf"}),
    ("POST",  "/api/v2/participants",         {"name": "TEST_iter263", "role": "participant"}),
    ("POST",  "/api/participant/wellbeing",   {"mood": "good"}),
    ("POST",  "/api/participant/concern",     {"note": "TEST_iter263"}),
    ("POST",  "/api/chat",                    {"message": "test"}),
    ("POST",  "/api/family-thread",           {"message": "TEST_iter263"}),
]


@pytest.mark.parametrize("method,path,payload", VIEW_ONLY_WRITES)
def test_view_only_writes_return_402(tokens, method, path, payload):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    r = requests.request(method, f"{BASE_URL}{path}",
                         json=payload, headers=_auth(tok), timeout=30)
    assert r.status_code == 402, (
        f"expected 402 read-only for {method} {path}, got {r.status_code}: {r.text[:200]}"
    )
    detail = r.json().get("detail", {})
    assert detail.get("read_only") is True or detail.get("error") == "trial_expired", (
        f"402 body missing read_only marker: {r.json()}"
    )


# --- 3. VIEW-ONLY: multipart uploads (invoice + statement) also blocked ------
@pytest.mark.parametrize("path", [
    "/api/invoices/upload",
    "/api/statements/upload",
])
def test_view_only_multipart_uploads_return_402(tokens, path):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    files = {"file": ("TEST_iter263.pdf", io.BytesIO(b"%PDF-1.4\ntest"), "application/pdf")}
    r = requests.post(f"{BASE_URL}{path}", files=files, headers=_auth(tok), timeout=30)
    assert r.status_code == 402, (
        f"expected 402 for view-only upload {path}, got {r.status_code}: {r.text[:200]}"
    )
    detail = r.json().get("detail", {})
    assert detail.get("read_only") is True or detail.get("error") == "trial_expired"


# --- 4. VIEW-ONLY: GETs still succeed (reads not blocked) --------------------
@pytest.mark.parametrize("path", [
    "/api/auth/me",
    "/api/v2/participants",
    "/api/documents",
    "/api/statements",
])
def test_view_only_gets_return_200(tokens, path):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    r = requests.get(f"{BASE_URL}{path}", headers=_auth(tok), timeout=30)
    assert r.status_code == 200, f"GET {path} view_only got {r.status_code}"


# --- 5. VIEW-ONLY: billing/reactivation stays reachable ----------------------
def test_view_only_billing_checkout_not_402(tokens):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    hits = 0
    for path in ["/api/payments/checkout", "/api/billing/checkout"]:
        r = requests.post(f"{BASE_URL}{path}",
                          json={"plan": "family", "origin_url": BASE_URL},
                          headers=_auth(tok), timeout=45)
        if r.status_code == 404:
            continue
        hits += 1
        # Middleware must NOT short-circuit billing routes for view-only users.
        if r.status_code == 402:
            detail = r.json().get("detail", {})
            assert detail.get("read_only") is not True, (
                f"billing path {path} incorrectly blocked by read-only middleware: {r.json()}"
            )
    assert hits > 0, "neither /payments/checkout nor /billing/checkout responded"


def test_view_only_can_load_billing_subscription(tokens):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    r = requests.get(f"{BASE_URL}/api/billing/subscription",
                     headers=_auth(tok), timeout=30)
    assert r.status_code == 200


# --- 6. ACTIVE + TRIAL: writes are NOT blocked by the read-only middleware --
@pytest.mark.parametrize("key", ["active", "trial"])
def test_active_and_trial_not_blocked(tokens, key):
    tok = tokens.get(key)
    if not tok:
        pytest.skip(f"{key} login failed")
    r = requests.post(f"{BASE_URL}/api/provider-ratings",
                      json={"provider_name": "TEST_iter263", "rating": 5},
                      headers=_auth(tok), timeout=30)
    # Not the read_only 402 sentinel — a route-level 4xx/2xx is fine.
    if r.status_code == 402:
        detail = r.json().get("detail", {})
        assert detail.get("read_only") is not True and detail.get("error") != "trial_expired", (
            f"{key} write hit read-only middleware: {r.json()}"
        )
    assert r.status_code < 500


# --- 7. Backend still exempts /api/public/budget-calc (client-side fix) -----
# Confirming behavior: /public/ IS still exempt from the middleware. The fix
# for the budget-calc bug is client-side (removed /public/ from client
# allow-lists + ToolLockGate). We just document the backend response.
def test_public_budget_calc_backend_still_open(tokens):
    """Documentation: backend /public/budget-calc is NOT blocked by middleware.
    Client-side ToolLockGate is the mechanism that prevents view-only users
    from running the Budget Calculator."""
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    r = requests.post(f"{BASE_URL}/api/public/budget-calc",
                      json={"income": 1000, "expenses": [{"name": "rent", "amount": 500}]},
                      headers=_auth(tok), timeout=30)
    # Whatever the route returns, it must NOT be the read-only 402 sentinel.
    if r.status_code == 402:
        detail = r.json().get("detail", {})
        assert detail.get("read_only") is not True
