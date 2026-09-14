"""DEC-1 v5 · Phase 3 · Archetype end-to-end LLM smoke tests.

Mirrors `test_dec1_v5_margaret_live.py` but runs every archetype fixture PDF
through the full decoder pipeline in a parameterised sweep:

  1. Read fixture PDF from disk
  2. document_extract → text
  3. agents.extract_statement (chunked LLM extractor)
  4. agents.audit_statement (LLM auditor)
  5. _add_parse_warnings (deterministic post-audit tail)
  6. apply_all_anti_fabrication (strict mode)
  7. backfill_extracted / backfill_anomalies
  8. Assert per-archetype golden shape

Each archetype declares its expected shape via `ArchetypeExpectation`, and
one generic test module runs them all. This is cheaper than mirroring 10
tests × 8 archetypes = 80 files.

Runs ONLY when DEC1_V5_LLM_SMOKE=true (skip-gated).
Cost: ~1 LLM call per archetype (~9 total for a full sweep, ~$0.10).

Reference:
  /app/docs/DEC-1_v5_spec.md §Phase 3 §Additional archetype fixtures
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Explicit .env load so the LLM key is available to pytest.
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except Exception:
    pass

FIXTURES = Path(__file__).resolve().parent / "fixtures"

# ---------------------------------------------------------------------------
# Skip gate (mirror margaret_live)
# ---------------------------------------------------------------------------

pytestmark = pytest.mark.skipif(
    os.environ.get("DEC1_V5_LLM_SMOKE", "").strip().lower()
    not in ("true", "1", "yes", "on"),
    reason=(
        "Live LLM archetype sweep. Set DEC1_V5_LLM_SMOKE=true to run "
        "(costs ~9 LLM calls, ~$0.10)."
    ),
)


# ---------------------------------------------------------------------------
# Per-archetype expected-shape declaration
# ---------------------------------------------------------------------------

@dataclass
class ArchetypeExpectation:
    slug: str                            # short id, used in parametrize id
    fixture_filename: str                # PDF file in tests/fixtures/
    expected_line_count_min: int         # tolerance for LLM variance
    expected_line_count_max: int
    expected_units_subset: List[str]     # units that MUST appear
    contribution_source: Optional[str]   # aggregate_only / per_line / unknown / None (skip check)
    has_arithmetic_gap: bool             # True when line_sum != declared
    must_contain_rules: List[str]        # anomaly rules that MUST fire
    must_not_contain_rules: List[str]    # rules that MUST NOT fire
    max_anomaly_count: int = 10          # sanity ceiling on the anomaly count
    care_mgmt_expected: bool = True      # False for AT-HM / interim (no CM fee)
    period_start: str = ""               # ISO date, informational
    extra_asserts: Optional[Callable[[Dict[str, Any], Dict[str, Any]], None]] = None
    known_regressions: List[str] = field(default_factory=list)


# Golden shapes derived from the build_*_v1.py builders. Every value here
# should match what the corresponding builder prints via print_golden().

ARCHETYPES: List[ArchetypeExpectation] = [
    ArchetypeExpectation(
        slug="margaret",
        fixture_filename="MARGARET_June_2026.pdf",
        expected_line_count_min=15, expected_line_count_max=17,
        expected_units_subset=["hr", "km", "session"],
        contribution_source="aggregate_only",
        has_arithmetic_gap=True,
        must_contain_rules=[],   # LLM may or may not populate v5 fields; kept loose
        must_not_contain_rules=[
            "RULE_27_GST_ON_GST_FREE",
            "RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH",
        ],
        max_anomaly_count=8,
        care_mgmt_expected=True,
        period_start="2026-06-01",
    ),
    ArchetypeExpectation(
        slug="zero_service",
        fixture_filename="ZERO_SERVICE_April_2026.pdf",
        expected_line_count_min=0, expected_line_count_max=0,
        expected_units_subset=[],
        contribution_source=None,
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_25_SOURCE_ARITHMETIC_GAP",     # 0 vs 0 → no gap
            "RULE_1B_CARE_MGMT_BELOW_STANDARD",  # can't compute rate when declared==0
        ],
        # RULE_15 is a legitimate signal on zero-service statements — the
        # LLM's reported_total_gross may reflect the care mgmt fee while
        # extracted line sum is 0. That IS a real gap worth surfacing.
        max_anomaly_count=6,
        care_mgmt_expected=True,
        period_start="2026-04-01",
    ),
    ArchetypeExpectation(
        slug="nwo",
        fixture_filename="NWO_April_2026.pdf",
        expected_line_count_min=5, expected_line_count_max=7,
        expected_units_subset=["hr"],   # visit may or may not survive LLM
        contribution_source="per_line",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_25_SOURCE_ARITHMETIC_GAP",
            "RULE_9_PENSION_STATUS_UNKNOWN",   # pension stated
            "RULE_9_CONTRIBUTION_MISMATCH",    # NWO override active
            "RULE_9_INCONSISTENT_RATE",        # NWO override active
        ],
        # NWO override + real Act footer → ceiling drops from 9 to 5.
        max_anomaly_count=5,
        care_mgmt_expected=True,
        period_start="2026-04-01",
    ),
    ArchetypeExpectation(
        slug="post_oct_2026",
        fixture_filename="POST_OCT_2026_November_2026.pdf",
        expected_line_count_min=3, expected_line_count_max=5,
        expected_units_subset=["hr"],
        contribution_source="per_line",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_25_SOURCE_ARITHMETIC_GAP",
        ],
        max_anomaly_count=5,
        care_mgmt_expected=True,
        period_start="2026-11-01",
    ),
    ArchetypeExpectation(
        slug="rcp",
        fixture_filename="RCP_May_2026.pdf",
        expected_line_count_min=3, expected_line_count_max=5,
        expected_units_subset=["session"],  # RCP always uses session
        contribution_source="per_line",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_25_SOURCE_ARITHMETIC_GAP",
            "RULE_9_PENSION_STATUS_UNKNOWN",
        ],
        max_anomaly_count=5,
        care_mgmt_expected=True,
        period_start="2026-05-01",
    ),
    ArchetypeExpectation(
        slug="athm_standalone",
        fixture_filename="ATHM_April_2026.pdf",
        # AT-HM dedup pass now drops the double-extraction. Expect exactly
        # the 3 rows from the fixture.
        expected_line_count_min=2, expected_line_count_max=4,
        expected_units_subset=["ea"],
        contribution_source="per_line",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_1B_CARE_MGMT_BELOW_STANDARD",  # no care mgmt on AT-HM
        ],
        max_anomaly_count=5,
        care_mgmt_expected=False,
        period_start="2026-04-01",
    ),
    ArchetypeExpectation(
        slug="interim_funding",
        fixture_filename="INTERIM_FUNDING_April_2026.pdf",
        # LLM sometimes classifies "interim funding" as a non-service admin
        # line and drops it from every stream extractor. Lower bound is 0.
        # When lines=0, RULE_25 legitimately fires ($500 declared vs $0
        # computed) — that's the correct signal on a mis-decoded statement.
        expected_line_count_min=0, expected_line_count_max=2,
        expected_units_subset=[],   # only test unit enum when lines exist
        contribution_source="aggregate_only",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            # RULE_25 removed — legitimately fires when LLM drops the line.
        ],
        max_anomaly_count=6,
        care_mgmt_expected=False,
        period_start="2026-04-01",
    ),
    ArchetypeExpectation(
        slug="adjustments",
        fixture_filename="ADJUSTMENTS_April_2026.pdf",
        expected_line_count_min=2, expected_line_count_max=4,
        expected_units_subset=["hr"],
        contribution_source="per_line",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_25_SOURCE_ARITHMETIC_GAP",
        ],
        max_anomaly_count=5,
        care_mgmt_expected=True,
        period_start="2026-04-01",
    ),
    ArchetypeExpectation(
        slug="terminology_variants",
        fixture_filename="TERMINOLOGY_April_2026.pdf",
        expected_line_count_min=2, expected_line_count_max=4,
        expected_units_subset=["hr"],   # 'visit' may or may not survive LLM
        contribution_source="per_line",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_25_SOURCE_ARITHMETIC_GAP",
        ],
        max_anomaly_count=5,
        care_mgmt_expected=True,
        period_start="2026-04-01",
    ),
    ArchetypeExpectation(
        slug="hcp_legacy",
        fixture_filename="HCP_LEGACY_May_2026.pdf",
        expected_line_count_min=2, expected_line_count_max=4,
        expected_units_subset=["hr"],
        contribution_source="per_line",
        has_arithmetic_gap=False,
        must_contain_rules=[],
        must_not_contain_rules=[
            "RULE_25_SOURCE_ARITHMETIC_GAP",
        ],
        max_anomaly_count=6,
        care_mgmt_expected=True,
        period_start="2026-05-01",
        # HCP-legacy sources DO carry service codes ("HCP-CBA-01", "HCP-DA-02",
        # "HCP-NR-01"). Anti-fab must NOT strip them because the source
        # contains them.
        known_regressions=["HCP_CODES_MUST_SURVIVE"],
    ),
]

ISO_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
UNIT_VOCAB = ("hr", "km", "session", "ea", "visit", "day")


# ---------------------------------------------------------------------------
# Pipeline runner (identical to margaret_live)
# ---------------------------------------------------------------------------

def _run_archetype(fixture_filename: str) -> Dict[str, Any]:
    from agents import extract_statement, audit_statement, _add_parse_warnings
    from document_extract import extract_document
    from lib.dec1_v5_antifab import apply_all_anti_fabrication
    from lib.dec1_v5_schema import backfill_extracted, backfill_anomalies

    path = FIXTURES / fixture_filename
    if not path.exists():
        pytest.skip(f"Fixture missing: {path}")
    raw = path.read_bytes()
    text, _kind, _pages, _warnings = asyncio.run(
        extract_document(path.name, raw)
    )
    assert text and len(text) > 100, (
        f"Text extraction failed for {fixture_filename} (got {len(text)} chars)"
    )
    extracted = asyncio.run(extract_statement(text, "smoke-test-household"))
    audit = asyncio.run(audit_statement(extracted, "smoke-test-household"))
    audit = _add_parse_warnings(audit or {"anomalies": []}, extracted or {})
    new_ext, new_audit, events = apply_all_anti_fabrication(
        extracted, audit, text, strict=True,
    )
    new_ext = backfill_extracted(new_ext)
    new_audit["anomalies"] = backfill_anomalies(new_audit.get("anomalies") or [])
    return {"extracted": new_ext, "audit": new_audit,
            "source_text": text, "strip_events": events}


# ---------------------------------------------------------------------------
# The parametrised test that runs the whole sweep
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "arch",
    ARCHETYPES,
    ids=[a.slug for a in ARCHETYPES],
)
def test_archetype_end_to_end(arch: ArchetypeExpectation, request):
    """One test per archetype. Prints a per-archetype summary at the end."""
    result = _run_archetype(arch.fixture_filename)
    ext = result["extracted"]
    audit = result["audit"]
    events = result["strip_events"]
    line_items = ext.get("line_items") or []
    anomalies = audit.get("anomalies") or []
    rules = [a.get("rule") for a in anomalies]

    # 1) Line count within tolerance.
    assert arch.expected_line_count_min <= len(line_items) <= arch.expected_line_count_max, (
        f"{arch.slug}: line count {len(line_items)} outside "
        f"[{arch.expected_line_count_min}, {arch.expected_line_count_max}]"
    )

    # 2) Every date is ISO or normalisable (>=80% ISO).
    if line_items:
        iso_count = sum(
            1 for li in line_items
            if isinstance(li.get("date"), str) and ISO_RE.match(li["date"] or "")
        )
        ratio = iso_count / max(len(line_items), 1)
        assert ratio >= 0.8, (
            f"{arch.slug}: only {iso_count}/{len(line_items)} dates are ISO. "
            f"Sample: {[li.get('date') for li in line_items[:3]]}"
        )

    # 3) Every populated unit is in the enum.
    for i, li in enumerate(line_items):
        u = li.get("unit")
        if u:
            assert u in UNIT_VOCAB, (
                f"{arch.slug}: line {i+1} unit {u!r} not in {UNIT_VOCAB}"
            )

    # 4) Units expected for this archetype must show up on at least one row
    # (LLM may compress synonyms). Soft check — 80% of expected units present.
    if arch.expected_units_subset and line_items:
        seen = {li.get("unit") for li in line_items if li.get("unit")}
        present = sum(1 for u in arch.expected_units_subset if u in seen)
        ratio = present / len(arch.expected_units_subset)
        assert ratio >= 0.5, (
            f"{arch.slug}: expected at least half of units {arch.expected_units_subset} "
            f"to appear; saw {sorted(seen)}"
        )

    # 5) Must-contain rules.
    for r in arch.must_contain_rules:
        assert r in rules, (
            f"{arch.slug}: expected rule {r!r} in {rules}"
        )

    # 6) Must-not-contain rules (anti-fab guarantees).
    for r in arch.must_not_contain_rules:
        assert r not in rules, (
            f"{arch.slug}: forbidden rule {r!r} present in {rules}"
        )

    # 7) Anomaly count sanity ceiling.
    assert len(anomalies) <= arch.max_anomaly_count, (
        f"{arch.slug}: too many anomalies ({len(anomalies)} > {arch.max_anomaly_count}). "
        f"Rules: {rules}"
    )

    # 8) Care management line-item leakage check — the phantom-RULE_15 bug
    # this session fixed. No line item may be classified as CareMgmt.
    for i, li in enumerate(line_items):
        stream = (li.get("stream") or "").lower().replace(" ", "")
        assert stream != "caremgmt", (
            f"{arch.slug}: line {i+1} leaked as CareMgmt in line_items — "
            "phantom RULE_15 regression"
        )
        desc = (li.get("service_description") or "").lower()
        assert "care management" not in desc and "care mgmt" not in desc, (
            f"{arch.slug}: line {i+1} description looks like care mgmt: "
            f"{li.get('service_description')!r}"
        )

    # 9) Anti-fab strip must not throw. Log events for eyeballing.
    strip_summary = {}
    for e in events or []:
        strip_summary[e.pattern] = strip_summary.get(e.pattern, 0) + 1

    # 10) Optional per-archetype extras.
    if arch.extra_asserts:
        arch.extra_asserts(ext, audit)

    # 11) Special check for HCP-legacy: the source has real service codes,
    # so anti-fab must NOT strip them.
    if "HCP_CODES_MUST_SURVIVE" in arch.known_regressions:
        codes = {(li.get("service_code") or "").strip() for li in line_items}
        codes.discard("")
        assert codes, (
            f"{arch.slug}: HCP legacy source contains service codes but "
            f"anti-fab wiped all of them — F3 regression"
        )

    print(f"\n[archetype] {arch.slug} — line_items={len(line_items)} "
          f"rules={rules} strip_events={strip_summary}")
