"""Public pricing checkout — creates a Stripe Checkout Session in
subscription mode from a plan key.

Wave 1 of the BILLING/PRICING roadmap. Uses the raw Stripe SDK directly
(not the one-time-payment emergentintegrations helper) because Wayly's
plans are recurring subscriptions with a 7-day trial, and the Checkout
Session mode must be `subscription` with `line_items[].price` referring
to the pre-created Stripe Price IDs.

Env vars consumed:
  * STRIPE_API_KEY          , secret key (test or live)
  * STRIPE_PRICE_ID_SOLO
  * STRIPE_PRICE_ID_FAMILY
  * STRIPE_PRICE_ID_ADDITIONAL  , add-on
  * STRIPE_WEBHOOK_SECRET   , used by /api/webhook/stripe

Endpoints:
  * POST /api/payments/checkout
      body: { plan: "solo"|"family"|"adviser"|"additional", origin_url: str,
              trial_days?: int = 7, promo_code?: str }
      resp: { url: str, session_id: str }
      -> Client redirects window.location to `url`.

  * GET  /api/payments/checkout/status/{session_id}
      Poll a Stripe checkout session for the success page.

  * POST /api/payments/portal
      Create a Stripe billing portal session for the logged-in user so
      they can manage their card, add a backup, or cancel from Stripe's
      hosted portal.

  * GET  /api/payments/invoices
      Return the logged-in user's Stripe invoice history (paid + open).

  * POST /api/payments/cancel-subscription
      Set `cancel_at_period_end=True` on the active subscription so the
      customer keeps access until period end (BILLING-UI-1 v5 §4.5).

  * POST /api/payments/reactivate-subscription
      Undo a scheduled cancellation before it fires.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

import stripe
from fastapi import APIRouter, HTTPException, Request, Depends
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("wayly.payments")

payments_router = APIRouter(prefix="/payments", tags=["payments"])

_user_dep = None
_db = None


def init_payments(*, db, user_dep):
    global _user_dep, _db
    _user_dep = user_dep
    _db = db


def _price_for_plan(plan: str) -> str:
    plan = (plan or "").lower()
    env_key = {
        "solo": "STRIPE_PRICE_ID_SOLO",
        "family": "STRIPE_PRICE_ID_FAMILY",
        "adviser": "STRIPE_PRICE_ID_ADVISER",
        "additional": "STRIPE_PRICE_ID_ADDITIONAL",
    }.get(plan)
    if not env_key:
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")
    price = os.environ.get(env_key)
    if not price:
        raise HTTPException(
            status_code=503,
            detail=f"Plan '{plan}' is not configured on the server yet. Please contact support.",
        )
    return price


def _plan_for_price(price_id: str) -> Optional[str]:
    """Reverse of _price_for_plan: map a Stripe price id back to a plan key."""
    if not price_id:
        return None
    for plan, env_key in (
        ("solo", "STRIPE_PRICE_ID_SOLO"),
        ("family", "STRIPE_PRICE_ID_FAMILY"),
        ("adviser", "STRIPE_PRICE_ID_ADVISER"),
    ):
        if os.environ.get(env_key) == price_id:
            return plan
    return None


def _epoch_iso(ep):
    from datetime import datetime, timezone
    return datetime.fromtimestamp(ep, tz=timezone.utc).isoformat() if ep else None


def _sub_period_end(sub: dict):
    """Stripe (2025-06+) moved current_period_end onto subscription items.
    Read from the item, falling back to the (older) top-level field."""
    cpe = sub.get("current_period_end")
    if not cpe:
        items = (sub.get("items") or {}).get("data", [])
        if items:
            cpe = items[0].get("current_period_end")
    return cpe


def _sub_period_start(sub: dict):
    cps = sub.get("current_period_start")
    if not cps:
        items = (sub.get("items") or {}).get("data", [])
        if items:
            cps = items[0].get("current_period_start")
    return cps


def _plan_from_sub(sub: dict) -> Optional[str]:
    """Infer the plan from a Stripe subscription's base (non-add-on) item."""
    try:
        for item in (sub.get("items") or {}).get("data", []):
            price = (item.get("price") or {})
            pid = price.get("id")
            plan = _plan_for_price(pid)
            if plan:
                return plan
    except Exception:
        pass
    return None


