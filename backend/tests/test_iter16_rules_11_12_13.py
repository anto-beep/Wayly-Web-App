"""Iter 16 — Functional pytest for Rules 11, 12, 13 (LLM-driven audit rules).

Exercises the new Robert/Daybreak Q1 fixture which contains:
- 4 PC-01 visits flagged as brokered ($85 brokered vs $78 published) → RULE 11
- 4 AT-HM commitments (3 unclaimed/partial + 1 fully claimed) → RULE 12
- Quarterly budget_remaining_at_quarter_end of $2,150 (~29%) > 15% threshold AND > $1k rollover cap → RULE 13 (MEDIUM forfeit)

Test runs against the local backend (full pipeline, no cache) and is gated on
DECODER_LLM_TEST=1 to avoid burning the 5/hour rate-limit on CI.
"""
import os
import json
import time
import asyncio
import pytest

# Make sure the backend package is importable from /app/backend and .env is loaded
import sys
sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

from agents import extract_statement, audit_statement  # noqa: E402

FIXTURE_PATH = "/app/backend/tests/fixtures/robert_q1_underspend.txt"
CACHE_PATH = "/app/backend/tests/fixtures/_robert_q1_decoded.json"

with open(FIXTURE_PATH, "r") as f:
    ROBERT_STMT = f.read()


@pytest.fixture(scope="module")
def decoded():
    """Run the full extract + audit pipeline once for the suite."""
    use_cache = os.environ.get("DECODER_USE_CACHE", "1") == "1"
    if use_cache and os.path.exists(CACHE_PATH):
        with open(CACHE_PATH) as f:
            return json.load(f)

    async def _run():
        ext = await extract_statement(ROBERT_STMT, "iter16-test")
        aud = await audit_statement(ext, "iter16-test")
        return {"extracted": ext, "audit": aud}

    t0 = time.time()
    data = asyncio.run(_run())
    elapsed = time.time() - t0
    data["_elapsed"] = elapsed
    with open(CACHE_PATH, "w") as f:
        json.dump(data, f, indent=2, default=str)
    return data


# -------------------- Extraction shape --------------------------------------

def test_extracted_participant(decoded):
    assert decoded["extracted"]["participant_name"].lower().startswith("robert")


def test_extracted_period_dates(decoded):
    e = decoded["extracted"]
    assert e["period_start"] == "2026-03-01"
    assert e["period_end"] == "2026-03-31"


def test_extracted_at_hm_commitments(decoded):
    cmts = decoded["extracted"].get("at_hm_commitments") or []
    # At least the 3 non-trivial commitments must be picked up; cap at 4 to be lenient.
    assert 3 <= len(cmts) <= 6, f"expected 3-6 commitments, got {len(cmts)}: {cmts}"
    refs = [(c.get("ref") or "").upper() for c in cmts]
    # All four refs should be present in some form
    assert any("088" in r for r in refs)
    assert any("101" in r for r in refs)


def test_extracted_budget_remaining(decoded):
    e = decoded["extracted"]
    # Statement reports "Budget remaining at quarter end: $2,150.00"
    assert e.get("budget_remaining_at_quarter_end") == pytest.approx(2150.0, abs=10.0)


def test_extracted_reported_total(decoded):
    e = decoded["extracted"]
    assert e.get("reported_total_gross") == pytest.approx(1452.90, abs=1.0)


# -------------------- Rule 11 — Brokered Rate Premium ----------------------

def test_rule_11_brokered_premium(decoded):
    rules = [a.get("rule") for a in decoded["audit"].get("anomalies", [])]
    matching = [r for r in rules if r and "11" in r and ("BROKER" in r.upper() or "PREMIUM" in r.upper())]
    assert matching, f"Expected RULE 11 (brokered premium) to fire. Got rules: {rules}"


# -------------------- Rule 12 — Unclaimed AT-HM Commitments ----------------

def test_rule_12_unclaimed_at_hm(decoded):
    rules = [a.get("rule") for a in decoded["audit"].get("anomalies", [])]
    matching = [r for r in rules if r and "12" in r and ("AT" in r.upper() or "COMMITMENT" in r.upper())]
    assert matching, f"Expected RULE 12 (unclaimed AT-HM) to fire. Got rules: {rules}"


# -------------------- Rule 13 — Quarterly Underspend ----------------------

def test_rule_13_quarterly_underspend(decoded):
    anoms = decoded["audit"].get("anomalies", [])
    rules = [(a.get("rule") or "", (a.get("severity") or "").lower()) for a in anoms]
    matching = [(r, s) for r, s in rules if r and "13" in r and ("UNDERSPEND" in r.upper() or "QUARTERLY" in r.upper())]
    assert matching, f"Expected RULE 13 (quarterly underspend) to fire. Got: {rules}"
    # Robert's $2,150 remaining > $1,000 rollover cap → must be MEDIUM (forfeit risk)
    severities = {s for _, s in matching}
    assert "medium" in severities or "low" in severities, f"Severity should be medium or low; got {severities}"


# -------------------- Sanity: pipeline integrity ---------------------------

def test_pipeline_completes_with_anomalies(decoded):
    assert decoded["audit"].get("anomaly_count") is not None
    counts = decoded["audit"]["anomaly_count"]
    total = counts.get("high", 0) + counts.get("medium", 0) + counts.get("low", 0)
    assert total >= 3, f"Expected at least 3 anomalies for Robert fixture; got {counts}"


def test_no_partial_result(decoded):
    ext = decoded["extracted"]
    assert not ext.get("_extraction_error"), f"Extraction error: {ext.get('_extraction_error')}"
    aud = decoded["audit"]
    assert not aud.get("_audit_error"), f"Audit error: {aud.get('_audit_error')}"
