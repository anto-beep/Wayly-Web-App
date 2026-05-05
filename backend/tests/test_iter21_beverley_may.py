"""
Iteration 21 — Beverley Nguyen May 2026 fixture.

Validates the six fixes:
  FIX 1 — Rule 13 underspend timing (May is mid-quarter month → no forfeit alert)
  FIX 2 — Rule 16 stream subtotal vs header discrepancy ($526 vs $455 Everyday)
  FIX 3 — Rule 17 (care plan review) + Rule 18 (service increase) from provider notes
  FIX 4 — Rule 19 large AT-HM claim ($2,500 ramp at 100% claimed)
  FIX 5 — Rule 20 ABN format ('44 619 morse 774 331' is invalid)
  FIX 6 — AT-HM stream card present, summary totals $7,591.75 / $1,413.18
"""
import asyncio
import json
import os
import pathlib
import sys

import pytest
from dotenv import load_dotenv

load_dotenv(pathlib.Path(__file__).resolve().parents[1] / ".env")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from agents import audit_statement, extract_statement  # noqa: E402

FIXTURE = pathlib.Path(__file__).parent / "fixtures" / "beverley_nguyen_may.txt"
CACHE = pathlib.Path("/tmp/beverley_may_decoded.json")


@pytest.fixture(scope="module")
def decoded():
    if CACHE.exists():
        return json.loads(CACHE.read_text())
    text = FIXTURE.read_text()

    async def go():
        ext = await extract_statement(text, "test-bev")
        aud = await audit_statement(ext, "test-bev")
        return {"extracted": ext, "audit": aud}

    out = asyncio.run(go())
    CACHE.write_text(json.dumps(out, indent=2, default=str))
    return out


# ───────── extraction shape ─────────

def test_participant_name(decoded):
    assert decoded["extracted"]["participant_name"].lower().startswith("beverley")


def test_period_is_may(decoded):
    assert decoded["extracted"]["period_end"].startswith("2026-05")


def test_provider_abn_extracted(decoded):
    abn = decoded["extracted"].get("provider_abn") or ""
    assert "44" in abn and "619" in abn  # raw value preserved (with the typo)


def test_stream_used_this_month(decoded):
    sutm = decoded["extracted"].get("stream_used_this_month") or {}
    assert isinstance(sutm, dict)
    # Header says May used: Clinical 2145, Indep 1984.75, Everyday 455
    assert abs(sutm.get("EverydayLiving", 0) - 455.0) < 5.0


# ───────── FIX 1: underspend timing ─────────

def test_no_forfeit_alert_in_may(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    assert "RULE_13_QUARTERLY_UNDERSPEND" not in rules, (
        "May is mid-quarter — must not fire underspend forfeiture alert"
    )


# ───────── FIX 2: Stream discrepancy now ONLY EverydayLiving ─────────

def test_stream_discrepancy_everyday(decoded):
    flags = [a for a in decoded["audit"].get("anomalies", []) if a.get("rule") == "RULE_16_STREAM_DISCREPANCY"]
    assert flags, "Expected RULE_16 to flag Everyday Living $526 vs $455"
    # Only Everyday Living should be flagged — never Clinical or Independence.
    for f in flags:
        assert "Everyday Living" in (f.get("headline") or ""), (
            f"Rule 16 should only flag Everyday Living; got headline: {f.get('headline')}"
        )


def test_no_clinical_independence_discrepancy(decoded):
    """Clinical and Independence stream discrepancies must not fire (they
    false-positive on extraction imprecision)."""
    flags = [a for a in decoded["audit"].get("anomalies", []) if a.get("rule") == "RULE_16_STREAM_DISCREPANCY"]
    headlines = [(f.get("headline") or "") for f in flags]
    assert not any("Clinical total" in h for h in headlines)
    assert not any("Independence total" in h for h in headlines)


# ───────── FIX 3: Exact same-date duplicate detection ─────────

def test_duplicate_transport_05_may_high(decoded):
    """The 05-May TR-003 double-charge must be flagged HIGH by the exact-match rule."""
    flags = [
        a for a in decoded["audit"].get("anomalies", [])
        if a.get("rule") == "RULE_3_DUPLICATE_EXACT" and "05" in (a.get("headline") or "")
    ]
    assert flags, "Expected exact-duplicate rule to fire on 05-May TR-003"
    assert flags[0].get("severity") == "high"


# ───────── FIX 1: Dedupe anomalies by headline ─────────

def test_anomaly_headlines_unique(decoded):
    headlines = [a.get("headline") for a in decoded["audit"].get("anomalies", []) if a.get("headline")]
    assert len(headlines) == len(set(headlines)), (
        f"Duplicate headlines found: {[h for h in headlines if headlines.count(h) > 1]}"
    )


# ───────── FIX 3: provider notes ─────────

def test_care_plan_review_due(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    assert "RULE_17_CARE_PLAN_REVIEW_DUE" in rules


def test_service_increase(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    assert "RULE_18_SERVICE_INCREASE" in rules


# ───────── FIX 4: large AT-HM claim ─────────

def test_at_hm_large_claim(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    assert "RULE_19_AT_HM_LARGE_CLAIM" in rules


# ───────── FIX 5: ABN format ─────────

def test_abn_format_invalid(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    assert "RULE_20_ABN_FORMAT" in rules


# ───────── FIX 6: AT-HM stream card + summary totals ─────────

def test_athm_stream_card_present(decoded):
    streams = decoded["audit"].get("stream_breakdown", [])
    keys = {s.get("stream") for s in streams}
    assert "ATHM" in keys, f"AT-HM card missing — got streams {keys}"


def test_summary_total_gross(decoded):
    g = decoded["audit"]["statement_summary"].get("total_gross", 0)
    assert abs(g - 7591.75) < 1.0, f"total_gross expected $7,591.75, got ${g}"


def test_summary_total_contribution(decoded):
    c = decoded["audit"]["statement_summary"].get("total_participant_contribution", 0)
    assert abs(c - 1413.18) < 1.0, f"contribution expected $1,413.18, got ${c}"


# ───────── existing rules still fire ─────────

def test_brokered_premium(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    assert "RULE_11_BROKERED_PREMIUM" in rules


def test_duplicate_transport_extracted(decoded):
    # Both 05-May TR-003 line items must be present in extraction so that
    # downstream rules (LLM Rule 3 + future deterministic dedup-detection) can fire.
    items = [li for li in decoded["extracted"]["line_items"]
             if (li.get("service_code") or "").startswith("TR")
             and "05" in (li.get("date") or "")]
    assert len(items) >= 2, f"Expected 2+ TR-003 items on 05-May, got {len(items)}"


def test_previous_period_adjustments(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    assert any(r and "RULE_10" in r for r in rules)
