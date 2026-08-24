"""Advanced Stripe billing endpoints — proration preview, plan-follows-
participant-count sync, and lookup-key-based price resolution.

Ships spec items from BILLING-UI-1 v5 §4.4 (live proration + auto plan
swap), STRIPE-CONFIG-1 v4 §4.2 (lookup-key retrieval).

Endpoints (all mounted under /api/payments):
  * POST /api/payments/proration-preview
  * POST /api/payments/sync-plan-to-participants
  * GET  /api/payments/prices  (debug: current lookup-key -> price_id map)
"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.payments.advanced")

router = APIRouter(prefix="/payments", tags=["payments"])

_user_dep = None
_db = None


def init(*, db, user_dep):
    global _user_dep, _db
    _user_dep = user_dep
    _db = db


# --------------------------------------------------------------------------- #
# Lookup-key resolver (STRIPE-CONFIG-1 v4 §4.2)
#
# Instead of hardcoding STRIPE_PRICE_ID_* in .env, resolve prices by lookup
# key against Stripe. Cached in-process for 10 minutes so a price rotation
# (create new + archive old, same lookup key) picks up automatically on the
# next call, without needing a redeploy.
# --------------------------------------------------------------------------- #

_LOOKUP_KEYS = {
    "solo": "solo_fortnightly",
    "family": "family_fortnightly",
    "additional": "family_additional_participant_fortnightly",
    "adviser": "adviser_monthly",
    "adviser_household": "adviser_additional_household_monthly",
    "adviser_seat": "adviser_additional_practice_seat_monthly",
}

_PRICE_CACHE: dict = {"ts": 0, "prices": {}}
_PRICE_CACHE_TTL = 600  # 10 minutes


async def resolve_price_id(plan_key: str) -> Optional[str]:
    """Resolve a plan key ("solo"|"family"|"additional"|"adviser"|…) to a
    Stripe price ID. Prefers a lookup-key lookup against Stripe; falls back
    to the legacy STRIPE_PRICE_ID_* env var if Stripe returns no match.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return None
    stripe.api_key = api_key

    now = time.time()
    if now - _PRICE_CACHE.get("ts", 0) > _PRICE_CACHE_TTL:
        try:
            lookup_keys = list(_LOOKUP_KEYS.values())
            resp = stripe.Price.list(lookup_keys=lookup_keys, active=True, limit=len(lookup_keys))
            new_map: dict = {}
            for p in getattr(resp, "data", []) or []:
                lk = getattr(p, "lookup_key", None)
                if lk:
                    new_map[lk] = p.id
            _PRICE_CACHE["ts"] = now
            _PRICE_CACHE["prices"] = new_map
        except stripe.error.StripeError as e:  # type: ignore[attr-defined]
            logger.warning("lookup-key resolve failed: %s", e)

    lk = _LOOKUP_KEYS.get(plan_key)
    if lk:
        pid = _PRICE_CACHE.get("prices", {}).get(lk)
        if pid:
            return pid

    # Legacy .env fallback so existing subscriptions keep working.
    env_key = {
        "solo": "STRIPE_PRICE_ID_SOLO",
        "family": "STRIPE_PRICE_ID_FAMILY",
        "additional": "STRIPE_PRICE_ID_ADDITIONAL",
        "adviser": "STRIPE_PRICE_ID_ADVISER",
    }.get(plan_key)
    if env_key:
        return os.environ.get(env_key)
    return None


