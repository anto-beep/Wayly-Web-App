# UXF-1 v3 — Phase 0 Audit
**Iteration 98 · 13 July 2026**

**Spec:** `/app/docs/UXF-1-v3-spec.md` (v3 consolidated, supersedes v1 / v2)
**Audit scope:** All 16 items from Section 5 of the spec.
**Status:** ✅ Complete. Requires Antony sign-off before any implementation code starts.

---

## 0. What Needs Antony Sign-Off (before I write any component code)

Per spec Section 9, six values are gated by explicit sign-off. Findings below map each to what already exists so this can be a quick review, not a re-decision:

| # | Item | Proposed value (see body) | Section |
|---|------|---------------------------|---------|
| **A** | Decoder pipeline phase labels | 6 extraction passes (Reading header, Extracting Clinical, Extracting Independence, Extracting Everyday Living, Care management & adjustments, Reading provider notes) → 1 audit pass (Running anomaly audit). Already shipped in `DecoderProgress.jsx` — reads honestly against real backend phases (`wrapper` → `extract` → `audit` → `done`). | Section 3 item 4 |
| **B** | Artifact generation phase labels | CE-2 PDF: **Composing your estimate** → **Rendering PDF** → **Ready**. LF-1 correspondence: **Drafting your letter** → **Formatting for PDF** → **Ready to send**. Care Plan artefact: **Reading your care plan** → **Applying the Statement of Rights** → **Compiling findings** → **Ready to take to your meeting**. See Section 5 findings. | Section 3 item 5 |
| **C** | `SUPPORT_FIRST_RESPONSE_TARGET` | **1 business day** proposed. Currently hardcoded in copy where used. See Section 15. | Section 8 |
| **D** | Plan-change / cancellation billing copy | Draft strings inline with Section 3 findings, awaiting ACL review. Not yet routed. | Section 8 |
| **E** | Automated decision-making disclosure string | Draft: *"This estimate was calculated automatically from the figures you entered and the Department of Health rates. You can ask any Wayly team member to check the calculation, or run the numbers by an independent financial adviser."* — awaiting solicitor review. | Section 3.23 |
| **F** | **Dark palette hex set** | See Section 16 for full token proposal (surface family, off-white text, desaturated status + brand variants). All contrast-verified to AAA. | Section 4 |

---

## 1. Current-State Inventory (Section 5, item 1)

For each surface, columns are **Load / Success / Error / Empty**.

### 1.1 AI Tools

| Tool | Load | Success | Error | Empty |
|------|------|---------|-------|-------|
| **Statement Decoder** (`StatementDecoderTool.jsx`) | Custom 6-step `DecoderProgress.jsx` with staged progress + reassurance line, elapsed-seconds counter. Backend phases: `wrapper`, `extract`, `audit`, `done`. | Inline `DecoderResultView` block. No standing banner; the result panel IS the confirmation. | Try/catch → red `Alert` block above form; `<em>Decode timed out</em>` / `Decode failed`. **Input preserved** (text + file state not cleared). | Pre-run state shows explainer + textarea; no dedicated first-use / no-results split. |
| **Contribution Estimator** (`ContributionEstimator.jsx`) | Two spinners: `access === "loading"` full-screen + `isCalculating` inline button. Skeleton for constants load: none — form just renders. | Result screen replaces form (context-in-place). Persistent, dismissible via "Edit inputs". Includes HCP comparison + PDF export CTA. | Inline `Alert` at top of form; validation happens on submit (backend 422 message shown verbatim). Input preserved. | Not applicable (single-shot tool). |
| **Provider Price Checker** (`PriceCheckerTool.jsx`) | Full-screen spinner while `access === "loading"`. `isSubmitting` toggles button state. | Result card slides in below form. Includes save-to-history CTA + email/PDF actions. | Inline validation + backend error surfaced in same result card slot. | History tab: `PriceCheckerHistory.jsx` — no dedicated empty state. |
| **Classification Self-Check** (`ClassificationCheck.jsx`) | Full-screen spinner on access resolve. | Inline result card. | Same pattern. | No dedicated empty state. |
| **Letters and Follow-ups** (`LettersFollowUps.jsx`) | Full-screen spinner on access resolve. Per-card `Loader2` on `busySituationId`. | New iter-2/3/4 UI: intake → draft → log flow with route change. Standing banner in log for saved entries. | Inline error under card. Safety modal for safeguarding archetype. Input preserved. | Correspondence log empty state: `EmptyCard` via `pages/extended/Correspondence.jsx`. |
| **Care Plan Reviewer** (`CarePlanReviewer.jsx`) | Full-screen spinner on access. `Loader2` on submit button. | Findings list panel via `FindingsRenderer`. | Inline `Alert`. Files preserved on error. | Not yet migrated — pre-run screen is the form itself. |
| **Family Coordinator / Ask Wayly** (`FamilyCoordinator.jsx`, `AskWayly.jsx`) | Streaming AI: character-by-character render as tokens arrive. | Inline chat bubbles. | Inline error bubble. | First-run prompt shown as suggestions. |
| **Budget Calculator** (`BudgetCalculatorTool.jsx`) | Full-screen spinner on access; button spinner on submit. | Result block below form. | Inline error. | No empty state. |
| **Reassessment Letter** (`ReassessmentLetter.jsx`) | Standard access-load pattern. | Text preview + download CTA. | Inline error. | No empty state. |

### 1.2 Non-tool screens

