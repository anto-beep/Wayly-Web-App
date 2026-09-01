"""One-off: drive a real Stripe TEST-mode subscription (7-day trial, card
4242 via pm_card_visa) for the mobpay demo users so the app shows a genuine
paid/trial billing screen. Safe to re-run (idempotent per user)."""
import os
import stripe
from datetime import datetime, timezone
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv("/app/backend/.env")
stripe.api_key = os.environ["STRIPE_API_KEY"]
DB = os.environ["DB_NAME"].strip('"')
client = MongoClient(os.environ["MONGO_URL"])
db = client[DB]

TARGETS = [
    ("mobpay.family@example.com", os.environ["STRIPE_PRICE_ID_FAMILY"], "family"),
    ("mobpay.solo@example.com", os.environ["STRIPE_PRICE_ID_SOLO"], "solo"),
]

for email, price_id, plan in TARGETS:
    u = db.users.find_one({"email": email})
    if not u:
        print(f"SKIP {email}: no user")
        continue
    # customer
    cust_id = u.get("stripe_customer_id")
    if not cust_id:
        cust = stripe.Customer.create(email=email, name=u.get("name") or email,
                                      address={"country": "AU", "postal_code": "3000",
                                               "line1": "1 Test St", "city": "Melbourne", "state": "VIC"})
        cust_id = cust.id
    # attach test card + set default
    try:
        pm = stripe.PaymentMethod.attach("pm_card_visa", customer=cust_id)
        stripe.Customer.modify(cust_id, invoice_settings={"default_payment_method": pm.id})
    except stripe.error.StripeError as e:
        print(f"  PM attach note ({email}): {e}")
    # subscription with 7-day trial
    sub = stripe.Subscription.create(
        customer=cust_id,
        items=[{"price": price_id, "quantity": 1}],
        trial_period_days=7,
        metadata={"kind": "wayly_subscription", "plan": plan, "user_id": u["id"], "user_email": email},
    )
    db.users.update_one({"id": u["id"]}, {"$set": {
        "plan": plan,
        "stripe_customer_id": cust_id,
        "stripe_subscription_id": sub.id,
        "subscription_status": sub.status,  # trialing
        "trial_ends_at": sub.trial_end,
        "current_period_end": sub.current_period_end,
        "cancel_at_period_end": False,
    }})
    print(f"OK {email}: sub={sub.id} status={sub.status} trial_end={sub.trial_end} cust={cust_id}")

print("done")
