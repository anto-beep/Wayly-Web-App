# Wayly — Full System Overview (Web ⇄ Mobile parity reference)

Purpose: single source of truth for the mobile agent to replicate the web app (aged-care-os) faithfully. Wayly helps Australian families understand and manage **Support at Home** (SaH) aged care: decoding statements/invoices, budgets, classifications, contributions, care coordination, letters, and provider management. Backend is shared (FastAPI + MongoDB); web (`/app/frontend`, React) and mobile (`/app/mobile`, Expo) are two clients on the same `/api`.

Brand: fonts Fraunces (headings), Inter (body), IBM Plex (mono). Palette lives in `/app/mobile/src/theme/tokens.ts` (light + dark). Key colours: primary/teal (#0E2A47 deep navy-teal family), sage (soft green accent), gold (#E89A6F warm accent), terracotta (#E07A5F, errors/CTA in dark), plus surface/surface2/border/muted per theme. AI copy rule everywhere: friendly expert tone, **no dashes or em dashes**, punctuation limited to commas/periods/semicolons (mobile enforces via `sanitizeAI`).

---

## 1. Personas / Roles
Three personas (same keys web + mobile):
- **caregiver** — a family member/support person managing care for someone else (the participant). Most common. Sees care-recipient's data.
- **care_recipient** / **participant_self** — the older person receiving SaH, managing their own account.
- **adviser** — an aged-care specialist adviser managing multiple clients (client export, audit trail, branded reports). Separate Adviser plan.

Persona is chosen at signup and drives onboarding branching and copy. On mobile, `useAuth().user.role` and the active participant come from `useParticipants()` (activeId/active). Keep persona keys identical to web: `caregiver`, `care_recipient`, `adviser`.

## 2. Participants & switching
- A caregiver account can track multiple **participants** (the people receiving care). Family plan = up to 4 participants; Solo = 1.
- Active participant is selected via a participant switcher; `apiFetch` sends `X-Participant-Id`. Mobile stores active id under `wayly_active_participant` (see `src/lib/api.ts`, `ParticipantContext`).
- Household "seats": primary caregiver + up to 4 invitees = 5 total (see `backend/constants.py`). Family plan shares 3 Family seats and the full feature set across participants.

## 3. Plans, pricing, gating (Plan & Billing)
Billing is **fortnightly**, AUD incl GST, **card required at signup**, **7-day free trial** on Solo/Family. Plans (`PAID_PLANS = {solo, family, adviser}`; plus a **free** tier):
- **Free** — limited/gated; used after trial expiry or downgrade. Many tools gated behind paid.
- **Solo — $24.50/fortnight** — 1 caregiver seat, 1 participant; all AI tools; unlimited Statement Decoder.
- **Family — $49.50/fortnight** — up to 4 participants; everything in Solo; Family Wall (shared updates/notes); Sunday weekly digest emails; audit log; household coordination; shared caregiver seats.
- **Adviser** — for specialist advisers; client export, audit trail, branded reports.

Gating logic (backend): endpoints check `plan`/`subscription_status`; free/trial-expired users hit `upgrade`/`gated` responses (e.g. public AI tools return "Sign in required"/403 for Free). Trial states: `start-trial`, `trial-eligibility`, `trial_expired`.

Billing/Stripe endpoints (all `/api` prefixed):
- `POST /billing/checkout` (Stripe Checkout session for a plan), `GET /billing/status/{session_id}`, `GET /billing/subscription`, `POST /billing/upgrade`, `POST /billing/cancel`, `POST /billing/start-trial`, `GET /billing/trial-eligibility`, `POST /billing/downgrade-to-free`.
- Add-ons v2: `POST /billing/v2/upgrade-checkout`, `POST /billing/v2/addon-checkout`, `POST /billing/v2/cancel-pending-addon`.
- Portal: `GET/POST /portal` (Stripe billing portal), payments export `/export/payments.csv`, `/payments`, `/failed-payments`.
- Web signup redirects to Stripe Checkout. **Mobile** should collect the card via a **Stripe SetupIntent** (save card, no charge) — see section 6.

## 4. Onboarding flow (web) — replicate exactly on mobile
After signup, web routes through `OnboardingRouter.jsx` + `Onboarding.jsx` with a participant selector (Family plan can complete multiple participants; "Add second participant" prompt after finishing #1). Steps (`pages/onboarding/steps`):
1. **StepEssentials** — first name, last name, DOB (`onboarding-dob`), current provider (placeholder "e.g. BlueBerry Care"). testIDs: `onboarding-first-name/last-name/dob/provider`, continue `onboarding-step1-continue`.
2. **StepRecommended** — preferred name (optional), My Aged Care reference / Client ID, classification (Select…), contribution/means info (Select…), caregiver's relationship to participant (Select…), caregiver phone.
3. **StepAuthorisation** — "Confirm authorisation" (caregiver confirms they're authorised to act for the participant).
4. **StepAllDone** — completion screen.
Family branch: selector doubles as "who still needs details" and "Add second participant" (`onboarding-add-second`). Persona drives which fields/copy show (caregiver vs care_recipient vs adviser).

## 5. Signup (web) fields & validation — mobile now matches
- Persona/role toggle; caregiver adds care-recipient name; Family plan can flag a second participant.
- first name, last name, email, password, optional mobile (AU format: `04XXXXXXXX` or `+614XXXXXXXX`).
- Password rules (web `PasswordStrength.jsx`, mobile replicated): 8+ chars, uppercase, lowercase, number, symbol, and must NOT contain the user's name or email.
- Plan pre-select via `?plan=solo|family`.

## 6. Stripe on mobile (SetupIntent card-save) — build target
- Use the **Stripe TEST key already in the pod environment** (never ask user). Route implementation through `integration_expert`.
- Flow: user picks plan → show "you selected X plan" summary → collect card (number, expiry, CVV) → create **SetupIntent** server-side and confirm client-side to **save the card to the Stripe customer with NO charge** → reassuring copy: "Your card is saved securely. You will only be charged when your plan begins."
- Errors (friendly, NO dashes): invalid card number, expired card, declined save.
- CONSTRAINT: `@stripe/stripe-react-native` card field needs a NATIVE build; not testable in Expo Go / web preview. Verify after Publish.

## 7. AI Tools (9) — each has intro + "What This Tool Does" + "How It Works" + What You'll Need/Get + Common Questions (content in `mobile/src/data/toolContent.ts`, verbatim from web `data/toolContent.js`). Interactive 6 + 3 launchers:
Interactive (form + AI result, endpoints under `/api/public/...`, auth-gated): **Budget & Lifetime Cap Calculator** (`budget-calc`), **Provider Price Checker** (`price-check`), **Classification Self-Check** (`classification-check`), **Letters & Follow-ups** (`reassessment-letter`; has abuse/clinical guardrail response), **Contribution Estimator** (`contribution-estimator`), **Support Plan Reviewer** (`care-plan-review`).
Launchers (page = explainer + "Open …" button, kept SEPARATE per user): **Statement Decoder** (→ Statements; upload monthly statement PDF/photo), **Invoice Checker** (→ Invoices; upload the separate contribution invoice — MUST stay a distinct tool/upload from Statement Decoder), **Aged Care Q&A** (`family-coordinator` → Ask chat).
AI tone rule enforced via `sanitizeAI`. Statement Decoder uses SSE live-decode.

## 8. Statements & Invoices (separate)
- Statements: list, detail (overview, AI insight, anomalies, streams breakdown), **Downloads & records** (original file, decoded CSV, decoded PDF), **Audit Log** (`/statement-audit/{id}`), **Compare** (`/statement-compare/{id}`). Endpoints `/statements`, `/statements/{id}`, `/statements/{id}/download|decoded.csv|decoded.pdf|audit-log`. Upload flow: multi-part, camera/photo pickers.
- Invoices: separate tool/screen and upload flow (contribution invoice). Do NOT merge with statements.

## 9. Their Care category (mobile: all built)
Care Team + Key Contacts (`/participants/{pid}/contacts`), Calendar (`/fc2/participants/{pid}/calendar`), Hospital Mode (`/hospital/admissions` + request-rcp/discharge), Care Plans (`/care-plans`), Care-Plan Changes/amendments (`/amendments/generate`, needs sender_name), Log a Scenario (`/scenario/participants/{pid}/events` + `/scenario/event-types`), Timeline (`/core/participants/{pid}/timeline`).

## 10. Guided Journeys category (mobile: all built)
Guided Journeys hub (`/journeys/current`), Carer Self-Check (`/cs1/assessments` with burnout self-report), Handover Pack (`/cs1/handover-packs` + export.pdf), Classification Prep (info), AT & HM Projects (`/athm`), CHSP Tools (info), Letters Mailbox (`/lf1/correspondence` + `/lf1/follow-ups`), Switch Provider (`/psw1/participants/{pid}/switches`).

## 11. Providers & Paperwork category
Documents (`/documents` + `/documents/{id}/download`), Correspondence (`/lf1/correspondence`), Compare Providers (aggregate of `/provider-ratings`; web also has `/ppc3` provider-comparison + `/providers/{name}/star-ratings` + quality-profile), Ratings (`/provider-ratings` GET/POST/DELETE).

## 12. Your Account category (Settings)
Web tabs: Profile (name/email/phone/role), **Plan & Billing** (current plan, status, trial end, invoices, upgrade/cancel/downgrade, Stripe portal), Family Members (members list + invites/seats), Weekly Digest toggle, Notifications (5 prefs: anomaly_alerts, wellbeing_concerns, family_messages, weekly_digest, product_updates via `/notifications/prefs`), Appearance (light/dark), Usage, Security (TOTP/2FA), Danger Zone (delete account). Mobile Settings has Account/Notifications/Privacy/Appearance/Plan/Logout; STILL TO ADD full parity: Plan & Billing detail + logic, Family Members + invites, Weekly Digest, Security, Danger Zone.

## 13. Other features
Dashboard (wellbeing summary, quarterly pacing, stream breakdowns, budget snapshot), Money screens (Pacing, Budget Alerts, Budget Scenarios `/bc2`, Reports), Family Wall (family_messages), Ask Wayly chat (SSE). Data models: `db.users, households, participants, statements, timeline_events, family_messages, scenarios, care_plans, contacts, athm, provider_ratings`.

## 14. Mobile status snapshot (Jun 2026)
Built & tested: auth (branding + validation), dashboard, statements (+depth), 9 AI tools, Their Care (all), Guided Journeys (all), Providers & Paperwork (all), Settings (partial). Scroll-to-top on tabs. Header titles wrap. NOT yet: full onboarding steps replication, plan selection + Stripe SetupIntent, Family Members/Plan&Billing detail in Settings, full per-screen visual light/dark audit vs web.
