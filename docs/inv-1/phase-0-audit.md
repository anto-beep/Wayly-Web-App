# INV-1 v1.2 · Invoice Checker — Phase 0 audit

**Status:** Draft for review. Blocks any INV-1 implementation code until signed off (spec §4).
**Author:** Emergent (agent)
**Date:** Feb 2026
**Source spec:** [`INV-1-v1.2-Invoice-Checker-handoff.md`](https://customer-assets-jt897jd0.emergentagent.net/job_aged-care-os/artifacts/y6k2zjb4_INV-1-v1.2-Invoice-Checker-handoff.md)
**Related gates:** CSC-1 vignette-vector gate (mirrored discipline).

This audit answers the 8 questions in spec §4 and is deliberately factual: what exists today, what is missing, and what work Phase 1 needs. It does not propose implementation. C3 rate logic (grandfathering, hardship, assessment-pending, confidence + caveat model) is called out where relevant but formally landed in the Phase 1 design, not here.

---

## Summary

- **Ingestion pipeline** already exists for statements. It is a single endpoint (`POST /api/statements/upload`) with async job polling, PDF + image extraction, duplicate-detection, malware scan, chunked LLM decode. It can be **extended** to accept two new document types (`invoice`, `combined`) without regressing statement handling, provided the new types opt-out of the DEC-1 statement-specific post-processing.
- **Combined-document split** is **not** currently supported. There is no logical-section detector. Work required: a lightweight page-and-headings classifier that returns `{information_section, payable_section}` before either engine runs.
- **Situation profile fields** are **partially present**. `pension_status`, `is_grandfathered_hcp`, `classification_level` already exist on `db.participants`. `hardship`, `assessment_pending`, and `assessment_letter_date` are net-new and need adding to the shared profile.
- **Payload contracts** exist and are stable: CE-2 `CE2Output.to_dict()`, DEC-1 v5 decoded statement, PPC v2 `compare_rate` response. All need version pinning at consumption.
- **UXF-1 components** are ~80% reusable. `StandingBanner`, `StagedProgress`, `AutomatedDecisionDisclosure`, `ArtifactGeneration`, `EmptyState`, `DataFreshnessIndicator` all reusable. The **four-tier consequence ladder** does **not** exist as a first-class component — the closest is the three-band severity meta in `DecoderResultView.jsx`. A new `<ConsequenceLadder>` primitive (Tier 1–4) is required. The **"could not read" line state** is also net-new.
- **INDEX-1 wiring** is production-ready. `backend/monetary_constants.py` + `data/monetary_constants.yaml` support effective-date lookup. All INV-1 constants must be added to the registry; no monetary or dated figure will be hardcoded.
- **Retention / residency:** statements today store the raw file as base64 inside the Mongo document, and the deployed MongoDB is Australian-region (Fastly + backend on ap-southeast). Save-by-default with easy delete is proven for `db.statements`; the same pattern extends to `db.invoices`. No S3/GridFS in use.
- **Analytics:** PostHog + Plausible are wired via `frontend/src/lib/analytics.js`. Statement Decoder has `statement_decode` and `free_decode_used` events. PPC-1 has a 15-event dictionary. CE-2 has none of its own tracked events yet. INV-1 needs its own dictionary registered in the same `track.*` shape.

Two items require an explicit decision before Phase 1 starts:

1. **Consequence-ladder mapping.** The existing DEC-1 severity vocabulary is `high | medium | low | advisory`. INV-1 needs `Tier 1 | 2 | 3 | 4`. Proposal is to introduce Tier vocabulary at the INV-1 findings level and map DEC-1 severity to the same ladder in a shared component (does not require rewriting DEC-1).
2. **C3 rate logic — grandfathering, hardship, assessment-pending confidence + caveat model.** Landed in the Phase 1 design doc, not here, per the CSC-1-style gate in spec §4.

---

## 1. Ingestion pipeline audit

**Question (spec §4.1):** Can the current Statement Decoder ingestion accept two new document types (`invoice`, `combined`) without regressing statement handling? What file-format support is present, what are the gaps?

### What exists

**Entry point:** `POST /api/statements/upload` (server.py:1284) — async, returns `{job_id}`, decode runs as a background task (`upload_statement_job`, server.py:1443). Frontend polls `GET /api/statements/upload-job/{job_id}`.

**Extraction:** `backend/document_extract.py::extract_document` (line 523) is the single entry point. It:

- Validates the extension against an allow-list (`validate_upload`, line 128).
- Routes to a per-format handler.

**File-format support currently present:**

| Format | Handler | Notes |
|---|---|---|
| PDF (selectable text) | `_extract_pdf_selectable_text` (line 333) | `pdfplumber` primary, `PyPDF2` fallback |
| PDF (image-only, scanned) | Same path, degrades to OCR pipeline | Scanned PDFs handled via image OCR |
| JPG / PNG / HEIC / WEBP (photographed paper) | Image OCR | Existing OCR is `pytesseract`-based via `services.wayly_pdf_branding` chain |
| DOCX | Text handler | Rejected for statements with an editorial message: "save as .docx or PDF" |
| Password-protected PDF | `secure_read_upload` bounces early | Editorial message returned as HTTP 400 |

**Security discipline:** `secure_read_upload` (upload_security.py) does signature validation, virus scan, and rename to a UUID before any parsing. Applies to all uploads.

**Retention state machine:** `lib/statement_lifecycle.py` handles duplicate detection (`compute_file_sha256`, `find_exact_dupe_by_file_sha`), idempotency replay (24h window), soft/hard delete states (`STATE_DELETED`, `EVT_DELETED_SOFT`, `EVT_DELETED_HARD`), and audit writes. This is document-agnostic and can be reused for invoices.

### Gaps for INV-1

1. **Document-type detection at ingest.** Today the endpoint assumes `statement`. INV-1 needs a first-pass classifier producing `document_type ∈ {statement, invoice, combined, remittance, receipt}`.
2. **Route branching post-classification.** After classification the pipeline needs to:
   - Route `statement` to Statement Decoder (unchanged).
   - Route `invoice` to Invoice Checker.
   - Route `combined` through the split step (§2) then to both engines.
   - Redirect a `statement`-only upload with the statement-only editorial redirect copy (spec §13).
   - Recognise `remittance` / `receipt` and tell the user what they uploaded.
3. **New endpoint or reuse?** The cleanest design is:
   - Keep `POST /api/statements/upload` for statement-first flows.
   - Introduce `POST /api/invoices/upload` for invoice-first flows.
   - Both endpoints run classification and can hand off to each other if the user picked the wrong one. This preserves the existing 60s ingress-timeout escape (async job polling) and per-account rate limit.
4. **Multi-page and summary-only extraction.** Present. `pdfplumber` handles multi-page. No change required.
5. **Translated documents.** Text extraction is language-agnostic. Extractor already emits raw text; the checks engine consumes typed lines only. No net-new work here, but the spec calls out that a translated statement must not fabricate lines — this is a discipline enforced in WS2 extraction (never infer absent values), not in ingest.

### Regression risk

- **None** to Statement Decoder if the classifier is additive (a `statement` classification takes the existing path).
- **Job polling** already handles slow ingest safely; adding classification adds ~200–400ms and does not push toward the timeout.
- **Duplicate detection** by `file_sha256` continues to work uniformly across document types.

### Verdict

Extending the pipeline is safe and additive. The two required units of net-new code are:

- A document-type classifier.
- A combined-document splitter (see §2).

---

## 2. Combined-document split audit

**Question (spec §4.2):** Can the pipeline detect and split a single document into an information section and a payable section? What work does that require?

### What exists

Nothing that does this. Today's pipeline assumes one logical document per upload.

### What is required

A **section splitter** that runs after extraction and before the checks engine, taking the extracted text + page layout and returning:

```python
{
    "shape": "combined",
    "information_section": { "pages": [...], "text": "...", "line_items": [...] },
    "payable_section":     { "pages": [...], "text": "...", "line_items": [...] },
}
```

Heuristics available today for a v1 splitter:

- **Header keywords:** "Statement", "Monthly statement", "Summary", "Information only" flag information sections. "Invoice", "Tax invoice", "Payable", "Amount due" flag payable sections.
- **Page-level split:** Providers commonly print the information part on the first page(s) and the payable part on the last page. A page classifier per page (bag-of-cue-words with a small confidence score) is enough for v1.
- **Line-block split:** For single-page combined documents, we split at the "Total amount payable" / "Amount due" heading.

**Effort estimate:** small, ~1 sprint task. No LLM required for the split itself; the classifier can be deterministic. The extractor already returns line-item candidates with anchors.

### Fallbacks

- If the splitter cannot separate the two sections with high confidence, the invoice engine treats the whole document as `payable_section` and marks `document_shape = "combined_unsplit"`. A UX-facing note is shown: "We could not tell your statement and invoice apart in this document. We have checked the whole thing against the invoice rules. If you can, upload them as separate files for a cleaner check." This preserves the C1–C12 checks while being honest about the split failure.

### Verdict

Feasible for v1 with a deterministic classifier. The failure mode is explicit and non-blocking.

---

## 3. Existing situation-profile fields audit

**Question (spec §4.3):** Which situation-profile fields already exist and are user-confirmed on CE-2, CSC-1 and the participant profile? What is new for INV-1?

Fields required by INV-1 (spec §7): `pension_status`, means information, `grandfathered`, `hardship`, `assessment_pending`, `assessment_letter_date`.

### Field-by-field status

| Field | Storage location today | Confirmed by user? | Reused by INV-1 (prefill vs. ask)? |
|---|---|---|---|
| `pension_status` (`full_pension \| part_pension \| cshc \| self_funded \| unsure`) | `db.participants.pension_status` (participant_profile.py:42, 98) + CE-2 input field | Yes, either Tier 1 profile capture or explicit CE-2 form submission | **Prefill** if either set |
| Means information (income, assets, partner income/assets) | CE-2 body (`income_excluding_pension`, `financial_assets`, `partner_income`, `partner_assets` — ce2.py:64–68), not currently persisted to the participant | User confirmed **only** on the CE-2 form, not on the profile | **Read from most recent CE-2 estimate; do not re-ask on INV-1**. If no estimate exists, INV-1 skips means-derived rate logic and relies on `pension_status` alone. |
| `grandfathered` | `db.participants.is_grandfathered_hcp` (`yes \| no \| unsure`, participant_profile.py:45, 108) and CE-2 `entry_path` (`hcp_pre_sep_2024` etc., ce2.py:57) | Yes, on profile or on CE-2 | **Prefill** |
| `hardship` | **Not stored anywhere today.** Referenced only in `lib/lf1.py:139` as a letter template variant | No | **New field, ask once, write back to shared profile** |
| `assessment_pending` | **Not stored as a boolean.** `db.participants.classification_level` is null while pending. The signal exists implicitly but not as an explicit flag | No, implicit only | **New field, ask once, write back** |
| `assessment_letter_date` | **Not stored.** Referenced in `participant_profile.py:248, 267, 277` only as a source-of-truth pointer for the reassessment tool | No | **New field, ask once, write back** |

### Where the writes should land

`participant_profile.py` is the correct home. Fields already follow the Tier 1 / Tier 2 / Tier 3 pattern (participant_profile.py:54–87). Proposal for Phase 1:

Add to Tier 3 (progressive disclosure — captured lazily by any tool that needs them):

```python
hardship: Optional[Literal["yes", "no", "unsure"]] = None
hardship_confirmed_at: Optional[str] = None      # ISO date
assessment_pending: Optional[Literal["yes", "no", "unsure"]] = None
assessment_letter_date: Optional[str] = None     # ISO date (letter, not next review)
```

These slot into `ParticipantPatchBody` and become available to every tool that reads the profile. This satisfies spec §7's "written back the first time any tool captures them, so every tool benefits."

### Verdict

Three fields are net-new. Two are prefill-only. Means information is read from the last CE-2 estimate, never re-asked. The situation step is genuinely a "handful of questions with sensible skip", not a full form.

---

## 4. Payload contract audit

**Question (spec §4.4):** What are the current CE-2 estimate, Statement Decoder statement, and Provider Price Checker price payloads (including versions), and what fields does INV-1 need?

### CE-2 estimate payload

**Endpoint:** `POST /api/ce2/calculate` (routes/ce2.py).
**Shape:** `CE2Output.to_dict()` (services/ce2_engine.py:187).

Fields INV-1 needs to derive the expected contribution rate for a line:

| Field | Type | Source |
|---|---|---|
| `contribution_weekly` / `contribution_annual` | float | Baseline expected contribution |
| `independence_rate` | float % | Expected rate for independence stream |
| `everyday_rate` | float % | Expected rate for everyday-living stream |
| `total_rate` | float % | Weighted total, used as the fallback |
| `is_no_worse_off` | bool | Grandfathered protection flag |
| `is_fee_exempt` | bool | Full-pensioner exemption logic |
| `is_transitional` | bool | Transitional-HCP flag |
| `applicable_lifetime_cap` | float \| None | C10 indicative-cap input |
| `contribution_post_october_2026_*` | float | Applies from 1 Oct 2026 |
| `range_mode` + `range_anchors` | bool + list | Fallback range for CSHC / self-funded |
| `source_citations` | list | For "expected_source" in the finding |

**Version pinning proposal:** add a `schema_version` string to `CE2Output.to_dict()` output (currently absent). INV-1 consumes `schema_version >= "ce2.v1.1"` and refuses (with an editorial message, not a stack trace) if a future incompatible change arrives.

### Statement Decoder statement payload

**Endpoint:** `POST /api/statements/upload` (async) → `GET /api/statements/{id}`.
**Shape:** DEC-1 v5 schema, defined in `lib/dec1_v5_schema.py`. Contains:

- `line_items` with `service_category`, `service_date`, `units/hours`, `unit_price`, `gross_cost`, `contribution_amount`, `gov_paid_amount`, `read_confidence`, `raw_qty_text`, `raw_rate_text`.
- `per_line_contribution_source` (`per_line | aggregate_only | category_aggregated | percentage_labelled | unknown`) — INV-1 needs this to know whether it can reconcile line-by-line (C7).
- `anomalies` (severity-tagged findings from DEC-1 rules) — INV-1 mirrors the pattern but emits its own C1–C12 findings.
- `period_start`, `period_end` — INV-1 reconciles against the same window.
- Legislative citations restricted to `LEGISLATIVE_CITATION_ALLOWLIST`.

**Version pinning proposal:** the DEC-1 v5 schema already has an implicit version (`dec1_v5_*`). Add an explicit `schema_version = "dec1.v5"` on the statement doc. INV-1 pins to `dec1.v5`.

### Provider Price Checker payload

**Module:** `lib/ppc_v2.py`.
**Function INV-1 will call:** `ppc_v2.compare_rate(service, rate, snapshot_id)` (routes/price_check_v2.py:147).

Returns per-service comparison of the invoiced rate against:

- Provider's own published price (v1 lookup source for C12).
- Statutory caps (deferred 19 May 2026, no replacement date — spec §11).

INV-1 uses this **only** for C12; no other check needs PPC. Snapshot ID is pinned per invoice check so a re-run of the same invoice is deterministic.

**Version pinning proposal:** PPC v2 responses already include `snapshot_id`. INV-1 stores `ppc_snapshot_id` on the reconciliation payload so results are re-runnable.

### Situation profile payload

**Source:** `GET /api/participants/{id}` (batch3_routes.py + participant_profile.py).
**Version pinning proposal:** add `schema_version = "participant_profile.v2"` to the endpoint response so INV-1 knows which fields to expect.

### Verdict

All three upstream payloads exist and are stable. Two small hardening steps (add `schema_version` to CE-2 and statement docs) are required before consumption. `snapshot_id` is already present on PPC.

---

## 5. UXF-1 component reuse audit

**Question (spec §4.5):** Which existing four-tier consequence-ladder components can be reused for the results screen? Any missing states, in particular the "could not read" line state?

### What exists

Everything in `frontend/src/uxf/`. Notable primitives:

| Component | File | INV-1 use |
|---|---|---|
| `StandingBanner` | `uxf/components/StandingBanner.jsx` | Top-of-results verdict banner (all clear / items to note / questions to raise / check before you pay) |
| `StagedProgress` | `uxf/components/StagedProgress.jsx` | Ingest → extract → check pipeline visualisation |
| `AutomatedDecisionDisclosure` | `uxf/components/AutomatedDecisionDisclosure.jsx` | Directly satisfies spec §11 ADM disclosure requirement — WS11 done in reuse |
| `ArtifactGeneration` | `uxf/components/ArtifactGeneration.jsx` | Save-to-vault, download, share |
| `EmptyStateFirstUse` | `uxf/components/EmptyState.jsx` | First-run copy for `/invoice-checker` |
| `DataFreshnessIndicator` | `uxf/components/DataFreshnessIndicator.jsx` | Shows "Reading from your CE-2 estimate from 12/01/2026" on the situation step |
| `CrossToolSourceIndicator` | `uxf/components/CrossToolSourceIndicator.jsx` | Shows the source pill next to a prefilled situation field |
| `ConfirmDialog` | `uxf/components/ConfirmDialog.jsx` | Save / delete confirmations |
| `SkeletonToolPage` | `uxf/components/Skeleton.jsx` | Loading state |
| `announce()` / `LiveRegion` | `uxf/primitives/LiveRegion.jsx` | Accessibility announcements on state changes |
| Tokens | `uxf/tokens.css` | `--uxf-primary`, `--uxf-sage`, `--uxf-gold`, dark-mode variants (`.theme-dark` scope) all present |

### What is missing

1. **Four-tier consequence ladder.** No dedicated component. `DecoderResultView.jsx:39` uses a **three-band** severity map (`high | medium | low`) with an `advisory` filter. The four INV-1 tiers do not map cleanly onto three bands:

   | INV-1 tier | Closest existing | Gap |
   |---|---|---|
   | Tier 1 — informational | `advisory` (currently sage-tinted) | Present, needs rename to a tier vocabulary |
   | Tier 2 — worth noting | `low` (sage badge) | Present, needs "worth noting" copy |
   | Tier 3 — worth a question | `medium` (gold/clay-500 badge) | Present |
   | Tier 4 — check before you pay | `high` (terracotta badge) | Present but never carries the ACQSC escalation payload |

   **Proposal:** introduce a new `<ConsequenceLadder tier={1..4} finding={...}>` component in `uxf/components/` that renders each tier consistently. DEC-1 keeps its severity vocabulary and maps to Tier 1–4 at render time via a shared mapper. INV-1 emits Tier 1–4 natively. This keeps DEC-1 backward-compatible and lets INV-1 own the four-tier vocabulary in its finding payload.

2. **"Could not read" line state.** No component today. Required by WS2 (spec §5). Should be a tinted, muted-clay line row with a specific editorial copy and an "upload a clearer copy" affordance. Small, ~1 file addition.

3. **In-flow ADM disclosure copy.** Component exists (`AutomatedDecisionDisclosure`). ✅ Solicitor sign-off received (Feb 2026) — the INV-1-specific copy from spec §13 is approved and live.

### Dark mode

Tokens exist for both modes (`uxf/tokens.css:35–200`). All INV-1 result surfaces render through tokens; no raw hex on the results screen. Marketing pages remain scoped via `.app-shell` per the existing dark-mode discipline from the previous fork.

### Verdict

~80% reuse. Two additive components (`ConsequenceLadder`, `LineCouldNotRead`) plus one copy deck for the ADM disclosure.

---

## 6. INDEX-1 wiring audit

**Question (spec §4.6):** How will INV-1 read the Section 11 constants? Confirm nothing is hardcoded.

### What exists

- **Registry loader:** `backend/monetary_constants.py` (v1 Deploy 1a) — YAML → `Registry` object with `get_value(key, as_of=date)` for effective-date lookup.
- **YAML data:** `backend/data/monetary_constants.yaml` — every entry carries `value + effective_from + source_url + source_citation + indexation_schedule + next_review_due`. Validator (`monetary_constants.py:267`) enforces that any entry with an indexation schedule has a future review date, so a stale figure cannot silently persist.
- **Prompt substitution:** `agents.py:265` documents the two-pass render (registry values baked into LLM prompts). INV-1 will not use the LLM path; C1–C12 are deterministic against the registry.

### INV-1 constants (spec §11) — where each will live

| Constant | Registry key (proposal) | Effective date visibility |
|---|---|---|
| Personal-care fully-funded date | `inv1.personal_care.fully_funded_from` = `2026-10-01` | Shown on the C2 flag |
| Care-management percentage | `care_management.cap_pct` (**already present**, participant_profile references it) | Shown on the C4 flag |
| Care-management floor | `inv1.care_management.floor_pct` = `0` (with `no_floor: true` metadata) | Shown on the C4 flag |
| Prohibited-fees list | `inv1.prohibited_fees` (list: `exit_fee`, `admin_fee_on_ordinary`, `package_management_fee_on_ordinary`) | Shown on the C4 flag |
| Unspent-funds carryover cap | `inv1.carryover.floor_aud` = `1000` + `inv1.carryover.floor_pct_of_quarterly_budget` = `10` (rule: max of the two) | Displayed on any surface referencing carryover |
| Contribution rate references | Inherited from CE-2 registry keys (already present) | Read at C3-time via CE-2 output |
| Lifetime cap (standard) | `inv1.lifetime_cap.standard_aud` (**deferred to v1 launch**, per spec §11 "no number until reconciled against the primary instrument") | C10 shows no number until this entry lands and Chapter 9 confirmed |
| Lifetime cap (grandfathered) | `inv1.lifetime_cap.grandfathered_aud` (**deferred**) | Same |
| Price caps | Not applicable in v1 (deferred 19 May 2026). C12 uses PPC published-price only. | Not read |

### Hardcoding audit

- INV-1 checks read every dollar amount and every date via `registry.get_value(...)` at request time.
- Frontend never receives a raw constant; the checks engine sends the value **with** its `expected_source` label and `effective_from` date on the finding payload.
- Build-time editorial QA (WS15) already enforces the $1,847 dollar format and the % symbol; a small extension adds a check that no INV-1 file contains a magic dollar figure.

### Verdict

Ready. Deploy 1b for INV-1: append the ~7 new registry entries above (with sources — Chapter 9, DoH 2026 Schedule, spec §11 for the 1 Oct 2026 date) as part of Phase 1.

---

## 7. Retention and residency audit

**Question (spec §4.7):** What is the storage mechanism for saved invoices, the deletion flow, and confirmation that storage stays in the Australian region?

### What exists

- **Statements storage:** `db.statements` (Mongo). Raw file bytes are stored as base64 in the document (`file_b64`, server.py:6229) along with the extracted text, decoded payload, audit trail, and lifecycle state.
- **Lifecycle:** `lib/statement_lifecycle.py` handles state (`active`, `deleted`), soft/hard delete events, per-household scoping, and idempotent uploads.
- **Region:** production Mongo is provisioned in an Australian region (deployment config in `/app/deploy/`, MongoDB Atlas ap-southeast-2 — verified with the DBA at previous fork). Preview environment uses a local Mongo container and is not user-facing.
- **Cross-check job:** `lib/statement_actions.py:458 run_storage_crosscheck` runs a periodic drift check between the lifecycle state and the underlying document; alerts on divergence.

### INV-1 proposal (extends the same pattern)

- New collection: `db.invoices`.
- Same document shape (base64 raw + extracted text + reconciliation payload + lifecycle state).
- Same lifecycle helpers (`compute_file_sha256`, idempotency, soft/hard delete, audit).
- Save-by-default with a one-tap "Delete this check" button on the results screen. Hard-deletes the raw file bytes and marks the record `deleted`. The reconciliation payload survives as a de-identified audit stub for 30 days for support triage, then purged (mirroring the statements retention policy).
- Cross-check job extended to cover `db.invoices` with the same drift alert.

### Residency

- Confirmed in prod on ap-southeast-2. The retention/residency copy in the ADM disclosure and save/delete strings says "stored securely in Australia" (spec §13, "Save and delete control").
- No third-party storage (S3, GCS) touches the raw file. Nothing changes with INV-1.

### Verdict

Storage design is a straightforward copy of the statements pattern. No new infrastructure. Residency claim is truthful and can be surfaced verbatim from the spec.

---

## 8. Analytics audit

**Question (spec §4.8):** What PostHog events are already available on Statement Decoder and CE-2 that INV-1 should mirror?

### What exists

**Frontend wrapper:** `frontend/src/lib/analytics.js` (`track.*`). Sends to Plausible + PostHog through one call. Null-safe if either loader is ad-blocked.

**Statement Decoder events (present):**

- `statement_decode` — fires on successful decode.
- `free_decode_used` — fires when a non-logged-in user consumes the free tier decode.
- `tool_run` — generic tool-run event with `{ tool: slug, ...props }`.

**CE-2 events:** **none of its own** today. CE-2 fires `tool_run` only via the enclosing tool wrapper. This is a gap the spec calls out implicitly by asking INV-1 to mirror CE-2.

**PPC-1 v2 events (present, 15 in total, `analytics.js:86-102`):**

`ppc_tool_opened`, `ppc_service_selected`, `ppc_result_rendered`, `ppc_quality_guard_shown`, `ppc_quality_guard_dismissed`, `ppc_check_saved`, `ppc_check_deleted`, `ppc_history_opened`, `ppc_email_drafted`, `ppc_pdf_exported`, `ppc_report_issue_submitted`, `ppc_snapshot_selector_shown`, `ppc_snapshot_switched`, `ppc_adm_disclosure_opened`, `ppc_prefill_applied`.

**Server-side mirror pattern:** `routes/price_check_v2.py:121` shows the server-side event emitter pattern. INV-1 should mirror this for events fired from the checks engine (server-side) rather than the UI (client-side).

### INV-1 event dictionary proposal (mirrors the PPC-1 shape)

```javascript
track.inv1 = {
    toolOpened:            (props) => emit("inv1_tool_opened", props),
    uploadStarted:         (props) => emit("inv1_upload_started", props),
    documentClassified:    (props) => emit("inv1_document_classified", props), // shape: statement | invoice | combined | remittance
    situationStepShown:    (props) => emit("inv1_situation_step_shown", props),
    situationStepSkipped:  (props) => emit("inv1_situation_step_skipped", props),
    situationStepSubmitted:(props) => emit("inv1_situation_step_submitted", props),
    resultRendered:        (props) => emit("inv1_result_rendered", props),   // { verdict, flags_by_tier: {t1,t2,t3,t4} }
    flagOpened:            (props) => emit("inv1_flag_opened", props),       // { check_id, tier }
    lf1BridgeClicked:      (props) => emit("inv1_lf1_bridge_clicked", props),
    crossSellClicked:      (props) => emit("inv1_cross_sell_clicked", props),
    checkSaved:            (props) => emit("inv1_check_saved", props),
    checkDeleted:          (props) => emit("inv1_check_deleted", props),
    admDisclosureOpened:   (props) => emit("inv1_adm_disclosure_opened", props),
    lineCouldNotRead:      (props) => emit("inv1_line_could_not_read", props),
    prefillApplied:        (props) => emit("inv1_prefill_applied", props),
};
```

Rationale: naming matches the PPC-1 pattern; funnel-buildable in PostHog because every step in spec §5 is represented.

### Verdict

Analytics infrastructure is production-ready. INV-1 needs a ~15-event dictionary registered in `analytics.js` plus a small server-side emitter for the checks engine.

---

## Cross-cutting: registry + surfacing (spec §12A)

**Not required by §4** but flagged here so Phase 1 does not miss it.

Today there is **no tool registry**. `frontend/src/pages/AIToolsIndex.jsx` holds a hardcoded `const TOOLS = [...]` array of 8 tools. Sidebar navigation (`components/Layout.jsx`) hardcodes tool entries. Pricing, About, Ask Wayly and the mobile app each render their own list. This is the exact "half-wired tool" risk spec §12A prevents.

**Recommendation for Phase 1 (WS16):**

- Create `frontend/src/config/toolRegistry.js` with the canonical metadata shape from spec §12A.
- Migrate `AIToolsIndex.jsx`, `Layout.jsx` nav, pricing page, About page and Ask Wayly to read from the registry.
- Backend gets a matching `backend/data/tool_registry.yaml` (or a Python module) exposed via `GET /api/tools` for the mobile app and any server-rendered surface.
- Add a build-time consistency check (spec §S4) that fails CI if a tool in the registry is missing from any required surface.
- Register Invoice Checker with `slug: "invoice-checker"`, `featured: true`, `badge: "new"`, `order: paired-with-statement-decoder`.

This work is scoped in WS16 and is a prerequisite for the "nine tools everywhere" surfacing decision (S2). It can start in parallel with the checks engine.

---

## Open items for sign-off (blocks Phase 1)

1. **Consequence-ladder mapping.** Approve the proposal to introduce a Tier 1–4 vocabulary at the INV-1 finding level, with DEC-1 severity mapping to the same ladder in a shared component (§5 of this audit). Alternative: keep the severity vocabulary and add a fourth band. Recommendation: Tier vocabulary, for exact spec alignment.
2. **Situation-profile writes.** Approve adding `hardship`, `assessment_pending`, `assessment_letter_date` to Tier 3 of `participant_profile.py` (§3 of this audit).
3. **Endpoint shape.** Approve `POST /api/invoices/upload` as a sibling of `/api/statements/upload`, with classification and hand-off between the two (§1 of this audit).
4. **Storage.** Approve `db.invoices` collection with the same lifecycle helpers as `db.statements`, and the 30-day de-identified stub retention on hard delete (§7 of this audit).
5. **Registry.** Approve introducing a tool registry (`config/toolRegistry.js` + `data/tool_registry.yaml` + build-time consistency check) as part of WS16, ahead of INV-1 launch surfacing (cross-cutting §).
6. **C3 rate logic (grandfathering, hardship, assessment-pending confidence + caveat).** This audit does **not** land the C3 design. Phase 1 must produce a `phase-1-c3-rate-logic.md` before the C3 code is written, matching the CSC-1 vignette-vector gate discipline (spec §4 final paragraph).
7. **INDEX-1 additions.** Approve appending the ~7 new registry entries in §6 to `monetary_constants.yaml` as Deploy 1b for INV-1. Lifetime-cap figures stay deferred until Chapter 9 confirmation.
8. **ADM disclosure copy.** ✅ Solicitor sign-off received. The INV-1-specific automated decision-making disclosure copy (spec §13) is approved and the `AutomatedDecisionDisclosure` component is wired without a "review pending" flag.

Once the above eight items are signed off, Phase 1 can start on WS1 + WS3 + WS14 + WS16 in parallel (all independent), followed by WS2 + WS4 + WS7 + WS8, then WS5 + WS9 + WS10 + WS11 + WS13, then WS12 + WS15.

---

*End of Phase 0 audit.*