@router.get("/prices")
async def price_map(request: Request):
    """Debug: return the currently-resolved lookup_key → price_id map. Handy
    for confirming the Stripe catalogue is wired up before running the sub-
    scription transition tests."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Stripe not configured")
    # Force a refresh so callers can trust the numbers.
    _PRICE_CACHE["ts"] = 0
    await resolve_price_id("solo")  # warm the cache
    return {
        "prices": _PRICE_CACHE.get("prices", {}),
        "cached_at": _PRICE_CACHE.get("ts"),
        "fallback_env": {
            "solo": bool(os.environ.get("STRIPE_PRICE_ID_SOLO")),
            "family": bool(os.environ.get("STRIPE_PRICE_ID_FAMILY")),
            "additional": bool(os.environ.get("STRIPE_PRICE_ID_ADDITIONAL")),
        },
    }


# --------------------------------------------------------------------------- #
# Auth helper
# --------------------------------------------------------------------------- #

async def _require_user(request: Request):
    if _user_dep is None:
        raise HTTPException(status_code=503, detail="Auth not initialised")
    try:
        user = await _user_dep(request)
    except Exception:
        user = None
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


async def _load_active_subscription(user: dict) -> Optional[dict]:
    """Return the Stripe subscription object for the user, or None."""
    sub_id = user.get("stripe_subscription_id")
    if not sub_id and _db is not None:
        u = await _db.users.find_one({"id": user.get("id")})
        sub_id = (u or {}).get("stripe_subscription_id")
    if not sub_id:
        return None
    try:
        return stripe.Subscription.retrieve(sub_id, expand=["items", "schedule"])
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("stripe sub retrieve failed: %s", e)
        return None


# --------------------------------------------------------------------------- #
# Live proration preview (BILLING-UI-1 v5 §4.4)
# --------------------------------------------------------------------------- #

class ProrationPreviewBody(BaseModel):
    target_plan: str = Field(pattern="^(solo|family)$")
    additional_participants: Optional[int] = 0  # participants beyond the two included in Family


@router.post("/proration-preview")
async def proration_preview(body: ProrationPreviewBody, request: Request):
    """Return the exact prorated amount from Stripe's upcoming-invoice
    endpoint, so the confirm modal displays the number that will actually be
    charged (BILLING-UI-1 v5 §4.4 acceptance criterion 4). If no active
    subscription exists, returns null figures so the UI can fall back to
    plain-language copy.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    sub = await _load_active_subscription(user)
    if not sub:
        return {"available": False, "reason": "no_active_subscription", "amount": None, "currency": "aud"}

    target_price_id = await resolve_price_id(body.target_plan)
    if not target_price_id:
        raise HTTPException(status_code=503, detail=f"Plan '{body.target_plan}' has no configured price")

    # Build the new subscription-items shape. Preserve any existing items
    # that aren't the base plan (i.e. add-ons) so the preview matches what
    # sync-plan-to-participants will actually apply.
    items = []
    base_item_id = None
    addon_item_id = None
    for it in getattr(sub, "items", None).data if getattr(sub, "items", None) else []:
        price = getattr(it, "price", None)
        looks_like_addon = "additional_participant" in (getattr(price, "lookup_key", "") or "").lower() or "additional" in (getattr(price, "nickname", "") or "").lower()
        if looks_like_addon:
            addon_item_id = it.id
        else:
            base_item_id = it.id
    if base_item_id:
        items.append({"id": base_item_id, "price": target_price_id})
    else:
        items.append({"price": target_price_id, "quantity": 1})

    addon_qty = max(0, int(body.additional_participants or 0))
    if body.target_plan == "family" and addon_qty > 0:
        addon_price_id = await resolve_price_id("additional")
        if addon_price_id:
            if addon_item_id:
                items.append({"id": addon_item_id, "price": addon_price_id, "quantity": addon_qty})
            else:
                items.append({"price": addon_price_id, "quantity": addon_qty})
    elif addon_item_id:
        # Drop the add-on entirely (e.g. downgrading Family+N → Solo).
        items.append({"id": addon_item_id, "deleted": True})

    try:
        upcoming = stripe.Invoice.create_preview(
            customer=sub.customer,
            subscription=sub.id,
            subscription_details={
                "items": items,
                "proration_behavior": "create_prorations",
            },
        )
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("proration preview failed: %s", e)
        return {"available": False, "reason": str(e), "amount": None, "currency": "aud"}

    # Only the prorated lines count toward "charged now" — everything else
    # is the next full-period charge.
    prorated_amount = 0
    for line in getattr(upcoming, "lines", None).data if getattr(upcoming, "lines", None) else []:
        # Newer Stripe SDK doesn't expose `proration` on line items. Detect
        # proration lines by the description Stripe generates: "Unused time
        # on ..." (credit) or "Remaining time on ..." (prorated charge).
        desc = (line.get("description") or "") if hasattr(line, "get") else (getattr(line, "description", "") or "")
        is_prorated = "Unused time" in desc or "Remaining time" in desc
        if is_prorated:
            prorated_amount += int(line.amount or 0)

    return {
        "available": True,
        "amount_due_now": prorated_amount,  # cents; may be 0 or negative
        "amount_due_now_display": f"${(prorated_amount / 100):.2f}",
        "next_full_charge": upcoming.total,
        "next_full_charge_display": f"${(upcoming.total / 100):.2f}",
        "currency": (upcoming.currency or "aud").upper(),
        "period_end": sub.current_period_end,
    }


