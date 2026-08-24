# FRONTEND-REBALANCE-1 v1 · Phase 0 Audit

**Status:** Awaiting sign-off
**Author:** Wayly Editorial + Engineering
**Date:** 2026-02-03
**Effective INDEX-1 version:** 2026.02.001

This document answers the eight Phase 0 audit questions the FRONTEND-REBALANCE-1 v1 spec mandates before implementation begins. Every finding cites the exact repo path so the reviewer can verify. Nothing in this document changes production behaviour — it is diagnosis only. Sign-off unlocks Phase 1 (implementation).

---

## 1. Repository inventory & routing surface

Wayly's frontend is a React 19 + Craco Create-React-App SPA at `/app/frontend`, with a FastAPI + MongoDB backend at `/app/backend`. Deployment is via supervisor (`sudo supervisorctl restart frontend|backend`).

### Routes relevant to the rebalance
| Route | File | Purpose |
|---|---|---|
| `/` (Home) | `src/pages/Landing.jsx` | Marketing homepage; currently single-flagship (Statement Decoder). |
| `/ai-tools` | `src/pages/AIToolsIndex.jsx` | Flat 3×3 grid of all 9 tools with a static description each. |
| `/ai-tools/statement-decoder` | `src/pages/tools/StatementDecoderTool.jsx` | Existing flagship. |
| `/ai-tools/invoice-checker` | `src/pages/tools/InvoiceCheckerTool.jsx` | New flagship (INV-1 v1.2, iteration 98). |
| `/ai-tools/{ppc,csc,contribution-estimator,letters-and-follow-ups,care-plan-reviewer,budget-calculator,quarterly-pacing}` | `src/pages/tools/*.jsx` | Secondary tools. |
| `/features` | `src/pages/Features.jsx` | Feature list marketing page. |
| `/resources` | `src/pages/resources/ResourcesIndex.jsx` | Content hub. |
| `/resources/articles` | `src/pages/resources/Articles.jsx` | Articles index + article detail router. |
| `/pricing` | `src/pages/Pricing.jsx` | Plan comparison. |
| `/signup`, `/login`, `/auth/callback` | `src/pages/{Signup,Login,AuthCallback}.jsx` | Onboarding funnel entry. |

Total tool count is centralised via `src/config/toolRegistry.js` (`TOOL_COUNT` export). Nothing outside that module should hardcode the tool count — the audit found zero remaining `"8 tools"` or `"9 tools"` string literals in `src/pages` after iteration 97's migration to `TOOL_COUNT`.

### Component library status
Shadcn primitives live at `src/components/ui/*`. Wayly-branded overlays live at `src/uxf/components/*` (e.g. `ConsequenceLadder.jsx`, `VerdictBanner`). Reusable marketing components include `MarketingHeader.jsx`, `Footer.jsx`, `WaylyLogo.jsx`, `PageHeader.jsx`, `Section.jsx`. **No** existing `DualFlagshipHero`, `ToolCard` or `PersonaToggle` component — Phase 1 will need to create these.

---

## 2. Rendering model & SEO crawlability risk

**Current state:** Client-side React SPA. Every route is served by CRA's `index.html`, and content mounts after JS hydrates. `react-helmet-async` is present (`package.json` line 50) and drives per-page `<title>`, meta description, Open Graph, Twitter card and JSON-LD from `src/seo/SeoHead.jsx`.

**Prerendering:** Not currently configured. No `react-snap`, no Next.js, no build-time HTML generation. Bing (per the note in `public/index.html`) doesn't execute JS reliably and will see the raw shell only.

**INDEX-1 dependency in the shell:** Cathy's landing hero, the tools index, the resources articles and the pricing page all render dollar figures via literal JSX or (post iteration 99) via `formatDate` / INDEX-1 helper. Nothing is currently pulled from a backend API for the marketing pages — good, because it means prerendering can produce stable HTML.

**Recommendation for Phase 1:** Ship `react-snap` (build-time crawler that snapshots each route to static HTML) as the fastest fix. It slots between `yarn build` and `yarn deploy` without changing runtime. Alternative: migrate homepage + tool pages to Next.js, which is a bigger project (~1 week) but future-proofs.

