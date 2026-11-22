"""iter337 backend tests:
1) Participant name Title Case (POST /api/participants + PATCH + GET returns Title-Cased names, McDonald preserved).
2) CHSP invoice reader Contribution Prefill (parse-invoice pulls agreed_rate from saved service entry when missing).
"""
import io
import os
import time
import uuid
import pytest
import requests

def _load_env():
    p = "/app/frontend/.env"
    with open(p) as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or _load_env()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PASS = "testpass123"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def cathy_token():
    r = requests.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PASS}, timeout=60)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def cathy_headers(cathy_token):
    return {"Authorization": f"Bearer {cathy_token}"}


# ---------- 1. Participant name Title Case ----------
class TestParticipantTitleCase:
    def test_list_existing_participants_title_cased(self, cathy_headers):
        r = requests.get(f"{API}/participants", headers=cathy_headers, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json().get("items", [])
        assert items, "cathy should have at least one participant"
        for p in items:
            fn = p.get("first_name") or ""
            ln = p.get("last_name") or ""
            # Only assert first-letter uppercase — internal caps preserved.
            if fn:
                assert fn[0].isupper(), f"first_name '{fn}' not title-cased"
            if ln:
                assert ln[0].isupper(), f"last_name '{ln}' not title-cased"

    def test_create_lowercase_returns_title_case(self, cathy_headers):
        payload = {
            "first_name": "peter",
            "last_name": "smith",
            "dob": "1940-01-01",
            "classification_level": 4,
            "pension_status": "full_pension",
            "provider_name": "TEST_Provider",
            "statement_delivery": "email",
            "authorisation_confirmed": True,
        }
        r = requests.post(f"{API}/participants", json=payload, headers=cathy_headers, timeout=30)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["first_name"] == "Peter", data
        assert data["last_name"] == "Smith", data
        pid = data["id"]

        # GET verifies persistence
        g = requests.get(f"{API}/participants/{pid}", headers=cathy_headers, timeout=30)
        assert g.status_code == 200
        gd = g.json()
        assert gd["first_name"] == "Peter"
        assert gd["last_name"] == "Smith"

        # cleanup — archive
        requests.patch(f"{API}/participants/{pid}", json={"first_name": "TEST_Archived"}, headers=cathy_headers, timeout=30)

    def test_patch_preserves_mcdonald_internal_caps(self, cathy_headers):
        # Create with McDonald (already has internal cap), verify PATCH keeps it.
        payload = {
            "first_name": "Angus",
            "last_name": "McDonald",
            "dob": "1935-05-05",
            "classification_level": 3,
            "pension_status": "full_pension",
            "provider_name": "TEST_Provider",
            "statement_delivery": "email",
            "authorisation_confirmed": True,
        }
        r = requests.post(f"{API}/participants", json=payload, headers=cathy_headers, timeout=30)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["last_name"] == "McDonald", f"internal cap lost on create: {data['last_name']}"
        pid = data["id"]

        # PATCH with lowercase should Title-case first letter but... user says: existing internal capitals preserved
        p = requests.patch(f"{API}/participants/{pid}",
                           json={"last_name": "mcdonald"},
                           headers=cathy_headers, timeout=30)
        assert p.status_code == 200
        # 'mcdonald' -> 'Mcdonald' per docstring in text_utils (only first letter upper, internal preserved)
        assert p.json()["last_name"] == "Mcdonald"

        # Now PATCH with McDonald preserves as McDonald
        p2 = requests.patch(f"{API}/participants/{pid}",
                            json={"last_name": "McDonald"},
                            headers=cathy_headers, timeout=30)
        assert p2.status_code == 200
        assert p2.json()["last_name"] == "McDonald"


# ---------- 2. CHSP Contribution Prefill ----------
FAKE_INVOICE_TEXT_NO_RATE = (
    "TAX INVOICE\n"
    "BlueBerry Care Pty Ltd — ABN 12 345 678 901\n"
    "Invoice #: INV-TEST-337\n"
    "Date: 15/06/2026\n"
    "Client: Dorothy Smith\n"
    "\n"
    "Service Description: Domestic Assistance (in-home cleaning support)\n"
    "Service Category (CHSP): Domestic Assistance\n"
    "Period covered: 01/06/2026 to 15/06/2026\n"
    "Units billed (hours): 2\n"
    "Hours received: 2\n"
    "Amount due: $132.00\n"
    "\n"
    "(This invoice does not show a per-unit rate — please contact us if unsure.)\n"
)


class TestContributionPrefill:
    """Ensure /parse-invoice fills agreed_rate from saved chsp_service_entries when invoice omits it."""

    def _ensure_chsp_profile_and_service(self, headers):
        # Ensure profile exists
        r = requests.get(f"{API}/chsp1/profile", headers=headers, timeout=30)
        if r.status_code == 404 or (r.status_code == 200 and not r.json().get("id")):
            # Create a minimal CHSP profile
            r = requests.post(f"{API}/chsp1/profile", json={
                "provider_name": "BlueBerry Care Pty Ltd",
                "start_date": "2025-01-01",
            }, headers=headers, timeout=30)
            assert r.status_code in (200, 201), r.text

        # Ensure at least one service entry matching service_type Domestic Assistance
        entries = requests.get(f"{API}/chsp1/service-entries", headers=headers, timeout=30)
        has_da = False
        if entries.status_code == 200:
            for e in (entries.json().get("items") or entries.json() or []):
                if isinstance(e, dict) and e.get("service_type") == "Domestic Assistance" and e.get("is_active"):
                    has_da = True
                    break
        if not has_da:
            body = {
                "service_type": "Domestic Assistance",
                "provider_name": "BlueBerry Care Pty Ltd",
                "hourly_rate_or_fee": 66.0,
                "start_date": "2025-01-01",
                "is_active": True,
            }
            r = requests.post(f"{API}/chsp1/service-entries", json=body, headers=headers, timeout=30)
            assert r.status_code in (200, 201), r.text

    def test_parse_invoice_prefills_agreed_rate_from_saved(self, cathy_headers):
        self._ensure_chsp_profile_and_service(cathy_headers)
        # Build a plaintext .txt "invoice" so document_extract path is exercised
        files = {"file": ("invoice.txt", io.BytesIO(FAKE_INVOICE_TEXT_NO_RATE.encode("utf-8")), "text/plain")}
        r = requests.post(f"{API}/chsp1/fee-check/parse-invoice",
                          headers=cathy_headers,  # no Content-Type!
                          files=files, timeout=120)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "fields" in j
        fields = j["fields"]
        # service_type should be Domestic Assistance from LLM
        # If LLM didn't extract service_type, this test can't validate prefill — but we still assert shape.
        # LLM tends to return snake_case; the saved-rate match can occur against any active service entry
        # for the profile when service_type matches (or provider fallback). Assert on the contract behavior.
        st = fields.get("service_type") or ""
        assert st.lower().replace(" ", "_") == "domestic_assistance", f"unexpected service_type: {st!r}"
        assert j.get("rate_from_saved") is True, f"expected rate_from_saved=True, got {j}"
        assert fields.get("agreed_rate"), f"expected agreed_rate prefilled, got {fields}"
        assert isinstance(fields["agreed_rate"], (int, float)) and fields["agreed_rate"] > 0
        assert any("saved provider rate" in s.lower() for s in j.get("next_steps", [])), j
