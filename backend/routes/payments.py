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


@payments_router.post("/checkout")
async def create_checkout(body: CheckoutBody, request: Request):
    """Create a subscription-mode Stripe Checkout Session for the plan."""
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Billing unavailable, STRIPE_API_KEY not set")
    stripe.api_key = api_key
    price_id = _price_for_plan(body.plan)

    # Try to associate this checkout with the current user if they are
    # logged in. Guests can still start checkout; we will link the session
    # via metadata + webhook on completion.
    user = None
    try:
        user = await _user_dep(request)
    except Exception:
        user = None

    metadata = {
        "kind": "wayly_subscription",
        "plan": body.plan,
    }
    customer_email = None
    if user:
        metadata["user_id"] = user.get("id") or ""
        metadata["user_email"] = user.get("email") or ""
        customer_email = user.get("email")

    session_kwargs = dict(
        mode="subscription",
        # Force card-only payments (auto-enables Apple Pay + Google Pay via
        # Stripe's wallet detection). Explicitly setting the list disables
        # any other method the Stripe dashboard may have on (Klarna,
        # Afterpay, Zip, etc.) — Wayly wants pure card checkout only.
        payment_method_types=["card"],
        line_items=[{"price": price_id, "quantity": 1}],
        success_url=f"{body.origin_url.rstrip('/')}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        cancel_url=f"{body.origin_url.rstrip('/')}/pricing?cancelled=1",
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
    return {
        "session_id": session.id,
        "payment_status": session.payment_status,
        "status": session.status,
        "subscription_id": (session.subscription or {}).get("id") if isinstance(session.subscription, dict) else getattr(session.subscription, "id", None),
        "customer_email": session.customer_details.email if session.customer_details else None,
        "plan": (session.metadata or {}).get("plan"),
    }


class PortalBody(BaseModel):
    origin_url: str


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
        session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{body.origin_url.rstrip('/')}/settings/billing",
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
        elif etype == "customer.subscription.deleted":
            if _db is not None:
                await _db.users.update_one(
                    {"stripe_subscription_id": obj.get("id")},
                    {"$set": {"subscription_status": "canceled", "plan": "free"}},
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
