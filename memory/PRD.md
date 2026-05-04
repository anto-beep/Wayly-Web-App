# Kindred — Product Requirements (Living Doc)

## Product
Kindred is the AI operating system for Australian families navigating the Support at Home program (effective 1 Nov 2025). The primary paying user is the adult-child family caregiver; the participant (the older parent) is the secondary user. Provider-agnostic SaaS, never takes commissions, never sells data.

## Personas
- **Cathy (52, primary caregiver)** — main paying user, busy, wants 30-second oversight.
- **Dorothy (79, participant)** — voice-first, large-text, single-action UX.
- **Karen (48, secondary caregiver)** — read-only sibling with weekly digest (deferred).
- **Mark (financial advisor)** — B2B2C, multi-client portal (deferred).

## Architecture
- React (CRA) + Tailwind + shadcn UI · FastAPI + MongoDB (motor) · JWT auth (bcrypt) · Claude Sonnet 4.5 via emergentintegrations (EMERGENT_LLM_KEY) · pypdf for PDF extraction.
- Brand: warm navy `#1F3A5F` + gold `#D4A24E` + sage + terracotta on warm off-white `#FAF7F2`. Crimson Pro headings + IBM Plex Sans body.

## Implemented (Iteration 1 — May 2026)
- Auth: signup with role select (caregiver/participant), login, me. JWT, bcrypt.
- Household onboarding (Class 1–8, provider, grandfathered flag).
- Statement upload (PDF/CSV/TXT) → Claude parses → line items + summary + anomalies (rule-based duplicate + rate-spike, LLM rewrites in plain English).
- Budget: per-stream allocation, lifetime cap progress, rollover cap, quarterly windows.
- AI chat with full context (classification, quarterly burn, lifetime cap, latest summary).
- Family thread, immutable audit log.
- Participant view with huge text + giant call/concern buttons.

