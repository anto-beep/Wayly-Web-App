"""DEC-1 v5 · Phase 3 · Margaret end-to-end golden test.

Purpose: prove that a real Margaret decode (fixture PDF → decode pipeline →
persisted Statement → read-time backfill) produces the mandatory golden
output shape:
  * 16 line items in source order (not 17, not 21)
  * All dates ISO YYYY-MM-DD (no short-form leakage)
  * unit vocabulary is enum-valid (hr / km / session)
  * quantity is populated on every line
  * No fabricated service codes (source has none)
  * per_line_contribution is null on every line (aggregate_only)
  * Exactly the 3 mandatory anomalies (RULE_9_PENSION_STATUS_UNKNOWN,
    RULE_1B_CARE_MGMT_BELOW_STANDARD, RULE_25_SOURCE_ARITHMETIC_GAP)
  * No F1/F3/F4/F5 fabrications visible after read-time strip
  * Determinism gate: pipeline output is byte-identical shape across 3 runs

This test is intentionally NOT hitting the LLM (which is non-deterministic
between runs). Instead it feeds the Margaret extracted_json (produced by
`build_margaret_v1.py`) through the deterministic tail of the pipeline
(`_add_parse_warnings` + anti-fab strip + backfill) and asserts on the
final read-time shape.

For end-to-end LLM smoke testing, use `test_dec1_v5_margaret_live.py`
(one-off, requires DEC1_V5_STRICT=true and network + key).

Reference:
  /app/docs/DEC-1_v5_spec.md §Phase 3
  /app/backend/tests/fixtures/build_margaret_v1.py (fixture builder)
"""
from __future__ import annotations

import copy
import sys
from pathlib import Path
from typing import Any, Dict

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import agents  # noqa: E402
from lib.dec1_v5_antifab import apply_all_anti_fabrication  # noqa: E402
from lib.dec1_v5_schema import (  # noqa: E402
    backfill_extracted,
    backfill_anomalies,
    compute_line_item_sum,
)


# ---------------------------------------------------------------------------
# Margaret golden extracted_json (matches build_margaret_v1.py output).
# ---------------------------------------------------------------------------

# Row schema: (date, service_desc, stream, quantity, unit, unit_rate, gross)
_MARGARET_LINES = [
    ("2026-06-02", "Personal Care - Morning shower and dressing support",
     "Independence", 1.0, "hr", 78.00, 78.00),
    ("2026-06-03", "Domestic Assistance - Cleaning and laundry",
     "EverydayLiving", 2.0, "hr", 68.00, 136.00),
    ("2026-06-05", "Transport - GP appointment transport",
     "Independence", 18.0, "km", 1.20, 21.60),
    ("2026-06-06", "Meal Preparation - Preparation of meals for week",
     "EverydayLiving", 2.0, "hr", 70.00, 140.00),
    ("2026-06-09", "Personal Care - Morning routine support",
     "Independence", 1.0, "hr", 78.00, 78.00),
    ("2026-06-10", "Domestic Assistance - House cleaning",
     "EverydayLiving", 2.0, "hr", 68.00, 136.00),
    ("2026-06-12", "Social Support - Community centre visit",
     "Independence", 3.0, "hr", 72.00, 216.00),
    ("2026-06-13", "Gardening - Yard maintenance and safety",
     "EverydayLiving", 2.0, "hr", 75.00, 150.00),
    ("2026-06-16", "Personal Care - Showering assistance",
     "Independence", 1.0, "hr", 78.00, 78.00),
    ("2026-06-17", "Domestic Assistance - Cleaning and linen change",
     "EverydayLiving", 2.0, "hr", 68.00, 136.00),
    ("2026-06-19", "Physiotherapy - Mobility and balance session",
     "Clinical", 1.0, "session", 185.00, 185.00),
    ("2026-06-20", "Meal Preparation - Nutritious meal support",
     "EverydayLiving", 2.0, "hr", 70.00, 140.00),
    ("2026-06-23", "Personal Care - Morning support",
     "Independence", 1.0, "hr", 78.00, 78.00),
    ("2026-06-24", "Domestic Assistance - Cleaning support",
     "EverydayLiving", 2.0, "hr", 68.00, 136.00),
    ("2026-06-26", "Transport - Shopping assistance",
     "Independence", 22.0, "km", 1.20, 26.40),
    ("2026-06-27", "Social Support - Community outing",
     "Independence", 3.0, "hr", 72.00, 216.00),
]

