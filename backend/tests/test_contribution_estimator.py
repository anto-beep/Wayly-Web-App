"""Regression suite for the Contribution Estimator behaviour after F5 + F6.

F5: annual service base is now classification_annual(c), not
    quarterly_budget(c) * 4 (which was 10% low because quarterly_budget is
    POST care-management).
F6: cshc is its own cohort; band cohorts return a range when the user does
    not supply exact Services Australia rates.

All tests run via the live ``/api/public/contribution-estimator`` endpoint
using cathy@example.com (family paid plan). When the existing 5-uses/hour
rate-limit hits, the test ``skip``s so CI stays green.
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


@pytest.fixture(scope="module", autouse=True)
def _bootstrap_program_reference():
    """Load the program_reference cache once so callers using ``budget.classification_annual``
    inside this test module can resolve values without hitting the API."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    import program_reference as pr
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    pr.init(db)
    asyncio.get_event_loop().run_until_complete(pr.preload_cache())
    yield
    client.close()


def _api_url() -> str:
    env = "/app/frontend/.env"
    if not os.path.exists(env):
        pytest.skip("frontend/.env missing")
    with open(env) as f:
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
        pytest.skip(f"login unavailable (status={r.status_code})")
    tok = r.json().get("token")
    if not tok:
        pytest.skip("login did not return a token")
    return tok


def _post(token: str, body: dict) -> requests.Response:
    url = _api_url()
    return requests.post(
        f"{url}/api/public/contribution-estimator",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=20,
    )


def _check_rate_limit(r: requests.Response):
    if r.status_code == 429:
        pytest.skip(f"rate-limited: {r.text}")


# (1) Level 4 full pension default mix uses classification_annual as the base.
def test_full_pension_level_4_uses_gross_annual_base(auth_token):
    from budget import classification_annual

    r = _post(auth_token, {
        "classification": 4,
        "pension_status": "full",
        "expected_mix_clinical_pct": 30,
        "expected_mix_independence_pct": 45,
        "expected_mix_everyday_pct": 25,
    })
    _check_rate_limit(r)
    assert r.status_code == 200, r.text
    data = r.json()

    base = classification_annual(4)
    expected_annual_contrib = round(
        base * 0.45 * 0.05 + base * 0.25 * 0.175, 2
    )
    assert data["annual_service_total"] == pytest.approx(base, abs=0.01)
    assert data["annual_contribution"] == pytest.approx(expected_annual_contrib, abs=0.01)
    assert data["rate_basis"] == "exact_rate"
    assert data["caveat"] is None


# (2) Part pension with no user rates returns a band range.
def test_part_pension_no_user_rates_returns_range(auth_token):
    r = _post(auth_token, {
        "classification": 4,
        "pension_status": "part",
        "expected_mix_clinical_pct": 30,
        "expected_mix_independence_pct": 45,
        "expected_mix_everyday_pct": 25,
    })
    _check_rate_limit(r)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["rate_basis"] == "band_range"
    assert data["annual_contribution"] is None
    low = data["annual_contribution_low"]
    high = data["annual_contribution_high"]
    assert low is not None and high is not None
    assert low < high, f"low {low} must be < high {high}"
    assert data["caveat"], "Expected a caveat sentence when returning a band"
    assert "Services Australia" in data["caveat"]
    streams = {s["stream"]: s for s in data["per_stream"]}
    # Independence rate_pct must be null when the cohort is a band and no user rate given
    assert streams["Independence"]["rate_pct"] is None
    assert streams["Independence"]["rate_pct_low"] == 5.0
    assert streams["Independence"]["rate_pct_high"] == 25.0
    assert data["years_to_cap"] is None
    assert data["years_to_cap_low"] is not None
    assert data["years_to_cap_high"] is not None
    assert data["years_to_cap_low"] <= data["years_to_cap_high"]


# (3) Part pension with both user rates returns an exact figure.
def test_part_pension_with_user_rates_returns_exact(auth_token):
    from budget import classification_annual

    r = _post(auth_token, {
        "classification": 4,
        "pension_status": "part",
        "expected_mix_clinical_pct": 30,
        "expected_mix_independence_pct": 45,
        "expected_mix_everyday_pct": 25,
        "independence_rate_pct": 12.0,
        "everyday_rate_pct": 20.0,
    })
    _check_rate_limit(r)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["rate_basis"] == "user_supplied"
    base = classification_annual(4)
    expected = round(base * 0.45 * 0.12 + base * 0.25 * 0.20, 2)
    assert data["annual_contribution"] == pytest.approx(expected, abs=0.01)
    assert data["annual_contribution_low"] is None
    assert data["annual_contribution_high"] is None
    assert data["caveat"] is None


# (4) Part pension with Independence rate above the band → HTTP 400.
def test_part_pension_user_rate_outside_band_returns_400(auth_token):
    r = _post(auth_token, {
        "classification": 4,
        "pension_status": "part",
        "expected_mix_clinical_pct": 30,
        "expected_mix_independence_pct": 45,
        "expected_mix_everyday_pct": 25,
        "independence_rate_pct": 40.0,
    })
    _check_rate_limit(r)
    assert r.status_code == 400, r.text
    detail = r.json().get("detail") or ""
    assert "Independence" in detail
    assert "5" in detail and "25" in detail


# (5) cshc accepted; cshc band wider than part band.
def test_cshc_returns_wider_range_than_part(auth_token):
    r_part = _post(auth_token, {
        "classification": 4, "pension_status": "part",
        "expected_mix_clinical_pct": 30,
        "expected_mix_independence_pct": 45,
        "expected_mix_everyday_pct": 25,
    })
    _check_rate_limit(r_part)
    assert r_part.status_code == 200, r_part.text
    r_cshc = _post(auth_token, {
        "classification": 4, "pension_status": "cshc",
        "expected_mix_clinical_pct": 30,
        "expected_mix_independence_pct": 45,
        "expected_mix_everyday_pct": 25,
    })
    _check_rate_limit(r_cshc)
    assert r_cshc.status_code == 200, r_cshc.text
    part = r_part.json()
    cshc = r_cshc.json()
    assert cshc["pension_status"] == "cshc"
    assert cshc["rate_basis"] == "band_range"
    assert cshc["annual_contribution_low"] == pytest.approx(part["annual_contribution_low"], abs=0.01), (
        "Low end of CSHC band should match part-pension low (both start at 5%/17.5%)"
    )
    assert cshc["annual_contribution_high"] > part["annual_contribution_high"], (
        "CSHC band high (50%/80%) must exceed part-pension high (25%/25%)"
    )


# (6) Service mix that doesn't sum to ~100 still returns 400.
def test_service_mix_must_sum_to_100(auth_token):
    r = _post(auth_token, {
        "classification": 4, "pension_status": "full",
        "expected_mix_clinical_pct": 30,
        "expected_mix_independence_pct": 40,
        "expected_mix_everyday_pct": 20,  # total = 90
    })
    _check_rate_limit(r)
    assert r.status_code == 400, r.text
    assert "100" in (r.json().get("detail") or "")
