"""iter382 — a paid (non-trialing) cancel / reactivate must update the
db.subscriptions READ-MODEL immediately, so Plan & Billing reflects the new
state without a manual page refresh.

Root cause fixed: routes/payments.py cancel-subscription / reactivate-subscription
previously wrote only to db.users; GET /api/billing/subscription reads
db.subscriptions, so the UI's immediate re-fetch returned stale data until a
later Stripe webhook landed (which is why a refresh "fixed" it).

Stripe is mocked; the real local test DB is used.
"""
import asyncio
import os
import uuid

import pytest

import routes.payments as payments


class _FakeSub:
    """Minimal stand-in for a retrieved Stripe Subscription object."""
    def __init__(self, status):
        self.status = status


def _run(coro):
    return asyncio.new_event_loop().run_until_complete(coro)


async def _seed(db, uid, cap_initial):
    await db.users.insert_one({
        "id": uid, "email": f"{uid}@example.com",
        "stripe_subscription_id": "sub_fake_iter382",
        "plan": "solo", "subscription_status": "active",
    })
    await db.subscriptions.insert_one({
        "user_id": uid, "status": "active", "plan": "solo",
        "cancel_at_period_end": cap_initial,
        "current_period_end": "2026-10-25T00:00:00+00:00",
        "stripe_subscription_id": "sub_fake_iter382",
        "updated_at": "2026-01-01T00:00:00+00:00",
    })


async def _cleanup(db, uid):
    await db.users.delete_many({"id": uid})
    await db.subscriptions.delete_many({"user_id": uid})


def _db_handle():
    from motor.motor_asyncio import AsyncIOMotorClient
    c = AsyncIOMotorClient(os.environ.get("MONGO_URL", "mongodb://localhost:27017"))
    return c[os.environ.get("DB_NAME", "test_database")]


def test_paid_cancel_updates_read_model_immediately(monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_test_dummy_iter382")
    monkeypatch.setattr(payments.stripe.Subscription, "retrieve", lambda _id: _FakeSub("active"))
    monkeypatch.setattr(payments.stripe.Subscription, "modify",
                        lambda _id, **kw: {"current_period_end": "2026-10-25T00:00:00+00:00"})

    uid = f"iter382-cancel-{uuid.uuid4().hex[:8]}"

    async def scenario():
        db = _db_handle()
        payments._db = db
        user = {"id": uid, "email": f"{uid}@example.com", "stripe_subscription_id": "sub_fake_iter382"}
        monkeypatch.setattr(payments, "_require_user", lambda _req: _coro(user))
        await _seed(db, uid, cap_initial=False)
        try:
            out = await payments.cancel_subscription(request=None)
            assert out["cancel_at_period_end"] is True
            # The READ-MODEL that GET /billing/subscription serves is updated now.
            sub = await db.subscriptions.find_one({"user_id": uid}, sort=[("updated_at", -1)])
            assert sub["cancel_at_period_end"] is True, "db.subscriptions not mirrored on cancel"
        finally:
            await _cleanup(db, uid)

    _run(scenario())


def test_reactivate_updates_read_model_immediately(monkeypatch):
    monkeypatch.setenv("STRIPE_API_KEY", "sk_test_dummy_iter382")
    monkeypatch.setattr(payments.stripe.Subscription, "retrieve", lambda _id: _FakeSub("active"))
    monkeypatch.setattr(payments.stripe.Subscription, "modify",
                        lambda _id, **kw: {"current_period_end": "2026-10-25T00:00:00+00:00"})

    uid = f"iter382-react-{uuid.uuid4().hex[:8]}"

    async def scenario():
        db = _db_handle()
        payments._db = db
        user = {"id": uid, "email": f"{uid}@example.com", "stripe_subscription_id": "sub_fake_iter382"}
        monkeypatch.setattr(payments, "_require_user", lambda _req: _coro(user))
        await _seed(db, uid, cap_initial=True)
        try:
            out = await payments.reactivate_subscription(request=None)
            assert out["cancel_at_period_end"] is False
            sub = await db.subscriptions.find_one({"user_id": uid}, sort=[("updated_at", -1)])
            assert sub["cancel_at_period_end"] is False, "db.subscriptions not mirrored on reactivate"
        finally:
            await _cleanup(db, uid)

    _run(scenario())


def _coro(value):
    async def _inner():
        return value
    return _inner()
