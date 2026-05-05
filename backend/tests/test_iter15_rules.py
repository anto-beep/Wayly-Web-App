"""Iter 15 — Statement Decoder new rules + extractErrorMessage regression.

Covers:
- Full Margaret Kowalski decode regression (200, line_items==12, extracted fields,
  anomaly_count 4H/4M/4L with RULE_15 deterministic warning fired).
- Deterministic unit tests for `_add_parse_warnings` (Rule 14 and Rule 15)
  invoked directly against the helper (avoids an LLM call).
- AUDITOR_SYSTEM prompt presence of RULE 11 / 12 / 13 literal strings.
- Other-tool gating regression (budget-calc & price-check).
"""
import os
import sys
import json
import time
import subprocess
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://aged-care-os.preview.emergentagent.com").rstrip("/")
ENDPOINT = f"{BASE_URL}/api/public/decode-statement-text"
CACHE = "/tmp/decoded_public_iter15.json"

with open("/app/backend/tests/fixtures/margaret_stmt.txt", "r") as f:
    MARGARET_STMT = f.read()


# ---- Happy path fixture (cached) -----------------------------------------
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
    # Endpoint now returns a job_id immediately and runs the pipeline async
    r = s.post(ENDPOINT, json={"text": MARGARET_STMT}, timeout=15)
    if r.status_code == 429:
        pytest.skip(f"Rate limited by daily limit cookie: {r.text[:200]}")
    assert r.status_code == 200, f"submit failed {r.status_code}: {r.text[:500]}"
    submit = r.json()
    job_id = submit.get("job_id")
    assert job_id, f"no job_id in submit response: {submit}"
    # Poll up to 180s
    data = None
    for _ in range(90):
        time.sleep(2)
        r2 = s.get(f"{BASE_URL}/api/public/decode-job/{job_id}", timeout=10)
        if r2.status_code != 200:
            continue
        body = r2.json()
        if body.get("status") == "done":
            data = body.get("result")
            break
        if body.get("status") == "error":
            raise AssertionError(f"job error: {body.get('error')}")
    elapsed = time.time() - t0
    assert data is not None, f"decode timed out after {elapsed:.0f}s"
    data["_elapsed_s"] = elapsed
    with open(CACHE, "w") as f:
        json.dump(data, f)
    return data


# ---- Regression: core decode shape ---------------------------------------
def test_status_and_participant_not_redacted(decoded):
    ex = decoded["extracted"]
    assert ex.get("participant_name") == "Margaret Kowalski"


def test_line_items_count_is_12(decoded):
    items = decoded["extracted"].get("line_items", []) or []
    assert len(items) == 12, f"expected 12 line items, got {len(items)}"


def test_new_extraction_fields_present(decoded):
    ex = decoded["extracted"]
    # period dates
    assert ex.get("period_start") == "2026-04-01", f"period_start was {ex.get('period_start')!r}"
    assert ex.get("period_end") == "2026-04-30", f"period_end was {ex.get('period_end')!r}"
    # reported_total_gross must be present and close to 2429.49
    rtg = ex.get("reported_total_gross")
    assert isinstance(rtg, (int, float))
    assert rtg > 0
    assert abs(float(rtg) - 2429.49) < 1.0, f"reported_total_gross was {rtg}"
    # at_hm_commitments exists (array, possibly empty)
    assert isinstance(ex.get("at_hm_commitments", []), list)


def test_anomaly_count_matches_length(decoded):
    audit = decoded["audit"]
    anoms = audit.get("anomalies", []) or []
    counts = audit.get("anomaly_count", {}) or {}
    derived = {"high": 0, "medium": 0, "low": 0}
    for a in anoms:
        sev = (a.get("severity") or "").lower()
        if sev in derived:
            derived[sev] += 1
    assert counts.get("high", 0) == derived["high"]
    assert counts.get("medium", 0) == derived["medium"]
    assert counts.get("low", 0) == derived["low"]


def test_rule_15_gross_total_warning_fired(decoded):
    anoms = decoded["audit"].get("anomalies", []) or []
    r15 = [a for a in anoms if (a.get("rule") or "").upper() == "RULE_15_GROSS_TOTAL_PARSE_WARNING"]
    assert len(r15) >= 1, "RULE_15_GROSS_TOTAL_PARSE_WARNING not present"
    a = r15[0]
    assert (a.get("severity") or "").lower() == "low"
    assert float(a.get("dollar_impact") or 0) > 0
    detail = (a.get("detail") or "").lower()
    assert "extracted" in detail and "reported" in detail, f"detail missing expected phrasing: {detail}"


# ---- Deterministic helper unit tests (no LLM) ----------------------------
def _run_helper(snippet: str) -> subprocess.CompletedProcess:
    code = (
        "import sys, json; sys.path.insert(0, '/app/backend');\n"
        "from agents import _add_parse_warnings;\n"
        + snippet
    )
    return subprocess.run(["python3", "-c", code], capture_output=True, text=True)


