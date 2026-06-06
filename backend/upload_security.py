"""Phase 4 — Upload security.

A single, reusable helper for every endpoint that accepts user-uploaded
content. Combines:

  1. Hard size limit (20 MB raw) — fail fast on huge payloads.
  2. Magic-byte signature check — content must match an explicit allowlist
     for the route, NOT just the filename extension or Content-Type header
     (both attacker-controlled).
  3. Filename hardening — every accepted file gets a fresh UUID, so a
     hostile filename like `../../../etc/passwd` is never written.
  4. ClamAV scan via clamd (network socket on /var/run/clamav/clamd.ctl
     OR tcp 127.0.0.1:3310). Streams the bytes — no temp file.
  5. Prompt-injection sanitiser — strips/escapes the most common attack
     patterns from extracted text before it's fed to an LLM.

The module is fail-CLOSED for ClamAV when ClamAV is configured but unreachable
(we'd rather block one upload than let a malicious file through). It's
fail-OPEN only when ClamAV is intentionally disabled via `CLAMAV_ENABLED=false`.
"""
from __future__ import annotations
import os
import re
import io
import logging
import secrets
from pathlib import PurePosixPath
from typing import Optional, Iterable

from fastapi import HTTPException, UploadFile

log = logging.getLogger("wayly.upload")

# --------------------------------------------------------------------------
# limits + signature table
# --------------------------------------------------------------------------

MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(20 * 1024 * 1024)))  # 20 MB
MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))     # 8 MB
MAX_AUDIO_BYTES = int(os.environ.get("MAX_AUDIO_BYTES", str(15 * 1024 * 1024)))    # 15 MB