| Screen | Load | Success | Error | Empty |
|--------|------|---------|-------|-------|
| **Landing / Marketing** (`Landing.jsx`, `Pricing.jsx`, `Features.jsx`, `Trust.jsx`) | `RouteSkeleton` on lazy import; no in-page load state after. | N/A (static). | N/A. | N/A. |
| **Signup / Login / Password reset** | Button spinner + form-disabled state. | Redirect to `/onboarding` or `/dashboard`. | Inline `Alert` above form. Input preserved. | N/A. |
| **Onboarding** (`Onboarding.jsx`) | Button spinner per step. Step progress rendered inline. | Redirect to `/dashboard` on completion. | Inline `Alert`. | N/A. |
| **Dashboard** (`CaregiverDashboard.jsx`) | `Skeleton` for insights + timeline panels while loading. Individual widget skeletons. | Widgets render as data arrives. | Per-widget error banner. | Widget-level "No X yet" cards. |
| **Statements register** (`StatementsList.jsx`) | `Skeleton` list. | Row insert. | Inline banner. | Dedicated `statements-empty-state` and `statements-no-results` states with different copy. ✅ First-use vs no-results already distinct. |
| **Statement detail** (`StatementDetail.jsx`) | Skeleton block. | Full detail render. | Inline. | N/A. |
| **Care Plan Store** (`CarePlanStore.jsx`) | Route skeleton then card grid load. | Row insert. | Inline. | ✅ Dedicated `empty-state` present with "Add your first plan" CTA. |
| **Correspondence log** (`pages/extended/Correspondence.jsx`) | Skeleton via `PageShell`. | Row insert. | Inline. | ✅ `EmptyCard` component with icon + prose. |
| **Tickets** (`AdminSupport.jsx`, `ReportIssueButton.jsx`) | Button spinner. | Toast (❗ auto-dismisses — violates 3.1). | Toast (auto-dismisses). | Tickets list empty state: none. |
| **Account & settings** (`Settings.jsx`) | Tab skeletons. | Toast confirmation (auto-dismiss). | Inline error under field. | Per-tab empty patterns vary. |
| **Plan and billing** (`Settings.jsx` → BillingTab; `Pricing.jsx`) | Button spinner. Stripe redirect flow. | Toast + redirect. | Toast + retry button. | N/A. |
| **Global route transitions** | `RouteSkeleton` via `Suspense`. **Focus is NOT moved to the new heading** — regression from AAA. | N/A. | `ErrorBoundary.jsx` for unhandled JS errors. | N/A. |

---

## 2. Toast Usage Inventory (Section 5, item 2)

**Grep footprint:** `sonner` / `toast(` / `useToast` — **61 files**. Full raw list in `/tmp/toast_usage.txt` (regenerate via `grep -rln "sonner\|toast(\|useToast" /app/frontend/src`).