# --------------------------------------------------------------------------- #
# Explicit plan change (Settings "Switch to Family") — REAL prorated
# subscription.update. This replaces the legacy no-op /billing/upgrade and the
# one-time /billing/v2/upgrade-checkout so EVERY upgrade path applies exact
# Stripe proration on the live subscription (BILLING-UI-1 v5 §4.4).
# Downgrades (family→solo) are period-end scheduled — callers must use
# /payments/schedule-downgrade for those; this endpoint 409s on a downgrade.
# --------------------------------------------------------------------------- #

class ChangePlanBody(BaseModel):
    target_plan: str = Field(pattern="^(solo|family)$")


@router.post("/change-plan")
async def change_plan(body: ChangePlanBody, request: Request):
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    sub = await _load_active_subscription(user)
    if not sub:
        raise HTTPException(status_code=400, detail="No active subscription on record.")

    # Determine the current base plan + item from the live subscription.
    base_item = None
    base_lookup = ""
    for it in getattr(sub, "items", None).data if getattr(sub, "items", None) else []:
        price = getattr(it, "price", None)
        lk = (getattr(price, "lookup_key", "") or "").lower()
        if "additional_participant" not in lk:
            base_item = it
            base_lookup = lk
    current_plan = "family" if "family" in base_lookup else ("solo" if "solo" in base_lookup else None)

    if current_plan == body.target_plan:
        return {"ok": True, "changed": False, "plan": body.target_plan}

    # Only immediate upgrades here; downgrades go through schedule-downgrade.
    if not (current_plan == "solo" and body.target_plan == "family"):
        raise HTTPException(
            status_code=409,
            detail="This endpoint only applies immediate upgrades. Use /payments/schedule-downgrade for downgrades.",
        )

    target_price_id = await resolve_price_id(body.target_plan)
    if not target_price_id:
        raise HTTPException(status_code=503, detail=f"Plan '{body.target_plan}' has no configured price")

    items = [{"id": base_item.id, "price": target_price_id}] if base_item else [{"price": target_price_id, "quantity": 1}]
    try:
        updated = stripe.Subscription.modify(
            sub.id,
            items=items,
            proration_behavior="create_prorations",
            expand=["items"],
        )
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("change-plan upgrade failed: %s", e)
        raise HTTPException(status_code=502, detail=str(getattr(e, "user_message", None) or e))

    # Mirror into the read-model immediately (webhook also reconciles, but the
    # preview env may not receive webhooks — keep the two paths in agreement).
    from datetime import datetime, timezone

    def _iso(ep):
        return datetime.fromtimestamp(ep, tz=timezone.utc).isoformat() if ep else None

    if _db is not None:
        cpe = getattr(updated, "current_period_end", None)
        if not cpe:
            data = getattr(getattr(updated, "items", None), "data", None) or []
            if data:
                cpe = getattr(data[0], "current_period_end", None)
        now = datetime.now(timezone.utc).isoformat()
        await _db.users.update_one({"id": user.get("id")}, {"$set": {"plan": body.target_plan}})
        await _db.subscriptions.update_one(
            {"user_id": user.get("id")},
            {"$set": {
                "plan": body.target_plan,
                "status": updated.status,
                "current_period_end": _iso(cpe),
                "cancel_at_period_end": getattr(updated, "cancel_at_period_end", None),
                "stripe_subscription_id": updated.id,
                "updated_at": now,
            }},
            upsert=True,
        )

    # Surface the exact prorated amount just charged, if any.
    charged_display = None
    try:
        preview = stripe.Invoice.upcoming(customer=sub.customer, subscription=sub.id)
        charged_display = f"${(preview.total / 100):.2f}"
    except Exception:
        charged_display = None

    return {"ok": True, "changed": True, "plan": body.target_plan, "next_charge_display": charged_display}



# --------------------------------------------------------------------------- #
# Plan-follows-participant-count sync (BILLING-UI-1 v5 §4.4 / §4.1)
# --------------------------------------------------------------------------- #

