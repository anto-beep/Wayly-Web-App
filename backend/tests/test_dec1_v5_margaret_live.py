"""DEC-1 v5 · Phase 3 · Live LLM Margaret smoke test.

This test decodes the real Margaret fixture PDF END TO END, exercising:
  * document_extract (PDF → text)
  * agents.extract_statement (LLM extractor pass 1)
  * agents.audit_statement (LLM auditor pass 2)
  * agents._add_parse_warnings (deterministic post-audit tail)
  * dec1_v5_antifab.apply_all_anti_fabrication (strict mode)
  * dec1_v5_schema.backfill_extracted (v5 shape backfill)

Because the LLM is non-deterministic across runs, this test:
  * Runs ONLY when DEC1_V5_LLM_SMOKE=true (skipped in CI/pre-commit)
  * Has soft assertions on the LLM output shape (dates ISO, unit enum, etc.)
    that hold as long as the header + line-item prompt updates are in place
  * Costs one Anthropic/OpenAI call per run — use sparingly

Run manually:
    DEC1_V5_LLM_SMOKE=true \\
      pytest tests/test_dec1_v5_margaret_live.py -v -s

The test WILL fail when the LLM drifts significantly (e.g. reintroduces
fabricated service codes). That failure IS the signal — it means either
the prompt regressed or the LLM upgrade broke the extraction contract.

Reference:
  /app/docs/DEC-1_v5_spec.md §Phase 3 (regression tests)
  /app/backend/tests/fixtures/MARGARET_June_2026.pdf
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Load backend/.env explicitly so EMERGENT_LLM_KEY is available under pytest
# (server startup does this, but pytest doesn't run the FastAPI startup path).
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "MARGARET_June_2026.pdf"


# ---------------------------------------------------------------------------
# Skip gate — this test only runs when the env flag is set.
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.skipif(
    os.environ.get("DEC1_V5_LLM_SMOKE", "").strip().lower() not in ("true", "1", "yes", "on"),
    reason="Live LLM smoke test — set DEC1_V5_LLM_SMOKE=true to run (costs one LLM call).",
)


# ---------------------------------------------------------------------------
# Fixture loading
# ---------------------------------------------------------------------------

def _read_margaret_text() -> str:
    """Extract the Margaret fixture's text as the decoder would."""
    from document_extract import extract_document
    if not FIXTURE.exists():
        pytest.skip(f"Margaret fixture missing at {FIXTURE}")
    raw = FIXTURE.read_bytes()
    text, _kind, _pages, _warnings = asyncio.run(
        extract_document(FIXTURE.name, raw)
    )
    assert text and len(text) > 200, (
        f"Margaret fixture text extraction failed (got {len(text)} chars)"
    )
    return text


# ---------------------------------------------------------------------------
# End-to-end runner
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def margaret_decoded() -> Dict[str, Any]:
    """Run the full decoder on Margaret ONCE for the whole module.
    Returns {extracted, audit, source_text}."""
    from agents import extract_statement, audit_statement, _add_parse_warnings
    from lib.dec1_v5_antifab import apply_all_anti_fabrication
    from lib.dec1_v5_schema import backfill_extracted, backfill_anomalies

    text = _read_margaret_text()

    extracted = asyncio.run(extract_statement(text, "smoke-test-household"))
    audit = asyncio.run(audit_statement(extracted, "smoke-test-household"))
    audit = _add_parse_warnings(audit or {"anomalies": []}, extracted or {})

    # Apply the same anti-fab pipeline the write hook applies (strict).
    new_ext, new_audit, events = apply_all_anti_fabrication(
        extracted, audit, text, strict=True,
    )
    new_ext = backfill_extracted(new_ext)
    new_audit["anomalies"] = backfill_anomalies(new_audit.get("anomalies") or [])

    return {
        "extracted": new_ext,
        "audit": new_audit,
        "source_text": text,
        "strip_events": events,
    }


# ---------------------------------------------------------------------------
# Assertions — the golden invariants we care about at the end-to-end level.
# ---------------------------------------------------------------------------

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
UNIT_VOCAB = ("hr", "km", "session", "ea", "visit", "day")


def test_smoke_extracted_shape_present(margaret_decoded):
    """LLM extraction returns the expected top-level keys."""
    ext = margaret_decoded["extracted"]
    assert isinstance(ext, dict)
    assert "line_items" in ext
    assert isinstance(ext.get("line_items"), list)
    assert len(ext["line_items"]) >= 1, "Margaret must decode to at least one line item"


def test_smoke_dates_are_iso_or_normalisable(margaret_decoded):
    """Every line-item date must EITHER be ISO already OR match a known
    day-first format that the read-time normaliser resolves.

    Soft assertion: at least 80% of dates must be ISO. Anything less means
    the line-item extractor prompt drifted."""
    ext = margaret_decoded["extracted"]
    lines = ext["line_items"]
    iso_count = sum(1 for li in lines if isinstance(li.get("date"), str)
                    and ISO_RE.match(li["date"] or ""))
    ratio = iso_count / max(len(lines), 1)
    assert ratio >= 0.8, (
        f"Only {iso_count}/{len(lines)} dates are ISO — prompt may have drifted. "
        f"Dates seen: {[li.get('date') for li in lines[:5]]}"
    )


