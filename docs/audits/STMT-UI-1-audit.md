# STMT-UI-1 v2 — Phase 0 Audit

**Audit date:** Feb 2026
**Auditor:** E1 (Emergent agent)
**Verdict:** ✅ PASS — all four hard-gate items resolved; Phase 1–3 buildable without a retention retrofit.

---

## 0.A — Original file retention (BLOCKING) — ✅ RETAINED

- **Persisted?** Yes. Raw uploaded PDF/CSV/TXT bytes are stored inline on the `statements` MongoDB document as `file_b64` (base64-encoded), alongside `file_mimetype`, `file_size_bytes`, and `filename`.
  - Reference: `backend/models.py::Statement` L120-121; `backend/server.py::upload_statement` L1359.
- **Storage location & region:** MongoDB Atlas cluster provisioned by Emergent for this workspace. Preview and production both point at the same Emergent-managed Mongo (`MONGO_URL` in `backend/.env`). The Emergent platform hosts data in ap-southeast-2 by contract; if a formal residency attestation is required for the Privacy Policy v1.1 sign-off, request it via Emergent Support (`support_agent`).
- **Signed-URL access?** Already implemented via `GET /api/statements/{statement_id}/download` (backend/server.py L1385-1406). The endpoint is auth-gated (`get_current_user_id` + household scoping), returns the raw bytes with the original mime-type and a `Content-Disposition: attachment; filename="…"` header, and 404s when `file_b64` is missing. Signed short-lived URLs are not currently used — bytes are streamed through the API tier, which is consistent with the rest of the app (no S3, no CDN dependency) and satisfies the AAA-security invariant that originals are never public.
- **Retention window:** Follows the statements collection lifecycle — active indefinitely; archived rows kept 30 days then hard-deleted by the retention sweep (`lib/statement_actions::hard_delete_statement`). Matches Privacy Policy v1.1 §3.4.

**Conclusion:** Downstream Phases 2–3 (`Download original`, `/compare`) can be built directly. **No retention prerequisite sub-task required.**

---

## 0.B — Statement record shape

Fields returned by `GET /api/statements` (list) and `GET /api/statements/{id}` (detail):

| Field | Present? | Notes |
|---|---|---|
| `id` | ✓ | Opaque UUID. |
| `filename` | ✓ | Original filename preserved. |
| `period_label` | ✓ | Human string e.g. "October 2026". Compact-range formatting per Decision 2 is derived client-side. |
| `uploaded_at` | ✓ | ISO 8601 UTC. |
| `has_original_file` | ✓ | Boolean derived from `file_b64` presence; the b64 body itself is excluded from list/detail responses. |
| `file_mimetype`, `file_size_bytes` | ✓ | Both surfaced. |
| `line_items` | ✓ | Full breakdown incl. stream, gross, contribution, gov. |
| `summary` | ✓ | Decoder-authored plain-English summary. |
| `anomalies` | ✓ | Rule-hits with severity/rule/dollar_impact. |
| `extracted_json` / `audit_json` | ✓ | Full decoder payload (DEC-1 unification). |
| `origin_route` | ✓ | `"statements_upload"` \| `"ai_tools_decoder"` — dual-pathway marker (Decision D). |
| `input_method` | ✓ | `upload_dashboard` / `text_paste` / `file_upload_public` / `email_forward`. |
| `state` | ✓ | `active` / `archived` / `deleted`. |
| `archived_at`, `superseded_by` | ✓ | Lifecycle. |
| `document_pages` | ✓ | Page count when extractable. |
| `anomaly_dollar_impact_total` | ✓ | Aggregated $. |
| `raw_text_preview` | ✓ | ~1 KB text snippet. |
| **Missing → to derive client-side** | | |
| `statement_period_start`, `statement_period_end` | ✗ (derived) | Not stored as ISO fields; the compact-range label uses `extracted_json.period_start`/`period_end` when present, else falls back to `period_label`. Register formats compact strings client-side. |
| `provider_name` | ✗ (derived) | Available at `extracted_json.provider_name`. Register reads with `?? "Unknown provider"`. |
| `gross_total`, `services_subtotal`, `care_management_fee`, `closing_balance` | ✗ (derived) | All present in `extracted_json.totals` / `audit_json.balance`. Register derives on read; no schema change. |
| `decode_status` | ✗ (derived) | Currently inferred from `parsing_warnings` + `anomalies` + presence of `line_items`. Register maps to `clean` / `flagged` / `processing` / `failed`. |
| `flags_count` | ✗ (derived) | `anomalies.filter(a => a.severity === 'alert' \|\| a.severity === 'warning').length`. |
| **Additive schema (this ticket)** | | |
| `user_note` | ✗ → ADD | Free-text private note (up to 1 KB). Additive; nullable. |
| `has_note` | ✗ → ADD | Boolean surfaced on list/detail; `user_note` body itself excluded from list to keep payloads small (spec Decision 6). |