async def _upsert_sub_doc(user_id: str, sub: dict, plan: Optional[str] = None, extra: Optional[dict] = None):
    """SINGLE SOURCE OF TRUTH bridge: mirror Stripe subscription state into the
    db.subscriptions collection that GET /api/billing/subscription reads, so
    every write path (checkout, webhook, upgrade, downgrade) agrees. ISO dates
    to match the canonical doc shape. Idempotent upsert keyed on user_id."""
    if _db is None or not user_id or not sub:
        return
    import uuid
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    plan = plan or _plan_from_sub(sub)
    doc = {
        "user_id": user_id,
        "status": sub.get("status"),
        "current_period_end": _epoch_iso(_sub_period_end(sub)),
        "cancel_at_period_end": sub.get("cancel_at_period_end"),
        "trial_ends_at": _epoch_iso(sub.get("trial_end")),
        "stripe_subscription_id": sub.get("id"),
        "stripe_customer_id": sub.get("customer"),
        "updated_at": now,
    }
    if plan:
        doc["plan"] = plan
    if extra:
        doc.update(extra)
    await _db.subscriptions.update_one(
        {"user_id": user_id},
        {"$set": doc, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now, "had_trial": True}},
        upsert=True,
    )


async def _user_id_for_sub(sub_id: str, customer_id: str = None) -> Optional[str]:
    """Resolve our internal user id from a Stripe subscription/customer id."""
    if _db is None:
        return None
    u = await _db.users.find_one({"stripe_subscription_id": sub_id}) if sub_id else None
    if not u and customer_id:
        u = await _db.users.find_one({"stripe_customer_id": customer_id})
    return (u or {}).get("id")



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


class CheckoutBody(BaseModel):
    plan: str = Field(pattern="^(solo|family|adviser|additional)$")
    origin_url: str
    trial_days: Optional[int] = 7
    promo_code: Optional[str] = None
    # When the caller is the native mobile app, it passes a deep link here so
    # that after payment the hosted checkout bounces BACK into the app instead
    # of stranding the user in the browser. Web callers omit it.
    app_return_url: Optional[str] = None


