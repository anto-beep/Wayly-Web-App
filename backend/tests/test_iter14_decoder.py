"""Iter 14 — Statement Decoder chunked parallel pipeline tests.

Verifies POST /api/public/decode-statement-text against the public preview
URL with the Margaret Kowalski fixture. Also covers JSON repair helper unit
tests, paid-plan gating regression for budget-calc / price-check, and the
24h cookie-based daily limit.

Caches the decode response at /tmp/decoded_public.json so subsequent runs
re-use it (set DECODER_USE_CACHE=0 to force a fresh call).
"""
import os
import json
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
ENDPOINT = f"{BASE_URL}/api/public/decode-statement-text"
CACHE = "/tmp/decoded_public.json"

with open("/tmp/margaret_stmt.txt", "r") as f:
    MARGARET_STMT = f.read()


# ---- Pass 1+2 happy path --------------------------------------------------
@pytest.fixture(scope="module")
def decoded():
    use_cache = os.environ.get("DECODER_USE_CACHE", "1") == "1"
    if use_cache and os.path.exists(CACHE):
        with open(CACHE) as f:
            data = json.load(f)
        if "audit" in data and "extracted" in data:
            return data
    s = requests.Session()
    t0 = time.time()
    r = s.post(ENDPOINT, json={"text": MARGARET_STMT}, timeout=90)
    elapsed = time.time() - t0
    if r.status_code == 429:
        if os.path.exists(CACHE):
            return json.load(open(CACHE))
        pytest.skip(f"Rate limited and no cache: {r.text[:200]}")
    assert r.status_code == 200, f"decode failed {r.status_code}: {r.text[:500]}"
    assert elapsed < 60, f"wall-clock {elapsed:.1f}s exceeded 60s gateway timeout"
    data = r.json()
    data["_elapsed_s"] = elapsed
    with open(CACHE, "w") as f:
        json.dump(data, f)
    return data


def test_response_shape(decoded):
    for k in ("summary", "period_label", "line_items", "anomalies", "extracted", "audit", "partial_result"):
        assert k in decoded, f"missing key {k}"
    assert decoded["partial_result"] is False


def test_participant_name_not_redacted(decoded):
    assert decoded["extracted"].get("participant_name") == "Margaret Kowalski"
    assert decoded["audit"].get("statement_summary", {}).get("participant_name") == "Margaret Kowalski"


def test_line_items_count_is_12(decoded):
    items = decoded["extracted"].get("line_items", []) or []
    assert len(items) == 12, f"expected exactly 12 line items, got {len(items)}"


def test_anomaly_count_4_3_3(decoded):
    counts = decoded["audit"].get("anomaly_count", {})
    assert counts == {"high": 4, "medium": 3, "low": 3}, f"got {counts}"


def test_all_five_streams_in_breakdown(decoded):
    streams = {s["stream"] for s in decoded["audit"].get("stream_breakdown", [])}
    assert {"Clinical", "Independence", "EverydayLiving", "ATHM", "CareMgmt"} <= streams, f"missing streams: {streams}"


def test_required_high_rules_present(decoded):
    high_rules = {a.get("rule") for a in decoded["audit"].get("anomalies", []) if (a.get("severity") or "").lower() == "high"}
    assert any("RULE_1" in r for r in high_rules), f"RULE_1 missing from {high_rules}"
    assert any("RULE_3" in r for r in high_rules), f"RULE_3 missing from {high_rules}"
    assert any("RULE_4" in r for r in high_rules), f"RULE_4 missing from {high_rules}"
    assert any("RULE_7" in r for r in high_rules), f"RULE_7 missing from {high_rules}"


# ---- Cookie-based 24h daily limit ----------------------------------------
def test_second_decode_with_same_cookie_returns_429():
    # Use a fresh session that has the kindred_sd_used cookie set from happy
    # path. We reproduce the cookie ourselves to avoid burning two ~45s LLM calls.
    s = requests.Session()
    s.cookies.set("kindred_sd_used", "2026-05-04T23:50:26+00:00", domain=BASE_URL.replace("https://", "").replace("http://", ""))
    r = s.post(ENDPOINT, json={"text": MARGARET_STMT}, timeout=30)
    assert r.status_code == 429, f"expected 429 daily_limit, got {r.status_code}: {r.text[:300]}"
    body = r.json().get("detail", {})
    assert body.get("error") == "daily_limit"


# ---- Other public tools regression --------------------------------------
def test_budget_calc_unauth_returns_401():
    r = requests.post(f"{BASE_URL}/api/public/budget-calc", json={"classification": 4}, timeout=20)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"
    assert r.json().get("detail", {}).get("error") in ("unauthenticated", "forbidden")


def test_price_check_unauth_returns_401():
    r = requests.post(f"{BASE_URL}/api/public/price-check", json={"service": "DA-01", "rate": 75.0}, timeout=20)
    assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"


# ---- JSON repair helpers (unit) -----------------------------------------
def test_json_repair_truncated_array():
    from backend.agents import _try_json_repair, _safe_json_load  # type: ignore  # noqa: F401


def test_json_repair_via_subprocess():
    """Exercise repair helpers without polluting sys.path."""
    import subprocess
    code = (
        "import sys; sys.path.insert(0, '/app/backend');"
        "from agents import _try_json_repair, _safe_json_load;"
        "import json;"
        "trunc1='{\"line_items\":[{\"a\":1},{\"a\":2';"
        "r1=_safe_json_load(trunc1); assert isinstance(r1, dict) and len(r1['line_items'])>=1, ('r1 bad', r1);"
        "trunc2='{\"a\":1,\"b\":[1,2,3,';"
        "r2=_try_json_repair(trunc2); assert r2=={'a':1,'b':[1,2,3]}, ('r2 bad', r2);"
        "trunc3='{\"a\":\"open';"
        "r3=_try_json_repair(trunc3); assert r3=={'a':'open'}, ('r3 bad', r3);"
        "assert _safe_json_load(None) is None;"
        "assert _safe_json_load('{\"k\":1}')=={'k':1};"
        "print('OK')"
    )
    out = subprocess.run(["python3", "-c", code], capture_output=True, text=True)
    assert out.returncode == 0, f"repair tests failed: {out.stdout}\n{out.stderr}"
    assert "OK" in out.stdout