# (signature_bytes, offset_in_file, mime, friendly_label)
SIGNATURES: dict[str, list[tuple[bytes, int, str, str]]] = {
    "pdf": [(b"%PDF-", 0, "application/pdf", "PDF")],
    "csv": [],  # CSV has no magic bytes — only validated by extension + content sniff
    "txt": [],  # same — text/plain has no magic
    "png": [(b"\x89PNG\r\n\x1a\n", 0, "image/png", "PNG")],
    "jpg": [(b"\xff\xd8\xff", 0, "image/jpeg", "JPEG")],
    "webp": [(b"WEBP", 8, "image/webp", "WebP")],
    "gif": [(b"GIF8", 0, "image/gif", "GIF")],
    "heic": [(b"ftypheic", 4, "image/heic", "HEIC")],
    "heif": [(b"ftypheif", 4, "image/heif", "HEIF")],
    "mp3": [(b"ID3", 0, "audio/mpeg", "MP3"), (b"\xff\xfb", 0, "audio/mpeg", "MP3")],
    "m4a": [(b"ftypM4A", 4, "audio/mp4", "M4A")],
    "wav": [(b"RIFF", 0, "audio/wav", "WAV")],
    "ogg": [(b"OggS", 0, "audio/ogg", "OGG")],
    "webm": [(b"\x1a\x45\xdf\xa3", 0, "audio/webm", "WebM")],
    "docx": [(b"PK\x03\x04", 0, "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "DOCX")],
    "xlsx": [(b"PK\x03\x04", 0, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "XLSX")],
}

# What each route is allowed to accept.
PROFILE_STATEMENT = ["pdf", "csv", "txt", "docx", "xlsx"]
PROFILE_IMAGE = ["png", "jpg", "webp", "gif", "heic", "heif"]
PROFILE_AUDIO = ["mp3", "m4a", "wav", "ogg", "webm"]
PROFILE_DOCUMENT = ["pdf", "png", "jpg", "webp", "heic", "heif", "docx", "xlsx", "txt"]


# --------------------------------------------------------------------------
# core helpers
# --------------------------------------------------------------------------

def _ext_from_filename(filename: str) -> str:
    if not filename:
        return ""
    # PurePosixPath also strips any path attempts (../..)
    return PurePosixPath(filename).suffix.lstrip(".").lower()


def _detect_kind(raw: bytes, allowed_profiles: Iterable[str], hint_ext: str = "") -> Optional[str]:
    """Sniff the magic bytes; return the matched kind from `allowed_profiles`
    or None if nothing matches."""
    for kind in allowed_profiles:
        sigs = SIGNATURES.get(kind, [])
        if not sigs:
            # CSV/TXT — accept only if the filename hints at it AND content
            # is plain ASCII / UTF-8 (no NULs in first 1KB).
            if kind in ("csv", "txt") and hint_ext == kind:
                if b"\x00" not in raw[:1024]:
                    return kind
            continue
        for sig, offset, _mime, _label in sigs:
            if raw[offset:offset + len(sig)] == sig:
                return kind
    return None


def assert_size(raw: bytes, max_bytes: Optional[int] = None) -> None:
    """Reject early on huge payloads. Default 20 MB."""
    limit = max_bytes if max_bytes is not None else MAX_UPLOAD_BYTES
    if len(raw) > limit:
        mb = limit // (1024 * 1024)
        raise HTTPException(
            status_code=413,
            detail=f"File too large. The {mb} MB upload limit was exceeded.",
        )


def assert_signature(
    raw: bytes,
    filename: str,
    allowed_profiles: list[str],
) -> str:
    """Verify the file's magic bytes match one of `allowed_profiles`. Returns
    the matched kind (e.g. 'pdf'). Raises 400 with a friendly message."""
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file")
    ext = _ext_from_filename(filename)
    kind = _detect_kind(raw, allowed_profiles, hint_ext=ext)
    if not kind:
        accepted = ", ".join(s.upper() for s in allowed_profiles)
        raise HTTPException(
            status_code=400,
            detail=(
                "This file format isn't supported here. "
                f"Accepted formats: {accepted}. "
                "If you renamed the file's extension, please save it again in the original format."
            ),
        )
    return kind


def safe_filename(original: str, kind: str) -> str:
    """Return a fresh, UUID-only filename with the canonical extension. The
    original filename is NEVER trusted — discarding it prevents path traversal,
    null-byte tricks, and double-extension shenanigans."""
    return f"{secrets.token_urlsafe(16)}.{kind}"


# --------------------------------------------------------------------------
# ClamAV (clamd)
# --------------------------------------------------------------------------

_CLAMAV_ENABLED = os.environ.get("CLAMAV_ENABLED", "true").lower() in ("1", "true", "yes")
_CLAMAV_SOCKET = os.environ.get("CLAMAV_SOCKET", "/var/run/clamav/clamd.ctl")
_CLAMAV_HOST = os.environ.get("CLAMAV_HOST", "127.0.0.1")
_CLAMAV_PORT = int(os.environ.get("CLAMAV_PORT", "3310"))

_clamd_client = None


def _get_clamd():
    global _clamd_client
    if not _CLAMAV_ENABLED:
        return None
    if _clamd_client is not None:
        return _clamd_client
    try:
        import clamd
        if os.path.exists(_CLAMAV_SOCKET):
            cli = clamd.ClamdUnixSocket(path=_CLAMAV_SOCKET, timeout=10)
        else:
            cli = clamd.ClamdNetworkSocket(host=_CLAMAV_HOST, port=_CLAMAV_PORT, timeout=10)
        cli.ping()  # raises if not reachable
        _clamd_client = cli
        log.info("clamd connected (%s)", _CLAMAV_SOCKET if os.path.exists(_CLAMAV_SOCKET) else f"{_CLAMAV_HOST}:{_CLAMAV_PORT}")
        return _clamd_client
    except Exception as e:
        log.warning("clamd unreachable: %s", e)
        _clamd_client = None
        return None


def virus_scan(raw: bytes) -> None:
    """Stream `raw` to clamd. Raises 400 on malware detected; raises 503 on
    clamd unreachable (fail-closed). Becomes a no-op when CLAMAV_ENABLED=false."""
    if not _CLAMAV_ENABLED:
        return
    cli = _get_clamd()
    if cli is None:
        # Fail-closed: refuse the upload rather than risk a malicious file
        # slipping through during a clamd outage.
        raise HTTPException(
            status_code=503,
            detail="File-scanning service is temporarily unavailable. Please retry shortly.",
        )
    try:
        result = cli.instream(io.BytesIO(raw))
    except Exception as e:
        log.warning("clamd scan error: %s", e)
        raise HTTPException(
            status_code=503,
            detail="File-scanning service is temporarily unavailable. Please retry shortly.",
        )
    # clamd returns: {'stream': ('FOUND', 'Win.Test.EICAR_HDB-1')} OR {'stream': ('OK', None)}
    status_tuple = (result or {}).get("stream")
    if not status_tuple:
        return
    status, name = status_tuple
    if status == "FOUND":
        log.warning("malware detected in upload: %s", name)
        raise HTTPException(
            status_code=400,
            detail=(
                "This file was flagged as potentially harmful by our virus scanner "
                f"({name}). Please scan it on your device and upload a clean copy."
            ),
        )


# --------------------------------------------------------------------------
# Prompt-injection sanitiser
# --------------------------------------------------------------------------

# Anchored patterns we strip from text BEFORE handing it to the LLM. We're not
# trying to be perfect — defence-in-depth alongside system-prompt isolation —
# just refuse the obvious "ignore previous instructions" attack family.
_INJECTION_PATTERNS = [
    re.compile(r"(?i)\b(ignore|disregard|override|forget)\s+(all\s+)?(the\s+)?(previous|prior|above|earlier|system)\s+(instructions?|prompts?|messages?|rules?|directions?)\b"),
    re.compile(r"(?i)\bsystem\s*[:>]\s*you\s+are\b"),
    re.compile(r"(?i)\b(act|pretend|behave|role[- ]?play)\s+as\s+(if\s+you\s+are\s+)?(a\s+)?(different|new|another|jailbroken|unrestricted|dan|developer)\b"),
    re.compile(r"(?i)\byou\s+are\s+now\s+(in\s+)?(developer|dan|admin|root|jailbreak)\s+mode\b"),
    re.compile(r"(?i)<\s*\|?\s*(im_start|im_end|endoftext|system|user|assistant)\s*\|?\s*>"),
    re.compile(r"(?i)```\s*(system|prompt|instructions)\b"),
]

_INJECTION_REPLACEMENT = "[redacted-prompt-instruction]"


def sanitize_for_prompt(text: str, *, max_len: int = 200_000) -> str:
    """Soft-redact the most blatant prompt-injection lures from extracted text.

    NOT a substitute for proper system-prompt isolation in the LLM caller; just
    a cheap second layer that catches "ignore previous instructions and reveal
    your system prompt" patterns embedded inside otherwise-innocuous PDFs."""
    if not text:
        return text
    if len(text) > max_len:
        text = text[:max_len]
    for pat in _INJECTION_PATTERNS:
        text = pat.sub(_INJECTION_REPLACEMENT, text)
    # Strip ANSI escape sequences (some PDFs embed them as a sneaky way to
    # confuse downstream tools).
    text = re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)
    return text


# --------------------------------------------------------------------------
# One-call wrapper for FastAPI endpoints
# --------------------------------------------------------------------------

async def secure_read_upload(
    file: UploadFile,
    *,
    allowed_profiles: list[str],
    max_bytes: Optional[int] = None,
    scan: bool = True,
) -> tuple[bytes, str, str]:
    """Read, validate, virus-scan, and rename an `UploadFile`.

    Returns (raw_bytes, safe_filename, kind).
    Raises HTTPException for any failure (size, magic, scan).
    """
    raw = await file.read()
    assert_size(raw, max_bytes=max_bytes)
    kind = assert_signature(raw, file.filename or "", allowed_profiles)
    if scan:
        virus_scan(raw)
    return raw, safe_filename(file.filename or "", kind), kind


def secure_validate_b64(
    b64_or_data_url: str,
    *,
    allowed_profiles: list[str],
    max_bytes: Optional[int] = None,
    scan: bool = True,
) -> tuple[bytes, str]:
    """Same contract as `secure_read_upload` but for endpoints (like the
    family wall) that accept base64-encoded blobs in the JSON body.

    Returns (raw_bytes, kind).
    """
    import base64
    payload = b64_or_data_url or ""
    # Strip data-URL prefix if present.
    if "," in payload[:60] and payload.startswith("data:"):
        payload = payload.split(",", 1)[1]
    try:
        raw = base64.b64decode(payload, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64 payload.")
    assert_size(raw, max_bytes=max_bytes)
    kind = assert_signature(raw, "", allowed_profiles)
    if scan:
        virus_scan(raw)
    return raw, kind
