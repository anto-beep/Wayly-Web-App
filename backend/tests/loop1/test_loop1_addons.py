"""LOOP-1 v1.1 add-ons acceptance tests.

Covers: cross-case patterns, assignee candidates + assignment, LCA-1 sweep,
LCA-1 digest (dry-run), SLA reminder nudges.
"""
import os
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / "frontend" / ".env")
BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE}/api/auth/login",
               json={"email": "cathy@example.com", "password": "testpass123"})
    assert r.status_code == 200
    token = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def pid(session):
    r = session.get(f"{BASE}/api/core/participants")
    return next((p["id"] for p in r.json()["participants"] if p["is_primary"]),
                r.json()["participants"][0]["id"])


# ---------------------------------------------------------------------------
# Cross-case pattern detection
# ---------------------------------------------------------------------------

def test_patterns_threshold_and_shape(session):
    r = session.get(f"{BASE}/api/loop/patterns")
    assert r.status_code == 200
    body = r.json()
    assert body["threshold"] == 3
    for p in body["patterns"]:
        assert p["count"] >= 3
        assert p["severity"] in ("high", "medium", "low")
        assert "headline" in p and p["headline"]
        assert isinstance(p["case_ids"], list)


# ---------------------------------------------------------------------------
# Case assignee
# ---------------------------------------------------------------------------

def test_assignee_candidates_and_assignment(session, pid):
    # scan to make sure a case exists
    session.post(f"{BASE}/api/loop/cases/scan?participant_id={pid}")
    cases = session.get(f"{BASE}/api/loop/cases?participant_id={pid}&limit=1").json()["cases"]
    assert cases
    cid = cases[0]["id"]

    r = session.get(f"{BASE}/api/loop/cases/{cid}/assignee-candidates")
    assert r.status_code == 200
    cands = r.json()["candidates"]
    assert cands, "expected at least one household member as candidate"
    assert "user_id" in cands[0] and "role" in cands[0]

    assignee_uid = cands[0]["user_id"]
    r2 = session.patch(f"{BASE}/api/loop/cases/{cid}", json={"assignee_user_id": assignee_uid})
    assert r2.status_code == 200
    assert r2.json()["assignee_user_id"] == assignee_uid

    r3 = session.patch(f"{BASE}/api/loop/cases/{cid}", json={"assignee_user_id": None})
    assert r3.status_code == 200
    assert r3.json()["assignee_user_id"] is None


def test_assignee_candidates_404_for_bad_case(session):
    r = session.get(f"{BASE}/api/loop/cases/nonexistent-abc/assignee-candidates")
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# LCA-1 sweep
# ---------------------------------------------------------------------------

def test_lca1_sweep_dry_run(session):
    r = session.post(f"{BASE}/api/loop/lca1/sweep", json={"dry_run": True, "limit": 50})
    assert r.status_code == 200
    body = r.json()
    assert body["dry_run"] is True
    assert body["swept"] >= 0
    assert body["opened"] == 0  # dry run doesn't open cases


def test_lca1_sweep_live_is_idempotent(session):
    r1 = session.post(f"{BASE}/api/loop/lca1/sweep", json={"dry_run": False, "limit": 100})
    assert r1.status_code == 200
    r2 = session.post(f"{BASE}/api/loop/lca1/sweep", json={"dry_run": False, "limit": 100})
    assert r2.status_code == 200
    # Second sweep should not open new cases (all are already_open or no_signal)
    assert r2.json()["opened"] == 0


# ---------------------------------------------------------------------------
# LCA-1 digest
# ---------------------------------------------------------------------------

def test_lca1_digest_dry_run_contains_body_when_cases_exist(session):
    # Ensure at least one case exists
    session.post(f"{BASE}/api/loop/lca1/sweep", json={"dry_run": False})
    r = session.post(f"{BASE}/api/loop/lca1/digest", json={"dry_run": True})
    assert r.status_code == 200
    body = r.json()
    if body.get("case_count"):
        assert body["dry_run"] is True
        assert "Reclassification" in body["subject"]
        assert body["text_body"]
        assert body["html_body"]
    else:
        assert body["reason"] in ("no_reclassification_cases", "no_accessible_participants")


# ---------------------------------------------------------------------------
# Nudges — SLA reminder check
# ---------------------------------------------------------------------------

def test_sla_check_returns_summary(session):
    r = session.post(f"{BASE}/api/loop/nudges/sla-check")
    assert r.status_code == 200
    body = r.json()
    assert "reminded" in body
    assert "already_recently_reminded" in body
    assert isinstance(body["reminders"], list)


def test_sla_check_is_idempotent_within_cooldown(session):
    r1 = session.post(f"{BASE}/api/loop/nudges/sla-check").json()
    r2 = session.post(f"{BASE}/api/loop/nudges/sla-check").json()
    # After the first run, any freshly-reminded case now falls under
    # already_recently_reminded on the second run
    assert (r1["reminded"] + r1["already_recently_reminded"]) == (r2["reminded"] + r2["already_recently_reminded"])
    assert r2["reminded"] == 0 or r2["reminded"] <= r1["reminded"]