@payments_router.post("/checkout")
async def create_checkout(body: CheckoutBody, request: Request):
    """Create a subscription-mode Stripe Checkout Session for the plan."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable, STRIPE_API_KEY not set")
    stripe.api_key = api_key
    price_id = _price_for_plan(body.plan)

    # Checkout requires a signed-in account. Both the web and mobile signup
    # flows create the account first, then start checkout, so the caller is
    # always authenticated here. This prevents anonymous session creation.
    user = await _require_user(request)

    metadata = {
        "kind": "wayly_subscription",
        "plan": body.plan,
    }
    customer_email = None
    if user:
        metadata["user_id"] = user.get("id") or ""
        metadata["user_email"] = user.get("email") or ""
        customer_email = user.get("email")

    origin = body.origin_url.rstrip("/")
    if body.app_return_url:
        # Native mobile: send Stripe back to a tiny backend page that
        # immediately deep-links into the app (which auto-closes the in-app
        # browser via openAuthSessionAsync). Carries status + session id.
        from urllib.parse import quote
        to_enc = quote(body.app_return_url, safe="")
        success_url = f"{origin}/api/payments/app-return?status=success&to={to_enc}&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{origin}/api/payments/app-return?status=cancel&to={to_enc}"
    else:
        success_url = f"{origin}/billing/success?session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{origin}/pricing?cancelled=1"

    session_kwargs = dict(
        mode="subscription",
        # Force card-only payments (auto-enables Apple Pay + Google Pay via
        # Stripe's wallet detection). Explicitly setting the list disables
        # any other method the Stripe dashboard may have on (Klarna,
        # Afterpay, Zip, etc.) — Wayly wants pure card checkout only.
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        metadata=metadata,
        subscription_data={
            "metadata": metadata,
            **({"trial_period_days": int(body.trial_days)} if body.trial_days and body.trial_days > 0 else {}),
        },
        allow_promotion_codes=True,
        billing_address_collection="auto",
        # Stripe Tax: Australian GST support. When Stripe Tax is enabled in
        # the dashboard AND the business has an Australian tax registration,
        # this flag causes Stripe to compute GST on the invoice at the
        # customer's tax rate (0% until registration flips on). Set
        # STRIPE_AUTOMATIC_TAX=0 in .env to hard-disable if needed.
        automatic_tax={"enabled": os.environ.get("STRIPE_AUTOMATIC_TAX", "1").lower() not in ("0", "false", "no")},
    )
    if customer_email:
        session_kwargs["customer_email"] = customer_email
    if body.promo_code:
        # promo_code overrides allow_promotion_codes when set
        session_kwargs["discounts"] = [{"promotion_code": body.promo_code}]
        session_kwargs.pop("allow_promotion_codes", None)

    try:
        session = stripe.checkout.Session.create(**session_kwargs)
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("Stripe checkout create failed: %s", e)
        raise HTTPException(status_code=502, detail=str(getattr(e, "user_message", None) or e))

    if _db is not None:
        try:
            await _db.payment_transactions.insert_one({
                "session_id": session.id,
                "user_id": (user or {}).get("id"),
                "plan": body.plan,
                "price_id": price_id,
                "mode": "subscription",
                "status": "initiated",
                "metadata": metadata,
            })
        except Exception as e:  # pragma: no cover
            logger.warning("payment_transactions log failed: %s", e)

    return {"url": session.url, "session_id": session.id}


@payments_router.get("/checkout/status/{session_id}")
async def checkout_status(session_id: str, request: Request):
    """Poll a Stripe checkout session by ID. Used by the success page."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    try:
        session = stripe.checkout.Session.retrieve(session_id, expand=["subscription"])
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        raise HTTPException(status_code=404, detail=str(e))

    sub_obj = session.subscription if isinstance(session.subscription, dict) else None
    sub_id = (sub_obj or {}).get("id") if sub_obj else getattr(session.subscription, "id", None)

    # Reconcile immediately on return. Webhooks are the source of truth, but
    # on preview/dev the test-mode webhook endpoint may not be pointed here,
    # so when Stripe confirms the session is complete we sync the user's plan
    # and trial/subscription state so the billing screen reflects reality
    # without waiting on (or requiring) webhook delivery. Idempotent.
    if _db is not None and session.status == "complete" and sub_id:
        meta = session.metadata or {}
        user_id = meta.get("user_id")
        plan = meta.get("plan")
        try:
            sub = stripe.Subscription.retrieve(sub_id)
            set_fields = {
                "stripe_customer_id": session.customer,
                "stripe_subscription_id": sub_id,
                "subscription_status": sub.get("status"),
                "current_period_end": _sub_period_end(sub),
                "cancel_at_period_end": sub.get("cancel_at_period_end"),
                "trial_ends_at": sub.get("trial_end"),
            }
            if plan:
                set_fields["plan"] = plan
            query = {"id": user_id} if user_id else {"stripe_customer_id": session.customer}
            await _db.users.update_one(query, {"$set": set_fields})

            # GET /api/billing/subscription reads the db.subscriptions
            # collection (ISO dates), so mirror the state there too, matching
            # the canonical doc shape used elsewhere in the app.
            import uuid as _uuid
            from datetime import datetime as _dt, timezone as _tz

            def _iso(ep):
                return _dt.fromtimestamp(ep, tz=_tz.utc).isoformat() if ep else None

            if user_id:
                now_iso = _dt.now(_tz.utc).isoformat()
                await _db.subscriptions.update_one(
                    {"user_id": user_id},
                    {
                        "$set": {
                            "user_id": user_id,
                            "plan": plan,
                            "status": sub.get("status"),
                            "had_trial": True,
                            "trial_ends_at": _iso(sub.get("trial_end")),
                            "current_period_end": _iso(_sub_period_end(sub)),
                            "cancel_at_period_end": sub.get("cancel_at_period_end"),
                            "stripe_subscription_id": sub_id,
                            "stripe_customer_id": session.customer,
                            "stripe_session_id": session.id,
                            "updated_at": now_iso,
                        },
                        "$setOnInsert": {"id": str(_uuid.uuid4()), "created_at": now_iso},
                    },
                    upsert=True,
                )
        except Exception as e:  # pragma: no cover
            logger.warning("checkout_status reconcile failed: %s", e)

    return {
        "session_id": session.id,
        "payment_status": session.payment_status,
        "status": session.status,
        "subscription_id": sub_id,
        "customer_email": session.customer_details.email if session.customer_details else None,
        "plan": (session.metadata or {}).get("plan"),
    }


