"""Phase 2 — behaviour-based lifecycle emails + central marketing frequency.

Validates, with NO real sends and WITHOUT touching any real/shared records:

  * marketing_frequency.can_send_now caps: 72h gap, 2/7d, 4/30d, 1-per-trial,
    and fail-closed when the email-hash secret is unavailable.
  * lifecycle_emails gating (consent + verified + suppression + frequency +
    test_only mode) via the _send_lifecycle chokepoint.
  * process_lifecycle_once selection, first-use (mid-trial) gate, win-back
    convert gate, and idempotency markers.
  * exact mid-trial / win-back copy (so the deliverables report is test-backed).

Isolation: every test runs against a THROWAWAY database (DB_NAME + '_phase2t')
seeded only with synthetic accounts, and email_service.deliver is monkeypatched
to a no-op. The 40+ real subscriptions in the shared preview DB are never read
or mutated.
"""
from __future__ import annotations
import os
import uuid
import asyncio
from datetime import datetime, timezone, timedelta

import pytest
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

import email_service
from lib import email_governance as gov
from lib import marketing_frequency as mf
from lib import lifecycle_emails as lc

MONGO_URL = os.environ["MONGO_URL"]
TEST_DB_NAME = os.environ["DB_NAME"] + "_phase2t"


def _run(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
        # Leave a fresh, OPEN loop as the current one so other test modules
        # that call asyncio.get_event_loop() don't inherit this closed loop.
        asyncio.set_event_loop(asyncio.new_event_loop())


def _db():
    return AsyncIOMotorClient(MONGO_URL)[TEST_DB_NAME]


def _now():
    return datetime.now(timezone.utc)


def _iso(dt):
    return dt.isoformat()


async def _wipe(db):
    for c in ("users", "subscriptions", "marketing_sends", "email_suppressions",
              "statements", "invoices"):
        await db[c].delete_many({})


@pytest.fixture(autouse=True)
def _no_real_send(monkeypatch):
    """Guarantee no email ever leaves the box, regardless of RESEND state."""
    calls = []

    async def _fake(**kw):
        calls.append(kw)
        return {"ok": True, "id": "test_" + uuid.uuid4().hex[:6],
                "ambiguous": False, "mocked": True}

    monkeypatch.setattr(email_service, "deliver", _fake)
    return calls


@pytest.fixture(autouse=True)
def _clean_test_db():
    _run(_wipe(_db()))
    yield
    _run(_wipe(_db()))


async def _mk_user(db, email, *, consent=True, verified=True, name="Trial User"):
    uid = uuid.uuid4().hex
    await db.users.insert_one({
        "id": uid, "email": email, "name": name,
        "marketing_consent": consent, "email_verified": verified,
    })
    return uid


async def _mk_sub(db, uid, **fields):
    doc = {"id": uuid.uuid4().hex, "user_id": uid}
    doc.update(fields)
    await db.subscriptions.insert_one(doc)
    return doc["id"]


def _email():
    return f"lc_{uuid.uuid4().hex[:12]}@example.com"


# =====================================================================
# marketing_frequency.can_send_now
# =====================================================================
def test_fresh_recipient_can_send():
    async def body():
        db = _db()
        ok, reason = await mf.can_send_now(db, _email())
        assert ok is True and reason == "ok"
    _run(body())


def test_min_gap_72h_blocks():
    async def body():
        db = _db()
        em = _email()
        await db.marketing_sends.insert_one({
            "id": uuid.uuid4().hex, "email_hash": gov.email_hash(em),
            "category": "lifecycle", "kind": "x",
            "sent_at": _iso(_now() - timedelta(hours=10))})
        ok, reason = await mf.can_send_now(db, em)
        assert ok is False and reason == "min_gap_72h"
    _run(body())


def test_cap_7d_blocks():
    async def body():
        db = _db()
        em = _email()
        eh = gov.email_hash(em)
        # Two sends inside 7d but both > 72h old (so min-gap passes first).
        for days in (4, 6):
            await db.marketing_sends.insert_one({
                "id": uuid.uuid4().hex, "email_hash": eh, "category": "lifecycle",
                "kind": "x", "sent_at": _iso(_now() - timedelta(days=days))})
        ok, reason = await mf.can_send_now(db, em)
        assert ok is False and reason == "cap_7d"
    _run(body())


def test_cap_30d_blocks():
    async def body():
        db = _db()
        em = _email()
        eh = gov.email_hash(em)
        # Four sends: all > 7d (so 7d count = 0) but inside 30d.
        for days in (8, 12, 16, 20):
            await db.marketing_sends.insert_one({
                "id": uuid.uuid4().hex, "email_hash": eh, "category": "lifecycle",
                "kind": "x", "sent_at": _iso(_now() - timedelta(days=days))})
        ok, reason = await mf.can_send_now(db, em)
        assert ok is False and reason == "cap_30d"
    _run(body())


def test_trial_optional_quota_blocks():
    async def body():
        db = _db()
        em = _email()
        uid = await _mk_user(db, em)
        # Trial ending in 1 day → trial_start = now - 6d. One marketing send 4d
        # ago sits inside the trial window AND is > 72h old, isolating the
        # trial-quota branch from the 72h / rolling caps.
        await _mk_sub(db, uid, status="trialing",
                      trial_ends_at=_iso(_now() + timedelta(days=1)))
        await db.marketing_sends.insert_one({
            "id": uuid.uuid4().hex, "email_hash": gov.email_hash(em),
            "category": "lifecycle", "kind": "x",
            "sent_at": _iso(_now() - timedelta(days=4))})
        ok, reason = await mf.can_send_now(db, em)
        assert ok is False and reason == "trial_quota"
    _run(body())


def test_hash_unavailable_fails_closed(monkeypatch):
    monkeypatch.setenv("EMAIL_HASH_SECRET", "short")  # < 16 chars → unavailable

    async def body():
        db = _db()
        ok, reason = await mf.can_send_now(db, _email())
        assert ok is False and reason == "hash_unavailable"
    _run(body())


def test_record_send_appends_ledger():
    async def body():
        db = _db()
        em = _email()
        await mf.record_send(db, em, category="lifecycle", kind="trial_midtrial")
        n = await db.marketing_sends.count_documents(
            {"email_hash": gov.email_hash(em)})
        assert n == 1
    _run(body())


# =====================================================================
# lifecycle_emails._send_lifecycle gate (isolated to one synthetic user)
# =====================================================================
async def _send_once(db, uid, now=None):
    user = await db.users.find_one({"id": uid}, {"_id": 0})
    html, text = lc._midtrial_content("Jo", "https://x")
    return await lc._send_lifecycle(
        db, user, kind="trial_midtrial", subject="S",
        html_inner=html, text_body=text, now=now or _now(), mode="test_only")


def test_gate_blocks_no_consent(_no_real_send):
    async def body():
        db = _db()
        uid = await _mk_user(db, _email(), consent=False, verified=True)
        ok, reason = await _send_once(db, uid)
        assert ok is False and reason == "no_consent"
        assert _no_real_send == []
    _run(body())


def test_gate_blocks_unverified(_no_real_send):
    async def body():
        db = _db()
        uid = await _mk_user(db, _email(), consent=True, verified=False)
        ok, reason = await _send_once(db, uid)
        assert ok is False and reason == "unverified_email"
        assert _no_real_send == []
    _run(body())


def test_gate_blocks_suppressed(_no_real_send):
    async def body():
        db = _db()
        em = _email()
        uid = await _mk_user(db, em, consent=True, verified=True)
        await gov.suppress(db, email=em, reason="unsubscribe", permanent=True)
        ok, reason = await _send_once(db, uid)
        assert ok is False and reason == "suppressed"
        assert _no_real_send == []
    _run(body())


def test_gate_blocks_non_test_account_in_test_only(_no_real_send):
    async def body():
        db = _db()
        uid = await _mk_user(db, f"real_{uuid.uuid4().hex[:8]}@gmail.com",
                             consent=True, verified=True)
        ok, reason = await _send_once(db, uid)
        assert ok is False and reason == "not_test_account"
        assert _no_real_send == []
    _run(body())


def test_gate_allows_and_records(_no_real_send):
    async def body():
        db = _db()
        em = _email()
        uid = await _mk_user(db, em, consent=True, verified=True)
        ok, reason = await _send_once(db, uid)
        assert ok is True and reason == "sent"
        assert len(_no_real_send) == 1
        sent = _no_real_send[0]
        assert sent["to"] == em
        assert sent["text"] and "List-Unsubscribe" in sent["headers"]
        assert sent["idempotency_key"] == f"lifecycle:trial_midtrial:{uid}"
        # Ledger recorded → a second immediate attempt is frequency-blocked.
        n = await db.marketing_sends.count_documents(
            {"email_hash": gov.email_hash(em)})
        assert n == 1
        ok2, reason2 = await _send_once(db, uid)
        assert ok2 is False and reason2 == "min_gap_72h"
    _run(body())


# =====================================================================
# process_lifecycle_once — selection, first-use, win-back, idempotency
# =====================================================================
def test_mode_off_does_nothing():
    async def body():
        db = _db()
        out = await lc.process_lifecycle_once(db, mode="off")
        assert out["midtrial_sent"] == 0 and out["postwin_sent"] == 0
    _run(body())


def test_midtrial_selected_and_sent(_no_real_send):
    async def body():
        db = _db()
        em = _email()
        uid = await _mk_user(db, em, consent=True, verified=True)
        # trial_ends_at in the [now+4d, now+5d] mid-trial window (td=7).
        await _mk_sub(db, uid, status="trialing",
                      trial_ends_at=_iso(_now() + timedelta(days=4, hours=12)))
        out = await lc.process_lifecycle_once(db, mode="test_only")
        assert out["midtrial_sent"] == 1
        assert len(_no_real_send) == 1
        sub = await db.subscriptions.find_one({"user_id": uid}, {"_id": 0})
        assert sub["lifecycle_midtrial_result"] == "sent"
        # Idempotent: a second pass sends nothing more.
        out2 = await lc.process_lifecycle_once(db, mode="test_only")
        assert out2["midtrial_sent"] == 0
        assert len(_no_real_send) == 1
    _run(body())


def test_midtrial_skips_progressing_user(_no_real_send):
    async def body():
        db = _db()
        em = _email()
        uid = await _mk_user(db, em, consent=True, verified=True)
        await _mk_sub(db, uid, status="trialing",
                      trial_ends_at=_iso(_now() + timedelta(days=4, hours=12)))
        # First-use gate: a processed statement = progressing → send NOTHING.
        await db.statements.insert_one(
            {"id": uuid.uuid4().hex, "user_id": uid, "processed": True})
        out = await lc.process_lifecycle_once(db, mode="test_only")
        assert out["midtrial_sent"] == 0 and out["midtrial_skipped"] == 1
        assert _no_real_send == []
        sub = await db.subscriptions.find_one({"user_id": uid}, {"_id": 0})
        assert sub["lifecycle_midtrial_result"] == "skipped_progressing"
    _run(body())


def test_postwin_selected_and_sent(_no_real_send):
    async def body():
        db = _db()
        em = _email()
        uid = await _mk_user(db, em, consent=True, verified=True)
        # Expired, had a trial, ended > 7 days ago, not converted.
        await _mk_sub(db, uid, status="expired", had_trial=True,
                      trial_ends_at=_iso(_now() - timedelta(days=10)))
        out = await lc.process_lifecycle_once(db, mode="test_only")
        assert out["postwin_sent"] == 1
        assert len(_no_real_send) == 1
        sub = await db.subscriptions.find_one(
            {"user_id": uid, "status": "expired"}, {"_id": 0})
        assert sub["lifecycle_postwin_result"] == "sent"
    _run(body())


def test_postwin_skips_converted_user(_no_real_send):
    async def body():
        db = _db()
        em = _email()
        uid = await _mk_user(db, em, consent=True, verified=True)
        await _mk_sub(db, uid, status="expired", had_trial=True,
                      trial_ends_at=_iso(_now() - timedelta(days=10)))
        # They came back: an active subscription exists → no win-back.
        await _mk_sub(db, uid, status="active")
        out = await lc.process_lifecycle_once(db, mode="test_only")
        assert out["postwin_sent"] == 0 and out["postwin_skipped"] == 1
        assert _no_real_send == []
    _run(body())


def test_postwin_skips_recent_trial_end(_no_real_send):
    async def body():
        db = _db()
        uid = await _mk_user(db, _email(), consent=True, verified=True)
        # Ended only 2 days ago → outside the >=7d win-back window.
        await _mk_sub(db, uid, status="expired", had_trial=True,
                      trial_ends_at=_iso(_now() - timedelta(days=2)))
        out = await lc.process_lifecycle_once(db, mode="test_only")
        assert out["postwin_sent"] == 0
        assert _no_real_send == []
    _run(body())


# =====================================================================
# exact email copy (snapshot for the deliverables report)
# =====================================================================
def test_midtrial_copy_snapshot():
    html, text = lc._midtrial_content("Margaret", "https://wayly.com.au")
    assert "here's the quickest way to see Wayly work" in html
    assert "Statement Decoder" in html and "Statement Decoder" in text
    assert "https://wayly.com.au/ai-tools/statement-decoder" in text
    assert "Information only, not advice" in html


def test_postwin_copy_snapshot():
    html, text = lc._postwin_content("Margaret", "https://wayly.com.au")
    assert "Still here whenever aged care gets confusing" in html
    assert "trial has wrapped up" in html and "trial has wrapped up" in text
    assert "https://wayly.com.au/pricing" in text
