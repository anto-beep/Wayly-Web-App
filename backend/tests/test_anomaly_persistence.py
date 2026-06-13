"""Regression: Statement Decoder anomaly persistence keeps the full
decoder metadata (rule key, dollar_impact, evidence) and rolls up an
anomaly_dollar_impact_total + informational_notes onto the Statement.

Old statement documents without the new fields must still load through
the Pydantic model without raising.
"""
from __future__ import annotations
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


# ---------------------------------------------------------------------------
# Helpers — reproduce the upload pipeline's anomaly mapping in isolation.
# ---------------------------------------------------------------------------
_SEVERITY_DISPLAY_MAP = {"high": "alert", "medium": "warning", "low": "info"}


def _map_anomalies(audit: Dict[str, Any]):
    """A faithful port of the mapping block in server._run_upload_job so the
    tests don't need to spin up the whole FastAPI app + queue."""
    from models import Anomaly

    anomalies: List[Anomaly] = []
    dollar_total = 0.0
    for a in (audit.get("anomalies") or []):
        if not isinstance(a, dict):
            continue
        raw_sev = (a.get("severity") or "").lower() or None
        sev = _SEVERITY_DISPLAY_MAP.get(raw_sev or "", "info")
        try:
            dollar_val = float(a.get("dollar_impact") or 0.0)
        except Exception:
            dollar_val = 0.0
        evidence_raw = a.get("evidence") or []
        evidence_list = [str(e) for e in evidence_raw if isinstance(evidence_raw, list) and e is not None]
        anomalies.append(Anomaly(
            severity=sev,
            title=str(a.get("headline") or a.get("title") or "Item flagged"),
            detail=str(a.get("detail") or ""),
            suggested_action=a.get("suggested_action"),
            rule=a.get("rule") or None,
            dollar_impact=dollar_val if dollar_val else None,
            evidence=evidence_list,
            raw_severity=raw_sev,
        ))
        dollar_total += max(0.0, dollar_val)
    return anomalies, round(dollar_total, 2)


def _audit_with_anomalies() -> Dict[str, Any]:
    return {
        "anomalies": [
            {
                "severity": "high",
                "rule": "RULE_1B_CARE_MGMT_MONTHLY",
                "headline": "Care management is over the 10% monthly cap.",
                "detail": "March care-management fee is $320 — 11.5% of gross monthly services.",
                "dollar_impact": 42.50,
                "evidence": [
                    "monthly_gross: $2,783.50",
                    "care_management_fee: $320.00",
                    "cap_at_10pct: $278.35",
                ],
                "suggested_action": "Ask the provider for a written breakdown of the care-management charges.",
            },
            {
                "severity": "medium",
                "rule": "RULE_9_CONTRIBUTION_MISMATCH",
                "headline": "Independence contribution outside the 5–25% band.",
                "detail": "Line implies 30% — outside the part-pension band.",
                "dollar_impact": 7.10,
                "evidence": [],
                "suggested_action": "Confirm the rate Services Australia recorded.",
            },
            {
                "severity": "low",
                "rule": "RULE_15_GROSS_TOTAL_PARSE_WARNING",
                "headline": "Header total and line sum differ by $0.50.",
                "detail": "",
                "evidence": ["extracted: $2,952.21", "reported: $2,952.71"],
            },
        ],
        "informational_notes": [
            {"kind": "previous_period_adjustment", "summary": "Feb adjustment of $24 verified."},
        ],
    }


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------
def test_anomaly_mapping_persists_rule_dollar_and_evidence():
    audit = _audit_with_anomalies()
    anomalies, total = _map_anomalies(audit)
    assert len(anomalies) == 3

    by_rule = {a.rule: a for a in anomalies if a.rule}
    cm = by_rule["RULE_1B_CARE_MGMT_MONTHLY"]
    assert cm.severity == "alert"
    assert cm.raw_severity == "high"
    assert cm.dollar_impact == pytest.approx(42.50, abs=0.001)
    assert any("care_management_fee" in e for e in cm.evidence)

    contrib = by_rule["RULE_9_CONTRIBUTION_MISMATCH"]
    assert contrib.severity == "warning"
    assert contrib.raw_severity == "medium"
    assert contrib.dollar_impact == pytest.approx(7.10, abs=0.001)
    assert contrib.evidence == []  # honoured even when the source list is empty

    parse_warn = by_rule["RULE_15_GROSS_TOTAL_PARSE_WARNING"]
    assert parse_warn.severity == "info"
    assert parse_warn.dollar_impact is None  # zero impact => None
    assert len(parse_warn.evidence) == 2

    assert total == pytest.approx(49.60, abs=0.001)


def test_statement_carries_aggregates():
    """Build the Statement payload the same way server._run_upload_job does
    and assert the new aggregate fields land on the model."""
    from models import Statement

    audit = _audit_with_anomalies()
    anomalies, dollar_total = _map_anomalies(audit)

    stmt = Statement(
        household_id="hh-test",
        filename="dorothy_mar.csv",
        period_label="March 2026",
        line_items=[],
        anomalies=anomalies,
        anomaly_dollar_impact_total=dollar_total,
        informational_notes=audit["informational_notes"],
    )
    assert stmt.anomaly_dollar_impact_total == pytest.approx(49.60, abs=0.001)
    assert len(stmt.informational_notes) == 1
    assert stmt.informational_notes[0]["kind"] == "previous_period_adjustment"

    dumped = stmt.model_dump()
    # Aggregates must survive a model_dump → Mongo round-trip.
    assert "anomaly_dollar_impact_total" in dumped
    assert "informational_notes" in dumped
    # Anomaly rows carry the new keys.
    first = dumped["anomalies"][0]
    assert "rule" in first and first["rule"] == "RULE_1B_CARE_MGMT_MONTHLY"
    assert "evidence" in first and isinstance(first["evidence"], list)
    assert "raw_severity" in first and first["raw_severity"] == "high"


def test_legacy_statement_document_loads_without_validation_errors():
    """Old Mongo documents predate the new Anomaly + Statement fields. They
    must load through the model without errors and surface safe defaults."""
    from models import Statement

    legacy_doc = {
        "id": str(uuid.uuid4()),
        "household_id": "hh-legacy",
        "filename": "legacy.csv",
        "period_label": "September 2025",
        "line_items": [],
        "summary": "Legacy statement",
        "anomalies": [
            # Pre-Feb-2026 anomaly shape — no rule, dollar_impact, evidence.
            {
                "id": str(uuid.uuid4()),
                "severity": "warning",
                "title": "Old anomaly",
                "detail": "From before the new schema",
                "suggested_action": None,
            },
        ],
        "raw_text_preview": "",
        # Note: no anomaly_dollar_impact_total / informational_notes / header_stream_budgets.
    }

    parsed = Statement(**legacy_doc)
    assert parsed.anomaly_dollar_impact_total == 0.0
    assert parsed.informational_notes == []
    assert len(parsed.anomalies) == 1
    legacy = parsed.anomalies[0]
    assert legacy.rule is None
    assert legacy.dollar_impact is None
    assert legacy.evidence == []
    assert legacy.raw_severity is None
