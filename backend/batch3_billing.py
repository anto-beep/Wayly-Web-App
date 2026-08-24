"""Batch 3, Stripe billing for plan upgrades and participant add-ons.

Uses the same `emergentintegrations.payments.stripe.checkout` library as the
existing `/api/billing/checkout` endpoint. Each Stripe Checkout we create here
carries a `metadata.kind` that the webhook handler dispatches on:

  kind="plan_upgrade"   → flip accounts.base_plan, stamp stripe_subscription_id
  kind="participant_addon" → stamp participant_add_ons.stripe_subscription_id
"""
from __future__ import annotations
import os
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from batch3_models import PLAN_PRICES_MONTHLY, ADDON_PRICE_MONTHLY, _now_iso

logger = logging.getLogger("wayly.billing")

billing_router = APIRouter(tags=["billing-v2"])

_db = None
_user_dep = None


def init_billing_routes(*, db, user_dep):
    global _db, _user_dep
    _db = db
    _user_dep = user_dep


def _stripe_client(host_url: str):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable , STRIPE_API_KEY not set")
    from emergentintegrations.payments.stripe.checkout import StripeCheckout  # type: ignore
    webhook_url = f"{host_url.rstrip('/')}/api/webhook/stripe"
    return StripeCheckout(api_key=api_key, webhook_url=webhook_url)


async def _account_for_user(user: dict) -> dict:
    member = await _db.account_members.find_one(
        {"user_id": user["id"], "status": "ACTIVE"}, {"_id": 0}
    )
    if member:
        acct = await _db.accounts.find_one({"id": member["account_id"]}, {"_id": 0})
        if acct:
            return acct
    acct = await _db.accounts.find_one({"owner_user_id": user["id"]}, {"_id": 0})
    if not acct:
        raise HTTPException(status_code=404, detail="No account found")
    return acct


# ============================================================================
# /api/billing/v2/upgrade-checkout, start a Checkout for a plan upgrade
# ============================================================================
class _UpgradeCheckoutBody(BaseModel):
    target_plan: str = Field(pattern="^(SOLO|FAMILY|ADVISER)$")
    origin_url: str
    delta_only: bool = False  # if True, charge only the price difference vs the current base plan


@billing_router.post("/billing/v2/upgrade-checkout")
async def upgrade_checkout(body: _UpgradeCheckoutBody, request: Request):
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    if acct["owner_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the account owner can change plans")

    current_price = PLAN_PRICES_MONTHLY.get(acct["base_plan"], 0.0)
    target_price = PLAN_PRICES_MONTHLY.get(body.target_plan, 0.0)
    if target_price <= 0:
        raise HTTPException(status_code=400, detail="Invalid target plan")
    amount = round(target_price - current_price, 2) if body.delta_only else target_price
    if amount <= 0:
        # No charge needed, flip immediately
        await _db.accounts.update_one(
            {"id": acct["id"]},
            {"$set": {"base_plan": body.target_plan, "updated_at": _now_iso()}},
        )
        await _db.users.update_one({"id": user["id"]}, {"$set": {"plan": body.target_plan.lower()}})
        return {"url": None, "session_id": None, "instant_upgrade": True, "amount": 0}

    host_url = str(request.base_url).rstrip("/")
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest  # type: ignore
    stripe = _stripe_client(host_url)
    metadata = {
        "kind": "plan_upgrade",
        "account_id": acct["id"],
        "user_id": user["id"],
        "target_plan": body.target_plan,
        "delta_only": "1" if body.delta_only else "0",
    }
    req = CheckoutSessionRequest(
        amount=float(amount),
        currency="aud",
        success_url=f"{body.origin_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/pricing?cancelled=1",
        metadata=metadata,
        payment_methods=["card"],
    )
    session = await stripe.create_checkout_session(req)
    await _db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "user_id": user["id"],
        "account_id": acct["id"],
        "plan": body.target_plan.lower(),
        "amount": float(amount),
        "currency": "aud",
        "metadata": metadata,
        "payment_status": "initiated",
        "ts": _now_iso(),
        "kind": "plan_upgrade",
    })
    return {"url": session.url, "session_id": session.session_id, "amount": amount}


# ============================================================================
# /api/billing/v2/addon-checkout, start a Checkout for a participant add-on
# ============================================================================
class _AddOnCheckoutBody(BaseModel):
    addon_id: str  # the ParticipantAddOn.id row we created when the participant was added
    origin_url: str


