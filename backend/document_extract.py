"""
Document extraction — single entry point that routes any supported upload
(PDF text/scanned, DOCX, TXT, JPG/PNG/HEIC/WEBP) into plain text, falling
back to Claude vision for image and scanned-PDF inputs.

Returns: (text, input_method, document_pages, parsing_warnings)

Supported extensions:
  Text path: .pdf (selectable), .docx, .txt
  Vision path: .pdf (scanned), .jpg, .jpeg, .png, .heic, .heif, .webp
"""
from __future__ import annotations
import base64
import io
import logging
import os
import re
from typing import Tuple, List, Optional

logger = logging.getLogger(__name__)

# Lazy imports to avoid forcing heavy deps at module-load time.
_HEIF_REGISTERED = False


ALLOWED_EXTENSIONS = {
    ".pdf", ".docx", ".doc", ".txt", ".csv",
    ".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp",
}

EXT_TO_MIME = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".doc": "application/msword",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".heic": "image/heic",
    ".heif": "image/heif",
    ".webp": "image/webp",
}

# Format-specific size limits (bytes)
MAX_BYTES = {
    ".pdf": 20 * 1024 * 1024,
    ".docx": 10 * 1024 * 1024,
    ".doc": 10 * 1024 * 1024,
    ".txt": 5 * 1024 * 1024,
    ".csv": 10 * 1024 * 1024,
    ".jpg": 10 * 1024 * 1024,
    ".jpeg": 10 * 1024 * 1024,
    ".png": 10 * 1024 * 1024,
    ".heic": 10 * 1024 * 1024,
    ".heif": 10 * 1024 * 1024,
    ".webp": 10 * 1024 * 1024,
}


# Magic-byte signatures for the formats we accept.
def _verify_magic_bytes(ext: str, raw: bytes) -> bool:
    if not raw:
        return False
    head = raw[:16]
    if ext == ".pdf":
        return head[:4] == b"%PDF"
    if ext in (".jpg", ".jpeg"):
        return head[:2] == b"\xff\xd8"
    if ext == ".png":
        return head[:8] == b"\x89PNG\r\n\x1a\n"
    if ext == ".webp":
        return head[:4] == b"RIFF" and head[8:12] == b"WEBP"
    if ext in (".heic", ".heif"):
        # ISO base media file format with ftypheic / ftypmif1 / ftypheix at byte 4
        return head[4:8] == b"ftyp"
    if ext == ".docx":
        # DOCX is a ZIP — first 2 bytes "PK"
        return head[:2] == b"PK"
    if ext == ".doc":
        return head[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
    # Text formats — accept anything decodable
    if ext in (".txt", ".csv"):
        return True
    return True


def get_extension(filename: str) -> str:
    name = (filename or "").lower()
    m = re.search(r"\.[a-z0-9]{2,5}$", name)
    return m.group(0) if m else ""


class UnsupportedFormatError(Exception):
    pass


class FileTooLargeError(Exception):
    def __init__(self, ext: str, limit_bytes: int):
        self.ext = ext
        self.limit_bytes = limit_bytes
        super().__init__(f"{ext} exceeds limit of {limit_bytes} bytes")


class CorruptFileError(Exception):
    pass


class PasswordProtectedError(Exception):
    pass


def validate_upload(filename: str, raw: bytes) -> str:
    """Returns the validated extension. Raises typed exceptions on failure."""
    ext = get_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise UnsupportedFormatError(ext or "(no extension)")
    limit = MAX_BYTES.get(ext, 10 * 1024 * 1024)
    if len(raw) > limit:
        raise FileTooLargeError(ext, limit)
    if not _verify_magic_bytes(ext, raw):
        raise CorruptFileError(f"Magic-byte check failed for {ext}")
    return ext


# ───────── Text extraction paths ─────────

def _extract_pdf_selectable_text(raw: bytes) -> Tuple[str, int]:
    """Returns (text, page_count). Raises PasswordProtectedError on locked PDFs."""
    try:
        import pdfplumber
    except ImportError:
        # Fall back to pypdf only.
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        if getattr(reader, "is_encrypted", False):
            raise PasswordProtectedError("PDF is password-protected")
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return text, len(reader.pages)
    try:
        with pdfplumber.open(io.BytesIO(raw)) as pdf:
            pages = pdf.pages
            page_count = len(pages)
            chunks = []
            for p in pages:
                try:
                    t = p.extract_text() or ""
                except Exception:
                    t = ""
                if t:
                    chunks.append(t)
            return "\n".join(chunks), page_count
    except Exception as e:
        msg = str(e).lower()
        if "password" in msg or "encrypted" in msg:
            raise PasswordProtectedError("PDF is password-protected") from e
        # Fall back to pypdf
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        if getattr(reader, "is_encrypted", False):
            raise PasswordProtectedError("PDF is password-protected")
        text = "\n".join((p.extract_text() or "") for p in reader.pages)
        return text, len(reader.pages)


def _extract_docx_text(raw: bytes) -> str:
    """Returns text. Tables are flattened tab-separated to preserve column structure."""
    try:
        import docx as _docx
    except ImportError as e:
        raise CorruptFileError(f"python-docx missing: {e}")
    try:
        doc = _docx.Document(io.BytesIO(raw))
    except Exception as e:
        raise CorruptFileError(f"DOCX parse failed: {e}") from e
    parts: list[str] = []
    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text)
    for table in doc.tables:
        for row in table.rows:
            row_text = "\t".join(cell.text.strip() for cell in row.cells)
            if row_text.strip():
                parts.append(row_text)
    return "\n".join(parts)


