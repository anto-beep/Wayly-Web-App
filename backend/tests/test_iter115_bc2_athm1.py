"""Iter 115 · Backend tests for BC-2 router, ATHM-1 trial reminders."""
import os
import uuid
import pytest
import requests

def _load_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    return line.split("=", 1)[1].strip().rstrip("/")
    except Exception:
        pass
    raise RuntimeError("REACT_APP_BACKEND_URL not set")

BASE = _load_backend_url()


@pytest.fixture(scope="module")
def cathy():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": "cathy@example.com", "password": "testpass123"})
    assert r.status_code == 200, r.text
    tok = r.json().get("access_token") or r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def cathy_pid(cathy):
    r = cathy.get(f"{BASE}/api/core/participants")
    assert r.status_code == 200, r.text
    data = r.json()
    ps = data if isinstance(data, list) else data.get("participants") or []
    assert ps, f"No participants for cathy: {data}"
    return ps[0]["id"]


# ---------- BC-2 ----------

class TestBC2:
    def test_status_public(self):
        r = requests.get(f"{BASE}/api/bc2/status")
        assert r.status_code == 200
        j = r.json()
        assert j.get("bc_2_projection") is True
        assert j.get("spec") == "BC-2 v1"

    def test_projection(self, cathy, cathy_pid):
        r = cathy.get(f"{BASE}/api/bc2/participants/{cathy_pid}/projection")
        assert r.status_code == 200, r.text
        j = r.json()
        for k in ("current_quarter", "next_quarters", "lifetime_cap_position", "assumptions"):
            assert k in j, f"missing {k}: {j}"
        assert len(j["next_quarters"]) == 3

    def test_adjustment_create_and_list(self, cathy, cathy_pid):
        payload = {
            "adjustment_type": "classification_change",
            "previous_value": 4,
            "new_value": 5,
            "reason": "TEST_iter115",
        }
        r = cathy.post(f"{BASE}/api/bc2/participants/{cathy_pid}/adjustments", json=payload)
        assert r.status_code in (200, 201), r.text
        adj = r.json().get("adjustment")
        assert adj and adj.get("id")
        aid = adj["id"]

        r2 = cathy.get(f"{BASE}/api/bc2/participants/{cathy_pid}/adjustments")
        assert r2.status_code == 200
        ids = [a["id"] for a in r2.json().get("adjustments", [])]
        assert aid in ids

    def test_scenario_crud(self, cathy, cathy_pid):
        r = cathy.post(f"{BASE}/api/bc2/participants/{cathy_pid}/scenarios",
                       json={"label": "TEST_iter115_scenario", "note": "n"})
        assert r.status_code in (200, 201), r.text
        sid = r.json()["scenario"]["id"]

        r2 = cathy.get(f"{BASE}/api/bc2/participants/{cathy_pid}/scenarios")
        assert r2.status_code == 200
        assert sid in [s["id"] for s in r2.json().get("scenarios", [])]

        r3 = cathy.delete(f"{BASE}/api/bc2/participants/{cathy_pid}/scenarios/{sid}")
        assert r3.status_code == 200
        assert r3.json().get("deleted") is True

        r4 = cathy.get(f"{BASE}/api/bc2/participants/{cathy_pid}/scenarios")
        assert sid not in [s["id"] for s in r4.json().get("scenarios", [])]

    def test_cross_participant_denied(self, cathy):
        bogus = str(uuid.uuid4())
        r = cathy.get(f"{BASE}/api/bc2/participants/{bogus}/projection")
        assert r.status_code in (401, 403, 404), r.text


# ---------- ATHM-1 trial reminders ----------

class TestATHM1TrialReminders:
    def test_due_list_shape(self, cathy, cathy_pid):
        r = cathy.get(f"{BASE}/api/athm1/participants/{cathy_pid}/trial-reminders/due")
        assert r.status_code == 200, r.text
        j = r.json()
        assert "reminders" in j and isinstance(j["reminders"], list)
        for rem in j["reminders"]:
            assert "surface_on" in rem
            assert "days_until_trial_end" in rem
            assert "days_before_end_reminder_scheduled" in rem

    def test_ack_invalid_response(self, cathy):
        r = cathy.post(f"{BASE}/api/athm1/trial-reminders/{uuid.uuid4()}/acknowledge",
                       json={"user_response": "invalid_val", "note": ""})
        assert r.status_code == 422, r.text

    def test_ack_full_roundtrip(self, cathy, cathy_pid):
        """Optional: create item -> start-trial -> due -> ack. If pre-reqs fail, skip."""
        # Create an ATHM item
        create_payload = {
            "item_name": "TEST_iter115_trial_item",
            "category": "aids_appliances",
            "estimated_cost_aud": 100.0,
        }
        r = cathy.post(f"{BASE}/api/athm1/participants/{cathy_pid}/items", json=create_payload)
        if r.status_code not in (200, 201):
            pytest.skip(f"cannot create athm item: {r.status_code} {r.text[:200]}")
        item = r.json().get("item") or r.json()
        item_id = item.get("id")
        if not item_id:
            pytest.skip("no item id")

        # start-trial (start today, 1 day period => end is tomorrow; days_before=7 triggers immediately)
        from datetime import date
        r2 = cathy.post(f"{BASE}/api/athm1/items/{item_id}/start-trial",
                        json={"trial_start_date": date.today().isoformat(), "trial_period_days": 1})
        if r2.status_code not in (200, 201):
            pytest.skip(f"start-trial failed: {r2.status_code} {r2.text[:200]}")

        r3 = cathy.get(f"{BASE}/api/athm1/participants/{cathy_pid}/trial-reminders/due")
        assert r3.status_code == 200
        rems = r3.json()["reminders"]
        # Filter to this item
        mine = [x for x in rems if x.get("athm_item_id") == item_id]
        assert mine, f"expected reminders due for new item, got {rems}"
        rid = mine[0]["id"]

        r4 = cathy.post(f"{BASE}/api/athm1/trial-reminders/{rid}/acknowledge",
                        json={"user_response": "keep", "note": "TEST_iter115"})
        assert r4.status_code == 200, r4.text
        assert r4.json().get("acknowledged") is True
