"""iter386 — Trial eligibility + reactivation + welcome-back wiring.

Scope:
 * GET  /api/billing/trial-eligibility  — new user eligible, returning user not
 * POST /api/payments/checkout          — returning user forced to 0-trial even
                                           if client requests trial_days:7
 * POST /api/statements/upload          — 402 for view-only account (regression)
 * Code wiring: _maybe_send_welcome_back defined + called in BOTH
   checkout_status (reconcile) AND webhook checkout.session.completed branch,
   skips when sub.trial_end set, idempotent per session.
"""
from __future__ import annotations

import io
import os
import re
import time
import uuid
from pathlib import Path

import pytest
import requests

def _load_frontend_env():
    try:
        for line in Path("/app/frontend/.env").read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"
API = f"{BASE_URL}/api"


def _login(email: str, password: str) -> str:
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, f"login {email} failed: {r.status_code} {r.text}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in {r.json()}"
    return tok


def _hdr(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}"}


# ---------- Trial eligibility ----------

def test_returning_user_not_eligible():
    tok = _login("cathy@example.com", "testpass123")
    r = requests.get(f"{API}/billing/trial-eligibility", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("eligible") is False, f"cathy should NOT be eligible, got {data}"


def test_brand_new_signup_is_eligible():
    uniq = f"TEST_iter386_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{API}/auth/signup",
        json={"email": uniq, "password": "FreshTrial1!", "name": "Fresh Trial", "plan": "solo"},
        timeout=30,
    )
    assert r.status_code in (200, 201), f"signup failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("token") or body.get("access_token")
    if not tok:
        tok = _login(uniq, "FreshTrial1!")
    r = requests.get(f"{API}/billing/trial-eligibility", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("eligible") is True, f"fresh user should be eligible, got {data}"
    assert int(data.get("trial_days") or 0) > 0


# ---------- Checkout trial gate (authoritative server-side) ----------

def test_returning_user_checkout_forces_no_trial():
    """Server MUST ignore trial_days:7 from a returning client. We verify
    behavior via (a) a successful 200 session creation, and (b) that the
    eligibility endpoint returns False for the same user (shared gate)."""
    tok = _login("cathy@example.com", "testpass123")
    # Shared gate check
    r = requests.get(f"{API}/billing/trial-eligibility", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200 and r.json().get("eligible") is False
    # Checkout with mis-behaving client (trial_days:7) still succeeds, server-side gate strips trial
    r = requests.post(
        f"{API}/payments/checkout",
        headers=_hdr(tok),
        json={"plan": "solo", "origin_url": BASE_URL, "trial_days": 7},
        timeout=30,
    )
    assert r.status_code == 200, f"checkout failed: {r.status_code} {r.text}"
    body = r.json()
    assert body.get("url", "").startswith("https://checkout.stripe.com"), body
    assert body.get("session_id")


def test_fresh_signup_checkout_retains_trial():
    """Fresh signup is eligible → checkout accepts trial_days:7 (shared gate)."""
    uniq = f"TEST_iter386b_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(
        f"{API}/auth/signup",
        json={"email": uniq, "password": "FreshTrial1!", "name": "Fresh Trial", "plan": "solo"},
        timeout=30,
    )
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("token") or _login(uniq, "FreshTrial1!")
    # Eligibility reflects fresh account
    r = requests.get(f"{API}/billing/trial-eligibility", headers=_hdr(tok), timeout=30)
    assert r.status_code == 200 and r.json().get("eligible") is True
    # Checkout returns a session
    r = requests.post(
        f"{API}/payments/checkout",
        headers=_hdr(tok),
        json={"plan": "solo", "origin_url": BASE_URL, "trial_days": 7},
        timeout=30,
    )
    assert r.status_code == 200, f"fresh checkout failed: {r.status_code} {r.text}"
    assert r.json().get("url", "").startswith("https://checkout.stripe.com")


def test_server_code_forces_zero_trial_for_returning():
    """Direct code-wiring check: create_checkout computes trial_days as the
    requested value only when _user_had_trial is False; else 0."""
    p = Path("/app/backend/routes/payments.py").read_text()
    assert "requested_trial if (requested_trial > 0 and not await _user_had_trial" in p, \
        "authoritative server-side trial gate missing in create_checkout"


# ---------- Regression: statement upload 402 for view-only ----------

@pytest.mark.parametrize("email,password", [
    ("cancelled.vo@example.com", "AccessTest1!"),
    ("viewonly@test.com", "ViewOnly!2026"),
])
def test_view_only_statement_upload_blocked(email, password):
    tok = _login(email, password)
    content = b"date,amount,description\n2026-01-01,10.00,Test\n"
    files = {"file": ("test.csv", io.BytesIO(content), "text/csv")}
    r = requests.post(f"{API}/statements/upload", headers=_hdr(tok), files=files, timeout=60)
    assert r.status_code == 402, f"expected 402 for {email}, got {r.status_code} {r.text[:200]}"


# ---------- Code wiring verification for welcome-back ----------

def test_welcome_back_helper_wired_both_paths():
    p = Path("/app/backend/routes/payments.py").read_text()
    assert "_maybe_send_welcome_back" in p, "helper missing"
    # defined once
    defs = re.findall(r"async def _maybe_send_welcome_back\(", p)
    assert len(defs) == 1, f"expected 1 definition of helper, found {len(defs)}"
    # Called in reconcile (checkout_status) + webhook branch
    calls = [m.start() for m in re.finditer(r"await _maybe_send_welcome_back\(", p)]
    assert len(calls) >= 2, f"helper must be called in both reconcile + webhook paths, found {len(calls)}"
    # Guards: skip if trial_end set; idempotent per session via welcome_back_session.
    assert 'sub.get("trial_end")' in p, "helper must skip trials"
    assert "welcome_back_session" in p, "helper must be idempotent per session"
    # Belongs to checkout.session.completed branch
    wh_idx = p.find('etype == "checkout.session.completed"')
    assert wh_idx > 0
    # the second call site should be after the webhook branch start
    assert any(c > wh_idx for c in calls), "helper not called in webhook branch"


if __name__ == "__main__":
    import sys
    sys.exit(pytest.main([__file__, "-v"]))