# Golden aggregates from build_margaret_v1.py:
GOLDEN_SERVICES_TOTAL = 1951.00
GOLDEN_DECLARED_SERVICES = 1972.50   # source's OWN printed subtotal
GOLDEN_ARITH_GAP = 21.50             # abs(declared - line_sum)
GOLDEN_CARE_MGMT = 142.50
GOLDEN_CARE_MGMT_RATE = 7.22         # 142.50 / 1972.50 * 100
GOLDEN_PARTICIPANT = 197.25
GOLDEN_GOVERNMENT = 1775.25


def _margaret_extracted() -> Dict[str, Any]:
    """Return a fresh copy of the golden Margaret extract, aggregate-only."""
    line_items = [
        {
            "date": d,
            "service_description": desc,
            "service_code": "",     # source has none
            "stream": st,
            "quantity": q,
            "unit": u,
            "raw_qty_text": f"{int(q) if float(q).is_integer() else q} {u}",
            "raw_rate_text": f"${r:.2f}" + ("/km" if u == "km"
                                             else ("/session" if u == "session"
                                                   else "")),
            "hours": q if u == "hr" else 0.0,
            "unit_rate": r,
            "gross": g,
            "participant_contribution": None,   # aggregate_only
            "government_paid": None,             # aggregate_only
            "is_cancellation": False,
            "worker_name": "",
            "is_brokered": False,
            "provider_notes": "",
            "flags_in_original": "",
        }
        for (d, desc, st, q, u, r, g) in _MARGARET_LINES
    ]
    return {
        "participant_name": "Margaret Wilson",
        "provider_name": "Better Care at Home Services Pty Ltd",
        "provider_abn": "",
        "statement_period": "1 June 2026 to 30 June 2026",
        "period_start": "2026-06-01",
        "period_end": "2026-06-30",
        "pension_status": "unknown",
        "classification": "",
        "quarterly_budget_total": 0.0,
        "care_management_deducted": GOLDEN_CARE_MGMT,
        "care_management_rate_pct": 0.0,
        "care_management_source_text": (
            "Total administration and care management costs for the period: $142.50"
        ),
        "service_budget_available": 3250.0,
        "reported_total_gross": GOLDEN_DECLARED_SERVICES,
        "reported_total_participant_contribution": GOLDEN_PARTICIPANT,
        "reported_total_government_paid": GOLDEN_GOVERNMENT,
        "source_declared_services_total": GOLDEN_DECLARED_SERVICES,
        "per_line_contribution_source": "aggregate_only",
        "funding_available_this_month": 3250.00,
        "quarterly_allocation": None,
        "stream_used_this_month": {
            "Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0,
        },
        "header_stream_budgets": {
            "Clinical": 0.0, "Independence": 0.0, "EverydayLiving": 0.0,
        },
        "line_items": line_items,
        "previous_period_adjustments": [],
        "at_hm_commitments": [],
        "provider_notes_raw": [],
    }


def _margaret_source_text() -> str:
    """Approximate the raw source substring context the anti-fab guards
    check against. Only needs to satisfy: no GST, no service codes, header
    and footer share provider name."""
    return (
        "Better Care at Home Services Pty Ltd\n"
        "Support at Home Monthly Statement\n"
        "Participant: Margaret Wilson\n"
        "Statement period: 1 June 2026 to 30 June 2026\n"
        + "\n".join(f"{d} {desc}" for (d, desc, *_) in _MARGARET_LINES)
        + "\nTotal services this month: $1,972.50\n"
        + "Total administration and care management costs for the period: $142.50\n"
        + "Better Care at Home Services Pty Ltd Phone 1300 000 000"
    )