@billing_router.post("/billing/v2/addon-checkout")
async def addon_checkout(body: _AddOnCheckoutBody, request: Request):
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    if acct["owner_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the account owner can pay for add-ons")
    addon = await _db.participant_add_ons.find_one(
        {"id": body.addon_id, "account_id": acct["id"]}, {"_id": 0}
    )
    if not addon:
        raise HTTPException(status_code=404, detail="Add-on not found")
    if addon.get("stripe_subscription_id"):
        return {"url": None, "session_id": None, "already_paid": True}

    host_url = str(request.base_url).rstrip("/")
    from emergentintegrations.payments.stripe.checkout import CheckoutSessionRequest  # type: ignore
    stripe = _stripe_client(host_url)
    metadata = {
        "kind": "participant_addon",
        "account_id": acct["id"],
        "user_id": user["id"],
        "addon_id": body.addon_id,
        "participant_id": addon["participant_id"],
    }
    req = CheckoutSessionRequest(
        amount=float(ADDON_PRICE_MONTHLY),
        currency="aud",
        success_url=f"{body.origin_url}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url}/app/participants?cancelled=1",
        metadata=metadata,
        payment_methods=["card"],
    )
    session = await stripe.create_checkout_session(req)
    await _db.payment_transactions.insert_one({
        "session_id": session.session_id,
        "user_id": user["id"],
        "account_id": acct["id"],
        "addon_id": body.addon_id,
        "amount": float(ADDON_PRICE_MONTHLY),
        "currency": "aud",
        "metadata": metadata,
        "payment_status": "initiated",
        "ts": _now_iso(),
        "kind": "participant_addon",
    })
    return {"url": session.url, "session_id": session.session_id, "amount": ADDON_PRICE_MONTHLY}


# ============================================================================
# Webhook side-effect handler, called from server.stripe_webhook for kind != kindred_subscription
# ============================================================================
async def handle_batch3_paid_event(metadata: Dict[str, Any], session_id: str) -> None:
    """Called by the central /api/webhook/stripe handler whenever a Checkout
    completes with one of our v2 `kind` values."""
    if _db is None:
        return
    kind = metadata.get("kind")
    now = _now_iso()
    if kind == "plan_upgrade":
        account_id = metadata.get("account_id")
        target = metadata.get("target_plan")
        if account_id and target:
            await _db.accounts.update_one(
                {"id": account_id},
                {"$set": {
                    "base_plan": target,
                    "stripe_subscription_id": session_id,  # placeholder, sub id arrives on subscription.created webhook
                    "updated_at": now,
                }},
            )
            user_id = metadata.get("user_id")
            if user_id:
                await _db.users.update_one({"id": user_id}, {"$set": {"plan": target.lower()}})
            logger.info("Stripe plan upgrade applied: account=%s → %s", account_id, target)
    elif kind == "participant_addon":
        addon_id = metadata.get("addon_id")
        if addon_id:
            await _db.participant_add_ons.update_one(
                {"id": addon_id},
                {"$set": {
                    "stripe_subscription_id": session_id,
                    "status": "ACTIVE",
                    "activated_at": now,
                }},
            )
            logger.info("Stripe add-on subscription stamped: addon=%s", addon_id)


# ============================================================================
# /api/billing/v2/cancel-pending-addon
# Rollback for the "user opened Stripe Checkout for an add-on but hit cancel"
# case. Removes any unpaid add-on rows (stripe_subscription_id is null) and
# archives the associated participant so it doesn't linger in the account
# count.
# ============================================================================
@billing_router.post("/billing/v2/cancel-pending-addon")
async def cancel_pending_addon(request: Request):
    user = await _user_dep(request)
    acct = await _account_for_user(user)
    if acct["owner_user_id"] != user["id"]:
        raise HTTPException(status_code=403, detail="Only the account owner can cancel add-ons")
    # Find any unpaid add-on for this account (initiated but not stamped).
    pending = await _db.participant_add_ons.find({
        "account_id": acct["id"],
        "$or": [
            {"stripe_subscription_id": None},
            {"stripe_subscription_id": {"$exists": False}},
        ],
        "status": {"$ne": "CANCELLED"},
    }).to_list(length=20)
    removed = []
    now = _now_iso()
    for a in pending:
        # Cancel the addon row.
        await _db.participant_add_ons.update_one(
            {"id": a["id"]},
            {"$set": {"status": "CANCELLED", "cancelled_at": now}},
        )
        # Archive the participant it created (soft delete) if it's still
        # active and belongs to the addon.
        pid = a.get("participant_id")
        if pid:
            await _db.participants.update_one(
                {"id": pid, "account_id": acct["id"]},
                {"$set": {"status": "REMOVED", "removed_at": now, "removal_reason": "checkout_cancelled"}},
            )
            removed.append(pid)
    return {"ok": True, "cancelled_count": len(pending), "participants_archived": removed}