def _extract_txt(raw: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise CorruptFileError("Could not decode text file with common encodings")


# ───────── Vision path ─────────

def _ensure_heif_registered():
    global _HEIF_REGISTERED
    if _HEIF_REGISTERED:
        return
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
        _HEIF_REGISTERED = True
    except Exception as e:
        logger.warning("HEIF support unavailable: %s", e)


def _image_to_base64_jpeg(raw: bytes, ext: str) -> str:
    """Normalises any supported image bytes into base64-encoded JPEG."""
    _ensure_heif_registered()
    from PIL import Image
    try:
        img = Image.open(io.BytesIO(raw))
    except Exception as e:
        raise CorruptFileError(f"Could not open {ext} image: {e}") from e
    # Normalise mode for JPEG output
    if img.mode in ("RGBA", "LA", "P"):
        img = img.convert("RGB")
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def _pdf_to_image_pages_b64(raw: bytes, max_pages: int = 8) -> List[str]:
    """Converts a scanned PDF into a list of base64 JPEGs (one per page).
    Limits to max_pages to keep cost predictable."""
    try:
        from pdf2image import convert_from_bytes
    except ImportError:
        # pdf2image isn't available in this env — bail gracefully.
        raise CorruptFileError(
            "Scanned PDF processing isn't available in this environment. "
            "Try uploading the statement as a JPG photo or pasting the text."
        )
    try:
        images = convert_from_bytes(raw, dpi=200, fmt="jpeg", thread_count=2)
    except Exception as e:
        raise CorruptFileError(f"PDF to image conversion failed: {e}") from e
    out: list[str] = []
    for i, img in enumerate(images[:max_pages]):
        if img.mode in ("RGBA", "LA", "P"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=88)
        out.append(base64.b64encode(buf.getvalue()).decode("ascii"))
    return out


VISION_EXTRACTION_PROMPT = """You are reading a photographed or scanned Australian Support at Home monthly statement. Extract every piece of information visible in this image as plain text — preserving the original column structure of any tables.

Pay particular attention to:

TABLES: Statement line items are usually in a table with columns for date, service description, service code, hours, rate per hour, gross amount, participant contribution, and government paid amount. The columns may not be clearly separated — use context to determine which number belongs to which column. Output each table row on its own line with values tab-separated.

DOLLAR AMOUNTS: Read every dollar figure precisely. $1,047.00 and $1,047.50 are different. Never round or approximate dollar amounts. If a figure is genuinely unclear, transcribe it as "[unclear: best-guess]".

DATES: Read dates exactly as written. Do not infer missing dates.

PROVIDER NAME AND ABN: Usually in the header section. Extract exactly as printed including any formatting.

STREAM LABELS: Look for the words Clinical, Independence, and Everyday Living as section headers.

HANDWRITTEN ANNOTATIONS: If any text appears handwritten rather than printed, prefix the line with "[HANDWRITTEN]:".

If a portion of the document is genuinely unreadable, transcribe what you can and add a note like "[unclear region]" inline.

Return ONLY the extracted text content — do NOT add commentary, headings of your own, or markdown. Just the statement as you would re-type it from the image, line by line.
"""


async def _vision_extract_image(image_b64: str, label: str = "image") -> str:
    """Sends an image to Claude vision and returns extracted text."""
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise CorruptFileError("Vision processing unavailable — EMERGENT_LLM_KEY not configured")
    chat = LlmChat(
        api_key=api_key,
        session_id=f"vision-{label}",
        system_message=VISION_EXTRACTION_PROMPT,
    ).with_model("anthropic", "claude-sonnet-4-5-20250929").with_params(max_tokens=4000)
    image_content = ImageContent(image_base64=image_b64)
    msg = UserMessage(text="Read this Support at Home statement.", file_contents=[image_content])
    try:
        result = await chat.send_message(msg)
    except Exception as e:
        raise CorruptFileError(f"Vision extraction failed: {e}") from e
    return str(result or "")


# ───────── Public API ─────────

async def extract_document(filename: str, raw: bytes) -> Tuple[str, str, int, List[str]]:
    """Routes a validated upload to the right extraction path.

    Returns (text, input_method, page_count, parsing_warnings).

    input_method values:
      text_paste, text_file, word_document, pdf_text, pdf_scanned,
      image_vision, email_attachment
    """
    ext = validate_upload(filename, raw)
    warnings: list[str] = []

    if ext == ".txt":
        return _extract_txt(raw), "text_file", 1, warnings

    if ext == ".csv":
        return _extract_txt(raw), "text_file", 1, warnings

    if ext == ".docx":
        return _extract_docx_text(raw), "word_document", 1, warnings

    if ext == ".doc":
        # Legacy DOC — Phase 2 will add LibreOffice. For now route to the vision
        # path by complaining loudly so the user can re-export as DOCX or PDF.
        raise UnsupportedFormatError(
            "Legacy .doc files aren't supported yet — open the file in Word and "
            "save as .docx or PDF, then upload again."
        )

    if ext == ".pdf":
        text, page_count = _extract_pdf_selectable_text(raw)
        # Decide if PDF has enough selectable text or needs vision.
        cleaned = (text or "").strip()
        keywords = ("Support at Home", "participant", "Classification", "stream", "$", "quarterly")
        has_signal = any(k in cleaned for k in keywords)
        if len(cleaned) > 500 and has_signal:
            return cleaned, "pdf_text", page_count, warnings
        # Fall through to scanned-PDF vision path.
        try:
            page_images = _pdf_to_image_pages_b64(raw, max_pages=8)
        except CorruptFileError:
            # No vision possible — return whatever text we got. Better than 0.
            if cleaned:
                warnings.append("PDF text was sparse and scanned-PDF processing is unavailable in this environment. Result may be incomplete.")
                return cleaned, "pdf_text", page_count, warnings
            raise
        if not page_images:
            raise CorruptFileError("PDF has no readable pages")
        # Send each page through vision and concatenate.
        chunks = []
        for i, b64 in enumerate(page_images):
            try:
                page_text = await _vision_extract_image(b64, label=f"pdf-page-{i+1}")
            except Exception as e:
                warnings.append(f"Vision read failed on page {i+1}: {e}")
                page_text = ""
            chunks.append(f"\n--- Page {i+1} ---\n{page_text}")
        return "\n".join(chunks), "pdf_scanned", page_count, warnings

    if ext in (".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"):
        try:
            b64 = _image_to_base64_jpeg(raw, ext)
        except CorruptFileError:
            raise
        text = await _vision_extract_image(b64, label=f"single-{ext.lstrip('.')}")
        if not text or len(text.strip()) < 50:
            warnings.append("Image read returned very little text. The photo may be too dark, blurry, or at an awkward angle.")
        return text, "image_vision", 1, warnings

    raise UnsupportedFormatError(ext)
