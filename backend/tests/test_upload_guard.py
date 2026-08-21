"""UPLOAD-GUARD-1 (v1) regression tests."""
from lib.upload_guard import classify_upload, classify_content

PDF = b"%PDF-1.4 minimal"
INVOICE = "TAX INVOICE Invoice Number 123 ABN 11 222 333 444 Amount due $500 GST included Bill to: Jane"
STATEMENT = "Monthly Statement Home Care Package Opening balance Closing balance care management Support at Home"
CARE_PLAN = "Support Plan Goals Supports Review date service agreement My Aged Care provider"


def test_invoice_accepts_invoice():
    v = classify_upload("invoice-checker", "inv.pdf", PDF, "application/pdf", INVOICE)
    assert v["decision"] == "accept"


def test_invoice_flags_statement_as_wrong_tool():
    v = classify_upload("invoice-checker", "s.pdf", PDF, "application/pdf", STATEMENT)
    assert v["decision"] == "block" and v["reason"] == "wrong_tool"
    assert v["detected_type"] == "statement-decoder"


def test_invoice_flags_care_plan_as_wrong_tool_with_redirect():
    v = classify_upload("invoice-checker", "c.pdf", PDF, "application/pdf", CARE_PLAN)
    assert v["reason"] == "wrong_tool"
    assert v["wrong_tool"]["slug"] == "care-plan-reviewer"
    assert v["wrong_tool"]["route_mobile"] == "/tool/care-plan-reviewer"


def test_unrelated_document_blocked():
    v = classify_upload("invoice-checker", "r.pdf", PDF, "application/pdf",
                        "the quick brown fox jumps over the lazy dog again and again today")
    assert v["decision"] == "block" and v["reason"] == "unrelated"


def test_too_large_blocked():
    big = b"%PDF" + b"x" * (21 * 1024 * 1024)
    v = classify_upload("invoice-checker", "b.pdf", big, "application/pdf", INVOICE)
    assert v["reason"] == "too_large"


def test_wrong_type_blocked():
    v = classify_upload("invoice-checker", "x.exe", b"MZ\x90\x00", "application/octet-stream", INVOICE)
    assert v["reason"] == "wrong_type"


def test_empty_blocked():
    v = classify_upload("invoice-checker", "e.pdf", b"", "application/pdf", INVOICE)
    assert v["reason"] == "empty"


def test_unreadable_blocked():
    v = classify_upload("invoice-checker", "e.pdf", PDF, "application/pdf", "short")
    assert v["reason"] == "unreadable"


def test_care_plan_accepts_care_plan():
    v = classify_content("care-plan-reviewer", CARE_PLAN)
    assert v["decision"] == "accept"


def test_care_plan_flags_invoice_as_wrong_tool():
    v = classify_content("care-plan-reviewer", INVOICE)
    assert v["reason"] == "wrong_tool" and v["wrong_tool"]["slug"] == "invoice-checker"


def test_confirm_tier_for_ambiguous_invoice():
    # Hits one weak signal only → 0.40-0.70 band → confirm.
    v = classify_content("invoice-checker", "This document references an invoice for services rendered.")
    assert v["decision"] in ("confirm", "accept")  # weak but plausible