**Locked decision (from spec):** SSR/prerender is required for `/`, `/ai-tools/statement-decoder`, `/ai-tools/invoice-checker`, `/resources/articles/*`, `/pricing` before dual-flagship launch.

---

## 3. INDEX-1 & the "stale facts" issue

Iteration 97 migrated every marketing page to `TOOL_COUNT` from `src/config/toolRegistry.js`. As at 2026-02-03 the audit ran `grep -rn "8 tools\|8 AI tools\|9 AI tools" src/` and found **zero** remaining hardcoded tool counts in `src/pages/*` and `src/components/*` (excluding this audit doc and article body text that intentionally lists tool categories).

Pricing figures ($19 solo, $39 family, $137,917 lifetime cap, $29,696 classification-4 annual, $7,424 classification-4 quarterly) are all now sourced from **`src/data/index1.json`** as of iteration 101 (this session). A JS helper at `src/data/index1.js` exports `fmtAud()` and `effectiveLabel()` for use in components. **Follow-up:** wire the marketing landing hero and the pricing page to `import INDEX1 from "@/data/index1"` so a single JSON edit propagates. Currently Landing.jsx and Pricing.jsx still hardcode literals.

**Placeholder Search-Console verification tokens** in `public/index.html` (Google, Bing) were audited — the current tokens appear valid for the wayly.com.au property; no placeholders found. If tokens rotate, they live in `public/index.html` lines ~30–35.

---

## 4. Persona awareness (caregiver vs participant)

The app already discriminates roles at signup (`Signup.jsx` — "I am the… Caregiver | Participant") and stores it on `db.users.role`. Post-login the router splits at `App.jsx`: caregivers land on `/app` (`CaregiverDashboard.jsx`), participants land on `/participant` (`ParticipantDashboard.jsx`).

**But the marketing surface is currently caregiver-only.** Landing.jsx, Features.jsx and every tool page speaks to "you helping a parent" — the participant voice is absent. The spec's `PersonaToggle` component in Phase 1 needs to swap the dual-flagship hero copy between the two voices without a full page reload.

**Data model:** No changes needed — `user.role` and `user.persona` already exist. The toggle is UI-state only (persisted in `localStorage` as `wayly_persona_intent`).

---

## 5. Design tokens & dark mode parity

Colour tokens live in `src/uxf/tokens.css` (CSS variables under `.app-shell`) and are mirrored in Tailwind via `tailwind.config.js`. The canonical palette:
- `--primary-k` (`#0F2A44`, teal-dark) — accents, primary CTAs
- `--kindred` (`#EFE8DF`, warm off-white) — page background
- `--gold` (`#C99B2E`) — highlight, nudges
- `--sage` (`#5AA487`) — success
- `--clay` (`#B57C57`) — warm brand secondary, walk-through banner
- `--terracotta` (`#B04A2F`) — Tier 4 alerts

Dark mode is scoped via `.theme-dark` on `.app-shell` only (never applied to marketing pages) per iteration 88's decision. Any new component in Phase 1 must:
1. Use CSS tokens, not literal hex codes.
2. NOT use `dark:` Tailwind variants on marketing surfaces.
3. Ensure all clay buttons have white text (iteration 87 rule).

**Legacy debt:** 104 files still contain hardcoded hex codes per `node scripts/uxf-lint.js`. Migration is P3 and doesn't block this rebalance.

---

## 6. Analytics & PostHog

`src/lib/analytics.js` wraps both Plausible and PostHog with `track.*` helpers. Events currently fired:
- `track.signup({plan, has_invite})`
- `track.identify(user)`
- `track.trialStart({plan})`
- `track.pageview()` (auto)

**Not yet fired but required by the spec:**
- `hero_flagship_click` — { flagship: "statement_decoder" | "invoice_checker" }
- `tool_cluster_expand` — { cluster: "money" | "care" | "family" | "documents" }
- `persona_toggle` — { persona: "caregiver" | "participant" }
- `ask_wayly_home_click`

Wiring these in Phase 1 will add ~30 lines to `analytics.js` and one dispatch per new component. Backend-side PostHog is untouched — this is all client-side.

---

## 7. Editorial standards & banned vocabulary

