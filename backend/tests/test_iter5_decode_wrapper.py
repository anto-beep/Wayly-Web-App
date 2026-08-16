"""Iteration 5 regression: verify wrapper PII redaction is wired on
/api/public/decode-statement-text and /api/public/decode-statement (file upload).
Also re-confirm wrapper still works on the previously-fixed endpoints, and that
clean (no-PII) input does not raise or surface a redaction notice."""
import io
import os
import time
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path("/app/frontend/.env"))
BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

PII_TEXT = (
    "Statement for John Smith, phone 0412 345 678, email john@gmail.com. "
    "Personal care 2 visits at $95 = $190.00 on 2026-04-01. "
    "Domestic assistance 1 visit at $80 = $80.00 on 2026-04-08."
)

CLEAN_TEXT = (
    "Quarterly statement period April 2026. "
    "Personal care 4 visits at $90 = $360.00. "
    "Domestic assistance 2 visits at $75 = $150.00."
)


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _assert_no_pii(text: str):
    """Summary/output should not contain raw PII tokens."""
    assert text is not None
    lower = text.lower()
    assert "john" not in lower, f"PII 'john' leaked into output: {text[:300]}"
    assert "john@gmail.com" not in lower, f"email leaked: {text[:300]}"
    assert "0412 345 678" not in text, f"phone leaked: {text[:300]}"


# ---- decode-statement-text ----
class TestDecodeStatementText:
    def test_pii_redacted_in_response_and_summary(self, session):
        r = session.post(f"{API}/public/decode-statement-text", json={"text": PII_TEXT})
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:300]}"
        data = r.json()
        # Top-level wrapper fields MUST be present
        assert data.get("redaction_notice"), f"missing redaction_notice: {data}"
        assert isinstance(data["redaction_notice"], str)
        assert data.get("redaction_count", 0) >= 2, f"redaction_count too low: {data.get('redaction_count')}"
        # Summary must not echo PII
        summary = data.get("summary") or ""
        _assert_no_pii(summary)

    def test_clean_text_no_redaction_notice(self, session):
        r = session.post(f"{API}/public/decode-statement-text", json={"text": CLEAN_TEXT})
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:300]}"
        data = r.json()
        # No PII => redaction_notice should be absent or null/empty
        notice = data.get("redaction_notice")
        assert not notice, f"clean text should not produce redaction_notice, got: {notice!r}"
        # Should still parse normally
        assert "summary" in data
        assert "line_items" in data


# ---- decode-statement (file upload) ----
class TestDecodeStatementFileUpload:
    def test_csv_with_pii_redacted(self, session):
        csv_body = (
            "date,service,units,unit_price,total,notes\n"
            "2026-04-01,Personal care,2,95,190.00,Provided to John Smith phone 0412 345 678 email john@gmail.com\n"
            "2026-04-08,Domestic assistance,1,80,80.00,For John Smith\n"
        )
        files = {"file": ("statement.csv", io.BytesIO(csv_body.encode("utf-8")), "text/csv")}
        # requests will set Content-Type for multipart; remove json header
        sess = requests.Session()
        r = sess.post(f"{API}/public/decode-statement", files=files)
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:400]}"
        data = r.json()
        assert data.get("redaction_notice"), f"missing redaction_notice on file upload: {data}"
        assert data.get("redaction_count", 0) >= 2, f"redaction_count too low: {data.get('redaction_count')}"
        summary = data.get("summary") or ""
        _assert_no_pii(summary)


# ---- Existing wrapper-wired endpoints (regression) ----
class TestWrapperRegression:
    def test_reassessment_letter_redacts(self, session):
        body = {
            "participant_name": "Test Participant",
            "current_classification": 4,
            "changes_summary": (
                "Recent changes for John Smith (phone 0412 345 678, email john@gmail.com): "
                "two falls in last month, increased confusion at night, needs more personal care."
            ),
            "recent_events": "Hospital admission 2026-03-15.",
            "sender_name": "Test Sender",
            "relationship": "daughter",
        }
        r = session.post(f"{API}/public/reassessment-letter", json=body)
        if r.status_code == 503:
            pytest.skip("LLM unavailable")
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("redaction_notice"), f"missing redaction_notice: {data}"
        # Letter body should not contain raw PII tokens
        letter = data.get("letter") or ""
        assert "0412 345 678" not in letter
        assert "john@gmail.com" not in letter.lower()

    def test_care_plan_review_redacts(self, session):
        text = (
            "Care plan for participant. Contact: John Smith, phone 0412 345 678, "
            "email john@gmail.com. Goals: maintain independence at home. "
            "Services: personal care 3x/week, domestic assistance weekly. "
            "Review date: 2026-10-01. Cultural preferences: English speaking. "
            "Complaints pathway: provider hotline. Contribution: $200/quarter."
        )
        r = session.post(f"{API}/public/care-plan-review", json={"text": text})
        if r.status_code == 503:
            pytest.skip("LLM unavailable")
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("redaction_notice"), f"missing redaction_notice: {data}"

    def test_family_coordinator_chat_redacts(self, session):
        msg = (
            "Hi, I'm caring for John Smith (phone 0412 345 678, email john@gmail.com) "
            "and need help understanding the Support at Home program."
        )
        r = session.post(
            f"{API}/public/family-coordinator-chat",
            json={"message": msg, "session_id": f"test-iter5-{int(time.time())}"},
        )
        if r.status_code == 503:
            pytest.skip("LLM unavailable")
        assert r.status_code == 200, f"unexpected: {r.status_code} {r.text[:300]}"
        data = r.json()
        assert data.get("redaction_notice"), f"missing redaction_notice: {data}"
        reply = data.get("reply") or ""
        assert "0412 345 678" not in reply
        assert "john@gmail.com" not in reply.lower()
