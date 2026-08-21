"""DOC-PARITY-1 v2: shared filename convention + canonical ordering (tests 2-7)."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.artifact_naming import build_filename
from lib.anomaly_order import sort_anomalies, band_of, compute_counts


def test_decoded_statement_filename_convention():
    meta = {"participant_name": "Louisa Davids", "period_start": "2026-07-01", "period_end": "2026-09-30"}
    assert build_filename("decoded_statement", meta, "pdf") == \
        "Wayly-Decoded-Statement_Louisa-Davids_01-07-2026-to-30-09-2026.pdf"
    assert build_filename("decoded_statement", meta, "csv") == \
        "Wayly-Decoded-Statement_Louisa-Davids_01-07-2026-to-30-09-2026.csv"


def test_every_doc_type_uses_shared_function():
    for dt, prefix in [
        ("decoded_statement", "Wayly-Decoded-Statement"),
        ("complaint_evidence", "Wayly-Complaint-Evidence"),
        ("care_plan", "Wayly-Care-Plan"),
        ("invoice_check", "Wayly-Invoice-Check"),
    ]:
        name = build_filename(dt, {"participant_name": "Test User", "date": "2026-07-01"}, "pdf")
        assert name.startswith(prefix), name
        assert name.endswith(".pdf")


def test_bands_render_high_medium_low_informational():
    anoms = [
        {"severity": "info", "dollar_impact": 0, "rule": "I"},
        {"severity": "high", "dollar_impact": 28.6, "rule": "H"},
        {"severity": "low", "dollar_impact": 0, "rule": "L"},
        {"severity": "medium", "dollar_impact": 10, "rule": "M"},
        {"severity": "advisory", "dollar_impact": 0, "rule": "A"},
    ]
    ordered = [band_of(a["severity"]) for a in sort_anomalies(anoms)]
    assert ordered == ["high", "medium", "low", "informational", "informational"]


def test_secondary_sort_desc_dollar_then_date():
    anoms = [
        {"severity": "high", "dollar_impact": 5, "date": "2026-02-01", "rule": "A"},
        {"severity": "high", "dollar_impact": 20, "date": "2026-03-01", "rule": "B"},
        {"severity": "high", "dollar_impact": 20, "date": "2026-01-01", "rule": "C"},
    ]
    order = [a["rule"] for a in sort_anomalies(anoms)]
    assert order == ["C", "B", "A"]  # $20 (Jan) , $20 (Mar) , $5


def test_counts_include_informational():
    counts = compute_counts([
        {"severity": "high"}, {"severity": "info"}, {"severity": "advisory"},
    ])
    assert counts["high"] == 1
    assert counts["informational"] == 2
