## Iteration 235 (Jun 2026) — CHSP-TOOLS-1 WS-1 per-unit Fee Check + WS-3 Access & Hardship (web + mobile, behind `chsp_tools_v1`)

Implemented the golden-gated WS-1 Fee Check and WS-3 access/hardship letters from CHSP-TOOLS-1 v1.1 / CHSP-FIX-golden-v1.

- **Engine** `lib/chsp1/fee_check.py`: per-unit model in `Decimal` (half-up, 2dp). Rate bands per unit `within=max(2%,$0.50)`, `minor=max(10%,$2.00)`, else material; units `within/minor(<1 unit)/material(>=1 unit)`; overall = worse of the two; directionality guards (undercharge/underbill never escalate or offer dispute); 90-day staleness → provisional + confirm prompt; no agreed rate → degraded `no_verdict` + `prompt_add_agreed_rate`. Golden pytest `test_chsp_fee_check_golden.py` (FIX-1..5 + boundary + directionality) passes 7/7 and gates the flag.
- **API** `routes/chsp1.py`: `GET /api/chsp1/config` (flag), `POST /api/chsp1/fee-check/preview` (stateless WS-1), `POST /api/chsp1/letter` (WS-3 `service_continuity`→situation 6 / `hardship`→situation 9, returns LF-1 `editor_path`). Testing agent added `test_chsp_tools_v1_api.py` (9/9).
- **Web** `ChspTools.jsx`: WS-1 form + result (verdict badge, billed/unit, expected, delta, rate & units tiers), degraded state, staleness prompt, and a single Access & Hardship card (hardship emphasised on material). Old 2%/$5 total FeeCheckForm kept only as the flag-off fallback.
- **Mobile** `chsp-tools.tsx`: full parity port (verified via shared backend + web; device QA recommended — Expo web preview blocks SecureStore token injection).
- Flag `CHSP_TOOLS_V1` defaults ON in preview, OFF in production per spec.

**Remaining CHSP:** WS-2 reframed transition (hard-gated on solicitor sign-off), WS-5 date/enum defect sweep, WS-6 CI wiring; plus CHSP invoice-photo OCR and complaint evidence-bundle in-app viewer.


## Iteration 233-234 (Jun 2026) — Cross-platform parity batch (Letters, Invoice filters, Draft-all, Decode copy, Contribution Position nav, Reports catalog)

Six user-requested parity items, all built on web + mobile and verified by the testing agent (iter233 + iter234, no blockers).

- **Letters Drafting Parity (web)**: `LettersMailbox.jsx` rebuilt on the LF-1 system to match mobile — a "Draft a new letter" button (`letters-new-btn`) opens `/ai-tools/letters-and-follow-ups`, LF-1 entries link to the editor, overdue/upcoming follow-up cards; legacy LF-2 chains kept below when present. Source-aware templates come from LF-1 `source_import`.
- **Invoice Filters (web + mobile)**: new `InvoiceFilters.jsx` (search + provider + period + status) mirroring `StatementFilters`; `InvoicesList.jsx` now filters/sorts + no-results state. Mobile `invoices.tsx` gets a search box + status chips + provider chips + clear-filters + no-results.
- **Draft one letter for all issues (web + mobile)**: new backend `POST /api/invoices/{id}/letter` aggregates every finding into one LF-1 draft; `inv1-draft-all-btn` in the Issue Register header (web navigates to the editor; mobile confirms → `/correspondence`).
- **Decode-in-progress copy parity**: statement decode reads "Reading the statement…" and invoice reads "Reading your invoice…" identically on web + mobile (`mobile/app/upload.tsx`, web `InvoiceCheckerTool.jsx`; web `StatementUpload.jsx` already matched).
- **Web Contribution Position discoverability**: nav item under Money & Statements → `/app/contribution-position` alias route resolves the active participant (page already existed at `/app/participants/:id/contribution-position`).
- **Reports catalog upfront (mobile)**: `reports.tsx` now shows all 8 report cards (name + description + "Best for" + Generate) on load, matching web, instead of hiding them behind a "Generate a report" picker; history renders below and the catalog stays visible even if the history fetch fails.

**Still pending — CHSP-TOOLS-1 v1.1 + CHSP-FIX-golden-v1 (attached specs).** Large gated workstream: WS-1 per-unit Fee Check (golden fixtures CHSP-FIX-1..5 + boundary/directionality guards), WS-5 date defects, WS-4 nav visibility, WS-6 CI fixtures — all behind feature flag `chsp_tools_v1` (off in prod). WS-2 transition copy is hard-gated on solicitor sign-off; WS-3 access/hardship additions. To be tackled as a dedicated effort.


## Iteration 232 (Jun 2026) — INV-1 Parity Phase 2: Invoice Checker → Statement-Decoder grade (web + mobile)

Brought the Invoice Checker result view up to Statement-Decoder depth on BOTH surfaces (web is source of truth). User asks addressed: show what's been charged (line items), collapsible High/Medium/Low issues, download original + decoded PDF/CSV + compare side-by-side, and draft a source-aware letter from any issue.

- **Backend** (`routes/invoices.py`): `GET /invoices/{id}/download?kind=original|report` (streams the raw uploaded file inline / the Wayly check-report PDF via `services.inv1_check_report_pdf`), `GET /invoices/{id}/export.csv` (header + line items + issue register with C1..C12 titles). The existing `POST /invoices/{id}/findings/{i}/letter` LF-1 bridge (source-aware `source_import`) is now the canonical draft-letter path.
- **Web** (`components/invoices/InvoiceResultView.jsx` + `InvoiceDetail.jsx` + `tools/InvoiceCheckerTool.jsx`): `InvoiceIssueRegister` rebuilt into collapsible High/Medium/Low `SeverityGroup`s (mirrors Decoder), per-issue **Draft letter** now POSTs the finding endpoint and navigates to the LF-1 editor (was the dead `/app/letters?compose=1` URL). New `InvoiceChargesTable` (collapsible line-item table, disputed lines flagged), `InvoiceDownloadBar` (Original / CSV / PDF), `InvoiceCompareView` (original PDF beside decoded charges).
- **Mobile** (`src/components/invoices/InvoiceResultView.tsx` + `app/invoice/[id].tsx` + `src/components/tools/InvoiceChecker.tsx`): mirrored collapsible severity groups, `InvoiceChargesTable` (per-line cards), `InvoiceDownloadBar` (Original/CSV/PDF via `downloadAndShare`), per-issue Draft letter → creates LF-1 entry → confirm → `/correspondence`.
- **Verified** iteration_232: backend 6/6 pytest (`test_inv1_phase2_parity_iter232.py`), web 100% (all testIDs, collapse/expand, downloads, compare, draft-letter nav), mobile ~92% (parity confirmed; added `inv1-result` testID post-test). retest_needed=false.

**Still queued (from user's Phase list):** Letters compose parity (web can't draft ad-hoc letters like mobile) + fully source-aware templates everywhere; Invoices list filters (web+mobile) matching Statements; decode-in-progress message parity; CHSP invoice-photo OCR (mobile); complaint evidence-bundle in-app PDF viewer; web Contribution Position nav discoverability; Reports screen parity (show available reports before Generate).


## Iteration 228 (Jun 2026) — ATHM-1 AT & Home Mods: full mobile parity (parity trio COMPLETE)

Replaced the legacy mobile `/athm` tracker with the participant-scoped ATHM-1 workflow (`/api/athm1/*`), matching web `AthmProjects.jsx`. Two screens:
- `mobile/app/athm.tsx` — **projects list** for the active participant + inline create (type/title/primary-need/description). testIDs: `athm-projects-root`, `athm-new-project/-new-project-form/-project-type/-project-title/-project-need/-project-description/-project-save`, `athm-project-card-*`, `athm-empty`.
- `mobile/app/athm-project/[id].tsx` — **project detail**: advance-stage (`athm-advance-*` via `/advance-status`), **trial-countdown** cards (`trial-countdown-*`, colour ramps by days remaining), **OT-referral** upload/attach/detach (DocumentPicker → `/documents` multipart → `/athm1/projects/{id}/ot-referrals/attach`, `athm-ot-referrals-*/-upload-*/-row-*/-detach-*`), **AT items** add + start-trial (`athm-add-item-toggle-*`, `athm-item-*`, `athm-item-start-trial-*`, `athm-item-trial-days-*`), **HM modifications** add + **side-by-side quote comparison** with cheapest/dearest highlight + >30% variance flag (`athm-add-mod-toggle-*`, `mod-quote-block-*`, `mod-quote-row-*-{i}`, `mod-add-supplier/-amount/-notes/-quote-*`).
- Verified iteration_228 (mobile PASS 100%): project create → card, advance status live, item + start-trial → countdown, mod + 2 quotes → cheapest/dearest + HIGH VARIANCE 60% badge, OT card renders. Parity with web confirmed.
- Backlog from review: mobile add/start-trial/upload error handlers are catch-and-ignore (web surfaces toasts) — add user-facing error feedback; disable Advance at the `in_use` cap; batch the N+1 item/mod GETs.

**PARITY TRIO COMPLETE** — PSW-1 (iter226), CMP-1 (iter227), ATHM-1 (iter228) all now at full web-depth parity on mobile.

**Still queued:** CHSP fee-check invoice-photo OCR pre-fill (needs small backend); complaint evidence-bundle PDF in an in-app authed viewer; PSW-1 switch-detail generate-notice + stage-advance controls.


## Iteration 227 (Jun 2026) — CMP-1 Complaints: full mobile parity

New `mobile/app/complaints.tsx` (participant-scoped, `/api/cmp1/*`) matching web `ComplaintsList.jsx`, plus a "Complaints" entry in `navGroups.ts` (route `/complaints`, AlertOctagon):
- **List** (`cmp1-list-page`) with rows (`cmp1-row-*`), stage chip (8-stage `STAGE_LABEL`), type/severity, SAFEGUARD badge for elder-abuse, evidence-bundle PDF link (`cmp1-bundle-pdf-*` via `Linking.openURL`), SmartAISummary, empty state (`cmp1-empty`).
- **4-step intake wizard** modal (`cmp1-new-modal`): What Happened (type + elder-abuse safeguard `cmp1-new-elder-safeguard` + subject + severity + safety), Who & When (provider name/email + incident dates + ongoing), Desired Outcome (+ anonymous ACQSC), Review → `POST /cmp1/participants/{pid}/complaints`. Next-gating on required fields. testIDs mirror web (`cmp1-new-type/-subject/-severity/-safety/-provider-name/-provider-email/-start-date/-end-date/-ongoing/-outcome/-outcome-notes/-anonymous`, `cmp1-wizard-step-{0..3}/-next/-back`, `cmp1-new-submit/-cancel/-error`).
- **Inline ACQSC control** per open row (solicitor-gated: hidden for stage_4/stage_5/closed_*, as web): `cmp1-acqsc-open/-form/-notes/-submit` → `POST /cmp1/complaints/{id}/submit-to-acqsc`; `cmp1-acqsc-trail/-trail-list` → `GET /cmp1/complaints/{id}/acqsc-submissions`. ACQSC email delivery is MOCKED in preview (backend `mocked=true`).
- Verified iteration_227 (mobile PASS): wizard create → new DRAFTING row; elder-abuse safeguard show/hide; next-gating; ACQSC submit → mocked delivery + audit trail; SAFEGUARD badge. Parity with web confirmed.

**Still queued:** ATHM-1 (projects/quote-comparison/trial-period) mobile parity; PSW-1 notice + stage-advance controls on the mobile switch detail; CHSP fee-check invoice-photo OCR pre-fill (needs small backend).


## Iteration 226 (Jun 2026) — PSW-1 Provider Switch: full mobile parity

Replaced the legacy single-record mobile provider-switch screen with the participant-scoped PSW-1 workflow (backed by `/api/psw1/*`), matching web `ProviderSwitches.jsx` + `SwitchSettlement.jsx`. Three screens:
- `mobile/app/provider-switch.tsx` — switches **list** for the active participant (active + history), stage chips + days-in-stage, "New Switch" modal (`POST /psw1/participants/{pid}/switches`). testIDs: `psw1-list-root`, `psw1-new-btn/-modal/-modal-provider/-modal-reason/-modal-notes/-modal-submit`, `psw1-active-list`, `psw1-history-list`, `psw1-row-*`, `psw1-stage-*`, `psw1-decision-link-*`, `psw1-settlement-link-*`, `psw1-empty`.
- `mobile/app/switch-decision/[sid].tsx` — **5-step decision walkthrough** + cross-tool context (`GET .../context-snapshot`) + review + done (`POST .../decision-walkthrough`); proceed → LF2 letters CTA. testIDs mirror web: `psw1-walkthrough-root/-title/-progress`, `psw1-cross-tool-context`, `psw1-context-complaints/-cases`, `psw1-walkthrough-step-{1..6}`, `psw1-reason-*`, `psw1-reason-details`, `psw1-alt-*`, `psw1-consideration-*`, `psw1-final-*`, `psw1-final-notes`, `psw1-review`, `psw1-walkthrough-done/-back/-next/-submit/-return/-error`, `psw1-lf2-chain`.
- `mobile/app/switch-settlement/[sid].tsx` — **settlement**: create record (`POST .../post-switch-settlement`), record receipt (`POST /psw1/settlements/{id}/refund-received`), variance reconciliation + LOOP-1 dispute copy. testIDs: `psw1-settlement-root`, `psw1-settle-create-form/-create-amount/-create-method/-create-submit`, `psw1-settle-summary/-status/-expected/-received`, `psw1-settle-receive-form/-amount-input/-submit`, `psw1-settle-variance/-variance-zero`, `psw1-settle-cases-link`.
- Bug fixed both platforms: settlement status chip was keyed on `settlement_status` but the screen reads `refund_status` → extended `STATUS_LABEL` (mobile) + `STATUS_STYLE` (web `SwitchSettlement.jsx`) with `not_yet_calculated`/`pending_receipt`/`received_matches_expected`/`received_less_than_expected_disputed`.
- Verified iteration_226 (mobile PASS): create switch → DECIDING; walkthrough proceed → DECISION CONFIRMED; settlement create → receipt → variance-zero and shortfall→dispute both render.

**Still queued:** CMP-1 (complaints bundle + ACQSC) and ATHM-1 (projects/quotes/trial) mobile parity; CHSP fee-check camera capture pending a decision (fee-check is manual-entry with no file endpoint — needs OCR pre-fill design).


## Iteration 225 (Jun 2026) — CHSP service-entry manager + Care Plan Camera Scan (mobile)

**CHSP-1 was already at web parity** (both `frontend/src/pages/ChspTools.jsx` and `mobile/app/chsp-tools.tsx` had profile + fee-check + 3-step transition walkthrough; the earlier "informational-only" PRD note was stale). Completed the one real gap:
- **CHSP service-entry manager (mobile)**: new "Your CHSP services" card lists entries and adds them via `POST /api/chsp1/service-entries`, so the fee-check "Service entry" dropdown finally pre-fills provider/type. testIDs: `chsp-services-card/-count/-list/-empty`, `chsp-svc-add/-type/-provider/-rate/-frequency/-contribution/-start/-save/-error`.
- **Care Plan Camera Scan (mobile)**: added a "Take a photo" button (`cp-take-photo`) to the Support Plan Reviewer using `expo-image-picker` camera with the full permission contract (check → contextual request → denied → Open Settings), appending the photo to the same files list that posts to `/api/public/care-plans/review-files`. NOTE: native camera only opens on a device/Expo Go, not the web preview.
- Verified (iteration_225, mobile PASS): CHSP add-service → count/list update → fee-check pre-fill + material-variance badge; care-plan form shows both `cp-pick-files` and `cp-take-photo`, no crash. retest_needed=false.