## Implemented (Iteration 2 — Marketing front-end + 3 free AI tools)
- Public marketing site (no auth required):
  - Landing page with **3-persona on-ramp** (caregiver/participant/advisor) + **embedded live Statement Decoder** in hero + **countdown to 1 Jul 2026** + 12-question FAQ + social proof strip + big-number CTA + feature grid + pricing teaser.
  - **Pricing page** with 4 consumer tiers (Free $0, Solo $19, Family $39 "Most popular", Lifetime $799) + 2 advisor tiers ($299, $999) + full feature comparison table + 8-question pricing FAQ + pensioner discount note.
  - **Trust hub** — 7 sections (data residency, who can see, what we don't do, compliance, audit log, elder protection, independent oversight) + Australian crisis numbers.
  - **AI Tools index** — 8 cards (3 live, 5 "Soon").
- Three free AI tools, fully functional without signup, IP rate-limited (5/30days):
  - `/ai-tools/statement-decoder` — paste text OR upload PDF/CSV → Claude parses → summary + line items + anomalies + upgrade CTA.
  - `/ai-tools/budget-calculator` — classification picker + grandfathered toggle → annual + quarterly + per-stream + lifetime cap projection + years-to-cap.
  - `/ai-tools/provider-price-checker` — service dropdown (10 services) + rate input → fair/high/low verdict vs network median + 1 Jul 2026 cap.
- New backend public endpoints: `/api/public/decode-statement-text`, `/api/public/decode-statement` (file), `/api/public/budget-calc`, `/api/public/price-check` — each IP-rate-limited.
- Crisis resources surfaced site-wide: 1800 ELDERHelp 1800 353 374, OPAN 1800 700 600, Beyond Blue 1300 22 4636, Lifeline 13 11 14.
- Brand re-skin to navy/gold across both marketing and product.

## Implemented (Iteration 3 — Feb 2026 · routing, plan‑gating, Book‑a‑Demo)
- All 8 AI tool pages now reachable under `/ai-tools/<slug>` (5 newly wired routes); `/features`, `/demo`, `/contact`, `/for-advisors`, `/for-gps` also wired in `App.js`.
- New `/features` page with sticky tab nav (AI Tools · Wedge · Caregiver · Participant · Family · Trust), card grid for every capability, plan‑comparison matrix, dual CTA (`Start free trial` + `Book a demo`).
- Plan‑gating UX: `Free` badge on Statement Decoder + Budget Calculator; `Solo+` badge on the other 6. New `UpgradeGate.jsx` component renders above the form on the 6 Solo+ tools when no user is signed in (visible upsell — endpoints remain public this phase).
- AIToolsIndex no longer shows any "Soon" labels; every card links live.
- `/contact?intent=demo` swaps the simple form for a richer Book‑a‑Demo intake: phone, size, biggest_pain (required), success_in_six_months, preferred_time chips (morning/lunch/afternoon/evening). Default `/contact` keeps the simple form.
- New backend endpoint `POST /api/contact` with `EmailStr` validation; persists to `db.contact_requests`. Returns `{ok, intent}`.
- Inclusive‑language scrub: removed default "Mum" wording from Landing persona blurbs, FAQ, ReassessmentLetter and ContributionEstimator placeholders, Demo digest. Named persona Dorothy retained.
- Master Emergent build prompt v3 saved at `/app/memory/EMERGENT_PROMPT.md` (full spec for Public Tool Wrapper, all 8 tool prompts, plan‑gating ladder, page‑by‑page IA, brand and acceptance criteria).

## Test status
- Iteration 1: 21/21 backend pytest, all frontend flows.
- Iteration 2: 32/32 backend pytest (added 11 public‑tool tests), all marketing + tool + auth flows.
- Iteration 3: 11/11 new backend + full regression on 8 public tool endpoints + cathy login. Frontend: 100% — all routes, plan‑gating, contact intents, role toggle, login regression.

## Implemented (Iteration 4 — Feb 2026 · Wrapper, Email, Plans, Dashboards, Resources)
- **Public Tool Wrapper** (Claude Haiku 4.5 — `claude-haiku-4-5-20251001`) wired in front of every free-text public endpoint: Statement Decoder (text + file), Reassessment Letter, Care Plan Reviewer, Family Coordinator chat. Performs PII redaction (deterministic regex local pass + Haiku LLM extra pass), abuse/distress classification (clinical / financial / distress / manipulation) with short-circuit responses. Defence in depth: never trusts LLM to "un-redact" — always re-runs local regex on whatever Haiku returns. Surfaces `redaction_notice` + `redaction_count` on responses.
- **Resend email service** (`/app/backend/email_service.py`) with graceful no-op fallback. When `RESEND_API_KEY` starts with `re_demo_` / `re_test_` or is absent, sends are logged to stdout and return `{ok:true, mocked:true}`. When a real key is present, emails go live without code change.
- **Two new endpoints**: `POST /api/public/email-result` (email-my-result for the public tools, with HTML‑sanitised body) · contact form now triggers `email_service.notify_team_contact` to ping the team inbox.
- **Tool prompt refactor**: Reassessment Letter, Care Plan Reviewer, Family Coordinator now require gender‑neutral language (no "Mum" default), explicit refusal rules (no provider recommendations, no clinical or financial‑product advice), and source‑grounded answers ("never invent dollar figures, dates, or section numbers"). Family Coordinator tone: "the friendliest, most patient, most well‑informed niece in Australia".
- **`EmailResultButton` component** wired into Statement Decoder + Reassessment Letter (the highest‑intent results). Captures email at the moment of value delivery → fires `/api/public/email-result`.
- **Plan picker on signup** (`/signup`): 3 plans (Free / Solo / Family — Lifetime tier removed entirely). URL parameter support (`/signup?plan=solo`). Plan stored on user (`user.plan`). New `PUT /api/auth/plan` endpoint.
- **Plan‑conditional Caregiver Dashboard**: Free plan sees a paywall card only (FreePlanLimitCard with "Compare plans" CTA) — no household onboarding required for free users. Solo sees stream cards, lifetime cap, alerts, recent statements, AI chat preview, audit log. Family adds family thread preview + Sunday digest hint. Solo plan gets an "upgrade to Family" nudge.
- **`Contact` added to main marketing nav** (desktop + mobile menus).
- **Lifetime tier removed everywhere**: Pricing.jsx (3 columns now), Features.jsx plan matrix (3 columns), all comparison tables and FAQ.
- **In‑app Layout plan badge** chip in the header that links to /pricing for plan changes.
- **Resources hub**: `/resources`, `/resources/glossary` (37 terms with live search), `/resources/templates` (6 templates), `/resources/articles` (10 pillar articles) and `/resources/articles/:slug` (full article view with up‑next nav). Static content registry at `/app/frontend/src/data/resources.js` — editorial team can extend without backend changes.

## Test status
- Iteration 1: 21/21 backend pytest, all frontend flows.
- Iteration 2: 32/32 backend pytest (added 11 public‑tool tests), all marketing + tool + auth flows.
- Iteration 3: 11/11 new backend + full regression. Frontend 100%.
- Iteration 4: 17/18 backend (1 critical wrapper-not-wired bug → fixed in iteration 5). Frontend 100%.
- Iteration 5: 4/4 critical-path backend tests pass after the wrapper fix.

## Implemented (Iteration 6 — Feb 2026 · Resend live, Stripe, Google Auth, enforcement, 7-day trial rename)
- **Resend is LIVE** (key `re_id4ou1R9_…`) — contact-form notifications + `/api/public/email-result` now deliver real email. Resend account is in verified-email-only test mode; all sends go to `a.chiware2@gmail.com`. To send to anyone, verify a sender domain at resend.com.
- **Stripe billing** wired end-to-end with the pod's `STRIPE_API_KEY=sk_test_emergent`. New endpoints: `POST /api/billing/checkout` (creates Stripe Checkout session for the picked plan), `GET /api/billing/status/{session_id}` (idempotent; flips `user.plan` on first `paid` event + fires welcome email), `POST /api/webhook/stripe` (same plan-flip logic via webhook), `BillingSuccess` page polls status for 6 × 2.5s. Frontend `/signup?plan=solo|family` now redirects to Stripe Checkout after account creation; Free plan goes straight to `/app`.
- **Emergent-managed Google sign-in**: new `POST /api/auth/google-session` (exchanges `session_id` with demobackend.emergentagent.com, creates/updates user with `auth_method='google'`, sets httpOnly `session_token` cookie), `POST /api/auth/logout`, `AuthCallback` component with **synchronous hash detection** in `App.js` root (per spec — never hardcode the URL, never add fallbacks), `GoogleSignInButton` on Login + Signup.
- **Billing/status 500 fixed** (iteration_6 bug) — now returns `{status:'unknown', payment_status:'unknown'}` gracefully on any Stripe error instead of crashing.
- **Section 10 — 402 on public AI tools REMOVED** (this resolved the user-facing blocker). All 8 AI tools now open to anonymous visitors, rate-limited at **5 uses per IP per hour** (previously 5 per 30 days). New rate-limit body: `{error:'rate_limit', message:'…Create a free account for unlimited access.'}`.
- **Global axios error interceptor** in `/app/frontend/src/lib/api.js` — 429 → warning toast, 503 → error toast, auth probes (`/auth/me`) pass through silently. No more raw 402 errors surfacing.
- **Trial rename** across site: every `14-day` / `30-day` / `30 days` reference → `7-day` / `7 days` (Landing, Pricing FAQ, Signup, StatementDecoder upgrade CTA, Features hero sub, UpgradeGate).
- **Tool overlines cleaned** — the 6 "Solo+" tools no longer show the paid overline or `UpgradeGate` (since they're now free-tool rate-limited per Section 10). AIToolsIndex shows `FREE` badge on all 8 cards.

## Test status
- Iterations 1–5 covered earlier (see sections above).
- Iteration 6: 18/19 backend + 100% frontend; minor billing/status 500 fixed in this iteration.
- Iteration 7 (this): public tool endpoints now 200 for anonymous; rate-limit body verified.

## Implemented (Iteration 8 — Feb 2026 · Settings suite, Members, Wellbeing, Password reset, Stat cards)
- **Password reset (full flow)**: New `/forgot` and `/reset` pages wired; Signup and Login wire in the new `PasswordStrength` meter (5-rule live validation — 8+ chars, upper/lower/number/symbol, no name/email echo). Login now has a `Forgot password?` link. Backend endpoints `/api/auth/forgot` (enumeration-safe) and `/api/auth/reset` (60-min token, single-use) verified end-to-end with live Resend delivery to the verified inbox.
- **In-app Settings page** (`/settings/:tab`) with 4 tabs:
  - **Profile** — edit display name (client-side only; name field persists on server via existing user model via /auth/plan style update; extend later).
  - **Plan & Billing** — shows current plan card with trial + renewal date, 3 plan options (Free/Solo/Family), one-click Stripe Checkout for upgrades (`POST /billing/checkout`), in-app plan switch for active subs (`POST /billing/upgrade`), and Cancel auto-renewal (`POST /billing/cancel`). Status comes from `GET /billing/subscription`.
  - **Family members** — Family-plan upgrade gate for Solo/Free; full member list with owner synthesised; invite form (email + role [family_member / advisor] + optional note) that emails the invite via Resend and respects the 5-member cap; pending invites section; member removal (primary only). Uses `/household/invite`, `/household/members`, `/household/members/{id}`.
  - **Security** — one-click "send me a reset link" for logged-in users (fires `/auth/forgot`).
- **Invite acceptance flow**: New `/invite?token=…` page fetches invite details via `GET /api/invite/{token}`, supports three states (no account → signup/login CTAs, wrong-email warning, accept CTA) and posts to `POST /api/invite/accept`.
- **Participant wellbeing check-in**: New check-in card on `/participant` with 3 large mood buttons (good / okay / not_great). Once-per-day enforcement: re-visiting shows "you've checked in today" state. `not_great` sets `notify_caregiver=true` and logs an audit event. Uses `POST/GET /api/participant/wellbeing`.
- **Caregiver Dashboard stat cards** (Section 9 opener): 4 quick-glance cards above the stream grid — this-quarter spend, alerts count, statements count (+latest date), lifetime-cap % used.
- **Layout sidebar refresh**: Secondary nav group added with "AI Tools" and "Settings" links, separated by a divider. Plan badge in the header now routes to `/settings/billing` instead of `/pricing` (in-app plan management).
- **Dead code cleanup**: Removed orphan `_require_solo_plus` function + its "14-day" string (last stale-copy reference in the codebase).

## Test status
- Iterations 1–7 covered earlier (see sections above).
- Iteration 8: 15/15 backend pytest pass (1 non-critical skip for household create route test scaffolding) · 100% frontend flows verified (12/12 scoped flows in `/app/backend/tests/test_iter8.py`). Cathy regression flow green. All new endpoints verified healthy. Iter7 regression confirmed fixed (family-coordinator-chat anonymous 200).

## Backlog (P0/P1)
- P0: Wire the **Public Tool Wrapper** (Claude Haiku 4.5) in front of every public tool endpoint — PII redaction, abuse/distress check, route classification. Spec lives in `/app/memory/EMERGENT_PROMPT.md` §4.
- P0: Refactor each public tool prompt to the v2 spec in `EMERGENT_PROMPT.md` §5 (output structure, refusal rules, conversion CTA, inclusive language).
- P0: Resources hub — blog index, glossary, templates library, 10 launch pillar articles.
- P0: Multi-user households (invite siblings as secondary caregivers).
- P0: Real calendar agent (replace mocked appointment).
- P1: Voice frontend agent (Whisper STT + Australian-accent TTS).
- P1: Stripe subscription billing.
- P1: Long-form guides (Family Caregiver Handbook etc.) gated by email.
- P1: Email nurture sequences (Customer.io / Resend).
- P2: Provider directory + comparison + 6 long-form guides.
- P2: White-label advisor portal.
- P2: Open banking ingest.
- P2: Webinar infrastructure + multilingual content.

## Production hardening (deferred)
- Move `RATE_LIMIT_BUCKET` from in-memory to Redis (multi-worker safe).
- Move `PRICE_BENCHMARKS` from inline dict to DB collection.
- Split `server.py` into routers (auth/household/statements/budget/chat/family/audit/participant/public).
- 32-byte JWT secret, SOC 2 readiness, annual pen test.

## Test status
- Iteration 1: 21/21 backend pytest, all frontend flows passing.
- Iteration 2: 32/32 backend pytest (added 11 public-tool tests), all marketing + tool + auth flows passing, zero JS errors.

## MOCKED items
- Landing social proof counters (2,847 households / 127 advisor practices / $2.4M flagged) — STATIC.
- `PRICE_BENCHMARKS` — hard-coded medians for 10 services (real medians come from accumulated user data).
- `/api/participant/today` appointment — static Sarah-at-10am sample.
