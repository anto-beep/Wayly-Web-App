"""Phase 2 acceptance tests — Prompts H, I, J, K, L, M, N.

These run live against the Wayly API + Mongo seed; the rate-limit harness
clears the per-IP buckets in conftest fashion before the API checks.
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
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip()
    pytest.skip("REACT_APP_BACKEND_URL missing")
    return ""


@pytest.fixture(scope="module", autouse=True)
def _bootstrap():
    """Preload the program_reference cache + clear public rate-limit buckets."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient
    import program_reference as pr
    import redis.asyncio as redis_async

    async def _setup():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        pr.init(db)
        await pr.preload_cache()
        r = redis_async.from_url(os.environ["REDIS_URL"], encoding="utf-8",
                                 decode_responses=True)
        keys = []
        async for k in r.scan_iter("*tools*"):
            keys.append(k)
        if keys:
            await r.delete(*keys)
        await r.aclose()
        client.close()

    asyncio.get_event_loop().run_until_complete(_setup())


@pytest.fixture(scope="module")
def token() -> str:
    r = requests.post(
        f"{_api_url()}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"login unavailable ({r.status_code})")
    return r.json().get("token")


# ---------------------------------------------------------------------------
# Prompt I — authoritative classification figures
# ---------------------------------------------------------------------------
def test_fallback_annual_matches_aged_care_rules_2025():
    from budget import _FALLBACK_ANNUAL
    assert _FALLBACK_ANNUAL[6] == 48114.0
    assert _FALLBACK_ANNUAL[5] == 39697.0
    assert _FALLBACK_ANNUAL[2] == 16034.0
    assert _FALLBACK_ANNUAL[3] == 21966.0


def test_budget_calc_returns_aged_care_rules_2025_annual(token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": 6, "is_grandfathered": False,
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip("rate-limited")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["annual_total"] == pytest.approx(48114.0, abs=0.01)
    assert data["quarterly_gross"] == pytest.approx(12028.50, abs=0.01)


# ---------------------------------------------------------------------------
# Prompt J — transitional HCP
# ---------------------------------------------------------------------------
def test_transitional_hcp_class_3_returns_42055(token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": 3, "is_grandfathered": True,
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip("rate-limited")
    assert r.status_code == 200, r.text
    assert r.json()["annual_total"] == pytest.approx(42055.0, abs=0.01)
    assert r.json()["is_transitional_hcp"] is True


def test_ongoing_class_1_unchanged(token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": 1, "is_grandfathered": False,
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip("rate-limited")
    assert r.status_code == 200, r.text
    assert r.json()["annual_total"] == pytest.approx(10731.0, abs=0.01)
    assert r.json()["is_transitional_hcp"] is False


def test_transitional_class_5_rejected(token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": 5, "is_grandfathered": True,
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip("rate-limited")
    assert r.status_code == 400, r.text
    assert "1-4" in (r.json().get("detail") or "")


# ---------------------------------------------------------------------------
# Prompt K — pathways helper
# ---------------------------------------------------------------------------
def test_pathway_restorative_care():
    import program_reference as pr
    p = pr.get_pathway("restorative_care")
    assert p["daily_aud"] == pytest.approx(53.67, abs=0.01)
    assert p["duration_days"] == 112


def test_public_snapshot_exposes_pathways_and_assistance_dog():
    import program_reference as pr
    snap = pr.public_snapshot()
    assert "pathways" in snap
    assert snap["pathways"]["restorative_care"]["daily_aud"] == pytest.approx(53.67, abs=0.01)
    assert snap["pathways"]["end_of_life"]["episode_aud"] == pytest.approx(25000.0, abs=0.01)
    assert "assistance_dog_tier" in snap
    assert snap["assistance_dog_tier"]["amount_aud"] == pytest.approx(2000.0, abs=0.01)


# ---------------------------------------------------------------------------
# Prompt L — AT-HM tiers
# ---------------------------------------------------------------------------
def test_athm_tiers_exposed():
    import program_reference as pr
    snap = pr.public_snapshot()
    assert snap["athm_tiers"]["tier"]["medium"]["amount_aud"] == pytest.approx(2000.0, abs=0.01)
    assert snap["athm_tiers"]["tier"]["high"]["amount_aud"] == pytest.approx(15000.0, abs=0.01)
    assert snap["athm_tiers"]["tier"]["high"]["one_per_lifetime"] is True


def test_rule_11b_fires_on_athm_overshoot_without_approval():
    from agents import _add_parse_warnings
    extracted = {
        "line_items": [{
            "date": "2026-03-15", "service_code": "ATHM-2026-0118",
            "service_description": "Stair lift install", "stream": "ATHM",
            "hours": 0.0, "unit_rate": 17000.0, "gross": 17000.0,
            "participant_contribution": 0.0, "government_paid": 17000.0,
            "is_cancellation": False,
        }],
        "provider_notes_raw": ["AT-HM commitment 0118 invoiced this period."],
        "previous_period_adjustments": [], "pension_status": "unknown",
    }
    out = _add_parse_warnings({"anomalies": []}, extracted)
    rules = [a.get("rule") for a in out["anomalies"]]
    assert "RULE_11B_ATHM_AMOUNT_EXCEEDS_TIER" in rules


def test_rule_11b_silent_with_approval():
    from agents import _add_parse_warnings
    extracted = {
        "line_items": [{
            "date": "2026-03-15", "service_code": "ATHM-2026-0118",
            "service_description": "Stair lift install", "stream": "ATHM",
            "hours": 0.0, "unit_rate": 17000.0, "gross": 17000.0,
            "participant_contribution": 0.0, "government_paid": 17000.0,
            "is_cancellation": False,
        }],
        "provider_notes_raw": ["AT-HM exceedance approved 2026-05-12 with OT prescription."],
        "previous_period_adjustments": [], "pension_status": "unknown",
    }
    out = _add_parse_warnings({"anomalies": []}, extracted)
    rules = [a.get("rule") for a in out["anomalies"]]
    assert "RULE_11B_ATHM_AMOUNT_EXCEEDS_TIER" not in rules


# ---------------------------------------------------------------------------
# Prompt M — supplements
# ---------------------------------------------------------------------------
def test_supplement_helpers():
    import program_reference as pr
    oxygen = pr.get_supplement("oxygen")
    assert oxygen["daily_aud"] == pytest.approx(14.66, abs=0.01)
    assert oxygen["grandfathered_only"] is False
    assert len(pr.list_supplements()) == 7  # six primary + provider CM
    snap = pr.public_snapshot()
    assert snap["supplements"]["dementia_cognition"]["grandfathered_only"] is True


# ---------------------------------------------------------------------------
# Prompt N — wiring into budget calculator + decoder
# ---------------------------------------------------------------------------
def test_budget_calc_with_oxygen_supplement(token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": 4, "is_grandfathered": False,
              "applicable_supplements": ["oxygen"],
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip("rate-limited")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["annual_total"] == pytest.approx(29696.0, abs=0.01)
    assert data["annual_supplements_total"] == pytest.approx(5350.90, abs=0.01)
    assert data["annual_total_with_supplements"] == pytest.approx(35046.90, abs=0.01)


def test_budget_calc_dementia_supplement_filtered_for_non_grandfathered(token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": 4, "is_grandfathered": False,
              "applicable_supplements": ["dementia_cognition"],
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip("rate-limited")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["annual_supplements_total"] == 0
    assert any("grandfathered" in w.lower() for w in data["supplement_warnings"])


def test_budget_calc_provider_supplement_filtered(token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {token}"},
        json={"classification": 4, "is_grandfathered": False,
              "applicable_supplements": ["care_management_provider"],
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip("rate-limited")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["annual_supplements_total"] == 0
    assert any("provider-based" in w.lower() for w in data["supplement_warnings"])


def test_decoder_silent_on_correct_oxygen_supplement():
    from agents import _add_parse_warnings
    extracted = {
        "line_items": [{
            "date": "2026-03-10", "service_code": "oxygen",
            "service_description": "Oxygen supplement", "stream": "supplement",
            "hours": 0.0, "unit_rate": 14.66, "gross": 454.46,
            "participant_contribution": 0.0, "government_paid": 454.46,
            "is_cancellation": False,
        }],
        "provider_notes_raw": [], "previous_period_adjustments": [],
        "pension_status": "unknown",
    }
    out = _add_parse_warnings({"anomalies": []}, extracted)
    rules = [a.get("rule") for a in out["anomalies"]]
    assert "RULE_16_SUPPLEMENT_AMOUNT_VARIANCE" not in rules


def test_decoder_flags_wrong_oxygen_supplement():
    from agents import _add_parse_warnings
    extracted = {
        "line_items": [{
            "date": "2026-03-10", "service_code": "oxygen",
            "service_description": "Oxygen supplement", "stream": "supplement",
            "hours": 0.0, "unit_rate": 16.00, "gross": 496.00,
            "participant_contribution": 0.0, "government_paid": 496.00,
            "is_cancellation": False,
        }],
        "provider_notes_raw": [], "previous_period_adjustments": [],
        "pension_status": "unknown",
    }
    out = _add_parse_warnings({"anomalies": []}, extracted)
    rules = [a.get("rule") for a in out["anomalies"]]
    assert "RULE_16_SUPPLEMENT_AMOUNT_VARIANCE" in rules


def test_chat_template_documents_supplements():
    """Ask Wayly system prompt must include supplement and pathway facts."""
    import agents
    template = agents.CHAT_SYSTEM_TEMPLATE
    assert "14.66" in template
    assert "Restorative Care Pathway" in template
    assert "196-15" in template
