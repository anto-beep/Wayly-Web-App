"""UPLOAD-GUARD-1 registry (v1) — single source of truth for accepted
document profiles, the global file allow-list, the per-file size cap, and
the per-tool content signals used to classify an upload.

Signed-off decisions (UPLOAD-GUARD-1-PHASE0-AUDIT.md):
  * three-tier outcomes (accept / confirm / block)
  * registry lives here, versioned by UPLOAD_GUARD_REGISTRY_VERSION
  * thresholds: accept >= 0.70, confirm 0.40-0.70, block < 0.40 or a
    stronger other-tool match (>= 0.70) -> wrong-tool redirect
  * one shared classify_upload() helper called inside each tool endpoint
  * single 20 MB per-file cap
"""
from __future__ import annotations

UPLOAD_GUARD_REGISTRY_VERSION = "ug1-2026-06"

# Single per-file cap (reconciles the old 20 MB / 25 MB split).
MAX_BYTES_PER_FILE = 20 * 1024 * 1024

# Global allow-list — extensions + MIME prefixes.
ALLOWED_EXTENSIONS = {".pdf", ".docx", ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".txt"}
ALLOWED_MIME_PREFIXES = (
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/",
    "text/plain",
)

# Magic-byte signatures used for the integrity gate.
MAGIC_SIGNATURES = {
    "pdf": [b"%PDF"],
    "docx": [b"PK\x03\x04"],          # zip container (docx)
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "webp": [b"RIFF"],               # + WEBP at offset 8 (checked in guard)
    "heic": [b"ftyp"],               # appears at offset 4
}

# Thresholds (signed-off).
ACCEPT_THRESHOLD = 0.70
CONFIRM_THRESHOLD = 0.40
# Content weighted-sum normaliser: a doc that hits ~3.0 of signal weight
# reads as full (1.0) confidence.
SIGNAL_TARGET = 3.0
# Minimum extracted characters before we can classify content at all.
MIN_TEXT_CHARS = 40

# Per-tool document profiles. `signals` are (substring, weight) pairs matched
# case-insensitively against the extracted text.
TOOL_PROFILES = {
    "invoice-checker": {
        "label": "an invoice",
        "name": "Invoice Checker",
        "slug": "invoice-checker",
        "route_web": "/ai-tools/invoice-checker",
        "route_mobile": "/tool/invoice-checker",
        "signals": [
            ("tax invoice", 3.0), ("invoice number", 2.0), ("invoice #", 2.0),
            ("invoice", 1.5), ("amount due", 1.5), ("bill to", 1.5),
            ("abn", 1.0), ("gst", 1.0), ("remittance", 1.0), ("payment due", 1.0),
        ],
    },
    "statement-decoder": {
        "label": "a statement",
        "name": "Statement Decoder",
        "slug": "statement-decoder",
        "route_web": "/ai-tools/statement-decoder",
        "route_mobile": "/tool/statement-decoder",
        "signals": [
            ("monthly statement", 3.0), ("home care package", 2.5), ("support at home", 2.5),
            ("closing balance", 2.0), ("opening balance", 2.0), ("care management", 1.5),
            ("package budget", 1.5), ("statement", 1.5), ("everyday living", 1.0),
        ],
    },
    "care-plan-reviewer": {
        "label": "a care plan",
        "name": "Care Plan Reviewer",
        "slug": "care-plan-reviewer",
        "route_web": "/ai-tools/care-plan-reviewer",
        "route_mobile": "/tool/care-plan-reviewer",
        "signals": [
            ("support plan", 3.0), ("care plan", 3.0), ("service agreement", 2.0),
            ("goals", 1.5), ("supports", 1.5), ("review date", 1.5),
            ("my aged care", 1.0), ("provider", 0.5),
        ],
    },
}

# Friendly detected-type label used in the wrong-tool message.
DETECTED_LABEL = {
    "invoice-checker": "an invoice",
    "statement-decoder": "a statement",
    "care-plan-reviewer": "a care plan",
    "unknown": "an unrecognised document",
}
