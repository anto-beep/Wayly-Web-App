"""
Iter 126 — Batch integration tests for SDL-1, FC-2, SD-3 (spec-closure Round 3).

Runs against the live REACT_APP_BACKEND_URL. Uses caregiver cathy@example.com
(participant Dorothy 0c538637-b0dd-4982-8f78-b32814c6a5eb).
"""
import os
import uuid
from datetime import datetime, timedelta

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"
DOROTHY_ID = "0c538637-b0dd-4982-8f78-b32814c6a5eb"
STMT_WITH_ANOMALIES = "408fcbf3-c126-4897-a9b1-c76628c49ca7"


@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(f"{API}/auth/login",
                      json={"email": CATHY_EMAIL, "password": CATHY_PASS}, timeout=60)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    body = r.json()
    tok = body.get("access_token") or body.get("token")
    assert tok, f"no token in login body: {body}"
    return tok


@pytest.fixture(scope="module")
def h(token) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------------------------------------------------------------------------
# SDL-1 Attendance Log
# ---------------------------------------------------------------------------

def _expected(days_ago: int = 1, provider: str = "TEST_iter126_Provider") -> dict:
    start = (datetime.utcnow() - timedelta(days=days_ago)).replace(microsecond=0).isoformat()
    end = (datetime.utcnow() - timedelta(days=days_ago) + timedelta(hours=1)).replace(microsecond=0).isoformat()
    return {
        "service_type": "personal_care",
        "provider_name": provider,
        "expected_worker_name": "TEST_iter126 Worker",
        "expected_start_datetime": start,
        "expected_end_datetime": end,
        "expected_duration_minutes": 60,
    }


