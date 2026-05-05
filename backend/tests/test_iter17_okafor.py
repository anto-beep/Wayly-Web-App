"""Iter 17 — Robert Okafor March 2026 fixture regression.

Validates the pension-aware Rule 9, provider-notes-raw extraction, the
reported-totals display override, and key anomaly detection. Cached at
/app/backend/tests/fixtures/_okafor_decoded.json to keep test cheap.

Requires EMERGENT_LLM_KEY. If the cache file is missing it will do a
live decode; otherwise cached results are used.
"""
import os
import json
import asyncio
import sys
import pytest

sys.path.insert(0, "/app/backend")
from dotenv import load_dotenv  # noqa: E402
load_dotenv("/app/backend/.env")

from agents import extract_statement, audit_statement  # noqa: E402

FIXTURE_PATH = "/app/backend/tests/fixtures/robert_okafor_mar.txt"
CACHE_PATH = "/app/backend/tests/fixtures/_okafor_decoded.json"


@pytest.fixture(scope="module")
def decoded():
    use_cache = os.environ.get("DECODER_USE_CACHE", "1") == "1"
    if use_cache and os.path.exists(CACHE_PATH):
        with open(CACHE_PATH) as f:
            return json.load(f)
    with open(FIXTURE_PATH) as f:
        text = f.read()

    async def _run():
        ext = await extract_statement(text, "iter17-okafor")
        aud = await audit_statement(ext, "iter17-okafor")
        return {"extracted": ext, "audit": aud}

    data = asyncio.run(_run())
    with open(CACHE_PATH, "w") as f:
        json.dump(data, f, indent=2, default=str)
    return data


# ---------- Header & pension status ---------------------------------------

def test_participant_name(decoded):
    name = decoded["extracted"].get("participant_name") or ""
    assert "robert" in name.lower() and "okafor" in name.lower()


def test_pension_status_part_age(decoded):
    assert decoded["extracted"].get("pension_status") == "part_age_pension"


def test_period_is_single_month(decoded):
    e = decoded["extracted"]
    assert e.get("period_start") == "2026-03-01"
    assert e.get("period_end") == "2026-03-31"


def test_reported_totals_extracted(decoded):
    e = decoded["extracted"]
    assert e.get("reported_total_gross") == pytest.approx(2077.33, abs=0.5)
    assert e.get("reported_total_participant_contribution") == pytest.approx(530.71, abs=0.5)


def test_provider_notes_captured(decoded):
    notes = decoded["extracted"].get("provider_notes_raw") or []
    assert len(notes) >= 3
    combined = " ".join(notes).lower()
    assert "brokered" in combined
    assert "$89" in combined or "89.00" in combined
    assert "published" in combined or "$84.50" in combined


# ---------- Display totals (reported-total override) -----------------------

def test_display_totals_match_reported(decoded):
    s = decoded["audit"].get("statement_summary") or {}
    assert s.get("total_gross") == pytest.approx(2077.33, abs=0.5)
    assert s.get("total_participant_contribution") == pytest.approx(530.71, abs=0.5)
    assert s.get("total_government_paid") == pytest.approx(1546.62, abs=0.5)


# ---------- False positives MUST NOT appear --------------------------------

def test_no_false_positive_meal_prep_contribution(decoded):
    """Meal Prep at 50% is correct for part-age pension Everyday Living —
    must not be flagged as a contribution mismatch."""
    for a in decoded["audit"].get("anomalies", []):
        if (a.get("rule") or "").upper() != "RULE_9_CONTRIBUTION_MISMATCH":
            continue
        detail = " ".join([
            a.get("headline") or "",
            a.get("detail") or "",
            " ".join(a.get("evidence") or []),
        ]).lower()
        assert "meal" not in detail, f"False positive on meal prep: {a}"


def test_no_rule_9_when_all_rates_are_correct(decoded):
    """All Okafor line items use the correct part-age rates. Rule 9 should
    NOT fire on this fixture at all."""
    rules = [(a.get("rule") or "").upper() for a in decoded["audit"].get("anomalies", [])]
    assert "RULE_9_CONTRIBUTION_MISMATCH" not in rules, \
        f"Rule 9 fired on a fixture where all contributions are correct: anomalies={rules}"
    assert "RULE_9_PENSION_STATUS_UNKNOWN" not in rules, \
        "Pension status should be detected as part_age_pension, not unknown"


