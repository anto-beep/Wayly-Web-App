"""Regression: stream allocations are labelled indicative (program_average)
until a decoded statement carrying ``header_stream_budgets`` is present, at
which point the dashboard switches to ``allocation_source="statement"`` and
uses the statement's actual per-stream quarterly allocation.

Tests run live against the Wayly API.
"""
from __future__ import annotations
import os
import sys
import uuid
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
def cathy_token() -> str:
    url = _api_url()
    r = requests.post(
        f"{url}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=20,
    )
    if r.status_code != 200:
        pytest.skip(f"cathy login unavailable ({r.status_code})")
    tok = r.json().get("token")
    if not tok:
        pytest.skip("login did not return a token")
    return tok


# ---------------------------------------------------------------------------
# (1) Public Budget Calculator response carries indicative + streams_note
# ---------------------------------------------------------------------------
def test_public_budget_calc_marks_streams_indicative(cathy_token):
    r = requests.post(
        f"{_api_url()}/api/public/budget-calc",
        headers={"Authorization": f"Bearer {cathy_token}"},
        json={"classification": 4, "is_grandfathered": False,
              "current_lifetime_balance": 0.0, "expected_annual_burn": 0.0},
        timeout=20,
    )
    if r.status_code == 429:
        pytest.skip(f"rate-limited: {r.text}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("allocation_source") == "program_average"
    note = data.get("streams_note") or ""
    assert "Indicative" in note or "indicative" in note, note
    assert "individualised budget" in note, note
    assert data["streams"], "streams array must not be empty"
    for s in data["streams"]:
        assert s.get("indicative") is True, f"stream {s} must be indicative"


# ---------------------------------------------------------------------------
# (2) /api/budget/current — program_average when no statements have
#     ``header_stream_budgets``; statement when at least one does.
# ---------------------------------------------------------------------------
def _seed_household_with_statement(token: str, household_id: str, hsb: dict | None):
    """Insert a synthetic statement directly into Mongo with optional
    header_stream_budgets. Returns the inserted statement id."""
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    stmt_id = str(uuid.uuid4())
    doc = {
        "id": stmt_id,
        "household_id": household_id,
        "filename": f"pytest-streams-{stmt_id[:6]}.csv",
        "period_label": "March 2026",
        "uploaded_at": "2026-03-31T23:59:59+00:00",
        "line_items": [],
        "anomalies": [],
        "raw_text_preview": "",
        "summary": None,
    }
    if hsb is not None:
        doc["header_stream_budgets"] = hsb

    async def _go():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        await db.statements.insert_one(doc)
        client.close()

    asyncio.get_event_loop().run_until_complete(_go())
    return stmt_id


def _delete_statement(stmt_id: str):
    import asyncio
    from motor.motor_asyncio import AsyncIOMotorClient

    async def _go():
        client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        await db.statements.delete_one({"id": stmt_id})
        client.close()

    asyncio.get_event_loop().run_until_complete(_go())


def _get_household_id(token: str) -> str:
    r = requests.get(
        f"{_api_url()}/api/household",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    body = r.json() or {}
    hid = body.get("id") or (body.get("household") or {}).get("id")
    assert hid, f"household id missing in {body}"
    return hid


def _budget_current(token: str) -> dict:
    r = requests.get(
        f"{_api_url()}/api/budget/current",
        headers={"Authorization": f"Bearer {token}"},
        timeout=20,
    )
    assert r.status_code == 200, r.text
    return r.json()


def test_budget_current_falls_back_to_program_average(cathy_token):
    """When a household has no decoded statement with header_stream_budgets,
    the dashboard returns allocation_source = 'program_average' and marks the
    streams indicative."""
    # Insert a statement WITHOUT header_stream_budgets so the endpoint still
    # has zero usable header data.
    hid = _get_household_id(cathy_token)
    stmt_id = _seed_household_with_statement(cathy_token, hid, hsb=None)
    try:
        data = _budget_current(cathy_token)
        assert data.get("allocation_source") == "program_average"
        note = data.get("streams_note") or ""
        assert "individualised" in note, note
        for s in data["streams"]:
            assert s.get("indicative") is True
    finally:
        _delete_statement(stmt_id)


def test_budget_current_uses_statement_when_header_present(cathy_token):
    """When a statement carries header_stream_budgets, the dashboard returns
    those exact figures with allocation_source = 'statement'."""
    hid = _get_household_id(cathy_token)
    hsb = {"Clinical": 1500.0, "Independence": 1800.0, "EverydayLiving": 900.0}
    stmt_id = _seed_household_with_statement(cathy_token, hid, hsb=hsb)
    try:
        data = _budget_current(cathy_token)
        assert data.get("allocation_source") == "statement"
        streams_by_name = {s["stream"]: s for s in data["streams"]}
        assert streams_by_name["Clinical"]["allocated"] == pytest.approx(1500.0, abs=0.01)
        assert streams_by_name["Independence"]["allocated"] == pytest.approx(1800.0, abs=0.01)
        assert streams_by_name["Everyday Living"]["allocated"] == pytest.approx(900.0, abs=0.01)
        for s in data["streams"]:
            assert s.get("indicative") is False
        note = data.get("streams_note") or ""
        assert "latest statement" in note.lower()
    finally:
        _delete_statement(stmt_id)
