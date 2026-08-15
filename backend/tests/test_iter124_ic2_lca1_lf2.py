"""Iter 124 backend tests: IC-2 bank CSV import, LCA-1 scrape cron, LF-2 chain generation."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://proration-preview.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

CATHY_EMAIL = "cathy@example.com"
CATHY_PW = "testpass123"


@pytest.fixture(scope="module")
def cathy_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": CATHY_EMAIL, "password": CATHY_PW})
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text[:200]}"
    tok = r.json().get("token") or r.json().get("access_token")
    assert tok, f"no token in login response: {r.json()}"
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def cathy_pid(cathy_session):
    r = cathy_session.get(f"{API}/participants")
    assert r.status_code == 200
    parts = r.json()
    if isinstance(parts, dict):
        parts = parts.get("participants") or parts.get("items") or []
    assert parts, f"no participants for cathy: {parts}"
    # Prefer Dorothy
    for p in parts:
        if (p.get("name") or p.get("first_name") or "").lower().startswith("dorothy"):
            return p["id"]
    return parts[0]["id"]


# ---- IC-2 ----
class TestIC2Status:
    def test_status_surfaces(self):
        r = requests.get(f"{API}/ic2/status")
        assert r.status_code == 200
        d = r.json()
        assert "bank_csv_import" in d.get("surfaces", []), d


class TestIC2BankCsvImport:
    CSV = "Date,Description,Amount\n2026-01-15,BLUEBERRY CARE INVOICE 1234,120.50\n2026-01-20,Woolworths,45.99"

    def test_happy_path(self, cathy_session, cathy_pid):
        r = cathy_session.post(f"{API}/ic2/bank-csv-import", json={
            "participant_id": cathy_pid,
            "csv_content": self.CSV,
            "date_column": "Date",
            "description_column": "Description",
            "amount_column": "Amount",
        })
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "matched_count" in d
        assert "unmatched_count" in d
        assert "errors" in d

    def test_missing_date_column(self, cathy_session, cathy_pid):
        r = cathy_session.post(f"{API}/ic2/bank-csv-import", json={
            "participant_id": cathy_pid,
            "csv_content": self.CSV,
            "date_column": "NotAColumn",
            "description_column": "Description",
            "amount_column": "Amount",
        })
        assert r.status_code == 400, r.text[:300]

    def test_cross_household_forbidden(self, cathy_session):
        r = cathy_session.post(f"{API}/ic2/bank-csv-import", json={
            "participant_id": "does-not-exist-participant-id",
            "csv_content": self.CSV,
            "date_column": "Date",
            "description_column": "Description",
            "amount_column": "Amount",
        })
        assert r.status_code in (401, 403, 404), f"expected forbidden, got {r.status_code}"


# ---- LCA-1 ----
class TestLCA1Scrape:
    def test_scrape_runs_authenticated(self, cathy_session):
        r = cathy_session.get(f"{API}/lca1/scrape/runs")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert "runs" in d and isinstance(d["runs"], list)

    def test_run_now_forbidden_for_non_super_admin(self, cathy_session):
        r = cathy_session.post(f"{API}/lca1/scrape/run-now")
        assert r.status_code == 403, r.text[:300]


# ---- LF-2 ----
class TestLF2ChainCreate:
    def test_generate_hardship_chain(self, cathy_session, cathy_pid):
        r = cathy_session.post(f"{API}/lf2/generate-chain", json={
            "chain_key": "hardship_full",
            "participant_id": cathy_pid,
        })
        assert r.status_code in (200, 201), r.text[:400]
        d = r.json()
        # Some endpoints wrap in {chain: ..., drafts: ...}
        assert "chain" in d or "id" in d, d
        pytest.chain_result = d

    def test_list_chains(self, cathy_session, cathy_pid):
        r = cathy_session.get(f"{API}/lf2/participants/{cathy_pid}/chains")
        assert r.status_code == 200
        d = r.json()
        assert "chains" in d and "drafts" in d
        assert len(d["chains"]) >= 1
        assert len(d["drafts"]) >= 1

    def test_patch_draft(self, cathy_session, cathy_pid):
        r = cathy_session.get(f"{API}/lf2/participants/{cathy_pid}/chains")
        drafts = r.json().get("drafts") or []
        assert drafts, "need at least one draft to patch"
        did = drafts[0]["id"]
        r2 = cathy_session.patch(f"{API}/lf2/drafts/{did}", json={
            "subject": "TEST_updated_subject_iter124",
            "recipient_email": "test-recipient@example.com",
        })
        assert r2.status_code == 200, r2.text[:400]
        d2 = r2.json()
        draft = d2.get("draft") or d2
        assert draft.get("subject") == "TEST_updated_subject_iter124"
        assert draft.get("recipient_email") == "test-recipient@example.com"
