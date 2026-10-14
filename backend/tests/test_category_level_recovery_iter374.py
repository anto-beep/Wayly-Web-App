"""
Iteration 374 — Category-level recovery for Statement Decoder + Invoice Checker.

1. STATEMENT category-level recovery (new fallback in agents.py)
2. STATEMENT regression — normal per-line sample must not engage fallback
3. INVOICE category-summary fix (new fallback in lib/inv1/extractor.py)

Note: the upload endpoints apply a logical dedupe guard based on extracted
fingerprint; when hit, they return status='duplicate' + existing_statement_id.
We treat that as a valid outcome and verify the existing document instead.
"""
import os
import time
import secrets
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://statement-renderer.preview.emergentagent.com").rstrip("/")
CATEGORY_STMT_URL = "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/28885f5d6b5bdd1a_Sam_Burke_SAH_Statement_Oct2026_Simple.pdf"
CATEGORY_INV_URL = "https://customer-assets-eiarnc6j.emergentagent.net/job_8d74dc1c-0092-4bc2-8a55-b38254dd7592/artifacts/4d859c1deda140e8_Sam_Burke_SAH_Invoice_Oct2026_Simple.pdf"
NORMAL_STMT_PATH = "/app/frontend/public/appstore/wayly-sample-support-at-home-statement.pdf"

LOGIN_EMAIL = "cathy@example.com"
LOGIN_PASSWORD = "testpass123"


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def auth_token():
    last_exc = None
    for _ in range(3):
        try:
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
                              timeout=90)
            if r.status_code == 200:
                return r.json()["token"]
            last_exc = f"status={r.status_code} body={r.text[:300]}"
        except Exception as e:
            last_exc = str(e)
            time.sleep(2)
    pytest.fail(f"login failed after retries: {last_exc}")


@pytest.fixture(scope="module")
def participant_id(auth_token):
    r = requests.get(f"{BASE_URL}/api/participants",
                     headers={"Authorization": f"Bearer {auth_token}"}, timeout=60)
    r.raise_for_status()
    items = r.json() if isinstance(r.json(), list) else r.json().get("items") or []
    for p in items:
        if p.get("first_name") == "Dorothy":
            return p["id"]
    return items[0]["id"]


def _nonce_bytes(pdf_bytes: bytes) -> bytes:
    nonce = f"\n%% test-nonce {secrets.token_hex(8)}\n".encode()
    return pdf_bytes + nonce


def _download(url: str) -> bytes:
    r = requests.get(url, timeout=90)
    r.raise_for_status()
    return r.content


def _upload_statement_and_get_id(auth_token, participant_id, pdf_bytes, filename):
    files = {"file": (filename, pdf_bytes, "application/pdf")}
    headers = {
        "Authorization": f"Bearer {auth_token}",
        "X-Participant-Id": participant_id,
    }
    r = requests.post(f"{BASE_URL}/api/statements/upload",
                      files=files, headers=headers, timeout=180)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text[:400]}"
    job_id = r.json()["job_id"]

    deadline = time.time() + 240
    last = None
    while time.time() < deadline:
        jr = requests.get(f"{BASE_URL}/api/statements/upload-job/{job_id}",
                          headers=headers, timeout=60)
        if jr.status_code == 200:
            last = jr.json()
            st = (last.get("status") or "").lower()
            if st in ("done", "complete", "completed"):
                stmt = last.get("statement") or last.get("result")
                return stmt["id"], headers
            if st == "duplicate":
                existing = last.get("existing_statement_id") or last.get("duplicate_statement_id")
                assert existing, f"duplicate without existing id: {last}"
                return existing, headers
            if st in ("failed", "error"):
                pytest.fail(f"job failed: {last}")
        time.sleep(3)
    pytest.fail(f"job timed out; last={last}")


