"""BC-2 backend regression for mobile parity (iter253).

Validates the /bc2 endpoints used by the mobile Budget Scenarios screen:
  - GET  /api/bc2/participants/{pid}/projection
  - POST /api/bc2/participants/{pid}/projection-preview  (overrides)
  - GET  /api/bc2/participants/{pid}/scenarios
  - POST /api/bc2/participants/{pid}/scenarios
  - DELETE /api/bc2/participants/{pid}/scenarios/{scenario_id}
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
SOLO_EMAIL = "test+1777810269@example.com"
SOLO_PASSWORD = "SoloTest1!"


@pytest.fixture(scope="module")
def auth_headers():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": SOLO_EMAIL, "password": SOLO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    token = r.json().get("token") or r.json().get("access_token")
    assert token, f"no token in login response: {r.json()}"
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def participant_id(auth_headers):
    r = requests.get(f"{BASE_URL}/api/participants", headers=auth_headers, timeout=30)
    assert r.status_code == 200, f"list participants failed: {r.status_code} {r.text}"
    data = r.json()
    parts = data if isinstance(data, list) else data.get("participants") or data.get("items") or []
    assert parts, f"no participants for solo user: {data}"
    pid = parts[0].get("id")
    assert pid, f"no id on participant: {parts[0]}"
    return pid


# --- projection (baseline) --------------------------------------------------

def test_projection_baseline_shape(auth_headers, participant_id):
    r = requests.get(f"{BASE_URL}/api/bc2/participants/{participant_id}/projection", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    # participant + classification
    assert data.get("participant_id") == participant_id
    assert isinstance(data.get("classification"), int) and 1 <= data["classification"] <= 8
    # current quarter
    cq = data.get("current_quarter") or {}
    for k in ("quarter_label", "quarterly_budget_aud", "burn_total_aud", "headroom_aud"):
        assert k in cq, f"missing {k} in current_quarter: {cq}"
    # next 3 quarters
    nq = data.get("next_quarters") or []
    assert len(nq) == 3, f"expected 3 forward quarters, got {len(nq)}"
    for q in nq:
        assert "quarter_label" in q and "projected_spend_aud" in q and "quarterly_budget_aud" in q


# --- projection-preview (what-if) -------------------------------------------

def test_projection_preview_applies_overrides(auth_headers, participant_id):
    body = {"classification": 5, "spend_adjustment_pct": 10.0, "indexation_percent": 3.0}
    r = requests.post(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/projection-preview",
        json=body, headers=auth_headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("classification") == 5, data
    a = data.get("assumptions") or {}
    assert a.get("spend_adjustment_pct") == 10.0
    assert a.get("indexation_rate_percent") == 3.0


def test_projection_preview_no_change_when_zero(auth_headers, participant_id):
    baseline = requests.get(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/projection",
        headers=auth_headers, timeout=30,
    ).json()
    base_cls = baseline["classification"]
    r = requests.post(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/projection-preview",
        json={"classification": base_cls, "spend_adjustment_pct": 0, "indexation_percent": 0},
        headers=auth_headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    # Same 3 forward quarter budgets when zeros supplied.
    for i, q in enumerate(data["next_quarters"]):
        assert round(q["quarterly_budget_aud"], 2) == round(baseline["next_quarters"][i]["quarterly_budget_aud"], 2)


# --- scenarios CRUD ---------------------------------------------------------

def test_save_list_delete_scenario(auth_headers, participant_id):
    label = f"TEST_iter253_{uuid.uuid4().hex[:8]}"
    overrides = {"classification": 6, "spend_adjustment_pct": -20.0, "indexation_percent": 2.0}
    # CREATE
    r = requests.post(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/scenarios",
        json={"label": label, "note": "", "overrides": overrides},
        headers=auth_headers, timeout=30,
    )
    assert r.status_code == 200, r.text
    scenario = r.json().get("scenario") or {}
    sid = scenario.get("id")
    assert sid, f"no scenario id: {r.json()}"
    assert scenario.get("label") == label
    snap = scenario.get("projection_snapshot") or {}
    assert snap.get("classification") == 6

    # LIST includes it
    r2 = requests.get(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/scenarios",
        headers=auth_headers, timeout=30,
    )
    assert r2.status_code == 200, r2.text
    ids = [s["id"] for s in r2.json().get("scenarios", [])]
    assert sid in ids, f"scenario missing from list: {ids}"

    # DELETE
    r3 = requests.delete(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/scenarios/{sid}",
        headers=auth_headers, timeout=30,
    )
    assert r3.status_code == 200, r3.text
    assert r3.json().get("deleted") is True

    # Deleted -> another delete returns 404
    r4 = requests.delete(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/scenarios/{sid}",
        headers=auth_headers, timeout=30,
    )
    assert r4.status_code == 404


def test_delete_unknown_scenario_returns_404(auth_headers, participant_id):
    r = requests.delete(
        f"{BASE_URL}/api/bc2/participants/{participant_id}/scenarios/nope-{uuid.uuid4().hex}",
        headers=auth_headers, timeout=30,
    )
    assert r.status_code == 404
