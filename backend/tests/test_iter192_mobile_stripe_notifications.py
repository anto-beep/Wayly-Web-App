"""iter192 — MOBILE Stripe billing parity + notifications + SEO-2 regression.

Uses the shared FastAPI backend (same endpoints as web). Verifies:
- POST /api/payments/checkout (solo, family) returns a real cs_test_ URL for
  paid, free/expired, and unauthenticated callers (read-only middleware
  exempts /api/payments/).
- Unknown plan is rejected 4xx.
- Webhook rejects unsigned requests with 400 'invalid signature'.
- POST /api/payments/portal, /cancel-subscription, /reactivate-subscription,
  GET /api/payments/invoices behave correctly for a user without a Stripe
  customer (400/empty list, no 500s).
- GET /api/billing/subscription and /api/billing/trial-eligibility respond
  with sane payloads.
- GET /api/notifications returns {items, unread}. POST /api/notifications/read
  with a single id decrements unread by 1; with ids=[] zeroes it.
- POST /api/internal/seo/indexnow-changed with WRONG X-Internal-Token returns 403.

Test users (created earlier by main agent):
  mobpay.family@example.com / MobPay1!  (family)
  mobpay.solo@example.com   / MobPay1!  (solo)
  mobpay.free@example.com   / MobPay1!  (free)
"""
import os
import pytest
import requests

BASE = (os.environ.get("EXPO_PUBLIC_BACKEND_URL")
        or os.environ.get("REACT_APP_BACKEND_URL")
        or "https://statement-checker-3.preview.emergentagent.com").rstrip("/")

MOB_FAMILY = ("mobpay.family@example.com", "MobPay1!")
MOB_SOLO = ("mobpay.solo@example.com", "MobPay1!")
MOB_FREE = ("mobpay.free@example.com", "MobPay1!")
CATHY = ("cathy@example.com", "testpass123")


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"login failed {email}: {r.status_code} {r.text[:200]}")
    j = r.json()
    tok = j.get("access_token") or j.get("token")
    if not tok:
        pytest.skip(f"no token for {email}")
    return {"Authorization": f"Bearer {tok}"}, j


@pytest.fixture(scope="module")
def family_h():
    return _login(*MOB_FAMILY)[0]


@pytest.fixture(scope="module")
def solo_h():
    return _login(*MOB_SOLO)[0]


@pytest.fixture(scope="module")
def free_h():
    return _login(*MOB_FREE)[0]


@pytest.fixture(scope="module")
def cathy_h():
    return _login(*CATHY)[0]


