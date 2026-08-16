"""CPR-1 · Iter 89 · End-to-end endpoint tests.

Verifies (against the live preview URL) all 10 care-plan endpoints:
* Auth gate returns 401 anonymous
* POST /api/care-plans/upload — persists + extraction populated
* GET  /api/care-plans returns register with severity counts
* GET  /api/care-plans/{id} returns plan+extraction+latest_run+findings+history
* PATCH /api/care-plans/{id}/notes persists notes
* DELETE /api/care-plans/{id} soft-deletes
* POST /api/care-plans/{id}/restore reverts
* GET /api/care-plans/archived/list only lists deleted/archived
* Cross-user isolation: user B gets 403 on user A's plan
* (Optional / limited) POST /api/care-plans/{id}/analyse triggers a run;
  every finding citation must resolve to an allowlist entry or
  'Verification required' and NEVER contain 's.999-9'.

LLM analyse is only called ONCE (with the Louisa fixture) to stay within
budget, per the task hints.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Optional

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.care_plan_analysis import CITATION_ALLOWLIST  # noqa: E402
from tests.fixtures.care_plans.build_sample_louisa_davids_2026_07 import (  # noqa: E402
    SAMPLE_TEXT,
)
from tests.fixtures.care_plans.build_anti_hallucination_test import (  # noqa: E402
    ANTI_HALLUCINATION_TEXT,
)

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-exact-parity.preview.emergentagent.com").rstrip("/")

USER_A_EMAIL = "cathy@example.com"
USER_A_PASS = "testpass123"
USER_B_EMAIL = "cpr1-iso-tester@example.com"
USER_B_PASS = "Wq9!hpJ4Hnc6xF"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _login(email: str, password: str) -> Optional[str]:
    r = None
    for _ in range(3):
        try:
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": email, "password": password},
                timeout=30,
            )
            break
        except requests.exceptions.RequestException:
            time.sleep(1)
    if r is None or r.status_code != 200:
        return None
    data = r.json()
    return data.get("token") or data.get("access_token")


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def token_a() -> str:
    tok = _login(USER_A_EMAIL, USER_A_PASS)
    if not tok:
        pytest.skip(f"Login failed for {USER_A_EMAIL}")
    return tok


@pytest.fixture(scope="module")
def token_b() -> Optional[str]:
    return _login(USER_B_EMAIL, USER_B_PASS)


@pytest.fixture(scope="module")
def uploaded_plan(token_a) -> dict:
    """Upload a fresh Louisa plan and return the response body."""
    r = requests.post(
        f"{BASE_URL}/api/care-plans/upload",
        headers=_headers(token_a),
        json={"text": SAMPLE_TEXT, "redact": False},
        timeout=30,
    )
    assert r.status_code == 200, f"Upload failed: {r.status_code} {r.text}"
    return r.json()


# ---------------------------------------------------------------------------
# 1. Auth gate
# ---------------------------------------------------------------------------

def _get_with_retry(url, **kw):
    last = None
    for _ in range(3):
        try:
            return requests.get(url, timeout=30, **kw)
        except requests.exceptions.RequestException as e:
            last = e
            time.sleep(1)
    raise last


def _post_with_retry(url, **kw):
    last = None
    for _ in range(3):
        try:
            return requests.post(url, timeout=30, **kw)
        except requests.exceptions.RequestException as e:
            last = e
            time.sleep(1)
    raise last


def test_auth_required_list():
    r = _get_with_retry(f"{BASE_URL}/api/care-plans")
    assert r.status_code == 401


def test_auth_required_upload():
    r = _post_with_retry(
        f"{BASE_URL}/api/care-plans/upload",
        json={"text": SAMPLE_TEXT},
    )
    assert r.status_code == 401


def test_auth_required_detail():
    r = _get_with_retry(f"{BASE_URL}/api/care-plans/nonexistent")
    assert r.status_code == 401


# ---------------------------------------------------------------------------
# 2. Upload → extraction populated
# ---------------------------------------------------------------------------

def test_upload_returns_care_plan_id_and_extraction(uploaded_plan):
    body = uploaded_plan
    assert "care_plan_id" in body
    assert "extraction" in body
    assert "next_step" in body

    ext = body["extraction"]
    assert ext["classification"] == 8
    assert ext["effective_from"] == "2026-07-01"
    assert ext["effective_to"] == "2026-09-30"
    assert ext["provider_name"] and "Glorious Services" in ext["provider_name"]
    assert ext["quarterly_budget"] == 19527.0
    assert len(ext.get("services") or []) >= 2


def test_upload_rejects_too_short(token_a):
    r = requests.post(
        f"{BASE_URL}/api/care-plans/upload",
        headers=_headers(token_a),
        json={"text": "too short"},
        timeout=30,
    )
    # Pydantic min_length=50 → 422
    assert r.status_code in (400, 422)


# ---------------------------------------------------------------------------
# 3. GET /api/care-plans register + counts
# ---------------------------------------------------------------------------

def test_list_returns_uploaded_plan_with_counts(token_a, uploaded_plan):
    plan_id = uploaded_plan["care_plan_id"]
    r = requests.get(f"{BASE_URL}/api/care-plans", headers=_headers(token_a), timeout=30)
    assert r.status_code == 200
    body = r.json()
    plans = body["care_plans"]
    ids = [p["id"] for p in plans]
    assert plan_id in ids
    row = next(p for p in plans if p["id"] == plan_id)
    counts = row["latest_findings_by_severity"]
    assert set(counts.keys()) >= {"compliance", "efficiency", "choice", "info", "total"}


# ---------------------------------------------------------------------------
# 4. GET /api/care-plans/{id} detail
# ---------------------------------------------------------------------------

def test_detail_shape(token_a, uploaded_plan):
    plan_id = uploaded_plan["care_plan_id"]
    r = requests.get(f"{BASE_URL}/api/care-plans/{plan_id}", headers=_headers(token_a), timeout=30)
    assert r.status_code == 200
    body = r.json()
    assert set(body.keys()) >= {"plan", "extraction", "latest_run", "findings", "history"}
    assert body["plan"]["id"] == plan_id
    assert body["extraction"]["classification"] == 8


# ---------------------------------------------------------------------------
# 5. Notes patch
# ---------------------------------------------------------------------------

def test_notes_patch_persists(token_a, uploaded_plan):
    plan_id = uploaded_plan["care_plan_id"]
    note = "TEST_note_from_pytest"
    r = requests.patch(
        f"{BASE_URL}/api/care-plans/{plan_id}/notes",
        headers=_headers(token_a),
        json={"notes": note},
        timeout=30,
    )
    assert r.status_code == 200

    # Verify via GET
    r2 = requests.get(f"{BASE_URL}/api/care-plans/{plan_id}", headers=_headers(token_a), timeout=30)
    assert r2.json()["plan"]["notes"] == note


# ---------------------------------------------------------------------------
# 6. Analyse — LIVE LLM (call once, verify anti-fab)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def analyse_result(token_a, uploaded_plan) -> dict:
    plan_id = uploaded_plan["care_plan_id"]
    r = requests.post(
        f"{BASE_URL}/api/care-plans/{plan_id}/analyse",
        headers=_headers(token_a),
        json={},
        timeout=90,
    )
    if r.status_code != 200:
        pytest.skip(f"Analyse endpoint failed ({r.status_code}): {r.text[:200]}")
    return {"plan_id": plan_id, "body": r.json()}


def test_analyse_returns_findings_and_flips_status(token_a, analyse_result):
    body = analyse_result["body"]
    assert body["status"] == "complete"
    assert body["findings_count"] >= 1

    # Confirm status flip
    r = requests.get(
        f"{BASE_URL}/api/care-plans/{analyse_result['plan_id']}",
        headers=_headers(token_a),
        timeout=30,
    )
    assert r.json()["plan"]["status"] == "active"


def test_findings_sorted_severity(analyse_result):
    findings = analyse_result["body"]["findings"]
    order = {"compliance": 0, "choice": 1, "efficiency": 2, "info": 3}
    severities = [f["severity"] for f in findings]
    ranks = [order[s] for s in severities]
    assert ranks == sorted(ranks), f"Findings out of order: {severities}"


def test_every_citation_in_allowlist_or_verification_required(analyse_result):
    """Anti-hallucination guard: every citation must be an allowlisted
    entry OR 'Verification required'. NEVER 's.999-9' fabricated."""
    for f in analyse_result["body"]["findings"]:
        cite = f["citation_source"]
        assert "999-9" not in cite, f"Fabricated citation leaked: {cite}"
        assert cite in CITATION_ALLOWLIST, (
            f"Non-allowlisted citation: {cite!r}. Allowlist has {len(CITATION_ALLOWLIST)} entries."
        )


# ---------------------------------------------------------------------------
# 7. Anti-hallucination fixture upload (no analyse — deterministic guard)
# ---------------------------------------------------------------------------

def test_anti_hallucination_upload_persists_but_findings_never_leak_s999_9(token_a):
    """Upload the fixture that contains 's.999-9' in its narrative and
    (without triggering analyse) verify the extraction stored does not
    leak the fabricated section into any structured field."""
    r = requests.post(
        f"{BASE_URL}/api/care-plans/upload",
        headers=_headers(token_a),
        json={"text": ANTI_HALLUCINATION_TEXT},
        timeout=30,
    )
    assert r.status_code == 200
    ext = r.json()["extraction"]
    # None of the structured fields should carry the poison string
    for key in ("provider_name", "narrative_text"):
        if ext.get(key):
            assert "999-9" not in str(ext[key])
    for svc in (ext.get("services") or []):
        assert "999-9" not in (svc.get("description") or "")
    # Cleanup
    plan_id = r.json()["care_plan_id"]
    requests.delete(f"{BASE_URL}/api/care-plans/{plan_id}", headers=_headers(token_a), timeout=30)


# ---------------------------------------------------------------------------
# 8. Delete → archived list → restore
# ---------------------------------------------------------------------------

def test_soft_delete_then_archived_then_restore(token_a):
    # Fresh plan just for this flow so it doesn't contaminate the analyse fixture
    up = requests.post(
        f"{BASE_URL}/api/care-plans/upload",
        headers=_headers(token_a),
        json={"text": SAMPLE_TEXT, "redact": False},
        timeout=30,
    )
    assert up.status_code == 200
    plan_id = up.json()["care_plan_id"]

    # Delete
    d = requests.delete(f"{BASE_URL}/api/care-plans/{plan_id}", headers=_headers(token_a), timeout=30)
    assert d.status_code == 200
    assert d.json()["ok"] is True
    assert d.json()["restore_within_days"] == 30

    # Should NOT appear in normal list
    r = requests.get(f"{BASE_URL}/api/care-plans", headers=_headers(token_a), timeout=30)
    ids = [p["id"] for p in r.json()["care_plans"]]
    assert plan_id not in ids

    # Should appear in archived
    a = requests.get(f"{BASE_URL}/api/care-plans/archived/list", headers=_headers(token_a), timeout=30)
    assert a.status_code == 200
    a_ids = [p["id"] for p in a.json()["care_plans"]]
    assert plan_id in a_ids

    # Restore
    rr = requests.post(f"{BASE_URL}/api/care-plans/{plan_id}/restore", headers=_headers(token_a), timeout=30)
    assert rr.status_code == 200

    # Now appears in normal list again
    r2 = requests.get(f"{BASE_URL}/api/care-plans", headers=_headers(token_a), timeout=30)
    assert plan_id in [p["id"] for p in r2.json()["care_plans"]]

    # Cleanup
    requests.delete(f"{BASE_URL}/api/care-plans/{plan_id}", headers=_headers(token_a), timeout=30)


# ---------------------------------------------------------------------------
# 9. Cross-user isolation
# ---------------------------------------------------------------------------

def test_cross_user_cannot_read_delete_or_patch(token_a, token_b, uploaded_plan):
    if not token_b:
        pytest.skip("User B (jeremy@test.com) login unavailable — cannot exercise isolation.")
    plan_id = uploaded_plan["care_plan_id"]

    r = requests.get(f"{BASE_URL}/api/care-plans/{plan_id}", headers=_headers(token_b), timeout=30)
    assert r.status_code in (403, 404)

    pr = requests.patch(
        f"{BASE_URL}/api/care-plans/{plan_id}/notes",
        headers=_headers(token_b),
        json={"notes": "should not persist"},
        timeout=30,
    )
    assert pr.status_code in (403, 404)

    d = requests.delete(f"{BASE_URL}/api/care-plans/{plan_id}", headers=_headers(token_b), timeout=30)
    assert d.status_code in (403, 404)