@payments_router.get("/app-return", response_class=HTMLResponse)
async def app_return(to: str, status: str = "success", session_id: Optional[str] = None):
    """Bounce page for the native mobile checkout flow. Stripe redirects the
    in-app browser here after payment; this page immediately deep-links back
    into the app (which auto-closes the browser and resumes onboarding). A
    manual button is shown as a fallback if the auto-redirect is blocked."""
    sep = "&" if ("?" in to) else "?"
    target = f"{to}{sep}status={status}"
    if session_id:
        target += f"&session_id={session_id}"
    safe_target = target.replace("\\", "").replace('"', "%22")
    html = (
        "<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'>"
        "<title>Returning to Wayly…</title>"
        f"<meta http-equiv='refresh' content='0;url={safe_target}'>"
        "<style>body{font-family:-apple-system,system-ui,sans-serif;background:#FBF8F3;color:#0E2A47;"
        "display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center;margin:0}"
        "a{display:inline-block;margin-top:16px;background:#0E2A47;color:#fff;padding:12px 22px;border-radius:999px;"
        "text-decoration:none;font-weight:600}</style></head>"
        "<body><div><p>Payment received. Returning you to the Wayly app…</p>"
        f"<a href='{safe_target}'>Return to Wayly</a></div>"
        f"<script>window.location.replace(\"{safe_target}\");</script></body></html>"
    )
    return HTMLResponse(content=html)


class PortalBody(BaseModel):
    origin_url: Optional[str] = None
    return_url: Optional[str] = None


@payments_router.post("/portal")
async def create_portal_session(body: PortalBody, request: Request):
    """Create a Stripe billing portal session so the user can manage their
    card, add a backup, download invoices, or cancel from Stripe's hosted
    portal. Wayly never touches raw PAN. Requires an active Stripe customer
    (stripe_customer_id on the user record)."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    customer_id = user.get("stripe_customer_id")
    if not customer_id and _db is not None:
        u = await _db.users.find_one({"id": user.get("id")})
        customer_id = (u or {}).get("stripe_customer_id")
    if not customer_id:
        raise HTTPException(status_code=400, detail="No Stripe customer on record. Start a subscription first.")
    try:
        base = (body.origin_url or body.return_url or "").rstrip("/")
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{base}/settings/billing" if base else None,
        )
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("Stripe portal create failed: %s", e)
        raise HTTPException(status_code=502, detail=str(getattr(e, "user_message", None) or e))
    return {"url": session.url}


@payments_router.get("/invoices")
async def list_invoices(request: Request):
    """Return the logged-in user's Stripe invoice history for the Billing
    History table. Falls back to an empty list if no Stripe customer exists
    yet (pre-trial signups). Never raises to keep the settings page useful.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        return {"invoices": []}
    stripe.api_key = api_key
    user = await _require_user(request)
    customer_id = user.get("stripe_customer_id")
    if not customer_id and _db is not None:
        u = await _db.users.find_one({"id": user.get("id")})
        customer_id = (u or {}).get("stripe_customer_id")
    if not customer_id:
        return {"invoices": []}
    try:
        result = stripe.Invoice.list(customer=customer_id, limit=50)
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("Stripe invoice list failed: %s", e)
        return {"invoices": []}
    out = []
    for inv in getattr(result, "data", []) or []:
        # Pick the first line description if there's one, otherwise fall back
        # to the invoice description or a static label.
        desc = None
        try:
            lines = getattr(inv, "lines", None)
            if lines and getattr(lines, "data", None):
                desc = getattr(lines.data[0], "description", None)
        except Exception:
            desc = None
        out.append({
            "id": inv.id,
            "created": inv.created,
            "description": desc or inv.description or "Subscription",
            "amount_paid": inv.amount_paid,
            "amount_due": inv.amount_due,
            "currency": (inv.currency or "aud").upper(),
            "status": inv.status,
            "invoice_pdf": inv.invoice_pdf,
            "hosted_invoice_url": inv.hosted_invoice_url,
        })
    return {"invoices": out}


