"""One-shot seeder for the Wayly consumer Stripe catalogue.

Creates (or reuses via lookup keys) the six products/prices required by
STRIPE-CONFIG-1 v4 §3. Consumer prices only — adviser catalogue is out of
scope per BILLING-TEST-EXECUTION-1 v1.

Products created (lookup keys are permanent, never rotated):
  * solo_fortnightly                                   $24.50 / 14d
  * family_fortnightly                                 $49.50 / 14d
  * family_additional_participant_fortnightly          $24.50 / 14d

All prices:
  * currency = aud
  * tax_behavior = inclusive
  * recurring.interval = day, interval_count = 14

Idempotent: if a lookup_key already exists it is skipped. Safe to re-run.

Run: STRIPE_API_KEY=sk_test_... python3 backend/scripts/seed_stripe_catalogue.py
"""
from __future__ import annotations

import os
import sys

import stripe


CATALOGUE = [
    {
        "product_name": "Wayly Solo",
        "product_description": "Wayly Solo, one participant, one caregiver seat.",
        "lookup_key": "solo_fortnightly",
        "unit_amount": 2450,
        "nickname": "Wayly Solo - Fortnightly",
    },
    {
        "product_name": "Wayly Family",
        "product_description": "Wayly Family, two participants, three caregiver seats.",
        "lookup_key": "family_fortnightly",
        "unit_amount": 4950,
        "nickname": "Wayly Family - Fortnightly",
    },
    {
        "product_name": "Wayly Family - Additional Participant",
        "product_description": "Additional participant on the Wayly Family plan.",
        "lookup_key": "family_additional_participant_fortnightly",
        "unit_amount": 2450,
        "nickname": "Wayly Family Additional Participant - Fortnightly",
    },
]


def _find_price(lookup_key: str):
    resp = stripe.Price.list(lookup_keys=[lookup_key], active=True, limit=1)
    data = getattr(resp, "data", None) or []
    return data[0] if data else None


def _find_product(name: str, wayly_only: bool = True):
    """Find an active product by exact name. If `wayly_only`, require
    metadata `wayly_catalogue=consumer` to avoid partial-name collisions
    (e.g. 'Wayly Family' vs 'Wayly Family - Additional Participant')."""
    query = f"name:'{name}' AND active:'true'"
    if wayly_only:
        query += " AND metadata['wayly_catalogue']:'consumer'"
    try:
        resp = stripe.Product.search(query=query, limit=5)
    except Exception:
        return None
    for p in getattr(resp, "data", None) or []:
        if p.name == name:
            return p
    return None


def main() -> int:
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        print("STRIPE_API_KEY not set")
        return 2
    stripe.api_key = api_key
    print(f"Seeding Wayly catalogue against Stripe mode: "
          f"{'live' if api_key.startswith('sk_live') else 'test'}")

    for item in CATALOGUE:
        lk = item["lookup_key"]
        existing = _find_price(lk)
        if existing:
            print(f"  [skip] {lk}: already exists as {existing.id} "
                  f"(unit_amount={existing.unit_amount})")
            continue

        product = _find_product(item["product_name"])
        if not product:
            product = stripe.Product.create(
                name=item["product_name"],
                description=item["product_description"],
                metadata={"wayly_catalogue": "consumer"},
            )
            print(f"  [prod] created product {product.id} ({item['product_name']})")
        else:
            print(f"  [prod] reusing product {product.id} ({item['product_name']})")

        price = stripe.Price.create(
            product=product.id,
            unit_amount=item["unit_amount"],
            currency="aud",
            recurring={"interval": "day", "interval_count": 14},
            tax_behavior="inclusive",
            lookup_key=lk,
            nickname=item["nickname"],
            transfer_lookup_key=True,
            metadata={"wayly_catalogue": "consumer"},
        )
        print(f"  [price] created price {price.id} lookup_key={lk} "
              f"amount=${item['unit_amount']/100:.2f}/14d")

    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
