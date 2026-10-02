"""Phase 4 — Security-specific monitoring tests.

Verifies the in-process alerter:
  • Records and fires the 5 rule types correctly
  • Cooldown prevents duplicate alert rows
  • Resolve flow writes back the resolved fields
  • PII keys never leak into the persisted row (subjects for emails are hashed)
"""
from __future__ import annotations
import os
import pytest
import pytest_asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")

import security_alerter as al

pytestmark = pytest.mark.asyncio


@pytest_asyncio.fixture
async def db():
    """Fresh Mongo client + isolated test DB per test (event-loop safe)."""
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    test_db = client[os.environ["DB_NAME"] + "_test_phase4"]
    await test_db.security_event_counters.delete_many({})
    await test_db.security_alerts.delete_many({})
    yield test_db
    await test_db.security_event_counters.delete_many({})
    await test_db.security_alerts.delete_many({})
    client.close()


async def test_login_failure_per_ip_fires_at_threshold(db):
    for i in range(20):
        await al.record_login_failure(db, ip="1.2.3.4", email=f"u{i}@x.com")
    alerts = await al.list_alerts(db, limit=10)
    assert all(a["rule"] != "LOGIN_FAILURE_PER_IP" for a in alerts)
    await al.record_login_failure(db, ip="1.2.3.4", email="u20@x.com")
    alerts = await al.list_alerts(db, limit=10)
    ip_alerts = [a for a in alerts if a["rule"] == "LOGIN_FAILURE_PER_IP"]
    assert len(ip_alerts) == 1
    assert ip_alerts[0]["severity"] == "HIGH"
    assert ip_alerts[0]["subject"] == "1.2.3.4"
    assert ip_alerts[0]["count"] >= 21


async def test_login_failure_per_email_hash_fires(db):
    for _ in range(51):
        await al.record_login_failure(db, ip=None, email="victim@example.com")
    alerts = await al.list_alerts(db, limit=10)
    email_alerts = [a for a in alerts if a["rule"] == "LOGIN_FAILURE_PER_EMAIL_HASH"]
    assert len(email_alerts) == 1
    # PII safety: the subject is a hash, NOT the raw email.
    assert email_alerts[0]["subject"] != "victim@example.com"
    assert "victim" not in email_alerts[0]["subject"]
    assert "@" not in email_alerts[0]["subject"]
    # Hashes are 16 chars per our truncation
    assert len(email_alerts[0]["subject"]) == 16


async def test_malware_upload_fires_critical_immediately(db):
    await al.record_malware_upload(
        db, user_id="user-1", filename="evil.pdf", scan_result="infected",
    )
    alerts = await al.list_alerts(db, limit=10)
    crit = [a for a in alerts if a["rule"] == "MALWARE_UPLOAD"]
    assert len(crit) == 1
    assert crit[0]["severity"] == "CRITICAL"
    assert crit[0]["filename"] == "evil.pdf"


async def test_admin_action_spike_fires(db):
    for i in range(31):
        await al.record_admin_action(db, admin_id="admin-7", action_type=f"act_{i}")
    alerts = await al.list_alerts(db, limit=10)
    spikes = [a for a in alerts if a["rule"] == "ADMIN_ACTION_SPIKE"]
    assert len(spikes) == 1
    assert spikes[0]["severity"] == "CRITICAL"
    assert spikes[0]["subject"] == "admin-7"


async def test_participant_scrape_uses_distinct_count(db):
    # Same participant_id 60 times → must NOT fire (1 distinct).
    for _ in range(60):
        await al.record_participant_access(db, user_id="usr-1", participant_id="p-fixed")
    alerts = await al.list_alerts(db, limit=10)
    assert all(a["rule"] != "PARTICIPANT_SCRAPE" for a in alerts), \
        "should NOT fire on repeats of same pid"
    # 51 distinct participants → MUST fire.
    for i in range(51):
        await al.record_participant_access(db, user_id="usr-2", participant_id=f"p-{i}")
    alerts = await al.list_alerts(db, limit=10)
    scrape = [a for a in alerts if a["rule"] == "PARTICIPANT_SCRAPE"]
    assert len(scrape) == 1
    assert scrape[0]["subject"] == "usr-2"
    assert scrape[0]["count"] >= 51


async def test_cooldown_prevents_duplicate_alerts(db):
    # Fire LOGIN_FAILURE_PER_IP twice — should still only have one row open.
    for _ in range(21):
        await al.record_login_failure(db, ip="9.9.9.9", email=None)
    await al.record_login_failure(db, ip="9.9.9.9", email=None)
    await al.record_login_failure(db, ip="9.9.9.9", email=None)
    alerts = await al.list_alerts(db, limit=10)
    ip_alerts = [a for a in alerts if a["rule"] == "LOGIN_FAILURE_PER_IP"]
    assert len(ip_alerts) == 1, f"expected 1 alert, got {len(ip_alerts)}"


async def test_resolve_flow(db):
    for _ in range(21):
        await al.record_login_failure(db, ip="5.5.5.5", email=None)
    alerts = await al.list_alerts(db, limit=10)
    target = alerts[0]
    assert target["resolved"] is False
    ok = await al.resolve_alert(db, alert_id=target["id"], admin_id="admin-test",
                                 note="false positive — internal QA")
    assert ok is True
    alerts2 = await al.list_alerts(db, limit=10)
    resolved = next(a for a in alerts2 if a["id"] == target["id"])
    assert resolved["resolved"] is True
    assert resolved["resolved_by"] == "admin-test"
    assert resolved["resolution_note"] == "false positive — internal QA"

    stats = await al.alert_stats(db)
    assert stats["open"] == 0


async def test_stats_aggregate_correctly(db):
    # 1 CRITICAL + 1 HIGH
    await al.record_malware_upload(db, user_id="u", filename="x.pdf", scan_result="infected")
    for _ in range(21):
        await al.record_login_failure(db, ip="6.6.6.6", email=None)
    stats = await al.alert_stats(db)
    assert stats["open"] == 2
    assert stats["critical_open"] == 1
    assert stats["last_24h"] == 2