@payments_router.post("/cancel-subscription")
async def cancel_subscription(request: Request):
    """Cancel the user's active subscription at period end. BILLING-UI-1 v5 §4.5
    — one click, no retention interstitial. Access continues to the current
    period end, then subscription ends cleanly."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    sub_id = user.get("stripe_subscription_id")
    if not sub_id and _db is not None:
        u = await _db.users.find_one({"id": user.get("id")})
        sub_id = (u or {}).get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="No active subscription on record.")
    try:
        sub = stripe.Subscription.modify(sub_id, cancel_at_period_end=True)
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("Stripe cancel failed: %s", e)
        raise HTTPException(status_code=502, detail=str(getattr(e, "user_message", None) or e))
    if _db is not None:
        await _db.users.update_one(
            {"id": user.get("id")},
            {"$set": {"cancel_at_period_end": True, "current_period_end": sub.current_period_end}},
        )
    return {"ok": True, "cancel_at_period_end": True, "current_period_end": sub.current_period_end}


@payments_router.post("/reactivate-subscription")
async def reactivate_subscription(request: Request):
    """Undo a scheduled cancellation before it fires."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    sub_id = user.get("stripe_subscription_id")
    if not sub_id and _db is not None:
        u = await _db.users.find_one({"id": user.get("id")})
        sub_id = (u or {}).get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="No active subscription on record.")
    try:
        sub = stripe.Subscription.modify(sub_id, cancel_at_period_end=False)
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("Stripe reactivate failed: %s", e)
        raise HTTPException(status_code=502, detail=str(getattr(e, "user_message", None) or e))
    if _db is not None:
        await _db.users.update_one(
            {"id": user.get("id")},
            {"$set": {"cancel_at_period_end": False, "current_period_end": sub.current_period_end}},
        )
    return {"ok": True, "cancel_at_period_end": False, "current_period_end": sub.current_period_end}


class DowngradeBody(BaseModel):
    plan: str = Field(pattern="^(solo|family)$")


@payments_router.post("/schedule-downgrade")
async def schedule_downgrade(body: DowngradeBody, request: Request):
    """Schedule a plan downgrade for the END of the current period (no refund /
    credit) via a Stripe Subscription Schedule. Access stays on the current
    plan until then; db.subscriptions carries pending_plan + pending_effective
    so the UI can show a 'changes on <date>' note."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    sub_id = user.get("stripe_subscription_id")
    if not sub_id and _db is not None:
        u = await _db.users.find_one({"id": user.get("id")})
        sub_id = (u or {}).get("stripe_subscription_id")
    if not sub_id:
        raise HTTPException(status_code=400, detail="No active subscription on record.")
    target_price = _price_for_plan(body.plan)
    try:
        sub = stripe.Subscription.retrieve(sub_id)
        if _plan_from_sub(sub) == body.plan:
            raise HTTPException(status_code=400, detail=f"Already on the {body.plan} plan.")
        cpe = _sub_period_end(sub)
        cps = _sub_period_start(sub)
        current_item = (sub.get("items") or {}).get("data", [])[0]
        current_price = current_item["price"]["id"]
        rec = current_item["price"].get("recurring") or {}
        duration = {"interval": rec.get("interval", "day"), "interval_count": rec.get("interval_count", 14)}
        sched_id = sub.get("schedule")
        created_new = not sched_id
        schedule = (
            stripe.SubscriptionSchedule.retrieve(sched_id)
            if sched_id
            else stripe.SubscriptionSchedule.create(from_subscription=sub_id)
        )
        # Phase 0 = keep the current price for one more billing cycle (its own
        # recurring duration; Stripe 2025-08 removed `iterations`), then phase 1
        # switches to the lower plan. Released to a normal sub afterwards.
        # `start_date` is REQUIRED on phase 0 when using `duration` so Stripe
        # can anchor phase 1's start (basil 2025-08-27+). We use the current
        # subscription period start to preserve billing cadence.
        phase0 = {"items": [{"price": current_price, "quantity": 1}], "duration": duration}
        if cps:
            phase0["start_date"] = cps
        try:
            schedule = stripe.SubscriptionSchedule.modify(
                schedule.id,
                end_behavior="release",
                phases=[
                    phase0,
                    {"items": [{"price": target_price, "quantity": 1}]},
                ],
            )
        except stripe.error.StripeError:  # type: ignore[attr-defined]
            if created_new:
                try:
                    stripe.SubscriptionSchedule.release(schedule.id)
                except Exception:
                    pass
            raise
    except HTTPException:
        raise
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("schedule-downgrade failed: %s", e)
        raise HTTPException(status_code=502, detail=str(getattr(e, "user_message", None) or e))
    effective = _epoch_iso(cpe)
    if _db is not None:
        from datetime import datetime, timezone
        await _db.subscriptions.update_one(
            {"user_id": user.get("id")},
            {"$set": {
                "pending_plan": body.plan,
                "pending_effective": effective,
                "schedule_id": schedule.id,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
    date_str = effective.split("T")[0] if effective else "the end of your current period"
    return {"ok": True, "pending_plan": body.plan, "effective": effective,
            "message": f"Your plan changes to {body.plan.capitalize()} on {date_str}."}


@payments_router.post("/cancel-scheduled-change")
async def cancel_scheduled_change(request: Request):
    """Release a pending scheduled downgrade so the current plan simply renews."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    user = await _require_user(request)
    sub_doc = await _db.subscriptions.find_one({"user_id": user.get("id")}) if _db is not None else None
    sched_id = (sub_doc or {}).get("schedule_id")
    if not sched_id:
        raise HTTPException(status_code=400, detail="No scheduled change to cancel.")
    try:
        stripe.SubscriptionSchedule.release(sched_id)
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        raise HTTPException(status_code=502, detail=str(getattr(e, "user_message", None) or e))
    if _db is not None:
        await _db.subscriptions.update_one(
            {"user_id": user.get("id")},
            {"$unset": {"pending_plan": "", "pending_effective": "", "schedule_id": ""}},
        )
    return {"ok": True, "cancelled": True}


