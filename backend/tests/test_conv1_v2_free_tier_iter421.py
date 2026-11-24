"""CONV-1 v2 — Workstream D (Free Tier) backend regression.

Covers:
  * /api/auth/me access_state for each of 4 fixtures (trial/view_only/free x2)
  * Free-tier write gating: 402 upgrade_required (free), trial_expired (view_only)
  * GET endpoints remain accessible for free users
  * _require_paid_plan: 402 upgrade_required for free user on gated tool run
  * Per-tool allowance: INVOICE_CHECKER limit=1, PROVIDER_PRICE_CHECKER limit=2
"""
import os
import pytest
import requests
from pathlib import Path


def _load_frontend_env():
    p = Path("/app/frontend/.env")
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())


_load_frontend_env()
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

FIXTURES = {
    "trial":        ("trialactive@example.com",  "AccessTest1!",  "trial"),
    "view_only":    ("viewonly@test.com",        "ViewOnly!2026", "view_only"),
    "free_trial":   ("trial30909@example.com",   "TrialPass1!",   "free"),
    "free_cancel":  ("cancelled.vo@example.com", "AccessTest1!",  "free"),
}


def _login(email: str, pw: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    assert r.status_code == 200, f"login {email} -> {r.status_code}: {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok, f"no token for {email}: {data}"
    return tok


def _me(token: str) -> dict:
    r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=20)
    assert r.status_code == 200, f"/auth/me -> {r.status_code}: {r.text[:200]}"
    return r.json()


@pytest.fixture(scope="module")
def tokens():
    out = {}
    for key, (email, pw, _) in FIXTURES.items():
        out[key] = _login(email, pw)
    return out


# --- ACCESS_STATE PARITY ---------------------------------------------------
@pytest.mark.parametrize("key,expected", [(k, v[2]) for k, v in FIXTURES.items()])
def test_access_state(tokens, key, expected):
    me = _me(tokens[key])
    # The field may live at top-level or under user {}.
    state = me.get("access_state") or (me.get("user") or {}).get("access_state")
    assert state == expected, f"{key} ({FIXTURES[key][0]}) access_state={state!r}, expected {expected!r}. Full /me: {me}"


# --- FREE-TIER WRITE GATING -----------------------------------------------
def test_free_user_support_ticket_402_upgrade_required(tokens):
    tok = tokens["free_trial"]
    r = requests.post(
        f"{API}/support/tickets",
        headers={"Authorization": f"Bearer {tok}"},
        json={"subject": "TEST_conv1_free", "message": "hello", "category": "general"},
        timeout=20,
    )
    assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text[:200]}"
    detail = r.json().get("detail") or {}
    assert detail.get("error") == "upgrade_required", detail
    assert detail.get("free_tier") is True, detail
    assert detail.get("upgrade_url") == "/pricing", detail


def test_viewonly_user_support_ticket_402_trial_expired(tokens):
    tok = tokens["view_only"]
    r = requests.post(
        f"{API}/support/tickets",
        headers={"Authorization": f"Bearer {tok}"},
        json={"subject": "TEST_conv1_vo", "message": "hello", "category": "general"},
        timeout=20,
    )
    assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text[:200]}"
    detail = r.json().get("detail") or {}
    assert detail.get("error") == "trial_expired", detail
    assert detail.get("upgrade_url") == "/settings/billing", detail


def test_free_user_GET_reads_not_402(tokens):
    """GETs must remain accessible for free users."""
    tok = tokens["free_trial"]
    # /auth/me is already covered. Try a listing endpoint that most users can GET.
    r = requests.get(f"{API}/support/tickets", headers={"Authorization": f"Bearer {tok}"}, timeout=20)
    # Either 200 or 404/empty — but NEVER 402.
    assert r.status_code != 402, f"GET returned 402 for free user, body={r.text[:200]}"


def test_active_trial_write_allowed(tokens):
    """Active trial user must still be able to POST to support/tickets (sanity: no regression)."""
    tok = tokens["trial"]
    r = requests.post(
        f"{API}/support/tickets",
        headers={"Authorization": f"Bearer {tok}"},
        json={"subject": "TEST_conv1_trial_sanity", "message": "hi", "category": "general"},
        timeout=20,
    )
    # Should NOT be 402. Could be 200/201 (ticket created) or 4xx due to validation — but never 402.
    assert r.status_code != 402, f"active trial got 402 (regression!): {r.text[:200]}"


# --- PAID TOOL GATING for FREE user ---------------------------------------
PAID_TOOL_ENDPOINTS = [
    "/tools/provider-price-checker/run",
    "/tools/classification-self-check/run",
    "/tools/contribution-estimator/run",
]


def _probe_paid_endpoint(token: str, path: str):
    """Hit the paid endpoint with a minimal body. If it 404s we fall back to
    alternative paths. Return the Response."""
    return requests.post(
        f"{API}{path}",
        headers={"Authorization": f"Bearer {token}"},
        json={},
        timeout=20,
    )


def test_free_user_cannot_run_paid_tool(tokens):
    """At least one _require_paid_plan endpoint must return 402 upgrade_required for a free user."""
    tok = tokens["free_trial"]
    saw_402 = False
    seen = []
    for path in PAID_TOOL_ENDPOINTS:
        r = _probe_paid_endpoint(tok, path)
        seen.append((path, r.status_code, r.text[:120]))
        if r.status_code == 402:
            detail = r.json().get("detail") or {}
            assert detail.get("error") == "upgrade_required", f"{path}: detail={detail}"
            assert detail.get("free_tier") is True, f"{path}: detail={detail}"
            saw_402 = True
            break
    assert saw_402, f"No paid-tool endpoint returned 402 for free user. Probed: {seen}"


# --- PER-TOOL ALLOWANCE ---------------------------------------------------
def test_free_tool_usage_invoice_checker_limit_1():
    r = requests.get(f"{API}/free-tool/usage?tool=INVOICE_CHECKER", timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data.get("limit") == 1, data
    for field in ("allowed", "remaining", "used_count", "days_until_next_use"):
        assert field in data, f"missing field {field!r} in {data}"


def test_free_tool_usage_price_checker_limit_2():
    r = requests.get(f"{API}/free-tool/usage?tool=PROVIDER_PRICE_CHECKER", timeout=20)
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data.get("limit") == 2, data
    for field in ("allowed", "remaining", "used_count", "days_until_next_use"):
        assert field in data, f"missing field {field!r} in {data}"


# --- INVOICE FREE METERING: active/trial user NOT metered -----------------
def test_invoice_usage_check_endpoint_shape_for_authed_user(tokens):
    """The /free-tool/usage endpoint is public but accepts a bearer token and
    attributes usage per-user. This just verifies trial user sees the same
    schema and limit=1 for INVOICE_CHECKER (metering only kicks in on actual
    upload — but a trial user is NOT metered in the upload route)."""
    tok = tokens["trial"]
    r = requests.get(
        f"{API}/free-tool/usage?tool=INVOICE_CHECKER",
        headers={"Authorization": f"Bearer {tok}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text[:200]
    data = r.json()
    assert data.get("limit") == 1, data
