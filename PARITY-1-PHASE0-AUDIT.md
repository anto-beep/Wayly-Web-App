# PARITY-1 · Phase 0 Audit Gate — Web vs Mobile AI Tools

**Spec:** `AI Tools PARITY-1-v1.md`
**Date:** 18 Jun 2026
**Scope:** Report only. No tool code written. Web is the source of truth and is not modified.
**Surfaces:** Web `/app/frontend` (React/Shadcn) · Mobile `/app/mobile` (Expo/React Native) · shared FastAPI backend.

---

## 0. Executive summary (gate decision)

- **The web "AI Tools" registry has exactly 9 tools** (`/app/frontend/src/config/toolRegistry.js`, `TOOL_COUNT = 9`). The mobile AI-Tools hub (`/app/mobile/app/(tabs)/ai-tools.tsx`) lists the **same 9 tools, in the same order, with verbatim names/body copy**. So the "15 tools" in the spec = 9 AI-grid tools + 5 sidebar feature-tools (CMP-1, PSW-1, CS-1, ATHM-1, CHSP-1) + 1 not-yet-live (AW-2 Ask Wayly).
- **Payload identity is strong for the 9 grid tools**: mobile hits the *same* backend endpoints (`/public/budget-calc`, `/public/price-check-v2`, `/public/csc/run`, `/public/care-plans/review`, `/public/aged-care-chat`, `/ce2/calculate`, `/lf1/*`, `/ppc/services`, `/invoices/upload`). No mobile-only or web-only payload shapes were found for these.
- **Confirmed parity gaps that will need remediation in Phase 1** (highest first):
  1. **CHSP-1 (Commonwealth Home Support Programme):** mobile `chsp-tools.tsx` is **informational only — 0 API calls**, while web `ChspTools.jsx` is fully functional (profile, fee-checks, service-entries, transition considerations). **Feature parity: FAIL.**
  2. **CSC-1 (Classification Self-Check) artefacts:** web generates a server-side **PDF (`/public/csc/pdf`)** and **email (`/public/csc/email`)** and an IAT-prep view (`/public/csc/iat-domains`); mobile only calls `/public/csc/run`. **Artefact parity: FAIL.**
  3. **Care Plan Reviewer file upload:** web supports file upload (`/public/care-plans/review-files`, `/care-plans/upload-files`); mobile grid tool is text-paste only. **Feature parity: PARTIAL.**
  4. **Provider Price Checker depth:** web has history/milestones/snapshots (`/ppc/checks`, `/ppc/checks/history`, `/ppc/milestones`, `/ppc/snapshots`); mobile has the checker + `/ppc/services` but the saved-history / milestones surface is lighter. **Feature parity: PARTIAL.**
  5. **LF-1 cross-tool signals:** web pulls `/lf1/cross-tool-signals`; not present on mobile. **Feature parity: PARTIAL.**
  6. **AW-2 (Ask Wayly):** web `AskWaylyV2.jsx` uses the full consent/memory stack (`/aw2/context`, `/aw2/conversations`, retention policy); mobile "Ask" tab uses the simpler `/public/aged-care-chat` (Family Coordinator). The spec lists AW-2 as "not yet built" — treat as **out of scope / clarify** (see §8).
  7. **Sidebar feature-tool endpoint aliases:** mobile calls `/athm`, `/provider-switch`, `/case/{id}` where web uses `/athm1`, `/psw1`, `/cmp1`. These MUST be confirmed to resolve to the same backend router during each tool's Phase-1 payload capture.

**Gate:** Phase 0 complete. The manifest below is the entry contract for Phase 1. Tools will be processed one at a time, starting with **Statement Decoder**.

---

## 1. Mobile rendering approach

- Expo Router file-based routes. The 9 grid tools render through `/app/mobile/app/tool/[slug].tsx`, which delegates to dedicated components in `/app/mobile/src/components/tools/` (`BudgetCalculatorTool`, `ClassificationSelfCheck`, `ProviderPriceChecker`, `ContributionEstimator`, `LettersFollowUps`, `AgedCareQA`, `CarePlanReviewer`, `InvoiceChecker`) plus an inline `StatementDecoderTool`.
- Every tool page appends the shared **`ToolExplainer`** (`/app/mobile/src/components/ToolExplainer.tsx`) fed by `/app/mobile/src/data/toolContent.ts` — verbatim port of web `toolContent.js` (intro / What This Tool Does / How It Works / What You'll Need / What You'll Get / Common Questions).
- Native primitives only (`View`/`Text`/`Pressable`/`ScrollView`), `StyleSheet`, `KeyboardAvoidingView`. No web-only libs. AI output is passed through `sanitizeAI()` (no dashes rule).
- **Legacy note:** `[slug].tsx` still contains an inline `TOOLS`/`FormTool`/`LAUNCHERS` config that is now dead code (all 9 slugs are handled by the dedicated components above it). Harmless, but flagged for cleanup so it doesn't drift from the real implementations.
- The 5 sidebar feature-tools are standalone screens: `carer-self-check.tsx` (+ `handover-pack.tsx`), `provider-switch.tsx`, `athm.tsx`, `chsp-tools.tsx`, `cases.tsx` (+ `case/[id].tsx`). Ask Wayly maps to the `(tabs)/ask.tsx` tab.

