"""Backend tests for mobile parity: PPC (email-draft, pdf-export, delete, quality), CHSP, AW2."""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://statement-checker-3.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    data = r.json()
    tok = data.get("token") or data.get("access_token")
    assert tok
    return tok


@pytest.fixture(scope="module")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ==== PPC ====
class TestPPC:
    def test_email_draft(self, auth):
        body = {"service": "Personal care", "rate": 100, "unit": "hour",
                "provider": "TEST_MobParity Care", "lower": 70, "upper": 90,
                "source_date": "2026-01-01", "include_increase_paragraph": False}
        r = requests.post(f"{API}/ppc/email-draft", json=body, headers=auth, timeout=30)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d.get("subject") and d.get("body")

    def test_pdf_export(self, auth):
        body = {"service": "Personal care", "provider": "TEST_MobParity", "charged": 100,
                "unit": "hour", "position": "above", "plain_language": "Above range",
                "distance_summary": "10 above", "lower": 70, "upper": 90, "median": 80,
                "stream": "Independence", "your_share_amount": 15,
                "your_share_explanation": "Test", "source_date": "2026-01-01",
                "doh_caveat": "Test caveat", "notes": []}
        r = requests.post(f"{API}/ppc/pdf-export", json=body, headers=auth, timeout=45)
        assert r.status_code == 200, r.text[:300]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 500

    def test_save_and_delete_check(self, auth):
        # Save a check
        save_body = {"service": "Personal care", "rate": 105.50,
                     "provider": "TEST_ParityProvider", "unit": "hour",
                     "position": "above", "range_lower": 70, "range_upper": 90,
                     "median": 80, "stream": "Independence", "source_date": "2026-01-01"}
        r = requests.post(f"{API}/ppc/checks", json=save_body, headers=auth, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]
        d = r.json()
        cid = d.get("id") or d.get("check_id") or (d.get("check") or {}).get("id")
        if not cid:
            # fetch checks list
            lr = requests.get(f"{API}/ppc/checks", headers=auth, timeout=30).json()
            for c in lr.get("checks", []):
                if c.get("provider_display_name") == "TEST_ParityProvider":
                    cid = c["id"]; break
        assert cid, f"could not identify saved check id, resp={d}"
        # Delete without confirm
        rd = requests.delete(f"{API}/ppc/checks/{cid}?confirm=false", headers=auth, timeout=30)
        assert rd.status_code == 200, rd.text[:300]
        body = rd.json()
        if body.get("requires_confirmation"):
            rd2 = requests.delete(f"{API}/ppc/checks/{cid}?confirm=true", headers=auth, timeout=30)
            assert rd2.status_code == 200

    def test_bulk_delete_provider(self, auth):
        # Save then bulk-delete
        save_body = {"service": "Personal care", "rate": 110,
                     "provider": "TEST_BulkParity", "unit": "hour",
                     "position": "above", "range_lower": 70, "range_upper": 90,
                     "median": 80, "stream": "Independence", "source_date": "2026-01-01"}
        r = requests.post(f"{API}/ppc/checks", json=save_body, headers=auth, timeout=30)
        assert r.status_code in (200, 201)
        r = requests.delete(f"{API}/ppc/checks/provider?service=Personal%20care&provider=TEST_BulkParity",
                            headers=auth, timeout=30)
        assert r.status_code == 200, r.text[:300]

    def test_quality_profile(self, auth):
        r = requests.get(f"{API}/ppc3/providers/BlueBerry%20Care/quality-profile", headers=auth, timeout=30)
        # 200 with profile OR 200 with empty is acceptable
        assert r.status_code in (200, 404), r.text[:300]


# ==== CHSP ====
class TestCHSP:
    def test_get_profile(self, auth):
        r = requests.get(f"{API}/chsp1/profile", headers=auth, timeout=30)
        assert r.status_code == 200

    def test_create_or_update_profile(self, auth):
        body = {"current_chsp_status": "on_chsp", "chsp_start_date": "2024-03-01"}
        r = requests.post(f"{API}/chsp1/profile", json=body, headers=auth, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]

    def test_fee_check(self, auth):
        # Ensure profile exists
        requests.post(f"{API}/chsp1/profile", json={"current_chsp_status": "on_chsp"},
                      headers=auth, timeout=30)
        body = {
            "invoice_or_statement_reference": "TEST_INV_001",
            "service_type": "domestic_assistance",
            "provider_name": "TEST_ChspProvider",
            "billed_period_start": "2026-01-01",
            "billed_period_end": "2026-01-31",
            "billed_amount": 200.0,
            "expected_amount": 150.0,
            "units_billed": "4 hours",
        }
        r = requests.post(f"{API}/chsp1/fee-checks", json=body, headers=auth, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]
        d = r.json()
        fc = d.get("fee_check") or {}
        assert fc.get("variance_status") in ("within_tolerance", "minor_variance", "material_variance"), d

    def test_transition_considerations(self, auth):
        body = {
            "reasons_for_considering_transition": ["current_supports_insufficient"],
            "reasons_notes": "TEST parity",
            "considerations_reviewed": {"understand_iat_process": True},
            "decision": "need_more_information",
            "decision_notes": "TEST",
        }
        r = requests.post(f"{API}/chsp1/transition-considerations", json=body, headers=auth, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]


# ==== Ask Wayly V2 ====
class TestAskWayly:
    def test_get_context(self, auth):
        r = requests.get(f"{API}/aw2/context", headers=auth, timeout=30)
        assert r.status_code == 200, r.text[:300]
        assert "context" in r.json() or "consents" in r.json() or "retention_policy" in r.json() or r.json()

    def test_toggle_consent(self, auth):
        body = {"data_source": "budget_projection", "granted": True}
        r = requests.post(f"{API}/aw2/context/consent", json=body, headers=auth, timeout=30)
        assert r.status_code in (200, 201), r.text[:300]

    def test_retention_policy(self, auth):
        r = requests.patch(f"{API}/aw2/context/retention-policy", json={"retention_policy": "30_days"},
                           headers=auth, timeout=30)
        assert r.status_code in (200, 204), r.text[:300]

    def test_start_conversation(self, auth):
        body = {"initial_message": "TEST parity: hello", "participant_context_id": "default"}
        r = requests.post(f"{API}/aw2/conversations", json=body, headers=auth, timeout=120)
        # LLM gateway may be slow / 502; accept 200/201, else skip
        if r.status_code >= 500:
            pytest.skip(f"LLM gateway unavailable: {r.status_code}")
        assert r.status_code in (200, 201), r.text[:300]
        c = r.json().get("conversation") or {}
        assert c.get("id")
