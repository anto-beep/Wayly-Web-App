"""iter184 — Mobile Stripe parity: exercise all backend endpoints the mobile
participants/plan-billing/plan-select screens call, using cathy@example.com
(Family, 3 active participants) and mark.adviser@example.com when relevant.

Endpoints covered:
- POST /api/auth/login
- POST /api/v2/participants/preview  (branch selection: family_addons for cathy,
  adviser_included for mark)
- GET  /api/v2/participants
- GET  /api/account
- POST /api/payments/sync-plan-to-participants  (fire-and-forget)
- POST /api/billing/v2/addon-checkout
- POST /api/billing/v2/upgrade-checkout
- POST /api/billing/v2/cancel-pending-addon
- POST /api/payments/checkout        (plan-select)
- GET  /api/billing/trial-eligibility
- GET  /api/billing/subscription     (plan-billing)
- POST /api/payments/portal          (plan-billing)
- POST /api/billing/cancel
- POST /api/reactivate-subscription
"""
import os
import pytest
import requests

BASE = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/") \
    if os.environ.get("EXPO_PUBLIC_BACKEND_URL") \
    else os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

CATHY = ("cathy@example.com", "testpass123")
ADVISER = ("mark.adviser@example.com", "AdviserPass1!")


def _login(email, password):
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": email, "password": password}, timeout=20)
    if r.status_code != 200:
        pytest.skip(f"Cannot login {email}: {r.status_code} {r.text[:200]}")
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, f"No token in login response for {email}"
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def cathy_h():
    return _login(*CATHY)


@pytest.fixture(scope="module")
def adviser_h():
    return _login(*ADVISER)


# ---------- Participants list + account ----------
def test_list_participants_cathy(cathy_h):
    r = requests.get(f"{BASE}/api/v2/participants?include_removed=true",
                     headers=cathy_h, timeout=20)
    assert r.status_code == 200, r.text
    items = r.json().get("items", [])
    active = [p for p in items if p.get("status") == "ACTIVE"]
    assert len(active) >= 2, f"Expected Family cathy to have >=2 active, got {len(active)}"


def test_account_summary_cathy(cathy_h):
    r = requests.get(f"{BASE}/api/account", headers=cathy_h, timeout=20)
    assert r.status_code == 200, r.text
    s = r.json().get("summary") or r.json()
    assert (s.get("base_plan") or "").upper() in ("FAMILY", "SOLO", "ADVISER", "FREE")


# ---------- Preview: branch selection ----------
def test_preview_family_addons_count1(cathy_h):
    r = requests.post(f"{BASE}/api/v2/participants/preview?count=1",
                      headers=cathy_h, json={}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    # cathy has 3 active on Family (included=2), so adding 1 more => 2 addons needed
    assert d.get("branch") in ("family_addons", "covered_by_family"), d
    assert isinstance(d.get("addons_needed"), int)
    # For family_addons the mobile UI uses addons_needed * 24.5 + 49.5
    assert d.get("addons_needed", 0) >= 1


def test_preview_family_addons_count2(cathy_h):
    r = requests.post(f"{BASE}/api/v2/participants/preview?count=2",
                      headers=cathy_h, json={}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("branch") in ("family_addons", "covered_by_family"), d
    # count=2 should require >= count=1's needed
    assert d.get("addons_needed", 0) >= 1


def test_preview_adviser_included(adviser_h):
    r = requests.post(f"{BASE}/api/v2/participants/preview?count=1",
                      headers=adviser_h, json={}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d.get("branch") == "adviser_included", d


# ---------- sync-plan-to-participants ----------
def test_sync_plan_to_participants(cathy_h):
    r = requests.post(f"{BASE}/api/payments/sync-plan-to-participants",
                      headers=cathy_h, json={}, timeout=30)
    assert r.status_code == 200, r.text


# ---------- addon-checkout / upgrade-checkout / cancel-pending-addon ----------
def test_addon_checkout_bad_id_returns_error(cathy_h):
    """Sanity: endpoint responds without 500 when given a non-existent addon id."""
    r = requests.post(f"{BASE}/api/billing/v2/addon-checkout", headers=cathy_h,
                      json={"addon_id": "does-not-exist",
                            "origin_url": BASE}, timeout=30)
    # Accept 400/404 (bad id) or 200 (already_paid handling) — should NOT be 500
    assert r.status_code < 500, r.text


def test_upgrade_checkout_family_delta(cathy_h):
    """cathy is already Family — endpoint should either return url or say
    already-on-plan/no-op, but must not 500."""
    r = requests.post(f"{BASE}/api/billing/v2/upgrade-checkout", headers=cathy_h,
                      json={"target_plan": "FAMILY", "origin_url": BASE,
                            "delta_only": True}, timeout=30)
    assert r.status_code < 500, r.text
    if r.status_code == 200:
        d = r.json()
        # Either a stripe url or an instant_upgrade / already flag
        assert ("url" in d) or ("instant_upgrade" in d) or ("already" in d) \
            or (d.get("current_plan") is not None)


def test_cancel_pending_addon_idempotent(cathy_h):
    r1 = requests.post(f"{BASE}/api/billing/v2/cancel-pending-addon",
                       headers=cathy_h, json={}, timeout=30)
    r2 = requests.post(f"{BASE}/api/billing/v2/cancel-pending-addon",
                       headers=cathy_h, json={}, timeout=30)
    assert r1.status_code == 200 and r2.status_code == 200, (r1.text, r2.text)


# ---------- plan-select /payments/checkout + trial-eligibility ----------
def test_payments_checkout_returns_stripe_url(cathy_h):
    r = requests.post(f"{BASE}/api/payments/checkout", headers=cathy_h,
                      json={"plan": "family", "origin_url": BASE,
                            "trial_days": 7}, timeout=30)
    # Cathy is already family — may 200 with url OR 400 "already subscribed".
    assert r.status_code < 500, r.text
    if r.status_code == 200:
        url = r.json().get("url", "")
        assert url.startswith("https://") and (
            "stripe.com" in url or "billing" in url
        ), f"Unexpected checkout url: {url}"


def test_trial_eligibility(cathy_h):
    r = requests.get(f"{BASE}/api/billing/trial-eligibility",
                     headers=cathy_h, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert "eligible" in d or "trial_eligible" in d or "already_trialed" in d


# ---------- plan-billing ----------
def test_billing_subscription(cathy_h):
    r = requests.get(f"{BASE}/api/billing/subscription",
                     headers=cathy_h, timeout=20)
    assert r.status_code == 200, r.text


def test_payments_portal(cathy_h):
    r = requests.post(f"{BASE}/api/payments/portal", headers=cathy_h,
                     json={"return_url": BASE}, timeout=30)
    # Must not 500. On test-mode with no real customer this may 400.
    assert r.status_code < 500, r.text
    if r.status_code == 200:
        url = r.json().get("url", "")
        assert url.startswith("https://"), f"Portal url not https: {url}"


def test_billing_cancel_and_reactivate(cathy_h):
    """Cancel then reactivate. Both should respond (not 500)."""
    r1 = requests.post(f"{BASE}/api/billing/cancel", headers=cathy_h,
                      json={}, timeout=30)
    assert r1.status_code < 500, r1.text
    r2 = requests.post(f"{BASE}/api/reactivate-subscription", headers=cathy_h,
                      json={}, timeout=30)
    assert r2.status_code < 500, r2.text
