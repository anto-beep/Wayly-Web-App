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
    """The 05-May TR-003 double-charge must be flagged HIGH (either by the
    deterministic exact-match rule or the LLM auditor — both are RULE_3 family).
    Only ONE RULE_3 family flag should fire (cross-source dedup)."""
    flags = [
        a for a in decoded["audit"].get("anomalies", [])
        if (a.get("rule") or "").startswith("RULE_3")
    ]
    assert flags, "Expected RULE_3 family to fire on 05-May TR-003"
    assert any(f.get("severity") == "high" for f in flags), (
        f"Expected at least one HIGH-severity transport duplicate flag; got severities {[f.get('severity') for f in flags]}"
    )
    assert len(flags) == 1, (
        f"Expected ONE RULE_3 family flag (cross-source dedup); got {len(flags)}: "
        f"{[f.get('rule') for f in flags]}"
    )


# ───────── FIX 1: Dedupe anomalies by headline ─────────

# ───────── FIX 1: Dedupe anomalies by fingerprint ─────────

def test_anomaly_fingerprints_unique(decoded):
    """No two anomalies of the SAME RULE FAMILY share both date + service_code + dollar_impact.
    (Different rule families about the same line — e.g. Rule 2 rate-accuracy and
    Rule 6 worker-substitution on the same nursing visit — are legitimately distinct.)"""
    import re
    DATE_RE = re.compile(r"\b(\d{4}-\d{2}-\d{2}|\d{1,2}[-\s][A-Za-z]{3,9})\b")
    CODE_RE = re.compile(r"\b([A-Z]{2,5}-\d{2,4})\b")
    RULE_RE = re.compile(r"^(RULE_\d+)")

    seen = set()
    for a in decoded["audit"].get("anomalies", []):
        blob = (a.get("detail") or "") + " " + " ".join(str(e) for e in (a.get("evidence") or []))
        d = DATE_RE.search(blob)
        c = CODE_RE.search(blob)
        date = d.group(1).lower() if d else ""
        code = c.group(1).lower() if c else ""
        try:
            dollars = round(float(a.get("dollar_impact") or 0), 2)
        except Exception:
            dollars = 0.0
        rm = RULE_RE.match((a.get("rule") or "").upper())
        rule_prefix = rm.group(1) if rm else (a.get("rule") or "")
        if not date and not code:
            continue  # provider-note-style flags not fingerprintable
        key = (rule_prefix, date, code, dollars)
        assert key not in seen, f"Duplicate fingerprint: {key} | rule {a.get('rule')}"
        seen.add(key)


# ───────── FIX 3: No speculative brokered-rate flags ─────────

def test_no_speculative_brokered_flags(decoded):
    for a in decoded["audit"].get("anomalies", []):
        text = ((a.get("detail") or "") + " " + (a.get("headline") or "")).lower()
        if "brokered" not in text:
            continue
        # Must contain at least 2 distinct $-amount references (the published rate AND the brokered rate).
        import re as _re
        amounts = set()
        blob = (a.get("detail") or "") + " " + " ".join(str(e) for e in (a.get("evidence") or []))
        for m in _re.finditer(r"\$([0-9]+(?:\.[0-9]{1,2})?)", blob):
            amounts.add(round(float(m.group(1)), 2))
        assert len(amounts) >= 2, (
            f"Brokered anomaly without 2 explicit rate references: {a.get('rule')} | {a.get('headline')} | amounts={amounts}"
        )


# ───────── FIX 4: 19-May TR-003 must be extracted ─────────

def test_19_may_transport_present(decoded):
    items = [
        li for li in decoded["extracted"]["line_items"]
        if (li.get("service_code") or "").upper().startswith("TR")
        and "19" in (li.get("date") or "")
    ]
    assert items, "Expected the 19-May TR-003 community transport to be extracted"


def test_all_three_transport_dates_present(decoded):
    """5-May (×2 duplicate) and 19-May should all appear — exact-duplicate
    detection must not eat the 19-May because it's a different date."""
    dates = set()
    for li in decoded["extracted"]["line_items"]:
        if (li.get("service_code") or "").upper().startswith("TR"):
            d = (li.get("date") or "").strip()
            # Pull just the day portion so we accept "05-May", "2026-05-05", etc.
            for token in d.replace("-", " ").split():
                if token.isdigit() and 1 <= int(token) <= 31:
                    dates.add(int(token))
                    break
    assert {5, 19}.issubset(dates), f"Expected transport on days 5 and 19, got days {sorted(dates)}"


# ───────── FIX 1 (iter 25): No PT speculation, no hedge language ─────────

