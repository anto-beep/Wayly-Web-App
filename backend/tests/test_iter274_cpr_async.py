"""iter274: Async Support Plan Reviewer endpoints (no 502 fix).

Covers:
- POST /api/public/care-plans/review-async returns {job_id, status:processing} in <2s
- GET /api/public/care-plans/review-jobs/{job_id} transitions processing -> done within ~90s
- POST /api/public/care-plans/review-files-async accepts multipart and returns job_id
- Unknown job id -> 404 (not 5xx)
- Legacy sync endpoints /public/care-plans/review and /public/care-plans/review-files are still registered
"""

import io
import os
import time
import requests


def _load_frontend_backend_url():
    # Prefer env; fall back to /app/frontend/.env if not injected.
    val = os.environ.get("REACT_APP_BACKEND_URL")
    if val:
        return val.rstrip("/")
    with open("/app/frontend/.env", "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("REACT_APP_BACKEND_URL="):
                return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")


BASE_URL = _load_frontend_backend_url()
API = f"{BASE_URL}/api"

SAMPLE_PLAN_TEXT = (
    "Home Care Package Level 3 for Margaret. Provider SunCare. "
    "Personal care 3x weekly, domestic weekly. Goals: independence, mobility. "
    "Care management 15%. Budget $3000/quarter. Review annual."
)


def _login_cathy():
    r = requests.post(
        f"{API}/auth/login",
        json={"email": "cathy@example.com", "password": "testpass123"},
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()["token"]


def _auth_headers():
    return {"Authorization": f"Bearer {_login_cathy()}"}


# --- 1. Submit text review returns instantly ---------------------------------
def test_review_async_submit_returns_instantly():
    t0 = time.time()
    r = requests.post(
        f"{API}/public/care-plans/review-async",
        json={
            "text": SAMPLE_PLAN_TEXT,
            "classification": 3,
            "quarterly_budget": 3000,
        },
        headers=_auth_headers(),
        timeout=10,
    )
    elapsed = time.time() - t0
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    assert "job_id" in body and isinstance(body["job_id"], str) and len(body["job_id"]) > 0
    assert body.get("status") == "processing"
    # <2s is spec; give some slack for network but <5s comfortably
    assert elapsed < 5.0, f"submit took too long ({elapsed:.1f}s) — should be non-blocking"


# --- 2. Poll job status to done within ~90s ----------------------------------
def test_review_async_poll_to_done_with_findings():
    # submit
    r = requests.post(
        f"{API}/public/care-plans/review-async",
        json={
            "text": SAMPLE_PLAN_TEXT,
            "classification": 3,
            "quarterly_budget": 3000,
        },
        headers=_auth_headers(),
        timeout=10,
    )
    assert r.status_code == 200, r.text
    job_id = r.json()["job_id"]

    # poll
    deadline = time.time() + 100
    last = None
    while time.time() < deadline:
        pr = requests.get(
            f"{API}/public/care-plans/review-jobs/{job_id}",
            headers=_auth_headers(),
            timeout=15,
        )
        assert pr.status_code == 200, pr.text
        last = pr.json()
        status = last.get("status")
        assert status in ("processing", "done", "error"), f"unexpected status {status}"
        if status in ("done", "error"):
            break
        time.sleep(3)

    assert last is not None
    # Task states this must complete; error is a soft-fail but graceful.
    assert last["status"] == "done", (
        f"expected done, got {last.get('status')}: {str(last)[:400]}"
    )
    result = last.get("result") or {}
    findings = result.get("findings") or []
    assert isinstance(findings, list) and len(findings) >= 1, (
        f"expected >=1 finding, got {len(findings)}"
    )


# --- 3. Multi-file async submit ---------------------------------------------
def test_review_files_async_submit_returns_job_and_polls_done():
    # Use a care-plan-styled text (with goals/supports blocks) so the upload-guard
    # doesn't misclassify it as a statement.
    plan_text = (
        "Support Plan for Margaret Chen\n"
        "Effective from: 2026-01-01 to 2026-12-31\n"
        "Home Care Package Level 3\n"
        "Provider: SunCare\n"
        "Classification: 3\n"
        "Quarterly Budget: $3000\n\n"
        "Goals:\n- Maintain independence at home\n- Improve mobility\n- Social participation\n\n"
        "Supports and services:\n"
        "- Personal care: 3 times per week\n"
        "- Domestic assistance: weekly\n"
        "- Nursing: monthly review\n\n"
        "Care management: 15% of package (higher than the 10% guideline)\n"
        "Package management: 10%\n\n"
        "Review: annual\n"
    )
    text_bytes = plan_text.encode("utf-8")
    files = {"files": ("care_plan.txt", io.BytesIO(text_bytes), "text/plain")}
    data = {"classification": "3", "quarterly_budget": "3000"}

    t0 = time.time()
    r = requests.post(
        f"{API}/public/care-plans/review-files-async",
        files=files,
        data=data,
        headers=_auth_headers(),
        timeout=15,
    )
    elapsed = time.time() - t0
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    body = r.json()
    assert "job_id" in body
    assert body.get("status") == "processing"
    assert elapsed < 8.0, f"file-submit took too long ({elapsed:.1f}s)"

    job_id = body["job_id"]
    deadline = time.time() + 100
    last = None
    while time.time() < deadline:
        pr = requests.get(
            f"{API}/public/care-plans/review-jobs/{job_id}",
            headers=_auth_headers(),
            timeout=15,
        )
        assert pr.status_code == 200, pr.text
        last = pr.json()
        if last.get("status") in ("done", "error"):
            break
        time.sleep(3)

    assert last and last.get("status") == "done", (
        f"file review job did not complete: {str(last)[:400]}"
    )
    findings = (last.get("result") or {}).get("findings") or []
    assert len(findings) >= 1, "expected >=1 finding on files async review"


# --- 4. Unknown job id -> 404, NOT 5xx ---------------------------------------
def test_unknown_job_id_returns_404():
    r = requests.get(
        f"{API}/public/care-plans/review-jobs/nonexistent-abc-123",
        headers=_auth_headers(),
        timeout=10,
    )
    assert r.status_code == 404, f"expected 404 got {r.status_code} {r.text[:200]}"


# --- 5. Legacy sync endpoints still registered (not 404/405) -----------------
def test_legacy_sync_endpoints_registered():
    # POST without body should not return 404/405 (validation error or timeout OK).
    # Use OPTIONS to check routing without invoking LLM.
    r1 = requests.options(f"{API}/public/care-plans/review", timeout=10)
    assert r1.status_code not in (404, 405), f"review endpoint missing: {r1.status_code}"

    r2 = requests.options(f"{API}/public/care-plans/review-files", timeout=10)
    assert r2.status_code not in (404, 405), (
        f"review-files endpoint missing: {r2.status_code}"
    )


# --- 6. Draft-letter-from-findings endpoint (used by cp-draft-letter-all) ----
def test_letter_from_findings_returns_editor_path():
    payload = {
        "findings": [
            {
                "id": "f1",
                "title": "Care management 15% exceeds cap",
                "severity": "medium",
                "category": "care_management",
                "addressee": "provider",
            }
        ],
        "provider_name": "SunCare",
    }
    r = requests.post(
        f"{API}/care-plans/letter-from-findings",
        json=payload,
        headers=_auth_headers(),
        timeout=30,
    )
    assert r.status_code == 200, f"{r.status_code} {r.text[:400]}"
    body = r.json()
    assert body.get("editor_path"), f"missing editor_path: {body}"
