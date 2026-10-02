"""Iter 33 — Batch 3 follow-ups regression tests.

Covers:
  • Stripe Checkout: /api/billing/v2/upgrade-checkout (Solo→Family, delta_only)
  • Stripe Checkout: /api/billing/v2/addon-checkout
  • Webhook handler logic via handle_batch3_paid_event (direct call)
  • Inbound mail webhook: /api/inbound/mail (matched/unmatched/missing-to/token)
  • Inbound mail queue: /api/inbound/mail/queue
  • Admin v2 endpoints (admin auth gated)
  • Plan canon constants (SEAT_LIMITS / PARTICIPANT_BASE_INCLUDED for ADVISER)
"""
import os
import sys
import uuid
import pytest
import requests

def _load_frontend_env():
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return ""

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_frontend_env()).rstrip("/")
API = f"{BASE_URL}/api"

CATHY = ("cathy@example.com", "testpass123")
ADVISER = ("mark.adviser@example.com", "AdviserPass1!")
ADMIN = ("hello@techglove.com.au", "AdminPass!2026")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    return r.json().get("access_token") or r.json().get("token")


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"} if tok else {}


# ============================================================================
# 1. Plan canon constants
# ============================================================================
class TestPlanCanon:
    def test_seat_limits_adviser_is_3(self):
        sys.path.insert(0, "/app/backend")
        from batch3_models import SEAT_LIMITS, PARTICIPANT_BASE_INCLUDED
        assert SEAT_LIMITS["ADVISER"] == 3
        assert PARTICIPANT_BASE_INCLUDED["ADVISER"] == 20


# ============================================================================
# 2. Stripe Checkout — Solo→Family upgrade
# ============================================================================
@pytest.fixture(scope="module")
def cathy_tok():
    return _login(*CATHY)


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)


def _ensure_cathy_solo(tok):
    """Make sure cathy is SOLO before upgrade test. If she's already family, skip the upgrade test."""
    r = requests.get(f"{API}/account", headers=_hdr(tok), timeout=15)
    if r.status_code != 200:
        return None
    return r.json().get("summary", {}).get("base_plan")


class TestStripeCheckout:
    def test_solo_to_family_upgrade_checkout(self, cathy_tok):
        plan = _ensure_cathy_solo(cathy_tok)
        if plan != "SOLO":
            pytest.skip(f"cathy is currently {plan}, not SOLO — skipping upgrade test")
        r = requests.post(
            f"{API}/billing/v2/upgrade-checkout",
            headers=_hdr(cathy_tok),
            json={"target_plan": "FAMILY", "origin_url": "https://wayly.com.au", "delta_only": True},
            timeout=30,
        )
        assert r.status_code == 200, f"expected 200, got {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "url" in data and "session_id" in data
        assert data.get("amount") == 20.0, f"expected delta 20.0, got {data.get('amount')}"
        # Check it's a real Stripe URL
        assert "stripe.com" in (data["url"] or "").lower() or "checkout" in (data["url"] or "").lower(), \
            f"URL doesn't look like Stripe: {data['url']}"
        # Verify the payment_transactions row was created (via admin direct check is hard; we trust it)
        print(f"Stripe Checkout URL: {data['url'][:80]}... session={data['session_id'][:30]}")

    def test_upgrade_checkout_requires_auth(self):
        r = requests.post(
            f"{API}/billing/v2/upgrade-checkout",
            json={"target_plan": "FAMILY", "origin_url": "https://x.com", "delta_only": True},
            timeout=15,
        )
        assert r.status_code in (401, 403)

    def test_addon_checkout_validates_addon_id(self, cathy_tok):
        r = requests.post(
            f"{API}/billing/v2/addon-checkout",
            headers=_hdr(cathy_tok),
            json={"addon_id": "non-existent-id-xxx", "origin_url": "https://wayly.com.au"},
            timeout=15,
        )
        assert r.status_code == 404, f"expected 404 for bogus addon, got {r.status_code}: {r.text[:200]}"