def test_no_pt_speculation(decoded):
    """Physiotherapy must never appear in a brokered-rate flag (PT statements
    don't disclose published rate, so any flag would be speculation)."""
    for a in decoded["audit"].get("anomalies", []):
        if (a.get("rule") or "").startswith("RULE_11"):
            blob = ((a.get("detail") or "") + " " + (a.get("headline") or "")).lower()
            assert "physiotherapy" not in blob and "pt-" not in blob, (
                f"Brokered flag mentions PT but the statement doesn't disclose PT rates: {a.get('headline')}"
            )


def test_no_hedge_language_in_brokered_flags(decoded):
    """Brokered flags must not contain estimation/inference language."""
    forbidden = (
        "approximately", "may exceed", "could indicate", "likely premium",
        "appears to exceed", "cannot be calculated", "partially disclosed",
        "potential premium", "hidden premium", "consistent with",
    )
    for a in decoded["audit"].get("anomalies", []):
        blob = ((a.get("detail") or "") + " " + (a.get("headline") or "")).lower()
        if "brokered" not in blob:
            continue
        for f in forbidden:
            assert f not in blob, (
                f"Brokered flag contains forbidden hedge phrase '{f}': {a.get('headline')}"
            )


# ───────── FIX 2 (iter 25): No false-positive RCP ─────────

def test_no_rcp_false_positive(decoded):
    """Beverley's only hospital reference is an outpatient cardiology REVIEW,
    not an inpatient admission. RCP rule must not fire."""
    for a in decoded["audit"].get("anomalies", []):
        rule = (a.get("rule") or "").upper()
        assert not rule.startswith("RULE_7"), (
            f"RCP/Rule 7 fired without inpatient admission evidence: {a.get('headline')}"
        )


# ───────── FIX 4 (iter 25): No no-anomaly commentary ─────────

def test_no_no_anomaly_commentary(decoded):
    """User-facing anomalies must never describe what they DIDN'T find."""
    forbidden_phrases = (
        "no anomaly", "no issue found", "no issue identified", "no concerns",
        "standard rate applies", "weekday rate is correct",
        "is a friday", "is a weekday", "no premium applies", "no flag required",
    )
    for a in decoded["audit"].get("anomalies", []):
        blob = ((a.get("detail") or "") + " " + (a.get("headline") or "")).lower()
        for f in forbidden_phrases:
            assert f not in blob, (
                f"Anomaly contains no-anomaly commentary '{f}': {a.get('headline')}"
            )


# ───────── FIX 3 (iter 25): Merged flag has no duplicated sentences ─────────

def test_merged_flag_no_duplicate_sentences(decoded):
    for a in decoded["audit"].get("anomalies", []):
        if (a.get("rule") or "") != "RULE_17_18_REVIEW_AND_INCREASE_MERGED":
            continue
        # Split detail into sentences and check each first-40-char prefix is unique.
        import re
        parts = [p.strip() for p in re.split(r"[.!?]+", a.get("detail") or "") if len(p.strip()) > 10]
        prefixes = [p[:40].lower() for p in parts]
        assert len(prefixes) == len(set(prefixes)), (
            f"Merged flag has duplicate sentence prefixes: {prefixes}"
        )


def test_anomaly_headlines_unique(decoded):
    headlines = [a.get("headline") for a in decoded["audit"].get("anomalies", []) if a.get("headline")]
    assert len(headlines) == len(set(headlines)), (
        f"Duplicate headlines found: {[h for h in headlines if headlines.count(h) > 1]}"
    )


# ───────── FIX 3: provider notes ─────────

def test_care_plan_review_or_merged(decoded):
    rules = {a.get("rule") for a in decoded["audit"].get("anomalies", [])}
    # Either standalone review OR the merged review+increase rule must be present.
    assert (
        "RULE_17_CARE_PLAN_REVIEW_DUE" in rules
        or "RULE_17_18_REVIEW_AND_INCREASE_MERGED" in rules
    )


def test_review_and_increase_merged_when_both_present(decoded):
    rules = [a.get("rule") for a in decoded["audit"].get("anomalies", [])]
    has_review = any(r == "RULE_17_CARE_PLAN_REVIEW_DUE" for r in rules)
    has_increase = any(r == "RULE_18_SERVICE_INCREASE" for r in rules)
    has_merged = any(r == "RULE_17_18_REVIEW_AND_INCREASE_MERGED" for r in rules)
    # If the merged rule is present, neither standalone should be.
    if has_merged:
        assert not has_review and not has_increase, (
            "Merged rule + standalone present — they should be replaced, not duplicated"
        )
    # And: when the Beverley fixture is processed, BOTH source flags hit, so we
    # expect the merged form (not two separate flags).
    assert has_merged, "Beverley statement has both review-due (Note 4) and nursing increase (Note 2) — they must merge"


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