# ---------- Required anomalies -------------------------------------------

def test_rule_11_brokered_aha_premium(decoded):
    matching = [
        a for a in decoded["audit"].get("anomalies", [])
        if (a.get("rule") or "").upper() == "RULE_11_BROKERED_PREMIUM"
    ]
    assert matching, "Expected RULE_11_BROKERED_PREMIUM to fire"
    # Dollar impact should be close to $20.25 ($4.50/hr × 4.5 hrs)
    impacts = [float(a.get("dollar_impact") or 0) for a in matching]
    assert max(impacts) == pytest.approx(20.25, abs=5.0), f"Expected ~$20.25 brokered premium; got {impacts}"


def test_rule_12_unclaimed_at_hm(decoded):
    """ATHM-2026-0071 (non-slip mat, $85 unclaimed, 31 days post-approval)
    must be flagged."""
    anoms = decoded["audit"].get("anomalies", [])
    rule_12 = [a for a in anoms if (a.get("rule") or "").upper() == "RULE_12_UNCLAIMED_AT_HM_COMMITMENTS"]
    assert rule_12, "Expected RULE_12 for ATHM-2026-0071"
    combined = " ".join((a.get("headline", "") + " " + a.get("detail", "")) for a in rule_12).lower()
    assert "0071" in combined or "bathroom mat" in combined or "non-slip" in combined


def test_rule_13_quarterly_underspend(decoded):
    """$640.70 remaining = 13.3% of $4,825 — should fire LOW (within rollover cap)."""
    anoms = [
        a for a in decoded["audit"].get("anomalies", [])
        if (a.get("rule") or "").upper() == "RULE_13_QUARTERLY_UNDERSPEND"
    ]
    assert anoms, "Expected RULE_13_QUARTERLY_UNDERSPEND to fire with $640.70 underspend"
    severities = {(a.get("severity") or "").lower() for a in anoms}
    # Below rollover cap ($1000) → LOW (informational)
    assert "low" in severities


def test_rule_5_or_6_care_plan_violation(decoded):
    """Gardening service 28-Mar is not in care plan — must be flagged."""
    combined = " ".join(
        (a.get("headline") or "") + " " + (a.get("detail") or "")
        for a in decoded["audit"].get("anomalies", [])
    ).lower()
    assert "garden" in combined or "care plan" in combined, \
        "Expected garden / care-plan violation in some anomaly"


def test_rule_10_previous_adjustment(decoded):
    rules = [(a.get("rule") or "").upper() for a in decoded["audit"].get("anomalies", [])]
    assert "RULE_10_PREVIOUS_PERIOD_ADJUSTMENTS" in rules


# ---------- Sanity ----------------------------------------------------

def test_anomaly_count_matches_list(decoded):
    counts = decoded["audit"].get("anomaly_count") or {}
    anoms = decoded["audit"].get("anomalies") or []
    total = counts.get("high", 0) + counts.get("medium", 0) + counts.get("low", 0)
    assert total == len(anoms)


def test_extraction_has_line_items(decoded):
    items = decoded["extracted"].get("line_items") or []
    # Fixture has ~23 line items (3 AHA + 1 AHA cancel + 8 PC + 2 PC cancel + 1 transport
    # + 2 DA + 2 SS + 2 MP + 1 gardening + 1 care mgmt)
    assert 18 <= len(items) <= 28, f"Expected 18-28 line items; got {len(items)}"


def test_no_dedup_artifacts(decoded):
    """No duplicate signatures in the final line items."""
    items = decoded["extracted"].get("line_items") or []
    seen = set()
    for it in items:
        sig = (
            (it.get("date") or "").lower().strip(),
            (it.get("service_code") or "").upper().strip(),
            round(float(it.get("gross") or 0), 2),
            (it.get("worker_name") or "").lower().strip(),
            bool(it.get("is_cancellation")),
        )
        assert sig not in seen, f"Duplicate line item survived dedup: {sig}"
        seen.add(sig)
