"""UPLOAD-GUARD-1 (v1) — shared, server-authoritative upload validation.

`classify_upload()` runs the signed-off cascade and returns a JSON-serialisable
verdict dict that both web and mobile render identically:

    {
      "decision": "accept" | "confirm" | "block",
      "reason":   "ok" | "empty" | "too_large" | "wrong_type" | "unreadable"
                  | "wrong_tool" | "unrelated" | "low_confidence",
      "detected_type": "invoice-checker" | "statement-decoder"
                       | "care-plan-reviewer" | "unknown",
      "expected_type": <tool_key>,
      "confidence": 0.0-1.0,
      "message": "<friendly copy>",
      "wrong_tool": {"slug","name","route_web","route_mobile"} | None,
      "registry_version": "ug1-2026-06",
    }
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from .registry import (
    ACCEPT_THRESHOLD,
    ALLOWED_EXTENSIONS,
    ALLOWED_MIME_PREFIXES,
    CONFIRM_THRESHOLD,
    MAGIC_SIGNATURES,
    MAX_BYTES_PER_FILE,
    MIN_TEXT_CHARS,
    SIGNAL_TARGET,
    TOOL_PROFILES,
    UPLOAD_GUARD_REGISTRY_VERSION,
)


def _verdict(decision: str, reason: str, *, expected: str, message: str,
             detected: str = "unknown", confidence: float = 0.0,
             wrong_tool: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
    return {
        "decision": decision,
        "reason": reason,
        "detected_type": detected,
        "expected_type": expected,
        "confidence": round(float(confidence), 2),
        "message": message,
        "wrong_tool": wrong_tool,
        "registry_version": UPLOAD_GUARD_REGISTRY_VERSION,
    }


def _ext_ok(filename: str) -> bool:
    _, ext = os.path.splitext((filename or "").lower())
    return ext in ALLOWED_EXTENSIONS


def _magic_ok(raw: bytes) -> bool:
    """Integrity gate: the bytes must start with a known signature for one of
    the allowed formats (or be plausibly plain text)."""
    if not raw:
        return False
    head = raw[:16]
    if head.startswith(b"%PDF"):
        return True
    if head.startswith(b"PK\x03\x04"):  # docx (zip)
        return True
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return True
    if head.startswith(b"\xff\xd8\xff"):  # jpg
        return True
    if head.startswith(b"RIFF") and raw[8:12] == b"WEBP":
        return True
    if raw[4:8] == b"ftyp":  # heic/heif
        return True
    # Plain text: mostly printable/newline in the first chunk.
    sample = raw[:512]
    try:
        sample.decode("utf-8")
        printable = sum(1 for b in sample if 9 <= b <= 126 or b in (10, 13))
        return printable / max(len(sample), 1) > 0.85
    except UnicodeDecodeError:
        return False


def check_file_gates(filename: str, raw: bytes, content_type: str, expected: str) -> Optional[Dict[str, Any]]:
    """Hard gates on the raw bytes. Returns a *block* verdict or None if it passes."""
    if not raw:
        return _verdict("block", "empty", expected=expected,
                        message="This file looks empty. Please upload the document again.")
    if len(raw) > MAX_BYTES_PER_FILE:
        return _verdict("block", "too_large", expected=expected,
                        message="This file is over 20 MB. Please compress or split it and try again.")
    ct = (content_type or "").lower()
    ct_ok = any(ct.startswith(p) for p in ALLOWED_MIME_PREFIXES)
    if not (_ext_ok(filename) or ct_ok):
        return _verdict("block", "wrong_type", expected=expected,
                        message="This file type isn't supported. Upload a PDF, DOCX, JPG, PNG, HEIC, WebP or TXT.")
    if not _magic_ok(raw):
        return _verdict("block", "wrong_type", expected=expected,
                        message="This file appears to be corrupt or not the format its name suggests. Try re-exporting it.")
    return None


def _score(text_lower: str, tool_key: str) -> float:
    raw = 0.0
    for token, weight in TOOL_PROFILES[tool_key]["signals"]:
        if token in text_lower:
            raw += weight
    return min(1.0, raw / SIGNAL_TARGET)


def classify_content(expected: str, extracted_text: Optional[str]) -> Dict[str, Any]:
    """Content-tier decision. Assumes hard gates already passed."""
    profile = TOOL_PROFILES[expected]
    text = (extracted_text or "").strip()
    if len(text) < MIN_TEXT_CHARS:
        return _verdict("block", "unreadable", expected=expected,
                        message="We couldn't read any text from this file. Try a clearer scan or photo, or paste the text instead.")

    tl = text.lower()
    scores = {k: _score(tl, k) for k in TOOL_PROFILES}
    expected_conf = scores[expected]
    others = {k: v for k, v in scores.items() if k != expected}
    best_other_key = max(others, key=others.get) if others else "unknown"
    best_other_conf = others.get(best_other_key, 0.0)

    # A clearly-different document that belongs to another tool → wrong-tool block.
    if best_other_conf >= ACCEPT_THRESHOLD and best_other_conf > expected_conf:
        wt = TOOL_PROFILES[best_other_key]
        return _verdict(
            "block", "wrong_tool", expected=expected, detected=best_other_key, confidence=best_other_conf,
            message=f"This looks like {wt['label']}, not {profile['label']}. Open the {wt['name']} instead?",
            wrong_tool={"slug": wt["slug"], "name": wt["name"], "route_web": wt["route_web"], "route_mobile": wt["route_mobile"]},
        )

    if expected_conf >= ACCEPT_THRESHOLD:
        return _verdict("accept", "ok", expected=expected, detected=expected, confidence=expected_conf,
                        message="")

    if expected_conf >= CONFIRM_THRESHOLD:
        return _verdict("confirm", "low_confidence", expected=expected, detected=expected, confidence=expected_conf,
                        message=f"This doesn't clearly look like {profile['label']}. Continue anyway, or upload a different file?")

    # Nothing recognisable.
    return _verdict("block", "unrelated", expected=expected, detected="unknown", confidence=expected_conf,
                    message=f"This doesn't look like {profile['label']}. Please upload your document, or paste the text instead.")


def classify_upload(tool_key: str, filename: str, raw: bytes, content_type: str,
                    extracted_text: Optional[str]) -> Dict[str, Any]:
    """Full cascade: hard gates on bytes, then content classification."""
    if tool_key not in TOOL_PROFILES:
        # Unknown tool key → accept (no guard configured).
        return _verdict("accept", "ok", expected=tool_key, message="")
    gate = check_file_gates(filename, raw, content_type, tool_key)
    if gate is not None:
        return gate
    return classify_content(tool_key, extracted_text)