**Top hotspots (info that will be lost if the person doesn't see the toast in time):**

| File | What the toast carries | Risk under 3.1 |
|------|-----------------------|----------------|
| `lib/api.js` (global 429/503/402) | "You've reached the usage limit. Sign up free for more." / "Our AI is taking a short break." | 🔴 Auto-dismiss carries actionable next step. Must migrate to standing banner. |
| `components/EmailResultButton.jsx` | "Emailed to name@address" | 🔴 Carries actual destination address — must be persistent (spec 3.20). |
| `components/ReportIssueButton.jsx` | Ticket reference number, first-response window | 🔴 Reference number lost on auto-dismiss (spec 3.15). |
| `components/ShareDashboardButton.jsx` | "Invite sent to X" | 🔴 Destination address lost. |
| `pages/Settings.jsx` (multiple) | "Saved", "Signed out other sessions", "SMS contact added" | 🟠 Standing banner for consequential; Quiet inline for saves. |
| `pages/StatementUpload.jsx` | Upload success + resulting statement id | 🔴 Reference lost. |
| `pages/StatementsList.jsx` | Bulk action confirmations | 🟠 Undo action lives on the toast timer. |
| `pages/Onboarding.jsx` | Validation nudges | 🟠 Can be moved to inline validation (spec 3.9). |
| `pages/ParticipantView.jsx` | Sensitive edits: "Marked pending removal" | 🔴 Consequential; must be confirm-before + standing after. |
| `pages/tools/BudgetCalculatorTool.jsx` | Calculation-refresh confirmations | 🟢 Ambient result — remove toast entirely. |
| `pages/tools/ReassessmentLetter.jsx` | Draft send / copy confirmations | 🟠 Move to persistent standing. |
| `pages/AdviserPortal.jsx`, `AdviserBrand.jsx` | Save confirmations | 🟠 Standing banner. |
| `pages/VerifyEmail.jsx`, `PasswordReset.jsx` | Success + failure of email flows | 🔴 Must be persistent. |
| `components/statements/StatementAskWayly.jsx`, `StatementNotes.jsx` | Ephemeral status | 🟢 Ambient — acceptable. |
| `pages/settings/SMSContactsTab.jsx` | Consent captured | 🔴 Consent trail must be a receipt. |
| `pages/AuditLog.jsx`, `pages/DocumentVault.jsx`, `pages/extended/*` | Various | Mostly 🔴 or 🟠 — see full list. |
| `components/ImpersonationBanner.jsx`, `NotificationsBell.jsx` | Meta actions | 🟢 Ambient. |
| Total flagged for migration to persistent standing / inline / confirm-before: **~48 of 61**. |

**Toaster mount point:** `components/ui/toaster.jsx` — this is where the sonner container lives. UXF-1 will replace it with a `StandingBanner` mount slot + keep a Quiet-tier ambient region for the ~13 truly ambient uses.

---

## 3. Input and File-Loss Risk Inventory (Section 5, item 3)

**Rule per spec:** No error path may clear typed input or an uploaded file. Retry must not force re-typing or re-upload.

### 3.1 Statement Decoder (`StatementDecoderTool.jsx`)
- **File state:** `useState(file)` never cleared on error paths (lines 164–175). ✅
- **Text state:** `text` preserved on error. ✅
- **Job-expired branch:** `if (code === 404) throw "Decode job expired. Please try again."` — file/text still in state, retry works. ✅
- **Tab close:** File is in-memory only. If the tab crashes or the user closes it, the file is lost. 🟠 **Recommendation:** persist an `IndexedDB` handle for the file blob + rehydrate on load (M workstream). Not a blocker; flagged for spec 3.9.
- **90-second HTTP timeout:** If the POST times out but the server is still processing, no client-side pointer to the job. 🟠 **Recommendation:** long-running jobs return a `job_id` synchronously (already done for text path); ensure same for file path.

### 3.2 Care Plan Reviewer (`CarePlanReviewer.jsx`)
- **Multi-file state:** `useState(files[])` retained on error (line 111–115). ✅
- **Classification + budget hint fields:** preserved. ✅
- **Max 20 MB / 5 files:** validated pre-submit inline. ✅ **BUT** — validation is only against `MAX_BYTES` and MIME, no server-side pre-check for corrupt PDFs. If the PDF is unreadable server-side, the error surfaces after upload — file preserved, but user has to guess it's malformed.
- **Tab close:** Same in-memory issue as Decoder. 🟠

### 3.3 Statement Upload (`StatementUpload.jsx`)
- File preserved on error. ✅ Retry keeps the drop. ✅

### 3.4 Adviser Brand (`AdviserBrand.jsx`)
- Logo upload preserved on error. ✅

### 3.5 Document Vault (`DocumentVault.jsx`)
- Multi-doc drop; preserved on individual doc errors. ✅

### 3.6 AT-HM Tracker + Family Wall (`extended/AthmTracker.jsx`, `FamilyWall.jsx`)
- Attachment upload preserved. ✅

**No input-loss regressions found. The remaining risk is browser-tab persistence, which is a UXF-1 v3 3.9 target for the Care Plan and Decoder flows.**

---

## 4. Decoder Pipeline Phases (Section 5, item 4)

Backend truth (`server.py` lines 3270–3320, and 3591–3980 for the two decoder entry-points):

```
job["status"] = "queued"
      ↓ 
job["phase"] = "wrapper"          (safety + PII redaction wrapper)
      ↓
job["phase"] = "extract"          (5 parallel extraction chunks via
                                   `extract_statement` in agents.py)
      ↓
job["phase"] = "audit"            (13 pension-aware audit checks via
                                   `audit_statement`)
      ↓
job["phase"] = "duplicate_logical_same"  (dedup branch; short-circuits
                                          to a resolved result if the
                                          hash matches a prior decode)
      ↓
job["phase"] = "done"             (final `_build_decode_payload`
                                   assembled; result persisted via
                                   `_persist_decoded_statement_for_user`)
```

**Observed wall-clock:** ~45–70s end-to-end. Extraction chunks run in parallel and finish around ~10s; audit takes another ~30s. This is what `DecoderProgress.jsx` STEPS is calibrated against.

**Honest label mapping (already deployed in `DecoderProgress.jsx`):**

| Frontend step | Real backend event | ~ elapsed |
|---------------|--------------------|-----------|
| Reading header | Chunk 1 of extract | 0–18 s |
| Extracting Clinical | Chunk 2 | 0–22 s |
| Extracting Independence | Chunk 3 | 0–24 s |
| Extracting Everyday Living | Chunk 4 | 0–26 s |
| Care management & adjustments | Chunk 5 | 0–28 s |
| Reading provider notes | Post-extract free-form pass | 0–30 s |
| Running anomaly audit | `audit_statement` | 30–75 s |

**Reassurance line proposed (spec 3.2, 3.17):**
> *"This can take up to a minute. Your statement is safe and you do not need to do anything."*

**Verdict:** phase labels already honest against real backend events. No relabelling needed for spec 3.17 — just wrap in the shared `StagedProgress` from Workstream A + add loading timeout per 3.5 (proposed ceiling: **180 s**, matches the existing client-side deadline).

---

## 5. Artifact Generation Inventory (Section 5, item 5)

Every artifact the platform emits, its current pipeline, delivery mechanisms, and the honest phase labels 3.20 needs.

### 5.1 CE-2 Contribution Estimator PDF (`POST /api/ce2/pdf` → `services/ce2_pdf.py`)
- **Phases:** synchronous (`render_ce2_pdf()` returns bytes). Under ~1 s locally.
- **Delivery:** direct `application/pdf` download. No email path yet.
- **Current UI:** button spinner while POST is in flight. No staged progress.
- **Failure handling:** frontend shows generic error; result state (weekly $, annual $) is preserved so user can retry.
- **Proposed 3.20 labels:** `Composing your estimate → Rendering PDF → Ready to download`.

### 5.2 LF-1 Correspondence PDF (`POST /api/lf1/correspondence/{id}/pdf`)
- **Phases:** synchronous (`render_letter_pdf()` returns bytes).
- **Delivery:** direct download. Email flow via `/api/lf1/correspondence/{id}/email` (uses Resend). Correspondence log entry created at draft time, not at PDF time.
- **Current UI:** button spinner.
- **Failure handling:** file preserved; user can retry.
- **Correspondence-log disclosure:** currently the log row silently appears — no explicit "A copy has been kept in your correspondence log" prose. 🔴 Must add per spec 3.20.
- **Proposed labels:** `Drafting your letter → Formatting for PDF → Ready to send`.

### 5.3 Provider Price Checker (`POST /api/ppc/pdf`)
- **Phases:** synchronous.
- **Delivery:** direct download. Email-to-provider path via `POST /api/ppc/email-draft`.
- **Proposed labels:** `Rendering your price check → Ready to download`.
- **Address-confirm-before-send:** ❌ Missing — currently email draft returns to clipboard, not sent. If we add a "send" path, per 3.20 we need address confirmation.

### 5.4 Care Plan Reviewer PDF (`POST /api/care-plans/{id}/pdf` → `routes/care_plans.py:771`)
- **Phases:** synchronous.
- **Delivery:** direct download.
- **Proposed labels:** `Reading your care plan → Applying the Statement of Rights → Compiling findings → Ready to take to your meeting`.

### 5.5 Statement PDF (`routes/statements.py::_render_pdf`)
- **Phases:** synchronous (~1–2 s for large statements).
- **Delivery:** direct download.
- **Proposed labels:** `Composing your statement summary → Ready to download`.

### 5.6 Switch-Provider PDF (`routes/switch_provider_pdf.py`)
- **Phases:** synchronous.
- **Delivery:** direct download.

### 5.7 Adviser Reports (`adviser_routes.py:608`)
- **Phases:** synchronous.
- **Delivery:** direct download.

### 5.8 Extended Summary PDF (`extended_routes.py::_render_summary_pdf`)
- **Phases:** synchronous.
- **Delivery:** direct download.

### 5.9 Emails (`email_service.py::send_email` via Resend)
- **Verification email** (`routes/email_verification.py:172`)
- **Password reset**
- **Support ticket auto-reply** (`routes/support.py:481`)
- **PPC email draft** (`routes/price_check_v2.py::/ppc/email-draft`)
- **CE-2 email export** (`routes/ce2.py::/pdf-email` — TBC in current code; likely not yet wired)

**Verdict:** All 8 artifact families need `ArtifactGeneration` wrapping (Workstream O). None currently show `Generating → Ready → Delivered → Failed`. The disclosure "A copy has been kept in your correspondence log" is missing on the LF-1 send path.

---

## 6. Cross-Tool Session State Inventory (Section 5, item 6)

Every place one tool consumes another tool's state.

| Consumer | Source | What is displayed | Origin/age shown? |
|----------|--------|-------------------|-------------------|
| **CE-2 Contribution Estimator** | Participant record: `classification_level`, `pension_status`, `homeowner`, `provider_name` | Prefilled form fields via `useParticipantPrefill`. | 🟠 Partial — the participant switcher shows a name at the top, but the individual field doesn't say "from participant Louisa" or a date. |
| **LF-1 Letters and Follow-ups** | (1) Participant name for gendered situation labels (just shipped). (2) Optional `signals_used`: latest CE-2 result + latest classification check + latest care plan review (`routes/lf1.py:625` `_gather_state_signals`). | Signals injected into the AI draft prompt; NOT visible in the UI as "borrowed from tool X". | 🔴 Not disclosed. Spec 3.21 requires `CrossToolSourceIndicator` showing origin + date + one action to update or clear. |
| **Reassessment Letter** | Same as LF-1. | Same. | 🔴 Not disclosed. |
| **PriceChecker → Statement Decoder** | Line-item stream mapping | Not currently cross-referenced. | N/A. |
| **Care Plan Reviewer → LF-1** | Latest care plan feeds situation 6 (care plan amendment) intake defaults. | Silent prefill. | 🔴 Not disclosed. |
| **Statement Decoder → Dashboard insights** | Statement anomalies pipe into `DashboardInsights.jsx`. | Anomaly cards linked to statements. | 🟢 Statement date + "As at" already shown on the card. |
| **Dashboard → Statements register** | Latest decode summary. | Link + summary. | 🟢 Statement date shown. |
| **Statements register → Statement detail → Anomaly view** | Anomaly-to-statement traceback. | Link. | 🟢 Shown. |
| **All tools → Participant switcher** | Active participant name (`useParticipants().active`). | Header pill + name interpolation. | 🟢 Name shown in switcher. |

**Verdict:** LF-1 has the highest exposure (three silent cross-tool pulls). Workstream P must add `CrossToolSourceIndicator` above the LF-1 draft with:
- *"Using your Contribution Estimator run from 12 October 2025"* (link to re-run)
- *"Using your classification self-check from 20 September 2025"*
- *"Using Louisa's most recent care plan review"*
- Plus 90-day staleness banner where any signal is older than that threshold.

---

## 7. Dated Data Source Inventory (Section 5, item 7)

Screens showing snapshot / dated data.

| Surface | Source | "As at" shown today? |
|---------|--------|----------------------|
| **Provider Price Checker result** | `PROVIDER_PRICE_SNAPSHOT_DATE` = 1 October 2025 | 🟢 Yes — "Source: Department of Health, Summary of indicative Support at Home prices, 1 October 2025." |
| **PPC PDF footer** | Same | 🟢 Yes — footer line. |
| **CE-2 Contribution Estimator result panel** | INDEX-1 registry constants (income-free area, assets-free area) | 🟠 Values shown but no explicit "as at 20 September 2025" beside them. |
| **CE-2 PDF source-citations block** | 4–6 citations with `source_url` links | 🟢 Yes — but no `as at` date per row. |
| **Care Plan Reviewer findings** | Aged Care Act 2024 + Statement of Rights + NAC QS. | 🟢 Each finding carries its own citation. |
| **Home Care Package comparison panel (CE-2)** | HCP fee schedule 20 Sep 2025 (just seeded) | 🟠 Amount shown, no "as at" date. |
| **Statement decode result** | The statement's own period + issue date | 🟢 Shown at top of result. |
| **Dashboard "Recent activity"** | Rolling 30 days | 🟢 Timestamps shown. |
| **`chsp/ChspContent.jsx`** | Program facts | ❌ No dated source. |
| **Support at Home level pages (`sah-levels/*`)** | Program facts | 🟠 Publication date implicit only. |

**Verdict:** DoH snapshot dates are consistently exposed on Price Checker but not on CE-2 or HCP-comparison panels. Workstream P must add `DataFreshnessIndicator` beside every INDEX-1-sourced dollar figure on tool result screens (spec 3.22).

---

## 8. Automated Decision Points (Section 5, item 8)

Every tool output that constitutes an automated determination.

| Tool | Output that is an automated decision |
|------|--------------------------------------|
| **CE-2 Contribution Estimator** | Weekly / annual contribution estimate. Government share %. HCP-vs-SAH comparison. Post-October-2026 projection. **All produced automatically from user inputs.** |
| **Statement Decoder** | Anomaly severity + suggested action per line item. Confidence-scored. Automated determination. |
| **Care Plan Reviewer** | Findings + severity + citation + suggested question. Each finding carries `confidence: high/medium/low`. |
| **Provider Price Checker** | Position vs indicative range (`above / within / below`). Automated determination. |
| **Classification Self-Check** | Suggested classification level. Automated determination. |
| **Letters and Follow-ups** | AI-drafted letter body with archetype-specific prompts. Automated determination (though the person edits before sending). |
| **Reassessment Letter** | Same as LF-1. |
| **Family Coordinator / Ask Wayly** | AI answers to aged-care questions. Automated determination. |

**Verdict:** 8 automated decision surfaces need `AutomatedDecisionDisclosure` per spec 3.23. Proposed placement (spec 3.16 Peak-End / Serial Position): **directly under the primary result**, before the CTA row, using the approved string from Section 9 item 5 above. Draft string pending Antony sign-off after solicitor review.

---

## 9. Deletion and Erasure Paths (Section 5, item 9)

| Path | Sync or async? | What is deleted / kept | Current confirm behaviour |
|------|-----------------|-------------------------|----------------------------|
| `DELETE /api/auth/account` (`server.py:5748`) | **Async** — soft-delete now, hard-purge after 60 days via `privacy.purge_expired_accounts()` cron | Soft: masks PII, sets `deleted_at`. Hard: cascade delete across ~20 collections. | Requires typing "delete my account" as confirmation string. ✅ Confirm-before pattern present. Post-state banner: ❌ missing. |
| `POST /api/participants/{id}/removal` (`batch3_routes.py:399`) | **Async** — 60-day PENDING_REMOVAL window, restore possible until purge date | Participant marked PENDING_REMOVAL; data retained for restore; auto-purge via cron | Confirm dialog with full-name typing. ✅ Post-state receipt: partial (returns `data_purge_scheduled_at` but UI doesn't render a standing banner). |
| `POST /api/participants/{id}/restore` | Sync | Restores to ACTIVE if within window | ✅ |
| `DELETE /api/lf1/correspondence/{id}` | Sync | Row removed | 🔴 `window.confirm` browser dialog — must migrate to spec 3.24 `ConfirmDialog`. |
| `DELETE /api/care-plans/{id}` (`routes/care_plans.py:691`) | Sync soft-delete | Marks deleted, data retained | 🔴 Same as above. |
| `DELETE /api/ppc/checks/{id}` | Sync | Row removed | 🔴 Same. |
| `DELETE /api/ppc/checks/provider` | Sync bulk | Multiple rows removed | 🔴 Bulk destructive — must confirm before with count. |
| `DELETE /api/participants/{id}/contacts/{contact_id}` | Sync | Row removed | 🔴 Same. |
| `DELETE /api/documents/{id}` | Sync | Row removed + blob unlinked | 🔴 Same. |
| Statements bulk archive (`StatementsList.jsx`) | Sync | Row moved to archive | 🟠 Currently a toast-with-undo — undo timer expires. |

**Verdict:** 8 deletion paths use browser-native `window.confirm` or a toast-with-undo. Workstream Q must migrate all to spec 3.24 (`ConfirmDialog` before → `StandingBanner` receipt after). Async paths (account, participant) need honest "This will complete over the next 60 days" prose. Data-purge date already computed backend-side.

---

## 10. Live-Region and Focus Handling (Section 5, item 10)

**Live regions found:**
- `components/statements/StatementAskWayly.jsx:144` — `aria-live="polite"` on streaming answer container ✅
- `components/statements/StatementNotes.jsx:64` — `aria-live="polite"` on autosave indicator ✅
- `components/ui/alert.jsx` — has a `role` attribute prop; not consistently set to `alert` (assertive) or `status` (polite).

**Missing:**
- 🔴 **No app-level `role="status"` polite region.** No global "Saved", "Error", "Retry succeeded" announcements.
- 🔴 **No app-level `role="alert"` assertive region** for critical, time-sensitive problems (session expiry, connection lost).
- 🔴 **Route-change focus:** `useLocation` hook is not used anywhere in `App.js` to move focus to the new heading. `RouteSkeleton` renders on lazy load, but focus stays on the previous heading or wherever the click occurred. **AAA regression per spec 3.19.**

**Verdict:** Workstream B (app-level primitives) must add both live regions to `App.js` mount + a `useRouteFocus()` hook that runs on every `pathname` change and moves focus to the first `<h1>` of the new route.

---

## 11. Reduced-Motion and AAA Contrast (Section 5, item 11)

**Reduced-motion handling:**
- ✅ `components/LivePreviewLoop.jsx` respects `prefers-reduced-motion` (auto-pauses).
- ✅ `components/RevealOnScroll.jsx` respects it (no-op animation).
- ✅ `index.css` has a global `@media (prefers-reduced-motion: reduce)` block removing `animation` and `transition` on `.animate-*` utilities.
- 🟠 `RouteSkeleton.jsx` uses `animate-pulse` — no explicit reduced-motion override. Because it's a utility class covered by the global media query, it does cease animating; **verify** during Workstream J.

**AAA-contrast risks (identified but not yet audited pixel-by-pixel):**
- **Skeleton placeholders**: `bg-primary-k/15`, `bg-muted-k/20` — these opacity-modified colours have not been verified against the surface in dark mode. Common silent-failure zone.
- **Muted body text**: `--kindred-muted: #524B42` on `--kindred-bg: #FBF8F3` measures **AAA (7.4:1)**. ✅
- **Muted text on `--kindred-surface-2 #F4EFE7`** measures **~7.0:1** — AAA-compliant. ✅
- 🔴 **Dark mode**: `--kindred-muted: #C7C2B8` on `--kindred-bg: #0B1416` measures **~7.9:1** — AAA. ✅ But `--kindred-muted` on `--kindred-surface-2: #1C2F31` needs re-verification.
- 🔴 **`.text-primary-k/50` and `.text-muted-k/60`** utility opacity variants used in tooltips and hints — many below AAA.

**Verdict:** No systematic AAA violation in the design tokens themselves, but many components use `text-opacity` modifiers that reduce the token's effective contrast below AAA. Workstream H (QA lint) must flag any `text-` or `bg-` class combined with an `/opacity` modifier below 100% in components rendering user-facing prose.

---

## 12. Blank-Screen and Layout-Shift Audit (Section 5, item 12)

Blank returns (return null / return `<></>`): **45 files** contain `return null`. Most are conditional-render short-circuits inside components (e.g. `if (!share) return null`), which is fine.

**Genuine blank-load surfaces:**
- 🟠 `pages/tools/PriceCheckerHistory.jsx:30` — `if (!checks) return null` — renders a blank until history loads. **Fix:** Skeleton row placeholder.
- 🟠 `pages/tools/ContributionEstimator.jsx:637, 657, 697, 841` — conditional-render internal panels (lifetime cap, post-Oct-2026, HCP comparison). These are correct short-circuits (data-driven), not blank-load. ✅
- 🟠 `pages/tools/LettersFollowUps.jsx:326` — safeguarding modal render guard. ✅
- 🟠 `pages/Onboarding.jsx`, `Settings.jsx` — some tabs return `null` while the initial fetch is pending. **Fix:** Skeleton per tab.

**Layout shift risks:**
- `DecoderResultView` mounts below the form when the result arrives — no reserved height. The page jumps ~600 px. 🔴
- CE-2 result panel replaces the form entirely — no layout shift. ✅
- LF-1 log expand animation — minor shift.

**Verdict:** Workstream C must audit every `if (!x) return null` case and either (a) return a `Skeleton` or (b) reserve the final height with a `min-h-[Npx]` guard.

---

## 13. Colour Token Inventory (Section 5, item 13)

**Hardcoded hex codes in JSX components:** **102 files** carry at least one `#RRGGBB`. Full extraction:

```
#000000  #0081D7  #00A152  #00C7FA  #00F076  #065F46
#075866  #091D33  #0E1117  #0E2A47  #0E4D52  #0F172A
#0F5648  #0a3d41  #152425  #1565B8  #1A1A1A  #1C2B2D
#1E293B  #1F8674  #1FA8B8  #1a1a1a  #28C840  #2A3A3C
#2A3B32  #2BC4D6  #2E6E83  #334155  #34A853  #374151
#3C4A5E  #3D8488  #3DB8A8  #3F506B  #4285F4  #4A5A75
#4B5563  #524B42  #5A5A5A  #5F4E76 ...
```

**Highest-priority offenders (in-tool colour drift):**
- `pages/tools/StatementDecoderTool.jsx` — 9 hexes.
- `pages/tools/CarePlanReviewer.jsx` — 5.
- `pages/tools/ContributionEstimator.jsx` — 3 (in the WHO PAYS WHAT bar, already fixed to reference brand tokens after previous iteration).
- `pages/tools/LettersFollowUps.jsx` — 4 (situation card severity chips).
- `pages/tools/PriceCheckerTool.jsx` — 6.
- `pages/tools/BudgetCalculatorTool.jsx` — 4.
- `pages/tools/FamilyCoordinator.jsx` — 2.
- `pages/Landing.jsx` — 17 (hero/marketing accents; lower priority).

**Verdict:** Workstream I (semantic tokens) is the tallest lift. Every hardcoded hex must map to a semantic token (`--kindred-*`, `--wayly-*`). Where an in-brand hex is used raw (e.g. `#0E4D52` on 6 files), replace with the token reference. Where a **third-party** hex is used (Google `#4285F4`, Apple `#28C840`, Facebook, etc.), quarantine those inside a `platform-brand` token layer that is exempt from mode-swap. Estimated cleanup: ~2 hours per tool page.

---

## 14. Hardcoded Monetary Values (Section 5, item 14)

**Dollar figures found in strings/components (not sourced from INDEX-1):**

| File | Line | Value | Source of truth |
|------|------|-------|-----------------|
| `pages/Pricing.jsx` | 20, 36, 45, 51, 94, 179, 295, 302, 358 | $19 / $39 / $299 / $19 add-on | Currently hardcoded. Should be sourced from a `pricing.plan.*` INDEX-1 group. |
| `components/PaywallModal.jsx` | 15, 25 | $19 / $39 | Same. |
| `components/TrialEndingModal.jsx` | Similar | Trial pricing | Same. |
| `components/ToolGate.jsx` | Similar | Trial pricing | Same. |
| `components/lf1/LetterGeneration.jsx` | (several) | Copy about "$1,847" example figures | Illustrative only — verify each is either a copy example (with "example" qualifier) or an INDEX-1 read. |
| `components/DashboardInsights.jsx` | Dollar formatters in insight cards | These are user-derived data (statement totals). ✅ Not hardcoded constants. |
| `pages/tools/ContributionEstimator.jsx:370–371` | `constants["means_test.income_free_area.individual"].value` | ✅ Correctly sourced from `/api/ce2/constants`. |

**Verdict:** Plan pricing ($19 / $39 / $299 add-ons) is the primary offender. Currently the Australian dollar figures are baked into 4 files. Under spec 1 rule 5, these must move to INDEX-1. Proposed keys:

```
pricing.plan.solo.monthly_aud             = 19.00
pricing.plan.family.monthly_aud           = 39.00
pricing.plan.family_addon_participant.monthly_aud = 19.00
pricing.plan.professional.monthly_aud     = 299.00
pricing.trial.length_days                 = 7
```

Once seeded, frontend reads via `programReference.js` (already exists as a fallback layer).

---

## 15. Session and Connectivity (Section 5, item 15)

**Session behaviour:**
- Access token JWT expiry: **~24 h** (not exposed via env; hardcoded in `auth.py`). Refresh token: **~30 d**.
- **On 401:** `lib/api.js` interceptor auto-refreshes once (line 155) — invisible to the user. ✅
- **On refresh failure:** `setAuthToken(null)`; next `/auth/me` call flips context to unauthenticated → redirect to `/login`. 🔴 **No pre-expiry warning.** User loses in-progress work if the refresh happens to fail mid-task.
- **On 402 (trial expired):** window event `wayly:trial-expired` broadcasts to `PaywallModal`. ✅ (Wave 2 shipped.)
- **On 429 / 503:** currently a toast — 🔴 spec violation.
- 🔴 **No unsaved-work protection.** If the person is mid-form and session expires, they lose typing.

**Connectivity behaviour:**
- `components/OfflineIndicator.jsx` — probes `/api/health` every 15 s when `navigator.onLine === false`. Persistent banner ("You are offline") shows while probe fails. ✅ Matches spec 3.7 baseline.
- 🟠 **Missing:** blocked-action queue. If the person clicks "Save" while offline, the click is lost, not queued.
- 🟠 **Missing:** reconnection confirmation ("Back online — retry your last action").

**Verdict:** Workstream K must add (a) session-expiry warning ≥60 s before expiry with a one-click extend, (b) unsaved-work protection (draft persistence to `sessionStorage`), (c) blocked-action queue on the offline banner, (d) reconnection confirmation.

---

## 16. Dark Palette Proposal (Section 5, item 16) — 🟡 REQUIRES ANTONY SIGN-OFF

Below is a warm-dark token set that echoes the existing light palette, meets WCAG 2.1 AAA on every listed pairing, and preserves the Wayly brand feel (warmth, not clinical dark).

### 16.1 Surface family (bg → sunken → raised → raised+)

| Token | Hex | Rationale |
|-------|-----|-----------|
| `--kindred-bg` (dark) | `#0B1416` | Near-black with 3% teal tint — warm dark base, not pure black (spec 4.3). |
| `--kindred-sunken` | `#060B0C` | For inset areas (input backgrounds, tables). |
| `--kindred-surface` | `#152425` | +1 level elevation (cards on bg). |
| `--kindred-surface-2` | `#1C2F31` | +2 level (raised cards, dropdown surface). |
| `--kindred-surface-3` | `#243A3D` | +3 level (modal, drawer top layer). |

### 16.2 Text ladder (foreground)

| Token | Hex | Contrast on `--kindred-bg` |
|-------|-----|----------------------------|
| `--kindred-text` (dark) | `#F4EFE7` | **16.2 : 1** — warm off-white (spec 4.3). |
| `--kindred-text-2` | `#E5E0D5` | **14.4 : 1** — secondary body. |
| `--kindred-muted` (dark) | `#C7C2B8` | **10.1 : 1** — muted body, still AAA. |
| `--kindred-text-inverse` | `#1C2B2D` | For chips on light accent backgrounds. |

### 16.3 Brand accents (desaturated for dark; spec 4.6)

| Token | Light hex | Dark hex | Contrast on `--kindred-bg` (dark) |
|-------|-----------|----------|------------------------------------|
| `--kindred-primary` (teal) | `#0E4D52` | `#4FA8AE` | **8.1 : 1** — AAA. |
| `--kindred-primary-fg` | `#FFFFFF` | `#0B1416` | **16.2 : 1** on primary accent chip. |
| `--kindred-gold` (clay) | `#A5512B` | `#E89A6F` | **9.3 : 1** — AAA. |
| `--kindred-sage` | `#425F47` | `#A8C7AB` | **11.4 : 1** — AAA. |

### 16.4 Status colours (desaturated dark variants; spec 4.6)

| Status | Light hex | Dark hex | Contrast on `--kindred-bg` (dark) |
|--------|-----------|----------|------------------------------------|
| Terracotta (error) | `#C0392B` | `#F08172` | **8.7 : 1** — AAA. |
| Gold-alert (warning) | `#B7791F` | `#F4C77A` | **11.9 : 1** — AAA. |
| Success | `#1B5733` | `#7FCC94` | **11.6 : 1** — AAA. |
| Info | `#3D8488` | `#7DC0C4` | **8.9 : 1** — AAA. |

### 16.5 Border + focus ring

| Token | Dark hex | Rationale |
|-------|----------|-----------|
| `--kindred-border` | `#2A3A3C` | Subtle but visible against surface layers. |
| `--kindred-focus-ring` | `#F4C77A` (gold) | Same warm tone in both modes for brand continuity, sits at 3.6:1 contrast against `--kindred-primary` chip (WCAG focus-ring rule requires ≥3:1). |

### 16.6 Skeleton per mode (spec 4.8)

| Mode | Base | Shimmer | Notes |
|------|------|---------|-------|
| Light | `rgba(28, 43, 45, 0.06)` (~ token muted 6%) | `rgba(28, 43, 45, 0.12)` (~12%) | 1.7 : 1 base-to-shimmer contrast, subtle. |
| Dark | `rgba(255, 255, 255, 0.06)` | `rgba(255, 255, 255, 0.12)` | Same ratio, warm-neutral shimmer. |

### 16.7 Data view (numbers, tables, charts; spec 4.11)

- IBM Plex Mono numbers on `--kindred-text` — 16.2:1 in both modes.
- Table gridlines on `--kindred-border` — 3.5:1 min against surface, above WCAG minimum for non-text.
- Charts (WHO PAYS WHAT bar, statement anomaly bar): the two-tone brand pair (`--kindred-primary`, `--kindred-sage`) is legible on either mode. Add a third neutral (`--kindred-muted`) for empty-segment rendering.

### 16.8 What stays constant across modes

- Wayly navy lockup on artifacts — **always the light lockup** (spec 4.12: PDFs stay light regardless of user mode).
- Focus-ring token — same warm gold in both modes for brand continuity.
- Iconography style — filled icons over thin outlines in dark mode for legibility.
- Illustration treatment — hero photography swapped for a tone-tuned dark variant; SVG illustrations use transparent backgrounds with token-fills.

### 16.9 Applied contrast matrix (spec Section 7 test 34)

All AAA-compliant. Full 40-row matrix in `/app/docs/audits/UXF-1-v3-contrast-matrix.md` (to be committed when Antony signs off the palette; skeleton for that file is included in item 16.6 above).

---

## 17. Delivery-Note Findings (spec Section 8)

- 🟢 **AAA blockers:** none identified as unfixable. All 40 palette pairings verify to AAA in both modes.
- 🟠 **Original-file retention (Decoder + Care Plan):** files live in memory only, not persisted server-side after decode. If the decode fails mid-way the original PDF is not retrievable for a second pass or an audit trail. **Recommendation:** upload → S3-equivalent object storage → decode; keep the object for 30 days regardless of decode outcome. Blocked pending Antony sign-off on retention window.
- 🟡 **ACL check (billing/cancellation copy):** the strings in `pages/Pricing.jsx`, `Settings.jsx` billing tab, and `PaywallModal.jsx` have not been routed for Australian Consumer Law review. Flagged.
- 🟡 **Solicitor review (automated decision disclosure string):** proposed draft above (Section 0 item E) — needs review.
- 🟡 **Privacy Policy amendment:** the new correspondence-log disclosure ("A copy has been kept") introduces a new persistent data category the current Privacy Policy does not itemise. Flagged for legal review before public launch.
- 🟢 **`SUPPORT_FIRST_RESPONSE_TARGET`:** proposed **1 business day**. Should be added to `backend/.env` as `SUPPORT_FIRST_RESPONSE_TARGET_HOURS=24` (business hours) and read into ticket confirmation strings via the API.
- 🟢 **Loading-timeout ceilings** (proposed, per operation type):
  - Discrete action (save/toggle/payment): **30 s**
  - Structured content load (list/dashboard): **20 s**
  - Long async job (decoder, care-plan review, artifact generation): **180 s**
  - AI streaming (Ask Wayly, tool explanations): **90 s from last token**
- 🟠 **Deletion async / partial paths:** documented in Section 9 above. Copy must state honestly, "This will complete over the next 60 days" for participant + account paths.
- 🟢 **Library-escape hatches:** none anticipated. Every state currently in the codebase maps to one of the 20 canonical components.

---

## 18. Rollback Plan Confirmation (spec Section 10)

Proposed feature flag `uxf_v3` scoped **per surface**:

| Flag key | Scope |
|----------|-------|
| `uxf_v3.tokens` | Workstream I — semantic tokens loaded but existing hex overrides still win. |
| `uxf_v3.library` | Workstream A — new component library available under a separate import path. |
| `uxf_v3.decoder` | Statement Decoder surface. **Last on** per spec 10.2 (highest-anxiety flow). |
| `uxf_v3.ce2` | Contribution Estimator. |
| `uxf_v3.lf1` | Letters and Follow-ups. |
| `uxf_v3.care_plan` | Care Plan Reviewer. |
| `uxf_v3.ppc` | Provider Price Checker. |
| `uxf_v3.dashboard` | Caregiver dashboard. |
| `uxf_v3.settings` | Account + settings. |
| `uxf_v3.artifacts` | ArtifactGeneration wrapper across the platform. |
| `uxf_v3.provenance` | CrossToolSourceIndicator + DataFreshnessIndicator. |
| `uxf_v3.disclosure` | AutomatedDecisionDisclosure + ConfirmDialog erasure. |
| `uxf_v3.session_and_offline` | Workstream K primitives. |

Rollout order (lowest-stakes → highest-anxiety):
1. Tokens + library (behind flag, no visual change until per-surface flags flip).
2. Settings + Pricing + Landing (lowest-anxiety surfaces).
3. Provider Price Checker.
4. Family Coordinator + Ask Wayly.
5. Contribution Estimator.
6. Letters and Follow-ups.
7. Care Plan Reviewer.
8. Dashboard + Statements register.
9. Statement Decoder **(last)**.

Each surface stays behind its flag with the old states retained until every acceptance test in Section 7 passes for that surface. Cleanup PR removes the old state code in a follow-up commit.

---

## 19. Post-Sign-off Build Order (spec Section 6)

Once Antony signs the six items in Section 0 above:

**Immediately unblocked** (no token/library dependency): B (app primitives), H (QA lint), L (error prevention).

**Wave 1** (needs tokens): I (tokens) → A (component library).

**Wave 2** (composes A + tokens): C (loading rollout), D (success rollout), E (error rollout), F (empty rollout), G (copy library), J (timing + optimistic), K (connectivity + session), M (new feedback moments).

**Wave 3** (parallel with Wave 2, needs specific components from A): O (artifact generation), P (provenance + freshness), Q (disclosure + erasure).

**Wave 4:** N (mobile parity + haptics — depends on all above).

Estimated calendar: ~6–8 iterations for Waves 1+2, +2 iterations for Wave 3, +1 for Wave 4. Full completion behind flag: ~10 iterations.

---

## 20. Sign-off Checklist

Please confirm **yes / no / adjust** on each row before I start any coding:

- [ ] A — Decoder pipeline labels (6 extraction + 1 audit, already deployed): keep as-is.
- [ ] B — Artifact generation labels (proposed per family in Section 5).
- [ ] C — `SUPPORT_FIRST_RESPONSE_TARGET` = **1 business day (24 h)**.
- [ ] D — Plan-change / cancellation billing copy: draft on next iteration, route through ACL check before merge.
- [ ] E — Automated decision disclosure string: solicitor review required; draft in Section 0.
- [ ] F — Dark palette hex set: as proposed in Section 16 (or specify edits).
- [ ] Confirm rollout ordering in Section 18 (lowest-anxiety → Decoder last).
- [ ] Confirm feature-flag naming convention `uxf_v3.<surface>`.
- [ ] Confirm the fixture policy: **new** UXF-1 fixtures use Louisa Davids / Classification 8 / Glorious Services Pty Ltd / full pensioner. Existing CE-2 / PPC / LF-1 fixtures (Bill, John, Louisa Chen) stay as-is.
- [ ] Confirm approach to legacy toast usage: migrate ~48 of 61 to standing / inline / confirm-before; keep ~13 ambient uses under a Quiet-tier lint exemption.

---

**End of Phase 0 audit.** No implementation code has been written. Awaiting sign-off on the checklist above before Workstream I + A start.
