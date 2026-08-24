"""Batch 2 — Extended Features tests.

Covers Features 1, 2, 3, 5, 6, 7, 8, 9.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")

CATHY = ("cathy@example.com", "testpass123")
MARK = ("mark.adviser@example.com", "AdviserPass1!")


def _login(email, password):
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    r = s.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        pytest.skip(f"login failed for {email}: {r.status_code} {r.text[:200]}")
    data = r.json()
    token = data.get("access_token") or data.get("token")
    if token:
        s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def cathy_session():
    return _login(*CATHY)


@pytest.fixture(scope="module")
def mark_session():
    return _login(*MARK)


# ============ Feature 9 — Multi-participant ============
class TestParticipants:
    def test_list_returns_at_least_primary(self, cathy_session):
        r = cathy_session.get(f"{BASE_URL}/api/participants")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert len(data["items"]) >= 1
        primary = [p for p in data["items"] if p.get("is_primary")]
        assert len(primary) >= 1
        assert primary[0]["name"]

    def test_crud_lifecycle(self, cathy_session):
        # create
        r = cathy_session.post(f"{BASE_URL}/api/participants", json={
            "name": "TEST_Aunt", "classification": 3, "provider_name": "TestProv",
            "is_grandfathered": False, "relationship": "aunt",
        })
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["is_primary"] is False

        # patch
        r = cathy_session.patch(f"{BASE_URL}/api/participants/{pid}", json={"classification": 5})
        assert r.status_code == 200
        assert r.json()["classification"] == 5

        # promote
        r = cathy_session.post(f"{BASE_URL}/api/participants/{pid}/promote")
        assert r.status_code == 200
        assert r.json()["primary_id"] == pid

        # cannot delete primary
        r = cathy_session.delete(f"{BASE_URL}/api/participants/{pid}")
        assert r.status_code == 409

        # promote another back to primary, then archive this one
        listing = cathy_session.get(f"{BASE_URL}/api/participants").json()["items"]
        other = [p for p in listing if p["id"] != pid][0]
        cathy_session.post(f"{BASE_URL}/api/participants/{other['id']}/promote")
        r = cathy_session.delete(f"{BASE_URL}/api/participants/{pid}")
        assert r.status_code == 200


# ============ Feature 1 — Hospital Liaison ============
class TestHospital:
    def test_full_admission_flow(self, cathy_session):
        # get primary participant
        plist = cathy_session.get(f"{BASE_URL}/api/participants").json()["items"]
        primary = [p for p in plist if p.get("is_primary")][0]

        r = cathy_session.post(f"{BASE_URL}/api/hospital/admissions", json={
            "participant_id": primary["id"],
            "hospital_name": "TEST General Hospital",
            "admission_date": "2026-01-10",
            "reason": "test admission",
            "pause_services": True,
        })
        assert r.status_code == 200, r.text
        adm = r.json()
        aid = adm["id"]
        assert adm["status"] == "active"
        assert adm["services_paused"] is True

        # list
        r = cathy_session.get(f"{BASE_URL}/api/hospital/admissions")
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json()["items"])

        # request RCP
        r = cathy_session.post(f"{BASE_URL}/api/hospital/admissions/{aid}/request-rcp")
        assert r.status_code == 200
        assert r.json()["rcp_requested"] is True
        assert r.json()["rcp_requested_at"]

        # discharge
        r = cathy_session.post(f"{BASE_URL}/api/hospital/admissions/{aid}/discharge", json={
            "discharge_date": "2026-01-15",
            "discharge_notes": "ok",
        })
        assert r.status_code == 200
        assert r.json()["status"] == "discharged"
        assert r.json()["services_paused"] is False


# ============ Feature 6 — Family Wall ============
class TestFamilyWall:
    def test_post_react_delete(self, cathy_session):
        plist = cathy_session.get(f"{BASE_URL}/api/participants").json()["items"]
        primary = [p for p in plist if p.get("is_primary")][0]

        r = cathy_session.post(f"{BASE_URL}/api/wall/posts", json={
            "participant_id": primary["id"], "kind": "message", "body": "TEST hello wall",
        })
        assert r.status_code == 200, r.text
        post_id = r.json()["id"]

        r = cathy_session.get(f"{BASE_URL}/api/wall/posts")
        assert r.status_code == 200
        assert any(p["id"] == post_id for p in r.json()["items"])

        # react ON
        r = cathy_session.post(f"{BASE_URL}/api/wall/posts/{post_id}/react", json={"emoji": "❤️"})
        assert r.status_code == 200
        assert r.json()["reactions"].get("❤️") == 1
        # react OFF (toggle)
        r = cathy_session.post(f"{BASE_URL}/api/wall/posts/{post_id}/react", json={"emoji": "❤️"})
        assert r.status_code == 200
        assert "❤️" not in r.json()["reactions"]

        # large image rejected
        huge = "A" * 3_100_000
        r = cathy_session.post(f"{BASE_URL}/api/wall/posts", json={
            "participant_id": primary["id"], "kind": "photo",
            "image_b64": huge, "image_mime": "image/jpeg",
        })
        assert r.status_code == 413, r.status_code

        # delete
        r = cathy_session.delete(f"{BASE_URL}/api/wall/posts/{post_id}")
        assert r.status_code == 200


# ============ Feature 3 — SMS ============
class TestSMS:
    def test_contacts_and_mock_send(self, cathy_session):
        r = cathy_session.get(f"{BASE_URL}/api/me/contacts")
        assert r.status_code == 200
        assert r.json().get("sms_enabled") is False  # flag off

        # invalid phone -> 400
        r = cathy_session.put(f"{BASE_URL}/api/me/contacts", json={"phone_e164": "abc"})
        assert r.status_code == 400

        # normalize AU number
        r = cathy_session.put(f"{BASE_URL}/api/me/contacts", json={
            "phone_e164": "0412345678", "sms_opt_in": True,
        })
        assert r.status_code == 200
        assert r.json()["phone_e164"] == "+61412345678"
        assert r.json()["sms_opt_in"] is True

        # mocked send
        r = cathy_session.post(f"{BASE_URL}/api/sms/test", json={"message": "TEST"})
        assert r.status_code == 200
        body = r.json()
        assert body.get("ok") is True
        assert body.get("mocked") is True


# ============ Feature 8 — Amendments ============
class TestAmendments:
    def test_generate_list_status(self, cathy_session):
        plist = cathy_session.get(f"{BASE_URL}/api/participants").json()["items"]
        primary = [p for p in plist if p.get("is_primary")][0]

        r = cathy_session.post(f"{BASE_URL}/api/amendments/generate", json={
            "participant_id": primary["id"],
            "sender_name": "Cathy Carer",
            "sender_role": "primary caregiver",
            "items": [
                {"service_name": "Physiotherapy", "change_type": "increase", "reason": "TEST mobility"},
            ],
        })
        assert r.status_code == 200, r.text
        amd = r.json()
        assert amd["status"] == "draft"
        assert primary["name"] in amd["generated_letter"]
        # provider falls back to participant.provider_name
        assert (primary.get("provider_name") or "") in amd["generated_letter"] or amd.get("provider_name")
        aid = amd["id"]

        # list
        r = cathy_session.get(f"{BASE_URL}/api/amendments")
        assert r.status_code == 200
        assert any(a["id"] == aid for a in r.json()["items"])

        # status update
        r = cathy_session.post(f"{BASE_URL}/api/amendments/{aid}/status", json={"status": "sent"})
        assert r.status_code == 200
        assert r.json()["status"] == "sent"


# ============ Feature 5 — Adviser Brand ============
class TestAdviserBrand:
    def test_get_and_update(self, mark_session):
        r = mark_session.get(f"{BASE_URL}/api/adviser/brand")
        assert r.status_code == 200, r.text
        defaults = r.json()
        assert "primary_color" in defaults

        r = mark_session.put(f"{BASE_URL}/api/adviser/brand", json={
            "firm_name": "TEST Firm",
            "contact_email": "test@example.com",
            "primary_color": "#112233",
            "logo_b64": "AAAA",
        })
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["firm_name"] == "TEST Firm"
        assert d["primary_color"] == "#112233"
        assert d["logo_b64"] == "AAAA"

        # persistence
        r = mark_session.get(f"{BASE_URL}/api/adviser/brand")
        assert r.json()["firm_name"] == "TEST Firm"

    def test_non_adviser_forbidden(self, cathy_session):
        r = cathy_session.get(f"{BASE_URL}/api/adviser/brand")
        assert r.status_code == 403
        r = cathy_session.put(f"{BASE_URL}/api/adviser/brand", json={"firm_name": "X"})
        assert r.status_code == 403


# ============ Feature 2 — Adviser Scenarios ============
class TestAdviserScenarios:
    def test_calc_and_persist(self, mark_session):
        payload = {
            "assets": 300000, "annual_income": 35000, "partner_status": "single",
            "homeowner": True, "classification": 5, "pensioner": False,
        }
        r = mark_session.post(f"{BASE_URL}/api/adviser/scenarios/calc", json=payload)
        assert r.status_code == 200, r.text
        out = r.json()
        for k in ("contribution_per_quarter", "lifetime_cap_years", "means_test_band", "assumptions"):
            assert k in out
        assert out["contribution_per_year"] > 0

        # persist
        r = mark_session.post(f"{BASE_URL}/api/adviser/scenarios", json={
            "name": "TEST scenario", "inputs": payload,
        })
        assert r.status_code == 200
        sid = r.json()["id"]

        # list
        r = mark_session.get(f"{BASE_URL}/api/adviser/scenarios")
        assert r.status_code == 200
        assert any(s["id"] == sid for s in r.json()["items"])

        # delete
        r = mark_session.delete(f"{BASE_URL}/api/adviser/scenarios/{sid}")
        assert r.status_code == 200

    def test_means_test_settings(self, mark_session):
        r = mark_session.get(f"{BASE_URL}/api/adviser/means-test/settings")
        assert r.status_code == 200
        assert r.json()["version"] == "2026-27"

    def test_non_adviser_forbidden(self, cathy_session):
        r = cathy_session.post(f"{BASE_URL}/api/adviser/scenarios/calc", json={
            "assets": 1000, "annual_income": 1000, "classification": 4,
        })
        assert r.status_code == 403


# ============ Feature 7 — Adviser Global Alerts ============
class TestAdviserAlerts:
    def test_global_alerts(self, mark_session):
        r = mark_session.get(f"{BASE_URL}/api/adviser/alerts/global")
        assert r.status_code == 200, r.text
        data = r.json()
        assert "items" in data
        assert "client_count" in data

    def test_filter_by_type_hospital(self, mark_session):
        r = mark_session.get(f"{BASE_URL}/api/adviser/alerts/global?type=hospital")
        assert r.status_code == 200
        for a in r.json()["items"]:
            assert a["type"] == "hospital"