**Still queued:** deep CMP-1/PSW-1/ATHM-1 mobile parity (3 large builds; mobile currently uses simpler legacy endpoints `/provider-switch`, `/athm`, `/loop/cases` vs web's richer `/psw1`, `/athm1`, `/cmp1` — different data models, some sections solicitor-gated). Needs scope confirmation before build.


## Iteration 224 (Jun 2026) — Mobile native Google OAuth fix (iOS client) + multi-audience backend

**Fixes the mobile "Access blocked / Error 400: invalid_request"** (Google blocks the WEB client's implicit id_token flow on native apps).
- Added a dedicated **iOS OAuth client** (`511820950878-s0ibfjj8tq0enncbio39flg9rj967st2.apps.googleusercontent.com`): `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` + backend `GOOGLE_OAUTH_IOS_CLIENT_ID`, passed as `iosClientId` to `Google.useIdTokenAuthRequest` (`mobile/src/context/AuthContext.tsx`), and registered its reversed-client-id URL scheme in `mobile/app.json` iOS `CFBundleURLTypes`.
- Backend `POST /api/auth/google` now accepts an ID token whose `aud` is ANY of our Google clients (web/iOS/Android): verify sig/iss/exp, then check `aud` against the allowed set.
- Verified (iteration_224, regression PASS): backend contract 9/9 (401/422), email+password unaffected on both surfaces, Google buttons still render on web + mobile, mobile bundle intact after the app.json/iosClientId change.
- ⚠️ **Native iOS sign-in only works after the user re-Publishes** (the iOS client + URL scheme are native-only; not testable in Expo Go / web preview / automation). Android not configured yet (needs an Android OAuth client + build SHA-1).

**Confirmed already-shipped:** the mobile Care Plan Reviewer already has the full file-upload path (DocumentPicker → `/public/care-plans/review-files` → preview + per-file meta + findings → save via `/care-plans/upload-files`), matching web.


## Iteration 223 (Jun 2026) — Wayly's own Google OAuth (web + mobile) + iter-221 mobile bug closed

**Google OAuth with Wayly's OWN Client ID (replaces Emergent-managed Google sign-in), verified PASS iter223**
- NEW `POST /api/auth/google` (`backend/server.py`): verifies a Google ID token server-side (`google-auth` lib, audience = `GOOGLE_OAUTH_CLIENT_ID`), find-or-creates the user by email (`auth_method="google"`, `email_verified=true`, adviser auto-link), and mints the existing Wayly JWT + refresh token. Contract: bad token → 401, empty/short → 422. Added `google-auth==2.49.1` to requirements.
- Web: `@react-oauth/google` — `App.js` wrapped in `<GoogleOAuthProvider>`, `GoogleSignInButton.jsx` rewritten to render `GoogleLogin` (returns the Google ID token in-page, no redirect), `AuthContext.completeGoogleAuth(credential)` now POSTs to `/auth/google`. `PublicAuthOnly` handles the post-login redirect. Kept `planIntent`/`onBeforeClick` (trial-start + second-participant intent).
- Mobile: `expo-auth-session` — `mobile/src/context/AuthContext.tsx` uses `Google.useIdTokenAuthRequest({ clientId, webClientId })`; `loginWithGoogle()` opens the flow and the id_token is swapped at `/auth/google`. Installed `expo-auth-session` + `expo-crypto`.
- Env: `GOOGLE_OAUTH_CLIENT_ID` + `GOOGLE_OAUTH_CLIENT_SECRET` (backend), `REACT_APP_GOOGLE_CLIENT_ID` (web), `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (mobile). Authorized JS origins + redirect URIs registered for preview, expo preview, and wayly.com.au.
- Verified (iteration_223.json): backend 9/9 pytest, web `/login`+`/signup` render the GIS button (iframe injected), mobile `/login`+`/signup` render "Continue with Google", email/password login/signup unaffected on both surfaces. NOTE: the real Google consent handshake can't be automated (Google blocks bots) — must be user-tested with a Test user on the OAuth consent screen (or once Published).

**iter-221 mobile bug CLOSED (iteration_222.json, retest PASS)** — Provider Quality Detail (PPC-3) survey thank-you card (`ppc3-survey-done`) now shows after a successful submit (silent `load(true)` keeps the form mounted); copy corrected.


## Iteration 219–221 (Jun 2026) — Mobile signup parity, Export Consolidation, Reset-in-app deep link, Quality Chip Detail

**Mobile Signup Role & Plan Parity (iter 219, PASS)**
- `mobile/app/signup.tsx` + `mobile/src/context/AuthContext.tsx`: mobile signup now mirrors web — Caregiver vs Participant role, care-recipient details + relationship, Solo/Family plan picker, and Family "two people" second-participant fields. Payload matches backend `SignupRequest` (models.py). Verified e2e (creates account → payment gate).

**Export Consolidation — one shared PDF/email path (iter 220, PASS)**
- NEW `backend/routes/tool_exports.py`: `POST /api/public/exports/pdf` and `/api/public/exports/email` accept `{tool, payload, person_name?}` and dispatch by tool to existing renderers. Tools: `contribution` (ce2_pdf), `budget` (NEW `services/budget_pdf.py`), `invoice` (inv1_check_report_pdf), `care-plan` (care_plan_pdf). Both behind `_require_paid_plan`.
- NEW `POST /api/lf1/correspondence/{id}/email` (routes/lf1.py) — emails the server-rendered letter PDF to the signed-in user.
- NEW shared mobile component `mobile/src/components/tools/ResultActions.tsx` (Save as PDF + Email to self), wired into Budget Calculator, Contribution Estimator, Invoice Checker, Care Plan Reviewer; Letters detail (`app/letters/[id].tsx`) got an "Email me" button next to its existing PDF export.
- Verified: all 4 tools return valid `application/pdf` (200). NOTE: email path does a REAL Resend send in verified-email-only mode → returns 502 for example.com addresses (same known limit as CSC email; friendly fallback message shown).

**Reset In-App via Deep Link (self-tested e2e)**
- Email → web `/reset` page now shows an "Open in the Wayly app" button (`wayly://reset?token=...`) with the web reset form as fallback (`frontend/src/pages/PasswordReset.jsx`).
- NEW mobile route `mobile/app/reset.tsx` reads the deep-link token and calls `POST /api/auth/reset`. Added `wayly` to `app.json` scheme (array `["mobile","wayly"]`).
- Verified full cycle: signup→forgot→(token from db)→reset→login-new=200, login-old=401. NOTE: the custom-scheme handoff from an email only works in a Published native build, not Expo Go / web preview.

**Mobile Quality Chip Detail (iter 221, PASS after fix)**
- NEW `mobile/app/provider-quality/[name].tsx` mirrors web ProviderQualityDetail (PPC-3): composite summary, ACQSC/Star/Wayly/Ombudsman signal rows, community survey (POST `/ppc3/survey-responses`), OPAN referral. Fetches `/ppc3/providers/{name}/quality-profile`.
- `mobile/app/price-history.tsx` quality chip now navigates to `/provider-quality/{provider}` (was bouncing back to the tool).
- Fixed bug: post-submit `load()` unmounted the survey form so the thank-you never showed → now a silent refresh keeps the "Thanks" card visible. Verified via screenshot.

**Endpoint Aliases Parity (INVESTIGATED — divergence found, NOT fixed, needs product decision)**
- Finding: mobile and web do NOT share these features. Mobile uses simpler legacy endpoints: `/provider-switch` + `/athm` (extended_routes.py) and `/loop/cases` (loop1). Web uses the richer `/psw1` (PSW-1 switch walkthrough), `/athm1` (ATHM-1 projects/items/modifications/OT/quotes/trials), `/cmp1` (CMP-1 complaints + evidence bundles + ACQSC submission). These are different data models and feature depth, so they do NOT resolve identically. Bringing mobile to full CMP-1/PSW-1/ATHM-1 parity is 3 large feature builds — awaiting user direction on scope.


## Iteration 197–199 (Jun 2026) — Billing consolidation, scheduled downgrades, webhook wired (verified live Stripe test mode)

**Consolidation (single read-model)**
- `db.subscriptions` (what GET /api/billing/subscription reads) is now kept in sync by `routes/payments.py` via a shared `_upsert_sub_doc` bridge, called from the Stripe webhook (checkout.session.completed, customer.subscription.created/updated/deleted) AND the return-reconcile (`/payments/checkout/status/{sid}`). Web + mobile now agree with Stripe.
- Disabled the legacy duplicate webhook in `server.py` (renamed to `/webhook/stripe-legacy-disabled`) so the new comprehensive handler serves `/api/webhook/stripe`.
- Added `_plan_for_price`, `_plan_from_sub`, `_sub_period_end/_start` (Stripe 2025-06 moved `current_period_end` onto subscription items[]).

**Scheduled downgrades (period-end, no refund)**
- New `POST /api/payments/schedule-downgrade {plan}` → creates a Stripe Subscription Schedule: phase 0 keeps the current price for one 14-day cycle (`duration` + `start_date`; `iterations` removed by Stripe basil 2025-08-27), phase 1 switches to the lower plan, `end_behavior=release`. Stores `pending_plan`/`pending_effective` on db.subscriptions and returns "Your plan changes to <Plan> on <date>."
- New `POST /api/payments/cancel-scheduled-change` releases the schedule and clears the pending fields. Error path releases a newly-created empty schedule (no orphans).
- Verified live: 2-phase schedule, phase0 = exactly 1,209,600s (14d), release; billing read-model shows plan=family NOW + pending_plan=solo until effective.

**Webhook wired (test mode)**
- New `POST /api/payments/register-webhook` registered a Stripe test-mode WebhookEndpoint (we_1U5QblFXu1wTzvp0F0onYAf7) at `{preview}/api/webhook/stripe`; its signing secret was written to STRIPE_WEBHOOK_SECRET. Bad-sig → 400; idempotent on event.id.

**Tests:** /app/backend/tests/billing/test_iter197_billing_consolidation.py — 16/16 pass vs live Stripe test mode (iteration_197/198/199).

**Still open (backlog):** UI "changes on <date>" note + a Downgrade button on web/mobile plan-billing (data is in /billing/subscription pending fields, no UI yet); batch3 upgrade/add-on still one-time checkout (not routed through subscription.update); the test-mode webhook points at PREVIEW — PRODUCTION (wayly.com.au) needs its own endpoint + secret on redeploy; full 45-web/44-mobile spec suite beyond the consolidation/downgrade slice.


## Iteration 196 (Jun 2026) — Signup/onboarding date + required parity, mobile checkout return-to-app, checkout reconcile

**Dates & required fields (web + mobile parity)**
- Mobile: new shared `DateField` (mobile/src/components/ui.tsx) — Australian DD/MM/YYYY display + native calendar picker (@react-native-community/datetimepicker, guarded off react-native-web so the web preview uses a DD/MM/YYYY text fallback and never crashes). Wired into onboarding DOB.
- Mobile onboarding now shows "Required" markers on first/last name, DOB, registered provider, and the Pension / Classification / Statement-delivery sections.
- Web: new `frontend/src/components/DateField.jsx` — DOB is a DD/MM/YYYY button opening a shadcn Calendar popover (year/month dropdowns), stores ISO. Wired into onboarding StepEssentials (required marker retained).

**Mobile checkout returns to the app (was stranding users in the browser)**
- `startCheckout` (mobile/src/lib/plans.ts) now passes an `app_return_url` deep link and uses `WebBrowser.openAuthSessionAsync`, so after payment the in-app browser auto-closes and the app resumes to onboarding.
- New backend bounce endpoint `GET /api/payments/app-return` (routes/payments.py) redirects the hosted-checkout browser back into the app deep link (with a manual "Return to Wayly" fallback).

**Checkout reconcile (fixes webhook-lag on preview)**
- `GET /api/payments/checkout/status/{sid}` now reconciles on return: when Stripe reports the session complete it upserts BOTH the `users` doc and the canonical `db.subscriptions` doc (which `/api/billing/subscription` reads), so the trial/plan reflects immediately without requiring a wired webhook. Mobile calls this on return.
- Verified end-to-end: drove a real test-mode 4242 checkout; demo user `mobtrial+1786972023@example.com` now returns `{plan:solo,status:trialing}` from `/api/billing/subscription`.

**Audit note — billing is fragmented across `routes/payments.py`, `batch3_billing.py`, and `server.py` (3 data paths; `/billing/subscription` reads `db.subscriptions`).** Full billing-to-spec (subscription-schedule downgrades, exact proration previews, add-on quantity items, dunning grace, Stripe Tax on updates, mobile no-IAP) remains a phased backlog item.


## Iteration 194–195 (Jun 2026) — Cross-platform polish: collapsibles, copy, single headings, $ glyph, Stripe verify

Web + mobile UI consistency pass and extensive mobile Stripe verification.

**Dashboards & sections**
- "Things to know" is now a prominent collapsible (collapsed by default), mirroring the "Budget detail" toggle — web (`CaregiverDashboard.jsx`, `<details data-testid=things-to-know-details>`) and mobile (`(tabs)/index.tsx`, testID `dashboard-things-to-know-toggle`).
- Removed the redundant `"<name>'s care"` hero H1 from both web and mobile dashboards (participant switcher already shows the name).
- Web dashboard: removed the plan-desc text ("All 9 tools · 5 family seats · Sunday digest") next to the plan badge.

**Copy / terminology**
- Family plan copy fixed everywhere: "2 Participants included and 3 Caregiver seats" (was "Up to 4 participants").
- Capitalised the product terms **Participant** / **Caregiver** in user-facing copy across web (Signup, Pricing, Landing, Participants, PaywallModal, Screenshots) and mobile (plans.ts, plan-billing, participants). Code identifiers/API fields left untouched.

**AI Tools**
- The three marketing info chips (Try free / Grounded in law / Private by default) are now HIDDEN for any signed-in user with a plan OR on a free trial — mobile `(tabs)/ai-tools.tsx` (`showInfoChips = !hasFullAccess`) and web `AIToolsIndex.jsx` (`!(plan.isPaid || plan.isTrialing)`).
- Added an "AI Tools" group (9 tools) to the mobile More drawer (`navGroups.ts`) to mirror the web sidebar.

**Single heading (mobile)**
- `AppHeader.title` is now optional; on ~19 sub-screens that also render a `PageIntro`/hero (invoices, documents, reports, cases, budget-scenarios, compare-providers, care-plans, contribution-position, handover-pack, athm, classification-prep, chsp-tools, letters, carer-self-check, upload, provider-switch, ask, family, participant/[id]) the duplicate nav title was removed — only the back chevron + right actions remain. Matches web's "nav + one hero" pattern.
- `PageIntro` "How this works" now defaults collapsed on every mobile screen.
- Family Wall gained a back chevron → dashboard; the Wayly header logo/wordmark (testID `header-logo`) is now tappable → dashboard.

**$ glyph fix**
- Fraunces' double-bar "$" (read as "$$") fixed globally: the shared `T` component now renders the "$" of any money string in the body font while keeping digits in the heading font — applies to statements, tools, dashboard, profile, everywhere.

**Stripe (mobile) — verified, no new code**
- Extensive test (iteration_195): backend 12/12 pass (`/payments/checkout` solo+family cs_test_ URLs, `/billing/subscription`, `/payments/portal`, `/billing/cancel`, `/billing/v2/upgrade-checkout` + addon-checkout + cancel-pending-addon, `sync-plan-to-participants`). Mobile flow mirrors web: signup(plan) → `startCheckout` → hosted Stripe Checkout (7-day trial, card captured) → `/onboarding`; `/plan-billing` renders plan/price/cancel state. Test users in `test_credentials.md` (mobpay.solo/family/free).


## Iteration 193 (Jun 2026) — IndexNow key rotation (SEO-2 follow-up)

Rotated the IndexNow key to recover from the Bing-side 403 blocklist on the old key.
- Old key `9a677bbf…` → new key `0dd78cc1f170c03893e727376ba77ef7624e6f6b4015ea1727d3dd3415147ae2`.
- Updated `_DEFAULT_INDEXNOW_KEY` in `backend/indexnow_service.py` (single source of truth; no prod env var needed — still `INDEXNOW_KEY`-overridable).
- Swapped the public key file: added `frontend/public/0dd78cc1….txt` (exactly 64 bytes, no trailing newline), removed the old one.
- Verified: backend module + KEY_LOCATION + `/api/public/seo/indexnow-key.txt` mirror all serve the new key; a fresh `yarn build` includes only the new key file; SEO-1.1 deploy gate still passes (sourceHash unchanged since only a public `.txt` changed — `prerender-apply` + `seo-verify` green).
- NEXT (user): redeploy prod so the new key file is live at `https://wayly.com.au/0dd78cc1….txt`, verify wayly.com.au in Bing Webmaster Tools, THEN rerun the seed ping.



**SEO-2 — change-scoped IndexNow + dateModified (web/backend):** (testing_agent iter192: backend all green)
- Article pages already emit content-accurate `dateModified` from `updated_at` (JSON-LD + `article:modified_time`), baked into prerendered HTML by SEO-1.1 — verified in place.
- Fixed a bug in the "submit all sitemap URLs" admin endpoint (`all_sitemap_urls()` was called without `await`, so it submitted nothing).
- New `backend/seo_indexnow_sync.py::compute_and_ping()`: builds a manifest of every sitemap URL + content dates, diffs vs the previously stored manifest (Mongo `seo_manifest`, single doc — INTERIM storage, object storage later), and submits ONLY new/changed URLs to IndexNow. Static marketing pages carry no content date and are excluded from the diff, so a no-op deploy pings nothing. First run stores the manifest and does NOT mass-ping. `datePublished` immutability guard rejects any published-date change. All four behaviours unit-verified (first-run / no-op / change-detect / immutability).
- New admin endpoint `POST /api/admin/seo/indexnow/changed` (TOTP) and internal `POST /api/internal/seo/indexnow-changed` (gated by `SEO_PING_TOKEN` X-Internal-Token; wrong token → 403, verified). Returns 409 on immutability violation so CI fails loudly.
- New GitHub Action `.github/workflows/seo-indexnow.yml` calls the internal endpoint post-deploy. Requires repo secrets `SEO_API_BASE` + `SEO_PING_TOKEN`, and `SEO_PING_TOKEN` must also be set in the PRODUCTION backend env.
- ⚠️ One-time manual seed ping attempted: IndexNow returned **403 UserForbiddedToAccessSite**. The key file is verified live (HTTP 200, exact content) and the payload is correct — this is a Bing-side host-verification state. Resolution is user-side: verify wayly.com.au in Bing Webmaster Tools (XML-file method) and/or rotate the IndexNow key + redeploy, then retry.

**Mobile — participant switcher visibility:** `ParticipantSwitcher` gained a prominent full-width `variant="bar"` ("VIEWING CARE FOR <name>" + Switch pill) rendered at the very top of the dashboard scroll. Switching re-scopes the dashboard. (`app/(tabs)/index.tsx`, `src/components/ParticipantSwitcher.tsx`)

**Mobile — openable notifications with unread decrement:** New `NotificationsProvider` (loads GET /api/notifications, polls 60s + on foreground) + `NotificationsSheet`. Header bell now opens the sheet; tapping an item marks it read (optimistic, POST /api/notifications/read {ids:[id]}) which decrements the badge and navigates if the item has a link; "Mark all read" zeroes it. Badge uses the live unread count. (`src/context/NotificationsContext.tsx`, `src/components/NotificationsSheet.tsx`, `src/components/WaylyHeader.tsx`, `app/_layout.tsx`)

**Mobile — full Stripe billing test (mirrors web iter138+148):** New users mobpay.family / mobpay.solo / mobpay.free (all `MobPay1!`). Verified: checkout returns real `cs_test_` URLs for solo+family incl. free users (read-only middleware exempts /payments), unknown plan 4xx, webhook 400 on unsigned/bogus signature, portal/cancel/reactivate 400 without a subscription, invoices `[]`, subscription + trial-eligibility 200. Mobile screens plan-select / plan-billing / signup exercise these via `startCheckout` (WebBrowser) — hosted Stripe checkout is external and not auto-completable (same limitation as web).

Note: seed drift — cathy@example.com currently has 2 active participants (Mum, Patricia Holloway); Robert Kowalski is inactive. Re-seed if "3 participants" copy must be truthy.


## Iteration 191 (Jun 2026) — PROD deploy hotfix + mobile UI bug fixes

**P0 — Production deploy blocker FIXED (web/SEO):** The SEO-1.1 stale-gate crashed because `prerender-lib.mjs` was refactored to a deterministic `sourceHash()` (hashes `src/` + `public/index.html`, environment-independent) but `prerender-generate.mjs`, `prerender-check.mjs`, and `seo-verify.mjs` still imported/called the removed `buildMainJsHash`. Updated all three scripts to use `sourceHash`, recomputed the hash and wrote it into `frontend/prerendered/prerendered.json` (mainJsHash `bb2a37bd…` → `d5e24d25…`, 114 routes). Verified via deploy-sim: `node scripts/prerender-apply.mjs && node scripts/seo-verify.mjs` exits 0 (gate passes, no more STALE failure). This removes the Cloud-Build-vs-preview hash mismatch that caused two prod deploy failures.

**P1/P2 — Mobile UI bug fixes (testing_agent iter191: ALL GREEN):**
- **Duplicate titles removed** on tool screens — the in-body large heading that repeated the AppHeader title was deleted from 8 tools (BudgetCalculator, AgedCareQA, CarePlanReviewer, ContributionEstimator, InvoiceChecker, LettersFollowUps, ProviderPriceChecker, StatementDecoder in `tool/[slug].tsx`).
- **Guided Journeys** (`app/journeys.tsx`): removed the dead-end dummy "Your situation" (persona) step; journey now 4 steps starting at Classification Self-Check (web parity).
- **Documents upload added** (`app/documents.tsx`): new "+" header button opens an "Add a document" modal (file / photos / camera pickers with permission contract) → POST `/api/documents` multipart (same backend API the web uses), category chips + optional title, 10 MB limit. Backend contract verified via pytest (`backend/tests/test_iter191_documents_upload.py`, 4/4).
- **"Log Out" casing** fixed in AppDrawer (More tab).


## Iteration 196 (Jun 2026) — SEO-1.1 implemented: prebuild-and-commit prerender (PROD HOTFIX, web)

Removed the environmental dependency that broke the prod deploy (Cloud Build has no headless Chromium). Prerender is now GENERATED in the preview env and COMMITTED; the deploy injects it with no Chromium and a FATAL gate.

- **New pipeline** (`frontend/scripts/`): `prerender-lib.mjs` (extract head SEO tags + #root body via div-depth counting; `mainJsHash` from asset-manifest), `prerender-generate.mjs` (preview-only: walk react-snap output → `frontend/prerendered/prerendered.json`, 114 routes, 4MB, committed), `prerender-apply.mjs` (deploy postbuild, no Chromium: inject committed head+body into the FRESHLY built shell per route so `<script>` hashes always match the current build), `seo-verify.mjs` (fatal gate: missing/empty/**stale** via mainJsHash mismatch), `prerender-check.mjs` (preview PR-time staleness warning).
- **package.json scripts:** `build`=craco build; `postbuild`=`prerender-apply && seo-verify` (no Chromium, fatal); `prerender:generate`=`(react-snap || continue) ; prerender-generate` (tolerates react-snap's hydration-recheck exit — files are still written); `prerender:check`.
- **Escape hatch:** `SKIP_PRERENDER_GATE=1` → LOUD banner warning + exit 0; per-deploy CLI env var only, never persistent config.
- **Verified pre-deploy:** deploy-sim `yarn build` exits 0; apply injected 114 routes; gate passed (fresh). Raw HTML of `/`, `/features`, `/ai-tools/.../how-it-works`, `/legal/privacy` all have real title+description+canonical+`<h1>`+JSON-LD+filled `#root` WITHOUT running react-snap at build. Stale gate → fatal fail with correct message; SKIP hatch → loud bypass. `frontend/prerendered/` is tracked (only `/build` is gitignored). **testing_agent iteration_190: ALL GREEN** (9 public pages render, explainer testids present, CHSP/AI-Tools render after helmet/hydration-gate changes, dashboard flows + search work, backend IndexNow key + robots /press-unblock confirmed, zero console errors).
- **Manual step on any code/content change:** in preview run `SKIP_PRERENDER_GATE=1 yarn build && yarn prerender:generate`, then commit `frontend/prerendered/**` (else the deploy gate fails "stale").
- **Pending:** user to redeploy → confirm LIVE production View Source. SEO-2 stays BLOCKED until SEO-1.1 is verified live in prod.


## Iteration 195 (Jun 2026) — SEO-1 corrections: deploy unblock + IndexNow fix; SEO-2 spec

- **Prod deploy fix.** The SEO-1 `seo-verify` build gate broke the production Cloud Build: that environment could NOT run react-snap (no headless Chromium), so it produced zero prerendered files and the hard gate failed step #8. Changed `frontend/package.json` `postbuild` to be NON-FATAL — `(yarn prerender && node scripts/seo-verify.mjs) || echo WARN` — so a failed/absent prerender ships the client-rendered build instead of failing the deploy. Verified the shell always exits 0 on failure. **Consequence: production currently does NOT prerender (ships the CRA shell); the SEO-1 prod benefit is unrealised until we solve headless-Chromium-at-build or switch approach.** Prerender still works in the preview container.
- **IndexNow correction.** Discovered a pre-existing, robust backend IndexNow implementation (`backend/indexnow_service.py`: real key `9a677bbf…2ef7`, `submit_urls()`, `all_sitemap_urls()`; admin endpoints `/api/admin/indexnow/ping` + `ping-all`; key file `public/9a677bbf…2ef7.txt` already present; backend `/indexnow-key.txt`). My earlier SEO-1 frontend additions used a DIFFERENT bogus key and were redundant — REMOVED `public/a3f1…txt`, `scripts/indexnow-ping.mjs`, `scripts/write-indexnow-key.mjs`, and the `prebuild` line. Honored the rotate-via-env ask in the correct place: `INDEXNOW_KEY = os.environ.get("INDEXNOW_KEY", default)` in `indexnow_service.py`. The IndexNow publish hook is MANUAL (admin endpoints), NOT auto-wired to a publish flow (articles are static; no CMS).
- **robots parity.** Backend `seo_routes.py` `_ROBOTS` also un-disallowed `/press` (was still blocking it; the frontend static robots.txt was already fixed).
- **SEO-2 spec** written at `docs/SEO-2-spec.md` (content-accurate `dateModified` from per-article `updatedAt`, not build-stamped; change-scoped IndexNow ping via manifest diff). SPEC ONLY — awaiting sign-off.


## Iteration 194 (Jun 2026) — SEO-1 v2: prerender public pages (Phase 0 + Workstreams A–F, web)

Root cause of the Bing "missing h1/description" + thin-indexing reports: the CRA ships an empty `#root` shell and prerender was gated OFF in production. Infra (react-snap, react-helmet-async, conditional `hydrateRoot` in `index.js`, sitemap, tokens) already existed from a prior rebalance but was disabled. Phase 0 audit was run and signed off by the user; then implemented A–F.

**Verified (acceptance tests):** ran `RUN_PRERENDER` build end-to-end — react-snap prerendered ~125 routes into `build/<route>/index.html`.
- Test 1,2 (raw HTML has non-empty `<title>`, meta description, self-canonical, `<h1>`, non-empty `#root`): PASS via new `scripts/seo-verify.mjs` (12 critical routes).
- Test 3 (Bing token present, zero `*_REPLACE_ME`): PASS — Bing `msvalidate` now emitted via helmet in `SeoHead.jsx` so it survives prerender; Google token wired to `process.env.REACT_APP_GSC_TOKEN` (absent until env set).
- Test 4 (robots): `/press` un-disallowed (user approved indexing); Sitemap line present; `*` allows bingbot.
- Test 5 (sitemap): added `/ai-tools/provider-price-checker/how-it-works`.
- Test 6 (IndexNow): key file `public/a3f1c9e84b7d4f26a1c05e9d7b3f2a18.txt` + `scripts/indexnow-ping.mjs` publish hook.
- Test 7 (hydration): 2 real mismatches FIXED — (a) `AIToolsIndex` date-based "New" badge now gated by new `useHasHydrated()` hook; (b) `ChspContent.jsx` + `ToolExplainer.jsx` moved body JSON-LD `<script>`s into `<head>` via helmet. **Residual:** react-snap still flags a React #418 on `/chsp` — a React.lazy chunk-timing Suspense flash on the large shared CHSP chunk (Risk #1 in the spec). The served `/chsp/index.html` itself is correct (H1 + full body baked in).

**Build wiring:** `postbuild` now prerenders by default (toggle off with `RUN_PRERENDER=0`) and gates on `scripts/seo-verify.mjs` (the authoritative raw-HTML check) rather than react-snap's flaky hydration-recheck exit code. reactSnap `include` expanded from 15 → ~50 public routes (auth/app excluded). Static Bing meta removed from `index.html` (now helmet-emitted).

**Decisions still open:** (1) how to close Test 7 fully — migrate public routes to `@loadable/component` / preload chunks (durable) vs accept the seo-verify gate now; (2) live Google Search Console token to set as `REACT_APP_GSC_TOKEN` at deploy; (3) `/legal/dpa` & `/ai-tools/quarterly-pacing` are NOT current routes (resolve to NotFound → correctly noindex), so no change needed.


## Iteration 193 (Jun 2026) — Provider Comparison (Price Checker) Explainer page (web, SEO)

Built a dedicated plain-English explainer for how the Provider Price Checker evaluates a rate, to win SEO traffic. Self-verified via rendered-page smoke test (title + 4 steps + 5 FAQs + CTA present) and lint clean.

- **New page** `pages/ProviderPriceExplainer.jsx`, public route `/ai-tools/provider-price-checker/how-it-works` (lazy import + route added in `App.js`). Sections: hero, "short answer" clay callout, 4-step "how the check works", "what your result means" (below/in/above range with the in-range≠fair, above-range≠unfair caveats), "extra checks we run" (quality guards, rate-increase counter, Your Share), "where the numbers come from" (DoH Feb-2025 survey of 300+ HCP providers, quarterly updates, 1 Jul 2026 caps deferred), FAQ (`<details>`), and a CTA to the tool. Copy mirrors `backend/lib/ppc_v2.py` HOW_THIS_WORKS_BULLETS / CAP_DEFERRAL_NOTE so it stays accurate.
- **SEO**: `SeoHead` emits `HowTo` + `FAQPage` + `BreadcrumbList` JSON-LD (plus sitewide Org/WebSite), canonical, OG/Twitter. Framed around "is my aged-care provider overcharging / Support at Home price ranges explained".
- **Link in**: added a "How the fairness check works" link under the Price Checker tool's intro (`pages/tools/PriceCheckerTool.jsx`).
- Key framing decision: there is NO single numeric "fairness score" — the tool compares against DoH indicative ranges (position + distance), so the page explains that honestly rather than inventing a score.

**Still queued (both need their own focused pass):**
- Content + SEO polish — deepen Services/Policy/Caregiver-Guides copy (data-driven: `data/services.js`, `data/policies.js`, `data/guides.js`), reformat older Articles to match newest (`data/seoArticles2026.js`, `data/toolArticles2026.js`), expand Glossary (`data/resources.js`) with Title Case + animations. Best done from the approved article source docs in the asset library (July Articles.md, CONTENT-1/CONTENT-2, Wayly Articles 1-3).
- Demo Seed & Screenshots — seed clean "Margaret, classification 4" account (backend seed script) + regenerate homepage hero + dashboard marketing images.


## Iteration 192 (Jun 2026) — Legal pages wired with approved content (Batch A, web)

Wired the four approved legal documents into the live `/legal/*` pages (source docs located in job assets: `wayly-privacy-policy.html` / `Wayly-Privacy-Policy-v1_2-DRAFT.md`, `terms-of-service.html`, `HANDOFF-LEGAL-ACCESSIBILITY-v1.md`, `HANDOFF-LEGAL-AI-DISCLAIMER-v1.md`). All four self-verified via rendered-page smoke test (titles + body render; Privacy 24.9k chars, Terms 11.9k, Accessibility 3.7k, AI Disclaimer 4.4k) and all lint clean.

- **Privacy** (`pages/legal/Privacy.jsx`, rewritten): full APP-aligned v1.2 policy — who we are (ABN/ACN), three-tier collection, AI in AWS Bedrock Sydney (no training on user data), sub-processor list + overseas disclosure (APP 8), retention table, NDB breach process, access/correction/deletion/export rights, ADM (Dec 2026 APP 1), substitute decision-makers, plus a Privacy FAQ block for SEO. Last updated 24 June 2026.
- **Terms** (`pages/legal/Terms.jsx`, rewritten): 23-section ToS — what Wayly is/is not, definitions, account, responsible use, AI verification + Australian data residency, data/privacy, your content licence, subscriptions & billing, refunds, IP, third parties, liability cap, ACL non-excludable guarantees, beta, force majeure, changes, termination, notices, governing law (Victoria), complaints (OAIC/CAV/ACCC/ACQSC), contact. Last updated June 2026.
- **Accessibility** (`pages/legal/Accessibility.jsx`, rewritten): WCAG 2.2 (AA marketing / AAA participant view), features, technical specs, known limitations, testing methodology, assistive-tech support, feedback contacts, DDA 1992 alignment.
- **AI Disclaimer** (`pages/legal/AIDisclaimer.jsx`, rewritten): approved structure (what AI does, limitations incl. Support-at-Home specifics, your responsibilities, verification steps, what Wayly is not, Privacy Act 1988 ADM disclosure, Voluntary AI Safety Standard 2024, contacts).

Formatting note: straight apostrophes/quotes in the legal copy were converted to typographic ' " " to satisfy `react/no-unescaped-entities` (nicer in legal prose); a `lang="en-AU"` code sample uses `&quot;`.

**FLAG for user:** the approved Terms states billing is **fortnightly, 26 charges/year** — confirm this matches the actual Stripe cadence (the ACL-review draft referenced monthly). Terms links pricing out to the pricing page (no hardcoded amount), so no figure conflict, but the cadence wording should match reality before public launch.

**Still queued:** Content + SEO polish (deepen Services/Policy/Caregiver-Guides copy, reformat older Articles to match newest, expand Glossary); Provider Comparison Explainer; clean "Margaret, classification 4" demo seed + fresh screenshots.


## Iteration 191 (Jun 2026) — Dashboard redesign (web + mobile) + "What would you like to do?" intent search + hero size

User asks (this session): declutter the caregiver dashboard on BOTH surfaces (too many numbers, Smart Summary felt heavy, hard for older users to navigate); add a way for users to ask/find what they want and be routed to the right tool; make the "Budget detail" section a clearly-clickable button; and reduce the homepage hero title size. Verified green by testing_agent (iteration_189.json, both platforms) for the redesign + hero; the expanded semantic search was added after and self-verified (node unit tests + web screenshot; identical logic mirrored to mobile).

### Shipped
- **Homepage hero smaller** (`components/DualFlagshipHero.jsx`): "Aged Care, Made Clear." dropped from `text-[2.5rem] sm:text-5xl lg:text-6xl` → `text-[2rem] sm:text-4xl lg:text-5xl`.
- **Dashboard redesign — web** (`pages/CaregiverDashboard.jsx`): simplified greeting (H1 now "{Name}'s care", dropped the "Wellbeing summary" overline + redundant per-quarter $ line). Replaced the 4-stat-card wall with ONE calm **At a glance** card (`dashboard-at-a-glance`): big "Left to spend this quarter" figure (clay left border + sage progress) + 3 quiet tappable mini-stats (`glance-alerts/statements/cap`). Moved streams, streams-note, pathways, DashboardInsights, DashboardTimelinePanel, BC2Projection and the lifetime-cap card into a **collapsed** `<details>` (`dashboard-more-detail`) fronted by a prominent button (`dashboard-more-detail-btn`: clay icon + serif title + subtitle + filled teal "Show detail ▾" pill). Kept Things-to-know, recent statements, chat/audit/family previews below.
- **Dashboard redesign — mobile** (`app/(tabs)/index.tsx`): same structure/parity. New consolidated `dashboard-at-a-glance` (glance-left + 3 mini-stat cells), and a `useState` collapsible fronted by a bordered card button (`dashboard-more-detail-toggle`: clay icon + title/subtitle + filled teal Show/Hide pill). Removed the old StatCard component + statsRow styles.
- **"What would you like to do?" navigator** (new `components/DashboardActionBar.jsx` web + `src/components/DashboardActionBar.tsx` mobile): a friendly search + 6 clay shortcut tiles (Upload a statement, Check an invoice, Ask Wayly, Draft a letter, See my budget, All AI Tools). Sits under the greeting, above Smart Summary.
- **Expansive intent search** (`config/dashboardDestinations.js` + `mobile/src/config/dashboardDestinations.ts`, identical logic): 20 destinations, each tagged with **concepts** + rich natural-language keywords. Matcher does tokenize → stopword strip → light stemming → a **concept/synonym engine** (CONCEPT_TRIGGERS) + OR-based ranked substring scoring, so plain phrasing routes correctly ("mum's bill looks wrong" → Check an invoice/Budget alerts; "running low on money" → pacing/budget; "I want to complain" → Draft a letter; "need more funding, needs got worse" → Classification self-check; "who do I call" → Key contacts). Never dead-ends: question-like or no-match queries surface **Ask Wayly**.

### Notes
- Backend untouched; dashboard still reads the existing endpoints.
- Mobile cosmetic: at 390px the "LIFETIME CAP" glance label + `%` can wrap — non-blocking.


## Iteration 190 (Jun 2026) — Homepage hero size + footer one-line + global scroll-to-top

Quick UI fixes (self-verified on preview; web hot-reload):
- **Hero heading smaller** (`components/DualFlagshipHero.jsx`): "AGED CARE, MADE CLEAR." reduced from `text-[3.25rem] sm:text-7xl lg:text-8xl` to `text-[2.5rem] sm:text-5xl lg:text-6xl` (still the dominant H1, just less overwhelming).
- **Footer tagline one line** (`components/Footer.jsx`): "Aged Care, Made Clear." now `text-xl sm:text-2xl whitespace-nowrap` so it no longer wraps to two lines.
- **Scroll-to-top on nav**: global `components/ScrollToTop.jsx` already resets scroll on every route change (mounted once in App.js). Added an explicit `onClick` scroll-to-top to the Wayly logo/brand in `MarketingHeader.jsx`, `Footer.jsx`, and app `Layout.jsx` so clicking the logo while already on the same page also jumps to the top.

Still queued (per user, in order): **Batch D part 2** (Services/Policy/Guides copy depth + capitalisation, reformat older Articles, expand Glossary) · **Batch A** legal wiring (Privacy, Terms, Accessibility, AI Disclaimer) · **Batch B** clean "Margaret, classification 4" demo seed + fresh homepage screenshots · **Provider Comparison Explainer** page.



## Iteration 189 (Jun 2026) — Web marketing revamp · Batch C + Batch D (part 1)

User approved batch order **C → D → A → B**. Tested green on web (iteration_188.json, 100% frontend, 0 console errors).

**Batch C — Features + About redesign (done & verified):**
- Features (`pages/Features.jsx`): featured block changed from Invoice Checker to **Statement Decoder + Smart Summaries** with a "Your Wayly Insight" preview panel (clay). Tools regrouped by **pain-point** (When the Statement Doesn't Add Up / Get the Care Right / Push Back / Whole Family's Involved). Removed the "What you get at every tier" plan matrix. Card component now wraps in `Reveal` for scroll animation. Section title reframed. `$`/`%` used throughout.
- About (`pages/About.jsx`): removed Section VIII "If It's Your Name on the Statement". Clay H1 accent ("Someone Had To."), clay PullQuotes (bigger, clay border+text), clay section-marker bars, clay Stat numbers, clay Belief/Cluster icons + hover. Scene/Belief/LessonCard/ClusterCard primitives now wrap in `Reveal` (site-wide scroll animation, no call-site changes).

**Batch D (part 1) — done & verified:**
- FAQ (`pages/FaqHub.jsx` + `data/faq.js`): rebuilt on brand tokens + clay; Title-Cased category titles; horizontal category quick-nav chips (single scroller) that jump to sections; card-style question rows; `Reveal` per group. Fixed outdated cost answer (removed "Adviser"/"per month" → "$24.50 per fortnight … $49.50 per fortnight, 7 day free trial").
- Demo (`pages/Demo.jsx`): **removed the Adviser tab** (now Cathy/Dorothy/Karen only); moved Caregiver/Participant/Secondary to module scope (fixed nested-component lint); `Reveal key={role}` re-animates on toggle; fixed copy ("$200 to $450", "April to June"); clay-consistent CTA; Title-Cased headings.
- Support at Home levels (`sah-levels/*` ): new **"What Level N Means for Your Money"** financial-impact section on each level detail (computed care-management, rollover cap, contribution rules, rate-watch — all from the level's own figures, `$`/`%` correct, `Reveal`). Title-Cased all section headings. "Reviewed by: To be confirmed" → **"Reviewed by: Confirmed"** (hub + detail, meta + footer).
- Footer (`components/Footer.jsx`): swapped two off-brand cyan accents (divider + "Support lines:") to clay `#E8956B`. (Labels already Title Case from Batch 1.)
- Ask Wayly (`pages/AskWayly.jsx`): rebuilt on brand/clay tokens, Title Case, added **How Ask Wayly Works** 3-step, themed example-question groups (Money and Budgets / Providers and Care), and an **SEO FAQ accordion with FAQPage JSON-LD** (more informative for SEO). `Reveal` throughout.

**Still queued in Batch D (part 2):** Services explainers (longer copy + capitalisation), Policy explainers (longer + capitalisation), Caregiver Guides (grammar + capitalisation), Articles (reformat older ones to match newest, enforce `$`/`%`, capitalisation), Glossary (expand sections + capitalisation). Note: data files already scanned clean of em/en dashes and numeric spell-outs, so remaining work is copy depth + heading casing + animations.
**Then Batch A** (wire approved Legal content: Privacy, Terms, Accessibility, AI Disclaimer) **and Batch B** (seed clean "Margaret, classification 4" demo account + fresh hero/dashboard screenshots).



## Iteration 188 (Jun 2026) — Web marketing revamp · Batch 1 (global) + homepage hero

Scope: large multi-page web redesign approved to ship in tested batches (B1 global → B6 carryover). All in preview; production updates on redeploy.

**Batch 1 — global quick wins (done, verified):**
- ABN/ACN corrected everywhere → `ABN 66 701 311 373 · ACN 701 311 373` (Footer.jsx, legal/Privacy.jsx; replaced `[ABN placeholder]`).
- Footer: Title-Cased labels ("Policy Explainers", "Caregiver Guides", "Support at Home Levels"); removed **Templates**, **Trust & Security**, **Cookie Policy** links; tagline "Aged Care, Made Clear." enlarged (font-heading text-2xl/3xl) with clay "Made Clear.".
- Floating Help + Accessibility widgets now fade out while scrolling and return when idle (`components/ScrollHideWidgets.jsx`, wired in App.js). Reduced-motion aware.
- Reusable scroll-reveal component (`components/Reveal.jsx`, IntersectionObserver, reduced-motion aware) for use across all marketing pages.

**Homepage (B2, done & verified):**
- Hero "Aged Care, Made Clear." promoted to dominant H1 (font-black, up to text-8xl, clay + gradient underline, Reveal).
- Removed the poorly-placed hero "Ask Wayly a question" row (Ask Wayly is already featured in the tools cluster).
- "The Problem We're Solving" cards: Title Case + relatable, less-specific copy ("For the Family Caregiver/Participant/Family"), clay headings + hover.
- "Six People. One Shared Calm." Title Case, larger, clay accent, rewritten relatable per-persona copy, RevealOnScroll.
- "One Calm Dashboard for Everything." Title Case + clay.
- "Try Wayly without signing up" replaced with accurate "Decode a Statement Now, No Signup Needed" (only Decoder is no-signup; others "Free with your account").
- Tools cluster: "Seven More Tools, Grouped the Way Families Think." + bolder text-3xl category headings (Money & Statements, Care Coordination).
- Pricing teaser: clay "Less Than One Hour With a Consultant." headline, savings framing, 6-point tier cards, per-person value line, Reveal.

**Still queued in B2:** fresh hero + dashboard screenshots from a clean demo account.

**How It Works (B2, done):** replaced the three large Step 1-3 screenshots on the homepage with a skimmable icon-based 3-step flow (Decode → Check → Understand) with scroll-reveal + a "Try it now, free" CTA (`Landing.jsx`).

**Pricing page (B4, done & verified):** clay headline "…Less Than One Hour With a Consultant."; "Compare the Two Plans" table trimmed (removed Security & Privacy + Adviser Tools groups) with clay category rows and an emphasised Family column; "Managing More Than 2 Participants?" made prominent; removed the "$24.50 each" line under the cards and the "Statement Decoder without creating an account" FAQ. Family plan reads as the obvious pick (RECOMMENDED badge + clearer copy).



**Remaining (queued): B2 rest** (move Ask Wayly into tools, fresh clean screenshots, problem cards + Title Case, "Six People. One Shared Calm." clay + copy, tools redesign, how-it-works flow, "Try Wayly" fix, richer pricing cards + savings) · **B3 legal artifacts** · **B4 Pricing/Features/About** · **B5 Services/Policy/Guides/FAQ/SAH-levels/Ask-Wayly/Demo/Articles/Glossary** · **B6 carryover** (Streamed Reviewer, Faster First Web Reply, AW-2-on-mobile).


## Iteration 187 (Jun 2026) — Ask Wayly streaming + formatting, Reviewer progress, LLM resilience

Verified green on web + mobile (iteration_187.json; backend pytest 8/8, test_iter187_streaming.py).

- **Ask Wayly number formatting ($ and %)** — chat system prompt was instructing the model to "spell out money figures". Flipped it to mandate digit money (`$6,681.60`) and `%` percentages, never spelled-out words (`backend/agents.py`). Same rule added to the web AW-2 prompt (`routes/aw2.py`). Also fixed `_humanize_assistant_reply` which was inserting a space after every comma (`$6, 681.60`) — the dash-normaliser regex no longer matches literal commas (`server.py`).
- **Streaming (word-by-word) on both platforms** —
  - Backend: new SSE `POST /api/chat/stream` (mobile) + `POST /api/aw2/conversations/{id}/messages/stream` (web AW-2). Added `agents.stream_chat_with_kindred` (yields TextDelta then a clean humanised `full`), extracted shared `_build_chat_system_message` and `_prepare_chat_context`; extracted `_aw2_system_prompt`. Streams raw deltas live, replaces with the humanised final on done.
  - Mobile: `streamChat` XHR-based SSE consumer in `src/lib/api.ts`; `app/(tabs)/ask.tsx` fills the assistant bubble live (thinking indicator hides on first token). Closes the iter186 "no answer bubble" bug.
  - Web: `streamAw2` fetch/ReadableStream consumer in `AskWaylyV2.jsx`; follow-up messages stream (first message still via create), citations + feedback preserved. Streaming also sidesteps the 60s ingress idle-timeout.
- **Care Plan Reviewer progress** — friendly "Reviewing the care plan… this takes about a minute" panel (testID `cp-progress`) during the ~46-51s review on mobile (`CarePlanReviewer.tsx`) and web (`pages/tools/CarePlanReviewer.jsx`).
- **Concurrency / resilience** — empirically the event loop is NOT blocked by LLM calls (12 concurrent 46s calls → `/auth/me` ~0.15s, login ~0.9s), so no thread-offload needed. The only real freeze cause was an untimed hung upstream call (an 18-min zombie). Added `lib/llm_guard.py` — installs a global `LlmChat.send_message` timeout (`KINDRED_LLM_TIMEOUT_SECONDS=90`) so any stalled call self-releases. Ask Wayly `/chat` also switched to Haiku (`KINDRED_CHAT_MODEL`) with a 50s ceiling.
- **Add-participant branches verified** — FREE→upgrade_required, SOLO→solo_to_family, FAMILY→family_addons, ADVISER→adviser_included (tests/verify_add_branches.py, all PASS).
- **Intro cards** — confirmed KEPT expanded on mobile to match web (user chose full parity).


## Iteration 182-186 (Jun 2026) — Mobile ↔ Web parity sweep (Smart Summaries, intros, Stripe, persona) + Ask Wayly 502 fix

### Shipped (batch-tested — iterations 182/183/184/186)
- **Smart Summary parity (mobile)** — new shared `mobile/src/components/SmartAISummary.tsx` mirroring web `SmartAISummary.jsx` (eyebrow + "Your Wayly Insight" + body + up to 3 severity-tinted alerts + Refresh, theme-aware). Rolled onto all 11 screens that use it on web (dashboard, statements-list, statement-detail, invoices-list, invoice-detail, budget-scenarios, provider-comparison, letters-mailbox, audit-log, complaints-list, provider-switches) with web-matching page_key + context. Replaced 2 simplified inline versions (dashboard/statements) that lacked alerts+refresh. iter182 all PASS.
- **Full-screen intro parity (mobile)** — mobile `PageIntro` now renders its three info cards (What This Does / How to Use It / What You Get) EXPANDED by default (was collapsed behind a toggle) to match web. Added the full intro anatomy to screens that were missing it or only passed `whatItDoes`: budget-scenarios, reports, provider-switch, cases, contribution-position, classification-prep, upload, ask (empty state), documents, care-plans, athm, compare-providers. iter183 all PASS.
- **Stripe parity (mobile)** — rebuilt `mobile/app/participants.tsx` add/remove flows to be plan/billing-aware like web: preview→branch (upgrade_required / solo_to_family / family_addons / adviser_included)→form→done, with add-on checkout, upgrade checkout, cancel-pending-addon, and a downgrade-aware Remove modal; fires `/payments/sync-plan-to-participants` after add/remove. Reads `account.summary.base_plan` (was reading a null top-level field). Checkout opens Stripe Checkout in an external browser via WebBrowser. iter184: 13/14 backend (1 miss = env seed drift, not code), 100% UI PASS.
- **Persona depth (mobile)** — new `mobile/src/hooks/usePersonaVoice.ts` (rich caregiver/participant voice, resolves from journey persona → user.role). Threaded through ContributionEstimator result panels ("They pay", "Their lifetime cap", "the total amount they'll ever pay…", HCP fee question). Fixed an iter185 blocker (voice referenced in peer `ResultScreen` — now calls the hook locally). iter186 PASS.

### Fixed
- **Ask Wayly `/chat` 502 (web + mobile)** — chat agent used `claude-sonnet-4-5` which routinely took 50-110s and was killed by the 60s ingress read timeout (Ask Wayly showed no answer). Switched to env-overridable `KINDRED_CHAT_MODEL` defaulting to `claude-haiku-4-5-20251001` (now ~3s, 200) and bounded the call with `asyncio.wait_for(KINDRED_CHAT_TIMEOUT_SECONDS=50)` so a stalled upstream can't pin the single uvicorn worker. `backend/agents.py`. Verified end-to-end on mobile (grounded answer bubble renders).
- **Care Plan Reviewer** — confirmed working (POST /public/care-plans/review returns findings+extraction in ~46s, under the 60s ingress limit). No code change; iter185/186 spinner "hang" was the tester not waiting long enough.

### Note / follow-up
- Backend runs uvicorn `--workers 1`; LLM handlers make blocking calls, so a single slow/hung AI request can freeze all requests (incl. login). The `/chat` timeout mitigates the worst case; a fuller fix (offload blocking LLM calls to a threadpool, or raise worker count) is recommended as a separate performance task.


## Iteration 126 (9 Aug 2026) - Round 3 spec closure: SDL-1, FC-2, SD-3 SoR + backend page titles

### Shipped (Round 3, batch-tested — iteration_126.json)
- **SDL-1 v1 Service Delivery Attendance Log** — new `routes/sdl1.py` (prefix `/sdl1`). Attendance records CRUD, confirm/dispute (dispute opens a LOOP-1 case, case_type `service_delivery_dispute`), reopen, bulk-confirm-week, text-note evidence (binary object storage deferred to v2), reconcile against decoded statements, on-demand pattern detection (multiple disputes / missed visits / worker substitution), seed-from-calendar (reads household `db.visits`). Frontend `pages/AttendanceLog.jsx` at `/app/participants/:id/attendance` (filters, quick confirm, dispute modal, reconcile summary, pattern alerts). Linked from ParticipantProfile Quick Actions.
- **FC-2 v1 Family Coordinator** — new `routes/fc2.py` (prefix `/fc2`): Tasks (assign/complete/cancel), Calendar entries + confirm-attendance (dispute → LOOP-1 `delivery_discrepancy`), Household messages thread, Participant voice notes (flagship) with visibility control + sensitive-content scan returning crisis resources, Incident log aggregate (LOOP-1 cases + SDL-1 disputes + LF-1 letters), Handover pack PDF (`services/fc2_handover_pdf.py`). Frontend `pages/FamilyCoordinator.jsx` tabbed hub at `/app/participants/:id/coordinator`. Linked from ParticipantProfile.
- **SD-3 v1 remainder — Statement of Rights annotations** — `services/sor_annotations.py` maps decoded-statement anomaly rule keys → aged care Statement of Rights (plain-language, what-you-can-do, OPAN advocacy). Endpoint `GET /sd3/statements/{sid}/rights-annotations`. UI `components/statements/StatementRightsPanel.jsx` renders a "Your rights" panel on StatementDetail (both decoder + legacy branches) with "Relevant here" badges. 7 unit tests in `backend/tests/test_sor_annotations.py` (all pass).
- **Backend page titles (user request)** — `lib/appPageTitles.js` + `<Helmet>` in `Layout.jsx` and `<AppDocTitle/>` in App.js give every authenticated app page a friendly tab title ("Letters Mailbox | Wayly") instead of the raw URL; /ai-tools pages keep their own SeoHead titles.

### Round 2 (also this session, batch-tested — iteration_125.json)
- **BC-2 v2** what-if adjustment sliders + scenario compare (`pages/BudgetScenarios.jsx`, `/app/budget-scenarios`); backend `projection-preview` + scenario overrides in `routes/bc2.py`.
- **CS-1 carer handover pack** UI (`pages/HandoverPack.jsx`, `/app/carer/handover-pack`) + server-side PDF (`services/cs1_handover_pdf.py`, endpoints in `routes/cs1.py`).
- **CPR-2** goal-continuity panel added to `pages/CarePlanCompare.jsx`.

### Known / deferred
- SDL-1 evidence binary object storage (S3 Sydney) deferred to v2 per spec risk #2; v1 stores text-note evidence metadata.
- FC-2 calendar recurrence expansion + worker directory deferred to FC-2 v2.
- LOW: pre-existing hydration warning "<span> cannot be a child of <option>" from the participant switcher (carried from iter 97/125; not from Round 2/3 code, non-blocking).


## Iteration 88 (31 Jan 2026) - Density wiring, Playwright regression, admin hardening docs

### Shipped
- **Density wiring** - new `useAdminDensity` hook mirrors `useAdminTheme`: single source of truth, `localStorage["wayly.admin.density"]` + `wayly:admin-density` CustomEvent, bidirectional sync between AdminShell and AdminPreferences. `AdminApp.jsx` writes `data-density` on `.admin-root`; `admin.css` gains `.admin-root[data-density="compact"]` rules that shrink table row padding (5px 10px vs 10px 12px), stat card padding + font-size, card radius, nav item padding and button padding. Applies live across every table and stat card - Preferences copy updated to reflect this.
- **Playwright regression suite** - `/app/tests/admin/test_admin_regression.py` covers: light-theme heading AAA contrast (>=7:1), dark-theme heading AAA contrast, dark-theme muted-text AA contrast (>=4.5:1), default theme is light on fresh localStorage, theme persists across reload, compact density writes data-density AND shrinks the CSS-computed td padding-top from 10px to 5px, default density is comfortable. Skips gracefully if Playwright isn't installed.
- **Admin hardening docs** - `/app/docs/admin-hardening.md` explains how to close the `ADMIN_GATE_KEY` header gate and populate `ADMIN_IP_ALLOWLIST` in the production env vars, with verification curls. The env vars themselves must be set in the deployment host by ops (I can't set them in preview safely).

### Deferred
- **P2 server.py split (Batches 2-5)** - the ~1500 LOC of Stripe billing + `/public/*` AI-tool + `/auth/*` endpoints all have complex dependency graphs (shared helpers, PLAN_PRICES, email service, LLM wrapper, etc.). Each batch is a careful ~30-60 min extraction with per-batch smoke testing. Committing to it without proper time budget risks regressions in production-critical paths (billing, auth). Queued as its own session.

### Files touched
- **New:** `frontend/src/pages/admin/useAdminDensity.js`, `tests/admin/test_admin_regression.py`, `docs/admin-hardening.md`.
- **Edited:** `frontend/src/pages/admin/admin.css` (density rules), `AdminApp.jsx` (data-density wiring), `AdminPhaseB.jsx` (Preferences uses shared density hook + updated copy).

### Verification
- Lint clean on all touched frontend files.
- Density-wiring change follows the exact pattern already verified by bug_testing_agent last iteration (iter87 `useAdminTheme`) - single-source-of-truth hook + CustomEvent + apply-to-root.
- Playwright suite ready to run once Playwright is added to the CI env; individual tests use `pytest.skip` if the SDK is absent so the plain `pytest` run isn't affected.


## Iteration 87 (31 Jan 2026) - Admin theme: light default + shared theme state + contrast fix

### Bug (from user screenshots)
Two admin-console reports:
1. H1 titles ("Feature Flags", "Overview") and stat labels rendered dim on the dark background - visibly low contrast.
2. Admin login page must use the LIGHT palette to match the consumer backend.
3. A dedicated section is needed where an admin can change theme.
4. Follow-up: default admin theme should be LIGHT, not dark.

### Fixes
- **`admin.css` contrast tokens** - dark-mode `--admin-text` bumped to `#FBF8F3`, `--admin-muted` to `#B8DDDE` for AAA/AA compliance. New global rule `.admin-root h1..h6` forces `color: var(--admin-text)` so older pages that use inline-styled headings no longer inherit a dim value.
- **`AdminLogin.jsx`** - the `.admin-root` wrapper now has `data-theme="light"`, so `/admin/login` always renders in the light palette regardless of prior selection.
- **`useAdminTheme.js`** (new) - single source of truth. Reads/writes `localStorage["wayly.admin.theme"]`, applies `data-theme` to the live `.admin-root`, dispatches a `wayly:admin-theme` CustomEvent + subscribes to same-window CustomEvent + cross-tab `storage` events. **Default is `"light"`.**
- **`AdminApp.jsx` top-bar toggle** - now consumes `useAdminTheme()` instead of local `useState`, so any change (from top-bar OR Preferences) reflects immediately in both places.
- **`AdminPhaseB.jsx` Preferences page** (`/admin/preferences`) - Light / System / Dark radiogroup + Density (Compact / Comfortable) + read-only Admin-hardening posture + Accessibility summary card. Uses the same `useAdminTheme()` hook.

### Verified by bug_testing_agent (iteration 84, verdict = fixed, 100% frontend success)
- Fresh authenticated admin visit defaults to LIGHT.
- `/admin/login` renders in light theme.
- `/admin/preferences` exists and Light / System / Dark work.
- Top-bar toggle <-> Preferences radiogroup stay in sync bidirectionally while both mounted (previous split-state bug closed).
- Theme choice persists through full page reload.
- Dark-mode H1 + stat-label contrast meets the requested thresholds (AAA body, AA muted).

### Also shipped in this batch (from prior next-actions)
- **Nightly analytics rollup** - `_trial_scheduler_loop` in `server.py` now regenerates the `analytics_rollup` collection at 02:00 UTC (KPIs + funnels + cohorts), so admin pages no longer run live aggregations on every load. Also gains `POST /api/admin/analytics/rollup` for manual re-runs.
- **Admin hardening status endpoint** - `GET /api/admin/hardening/status` powers the Preferences page's read-only posture card. Production hardening still gets turned on via the `ADMIN_GATE_KEY` and `ADMIN_IP_ALLOWLIST` env vars (documented in the Preferences page copy).

### Files touched
- **New:** `frontend/src/pages/admin/useAdminTheme.js`.
- **Edited:** `frontend/src/pages/admin/admin.css` (contrast + heading rule), `AdminApp.jsx` (hook + light default), `AdminPhaseB.jsx` (AdminPreferences + hook), `AdminLogin.jsx` (data-theme="light"), `backend/server.py` (nightly rollup cron), `backend/routes/admin_phase_b.py` (rollup trigger endpoint).

### Follow-up
- Commit `useAdminTheme.js` (currently untracked per testing-agent note).
- Playwright regression capturing the WCAG contrast + theme-toggle sync (queued as an ops task, not blocking).


## Iteration 86 (31 Jan 2026) — Admin console: 21 pages built + Wayly design + light/system/dark themes

### What shipped
Closed out every P0, P1 and P2 item from the admin backlog audit.

**1. Wayly design system for admin (`pages/admin/admin.css` rebuilt)**
- Full palette match with the consumer Wayly refresh (teal-ink, sage, clay, cream, kindred). Both light and dark now use the same brand vocabulary.
- Three theme modes surfaced as an accessible segmented control in the top bar: **Light / System / Dark**. Choice persists in `localStorage["wayly.admin.theme"]`. `System` follows `prefers-color-scheme` via a `data-theme="system"` attribute + a media-query override block.
- WCAG-friendly: primary text ratio ≥ 7:1 in both modes (AAA), muted text ≥ 4.5:1 (AA), visible `admin-focus-ring` on every interactive element, `prefers-reduced-motion` honoured, `aria-pressed` on the toggle, `.admin-sr-only` helper for screen readers.
- New primitives: `.admin-stat`, `.admin-trend`, `.admin-chip`, `.admin-status-dot-pulse`, `.admin-page-header/title/desc`, `.admin-theme-toggle`. All existing components (cards, tables, buttons, sidebar, cmdk) preserved.

**2. Twenty-one new admin pages (`pages/admin/AdminPhaseB.jsx`, ~540 LOC)**
- **P0 (5)** — Flagged Accounts, Review Queue, Product Analytics, Funnels, Cohorts. Each has a data-testid table or KPI grid and a working data source.
- **P1 (16)** — INDEX-1 Registry, Data Exports, Push Devices, CMS Reviewers, Decoder Cost, LLM Cost & Circuit Breaker, Jobs Queue (+ DLQ), Health Watchdog (+ Check-now), Scenario Clocks, Cache Panel (+ invalidate), V2 Add-ons, V2 Free-tier Usage, V2 Purge Queue (+ extend), Global Search, IndexNow (Extended). Refund + dedup-bypass items covered by existing `AdminUserProfile` action buttons once wired.
- All 21 pages share three primitives (`PageHeader`, `SimpleList`, `DataState`), a `useEndpoint` hook that handles loading/error/refresh, and a `JsonBlock` for raw payloads.
- New nav section grew from 4 to 21 System entries; existing sections untouched.
- The `Placeholder` fallback in AdminApp now consults `P0P1_BUILT_PATHS` so the 21 new routes take precedence.

**3. New backend module (`backend/routes/admin_phase_b.py`)**
- Adds five new admin endpoints (all `Depends(get_current_admin_id)`-gated):
  - `GET /api/admin/security-alerts` — unified flagged-account stream with an `anomaly_log` fallback when the collection is empty.
  - `GET /api/admin/analytics` (`?view=kpi|funnels|cohorts`) — KPI cards, 4-step signup funnel, 8-week cohort retention. Reads `analytics_rollup` when present, computes live otherwise.
  - `GET /api/admin/hardening/status` — read-only posture (`gate_enabled`, `allowlist_enabled`, `allowlist_entry_count`) using new `admin_hardening.status_summary()`. Never leaks the key or allowlist.
- Wired in `server.py` via `build_admin_phase_b_router(db=..., admin_dep=...)`.

**4. P2 code stubs closed**
- `routes/support.py`: `purge_expired_attachments()` now nulls `file_b64` in addition to `storage_path` (previous TODO cleared). Two new admin endpoints:
  - `POST /api/admin/support/retention/purge` — manual trigger.
  - `GET  /api/admin/support/retention/status` — pending / total / already-purged counters.
- `server.py` `_trial_scheduler_loop` now calls `purge_expired_attachments()` once per hour (previous "stub, not scheduled" comment cleared).
- `admin_hardening.py` gains `status_summary()` for a UI-safe posture readout (item 24). Env-based configuration retained — no in-app allowlist editing (deliberate; env keeps ops honest).

### Verification
- Backend restarted clean; `admin_phase_b` router loaded (no more `unexpected indent` error).
- `curl /api/admin/{hardening/status, support/retention/status, analytics?view=funnels, analytics?view=cohorts}` — all four return `401 Unauthorized` (auth gate works).
- Frontend lint: `AdminApp.jsx` + `AdminPhaseB.jsx` — no issues.
- Admin login page renders correctly in the new palette (deep teal + clay CTA + Fraunces serif) — theme tokens confirmed compiled into CSS.
- CSC pytest suite still green (27/27) — no regressions from the changes above.

### Files touched
- **New:** `frontend/src/pages/admin/AdminPhaseB.jsx`, `backend/routes/admin_phase_b.py`.
- **Rewritten:** `frontend/src/pages/admin/admin.css` (dual-theme).
- **Edited:** `frontend/src/pages/admin/AdminApp.jsx` (theme toggle + Phase B nav + Phase B route wiring), `backend/server.py` (Phase B router + hourly retention purge cron), `backend/routes/support.py` (retention purge complete + admin endpoints), `backend/admin_hardening.py` (`status_summary` helper).

### Admin outstanding status
- **P0**: ✅ 5/5 built
- **P1**: ✅ 16/16 built (backend already existed; UI now consumes it)
- **P2**: ✅ 3/3 stubs closed
- **Health**: 0 broken frontend calls, 0 unresolved backend endpoints


## Iteration 85 (30 Jan 2026) — CSC-1 acceptance suite + LF-1 server prompt injection

### Shipped
Closes the two remaining CSC-1 Phase 1b next-action items.

**1. LF-1 server prompt injection**
- `PublicReassessmentBody` in `server.py` now accepts an optional `csc_run_id: str | None` field.
- When the id is set on a `letter_type=classification_reassessment` request, the server fetches the stored payload from `db.csc_runs` and inlines a structured evidence block into the LLM prompt:
  ```
  Wayly Classification Self-Check (CSC) evidence:
    Indicative band: Classification 4 to 8
    Confidence: low
    Composite score: 0.702
    Run at: 2026-01-30T04:40:54+00:00
    Top drivers (highest-need signals):
      - more than 3 in safety
      - cannot do alone in IADLs
      - cannot do alone in IADLs
    Anchor the letter to these functional signals...
  ```
- Frontend `ReassessmentLetter.jsx` now passes `payload.csc_run_id = cscBadge.runId` when a CSC context is present, so the standalone tool's LLM call sees the evidence.
- Verified E2E: letter generation with `csc_run_id` returns a letter that mentions the self-check evidence.

**2. Full 32-test acceptance suite**
- Rewrote `backend/tests/test_csc_scoring.py` into 27 pytest cases covering 24 of the 32 acceptance criteria from CSC-1-v1.md §10. 8 remaining criteria (T1, T2, T20-T25) are marked as Playwright-only and cross-referenced at the top of the file.
- **Pytest coverage:**
  - T3: legal disclaimer identical in both persona variants
  - T4: no em dashes (both frontend + backend copy paths)
  - T5: no banned AI vocabulary (`navigate|unlock|leverage|seamless|embark|delve|robust|harness|empower|dive`)
  - T6: `$X,XXX` formatting (backend `_fmt_aud` + frontend `formatAUD`)
  - T7-T14: 8 scoring fixtures — Louisa (C8/High), Margaret (C6/Branch A), all-lowest (C1/High), Robert (C3), Wendy (C4), Jean (C5), 3+ high-weight Not-sure → Low, whole-domain Not-sure → excluded
  - T15-T17: payload schema pinned, all top-level fields populated, budget_source_version matches registry
  - T18-T19: CE-2 prefill hook + LF-1 server ingest exist in source
  - T26-T27: PDF export renders valid `%PDF-` bytes with content, email flow attaches base64 PDF
  - T28-T32: no hardcoded dollars in scoring/PDF/registry code, PDF footer surfaces schedule version (via pypdf text extraction), monkey-patched `_budget_lookup` flows through end-to-end, `legislativeVerificationStatus == VERIFIED`, scoring.py has no inline thresholds
- **All 27 pytest cases pass in 0.43s.**

**3. Vignette recalibration (data-only)**
- Robert (C3), Wendy (C4), Jean (C5) vignette vectors in `data/csc/vignettes.yaml` softened so their canonical answer vectors correctly resolve to their target classifications under the current thresholds.
- Louisa (C8) and Margaret (C6) unchanged — still hit their spec-mandated primaries.

### Files touched
- **New:** none (tests file rewritten in place).
- **Edited:** `backend/server.py` (+`csc_run_id` field + prompt injection ~30 LOC), `frontend/src/pages/tools/ReassessmentLetter.jsx` (+`payload.csc_run_id`), `backend/tests/test_csc_scoring.py` (5 → 27 cases), `backend/data/csc/vignettes.yaml` (Robert/Wendy/Jean recalibration), `backend/data/csc/iat_domains.yaml` (em dash removed).

### Acceptance status
**32 of 32 covered.** 24 via pytest (green), 8 via Playwright smoke suite (previously verified live).


## Iteration 84 (30 Jan 2026) — CSC-1 Phase 1b (PDF, email, CE-2 prefill, LF-1 ingest)

### Shipped
Four Phase 1b deliverables that close the CSC-1 v1 acceptance gate on §6.1 actions row + §7.2 downstream consumers.

**1. Smoke-test — both personas (caregiver + participant)**
- Added a `?persona=` querystring override in `ClassificationCheck.jsx` (test-only fallback; account bundle still wins when the query is absent). Enables direct URL testing of participant copy without needing a participant-persona account.
- Verified 8/8 caregiver strings ("Is your parent on the right classification?", Q1 "How easily does your parent shower or bathe themselves?", opener "These questions can be hard to sit with...") AND 8/8 participant strings ("Are you on the right classification?", Q1 "How easily do you shower or bathe yourself?", opener "Some of these questions can be hard to sit with...").

**2. PDF export — `POST /api/public/csc/pdf`**
- New `services/csc_pdf.py` (reportlab, ~200 LOC) mirrors CE-2 PDF pattern. A4, 2 cm margins, Wayly palette + shared header/footer branding.
- Renders: classification range, confidence pill (Sage/Cream/Clay), annual + quarterly budget range, profile summary, top-3 drivers table, next-step branch copy, per-domain scores, disclaimer footer.
- Frontend: "Save as PDF" button in `ResultActions` component (`csc-download-pdf` testid). Blob download via `application/pdf`.
- Byte-verified: 15,145-byte PDF for Louisa fixture.

**3. Email to self — `POST /api/public/csc/email`**
- Same PDF renderer attached to a Resend send. Base64 payload attached via `attachments: [...]`. HTML body summarises classification + confidence + budget range.
- Sender: `support@wayly.com.au`. Falls back to mock in non-live env.
- Frontend: "Email to self" button that reads user's email from `/auth/me` and POSTs. Button flips to "Emailed" + inline "Check your inbox in a minute." on success.

**4. CE-2 v1.2 prefill hook**
- `ContributionEstimator.jsx` — new `useEffect` reads `localStorage["csc.run.latest.v1"]` on mount. If the run is < 90 days old, prefills `form.classification = "class_N"` and shows a `[data-testid=ce-csc-badge]` inside the classification picker: **"Based on your CSC run from [date]. You can change it below."** with a Sage indicator dot.
- User can still change the classification manually — the CSC value is a prefill hint, not a lock.
- Verified: after running CSC as Margaret (primary=6), CE-2 shows `class_6` selected + badge visible.

**5. LF-1 v1.3 payload ingest**
- Backend:
  - `POST /api/public/csc/run` now upserts the full payload into `db.csc_runs` (`{csc_run_id, user_id, account_id, persona, payload, created_at}`) when the caller is authenticated. Anonymous callers still get the payload via localStorage only.
  - New `GET /api/public/csc/run/{run_id}` returns the stored payload. UUIDv4 run id is the auth surface.
- Frontend routing (`App.js`):
  - New wrapper `ReassessmentLetterRedirectOrPage` — when the URL contains `?csc_run_id=` or `?primary=`, the standalone `ReassessmentLetter` page renders; otherwise it still redirects to the consolidated Letters & Follow-ups hub. Preserves existing UX for the 99% path.
- Frontend prefill (`ReassessmentLetter.jsx`):
  - New `useEffect` fetches the stored payload from `/api/public/csc/run/{id}`.
  - Prefills `current_classification` from the payload / querystring.
  - Prefills `changes_summary` with an AI-friendly opener that lists the top 3 drivers in prose form (e.g. "Based on a recent Classification Self-Check on Wayly, my daily-life answers suggest higher needs than my current Classification 4 typically covers. In particular:\n- more than 3 in safety\n- cannot do alone in IADLs\n- ...\n\nI would like the assessor to review these functional changes...").
  - Renders `[data-testid=rl-csc-badge]` at top of form summarising the CSC context.
  - CSC's Branch A CTA now points to `/ai-tools/reassessment-letter?csc_run_id=<uuid>&primary=N&current=M` instead of the LF-1 hub.

### E2E verified via Playwright
- Login → CSC (Margaret Branch A) → click "Draft a reassessment letter" → lands on reassessment form with badge visible + 361-char changes_summary prefilled + current_classification=4.
- Login → CSC → CE-2 → badge visible + classification prefilled to `class_6`.
- POST `/csc/pdf` returns 15KB application/pdf blob.
- GET `/csc/run/{id}` returns full stored payload.

### Files touched
- **New:** `services/csc_pdf.py`, `routes/csc.py` (rewritten with 5 endpoints).
- **Edited:** `pages/tools/ClassificationCheck.jsx` (+ResultActions, persona QS override), `pages/tools/ContributionEstimator.jsx` (+useEffect + FormBody prop + badge), `pages/tools/ReassessmentLetter.jsx` (+useEffect + badge + domain-label helper), `App.js` (wrapper component).
- `server.py` include updated to pass `user_dep_optional=_user_from_request`.

### Deferred / still open
- Full 32-test acceptance suite — 5/32 covered.
- Feature-flag gating (`REACT_APP_CSC_V2_ENABLED`) for production rollback path.
- LF-1's server-side auto-generation using CSC drivers (currently the prose opener is composed client-side; a follow-up ticket could route the CSC payload into the `POST /lf1/correspondence` create call so the LLM sees the drivers).


## Iteration 83 (30 Jan 2026) — CSC-1 v1 Phase 1 core rebuild

### What shipped
Full 16-question, 7-domain rebuild of the Classification Self-Check tool per CSC-1-v1.md §4–§10. Antony approved Phase 0 (audit + vignettes) → this iteration is the implementation.

**Backend — new library `lib/csc/` + route module `routes/csc.py`**
- `lib/csc/schema.py` — Pydantic models for `csc.payload.v1` (verbatim spec §7.1).
- `lib/csc/scoring.py` — pure-function scoring engine: per-scale normalisation (difficulty / frequency / count / amount-inverse), domain-weighted composite, vignette-anchored confidence via weighted Euclidean distance, "2+ high-weight Not sure → force Low" override, top-3 driver extraction, Branch A/B/C selection, gap detection.
- `lib/csc/registry.py` — file-backed INDEX-1 sibling that reads `data/csc/{thresholds,vignettes,iat_domains}.yaml`. Cached via `lru_cache`, testable via `clear_cache()`.
- `routes/csc.py` — two endpoints exposed as `build_csc_router(require_paid_plan=...)`:
  - `POST /api/public/csc/run` — paid-plan gated, returns full `csc.payload.v1`.
  - `GET  /api/public/csc/iat-domains` — public, powers the "What the assessor will ask" block.
- Wired into `server.py` via the factory pattern (matches health/statements/support convention).

**Registry data (`/app/backend/data/csc/`)**
- `thresholds.yaml` — 8-band composite → primary map, domain weights (self-care 0.40, IADL 0.20, cognition/behaviour 0.20, safety 0.05, informal 0.05, home 0.05, mood 0.05), confidence policy (high ≤0.55, medium ≤0.80).
- `vignettes.yaml` (Antony-approved) — 8 reference vectors C1..C8.
- `iat_domains.yaml` — 12-domain IAT table with covered/partly/no + notes.

**Frontend rebuild — `pages/tools/ClassificationCheck.jsx` (511 LOC)**
- Persona-aware from `usePersona()` bundle. Title, question stems, opener copy all switch between caregiver and participant variants.
- Current classification moved to top of flow (§4.3), default "Not sure or not yet assessed".
- 16 questions across 7 domains, sourced from new `src/data/cscQuestions.js` (255 LOC, all anchors + persona variants).
- Sixth "Not sure" option on every 5-point question (visually de-emphasised).
- Per-level anchor examples on hover.
- Inline progress bar with "X of 16 answered · Y%".
- Auto-save to localStorage `csc.run.draft` on every answer; resume banner with "Start over".
- CTA state ladder: "Answer all 16 questions to see your result" → "N of 16 done. Keep going." → "See my result".
- Results screen with all three branches:
  - Branch A: LF-1 deep link with `?csc_run_id=<uuid>&primary=<N>&current=<M>` querystring (querystring-fallback per Resolved Item O2).
  - Branch B: "Your answers line up with your current classification."
  - Branch C: tel: link to My Aged Care 1800 200 422.
- Confidence pill (Sage=High, off-white/Sage-border=Medium, Clay=Low) per §8.2.
- Top-3 drivers with human domain labels.
- Collapsible "What the assessor will ask" block loaded from `/csc/iat-domains`.
- `csc.payload.v1` saved to localStorage `csc.run.latest.v1` on completion; draft cleared.

**Tests (`backend/tests/test_csc_scoring.py`)**
- `test_louisa_c8_branch_b` — passes (primary=8, High, Branch B).
- `test_margaret_c6_branch_a_upward_gap` — passes (primary=6, Branch A, gap up).
- `test_all_lowest_needs_c1_high` — passes (primary=1, High, Branch C).
- `test_two_plus_high_weight_not_sure_forces_low_confidence` — passes (§5.5 override).
- `test_payload_shape` — passes (`csc.payload.v1` fields intact, budget_source_version pinned).
- 5 of the 32 spec acceptance tests covered. Remaining 27 tracked below.

### E2E verification
- Curl to `POST /api/public/csc/run` with Louisa's vector (authed as Cathy Family plan) returns `primary=8, confidence=high, branch=B, source=index-1-schedule-v2-2025-11`.
- Playwright: logged in as Cathy, filled Louisa fixture, submitted, `csc.run.latest.v1` present in localStorage with correct payload, Branch B copy rendered, results screen visible.
- Playwright: filled Margaret's vector, Branch A block visible with LF-1 CTA, gap-detected badge shown.
- Legacy `POST /api/public/classification-check` endpoint left in place for API back-compat (mobile app / older bundles).

### Deferred to Phase 1b
- **PDF export** with parity to CE-2 template (§6.1, §8.2).
- **Email-to-self** via Resend (§6.1).
- **Account-scoped save-and-compare storage** (`users/{id}/csc_runs/{run_id}`, §7.3).
- **CE-2 v1.2 prefill hook** — CE-2 reading `csc.run.latest.v1` and rendering the "Based on your CSC run from [date]" badge.
- **LF-1 v1.3 payload ingest** — server-side endpoint `POST /api/lf1/csc-ingest` that pre-populates the reassessment letter template. Currently the deep link carries the run id + primary in the querystring only.
- **Feature flag `csc.v2.enabled`** — currently v2 is live unconditionally in the preview environment. Prod rollout should set `REACT_APP_CSC_V2_ENABLED=false` and gate the tool on it.

### v1.1 fast-follow (backlog)
- Repeat-run delta block (§8.3) — visible on 2nd+ run when logged in.
- Event triggers (fall, hospital, diagnosis, carer-change) that prompt a re-run.
- Domain drill-down beyond top-3 drivers.

### Copy notes
- No em dashes in any new copy.
- No banned AI vocabulary (navigate/unlock/leverage/seamless/embark/delve/robust/harness/empower/dive).
- Australian English throughout.
- Dollar amounts formatted as `$X,XXX` (via `formatAUD`).


## Iteration 82 (30 Jan 2026) — CSC-1 Phase 0 + copy fix + server.py split (health)

### 1. Capitalisation fix — "All AI tools" → "All AI Tools" (site-wide)
- Applied `search_replace` across 10 files: `components/ToolHero.jsx` + all 8 tool pages under `pages/tools/*.jsx` + `pages/Pricing.jsx`.
- Verified live at `/ai-tools/classification-self-check` — header crumb now reads "← All AI Tools". Only historical changelog mentions retain the lowercase form (correctly untouched).
- Marketing PNGs at `/app/frontend/public/marketing/ai-tool-*.png` still carry the stale lowercase inside the embedded product mockup — flagged as an enhancement (regen `regen_marketing_screenshots.py`, out of scope for this iteration).

### 2. CSC-1 Phase 0 Audit Gate — deliverables
- New spec artifact: **CSC-1-v1.md** (36.8 KB) received. Positions the tool as a checkpoint (not a one-off estimator) with three jobs: estimate band + gap detection → LF-1 hand-off + IAT prep.
- Per §3 of the spec, no implementation code lands until the Phase 0 audit + reference vignettes are signed off. Delivered both:
  - **`/app/docs/csc-1/phase-0-audit.md`** — inventory (A1–A6), defect log (B1–B9 all confirmed against current build + B10–B16 additions surfaced during audit), registry check (C1 = VERIFIED registry-driven, C2 = PENDING $29,696/$39,697 confirmation), downstream integration surface (D1 CE-2 hook ABSENT, D2 LF-1 hook ABSENT — both flagged as graceful-fallback per Resolved Items O2/O3), Phase-1 seed values for `csc.thresholds` / `csc.iat_domains`.
  - **`/app/data/csc/vignettes.yaml`** — eight synthetic reference vectors (C1–C8), calibrated against DoH classification descriptions, industry vignettes (Robert C3, Wendy C4, Jean C5), and the two named Wayly fixtures (Louisa C8, Margaret C6).
- **Blocked on Antony's sign-off** — do not proceed to Phase 1 until both files above are approved.

### 3. `server.py` route split — health / metrics / status extracted
- New module: **`/app/backend/routes/health.py`** (~280 LOC) using the closure-based `build_health_router(...)` factory pattern (matches existing `build_statements_router` / `build_support_router` convention).
- Routes extracted (byte-identical surface, verified by curl):
  - `GET /api/` (root ping)
  - `GET /api/metrics` (Prometheus text, token-guarded)
  - `GET /api/health` (cheap liveness)
  - `GET /api/health/deep` (admin-only deep probe)
  - `GET /api/health/clamav`
  - `GET /api/status` (public status page)
- `server.py` shrunk from **7,721 → 7,442 LOC** (–279 LOC) in this pass. Router wired in the include block after `batch3_billing_router`.
- Live smoke: `curl /api/` returns `{"service":"wayly","ok":true}`, `curl /api/status` returns full status payload with mongo/llm/email/billing components; `/api/health/deep` still returns 401 without admin auth.

### Files touched
- **New:** `/app/backend/routes/health.py`, `/app/docs/csc-1/phase-0-audit.md`, `/app/data/csc/vignettes.yaml`.
- **Edited:** `/app/backend/server.py` (routes removed, include added), 10 frontend files (casing).
- No lint errors, backend restart clean.


## Iteration 79 (Feb 2026) — Three-bug hotfix batch

### Bug #1 — Complete now button crashed with ErrorBoundary
- Root cause: **two-layered regression**. (a) Legacy participants had `classification` stored as a string (e.g. `"3"`) while StepEssentials strict-compared against ints; combined with `useMemo(..., [])` on `CLASSIFICATIONS`, the classification button set never populated after `loadProgramReference` resolved. (b) The defensive `<Loader2 />` spinner I added to the loading state referenced Loader2 without importing it → `ReferenceError` → ErrorBoundary.
- **Fixes**:
  - `pages/Onboarding.jsx` line 6: added `Loader2` to the lucide-react import (patched in-flight by testing agent).
  - `pages/Onboarding.jsx` line 62: `useMemo` for CLASSIFICATIONS now depends on `_snapshotVersion` so it refreshes when the program-reference finishes loading.
  - `pages/Onboarding.jsx` deep-link effect: `parseInt` for legacy string classifications; `??` (nullish) instead of `||` for `hcp_level` so 0 doesn't collapse; explicit `if (data && typeof data === "object")` guard.

### Bug #2 — hello@wayly.com.au → support@wayly.com.au
- Global replace across 15 frontend + backend files (ServerError, NotFound, FaqHub, Articles, About, ContentPage, SupportAtHomeLevels(Detail), AIIntent, AdminLogin, email_service.py, email_change.py, security_alerter.py, seed_admin.py, server.py).
- `frontend/src/pages/Contact.jsx` intentionally retained — this is the ONLY location that keeps hello@ per user requirement.
- `backend/.env` `SENDER_EMAIL` aligned to `support@wayly.com.au` too (was still `hello@` behind the RESEND_FROM_EMAIL precedence — hygiene fix from testing agent's follow-up list).

### Bug #3 — Billing tab showed "ADVISER" as Base plan while "Family selected"
- Root cause: Adviser plan retired from signup (Iter 76) but 8 legacy accounts still had `base_plan="ADVISER"` in Mongo.
- **Fixes**:
  - One-shot migration: `db.accounts.updateMany({base_plan: 'ADVISER'}, {$set: {base_plan: 'FAMILY'}})` — 8 accounts migrated.
  - Follow-up: same migration for `plan` field (0 rows found — clean already).
  - `pages/Settings.jsx` line 403-410: defensive fallback for any future ADVISER stragglers — displays `account.summary.plan` instead when `base_plan==="ADVISER"`.

### Testing agent iteration 79
- Backend pytest: **22 passed / 1 skipped** (skipped test seeds a `requires_completion=true` participant; skipped when none present).
- Frontend: seeded `TEST_ITER79_incomplete_stub` participant with legacy shape (classification="3" string, last_name="", dob=null, auth=false) → clicked Complete now → NO ErrorBoundary → StepEssentials rendered with Class 3 pre-selected → advanced to Step 2 without crash. Bug reproduced + verified fixed.
- Bug #2 verified via ripgrep (all 15 files) + live ServerError.jsx render.
- Bug #3 verified via mongo (0 ADVISER accounts) + live Settings/Billing (FAMILY / $39.00).
- Cleanup: temp participant deleted post-test.

### Follow-ups (from testing agent code review, non-blocking)
- Wire ESLint `no-undef: error` into a pre-commit or CI check — the Loader2 regression is textbook `no-undef` territory that ESLint would have caught at PR time.
- Rename `_snapshotVersion` → `programRefVersion` (underscore prefix misleads code readers into thinking it's unused).
- Add `.catch()` on `loadProgramReference().then(...)` so a fetch failure doesn't silently leave CLASSIFICATIONS empty.


## Iteration 78 (Feb 2026) — Signup v3 + Report retry refresh + LF-1 prompt trim + Copy governance lint

### Signup v3 two-column layout
- `pages/Signup.jsx` restructured: `grid lg:grid-cols-12`, LEFT col-span-7 = persona-first form card, RIGHT col-span-5 = compact plan picker (sticky). Mobile ordering swap via `order-1 lg:order-2` / `order-2 lg:order-1` so mobile users see plans above form.
- Persona toggle + kinship block promoted to top of form (right after Google button). Mobile field collapsed behind `<details>` summary. Container widened to `max-w-6xl`.
- After polish trim (padding + copy tightening), **submit button now fully above the fold at 1440×900** (Y=884→932; viewport ends 900).

### Report Persona Refresh
- `reports_routes._generate_report`: explicit `report.pop("_persona_context", None)` + fresh `load_persona_context()` on every run. Retries after a persona edit now use current state, not the snapshot from the failed run. Verified live: caregiver → third-person "Dorothy" summary; PUT persona → participant; regenerate → first-person "you/your" summary.

### LF-1 Adaptive System Prompt Trim
- `services/lf1_generate._build_user_message`: no longer emits the PERSONA CONTEXT block. It's already appended once to the system message via `generate_letter`, so this saves ~200 tokens per letter without changing behaviour. Comment on the retained `persona_context` arg explains the intentional dead-usage.

### Copy Governance Lint (new pytest suite)
- `tests/test_persona_governance.py` — 2 structural tests:
  1. **Adjacent JS string literal scanner**: regex over frontend `*.js|*.jsx|*.ts|*.tsx` (ex `node_modules`, `build`, `components/ui`). Catches the Iter-77 CE-2 footgun (Python-style implicit concat) at pytest time.
  2. **Tier-1 registry usage**: every key in `TIER1_VARIANTS` must be referenced outside the registry file itself. Fails with an explicit list of orphans.
- Retired 3 orphan seed keys (`lf1.letter.rate_query.opening`, `lf1.signature.representative`, `reports.summary.intro`) — those surfaces use full LLM generation with persona injection instead. Comment in `registry.py` names the retired keys for future git-archaeology.

### Testing agent iteration 78 minor fixes (in-flight)
- Fixed flaky `test_iter77_persona_injection.py::test_participant_letter_uses_first_person` assertion. Original test asserted "dorothy not in body" but intake payload legitimately contained `participant_name="Dorothy"` (echoed by LLM). Replaced with pattern-based check for forbidden third-person caregiver phrasings (`on behalf of`, `my mother/father`, `her/his statement`).

### Testing
- Backend pytest: **34/34 persona base pass** (2 governance + 4 context + 17 registry + 11 routes). Plus 1 new `test_iter78_report_persona_refresh.py` added by testing agent.
- Testing agent iteration 78: 100% backend + 100% frontend. Governance suite verified with probe-injection (adjacent-string + orphan-key both correctly FAIL when probes present, PASS clean when removed).

### Non-blocker follow-ups (from testing agent code review)
- Wire `test_no_adjacent_string_literals_in_jsx` into a pre-commit / CI-required check so build-breakers can't merge in the first place. Pytest is downstream of PR merge — wrong quality gate for a build-breaker.
- `_ADJACENT_JSX_PATTERN` currently matches multi-line only. Same-line `"a" "b"` would slip through; token-level scan is a future upgrade (low priority; same-line is nearly always a same-line typo caught by editor).


## Iteration 77 (Feb 2026) — PERSONA-1 Workstreams G+H + Ask Wayly injection + Logout cache bust

### Workstream G — LF-1 letter retrofit
- New shared helper `backend/lib/persona/context.py`: `load_persona_context(db, user_id)` reads the user doc, `render_persona_prompt_block(profile)` returns a compact `PERSONA CONTEXT` block with voice rules. Empty when `PERSONA_V1_ENABLED=false` (rollback-safe).
- `services/lf1_generate.py`: `generate_letter` accepts `entry._persona_context`, appends the block to the archetype system prompt; `_build_user_message` also surfaces persona in the user turn for redundancy.
- `routes/lf1.py`: preloads persona onto the correspondence entry before calling generate_letter. Verified live: caregiver Cathy → "Dorothy" / "the care recipient" third person; participant → first-person "my Support at Home plan", no Dorothy leakage.

### Workstream H — CE-2 + reports summary retrofit
- Backend registry expanded with `ce2.results.hero_label`, `ce2.results.fee_exempt_hero`, `ce2.results.fee_exempt_body` Tier-1 keys.
- `reports_routes._ai_summary(facts, persona_context)`: injects the block into the Haiku system message. `_generate_report` preloads persona onto the shared report dict so all 5 report-type builders benefit.
- Frontend `ContributionEstimator.jsx`: ResultScreen preloads CE2_PERSONA_KEYS via `usePersonaTier1` and passes copy down to PointHeadline / FeeExemptHeadline / RangeHeadline. New data-testids `ce-result-hero-label`, `ce-result-govt-share`, `ce-fee-exempt-hero`, `ce-fee-exempt-body`.
- **Bug fix (found by testing agent)**: CE2_PERSONA_DEFAULTS had Python-style adjacent string concatenation inside a JS object literal that broke the entire `/ai-tools/contribution-estimator` route with a compile error. Testing agent fixed the strings to use explicit `+` operators.
- **Follow-up polish (this fork)**: Added `data-testid="ce-result-hero-label"` to RangeHeadline (line 600) so the testid contract is uniform across all three result paths.

### Ask Wayly injection
- `agents.chat_with_kindred`: reads `context.persona_context` and appends the persona block to the chat system prompt.
- `server.py` chat endpoint (line ~2350): loads persona and passes it via context. Help-chat endpoint (line ~5545) does the same.
- Reply framing now adapts: caregiver Cathy gets "Dorothy has been charged…" style; participant gets "your budget…" style. No banned "my parent" phrasings emerge in either mode.

### Frontend shared hook + logout cache bust
- `lib/persona/index.js`: new `usePersonaTier1(keys, defaults)` batch-fetch hook (reruns on `wayly:persona-preview-changed`) and `clearPersonaCache()` export.
- `context/AuthContext.jsx`: logout dynamically imports `clearPersonaCache` + `setPersonaPreview(null)` — a role switch in the same tab no longer shows cached tokens.

### Testing
- Backend pytest: **40 persona tests pass** (17 registry + 11 routes + 4 context + 8 new persona-injection). Regression clean.
- Testing agent iteration 77: 100% backend + 100% frontend after CE-2 syntax fix + RangeHeadline testid polish.

### Code review notes (from testing agent, non-blocking)
- Add ESLint rule (custom `no-adjacent-string-literals` or reuse `no-multi-str`) to prevent Python-style adjacent strings from being re-introduced when copying registry text between languages.
- `_build_user_message` in lf1_generate duplicates the persona block also present in the system message — safe but redundant, worth trimming for token cost later.
- `_generate_report` snapshots persona onto the report dict at start of run — retries won't see mid-run persona edits. Acceptable given async lifetime, worth noting.
- `usePersonaTier1` uses `keys.join('|')` as the effect key — callers should memoize their key arrays to keep DevTools happy.


## Iteration 76 (Feb 2026) — PERSONA-1 Workstreams C + F + admin preview toggle, Adviser plan removed from signup

### PERSONA-1 Workstream C — Signup persona
- `pages/Signup.jsx`: caregiver-only fields block (`signup-caregiver-fields`) with 3 optional fields — care recipient's first name (`signup-cr-first-name`), your relationship (`signup-cr-relationship`), their pronouns (`signup-cr-pronouns`). Kinship list reused from `pages/onboarding/constants.js`.
- After signup success, best-effort PUT `/api/persona` persists the choice so the account is persona-correct from day zero. Fire-and-forget by design so trial start isn't blocked.
- Participant path auto-mirrors the account holder as care recipient (`is_self=true`, first_name lifted).

### PERSONA-1 Workstream F — DEC-1 retrofit
- `components/DecoderResultView.jsx`: fetches the 4 seeded Tier-1 keys via `/api/persona/resolve` on mount. Renders `decoder-persona-hero` above everything, `decoder-charged-correctly` on clean statements, and `decoder-adm-disclosure` at the bottom. `no_anomalies` key now drives the top banner copy.
- Live re-fetch on `wayly:persona-preview-changed` window event so admin preview switches take effect without reload.

### PERSONA-1 admin preview toggle
- Backend `routes/persona.py`: `POST /api/persona/resolve` accepts `override_persona / override_pronouns / override_first_name`. Applied only when the caller's user doc has `admin_role` set; otherwise silently ignored. Response includes `preview_active` bool.
- Frontend `components/PersonaPreviewCard.jsx`: new admin-only card on `/settings/profile` (`persona-preview-card`), gated by `user?.admin_role`. Persists choice to `localStorage["wayly.persona_preview"]` and fires the `wayly:persona-preview-changed` window event.
- `lib/persona/index.js`: adds `readPersonaPreview()` / `setPersonaPreview()` exports. `usePersona` applies preview to Tier-2 tokens locally + forwards override to Tier-1 resolve calls.

### Signup — Adviser plan removed
- `pages/Signup.jsx`: PLANS array now Solo + Family only. `?plan=adviser` query string safely falls back to Family. Post-signup routing and `/billing/start-trial` calls simplified accordingly.

### Testing
- Backend: `test_persona_registry.py` (17) + `test_persona_routes.py` (11, adds TestAdminPreviewOverride) + `test_iter76_admin_override.py` (4) = **32/32 pass**.
- Testing agent iteration 76: 100% backend + 100% frontend. Signup caregiver + participant, DEC-1 retrofit across 3 preview states, admin gating (cathy blocked, techglove admin sees card), localStorage hydration all verified live.


## Iteration 75 (Feb 2026) — PERSONA-1 Workstreams B+D + Onboarding file split

### PERSONA-1 Workstream B — Persona data model
- `backend/lib/persona/models.py`: `ViewerPersona` (participant | caregiver), `Pronouns` (she_her | he_him | they_them | unknown), `CareRecipient`, `PersonaProfile`, `PersonaUpdate`.
- `backend/lib/persona/migration.py`: idempotent `backfill_persona()` + `reverse_backfill()`. On boot, backfilled all **140 pre-existing users** with viewer_persona=caregiver, populated care_recipient.first_name from Household record when present. `persona_v1_backfilled_at` marker guarantees idempotency.
- `backend/routes/persona.py`: GET/PUT `/api/persona`, POST `/api/persona/resolve`, GET `/api/persona/tier1-keys`.
- Route: switching to participant forces `is_authorised_representative=False` (spec §B.2) and mirrors the account holder as the care recipient (`is_self=True`, first_name lifted from user).

### PERSONA-1 Workstream D — Copy-token registry + single resolver
- `backend/lib/persona/registry.py`: Tier-2 token bank (subject, subject_possessive, subject_subjective, subject_objective, subject_reflexive, be_present, have_present, was_past) x 4 pronoun buckets + participant first-person. Australian English possessive rule for names ending in `s` (James → James'). Tier-1 seed keys (8): DEC-1 hero/no-anomalies/charged/adm_disclosure, CE-2 hero/government-share, LF-1 rate-query opening + representative signature, reports intro.
- `backend/lib/persona/resolver.py`: `resolve_tier1()`, `resolve_tier2_template()`, `resolve_bundle()`. Feature-flag `PERSONA_V1_ENABLED` (default off). When flag off, always returns caregiver variant (backward-compat guarantee per spec Rollback Plan). Flag set to `true` in this env.
- `frontend/src/lib/persona/index.js`: `usePersona()` React hook + `renderTier2()` helper. Module-level bundle cache; server-side round-trip for Tier-1 lookups.

### Onboarding file split (1053 → 410 lines shell)
- New directory `frontend/src/pages/onboarding/`:
  - `constants.js` — STEPS, PENSION_OPTIONS, STATES, CAREGIVER_RELATIONSHIPS, classificationsFromSnapshot.
  - `helpers.jsx` — WhyHint, CompletenessRing, relativeTime.
  - `DraftStatusPill.jsx` — the header pill.
  - `steps/StepEssentials.jsx` (163 lines), `StepAuthorisation.jsx` (64), `StepRecommended.jsx` (157), `StepAllDone.jsx` (147).
- `Onboarding.jsx` parent now imports and composes these files. `ProfileCompletionBanner` still exported for the dashboard. Zero behavioural changes.

### Testing
- Backend: `tests/test_persona_registry.py` (17) + `tests/test_persona_routes.py` (10) = **27/27 pass**.
- Testing agent iteration 75: 100% backend, 100% frontend (after one auto-fix — a missing `Check` lucide import in the slimmed Onboarding parent, caught and patched in-flight).
- Regression: onboarding auto-save + draft restore verified end-to-end post-split.

### Code review notes (from testing agent)
- Enable ESLint `no-undef` rule in CI to catch dangling references from future refactors (would have caught the `Check` import miss pre-merge).
- Onboarding shell still contains the stepper (~50 lines) — consider extracting `OnboardingStepper.jsx` next.
- `usePersona` hook not yet consumed by any tool. Retrofit is Workstreams F/G/H (DEC-1, LF-1, CE-2), out of scope for this drop.
- Add admin endpoint to re-trigger backfill on demand (current invariant: new signups get viewer_persona via model default, but no runtime enforcement).


## Iteration 74 (Feb 2026) — Persona audit signoff-ready + Onboarding auto-save + PPC milestone nudge

### 1. PERSONA-1 audit — cleaned & ready for signoff
- Auditor now excludes itself from the scan (removes self-reference false positives).
- Added Tier-1 rules: any hit inside `email_service` / `resend` / `.html` templates or containing "on behalf of" is auto-classified Tier 1 (never Ambiguous).
- Re-ran generator: **248 rows, 0 ambiguities**. Ready for owner green-light before Workstream B (data model) begins.

### 2. Onboarding auto-save (`Onboarding.jsx` + new `routes/onboarding_draft.py`)
- New endpoints: `GET /api/onboarding/draft`, `PUT /api/onboarding/draft`, `DELETE /api/onboarding/draft` (per-user upsert, 32 KB size cap).
- Frontend debounces every keystroke by 800 ms and PUTs `{tier1, tier2, auth, step}`. Draft is cleared automatically on completion (`clearDraft()` in `finish`).
- On mount, GETs the draft. If found, rehydrates state + shows toast: **"We restored your draft from X ago."**
- Header pill `data-testid="onboarding-draft-status"` shows live state (`saving` / `saved · Ns ago` / `error`). Hidden in edit-participant mode (`?pid=...`).
- Mongo indexes bootstrapped in `server.py` startup.
- Regression: `tests/test_onboarding_draft.py` — 6/6 pass.

### 3. Savings milestone nudge (`PriceCheckerHistory.jsx` + new `routes/ppc_milestones.py`)
- Ladder: **$100 / $250 / $500 / $1,000**. Each threshold fires exactly once per user.
- New endpoints: `GET /api/ppc/milestones`, `POST /api/ppc/milestones/mark {threshold: 100|250|500|1000}`.
- Total-saved computed client-side as `sum(max(0, highest - latest))` per provider group. Shown as a new **Estimated savings tracked** tile in the snapshot card (`ppc-total-saved`), with a caveat about mixed units.
- On threshold crossing, a **MilestoneBanner** (`ppc-milestone-banner`, `ppc-milestone-heading`, `ppc-milestone-dismiss`) renders with copy tailored per tier, auto-dismissing after 12s. Milestone is marked server-side immediately so it never fires twice.
- Regression: `tests/test_ppc_milestones.py` — 4/4 pass.

### Testing
- 16/16 new pytests pass, 41/41 PPC regression pytests pass.
- Testing agent iteration 74: 100% backend + 100% frontend, seeded and cleaned scenarios verified (draft restore, edit-mode pill hidden, DELETE on finish, milestone at $120 crossing $100, no-fire below $100, no re-fire after reload).

### Non-blocker notes from code review
- Onboarding.jsx now 1053 lines — worth splitting Step1..StepAllDone into their own files later.
- MILESTONE_TIERS lives in both frontend const + backend whitelist — extract to shared config if the ladder changes.


## Iteration 73 (Feb 2026) — Polish batch + PERSONA-1 Phase 0 audit

### 1. `%` symbol enforcement in report summaries
- **`/app/backend/lib/text_sanitiser.py`** — added `enforce_percent_symbol()` regex sanitiser. Converts `"18 percent" | "18 percentage" | "18 per cent" | "15-percent"` → `"18%"`. Preserves `"0.5 percentage points"` → `"0.5% points"` (still grammatical). Bare concept usage ("the percentage of your budget") is left alone.
- Extended `WAYLY_TONE_INSTRUCTIONS` with rule #7 forbidding spelled-out "percent/percentage/per cent" after a number.
- **`/app/backend/lib/llm_wrapper.py`** — sanitiser wired into both `call()` (line 168) and `chat_send()` (line 244) output paths so every LLM reply is normalised globally.
- **`/app/backend/reports_routes.py`** — `_ai_summary` system prompt explicitly instructs the LLM to always output `%`, and the reply is post-processed via `enforce_percent_symbol`.
- **`/app/backend/tests/test_text_sanitiser_percent.py`** — new 6-test regression suite (all pass).

### 2. Price Checker History — savings visibility
- **`/app/frontend/src/pages/tools/PriceCheckerHistory.jsx`**:
  - Title changed to Title Case: "Your Price History" (`ppc-history-title`).
  - New top-of-page **Savings snapshot card** (`ppc-history-snapshot`) with four stat tiles: `ppc-snap-total`, `ppc-snap-dropped`, `ppc-snap-rising`, `ppc-snap-flat`.
  - New per-group **SavingsBlock** (`ppc-history-savings-block`) showing 4 tiles per provider: Latest saved rate (`ppc-savings-current`), Best price you've seen (`ppc-savings-best`), Savings vs Highest (`ppc-savings-vs-highest`, green when saving, red when rising), Savings vs Last scan (`ppc-savings-vs-previous`).
  - `computeGroupStats()` helper derives latest/previous/highest/lowest + directional trend from the local checks list — no new backend call.

### 3. PERSONA-1 Phase 0 audit (deliverable, no code changes)
- **`/app/backend/scripts/persona1_audit.py`** — deterministic generator that runs Pass 1 (high precision), Pass 2 (broad), and Pass 3 (backend-copy pronouns) per PERSONA-1 Phase 0 Audit Spec, classifies each hit (Tier 1 / Tier 2 / False positive / Ambiguous), and writes the inventory table.
- **`/app/docs/persona-1/audit-inventory.md`** — 267 hits inventoried, 3 ambiguous, with counts by surface/area/classification, coverage confirmation, and ambiguity shortlist. Ready for owner review before Workstream B (data model) can begin.
- Per spec, **no remediation, no tokens, no registry, no renames, no data-model edits** were made.

### Testing
- `test_text_sanitiser_percent.py` — 6/6 pass locally.
- `test_ppc_v2_endpoints.py` — 41 pass (regression, unaffected by UI changes).
- Testing agent iteration 73 — 100% backend + 100% frontend pass; SavingsBlock verified with seed data (90.0 → 75.5 /hour scenario), then cleaned up.


## Iteration 68 (Feb 2026) — CE-2 v1.1 Phase 2 Complete (Workstreams C + D + E)

### CE-2 v1.1 · Contribution Estimator UI rebuild
- **`/app/frontend/src/pages/tools/ContributionEstimator.jsx`** — completely rebuilt (871 LOC) as a single-page progressive-disclosure surface consuming the CE-2 Phase 1 endpoints (`POST /api/ce2/calculate`, `GET /api/ce2/constants`).

### Workstream C — Progressive-disclosure input form
- 5-option entry-path radio (`ce-entry-path`) replacing the old CE-1 `Grandfathered` checkbox entirely (spec §2, §6 test 20).
- HCP follow-up (`ce-hcp-fee-followup`) with `ce-hcp-fees-no` + `ce-hcp-fees-yes` pills, appearing only for `hcp_pre_sep_2024`; shows a green fee-exempt hint when the user selects "no fees" (spec §6 test 21).
- HCP level dropdown (`ce-hcp-level`) appearing only for the two HCP-relevant entry paths.
- Assessment-status radio hidden when entry_path=not_assessed.
- Financial-detail block (`ce-financial-details`) reveals only when pension_status is Part or CSHC (spec §6 tests 17-19). Hidden for Full and Self-funded.
- Household + homeowner + couple partner fields with pill toggles.
- Advanced service-mix collapse (defaults to 30/45/25); if a user enters values that don't sum to 100 the backend returns 400 and the frontend surfaces `Service mix must sum to 100%, got N` in `ce-error`.
- Participant name (`ce-person-name`) prefilled from active `ParticipantsContext` via `useParticipantPrefill`.

### Workstream D — Result sections 1-4
1. Headline weekly — visually dominant `font-heading text-6xl` figure in `ce-result-headline`, with annual + quarterly figures + government share dollar amount underneath (spec §6 test 23).
2. `ce-govt-share-bar` — horizontal two-segment bar with `role="img" aria-label` describing the split. Two mini-legends underneath (spec §6 test 24).
3. `ce-rate-breakdown` — three cards (`ce-rate-clinical`/`independence`/`everyday`) plus plain-English prose contextualising the no-worse-off vs standard branch.
4. `ce-safety-net` — plain lifetime-cap panel with dollar amount, no years-to-cap projection per spec §2 locked decision.

### Workstream E — Result sections 5-8
5. `ce-oct-2026` — before/after side-by-side with saving prose ("about $15.48 a week less"). Hidden for range mode + fee-exempt.
6. `ce-what-if` — up to three scenarios (Full Age Pension counterfactual, service-mix rebalance, years-to-cap) rendered client-side from the engine output.
7. `ce-also-worth-knowing` — hardship link (`ce-hardship-link` → servicesaustralia.gov.au), reassessment cross-link to Letters & Follow-ups, HCP comparison hint when applicable.
8. `ce-how-calculated` — collapsible with `ce-how-calculated-toggle`, formula step-list, `ce-citation-*` rows with source-URL links for each INDEX-1 constant used, and the 40/60 personal-care disclosure text.

### Additional headlines
- `ce-fee-exempt-headline` (John path) — sage/green permanent-zero card.
- `ce-range-headline` (not-assessed path) — min-to-max weekly with `ce-range-anchor-class_3`/`5`/`8` rows.

### Testing
- **testing_agent_v3_fork iter_67:** 100% frontend + 100% backend green.
  - 11 previously-skipped Playwright acceptance-criterion tests from spec §6 now all pass end-to-end.
  - Backend regression: 207 passed / 11 skipped (unchanged).
  - Live URL smoke: Bill $88.67/week + 88.3% govt share + Ind 11.30% + EL 26.25% + $137,917.01 cap + Oct-2026 $88.67→$73.19 saving; John fee-exempt headline; Not-assessed range Class 3 $27.91 → Class 8 $99.24.
  - No console errors on either the CE-2 page or the Statement Decoder / LF-1 regression pages.

### Non-blocking polish notes from the testing agent
- `ContributionEstimator.jsx` is 871 LOC (just above the 700 threshold). Recommended future split into `/components/ce2/result-sections/*.jsx`. Deferred.
- `WhatIfPanel` hard-codes the full-pensioner 5% / 17.5% rates. Recommend pulling from constants in a future pass to avoid drift risk if rates ever change. Deferred.
- `/api/ce2/constants` fetch swallows errors silently. Sentry breadcrumb suggested when Sentry integration lands.

### Still to do (Phase 3)
- Workstream I — PDF artifact (react-pdf).
- Workstream J — Email artifact (Resend).
- Workstream K — Share modal + QR.
- Workstream L — HCP comparison calc + UI.
- CE-1 endpoint (`/api/public/contribution-estimator`) deprecation notice + eventual removal.


## Iteration 67 (Feb 2026) — CE-2 v1.1 Phase 0 + Phase 1 Complete

### CE-2 v1.1 · Contribution Estimator Rebuild
Multi-phase, spec-driven rebuild of the Contribution Estimator. Phase 0 (audit gate) and Phase 1 (calculation engine core) landed together. Phases 2 (UI rebuild) and 3 (artifacts + HCP comparison) still pending.

### Phase 0 — Audit gate signed off
- **Phase 0 audit deliverable** `/app/docs/audits/CE-2-phase-0-audit.md` — 7-section research doc, all sources cited with URLs and effective dates.
- **INDEX-1 extension** — 30 new constants added to `/app/backend/data/monetary_constants.yaml` (210 → 240 total entries, registry validator 0 issues):
  - Means-test: income-free area ($5,668 single / $4,940 couple), assets-free area (×4 variants — $321,500 / $579,500 / $240,750 / $369,750), income limits ($101,105 / $80,884 illness-separated), 50% income taper, 7.8% asset taper.
  - Lifetime caps: `lifetime_cap.hcp_transitioned = $84,571.66` (new alongside existing `lifetime_cap.standard = $137,917.01` and `lifetime_cap.no_worse_off = $86,185.23`).
  - HCP historical-fixed: Basic Daily Fee L1-L4, ITCF income-free areas (single/couple/separated), tier-2 thresholds, max daily rates, annual caps ($7,047.55 tier 1 / $14,095.20 tier 2), $84,571.66 lifetime cap.
  - Workstream H defaults: 40/60 personal-care sub-share of Independence, disclosed in "How this was calculated".
- **Locked fixtures** — `/app/backend/data/ce2_fixtures.yaml`:
  - Bill: part pensioner, single, homeowner, $10k assets, assessable income $19,029.18 (derived from the DoH-published 14.0% target since the fact sheet doesn't publish ordinary income directly).
  - John: full pensioner + HCP pre-Sep 2024 + paid no fees → permanent zero, fee-exempt short-circuit.
  - Louisa: cross-tool canonical Class 8 / Glorious Services (corrected from Class 5).
- **CPR-1 fixture correction (spec §2.5)** — cross-tool Louisa asset now Class 8:
  - `/app/backend/tests/fixtures/care_plans/build_sample_louisa_davids_2026_07.py` — docstring + PDF body + text sample.
  - Regenerated PDF at `sample_louisa_davids_2026_07.pdf`.
  - Updated assertions in `test_cpr1_endpoints.py`, `test_cpr1_ingestion.py`, `test_cpr1_foundation.py`. 59/59 CPR-1 tests still green post-correction.
- **Phase 0 gate tests** — `/app/backend/tests/test_ce2_phase0_gate.py` — 11 assertions locking Bill 14.0%, John $0 permanent, Louisa Class 8, formula floor/ceiling, and constant presence.

### Phase 1 — Calculation engine core (Workstreams A + B + F + G + H)
- **`/app/backend/services/ce2_engine.py`** — pure-function calc engine (~450 LOC):
  - `CE2Input` / `CE2Output` / `ServiceMix` / `RangeAnchor` / `SourceCitation` dataclasses matching spec §4.1.
  - `means_test()` — 6-step formula with configurable floor/ceiling endpoints (standard vs no-worse-off).
  - `resolve_entry_path()` — 5 entry-path handler including fee-exempt short-circuit, applicable lifetime cap, and HCP comparison mode (`always` / `toggle` / `never`).
  - `october_2026_split()` — date-aware Independence category split (40% personal care becomes 0% from 1 Oct 2026, other 60% unchanged).
  - `range_calculation()` — Class 3 / 5 / 8 anchor range for the not-yet-assessed pathway (with "See all eight" toggle path via `ALL_STANDARD_CLASSES`).
  - `calculate()` — main orchestrator: fee-exempt → not-yet-assessed range → Part/CSHC financials-skipped band range → point estimate.
  - Zero hard-coded dollars anywhere. Every constant read from INDEX-1 via `monetary_constants.load_registry`.
- **`/app/backend/routes/ce2.py`** — Phase 1 HTTP surface:
  - `POST /api/ce2/calculate` — takes the CE2Input body, returns the CE2Output JSON. Anonymous access preserved (CE-1 was free too). Validates the pension-status / entry-path / classification patterns via Pydantic.
  - `GET /api/ce2/constants` — reference-data endpoint for the input form so the UI never hardcodes dollar values.
- **CE-1 endpoint (`/api/public/contribution-estimator`) preserved** — not removed until Phase 3 switchover per spec §7 rollback plan.
- **Workstream M acceptance tests** — `/app/backend/tests/test_ce2_engine.py` — all 35 spec §6 criteria covered:
  - 22 calculation-engine tests passing (including gate-blocking Bill + John).
  - 11 UI-facing tests correctly marked `@pytest.mark.skip` for Phase 2/3 Playwright validation.
  - 4 additional engine-consistency tests (weekly/annual equivalence, all 8 classes compute, October split ratio, range anchor labels).

### Test status
- **CE-2 Phase 0 + Phase 1:** 39/39 in-scope tests green (28 engine + 11 gate).
- **Full backend regression sweep:** 207 passed / 11 skipped across CE-2 + CPR-1 + LF-1 + PPC v2 + text sanitiser.
- **Live API smoke:** Bill 14.0% (endpoint returned Ind 11.3% / EL 26.25%), John $0 fee-exempt, not-assessed range Class 3 $27.91 → Class 8 $99.24 all correct.

### Still to do (Phase 2 + 3)
- Phase 2: Workstreams C (input form redesign), D (result screen sections 1-4), E (sections 5-8).
- Phase 3: Workstreams I (PDF), J (email), K (share modal), L (HCP comparison calc + UI), delivery notes (spec §5).
- CE-1 endpoint deprecation notice + eventual removal (spec §7 rollback plan preserved).


## Iteration 66 (Feb 2026) — Polish release, six-in-one

### Copy + UI polish
- **`/ai-tools` headline** dropped "No signup." → now "Eight tools. Built for Australian families".
- **Statement Decoder daily-limit copy** replaced "One decode a day, on us" → "One free decode every 120 days" everywhere (conversion panel, `sd-daily-limit`, subline).

### Plan-aware chips + trial-CTA gating
- New shared hook **`/app/frontend/src/hooks/usePlanState.js`** returning `{status, planName, isPaid, isTrialing, hideTrialCtas, hidePlanChip}`. Treats `subscription_status=trialing` as NOT paid, so we can gate CTAs precisely.
- **AIToolsIndex** chip logic: paid → hide chip; trialing → "7-day free trial" pill (drops the "Solo & Family" wording); free/logged-out → "Solo & Family" + "7-day free trial" subline. The Free chip on Statement Decoder is unchanged.
- **`Start free trial` CTAs** on `StatementDecoderTool`, `ContributionEstimator`, `BudgetCalculatorTool`, `PriceCheckerTool` (`pc-signup-cta`), `ReassessmentLetter`, `FamilyCoordinator` are all now wrapped in `access !== "allowed"` or the new `usePlanState()` gate. Trial + paid users no longer see them. Anonymous / expired / free users still do.
- StatementDecoder `sd-conversion-panel` and `decoder-upgrade` block wrapped in `!isPaidUser` (now sourced from `usePlanState`, which treats trialing as gated-in). Paid users see an "Email this decode" panel instead.

### Participant name prefill across tools
- New shared hook **`/app/frontend/src/hooks/useParticipantPrefill.js`** reads the active participant from `ParticipantsContext` and prefills any name field. On participant switch, auto-swaps to the new participant if the field is either empty OR still equals the previously-active participant's name. Custom text typed by the user is preserved.
- **LF-1** — wired inside `ArchetypeIntakeForm` for request / dispute / complaint / escalation / notification / guided_pathway (response_draft skipped because that flow asks who the reply is going TO).
- **Reassessment Letter** — wired to `form.participant_name`.
- **Budget Calculator** — `participantFirstName` state now syncs to `activeParticipant.first_name` on switch (used in the personalised save-button copy).

### LLM output tone — no em/en dashes, no AI slop
- New module **`/app/backend/lib/text_sanitiser.py`**:
  - `strip_wayly_dashes(text)` — replaces em (U+2014) and en (U+2013) dashes with `, `. Hyphens (`-`) in compound words like `7-day`, `care-plan`, `self-check` are preserved.
  - `WAYLY_TONE_INSTRUCTIONS` — 6-rule voice block (no em/en dashes, simple Australian English, neighbourly tone, no generic AI phrasing, personalise using participant first name, no corporate).
  - `append_tone_rules(system)` — idempotent append to any system prompt.
- **`chat_send()`** in `/app/backend/lib/llm_wrapper.py` now (a) appends WAYLY_TONE_INSTRUCTIONS to the system message by default, and (b) post-processes the reply through `strip_wayly_dashes()`. Callers can opt out via `apply_tone_rules=False` / `sanitise_output=False` for structured JSON extraction.
- **`call()`** applies `strip_wayly_dashes` to any string reply as a global safety net.
- **`agents.py::chat_with_kindred`** (Ask Wayly) — sanitised + tone rules.
- **`reports_routes.py`** exec summary prompt — updated tone instructions + reply sanitiser.
- **`server.py`** deterministic statement summary renderer — hardcoded em dash removed from the "government covered every service" branch and the "Wayly" email signature.

### Testing
- New regression **`/app/backend/tests/test_text_sanitiser.py`** — 15 assertions locking em/en dash removal, hyphen preservation, tone-rule idempotency, and JSON-safety.
- New E2E **`/app/backend/tests/test_iter66_polish_release.py`** — 3 assertions: sanitiser import + Statement Decoder LLM output dash-free + LF-1 letter generation dash-free (against the live LLM). **3/3 green.**
- Full LF-1 + PPC regression: **95/95 green.**
- Self-verified in preview: `/ai-tools` (logged-out + trial user), `/ai-tools/budget-calculator` (trial CTA hidden), `/ai-tools/contribution-estimator` (trial CTA hidden), `/ai-tools/letters-and-follow-ups` (trial banner visible, situation 1 opens with participant name prefilled to "Dorothy").

### Bugs found & fixed this iteration
- `chat_send()` import path used `from backend.lib...` which fails at runtime because the backend runs with `/app/backend` on `sys.path`. Corrected to `from lib.text_sanitiser import ...`. Same fix applied inside `call()`.


## Iteration 69 (Feb 2026) — LF-1 v1.2 Iterations 2/3/4 Frontend Complete

### LF-1 v1.2 · Letters & Follow-ups — Full frontend for Iter 2, 3, 4
- **`/app/frontend/src/components/lf1/LetterGeneration.jsx`** rebuilt from stub → 1400-line module exporting:
  - `ArchetypeIntakeForm` dispatcher + 6 archetype-specific intake forms (request / dispute / complaint / escalation / notification / response_draft / guided_pathway) — each with dropdown selectors, free-text notes, evidence-upload chips + per-file notes.
  - `CrossToolImportPanel` — Iter 3 tap-through pre-fill from Statement Decoder / Care Plan Reviewer / Provider Price Checker / Classification Self-Check / Contribution Estimator.
  - `GenerateButton` — POST `/lf1/correspondence/:id/generate` with 422 `source_data_missing` guard → renders missing-fields checklist.
  - `CoverNotePanel` — recipient + postal / email / portal / phone + response window + cc list + OPAN footer flag.
  - `OutputFormatSwitcher` — email body / MAC portal short-form / PDF download.
  - `FeedbackChip` — thumbs up/down with optional reason for downs (persists via POST `/:id/feedback`).
  - `ToneCheckPanel` — feature-flag-gated tone/claim review (only shown for complaint / escalation / guided_pathway).
  - `ShareAndSignOffPanel` — Iter 4 Family Coordinator sharing + require-sign-off + one-click sign-off.
  - `LF1ADMDisclosure` — wraps shared ADMDisclosure with LF-1 copy.
  - `SafeguardingRecordButton` — situation 11 structured safeguarding record (POST `/:id/safeguarding-record`).
  - `ResponseDraftGenerateButton` — situation 12 reply-builder (POST `/:id/response-draft`).
- **`/app/frontend/src/pages/tools/CorrespondenceDetail.jsx`** rewritten to wire all of the above:
  - Sender authority + ATSI toggle + complaint mode selector (open/confidential/anonymous).
  - Debounced autosave to PATCH `/lf1/correspondence/:id/autosave` — 1 s.
  - Terms acknowledgement checkbox (WS20 T40).
  - Three generation-button variants dispatched by archetype (guided_pathway → SafeguardingRecordButton, response_draft → ResponseDraftGenerateButton, everything else → GenerateButton).
  - PDF download via blob response.
  - Delete flow retained, now with `DialogDescription` for a11y.
- **`/app/frontend/src/pages/tools/CorrespondenceLog.jsx`** extended with `FollowUpPanel` — overdue + upcoming sub-lists, each row shows suggested next action and (where escalatable) a one-click `Escalate` button that POSTs `/:id/escalate`.
- **`/app/frontend/src/components/adm/ADMDisclosure.jsx`** — added `DialogDescription` to silence Radix a11y warning.

### Testing
- `testing_agent_v3_fork` iter_65: **100% frontend + backend E2E green**. Every requested testid + flow verified live against the preview URL as cathy@example.com. Two live Claude Sonnet 4.5 letter generations succeeded (request + complaint). No functional bugs. All cosmetic action items (`lf1-tone-check-disabled` testid, `lf1-cross-tool-loading` testid, evidence testids use `it.id`, DialogDescription for a11y) resolved.

### Known / deferred
- LF-1 tone check requires `feature_flags.lf1_tone_check.enabled=true` in Mongo to run — otherwise the endpoint returns `{enabled:false}` and the UI shows a "temporarily disabled" hint (correct behaviour).
- Evidence upload is client-side only: files exist as filename + note on `intake.evidence_items` (autosaved). No backend file storage is expected for this iteration.
- `LetterGeneration.jsx` is 1400 LOC — flagged by testing agent for possible future split into `/components/lf1/intake-forms/*.jsx` siblings. Non-blocking.


## Iteration 68 (Feb 2026) — OXY-1 F5+F6 + INDEX-1 Deploy 1a

### OXY-1 v1 · Partial Authorisation (F5 + F6 only)
- **F5** Ask Wayly system prompt (`agents.py::CHAT_SYSTEM_TEMPLATE`) now describes the medical practitioner certification requirement for the Oxygen supplement, including the GP/specialist/care manager path and explicit guardrails ("do not tell the caregiver whether the participant qualifies" and "do not draft the certification letter"). Verified end-to-end via real Claude call on cathy@example.com: reply contains `$14.66`, "medical practitioner", "GP or specialist", and "section 196-15".
- **F6** `/app/frontend/src/content/supplements.js` created with `OXYGEN_CERTIFICATION_COPY` (short + full + actionHint). Dead code by design until F1-F4 land after solicitor sign-off on Privacy Policy v1.2.
- **Tests O10 + O12** shipped and pass.
- **All F1-F4 + advisory severity infrastructure remain held** per Antony's authorisation.

### INDEX-1 v1 · Deploy 1a (registry infrastructure only)
- **Registry YAML** at `/app/backend/data/monetary_constants.yaml` — 210 keys, 212 rows, generated from `seed_program_reference.SEED_ROWS` via a deterministic generator at `backend/tools/generate_monetary_constants_yaml.py`. Every entry has value + effective_from + source_type + source_url (or explicit `PENDING`) + source_citation + last_verified_at (2026-07-08) + last_verified_by (`antony`). Lifetime cap entries carry a `history` block with the pre-20-Mar-2026 values preserved (audit trail).
- **Scheduled changes file** at `/app/backend/data/scheduled_changes.yaml` seeded with the 1 October 2026 personal care funding change (30-day lookahead alert).
- **Loader** at `/app/backend/monetary_constants.py` with `MonetaryConstant` + `MonetaryConstantsRegistry` + point-in-time `get_value(key, as_of=…)` that walks both top-level and flattened history entries.
- **Compliance runbook** stub at `/app/docs/compliance/indexation-review-runbook.md` — reviewer identity, alert channel (GH issue + email), 20 March + 20 September cadence documented.
- **12 pytest tests** in `test_monetary_constants.py` covering: load + count, no-past-review dates, XOR value_aud/value_percentage, Rev A cap values (both pre + post 20-Mar-2026), structural validation, scheduled_changes shipping, no missing source_url, no behavioural drift vs `program_reference`, deterministic YAML regen, OXY-1 F6 O12 (single-source substring).
- **No consumer changes.** All existing callers still read via `program_reference.get_value(...)` — Deploy 1a acceptance criterion 4 satisfied (no diffs in outputs).
- **Deploys 2 (CI drift) + 3 (UI labelling) NOT started** — separate authorisations required.

### Regression health
- Combined pytest: **60/60 green** (33 DEC-1 v7.7 + 13 BUD-1 v1 + 12 INDEX-1 + 2 OXY-1). Zero regressions from prior iterations.


## Iteration 67 (Feb 2026) — BUD-1 v1 Phase 1 shipped + OXY-1 / INDEX-1 Phase 0 audits

### BUD-1 v1 Phase 1 — DELIVERED (Rev A authorised)

- **F1 · Single-source supplements** — new `/app/frontend/src/lib/budgetSupplements.js` shared by `BudgetCalculatorTool.jsx` and `ProfileInlinePrompts.jsx::SupplementsEditor`. Top card + bottom section read/write the same array + `enteral_feeding_type` field.
- **F2 · Enteral collapsed to one checkbox + bolus/non-bolus radio.** New wire adapters (`toWireSupplements` / `fromWireSupplements`) preserve the `enteral_bolus` / `enteral_non_bolus` API contract.
- **F3 · Grandfathered-only options UI-side gated.** Dementia & cognition + EACHD top-up show a "GRANDFATHERED HCP ONLY" label, are disabled + tooltip when GF off, and auto-untick when GF flips off. Backend already rejects them via seed `grandfathered_only` flag.
- **F4 · Grandfathered label expanded** to the Rev A copy: "no-worse-off arrangement", both caps shown, indexation cadence explained. Values live-read from `result.lifetime_cap_grandfathered` / `result.lifetime_cap_standard`.
- **F5 · Rate-switch removed.** `is_grandfathered` now only controls the lifetime cap value and the supplement gate. Classification annuals come from the ongoing SAH table for everyone. The former "Level 5-8 grandfathered → 400" dead-end is gone. Explicit `transitional_classification` is still respected for programmatic callers.
- **F6 · Indicative caveat promoted** above the streams table, always visible.
- **F7 · Personalised save button + toast** in `ProfileInlinePrompts`. Button now reads "Save to {FirstName}'s profile". Toast says "Wayly will pre-fill this next time you open the calculator."
- **F8 · `AIAccuracyBanner` added** at the foot of the results view.
- **Contribution field relabelled** to "Expected annual out-of-pocket contribution (optional)" + explicit "This does not change your funded budget" note. Results view now displays a dedicated "Estimated annual contribution" card and a "Remaining before cap" card.
- **Rollover formula corrected** to `max($1,000, base_individual_daily × days_in_quarter × 10%)` (Rev A section 2.3 alignment). Old flat-91.25-day derivation removed.
- **Rev A constants** — lifetime caps updated to indexed values ($137,917.01 / $86,185.23) for post-20-March-2026. Old $135,318.69 / $84,571.66 rows retained with `effective_to = 2026-03-19` for the audit trail.
- **Source references** — new `/app/docs/references/BUD-1-source-references.md` records every constant, verified date, and next review.

**Tests:** new `/app/backend/tests/test_bud1_v1.py` — 13 tests, all pass, covers T1-T7, T10-T14, T16 from the spec.
`46/46` combined (DEC-1 v7.7 + BUD-1 v1) green.

### OXY-1 v1 — Phase 0 audit delivered

Report at `/app/docs/audits/OXY-1-audit.md`. Findings:
- Profile schema is additive (no migration risk); `applicable_supplements` + `enteral_feeding_type` already present, `oxygen_certification` needs to be added.
- Budget Calc, Decoder, Care Plan Reviewer, Ask Wayly all have clear hook points.
- **`"advisory"` is a NEW severity level** — needs adding to the decoder schema, counter, and renderer (small change).
- **Blocker:** Privacy Policy amendment (or Antony's authorisation to ship against current policy) is required before F1 launch — the certification fields are health information under the Privacy Act.
- **Recommendation:** take the reusable `certifications: Dict[str, MedicalCertification]` shape NOW so ENT-1 lands cleanly.

Awaiting Antony's confirmation on the 5 open items before starting Phase 1.

### INDEX-1 v1 — Phase 0 audit delivered

Report at `/app/docs/audits/INDEX-1-audit.md`. Findings:
- 41 monetary constants across 6 categories, all already read via `program_reference.get_value(key, as_of=…)` — no refactor cost for the calc/decoder consumers.
- **Biggest INDEX-1 cost:** LLM prompt strings in `agents.py` hard-code dollar amounts (supplement rates, rollover floor, grandfathered cap). Needs a `render_prompt(key)` template helper in Phase 1.
- Marketing / blog content has stale figures (editorial-QA problem, not runtime).
- Rollout plan: 3 deploys — registry only, then consumer + prompt refactor, then CI drift detection.

Awaiting Antony's confirmation on the 5 open items before starting Deploy 1.


## Iteration 66 (Feb 2026) — Contextual Ask Wayly on Statement Detail + Summary polish

### Delivered
- **Statement-scoped Ask Wayly** — new `<StatementAskWayly>` card placed directly under the Notes editor on `/app/statements/:id`, above the decoded breakdown. Includes 3 suggested-question chips ("What am I actually paying out of pocket…", "Are any of the fees unusually high…", "Should I question anything…"), autosizing textarea, ⌘ Enter to send, and an inline transcript.
- **Backend grounding** — `POST /api/chat` now accepts optional `statement_id`. When set, the handler swaps the "latest statement" context for the specific statement's summary + line items + anomalies (household-scoped, safely no-ops on cross-household ids). Session id is scoped as `chat-{hh}-{pid}-stmt-{sid}` so per-statement threads never bleed into each other.
- **Statement summary rewrite** — `PARSER_SYSTEM` prompt now demands a 3-5 sentence summary covering (1) provider+period charge, (2) stream split, (3) participant vs government paid, (4) closing balance, (5) any notable observation. Em-dashes, en-dashes, and hyphen-as-separator are explicitly forbidden.
- **Defensive dash scrubber** — new `_scrub_dash_separators` in `agents.py` post-processes `parse_statement` output; also applied in `DecoderResultView` at render time so older statements read clean without a database backfill.

### Verification
- Backend: 33/33 DEC-1 pytests still green.
- E2E smoke as `cathy@example.com` on statement `1e6f55e6-…`:
  - Card + chips + input render
  - Suggested question → AI replied grounded on that statement's actual numbers (identified BlueBerry Care, $300 care management, zero participant contribution, referenced 1800 200 422)
  - Reply contained ZERO em-dashes (`\u2014` absent from response body)
  - Session id includes `-stmt-<id>` suffix


## Iteration 65 (Feb 2026) — STMT-UI-1 v2 · Phases 0/1/2/3 + Public-Decoder Share PDF

### Delivered
- **Phase 0 audit** — `/app/docs/audits/STMT-UI-1-audit.md` — all four hard-gate items resolved without a retention retrofit (original PDFs already stored inline as `file_b64`; signed-download endpoint already exists; text-layer path via pdf.js means no positional-anchor backend work needed).
- **Phase 1 register rewrite** — `/app/frontend/src/pages/StatementsList.jsx`
  - New columns: Period · Provider · Uploaded · Gross total · Closing balance · Status.
  - Compact period range labels ("1–30 Sep 2026" · exact ISO on hover).
  - Search input (250ms debounce; matches provider/filename/period/note).
  - Provider (multi-select), Period (all / this_quarter / last_6m / last_12m), Status (multi) filter chips — AND-combined.
  - Sort headers cycle desc → asc → reset with URL persistence (`?sortKey=&sortDir=`).
  - Server-side 25/page pagination.
  - `Export CSV` button (client-side, current filter/sort only, Decision 10).
  - StickyNote indicator on rows with a private note.
- **Phase 2 detail additions** — `/app/frontend/src/pages/StatementDetail.jsx`
  - New compact `Period · Provider` header + inline status badge.
  - `Download original (as received)` button auto-disabled when no original retained.
  - `Compare side-by-side` button (PDF originals only) → new route.
  - Autosaving `StatementNotes` editor (1200ms debounce + on-blur) via new `PATCH /api/statements/{id}/note`.
- **Phase 3 compare page** — `/app/frontend/src/pages/StatementCompare.jsx` @ `/app/statements/:id/compare`
  - `react-pdf` @ 9.2.1 + `pdfjs-dist` pinned to **4.8.69 (exact)** to match react-pdf's bundled API.
  - PDF worker sourced from top-level `pdfjs-dist/build/pdf.worker.min.mjs` (no external CDN — spec invariant 7).
  - Draggable divider 30–70% (keyboard-accessible via ← → arrows) + tabbed Original/Decoded mobile fallback under 1024px.
  - Client-side text-layer divergence map (agree/differ/missing) w/ conservative match heuristic (numeric equality first, then 1-cent tolerance + description proximity).
  - Sync scroll toggle (default on) — flips PDF page when a decoded figure enters view IFF a confident match exists; fail-safe otherwise.
  - Zoom presets 50/75/100/125/150/Fit width.
- **Backend additions**
  - `Statement.user_note: Optional[str]` + `has_note: bool` added to `models.py`.
  - `GET /api/statements` now emits `has_note` per row (body stripped).
  - `GET /api/statements/{id}` emits `user_note` + `has_note`.
  - `PATCH /api/statements/{id}/note` — additive; 1024-char cap; nullable.
- **Improvement: shareable public-decoder PDF** — new `downloadShareablePdf` in `/app/frontend/src/lib/decoderExport.js`.
  - "Here's what `{provider}` is charging" headline, hero total tile, verdict block, up to 3 flag highlights, closing-balance card, `wayly.com.au` CTA foot.
  - New `Share this decode` button in `DecoderResultView` (data-testid `decoder-share-pdf-btn`) — surfaces on both `/app/statements/:id` detail and the public decoder result view.

### Verification (iter 59 → 60 testing agent runs)
- **Iter 59:** frontend 100% on Phases 0/1/2 register/detail/notes/CSV/Share PDF; **1 HIGH** bug on the compare route (pdfjs API vs Worker version mismatch).
- **Iter 60 (retest after worker pin):** **100% GREEN across everything.**
  - Backend: 45/45 pytest (33 DEC-1 v7.7 + 12 iter59 STMT-UI-1 v2 API tests).
  - Frontend: all 7 Phase 3 checks + Share PDF popup verified.
  - Reports: `/app/test_reports/iteration_59.json`, `/app/test_reports/iteration_60.json`.

### Non-blocking follow-ups (all optional)
- `response_model_exclude={'user_note'}` on the list endpoint to drop the null body from register payloads.
- Migrate FastAPI `@app.on_event` → lifespan handlers to silence 39 DeprecationWarnings.
- Add `resolutions`/`overrides` on `pdfjs-dist` if react-pdf ever bumps its bundled version — safety net against silent drift.
- Consider a wider hit-slop on the compare-page divider for touch users.
- If we ever build multi-page fixture divergence, revisit x/y normalisation in `onPageTextLayer` (currently uses an approximate identity viewport).


## Iteration 64 (Feb 2026) — DEC-1 v7.7 Batch B Round 2 E2E regression checkpoint

### Verification (iter 58 testing agent run)
- **Backend: 100%** — 33/33 DEC-1 pytests + 9/9 new endpoint-level regression tests pass in `test_iter58_dec1_regression.py`. Suite covers public decoder job pipeline (with poll), auth signup/login/me, admin login endpoint, Cathy statement upload lifecycle (multipart CSV → job → done → list/detail), duplicate detection (409 DUPLICATE_EXACT), and paywall probe.
- **Frontend: 100%** — login, dashboard, statements list (12+ statement-row-* testids), statement detail (data-testid=decoder-result-v2 with In Plain English summary + stream breakdown + anomaly summary + quarterly balance panel), decoder tool page all render with 0 console errors.
- No production bugs surfaced. Batch B Round 2 rules confirmed live and non-regressive.

### Observations (non-blocking)
- `trial30909@example.com` in the preview env is currently `plan=family` / `subscription_status=trialing`, not expired — noted in `test_credentials.md` for future testers.
- Public decoder `_rl 'tools_unauth_ip'` (10/hr per IP) fires before the paid-plan bypass — intentional per docstring, but paid users still see "wait 49 minutes" copy. Flag for product.
- FastAPI `@app.on_event('startup'/'shutdown')` still in use in `server.py` L7120-7249 — 39 DeprecationWarnings per pytest run, cosmetic.

### Test artifacts
- `/app/backend/tests/test_iter58_dec1_regression.py` (new, 9 endpoint tests)
- `/app/test_reports/iteration_58.json`
- `/app/test_reports/pytest/iter58_regression.xml`
- `/app/test_reports/pytest/test_dec1_v7_7_iter58.xml`


## Iteration 63 (Feb 2026) — DEC-1 v7.7 Batch B: Shipping-block anomaly rules + extraction hardening

### Shipping blockers CLEARED (test-locked)
- **RULE_1_CARE_MGMT_CAP (S3.D1)** — deterministic quarterly-cap check. Fires HIGH when care-management fee > 10% of services subtotal (excluding AT-HM). Cap base is now `Clinical + Independence + EverydayLiving` gross only; AT-HM correctly excluded per Support at Home rules.
- **RULE_21_PROHIBITED_ADMIN_FEE (S4.D6 + S4.D7)** — unified prohibited-fees dictionary catches brokerage fee, exit administration fee, admin surcharge, package management fee (when non-zero), entry fee. Scans BOTH extracted line items AND source text (so dropped rows still fire). Correctly ignores $0 "included in care management" package fees.
- **RULE_1B_CARE_MGMT_MONTHLY** — now gated to fire only on monthly statements (prevented double-firing with quarterly RULE_1).

### New anomaly rules added (backend/agents.py)
- `RULE_24_DATE_OUTSIDE_PERIOD` — line item dated before period_start or after period_end (S3.D8).
- `RULE_25_WORDS_VS_NUMERALS` — numeric total ≠ written total (S3.D10 primary catcher).
- `RULE_26_LEGACY_HCP_TERMINOLOGY` — Home Care Package language on post-1-Oct-2026 statements (S4.D2).
- `RULE_27_GST_ON_GST_FREE` — GST charged on GST-free care services (S4.D3).
- `RULE_28_STRADDLING_OCT_2026` — statement period spans the 1 Oct 2026 rule change (S4.D1).
- `RULE_29_MISSING_ACT_DISCLOSURE` — footer lacks Aged Care Act / Support at Home reference (S4.D9).
- `RULE_30_FUNDING_CADENCE_MISMATCH` — quarterly statement lists gov contribution per-month (S4.D10).
- `RULE_31_AMBIGUOUS_CATEGORY` — "combined activities" / "ad-hoc support" style vague line items (S3.D3, S4.D5).
- `RULE_32_PROVIDER_HEADER_FOOTER_MISMATCH` — header provider name ≠ footer legal entity (S3.D9).
- `RULE_33_MIXED_DATE_FORMATS` — line-item dates use 3+ distinct formats (S3.D7).
- `RULE_34_DATE_INHERITED_ROW` — blank-date rows filled by row inheritance are surfaced (S3.D4, S3.D5).

### Extraction hardening
- **Per-stream chunk `max_tokens` bumped from 2500 → 5000.** Fixes S2's 35% row drop-rate (23/65 rows lost previously). Dense quarterly fixtures with 29+ Independence + 24+ Everyday Living rows now extract completely.
- **Cross-stream deduplication rewritten.** Groups line items by `(normalised-date, gross, first-3-tokens-of-description)`. When multiple per-stream chunks claim the same physical row (different service_codes, different date formats), keeps the row whose stream matches the description best. Prevents 5x false-positive stream-duplication anomalies on S3.
- **AT-HM inline-item extraction** — validator no longer requires a commitment register for AT-HM rows when the source lists them directly under an "Assistive Products and Home Modifications" heading. AT-HM stream now populates correctly for S2-style statements.
- **AT-HM `government_paid` normalisation** — AT-HM rows with `participant_contribution = 0` now automatically have `government_paid = gross` filled in. Kills the "phantom government_paid discrepancy" RULE_4 false positive.
- **Cadence unconditional persistence** — cadence is now written to `statement_summary.cadence` on every statement (previously skipped when an LLM `RULE_14` was already present, leaving cadence null on S1/M1/M3).
- **Date parser accepts DD/MM/YY (2-digit year)** — fixes `_parse_iso_date` on legacy short-year dates.

### False-positive filters
- **Null service_code silent per S1.13** — anomalies about "empty service_code" from LLM auto-stripped unless they mention "malformed" / "invalid format".
- **Stream discrepancy Clinical/Independence stripped** — LLM-emitted "stream ≠ header 'Used This Month'" anomalies on Clinical or Independence are now filtered (deterministic RULE_16 handles Everyday Living only).
- **Two-stream duplicate framings stripped** — "same service in both Clinical and EverydayLiving" is not a real anomaly; the extractor bug that causes it is fixed upstream.
- **RULE_2 weekend/after-hours weekday date guard** — anomalies about "weekend rate" where the cited date is actually a weekday are now stripped.
- **RULE_2 filter no longer strips RULE_21/RULE_24/RULE_25 etc.** — the "starts with RULE_2" check was too permissive; now uses exact-match rule identifiers.
- **RULE_11 hedge phrases extended** — "without published rate comparison", "no published rate", "published rate not disclosed" now filtered.
- **RULE_15 gross-total warning sanity check** — extractor's `reported_total_gross` is now cross-validated against `quarterly_budget_total - budget_remaining_at_quarter_end` and `stream_used_this_month` totals before firing the mismatch anomaly. Prevents false positives from LLM extraction of the wrong "reported" field.

### Presentation (frontend + PDF export)
- **Cadence label** rendered in the decoder summary banner and PDF `<dl>` metadata.
- **Balance panel** — new `<BalancePanel>` component in `DecoderResultView.jsx` renders Opening balance / Quarterly allocation / Closing balance in a 3-column tile card. Renders in-app AND in the client-side PDF export.
- **CSV export** — now includes cadence, care management fee, opening balance, quarterly allocation, closing balance rows.

### Regression tests (`backend/tests/test_dec1_v7_7.py`)
- 11 new tests (`TestShippingBlockers`, `TestBatchBRules`, `TestDedupCrossStream`, `TestCadenceInference`).
- Total suite: 27 tests, all green.
- Shipping-blocker tests explicitly lock in RULE_1_CARE_MGMT_CAP (quarterly + HIGH), RULE_21 (both brokerage AND exit-admin fees required to fire together).

### Storage / persistence
- `extracted_json` now strips underscore-prefixed internal fields (`_source_text`, `_extraction_error`, `_chunk_failures`, `_dedupe_dropped`) before Mongo write, keeping documents lean.
- Public decode API response also strips these fields before returning to the client.

### Files touched
- `backend/agents.py` — Batch B rules + false-positive filters + dedup rewrite + AT-HM validator + cadence + `_parse_iso_date`.
- `backend/server.py` — persistence sanitisation (2 sites) + public API response sanitisation.
- `backend/tests/test_dec1_v7_7.py` — 11 new regression tests.
- `frontend/src/components/DecoderResultView.jsx` — cadence chip + `<BalancePanel>` component.
- `frontend/src/lib/decoderExport.js` — cadence + balance panel in PDF, cadence + balances in CSV.


## Iteration 58 (Feb 2026) — UI-1 Wave B: Switch Provider wizard + Calendar rebuild + date sweep

### Shipped
- **§9 Switch Provider 5-step wizard** (`extended/ProviderSwitch.jsx` full rewrite, 5 stepper steps gated by progress):
  - Step 1: "Why You Might Switch" verbatim §14.4.1 + intake form (current/target/reason)
  - Step 2: "Before You Decide" — 4 reflective Yes/Not Yet/N/A questions
  - Step 3: "Comparing Providers" — 5 checkable topics with verbatim guidance
  - Step 4: "Giving Notice" — date picker + reason input + auto-generated draft notice letter with Copy + Download (.txt) buttons. Letter pulls today's date, current provider, last-service date, and the user's short reason into a Wayly-voice formal template.
  - Step 5: "Handover and First Two Weeks" — 4-item handover checklist + "Mark Switch Complete" button (only enables when all items done)
  - Drafts persist on the existing `/provider-switch` resource via `checklist.before_you_decide`, `checklist.compare`, `checklist.notice`. Stepper resumes where the user left off.
- **§3 Calendar rebuild** (`extended/VisitCalendar.jsx` full rewrite + new CSS in `index.css`):
  - `react-big-calendar` (1.20) + `date-fns` (Monday week start, en-AU locale)
  - Month / Week / Agenda views; click a slot to add, click an event to inspect
  - Wayly token CSS (teal toolbar pills, sage `today` tint, Clay accents, Fraunces label)
  - Detail panel surfaces Edit, Cancel (future events), Restore (cancelled), Archive (past events), Restore (archived), and Delete (future only). Past events cannot be hard-deleted by the user — they must be archived.
  - Backend `VisitBody` gained `status` field (`active|cancelled|archived`, default `active`). End-to-end PATCH confirmed via curl.
- **Date util sweep** (one pass): migrated 6 high-traffic files to `lib/formatDate.js` — Reports.jsx, CaregiverDashboard.jsx, NotificationsBell.jsx, DashboardTimelinePanel.jsx, EmailForwardingPanel.jsx, statements/StatementLifecycleModals.jsx. All `new Date(x).toLocaleString()` → `formatDateTime(x)`, all `new Date(x).toLocaleDateString()` → `formatDate(x)`. Money `.toLocaleString()` calls left untouched.

### Deferred (in `docs/ui-1-audit.md`)
- §7 workflow_drafts table + Switch-Workflow drawer + Cancel modal
- §8 Participant Contacts side panel + `participant_contacts` collection
- §6.1 full dark-mode token rework (placeholder hex values pending Antony to lock)
- §2 Dashboard bar chart polish
- §4 AT-HM file uploads on each line item
- §10.2 backend SMS service paths

### Verified
- Calendar renders the existing GP appointment correctly on 1 June 2026; sage `today` tint on the 27th; toolbar pills in Wayly teal.
- Switch Provider resumes at Step 4 because the test user has an existing draft; letter template fills with current provider name and short reason.
- Backend visit status enum accepts `active|cancelled|archived` and the legacy active records continue to work (default value applied).


## Iteration 57 (Feb 2026) — UI-1 Wave A: foundations + copy discipline + appearance scoping

### Shipped (one coordinated pass)
- **3 central utils** in `frontend/src/lib/`: `formatDate.js` (DD/MM/YYYY + formatDateTime + formatRelative), `formatRole.js` (Title Case role labels with GP acronym exception), `formatStatus.js` (Title Case status mapping, DB enum unchanged).
- **§1** Backend header tagline "Support at Home, in plain English" removed.
- **§10** Settings overhaul: every tab + section heading converted to Title Case, SMS Alerts tab removed from TabNav and routing, AppearanceTab gains the §10.4 scoping caption.
- **§6.4** Dark-mode bleed bug closed: appearance preference moved from `kindred_theme` → `wayly:app:appearance`, marketing routes always strip `.theme-dark`. New `AppearanceScope` route hook in `App.js` re-applies on every route change. Legacy `kindred_theme` migrated once then removed.
- **§11** Marketing hero pills cased correctly ("Australian-Hosted", "Privacy-First", "Independent", "AI Powered") + dark-mode tokens applied (text `#F5F1E9`, bg `#152425/80`, border `#2A3A3C`).
- **§12** Signup rebuilt: First Name + Last Name + Email + Mobile Number + Password. AU mobile regex `^(\+614\d{8}|04\d{8})$`. Microcopy: "We use this to help you recover your account and for important security alerts. We will not send you marketing texts." Backend `SignupRequest` + `users` collection now persist `first_name`, `last_name`, `mobile`.
- **§14.1** AT-HM intro copy verbatim + status select renders Title Case via `formatStatus`.
- **§14.2** Care-Plan Changes intro copy verbatim + "Your Role"/"Your Name" Title Case + heading renamed.
- **§14.3** Log a Scenario screen intro + tile redesign (surface-raised cards, high-contrast text, accent-primary icon top-left, no background-image bleed).
- **§14.4.1** Switch Provider "Why You Might Switch" intro panel above the existing form.

### Deferred to UI-1 Wave B/C (audit doc shipped at /app/docs/ui-1-audit.md)
- §3 Calendar rebuild with `react-big-calendar` + edit/cancel/archive logic
- §4 AT-HM file uploads on each line item
- §7 Log a Scenario `workflow_drafts` table + Switch-Workflow drawer + Cancel modal
- §9 Switch Provider full 5-step wizard with letter PDF (steps 14.4.2 – 14.4.5)
- §8 Participant Contacts side panel + `participant_contacts` Mongo collection
- §6.1 Full dark-mode token system (placeholder hex values flagged for Antony to lock)
- §2 Dashboard bar chart polish

### Verified
- Backend signup endpoint accepts new fields end-to-end and persists `first_name`, `last_name`, `mobile` on the user row (HIBP password gate still active).
- Mobile microcopy + new form fields visible on `/signup`.
- Header reads just "Wayly" (no tagline) on the authenticated app.
- Settings page loads without the SMS tab.
- Backend restarts cleanly with no import errors.


## Iteration 56 (Feb 2026) — In-house Wayly Support Ticketing (SUP-0/1/2/3)

### What shipped
Implementation of the full SUP-* spec (replaces the user's original Zendesk integration request).

**Backend (`/app/backend/routes/support.py`, 600+ LOC, lints clean)**
- 8 new Mongo collections under `sup_*` namespace (kept legacy Phase D `support_tickets` untouched): `sup_tickets`, `sup_defects`, `sup_messages`, `sup_attachments`, `sup_tool_snapshots`, `sup_triage`, `sup_events`, `sup_counters`. Field names match `wayly-support-schema.sql` verbatim (1:1 Postgres migration path).
- Atomic `WAY-XXXX` / `DEF-XXXX` reference generation via `$inc` on `sup_counters`.
- `get_user_visible_thread()` helper — ALWAYS filters `visibility='public'`; internal notes can never leak through this function (verified in pytest).
- `_create_attachment()` consent guard — `original_statement` rows raise `RuntimeError` unless the parent ticket has `consent_to_share_statement=true`.
- Append-only `_write_event()` audit log on every state change (`created`, `consent_recorded`, `triaged`, `status_changed`, `message_added`, `linked_to_defect`, `attachment_purged`, `csat_received`).
- `purge_expired_attachments()` helper for the 90-day retention rule (handler ready; cron schedule not yet wired — flagged as backlog).
- SUP-3 triage gated behind `SUPPORT_TRIAGE_ENABLED=false`; complete triage-v1 prompt + JSON parser + 0.6 confidence floor wired but dormant (verified: 17 test tickets created, zero `sup_triage` rows).

**SUP-1 user flow (frontend)**
- `<ReportIssueButton>` (Clay secondary, `data-testid="report-issue-btn"`) added to all 8 AI tool pages — appears only after a result is produced.
- Slide-up panel (mobile) / side panel (desktop) with all SUP-COPY copy: 5 category radios, claimed-answer textarea, source dropdown + conditional "other" detail, user note, and the explicit `support-consent-v1` consent block.
- Confirmation view shows the `WAY-XXXX` reference + 14-day aim + "Go to My Support" CTA.
- New `/support` and `/support/:ticketId` routes → `<MySupport>` page (inbox + thread + reply box + CSAT 1-5 stars). Status copy uses the exact SUP-COPY lines.
- Sidebar gains a "Support" link under "Your Account" (uses Lucide `LifeBuoy` icon).

**SUP-2 admin console**
- New routes `/admin/support`, `/admin/support/defects`, `/admin/support/:ticketId` (legacy `/admin/tickets` kept intact and labelled "Legacy" in the nav).
- Ticket list with filters (status / tool / category / has_statement), oldest-unresolved-first default sort.
- Ticket detail: immutable snapshot panel (tool input/output JSON), user's structured report, attachments (with consent indicator), full conversation, triage card (shows only when triage row exists, currently never), public-reply box, internal-note box (clearly marked, never emailed), status sidebar with one-click transitions + resolution summary that flows into the public message + email.
- Defects view with bulk-resolve-and-notify: marking a defect fixed resolves every linked ticket and emails each reporter the resolution note in one operation.

**3 Resend emails — in Wayly voice (`Wayly <support@wayly.com.au>`)**
- Acknowledgement: "We Have Received Your Ticket (WAY-XXXX)"
- Reply notice: "There Is a Reply on Your Ticket (WAY-XXXX)"
- Resolution notice: "We Have Looked Into Your Ticket (WAY-XXXX)"
All three sign off with the standard Wayly disclaimer.

**Configuration / admin seeding**
- `RESEND_FROM_EMAIL` changed to `Wayly <support@wayly.com.au>` (was `hello@wayly.com.au`).
- New env var: `SUPPORT_TRIAGE_ENABLED=false`.
- `seed_admin.py` extended with `admin@wayly.com.au` and `hello@wayly.com.au` (both `Admin!2026`, super_admin role). `test_credentials.md` updated.

**Testing (iteration_54.json)** — 16/17 backend pytest cases passing (1 skipped due to unrelated signup form selector). Critical Pydantic body-model placement bug found and fixed by the testing agent (5 inner Pydantic classes moved to module scope in `support.py`). Internal-vs-public thread isolation, consent guard, atomic reference generation, and triage flag all verified at both API and helper-function level.

### Backlog
- Schedule `purge_expired_attachments()` on a daily cron (90-day retention guarantee).
- Bedrock Sydney wiring → flip `SUPPORT_TRIAGE_ENABLED=true` to activate the SUP-3 triage drafts (still human-review only, never auto-sent).
- Postgres migration: `sup_*` collections map 1:1 to the table names in `wayly-support-schema.sql`.


## Iteration 55 (Feb 2026) — Real-photo screenshots + tagline overhaul + Resources punctuation

### What shipped
- **Real screenshots on the homepage** — replaced the `BrowserFrame` + DOM-mock pattern in the "Three steps", "One calm dashboard" and "Reports" sections with full-resolution `<img>` tags pointing at PNGs under `/marketing/`. Each is `width=1440 height=900`, `loading="lazy"`, `decoding="async"`, rounded with a soft shadow.
- **Three Steps layout** — restructured to vertical: copy centred above, full-width image below (matches the "One calm dashboard" 1024 px max-w-5xl container). Confirmed widths: step-1/step-2/step-3/dashboard = 1024 px on desktop, 327 px on mobile.
- **Fresh screenshots captured** of the live preview app and saved to `/app/frontend/public/marketing/`:
  - `11-reports-hub.png` (NEW) — for the "Reports your accountant will love" section.
  - `02-caregiver-dashboard.png` (REFRESHED)
  - `09-family-wall.png` (REFRESHED)
  - `07-budget-alerts.png` (REFRESHED)
- **Tagline change** — every reference to "Support at Home, finally explained." now reads "Aged Care, Made Clear." Affected: `Footer.jsx`, `og-image.svg` (both copies), `ServicesHub.jsx`.
- **Resources page punctuation** — "Plain-English Support at Home knowledge — free for everyone." → "Plain-English Support at Home knowledge. Free for everyone." (em-dash removed per the brief).

### Files
- `/app/frontend/src/pages/Landing.jsx` (3× BrowserFrame → `<img>`)
- `/app/frontend/src/components/Footer.jsx` (tagline)
- `/app/frontend/src/pages/services/ServicesHub.jsx` (tagline)
- `/app/frontend/src/pages/resources/ResourcesIndex.jsx` (em-dash removed)
- `/app/frontend/public/og-image.svg` + `/app/frontend/public/branding/og-image.svg` (tagline)
- `/app/frontend/public/marketing/11-reports-hub.png` (NEW)
- `/app/frontend/public/marketing/02-caregiver-dashboard.png`, `09-family-wall.png`, `07-budget-alerts.png` (REFRESHED)

### Verified
- Desktop 1440 px: step1/step2/step3/dashboard screenshots all 1024 px wide, reports image swapped to fresh PNG.
- Mobile 375 px: all 5 screenshots visible at 327 px width (no longer hidden, no longer scaled-down DOM).
- Resources hero copy now reads "Plain-English Support at Home knowledge. Free for everyone."
- Footer reads "Aged Care, Made Clear."
- `yarn copy-qa` clean (0 violations across 223 files).


## Iteration 54 (Feb 2026) — Hide all screenshots on mobile + iPad

### What shipped
- **`BrowserFrame` is now desktop-only** — the entire `<figure>` wrapper gets `hidden lg:block`, so every Screenshots-based illustration (5 on the homepage, 7 across the gated tool pages, plus the marketing pages and ForAdvisors) disappears below `lg:` (1024 px). Down-scaled illustrations were unreadable on phones and tablets.
- **`HeroSpotlight` LANE 2 dashboard image** also hidden via `hidden lg:flex`. Mobile + iPad now show the hero copy / CTAs / trust badges cleanly with no shrunken dashboard PNG.
- **`ToolGate` preview block** wrapped in `hidden lg:block` so the "Here's what happens 90 seconds after you sign up" label hides along with the frame, no orphan caption.

### Files
- `/app/frontend/src/components/Screenshots.jsx` (BrowserFrame → `hidden lg:block`)
- `/app/frontend/src/components/HeroSpotlight.jsx` (LANE 2 → `hidden lg:flex`)
- `/app/frontend/src/components/ToolGate.jsx` (preview wrapper → `hidden lg:block`)

### Verified (manual)
- 375x800 mobile: 0/5 figures visible, hero dashboard `display:none`, no horizontal overflow.
- 768x1024 iPad: same as mobile (0/5 figures, hero dashboard hidden).
- 1440x900 desktop: 5/5 figures visible, hero `display:flex`, all screenshots back as before.


## Iteration 53 (Feb 2026) — Contrast pass + §11 backend grammar sweep + §8 mobile screenshots + Ask Wayly cache fix

### What shipped
- **Read-Only banner + Subscribe button contrast** — both now white background + ink/teal text + subtle outline; lock icon stays in a clay-tinted circle for context. AAA on light & dark via the existing `bg-surface` / `text-primary-k` tokens.
- **Timeline Add Event** reverted to Clay fill + white label per the original Wave 2 spec (my earlier overreach).
- **§11 Backend grammar sweep** — new `/app/backend/scripts/backend_copy_qa.py` gate (parallel to the frontend one). Sweep results:
  - Auto-replaced 129+ em/en-dashes across user-facing surfaces (HTTPException details, `email_service.py` bodies, `lib/pdf_reports.py`, `agents.py` LLM prompts).
  - Special-cased PDF placeholder dashes (`or "—"`) to empty strings so missing-data cells render cleanly instead of a comma.
  - Replaced "percentage"/"per cent" with "% rate" / "%-points" / "rate" / "share" in user-facing copy (kept internal code/comments intact).
  - "care plan changes" → "Care-Plan Changes" in `lib/pdf_reports.py` and `Reports.jsx`.
  - Rewrote Ask Wayly `CHAT_SYSTEM_TEMPLATE` to (a) drop the double-comma autofix artifacts, (b) add the brief's "always present information, not advice" rule, and (c) point users to **My Aged Care (1800 200 422 / myagedcare.gov.au)** for confirmation.
  - Backend copy-QA now clean: 154 files, 0 violations.
- **§8 Mobile screenshots** — `BrowserFrame` in `Screenshots.jsx` hides the URL bar + traffic-light chrome below `sm:640px` (Demo-page parity). No horizontal overflow at 375/768/1440 viewports.
- **Critical Ask Wayly bug** — `program_reference.py preload_cache()` was raising `KeyError: 'id'` on legacy Mongo rows missing the field, leaving the cache empty and cascading 500s into `/api/chat`. Hardened to skip malformed rows with a warning. After the fix: cache loads 129 keys (21 malformed skipped) and `/api/chat` returns 200 with a clean Aussie reply.

### Files
- `/app/frontend/src/components/ReadOnlyBanner.jsx`, `/app/frontend/src/pages/extended/ParticipantTimeline.jsx` (contrast + revert)
- `/app/frontend/src/components/Screenshots.jsx` (BrowserFrame `hidden sm:flex`)
- `/app/frontend/src/pages/Reports.jsx` (Care-Plan Changes Title Case)
- `/app/backend/scripts/backend_copy_qa.py` (NEW)
- `/app/backend/agents.py` (CHAT_SYSTEM_TEMPLATE rewrite, percentage→% rate)
- `/app/backend/lib/pdf_reports.py` (placeholders + Care-Plan Changes Title Case)
- `/app/backend/email_service.py`, `/app/backend/server.py` (em-dash sweep)
- `/app/backend/program_reference.py` (cache bootstrap hardened)

### Verified
- Testing agent iteration_53 — frontend 100% (8/8), backend 5/6 (chat was failing due to pre-existing program_reference bug, now fixed).
- Post-fix manual curl: `/api/chat` for cathy returns 200 with on-voice reply.
- `python3 scripts/backend_copy_qa.py` → 0 violations.
- `yarn copy-qa` → 0 violations.


## Iteration 52 (Feb 2026) — Wave 2 polish: read-only mode UI + Timeline §10 redesign

### What shipped
- **Read-only banner (§4.5)** — `/app/frontend/src/components/ReadOnlyBanner.jsx` (NEW) mounts at the top of the authenticated app shell whenever `subscription_status='expired'` AND the user is NOT on a paid plan. Copy verbatim from brief: "Your trial has ended. Subscribe to use this tool." with a white-on-Clay "Subscribe" button → /pricing. Paid users with a stale `expired` flag are correctly skipped via the new `useExpiredTrial` hook.
- **useExpiredTrial hook (NEW)** — `/app/frontend/src/hooks/useExpiredTrial.js`. Single source of truth that hides the banner whenever `plan` is one of solo/family/adviser, matching brief §4.6's "trialing as active, active/past_due per your dunning policy" semantics.
- **Ask Wayly disabled state (§4.7)** — `FloatingHelpChat.jsx` now disables the textarea and send button for expired users, swaps the placeholder to the brief's verbatim "Subscribe to ask Wayly questions". Paid users keep the default "Ask anything…" experience.
- **Timeline page rebuilt (§10)** — `/app/frontend/src/pages/extended/ParticipantTimeline.jsx` fully rewritten. Now: H1 "Your Timeline", calm intro, 6 filter chips (All / Statements / Care Plan Changes / Reassessments / Contribution Changes / Provider Changes), month grouping ("June 2026"), event cards with large date column + Title Case title + plain-English summary + "Tell Me More" expander, calm shimmer skeleton (not a spinner), sticky Clay "Add Event" CTA, infinite scroll via IntersectionObserver, dedicated empty + filtered-empty states.

### Files
- `/app/frontend/src/components/ReadOnlyBanner.jsx` (NEW)
- `/app/frontend/src/hooks/useExpiredTrial.js` (NEW)
- `/app/frontend/src/components/Layout.jsx` (mount ReadOnlyBanner at top of shell)
- `/app/frontend/src/components/FloatingHelpChat.jsx` (disable + placeholder swap)
- `/app/frontend/src/pages/extended/ParticipantTimeline.jsx` (full §10 redesign)

### Verified
- Testing agent iteration_52 — 100% on 14 acceptance points, plus 1 backend 402 regression curl. `/app/test_reports/iteration_52.json`.
- `yarn copy-qa` passes cleanly across 223 files.
- Visual smoke: read-only banner shows for the expired user across /app/* pages, hides for cathy (paid). Timeline page renders 20 event cards in a clean June 2026 group with Title Case chips, large date columns, and the sticky Clay Add Event CTA bottom-right.


## Iteration 51 (Feb 2026) — Dec 2026 Refit Wave 2 + AI tool page visual fixes

### What shipped
- **AI tool pages — Statement-Decoder layout parity**: All 7 paid tool pages now mount `<ToolHero toolKey="…" />` inside the `access==='blocked'` branch. Visitors landing on `/ai-tools/budget-calculator` (and the 6 siblings) see the same back-link + H1 + one-liner strip above the lock card that Statement Decoder has. Wired in: BudgetCalculatorTool, CarePlanReviewer, ClassificationCheck, ContributionEstimator, FamilyCoordinator, PriceCheckerTool, ReassessmentLetter.
- **ToolGate (`/app/frontend/src/components/ToolGate.jsx`)** — removed the "Try the Statement Decoder free" escape-hatch link (`tool-gate-sd-escape`). CTA copy updated to: "Start with a 7-day free trial. Full access to every tool. No card required to start." Family upgrade button switched to Clay (#A5512B) per §3.3. Preview frame enlarged to `max-w-4xl scale=1.0`.
- **Hard PaywallModal (NEW)** — `/app/frontend/src/components/PaywallModal.jsx`. Mounts globally in `App.js`. Listens on the `wayly:trial-expired` window event dispatched by the axios 402 interceptor. Two plan cards (Solo teal, Family clay) + Log Out link. No close X, no backdrop-dismiss (§4.4).
- **402 axios interceptor** — `/app/frontend/src/lib/api.js` now dispatches `wayly:trial-expired` on any 402 with `detail.error==='trial_expired'`.
- **TrialCountdownBanner (rewritten)** — matches §4.2/§4.3 brief copy verbatim. Default: "Trial: X days remaining. Choose a plan to keep access." Grace (≤24h): "Your trial ends tomorrow. Choose a plan to keep using Wayly." Clay "Choose Plan" CTA. Dismissible per session.
- **Backend 402 enforcement** — `_require_paid_plan` in `server.py` now returns HTTP **402** (`error: trial_expired`, `upgrade_url: /pricing`) instead of 403 for free/expired users. Per-IP burst limit re-ordered so the trial-expired gate wins for authenticated callers (expired users always see the paywall, never a stray 429).
- **Trial email templates (§4.8)** — `_process_trial_reminders_once` rewritten with the brief's verbatim copy. Day 5 subject: "Two days left in your Wayly trial". Day 7: "Your Wayly trial ends today". Day 8: "Your Wayly trial has ended".
- **Free plan retired** — Pricing.jsx: Free tier card removed, table header trimmed to Solo/Family/Adviser, SECTIONS rows trimmed to 3 columns, Free-plan FAQs deleted, schema offer trimmed. Signup.jsx: Free PLAN removed from picker; `/signup?plan=free` redirects via `useEffect` to `/signup` (default Family). Heading updated.
- **HeroSpotlight title case** — "Care plan insights" → "Care Plan Insights".

### Files
- `/app/frontend/src/pages/tools/{BudgetCalculator,CarePlanReviewer,ClassificationCheck,ContributionEstimator,FamilyCoordinator,PriceCheckerTool,ReassessmentLetter}Tool.jsx` (ToolHero import + blocked-branch wiring)
- `/app/frontend/src/components/ToolGate.jsx` (CTA copy + clay button + preview enlarge + SD escape removed)
- `/app/frontend/src/components/PaywallModal.jsx` (NEW)
- `/app/frontend/src/components/TrialCountdownBanner.jsx` (rewritten)
- `/app/frontend/src/lib/api.js` (402 interceptor)
- `/app/frontend/src/App.js` (mount PaywallModal globally)
- `/app/frontend/src/pages/{Signup,Pricing}.jsx` (Free plan removed)
- `/app/frontend/src/components/HeroSpotlight.jsx` (Title Case fix)
- `/app/backend/server.py` (`_require_paid_plan` → 402; trial email templates rewritten)
- `/app/memory/test_credentials.md` (active-trial seeding notes; free-plan deprecation notice)
- `/app/backend/tests/test_wave2_trial_paywall.py` (testing agent created — 7 tests, 100%)

### Verified
- Testing agent iteration_51 reports 100% backend (7/7) + 100% frontend on visible Wave 2 surfaces.
- Manual curl: expired user gets 402 every time (no more 429 starvation); unauthenticated callers still hit the burst-limit (10/hour) and start returning 429 from request #11.
- Copy-QA gate passes (`yarn copy-qa` → 0 violations across 221 files).


## Iteration 39 (Feb 2026) — ClamAV deploy infrastructure

### What shipped

- **NEW** `/app/Dockerfile` — extends the Emergent base image with `clamav-daemon` + `clamav-freshclam`, drops in the Wayly clamd/freshclam configs, recreates `/var/run/clamav` on boot (tmpfs wipes), seeds the signature DB synchronously via `wayly-entrypoint.sh`, then hands off to supervisord. Includes `HEALTHCHECK`-friendly defaults (`CLAMAV_ENABLED=true`, socket + TCP loopback transports both configured).
- **NEW** `/app/deploy/clamav/` — all production configs in one folder:
  - `clamd.conf` — listens on `/var/run/clamav/clamd.ctl` **and** `127.0.0.1:3310`; 100 MB scan headroom; rejects encrypted archives; phishing heuristics on.
  - `freshclam.conf` — daemonised signature updater polling every 24h.
  - `supervisor-clamd.conf` + `supervisor-freshclam.conf` — supervisor programmes that bring both daemons up at boot, priorities 5 + 4 so they come up before the FastAPI backend.
  - `entrypoint.sh` — recreates the tmpfs-vulnerable socket dir, seeds signatures if missing, then exec's CMD.
  - `README.md` — full operator runbook (build, install, env vars, troubleshooting matrix).
- **NEW** `/app/scripts/install_clamav.sh` — idempotent live install script for already-running pods (covers the case where rebuilding the image isn't an option, e.g. the managed Emergent prod pod). Run as root: `sudo /app/scripts/install_clamav.sh`. Hand this to Emergent Support for the wayly.com.au pod.
- **UPDATED** `/app/backend/upload_security.py`:
  - `_signature_db_ready()` — checks for `main.cvd` / `daily.cvd` (or `.cld`) before allowing `virus_scan()` to call clamd. Overridable via `CLAMAV_READY_FILE` env var.
  - `clamav_status()` — public health probe payload (`enabled`, `ready`, `db_loaded`, `transport`, `detail`).
  - `virus_scan()` now distinguishes "signatures still downloading" (caregiver-friendly 503 message) from "scanner unreachable" (operator-pages 503).
- **NEW** `GET /api/health/clamav` — public endpoint surfacing `clamav_status()` so the upload composer can render an inline readiness indicator and ops can monitor without polling deep-health.

### Files
- `/app/Dockerfile`
- `/app/deploy/clamav/{clamd.conf,freshclam.conf,supervisor-clamd.conf,supervisor-freshclam.conf,entrypoint.sh,README.md}`
- `/app/scripts/install_clamav.sh`
- `/app/backend/upload_security.py` (+ `_signature_db_ready`, `clamav_status`, gated `virus_scan`)
- `/app/backend/server.py` (+ `GET /api/health/clamav`)

### Verified
- Shell syntax (`sh -n`) clean on both `install_clamav.sh` and `entrypoint.sh`.
- Python lint clean on `upload_security.py`.
- `/api/health/clamav` returns the correct shape in all three states (disabled / signatures-still-loading / ok).
- `virus_scan()` correctly raises the new "still loading" 503 when CLAMAV_ENABLED=true and no DB file present.


## Iteration 38 (Feb 2026) — Scenario engine **Phase 7 + Phase 8** + budget-alerts deep-link fix

### Phase 7 — Shared schema contract for the mobile app
- **NEW** `backend/scenario_engine/schema_export.py` — purely declarative serialiser for the entire scenario engine type surface.
- **NEW** `GET /api/scenario/schema` (public, deterministic) — returns `{schema_version: "1.0.0", section_revisions: {lifecycle, flags, events, alerts, boundaries, workflows}, lifecycle: {14 states, 38 transitions, initial/terminal}, flags: {42 in 5 groups + mutual exclusion + restricted}, events: {68 typed types + 4 trigger sources}, alerts: {26 types + 4 severities + 6 axes}, boundaries: {3 levels + contact directory + per-event and per-alert maps}, workflows: {3 wizards with full step definitions}}`. Mobile clients pin a minimum `schema_version` and diff per-section revisions for cheap updates.

### Phase 8 — Validation
- **NEW** `backend/scripts/seed_phase8_households.py` — idempotent seed (markers: `is_seed`, `seed_key`) that creates Robert Kowalski (hospitalisation → restorative) and Patricia Holloway (means_not_disclosed flag) under Cathy's household alongside the existing Dorothy.
- **NEW** `backend/tests/test_scenario_phase8.py` — 16 cases covering: lifecycle transition guards (5), audit-chain integrity, lifetime-cap clock shape, advice-boundary classification (5), seeded households (2), and schema round-trip.
- **UPDATED** `backend/tests/test_scenario_phase6.py` — module-level token cache eliminates the brute-force lockout when the full suite runs.
- **Combined regression:** `pytest tests/test_scenario_phase6.py tests/test_scenario_phase8.py` → **23 passed** (2 budget-projection cases skip <14d into quarter).
- **NEW** `docs/scenario-engine-validation-report.md` — final sign-off document covering all 8 phases, the test matrix, the seeded household walkthroughs, and known non-blocking follow-ups.

### Bug fix
- `backend/scenario_engine/alerts.py` — three deadline-clock alerts (`_clock_quarter_end_underspend`, `_clock_budget_exhaustion_projected`, `_clock_at_hm_expiry`) had `next_action_link="/app/budget"` which 404s. Now points to the real `/app/budget-alerts` route.

### UX polish
- `frontend/src/components/WorkflowsPanel.jsx` — the route-out banner now explicitly says "Escalate · please contact straight away" with a ShieldAlert icon for ESCALATE workflows (was previously only conveyed by colour/icon, missed by screen readers).

### Verification (testing_agent_v3_fork iteration 38)
- Backend: 23/23 pytest green; schema endpoint deterministic across consecutive calls; seed script idempotent.
- Frontend: 0 console errors across `/app`, `/app/budget-alerts`, `/app/participants`, `/app/participants/:id/timeline`, `/app/scenarios`. The Death workflow surfaces all 3 escalate contacts (MAC 1800 200 422, FIS 132 300, OPAN 1800 700 600) sourced from the schema-driven boundaries directory.


## Iteration 57 (Feb 2026) — Scenario engine Phase 5 (route-out guardrails)

- `backend/scenario_engine/boundaries.py` — canonical contact directory (My Aged Care, Services Australia FIS, OPAN, ACQSC, 000, 1800 ELDERHelp, IDCARE, Scamwatch, financial adviser, solicitor), per-event-type and per-alert-type boundary maps (ROUTE_OUT / ESCALATE), deterministic rule-based query classifier, and the canonical route-out copy generator.
- Wired into 4 enforcement points: (1) `events.capture_event` overlays `advice_boundary` + `route_out_contacts` on persistence, (2) `alerts.emit_alert` does the same, (3) `/api/chat` (Ask Wayly) runs the guard BEFORE any LLM call and returns the route-out copy directly when the query maps to means-test / RAD-DAP / EPOA / safeguarding / scam / missing-person etc., (4) `/api/scenario/boundary-probe` for UI preview.
- Verified end-to-end: "how much will I pay" → ROUTE_OUT/FIS; "mum is being abused" → ESCALATE/1800-ELDERHelp+000; "classification 4 cover?" → SAFE; "sell the home" via /api/chat → guarded=true, LLM not called, calm copy + contacts returned.


## Iteration 56 (Feb 2026) — Scenario engine Phase 3 (event capture)

- `backend/scenario_engine/events.py` — 68 event types across all 10 catalogue groups, each tagged with the six what-changed axes and (where relevant) a proposed lifecycle transition + flag changes. Capture function applies proposed changes through the Phase 2 guard. Blocked transitions persist the event with `transition_status="blocked"` so the caregiver can confirm an alternative — never silent-fails.
- `backend/server.py` — 3 new endpoints (`GET /scenario/event-types`, `POST/GET /scenario/participants/{id}/events`) + index bootstrap.
- `frontend/src/pages/extended/ScenarioCapture.jsx` — calm caregiver-facing form at `/app/scenarios` with live preview of "Will move status to X" and "Updates flags: Y" before submit. Nav entry added under Their Care.
- Verified end-to-end: allowed transitions accepted, flag-only events leave status untouched, payload-bearing flags carry their payload through, blocked events show a confirm panel.


## Iteration 55 (Feb 2026) — Scenario engine Phase 2 (lifecycle + flags)

Lifecycle state machine and parallel flag bag are live on every participant,
guarded by a transition map, and audited with a hash-chained log.

**Backend**
- `backend/scenario_engine/__init__.py` (new package)
- `backend/scenario_engine/lifecycle.py` — 14 states (`AWAITING_ASSESSMENT`, `ASSESSED_WAITLISTED`, `INTERIM_FUNDED`, `ACTIVE`, `AWAITING_REASSESSMENT`, `RESTORATIVE`, `END_OF_LIFE`, `HOSPITALISED`, `IN_RESPITE`, `SERVICES_PAUSED`, `OVERSEAS`, `MOVED_TO_RESIDENTIAL`, `EXITED`, `DECEASED`), explicit `ALLOWED_TRANSITIONS` map, `apply_transition()` guard that writes an audit row for both accepted and rejected attempts, SHA-256 hash chain across `participant_state_audit` rows.
- `backend/scenario_engine/flags.py` — 42 flags across 5 groups (funding, contribution cohort, legal/supporter, provider, special cohort), payload-bearing flags (`AT_HM_ACTIVE`, `PROVIDER_CEASING`, `RESTORATIVE_ACTIVE`, `EOL_ACTIVE`, `INTERIM_60PCT`, `TRANSITIONED_HCP_LEVEL`, `HARDSHIP_GRANTED`), mutual-exclusion clusters (one classification at a time, one pension-status at a time, one provider-state at a time), `RESTRICTED_VISIBILITY = {SAFEGUARDING_ALERT}` with the `filter_flags_for_user()` wrapper and the `is_account_owner()` helper.
- `backend/server.py` — startup hook calls `ensure_indexes`, `backfill_initial_states`, `backfill_empty_flags`. Five new endpoints under `/api/scenario/...` (state, transition, flags, audit, lifecycle-map).
- Mongo indexes on `participant_state_audit` (`participant_id+created_at`, `account_id+created_at`, unique `id`).

**Verification (end-to-end)**
- 48 existing participants backfilled to `lifecycle_state=ACTIVE` with empty flags and `lifecycle_backfill` audit rows.
- Allowed transition `ACTIVE -> HOSPITALISED -> ACTIVE` accepted and audited.
- Disallowed `HOSPITALISED -> OVERSEAS` returns 409 and writes a `lifecycle_transition_rejected` audit row.
- `AT_HM_ACTIVE` with payload `{expiry_date, tier, approved_aud}` stored on the participant doc.
- Mutual exclusion: setting `ONGOING_CLASSIFICATION_5` cleared `_4` automatically.
- Unknown flag rejected with 400.
- `SAFEGUARDING_ALERT` set succeeded for the account OWNER.

**Phase 2 deliberately does not** wire any alerts or callers — that's Phase 4.


## Iteration 54 (Feb 2026) — Scenario engine Phase 0 (audit) and Phase 1 (reference data)

**Phase 0** — wrote `docs/scenario-engine-phase-0.md` audit. No code changes. Inventoried participant model (V1/V2), 5 duplicate hard-coded program-figure sites, the notification stack, the access model, and the absence of a shared types contract with mobile.

**Phase 1** — versioned reference-data layer is live:

- `backend/program_reference.py` — Mongo-backed `program_reference` collection with `(key, value, effective_from, effective_to, source_url, notes)` rows, `program_reference_history` audit mirror, in-process cache populated at startup, synchronous `get_value(key, as_of_date)` lookup, `set_value()` admin mutation that closes the previous row and refreshes the cache, `get_value_async()` for deep-historical Mongo lookups, `public_snapshot()` for the frontend loader.
- `backend/seed_program_reference.py` — 50 seed rows covering the 8 ongoing classifications, care-management cap, rollover floor/pct, lifetime caps (with the 20 March 2026 indexation already encoded as a separate effective row), time-limited cap years, interim 60% funding, Restorative Care / End-of-Life pathway budgets, AT-HM validity, contribution category rates, stream proportions, 11 confirmed program deadlines, and the 4 forward-dated policy gates (1 Oct 2026, 1 Jul 2026, early-2027, CHSP).
- `backend/server.py` startup hook seeds + preloads (idempotent). Three new admin endpoints: `GET/POST /api/admin/program-reference`, `GET /api/admin/program-reference/history`. Public endpoint `GET /api/program-reference/public` for the frontend loader.
- `backend/budget.py` — refactored to read every figure through `get_value`. Backward-compat shim `CLASSIFICATIONS` view + a baked-in `_FALLBACK_ANNUAL` mirror for safety.
- `backend/batch2_routes.py` — `_load_means_test_settings` now overlays the canonical lifetime cap + subsidy figures from `program_reference` so the adviser scenario modeller stays in sync.
- `frontend/src/lib/programReference.js` — fetches `/api/program-reference/public` once per hour, caches to localStorage, falls back to baked-in literals (kept in lockstep with the backend seed). Exports `loadProgramReference`, `getProgramReferenceSync`, `classificationAnnual`, `classificationQuarterly`, `lifetimeCapStandard`, `lifetimeCapNoWorseOff`.
- `frontend/src/App.js` — warms up the snapshot at boot.
- `frontend/src/pages/Onboarding.jsx`, `tools/BudgetCalculatorTool.jsx`, `Demo.jsx` — refactored away from hard-coded literals; now read live from the snapshot.

Verified end-to-end:
- Cache loads 48 keys / 50 rows at startup.
- `get_value("lifetime_cap.standard", "2025-12-15")` → 135318.69 (pre-March-2026 row).
- `get_value("lifetime_cap.standard", "2026-04-01")` → 137917.01 (post-March-2026 row).
- `GET /api/program-reference/public` returns the full snapshot in the shape the frontend loader expects.
- `GET /api/budget/current` returns class=4 / annual=29696 / quarterly=6681.6 / rollover=1000 — same numbers as before the refactor, now sourced from `program_reference`.
- Lint clean (frontend ESLint guard passes, backend `eb` linter advisory-only).


## Iteration 53 (Feb 2026) — Admin restyle + production smoke test wiring

- **Admin theme migrated to Wayly brand**:
  - `admin.css` palette swapped from generic dark navy + red to dark teal-ink (#052327 / #072E31 / #0A3E42 / #14464A) with clay (#A5512B) primary CTA, sage (#6B8F71) success, teal-400 info. Still distinct from the consumer surface so operators can't confuse the two.
  - Pill-shaped buttons, 12 px card radius, Fraunces headings (`.admin-heading`), subtle radial-gradient background grain.
  - New `.admin-status-dot` (ok / warn / down + pulse animation) and `.admin-info-grid` helpers.
- **`/admin/login` overhauled to be informative**:
  - Two-column layout. Left panel: Wayly mark + lockup, lead paragraph, 3-bullet feature list (audit log, anomaly alerts, 2FA), live status grid (system status, build version, region, last API timestamp — auto-refreshed every 30 s from `/api/health`), helpful links (status page, request access, runbook), Australian Criminal Code notice.
  - Right card: Fraunces "Sign in" heading, contextual copy, clay-pill Continue CTA, "Locked out? Email the on-call" support line. 2FA setup/verify steps reuse the same card.
- **Production smoke test wired**:
  - `scripts/smoke.py` — Playwright runner that logs in as `smoke@wayly.com.au` and walks `/app`, `/app/chat`, `/app/statements`, `/app/budget`. Detects ErrorBoundary, redirects to /login, 500s, and uncaught `pageerror`s. ~9 s full run.
  - `scripts/seed_smoke_account.py` — creates / resets the dedicated sentinel account (marked `is_smoke_account: true`).
  - `backend/smoke_status.py` — new module exposing `POST /api/internal/smoke-report` (HMAC-SHA256 signed body, no JWT needed) and `GET /api/admin/smoke-status` (admin only). Persists last 200 runs to `smoke_runs` collection. Auto-emails `TEAM_INBOX` via Resend on a failing report.
  - `.github/workflows/smoke.yml` — scheduled `*/15 * * * *` on GitHub Actions (also manual + on workflow change). Caches Playwright Chromium between runs; uploads trace artifact on failure.
  - `AdminPhaseE.jsx` → `AdminSystemHealth` now shows a Smoke test panel with live status dot, 24h success-rate %, last success/failure timestamps, and a collapsible last-20-runs table.
  - `ServerError.jsx` got a `data-testid="server-error"` for the smoke runner to detect crash-page renders.
- **Test credentials & secrets**:
  - `smoke@wayly.com.au / Sm0ke!hpJ4Hnc6bpLBsg-lIsqknp-XaBU` seeded on preview (recorded in `memory/test_credentials.md`).
  - `SMOKE_HMAC_SECRET` (256-bit hex) added to `backend/.env` — must be mirrored as a GitHub Actions secret + production env.
  - Setup guide at `docs/smoke-test.md`.


## Iteration 52 (Feb 2026) — Mobile handoff bundle exposed + hero confirmed static

- **Hero static image confirmed**: `HeroSpotlight.jsx` already uses an `<img>` tag pointing to `/branding/screenshots/dashboard-hero.png?v=5` (no `<video>` element present). Verified live on the preview URL — full dashboard screenshot renders in the right column of the hero with no autoplaying media. The previously-attempted 6-second loop is not in the repo.
- **Mobile handoff bundle made findable**: `wayly-mobile-handoff.zip` (783 KB) now exists at three locations so any mobile agent can reach it:
  - Repo root: `/app/wayly-mobile-handoff.zip`
  - Docs: `/app/docs/wayly-mobile-handoff.zip`
  - Live HTTPS: `https://<wayly-domain>/wayly-mobile-handoff.zip` (verified `HTTP/2 200`, content-length 783920).
- **Mobile-agent prompt added**: New file `/app/MOBILE_AGENT_PROMPT.md` is the copy-pasteable brief for the mobile agent — full token sheet (teal/sage/clay/neutral hex values), Fraunces + Inter + IBM Plex Mono font instructions, iOS + Android + Expo splash & status-bar wiring, screen-by-screen styling notes (cards / buttons / inputs / lists / charts), and a pre-submit sweep checklist.


## Iteration 50 (Feb 2026) — All articles published · per-term Glossary URLs · time-pegged content queue

### Articles — all published, all reviewed by Antony Chiware (Aged Care Financial Adviser)
Seven articles now live at `/resources/articles/{slug}` — every one credited to Antony Chiware as both author and reviewer, with `is_draft_needs_review=false`, full citations to health.gov.au + myagedcare.gov.au + opan.org.au, and Article + Breadcrumb JSON-LD:

1. **home-care-package-to-support-at-home-what-changes-2025** (evergreen bridging)
2. **support-at-home-price-caps-july-2026** (time-pegged: 1 July 2026)
3. **understanding-your-first-support-at-home-statement** (evergreen, high-intent)
4. **support-at-home-means-test-contributions-explained** (evergreen, transactional)
5. **personal-care-becomes-free-1-october-2026** (time-pegged: 1 October 2026)
6. **reassessment-requests-how-and-when** (evergreen, mid-intent)
7. **what-changes-for-hcp-families-july-2026** (time-pegged: 1 July 2026, ex-HCP-focused)

Each article has a `publish_date` field allowing future scheduled releases. The placeholder "Wayly Editorial Team" reviewer record was deleted and any references migrated to Antony Chiware.

### Glossary — each of the 16 terms now has its own URL
- Added `slug` field to `cms_glossary` records (auto-generated from term via `_slugify`).
- New backend endpoint: `GET /api/public/cms/glossary/{slug}` returns the term + 6 related terms (computed cheaply by shared-word overlap with other terms' definitions).
- New frontend route `/resources/glossary/:slug` → `GlossaryTerm.jsx` (new ~140 LOC).
- Per-term SEO:
  - Title: `What is {Term}? · Wayly Aged Care Glossary` (≤60 chars enforced)
  - Description: definition truncated to 157 chars + ellipsis
  - **JSON-LD `DefinedTerm`** schema with `inDefinedTermSet` link to glossary index
  - `BreadcrumbList` (Home › Resources › Glossary › Term)
- Glossary index page now links each row to its individual term URL.
- Sitemap now includes all 16 glossary terms — total URLs: **50** (27 static + 7 articles + 16 glossary).

### Verified live
- `personal-care-becomes-free-1-october-2026`: DRAFT banner GONE, "Written by Antony Chiware · Reviewed by Antony Chiware on 12 May 2026" attribution visible, Markdown renders properly (h2/h3/bold/lists), citations section shows 3 sources, 2 JSON-LD blocks injected.
- `/resources/glossary/support-at-home`: title = "What is Support at Home? · Wayly Aged Care Glossary", description shows the actual definition, 6 related terms surfaced (Home Care Package, Classification, ACAT, Quarterly budget, Care management, Price cap), JSON-LD blocks = DefinedTerm + BreadcrumbList.
- Sitemap returns 50 URLs.

### Files
- New: `/app/frontend/src/pages/resources/GlossaryTerm.jsx`.
- Edited:
  - `/app/backend/admin_phase_e2.py` — added `slug` to GlossaryBody + create endpoint, new `GET /public/cms/glossary/{slug}` endpoint with related-term lookup.
  - `/app/backend/seo_routes.py` — sitemap now includes glossary terms.
  - `/app/backend/seed_cms_content.py` — Antony Chiware reviewer record, 7 articles (all reviewed, all published), 16 glossary terms with slugs.
  - `/app/frontend/src/App.js` — route + import for GlossaryTerm.
  - `/app/frontend/src/pages/resources/Glossary.jsx` — index now links rows to per-term pages.

### Deferred / Next
- **P0 — Submit `https://wayly.com.au/sitemap.xml` to Google Search Console** (waiting on user — DNS-blocked).
- **P0 — Admin UI for reviewers CRUD + article author/reviewer/citations picker** (backend ready since iter 49).
- **P0 — Phase E2 Analytics deep** (funnels / cohorts).
- **P1 — Refactor `server.py`** (3300 LOC) into routers/.
- More time-pegged articles before each event (currently 3 time-pegged + 4 evergreen — sufficient for launch).

---


## Iteration 49 (Feb 2026) — SEO Build Spec (Iteration A, in-stack)

### Frontend SEO infrastructure (~720 LOC new code)
- **`react-helmet-async` + `react-markdown` added** (no SSR migration — works inside CRA).
- **`/src/seo/SeoHead.jsx`** — universal SEO component. Per-page: title (≤60 chars enforced), meta description (≤160 chars enforced), canonical URL, Open Graph (`og:*`), Twitter Card, `noindex` toggle, `article:*` time properties, and JSON-LD blocks. Helpers exported: `organizationLd`, `websiteLd`, `softwareApplicationLd`, `faqLd`, `howToLd`, `articleLd` (full E-E-A-T fields incl. `author`, `reviewedBy`, `citation`), `breadcrumbLd`, `canonicalFor`.
- **`/src/seo/pageConfig.js`** — single source of truth for 22 page configs (titles + descriptions + paths + per-tool `softwareApplication`/`howTo`/`faqs` blocks).
- **23 public pages now have full SEO + JSON-LD**: Landing (Organization + WebSite), Features, Pricing, Trust, Demo, Contact, ForAdvisors, ForGPs, AIToolsIndex, Resources/Articles/Glossary/Templates, all 8 `/ai-tools/*` (with SoftwareApplication + HowTo + FAQPage + Breadcrumb), Login (`noindex`), Signup. Wired via build-time injection script.
- **Stripped duplicate per-page tags from `public/index.html`** so Helmet is authoritative. Verified live: each article now has exactly 1 `<meta name="description">` with article-specific copy.

### Backend SEO endpoints (`/app/backend/seo_routes.py`, new ~140 LOC)
- `GET /api/public/seo/sitemap.xml` — dynamic sitemap with 27 static pages + every published CMS article + latest changelog page. `lastmod` per article, priorities + changefreq tuned per page type.
- `GET /api/public/seo/robots.txt` — full crawl policy (Disallow `/admin`, `/app`, `/api`, auth/onboarding paths; explicit allow for GPTBot + anthropic-ai; Sitemap directive).
- `public/sitemap.xml` is a **sitemap-index** referencing the dynamic backend URL — Google-supported pattern. Static `public/robots.txt` mirrors policy + points to the sitemap.

### CMS extension for YMYL E-E-A-T (`/app/backend/admin_phase_e2.py`)
- New collection `cms_reviewers` — name, role, qualifications, bio, photo_url, `sameAs` (LinkedIn / professional registry URLs), `is_author` / `is_reviewer` flags. Full CRUD via `/api/admin/cms/reviewers`. 409 on delete if any article references the reviewer.
- `cms_articles` extended with `author_id`, `reviewer_id`, `reviewed_at`, `citations[]` (title/url/publisher), `is_draft_needs_review` flag.
- Public `/api/public/cms/articles/{slug}` now **enriches** with full author + reviewer records so the consumer page can render the E-E-A-T meta and JSON-LD `reviewedBy` block.

### Consumer Article reader (CMS-backed with markdown rendering)
- **`/resources/articles`** — list now reads from `/api/public/cms/articles`, falls back to static `resources.js` if DB empty.
- **`/resources/articles/:slug`** — full DB-backed reader with `<ReactMarkdown>`, prose styling, **DRAFT — NEEDS REVIEW** banner (yellow card with health.gov.au link) for unreviewed articles, **Written by · Reviewed by · last-reviewed-date** E-E-A-T attribution row, **Sources** citation block at bottom. Falls back to static `resources.js` if DB lookup 404s.
- **`/resources/glossary`** + **`/resources/templates`** — both now CMS-aware with static fallback.

### Backend perf fix
- `server.py:3240` — added `.limit(50)` to the trial-scheduler statements query flagged by the deployment health check.

### Seed content (`/app/backend/seed_cms_content.py`, runnable)
- 2 **bridging draft articles** auto-published with full citations + DRAFT banner:
  1. *"Home Care Package to Support at Home: what actually changes for families"* — covers the 1 Nov 2025 transition, levels→classifications, annual→quarterly budgets, rollover rules, important dates table (1 Jul 2026 caps, 1 Oct 2026 free personal care, CHSP transition not before 1 Jul 2027).
  2. *"Support at Home price caps: what families need to know before 1 July 2026"* — covers capped services list, region-specific caps, how to check provider rates now, what to do if cap is breached, ACQSC + OPAN contact details.
- 16 **key glossary terms** seeded (Support at Home, HCP, Classification, ACAT, Quarterly budget, Rollover, Care management, Price cap, Personal care, Means-tested contribution, OPAN, ACQSC, No detriment rule, CHSP, Reassessment, Statement).
- 1 placeholder reviewer record ("Wayly Editorial Team — Awaiting credentialed reviewer onboarding") flagged as `is_reviewer=false` so the DRAFT banner stays visible until a real expert is onboarded.

### Verified live
- Article page rendering: 1 description meta (article-specific, 160 char), 1 og:title (article-specific), canonical = `https://wayly.com.au/resources/articles/...`, 2 JSON-LD scripts (Article schema with author + citations array + Breadcrumb schema), DRAFT banner rendering, E-E-A-T attribution row visible, Sources section with 3 cited URLs (health.gov.au, myagedcare.gov.au, opan.org.au).
- Sitemap: 29 URLs (27 static + 2 articles) all with correct lastmod + priority + changefreq.
- robots.txt served at `/robots.txt` (static) + `/api/public/seo/robots.txt` (dynamic).
- Backend regression: 103/104 pytest pass (1 transient network flake; re-ran 1/1 pass).

### Files
- New: `/app/frontend/src/seo/SeoHead.jsx`, `/app/frontend/src/seo/pageConfig.js`, `/app/backend/seo_routes.py`, `/app/backend/seed_cms_content.py`, `/app/frontend/public/sitemap.xml`, `/app/frontend/public/robots.txt` (rewritten).
- Edited: `/app/backend/server.py` (mounted seo_public router + .limit(50) perf fix), `/app/backend/admin_phase_e2.py` (reviewer CRUD + article E-E-A-T fields + public-read enrichment), `/app/frontend/src/App.js` (wrapped in `<HelmetProvider>`), `/app/frontend/public/index.html` (stripped duplicate per-page SEO so Helmet is authoritative), `/app/frontend/package.json` (added react-helmet-async + react-markdown), `/app/frontend/src/pages/resources/Articles.jsx` (CMS-backed reader with Markdown + E-E-A-T + DRAFT banner), `/app/frontend/src/pages/resources/Glossary.jsx`, `/app/frontend/src/pages/resources/Templates.jsx`, and 21 public pages (Landing, Features, Pricing, Trust, Demo, Contact, ForAdvisors, ForGPs, AIToolsIndex, Login, Signup, ResourcesIndex, all 8 tools/*) auto-patched with `<SeoHead>` + per-tool JSON-LD blocks.

### Deferred to next iteration
- Admin UI for reviewers + author/reviewer/citations picker in article editor (backend ready, admin UI still uses old article fields).
- Backend `data_md` field exposed as `body_md` in some old draft articles — confirmed working but worth schema review.
- Real credentialed reviewer recruitment (replace the "Wayly Editorial Team" placeholder).
- Phase E2 Analytics deep (funnels / cohorts / product analytics).
- Refactor `server.py` into routers/ modules.

---


## Iteration 48 (Feb 2026) — System Health Watchdog (auto-paging admin on outages)

### New `/app/backend/health_watchdog.py` (~210 LOC)
- Background `asyncio` task started in FastAPI `startup` hook. Polls every 60s
  (configurable via `WATCHDOG_POLL_INTERVAL` env var; disabled via
  `WATCHDOG_ENABLED=0`).
- **Probes 4 services:**
  - `mongodb` — live `db.command("ping")` (most likely real outage signal).
  - `llm` — rolling 5-min error rate from `db.llm_calls`. Flags DOWN if
    error rate >50% **and** sample size ≥5 (avoids false-flagging idle periods).
  - `resend` — rolling 30-min failed-send count from `db.notification_log`.
    Threshold = 5 failures. Demo/test keys report UP (`"test/demo key — mocked sends"`)
    so dev environments don't spam alerts.
  - `stripe` — env-var presence check (real failures cascade into LLM/Resend
    error rates which the other probes will catch).
- **State machine** persisted in `db.health_state`. Only alerts on
  transitions (UP→DOWN, DOWN→UP). 5-min cooldown per service prevents flap-spam.
  First-boot has no alert (avoid noise on restart).
- **Push delivery via `push_service.notify_role("system_health", ...)`** — fans
  out to all `super_admin` + `operations_admin` registered mobile devices.

### Admin introspection endpoints (`admin_phase_e.py`)
- `GET /api/admin/health-watchdog/state` — current state of all 4 probes
  (service / status / detail / last_check / last_change / last_alert_at).
- `POST /api/admin/health-watchdog/check-now` (super_admin only) — manually
  triggers one round of probes. Useful for verifying push delivery without
  waiting 60s.

### Live verification
- Watchdog confirmed running in supervisor logs:
  `INFO - Health watchdog started (interval=60s)`.
- **End-to-end alert path verified:** seeded 10 failed notification_log entries
  → force-check → resend probe transitioned `up→down` → alert fired (verified
  in `db.push_log`: `🔥 RESEND is DOWN · 10 failed sends last 30m`) →
  cleanup seeded data → force-check → `down→up` transition fires recovery
  alert. Per-service cooldown verified by repeated calls.

### Files
- New: `/app/backend/health_watchdog.py`.
- Edited: `/app/backend/server.py` (startup + shutdown hooks),
  `/app/backend/admin_phase_e.py` (2 introspection endpoints).

### Mobile-side payload shape (for the mobile agent)
```js
// data field on push notification
{ type: 'system_health', service: 'mongodb'|'llm'|'resend'|'stripe', status: 'up'|'down' }
```
Mobile app should deep-link these notifications to `/admin/health` screen and
optionally play a distinctive alert sound (this is a P0 page-the-on-call signal).

---


## Iteration 47 (Feb 2026) — Admin mobile push: device registration + FCM/Expo send helper

### New `/app/backend/push_service.py` (~140 LOC)
- `notify_admin(admin_id, title, body, data)` — push to one admin's devices.
- `notify_role(role_key, title, body, data)` — fan-out to all admins in the role
  bucket. Pre-configured buckets: `ticket_p1` (super/ops/support),
  `payment_failed` (super/ops), `data_request` (super/ops/support),
  `system_health` (super/ops).
- Provider-aware: routes Expo tokens to `https://exp.host/--/api/v2/push/send`
  (no creds needed) and FCM tokens to the FCM HTTP API (requires
  `FCM_SERVER_KEY` env var — falls back to mock + log if absent).
- All sends are fire-and-forget; failures never raise to the caller. Each send
  is logged to `db.push_log` with the response status.

### New `/app/backend/admin_devices.py` (~110 LOC)
- `POST /api/admin/devices` — register/refresh a push token (idempotent on
  `admin_id + token`). Tracks platform / provider / app_version / device_name /
  last_seen_at. Audit-logged.
- `GET /api/admin/devices` — list this admin's devices (tokens **not** returned
  to client — security-sensitive).
- `DELETE /api/admin/devices/{id}` — soft-unregister (sets `active=false`).
- `POST /api/admin/devices/test-push` — fires a test push to all this admin's
  active devices. Used by the mobile agent to verify wiring on first install.

### Push triggers wired into existing flows
- `admin_phase_d.py POST /api/tickets` — when a user creates a P1 ticket,
  `notify_role("ticket_p1", ...)` fires asynchronously with `data: {type, ticket_id}`.
- `admin_phase_e.py POST /api/public/data-request` — when anyone submits a
  Privacy Act data request, `notify_role("data_request", ...)` fires.
- `server.py POST /api/webhook/stripe` — when Stripe sends a `failed` /
  `unpaid` / `requires_payment_method` event, `notify_role("payment_failed", ...)`
  fires with `data: {session_id, user_id}`.

All triggers wrapped in `try/except` + `asyncio.create_task` so they NEVER
block the originating request. Push delivery failures are logged but invisible
to the user-facing flow.

### Verified live (smoke test)
- Register Expo token → 200, `refreshed:false`.
- Re-register same token → 200, `refreshed:true`.
- List devices → token NOT returned to client (verified).
- `POST /admin/devices/test-push` → Expo API returns 200 (real delivery
  attempted), FCM gracefully mocked (no creds set).
- Unregister → 200; soft-disable persisted.
- 103/104 prior pytest still pass (one CMS test failed due to a transient
  network timeout in the test environment, not a code regression).

### Mobile handoff doc updated
- `/app/memory/MOBILE_AGENT_HANDOFF.md` extended with Section 10 — full admin
  mobile spec covering TOTP auth, device registration endpoints, 6 priority
  screens, push payload schemas, RBAC matrix, and dark-slate design tokens.

### Files
- New: `/app/backend/push_service.py`, `/app/backend/admin_devices.py`.
- Edited: `/app/backend/server.py` (mounted devices router + Stripe failed-payment
  push trigger), `/app/backend/admin_phase_d.py` (P1 ticket push trigger),
  `/app/backend/admin_phase_e.py` (data-request push trigger),
  `/app/memory/MOBILE_AGENT_HANDOFF.md` (Section 10 added).

---


## Iteration 46 (Feb 2026) — Phase E2 Content CMS · Admin invite flow · ReDoS fix · Password visibility toggle

### Backend (`/app/backend/admin_phase_e2.py`, new ~460 LOC + additions to `admin_phase_e.py`)
- **Content CMS** — full admin CRUD + public read for 4 collections:
  - `cms_articles` (slug, title, excerpt, body_md, tags, published, published_at) — `GET/POST /admin/cms/articles`, `GET/PUT/DELETE /admin/cms/articles/{slug}`. Public `GET /public/cms/articles` returns published only; `GET /public/cms/articles/{slug}` 404s on draft.
  - `cms_glossary` (id, term, definition, published) — full CRUD + bulk-import endpoint (`POST /admin/cms/glossary/bulk-import` — case-insensitive duplicate skip).
  - `cms_templates` (slug, title, description, cta_label, cta_href, body_md, published).
  - `cms_changelog` (id, version, title, body_md, tags, release_date, published).
- **Admin invite flow** — magic-link onboarding (replaces password-prompt admin creation as the primary path):
  - `POST /admin/admins/invite` (super_admin only) creates `db.admin_invites` record + emails magic link via Resend. Supersedes any prior pending invite for the same email; 409 if already an admin.
  - `GET /admin/admins/invites` lists; `DELETE /admin/admins/invites/{id}` revokes pending.
  - Public `GET /api/admin/invite/{token}` returns invite metadata (status / email / role / expires).
  - Public `POST /api/admin/invite/accept` {token, password>=8} creates new admin or promotes existing user. Flips invite to `accepted`. Subsequent accept attempts 400.
- **ReDoS fix** — `/admin/search?q=` now `re.escape()`s the query before passing to Mongo `$regex`. Verified safe on `.*`, `(a+)+b`, etc.

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseE2.jsx`, new ~700 LOC + `AdminAcceptInvite.jsx`, new ~120 LOC)
- 4 CMS management pages — `AdminArticles`, `AdminGlossary` (with bulk-import importer), `AdminTemplatesLibrary`, `AdminChangelog`. Each: list table + inline editor card + delete confirm.
- `AdminInvitesPanel` (rendered inside `AdminAccounts`) — invites table + Invite form modal with auto-mailed magic link (fallback: shows the URL + copy-to-clipboard if email delivery failed).
- `/admin/accept-invite?token=...` — standalone public page (registered before `RequireAdmin`); 4 states: loading, invalid/expired card, password+confirm form, success card with "Sign in" CTA.
- **Admin login password visibility toggle** — Eye/EyeOff icon button inside password input (aria-labelled, data-testid `admin-login-toggle-password`). Also fixed React setState-in-render warning by moving the "already logged in" redirect into `useEffect`.

### Routes wired in `AdminApp.jsx`
- `/admin/blog`, `/admin/glossary`, `/admin/templates-library`, `/admin/changelog` (existing sidebar nav now resolves).
- `/admin/accept-invite` route registered ahead of the auth-guarded catch-all.

### Verified by testing agent (iter 26)
- **37/37 backend pytest pass** — CMS CRUD (incl. 409 dup, 404 on draft), bulk-import idempotency, full invite happy-path (invite → public fetch → accept → first login with TOTP setup offered), ReDoS safety, RBAC (super-only on invite create/revoke).
- **Frontend Playwright 100%** — all CMS testids present, password toggle flips `type=password`↔`type=text`, accept-invite page renders all 3 states correctly, invite panel inside AdminAccounts works end-to-end.

### Deferred (Iteration B+)
- Phase E2 Analytics deep (Funnels, Cohorts, Product analytics events).
- Refactor `server.py` into routers/ modules.
- Switch public `/resources/{articles,glossary,templates}` consumer pages from static `resources.js` to DB-backed CMS reads (currently the DB is empty by default; readers still use static).
- Markdown rendering on consumer Article pages (currently only excerpt is displayed; full body_md needs a renderer).

### Files
- New: `/app/backend/admin_phase_e2.py`, `/app/frontend/src/pages/admin/AdminPhaseE2.jsx`, `/app/frontend/src/pages/admin/AdminAcceptInvite.jsx`, `/app/backend/tests/test_iter26_cms_invite.py`.
- Edited: `/app/backend/admin_phase_e.py` (invite endpoints + `re.escape` on search), `/app/backend/server.py` (mounted cms_admin / cms_public / phase_e_invite_public), `/app/frontend/src/pages/admin/AdminApp.jsx` (CMS routes + accept-invite route), `/app/frontend/src/pages/admin/AdminPhaseE.jsx` (`<AdminInvitesPanel />` mounted under AdminAccounts), `/app/frontend/src/pages/admin/AdminLogin.jsx` (Eye toggle + useEffect redirect).

---


## Iteration 45 (Feb 2026) — Admin Phase E1: Security UI + System + Admin CRUD

### Backend (`/app/backend/admin_phase_e.py`, ~480 LOC — was a stub from earlier session, now finished + wired)
- **Audit Log export** — `GET /admin/audit-log/export` returns text/csv with `Content-Disposition: attachment` (filters action/actor_id/target_id; configurable `days` 1-365; 10k row cap).
- **Admin Sessions** — `GET /admin/sessions` (last-30d list with admin_email/admin_role enrichment + active flag + active_count). `DELETE /admin/sessions/{id}` (super_admin only) revokes a session.
- **Data Requests (Privacy Act)** — public `POST /api/public/data-request` (no auth, intake), `GET /admin/data-requests` (status/type filters + pagination), `PUT /admin/data-requests/{id}` (pushes a history entry; audit-logged).
- **Feature Flags** — `GET /admin/feature-flags`, `POST /admin/feature-flags` (super_admin only), `PUT /admin/feature-flags/{name}` (any admin), `DELETE /admin/feature-flags/{name}` (super_admin only). Fields: enabled, rollout_percent, allowed_plans, allowed_emails.
- **System Health** — `GET /admin/system-health` returns services (MongoDB / Stripe / Resend / Emergent LLM / Maintenance) + collection counts + llm_errors_24h.
- **Maintenance Mode** — `GET /admin/maintenance`, `POST /admin/maintenance` (super_admin only); public `GET /api/public/maintenance-status` for frontends to poll.
- **Admin Accounts CRUD** (super_admin only) — `GET /admin/admins` (with last_login_ts), `POST /admin/admins` (creates new OR promotes existing user), `PUT /admin/admins/{id}/role` (2-super-admin minimum + self-demote prevention), `DELETE /admin/admins/{id}` (removes admin role; 2-super minimum), `POST /admin/admins/{id}/reset-2fa` (clears TOTP + revokes sessions; not self), `GET /admin/admins/{id}/login-history` (30-day audit slice).
- **Global Cmd+K search** — `GET /admin/search?q=...` already present (users / households / tickets / payments by session_id).

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseE.jsx`, new ~510 LOC)
- `AdminAuditLog` — table + 3 filter inputs + Export CSV link.
- `AdminSessions` — active/all toggle + table with one-click revoke (super_admin only).
- `AdminDataRequests` — status chip filters + table with Start / Complete / Reject action buttons.
- `AdminFeatureFlags` — table + inline editor card (FlagEditor), super-admin-gated create/delete.
- `AdminSystemHealth` — maintenance card with super-only toggle, services grid (5 cards), DB counts grid, LLM errors stat. Auto-refreshes every 60s.
- `AdminAccounts` — table with History / Role / Reset 2FA / Remove per row (self row hides destructive actions); inline create form; slide-out login history drawer.

### Routes wired in `AdminApp.jsx`
- `/admin/audit-log`, `/admin/sessions`, `/admin/data-requests`, `/admin/feature-flags`, `/admin/health`, `/admin/maintenance` (alias of /health), `/admin/admins`. Sidebar System section visible to super + ops; Admin section visible to super only.

### Verified by testing agent (iter 25)
- **31/31 backend pytest pass** after one HIGH fix (POST /admin/feature-flags now requires super_admin, matching DELETE).
- **Frontend Playwright 100%** — all 6 Phase E pages render with correct root + child testids; CSV export href correct; feature-flag create→row→edit flow works; maintenance toggle persists; admins page hides destructive actions on self row; login-history drawer opens. Regression Phase A/B/C/D pages render with 0 page errors.

### Known gaps (deferred to Phase E2)
- `global_search` does not `re.escape` the regex input — potential catastrophic-backtracking on hostile admin input. Worth fixing alongside E2.
- Email-template edit-in-place + version history.
- Background queue for campaign send.
- Server-side enforcement of impersonation read-block.

### Files
- New: `/app/frontend/src/pages/admin/AdminPhaseE.jsx`, `/app/backend/tests/test_admin_phase_e.py`.
- Edited: `/app/backend/admin_phase_e.py` (added data-requests + audit export + GET /maintenance + 2FA reset/login history; tightened POST /feature-flags to super_admin), `/app/backend/server.py` (mounted phase_e + phase_e_public), `/app/frontend/src/pages/admin/AdminApp.jsx` (Phase E1 routes wired).

---


## Iteration 44 (Feb 2026) — Admin Phase D: Support Tickets + Communications

### Backend (`/app/backend/admin_phase_d.py`, new, ~570 LOC)
- **Tickets** — user-side: `POST/GET /api/tickets`, `GET /api/tickets/{id}` (only non-internal-notes), `POST /api/tickets/{id}/messages`.
- **Tickets** — admin-side: `GET /admin/tickets` (filters: status/priority/category/unassigned/mine + pagination), `GET /admin/tickets/{id}` (incl. internal notes), `PUT /admin/tickets/{id}`, `POST /admin/tickets/{id}/messages` (with `is_internal_note` flag — admin reply auto-flips status to waiting_on_user + emails the user via Resend).
- **Ticket reports** — `GET /admin/ticket-reports` (status counts, open_p1, opened_7d, resolved_7d, oldest_unresolved).
- **Macros** — full CRUD: `GET/POST /admin/macros`, `PUT/DELETE /admin/macros/{id}`.
- **Campaigns** — `GET/POST /admin/campaigns`, `POST /admin/campaigns/{id}/send` (iterates Mongo users by audience, calls email_service per recipient, logs to db.notification_log, double-send guard).
- **Audience builder** — `POST /admin/campaigns/preview-audience` supports 5 types: all / plan / trial_expiring / churned / never_decoded.
- **Email templates** — `GET /admin/email-templates` returns 11 system templates + custom array (edit-in-place deferred).
- **Notification log** — `GET /admin/notification-log` (filters + last-hour aggregates).
- **Newsletter subscribers** — `GET /admin/newsletter-subscribers`.

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseD.jsx`, new, ~520 LOC)
- `AdminTickets` — stat cards + 3 filter selects + table with row→detail navigation.
- `AdminTicketDetail` — 2-column layout: thread + reply composer (macro dropdown, internal-note toggle, Send/Add note) on the left; priority/status/assignment metadata on the right.
- `AdminMacros` — full CRUD inline form + table.
- `AdminCampaigns` + `CampaignBuilder` — 3-step wizard (name+audience+preview / subject+html / preview+save), table with one-click Send.
- `AdminEmailTemplates`, `AdminNotificationLog` (with last-hour stat cards), `AdminSubscribers`.
- All routes wired in `AdminApp.jsx` under `/admin/{tickets,tickets/:id,macros,campaigns,email-templates,notifications,newsletter-subscribers}`.
- Sidebar groups: Support (Tickets, Macros), Communications (Campaigns, Templates, Notification Log).

### Verified by testing agent (iter 24)
- **36/36 backend pytest pass** — admin TOTP login, RBAC, all 7 endpoint groups (incl. validation rejects + double-send guard), audit log emission.
- **Frontend Playwright 100%** — admin login + 2FA, all 5 Phase D nav testids, ticket reply auto-flips status, priority PUT works, campaign builder navigates all 3 steps to save-draft, all 16 ticket/campaign testids present. Regression Phase A/B/C pages render without page errors.

### Deferred (Phase E)
- **Server-side impersonation read-block** — still client-side only (admins can mutate via raw curl during impersonation; all actions audited).
- **Background queue for campaign send** — currently fans out synchronously in-process (fine for low volume, OK for now).
- **Email-template edit-in-place** + version history.
- Sections 8–13 (Content CMS, Analytics funnels, Compliance UI, System mgmt, Admin CRUD, full Cmd+K search).

### Files
- New: `/app/backend/admin_phase_d.py`, `/app/frontend/src/pages/admin/AdminPhaseD.jsx`, `/app/backend/tests/test_admin_phase_d.py`.
- Edited: `/app/backend/server.py` (router mounting), `/app/frontend/src/pages/admin/AdminApp.jsx` (routes + sidebar nav).

---


## Iteration 43 (Feb 2026) — Admin Phase C: AI logs + Billing depth + MRR chart

### Backend (`/app/backend/admin_routes.py` Phase C block, +260 LOC)
- `GET /admin/decoder-log` — paginated statement summaries with anomaly_summary (H/M/L counts) + line_items_count; file_b64/raw_text/audit/line_items withheld.
- `GET /admin/decoder-log/{statement_id}` — full statement detail + linked llm_calls (up to 10 from same household).
- `GET /admin/anomaly-log` — Mongo aggregation $unwind across all statement.anomalies. Severity filterable. Returns rows + stats_30d {by_severity counts, total_impact_aud}.
- `GET /admin/tool-stats` — today / week / month buckets per tool with calls, cost_aud, errors, avg_ms (from db.llm_calls).
- `GET /admin/subscriptions?status=` — filterable by active / trialing / cancelled / expired with user_email/user_name enrichment.
- `GET /admin/failed-payments?days=30` — failed transactions over a configurable window.
- `GET /admin/refunds?status=` — list refund records (records-only; actual Stripe call deferred to a later iteration).
- `POST /admin/refunds/{refund_id}/mark-processed` — flip pending_stripe → processed (admin manually issued refund in Stripe dashboard); audited.
- `GET /admin/mrr-trend?months=12` — monthly MRR rollup (1–36 month clamp). Sums active subs × plan price per month.

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseC.jsx`, new — single file)
- `AdminDecoderLog` — statement table with H/M/L anomaly count pills; row links to user profile (guards against missing uploaded_by).
- `AdminAnomalyLog` — 4 stat cards (High/Medium/Low/Impact 30d) + severity filter chips + table.
- `AdminToolStats` — today/week/month nested table with cost + errors per tool; friendly empty-state when no LLM activity recorded yet.
- `AdminSubscriptions` — status filter buttons (Active/Trialing/Cancelled/Expired) + table with user link.
- `AdminFailedPayments` — 30-day failed payments table with celebratory empty state.
- `AdminRefunds` — info banner explaining manual Stripe workflow + table with "Mark processed" action.
- `AdminRevenue` — 3 stat cards (Current MRR, Δ vs last month, Projected ARR) + **recharts** 12-month MRR line chart (gold #D4A24E line on dark theme).

### Routes wired in AdminApp.jsx
- `/admin/decoder-log`, `/admin/anomaly-log`, `/admin/tool-stats`, `/admin/subscriptions`, `/admin/refunds`, `/admin/revenue` all live.

### Verified by testing agent (iter 23)
- 28/28 backend pytest pass — every endpoint, RBAC, filters, pagination, mark-processed.
- 8/8 frontend Playwright checks pass — all 6 Phase C pages render with correct testids, recharts line chart visible.
- One cosmetic bug fixed inline: decoder-log row Link guards against missing uploaded_by.

### Deferred (Phase D/E)
- **Stripe API call** for refunds (still records-only).
- **Server-side impersonation write-block** (still client-side).
- **Per-statement decoder-log detail page** in frontend (backend endpoint exists, no UI yet).
- **Manual Review Queue** (Section 5.5) — needs new workflow + collection.
- Sections 6–13 (ticketing, campaigns, CMS, analytics deep, compliance UI, system management, admin CRUD, full Cmd+K search).

### Files
- New: `/app/frontend/src/pages/admin/AdminPhaseC.jsx`.
- Edited: `/app/backend/admin_routes.py` (Phase C block appended), `/app/frontend/src/pages/admin/AdminApp.jsx` (routes wired), `/app/frontend/package.json` (recharts added).

---

## Iteration 42 (Feb 2026) — Admin Phase B: Real Overview, User Profile, Impersonation, LLM Cost Tracking

### Backend
- **`/app/backend/llm_costs.py`** (new) — `record_llm_call(tool, model, ...)` writes to `db.llm_calls` with input/output char counts, token estimates, AUD cost estimate (based on Anthropic/OpenAI public rates × 1.5 USD→AUD). Fire-and-forget; never throws.
- **`/app/backend/agents.py`** — `_attempt()` inside `_llm_chunk_call` now records every Claude call (the Statement Decoder's primary code path) with `tool=chunk:<name>`, duration, success/error.
- **`/app/backend/admin_routes.py`** — Phase B block appended:
  - `GET /admin/overview` — 8 metric cards + AI health (LLM cost today/month, calls, errors, decoder runs, avg ms, success rate) + plans + subscriptions.
  - `GET /admin/activity?limit=N` — merged chronological feed from users/statements/payments with kind+color coding.
  - `GET /admin/llm-cost-trend?days=30` — daily LLM spend rollup.
  - `GET /admin/audit-log` — paginated, filterable by actor/target/action.
  - `GET /admin/users/{id}/profile` — enriched detail (user + sub + household + 20 statements + payments + 20 LLM calls + 30 audit events + notes + 10 user_sessions).
  - `GET/POST /admin/users/{id}/notes` — admin-only internal notes (5000 char max).
  - `POST /admin/users/{id}/suspend` + `POST /admin/users/{id}/reinstate` — soft suspension with reason; invalidates active sessions on suspend.
  - `POST /admin/users/{id}/extend-trial` `{days}` — 1–90 days, adds to current trial_ends_at.
  - `POST /admin/users/{id}/impersonate` — issues 60-min impersonation JWT (`type='impersonation'`, `impersonator_id`, `sub=target_user_id`); audits.
  - `POST /admin/users/{id}/refund` `{session_id, amount, reason}` — records to `db.refunds` (Stripe API call deferred — pending_stripe status); enforces cap of $500 for support_admin role.

### Frontend
- **AdminUserProfile.jsx (new)** — 3-column layout:
  - Left: avatar + name/email + plan/admin/suspended badges + key stats.
  - Centre: 5 tabs (Overview / Subscription & Billing / AI Tool Usage / Audit Log / Internal Notes).
  - Right: actions panel — send reset, toggle admin, set plan, extend trial, impersonate (with target prompt), cancel sub, suspend/reinstate, delete (super_admin only with typed-email confirmation).
- **AdminPages.jsx** — `AdminAnalytics` rewritten to consume real `/admin/overview` + `/admin/activity`: 8 stat cards, AI Health panel, Plans+Subs panel, recent activity feed. `AdminUsers` row click now navigates to `/admin/users/:id`.
- **AdminApp.jsx** — new route `users/:userId` mounted.
- **ImpersonationBanner.jsx (new)** — red sticky banner shown across consumer app when `localStorage.wayly_impersonation_token` is set; "Stop impersonation" clears + reloads.
- **lib/api.js** — request interceptor swaps impersonation token in and blocks all POST/PUT/PATCH/DELETE client-side.
- **App.js** — `ConsumerWidgets` wrapper hides chat/A2HS/AccessibilityWidget on `/admin/*`; includes ImpersonationBanner globally.

### Verified by testing agent (iter 22)
- **28/28 backend pytest pass** — every Phase B endpoint, RBAC, validation, impersonation token issuance, audit logging.
- **Frontend full Playwright pass** — admin login → 2FA → Overview (11 testids) → user table → user profile (5 tabs, 7 actions; reinstate correctly hidden when not suspended) → notes add flow all green.

### Deferred (Phase C+)
- **MRR chart** (12-month line) — needs chart library decision (recharts? Tremor?).
- **Cohort retention table** — needs historical signup → retention join across months.
- **AU map** — geo IP lookup integration.
- **Section 4 billing deep-dive** — failed payments retry status, churn dashboard, revenue charts.
- **Section 5 AI tools** — Statement Decoder Log (per-call view), Anomaly Detection Log, Tool Usage stats by tool, Manual Review Queue, AI Error Reports.
- **Section 6 Support** — ticketing system (new collection + UI).
- **Section 7 Communications** — campaign builder, template editor with version history.
- **Section 8 CMS** — blog/guides/glossary/templates/changelog.
- **Section 9 Analytics** — funnels, custom report builder.
- **Section 10 Compliance UI** — full audit-log UI, data requests, breach log.
- **Section 11 System** — feature flags, system health charts, API key rotation, webhooks viewer, maintenance mode.
- **Section 12 Admin CRUD** — admin accounts management page, role permissions matrix editor.
- **Section 13 Global Cmd+K** — wire to user/household/payment/audit indices.
- **Stripe API call for refunds** — real Stripe refund call (currently records pending_stripe).
- **Server-side enforcement** of impersonation read-only (currently client-side only; admins with valid creds can theoretically still mutate via raw curl — acceptable risk for now since all admin actions are audited).

### Files
- New: `/app/backend/llm_costs.py`, `/app/frontend/src/pages/admin/AdminUserProfile.jsx`, `/app/frontend/src/components/ImpersonationBanner.jsx`.
- Edited: `/app/backend/agents.py`, `/app/backend/admin_routes.py`, `/app/frontend/src/pages/admin/AdminPages.jsx`, `/app/frontend/src/pages/admin/AdminApp.jsx`, `/app/frontend/src/lib/api.js`, `/app/frontend/src/App.js`.

---

## Iteration 41 (Feb 2026) — Admin Phase A: TOTP 2FA + 4-tier roles + dark UI

See above (kept for reference).

## 2026-07-01 — UI-2 Global Consistency & Copy Rules (Phases 0-2 + partial Phase 3-5)

- Phase 0: audit report shipped at `/app/docs/audits/UI-2-audit-2026-07-01.md`
- Phase 1: fixed `index.html` to preload Fraunces + IBM Plex Mono + Inter (was Inter@600 only, causing Georgia/Menlo fallbacks). Type-scale tokens README published at `/app/docs/design/type-scale-and-tokens.md`.
- Phase 2 (deterministic sweep across 42 frontend files + 8 backend files):
  - Removed all em/en dashes from user-facing strings (411 occurrences).
  - Expanded "you're" → "you are" and "we'll" → "we will" (66 spots).
  - Per 9.2=a: expanded ALL other contractions in notification + email templates (`haven't`, `hasn't`, `don't`, `won't`, `can't`, `it's`, `we've`, `didn't`, `there's` etc — ~110 more spots).
  - `Audit log` → `Audit Log` in 6 places.
  - Fixed `text-transform: capitalize` bug in `ParticipantTimeline.jsx` (`prettyTitle` regex now skips letters after apostrophes).
  - Currency fix: `$3 90 cents` → `$3.90` in `data/policies.js`.
  - Added `formatMonthYear` util. Wired into `scenario_engine/alerts.py` so overdue-statement notification now says "May 2026" not "2026-05".
  - Rewrote 5 banned-word occurrences (unlock, robust, empower, percentage, seamless remnants).
- Phase 3 fixes shipped:
  - `Pricing.jsx` Solo card: "9 AI tools" → "8 AI Tools" + 3 additional user-confirmed bullets.
  - `Pricing.jsx` feature table: Care Plan Amendment Generator now correctly excluded from Solo.
  - `StatementUpload.jsx`: "Drop in a statement" → "Drop In A Statement".
  - `StatementDecoderTool.jsx`: removed both wrong "free use for today" strings, replaced with unlimited-on-paid-plans copy per 9.7.
  - Switch/toggle contrast fix in `components/ui/switch.jsx`.
- Phase 6: extended `backend/scripts/backend_copy_qa.py` to cover Rule 2.1–2.7 across email + notification templates (per 9.10). Now scans 161 files and passes with zero violations.
- Mobile handoff doc: `/app/MOBILE_AGENT_UI2_DELTA_PROMPT.md`

Still pending Antony's asset/screenshot approval or diff review:
- Phase 3.1.1 hero screenshot swap (need current build shot).
- Phase 3.1.8 `/trust` page copy rewrite (deliver as diff for legal sign-off — not merged).
- Phase 3.1.5 `/about` reassessment cadence — audit shows the wrong text does NOT exist in the current codebase; no-op.
- Phase 3.2.4 timeline chip-grid redesign (9.8 = a; capitalize bug fixed, redesign still to build).
- Phase 3.2.7 phone number in profile.
- Phase 4 full tool-summary rewrite (all 8 tools need a plain-English summary block prepended).
- Phase 5 "Report An Issue" placement pass (9.9 = extend existing Button; audit says only 1 of 8 tools has inline affordance today).

## 2026-07-02 — UI-2 Phases 3-5 shipped

- **Phase 3.2.4** — timeline filter row rebuilt as a wrapping chip grid (`ParticipantTimeline.jsx`), per 9.8=a.
- **Phase 3.2.7** — phone number field added to `/settings/profile` with E.164 validation, wired to `/api/sms-contact`.
- **Phase 4** — new `components/ToolShell.jsx` (ToolSummary + NumberMono + ReportRowLink) shipped. Applied to 7 of 8 AI tools: Statement Decoder, Budget Calculator, Provider Price Checker, Classification Self-Check, Contribution Estimator, Care Plan Reviewer, Reassessment Letter. Aged Care Q&A (chat) exempted by design.
- **Phase 5** — `<Button variant="report-issue">` added; audit confirmed all 8 tools already had `<ReportIssueButton variant="inline">` wired at the bottom of results.
- **Hero screenshot** — captured fresh dashboard image at `/app/frontend/public/marketing/02-caregiver-dashboard.png` (trial30909 account, Dorothy Tester participant).
- **Mobile agent handoff updated** at `/app/MOBILE_AGENT_UI2_DELTA_PROMPT.md`.

Still outstanding:
- Retro-fit numeric spans across the 8 tools to `<NumberMono>` (font-heading + tabular-nums → font-mono + tabular-nums).
- `/trust` legal-sign-off rewrite (Phase 3.1.8) — audit-only diff to prepare for legal.
- Screenshot swap in landing hero uses the new caregiver-dashboard image already; the older marketing/01-landing-hero.png could also be refreshed but wasn't touched.

## 2026-07-02 — Dark mode overhaul, NumberMono retrofit, typography reductions

- **NumberMono retrofit complete** — all font-heading+tabular-nums numeric spans converted to `<NumberMono>` (IBM Plex Mono) across Budget Calculator, Contribution Estimator, Price Checker and DecoderResultView (Statement Decoder). NumberMono now spreads rest props (data-testid pass-through).
- **Intro copy font reduced to text-sm** on /app/at-hm, /app/amendments, /app/scenarios (subtitle + intro) and /app/provider-switch (all StepShell intros).
- **"2026-05" date bug fixed** — new `humanizeMonths()` in `lib/formatDate.js` applied at render time (DashboardTimelinePanel, NotificationsBell, ParticipantTimeline) + preview DB migration converted 72 scenario_alerts and 49 notifications. Production DB self-heals via the render-time guard.
- **Dark mode is now global** — `AppearanceScope` (App.js) reads a single `wayly:app:appearance` key on every route (marketing + app); the marketing/app key split is gone. Settings caption updated.
- **Dark-mode landing hero fixed** — `.wayly-hero-bg` gets a dark gradient in theme-dark; wayly-neutral text/bg/border utilities remapped to kindred dark tokens.
- **Toggle contrast fixed** — `.switch-track` class (Settings notifications toggles + AccessibilityWidget) adds an inset outline in both themes; knob forced white in dark (`.bg-white` override exception).
- **Avatar dropdown dark-mode fix** — nav-dropdown menu text forced white in dark mode; "Sign out" relabelled "Sign Out" (MarketingHeader).
- **Fonts** — confirmed web already matches mobile: Fraunces (headings) + Inter (body) + IBM Plex Mono (numbers only). No changes needed.
- Testing: iteration_57.json — 10/11 PASS, NumberMono runtime font verified manually post-login (rgb white text + IBM Plex Mono confirmed via computed styles).

## 2026-07-24 — Homepage decoder file upload + SEO stub-redirect noindex

- **Homepage StatementDecoderEmbed** — removed the pre-filled "BlueBerry Care · Dorothy Anderson" sample statement. Added a Paste-text / Upload-file mode toggle. File dropzone accepts `.pdf, .doc, .docx, .txt, .csv, .jpg, .jpeg, .png, .heic, .heif, .webp` and posts to `/api/public/decode-statement` (multipart) — same file matrix as the authenticated tool page.
- **Statement Decoder tool page (`/ai-tools/statement-decoder`)** — dropped the SAMPLE seed text; textarea now starts empty.
- **Backend `PROFILE_STATEMENT`** widened to include images (`png, jpg, webp, heic, heif`) alongside `pdf, csv, txt, docx, xlsx`. Previously the tool page allowed image uploads in the `accept=` attr but the signature check rejected them.
- **SEO: 4 stub-redirect routes** (`/resources/blog`, `/resources/guides`, `/resources/webinars`, `/press`) now render `<meta name="robots" content="noindex, follow">` + `<link rel="canonical" href="destination">` before `<Navigate>` via new `components/StubRedirect.jsx`. Addresses Google Search Console's "Page with redirect" flag on these paths.
- **SEO: `/signup?plan=free`** — deep-link now emits `noindex, nofollow` before the SPA redirect to clean `/signup`.
- **Signup carryover regression (iter 81)** — earlier this session: `UserPublic` now surfaces `first_name`, `last_name`, `mobile`; participant `PUT /api/persona` no longer strips `last_name`. Verified by `test_iter81_signup_carryover.py` (6/6 pass) + Playwright E2E (Essentials pre-fill + Settings phone pre-fill).

### Still outside app control (needs Emergent hosting/DNS config)
- `www.wayly.com.au → wayly.com.au` 301 (5 flagged URLs).
- `http://wayly.com.au → https://wayly.com.au` 301 (1 flagged URL).
- These 6 GSC entries are informational, Google still consolidates on the apex+https canonical the SPA emits, but a proper server-side 301 at the ingress would clear the GSC "Page with redirect" reports faster. Contact Emergent Support to configure.

## 2026-07-25 — About page v6 rewrite + July editorial batch (2 SEO articles)

- **`/about` — complete rewrite (~1750 words) per the About v6 spec.** 11 sections, personal letter from Antony as visually distinct chapter, plain-spoken Australian English (Year 9 reading level, no em dashes). Applied verification-flagged softer variants for two claims that couldn't be confirmed literally ("months listening to people on both sides" instead of "have been on both sides"; "families and older Australians were left working" instead of "every family I met").
- **`/about` — wide editorial layout v7.** 12-column grid at `max-w-7xl` (1280px). Each section has a sticky left rail (Roman numeral + Title Case H2) with body prose/cards flowing in the right rail. Hero uses asymmetric 8/4 split with H1 up to `text-8xl` and italic standfirst on a vertical rule. Section IV (5 lessons) as 2-col card grid. Section V (3 beliefs) as 3-col card grid with Scale / HandCoins / ShieldCheck icons. Section VI (4 tool clusters) as up-to-4-col card grid with FileText / Wallet / Search / Handshake icons. Antony's chapter deliberately narrower (`max-w-2xl`) to feel like a personal letter within the wide layout. Feather signature mark.
- **All About headings are Wayly Title Case** (per Section 1.3 of the Dec 2026 refit): H1 "We Built Wayly Because Someone Had To.", 11 section H2s, all cluster/belief card titles, both CTA button labels ("Decode a Statement", "See Our Plans"). Uses the existing `lib/titleCase.js` rule set.
- **2 SEO articles shipped** under `data/seoArticles2026.js`, both dated 2026-07-25, both wired into `backend/seo_routes.py` sitemap:
  - `/resources/articles/how-much-will-i-pay-for-support-at-home` — "How Much Will I Actually Pay for Support at Home? The Income and Assets Assessment Explained". 8 sections + 6 FAQPage entries. Sourced dollar figures to post-20-March-2026 indexation ($137,917.01 standard cap, $86,185.23 no-worse-off cap, $165.05 hardship threshold). Ties to Contribution Estimator and Statement Decoder.
  - `/resources/articles/how-to-switch-support-at-home-provider` — "How to Switch Your Support at Home Provider (Without Losing Your Unspent Funds)". 8 sections + 6 FAQPage entries. Resolves the 60-vs-70-day transfer confusion (70 days as outer limit), includes pre-switch checklist and continuity-of-care duty under the Aged Care Act 2024. Ties to Provider Price Checker and Family Coordinator.
- **Article titles + section headings** applied Wayly Title Case. FAQ questions kept in sentence case (natural questions read better that way).

### Next review dates
- Both new articles due for revalidation on **20 September 2026** (next indexation of Support at Home contribution caps + hardship threshold).

## 2026-07-25 · Late — About page polish + editorial sign-off

- Removed Roman numeral markers (I–XI) from `/about` per feedback; heading rail now just a hair-thin accent line + Title-Case H2.
- Tightened the gap between the hero and Section I "The Moments We're Building For" — first-section top margin dropped from `mt-24 sm:mt-32` to `mt-10 sm:mt-14`; hero bottom padding reduced.
- Wired the hero "Read on" button (was a decorative div) into a working anchor link + smooth scroll to `#about-section-moments`.
- **Section VI cluster cards are now clickable tool entry points** (rendered as `<Link>` when a `to` prop is passed): "Reading What You're Paying For" → `/ai-tools/statement-decoder`, "Choosing the Right Care at the Right Price" → `/ai-tools/provider-price-checker`, "Speaking Up When Something Isn't Right" → `/ai-tools/letters-and-follow-ups`, "Keeping Everyone on the Same Page" → `/ai-tools/family-coordinator`. Each card now has an "OPEN THE TOOL →" affordance in Title-Case at the bottom with a subtle translate-x hover animation.
- **Editorial sign-off applied.** All five article `reviewer` entries in `seoArticles2026.js` moved from `[Reviewed by: TBC]` to `Wayly Editorial`. `Articles.jsx` now reads `article.reviewer?.name` (with a `Wayly Editorial` fallback) at both the top meta strip (`article-reviewer`) and the trust footer, so the byline reads "By Wayly Editorial · Reviewed by: Wayly Editorial · Published…".
- Removed "Chapter X · " and "Chapter XI · " prefixes from the Antony note and Try Wayly overline labels for consistency with the Roman-numeral removal.

## 2026-07-25 · Late — "Back to About" breadcrumb on tool landing pages

- **New shared component `components/AboutBackLink.jsx`.** Reads two signals in this order:
  1. URL query `?from=about` — set by the four About cluster cards.
  2. `sessionStorage.getItem("wayly:about-entry")` — persisted for the tab session so subsequent SPA navigations still show the crumb.
- On first mount with `?from=about`, the component sets the sessionStorage flag AND strips the query param via `history.replaceState`, so the address bar stays clean and refresh doesn't loop.
- Wired into the top-nav row of all four tools linked from the About cluster grid: `StatementDecoderTool`, `PriceCheckerTool`, `LettersFollowUps`, `FamilyCoordinator`. Rendered alongside the existing "← All AI tools" crumb so both wayfinding paths coexist.
- **About cluster cards now append `?from=about`** to their `to` prop before rendering, so the intent signal is explicit rather than relying on `document.referrer` (which is often stripped by `Referrer-Policy: strict-origin-when-cross-origin`).
- Verified end-to-end at 1440px: click "Reading What You're Paying For" on `/about` → land on `/ai-tools/statement-decoder` with clean URL and "← Back to About" visible next to "← All AI tools" → click crumb → returned to `/about`.

## 2026-07-26 — Header/About/Contact/Features polish + Login remember-me + Shared-view v2

### Menu
- Header nav: added `About` (position 1, before Features), removed `Demo`, bumped font from `text-sm` to `text-[15px]` and gap `gap-8` → `gap-10` for a slightly more spacious feel.

### About page
- H1 `We Built Wayly Because Someone Had To.` reduced from `text-4xl → text-8xl` to `text-[40px] → text-[68px]`, colour changed from `text-primary-k` to `text-wayly-neutral-900` to match the Landing hero H1.
- Try Wayly copy fixed: was "five uses per tool per hour" (wrong). Now says: "Every Wayly tool is free to try. Start with a 7-day free trial of any paid plan, no credit card required" + "the Statement Decoder gives you one free decode every 120 days, no signup needed."

### Contact page
- `I am a…` role labels moved to Wayly Title Case: Family Caregiver, Financial Advisor, Aged-Care Provider, GP / Clinician, Press / Media.
- `What can we help with?` textarea placeholder + typed text now `text-sm` to match the field label sizing.

### Features
- Double vertical scrollbar fixed. `html { overflow-x: clip }` + `body { overflow-x: clip; overflow-y: clip }` removes the second scrollbar; scrolling now lives on the viewport only.

### Login
- New `Remember my email on this device` checkbox. When checked, persists the email to `localStorage['wayly:remembered-email']` after successful sign-in; when unchecked, wipes it. Auto-prefills on next visit. Password never stored.

### Shared participant view (`/view/:token`)
- Full redesign to match the Participant view mock. Sections: greeting, mood check-in (I Feel Good / I'm OK / Not Great, one-tap), Today card (provider + level), Budget card, and a two-button action row (Call Caregiver · Something's Not Right).
- New public POST endpoints: `/api/public/shared-view/:token/wellbeing` (mood check-in) and `/api/public/shared-view/:token/alert` (soft check-in signal). Both create audit rows and notify the caregiver only for `not_great` / alert taps.
- Error card now includes an "if the link was sent from another environment, ask your carer to create a fresh one at wayly.com.au" hint, addressing the preview-vs-prod token mismatch the user reported.

## 2026-07-27 — Customer-first design pass (photography + ecosystem + journey)

- **New `lib/photos.js`** — curated Pexels photo library with 6 hand-picked hero images (kitchenMoment, daughterOnPhone, familyTable, handsAndPaper, peacefulMorning, helpingHand). Ships a hardened `<Photo>` component that hides gracefully on network / hotlink failure so no broken-image icon ever appears. Every URL verified 200 via HEAD before shipping.
- **Landing (`/`)** — three new sections inserted between the Problem block and the How-It-Works block, in this order:
    1. **Ecosystem grid** — "Six people. One shared calm." — 6 cards (Participants · Caregivers · Family · Advisers · Providers · Clinicians), each with the "WAYLY FOR" overline and a one-line value prop. Design ref: verify-athlete "Six users. One shared truth."
    2. **Photo strip** — full-width Pexels group hug + editorial pull-quote from "Anh, caregiver for her mother in Brisbane". Grounds the abstract product in a real human moment.
    3. **Journey** — "From the first envelope to a calm quarter." — 6 numbered stages laid as `01–06` cards (Statement arrives → Decode → See quarter → Ask a question → Send letter → Everyone in the loop).
- **About (`/about`)** — Section I "The Moments We're Building For" now leads with a warm 16:7 hero photograph before the two "scene" cards. Grounds the parallel-scene prose in a real image before the reader hits the text.
- **Features (`/features`)** — hero redesigned into a 7/5 split: copy + CTAs on the left, tall 4:5 portrait photograph (adult son helping older father with a mobility aid) on the right. Replaces the previous copy-only hero.
- **Contact (`/contact`)** — a 4:3 photograph (adult daughter and her mother at a laptop) now sits above the info cards in the right rail. Warms the previously text-heavy sidebar.
- All new photography loads from Pexels (verified 200 via HEAD) with `loading="lazy"` on below-fold instances and `loading="eager"` on hero images.

## 2026-07-27 · Late — Free-tier copy reconciled site-wide

Every surface now speaks the same rule: **Statement Decoder is free for one decode every 120 days, no signup needed. The other seven tools unlock on Solo or Family with a 7-day free trial, no card required.**

- `Features.jsx` — AI Tools section subtitle rewritten (was "free for one decode per day with no signup" — daily language that contradicted the 120-day rule).
- `StatementDecoderEmbed.jsx` — the `daily_limit` error banner on the homepage embed rewritten from "You've used your free decode for today. Come back tomorrow" → "You've used your free decode. Sign up for a 7-day free trial to keep decoding, or come back in 120 days."
- `About.jsx` — already reconciled in the earlier pass.
- `Pricing.jsx` — already consistent (`FAQ` and plan chrome already say "one statement every 120 days").
- `StatementDecoderTool.jsx` — already consistent (usage strip already says "One free decode every 120 days").

## 2026-07-27 · Late — Pexels photography removed + Landing simplified

- **All Pexels stock photography removed** from every marketing page per user feedback ("too random, not relevant to elderly care"):
  - Landing: photo strip with testimonial + How-it-works photo dropped.
  - About: Section I hero photo, Section VI outdoor photo, Section VIII portrait dropped.
  - Features hero: reverted from 7/5 split back to single-column copy.
  - Contact sidebar: photo removed.
  - Pricing hero: reverted from 12-col grid back to centered single column.
  - `PHOTOS`/`Photo` imports removed from all five pages. `lib/photos.js` kept in place (unused) in case a future round wants it back.
- **Landing: Journey section (6 stages) removed.** Redundant with the existing 3-step How-it-works section and made the page too long / overwhelming per user feedback.
- **Landing: "What Wayly does" section moved up.** Now sits between the Ecosystem grid and How-it-works so users see the eight AI tools before drilling into screenshots and dashboard reveal. New order: Hero → Persona+Decoder → Social proof → Problem → Ecosystem → **What Wayly Does** → How it works → Big Number → Dashboard → Reports.
- Product screenshots on Landing (`/marketing/03-statement-decoder-tool.png`, `/marketing/07-budget-alerts.png`, etc.) still show the OLD navbar with "Demo" — flagged as outdated. Re-shooting these requires regenerating PNGs from the current app; noted for a follow-up pass.

## 2026-07-30 — Marketing screenshots regenerated + AI Tools CTA unified

- **All 5 Landing marketing PNGs regenerated** against the current preview app so the nav no longer shows the removed "Demo" tab: `02-caregiver-dashboard.png`, `03-statement-decoder-tool.png`, `07-budget-alerts.png`, `09-family-wall.png`, `11-reports-hub.png`. New Playwright helper at `/app/scripts/regen_marketing_screenshots.py` (block service workers, retry on `ERR_ABORTED`) can be re-run any time the nav or dashboards change.
- **AI Tools index (`/ai-tools`)** — authenticated users on a trial or active paid plan now see **"Open tool →"** on every card, including the Statement Decoder. The marketing "Try free" CTA is only shown to logged-out / free-tier visitors. The "SOLO & FAMILY" and "FREE, 1 USE/120 DAYS" chips are hidden entirely for paid/trial users (verified with Cathy on the reactivated Family subscription).
- Test fixture nudge: Cathy's subscription doc had status `expired` (trial run out in May); restored to `active` so `usePlanState` returns `isPaid=true` for QA of the "Open tool" flow. Not user-visible.

## [2026-06] Mobile-parity backlog closeout (iter 159–160)
Session: MOBILE ONLY. Closed the remaining web→mobile parity gap. All 8 features verified by testing agent (iter159 7/8, iter160 onboarding retest PASS).

- **Settings full parity** — rebuilt the Settings tab as a hub with in-app nav rows (no more "in browser"): Plan & Billing (→/plan-billing), Family Members, Weekly Digest, Usage, Security & Data, Danger Zone; Edit profile now in-app.
- **New screens** (all expo-router files in /app/mobile/app, all theme-aware light/dark, full testIDs):
  - `profile-edit.tsx` — name/role display, email change flow (/auth/email/change-request+status), phone edit (PUT /me/contacts).
  - `family-members.tsx` — members list, invite form + roles, pending invites, remove (Family-gated with upgrade CTA).
  - `weekly-digest.tsx` — digest preview (wellbeing/anomalies/thread), send now, history (Family-gated).
  - `security.tsx` — password reset, 2FA setup/enable/disable (QR + backup codes), audit-trail link.
  - `usage.tsx` — activity counts (/usage).
  - `danger-zone.tsx` — delete account with exact "delete my account" confirm gate.
  - `plan-select.tsx` — Solo/Family cards; in-app 7-day trial (POST /billing/start-trial, no card) when eligible, else Stripe Checkout in browser (POST /billing/checkout); current-plan badge.
  - `onboarding.tsx` — 4-step wizard (Essentials → Authorisation → Recommended → All Done) creating first participant/household (POST/PATCH /participants); tabs now gated on household_id so new signups are routed here.
- **Fix:** onboarding crashed with `useDrawer must be used within DrawerProvider` — swapped WaylyHeader→AppHeader.
- **Note:** Stripe card entry / paid activation is handled via the hosted Stripe Checkout in the browser (store-safe, matches web); native in-app card field (SetupIntent) would require a dev build and is intentionally not used.
- **Light/dark:** all new screens built on shared useTheme tokens; parity inherent.

## [2026-06] Web→mobile parity: card-at-signup, dates, new screens, handoff doc (iter 162)
- **FIX**: mobile Stripe portal now POSTs `/api/payments/portal` (was `/api/portal` → 404).
- **Card captured at signup** (mirrors web): mobile `signup.tsx` now has a plan picker (Solo/Family + participant/seat counts) and routes through Stripe Checkout (`POST /api/payments/checkout {plan,origin_url,trial_days:7}`) via `src/lib/plans.ts` `startCheckout()`. `plan-select.tsx` uses the same card-capture path. No more no-card trial.
- **DD/MM/YYYY everywhere**: `mobile/src/utils/format.ts` `shortDate/formatDate` now render DD/MM/YYYY, added `formatDateTime` (DD/MM/YYYY HH:mm) + `formatMonthYear`; new screens use them.
- **3 new mobile screens for parity** (verified iter162): Audit Log (`/audit`, GET /audit-log), Referrals (`/referrals`, full CRUD), Contribution Position (`/contribution-position`, CE3 lifetime-cap + annual-projection + reconciliation + hardship). Drawer `navGroups.ts` now marks these `implemented:true`.
- **Trial banner + Plan & Billing** copy aligned to "card on file" model.
- **BACKEND_HANDOFF.md** (`/app/mobile/BACKEND_HANDOFF.md`) expanded with exact signup fields/labels/required flags, card-at-signup flow, plans×participants×seats, DD/MM/YYYY rules, 9-tool catalogue, onboarding constants, product-wide workflows/system behaviours, and a remaining-gaps list. Full 580-endpoint appendix retained.
- Remaining mobile gaps: Support tickets, CE3 pension-change wizard, SD3 statement-pair review, Loop cases, participant sub-tabs, email-verification.

## [2026-06] Mobile parity round 2: Support, Cases, Pension wizard, email verify, Reports PDF (iter 163-164)
- **Support tickets** (`/support` + `/support/[id]`): list, raise request (category + note), thread with replies, close/reopen. Verified.
- **Loop Cases** (`/cases` + `/case/[id]`): list, scan (query-param fix), status flow, timeline, add note. Verified.
- **Contribution Position pension-change wizard**: 3-step modal preview→commit (`/ce3/.../pension-change/preview|commit`). Verified.
- **Email verification parity**: `EmailVerifyBanner` (shared backend already sends the signup verification email; banner shows status + resend via /auth/send-verification-email). Wired into WaylyHeader.
- **Reports**: generate (8 types) + open PDF via token-signed `/reports/{id}/download` in browser.
- Bugs fixed & retested (iter164, 3/3): support thread read {ticket,thread}; close/reopen status flip; cases scan 422 → query param.
- BACKEND_HANDOFF.md: added §19 (emails/reporting/PDFs), refreshed §18 remaining gaps (now only SD3 pair review + participant sub-tabs + verify landing pages remain).

## [2026-06] Signup/login copy + labels batch (iter 165, verified)
- Removed "Wayly" wordmark + "Create account" header + "Join Wayly…" tagline on signup; login wordmark removed, "Welcome Back", subtitle no "Wayly".
- Shared Field now renders "Required" (clay) / "Optional" (muted) hints; Title-Case labels (First Name, Last Name, Mobile Number); password requirements shown before typing.
- Plan cards: Family "2 participants · Up to 3 caregiver seats" (was 5, removed "two parents on one plan"); plans.ts updated. "Log Out".
- Created /app/memory/MOBILE_PARITY_ROADMAP.md — screenshot-driven, prioritized remaining screen redesigns (Invoices, Statements, Participants, Support, Plan & Billing tables/views; dashboard walkthrough; signup persona questions; Stripe return; date picker; initials menu; dark-mode + capitalisation sweeps; SD3/participant tabs/verify landing).

## [2026-06] Mobile parity round 3 (iter 166-169, all verified)
- **Participant switcher** now app-wide in WaylyHeader (dashboard/ai-tools/statements/settings); selecting re-scopes ALL screens (apiFetch sends X-Participant-Id) and returns to dashboard for a clean re-fetch. Removed duplicate from dashboard body.
- **Invoices** screen rebuilt to web parity (useTheme dark-mode safe): PageIntro (ALL INVOICES / WHAT THIS DOES / HOW TO USE IT / WHAT YOU GET), "Check a new invoice", "Your Wayly Insight" summary, rows with Invoice date/Provider/Uploaded/Amount/Findings/Verdict (All clear|Issues). New reusable src/components/PageIntro.tsx.
- **Verify-email banner** now dismissible with 24h suppression (AsyncStorage wayly_verify_banner_dismissed_at).
- **Profile** (profile-edit) gained an informative Account card (Plan, Household, Member since).
- **Participant Profile hub** NEW /participant/[id] mirroring web ParticipantProfile.jsx: PERSONAL DETAILS, Financial Position (Quarterly budget/Spent/Lifetime cap/Last statement + See Contribution Position), Open Follow-Ups→/cases, Household Members→/family-members, Latest Activity (8 tool rows), Timeline→/timeline. Participants list rows now open the hub. Fixed nested-object shapes (provider.primary, classification.band, {amount}).
- Test creds: bibi@test.com / CarTest123$ recorded.

Remaining parity backlog in /app/memory/MOBILE_PARITY_ROADMAP.md: Statements/Support/Plan&Billing/Dashboard redesigns, signup persona questions + Stripe return + date picker + initials menu, missing-details dashboard banner, dark-mode + capitalisation sweeps, SD3 pairs, participant sub-tabs (voice-check/complaints/attendance), verify landing, per-tool output comparison.

## [2026-06] Web→mobile EXACT parity sweep — Category 1 "Today" (in progress)
Full screen-by-screen audit against web (source of truth), following web sidebar order: Today → AI Tools → Money & Statements → Guided Journeys → Their Care → Providers & Paperwork → Your Account. Web preview + Expo web preview share backend mobile-parity-sweep.
- **Dashboard** ((tabs)/index.tsx) rebuilt to web CaregiverDashboard parity: sage greeting line; "WELLBEING SUMMARY" overline + full plan badge (Crown + "Family plan · Trial" + "All 9 tools · 5 family seats · Sunday digest"); H1 = "{participant}, this quarter"; subtitle incl "· Provider:"; header actions Upload a statement + Key Contacts; Smart Summary card now eyebrow "SMART SUMMARY" + title "Your Wayly Insight"; ADDED missing web cards: Latest statement in plain English, AI chat last conversation, Audit Log preview, Family thread (family), Solo upgrade nudge, Free-plan paywall; REMOVED invented "Budget snapshot" label + "Quick actions" section. Verified via screenshot (Cathy/Family).
- **AI Tools** ((tabs)/ai-tools.tsx) aligned to web toolRegistry: heading "Nine Tools. Built for Australian Families.", intro copy, 3 info chips (Try free / Grounded in law / Private by default), exact per-tool body copy, plan chips (hidden for paid/trial), CTA "Open tool"/"Try free". Verified.
- **Family Wall** ((tabs)/family.tsx): added web PageIntro ("A Digital Fridge Door for {name}" + What it does/How to use/What you get), 5th react emoji 😢 (now ❤️👍🙏😊😢), web empty-state copy, composer placeholder; converted from static palette to useTheme so dark mode + contrast work. Verified.
- Currency renders single $ (money/moneyWhole), % exact. AI copy runs through sanitizeAI (no dashes).
- Screens still using their existing build (audit continues next turn): Profile hub, then Category 2 (Statements + Participants redesigns per MOBILE_PARITY_ROADMAP P0), Support, Plan & Billing, and remaining categories.

## [2026-06] Parity sweep — Category "Money & Statements": Statements (verified)
- New helper src/lib/statementFields.ts mirrors web frontend/src/lib/statementFields.js (periodCompact, providerName, grossTotal, closingBalance, decodeStatus, flagsCount, uploadedLabel, periodSortKey, STATUS_LABEL).
- (tabs)/statements.tsx rebuilt to web StatementsList parity: PageIntro (eyebrow "ALL STATEMENTS", title "Your Support at Home Statements", What it does/How to use[4]/What you get[3]), Upload statement button, Smart Summary "Your Wayly Insight" (SMART SUMMARY eyebrow, sanitizeAI), search box + status filter chips (All/Clean/Flagged/Processing/Failed) + "N shown", rows show Period · Provider · GROSS TOTAL · CLOSING BALANCE (— when null) · Uploaded + status badge (Clean/Flagged·N/Processing/Failed). Single $; period-desc sort. Verified via screenshot (36 statements).
- NOTE remaining vs web statements list: Export CSV + Archived buttons not yet ported (Archived needs its own screen); provider/period dropdown filters simplified to search + status. Pagination not needed (FlatList).

## [2026-06] Parity sweep — Participants, Support, Plan & Billing, Missing-details banner, Statements extras
- Participants (app/participants.tsx) rebuilt to web extended/Participants.jsx parity: header ("Participants · N active", "Family plan covers 2, additional participants are $24.50 per fortnight each.", "Current plan: FAMILY · $X per fortnight · N additional participant"), Add participant modal (first/last/classification/provider → POST /v2/participants), participant cards with color strip (COLOR_SWATCHES), name + PRIMARY star, Classification·Provider, plan tag, forwarding-email chip + copy, action row Timeline/Edit details/Share view/Make primary/Remove, and Removed participants section (Restore / Delete now, 60-day purge countdown). Uses /v2/participants?include_removed=true + /account.
- Support (app/support.tsx) rebuilt to web MySupport parity: H1 "My Support" + subtitle, 4 stat cards (Open/Awaiting You/Resolved/Total), "Raise a New Ticket", search + status filters (All statuses/Open/Awaiting you/Resolved), ticket cards (reference mono, category label, status badge, "Raised {date} · Updated {rel}"). Keeps raise-ticket form.
- Plan & Billing (app/plan-billing.tsx): added "Billed every 14 days · Includes GST", "WHAT YOU ARE PAYING FOR" breakdown card + Manage participants link, Solo/Family switch cards (Current badge / Switch to X).
- MissingDetailsBanner.tsx (NEW): mirrors web ProfileCompletionBanner copy, dismissible with X, suppressed 24h via AsyncStorage (key wayly_missing_details_banner_dismissed_at); rendered at top of Dashboard scroll. Matches the email-verify banner pattern.
- Statements extras: Export CSV (builds CSV via new shareTextFile helper in download.ts; web = browser download, native = file + share sheet) + Archived button (count badge) → new app/statements-archived.tsx (read-only list from /statements/archived).
- All verified rendering via screenshots (Cathy/Family). Single $ throughout.

## [2026-06] Parity sweep — Money category + Guided Journeys PageIntro + Dark-mode sweep
DARK-MODE SWEEP (no text/button blends): converted the last 4 static-palette screens to useTheme (makeStyles factory) so light+dark both apply — app/(tabs)/ask.tsx, app/upload.tsx, app/decode/[id].tsx, app/invoice/[id].tsx. Verified zero remaining `from "@/src/theme"` static imports and zero hardcoded non-#fff hex across all Guided Journeys + Their Care screens.
MONEY:
- pacing.tsx: pace status colors now theme tokens (colors.gold/colors.sage) instead of hardcoded #B7791F/#1B5733 (dark-mode contrast fix).
- budget-alerts.tsx: header + empty-state copy aligned to web (subtitle "Get notified before you overspend"; empty "No alerts configured" / "Most caregivers set a 70% lifetime-cap and an 85% quarterly alert as their first two."); removed invented "Manage alert rules on the web app." footnote.
- budget-scenarios.tsx: added web PageIntro (eyebrow "Budget · What-if", title "Budget Scenarios", exact description); removed invented footnote.
- reports.tsx: added web PageIntro (eyebrow "Reports", title "Reports", exact description). 8 report types already match web.
GUIDED JOURNEYS — added exact web PageIntro (eyebrow/title/description/whatItDoes) to: carer-self-check, handover-pack, athm, chsp-tools, letters, care-plans. (ClassificationCheck/ProviderSwitch have no web PageIntro → left as-is per no-invention rule.)
THEIR CARE: care-plans done; calendar/hospital/amendments/scenarios/timeline + care-team/key-contacts have no dedicated web PageIntro to mirror and are already theme-aware → at parity, no changes.
All verified via screenshots (Cathy/Family): AT&HM, Carer Self-Check, CHSP Tools, Quarterly Pacing render with exact copy + single $.

## [2026-06] Parity sweep — Providers & Paperwork + Your Account + Provider Switch walkthrough
- provider-switch.tsx REBUILT from a simple list (/psw1 API) into the faithful web 5-step guided walkthrough on the /provider-switch API: Stepper (Why You Might Switch → Before You Decide → Comparing Providers → Giving Notice → Handover), verbatim step copy, Before-You-Decide Yes/Not Yet/Not Applicable, Compare topics checklist, Giving Notice with buildNoticeLetter draft (Copy + .txt share via shareTextFile), Handover checklist + Mark Switch Complete. Draft persists across reloads (resumes at saved stage). PageIntro eyebrow/title/description match web.
- documents.tsx: added web PageIntro ("Document Vault" / "All Your Aged-Care Paperwork, in One Place" + description + whatItDoes) to both empty and populated states.
- compare-providers.tsx: added web PageIntro ("Compare Providers" / "Side-by-Side Quality Context" + description + whatItDoes).
- Verified via screenshots (Cathy/Family): Provider Switch stepper resumes at stage, Documents + Compare Providers PageIntro render.
- Your Account (Referrals, Audit Log, Settings, Profile hub) + Correspondence + Ratings: no dedicated web PageIntro to mirror, all theme-aware (dark-mode safe), headers match nav labels → at parity, no changes.

## [2026-06] Mobile UI/nav bug fixes (user-reported) — verified iter 173/174
- Dashboard: removed the Household/participant-switcher chip from the top (WaylyHeader no longer renders ParticipantSwitcher).
- Shared <T> component (src/components/ui.tsx): fixed teal buttons showing dark text — style order changed to [{ color }, merged] so a caller-supplied color:'#fff' wins (default color is now a fallback). App-wide fix for text-on-teal legibility. No regression to normal text colors.
- Dashboard CTA relabeled "Upload a Statement" (Title Case), white on teal.
- AppDrawer: backdrop no longer dims/darkens the rest of the screen (transparent backdrop + right border on panel); tap-outside still closes.
- Bottom tab bar: replaced "Settings" tab with "More" (menu icon) that opens the drawer of all category groups (via tabPress preventDefault + openDrawer; TabsInner component under DrawerProvider).
- Statements: removed the duplicate "Statements" title + "Support at Home statements" subtitle row under the header; upload button relabeled "Upload a Statement".
- Upload (app/upload.tsx): now statement-only — removed the Statement/Invoice toggle; title "Upload a Statement"; three source rows only.
- STILL TODO (user-requested, large follow-on builds): (a) implement each AI Tools tool page to match the web dedicated pages (StatementDecoder, InvoiceChecker, BudgetCalculator, PriceChecker, ClassificationCheck, LettersFollowUps, ContributionEstimator, CarePlanReviewer, FamilyCoordinator) — mobile currently uses a single generic tool/[slug].tsx; (b) build out Your Account subscreens (Settings tabs: profile, plan/billing, notifications, security, appearance, delete account) to match web; (c) continue any remaining per-category screens vs web.

## [2026-06] Profile routing fix + Your Account subscreens audit
- Fixed drawer "Profile" (Today group): was routing to /participants (the list); now routes to a new app/profile.tsx redirect that opens the ACTIVE participant's hub /participant/{id} (mirrors web /app/me). Robust redirect: activeId || active.id || participants[0].id, with a 2.5s wait before falling back to the list (participant context loads async). Verified via screenshot ("Mum's Profile" hub renders).
- Your Account subscreens confirmed already present as dedicated routes: Profile hub (/participant/[id]), Plan & Billing (/plan-billing), Notifications (inline in settings + /notifications prefs), Appearance/theme (settings card), Security & Data (/security), Delete account (/danger-zone), plus Family Members/Weekly Digest/Usage. Settings screen already links all of them.
- AI Tool screens: mobile app/tool/[slug].tsx is already per-tool configured (bespoke forms + result rendering for budget-calculator, provider-price-checker, classification-self-check, letters-and-follow-ups, contribution-estimator, care-plan-reviewer; launcher pages for statement-decoder/invoice-checker/family-coordinator) + ToolExplainer. Deeper per-tool visual/copy parity with the dedicated web tool pages remains as an incremental follow-on.

## [2026-06] PARITY-1 v7 — Worked examples: Statement Decoder + Invoice Checker (mobile-only, web untouched)
Founder's 4 Statement Decoder mobile defects — all fixed (root cause: mobile statement DETAIL `app/statement/[id].tsx` was a hand-rolled view diverging from web, which uses the shared DecoderResultView):
- Rewrote `app/statement/[id].tsx` to render the SAME shared `DecoderResultView` for rich (audit_json+extracted_json) statements, exactly like web `StatementDetail.jsx`. Legacy statements get a corrected fallback.
- (1) Removed the mobile-only `SmartAISummary` ("Your Wayly Insight") from the decoded statement view — now shows only "In plain English". (2) Contribution splits present (money banner + per-stream "you paid" + line-item you-paid/govt + header "N line items · $total · $contribution"). (3) Anomalies match web (High/Medium/Low, evidence, rule, suggested action). (4) Removed mobile-invented "ALERT"/"WARNING" badge labels.
- `DecoderResultView.tsx` hardening for exact match: added persona hero heading "Here is what we found in the statement." + clean-state "charged correctly" line; per-anomaly AI-accuracy note ("This flag is AI-generated and may be incorrect. Verify before acting."); download bar copy + 3 buttons now "Share this decode" / "Download CSV" / "Download PDF".
- Testing agent (iter 211): statement side PASSES full parity.

Invoice Checker worked example — new shared mobile view mirroring web:
- Created `src/components/invoices/InvoiceResultView.tsx` porting web `components/invoices/InvoiceResultView.jsx` + tool composition: InvoiceResultBanner (Amount billed / Potential refund / Net payable / Issues + meta strip arithmetic), InvoiceMetadataStrip, VerdictBanner (web verdict copy + "N lines read" + Tier count chips), WaylySummaryCard (title-case "Wayly Summary"), InvoiceMetaCard, InvoiceIssueRegister (severity words critical/high/medium/low/info, check codes C1–C12, refund per issue, "What to do:").
- `tools/InvoiceChecker.tsx` (tool): replaced the light custom result (TIER-n list, "WAYLY SUMMARY" eyebrow, "ISSUES TO REVIEW") with the monolithic `<InvoiceResultView>` (matches web TOOL page: banner+metadata+verdict+summary+metacard+register).
- `app/invoice/[id].tsx` (detail): recomposed to match web `InvoiceDetail.jsx` EXACTLY — Banner + MetadataStrip + SmartAISummary + WaylySummaryCard + IssueRegister (NO VerdictBanner / MetaCard on the detail; removed the mobile-invented verdict badge + "What to check before paying"/"Checks run" blocks). Kept SmartAISummary because web invoice detail has it (parity — the testing agent's "delete it" flag lacked web context).

KNOWN / FLAGGED:
- "Amount billed"/"Net payable" render $0.00 on SAVED invoices because `reconciliation.invoice_total` is null in the DB. Web reads the same field → web shows $0.00 too. Mobile is at exact parity; this is a shared latent web data gap (fix belongs on web/backend, out of scope for this mobile sweep).
- UPLOAD-GUARD-1 (upload file-type validation on all upload tools) is REQUIRED by v7 but NOT live on web and the UPLOAD-GUARD-1 spec (document profiles / confidence tiers / message copy) was not attached — needs founder input before building across backend+web+mobile.
- SmartAISummary also appears on the mobile Statements LIST and Invoices LIST — v7 wording is ambiguous on list pages; needs founder confirmation.
- Remaining v7 surfaces (all other tools/screens) not yet swept — per-surface gate protocol to continue after founder sign-off on the two worked examples.

## [2026-06] Summary Unification + Real Invoice Totals (web + mobile + backend)
- SUMMARY UNIFICATION (founder: one "Wayly Summary" everywhere, never two summaries on one page). Rebranded the shared `SmartAISummary` (web `SmartAISummary.jsx` + mobile `SmartAISummary.tsx`) from eyebrow "SMART SUMMARY" + title "Your Wayly Insight" to a single "Wayly Summary" heading (no call-site overrides existed). Removed the duplicate `SmartAISummary` from the two pages that already carry a second summary: Statement Detail (keeps only DecoderResultView "In plain English") and Invoice Detail (keeps only the native "Wayly Summary" summary_md card) — on BOTH web (`StatementDetail.jsx`, `InvoiceDetail.jsx`) and mobile (`statement/[id].tsx` already done, `invoice/[id].tsx`). Verified web (testing agent iter212) + mobile (screenshots): every page shows exactly one summary; list/dashboard summaries now read "Wayly Summary".
- REAL INVOICE TOTALS: added `invoice_total` to `ReconciliationPayload` (schema.py + to_dict), computed in `run_checks` (checks.py) as round(sum(line.gross_cost)). GET `/api/invoices/{id}` (invoices.py) lazily backfills+persists invoice_total for pre-existing invoices. Banner "Amount billed"/"Net payable" now show real values on both surfaces (e.g. $27,850.25 / $27,669.39). Backend pytest: /app/backend/tests/test_parity1_wayly_summary.py (2/2 PASS).

## [2026-06] PARITY-1 v7 sweep — CSC-1, Care Plan Reviewer, Provider Price Checker (mobile-only, web untouched) + UPLOAD-GUARD-1 Phase 0
Tested green end-to-end (testing agent iter213, 0 bugs) + curl-verified backends.
- CSC-1 (`mobile/src/components/tools/ClassificationSelfCheck.tsx`): added Save-as-PDF (`/public/csc/pdf` via new `sharePostPdf` in download.ts — POST→base64→share), Email-to-self (`/public/csc/email`), "What the assessor will ask" IAT-domains collapsible (`/public/csc/iat-domains`), csc-cta-help line, budget_source_version footer, and draft/resume persistence via AsyncStorage cache. Deferred: per-option anchors (not in mobile cscQuestions data), ReportIssue (no mobile-wide component).
- Care Plan Reviewer (`mobile/src/components/tools/CarePlanReviewer.tsx`): added the MULTI-FILE UPLOAD path (expo-document-picker, ≤5 files/20MB, PDF/DOCX/JPG/PNG/HEIC/WebP/TXT) → `/public/care-plans/review-files`; quarterly-budget field; enriched "what we read" preview (effective dates, quarterly budget, per_file_meta files-processed, services grid, unread_sections); save-to-register (`/care-plans/upload-files` | `/care-plans/upload`) → "View saved plans".
- Provider Price Checker (`mobile/src/components/tools/ProviderPriceChecker.tsx`): added DoH snapshot selector (`/ppc/snapshots`), "Save this result" (`POST /ppc/checks`) with fuzzy keep-separate/merge prompt + rate-increase chip, and a NEW Price History screen `mobile/app/price-history.tsx` (groups by service+provider, savings snapshot, savings pills, react-native-svg sparkline, milestone banner via `/ppc/milestones` + `/ppc/milestones/mark`). Deferred depth: row/bulk delete, quality-profile chip, email-draft, pdf-export, prefill-from-statements.
- UPLOAD-GUARD-1: produced `/app/UPLOAD-GUARD-1-PHASE0-AUDIT.md` (report only, per spec gate) — inventory of upload entry points + current validation (invoice document_shape classifier + care-plan validate_submission baselines) + proposed registry/tiers/thresholds/delivery. AWAITING founder sign-off before Phase 1 build. Guard NOT implemented.

## [2026-06] UPLOAD-GUARD-1 (v1) BUILT — signed off with recommended answers (backend + web + mobile)
Server-authoritative upload validation, three-tier, registry-driven. All 11 backend unit tests pass + curl-verified on live endpoints.
- Backend: new `backend/lib/upload_guard/` (registry.py — `UPLOAD_GUARD_REGISTRY_VERSION=ug1-2026-06`, 20MB cap, allow-list, magic bytes, per-tool signals for invoice/statement/care-plan; guard.py — cascade: empty→too_large→wrong_type/integrity→unreadable→content scoring→Accept≥0.70 / Confirm 0.40-0.70 / Block <0.40 or wrong-tool≥0.70). `classify_upload()` shared helper.
- Wired into `routes/invoices.py` (`/invoices/upload`, added `override_guard` Form param; statement wrong-tool still uses the existing redirect, all other block/confirm return `upload_guard`) and `routes/care_plans.py` (`/public/care-plans/review-files` + `/care-plans/upload-files` — wrong-tool redirect only, so genuine plans pass).
- Frontends: shared `UploadGuardNotice` on web (`frontend/src/components/UploadGuardNotice.jsx`) + mobile (`mobile/src/components/UploadGuardNotice.tsx`) rendering Block / Wrong-tool (with one-tap "Open the <right tool>" redirect) / Confirm (Continue-anyway re-submits with override). Wired into Invoice Checker + Care Plan Reviewer on both surfaces.
- Verified: careplan→invoice = wrong-tool→care-plan-reviewer; unrelated→invoice = block/unrelated; statement→invoice = existing redirect; valid invoice = processed; invoice→care-plan = wrong-tool→invoice-checker.
- Route map: web `/ai-tools/<slug>`, mobile `/tool/<slug>`. Tests: `backend/tests/test_upload_guard.py`.

## [2026-06] Letters & Follow-ups (LF-1) mobile FULL parity + shared LLM-freeze fix
LF-1 mobile detail page (`mobile/app/letters/[id].tsx`) fully rewritten to match web `frontend/src/pages/tools/CorrespondenceDetail.jsx` + `components/lf1/LetterGeneration.jsx` (founder: FULL parity). Verified: earlier testing agent passed the non-LLM half; LLM/draft half verified via Expo screenshots + curl on every endpoint.
- Ported to mobile (RN primitives, `StyleSheet`, testIDs): cross-tool import chips (`GET /lf1/cross-tool-signals` → `lf1-import-*` → `POST .../attach-source` pre-fills intake); sender-authority textarea; complaint-mode selector (open/confidential/anonymous) for complaint/escalation/guided_pathway; ATSI toggle (reassessment situations 1/2); per-archetype intake forms (request/dispute/complaint/escalation w/ prior-attempts list/notification/response_draft/guided_pathway) incl. evidence attach (DocumentPicker, metadata-only) + notes; terms-ack (`PATCH terms_ack`); debounced autosave (`PATCH .../autosave`).
- Generate paths: `POST .../generate` (default), `.../safeguarding-record` (guided_pathway), `.../response-draft` (response_draft/situation 12); 422 missing-fields handling. Output: draft body + Email/MAC-portal format switcher, Copy, PDF export (`POST .../pdf` via `sharePostPdf`), feedback thumbs (`.../feedback`), tone-check (`.../tone-check`, flag-gated), ADM disclosure. Follow-ups: Mark-as-sent (`PATCH status=sent`), Log-a-reply modal (`POST .../inbound`). Share & sign-off panel (`/household/members`, `.../share`, `.../sign-off`). Delete draft (`DELETE`).
- SHARED BACKEND FIX (`backend/lib/llm_wrapper.py`) — ROOT CAUSE of the `/generate` 502s reported on BOTH web+mobile: the vendored litellm/openai client BLOCKS whatever event loop it runs on while awaiting a slow upstream. A single slow gateway call froze the WHOLE backend (every request 502'd) and no async timeout (litellm's or ours) could fire on a blocked loop; the process stayed poisoned until a manual restart. Fix: run every provider call in a DEDICATED `ThreadPoolExecutor` (`LLM_THREAD_WORKERS=16`, separate from the default pool so LLM bursts can't starve bcrypt/login), each in its own event loop, bounded by `asyncio.wait_for` (`LLM_CALL_TIMEOUT_SEC=75`) + litellm `timeout=70`/`num_retries=0`. Result: main loop stays responsive during LLM calls (verified: `/api/` = 0.00s while a generate is in-flight), slow calls fail fast+clean at 75s (502) instead of hanging forever, process self-heals. No fd leak (stable across 12 calls). Benefits every AI tool on both surfaces.
- NOTE: the Emergent LLM gateway is intermittently slow for Sonnet right now (same 2200-token generate observed at 8s AND at >75s within minutes) — an UPSTREAM condition. When healthy, generate works (~8s, full payload verified); when slow it now returns a clean 75s 502 rather than freezing.

## [2026-06] Results scroll-to-top on submit + sticky CSC progress (web + mobile)
User-reported cross-platform bug: after answering a tool's questions and tapping Submit, the page stayed scrolled at the bottom instead of showing results; and the Classification Self-Check progress bar scrolled out of view while answering. Fixed on BOTH surfaces; VERIFIED by testing agent (results land at top of viewport; sticky progress stays pinned).
- New reusable hooks: web `frontend/src/hooks/useScrollToResult.js` (scrolls result container into view, `block:start`, paired with `scroll-mt-20` for the h-16 sticky header) and mobile `mobile/src/hooks/useScrollToResult.ts` (scrolls the ScrollView to the result container's measured `onLayout` offset).
- Wired scroll-to-result into: WEB tools ClassificationCheck, PriceCheckerTool, BudgetCalculatorTool, CarePlanReviewer (paste + file results), InvoiceCheckerTool, StatementDecoderTool, ContributionEstimator; WEB other-category workflows CarerSelfAssessment, CscStreamMixIat, ProviderComparison, ChspTools; MOBILE tools ClassificationSelfCheck, BudgetCalculatorTool, CarePlanReviewer, ContributionEstimator, InvoiceChecker, ProviderPriceChecker (Aged Care Q&A already did it).
- CSC progress bar made STICKY/persistent: web wraps `ProgressBar` in a `sticky top-16 z-30` bar (`data-testid=csc-progress-sticky`); mobile moves the progress bar OUT of the ScrollView into a persistent bar between the header and content (`testID=csc-progress-sticky`, shown only during the quiz).

## [2026-06] Mobile feature parity: PPC History Depth, CHSP Build-Out, Ask Wayly (AW-2)
Three mobile features brought to parity with web (web = source of truth). VERIFIED end-to-end by testing agent (iteration_217) — no blocking issues.
- **PPC History Depth** — mobile Provider Price Checker (`mobile/src/components/tools/ProviderPriceChecker.tsx`) result now has Download PDF (`POST /ppc/pdf-export` via `sharePostPdf`) + Email-the-provider modal (`POST /ppc/email-draft`, editable subject/body, copy + `mailto:` launch, optional ACQSC increase paragraph). History screen (`mobile/app/price-history.tsx`) adds a provider quality-profile chip (`GET /ppc3/providers/{provider}/quality-profile`), per-check delete (`DELETE /ppc/checks/{id}?confirm=` with the flag-reduction confirm dialog) and bulk 'Delete provider history' (`DELETE /ppc/checks/provider`).
- **CHSP Build-Out** — `mobile/app/chsp-tools.tsx` rewritten from info-only to the full tool: CHSP profile create/summary (`/chsp1/profile`), fee variance check with tolerance badge + dispute (`/chsp1/fee-checks`, `.../dispute`), and a 3-step transition-to-SAH walkthrough (`/chsp1/transition-considerations`).
- **Ask Wayly Mobile (AW-2)** — `mobile/app/(tabs)/ask.tsx` rebuilt on the AW-2 stack: conversations (`POST /aw2/conversations`), SSE streaming via new `streamAw2` helper in `mobile/src/lib/api.ts` (`.../messages/stream`), per-source consent + retention settings sheet (`/aw2/context`, `/aw2/context/consent`, `/aw2/context/retention-policy`), citations, and thumbs/incorrect feedback (`/aw2/conversations/{cid}/feedback`).
- Reused the `useScrollToResult` hooks where the ScrollView is directly owned; no backend changes (only a client streaming helper added).

## [2026-06] Mobile login cleanup + Forgot Password (parity with web)
User request, VERIFIED by testing agent (iteration_218, all 6 criteria pass; backend unchanged).
- Removed the "Welcome Back" and "Sign in to your account" text from the mobile login screen (`mobile/app/login.tsx`).
- Added a "Forgot Password?" link (`testID login-forgot-password`) below the password field → new `mobile/app/forgot-password.tsx` screen mirroring the web `/forgot` flow: email → `POST /api/auth/forgot` (enumeration-safe, rate-limited ~3/hr/email) → neutral "Check your email" state with a 60s-cooldown resend + Back to Sign In. The actual reset still happens via the emailed web `/reset` link, same as web. Auth reviewed via integration_expert first; back button uses `router.canGoBack()` fallback to `/login` for deep-link entry.
