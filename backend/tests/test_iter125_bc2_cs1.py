"""Iter 125 backend tests: BC-2 v2 projection-preview + scenarios (with overrides), CS-1 handover pack lifecycle + PDF export, cross-user 404."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PW = "testpass123"
DOROTHY_PID = "0c538637-b0dd-4982-8f78-b32814c6a5eb"


@pytest.fixture(scope="module")
def cathy():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PW})
    assert r.status_code == 200, f"login failed: {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


# ---------------- BC-2 projection-preview -------------------
class TestBC2ProjectionPreview:
    def test_baseline_no_overrides(self, cathy):
        r = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/projection-preview", json={
            "spend_adjustment_pct": 0.0, "indexation_percent": 0.0
        })
        assert r.status_code == 200, r.text[:300]
        data = r.json()
        assert data["participant_id"] == DOROTHY_PID
        assert "base_classification" in data
        assert data["assumptions"]["classification_overridden"] is False
        assert len(data["next_quarters"]) == 3

    def test_classification_override(self, cathy):
        # Baseline first
        r0 = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/projection-preview",
                        json={"spend_adjustment_pct": 0, "indexation_percent": 0})
        base = r0.json()
        base_cls = base["base_classification"]
        override_cls = 6 if base_cls != 6 else 3
        r = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/projection-preview", json={
            "classification": override_cls, "spend_adjustment_pct": 0, "indexation_percent": 0
        })
        assert r.status_code == 200
        data = r.json()
        assert data["classification"] == override_cls
        assert data["base_classification"] == base_cls
        assert data["assumptions"]["classification_overridden"] is True

    def test_indexation_changes_budget(self, cathy):
        r0 = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/projection-preview",
                        json={"spend_adjustment_pct": 0, "indexation_percent": 0})
        r1 = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/projection-preview",
                        json={"spend_adjustment_pct": 0, "indexation_percent": 10})
        b0 = r0.json()["next_quarters"][0]["quarterly_budget_aud"]
        b1 = r1.json()["next_quarters"][0]["quarterly_budget_aud"]
        assert b1 > b0, f"indexation should increase budget: {b0} vs {b1}"

    def test_spend_adjustment_changes_projected_spend(self, cathy):
        r0 = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/projection-preview",
                        json={"spend_adjustment_pct": 0, "indexation_percent": 0})
        r1 = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/projection-preview",
                        json={"spend_adjustment_pct": 50, "indexation_percent": 0})
        s0 = r0.json()["next_quarters"][0]["projected_spend_aud"]
        s1 = r1.json()["next_quarters"][0]["projected_spend_aud"]
        assert s1 > s0, f"spend slider should increase projected spend: {s0} vs {s1}"


# ---------------- BC-2 scenarios ----------------------
class TestBC2Scenarios:
    created_id = None

    def test_save_scenario_with_overrides(self, cathy):
        r = cathy.post(f"{API}/bc2/participants/{DOROTHY_PID}/scenarios", json={
            "label": "TEST_iter125_class6",
            "note": "override to class 6",
            "overrides": {"classification": 6, "spend_adjustment_pct": 10, "indexation_percent": 3}
        })
        assert r.status_code == 200, r.text[:300]
        sc = r.json()["scenario"]
        assert sc["label"] == "TEST_iter125_class6"
        snap = sc["projection_snapshot"]
        assert snap["classification"] == 6
        assert snap["assumptions"]["classification_overridden"] is True
        TestBC2Scenarios.created_id = sc["id"]

    def test_list_scenarios(self, cathy):
        r = cathy.get(f"{API}/bc2/participants/{DOROTHY_PID}/scenarios")
        assert r.status_code == 200
        ids = [s["id"] for s in r.json()["scenarios"]]
        assert TestBC2Scenarios.created_id in ids

    def test_delete_scenario(self, cathy):
        sid = TestBC2Scenarios.created_id
        assert sid
        r = cathy.delete(f"{API}/bc2/participants/{DOROTHY_PID}/scenarios/{sid}")
        assert r.status_code == 200
        # verify gone
        r2 = cathy.get(f"{API}/bc2/participants/{DOROTHY_PID}/scenarios")
        ids = [s["id"] for s in r2.json()["scenarios"]]
        assert sid not in ids


# ---------------- CS-1 handover pack -------------------
class TestCS1HandoverPack:
    pack_id = None

    def test_create_no_medical_optin(self, cathy):
        r = cathy.post(f"{API}/cs1/handover-packs", json={
            "participant_context_id": DOROTHY_PID,
            "emergency_priorities": "TEST_iter125 emergency",
            "my_routines": "8am breakfast",
            "backup_contacts": [{"name": "Jane", "phone": "0400000000"}],
            "who_can_help_with_what": [{"helper": "Bob", "tasks": "shopping"}],
            "my_medical_needs": "should not be stored",
            "opt_in_medical": False,
        })
        assert r.status_code == 200, r.text[:300]
        pack = r.json()["pack"]
        assert pack["my_medical_needs"] is None, "medical needs stored despite opt_in=False"
        assert pack["emergency_priorities"] == "TEST_iter125 emergency"
        TestCS1HandoverPack.pack_id = pack["id"]

    def test_get_pack(self, cathy):
        pid = TestCS1HandoverPack.pack_id
        r = cathy.get(f"{API}/cs1/handover-packs/{pid}")
        assert r.status_code == 200
        assert r.json()["pack"]["id"] == pid

    def test_patch_pack_with_medical(self, cathy):
        pid = TestCS1HandoverPack.pack_id
        r = cathy.patch(f"{API}/cs1/handover-packs/{pid}", json={
            "emergency_priorities": "TEST_iter125 UPDATED",
            "my_medical_needs": "Insulin twice daily",
            "opt_in_medical": True,
            "backup_contacts": [{"name": "Jane", "phone": "0400000000"}],
            "who_can_help_with_what": [],
        })
        assert r.status_code == 200, r.text[:300]
        pack = r.json()["pack"]
        assert pack["emergency_priorities"] == "TEST_iter125 UPDATED"
        assert pack["my_medical_needs"] == "Insulin twice daily"

        # verify persisted
        r2 = cathy.get(f"{API}/cs1/handover-packs/{pid}")
        assert r2.json()["pack"]["my_medical_needs"] == "Insulin twice daily"

    def test_export_pdf(self, cathy):
        pid = TestCS1HandoverPack.pack_id
        r = cathy.get(f"{API}/cs1/handover-packs/{pid}/export.pdf")
        assert r.status_code == 200
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert r.content[:4] == b"%PDF", f"invalid PDF header: {r.content[:20]}"
        assert len(r.content) > 500

    def test_cross_user_404(self, cathy):
        # Login as trial user and try to access cathy's pack
        s2 = requests.Session()
        r = s2.post(f"{API}/auth/login", json={"email": "trial30909@example.com", "password": "TrialPass1!"})
        if r.status_code != 200:
            pytest.skip(f"trial account login failed: {r.status_code}")
        tok = r.json().get("token") or r.json().get("access_token")
        s2.headers.update({"Authorization": f"Bearer {tok}"})
        pid = TestCS1HandoverPack.pack_id
        r2 = s2.get(f"{API}/cs1/handover-packs/{pid}")
        assert r2.status_code == 404, f"cross-user access should 404, got {r2.status_code}"
        r3 = s2.get(f"{API}/cs1/handover-packs/{pid}/export.pdf")
        assert r3.status_code == 404