## 2. Payload identity

| Tool | Web endpoint | Mobile endpoint | Identical? |
|---|---|---|---|
| Statement Decoder | `/public/decode-statement-text`, `/public/decode-statement` (file), `/free-tool/usage` | `/public/decode-statement-text` + `/public/decode-job/{id}` poll; file → `/upload` | payload same; **free-use gating + direct file decode not wired on mobile grid tool** |
| Invoice Checker | `/invoices/upload` | `/invoices/upload` | ✅ |
| Budget Calculator | `/public/budget-calc` | `/public/budget-calc` | ✅ |
| Provider Price Checker | `/public/price-check-v2`, `/ppc/services`, `/ppc/checks*`, `/ppc/milestones*`, `/ppc/snapshots` | `/public/price-check-v2`, `/ppc/services` | core ✅; **history/milestones/snapshots partial** |
| Classification Self-Check | `/public/csc/run`, `/public/csc/pdf`, `/public/csc/email`, `/public/csc/iat-domains` | `/public/csc/run` | core ✅; **pdf/email/iat missing** |
| Letters & Follow-ups | `/lf1/situations`, `/lf1/safety`, `/lf1/correspondence`, `/lf1/follow-ups`, `/lf1/cross-tool-signals` | `/lf1/situations`, `/lf1/safety`, `/lf1/correspondence` | core ✅; **follow-ups + cross-tool-signals partial** |
| Contribution Estimator | `/ce2/calculate`, `/tools/ce/state` | `/ce2/calculate` | core ✅; **saved state partial** |
| Support Plan Reviewer | `/public/care-plans/review`, `/public/care-plans/review-files`, `/care-plans/upload*` | `/public/care-plans/review` (text only) | core ✅; **file upload missing** |
| Aged Care Q&A | `/public/aged-care-chat` | `/public/aged-care-chat` | ✅ |
| **CMP-1 Complaints** | `/cmp1/*` | `/case*`, `/cases/scan` (alias?) | **confirm in Phase 1** |
| **PSW-1 Switching** | `/psw1/*` | `/provider-switch*` (alias?) | **confirm in Phase 1** |
| **CS-1 Carer Support** | `/cs1/assessments`, `/cs1/support-services`, handover packs | `/cs1/assessments`, `/cs1/handover-packs/{id}/export.pdf` | core ✅; **support-services + burnout depth to confirm** |
| **ATHM-1** | `/athm1/*` | `/athm*` (alias?) | **confirm in Phase 1** |
| **CHSP-1** | `/chsp1/profile`, `/chsp1/fee-checks`, `/chsp1/service-entries`, `/chsp1/transition-considerations` | **none (informational screen)** | ❌ **FAIL** |
| AW-2 Ask Wayly | `/aw2/context`, `/aw2/conversations`, `/aw2/context/retention-policy` | `/public/aged-care-chat` (different, simpler stack) | ❌ different tool (see §8) |

## 3. Artefact generation

- **Server-generated, shared by both surfaces (correct model per spec):** decoded statement PDF/CSV, `/reports/summary.pdf`, `/statements.csv`, CSC-1 PDF (`/public/csc/pdf`), CS-1 handover-pack PDF (`/cs1/handover-packs/{id}/export.pdf`), CMP-1 evidence-bundle PDF.
- **Mobile artefact plumbing exists:** `/app/mobile/src/lib/download.ts` → `downloadAndShare()` / `shareTextFile()` (authenticated fetch + native share; web-preview blob fallback). Statement downloads and the CS-1 handover-pack PDF already use it.
- **Gaps:** CSC-1 PDF + email are not surfaced on mobile; Reports summary PDF / statements CSV export surfacing on mobile tool screens needs confirmation per tool in Phase 1.

## 4. Tool inventory & build status

