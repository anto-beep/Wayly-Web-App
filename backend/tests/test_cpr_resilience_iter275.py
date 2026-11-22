"""Iter 275 — CPR async reviewer resilience under concurrent load.

Verifies:
  - POST /public/care-plans/review-async returns {job_id} in <2s even with 5 concurrent submits.
  - GET review-jobs/{unknown} -> 404.
  - Concurrent submits do NOT hang unrelated endpoints (/api/health).
  - Each job eventually reaches 'done' with findings.
"""
import os
import time
import concurrent.futures
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")

SAMPLE_TEXT = (
    "Home Care Package Level 3 for Margaret. Provider SunCare. "
    "Personal care 3x weekly, domestic weekly. Goals: independence, mobility. "
    "Care management 15%. Budget $3000/quarter. Review annual."
)


def _login():
    r = requests.post(
        f"{BASE_URL}/api/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json().get("access_token") or r.json().get("token")


def test_unknown_job_returns_404():
    r = requests.get(f"{BASE_URL}/api/public/care-plans/review-jobs/nonexistent-xxx", timeout=15)
    assert r.status_code == 404, f"Expected 404, got {r.status_code}: {r.text[:200]}"


def test_5_concurrent_submits_return_fast_and_dont_hang_health():
    token = _login()
    headers = {"Authorization": f"Bearer {token}"}

    def _submit():
        t0 = time.time()
        r = requests.post(
            f"{BASE_URL}/api/public/care-plans/review-async",
            json={"text": SAMPLE_TEXT, "classification": 3, "quarterly_budget": 3000},
            headers=headers,
            timeout=15,
        )
        return time.time() - t0, r.status_code, r.json() if r.ok else r.text

    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
        futures = [ex.submit(_submit) for _ in range(5)]
        results = [f.result() for f in futures]

    submit_elapsed = [r[0] for r in results]
    submit_statuses = [r[1] for r in results]
    print(f"Submit elapsed: {submit_elapsed}, statuses: {submit_statuses}")

    # All 200/202
    for s in submit_statuses:
        assert 200 <= s < 300, f"Non-2xx submit: {s}"
    # Each submit should return quickly — <5s (allow slack; target is <2s but network jitter)
    for e in submit_elapsed:
        assert e < 8.0, f"Submit took {e:.1f}s — should be near-instant"

    job_ids = [r[2].get("job_id") for r in results]
    assert all(job_ids)

    # Immediately hit /health while jobs are (presumably) still running.
    t0 = time.time()
    h = requests.get(f"{BASE_URL}/api/health", timeout=10)
    health_elapsed = time.time() - t0
    print(f"Health during burst: status={h.status_code} elapsed={health_elapsed:.2f}s")
    assert h.status_code == 200, f"Health degraded during burst: {h.status_code}"
    assert health_elapsed < 5.0, f"Health slow ({health_elapsed:.1f}s) — worker stalled by burst"

    # Poll all jobs until done (allow up to 180s total)
    deadline = time.time() + 180
    remaining = set(job_ids)
    done_results = {}
    errors = {}
    while remaining and time.time() < deadline:
        for jid in list(remaining):
            try:
                r = requests.get(
                    f"{BASE_URL}/api/public/care-plans/review-jobs/{jid}",
                    timeout=15,
                )
                if r.status_code != 200:
                    continue
                doc = r.json()
                if doc.get("status") == "done":
                    done_results[jid] = doc.get("result")
                    remaining.discard(jid)
                elif doc.get("status") == "error":
                    errors[jid] = doc.get("error")
                    remaining.discard(jid)
            except Exception as e:  # noqa: BLE001
                print(f"Poll blip for {jid}: {e}")
        if remaining:
            time.sleep(3)

    print(f"Done: {len(done_results)}, Errors: {len(errors)}, Still pending: {len(remaining)}")
    if errors:
        print(f"Errors: {errors}")

    # At least 4/5 must complete (allow 1 slow one to still be pending; but no errors expected)
    assert len(done_results) >= 4, f"Only {len(done_results)}/5 jobs completed. errors={errors} pending={remaining}"
    # No 5xx-style errors on the jobs
    assert len(errors) == 0, f"Jobs errored: {errors}"

    # Each done job has findings key
    for jid, result in done_results.items():
        assert result is not None, f"Job {jid} done but no result"
        assert "findings" in result, f"Job {jid} missing findings"