class TestSDL1:
    def test_create_and_list(self, h):
        r = requests.post(f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records",
                          headers=h, json={"expected": _expected()})
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["confirmation_status"] == "unconfirmed"
        assert rec["evidentiary_quality"] == "unconfirmed"
        pytest.sdl1_rec_id = rec["id"]

        # list
        lr = requests.get(f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records", headers=h)
        assert lr.status_code == 200
        ids = [x["id"] for x in lr.json()["records"]]
        assert rec["id"] in ids

    def test_list_filter_status(self, h):
        r = requests.get(f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records",
                         headers=h, params={"status": "unconfirmed"})
        assert r.status_code == 200
        for rec in r.json()["records"]:
            assert rec["confirmation_status"] == "unconfirmed"

    def test_patch(self, h):
        rid = pytest.sdl1_rec_id
        r = requests.patch(f"{API}/sdl1/attendance-records/{rid}", headers=h,
                           json={"observed": {"actual_worker_name": "TEST_iter126 Actual"}})
        assert r.status_code == 200, r.text
        assert r.json()["record"]["observed"]["actual_worker_name"] == "TEST_iter126 Actual"

    def test_confirm_sets_evidentiary_quality(self, h):
        rid = pytest.sdl1_rec_id
        r = requests.post(f"{API}/sdl1/attendance-records/{rid}/confirm", headers=h,
                          json={"confirmation_status": "confirmed_as_expected"})
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["confirmation_status"] == "confirmed_as_expected"
        # evidentiary_quality should no longer be 'unconfirmed'
        assert rec["evidentiary_quality"] != "unconfirmed"

    def test_dispute_opens_case(self, h):
        # create a fresh record then dispute
        c = requests.post(f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records",
                          headers=h, json={"expected": _expected(days_ago=2, provider="TEST_iter126_ProviderX")})
        rid = c.json()["record"]["id"]
        r = requests.post(f"{API}/sdl1/attendance-records/{rid}/dispute", headers=h,
                          json={"dispute_reason": "worker_no_show",
                                "dispute_details": "TEST_iter126 dispute"})
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        assert rec["confirmation_status"] == "disputed"
        assert rec.get("case_id"), f"expected case_id, got {rec}"
        pytest.sdl1_disputed_id = rid
        pytest.sdl1_disputed_provider = "TEST_iter126_ProviderX"

    def test_reopen(self, h):
        rid = pytest.sdl1_disputed_id
        r = requests.post(f"{API}/sdl1/attendance-records/{rid}/reopen", headers=h,
                          json={"reopen_reason": "TEST_iter126 reopen"})
        assert r.status_code == 200, r.text
        assert r.json()["record"]["confirmation_status"] == "unconfirmed"

    def test_bulk_confirm(self, h):
        # create an unconfirmed record in past week
        requests.post(f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records",
                      headers=h, json={"expected": _expected(days_ago=3)})
        r = requests.post(
            f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records/bulk-confirm", headers=h)
        assert r.status_code == 200, r.text
        assert r.json()["confirmed"] >= 1

    def test_evidence_add_list_delete(self, h):
        rid = pytest.sdl1_rec_id
        add = requests.post(f"{API}/sdl1/attendance-records/{rid}/evidence", headers=h,
                            json={"attachment_type": "text_note",
                                  "text_content": "TEST_iter126 evidence note",
                                  "description": "notes"})
        assert add.status_code == 200, add.text
        eid = add.json()["evidence"]["id"]

        lst = requests.get(f"{API}/sdl1/attendance-records/{rid}/evidence", headers=h)
        assert lst.status_code == 200
        assert any(e["id"] == eid for e in lst.json()["evidence"])

        d = requests.delete(f"{API}/sdl1/evidence-attachments/{eid}", headers=h)
        assert d.status_code == 200

    def test_reconcile(self, h):
        r = requests.post(f"{API}/sdl1/participants/{DOROTHY_ID}/reconcile", headers=h, json={})
        assert r.status_code == 200, r.text
        body = r.json()
        ev = body.get("reconciliation") or body
        assert "matches_found" in ev
        assert any(k in ev for k in (
            "mismatches_billed_but_no_attendance",
            "mismatches_attendance_but_not_billed",
            "mismatches_billed_but_disputed",
        ))

    def test_pattern_detection_after_disputes(self, h):
        # create 2 disputed records for the same provider (already have 1 disputed above);
        # produce a 2nd dispute for same provider
        prov = pytest.sdl1_disputed_provider
        c = requests.post(f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records",
                          headers=h, json={"expected": _expected(days_ago=4, provider=prov)})
        rid = c.json()["record"]["id"]
        d = requests.post(f"{API}/sdl1/attendance-records/{rid}/dispute", headers=h,
                          json={"dispute_reason": "worker_no_show", "dispute_details": "TEST_iter126 #2"})
        assert d.status_code == 200
        # also re-dispute the reopened one to have 2 for the provider
        rid2 = pytest.sdl1_disputed_id
        requests.post(f"{API}/sdl1/attendance-records/{rid2}/dispute", headers=h,
                      json={"dispute_reason": "worker_no_show", "dispute_details": "TEST_iter126 #3"})

        lp = requests.get(f"{API}/sdl1/participants/{DOROTHY_ID}/pattern-detections", headers=h)
        assert lp.status_code == 200, lp.text
        patterns = lp.json().get("patterns") or lp.json().get("pattern_detections") or []
        # a pattern for our provider should exist
        assert any(prov in (p.get("provider_name") or "") or prov in str(p)
                   for p in patterns), f"no pattern for {prov}: {patterns}"

    def test_seed_from_calendar_graceful(self, h):
        today = datetime.utcnow().date()
        r = requests.post(
            f"{API}/sdl1/participants/{DOROTHY_ID}/attendance-records/seed-from-calendar",
            headers=h, json={"start_date": (today - timedelta(days=30)).isoformat(),
                             "end_date": today.isoformat()})
        assert r.status_code == 200, r.text
        body = r.json()
        assert "calendar_available" in body
        assert isinstance(body.get("count"), int)


# ---------------------------------------------------------------------------
# FC-2 Family Coordinator
# ---------------------------------------------------------------------------

class TestFC2:
    def test_task_crud_complete(self, h):
        c = requests.post(f"{API}/fc2/participants/{DOROTHY_ID}/tasks", headers=h,
                          json={"title": "TEST_iter126 task"})
        assert c.status_code == 200, c.text
        tid = c.json()["task"]["id"]

        lr = requests.get(f"{API}/fc2/participants/{DOROTHY_ID}/tasks", headers=h)
        assert lr.status_code == 200
        assert any(t["id"] == tid for t in lr.json()["tasks"])

        done = requests.post(f"{API}/fc2/tasks/{tid}/complete", headers=h,
                             json={"completion_note": "TEST_iter126 done"})
        assert done.status_code == 200
        assert done.json()["task"]["status"] == "done"

    def test_task_cancel(self, h):
        c = requests.post(f"{API}/fc2/participants/{DOROTHY_ID}/tasks", headers=h,
                          json={"title": "TEST_iter126 cancel me"})
        tid = c.json()["task"]["id"]
        r = requests.post(f"{API}/fc2/tasks/{tid}/cancel", headers=h,
                          json={"cancellation_reason": "not needed"})
        assert r.status_code == 200
        assert r.json()["task"]["status"] == "cancelled"

    def test_calendar_dispute_opens_case(self, h):
        start = (datetime.utcnow() - timedelta(days=1)).replace(microsecond=0).isoformat()
        c = requests.post(f"{API}/fc2/participants/{DOROTHY_ID}/calendar", headers=h,
                          json={"title": "TEST_iter126 visit", "start_datetime": start,
                                "service_type": "personal_care",
                                "provider_name": "TEST_iter126_Prov"})
        assert c.status_code == 200, c.text
        eid = c.json()["entry"]["id"]
        r = requests.post(f"{API}/fc2/calendar-entries/{eid}/confirm-attendance", headers=h,
                          json={"attendance_status": "disputed",
                                "attendance_notes": "TEST_iter126 dispute"})
        assert r.status_code == 200, r.text
        entry = r.json()["entry"]
        assert entry["attendance_status"] == "disputed"
        assert entry.get("case_id"), f"expected case_id: {entry}"

    def test_messages_flow(self, h):
        p = requests.post(f"{API}/fc2/participants/{DOROTHY_ID}/messages", headers=h,
                          json={"content": "TEST_iter126 hello"})
        assert p.status_code == 200, p.text
        mid = p.json()["message"]["id"]

        lr = requests.get(f"{API}/fc2/participants/{DOROTHY_ID}/messages", headers=h)
        assert lr.status_code == 200
        assert any(m["id"] == mid for m in lr.json()["messages"])

        mr = requests.post(f"{API}/fc2/messages/{mid}/mark-read", headers=h, json={})
        assert mr.status_code == 200

        d = requests.delete(f"{API}/fc2/messages/{mid}", headers=h)
        assert d.status_code == 200

    def test_voice_note_visibility_private(self, h):
        # A private note should still be returned to its own author (cathy)
        r = requests.post(f"{API}/fc2/participants/{DOROTHY_ID}/voice-notes", headers=h,
                          json={"category": "wellbeing", "content": "TEST_iter126 private note",
                                "visibility": "private_to_participant"})
        assert r.status_code == 200, r.text
        assert r.json()["voice_note"]["visibility"] == "private_to_participant"

        lst = requests.get(f"{API}/fc2/participants/{DOROTHY_ID}/voice-notes", headers=h)
        assert lst.status_code == 200
        # Author sees their own note
        assert any("TEST_iter126 private note" == n["content"] for n in lst.json()["voice_notes"])

    def test_voice_note_sensitive_flags(self, h):
        r = requests.post(f"{API}/fc2/participants/{DOROTHY_ID}/voice-notes", headers=h,
                          json={"category": "wellbeing",
                                "content": "TEST_iter126 I am so scared and cannot cope",
                                "visibility": "shared_with_household"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["voice_note"]["contains_sensitive_content_flag"] not in (None, "none")
        assert body.get("crisis_resources"), f"expected crisis_resources: {body}"

    def test_incident_log_aggregates(self, h):
        r = requests.get(f"{API}/fc2/participants/{DOROTHY_ID}/incident-log", headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        items = body.get("items") or body.get("incidents") or []
        # Not strictly required to be non-empty, but keys present
        assert isinstance(items, list)
        if items:
            # verify sorted by recency (descending timestamps if present)
            ts = [i.get("occurred_at") or i.get("created_at") or i.get("timestamp") for i in items if i]
            ts_valid = [t for t in ts if t]
            assert ts_valid == sorted(ts_valid, reverse=True)

    def test_handover_pack_pdf(self, h):
        # Use requests without JSON content-type expectation on response
        r = requests.post(f"{API}/fc2/participants/{DOROTHY_ID}/handover-pack",
                          headers=h, json={})
        assert r.status_code == 200, r.text[:200]
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        assert r.content[:4] == b"%PDF", r.content[:20]
        assert len(r.content) > 500


# ---------------------------------------------------------------------------
# SD-3 Statement of Rights annotations
# ---------------------------------------------------------------------------

class TestSD3Rights:
    def test_stmt_with_anomalies_returns_expected_rights(self, h):
        r = requests.get(f"{API}/sd3/statements/{STMT_WITH_ANOMALIES}/rights-annotations",
                         headers=h)
        assert r.status_code == 200, r.text
        body = r.json()
        rights = body.get("rights") or body.get("annotations") or []
        ids = {x.get("right_id") or x.get("id") for x in rights}
        # baseline rights always
        assert "make_a_complaint" in ids
        assert "advocacy_support" in ids
        # triggered by means/pension anomalies
        assert "clear_information_costs" in ids or "informed_of_changes" in ids, ids

    def test_find_zero_anomaly_statement_baseline_only(self, h):
        # list statements for Dorothy and find one with 0 anomalies
        lr = requests.get(f"{API}/statements", headers=h,
                          params={"participant_id": DOROTHY_ID, "limit": 50})
        if lr.status_code != 200:
            pytest.skip(f"cannot list statements: {lr.status_code}")
        js = lr.json()
        items = js if isinstance(js, list) else (js.get("statements") or js.get("items") or [])
        target = None
        for s in items:
            if s.get("id") == STMT_WITH_ANOMALIES:
                continue
            n = s.get("anomaly_count")
            if n == 0:
                target = s["id"]
                break
            # fallback: fetch statement detail
        if not target:
            pytest.skip("no zero-anomaly statement found for baseline-only assertion")
        r = requests.get(f"{API}/sd3/statements/{target}/rights-annotations", headers=h)
        assert r.status_code == 200, r.text
        rights = r.json().get("rights") or r.json().get("annotations") or []
        ids = {x.get("right_id") or x.get("id") for x in rights}
        assert len(ids) == 3, ids
        assert "make_a_complaint" in ids and "advocacy_support" in ids
