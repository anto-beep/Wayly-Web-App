"""Regression: ``POST /api/public/budget-calc`` exposes the GROSS quarterly
figure under ``quarterly_gross`` and keeps ``quarterly_total`` as a one-release
alias of the post-CM ``quarterly_usable`` figure.

This split lets the UI lead with the gross figure (matching the printed
provider statement) while still feeding existing clients that read
``quarterly_total``.
"""
from __future__ import annotations
import os
import sys
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
load_dotenv("/app/backend/.env")


def _api_url() -> str:
    env_path = "/app/frontend/.env"
    if not os.path.exists(env_path):
        pytest.skip("frontend/.env missing")
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    pytest.skip("REACT_APP_BACKEND_URL not configured")
    return ""


@pytest.fixture(scope="module")
def auth_token() -> str:
    url = _api_url()
    r = requests.post(
        f"{url}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"login unavailable ({r.status_code})")
    tok = r.json().get("token")
    if not tok:
        pytest.skip("login did not return a token")
    return tok


def _budget_calc(token: str, classification: int) -> requests.Response:
    return requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": classification, "is_grandfathered": False,
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )


@pytest.mark.parametrize("classification", [1, 4, 8])
def test_budget_calc_exposes_gross_usable_and_alias(auth_token, classification):
    r = _budget_calc(auth_token, classification)
    if r.status_code == 429:
        pytest.skip(f"rate-limited: {r.text}")
    assert r.status_code == 200, r.text
    data = r.json()
    annual = data["annual_total"]

    # F9 invariants -----------------------------------------------------
    assert "quarterly_gross" in data
    assert "quarterly_usable" in data
    assert "care_management_quarterly" in data
    assert "quarterly_total" in data, "Legacy alias must stay for one release"

    expected_gross = round(annual / 4, 2)
    expected_cm = round(expected_gross * 0.10, 2)
    expected_usable = round(expected_gross * 0.90, 2)

    assert data["quarterly_gross"] == pytest.approx(expected_gross, abs=0.01)
    assert data["care_management_quarterly"] == pytest.approx(expected_cm, abs=0.02)
    assert data["quarterly_usable"] == pytest.approx(expected_usable, abs=0.02)
    assert data["quarterly_total"] == pytest.approx(data["quarterly_usable"], abs=0.01), (
        "quarterly_total must remain an alias for quarterly_usable"
    )

    # Internal consistency: gross = usable + care_management.
    assert data["quarterly_gross"] == pytest.approx(
        data["quarterly_usable"] + data["care_management_quarterly"], abs=0.02
    )
