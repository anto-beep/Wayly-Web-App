# UPLOAD-GUARD-1 — Phase 0 Audit (report only, awaiting sign-off)

_Prepared for founder sign-off before any Phase 1 implementation. No guard code has been written. This audit inventories the actual `/app` codebase as it stands today._

Status: **SIGNED OFF (recommended answers) + IMPLEMENTED (v1)** — built across backend + web + mobile, verified (11/11 unit tests + web/mobile e2e). Decisions applied: (1) three-tier; (2) registry at `backend/lib/upload_guard/registry.py` v`ug1-2026-06`; (3) thresholds Accept≥0.70 / Confirm 0.40-0.70 / Block<0.40 or wrong-tool≥0.70; (4) shared `classify_upload()` inside each tool endpoint; (5) single 20 MB cap.

---

## Q1 — Every upload entry point (web + mobile + backend)

| Tool | Web entry | Mobile entry | Backend endpoint(s) |
|---|---|---|---|
| **Invoice Checker** | `pages/tools/InvoiceCheckerTool.jsx` (drag-drop / picker) | `src/components/tools/InvoiceChecker.tsx` (`expo-document-picker`) | `POST /api/invoices/upload` (auth, `UploadFile`) · public trial check path |
| **Care Plan / Support Plan Reviewer** | `pages/tools/CarePlanReviewer.jsx` (multi-file) | `src/components/tools/CarePlanReviewer.tsx` (multi-file, added this sweep) | `POST /api/public/care-plans/review-files` (trial) · `POST /api/care-plans/upload-files` (auth save) — both `List[UploadFile]` |
| **Statement Decoder** | `pages/StatementUpload.jsx` + homepage decoder (paste + file) | `app/tool/[slug].tsx` decoder — **text-paste only today** (no file picker) | Decode is text-based (SD3 `decode-v2`); web extracts text before decode. **No multipart `/statements/upload` guard point exists.** |
| _(Support attachments)_ | `routes/support.py` `UploadFile` endpoints | — | `POST` support upload | **Out of scope** — not an AI document tool; noted for completeness. |

**Note:** the mobile Statement Decoder does not currently accept files, so the guard there only becomes relevant if/when a file path is added (see PARITY-1 decoder scope).

## Q2 — Current validation at each entry point

- **Invoice Checker** (`routes/invoices.py`): reads bytes, rejects **empty**, enforces **size cap `_MAX_UPLOAD_BYTES = 25 MB`** (HTTP 413). Then runs a **content classifier** producing `document_shape ∈ {invoice, combined, combined_unsplit, remittance, receipt, statement}` + `confidence` + `classifier_signals`; a `statement` result returns a **redirect hint** to the Statement Decoder (partial wrong-tool behaviour already live). **No MIME/extension allow-list and no magic-byte integrity check** — it relies on the downstream extractor.
- **Care Plan Reviewer** (`services/care_plan_ingestion.py::validate_submission`): rejects empty, enforces **≤ `MAX_FILES_PER_SUBMISSION` (5)**, **≤ `MAX_BYTES_PER_FILE` (20 MB)** each, and a **MIME-prefix allow-list** (`ALLOWED_MIME_PREFIXES`: pdf / docx / image / text). **No magic-byte integrity check** and **no doc-type classification** — any readable document is accepted as a "care plan".
- **Statement Decoder**: text-based; no document-type guard.

**Gap:** validation is inconsistent (25 MB vs 20 MB caps; allow-list on care-plan only; classifier on invoice only) and there is **no single authoritative registry / cascade** as UPLOAD-GUARD-1 requires.

## Q3 — Content-inspection capability that already exists

- **Yes (invoice side):** `lib/inv1` document-shape classifier + `classifier_signals` — reusable signal extraction over invoice text.
- **Partial (care-plan side):** ingestion extracts text + `per_file_meta` (input_method, page_count, text_length) but does **not** classify the document type.
- **No (statement side):** no classifier.
- **Conclusion:** we can extract text server-side for all tools (pdf/docx/image-OCR/heic already wired in `care_plan_ingestion` + invoice extractor), so a shared **keyword/pattern content classifier is feasible** without new heavy dependencies. What's missing is the **shared registry + tiered decision + magic-byte integrity gate**.

## Q4 — Expected document profile + signals per tool (proposed registry seed)

| Tool key | Expected doc | Positive signals (seed) |
|---|---|---|
| `statement-decoder` | Support at Home / HCP **monthly statement** | "statement", "monthly statement", "home care", "package", "budget", "care management", stream names (Everyday Living / Clinical / Independence), "opening balance", "closing balance" |
| `invoice-checker` | **Tax invoice** | "invoice", "tax invoice", "ABN", "invoice number", "amount due", "bill to", "GST", "remittance" |
| `care-plan-reviewer` | **Care / support plan** | "care plan", "support plan", "goals", "supports", "review date", "service agreement", "provider" |

Each profile also carries the **file-type allow-list** (PDF/DOCX/JPG/PNG/HEIC/WebP/TXT) and **per-file size cap** so the cascade is registry-driven, not hard-coded per route.

## Q5 — Confusable / adversarial document types

- **statement ↔ invoice** (already partially handled via the invoice→statement redirect — must be generalised both directions).
- **care plan ↔ assessment report / MAC letter / service agreement.**
- **Generic PDFs**: bank statements, Centrelink letters, brochures.
- **Photos** of an unrelated document, or a **blank/scanned-illegible** page (low extracted text).
- **Corrupt / wrong-extension** files (e.g. `.pdf` that isn't a PDF) — needs a **magic-byte** check (`%PDF`, `PK\x03\x04` for DOCX, image signatures).

## Q6 — Data handling / PII / persistence

- **Invoice auth upload** persists **raw bytes** (`file_b64`) + reconciliation; **public trial** paths and **care-plan trial review** do **not** persist.
- Documents contain **PII** (names, ABNs, financials, health context).
- **Requirement:** the guard must run **server-side before persistence**; a **Block** decision must **discard** the file (never store), and classification signals logged must be non-PII (counts/keywords, not raw text).

---

## Decisions requested for sign-off (Phase 1 will not start until these are set)

1. **Outcome tiering** — recommend **three-tier: Accept / Confirm / Block** (Confirm lets a user proceed on an ambiguous-but-plausible doc; Block stops hard-gate failures and strong wrong-tool matches). Alternative: two-tier (Accept / Block). → _Decision:_ ____
2. **Registry + version** — propose `backend/lib/upload_guard/registry.py` with `UPLOAD_GUARD_REGISTRY_VERSION`, seeded from Q4. → _Approve seed + location:_ ____
3. **Confidence thresholds** — propose: **Accept** ≥ 0.70 match & no stronger other-tool match; **Confirm** 0.40–0.70 or low extracted-text; **Block** < 0.40, or a **stronger other-tool** match (→ wrong-tool redirect), or any hard-gate failure (type/size/integrity/blank). → _Approve thresholds:_ ____
4. **Delivery shape** — recommend a shared **`classify_upload()`** helper invoked **inside each tool's existing upload endpoint** (one authoritative server decision returned in the response), rather than a separate `/uploads/classify` round-trip. Web + mobile render the same server verdict + copy. → _Approve:_ ____
5. **Cap reconciliation** — standardise the per-file cap (care-plan 20 MB vs invoice 25 MB) to a single registry value. → _Decision (20 MB / 25 MB):_ ____

_On sign-off I will produce the Phase-1 implementation across the shared backend + web + mobile, with parity verified under PARITY-1._
