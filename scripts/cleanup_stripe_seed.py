"""
Delete all TEST-mode customers created by seed_stripe_volume.py.

Selects customers by metadata.seed_run == RUN_ID and deletes them (which also
cancels their subscriptions). Past charges cannot be deleted in Stripe, so
historical Gross Volume is unaffected; only customers + subscriptions go away.

Config via env:
  STRIPE_SEED_KEY  (required) test secret key
  RUN_ID           seed_run tag to purge (required)
  CONCURRENCY      worker threads (default 16)
  LOG_FILE         progress log (default /root/cleanup_stripe.log)
"""
import os
import time
import random
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed

import stripe

stripe.api_key = os.environ["STRIPE_SEED_KEY"]
stripe.max_network_retries = 2
try:
    _pool = int(os.environ.get("CONCURRENCY", "16")) + 8
    stripe.default_http_client = stripe.http_client.RequestsClient(pool_maxsize=_pool)  # type: ignore[attr-defined]
except Exception:
    pass

RUN_ID = os.environ["RUN_ID"]
CONCURRENCY = int(os.environ.get("CONCURRENCY", "16"))
LOG_FILE = os.environ.get("LOG_FILE", "/root/cleanup_stripe.log")

_lock = threading.Lock()
_state = {"deleted": 0, "failed": 0}


def _log(msg):
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(LOG_FILE, "a") as f:
        f.write(line + "\n")


def _delete(cid):
    delay = 0.5
    for attempt in range(10):
        try:
            stripe.Customer.delete(cid)
            return True
        except stripe.error.InvalidRequestError:  # already deleted / missing
            return True
        except (stripe.error.RateLimitError, stripe.error.APIConnectionError, stripe.error.APIError):  # type: ignore[attr-defined]
            if attempt == 9:
                return False
            time.sleep(delay + random.random() * 0.5)
            delay = min(delay * 1.8, 15)
    return False


def worker(cid):
    ok = _delete(cid)
    with _lock:
        if ok:
            _state["deleted"] += 1
        else:
            _state["failed"] += 1
        n = _state["deleted"] + _state["failed"]
    if n % 200 == 0:
        _log(f"progress deleted={_state['deleted']} failed={_state['failed']}")


def main():
    _log(f"START cleanup run_id={RUN_ID} concurrency={CONCURRENCY}")
    # Collect all matching customer ids first (paginate the full list).
    ids = []
    for c in stripe.Customer.list(limit=100).auto_paging_iter():
        if (c.metadata or {}).get("seed_run") == RUN_ID:
            ids.append(c.id)
    _log(f"matched {len(ids)} seeded customers to delete")
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as ex:
        futures = [ex.submit(worker, cid) for cid in ids]
        for _ in as_completed(futures):
            pass
    _log(f"DONE cleanup run_id={RUN_ID} | deleted={_state['deleted']} | failed={_state['failed']} | matched={len(ids)}")


if __name__ == "__main__":
    main()