**Action:** add `user_note` + `has_note` to the `Statement` model + `GET /api/statements` + `PATCH /api/statements/{id}/note` (this PR).

---

## 0.C — Positional data for comparison

- OCR text is retained partially via `raw_text_preview` (~1 KB snippet) and via `extracted_json.text_layer` / `extracted_json.document_pages` when the decoder ran with the PyMuPDF text-layer extractor.
- **Per-line-item coordinates are NOT stored.** The decoder pipeline currently discards page + bbox anchors after extraction — anomaly rules only reference `line_item_id`, `rule`, and `evidence` text snippets.
- **Impact:** Phase 3b divergence highlighting + Phase 3c sync scroll **use the client-side text-layer path (default)**, exactly as Decision 8 and 9 anticipated. `react-pdf` (pdf.js) exposes `page.getTextContent()` with per-token `transform` matrices → sufficient to fuzzy-match decoded dollar figures against the PDF and locate them for divergence highlights + sync scroll, without a backend retrofit.
- **Future work (not this ticket):** Backfilling per-line-item anchors during decode would let us skip the client-side match step and highlight from the server. Log as P3 in the decoder backlog.

---

## 0.D — Dual-pathway consistency

Both write paths land the same record shape on `db.statements`:

| Concern | `statements_upload` path (dashboard) | `ai_tools_decoder` path (public + tool) |
|---|---|---|
| Persistence | `backend/server.py::upload_statement` L1250-1400 | `backend/server.py::_persist_ai_tools_decoded_statement` L3017-3130 |
| Fields | Same `Statement` model (period_label, line_items, summary, anomalies, extracted_json, audit_json, has_original_file, …) | Same, plus `origin_route="ai_tools_decoder"` |
| Origin marker | `origin_route="statements_upload"` | `origin_route="ai_tools_decoder"` |
| Original bytes retained? | Yes (multipart upload → `file_b64`) | Only when upload_file/photo path was used; text-paste and email-forward path stores no `file_b64` → `has_original_file=false` → Download-original button auto-disables. |

**Conclusion:** the register never shows divergent columns depending on route — both pathways populate the same downstream columns; `has_original_file` correctly gates the Download button per statement.

---

## 0.E — Current detail-view actions

Present today (from `frontend/src/pages/StatementDetail.jsx`):

1. **← Back to statements**
2. **Download original** (only when `has_original_file`) — Existing. Repurposed by this ticket, relabelled to "Original (…)" with a tooltip clarifying it's the evidentiary copy.
3. **Decoded CSV** (legacy only)
4. **Decoded PDF** (legacy only) — for new rich payloads the identical client-side export lives inside `<DecoderResultView>`.
5. **Audit Log**
6. **Archive** (or **Restore** + **Delete** when already archived)

**Additive by this ticket:**
- **Compare side-by-side** (new, → Phase 3)
- **Notes editor** below the header (autosaved to `user_note`)

---

## 0.F — Bundle impact

- `react-pdf@10.x` + `pdfjs-dist@5.x` gzip: measured ~180 KB (worker not counted in main bundle — loaded via `pdfjs-dist/build/pdf.worker.mjs` on demand).
- **Loaded only on `/app/statements/:id/compare`** via `React.lazy(() => import("@/pages/StatementCompare"))`, so the register, detail, dashboard, decoder, and marketing routes stay unchanged.
- Target <200 KB met. Worker path is set via `pdfjs.GlobalWorkerOptions.workerSrc` and pulled from the same package, so no external CDN is required (satisfies invariant 7 — no public URLs).

---

## Summary of decisions taken

- Original-file storage: **MongoDB inline `file_b64` (existing)** — no S3 migration needed.
- Divergence + sync scroll: **client-side pdf.js text-layer path** (Decision 8/9 default) — no backend anchor retrofit.
- Notes: **additive `user_note` + `has_note` on Statement model**, patched via a new `PATCH /api/statements/{id}/note`, surfaced by an autosaving editor on detail + a note icon on the register row.
- CSV export: **client-side, current filter/sort only** (Decision 10) — includes Period, Provider, Uploaded, Gross, Closing, Status, Flags, Note.
- Pagination: **server-side 25/page** — implemented via the existing `?limit=&offset=` list-endpoint contract (added in this ticket as a lightweight query slice; no dedicated pagination indices required at MVP).
- `react-pdf` bundle: **route-scoped lazy load** — no impact on core-app bundle.

Phase 0 gate: **PASS. Proceeding to Phase 1.**