| # | Tool (spec) | Web build | Web surface | Mobile build | Mobile surface | Parity status |
|---|---|---|---|---|---|---|
| 1 | Statement Decoder | ✅ | AI-Tools grid | ✅ | `tool/[slug]` inline | near-parity (file/free-use gap) |
| 2 | SAH Invoice Checker | ✅ | AI-Tools grid | ✅ | `InvoiceChecker.tsx` + `/invoices` | near-parity |
| 3 | Care Plan Reviewer | ✅ | AI-Tools grid | ✅ | `CarePlanReviewer.tsx` | partial (no file upload) |
| 4 | Classification Self-Check (CSC-1) | ✅ | AI-Tools grid | ✅ | `ClassificationSelfCheck.tsx` | partial (no PDF/email/IAT) |
| 5 | Contribution Estimator (CE-2) | ✅ | AI-Tools grid | ✅ | `ContributionEstimator.tsx` | near-parity |
| 6 | Budget Calculator | ✅ | AI-Tools grid | ✅ | `BudgetCalculatorTool.tsx` | near-parity |
| 7 | Provider Price Checker | ✅ | AI-Tools grid | ✅ | `ProviderPriceChecker.tsx` | partial (history/milestones) |
| 8 | Letters & Follow-ups (LF-1) | ✅ | AI-Tools grid | ✅ | `LettersFollowUps.tsx` | partial (follow-ups/signals) |
| 9 | Family Coordinator (Aged Care Q&A) | ✅ | AI-Tools grid | ✅ | `AgedCareQA.tsx` + Ask tab | near-parity |
| 10 | Complaints Workflow (CMP-1) | ✅ | sidebar | ✅ | `cases.tsx` / `case/[id]` | confirm endpoints |
| 11 | Provider Switching (PSW-1) | ✅ | sidebar | ✅ | `provider-switch.tsx` | confirm endpoints |
| 12 | Carer Support Assessment (CS-1) | ✅ | sidebar | ✅ | `carer-self-check.tsx` + `handover-pack.tsx` | confirm depth |
| 13 | Assistive Tech & Home Mods (ATHM-1) | ✅ | sidebar | ✅ | `athm.tsx` | confirm endpoints |
| 14 | Commonwealth Home Support (CHSP-1) | ✅ | sidebar | ⚠️ info-only | `chsp-tools.tsx` (0 API) | **FAIL — build out** |
| 15 | Ask Wayly (AW-2) | ⚠️ `AskWaylyV2.jsx` exists (`/aw2/*`) | sidebar | ➖ simpler Ask tab | `(tabs)/ask.tsx` | out of scope / clarify |

## 5. Persona & theme controls

- **Theme:** mobile has full light/dark via `useTheme()` / `ThemeContext`; web has light/dark via CSS tokens. Both tool sets are theme-token driven. Coverage requirement (exhaustive across themes) is achievable on both.
- **Persona:** driven by `user.role` (caregiver vs participant) + plan tier (`free`/`solo`/`family`/`adviser`) from `AuthContext`. The AI-Tools hub already gates trial chips by plan (`hasFullAccess`). Persona-specific copy differences per tool must be captured per tool in Phase 1.

## 6. Automation capability

- Mobile tool screens carry stable `testID`s (`ai-tool-card-{slug}`, `ai-tool-link-{slug}`, `decoder-*`, `tool-submit`, `tool-result`, `tool-guardrail`, `tool-letter-text`, `tool-field-*`). Web carries matching `data-testid`s. Both are automatable via the testing agent (Playwright on web + Expo web preview).
- Expo preview URL: `https://<app>.expo.preview.emergentagent.com`. Web preview URL: `REACT_APP_BACKEND_URL`.

## 7. Fixtures

- **Accounts** (`/app/memory/test_credentials.md`): `cathy@example.com / testpass123` (Family, 3 active participants, providers seeded) is the primary parity account; `bibi@test.com / CarTest123$`; mobile Stripe billing users. Free/logged-out state available for free-tool gating.
- **Sample documents** (artifacts): decoder sample PDFs (`Sample decoder -5.pdf`, `M1/M2/M3_Louisa_Davids`, `MARGARET_June_2026.pdf`), invoice PDFs with ANSWER-KEY files (`glorious-services-invoice-INV-2026-07-4471.pdf`, `banksia/riverside/meridian/coastal`), care-plan text. Sufficient for Statement Decoder + Invoice Checker Phase-1 capture.

---

## 8. Open questions for the user (before Phase 1 build)

1. **Scope of "15 tools":** the web AI-Tools *grid* is only 9. Confirm the sweep also covers the 5 sidebar feature-tools (CMP-1, PSW-1, CS-1, ATHM-1, CHSP-1) at full data/feature/artefact parity — not just the 9 grid tools.
2. **AW-2 (Ask Wayly):** the spec says "not yet built", yet web has `AskWaylyV2.jsx` (`/aw2/*` consent+memory). Should mobile port that full AW-2 stack, or is the current `/public/aged-care-chat` "Aged Care Q&A" the intended surface (AW-2 deferred)?
3. **Tool order for Phase 1** (spec says one-at-a-time from Statement Decoder): confirm the order is exactly the spec's list, or reprioritise the FAIL/partial tools (CHSP-1, CSC-1 artefacts) earlier.

## 9. Phase 1 protocol (per tool, per spec)

Web capture → build manifest (columns: `item_id, category, description, web_present, mobile_present, match_type, evidence_ref, notes`) → confirm payload identity → mobile capture → compare → remediate (additive to mobile only) → re-run & verify → evidence bundle → gate → independent double-check pass. Delivery evidence per tool: captured-payloads, parity-manifest, screenshots, artefacts, parity-report.md, remediation-log.

**Rollback:** all Phase-1 changes are additive to the mobile client.
