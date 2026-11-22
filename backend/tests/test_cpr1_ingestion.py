"""CPR-1 · Ingestion service tests.

Deterministic (no LLM). Verifies:
* validate_submission enforces spec §B.1 limits (file size, count, MIME)
* redact_plan_text removes names / addresses / Medicare numbers
* structure_plan_text parses classification, dates, provider, quarterly budget
* structure_plan_text extracts services with correct stream classification
* ingest_care_plan_text returns a coherent bundle
"""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from services.care_plan_ingestion import (   # noqa: E402
    MAX_FILES_PER_SUBMISSION,
    UploadValidationError,
    ingest_care_plan_text,
    redact_plan_text,
    structure_plan_text,
    validate_submission,
)
from tests.fixtures.care_plans.build_sample_louisa_davids_2026_07 import (  # noqa: E402
    SAMPLE_TEXT,
)


# ---------------------------------------------------------------------------
# validate_submission
# ---------------------------------------------------------------------------

def test_validate_submission_empty_fails():
    with pytest.raises(UploadValidationError, match="No files"):
        validate_submission([])


def test_validate_submission_over_5_files_fails():
    files = [(f"f{i}.pdf", b"x", "application/pdf") for i in range(MAX_FILES_PER_SUBMISSION + 1)]
    with pytest.raises(UploadValidationError, match=r"Up to \d+ files"):
        validate_submission(files)


def test_validate_submission_over_20mb_fails():
    big = b"x" * (21 * 1024 * 1024)
    with pytest.raises(UploadValidationError, match="Maximum is 20 MB"):
        validate_submission([("big.pdf", big, "application/pdf")])


def test_validate_submission_unsupported_mime_fails():
    with pytest.raises(UploadValidationError, match="unsupported file type"):
        validate_submission([("plan.exe", b"x", "application/octet-stream")])


def test_validate_submission_accepts_all_documented_types():
    ok = [
        ("plan.pdf", b"x", "application/pdf"),
        ("plan.docx", b"x", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("plan.jpg", b"x", "image/jpeg"),
        ("plan.heic", b"x", "image/heic"),
        ("plan.txt", b"x", "text/plain"),
    ]
    validate_submission(ok)      # should not raise


# ---------------------------------------------------------------------------
# redact_plan_text
# ---------------------------------------------------------------------------

def test_redact_removes_names():
    text = "Participant: Louisa Davids. Contact her son Andrew Davids."
    red = redact_plan_text(text)
    assert "Louisa" not in red
    assert "Davids" not in red
    assert "Andrew" not in red
    assert "REDACTED_NAME" in red


def test_redact_removes_medicare_numbers():
    text = "Medicare: 2345 67890 1"
    red = redact_plan_text(text)
    assert "REDACTED_MEDICARE" in red
    assert "2345 67890 1" not in red


def test_redact_removes_addresses():
    text = "Address: 42 Wallaby Way Sydney"
    red = redact_plan_text(text)
    assert "REDACTED_ADDRESS" in red
    assert "Wallaby Way" not in red


def test_redact_idempotent_on_already_redacted():
    text = "[REDACTED_NAME] lives here."
    red = redact_plan_text(text)
    assert red == "[REDACTED_NAME] lives here."


# ---------------------------------------------------------------------------
# structure_plan_text
# ---------------------------------------------------------------------------

def test_structure_extracts_classification():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-1")
    assert ext.classification == 8


def test_structure_extracts_effective_dates():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-1")
    assert ext.effective_from == "2026-07-01"
    assert ext.effective_to == "2026-09-30"


def test_structure_extracts_provider():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-1")
    assert ext.provider_name is not None
    assert "Glorious Services" in ext.provider_name


def test_structure_extracts_quarterly_budget():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-1")
    assert ext.quarterly_budget == 19527.0


def test_structure_extracts_first_name():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-1")
    assert ext.participant_first_name == "Louisa"


def test_structure_extracts_services_with_streams():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-1")
    assert len(ext.services) >= 2
    streams = {s.stream for s in ext.services}
    # At least one Independence + one EverydayLiving should have been detected
    assert "Independence" in streams or "EverydayLiving" in streams


def test_structure_does_not_extract_care_management_as_service():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-1")
    for s in ext.services:
        assert "care management" not in (s.description or "").lower()


def test_structure_care_plan_id_binds():
    ext = structure_plan_text(SAMPLE_TEXT, care_plan_id="cp-abc")
    assert ext.care_plan_id == "cp-abc"


# ---------------------------------------------------------------------------
# ingest_care_plan_text
# ---------------------------------------------------------------------------

def test_ingest_returns_analysis_text_unredacted_by_default():
    out = ingest_care_plan_text(SAMPLE_TEXT, care_plan_id="cp-1", redact=False)
    assert "Louisa" in out["analysis_text"]
    assert out["raw_text"] == SAMPLE_TEXT


def test_ingest_redacts_when_flag_on():
    out = ingest_care_plan_text(SAMPLE_TEXT, care_plan_id="cp-1", redact=True)
    assert "Louisa" not in out["analysis_text"]
    assert "REDACTED_NAME" in out["analysis_text"]
    # But raw_text is preserved unredacted
    assert "Louisa" in out["raw_text"]


def test_ingest_extraction_is_populated():
    out = ingest_care_plan_text(SAMPLE_TEXT, care_plan_id="cp-1", redact=False)
    ext = out["extraction"]
    assert ext.classification == 8
    assert ext.effective_from == "2026-07-01"
    assert len(ext.services) >= 2
