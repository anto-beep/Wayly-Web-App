"""
One-off Stripe TEST-mode volume seeder for Wayly.

Creates N customers who each:
  * sign up (metadata signup_source = web|mobile, 50/50)
  * subscribe to a plan (70% solo @ $24.50, 30% family @ $49.50, AUD fortnightly)
  * move PAST the free trial into an active paid plan (subscription charges cycle 1)
  * are billed for `CYCLES` fortnights total (cycles 2..N as explicit charges)

Each successful charge adds to Stripe Gross Volume. Runs concurrently with
rate-limit backoff and idempotency keys so retries never double-charge.

Config via env:
  STRIPE_SEED_KEY   (required) test secret key
  TOTAL             total customers               (default 10000)
  CYCLES            fortnight charges per customer (default 4)
  SOLO_RATIO        fraction on solo plan          (default 0.7)
  CONCURRENCY       worker threads                 (default 16)
  START             seq to start at (resume)       (default 0)
  RUN_ID            tag for this batch             (default ts)
  LOG_FILE          progress log path              (default /tmp/seed_stripe.log)
"""
import os
import sys
import time
import random
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import stripe
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

stripe.api_key = os.environ["STRIPE_SEED_KEY"]
stripe.max_network_retries = 2
# Enlarge the HTTP connection pool so many worker threads don't contend.
try:
    _pool = int(os.environ.get("CONCURRENCY", "16")) + 8
    stripe.default_http_client = stripe.http_client.RequestsClient(pool_maxsize=_pool)  # type: ignore[attr-defined]
except Exception:
    pass

TOTAL = int(os.environ.get("TOTAL", "10000"))
CYCLES = int(os.environ.get("CYCLES", "4"))
SOLO_RATIO = float(os.environ.get("SOLO_RATIO", "0.7"))
CONCURRENCY = int(os.environ.get("CONCURRENCY", "16"))
START = int(os.environ.get("START", "0"))
RUN_ID = os.environ.get("RUN_ID", time.strftime("%Y%m%d-%H%M%S"))
LOG_FILE = os.environ.get("LOG_FILE", "/tmp/seed_stripe.log")

SOLO_PRICE = os.environ["STRIPE_PRICE_ID_SOLO"]
FAMILY_PRICE = os.environ["STRIPE_PRICE_ID_FAMILY"]
SOLO_AMOUNT = 2450   # cents AUD
FAMILY_AMOUNT = 4950
SOLO_COUNT = round(TOTAL * SOLO_RATIO)

_lock = threading.Lock()
_state = {"done": 0, "charges": 0, "gross_cents": 0, "failed": 0}


def _log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def _with_retry(fn, *args, **kwargs):
    """Call a Stripe create with exponential backoff on transient errors."""
    delay = 0.5
    attempts = 12
    for attempt in range(attempts):
        try:
            return fn(*args, **kwargs)
        except (stripe.error.RateLimitError, stripe.error.APIConnectionError, stripe.error.APIError) as e:  # type: ignore[attr-defined]
            if attempt == attempts - 1:
                raise
            time.sleep(delay + random.random() * 0.5)
            delay = min(delay * 1.8, 15)
    raise RuntimeError("unreachable")


def seed_one(seq):
    plan = "solo" if seq < SOLO_COUNT else "family"
    source = "web" if (seq % 2 == 0) else "mobile"
    amount = SOLO_AMOUNT if plan == "solo" else FAMILY_AMOUNT
    price = SOLO_PRICE if plan == "solo" else FAMILY_PRICE
    meta = {"seed_run": RUN_ID, "seq": str(seq), "signup_source": source, "plan": plan}

    # 1. Customer with a chargeable test card (default source).
    cust = _with_retry(
        stripe.Customer.create,
        email=f"seed.{RUN_ID}.{seq}@waylytest.com",
        name=f"Seed {plan.title()} #{seq}",
        source="tok_visa",
        metadata=meta,
        idempotency_key=f"{RUN_ID}-{seq}-cust",
    )

    # 2. Active paid subscription (no trial => cycle-1 invoice charges now).
    _with_retry(
        stripe.Subscription.create,
        customer=cust.id,
        items=[{"price": price}],
        metadata={**meta, "cycle": "1"},
        idempotency_key=f"{RUN_ID}-{seq}-sub",
    )
    charges = 1
    gross = amount

    # 3. Cycles 2..N as explicit fortnight charges on the same card.
    for k in range(2, CYCLES + 1):
        _with_retry(
            stripe.Charge.create,
            amount=amount,
            currency="aud",
            customer=cust.id,
            description=f"Wayly {plan} plan - fortnight {k}",
            metadata={**meta, "cycle": str(k)},
            idempotency_key=f"{RUN_ID}-{seq}-chg{k}",
        )
        charges += 1
        gross += amount

    return charges, gross


def worker(seq):
    try:
        charges, gross = seed_one(seq)
        with _lock:
            _state["done"] += 1
            _state["charges"] += charges
            _state["gross_cents"] += gross
            d = _state["done"]
        if d % 100 == 0 or d == (TOTAL - START):
            _log(f"progress {d}/{TOTAL - START} done | charges={_state['charges']} | gross=${_state['gross_cents']/100:,.2f} | failed={_state['failed']}")
    except Exception as e:  # noqa: BLE001
        with _lock:
            _state["failed"] += 1
        _log(f"FAIL seq={seq}: {str(e)[:180]}")


def main():
    _log(f"START run_id={RUN_ID} total={TOTAL} cycles={CYCLES} solo={SOLO_COUNT} family={TOTAL-SOLO_COUNT} concurrency={CONCURRENCY} start={START}")
    seqs = range(START, TOTAL)
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = [ex.submit(worker, s) for s in seqs]
        for _ in as_completed(futures):
            pass
    _log(f"DONE run_id={RUN_ID} | customers_ok={_state['done']} | failed={_state['failed']} | charges={_state['charges']} | GROSS=${_state['gross_cents']/100:,.2f} AUD")


if __name__ == "__main__":
    main()
