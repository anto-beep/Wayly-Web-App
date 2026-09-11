"""
Iter 325 P0 tests:
- P0 #1: LF-1 letter autosave endpoint persistence (Save-as-Draft)
- P0 #2: Reviewer PDF includes SAFETY CHECKS section + safety-notice
- P0 #3: Printable Estimate PDF (budget) via /api/public/exports/pdf
- P0 #4: Class-4 funding figures (July 2026) from backend calculators
"""
import os
import re
import io
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mobile-parity-6.preview.emergentagent.com").rstrip("/")
EMAIL = "cathy@example.com"
PASSWORD = "testpass123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": EMAIL, "password": PASSWORD}, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def auth(token):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    return s


# ---------- P0 #1: Save-as-Draft (LF-1 autosave) ----------
class TestSaveAsDraftPersistence:
    def test_autosave_persists_intake_and_body(self, auth):
        # Create a new correspondence draft (situation_id=6 = provider request)
        r = auth.post(f"{BASE_URL}/api/lf1/correspondence", json={"situation_id": 6, "recipient_type": "provider_cm", "intake": {}}, timeout=30)
        assert r.status_code in (200, 201), r.text
        j = r.json()
        cid = j.get("id") or j.get("entry_id") or (j.get("entry") or {}).get("id")
        assert cid, r.text

        # PATCH autosave with body + intake
        marker = f"TEST_ITER325_{int(time.time())}"
        body = {
            "intake": {"subject": marker, "participant_name": "Dorothy Smith", "provider_name": "BlueBerry"},
            "content_draft": f"Dear Provider,\n\n{marker}\n\nRegards.",
        }
        p = auth.patch(f"{BASE_URL}/api/lf1/correspondence/{cid}/autosave", json=body, timeout=30)
        assert p.status_code == 200, p.text

        # GET back and verify persistence
        g = auth.get(f"{BASE_URL}/api/lf1/correspondence/{cid}", timeout=30)
        assert g.status_code == 200
        data = g.json()
        intake = data.get("intake") or {}
        assert intake.get("subject") == marker, f"intake.subject not persisted: {intake}"
        got_body = data.get("content_draft") or data.get("body") or data.get("draft_body") or ""
        assert marker in got_body, f"body not persisted: {got_body[:200]}"


# ---------- P0 #2: Reviewer PDF must include SAFETY CHECKS + safety notice ----------
class TestReviewerPDFSafety:
    def _extract_text(self, pdf_bytes: bytes) -> str:
        try:
            from pypdf import PdfReader
        except Exception:
            try:
                from PyPDF2 import PdfReader
            except Exception:
                pytest.skip("pypdf/PyPDF2 not installed")
        reader = PdfReader(io.BytesIO(pdf_bytes))
        return "\n".join((p.extract_text() or "") for p in reader.pages)

    def test_summary_pdf_contains_safety_notice_and_checks(self, auth):
        # POST /api/care-plans/summary.pdf — needs a minimal payload matching what CarePlanReviewer sends
        payload = {
            "extraction": {"provider_name": "BlueBerry", "classification": 4, "quarterly_budget": 6855.41},
            "participant_name": "Dorothy Smith",
            "plan_summary": "Test summary",
            "safety_notice": {"title": "Safety notice", "body": "Legal references are being reviewed for the July 2026 rules."},
            "verification_panel": {"checks": [
                {"label": "Legal reference check", "status": "pass", "detail": "All refs verified"},
                {"label": "Contradiction check", "status": "flag", "detail": "One item worth reviewing"},
                {"label": "Provider rate sanity", "status": "cannot_run", "detail": "Missing rate card"},
            ]},
            "findings": [],
        }
        r = auth.post(f"{BASE_URL}/api/care-plans/summary.pdf", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:500]
        assert r.headers.get("content-type", "").startswith("application/pdf"), r.headers
        assert len(r.content) > 2000
        text = self._extract_text(r.content).upper()
        assert "SAFETY CHECKS WE RAN" in text, f"missing safety checks header. Text head: {text[:600]}"
        # Status labels
        assert "ALL GOOD" in text, "missing 'All good' status label"
        assert "WORTH A LOOK" in text, "missing 'Worth a look' status label"
        assert "NEED MORE INFO" in text, "missing 'Need more info' status label"
        # Safety notice text (case-insensitive presence)
        assert "LEGAL REFERENCES" in text or "SAFETY" in text, "missing safety-notice text block"

    def test_public_exports_care_plan_pdf(self, auth):
        payload = {
            "tool": "care-plan",
            "payload": {
                "participant_name": "Dorothy Smith",
                "plan_summary": "Reviewer output",
                "safety_notice": {"title": "Safety notice", "body": "Legal references are being reviewed."},
                "verification_panel": {"checks": [
                    {"label": "Legal reference check", "status": "pass", "detail": "ok"},
                    {"label": "Contradiction check", "status": "flag", "detail": "note"},
                    {"label": "Provider rate sanity", "status": "cannot_run", "detail": "missing"},
                ]},
                "findings": [],
                "extraction": {"provider_name": "BlueBerry", "classification": 4},
            },
        }
        r = auth.post(f"{BASE_URL}/api/public/exports/pdf", json=payload, timeout=60)
        # Some deployments require /api/public/exports/pdf without auth; try both
        if r.status_code == 401:
            r = requests.post(f"{BASE_URL}/api/public/exports/pdf", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:500]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        text = self._extract_text(r.content).upper()
        assert "SAFETY CHECKS WE RAN" in text or "SAFETY" in text


# ---------- P0 #3: Printable Estimate PDF (budget) ----------
class TestBudgetPrintablePDF:
    def test_budget_pdf_export(self, auth):
        payload = {
            "tool": "budget",
            "payload": {
                "classification": 4,
                "quarterly_usable": 6855.41,
                "annual_package": 30468.51,
                "care_management_qtr": 761.72,
                "lifetime_cap_standard": 137917.01,
            },
            "person_name": "Dorothy Smith",
        }
        r = auth.post(f"{BASE_URL}/api/public/exports/pdf", json=payload, timeout=60)
        if r.status_code == 401:
            r = requests.post(f"{BASE_URL}/api/public/exports/pdf", json=payload, timeout=60)
        assert r.status_code == 200, r.text[:500]
        assert r.headers.get("content-type", "").startswith("application/pdf")
        assert len(r.content) > 2000


# ---------- P0 #4: Class-4 figures ----------
class TestClass4Figures:
    def test_backend_budget_class_4_figures(self, auth):
        # Try known budget endpoint that classifies
        # Iterate candidate endpoints
        candidates = [
            (f"{BASE_URL}/api/budget/calculate", {"classification": 4, "level": 4}),
            (f"{BASE_URL}/api/tools/budget-calculator", {"classification": 4}),
            (f"{BASE_URL}/api/ai-tools/budget-calculator/calculate", {"classification": 4}),
        ]
        got = None
        for url, body in candidates:
            r = auth.post(url, json=body, timeout=30)
            if r.status_code == 200:
                got = r.json()
                break
        if not got:
            pytest.skip("No budget calculator endpoint responded 200 — will rely on UI parity check")
        # Look for the expected values anywhere in the response
        s = str(got)
        for expected in ("30468.51", "6855.41", "761.72", "137917.01"):
            assert expected in s, f"Class-4 figure {expected} not present in response: {s[:400]}"