# ============================================================================
# 3. Inbound mail webhook
# ============================================================================
class TestInboundMail:
    def test_missing_to_returns_400(self):
        r = requests.post(f"{API}/inbound/mail", json={"from_email": "a@b.com", "subject": "x"}, timeout=15)
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text[:200]}"

    def test_unmatched_to_returns_matched_false(self):
        r = requests.post(
            f"{API}/inbound/mail",
            json={"to": "nobody-xxx@in.wayly.com.au", "from_email": "x@y.com", "subject": "test", "text": "test"},
            timeout=15,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        d = r.json()
        assert d["ok"] is True
        assert d["matched"] is False

    def test_matched_dorothy_returns_intake_id(self, cathy_tok):
        # Get dorothy's forwarding email
        r = requests.get(f"{API}/account", headers=_hdr(cathy_tok), timeout=15)
        assert r.status_code == 200
        parts = r.json().get("participants", [])
        if not parts:
            pytest.skip("cathy has no participants — cannot test matched inbound")
        dorothy = next((p for p in parts if "dorothy" in (p.get("first_name", "") or "").lower()), parts[0])
        to_addr = dorothy.get("household_email")
        if not to_addr:
            pytest.skip("no household_email for participant")
        r = requests.post(
            f"{API}/inbound/mail",
            json={"to": to_addr, "from_email": "provider@example.com",
                  "subject": "Your statement", "text": "Hello, see attached."},
            timeout=15,
        )
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        d = r.json()
        assert d["ok"] is True
        assert d["matched"] is True
        assert "intake_id" in d
        assert d["queued"] is True
        assert d["participant_id"] == dorothy["id"]

    def test_inbound_queue_returns_intakes(self, cathy_tok):
        r = requests.get(f"{API}/inbound/mail/queue", headers=_hdr(cathy_tok), timeout=15)
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:200]}"
        d = r.json()
        assert "items" in d
        # Heavy fields should be excluded
        for item in d["items"][:5]:
            assert "_text_full" not in item
            assert "_html_full" not in item
            assert "_attachments_meta" not in item


# ============================================================================
# 4. Admin v2 endpoints
# ============================================================================
class TestAdminV2:
    def test_addons_requires_admin(self, cathy_tok):
        # Cathy is NOT admin
        r = requests.get(f"{API}/admin/v2/addons", headers=_hdr(cathy_tok), timeout=15)
        assert r.status_code == 403, f"expected 403 for non-admin, got {r.status_code}: {r.text[:200]}"

    def test_free_tier_usage_requires_admin(self, cathy_tok):
        r = requests.get(f"{API}/admin/v2/free-tier/usage", headers=_hdr(cathy_tok), timeout=15)
        assert r.status_code == 403

    def test_purge_queue_requires_admin(self, cathy_tok):
        r = requests.get(f"{API}/admin/v2/purge-queue", headers=_hdr(cathy_tok), timeout=15)
        assert r.status_code == 403

    def test_admin_addons_list(self, admin_tok):
        r = requests.get(f"{API}/admin/v2/addons", headers=_hdr(admin_tok), timeout=20)
        if r.status_code == 403:
            pytest.skip("admin account does not have is_admin=true; main agent must seed this")
        assert r.status_code == 200, f"got {r.status_code}: {r.text[:300]}"
        d = r.json()
        assert "items" in d
        # If addons exist, verify enrichment
        for a in d["items"][:3]:
            assert a.get("monthly_value") == 19.0
            assert "account_owner_email" in a
            assert "participant_name" in a

    def test_admin_addons_status_filter(self, admin_tok):
        r = requests.get(f"{API}/admin/v2/addons?status=ACTIVE", headers=_hdr(admin_tok), timeout=20)
        if r.status_code == 403:
            pytest.skip("admin not seeded")
        assert r.status_code == 200
        for a in r.json().get("items", []):
            assert a["status"] == "ACTIVE"

    def test_admin_free_tier_usage(self, admin_tok):
        r = requests.get(f"{API}/admin/v2/free-tier/usage", headers=_hdr(admin_tok), timeout=15)
        if r.status_code == 403:
            pytest.skip("admin not seeded")
        assert r.status_code == 200
        d = r.json()
        for key in ("period_month", "total_uses", "anonymous_uses", "logged_in_uses",
                    "unique_fingerprints", "unique_users", "conversions_to_paid", "conversion_rate_pct"):
            assert key in d, f"missing key {key} in {list(d.keys())}"

    def test_admin_purge_queue(self, admin_tok):
        r = requests.get(f"{API}/admin/v2/purge-queue", headers=_hdr(admin_tok), timeout=15)
        if r.status_code == 403:
            pytest.skip("admin not seeded")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d
        for item in d["items"][:5]:
            # days_remaining should be set when scheduled
            if item.get("status") == "SCHEDULED":
                assert "days_remaining" in item

    def test_admin_purge_queue_status_filter(self, admin_tok):
        r = requests.get(f"{API}/admin/v2/purge-queue?status=SCHEDULED", headers=_hdr(admin_tok), timeout=15)
        if r.status_code == 403:
            pytest.skip("admin not seeded")
        assert r.status_code == 200

    def test_admin_user_participants(self, admin_tok, cathy_tok):
        # First get cathy's user_id
        r = requests.get(f"{API}/auth/me", headers=_hdr(cathy_tok), timeout=15)
        assert r.status_code == 200
        cathy_id = r.json().get("id") or r.json().get("user_id")
        if not cathy_id:
            pytest.skip("could not resolve cathy user_id")
        r = requests.get(f"{API}/admin/v2/users/{cathy_id}/participants", headers=_hdr(admin_tok), timeout=15)
        if r.status_code == 403:
            pytest.skip("admin not seeded")
        assert r.status_code == 200
        d = r.json()
        assert "items" in d and "account" in d and "addons" in d


