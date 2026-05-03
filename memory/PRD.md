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