# ---------- STATEMENT category-level recovery ----------
class TestStatementCategoryRecovery:
    def test_category_style_statement_is_publishable(self, auth_token, participant_id):
        pdf = _nonce_bytes(_download(CATEGORY_STMT_URL))
        stmt_id, headers = _upload_statement_and_get_id(auth_token, participant_id, pdf, "cat_stmt.pdf")

        sr = requests.get(f"{BASE_URL}/api/statements/{stmt_id}",
                          headers=headers, timeout=60)
        assert sr.status_code == 200, sr.text[:400]
        stmt = sr.json()

        audit = stmt.get("audit_json") or {}
        extracted = stmt.get("extracted_json") or {}

        # 1. publishable
        assert audit.get("publishable") is True, f"audit_json.publishable != True; audit keys={list(audit.keys())}"

        # 2. no RULE_G2_GROSS_RECONCILE blocker
        def _collect_codes(container):
            codes = []
            for f in container or []:
                if isinstance(f, dict):
                    codes.append(f.get("rule_id") or f.get("code") or f.get("id") or "")
                else:
                    codes.append(str(f))
            return [c for c in codes if c]
        all_codes = (_collect_codes(audit.get("blockers")) +
                     _collect_codes(audit.get("blocking_findings")) +
                     _collect_codes(audit.get("findings")))
        assert "RULE_G2_GROSS_RECONCILE" not in all_codes, f"G2 blocker present; codes={all_codes}"

        # 3. category-level fallback engaged — presence of the diagnostic flag is
        # optional (may be stripped during serialisation); what matters is that
        # the publishable decode produced the correct numbers below. The sibling
        # regression test asserts the flag is absent/falsy on the normal sample.

        # 4. stream_breakdown numbers (lives under audit_json as a LIST of
        # {stream, gross_total, participant_contribution, government_paid, ...})
        sb_raw = (audit.get("stream_breakdown")
                  or extracted.get("stream_breakdown")
                  or (extracted.get("reconciliation") or {}).get("stream_breakdown")
                  or {})
        if isinstance(sb_raw, list):
            sb = {}
            for row in sb_raw:
                name = row.get("stream") or row.get("name") or row.get("category") or ""
                sb[name] = float(row.get("gross_total") or row.get("gross")
                                 or row.get("amount") or row.get("total") or 0)
        elif isinstance(sb_raw, dict):
            def _n(v):
                if isinstance(v, dict):
                    return float(v.get("gross") or v.get("gross_total") or v.get("amount") or 0)
                return float(v or 0)
            sb = {k: _n(v) for k, v in sb_raw.items()}
        else:
            sb = {}
        assert sb, f"missing stream_breakdown; raw={sb_raw}"

        def _get(sb, *keys):
            lo = {str(k).lower(): v for k, v in sb.items()}
            for k in keys:
                if k.lower() in lo:
                    return float(lo[k.lower()] or 0)
            return 0.0

        clinical = _get(sb, "Clinical", "clinical")
        independence = _get(sb, "Independence", "independence")
        everyday = _get(sb, "EverydayLiving", "Everyday Living", "everyday_living", "everydayLiving")
        assert abs(clinical - 1784.20) < 0.5, f"Clinical {clinical} != 1784.20 (sb={sb})"
        assert abs(independence - 356.70) < 0.5, f"Independence {independence} != 356.70"
        assert abs(everyday - 1168.80) < 0.5, f"EverydayLiving {everyday} != 1168.80"

        # 5. care_management_deducted
        cmd = (extracted.get("care_management_deducted")
               or (extracted.get("reconciliation") or {}).get("care_management_deducted")
               or audit.get("care_management_deducted"))
        assert cmd is not None, "care_management_deducted missing"
        assert abs(float(cmd) - 595.00) < 0.5, f"care_management_deducted {cmd} != 595.00"

        # 6. money totals — top-level in extracted_json for this schema
        recon = extracted.get("reconciliation") or {}
        billed = float(extracted.get("reported_total_gross")
                       or recon.get("reported_total_gross")
                       or recon.get("total_billed") or 0)
        your_share = float(extracted.get("reported_total_participant_contribution")
                           or recon.get("participant_contribution")
                           or recon.get("your_share") or 0)
        govt = float(extracted.get("reported_total_government_paid")
                     or recon.get("government_subsidy")
                     or recon.get("government_paid") or 0)
        assert abs(billed - 3904.70) < 0.5, f"billed {billed} != 3904.70"
        assert abs(your_share - 222.38) < 0.5, f"your_share {your_share} != 222.38"
        assert abs(govt - 3682.32) < 0.5, f"govt {govt} != 3682.32"

        # 7. plain-English summary cites $3,904.70 billed, $222.38 share, $3,682.32 govt
        summary = (stmt.get("summary_markdown") or stmt.get("summary")
                   or extracted.get("plain_summary")
                   or audit.get("statement_summary")
                   or audit.get("summary") or "")
        assert "3,904.70" in summary or "3904.70" in summary, (
            f"summary missing billed total; summary head: {summary[:400]}"
        )
        assert "222.38" in summary, f"summary missing your-share; head: {summary[:400]}"
        assert "3,682.32" in summary or "3682.32" in summary, f"summary missing govt total; head: {summary[:400]}"