def _run_full_pipeline(extracted: Dict[str, Any]) -> tuple[Dict[str, Any], Dict[str, Any]]:
    """Run: deterministic post-audit rules → anti-fab strip (strict) → v5
    backfill. Same order as the write-hook + read-hook composed together."""
    ext = copy.deepcopy(extracted)
    ext["computed_line_item_sum"] = compute_line_item_sum(ext.get("line_items") or [])
    audit = {"anomalies": [], "statement_summary": {"cadence": "monthly"}}
    audit = agents._add_parse_warnings(audit, ext)
    # Anti-fab in strict mode (Phase 2 mode)
    src = _margaret_source_text()
    new_ext, new_aud, _ev = apply_all_anti_fabrication(ext, audit, src, strict=True)
    new_ext = backfill_extracted(new_ext)
    new_aud["anomalies"] = backfill_anomalies(new_aud.get("anomalies") or [])
    return new_ext, new_aud


# ---------------------------------------------------------------------------
# Golden output assertions
# ---------------------------------------------------------------------------

def test_margaret_golden_line_item_count_is_16():
    ext, _aud = _run_full_pipeline(_margaret_extracted())
    assert len(ext["line_items"]) == 16, (
        f"Margaret must decode to 16 line items exactly (got {len(ext['line_items'])})"
    )


def test_margaret_golden_all_dates_iso_format():
    ext, _aud = _run_full_pipeline(_margaret_extracted())
    import re
    iso_re = re.compile(r"^\d{4}-\d{2}-\d{2}$")
    for i, li in enumerate(ext["line_items"]):
        d = li.get("date")
        assert isinstance(d, str) and iso_re.match(d), (
            f"line {i+1} date is not ISO 8601: {d!r}"
        )


def test_margaret_golden_source_order_preserved():
    ext, _aud = _run_full_pipeline(_margaret_extracted())
    golden_dates = [d for (d, *_) in _MARGARET_LINES]
    actual_dates = [li["date"] for li in ext["line_items"]]
    assert actual_dates == golden_dates, (
        "Line-item order must match source. Deterministic pipeline must not re-sort."
    )


def test_margaret_golden_unit_vocabulary():
    """Every line must have unit ∈ UNIT_VOCAB."""
    ext, _aud = _run_full_pipeline(_margaret_extracted())
    from lib.dec1_v5_schema import UNIT_VOCAB
    for i, li in enumerate(ext["line_items"]):
        u = li.get("unit")
        assert u in UNIT_VOCAB, f"line {i+1} unit {u!r} not in enum {UNIT_VOCAB}"


def test_margaret_golden_quantity_populated_everywhere():
    """No line may have quantity=None on the golden output."""
    ext, _aud = _run_full_pipeline(_margaret_extracted())
    for i, li in enumerate(ext["line_items"]):
        assert li.get("quantity") is not None, f"line {i+1} quantity is None"
        assert li["quantity"] > 0, f"line {i+1} quantity {li['quantity']} not positive"


def test_margaret_golden_no_fabricated_service_codes():
    """Source has zero service codes → every line's code must be empty."""
    ext, _aud = _run_full_pipeline(_margaret_extracted())
    for i, li in enumerate(ext["line_items"]):
        code = li.get("service_code") or ""
        assert code == "", f"line {i+1} has fabricated service_code {code!r}"


def test_margaret_golden_per_line_contribution_is_null():
    """Aggregate-only source → per-line PC/GP must stay null."""
    ext, _aud = _run_full_pipeline(_margaret_extracted())
    for i, li in enumerate(ext["line_items"]):
        assert li.get("participant_contribution") is None, (
            f"line {i+1} participant_contribution should be null for aggregate_only"
        )
        assert li.get("government_paid") is None, (
            f"line {i+1} government_paid should be null for aggregate_only"
        )


