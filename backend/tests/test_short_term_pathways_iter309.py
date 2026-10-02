"""Iter 309: Short-Term Pathways backend + regression tests.

Covers:
- GET /api/public/short-term-pathways payload shape (both pathways with correct funding figures)
- POST /api/public/short-term-pathways/check for the three scenarios
- Regression for asyncio.to_thread offload in document_extract.py:
    * /api/health returns quickly (<2s)
    * /api/public/decode-statement-text still works end-to-end (async job)
"""
import os
import time
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Warm up connection to avoid first-request TLS handshake timing skew
    try:
        s.get(f"{API}/health", timeout=30)
    except Exception:
        pass
    return s


# --- 1. GET /public/short-term-pathways ------------------------------------
class TestSTPReference:
    def test_get_pathways_ok(self, client):
        r = client.get(f"{API}/public/short-term-pathways", timeout=10)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "pathways" in data
        ids = [p["id"] for p in data["pathways"]]
        assert "restorative_care" in ids
        assert "end_of_life" in ids

    def test_restorative_care_shape(self, client):
        data = client.get(f"{API}/public/short-term-pathways", timeout=10).json()
        by_id = {p["id"]: p for p in data["pathways"]}
        rc = by_id["restorative_care"]
        # Required keys
        for k in ("covers", "eligibility_signals", "provider_questions",
                  "key_facts", "section_ref"):
            assert k in rc, f"missing {k} in restorative_care"
        # Funding figures (July 2026): $6,000 / $12,000 max / 112 days
        facts_blob = " ".join(str(v) for v in rc["key_facts"]) if isinstance(rc["key_facts"], list) else str(rc["key_facts"])
        combined = (facts_blob + " " + str(rc)).lower()
        assert "6,000" in combined or "$6000" in combined or "6000" in combined
        assert "12,000" in combined or "12000" in combined
        assert "112" in combined or "16 weeks" in combined or "16-week" in combined

    def test_end_of_life_shape(self, client):
        data = client.get(f"{API}/public/short-term-pathways", timeout=10).json()
        by_id = {p["id"]: p for p in data["pathways"]}
        eol = by_id["end_of_life"]
        for k in ("covers", "eligibility_signals", "provider_questions",
                  "key_facts", "section_ref"):
            assert k in eol, f"missing {k} in end_of_life"
        combined = str(eol).lower()
        assert "25,000" in combined or "25000" in combined
        assert "84" in combined or "12 weeks" in combined or "12-week" in combined


# --- 2. POST /public/short-term-pathways/check -----------------------------
class TestSTPCheck:
    def test_recovering_recent(self, client):
        body = {"situation": "recovering", "recent_event": True}
        r = client.post(f"{API}/public/short-term-pathways/check", json=body, timeout=10)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["recommended"] == ["restorative_care"]
        assert d["results"][0]["confidence"] == "likely"
        assert "headline" in d and d["headline"]

    def test_recovering_no_recent(self, client):
        body = {"situation": "recovering", "recent_event": False}
        r = client.post(f"{API}/public/short-term-pathways/check", json=body, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["recommended"] == ["restorative_care"]
        assert d["results"][0]["confidence"] == "possible"

    def test_end_of_life_both(self, client):
        body = {"situation": "end_of_life", "prognosis_short": True, "stay_at_home": True}
        r = client.post(f"{API}/public/short-term-pathways/check", json=body, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert d["recommended"] == ["end_of_life"]
        assert d["results"][0]["confidence"] == "likely"

    def test_end_of_life_partial(self, client):
        body = {"situation": "end_of_life", "prognosis_short": True, "stay_at_home": False}
        r = client.post(f"{API}/public/short-term-pathways/check", json=body, timeout=10)
        assert r.status_code == 200
        assert r.json()["results"][0]["confidence"] == "possible"

    def test_exploring(self, client):
        body = {"situation": "exploring"}
        r = client.post(f"{API}/public/short-term-pathways/check", json=body, timeout=10)
        assert r.status_code == 200
        d = r.json()
        assert set(d["recommended"]) == {"restorative_care", "end_of_life"}
        assert len(d["results"]) == 2


# --- 3. Regression: /api/health quick -------------------------------------
class TestHealthQuick:
    def test_health_fast(self, client):
        t0 = time.time()
        r = client.get(f"{API}/health", timeout=5)
        dt = time.time() - t0
        assert r.status_code == 200, r.text
        assert dt < 2.0, f"/api/health took {dt:.2f}s (>2s)"


# --- 4. Regression: decode-statement-text still works ---------------------
SAMPLE_TEXT = """Home Care Package Statement
Period: 01 Jul 2026 to 30 Sep 2026
Package Level: 4
Package Subsidy: 5,432.10
Package fee: -300.00
Package management: -250.00
Care management: -180.00
Balance carried forward: 1,200.00
Services delivered:
Personal care - $560.00
Domestic assistance - $420.00
"""


class TestDecodeRegression:
    def test_decode_statement_text_job(self, client):
        r = client.post(
            f"{API}/public/decode-statement-text",
            json={"text": SAMPLE_TEXT},
            timeout=15,
        )
        assert r.status_code in (200, 202, 429), r.text
        if r.status_code == 429:
            pytest.skip("public decode is rate-limited (cooldown_active) — endpoint responded, no server error")
        data = r.json()
        job_id = data.get("job_id") or data.get("id")
        assert job_id, f"no job id in response: {data}"

        # Poll for completion up to 30s
        deadline = time.time() + 30
        status = None
        payload = None
        while time.time() < deadline:
            jr = client.get(f"{API}/public/decode-job/{job_id}", timeout=10)
            assert jr.status_code == 200, jr.text
            payload = jr.json()
            status = payload.get("status")
            if status in ("done", "completed", "success", "error", "failed"):
                break
            time.sleep(1)
        assert status in ("done", "completed", "success"), f"job status={status}, payload={payload}"