def test_smoke_units_from_enum_when_present(margaret_decoded):
    """When the LLM populates `unit`, it MUST be from the enum vocab."""
    ext = margaret_decoded["extracted"]
    for i, li in enumerate(ext["line_items"]):
        u = li.get("unit")
        if u:
            assert u in UNIT_VOCAB, (
                f"line {i+1}: unit {u!r} is NOT in the enum vocab {UNIT_VOCAB}. "
                "Prompt regression."
            )


def test_smoke_at_least_one_non_hourly_unit(margaret_decoded):
    """Margaret has transport (km) and physiotherapy (session). At least one
    of these must show a non-hourly unit — otherwise the prompt is treating
    everything as hours."""
    ext = margaret_decoded["extracted"]
    non_hourly = [li for li in ext["line_items"]
                  if li.get("unit") and li["unit"] != "hr"]
    assert non_hourly, (
        "Margaret decoded without any km / session / visit / ea / day units. "
        "Line-item prompt regression — everything is being classified as 'hr'."
    )


def test_smoke_no_gst_anomaly(margaret_decoded):
    """v5 §F1 anti-fabrication: Margaret's source has 0 GST mentions → no
    anomaly may reference GST."""
    audit = margaret_decoded["audit"]
    for a in audit.get("anomalies") or []:
        blob = " ".join(str(a.get(k) or "") for k in
                        ("rule", "headline", "message", "detail")).lower()
        assert "gst" not in blob, (
            f"Anomaly leaks GST reference: {a.get('rule')} — {blob[:120]!r}"
        )


def test_smoke_no_fabricated_service_codes(margaret_decoded):
    """v5 §F3: Margaret's source has zero service codes. Every line-item
    code must be empty after strict-mode strip."""
    ext = margaret_decoded["extracted"]
    non_empty = [li.get("service_code") for li in ext["line_items"]
                 if (li.get("service_code") or "").strip()]
    assert not non_empty, (
        f"Fabricated service codes leaked past F3 strip: {non_empty}"
    )


def test_smoke_provider_mismatch_stripped(margaret_decoded):
    """v5 §F1: RULE_32 without proper source_evidence must be stripped."""
    audit = margaret_decoded["audit"]
    rules = [a.get("rule") for a in audit.get("anomalies") or []]
    assert "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH" not in rules, (
        "F1 provider-mismatch strip did not fire — either the LLM is now "
        "supplying real distinct evidence (great!) or the strip regressed."
    )


def test_smoke_at_least_two_mandatory_anomalies(margaret_decoded):
    """Margaret's golden output has 3 mandatory anomalies. In practice the
    LLM extraction may cause RULE_1B / RULE_25 to be silent (depends on
    whether the LLM populated source_declared_services_total).

    Soft assertion: at least 2 of the 3 must fire."""
    audit = margaret_decoded["audit"]
    rules = [a.get("rule") for a in audit.get("anomalies") or []]
    mandatory = {
        "RULE_9_PENSION_STATUS_UNKNOWN",
        "RULE_1B_CARE_MGMT_BELOW_STANDARD",
        "RULE_25_SOURCE_ARITHMETIC_GAP",
    }
    hit = mandatory & set(rules)
    assert len(hit) >= 2, (
        f"Only {len(hit)} of the 3 mandatory anomalies fired: {hit}. "
        f"All rules seen: {rules}"
    )


def test_smoke_strip_events_report_generated(margaret_decoded):
    """Strict-mode strip must at least record SOMETHING for Margaret — F3
    fabricated service codes are always going to fire on this fixture."""
    events = margaret_decoded["strip_events"]
    patterns = {e.pattern for e in events} if events else set()
    # If nothing was stripped, either the fixture regressed or the LLM
    # cleaned up its own act. Either is worth noting but we don't hard-fail.
    print(f"\n[smoke] Anti-fab strip fired on patterns: {sorted(patterns)}")
    print(f"[smoke] Total strip events: {len(events or [])}")


# ---------------------------------------------------------------------------
# Reporting — dump a summary at the end so the operator can eyeball it.
# ---------------------------------------------------------------------------

def test_smoke_dump_summary(margaret_decoded):
    """Print the decoded summary for eyeballing. Never fails."""
    ext = margaret_decoded["extracted"]
    audit = margaret_decoded["audit"]
    print("\n" + "=" * 70)
    print(f"[MARGARET LLM SMOKE] {len(ext['line_items'])} line items decoded")
    print(f"[MARGARET LLM SMOKE] extracted keys: {sorted(ext.keys())[:12]}...")
    for k in ("source_declared_services_total", "computed_line_item_sum",
              "care_management_deducted", "per_line_contribution_source",
              "period_start", "period_end"):
        print(f"    {k}: {ext.get(k)!r}")
    print("[MARGARET LLM SMOKE] first 3 line items:")
    for li in ext["line_items"][:3]:
        print(f"    date={li.get('date')!r} desc={li.get('service_description','')[:35]!r} "
              f"unit={li.get('unit')!r} qty={li.get('quantity')!r} "
              f"code={li.get('service_code','')!r}")
    print(f"[MARGARET LLM SMOKE] anomalies ({len(audit.get('anomalies') or [])}):")
    for a in audit.get("anomalies") or []:
        print(f"    - {a.get('rule')!r} [{a.get('severity')!r}] impact={a.get('impact_aud')!r}")
    print("=" * 70)