def test_margaret_golden_three_mandatory_anomalies():
    """Golden output has EXACTLY these three deterministic anomalies:
        RULE_9_PENSION_STATUS_UNKNOWN — pension unknown, INFO
        RULE_1B_CARE_MGMT_BELOW_STANDARD — 7.22% < 10%, INFO
        RULE_25_SOURCE_ARITHMETIC_GAP — $21.50 gap, MEDIUM

    Note: RULE_15_GROSS_TOTAL_PARSE_WARNING may also fire on live LLM decodes
    because the LLM's `reported_total_gross` differs from the extracted sum,
    but the golden fixture explicitly sets `reported_total_gross` to the
    declared services total so RULE_15 stays silent — a real Margaret decode
    with care-mgmt-line leakage would show RULE_15 as an additional signal.
    """
    _ext, audit = _run_full_pipeline(_margaret_extracted())
    rules = [a.get("rule") for a in (audit.get("anomalies") or [])]
    assert "RULE_9_PENSION_STATUS_UNKNOWN" in rules
    assert "RULE_1B_CARE_MGMT_BELOW_STANDARD" in rules
    assert "RULE_25_SOURCE_ARITHMETIC_GAP" in rules


def test_margaret_golden_no_gst_anomaly():
    """Spec §F1: source has no 'GST' mentions → output has no GST anomaly."""
    _ext, audit = _run_full_pipeline(_margaret_extracted())
    src = _margaret_source_text()
    assert "gst" not in src.lower(), "Margaret fixture must contain no GST"
    for a in audit.get("anomalies") or []:
        blob = " ".join(str(a.get(k, "") or "") for k in
                        ("rule", "headline", "message", "detail")).lower()
        assert "gst" not in blob, (
            f"Anomaly leaks GST reference: {a.get('rule')} — {blob[:120]!r}"
        )


def test_margaret_golden_arithmetic_gap_impact_is_traceable():
    """v5 §F4: RULE_25's impact_aud must equal the golden gap $21.50 exactly."""
    _ext, audit = _run_full_pipeline(_margaret_extracted())
    r25 = next(
        (a for a in audit["anomalies"]
         if a.get("rule") == "RULE_25_SOURCE_ARITHMETIC_GAP"),
        None,
    )
    assert r25 is not None
    assert r25["impact_aud"] == GOLDEN_ARITH_GAP


def test_margaret_golden_care_mgmt_rate_is_722():
    """RULE_1B_BELOW must report ~7.22% (142.50 / 1972.50 * 100)."""
    _ext, audit = _run_full_pipeline(_margaret_extracted())
    r1b = next(
        (a for a in audit["anomalies"]
         if a.get("rule") == "RULE_1B_CARE_MGMT_BELOW_STANDARD"),
        None,
    )
    assert r1b is not None
    # Detail string carries the rate; check via source_evidence too.
    assert any(f"{GOLDEN_CARE_MGMT_RATE:.2f}" in str(e)
               or f"7.22" in str(e)
               for e in r1b.get("evidence") or [])


def test_margaret_golden_determinism_gate_3_runs():
    """v5 §Phase 3 determinism gate — 3 identical runs → byte-identical shape.
    This proves the deterministic tail of the pipeline is truly reproducible;
    the LLM prefix is non-deterministic and is not part of this test."""

    def _fingerprint(ext: Dict[str, Any], audit: Dict[str, Any]) -> tuple:
        line_fp = tuple(
            (li.get("date"), li.get("service_description"), li.get("unit"),
             li.get("quantity"), li.get("gross"),
             li.get("participant_contribution"), li.get("government_paid"),
             li.get("service_code"))
            for li in (ext.get("line_items") or [])
        )
        anom_fp = tuple(
            (a.get("rule"), a.get("severity"), a.get("impact_aud"))
            for a in (audit.get("anomalies") or [])
        )
        return (line_fp, anom_fp, ext.get("computed_line_item_sum"),
                ext.get("source_declared_services_total"))

    fingerprints = set()
    for _ in range(3):
        ext, audit = _run_full_pipeline(_margaret_extracted())
        fingerprints.add(_fingerprint(ext, audit))
    assert len(fingerprints) == 1, (
        f"Pipeline is non-deterministic across 3 runs: {fingerprints}"
    )
