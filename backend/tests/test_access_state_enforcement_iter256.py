"""Iter256: subscription-enforcement across web + mobile.
Verifies canonical access_state on /auth/me and 402 read-only middleware."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

FIXTURES = {
    "active":     ("cathy@example.com",         "testpass123",   "active"),
    "trial":      ("trialactive@example.com",   "AccessTest1!",  "trial"),
    "view_only":  ("cancelled.vo@example.com",  "AccessTest1!",  "view_only"),
    "stale_trial": ("trial30909@example.com",   "TrialPass1!",   "view_only"),
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
    out = {}
    for k, (e, p, _) in FIXTURES.items():
        tok = _login(e, p)
        out[k] = tok
    return out


# ---- 1. /auth/me returns canonical access_state -----------------------------
@pytest.mark.parametrize("key", list(FIXTURES.keys()))
def test_auth_me_access_state(tokens, key):
    tok = tokens.get(key)
    if not tok:
        pytest.skip(f"login failed for {key}")
    expected = FIXTURES[key][2]
    r = requests.get(f"{BASE_URL}/api/auth/me",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_state" in data, f"missing access_state key in /auth/me: {data}"
    assert data["access_state"] == expected, (
        f"{key}: expected access_state={expected} got {data.get('access_state')}"
    )


# ---- 2. Backend enforcement: view_only user writes are blocked with 402 -----
VIEW_ONLY_WRITE_ENDPOINTS = [
    ("POST", "/api/provider-ratings", {"provider_name": "Test", "rating": 4}),
    ("POST", "/api/documents",        {"name": "x.pdf"}),
    ("POST", "/api/v2/participants",  {"name": "Test", "role": "participant"}),
]


@pytest.mark.parametrize("method,path,payload", VIEW_ONLY_WRITE_ENDPOINTS)
def test_view_only_writes_return_402(tokens, method, path, payload):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    r = requests.request(method, f"{BASE_URL}{path}",
                         json=payload,
                         headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 402, (
        f"expected 402 read-only for {method} {path}, got {r.status_code}: {r.text[:300]}"
    )
    body = r.json()
    detail = body.get("detail", body)
    assert (detail.get("read_only") is True or detail.get("error") == "trial_expired"), (
        f"402 body missing read_only/trial_expired marker: {body}"
    )


# GETs must remain 200 for view_only users
@pytest.mark.parametrize("path", ["/api/auth/me", "/api/v2/participants", "/api/documents"])
def test_view_only_gets_return_200(tokens, path):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    r = requests.get(f"{BASE_URL}{path}",
                     headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    assert r.status_code == 200, f"GET {path} view_only got {r.status_code}: {r.text[:200]}"


# ---- 3. Reactivation path is NOT blocked for view_only ----------------------
def test_view_only_can_reach_payments_checkout(tokens):
    tok = tokens.get("view_only")
    if not tok:
        pytest.skip("view_only login failed")
    # Try a couple of common billing entry points — the important thing is NOT-402.
    for path, payload in [
        ("/api/payments/checkout", {"plan": "family", "origin_url": f"{BASE_URL}"}),
        ("/api/billing/checkout",  {"plan": "family", "origin_url": f"{BASE_URL}"}),
    ]:
        r = requests.post(f"{BASE_URL}{path}", json=payload,
                          headers={"Authorization": f"Bearer {tok}"}, timeout=45)
        if r.status_code == 404:
            continue  # endpoint not present; try next
        # Any status other than 402/read_only proves the gate is not hitting billing.
        if r.status_code == 402:
            body = r.json()
            detail = body.get("detail", body)
            assert detail.get("read_only") is not True, (
                f"billing path {path} was incorrectly blocked by read_only middleware: {body}"
            )
        # Success: the read-only middleware did NOT short-circuit this billing route.
        return
    pytest.skip("neither payments/checkout nor billing/checkout responded")


# ---- 4. Active + trial users are NOT blocked --------------------------------
@pytest.mark.parametrize("key", ["active", "trial"])
def test_active_and_trial_writes_not_blocked_by_readonly(tokens, key):
    tok = tokens.get(key)
    if not tok:
        pytest.skip(f"{key} login failed")
    # Fire a write and confirm the read_only 402 is NOT returned.
    r = requests.post(f"{BASE_URL}/api/provider-ratings",
                      json={"provider_name": "TEST_iter256", "rating": 5},
                      headers={"Authorization": f"Bearer {tok}"}, timeout=30)
    if r.status_code == 402:
        body = r.json()
        detail = body.get("detail", body)
        assert detail.get("read_only") is not True and detail.get("error") != "trial_expired", (
            f"{key} user was incorrectly hit by read_only middleware: {body}"
        )
    # A route-level validation 4xx or 200/201 is fine — the middleware didn't fire.
    assert r.status_code < 500, f"{key} POST provider-ratings 5xx: {r.status_code} {r.text[:200]}"
