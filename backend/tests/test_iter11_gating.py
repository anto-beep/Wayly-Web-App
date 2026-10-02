"""Iteration 11 — AI tools gating overhaul tests.

Covers:
- Statement Decoder free-per-day cookie gating (1st=200, 2nd=429)
- Auth-based gating (401 unauth, 403 Free) on /public/budget-calc
- Paid plan (Family) allowed on gated tools
- Sample additional endpoints same gating: /public/price-check, /public/classification-check
- trial_active recognition for Free-plan users with future trial_ends_at
"""
import os
import uuid
import pytest
import requests
import httpx

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

CATHY = {"email": "cathy@example.com", "password": "testpass123"}
SAMPLE_STATEMENT = (
    "Care Services $450.00\n"
    "Package Management Fee $85.00\n"
    "Administration Fee $25.00\n"
    "Gardening services $120.00\n"
    "Total charges this period $680.00\n"
)


# ---------- auth helpers ----------
def _login_cathy() -> str:
    r = requests.post(f"{API}/auth/login", json=CATHY, timeout=30)
    assert r.status_code == 200, f"cathy login failed {r.text[:200]}"
    return r.json()["token"]


def _signup(plan: str = "free") -> tuple[str, str]:
    email = f"it11{uuid.uuid4().hex[:10]}@example.com"
    payload = {
        "name": "Iter11 Tester",
        "email": email,
        "password": "Test1234!",
        "role": "caregiver",
        "plan": plan,
    }
    r = requests.post(f"{API}/auth/signup", json=payload, timeout=30)
    assert r.status_code == 200, f"signup {plan} failed: {r.status_code} {r.text[:300]}"
    return email, r.json()["token"]


# ========== Statement Decoder free-per-day ==========
def test_sd_unauth_first_use_200():
    """1st unauth call with NO cookie → 200 (first free decode)."""
    with httpx.Client(timeout=60) as client:
        r = client.post(
            f"{API}/public/decode-statement-text",
            json={"text": SAMPLE_STATEMENT},
        )
        assert r.status_code == 200, f"expected 200 got {r.status_code} body={r.text[:300]}"
        # cookie should have been set for subsequent calls
        assert "kindred_sd_used" in client.cookies, f"cookie not set, have={dict(client.cookies)}"


def test_sd_unauth_second_use_429_daily_limit():
    """2nd call on the same client (cookie persisted) → 429 daily_limit."""
    with httpx.Client(timeout=60) as client:
        r1 = client.post(f"{API}/public/decode-statement-text", json={"text": SAMPLE_STATEMENT})
        assert r1.status_code == 200, f"prime 1st-use failed: {r1.status_code}"
        r2 = client.post(f"{API}/public/decode-statement-text", json={"text": SAMPLE_STATEMENT})
        assert r2.status_code == 429, f"expected 429 got {r2.status_code} body={r2.text[:300]}"
        detail = r2.json().get("detail", {})
        assert detail.get("error") == "daily_limit"
        assert detail.get("next_available_at"), "next_available_at missing"


def test_sd_logged_in_family_bypasses_cookie_gate():
    """Family user should 200 even with a cookie set (bypass limiter)."""
    tok = _login_cathy()
    # Pre-seed a stale cookie to prove bypass
    cookies = {"kindred_sd_used": "2025-01-01T00:00:00+00:00"}
    r = requests.post(
        f"{API}/public/decode-statement-text",
        json={"text": SAMPLE_STATEMENT},
        headers={"Authorization": f"Bearer {tok}"},
        cookies=cookies,
        timeout=60,
    )
    assert r.status_code == 200, f"family user should 200, got {r.status_code} {r.text[:300]}"


# ========== Budget Calculator gating ==========
def test_budget_calc_unauth_401():
    r = requests.post(
        f"{API}/public/budget-calc",
        json={"classification": 4, "is_grandfathered": False, "current_lifetime_balance": 0},
        timeout=30,
    )
    assert r.status_code == 401, f"got {r.status_code} {r.text[:200]}"
    d = r.json().get("detail", {})
    assert d.get("error") == "unauthenticated"
    assert d.get("redirect") == "/signup"


def test_budget_calc_free_user_403():
    _, tok = _signup(plan="free")
    r = requests.post(
        f"{API}/public/budget-calc",
        json={"classification": 4, "is_grandfathered": False, "current_lifetime_balance": 0},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=30,
    )
    assert r.status_code == 403, f"got {r.status_code} {r.text[:200]}"
    d = r.json().get("detail", {})
    assert d.get("error") == "plan_required"
    assert d.get("redirect") == "/pricing"


def test_budget_calc_family_user_200():
    tok = _login_cathy()
    r = requests.post(
        f"{API}/public/budget-calc",
        json={"classification": 4, "is_grandfathered": False, "current_lifetime_balance": 0},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=60,
    )
    assert r.status_code == 200, f"family got {r.status_code} {r.text[:300]}"


# ========== Sample 2 of the other gated endpoints ==========
def test_price_check_unauth_401_and_family_200():
    # price-check uses `service` + `rate` fields.
    payload = {"service": "gardening", "rate": 120.0}
    r = requests.post(f"{API}/public/price-check", json=payload, timeout=30)
    assert r.status_code == 401, f"unauth price-check got {r.status_code} {r.text[:200]}"
    tok = _login_cathy()
    r2 = requests.post(
        f"{API}/public/price-check",
        json=payload,
        headers={"Authorization": f"Bearer {tok}"},
        timeout=60,
    )
    assert r2.status_code == 200, f"family price-check got {r2.status_code} {r2.text[:300]}"


def test_classification_check_unauth_401_free_403():
    # classification-check needs list of 12 ints 0-4.
    payload = {"answers": [2] * 12}
    r = requests.post(f"{API}/public/classification-check", json=payload, timeout=30)
    assert r.status_code == 401, f"got {r.status_code} {r.text[:200]}"
    _, tok = _signup(plan="free")
    r2 = requests.post(
        f"{API}/public/classification-check",
        json=payload,
        headers={"Authorization": f"Bearer {tok}"},
        timeout=30,
    )
    assert r2.status_code == 403, f"got {r2.status_code} {r2.text[:200]}"
    assert r2.json().get("detail", {}).get("error") == "plan_required"


# ========== Trial-active recognition ==========
def test_trial_active_free_plan_user_allowed():
    """Manually set trial_ends_at in the future on a free-plan user; they should
    be allowed through _require_paid_plan."""
    import asyncio
    from datetime import datetime, timezone, timedelta

    email, tok = _signup(plan="free")
    # Patch the user via direct mongo write using the same env MONGO_URL.
    from motor.motor_asyncio import AsyncIOMotorClient

    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]

    async def _patch():
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        future = (datetime.now(timezone.utc) + timedelta(days=3)).isoformat()
        res = await db.users.update_one({"email": email}, {"$set": {"trial_ends_at": future}})
        client.close()
        return res.modified_count

    modified = asyncio.get_event_loop().run_until_complete(_patch()) if False else asyncio.run(_patch())
    assert modified == 1, "couldn't patch trial_ends_at"

    r = requests.post(
        f"{API}/public/budget-calc",
        json={"classification": 4, "is_grandfathered": False, "current_lifetime_balance": 0},
        headers={"Authorization": f"Bearer {tok}"},
        timeout=60,
    )
    assert r.status_code == 200, f"trial-active free user should 200, got {r.status_code} {r.text[:300]}"