# --------------------------- Stripe checkout ----------------------------
@pytest.mark.parametrize("plan", ["solo", "family"])
def test_checkout_paid_user_returns_test_url(family_h, plan):
    r = requests.post(
        f"{BASE}/api/payments/checkout",
        headers=family_h,
        json={"plan": plan,
              "origin_url": "https://statement-checker-3.preview.emergentagent.com",
              "trial_days": 7},
        timeout=25,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("session_id", "").startswith("cs_test_"), body
    assert "checkout.stripe.com" in body.get("url", ""), body


def test_checkout_unknown_plan_rejected(family_h):
    r = requests.post(
        f"{BASE}/api/payments/checkout",
        headers=family_h,
        json={"plan": "totally-fake-plan", "origin_url": "https://x.example",
              "trial_days": 7},
        timeout=15,
    )
    # Pydantic pattern → 422; if plan validated at handler → 400. Either is
    # a client-side rejection (4xx) and NOT a 500.
    assert 400 <= r.status_code < 500, r.text


def test_checkout_free_user_still_gets_url_readonly_exempt(free_h):
    """Read-only middleware must EXEMPT /api/payments/ so a free/expired
    user can still start a checkout — otherwise they can never subscribe."""
    r = requests.post(
        f"{BASE}/api/payments/checkout",
        headers=free_h,
        json={"plan": "family",
              "origin_url": "https://statement-checker-3.preview.emergentagent.com",
              "trial_days": 7},
        timeout=25,
    )
    assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
    assert r.json().get("session_id", "").startswith("cs_test_")


def test_checkout_unauthenticated_still_returns_url():
    """Guests can start checkout too — the endpoint associates via metadata
    if a JWT is present, but works without one."""
    r = requests.post(
        f"{BASE}/api/payments/checkout",
        json={"plan": "solo",
              "origin_url": "https://statement-checker-3.preview.emergentagent.com",
              "trial_days": 7},
        timeout=25,
    )
    assert r.status_code == 200, r.text
    assert r.json().get("session_id", "").startswith("cs_test_")


# --------------------------- Webhook signature --------------------------
def test_webhook_rejects_unsigned():
    """Unsigned OR missing-signature POSTs must be rejected 400."""
    # 1) No signature header at all.
    r = requests.post(
        f"{BASE}/api/webhook/stripe",
        data=b'{"id":"evt_test","type":"ping"}',
        headers={"content-type": "application/json"},
        timeout=15,
    )
    assert r.status_code == 400, r.text
    txt = r.text.lower()
    assert ("invalid signature" in txt) or ("missing" in txt and "signature" in txt), r.text
    # 2) Present-but-bogus signature must also 400 with 'invalid signature'.
    r2 = requests.post(
        f"{BASE}/api/webhook/stripe",
        data=b'{"id":"evt_test","type":"ping"}',
        headers={"content-type": "application/json",
                 "stripe-signature": "t=1,v1=deadbeef"},
        timeout=15,
    )
    assert r2.status_code == 400, r2.text
    txt2 = r2.text.lower()
    assert "signature" in txt2 and ("invalid" in txt2 or "verification" in txt2), r2.text


# --------------------------- Portal / cancel / reactivate / invoices ----
def test_portal_without_stripe_customer_400(free_h):
    r = requests.post(
        f"{BASE}/api/payments/portal",
        headers=free_h,
        json={"origin_url": "https://x.example"},
        timeout=15,
    )
    # New user has no stripe_customer_id yet → 400 with clear message.
    assert r.status_code == 400, r.text
    assert "stripe" in r.text.lower()


def test_cancel_without_subscription_400(free_h):
    r = requests.post(f"{BASE}/api/payments/cancel-subscription",
                      headers=free_h, timeout=15)
    assert r.status_code == 400, r.text


def test_reactivate_without_subscription_400(free_h):
    r = requests.post(f"{BASE}/api/payments/reactivate-subscription",
                      headers=free_h, timeout=15)
    assert r.status_code == 400, r.text


def test_invoices_empty_for_new_user(free_h):
    r = requests.get(f"{BASE}/api/payments/invoices", headers=free_h, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json() == {"invoices": []}


# --------------------------- Billing status endpoints -------------------
def test_billing_subscription_shape(solo_h):
    r = requests.get(f"{BASE}/api/billing/subscription", headers=solo_h, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    # Minimum contract for mobile plan-billing screen.
    assert isinstance(body, dict)
    assert "plan" in body or "subscription_status" in body or "status" in body


def test_billing_trial_eligibility_shape(free_h):
    r = requests.get(f"{BASE}/api/billing/trial-eligibility", headers=free_h, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert isinstance(body, dict)


# --------------------------- Notifications ------------------------------
def test_notifications_list_shape(cathy_h):
    r = requests.get(f"{BASE}/api/notifications", headers=cathy_h, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "items" in body and "unread" in body
    assert isinstance(body["items"], list)
    assert isinstance(body["unread"], int)


def test_notifications_mark_single_decrements_unread(cathy_h):
    r = requests.get(f"{BASE}/api/notifications", headers=cathy_h, timeout=15)
    assert r.status_code == 200
    body = r.json()
    items = body.get("items", [])
    unread_before = body.get("unread", 0)
    unread_items = [it for it in items if not it.get("read")]
    if not unread_items or unread_before == 0:
        pytest.skip("No unread notifications to mark for cathy")
    first_id = unread_items[0]["id"]
    r2 = requests.post(f"{BASE}/api/notifications/read",
                       headers=cathy_h, json={"ids": [first_id]}, timeout=15)
    assert r2.status_code == 200, r2.text
    assert r2.json().get("ok") is True
    # Refresh and verify decrement
    r3 = requests.get(f"{BASE}/api/notifications", headers=cathy_h, timeout=15)
    assert r3.status_code == 200
    unread_after = r3.json().get("unread", 0)
    assert unread_after == unread_before - 1, \
        f"unread {unread_before} -> {unread_after} (expected -1)"


def test_notifications_mark_all_zero(cathy_h):
    # First ensure there's at least one unread by refetching state; if
    # already zero, this is a no-op (still asserts idempotent 0).
    r = requests.post(f"{BASE}/api/notifications/read",
                      headers=cathy_h, json={"ids": []}, timeout=15)
    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True
    r2 = requests.get(f"{BASE}/api/notifications", headers=cathy_h, timeout=15)
    assert r2.status_code == 200
    assert r2.json().get("unread", -1) == 0


# --------------------------- SEO-2 internal endpoint --------------------
def test_seo_indexnow_changed_rejects_wrong_token():
    r = requests.post(
        f"{BASE}/api/internal/seo/indexnow-changed",
        headers={"X-Internal-Token": "wrong-token-xyz"},
        json={"urls": ["https://wayly.com.au/pricing"]},
        timeout=15,
    )
    assert r.status_code == 403, r.text
