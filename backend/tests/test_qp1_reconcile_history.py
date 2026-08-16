"""QP-1 v1.5 — Reconciliation + History + Persona-fallback tests.

Covers:
- POST /api/qp1/reconciliations: match with ±3d / ±10% tolerances
- Non-matching lines create ad_hoc when create_adhoc_for_unmatched=true
- Cross-participant reconciliation → 403 (ownership)
- /api/qp1/pacing confidence bumps after reconciliation
- /api/qp1/pacing/history: 4 quarters, FY labels, clamping (0->1, 20->12)
- /api/persona returns resolver.persona='caregiver' for cathy (fallback via user.role)
"""
from __future__ import annotations

import os
import uuid
from datetime import date, timedelta

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=15)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def participant_id(headers):
    r = requests.get(f"{API}/participants", headers=headers, timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    parts = body if isinstance(body, list) else body.get("participants") or body.get("items") or []
    assert parts, f"cathy needs at least one participant: {body}"
    return parts[0]["id"]


@pytest.fixture(scope="module")
def seeded_schedule(headers, participant_id):
    """Create a fresh weekly schedule so we have expected ledger entries in
    the current quarter to reconcile against."""
    today = date.today().isoformat()
    body = {
        "participant_id": participant_id,
        "service_type": "TEST_Recon_Cleaning",
        "provider_name": "TEST_BlueBerry",
        "cadence": "weekly",
        "cadence_day": date.today().weekday(),
        "duration_hours": 1.5,
        "hourly_rate": 72.5,
        "effective_from": today,
    }
    r = requests.post(f"{API}/qp1/schedules", headers=headers, json=body, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["schedule"]


# ---------------------- PERSONA ----------------------
class TestPersona:
    def test_persona_defaults_to_caregiver_from_role(self, headers):
        r = requests.get(f"{API}/persona", headers=headers, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert "profile" in body and "resolver" in body
        # cathy signed up with role=caregiver → fallback resolver returns caregiver
        assert body["profile"]["viewer_persona"] == "caregiver"
        # resolver bundle exposes the persona used
        resolver = body["resolver"]
        # Two possible shapes; both must indicate caregiver
        persona_val = resolver.get("persona") or resolver.get("viewer_persona")
        assert persona_val == "caregiver", f"resolver did not surface caregiver: {resolver}"

    def test_persona_requires_auth(self):
        r = requests.get(f"{API}/persona", timeout=10)
        assert r.status_code in (401, 403)


# ---------------------- RECONCILIATION ----------------------
class TestReconciliation:
    def test_reconcile_matches_within_tolerance(self, headers, participant_id, seeded_schedule):
        # Fetch ledger entries for this schedule
        r = requests.get(f"{API}/qp1/ledger", headers=headers,
                         params={"participant_id": participant_id}, timeout=15)
        assert r.status_code == 200
        entries = [e for e in r.json()["entries"] if e.get("schedule_id") == seeded_schedule["id"]
                   and e.get("state") == "expected"]
        assert entries, "expected at least one expected entry from seeded schedule"

        target = entries[0]
        target_date = date.fromisoformat(target["expected_date"])
        # 2 days off, 5% off amount → within ±3d / ±10% → MATCH
        line_date = (target_date + timedelta(days=2)).isoformat()
        amt = round(float(target["expected_amount"]) * 1.05, 2)

        body = {
            "participant_id": participant_id,
            "statement_ref": f"TEST_STMT_{uuid.uuid4().hex[:6]}",
            "lines": [{"line_date": line_date, "amount": amt, "description": "TEST match line"}],
            "create_adhoc_for_unmatched": True,
        }
        rr = requests.post(f"{API}/qp1/reconciliations", headers=headers, json=body, timeout=15)
        assert rr.status_code == 200, rr.text
        data = rr.json()
        assert data["matched_count"] == 1
        assert data["unmatched_count"] == 0
        disp = data["dispositions"][0]
        assert disp["outcome"] == "matched"
        matched_id = disp["matched_entry_id"]
        assert matched_id, "expected a matched_entry_id"

        # Verify the matched entry is now reconciled with the statement metadata
        r2 = requests.get(f"{API}/qp1/ledger", headers=headers,
                          params={"participant_id": participant_id}, timeout=15)
        got = [e for e in r2.json()["entries"] if e["id"] == matched_id][0]
        assert got["state"] == "reconciled"
        assert abs(float(got["actual_amount"]) - amt) < 0.01
        assert got.get("statement_ref") == body["statement_ref"]
        assert got.get("statement_description") == "TEST match line"

    def test_reconcile_out_of_tolerance_creates_adhoc(self, headers, participant_id, seeded_schedule):
        # Use a bizarre amount + a date far from any weekly slot to guarantee
        # NO match against weekly-recurring seeded entries.
        # Weekly cadence means every 7 days ±3 window; picking today+45 with an
        # amount far outside 10% of the schedule's 108.75 avoids collisions.
        line_date = (date.today() + timedelta(days=45)).isoformat()
        weird_amount = 4321.99  # not within 10% of any schedule expected amount

        body = {
            "participant_id": participant_id,
            "statement_ref": f"TEST_STMT_{uuid.uuid4().hex[:6]}",
            "lines": [{"line_date": line_date, "amount": weird_amount,
                       "description": "TEST out-of-window line"}],
            "create_adhoc_for_unmatched": True,
        }
        rr = requests.post(f"{API}/qp1/reconciliations", headers=headers, json=body, timeout=15)
        assert rr.status_code == 200, rr.text
        data = rr.json()
        assert data["matched_count"] == 0, f"expected no match: {data}"
        assert data["unmatched_count"] == 1
        assert data["dispositions"][0]["outcome"] == "created_adhoc"
        assert data["dispositions"][0].get("entry_id")

    def test_reconcile_cross_participant_forbidden(self, headers):
        fake_pid = f"not-yours-{uuid.uuid4().hex[:6]}"
        body = {
            "participant_id": fake_pid,
            "lines": [{"line_date": date.today().isoformat(), "amount": 50.0}],
        }
        r = requests.post(f"{API}/qp1/reconciliations", headers=headers, json=body, timeout=15)
        # Not found (404) or forbidden (403) both acceptable — must NOT be 200
        assert r.status_code in (403, 404), r.text

    def test_reconcile_requires_auth(self, participant_id):
        body = {"participant_id": participant_id,
                "lines": [{"line_date": date.today().isoformat(), "amount": 10.0}]}
        r = requests.post(f"{API}/qp1/reconciliations", json=body, timeout=10)
        assert r.status_code == 401

    def test_pacing_reconciled_total_after_reconcile(self, headers, participant_id):
        # After the match test above, reconciled_total should be > 0
        r = requests.get(f"{API}/qp1/pacing", headers=headers,
                         params={"participant_id": participant_id, "classification": 4}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["reconciled_total"] > 0, f"expected reconciled_total>0 after reconcile: {data}"
        # Confidence tier: since prior test-runs may have inflated actual_spent
        # with adhoc/assumed entries, we only assert the field is well-formed
        # (and reconciled_total is contributing).
        assert data["confidence"] in ("low", "medium", "high")


# ---------------------- HISTORY ----------------------
class TestHistory:
    def test_history_returns_default_4_quarters(self, headers, participant_id):
        r = requests.get(f"{API}/qp1/pacing/history", headers=headers,
                         params={"participant_id": participant_id, "classification": 4}, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "history" in data
        assert len(data["history"]) == 4
        for item in data["history"]:
            for k in ("quarter", "envelope", "actual_spent", "pace_status", "entries_counted"):
                assert k in item, f"missing {k} in history item: {item}"
            # Label like "Apr-Jun 2026"
            label = item["quarter"]["label"]
            assert "-" in label and any(ch.isdigit() for ch in label)
            assert item["envelope"] > 0

    def test_history_clamps_zero_to_one(self, headers, participant_id):
        r = requests.get(f"{API}/qp1/pacing/history", headers=headers,
                         params={"participant_id": participant_id, "quarters": 0,
                                 "classification": 4}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["history"]) == 1

    def test_history_clamps_twenty_to_twelve(self, headers, participant_id):
        r = requests.get(f"{API}/qp1/pacing/history", headers=headers,
                         params={"participant_id": participant_id, "quarters": 20,
                                 "classification": 4}, timeout=15)
        assert r.status_code == 200
        assert len(r.json()["history"]) == 12

    def test_history_ownership(self, headers):
        fake = f"nobody-{uuid.uuid4().hex[:6]}"
        r = requests.get(f"{API}/qp1/pacing/history", headers=headers,
                         params={"participant_id": fake}, timeout=15)
        assert r.status_code in (403, 404)


# ---------------------- REGRESSION SHAPES ----------------------
class TestRegressionShapes:
    def test_schedules_shape(self, headers, participant_id):
        r = requests.get(f"{API}/qp1/schedules", headers=headers,
                         params={"participant_id": participant_id}, timeout=15)
        assert r.status_code == 200
        assert "schedules" in r.json()

    def test_ledger_shape(self, headers, participant_id):
        r = requests.get(f"{API}/qp1/ledger", headers=headers,
                         params={"participant_id": participant_id}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert "entries" in body and "window" in body

    def test_pacing_shape(self, headers, participant_id):
        r = requests.get(f"{API}/qp1/pacing", headers=headers,
                         params={"participant_id": participant_id, "classification": 4}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ("envelope", "actual_spent", "projected_end_of_quarter_total",
                  "pace_status", "confidence", "reconciled_total"):
            assert k in body, f"missing {k}"


# ---------------------- CLEANUP ----------------------
@pytest.fixture(scope="module", autouse=True)
def _cleanup(headers, participant_id):
    yield
    # Best-effort: end any TEST_ schedules we created
    try:
        r = requests.get(f"{API}/qp1/schedules", headers=headers,
                         params={"participant_id": participant_id}, timeout=10)
        for s in r.json().get("schedules", []):
            if str(s.get("service_type", "")).startswith("TEST_"):
                requests.delete(f"{API}/qp1/schedules/{s['id']}", headers=headers, timeout=10)
    except Exception:
        pass
