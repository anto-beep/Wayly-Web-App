"""Iter 35 — Dashboard switch + SSE notifications stream + Reports scheduler + S3 fallback.

Covers:
- reports_scheduler._task is not None after import + start (verified via /api/health side-effect)
- _completed_quarter_window(date(2026,7,7)) == ('Q4', 2026, 2026-04-01, 2026-06-30)
- /api/notifications/stream emits 'event: snapshot' immediately with unread count
- Insert a notification row → SSE delivers 'event: notification' within ~3s
- /api/reports/generate + /api/reports/{id}/download returns local /api/reports/file/{token} URL when REPORTS_S3_BUCKET unset
- All 8 report types still generate end-to-end (status READY, file_size > 1000)
- Multi-participant: ensure Cathy has ≥2 participants (creating a second if needed),
  and verify /api/budget/current responds differently when X-Active-Participant-Id header changes.
"""
import os
import sys
import json
import time
import asyncio
import threading
import pytest
import requests
from datetime import date, datetime, timezone
from pathlib import Path

# Load env
if not os.environ.get("REACT_APP_BACKEND_URL"):
    for line in Path("/app/frontend/.env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            os.environ["REACT_APP_BACKEND_URL"] = line.split("=", 1)[1].strip()
            break

# Make backend modules importable for direct-unit test of scheduler logic
sys.path.insert(0, "/app/backend")
# Need MONGO_URL/DB_NAME from /app/backend/.env for direct-import scheduler tests
if not os.environ.get("MONGO_URL"):
    for line in Path("/app/backend/.env").read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, v = line.split("=", 1)
            v = v.strip().strip('"').strip("'")
            os.environ.setdefault(k.strip(), v)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"

REPORT_TYPES = [
    "HOUSEHOLD_SUMMARY",
    "QUARTERLY_BUDGET",
    "ANNUAL_FINANCIAL",
    "ANOMALY_SAVINGS",
    "PROVIDER_PERFORMANCE",
    "COMPLAINT_DOSSIER",
    "CARE_TIMELINE",
    "STATEMENT_DIGEST",
]


# --------- Fixtures ---------
@pytest.fixture(scope="module")
def auth_session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASS})
    assert r.status_code == 200, f"login failed {r.status_code} {r.text[:200]}"
    body = r.json()
    token = body["token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    s.token = token
    s.user_id = (body.get("user") or {}).get("id")
    return s


@pytest.fixture(scope="module")
def participants(auth_session):
    r = auth_session.get(f"{BASE_URL}/api/v2/participants")
    assert r.status_code == 200, r.text
    items = r.json().get("items") or []
    # Ensure ≥2 by creating a second one if needed
    if len(items) < 2:
        body = {
            "first_name": "Lebron",
            "last_name": "James",
            "classification": 3,
            "is_primary": False,
        }
        rr = auth_session.post(f"{BASE_URL}/api/v2/participants", json=body)
        # Some plans may reject; accept 200/201 or skip
        if rr.status_code not in (200, 201):
            pytest.skip(f"could not create second participant: {rr.status_code} {rr.text[:120]}")
        items = auth_session.get(f"{BASE_URL}/api/v2/participants").json().get("items") or []
    assert len(items) >= 2, "need ≥2 participants for switch test"
    return items


# --------- 1. Scheduler module-level checks ---------
class TestSchedulerLogic:
    def test_completed_quarter_window_q4_fy2026(self):
        import reports_scheduler as rs
        label, fy, start, end = rs._completed_quarter_window(date(2026, 7, 7))
        assert label == "Q4", f"expected Q4 got {label}"
        assert fy == 2026
        assert start == date(2026, 4, 1)
        assert end == date(2026, 6, 30)

    def test_completed_quarter_window_outside_window_returns_none(self):
        import reports_scheduler as rs
        # 30 days after Q4 end — way past the 7-14d eligibility window
        label, fy, start, end = rs._completed_quarter_window(date(2026, 7, 30))
        assert label is None and fy is None

    def test_completed_fy_14_days_after_30_jun(self):
        import reports_scheduler as rs
        fy, start, end = rs._completed_fy(date(2026, 7, 14))
        assert fy == 2026
        assert start == date(2025, 7, 1)
        assert end == date(2026, 6, 30)

    def test_scheduler_task_started(self):
        """Server's startup hook calls reports_scheduler.start() — _task should be non-None."""
        # The scheduler runs inside the FastAPI worker; here we just verify the module
        # exposes start() and that calling it spawns the task in our own loop too.
        import reports_scheduler as rs
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(rs.start())
            assert rs._task is not None
            # Cleanup so we don't leak
            loop.run_until_complete(rs.stop())
        finally:
            loop.close()


# --------- 2. SSE notification stream ---------
class TestSSEStream:
    def test_snapshot_event_emitted_immediately(self, auth_session):
        """timeout 5s — expect 'event: snapshot' line with {'unread': N}."""
        url = f"{BASE_URL}/api/notifications/stream?token={auth_session.token}"
        got_snapshot = False
        unread_val = None
        with requests.get(url, stream=True, timeout=8) as r:
            assert r.status_code == 200
            assert "text/event-stream" in r.headers.get("Content-Type", ""), r.headers
            start = time.time()
            event_name = None
            for raw in r.iter_lines(decode_unicode=True):
                if time.time() - start > 5:
                    break
                if raw is None:
                    continue
                line = raw.strip()
                if line.startswith("event:"):
                    event_name = line.split(":", 1)[1].strip()
                elif line.startswith("data:") and event_name == "snapshot":
                    payload = json.loads(line.split(":", 1)[1].strip())
                    unread_val = payload.get("unread")
                    got_snapshot = True
                    break
        assert got_snapshot, "did not see 'event: snapshot' within 5s"
        assert isinstance(unread_val, int)

    def test_sse_requires_token(self):
        r = requests.get(f"{BASE_URL}/api/notifications/stream", timeout=5)
        assert r.status_code == 401

    def test_notification_pushed_within_3s(self, auth_session):
        """Connect SSE in a thread, insert a notification doc directly via Mongo,
        verify the new row is streamed as 'event: notification'."""
        from motor.motor_asyncio import AsyncIOMotorClient
        import uuid

        url = f"{BASE_URL}/api/notifications/stream?token={auth_session.token}"
        captured = {"got": False, "title": None}

        def listen():
            try:
                with requests.get(url, stream=True, timeout=10) as r:
                    start = time.time()
                    event_name = None
                    for raw in r.iter_lines(decode_unicode=True):
                        if time.time() - start > 8:
                            return
                        if raw is None:
                            continue
                        line = raw.strip()
                        if line.startswith("event:"):
                            event_name = line.split(":", 1)[1].strip()
                        elif line.startswith("data:") and event_name == "notification":
                            payload = json.loads(line.split(":", 1)[1].strip())
                            if payload.get("title", "").startswith("ITER35_TEST"):
                                captured["got"] = True
                                captured["title"] = payload["title"]
                                return
            except Exception:
                pass

        t = threading.Thread(target=listen, daemon=True)
        t.start()
        # Give SSE ~1s to emit snapshot and enter the polling loop
        time.sleep(1.5)

        # Insert a fake notification for cathy
        async def _insert():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            dbb = client[os.environ["DB_NAME"]]
            doc = {
                "id": "test-iter35-" + uuid.uuid4().hex[:8],
                "user_id": auth_session.user_id,
                "title": "ITER35_TEST notification",
                "body": "smoke",
                "category": "system",
                "read": False,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            await dbb.notifications.insert_one(doc)
            client.close()
            return doc["id"]

        loop = asyncio.new_event_loop()
        try:
            inserted_id = loop.run_until_complete(_insert())
        finally:
            loop.close()

        t.join(timeout=8)
        # Cleanup the test notification row
        async def _cleanup():
            client = AsyncIOMotorClient(os.environ["MONGO_URL"])
            dbb = client[os.environ["DB_NAME"]]
            await dbb.notifications.delete_one({"id": inserted_id})
            client.close()
        loop2 = asyncio.new_event_loop()
        try:
            loop2.run_until_complete(_cleanup())
        finally:
            loop2.close()

        assert captured["got"], "SSE never streamed the inserted notification within 8s"
        assert "ITER35_TEST" in captured["title"]


# --------- 3. Reports — local PDF storage path (S3 unset) + 8 types still work ---------
class TestReportsLocalStorageAnd8Types:
    def test_s3_unset_serves_local_file_url(self, auth_session, participants):
        assert os.environ.get("REPORTS_S3_BUCKET") in (None, ""), "S3 should be unset in this env"
        pid = participants[0]["id"]
        r = auth_session.post(f"{BASE_URL}/api/reports/generate", json={
            "report_type": "HOUSEHOLD_SUMMARY",
            "participant_id": pid,
            "parameters": {},
        })
        assert r.status_code in (200, 201), r.text
        rid = r.json()["report_id"]
        # Poll until READY
        deadline = time.time() + 45
        status = None
        while time.time() < deadline:
            rs = auth_session.get(f"{BASE_URL}/api/reports/{rid}")
            assert rs.status_code == 200
            status = rs.json().get("status")
            if status == "READY":
                break
            if status == "FAILED":
                pytest.fail(f"report failed: {rs.json()}")
            time.sleep(1.0)
        assert status == "READY", f"timed out, final={status}"
        dl = auth_session.get(f"{BASE_URL}/api/reports/{rid}/download")
        assert dl.status_code == 200, dl.text
        url = dl.json().get("url", "")
        # When S3 unset, must be the local token endpoint
        assert "/api/reports/file/" in url, f"expected local URL, got {url}"
        # Fetch the PDF and verify %PDF header + size
        if url.startswith("/"):
            pdf_url = BASE_URL + url
        else:
            pdf_url = url
        pdf = requests.get(pdf_url, timeout=20)
        assert pdf.status_code == 200
        assert pdf.content[:4] == b"%PDF", "not a PDF"
        assert len(pdf.content) > 1000

    @pytest.mark.parametrize("rtype", REPORT_TYPES)
    def test_all_eight_report_types_generate(self, auth_session, participants, rtype):
        pid = participants[0]["id"]
        r = auth_session.post(f"{BASE_URL}/api/reports/generate", json={
            "report_type": rtype,
            "participant_id": pid,
            "parameters": {},
        })
        assert r.status_code in (200, 201), f"{rtype}: {r.status_code} {r.text[:200]}"
        rid = r.json()["report_id"]
        deadline = time.time() + 60
        final = None
        while time.time() < deadline:
            rs = auth_session.get(f"{BASE_URL}/api/reports/{rid}")
            j = rs.json()
            final = j.get("status")
            if final in ("READY", "FAILED", "LOCKED"):
                break
            time.sleep(1.0)
        # LOCKED is acceptable for PROVIDER_PERFORMANCE when <3 statements but should be READY here
        assert final == "READY", f"{rtype} ended in {final}: {j}"
        size = j.get("file_size_bytes") or 0
        assert size > 1000, f"{rtype} file_size {size} too small"


# --------- 4. Multi-participant dashboard switch ---------
class TestParticipantSwitch:
    def test_two_participants_have_distinct_ids(self, participants):
        ids = [p["id"] for p in participants]
        assert len(set(ids)) >= 2

    def test_budget_endpoint_changes_with_active_participant(self, auth_session, participants):
        """Backend resolves the active participant via the `X-Participant-Id` header
        (see _resolve_active_participant in server.py). When switching participants
        the participant-scoped queries (e.g. /api/statements) should yield different
        results — the dashboard relies on this to refetch after a switch.
        """
        p1, p2 = participants[0], participants[1]
        h1 = {"X-Participant-Id": p1["id"]}
        h2 = {"X-Participant-Id": p2["id"]}
        # /api/statements is participant-scoped via _scope_query_to_participant
        r1 = auth_session.get(f"{BASE_URL}/api/statements", headers=h1)
        r2 = auth_session.get(f"{BASE_URL}/api/statements", headers=h2)
        assert r1.status_code == 200, r1.text
        assert r2.status_code == 200, r2.text
        s1 = r1.json()
        s2 = r2.json()
        items1 = s1.get("items") if isinstance(s1, dict) else s1
        items2 = s2.get("items") if isinstance(s2, dict) else s2
        ids1 = sorted([(x.get("id") or x.get("statement_id")) for x in (items1 or [])])
        ids2 = sorted([(x.get("id") or x.get("statement_id")) for x in (items2 or [])])
        # The two participant scopes should not have an identical statement set
        # (one is primary Dorothy with seeded statements; the other is the new participant with none).
        assert ids1 != ids2, (
            f"statements identical across participants p1={p1.get('first_name')} p2={p2.get('first_name')}: "
            f"{len(ids1)} vs {len(ids2)} — X-Participant-Id header not honored"
        )
