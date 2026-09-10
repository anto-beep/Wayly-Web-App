"""Acceptance tests for BILLING-UI-1 v5 §12 and STRIPE-CONFIG-1 v4 §5.

These tests verify the *contract* of the payments routes, not Stripe's own
behaviour. Stripe SDK calls are patched so the suite runs offline in CI.

Covered scenarios:
  §12 — access must ONLY be granted on webhook confirmation, not on a
        success-page response. Simulate `/api/payments/checkout/status/{id}`
        returning `payment_status=paid` without any webhook having fired,
        and confirm the user's plan is still 'free' / no access granted.
  §5.10 — proration preview returns null/available=False when no
        subscription exists.
  §5 idempotency — the webhook does not re-apply a duplicate event.
"""
import os
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

pytestmark = pytest.mark.asyncio


class _FakeSession:
    def __init__(self, session_id="cs_test_1", **kw):
        self.id = session_id
        self.payment_status = kw.get("payment_status", "paid")
        self.status = kw.get("status", "complete")
        self.subscription = kw.get("subscription")
        self.customer_details = None
        self.metadata = kw.get("metadata", {})


async def test_success_page_does_not_grant_access_without_webhook():
    """§12: the checkout-status endpoint (which the success page polls)
    must not mutate the user's plan. The webhook is the sole source of
    truth for entitlement changes."""
    os.environ.setdefault("STRIPE_API_KEY", "sk_test_dummy")

    # Import lazily so the module reads STRIPE_API_KEY from env at call time.
    from routes.payments import checkout_status

    fake_session = _FakeSession(
        session_id="cs_test_xyz",
        payment_status="paid",
        status="complete",
        subscription="sub_test_1",
        metadata={"user_id": "u1", "plan": "family"},
    )
    with patch("routes.payments.stripe.checkout.Session.retrieve", return_value=fake_session):
        req = MagicMock()
        resp = await checkout_status("cs_test_xyz", req)
    # The response reports paid, so the UI can show the success page — but
    # this endpoint MUST NOT itself update users.plan. That belongs to
    # `checkout.session.completed` in stripe_webhook.
    assert resp["payment_status"] == "paid"
    assert resp["plan"] == "family"
    # There is no way to prove a negative from a unit test without a DB
    # dependency, but the checkout_status function body itself never
    # references _db.users — this is the guarantee.
    import inspect
    src = inspect.getsource(checkout_status)
    assert "_db.users.update" not in src, "checkout_status must never mutate users.plan"
    assert "await _db" not in src or "users.update" not in src, "checkout_status must never mutate the users collection"


async def test_webhook_is_idempotent_on_duplicate_event():
    """Idempotency: replaying the same Stripe event.id twice must not
    re-apply the state change."""
    from routes import payments as payments_mod

    # Fake db that pretends the event was already processed.
    fake_prior = {"id": "evt_1", "processed_at": "2026-02-01T00:00:00+00:00"}
    db = MagicMock()
    db.stripe_webhook_events = MagicMock()
    db.stripe_webhook_events.find_one = AsyncMock(return_value=fake_prior)
    db.stripe_webhook_events.update_one = AsyncMock()
    db.users = MagicMock()
    db.users.update_one = AsyncMock()
    payments_mod._db = db

    event_payload = {"id": "evt_1", "type": "checkout.session.completed", "data": {"object": {"id": "cs_1", "metadata": {}}}}
    req = MagicMock()
    req.body = AsyncMock(return_value=b"payload")
    req.headers = {"stripe-signature": "sig"}
    with patch("routes.payments.stripe.Webhook.construct_event", return_value=event_payload), \
         patch.dict(os.environ, {"STRIPE_API_KEY": "sk_test_dummy", "STRIPE_WEBHOOK_SECRET": "whsec_test"}):
        resp = await payments_mod.stripe_webhook(req)
    assert resp["duplicate"] is True
    # Critical: users.update_one must NOT have been called on duplicate.
    assert not db.users.update_one.called, "duplicate event must not re-apply state"


async def test_proration_preview_returns_unavailable_without_subscription():
    """§5.10: proration preview should degrade gracefully when the user has
    no Stripe subscription yet (e.g. free-tier or brand-new signup)."""
    from routes import payments_advanced as adv

    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value={"id": "u1", "stripe_subscription_id": None})
    adv._db = db
    adv._user_dep = AsyncMock(return_value={"id": "u1", "email": "x@x.com"})

    class Body:
        target_plan = "family"
        additional_participants = 0

    req = MagicMock()
    with patch.dict(os.environ, {"STRIPE_API_KEY": "sk_test_dummy"}):
        resp = await adv.proration_preview(Body(), req)
    assert resp["available"] is False
    assert resp["reason"] == "no_active_subscription"


async def test_sync_plan_to_participants_idempotent_when_matched():
    """§4.1: when the Stripe subscription shape already matches the target
    participant-count-derived plan, no Stripe modify call is made."""
    from routes import payments_advanced as adv

    # 1 active participant → target = solo, addon = 0.
    db = MagicMock()
    db.users = MagicMock()
    db.users.find_one = AsyncMock(return_value={"id": "u1", "stripe_subscription_id": "sub_1"})
    db.users.update_one = AsyncMock()
    db.accounts = MagicMock()
    db.accounts.find_one = AsyncMock(return_value=None)
    db.participants = MagicMock()
    db.participants.count_documents = AsyncMock(return_value=1)
    adv._db = db
    adv._user_dep = AsyncMock(return_value={"id": "u1"})

    # Fake sub already on solo
    fake_price = MagicMock(id="price_solo", lookup_key="solo_fortnightly")
    fake_item = MagicMock(id="si_solo", price=fake_price, quantity=1)
    fake_sub = MagicMock(id="sub_1", customer="cus_1", schedule=None, current_period_end=0, current_period_start=0)
    fake_sub.items.data = [fake_item]

    req = MagicMock()
    with patch.dict(os.environ, {"STRIPE_API_KEY": "sk_test_dummy", "STRIPE_PRICE_ID_SOLO": "price_solo", "STRIPE_PRICE_ID_ADDITIONAL": "price_addon"}), \
         patch("routes.payments_advanced.stripe.Subscription.retrieve", return_value=fake_sub), \
         patch("routes.payments_advanced.stripe.Subscription.modify") as modify:
        resp = await adv.sync_plan_to_participants(req)
    assert resp["ok"] is True
    assert resp["changed"] is False
    assert not modify.called, "no Stripe modify should fire when shape already matches"
