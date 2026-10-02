"""CSC saved-checks CRUD tests (iter 332).

Verifies the new saved-run management endpoints:
- POST /api/public/csc/run              (auth stores run against user)
- GET  /api/public/csc/runs             (list user's SAVED runs)
- PATCH /api/public/csc/runs/{id}       (name / saved toggle)
- DELETE /api/public/csc/runs/{id}      (delete)

All endpoints require an authenticated (paid-plan) user (cathy@example.com).
"""
from __future__ import annotations

import os
import pathlib
import pytest
import requests


def _load_backend_url() -> str:
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    env_path = pathlib.Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_backend_url()
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    last_err = None
    for _ in range(3):
        try:
            r = requests.post(
                f"{BASE_URL}/api/auth/login",
                json={"email": EMAIL, "password": PASSWORD},
                timeout=60,
            )
            if r.status_code == 200:
                tok = r.json().get("token")
                assert tok
                return tok
            last_err = f"{r.status_code} {r.text}"
        except Exception as e:
            last_err = str(e)
    pytest.skip(f"login failed after retries: {last_err}")


@pytest.fixture()
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _run_body():
    """Build a valid 16-answer CSCRunRequest body matching CSCAnswers schema."""
    return {
        "persona": "caregiver",
        "current_classification": 4,
        "answers": {
            "Q1_self_care_shower": "moderate",
            "Q2_self_care_dress": "moderate",
            "Q3_self_care_mobility": "moderate",
            "Q4_self_care_continence": "slight",
            "Q5_iadl_meals": "moderate",
            "Q6_iadl_cleaning_laundry": "significant",
            "Q7_iadl_medication": "moderate",
            "Q8_iadl_shopping": "significant",
            "Q9_iadl_transport": "significant",
            "Q10_cognition": "slight",
            "Q11_mood": "slight",
            "Q12_behaviour": "rarely",
            "Q13_falls_6mo": "one",
            "Q14_hospital_12mo": "zero",
            "Q15_home_environment": "slight",
            "Q16_informal_support": "some",
        },
    }


class TestCSCSavedRunsCRUD:
    """CSC saved-runs CRUD + persistence."""

    def test_1_create_run_persists_and_returns_id(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/public/csc/run",
            headers=auth_headers,
            json=_run_body(),
            timeout=30,
        )
        assert r.status_code == 200, f"score failed: {r.status_code} {r.text}"
        data = r.json()
        assert "csc_run_id" in data and isinstance(data["csc_run_id"], str)
        assert "classification" in data
        assert data["classification"].get("primary") in list(range(1, 9))
        pytest.run_id = data["csc_run_id"]  # type: ignore[attr-defined]

    def test_2_list_empty_or_ok_before_save(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/public/csc/runs", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        data = r.json()
        assert "runs" in data and isinstance(data["runs"], list)
        # Fresh scored run should not be in the SAVED list yet.
        ids = [x.get("csc_run_id") for x in data["runs"]]
        assert getattr(pytest, "run_id", None) not in ids

    def test_3_patch_save_and_name(self, auth_headers):
        run_id = getattr(pytest, "run_id")
        r = requests.patch(
            f"{BASE_URL}/api/public/csc/runs/{run_id}",
            headers=auth_headers,
            json={"name": "TEST_iter332_check", "saved": True},
            timeout=20,
        )
        assert r.status_code == 200, f"patch failed: {r.status_code} {r.text}"
        data = r.json()
        assert data["run"]["csc_run_id"] == run_id
        assert data["run"]["name"] == "TEST_iter332_check"
        assert data["run"]["saved"] is True
        # Answers should have been persisted alongside the run.
        assert data["run"].get("answers"), "answers not persisted for reopen/edit"

    def test_4_list_includes_saved_run(self, auth_headers):
        run_id = getattr(pytest, "run_id")
        r = requests.get(f"{BASE_URL}/api/public/csc/runs", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        ids = [x.get("csc_run_id") for x in r.json().get("runs", [])]
        assert run_id in ids

    def test_5_patch_rename_only(self, auth_headers):
        run_id = getattr(pytest, "run_id")
        r = requests.patch(
            f"{BASE_URL}/api/public/csc/runs/{run_id}",
            headers=auth_headers,
            json={"name": "TEST_iter332_renamed"},
            timeout=20,
        )
        assert r.status_code == 200
        assert r.json()["run"]["name"] == "TEST_iter332_renamed"
        assert r.json()["run"]["saved"] is True  # still saved

    def test_6_delete_run(self, auth_headers):
        run_id = getattr(pytest, "run_id")
        r = requests.delete(
            f"{BASE_URL}/api/public/csc/runs/{run_id}", headers=auth_headers, timeout=20
        )
        assert r.status_code == 200
        assert r.json().get("ok") is True

    def test_7_list_excludes_deleted(self, auth_headers):
        run_id = getattr(pytest, "run_id")
        r = requests.get(f"{BASE_URL}/api/public/csc/runs", headers=auth_headers, timeout=20)
        assert r.status_code == 200
        ids = [x.get("csc_run_id") for x in r.json().get("runs", [])]
        assert run_id not in ids

    def test_8_delete_nonexistent_returns_404(self, auth_headers):
        r = requests.delete(
            f"{BASE_URL}/api/public/csc/runs/does-not-exist", headers=auth_headers, timeout=20
        )
        assert r.status_code == 404

    def test_9_patch_nonexistent_returns_404(self, auth_headers):
        r = requests.patch(
            f"{BASE_URL}/api/public/csc/runs/does-not-exist",
            headers=auth_headers,
            json={"saved": True},
            timeout=20,
        )
        assert r.status_code == 404


class TestCSCAuthGuards:
    """Unauthenticated access must be rejected."""

    def test_list_requires_auth(self):
        r = requests.get(f"{BASE_URL}/api/public/csc/runs", timeout=20)
        assert r.status_code in (401, 403)

    def test_patch_requires_auth(self):
        r = requests.patch(
            f"{BASE_URL}/api/public/csc/runs/any-id",
            json={"saved": True},
            timeout=20,
        )
        assert r.status_code in (401, 403)

    def test_delete_requires_auth(self):
        r = requests.delete(f"{BASE_URL}/api/public/csc/runs/any-id", timeout=20)
        assert r.status_code in (401, 403)