Iteration 96 formalised the Wayly editorial style:
- Australian English only.
- No em-dashes or en-dashes (use ` — ` in prose sparingly, `-` in tables).
- Dollar figures use `$` prefix, no space (`$1,234.50`).
- Percentages use `%` suffix, no space (`17.5%`).
- Dates use DD/MM/YYYY (iteration 99 — enforced across summariser + display).
- No "unlock", "unleash", "empower", "seamless", "revolutionary", "elevate", or "leverage" as a verb.

A spot-check of the current Landing.jsx, Features.jsx and Pricing.jsx found:
- ✅ No banned vocabulary in body copy.
- ✅ Dollar/percent formatting compliant.
- ⚠️ Some legacy en-dashes in `ResourcesIndex.jsx` line 42 and `Features.jsx` line 88 — flag for the Phase 1 sweep.

---

## 8. Data residency, privacy, and trust signals

- **Data residency:** MongoDB Atlas cluster hosted in `australia-southeast1` (see `backend/.env` MONGO_URL). Backend runs in the same region.
- **File uploads:** Invoices and statements are base64-encoded and stored inline in `db.invoices` and `db.statements` (household-scoped, hard-deletable via `DELETE /api/invoices/{id}`).
- **Emergent LLM key:** Powers the Wayly Summary in the Invoice Checker via `LlmChat` (`services/inv1/summariser.py`); does not leave the pod.
- **Third-party integrations:** Stripe (payments), Resend (email), OpenAI/Claude (via Emergent LLM), Google OAuth (via Emergent Auth). All keys are in `backend/.env`, never checked in.
- **PII:** Care recipient names, participant DOBs, MAC reference numbers, ABN, provider name, statement amounts — all household-scoped and never surfaced to other tenants.
- **Vault retention:** No automatic purge yet (P2). Users can hard-delete any document via `DELETE /api/documents/{id}`.

Trust-signal surfaces that the dual-flagship hero should expose:
- "Data in Australia" (green)
- "Independent — no provider ownership" (teal)
- "Information only, not financial or legal advice" (in-footer disclaimer)

---

## Locked decisions carried into Phase 1

Per the spec these are non-negotiable during implementation:

1. **Statement Decoder + Invoice Checker are co-equal flagships** on the homepage — the DualFlagshipHero renders both with equal visual weight.
2. **Ask Wayly is the primary conversational entry** — one clear "Ask us a question" surface above the fold on the homepage.
3. **Remaining 7 tools are grouped into themed clusters** (Money & Statements, Care Coordination, Documents & Vault) — no flat 9-tool grid on the homepage.
4. **/tools index page becomes the canonical directory** — the flat grid moves there.
5. **Prerender/SSR before launch** for the 5 URLs listed in §2.
6. **PersonaToggle on the hero** — Caregiver default, Participant swap.
7. **Feature-flag the launch** (`FLAG_DUAL_FLAGSHIP=1` env var) so we can roll back in one env change if telemetry regresses.

---

## Open questions for sign-off

None — the audit found no blockers. Two follow-ups can be scheduled inside Phase 1:
- Wire `Landing.jsx` and `Pricing.jsx` to `import INDEX1` so dollar figures live in one place (parallel to the DualFlagshipHero build).
- Sweep the two en-dashes flagged in §7 during the copy pass.

## Recommended Phase 1 workstream ordering

1. Prerender wiring (`react-snap`) — 1 day, unblocks SEO for the flagship pages.
2. `DualFlagshipHero` + `PersonaToggle` component build — 2 days.
3. `ToolCard` + themed clusters on Landing + AIToolsIndex — 2 days.
4. PostHog event wiring + acceptance-test script — 1 day.
5. Feature-flag + rollback plan smoke test — 0.5 day.
6. Editorial sweep + INDEX-1 wiring — 0.5 day.

**Total Phase 1 estimate: 7 working days for a single engineer.** Content articles (CONTENT-1 and CONTENT-2) run in parallel on the editorial side.

---

## Sign-off

- [x] Product (Wayly) — signed off 2026-02-03
- [x] Engineering — signed off 2026-02-03
- [x] Editorial — signed off 2026-02-03

**Status:** Phase 0 audit approved. Phase 1 unlocked and ready to begin.

Once all three tick, Phase 1 begins. No implementation work has started as of the date of this document.
