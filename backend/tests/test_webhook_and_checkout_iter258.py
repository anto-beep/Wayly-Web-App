"""Iter258 — preview (TEST-mode) regression guards for the new mode-aware
STRIPE_WEBHOOK_SECRET_LIVE addition.

  1) POST /api/webhook/stripe with a bogus signature must return 400
     'invalid signature' (proves the base/test whsec is still active in
     preview and the _LIVE secret did NOT hijack it). Must NOT be 503.
  2) POST /api/payments/checkout for plan=solo AND plan=family still
     returns a valid cs_test_* Stripe url with 200 (checkout regression).
"""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

ACTIVE = ("cathy@example.com", "testpass123")


def _login(email: str, password: str) -> str:
    r = requests.post(f"{BASE_URL}/api/auth/login",
                      json={"email": email, "password": password}, timeout=30)
    assert r.status_code == 200, r.text
    j = r.json()
    return j.get("access_token") or j.get("token")


# ---- 1. webhook base secret still active in preview -------------------------
def test_webhook_unsigned_returns_400_not_503():
    """Bogus body + bogus signature — proves the test-mode whsec is still
    wired up. If 503 we'd know the _LIVE secret env accidentally took over
    (or the secret is missing entirely)."""
    r = requests.post(
        f"{BASE_URL}/api/webhook/stripe",
        data=b'{"id":"evt_test_bogus","type":"ping"}',
        headers={"stripe-signature": "t=0,v1=deadbeef", "content-type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 400, (
        f"expected 400 invalid signature, got {r.status_code}: {r.text[:200]}"
    )
    body = r.json()
    detail = (body.get("detail") or "").lower() if isinstance(body.get("detail"), str) else ""
    assert "signature" in detail or "invalid" in detail, f"unexpected 400 body: {body}"


def test_webhook_no_signature_header_returns_400_not_503():
    r = requests.post(
        f"{BASE_URL}/api/webhook/stripe",
        data=b'{"id":"evt_test_bogus2","type":"ping"}',
        headers={"content-type": "application/json"},
        timeout=30,
    )
    assert r.status_code == 400, (
        f"expected 400 for missing signature, got {r.status_code}: {r.text[:200]}"
    )


# ---- 2. Stripe checkout still returns cs_test_* url for solo + family -------
def _checkout(plan: str) -> dict:
    tok = _login(*ACTIVE)
    r = requests.post(
        f"{BASE_URL}/api/payments/checkout",
        json={"plan": plan, "origin_url": BASE_URL},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=45,
    )
    assert r.status_code == 200, f"{plan} checkout failed {r.status_code}: {r.text[:300]}"
    return r.json()


def test_checkout_solo_returns_cs_test_url():
    j = _checkout("solo")
    assert "url" in j and "session_id" in j, j
    assert j["session_id"].startswith("cs_test_"), (
        f"expected cs_test_ session in preview, got {j['session_id']}"
    )
    assert j["url"].startswith("https://checkout.stripe.com/"), j["url"]


def test_checkout_family_returns_cs_test_url():
    j = _checkout("family")
    assert "url" in j and "session_id" in j, j
    assert j["session_id"].startswith("cs_test_"), (
        f"expected cs_test_ session in preview, got {j['session_id']}"
    )
    assert j["url"].startswith("https://checkout.stripe.com/"), j["url"]
