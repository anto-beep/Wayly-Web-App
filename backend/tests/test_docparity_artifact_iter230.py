"""DOC-PARITY-1 v2 — HTTP tests for POST /api/decoder/artifact + audit ordering.

Tests via the EXTERNAL preview URL (REACT_APP_BACKEND_URL). Endpoint is
intentionally unauthenticated (stateless render of client-supplied decode).
"""
from __future__ import annotations

import hashlib
import os
import re
import sys
from pathlib import Path

import pytest
import requests

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from lib.anomaly_order import band_of  # noqa: E402

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fall back to the frontend/.env file directly
    env = Path("/app/frontend/.env").read_text()
    for line in env.splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break


PAYLOAD = {
    "extracted": {
        "participant_name": "Louisa Davids",
        "provider_name": "BlueBerry Care",
        "period_start": "2026-07-01",
        "period_end": "2026-09-30",
        "statement_period": "Q1 FY26",
        "line_items": [
            {"date": "2026-07-15", "service_description": "Personal care",
             "service_code": "01_015_0107_1_1", "stream": "Independence",
             "quantity": 2, "unit": "hour", "unit_rate": 65.09,
             "gross": 130.18, "participant_contribution": 20.00, "government_paid": 110.18},
            {"date": "2026-08-02", "service_description": "Physiotherapy",
             "service_code": "15_055_0128_1_3", "stream": "Clinical",
             "quantity": 1, "unit": "hour", "unit_rate": 193.99,
             "gross": 193.99, "participant_contribution": 0, "government_paid": 193.99},
        ],
    },
    "audit": {
        "statement_summary": {
            "participant_name": "Louisa Davids",
            "provider": "BlueBerry Care",
            "period": "Q1 FY26",
            "total_gross": 324.17,
            "total_participant_contribution": 20.00,
            "total_government_paid": 304.17,
            "care_management_fee": 45.00,
            "budget_remaining": 12000.50,
        },
        "anomalies": [
            {"severity": "medium", "headline": "M finding",
             "detail": "medium detail", "dollar_impact": 10, "date": "2026-08-01"},
            {"severity": "high", "headline": "H finding",
             "detail": "high detail", "dollar_impact": 28.60, "date": "2026-07-20"},
            {"severity": "info", "headline": "I finding",
             "detail": "info detail", "dollar_impact": 0, "date": "2026-07-10"},
            {"severity": "low", "headline": "L finding",
             "detail": "low detail", "dollar_impact": 0, "date": "2026-09-01"},
        ],
        "stream_breakdown": [
            {"stream": "Independence", "line_item_count": 1,
             "participant_contribution": 20.00, "gross_total": 130.18},
            {"stream": "Clinical", "line_item_count": 1,
             "participant_contribution": 0, "gross_total": 193.99},
        ],
    },
    "summary": "This is the plain English summary.",
}

EXPECTED_STEM = "Wayly-Decoded-Statement_Louisa-Davids_01-07-2026-to-30-09-2026"


def _filename(resp: requests.Response) -> str:
    cd = resp.headers.get("Content-Disposition") or ""
    m = re.search(r'filename="([^"]+)"', cd)
    return m.group(1) if m else ""


# ------- Backend endpoint tests -------

def test_artifact_pdf_200_correct_headers_and_filename():
    r = requests.post(f"{BASE_URL}/api/decoder/artifact?fmt=pdf",
                      json=PAYLOAD, timeout=30)
    assert r.status_code == 200, r.text[:400]
    assert r.headers.get("Content-Type", "").startswith("application/pdf")
    assert _filename(r) == f"{EXPECTED_STEM}.pdf"
    assert r.content[:4] == b"%PDF", "response is not a PDF"


def test_artifact_csv_200_correct_headers_and_filename():
    r = requests.post(f"{BASE_URL}/api/decoder/artifact?fmt=csv",
                      json=PAYLOAD, timeout=30)
    assert r.status_code == 200, r.text[:400]
    assert r.headers.get("Content-Type", "").startswith("text/csv")
    assert _filename(r) == f"{EXPECTED_STEM}.csv"
    body = r.text
    assert "Date,Service,Code,Stream" in body
    assert "Personal care" in body
    assert "15/07/2026" in body  # DD/MM/YYYY in artefact
    assert "02/08/2026" in body


def test_artifact_pdf_bytes_hash_identical_across_repeated_calls():
    # SAME posted payload => hash-identical bytes (deterministic, so web+mobile
    # get the exact same downloadable file).
    hashes = set()
    for _ in range(3):
        r = requests.post(f"{BASE_URL}/api/decoder/artifact?fmt=pdf",
                          json=PAYLOAD, timeout=30)
        assert r.status_code == 200
        hashes.add(hashlib.sha256(r.content).hexdigest())
    assert len(hashes) == 1, f"pdf bytes differ across calls: {hashes}"


def test_artifact_csv_bytes_hash_identical_across_repeated_calls():
    hashes = set()
    for _ in range(3):
        r = requests.post(f"{BASE_URL}/api/decoder/artifact?fmt=csv",
                          json=PAYLOAD, timeout=30)
        assert r.status_code == 200
        hashes.add(hashlib.sha256(r.content).hexdigest())
    assert len(hashes) == 1


def test_artifact_default_fmt_is_pdf():
    r = requests.post(f"{BASE_URL}/api/decoder/artifact", json=PAYLOAD, timeout=30)
    assert r.status_code == 200
    assert r.headers.get("Content-Type", "").startswith("application/pdf")


def test_artifact_rejects_non_json():
    r = requests.post(f"{BASE_URL}/api/decoder/artifact", data="not-json",
                      headers={"Content-Type": "text/plain"}, timeout=30)
    assert r.status_code in (400, 422)


# ------- Audit ordering unit-check via decode payload's sort library -------

def test_decoded_audit_anomalies_pre_sorted_bands():
    from lib.anomaly_order import sort_anomalies
    ordered = sort_anomalies(PAYLOAD["audit"]["anomalies"])
    bands = [band_of(a["severity"]) for a in ordered]
    assert bands == ["high", "medium", "low", "informational"]


def test_compute_counts_includes_informational():
    from lib.anomaly_order import compute_counts
    counts = compute_counts(PAYLOAD["audit"]["anomalies"])
    assert counts["informational"] == 1
    assert counts["high"] == 1
    assert counts["medium"] == 1
    assert counts["low"] == 1