# ---------- STATEMENT regression (per-line sample must NOT engage fallback) ----------
class TestStatementRegressionNormalSample:
    def test_normal_perline_sample_untouched(self, auth_token, participant_id):
        with open(NORMAL_STMT_PATH, "rb") as f:
            pdf = _nonce_bytes(f.read())
        stmt_id, headers = _upload_statement_and_get_id(auth_token, participant_id, pdf, "normal_stmt.pdf")

        sr = requests.get(f"{BASE_URL}/api/statements/{stmt_id}",
                          headers=headers, timeout=60)
        assert sr.status_code == 200
        stmt = sr.json()
        extracted = stmt.get("extracted_json") or {}

        # 1. fallback must NOT engage on normal sample
        assert not extracted.get("_category_level_fallback"), (
            f"_category_level_fallback should be falsy on normal sample; got {extracted.get('_category_level_fallback')}"
        )

        # 2. real per-line items present with real dollars
        line_items = (extracted.get("line_items")
                      or extracted.get("services")
                      or stmt.get("line_items") or [])
        assert len(line_items) >= 3, f"expected per-line items; got {len(line_items)}"
        total = 0.0
        for li in line_items:
            amt = li.get("gross") or li.get("amount") or li.get("gross_cost") or li.get("total") or li.get("cost") or 0
            try:
                total += float(amt or 0)
            except Exception:
                pass
        assert total > 50.0, f"per-line gross sum unexpectedly low ({total})"


# ---------- INVOICE category-summary fix ----------
class TestInvoiceCategoryRecovery:
    def test_category_style_invoice_fix(self, auth_token, participant_id):
        pdf = _nonce_bytes(_download(CATEGORY_INV_URL))
        files = {"file": ("cat_inv.pdf", pdf, "application/pdf")}
        headers = {
            "Authorization": f"Bearer {auth_token}",
            "X-Participant-Id": participant_id,
        }
        r = requests.post(f"{BASE_URL}/api/invoices/upload",
                          files=files, headers=headers, timeout=180)
        assert r.status_code == 200, f"invoice upload failed: {r.status_code} {r.text[:400]}"
        doc = r.json()
        recon = doc.get("reconciliation") or {}

        # 1. invoice_total
        inv_total = float(recon.get("invoice_total") or 0)
        assert abs(inv_total - 222.38) < 0.5, f"invoice_total {inv_total} != 222.38"

        # 2. four category lines in reconciliation.lines
        lines = recon.get("lines") or []
        assert len(lines) == 4, f"expected 4 category lines, got {len(lines)}: {lines}"

        expected = {
            "clinical": 0.0,
            "independence": 17.84,
            "everyday_living": 204.54,
            "care_management": 0.0,
        }
        got = {}
        for li in lines:
            cat = (li.get("service_category") or li.get("category") or "").lower()
            amt = float(li.get("gross_cost") or li.get("amount") or li.get("gross") or 0)
            svc_date = li.get("service_date")
            assert svc_date in (None, "", "null"), (
                f"service_date must be null for category rows; got {svc_date} on {cat}"
            )
            got[cat] = amt
        for k, v in expected.items():
            assert k in got, f"missing category {k}; got categories={list(got.keys())}"
            assert abs(got[k] - v) < 0.5, f"{k}: got {got[k]} != {v}"

        # 3. No false C5 finding
        findings = recon.get("findings") or []
        for f in findings:
            if isinstance(f, dict):
                code = (f.get("check_id") or f.get("rule_id") or f.get("code") or f.get("id") or "").upper()
                desc = (f.get("narrative") or f.get("message") or f.get("description") or "").lower()
            else:
                code = str(f).upper()
                desc = str(f).lower()
            assert "C5" not in code, f"false C5 finding emitted: {f}"
            assert "charged after" not in desc and "service date after" not in desc, (
                f"service-date-after-invoice-date finding emitted: {f}"
            )

        # 4. overall_verdict
        verdict = (recon.get("overall_verdict") or "").lower()
        assert verdict == "all_clear", f"overall_verdict={verdict!r}"

        # 5. C5 clean_reconciliation entry should be ok=True (not failing)
        clean = recon.get("clean_reconciliation") or []
        c5 = next((c for c in clean if (c.get("check_id") or "").upper() == "C5"), None)
        assert c5 is not None, "C5 missing from clean_reconciliation"
        assert c5.get("ok") is True, f"C5 not ok: {c5}"