@payments_router.post("/register-webhook")
async def register_webhook(request: Request):
    """Idempotently point the Stripe test-mode webhook at THIS deployment so
    trials/renewals/downgrades sync automatically (no reliance on the
    return-reconcile). Returns the signing secret on first creation so it can
    be written to STRIPE_WEBHOOK_SECRET."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable")
    stripe.api_key = api_key
    await _require_user(request)
    body = await request.json()
    base = (body.get("base_url") or "").rstrip("/")
    if not base:
        raise HTTPException(status_code=400, detail="base_url required")
    url = f"{base}/api/webhook/stripe"
    events = [
        "checkout.session.completed", "customer.subscription.created",
        "customer.subscription.updated", "customer.subscription.deleted",
        "customer.subscription.trial_will_end", "invoice.paid",
        "invoice.payment_failed", "invoice.upcoming",
    ]
    try:
        existing = stripe.WebhookEndpoint.list(limit=100)
        match = next((e for e in existing.get("data", []) if e.get("url") == url), None)
        if match:
            we = stripe.WebhookEndpoint.modify(match["id"], enabled_events=events, disabled=False)
            return {"ok": True, "id": we.get("id"), "url": url, "created": False,
                    "note": "Existing endpoint updated; secret unchanged."}
        we = stripe.WebhookEndpoint.create(url=url, enabled_events=events)
        return {"ok": True, "id": we.get("id"), "url": url, "created": True, "secret": we.get("secret")}
    except stripe.error.StripeError as e:  # type: ignore[attr-defined]
        logger.warning("register-webhook failed: %s", e)
        raise HTTPException(status_code=502, detail=f"register failed: {e}")


# The Stripe webhook lives OUTSIDE the /payments prefix at /api/webhook/stripe
# per STRIPE-CONFIG-1 v4 §5. We register it via a separate router so the URL
# matches exactly what's configured in the Stripe dashboard.
stripe_webhook_router = APIRouter(prefix="/webhook", tags=["stripe-webhook"])


@stripe_webhook_router.post("/stripe")
async def stripe_webhook(request: Request):
    """Verify Stripe signature and dispatch subscription lifecycle events.

    STRIPE-CONFIG-1 v4 §6: idempotent processing keyed on event.id, plus
    handlers for the events that actually mutate application state or need
    to trigger the single trial-end reminder email (the only reminder we
    send per user policy — no fortnightly pre-charge reminders).

    Handled event types:
      * checkout.session.completed
      * customer.subscription.{created,updated,deleted,trial_will_end}
      * invoice.{paid,payment_failed,upcoming}

    Everything else is acked but ignored so we don't 400 on unsupported
    types.
    """
    api_key = os.environ.get("STRIPE_API_KEY")
    secret = os.environ.get("STRIPE_WEBHOOK_SECRET")
    if not api_key or not secret:
        raise HTTPException(status_code=503, detail="Stripe webhook not configured")
    stripe.api_key = api_key

    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, secret)
    except stripe.error.SignatureVerificationError:  # type: ignore[attr-defined]
        raise HTTPException(status_code=400, detail="invalid signature")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"invalid payload: {e}")

    etype = event.get("type") or ""
    obj = (event.get("data") or {}).get("object") or {}
    event_id = event.get("id")

    # Idempotency guard: if we've already fully processed this event, ack
    # and return without re-applying. Stripe retries safely (§7 of the spec).
    if _db is not None and event_id:
        prior = await _db.stripe_webhook_events.find_one({"id": event_id})
        if prior and prior.get("processed_at"):
            return {"received": True, "type": etype, "duplicate": True}
        # Upsert the raw event row so retries hit the guard above.
        try:
            await _db.stripe_webhook_events.update_one(
                {"id": event_id},
                {"$set": {
                    "id": event_id,
                    "type": etype,
                    "created": event.get("created"),
                    "livemode": event.get("livemode"),
                    "object_id": obj.get("id"),
                    "customer_id": obj.get("customer"),
                    "subscription_id": obj.get("subscription") if isinstance(obj.get("subscription"), str) else (obj.get("subscription") or {}).get("id"),
                }},
                upsert=True,
            )
        except Exception as e:  # pragma: no cover
            logger.warning("stripe_webhook_events log failed: %s", e)

    try:
        if etype == "checkout.session.completed":
            meta = obj.get("metadata") or {}
            user_id = meta.get("user_id")
            plan = meta.get("plan")
            sub_id = obj.get("subscription")
            customer_id = obj.get("customer")
            if _db is not None and user_id and sub_id:
                await _db.users.update_one(
                    {"id": user_id},
                    {"$set": {
                        "plan": plan,
                        "stripe_customer_id": customer_id,
                        "stripe_subscription_id": sub_id,
                        "subscription_status": "active",
                    }},
                )
                await _db.payment_transactions.update_one(
                    {"session_id": obj.get("id")},
                    {"$set": {"status": "completed", "subscription_id": sub_id, "customer_id": customer_id}},
                )
                # Keep the db.subscriptions read-model in sync (single source
                # of truth for GET /api/billing/subscription).
                try:
                    full = stripe.Subscription.retrieve(sub_id)
                    await _upsert_sub_doc(user_id, full, plan=plan, extra={"stripe_session_id": obj.get("id")})
                except Exception as e:  # pragma: no cover
                    logger.warning("webhook checkout upsert sub doc failed: %s", e)
        elif etype in ("customer.subscription.updated", "customer.subscription.created"):
            if _db is not None:
                await _db.users.update_one(
                    {"stripe_subscription_id": obj.get("id")},
                    {"$set": {
                        "subscription_status": obj.get("status"),
                        "current_period_end": obj.get("current_period_end"),
                        "cancel_at_period_end": obj.get("cancel_at_period_end"),
                        "trial_ends_at": obj.get("trial_end"),
                    }},
                )
                # Reflect status + any plan change (e.g. a scheduled downgrade
                # swapping the base price at period end) into the read-model.
                uid = await _user_id_for_sub(obj.get("id"), obj.get("customer"))
                plan = _plan_from_sub(obj)
                if uid:
                    await _upsert_sub_doc(uid, obj, plan=plan)
                    if plan:
                        await _db.users.update_one({"id": uid}, {"$set": {"plan": plan}})
        elif etype == "customer.subscription.deleted":
            if _db is not None:
                await _db.users.update_one(
                    {"stripe_subscription_id": obj.get("id")},
                    {"$set": {"subscription_status": "canceled", "plan": "free"}},
                )
                uid = await _user_id_for_sub(obj.get("id"), obj.get("customer"))
                if uid:
                    from datetime import datetime, timezone
                    await _db.subscriptions.update_one(
                        {"user_id": uid},
                        {"$set": {"status": "canceled", "plan": "free", "cancel_at_period_end": True,
                                  "updated_at": datetime.now(timezone.utc).isoformat()}},
                    )
        elif etype == "customer.subscription.trial_will_end":
            # ONLY reminder email we ever send (user policy: no other
            # reminders, no fortnightly pre-charge nags). Stripe fires this
            # event exactly 3 days before the trial converts.
            await _send_trial_end_reminder(obj)
        elif etype == "invoice.paid":
            # Confirm access — the subscription is paid up. Nothing to email,
            # Stripe already sends a receipt automatically (Settings → Emails
            # in Stripe Dashboard) if that's turned on; Wayly does not add
            # its own.
            if _db is not None:
                await _db.users.update_one(
                    {"stripe_customer_id": obj.get("customer")},
                    {"$set": {"subscription_status": "active"}},
                )
        elif etype == "invoice.upcoming":
            # Signal that a charge is coming. No email — per user policy.
            # We record it so the reconciliation job can audit.
            pass
        elif etype == "invoice.payment_failed":
            if _db is not None:
                await _db.users.update_one(
                    {"stripe_customer_id": obj.get("customer")},
                    {"$set": {"subscription_status": "past_due"}},
                )
    except Exception as e:  # pragma: no cover
        logger.warning("stripe_webhook dispatch failed for %s: %s", etype, e)

    if _db is not None and event_id:
        try:
            from datetime import datetime, timezone
            await _db.stripe_webhook_events.update_one(
                {"id": event_id},
                {"$set": {"processed_at": datetime.now(timezone.utc)}},
            )
        except Exception:
            pass

    return {"received": True, "type": etype}


async def _send_trial_end_reminder(sub_obj: dict) -> None:
    """Send the ONE trial-end reminder email 3 days before conversion.

    Fires on Stripe's `customer.subscription.trial_will_end` webhook. Per
    user policy this is the ONLY reminder email Wayly ever sends; there is
    no fortnightly pre-charge reminder, no post-charge receipt from Wayly
    (Stripe sends its own receipts if enabled), no upgrade nudge.

    Idempotent by design: the outer webhook handler guards against
    duplicate delivery of the same Stripe event.
    """
    if _db is None:
        return
    sub_id = sub_obj.get("id")
    customer_id = sub_obj.get("customer")
    trial_end = sub_obj.get("trial_end")
    if not customer_id:
        return
    user = await _db.users.find_one({"stripe_customer_id": customer_id})
    if not user or not user.get("email"):
        logger.warning("trial_will_end: no user for customer=%s", customer_id)
        return
    # Best-effort: derive the plan label + fortnightly amount from the sub
    # items. Falls back to the user's plan if the subscription payload does
    # not include it.
    plan = (user.get("plan") or "").lower()
    plan_label = {"solo": "Solo", "family": "Family"}.get(plan, "Wayly")
    fortnight_amount = {"solo": "$24.50", "family": "$49.50"}.get(plan, "")
    from datetime import datetime, timezone, timedelta
    trial_end_dt = None
    if trial_end:
        try:
            trial_end_dt = datetime.fromtimestamp(int(trial_end), tz=timezone.utc)
        except Exception:
            trial_end_dt = None
    when_readable = trial_end_dt.strftime("%A, %d %B %Y") if trial_end_dt else "in 3 days"
    # Compose + send. Wraps email service in try/except so a delivery
    # failure doesn't kill the webhook (Stripe would retry).
    try:
        from wayly_email_branding import format_au_date  # noqa: F401
    except Exception:
        pass
    try:
        # Reuse the existing email service if available.
        import importlib
        server_mod = importlib.import_module("server")
        email_service = getattr(server_mod, "email_service", None)
        if email_service is None:
            logger.warning("trial_will_end: email_service missing on server module")
            return
        cancel_link = "https://wayly.com.au/settings/billing"
        subject = f"Heads up: your Wayly trial ends in 3 days"
        body_html = (
            f"<p>Hi {user.get('name') or ''},</p>"
            f"<p>Just a heads up: your <strong>7 day free trial of Wayly {plan_label}</strong> ends on "
            f"<strong>{when_readable}</strong>.</p>"
            f"<p>When your trial ends, your first fortnightly charge of <strong>{fortnight_amount} including GST</strong> "
            f"will run automatically. From there, we bill every 14 days.</p>"
            f"<p>If Wayly is not for you, cancel any time before then and you will not be charged. "
            f"One click, no retention scripts: "
            f"<a href='{cancel_link}'>{cancel_link}</a>.</p>"
            f"<p>Otherwise, do nothing and your subscription continues.</p>"
            f"<p>Thanks,<br />The Wayly team</p>"
        )
        await email_service.email_tool_result(
            to=user["email"],
            tool_name=subject,
            headline=f"Your trial ends {when_readable}",
            body_html=body_html,
        )
        # Audit the send so we can prove we only ever fire this once per
        # subscription (Stripe should only ever fire the event once too).
        await _db.trial_end_reminders.update_one(
            {"subscription_id": sub_id},
            {"$set": {
                "subscription_id": sub_id,
                "customer_id": customer_id,
                "user_id": user.get("id"),
                "email": user.get("email"),
                "trial_end": trial_end,
                "sent_at": datetime.now(timezone.utc).isoformat(),
            }},
            upsert=True,
        )
    except Exception as e:  # pragma: no cover
        logger.warning("trial_will_end email failed: %s", e)