# ============================================================================
# 5. Webhook side-effect handler — direct call (no real Stripe needed)
# ============================================================================
class TestWebhookHandler:
    @pytest.mark.asyncio
    async def test_handle_plan_upgrade_event(self):
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        from batch3_billing import init_billing_routes, handle_batch3_paid_event
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            pytest.skip("MONGO_URL or DB_NAME not set")
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        init_billing_routes(db=db, user_dep=lambda r: None)

        # Create a fake account
        acct_id = f"TEST_ACCT_{uuid.uuid4().hex[:8]}"
        user_id = f"TEST_USER_{uuid.uuid4().hex[:8]}"
        await db.accounts.insert_one({
            "id": acct_id, "owner_user_id": user_id, "base_plan": "SOLO",
            "base_plan_status": "ACTIVE",
        })
        await db.users.insert_one({"id": user_id, "email": f"{user_id}@x.com", "plan": "solo"})

        try:
            session_id = f"cs_test_{uuid.uuid4().hex[:12]}"
            await handle_batch3_paid_event(
                {"kind": "plan_upgrade", "account_id": acct_id, "user_id": user_id, "target_plan": "FAMILY"},
                session_id,
            )
            acct = await db.accounts.find_one({"id": acct_id})
            assert acct["base_plan"] == "FAMILY"
            assert acct["stripe_subscription_id"] == session_id
            usr = await db.users.find_one({"id": user_id})
            assert usr["plan"] == "family"
        finally:
            await db.accounts.delete_one({"id": acct_id})
            await db.users.delete_one({"id": user_id})

    @pytest.mark.asyncio
    async def test_handle_addon_event(self):
        sys.path.insert(0, "/app/backend")
        from motor.motor_asyncio import AsyncIOMotorClient
        from batch3_billing import init_billing_routes, handle_batch3_paid_event
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")

        mongo_url = os.environ.get("MONGO_URL")
        db_name = os.environ.get("DB_NAME")
        if not mongo_url or not db_name:
            pytest.skip()
        client = AsyncIOMotorClient(mongo_url)
        db = client[db_name]
        init_billing_routes(db=db, user_dep=lambda r: None)

        addon_id = f"TEST_ADDON_{uuid.uuid4().hex[:8]}"
        await db.participant_add_ons.insert_one({
            "id": addon_id, "account_id": "x", "participant_id": "y", "status": "PENDING",
        })
        try:
            session_id = f"cs_test_{uuid.uuid4().hex[:12]}"
            await handle_batch3_paid_event(
                {"kind": "participant_addon", "addon_id": addon_id},
                session_id,
            )
            row = await db.participant_add_ons.find_one({"id": addon_id})
            assert row["status"] == "ACTIVE"
            assert row["stripe_subscription_id"] == session_id
            assert row.get("activated_at")
        finally:
            await db.participant_add_ons.delete_one({"id": addon_id})