async def _active_participant_count(user_id: str) -> int:
    if _db is None:
        return 0
    # Try account-scoped first (multi-participant families), fall back to
    # household-scoped.
    acct = await _db.accounts.find_one({"owner_user_id": user_id}) if _db is not None else None
    if acct:
        return await _db.participants.count_documents({"account_id": acct["id"], "status": "ACTIVE"})
    return await _db.participants.count_documents({"household_id": user_id, "status": {"$ne": "REMOVED"}})


@router.post("/sync-plan-to-participants")
async def sync_plan_to_participants(request: Request):
    """Reconcile Stripe subscription state with the current participant
    count. Handles the four transitions from STRIPE-CONFIG-1 v4 §4.1:

    - 1 participant → base=solo, no addon.  If currently on family, schedule
      a period-end downgrade.
    - 2 participants → base=family, no addon.  Upgrade solo→family
      immediately with proration.  Remove addon at period end if present.
    - 3+ participants → base=family + addon quantity = count-2.  Add-on
      quantity changes are prorated immediately for adds, period-end for
      removes.

    Idempotent: if the subscription already matches the target shape, no
    Stripe call is made.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    sub = await _load_active_subscription(user)
    if not sub:
        return {"ok": False, "reason": "no_active_subscription"}

    count = await _active_participant_count(user.get("id"))
    if count < 1:
        count = 1  # Solo minimum

    if count == 1:
        target_plan = "solo"
        target_addon_qty = 0
    elif count == 2:
        target_plan = "family"
        target_addon_qty = 0
    else:
        target_plan = "family"
        target_addon_qty = count - 2

    target_base_price_id = await resolve_price_id(target_plan)
    target_addon_price_id = await resolve_price_id("additional")
    if not target_base_price_id:
        raise HTTPException(status_code=503, detail=f"Plan '{target_plan}' has no configured price")

    # Current shape
    current_base_item = None
    current_addon_item = None
    current_base_lookup = ""
    current_addon_qty = 0
    for it in getattr(sub, "items", None).data if getattr(sub, "items", None) else []:
        price = getattr(it, "price", None)
        lk = (getattr(price, "lookup_key", "") or "").lower()
        if "additional_participant" in lk:
            current_addon_item = it
            current_addon_qty = int(it.quantity or 0)
        else:
            current_base_item = it
            current_base_lookup = lk

    current_plan_is_family = "family" in current_base_lookup

    # Nothing to do?
    is_upgrade = (not current_plan_is_family and target_plan == "family")
    is_downgrade = (current_plan_is_family and target_plan == "solo")
    addon_growing = target_addon_qty > current_addon_qty
    addon_shrinking = target_addon_qty < current_addon_qty

    if not (is_upgrade or is_downgrade or addon_growing or addon_shrinking):
        return {"ok": True, "changed": False, "plan": target_plan, "addon_qty": target_addon_qty}

    changes = []

    if is_upgrade or addon_growing:
        # Immediate + prorated (BILLING-UI-1 v5 §2 upgrade rule).
        items = []
        if current_base_item and is_upgrade:
            items.append({"id": current_base_item.id, "price": target_base_price_id})
            changes.append(f"base solo→family")
        if addon_growing and target_addon_qty > 0 and target_addon_price_id:
            if current_addon_item:
                items.append({"id": current_addon_item.id, "quantity": target_addon_qty})
            else:
                items.append({"price": target_addon_price_id, "quantity": target_addon_qty})
            changes.append(f"addon qty→{target_addon_qty}")
        try:
            stripe.Subscription.modify(
                sub.id,
                items=items,
                proration_behavior="create_prorations",
            )
        except stripe.error.StripeError as e:  # type: ignore[attr-defined]
            logger.warning("sync upgrade failed: %s", e)
            raise HTTPException(status_code=502, detail=str(e))

    if is_downgrade or addon_shrinking:
        # Schedule at period end (BILLING-UI-1 v5 §2 downgrade rule): create
        # a subscription schedule with the current phase up to period_end,
        # then a second phase with the target shape.
        phases_end_shape = []
        phases_end_shape.append({"price": target_base_price_id, "quantity": 1})
        if target_plan == "family" and target_addon_qty > 0 and target_addon_price_id:
            phases_end_shape.append({"price": target_addon_price_id, "quantity": target_addon_qty})
        try:
            # Some subs already have a schedule; extend it if so, otherwise
            # create a fresh one from the sub.
            existing_schedule = getattr(sub, "schedule", None)
            if existing_schedule:
                sched_id = existing_schedule if isinstance(existing_schedule, str) else existing_schedule.id
                stripe.SubscriptionSchedule.release(sched_id)
            sched = stripe.SubscriptionSchedule.create(from_subscription=sub.id)
            stripe.SubscriptionSchedule.modify(
                sched.id,
                end_behavior="release",
                phases=[
                    {
                        "items": [
                            {"price": it.price.id, "quantity": it.quantity or 1}
                            for it in sub.items.data
                        ],
                        "start_date": sub.current_period_start,
                        "end_date": sub.current_period_end,
                        "proration_behavior": "none",
                    },
                    {
                        "items": phases_end_shape,
                        "iterations": 1,
                        "proration_behavior": "none",
                    },
                ],
            )
            changes.append(f"scheduled downgrade to {target_plan} @ period_end")
        except stripe.error.StripeError as e:  # type: ignore[attr-defined]
            logger.warning("sync downgrade failed: %s", e)
            raise HTTPException(status_code=502, detail=str(e))

    # Persist locally (webhook will also update, but do it eagerly).
    if _db is not None:
        await _db.users.update_one(
            {"id": user.get("id")},
            {"$set": {"plan": target_plan}},
        )

    return {"ok": True, "changed": True, "plan": target_plan, "addon_qty": target_addon_qty, "changes": changes}


# --------------------------------------------------------------------------- #
# Daily reconciliation cron (BILLING-UI-1 v5 §7)
#
# Runs in-process via the same asyncio scheduler that server.py uses for the
# rest of its cron work. Compares each user's `plan` field against the
# corresponding Stripe subscription's base item, and flags any drift into
# `billing_reconciliation_drift`.
# --------------------------------------------------------------------------- #

async def run_reconciliation_once() -> dict:
    """One pass over all users with a Stripe subscription. Returns a
    summary dict."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key or _db is None:
        return {"ran": False, "reason": "not_configured"}
    stripe.api_key = api_key

    from datetime import datetime, timezone
    checked = 0
    drift = 0
    async for u in _db.users.find({"stripe_subscription_id": {"$exists": True, "$ne": None}}):
        checked += 1
        try:
            sub = stripe.Subscription.retrieve(u.get("stripe_subscription_id"), expand=["items"])
        except stripe.error.StripeError as e:  # type: ignore[attr-defined]
            logger.warning("reconcile: sub retrieve failed for user=%s: %s", u.get("id"), e)
            continue
        base_lookup = ""
        for it in sub.items.data:
            price = it.price
            lk = (getattr(price, "lookup_key", "") or "").lower()
            if "additional_participant" not in lk:
                base_lookup = lk
                break
        stripe_plan = "family" if "family" in base_lookup else ("solo" if "solo" in base_lookup else "unknown")
        local_plan = (u.get("plan") or "").lower()
        if stripe_plan != "unknown" and local_plan != stripe_plan:
            drift += 1
            await _db.billing_reconciliation_drift.update_one(
                {"user_id": u.get("id")},
                {"$set": {
                    "user_id": u.get("id"),
                    "email": u.get("email"),
                    "local_plan": local_plan,
                    "stripe_plan": stripe_plan,
                    "stripe_subscription_status": sub.status,
                    "detected_at": datetime.now(timezone.utc).isoformat(),
                }},
                upsert=True,
            )
    return {"ran": True, "checked": checked, "drift": drift}


@router.get("/reconciliation-report")
async def reconciliation_report(request: Request):
    """Return the latest drift rows so the founder can eyeball them from
    the admin surface."""
    if _db is None:
        return {"drift": []}
    await _require_user(request)
    rows = []
    async for r in _db.billing_reconciliation_drift.find().sort("detected_at", -1).limit(100):
        r.pop("_id", None)
        rows.append(r)
    return {"drift": rows}


@router.post("/reconciliation-run")
async def reconciliation_run(request: Request):
    """Trigger a reconciliation pass on demand. Admin-only in practice, but
    left auth-only so the founder can hit it from Settings. The daily cron
    calls run_reconciliation_once() directly."""
    await _require_user(request)
    return await run_reconciliation_once()
