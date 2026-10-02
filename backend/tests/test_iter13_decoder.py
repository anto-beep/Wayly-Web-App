"""Iter 13 — Two-pass Statement Decoder pipeline tests.

Verifies POST /api/public/decode-statement-text with the Margaret Kowalski
April 2026 statement.

NOTE: The pipeline is slow (~30-180s wall clock — two sequential LLM calls).
The public preview proxy enforces a hard ~60s gateway timeout, which causes
502s for slow Sonnet runs (see iteration_13.json action_items). For these
backend correctness tests we hit the local backend with a 300s timeout. A
successful response is cached at /tmp/decoded_local.json so subsequent test
runs can re-use it (set DECODER_USE_CACHE=0 to force a fresh decode).
"""
import os
import json
import pytest
import requests

LOCAL_BASE = "http://localhost:8001"
BASE_URL = os.environ.get("DECODER_TEST_BASE", LOCAL_BASE).rstrip("/")
ENDPOINT = f"{BASE_URL}/api/public/decode-statement-text"
CACHE = "/tmp/decoded_local.json"

with open("/tmp/margaret_stmt.txt", "r") as f:
    MARGARET_STMT = f.read()


@pytest.fixture(scope="module")
def decoded():
    """Single decode call shared across assertions. Uses cached response if
    available to avoid burning ~2 min of LLM time per test run."""
    use_cache = os.environ.get("DECODER_USE_CACHE", "1") == "1"
    if use_cache and os.path.exists(CACHE):
        with open(CACHE) as f:
            data = json.load(f)
        if "audit" in data and "extracted" in data:
            print(f"[cache] using {CACHE}")
            return data
    s = requests.Session()
    r = s.post(ENDPOINT, json={"text": MARGARET_STMT}, timeout=300)
    if r.status_code == 429:
        if use_cache and os.path.exists(CACHE):
            return json.load(open(CACHE))
        pytest.skip(f"Rate-limited (429): {r.text[:200]}")
    assert r.status_code == 200, f"decode failed {r.status_code}: {r.text[:500]}"
    data = r.json()
    with open(CACHE, "w") as f:
        json.dump(data, f)
    return data


# ---- Top-level shape ------------------------------------------------------
def test_response_shape(decoded):
    for k in ["summary", "period_label", "line_items", "anomalies", "extracted", "audit", "partial_result"]:
        assert k in decoded, f"missing key {k}"
    assert isinstance(decoded["partial_result"], bool)
    assert isinstance(decoded["audit"], dict)
    assert isinstance(decoded["extracted"], dict)


# ---- Audit anomaly counts -------------------------------------------------
def test_anomaly_counts_high_at_least_3(decoded):
    counts = decoded["audit"].get("anomaly_count", {})
    assert counts.get("high", 0) >= 3, f"expected >=3 HIGH anomalies, got {counts}"


def test_required_high_rules_present(decoded):
    rules = {a.get("rule", "") for a in decoded["audit"].get("anomalies", [])}
    high_rules = {a.get("rule") for a in decoded["audit"].get("anomalies", []) if (a.get("severity") or "").lower() == "high"}
    print("HIGH RULES:", high_rules)
    assert any("RULE_1" in r for r in high_rules), "RULE_1 (care mgmt cap) must be HIGH"
    assert any("RULE_3" in r for r in high_rules), "RULE_3 (duplicate) must be HIGH"
    assert any("RULE_7" in r for r in high_rules), "RULE_7 (hospital no RCP) must be HIGH"


# ---- Pass 1 extraction details -------------------------------------------
def test_extracted_includes_cancelled_item(decoded):
    items = decoded["extracted"].get("line_items", [])
    cancelled = [i for i in items if i.get("is_cancellation")]
    assert cancelled, "at least one CANCELLED item should be extracted"
    for c in cancelled:
        assert float(c.get("gross") or 0) == 0.0, f"cancelled gross must be 0, got {c.get('gross')}"


def test_extracted_athm_grab_rail_recoded(decoded):
    items = decoded["extracted"].get("line_items", [])
    grab_rails = [i for i in items if (i.get("service_code") or "").startswith("AT-")]
    assert grab_rails, "AT- grab rail item missing"
    for g in grab_rails:
        assert g.get("stream") == "ATHM", f"AT- item should be stream ATHM, got {g.get('stream')}"


def test_extracted_care_mgmt_own_line(decoded):
    items = decoded["extracted"].get("line_items", [])
    cm = [i for i in items if i.get("stream") == "CareMgmt"]
    assert cm, "CareMgmt line item missing"


# ---- Stream breakdown -----------------------------------------------------
def test_stream_breakdown_all_five_streams(decoded):
    streams = {s["stream"] for s in decoded["audit"].get("stream_breakdown", [])}
    expected = {"Clinical", "Independence", "EverydayLiving", "ATHM", "CareMgmt"}
    missing = expected - streams
    assert not missing, f"missing streams in breakdown: {missing}"


# ---- Statement summary numbers -------------------------------------------
def test_summary_totals(decoded):
    s = decoded["audit"].get("statement_summary", {})
    cm = float(s.get("care_management_fee") or 0)
    tg = float(s.get("total_gross") or 0)
    assert abs(cm - 1236.59) <= 1.0, f"care_management_fee {cm} ≠ 1236.59"
    assert abs(tg - 2429.49) <= 24.30, f"total_gross {tg} not within 1% of 2429.49"


# ---- _empty_audit code path exists ---------------------------------------
def test_empty_audit_helper_exists():
    src = open("/app/backend/agents.py").read()
    assert "_empty_audit" in src
    assert "_audit_error" in src
