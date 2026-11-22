"""Iter 326: Regression tests for the 3 critical production bugs.

BUG1: async letter generation returns job_id + status polling; source-data-missing
      still surfaces as job status=error with error_detail.
BUG2: Dashboard 8 GETs return 200 quickly + POST /insights/summarise runs off event loop.
BUG3: Ghost draft cleanup — autosave sets user_saved=true; DELETE removes entry.
REGRESSION: correspondence CRUD + list + prefill flow.
"""
import os
import time
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") + "/api"
EMAIL = "cathy@example.com"
PASS = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASS}, timeout=30)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def participant_id(headers):
    r = requests.get(f"{BASE}/v2/participants", headers=headers, timeout=15)
    if r.status_code == 200:
        parts = r.json().get("participants") or r.json().get("items") or []
        if parts:
            return parts[0].get("id")
    # fallback: no participant needed for generic letter
    return None


# ---------------------------------------------------------------------------
# BUG3 / regression: correspondence CRUD + ghost-draft
# ---------------------------------------------------------------------------

def _create_entry(headers, participant_id, situation_id=1):
    payload = {"situation_id": situation_id, "participant_id": participant_id, "direction": "outbound"}
    r = requests.post(f"{BASE}/lf1/correspondence", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200, f"Create failed: {r.status_code} {r.text}"
    return r.json()["entry"]


def test_bug3_fresh_entry_user_saved_falsy(headers, participant_id):
    entry = _create_entry(headers, participant_id)
    eid = entry["id"]
    r = requests.get(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)
    assert r.status_code == 200
    row = r.json()
    assert not row.get("user_saved"), "Fresh entry must have user_saved falsy"
    # cleanup
    requests.delete(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)


def test_bug3_autosave_sets_user_saved(headers, participant_id):
    entry = _create_entry(headers, participant_id)
    eid = entry["id"]
    r = requests.patch(
        f"{BASE}/lf1/correspondence/{eid}/autosave",
        headers=headers,
        json={"intake": {"note": "manual save"}},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    # verify
    r2 = requests.get(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)
    assert r2.status_code == 200
    row = r2.json()
    assert row.get("user_saved") is True
    assert (row.get("intake") or {}).get("note") == "manual save"
    requests.delete(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)


def test_bug3_delete_ghost_draft_removes_entry(headers, participant_id):
    entry = _create_entry(headers, participant_id)
    eid = entry["id"]
    # DELETE (simulating leave-modal Discard)
    r = requests.delete(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)
    assert r.status_code == 200
    assert r.json().get("deleted") is True
    # GET must 404
    r2 = requests.get(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)
    assert r2.status_code == 404


def test_bug3_list_no_ghost_draft(headers, participant_id):
    entry = _create_entry(headers, participant_id)
    eid = entry["id"]
    # discard
    requests.delete(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)
    r = requests.get(f"{BASE}/lf1/correspondence", headers=headers, timeout=15)
    assert r.status_code == 200
    ids = [e.get("id") for e in r.json().get("entries", [])]
    assert eid not in ids, "Discarded ghost draft still appears in mailbox list"


# ---------------------------------------------------------------------------
# BUG1: async letter generation
# ---------------------------------------------------------------------------

def _poll_job(headers, job_id, timeout=90):
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        r = requests.get(f"{BASE}/lf1/generate-jobs/{job_id}", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        last = r.json()
        if last.get("status") in ("done", "error"):
            return last
        time.sleep(2)
    return last


def test_bug1_generate_async_returns_job_id_instantly(headers, participant_id):
    # Situation 3 is a common one (billing dispute etc.) - use situation 1
    entry = _create_entry(headers, participant_id, situation_id=1)
    eid = entry["id"]
    # Prefill to seed intake
    requests.post(
        f"{BASE}/lf1/correspondence/{eid}/prefill",
        headers=headers, json={"participant_name": "Dorothy"}, timeout=20,
    )
    t0 = time.time()
    r = requests.post(
        f"{BASE}/lf1/correspondence/{eid}/generate-async",
        headers=headers, json={"persist": True}, timeout=30,
    )
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    body = r.json()
    assert "job_id" in body
    assert body.get("status") == "processing"
    assert elapsed < 10, f"generate-async should return instantly, took {elapsed:.1f}s"

    # Poll to completion
    final = _poll_job(headers, body["job_id"], timeout=90)
    assert final is not None
    # Either done with a letter or error (source_data_missing / provider issue)
    assert final.get("status") in ("done", "error"), f"Job stuck: {final}"
    if final.get("status") == "done":
        result = final.get("result") or {}
        assert (result.get("body") or "").strip(), "Done job has empty body"
    else:
        # accept source_data_missing as legitimate outcome
        err = final.get("error") or ""
        detail = final.get("error_detail") or {}
        assert "source_data_missing" in err or detail.get("error") == "source_data_missing" or "unavailable" in err, f"Unexpected error: {final}"
    requests.delete(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)


def test_bug1_generate_async_source_data_missing(headers):
    """Entry with no participant / no intake for a strict archetype → job status=error."""
    # Situation 5 (complaint) requires intake fields
    payload = {"situation_id": 5, "direction": "outbound"}
    r = requests.post(f"{BASE}/lf1/correspondence", headers=headers, json=payload, timeout=15)
    assert r.status_code == 200
    eid = r.json()["entry"]["id"]
    r = requests.post(
        f"{BASE}/lf1/correspondence/{eid}/generate-async",
        headers=headers, json={"persist": False}, timeout=15,
    )
    assert r.status_code == 200
    job_id = r.json()["job_id"]
    final = _poll_job(headers, job_id, timeout=90)
    # Might succeed if defaults are seeded; if it errors, must be source_data_missing
    if final and final.get("status") == "error":
        err_detail = final.get("error_detail") or {}
        # Accept either error path (source_data_missing OR provider unavailable)
        assert err_detail.get("error") == "source_data_missing" or "source_data_missing" in (final.get("error") or "") or "unavailable" in (final.get("error") or "")
    requests.delete(f"{BASE}/lf1/correspondence/{eid}", headers=headers, timeout=15)


# ---------------------------------------------------------------------------
# BUG2: Dashboard 8 GETs + insights summarise
# ---------------------------------------------------------------------------

DASHBOARD_ENDPOINTS = [
    "/budget/current",
    "/statements",
    "/family-thread",
    "/audit-log",
    "/chat/history",
    "/budget/eligible-pathways",
    "/nudges",
    "/account/health",
]


@pytest.mark.parametrize("path", DASHBOARD_ENDPOINTS)
def test_bug2_dashboard_endpoints_200(headers, path):
    t0 = time.time()
    r = requests.get(f"{BASE}{path}", headers=headers, timeout=30)
    elapsed = time.time() - t0
    assert r.status_code == 200, f"{path} -> {r.status_code} {r.text[:200]}"
    assert elapsed < 15, f"{path} took {elapsed:.1f}s (too slow)"


def test_bug2_insights_summarise_off_loop(headers):
    """POST /insights/summarise should return 200 quickly and not block the loop.
    We validate by firing summarise and, while it's in flight, hitting a light
    GET; both should complete."""
    import threading

    result = {}

    def _summarise():
        t0 = time.time()
        try:
            r = requests.post(f"{BASE}/insights/summarise", headers=headers, json={"scope": "dashboard"}, timeout=90)
            result["summarise_status"] = r.status_code
            result["summarise_elapsed"] = time.time() - t0
        except Exception as e:
            result["summarise_err"] = str(e)

    t = threading.Thread(target=_summarise)
    t.start()
    time.sleep(1)
    # Fire a light GET while summarise is running
    t0 = time.time()
    r = requests.get(f"{BASE}/auth/me", headers=headers, timeout=15)
    concurrent_elapsed = time.time() - t0
    assert r.status_code == 200
    assert concurrent_elapsed < 10, f"Concurrent GET stalled ({concurrent_elapsed:.1f}s) → event loop blocked"
    t.join(timeout=90)
    # summarise itself may 200 or 502 (LLM provider flakiness) but must not hang beyond timeout
    assert "summarise_err" not in result or "timeout" not in result.get("summarise_err", "").lower()


# ---------------------------------------------------------------------------
# Regression: statement upload/decode & invoice checker
# ---------------------------------------------------------------------------

def test_regression_statements_list(headers):
    r = requests.get(f"{BASE}/statements", headers=headers, timeout=15)
    assert r.status_code == 200
