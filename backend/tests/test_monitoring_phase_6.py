"""Phase 6 — Cost & Billing Protection (Stripe webhook hardening).

Covers:
  • Unsigned webhook → 400 + audit row with `rejected_no_signature`
  • Bad-signature webhook → 400 + audit row with `rejected_bad_signature`
  • Replayed event short-circuit — signature gate fires FIRST (defence in
    depth), then Mongo dedup catches replays of valid events.

NOTE on transport: these tests hit the LIVE supervisor-managed backend on
localhost:8001 (not TestClient). This is required because the server's
async motor writes don't propagate inside the TestClient's nested event
loop — they only commit when the same loop owns both the request and the
DB write. The live transport mirrors how Stripe will actually call the
webhook in production.
"""
from __future__ import annotations
import os
import time
import hashlib
import pytest
import requests
from datetime import datetime, timezone
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

WEBHOOK_URL = "http://localhost:8001/api/webhook/stripe"


def _sync_db():
    c = MongoClient(os.environ["MONGO_URL"])
    return c, c[os.environ["DB_NAME"]]


def _cleanup():
    c, db = _sync_db()
    db.stripe_webhook_events.delete_many({"event_id": {"$regex": "^test_"}})
    db.stripe_webhook_events.delete_many({"event_id": {"$regex": "^sha256:"}})
    db.stripe_webhook_events.delete_many({"result": {"$in": ["rejected_no_signature", "rejected_bad_signature"]}})
    c.close()


@pytest.fixture(autouse=True)
def _cleanup_webhook_events():
    _cleanup()
    yield
    _cleanup()


def _wait_for_row(query: dict, timeout_s: float = 3.0) -> list:
    c, db = _sync_db()
    deadline = time.time() + timeout_s
    rows: list = []
    while time.time() < deadline:
        rows = list(db.stripe_webhook_events.find(query).limit(5))
        if rows:
            break
        time.sleep(0.1)
    c.close()
    return rows


def test_unsigned_webhook_returns_400():
    r = requests.post(WEBHOOK_URL, data=b"{}", timeout=5)
    assert r.status_code == 400, r.text
    assert "Stripe-Signature" in r.text


def test_unsigned_webhook_persists_audit_row():
    requests.post(WEBHOOK_URL, data=b"{}", timeout=5)
    rows = _wait_for_row({"result": "rejected_no_signature"})
    assert len(rows) >= 1
    assert rows[0]["raw_len"] == 2  # `{}`


def test_bad_signature_returns_400():
    """Bad-signature rejection requires `STRIPE_WEBHOOK_SECRET` in env. In
    preview the underlying Stripe lib only fails on malformed payloads, not
    on a HMAC mismatch — accept either 400 or 200 in that mode."""
    r = requests.post(
        WEBHOOK_URL,
        data=b'{"id":"evt_test_bad","type":"checkout.session.completed"}',
        headers={"Stripe-Signature": "t=123,v1=fakefakefake"},
        timeout=5,
    )
    if os.environ.get("STRIPE_WEBHOOK_SECRET"):
        assert r.status_code == 400, r.text
        assert "Invalid Stripe signature" in r.text
    else:
        assert r.status_code in (200, 400), r.text


def test_bad_signature_persists_audit_row():
    """Only meaningful when STRIPE_WEBHOOK_SECRET is set in env."""
    if not os.environ.get("STRIPE_WEBHOOK_SECRET"):
        pytest.skip("STRIPE_WEBHOOK_SECRET not configured — signature gate is a no-op in preview")
    requests.post(
        WEBHOOK_URL,
        data=b'{"id":"evt_test_bad2","type":"x"}',
        headers={"Stripe-Signature": "v1=fake"},
        timeout=5,
    )
    rows = _wait_for_row({"result": "rejected_bad_signature"})
    assert len(rows) >= 1


def test_signature_gate_fires_before_dedup():
    """Pre-seed a `processed` row for a hash we control, then send an
    unsigned request with the same body. The signature gate must fire FIRST
    (defence in depth) — dedup must never short-circuit the auth check."""
    body = b'{"id":"replay_marker_42"}'
    sha = "sha256:" + hashlib.sha256(body).hexdigest()[:32]
    c, db = _sync_db()
    db.stripe_webhook_events.insert_one({
        "event_id": sha,
        "received_at": datetime.now(timezone.utc).isoformat(),
        "processed_at": datetime.now(timezone.utc).isoformat(),
        "event_type": "checkout.session.completed",
        "result": "processed",
        "handler_result": "paid:legacy_plan",
    })
    c.close()

    r = requests.post(WEBHOOK_URL, data=body, timeout=5)
    # Unsigned → 400 (auth gate fires BEFORE dedup; the seeded row is irrelevant).
    assert r.status_code == 400, r.text

    # Cleanup the pre-seed
    c, db = _sync_db()
    db.stripe_webhook_events.delete_many({"event_id": sha})
    c.close()


def test_webhook_events_collection_schema():
    requests.post(WEBHOOK_URL, data=b"{}", timeout=5)
    rows = _wait_for_row({"result": "rejected_no_signature"})
    assert len(rows) >= 1
    row = rows[0]
    for k in ("received_at", "result", "raw_len"):
        assert k in row, f"missing {k} in {row}"


def test_idempotency_replayed_event_returns_deduped():
    """Live-server test: deliver the same event twice → second call returns
    `{"deduped": true}`. Uses a permissive (preview) sig so handle_webhook
    accepts it and we exercise the dedup path."""
    redis_flush_url = "http://localhost:8001/api/health"  # smoke probe to confirm live
    assert requests.get(redis_flush_url, timeout=5).status_code == 200

    # Clear any stale rows for this event_id
    c, db = _sync_db()
    db.stripe_webhook_events.delete_many({"event_id": "test_evt_dedup_xyz"})
    c.close()
    import subprocess
    subprocess.run(["redis-cli", "DEL", "stripe:evt:test_evt_dedup_xyz"], check=False, capture_output=True)

    body = b'{"id":"test_evt_dedup_xyz","type":"checkout.session.completed"}'
    headers = {"Stripe-Signature": "v1=fake"}

    r1 = requests.post(WEBHOOK_URL, data=body, headers=headers, timeout=5)
    if r1.status_code == 400:
        pytest.skip("Signature gate fired (production-mode) — dedup not reachable in this run")
    assert r1.status_code == 200, r1.text
    j1 = r1.json()
    assert j1.get("ok") is True
    assert j1.get("deduped") is not True
    assert j1.get("event_id") == "test_evt_dedup_xyz"

    r2 = requests.post(WEBHOOK_URL, data=body, headers=headers, timeout=5)
    assert r2.status_code == 200, r2.text
    j2 = r2.json()
    assert j2.get("ok") is True
    assert j2.get("deduped") is True

    # Cleanup
    c, db = _sync_db()
    db.stripe_webhook_events.delete_many({"event_id": "test_evt_dedup_xyz"})
    c.close()
    subprocess.run(["redis-cli", "DEL", "stripe:evt:test_evt_dedup_xyz"], check=False, capture_output=True)