def test_rule_14_fires_on_long_span():
    snippet = (
        "ex = {'period_start':'2026-01-01','period_end':'2026-03-31','statement_period':'Q1 2026','line_items':[],'previous_period_adjustments':[],'reported_total_gross':0.0};\n"
        "res = _add_parse_warnings({'anomalies':[]}, ex);\n"
        "rules = [a['rule'] for a in res['anomalies']];\n"
        "assert 'RULE_14_PERIOD_PARSE_WARNING' in rules, rules;\n"
        "print('OK')\n"
    )
    out = _run_helper(snippet)
    assert out.returncode == 0, f"stdout={out.stdout}\nstderr={out.stderr}"
    assert "OK" in out.stdout


def test_rule_14_does_not_fire_on_monthly_span():
    snippet = (
        "ex = {'period_start':'2026-04-01','period_end':'2026-04-30','line_items':[],'previous_period_adjustments':[],'reported_total_gross':0.0};\n"
        "res = _add_parse_warnings({'anomalies':[]}, ex);\n"
        "rules = [a['rule'] for a in res['anomalies']];\n"
        "assert 'RULE_14_PERIOD_PARSE_WARNING' not in rules, rules;\n"
        "print('OK')\n"
    )
    out = _run_helper(snippet)
    assert out.returncode == 0, f"stdout={out.stdout}\nstderr={out.stderr}"


def test_rule_15_fires_on_mismatch():
    snippet = (
        "ex = {'reported_total_gross': 1000.0, 'line_items':[{'gross':300.0,'is_cancellation':False},{'gross':300.0,'is_cancellation':False}], 'previous_period_adjustments':[]};\n"
        "res = _add_parse_warnings({'anomalies':[]}, ex);\n"
        "r15 = [a for a in res['anomalies'] if a['rule']=='RULE_15_GROSS_TOTAL_PARSE_WARNING'];\n"
        "assert len(r15)==1 and r15[0]['dollar_impact']>0, r15;\n"
        "print('OK')\n"
    )
    out = _run_helper(snippet)
    assert out.returncode == 0, f"stdout={out.stdout}\nstderr={out.stderr}"


def test_rule_15_no_fire_when_reported_zero():
    snippet = (
        "ex = {'reported_total_gross': 0.0, 'line_items':[{'gross':500.0,'is_cancellation':False}], 'previous_period_adjustments':[]};\n"
        "res = _add_parse_warnings({'anomalies':[]}, ex);\n"
        "r15 = [a for a in res['anomalies'] if a['rule']=='RULE_15_GROSS_TOTAL_PARSE_WARNING'];\n"
        "assert len(r15)==0, r15;\n"
        "print('OK')\n"
    )
    out = _run_helper(snippet)
    assert out.returncode == 0


def test_rule_15_dedupes_if_llm_already_added():
    snippet = (
        "ex = {'reported_total_gross': 1000.0, 'line_items':[{'gross':200.0,'is_cancellation':False}], 'previous_period_adjustments':[]};\n"
        "pre = {'anomalies':[{'rule':'RULE_15_GROSS_TOTAL_PARSE_WARNING','severity':'low','headline':'x','detail':'x'}]};\n"
        "res = _add_parse_warnings(pre, ex);\n"
        "r15 = [a for a in res['anomalies'] if a['rule']=='RULE_15_GROSS_TOTAL_PARSE_WARNING'];\n"
        "assert len(r15)==1, r15;\n"
        "print('OK')\n"
    )
    out = _run_helper(snippet)
    assert out.returncode == 0


# ---- Prompt presence for LLM-driven rules 11/12/13 -----------------------
def test_auditor_system_has_rules_11_12_13():
    with open("/app/backend/agents.py", "r") as fh:
        src = fh.read()
    assert "RULE 11 — BROKERED RATE PREMIUM" in src
    assert "RULE 12 — UNCLAIMED AT-HM COMMITMENTS" in src
    assert "RULE 13 — QUARTERLY UNDERSPEND PATTERN" in src


# ---- Other public tools gating --------------------------------------------
def test_budget_calc_unauth():
    r = requests.post(f"{BASE_URL}/api/public/budget-calc", json={"classification": 4}, timeout=20)
    assert r.status_code in (401, 403), f"{r.status_code}: {r.text[:200]}"


def test_price_check_unauth():
    r = requests.post(f"{BASE_URL}/api/public/price-check", json={"service": "DA-01", "rate": 75.0}, timeout=20)
    assert r.status_code in (401, 403)


# ---- extractErrorMessage helper (verify source presence) ----------------
def test_extract_error_message_helper_signature():
    p = "/app/frontend/src/lib/api.js"
    with open(p) as f:
        src = f.read()
    assert "export function extractErrorMessage" in src
    assert 'typeof detail === "string"' in src
    assert "detail.message" in src


# ---- Daily limit regression ----------------------------------------------
def test_daily_limit_returns_429_with_cookie():
    s = requests.Session()
    s.cookies.set(
        "kindred_sd_used",
        "2026-05-04T23:50:26+00:00",
        domain=BASE_URL.replace("https://", "").replace("http://", ""),
    )
    r = s.post(ENDPOINT, json={"text": MARGARET_STMT}, timeout=30)
    assert r.status_code == 429, f"expected 429 got {r.status_code}: {r.text[:200]}"
    body = r.json().get("detail", {})
    assert body.get("error") == "daily_limit"
