# Wayly — Backend & Design Handoff for the Mobile Agent

> Goal: give the mobile app **exact parity** with the web app. This documents the shared FastAPI backend (every caregiver-facing endpoint), what each screen shows and calls, the data contracts, and the **exact colour system** (web ↔ mobile mirror) down to per-element usage.
>
> Source of truth for colour/type: `/app/frontend/tailwind.config.js`, `/app/frontend/src/index.css`, `/app/docs/wayly-design-system.md`, and the mobile mirror `/app/mobile/src/theme/tokens.ts`. **Never hard-code hex in components — always read from `useTheme()` on mobile / tokens on web.**

---

## 0. Product in one line
Wayly helps Australian family caregivers understand and manage a loved one's **Support at Home** (aged care) package: decode provider statements, track budgets & quarterly pacing, check invoices/prices, generate letters, coordinate family, and store documents — with AI assist. Mobile is the **caregiver** surface (not admin/adviser).

---

## 1. Architecture & environment
- **Backend**: FastAPI + MongoDB (Motor). All routes prefixed `/api`. ~120 route modules, ~580 endpoints. Entry `server.py` mounts every router (`api.include_router(...)`).
- **Web**: React (CRA) at `/app/frontend`. **Mobile**: Expo Router at `/app/mobile`.
- **URLs** (env only, never hard-code):
  - Mobile API base: `process.env.EXPO_PUBLIC_BACKEND_URL` → call `${EXPO_PUBLIC_BACKEND_URL}/api/...`.
  - Web: `process.env.REACT_APP_BACKEND_URL` + `/api`.
- **Money**: server returns AUD. Use tabular/mono figures. Support at Home quarterly budgets are the core numbers.

---

## 2. Auth & request conventions (shared contract)
Mobile client: `/app/mobile/src/lib/api.ts` (`apiFetch`). Mirrors the web axios interceptor.

**Every authenticated request sends:**
- `Authorization: Bearer <access_token>`
- `X-Participant-Id: <active participant id>` — the backend scopes household data to the active participant. Mobile stores it in `ACTIVE_PARTICIPANT_KEY` (`wayly_active_participant_id`). **Always set/refresh this after onboarding or participant switch** or list endpoints return the wrong participant's data.

**Token storage keys** (must match web semantics): `kindred_token` (access), `kindred_refresh_token` (refresh). SecureStore on native.

**Endpoints:**
| Method · Path | Body | Returns |
|---|---|---|
| `POST /api/auth/login` | `{email, password, code?}` | `{token, refresh_token, user}` — `code` = MFA 6-digit when `totp_enabled`. On MFA-required, backend returns a challenge (`mfa_required`). |
| `POST /api/auth/signup` | `{email, password, name/first_name/last_name}` | `{token, refresh_token, user}` — new user has `household_id=null`. |
| `POST /api/auth/refresh` | `{refresh_token}` | `{token, refresh_token?}` |
| `POST /api/auth/google-session` | `{ ...session }` | `{token, refresh_token, user}` (Emergent Google) |
| `GET /api/auth/me` | — | `UserPublic` (see §4). Call after any profile/plan/household change. |
| `POST /api/auth/forgot` | `{email}` | `{ok}` — sends reset link. **No auth.** |
| `POST /api/auth/mfa/setup` | `{}` | `{setup_token, qr_data_uri, secret}` |
| `POST /api/auth/mfa/enable` | `{setup_token, code}` | `{ok, backup_codes[]}` |
| `POST /api/auth/mfa/disable` | `{password, code?}` | `{ok}` |
| `POST /api/auth/email/change-request` | `{new_email, password}` | `{ok/mocked}` — verification link to new email |
| `GET /api/auth/email/change-status` | — | `{pending, new_email?, expires_at?}` |
| `DELETE /api/auth/email/change-request` | — | cancel pending change |
| `DELETE /api/auth/account` | `{confirm:"delete my account"}` | anonymises + cancels plan (60-day purge) |
| `GET /api/auth/account/export` | — | data export |

**AUTH RULE (both platforms):** any auth change must go through the integration playbook. Never invent hashing/JWT logic. Test creds in `/app/memory/test_credentials.md`.

---

## 3. Plan / billing / trial (mobile-relevant)
> **Canonical flow is card-at-signup via Stripe Checkout — see §12 & §13.** The table below documents all billing endpoints; the primary path new users take is `POST /api/payments/checkout` (card captured, 7-day trial), NOT the legacy no-card `/api/billing/start-trial`.
| Method · Path | Body | Returns / Notes |
|---|---|---|
| `GET /api/billing/subscription` | — | `{plan, status, trial_ends_at?, current_period_end?, cancel_at_period_end}` or `{plan:"free",status:"none"}` |
| `GET /api/billing/trial-eligibility` | — | `{eligible:bool, trial_days:7}` |
| `POST /api/billing/start-trial` | `{plan:"solo"|"family"}` | Starts 7-day trial, **no card**. Sets `users.plan`, `subscriptions.status="trialing"`, `trial_ends_at=now+7d`. |
| `POST /api/billing/checkout` | `{plan, origin_url}` | `{url, session_id, trial_days}` → open `url` in browser (Stripe hosted Checkout). |
| `GET /api/billing/status/{session_id}` | — | poll after checkout |
| `POST /api/billing/cancel` | — | cancel at period end |
| `POST /api/portal` | `{origin_url}` | `{url}` → Stripe billing portal (manage card / invoices / cancel). Open in browser. |
| `GET /api/usage` | — | `{plan, counts:{...}}` activity counters |

`PLAN_PRICES` (backend, monthly base): solo $19, family $39, adviser $299 AUD. **Web/mobile display fortnightly**: Solo **$24.50/fortnight**, Family **$49.50/fortnight**. Trial = 7 days, no card. `TRIAL_DAYS=7`.

**Card entry**: handled by **Stripe hosted Checkout / portal in the browser** (store-safe, matches web). Do NOT build a native card field (SetupIntent) unless doing a dev build + App Store IAP review — intentionally deferred.

**Household / family (Family plan):**
| `GET /api/household` · `GET /api/household/members` | — | `{members:[{user_id,email,name,role,status,joined_at}], invites:[{token,email,role,expires_at}]}` |
| `POST /api/household/invite` | `{email, role:"family_member"|"advisor", note?}` | 402 if not Family plan, 400 if seat limit |
| `DELETE /api/household/members/{member_user_id}` | — | owner only |

**Weekly digest (Family):** `GET /api/digest/preview`, `GET /api/digest/history`, `POST /api/digest/send`. Preview shape: `{household_name, caregiver_first_name, week_label, wellbeing:{counts:{good,okay,not_great}, total}, anomalies:{count, new_spend, statements_uploaded, top:[{severity,title,detail,period}]}, family_thread_recent:[{author,body}], chat_questions_asked}`.

---

## 4. Core data models
**UserPublic (`/auth/me`)**: `id, email, name, first_name, last_name, role, plan ("free"|"solo"|"family"|"adviser"), household_id, totp_enabled, mobile, created_at`. `household_id=null` ⇒ route to onboarding.

**Participant v2** (`participant_profile.py`): created via `POST /api/participants`.
- Tier 1 (required): `first_name, last_name, dob (YYYY-MM-DD), pension_status (full_pension|part_pension|cshc|self_funded|unsure), classification_level (1–8), provider_name, statement_delivery (email|post|portal|other), authorisation_confirmed (true)`.
- Tier 2 (optional, `PATCH /api/participants/{id}`): `preferred_name, mac_reference_number, suburb, state, is_grandfathered_hcp (yes|no|unsure), hcp_level (1–4), caregiver_relationship, caregiver_phone`.
- Response includes `id`, `profile_completeness_pct`. Creating the first participant **auto-provisions the household** (sets `user.household_id`).
- v2 list: `GET /api/v2/participants?include_removed=true`, `POST /api/v2/participants`, `POST /api/v2/participants/{id}/restore|hard-delete`, `POST /api/v2/participants/preview?count=N`.

**Classifications reference**: `GET /api/program-reference/public` → `{as_of, classifications:{"1":{annual, label}, … "8":{…}}}`. Use for annual $ per class (e.g. class 8 = $78,106/yr).

**Statement**: `{id, participant_id, period, provider_name, status (accepted|superseded|archived), totals:{...}, line_items:[...], created_at}`. Immutable **audit log** per statement.

**Invoice**: `{id, participant_id, provider, total, line_items[], status, created_at}`.

**Subscription**: `{plan, status, had_trial, trial_ends_at, current_period_end, cancel_at_period_end}`.

---

## 5. Screen-by-screen map (caregiver surface)
For each: **what it shows** + **endpoints**. Mobile route already exists in most cases (see `/app/mobile/app/`). Match the web response shapes exactly.

### Dashboard — `mobile app/(tabs)/index.tsx` ↔ web `CaregiverDashboard.jsx`
Shows greeting + this-quarter budget burn, recent statements, nudges, family thread peek, audit peek.
`GET /api/budget/current`, `GET /api/budget/eligible-pathways`, `GET /api/statements`, `GET /api/nudges` + `POST /api/nudges/{key}/dismiss`, `GET /api/family-thread`, `GET /api/audit-log`, `GET /api/chat/history`.

### Statements — `statements.tsx`, `statement/[id].tsx`, `statement-compare/[id].tsx`, `statement-audit/[id].tsx`, `upload.tsx`
- List: `GET /api/statements`, `GET /api/statements/archived`.
- Upload (chunked/async job): `POST /api/statements/upload` → `GET /api/statements/upload-job/{jobId}` (poll).
- Detail: `GET /api/statements/{id}`, `GET /api/statements/{id}/download`, `PATCH /api/statements/{id}/note`, archive `DELETE /api/statements/{id}/archive` (`?preview=true` first), restore `POST /api/statements/{id}/restore`, permanent `DELETE /api/statements/{id}/permanent`, reconcile `POST /api/qp1/reconciliations/from-statement`.
- Compare: `GET /api/statements/{id}` (both) + `/download`.
- Audit log: `GET /api/statements/{id}/audit-log`.
- Pair review (SD3): `GET /api/sd3/pairs/{pairId}`, `PATCH /api/sd3/candidates/{id}`, `POST /api/sd3/candidates/{id}/draft-letter`.
- Recent line items: `GET /api/statements/recent-line-items`.

### Quarterly Pacing / Budget — `pacing.tsx`, `budget-alerts.tsx`, `budget-scenarios.tsx`
`GET /api/qp1/pacing{?quarter}`, `GET /api/qp1/pacing/history`, `GET /api/qp1/ledger?participant_id=`, `GET /api/qp1/schedules?participant_id=`, `POST /api/qp1/schedules`, `DELETE /api/qp1/schedules/{id}`, `POST /api/qp1/ledger/ad_hoc`, `POST /api/qp1/reconciliations`, `POST /api/qp1/reconciliations/from-statement`.

### Contribution position (CE3) — `participants.tsx` detail / `ContributionPosition.jsx`
`GET /api/ce3/participants/{id}/annual-projection`, `/lifetime-cap` (+`POST /lifetime-cap/refresh`), `/reconciliations?months_back=12` (+`POST /reconciliations/reconcile`), `/hardship/triggers?only_open=true`, `POST /ce3/participants/{id}/pension-change/preview|commit`, `GET /api/core/participants/{id}`.

### Invoices — `invoices.tsx`, `invoice/[id].tsx`
`GET /api/invoices`, `GET /api/invoices/{id}`, `DELETE /api/invoices/{id}`, `POST /api/invoices/{id}/save-to-vault`. Invoice checker tool: `POST /api/invoices/upload`, `POST /api/invoices/{id}/reconcile-combined`, `POST /api/invoices/{id}/situation`.

### Ask Wayly (AW2 chat) — `(tabs)/ask.tsx` ↔ `AskWaylyV2.jsx`
`GET /api/aw2/context`, `POST /api/aw2/conversations`, `POST /api/aw2/conversations/{cid}/messages` (SSE stream — see `src/lib/sse.ts`), `POST /api/aw2/conversations/{cid}/feedback`, `POST /api/aw2/context/consent`, `PATCH /api/aw2/context/retention-policy`. Legacy chat: `GET/POST/DELETE /api/chat`, `/chat/history`. **Always pass a session/conversation id** for multi-turn.

### Family — `(tabs)/family.tsx` (Family Thread) & `FamilyWall.jsx`
Thread: `GET /api/family-thread`, `POST /api/family-thread`. Wall: `GET /api/wall/posts?participant_id=`, `POST /api/wall/posts`, `POST /api/wall/posts/{id}/react`, `DELETE /api/wall/posts/{id}`.

### Documents Vault — `documents.tsx`
`GET /api/documents`, `POST /api/documents` (upload), `GET /api/documents/{id}/download`, `PATCH /api/documents/{id}`, `DELETE /api/documents/{id}`, `POST /api/documents/{id}/send-to-decoder`.

### Journeys (guided) — `journeys.tsx`
`GET /api/journeys/current(?include_completed=1)`, `POST /api/journeys`, `PUT /api/journeys/{id}/steps/{step}`, `PUT /api/journeys/{id}/persona`, `POST /api/journeys/{id}/complete|skip`, `GET /api/journeys/{id}/pdf`.

### AI Tools — `(tabs)/ai-tools.tsx`, `tool/[slug].tsx`, `decode/[id].tsx`
- Statement Decoder: `POST /api/public/decode-statement` / `decode-statement-text` → `GET /api/public/decode-job/{jobId}`; usage `GET /api/free-tool/usage?tool=STATEMENT_DECODER`.
- Budget Calculator: `POST /api/public/budget-calc`.
- Price Checker (PPC): `POST /api/public/price-check-v2`; history `GET /api/ppc/checks(/history)`, `GET /api/ppc/services`, `GET /api/ppc/snapshots`, `GET /api/ppc/milestones` + `POST /mark`, `GET /api/ppc3/providers/{provider}/quality-profile`, `POST /api/ppc3/provider-comparison`.
- Classification self-check (CSC): `GET /api/public/csc/iat-domains`, `POST /api/public/csc/run`, `POST /api/public/csc/pdf`, `POST /api/public/csc/email`.
- Care-plan reviewer (CPR): `POST /api/public/care-plans/review(-files)`, authed `POST /api/care-plans/upload(-files)`.
- Reassessment letter: `POST /api/public/reassessment-letter` (+ `GET /api/public/csc/run/{runId}`).
- Family coordinator / aged-care Q&A: `POST /api/public/aged-care-chat`.

### Letters & correspondence (LF1/LF2) — `correspondence.tsx`, `letters.tsx`
`GET /api/lf1/correspondence`, `GET /api/lf1/follow-ups`, `GET /api/lf1/situations`, `GET /api/lf1/safety`, `POST /api/lf1/correspondence` (+ `/{id}/escalate`, `/{id}/pdf`, `/{id}/autosave`, `PATCH /{id}`, `DELETE /{id}`), `GET /api/lf1/cross-tool-signals`. LF2 chains: `GET /api/lf2/participants/{pid}/chains`, `PATCH /api/lf2/drafts/{id}`, `POST /api/lf2/drafts/{id}/send`.

### Provider switch / ratings / comparison — `provider-switch.tsx`, `ratings.tsx`, `compare-providers.tsx`
PSW1: `GET /api/psw1/participants/{pid}/switches`, `GET /api/psw1/switches/{sid}(/context-snapshot)`, `POST /api/psw1/participants/{pid}/switches`, `POST /api/psw1/switches/{sid}/decision-walkthrough`. PDF notice: `POST /api/provider-switch/notice.pdf`.

### ATHM tracker — `athm.tsx`: `POST /api/athm/{id}/files`, `GET/DELETE /api/athm/{id}/files/{attId}`.
### Care plans — `care-plans.tsx`: `GET /api/care-plans(/archived/list)`, `GET /api/care-plans/{id}(/artefact.pdf)(/follow-up-email)`, `POST /api/care-plans/{id}/analyse|restore`, `PATCH /api/care-plans/{id}/notes`, `DELETE`, compare `GET /api/care-plans/compare/{l}/{r}`, goals `GET /api/cpr2/participants/{pid}/goals`.
### Amendments — `amendments.tsx`: `GET /api/amendments`, `POST /api/amendments/generate`, `POST /api/amendments/{id}/status`.
### Hospital liaison — `hospital.tsx`: `GET/POST /api/hospital/admissions`, `POST /api/hospital/admissions/{id}/discharge|request-rcp`.
### Scenario capture / timeline — `scenarios.tsx`, `timeline.tsx`: `GET /api/scenario/event-types`, `GET /api/scenario/participants/{id}/events|state|timeline|alerts`, `POST /api/scenario/participants/{id}/events`, `GET /api/account`.
### Reports — `reports.tsx`: `GET /api/reports?participant_id=`, `POST /api/reports/generate`, `GET /api/reports/{id}(/data)(/download)`, `DELETE /api/reports/{id}`.
### Handover pack (CS1) — `handover-pack.tsx`: `GET/POST /api/cs1/handover-packs`, `PATCH /api/cs1/handover-packs/{id}`, `GET /api/cs1/handover-packs/{id}/export.pdf`, contacts `GET/POST /api/participants/{pid}/contacts`.
### Cases (Loop) — `ParticipantCases.jsx`/`CaseDetail.jsx`: `GET /api/loop/cases?participant_id=`, `POST /api/loop/cases/scan`, `GET /api/loop/cases/{cid}(/assignee-candidates)`, `PATCH`, `POST /api/loop/cases/{cid}/events`, `GET /api/loop/patterns` + `/{caseType}/dismiss`.
### Notifications — `NotificationSettings.jsx` ↔ mobile settings: `GET/PATCH /api/lca1/preferences`.
### Support — `MySupport.jsx`: `GET /api/support/tickets`, `/{id}`, `POST /messages|attachments|close|reopen|csat`, `PATCH`.
### Participant view (the cared-for person's simple screen) — `ParticipantView.jsx`: `GET /api/participant/today`, `GET/POST /api/participant/wellbeing`, `POST /api/participant/concern`.

### Settings (mobile complete) — hub `(tabs)/settings.tsx` → `profile-edit`, `family-members`, `weekly-digest`, `security`, `usage`, `danger-zone`, `plan-billing`, `plan-select`. Onboarding wizard `onboarding.tsx`. (Built this session — see CHANGELOG.)

---

## 6. DESIGN SYSTEM — exact colours (web ↔ mobile mirror)
Strategy: **Warmth over polish · Clarity over cleverness · Calm over urgent · Dignity over pity.** Teal-ink / sage / clay on warm off-white. NOT medical blue.

### 6.1 Canonical palette (LIGHT)
| Role | Hex | Web token | Mobile token (`colors.*`) | Used for |
|---|---|---|---|---|
| App background | `#FBF8F3` | `wayly-neutral-50` / `--kindred-bg` | `bg` | Screen background (warm off-white) |
| Card surface | `#FFFFFF` | `wayly-neutral-0` | `surface` | Cards, sheets, headers |
| Sunken / inset | `#F4EFE7` | `wayly-neutral-100` | `surface2` | Chips, code blocks, list wells, secondary cards |
| Deeper sunken | `#F1EADD` | — | `sunken` | Progress track backgrounds |
| **Primary (brand)** | `#0E4D52` | `wayly-teal-600` / `--kindred-primary` | `primary` | Headings accents, icons, primary buttons, active states, links |
| Primary hover | `#0A3E42` | `wayly-teal-700` | (darken) | Button hover (web) |
| Primary active | `#072E31` | `wayly-teal-800` | — | Button pressed (web) |
| Primary text-on | `#FFFFFF` | — | `primaryFg` | Text/icon on teal fill |
| CTA fill | `#0E4D52` (light) | teal-600 | `cta` | Primary button background |
| **Accent — clay fill** | `#A5512B` | `wayly-clay-500` | `gold` | Single most-important CTA, badges, highlight accents (AA white text) |
| Accent soft | `#F3E7DE` | `clay-50`-ish | `goldSoft` | Clay badge/pill background wash |
| Focus ring | `#C2683D` | `wayly-clay-400` / `--ring` | (use `gold`) | 3px focus ring, 2px offset (never blue) |
| **Sage (secondary)** | `#425F47` | `wayly-sage-600` | `sage` | Reassuring accents, success-ish icons, secondary emphasis text |
| Sage 400 | `#6B8F71` | `wayly-sage-400` | `sage400` | Softer sage icon/detail |
| Sage soft wash | `#EEF3EE` | `sage-50` | `sageSoft` | Selected option background, info callouts, gentle banners |
| Body text | `#1C2B2D` | `wayly-neutral-900` / `--kindred-text` | `text` | Primary text (warm ink, AAA) |
| Secondary text | `#524B42` | `wayly-neutral-700` | `textSecondary` | Sub-labels |
| Muted text | `#524B42` | `wayly-neutral-700` / `--kindred-muted` | `muted` | Captions, hints, placeholders |
| Border | `#E7E0D5` | `wayly-neutral-200` / `--kindred-border` | `border` | Card/input borders, dividers |
| Error / terracotta | `#C0392B` | `wayly-error` / `--kindred-terracotta` | `terracotta` | Errors, destructive, danger zone |
| Error soft | `#FBE6E4` | `error-light` | `errorSoft` | Error banner background |
| Success | `#1B5733` (text) / `#2E7D4F` (base) | `success(-dark)` | `success` | Success text/badges |
| Success soft | `#E4F0E8` | `success-light` | `successSoft` | Success banner background |
| Warning / alert | `#B7791F` | `warning(-dark)` | `alert` | Warnings, "pending", trial-ending amber |
| Warning soft | `#FBEFD8` | `warning-light` | `alertSoft` | Warning banner background |
| Overlay | `rgba(14,77,82,0.45)` | — | `overlay` | Modal scrim |

### 6.2 Canonical palette (DARK) — mobile `darkColors`, web `html.theme-dark`
Near-black slightly-teal bg; **white body text** (per user request for full readability).
| Role | Hex |
|---|---|
| bg | `#0B1416` · surface `#152425` · surface2 `#1C2F31` · sunken `#060B0C` |
| primary (teal-400) | `#4FA8AE` (brighter for AAA on dark) |
| cta | `#A5512B` (clay — CTA switches to clay on dark) |
| gold | `#E89A6F` · goldSoft `rgba(232,154,111,0.16)` |
| sage | `#A8C7AB` · sageSoft `rgba(168,199,171,0.12)` |
| text | `#FFFFFF` · textSecondary `#E5E5E5` · muted `#C7C2B8` |
| border | `#2A3A3C` |
| terracotta | `#F0857A` · errorSoft `rgba(240,133,122,0.14)` |
| success | `#7FC8A0` · alert `#E8B45F` |
| overlay | `rgba(0,0,0,0.62)` |

> **Key dark-mode differences to honour on mobile:** primary shifts teal-600→teal-400 (`#4FA8AE`); CTA shifts teal→clay (`#A5512B`); body text is pure white; borders go dark slate. All handled automatically if you read `useTheme().colors` — never hard-code.

### 6.3 Per-element colour conventions (apply on every screen)
- **AppHeader**: `surface` background, `border` bottom hairline, title `text` (Playfair), subtitle `muted`, back chevron `primary`.
- **Card** (`.card-spec` / mobile `Card`): `surface` bg, `border` 1px, radius 16 (`rounded-card`), shadow-card. Highlighted card: 2px `primary` border. Danger card: 2px `terracotta` border.
- **Primary Button**: bg `cta`, text `primaryFg`, radius 10 (input). **Secondary/Outline**: transparent bg, 1.5px `primary` border, `primary` text. **Ghost**: `primary` text only.
- **Badge tones**: brand→`primary`/`goldSoft`; success→`success`/`successSoft`; alert→`alert`/`alertSoft`; error→`terracotta`/`errorSoft`; neutral→`muted`/`surface2`.
- **Labels** (`T variant="label"`): uppercase, `muted`, letter-spacing 0.4, 13px semibold. **Money**: mono font, `text` (or `primary` for emphasis).
- **Selected option / radio-card**: `sageSoft` bg + `primary` border. **Inputs**: `surface`/transparent bg, `border` 1.5px, focus → `primary` border + clay ring; label always visible above field.
- **Success/positive numbers** → `success`; **over-budget / anomalies / errors** → `terracotta`; **pending/warning** → `alert`.
- **Icons**: brand icons `primary`; destructive `terracotta`; on sage/teal fills use white.

### 6.4 Typography
- Web: **Fraunces** (serif headings h1–h4), **Inter** (body/UI), **IBM Plex Mono** (money/tables).
- Mobile (`fonts` in tokens.ts): headings **PlayfairDisplay** (`heading`/`headingSemi`), body **IBM Plex Sans** (`body`/`bodyMedium`/`bodySemi`/`bodyBold`), money **IBM Plex Mono**. (Playfair is the mobile stand-in for Fraunces — keep.)
- Never render body text < 16px. Line-height 1.6 body.

### 6.5 Spacing / radii / motion
- Spacing (mobile `spacing`): xs 4 · sm 8 · md 16 · lg 24 · xl 32 · xxl 48. Card padding 24 (20 mobile). Give **2–3× more whitespace** than feels natural.
- Radii (mobile `radius`): sm 8 · md 12 · lg 18 · xl 26 · pill 999. Cards 16, buttons/inputs 10, pills full.
- Touch targets: mobile primary **56px**, participant view **60px**, min 44×44 everywhere.
- Motion: easing `cubic-bezier(0.2,0,0,1)`; 150ms hover, 200–250ms state, 300ms modal; respect reduced-motion. Mobile: `react-native-reanimated`.

### 6.6 Do NOT
Pure black on pure white; sans-serif everywhere (keep serif headings); generic medical/corporate blue; competitor palettes; 3D illustration or stock "hand on shoulder" elderly photos; emoji as icons (use `@expo/vector-icons`/`lucide-react-native`); gradients beyond one subtle brand wash.

---

## 7. Data states (every screen)
Loading → skeleton/`Loading`. Empty → `StatePanel` with icon + message + primary action. Error → friendly message + retry. Family-gated features → upgrade card with CTA to `/plan-select`.

---

## 8. Parity checklist for the mobile agent
1. Read colour from `useTheme().colors` — zero hard-coded hex.
2. Send `X-Participant-Id` on every authed call; refresh after onboarding/switch.
3. Match web response shapes above; don't reshape on the client.
4. Every interactive/critical element gets a stable `testID` (kebab-case).
5. Poll async jobs (statement upload, decode) — never assume sync.
6. Money in mono; over-budget red, success green, pending amber.
7. Gate Family features on `plan === "family"`; gate app entry on `household_id`.
8. Open Stripe checkout/portal in the browser; never build native card capture.

---

## 11. Signup & account creation — EXACT fields, labels, required flags (mirror web `Signup.jsx`)
The web signup is a single screen with a plan picker on the right and account fields on the left. **Card is captured during signup via Stripe Checkout** (see §12). Field label convention: web uses `<FieldLabelText required|optional>` → a label with a small red "required" or muted "optional" hint. Mobile: label + `*` for required, "(optional)" suffix otherwise.

Order & fields (top to bottom):
1. **Persona toggle** — "I am the…" two cards: `caregiver` ("Caregiver — I help someone") / `participant` ("Participant — I receive care"). Required (defaults caregiver). testIDs `signup-role-caregiver|participant`.
2. **Care-recipient block** (only when role=caregiver, all OPTIONAL): "Their first name" (`signup-cr-first-name`), "Their last name" (`signup-cr-last-name`), "Your relationship" select from `CAREGIVER_RELATIONSHIPS` (`signup-cr-relationship`), "Their pronouns" select (`signup-cr-pronouns`: Prefer not to say / She-her / He-him / They-them).
3. **Second-participant block** (only when plan=family): checkbox "I'm caring for two people" / "Add one more person to my plan" (`signup-second-participant-toggle`); when checked: "Their first name" REQUIRED (`signup-second-participant-first-name`), "Their relationship" optional (`signup-second-participant-relationship`). Persisted to `wayly_second_participant_intent` (localStorage on web / AsyncStorage on mobile) and pre-created via `POST /api/v2/participants {first_name, last_name:"", statement_format:"unknown", is_primary:false}` after signup.
4. **First name** REQUIRED (`signup-first-name-input`).
5. **Last name** REQUIRED (`signup-last-name-input`).
6. **Email** REQUIRED, type email (`signup-email-input`).
7. **Password** REQUIRED, min 8, with live strength meter (`signup-password-input`, toggle `signup-password-toggle`). Rules: 8+ chars, upper, lower, number, symbol, AND must not contain the user's name/email. Reject with "Password needs 8+ chars with upper, lower, number and symbol" or "Password shouldn't include your name or email".
8. **Mobile** OPTIONAL, collapsible "Add a mobile number" (`signup-mobile-input`). If provided must match AU: `^(\+614\d{8}|04\d{8})$` else error `signup-mobile-error` "Enter an Australian mobile (04XXXXXXXX or +614XXXXXXXX), or leave blank." Copy: "Used only for account recovery + security alerts. No marketing texts."
9. **Plan picker** (`signup-plan-picker`): cards `signup-plan-solo` / `signup-plan-family` (default **family**), each with price + selected badge. Summary line `signup-plan-summary`.
10. **Submit** (`signup-submit-button`): label "Start 7-day free {Family|Solo} trial".
11. **Google** (`signup-google`) with `planIntent`. **Sign in** link (`login-link`).

Submit sequence (web, mobile must mirror): `signup()` → `PUT /api/persona` (persona payload: `{viewer_persona, is_authorised_representative:false, care_recipient:{is_self, first_name, last_name, pronouns, relationship_to_account}}`) → optional `POST /api/v2/participants` (2nd participant stub) → `POST /api/payments/checkout {plan, origin_url, trial_days:7}` → redirect/open Stripe Checkout. New account has `household_id=null` until onboarding.

`CAREGIVER_RELATIONSHIPS` = daughter, son, spouse_partner, sibling, grandchild, friend, paid_carer, power_of_attorney, other.

## 12. Card capture at signup (Stripe Checkout — subscription mode + 7-day trial)
**The card IS collected and stored at signup**, exactly like the web. There is NO no-card trial path in the product anymore.
- `POST /api/payments/checkout` — body `{plan:"solo"|"family", origin_url, trial_days:7, promo_code?}` → `{url, session_id}`. Backend creates a **subscription-mode** Stripe Checkout Session with `payment_method_types:["card"]`, `subscription_data.trial_period_days=7`, `allow_promotion_codes`, `automatic_tax` (AU GST), `success_url={origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url={origin}/pricing?cancelled=1`. Card validated, first charge on day 8.
- Client opens `url` (web: `window.location`; mobile: `WebBrowser.openBrowserAsync(url)`).
- `GET /api/payments/checkout/status/{session_id}` → `{payment_status, status, subscription_id, plan}`. Success page polls up to 6×2.5s; treat `payment_status ∈ {paid, no_payment_required}` OR `status==="complete"` as success → then onboarding.
- `POST /api/payments/portal {origin_url}` → `{url}` Stripe billing portal (manage/replace card, invoices, cancel). Requires `stripe_customer_id`; if none → 400 "No Stripe customer on record. Start a subscription first." (NOT a 404). **Mobile uses `/api/payments/portal` — never `/api/portal`.**
- `GET /api/payments/invoices` → `{invoices:[]}` billing history.
- Mobile mirror lives in `/app/mobile/src/lib/plans.ts` (`startCheckout(plan, trialDays)`), used by `signup.tsx` and `plan-select.tsx`; portal in `plan-billing.tsx`.

## 13. Plans, participants & caregiver seats (surface these EXACTLY in the mobile plan picker)
| Plan | Price (display) | Backend base | Participants | Caregiver seats |
|---|---|---|---|---|
| **Solo** | **$24.50 / fortnight** | $19/mo | **1 participant tracked** | **1 caregiver seat** |
| **Family** | **$49.50 / fortnight** | $39/mo | **2 participants** ("two parents on one plan") | **Up to 5 caregiver seats** |
| Adviser (web/portal only, not mobile) | $299/mo | — | up to 20 client households | 3 seats |

Backend constants (source of truth): `HOUSEHOLD_MAX_MEMBERS=5` (owner + 4 invitees → the Family "up to 5 seats"); invite limit enforced at `server.py` ("Family plan limit: 5 members (including you)"); `MAX_PARTICIPANTS_PER_HOUSEHOLD=4` (hard cap; marketing says 2 included for Family, 1 for Solo); `SEAT_LIMITS={FREE:1,SOLO:1,FAMILY:3,ADVISER:3}` (legacy account-member seats). **For the plan picker copy, use the marketing numbers above (Solo 1/1, Family 2/up-to-5)** — these match `frontend/src/pages/Signup.jsx` verbatim. Family-only features (invites, weekly digest, Family Wall) gate on `user.plan === "family"`. Trial = **7 days** (`TRIAL_DAYS=7`). Free plan is retired (`?plan=free` deep-links redirect to Family).

Exact plan bullets (mirror on mobile — see `/app/mobile/src/lib/plans.ts`):
- **Solo**: All 9 AI tools unlimited · Statement Decoder & Invoice Checker · Anomaly Watch & budget tracker · Quarterly Pacing dashboard · Support Plan Reviewer & Letters · Document Vault · 1 caregiver seat, 1 participant · Priority email support.
- **Family**: Everything in Solo · Track two parents on one plan · Up to 5 caregiver seats · Sunday digest to the whole family · Adviser & GP sharing links · Family Wall · Reassessment letter generator · Invoice + statement vault · Same-day priority support.

## 14. Date & number formatting (STRICT)
- **All full dates → `DD/MM/YYYY`.** Datetimes → `DD/MM/YYYY HH:mm` (24h). Month-only → "Month YYYY" (e.g. "May 2026"), never "2026-05".
- Web util: `frontend/src/lib/formatDate.js` (`formatDate`, `formatDateTime`, `formatMonthYear`, `formatRelative`). Mobile util: `/app/mobile/src/utils/format.ts` (`formatDate`=`shortDate`, `formatDateTime`, `formatMonthYear`, `timeAgo`). **Every date render goes through these — no `toLocaleDateString` with long/short month anywhere.**
- Money: AUD via `Intl.NumberFormat("en-AU", {style:"currency", currency:"AUD"})`. Whole-dollar for headline figures (`moneyWhole`), 2dp for exact contributions (`money`). Render in IBM Plex Mono, tabular.
- AI copy tone rule: friendly-expert, **no dashes/em-dashes** — mobile `sanitizeAI()` strips them to commas.

## 15. AI Tools catalogue (9 tools — `frontend/src/config/toolRegistry.js`)
`TOOL_COUNT=9`. Never hard-code the count; derive it. Each tool: slug · web route `/ai-tools/{slug}` · tiers · behaviour. Mobile serves these via `/app/mobile/app/tool/[slug].tsx` and `/decode/[id].tsx`.
1. **statement-decoder** — "Statement Decoder". FREE (1 use / 120 days, no signup). Paste/upload a Support at Home monthly statement → plain-English explanation. `POST /api/public/decode-statement(-text)` → poll `GET /api/public/decode-job/{jobId}`; usage `GET /api/free-tool/usage?tool=STATEMENT_DECODER`.
2. **invoice-checker** — "Invoice Checker". Solo/Family. Upload provider contribution invoice → line-by-line check vs funding/expected contribution/rules. `POST /api/invoices/upload`, `/api/invoices/{id}/reconcile-combined`, `/situation`.
3. **budget-calculator** — "Budget & Lifetime Cap Calculator". Enter classification + contribution status → annual budget, per-stream allocation, lifetime cap projection. `POST /api/public/budget-calc`.
4. **provider-price-checker** — "Provider Price Checker". Compare a charge vs published medians + Wayly Provider Quality Index; flag brokered premiums. `POST /api/public/price-check-v2`; `GET /api/ppc/*`, `POST /api/ppc3/provider-comparison`.
5. **classification-self-check** — "Classification Self-Check". 12 questions → likely classification + whether to request reassessment. `GET /api/public/csc/iat-domains`, `POST /api/public/csc/run|pdf|email`.
6. **letters-and-follow-ups** — "Letters & Follow-ups". Draft letters to My Aged Care / provider / ACQSC / Ombudsman; track responses + escalation. `GET/POST /api/lf1/*`; chains `GET /api/lf2/*`.
7. **contribution-estimator** — "Contribution Estimator". How much you'll pay each quarter → clear breakdown. (CE3 endpoints + hardship walkthrough.)
8. **care-plan-reviewer** — "Support Plan Reviewer". Paste a support plan → checked vs Statement of Rights + National Quality Standards. `POST /api/public/care-plans/review(-files)`, authed `/api/care-plans/*`.
9. **family-coordinator** — "Aged Care Q&A". Plain-English answers grounded in the Aged Care Act 2024. `POST /api/public/aged-care-chat`.
Tool routes also aliased on web: /ai-tools/aged-care-qa, /support-plan-reviewer, /reassessment-letter. Slugs & order live in the registry — mirror them, don't invent new ones.

## 16. Onboarding wizard (4 steps — mirror `frontend/src/pages/onboarding/*`)
Steps: **Essentials → Authorisation → Recommended → All done** (`STEPS`). Creating the first participant auto-provisions the household.
- Essentials (Tier 1, all required): first_name, last_name, dob (DD/MM/YYYY UI, sent as ISO YYYY-MM-DD), **pension_status** (`PENSION_OPTIONS`: full_pension, part_pension, cshc, self_funded, unsure — each with a hint), **classification_level** 1–8 (annuals from `GET /api/program-reference/public`), provider_name, **statement_delivery** (`STATEMENT_DELIVERY_OPTIONS`: email, post, portal, other).
- Authorisation: single required confirmation checkbox (authorised representative / POA / consent). `POST /api/participants {…tier1, authorisation_confirmed:true}`.
- Recommended (Tier 2, optional): preferred_name, mac_reference_number, suburb, state (`STATES`: ACT NSW NT QLD SA TAS VIC WA), is_grandfathered_hcp (yes/no/unsure) + hcp_level 1–4, caregiver_relationship, caregiver_phone. `PATCH /api/participants/{id}`.
- All done: shows `profile_completeness_pct`. Mobile gates the tab layout on `household_id` so new users are routed here after signup+checkout.

## 17. Workflows & system behaviours (product-wide)
- **App entry gating**: no token → /login; token but `household_id=null` → /onboarding; otherwise the tabs/dashboard. Adviser role uses the web adviser portal (not the caregiver mobile app).
- **Participant scoping**: every household data call is scoped by the `X-Participant-Id` header (active participant). Switching participants re-fetches everything. Family plan can hold multiple participants; Solo one.
- **Trial lifecycle**: signup → 7-day trial (card on file) → charged day 8 unless cancelled. A subtle "Free trial ends in N days" banner shows across the app while `subscription.status==="trialing"` and taps through to Plan & Billing. Cancel sets `cancel_at_period_end` (keep access until period end); reactivate undoes it.
- **Async jobs**: statement upload and statement decode are asynchronous — POST returns a job id, then poll the job endpoint. Never assume synchronous results. Use chunked upload for files.
- **Immutable audit trail**: accept/supersede/archive/delete of statements writes immutable audit rows; a global Audit Log (`GET /api/audit-log`) and per-statement audit (`/statements/{id}/audit-log`) surface them. Used for complaints/peace of mind.
- **Anomaly watch**: statements carry `anomalies[]` (severity alert/info, title, detail, suggested_action) surfaced on the dashboard and budget-alerts.
- **Plan gating**: Free plan retired; unsubscribed/expired users see a read-only paywall (view existing data, can't add). Family-only: invites, weekly digest, Family Wall.
- **Empty/Loading/Error**: every screen implements skeleton loading, an empty state with a primary action, and a friendly error with retry.
- **Nudges**: `GET /api/nudges` returns dismissible server-computed nudges (e.g. Family second-participant reminder); dismiss via `POST /api/nudges/{key}/dismiss`.

## 18. Remaining mobile parity gaps (as of this handoff)
- **Support tickets** (`/support`) — web `MySupport.jsx` (list/create/thread/messages/attachments/close/reopen/CSAT). Endpoints `GET/POST /api/support/tickets…`. Drawer link hidden (`implemented` unset) until built.
- **CE3 pension-change wizard** — the 3-step "Change pension status" modal on web ContributionPosition (`/ce3/participants/{id}/pension-change/preview|commit`) is not yet on the mobile Contribution Position screen (view + reconcile only).
- **Statement pair review (SD3)**, **Loop cases** (`/participants/:id/cases`), **participant sub-tabs** (attendance/complaints/coordinator/voice-check), and **email verification** screens are web-only so far.
- Everything else (dashboard, statements+detail+compare+audit+upload, invoices, pacing, budget-alerts/scenarios, calendar, care-plans, care-team, documents, correspondence, letters, hospital, amendments, scenarios, timeline, provider-switch, ratings, compare-providers, journeys, ATHM, CHSP tools, handover pack, carer self-check, classification prep, key contacts, family wall/thread, weekly digest, family members, security, usage, danger zone, profile, plan-select, plan-billing, onboarding, audit, referrals, contribution-position) has a mobile screen.

---

## Appendix A — Full endpoint inventory (grouped by module)
Auto-generated from the backend route decorators. Paths are relative to the `/api` prefix.

#### server.py
  - `delete  /api/auth/account`
  - `delete  /api/chat/history`
  - `delete  /api/household/members/{member_user_id}`
  - `delete  /api/statements/{statement_id}/archive`
  - `delete  /api/statements/{statement_id}/permanent`
  - `get  /api/admin/audit-log/verify`
  - `get  /api/admin/program-reference`
  - `get  /api/admin/program-reference/history`
  - `get  /api/audit-log`
  - `get  /api/auth/account/export`
  - `get  /api/auth/me`
  - `get  /api/billing/status/{session_id}`
  - `get  /api/billing/subscription`
  - `get  /api/billing/trial-eligibility`
  - `get  /api/budget/current`
  - `get  /api/budget/eligible-pathways`
  - `get  /api/chat/history`
  - `get  /api/digest/history`
  - `get  /api/digest/preview`
  - `get  /api/family-thread`
  - `get  /api/household`
  - `get  /api/household/members`
  - `get  /api/inbound/my-address`
  - `get  /api/invite/{token}`
  - `get  /api/notifications/legacy-removed`
  - `get  /api/participant/today`
  - `get  /api/participant/wellbeing`
  - `get  /api/program-reference/public`
  - `get  /api/public/decode-job/{job_id}`
  - `get  /api/scenario/contacts`
  - `get  /api/scenario/event-types`
  - `get  /api/scenario/lifecycle-map`
  - `get  /api/scenario/participants/{participant_id}/alerts`
  - `get  /api/scenario/participants/{participant_id}/events`
  - `get  /api/scenario/participants/{participant_id}/state`
  - `get  /api/scenario/participants/{participant_id}/state-audit`
  - `get  /api/scenario/participants/{participant_id}/timeline`
  - `get  /api/scenario/schema`
  - `get  /api/scenario/workflows`
  - `get  /api/scenario/workflows/{workflow_key}`
  - `get  /api/statements`
  - `get  /api/statements/archived`
  - `get  /api/statements/recent-line-items`
  - `get  /api/statements/upload-job/{job_id}`
  - `get  /api/statements/{statement_id}`
  - `get  /api/statements/{statement_id}/audit-log`
  - `get  /api/statements/{statement_id}/download`
  - `get  /api/usage`
  - `patch  /api/statements/{statement_id}/note`
  - `post  /api/admin/program-reference`
  - `post  /api/admin/reconciliation/run`
  - `post  /api/admin/scenario/evaluate-clocks`
  - `post  /api/api/admin/indexnow/ping`
  - `post  /api/api/admin/indexnow/ping-all`
  - `post  /api/api/inbound/email-statement`
  - `post  /api/api/internal/trial-tick`
  - `post  /api/auth/forgot`
  - `post  /api/auth/google-session`
  - `post  /api/auth/login`
  - `post  /api/auth/logout`
  - `post  /api/auth/mfa/disable`
  - `post  /api/auth/mfa/enable`
  - `post  /api/auth/mfa/setup`
  - `post  /api/auth/mfa/verify`
  - `post  /api/auth/refresh`
  - `post  /api/auth/reset`
  - `post  /api/auth/signup`
  - `post  /api/auth/verify`
  - `post  /api/auth/verify/send`
  - `post  /api/billing/cancel`
  - `post  /api/billing/checkout`
  - `post  /api/billing/downgrade-to-free`
  - `post  /api/billing/start-trial`
  - `post  /api/billing/upgrade`
  - `post  /api/chat`
  - `post  /api/contact`
  - `post  /api/dashboard/share`
  - `post  /api/digest/send`
  - `post  /api/family-thread`
  - `post  /api/help-chat`
  - `post  /api/household`
  - `post  /api/household/invite`
  - `post  /api/invite/accept`
  - `post  /api/participant/concern`
  - `post  /api/participant/wellbeing`
  - `post  /api/public/aged-care-chat`
  - `post  /api/public/budget-calc`
  - `post  /api/public/care-plan-review`
  - `post  /api/public/classification-check`
  - `post  /api/public/contribution-estimator`
  - `post  /api/public/decode-statement`
  - `post  /api/public/decode-statement-text`
  - `post  /api/public/email-result`
  - `post  /api/public/help-chat`
  - `post  /api/public/price-check`
  - `post  /api/public/reassessment-letter`
  - `post  /api/scenario/alerts/{alert_id}/status`
  - `post  /api/scenario/boundary-probe`
  - `post  /api/scenario/participants/{participant_id}/events`
  - `post  /api/scenario/participants/{participant_id}/flags`
  - `post  /api/scenario/participants/{participant_id}/lifecycle-transition`
  - `post  /api/statements/upload`
  - `post  /api/statements/{statement_id}/restore`
  - `post  /api/webhook/stripe`
  - `put  /api/auth/plan`

#### participant_profile.py
  - `get  /api/participants`
  - `get  /api/participants/{pid}`
  - `get  /api/participants/{pid}/profile-prompts`
  - `patch  /api/participants/{pid}`
  - `post  /api/participants`

#### extended_routes.py
  - `delete  /api/athm/{iid}`
  - `delete  /api/athm/{iid}/attachments/{aid}`
  - `delete  /api/athm/{iid}/files/{fid}`
  - `delete  /api/budget-alerts/{aid}`
  - `delete  /api/correspondence/{cid}`
  - `delete  /api/provider-ratings/{rid}`
  - `delete  /api/referrals/{rid}`
  - `delete  /api/visits/{vid}`
  - `get  /api/athm`
  - `get  /api/athm/{iid}/files/{fid}`
  - `get  /api/budget-alerts`
  - `get  /api/correspondence`
  - `get  /api/provider-ratings`
  - `get  /api/provider-switch`
  - `get  /api/referrals`
  - `get  /api/reports/summary.pdf`
  - `get  /api/search`
  - `get  /api/visits`
  - `patch  /api/athm/{iid}`
  - `patch  /api/budget-alerts/{aid}`
  - `patch  /api/correspondence/{cid}`
  - `patch  /api/provider-ratings/{rid}`
  - `patch  /api/provider-switch/{sid}`
  - `patch  /api/referrals/{rid}`
  - `patch  /api/visits/{vid}`
  - `post  /api/athm`
  - `post  /api/athm/{iid}/attachments`
  - `post  /api/athm/{iid}/files`
  - `post  /api/budget-alerts`
  - `post  /api/correspondence`
  - `post  /api/provider-ratings`
  - `post  /api/provider-switch`
  - `post  /api/referrals`
  - `post  /api/visits`

#### batch2_routes.py
  - `delete  /api/adviser/scenarios/{sid}`
  - `delete  /api/participants/{pid}`
  - `delete  /api/wall/posts/{pid}`
  - `get  /api/adviser/alerts/global`
  - `get  /api/adviser/brand`
  - `get  /api/adviser/means-test/settings`
  - `get  /api/adviser/scenarios`
  - `get  /api/amendments`
  - `get  /api/hospital/admissions`
  - `get  /api/me/contacts`
  - `get  /api/participants`
  - `get  /api/wall/posts`
  - `patch  /api/participants/{pid}`
  - `post  /api/adviser/scenarios`
  - `post  /api/adviser/scenarios/calc`
  - `post  /api/amendments/generate`
  - `post  /api/amendments/{aid}/status`
  - `post  /api/hospital/admissions`
  - `post  /api/hospital/admissions/{aid}/discharge`
  - `post  /api/hospital/admissions/{aid}/request-rcp`
  - `post  /api/participants`
  - `post  /api/participants/{pid}/promote`
  - `post  /api/sms/test`
  - `post  /api/wall/posts`
  - `post  /api/wall/posts/{pid}/react`
  - `put  /api/adviser/brand`
  - `put  /api/adviser/means-test/settings`
  - `put  /api/me/contacts`

#### batch3_routes.py
  - `delete  /api/v2/members/{mid}`
  - `delete  /api/v2/participants/{pid}`
  - `get  /api/account`
  - `get  /api/admin/v2/addons`
  - `get  /api/admin/v2/free-tier/usage`
  - `get  /api/admin/v2/purge-queue`
  - `get  /api/admin/v2/users/{user_id}/participants`
  - `get  /api/free-tool/usage`
  - `get  /api/inbound/mail/queue`
  - `get  /api/v2/members`
  - `get  /api/v2/participants`
  - `patch  /api/v2/participants/{pid}`
  - `post  /api/admin/v2/purge-queue/{pid}/extend`
  - `post  /api/inbound/mail`
  - `post  /api/v2/members/invite`
  - `post  /api/v2/participants`
  - `post  /api/v2/participants/preview`
  - `post  /api/v2/participants/{pid}/hard-delete`
  - `post  /api/v2/participants/{pid}/restore`

#### batch3_billing.py
  - `post  /api/billing/v2/addon-checkout`
  - `post  /api/billing/v2/cancel-pending-addon`
  - `post  /api/billing/v2/upgrade-checkout`

#### routes/core1.py
  - `get  /api/participants`
  - `get  /api/participants/{pid}`
  - `get  /api/participants/{pid}/profile`
  - `get  /api/participants/{pid}/timeline`
  - `get  /api/status`
  - `patch  /api/participants/{pid}`
  - `post  /api/timeline/events`

#### routes/loop1.py
  - `get  /api/cases`
  - `get  /api/cases/registry`
  - `get  /api/cases/{cid}`
  - `get  /api/status`
  - `patch  /api/cases/{cid}`
  - `post  /api/cases`
  - `post  /api/cases/scan`
  - `post  /api/cases/{cid}/events`
  - `post  /api/lca1/scan`

#### routes/loop1_addons.py
  - `get  /api/cases/{cid}/assignee-candidates`
  - `get  /api/patterns`
  - `post  /api/lca1/digest`
  - `post  /api/lca1/sweep`
  - `post  /api/nudges/sla-check`

#### routes/ce3.py
  - `get  /api/hardship/triggers/{tid}`
  - `get  /api/hardship/walkthrough`
  - `get  /api/participants/{pid}/annual-projection`
  - `get  /api/participants/{pid}/hardship/triggers`
  - `get  /api/participants/{pid}/lifetime-cap`
  - `get  /api/participants/{pid}/pension-change/history`
  - `get  /api/participants/{pid}/reconciliations`
  - `get  /api/status`
  - `patch  /api/hardship/triggers/{tid}/notes`
  - `post  /api/hardship/triggers/{tid}/user-response`
  - `post  /api/participants/{pid}/hardship/triggers`
  - `post  /api/participants/{pid}/lifetime-cap/refresh`
  - `post  /api/participants/{pid}/pension-change/commit`
  - `post  /api/participants/{pid}/pension-change/preview`
  - `post  /api/participants/{pid}/reconciliations/reconcile`
  - `post  /api/reconciliations/{rid}/action`
  - `post  /api/reconciliations/{rid}/add-user-note`

#### routes/cpr2.py
  - `get  /api/participants/{pid}/goals`
  - `get  /api/participants/{pid}/re-review-prompts`
  - `get  /api/participants/{pid}/voice-checks`
  - `get  /api/rename-notification`
  - `get  /api/status`
  - `patch  /api/goals/{gid}`
  - `patch  /api/voice-checks/{vcid}`
  - `post  /api/goals/{gid}/link-to-plan`
  - `post  /api/goals/{gid}/meeting-note`
  - `post  /api/goals/{gid}/supersede`
  - `post  /api/participants/{pid}/goals`
  - `post  /api/participants/{pid}/re-review-prompts`
  - `post  /api/participants/{pid}/voice-checks`
  - `post  /api/re-review-prompts/{prid}/user-response`
  - `post  /api/rename-notification/acknowledge`
  - `post  /api/voice-checks/{vcid}/mark-follow-up`

#### routes/qp1.py
  - `delete  /api/schedules/{schedule_id}`
  - `get  /api/ledger`
  - `get  /api/pacing`
  - `get  /api/pacing/history`
  - `get  /api/schedules`
  - `post  /api/ledger/ad_hoc`
  - `post  /api/ledger/auto_assume`
  - `post  /api/ledger/{entry_id}/changed`
  - `post  /api/ledger/{entry_id}/confirm`
  - `post  /api/ledger/{entry_id}/missed`
  - `post  /api/reconciliations`
  - `post  /api/reconciliations/from-statement`
  - `post  /api/schedules`
  - `put  /api/schedules/{schedule_id}`

#### routes/statements.py
  - `get  /api/{statement_id}/decoded.csv`
  - `get  /api/{statement_id}/decoded.pdf`

#### routes/invoices.py
  - `delete  /api/invoices/{invoice_id}`
  - `get  /api/invoices`
  - `get  /api/invoices/{invoice_id}`
  - `post  /api/invoices/upload`
  - `post  /api/invoices/{invoice_id}/findings/{finding_index}/letter`
  - `post  /api/invoices/{invoice_id}/reconcile-combined`
  - `post  /api/invoices/{invoice_id}/save-to-vault`
  - `post  /api/invoices/{invoice_id}/situation`

#### routes/journeys.py
  - `get  /api/journeys/current`
  - `get  /api/journeys/{journey_id}/pdf`
  - `post  /api/journeys`
  - `post  /api/journeys/{journey_id}/complete`
  - `post  /api/journeys/{journey_id}/skip`
  - `put  /api/journeys/{journey_id}/persona`
  - `put  /api/journeys/{journey_id}/steps/{step}`

#### routes/notifications.py
  - `get  /api/notifications`
  - `get  /api/notifications/prefs`
  - `get  /api/notifications/stream`
  - `post  /api/notifications/read`
  - `put  /api/notifications/prefs`

#### routes/nudges.py
  - `post  /api/{key}/dismiss`

#### routes/lca1.py
  - `get  /api/active-alerts-context`
  - `get  /api/admin/changes`
  - `get  /api/admin/changes/{cid}`
  - `get  /api/alerts`
  - `get  /api/alerts/unread-count`
  - `get  /api/preferences`
  - `get  /api/public/changes`
  - `get  /api/scrape/runs`
  - `get  /api/status`
  - `patch  /api/admin/changes/{cid}`
  - `patch  /api/alerts/{alert_id}/dismiss`
  - `patch  /api/alerts/{alert_id}/read`
  - `patch  /api/preferences`
  - `post  /api/admin/changes`
  - `post  /api/admin/changes/{cid}/cancel`
  - `post  /api/admin/changes/{cid}/preview-impact`
  - `post  /api/admin/changes/{cid}/publish`
  - `post  /api/scrape/run-now`

#### routes/aw2.py
  - `delete  /api/conversations/{cid}`
  - `get  /api/adm-disclosure/current-version`
  - `get  /api/context`
  - `get  /api/conversations`
  - `get  /api/conversations/{cid}`
  - `get  /api/proactive-nudges`
  - `patch  /api/context/retention-policy`
  - `post  /api/adm-disclosure/acknowledge`
  - `post  /api/context/consent`
  - `post  /api/conversations`
  - `post  /api/conversations/{cid}/feedback`
  - `post  /api/conversations/{cid}/messages`
  - `post  /api/proactive-nudges`
  - `post  /api/proactive-nudges/{nid}/user-response`

#### routes/psw1.py
  - `get  /api/participants/{pid}/switches`
  - `get  /api/switches/{sid}`
  - `get  /api/switches/{sid}/context-snapshot`
  - `get  /api/switches/{sid}/decision-walkthrough`
  - `get  /api/switches/{sid}/overlap-services`
  - `patch  /api/switches/{sid}`
  - `post  /api/participants/{pid}/switches`
  - `post  /api/settlements/{settlement_id}/refund-received`
  - `post  /api/switches/{sid}/abandon`
  - `post  /api/switches/{sid}/advance-stage`
  - `post  /api/switches/{sid}/decision-walkthrough`
  - `post  /api/switches/{sid}/generate-notice`
  - `post  /api/switches/{sid}/overlap-service`
  - `post  /api/switches/{sid}/post-switch-settlement`

#### routes/ppc3.py
  - `get  /api/providers/{provider_name}/quality-profile`
  - `get  /api/providers/{provider_name}/wayly-aggregate`
  - `patch  /api/providers/{provider_name}/acqsc-status`
  - `patch  /api/providers/{provider_name}/star-ratings`
  - `post  /api/provider-comparison`
  - `post  /api/provider-responses/{sub_id}/publish`
  - `post  /api/providers/{provider_name}/notify-publication`
  - `post  /api/public/provider-responses`
  - `post  /api/public/provider-responses/{sub_id}/verify`
  - `post  /api/survey-responses`

#### routes/lf1.py
  - `delete  /api/lf1/correspondence/{entry_id}`
  - `get  /api/lf1/archetypes`
  - `get  /api/lf1/correspondence`
  - `get  /api/lf1/correspondence/{entry_id}`
  - `get  /api/lf1/cross-tool-signals`
  - `get  /api/lf1/directory`
  - `get  /api/lf1/directory/recipients`
  - `get  /api/lf1/directory/recipients/{key}`
  - `get  /api/lf1/follow-ups`
  - `get  /api/lf1/safety`
  - `get  /api/lf1/situations`
  - `patch  /api/lf1/correspondence/{entry_id}`
  - `patch  /api/lf1/correspondence/{entry_id}/autosave`
  - `post  /api/lf1/correspondence`
  - `post  /api/lf1/correspondence/{entry_id}/attach-source`
  - `post  /api/lf1/correspondence/{entry_id}/escalate`
  - `post  /api/lf1/correspondence/{entry_id}/feedback`
  - `post  /api/lf1/correspondence/{entry_id}/generate`
  - `post  /api/lf1/correspondence/{entry_id}/inbound`
  - `post  /api/lf1/correspondence/{entry_id}/pdf`
  - `post  /api/lf1/correspondence/{entry_id}/response-draft`
  - `post  /api/lf1/correspondence/{entry_id}/safeguarding-record`
  - `post  /api/lf1/correspondence/{entry_id}/share`
  - `post  /api/lf1/correspondence/{entry_id}/sign-off`
  - `post  /api/lf1/correspondence/{entry_id}/tone-check`

#### routes/lf2.py
  - `get  /api/chains`
  - `get  /api/drafts/{draft_id}`
  - `get  /api/participants/{pid}/chains`
  - `get  /api/status`
  - `get  /api/templates`
  - `patch  /api/drafts/{draft_id}`
  - `post  /api/drafts/{draft_id}/send`
  - `post  /api/generate-chain`

#### routes/cs1.py
  - `delete  /api/assessments/{aid}`
  - `get  /api/assessments`
  - `get  /api/handover-packs`
  - `get  /api/handover-packs/{pack_id}`
  - `get  /api/handover-packs/{pack_id}/export.pdf`
  - `get  /api/respite-plans`
  - `get  /api/support-services`
  - `patch  /api/handover-packs/{pack_id}`
  - `patch  /api/respite-plans/{rid}`
  - `post  /api/assessments`
  - `post  /api/assessments/{aid}/extend-retention`
  - `post  /api/burnout-check`
  - `post  /api/handover-packs`
  - `post  /api/respite-plans`

#### routes/support.py
  - `delete  /api/admin/support/macros/{macro_id}`
  - `get  /api/admin/support/admins`
  - `get  /api/admin/support/defects`
  - `get  /api/admin/support/export`
  - `get  /api/admin/support/macros`
  - `get  /api/admin/support/retention/status`
  - `get  /api/admin/support/stats`
  - `get  /api/admin/support/tickets`
  - `get  /api/admin/support/tickets/{ticket_id}`
  - `get  /api/admin/support/tickets/{ticket_id}/attachments/{attachment_id}/download`
  - `get  /api/admin/support/tickets/{ticket_id}/timeline`
  - `get  /api/support/tickets`
  - `get  /api/support/tickets/{ticket_id}`
  - `get  /api/support/tickets/{ticket_id}/attachments/{attachment_id}/download`
  - `patch  /api/admin/support/macros/{macro_id}`
  - `patch  /api/admin/support/tickets/{ticket_id}`
  - `patch  /api/support/tickets/{ticket_id}`
  - `post  /api/admin/support/defects`
  - `post  /api/admin/support/defects/{defect_id}/resolve`
  - `post  /api/admin/support/macros`
  - `post  /api/admin/support/retention/purge`
  - `post  /api/admin/support/tickets/bulk`
  - `post  /api/admin/support/tickets/{ticket_id}/attachments`
  - `post  /api/admin/support/tickets/{ticket_id}/link-defect`
  - `post  /api/admin/support/tickets/{ticket_id}/notes`
  - `post  /api/admin/support/tickets/{ticket_id}/reply`
  - `post  /api/admin/support/tickets/{ticket_id}/status`
  - `post  /api/admin/support/tickets/{ticket_id}/triage/agree`
  - `post  /api/support/tickets`
  - `post  /api/support/tickets/{ticket_id}/attachments`
  - `post  /api/support/tickets/{ticket_id}/close`
  - `post  /api/support/tickets/{ticket_id}/csat`
  - `post  /api/support/tickets/{ticket_id}/messages`
  - `post  /api/support/tickets/{ticket_id}/reopen`

#### routes/sd3.py
  - `get  /api/first-run-overlay/state`
  - `get  /api/pairs/{pair_id}`
  - `get  /api/statements/{sid}/care-management`
  - `get  /api/statements/{sid}/rights-annotations`
  - `patch  /api/candidates/{candidate_id}`
  - `post  /api/candidates/{candidate_id}/draft-letter`
  - `post  /api/first-run-overlay/dismiss`
  - `post  /api/pairs`
  - `post  /api/statements/{sid}/care-management/mark-shown`
  - `post  /api/statements/{sid}/decode-v2/stream`

#### routes/participant_contacts.py
  - `delete  /api/participants/{participant_id}/contacts/{contact_id}`
  - `get  /api/participants/{participant_id}/contacts`
  - `patch  /api/participants/{participant_id}/contacts/{contact_id}`
  - `post  /api/participants/{participant_id}/contacts`

#### routes/participant_share.py
  - `delete  /api/participants/{pid}/share-link`
  - `get  /api/participants/{pid}/share-link`
  - `get  /api/public/shared-view/{token}`
  - `post  /api/participants/{pid}/share-link`
  - `post  /api/participants/{pid}/share-link/rotate`
  - `post  /api/public/shared-view/{token}/alert`
  - `post  /api/public/shared-view/{token}/wellbeing`

#### routes/email_change.py
  - `delete  /api/auth/email/change-request`
  - `get  /api/auth/email/change-confirm`
  - `get  /api/auth/email/change-status`
  - `post  /api/auth/email/change-request`

#### routes/persona.py
  - `get  /api/persona`
  - `get  /api/persona/tier1-keys`
  - `post  /api/persona/resolve`
  - `put  /api/persona`

#### reports_routes.py
  - `delete  /api/{rid}`
  - `get  /api/file/{token}`
  - `get  /api/{rid}`
  - `get  /api/{rid}/data`
  - `get  /api/{rid}/download`
  - `post  /api/generate`

#### documents_routes.py
  - `delete  /api/{doc_id}`
  - `get  /api/{doc_id}`
  - `get  /api/{doc_id}/download`
  - `patch  /api/{doc_id}`
  - `post  /api/{doc_id}/send-to-decoder`

#### routes/tools.py
  - `get  /api/tools`
  - `get  /api/tools/{slug}`

#### routes/csc.py
  - `get  /api/public/csc/iat-domains`
  - `get  /api/public/csc/run/{run_id}`
  - `post  /api/public/csc/email`
  - `post  /api/public/csc/pdf`
  - `post  /api/public/csc/run`

#### routes/price_check_v2.py
  - `delete  /api/ppc/checks/provider`
  - `delete  /api/ppc/checks/{check_id}`
  - `get  /api/features/{name}`
  - `get  /api/ppc/checks`
  - `get  /api/ppc/checks/history`
  - `get  /api/ppc/decoder-context`
  - `get  /api/ppc/services`
  - `get  /api/ppc/snapshots`
  - `get  /api/tools/ce/state`
  - `post  /api/ppc/analytics-event`
  - `post  /api/ppc/checks`
  - `post  /api/ppc/email-draft`
  - `post  /api/ppc/pdf-export`
  - `post  /api/public/price-check-v2`
  - `put  /api/tools/ce/state`

#### routes/care_plans.py
  - `delete  /api/care-plans/{plan_id}`
  - `get  /api/care-plans`
  - `get  /api/care-plans/archived/list`
  - `get  /api/care-plans/compare/{left_id}/{right_id}`
  - `get  /api/care-plans/prompts/re-review`
  - `get  /api/care-plans/{plan_id}`
  - `get  /api/care-plans/{plan_id}/artefact.pdf`
  - `get  /api/care-plans/{plan_id}/follow-up-email`
  - `get  /api/internal/tools/all-signals/participant/{participant_id}`
  - `get  /api/internal/tools/budget-calculator/participant/{participant_id}/latest`
  - `get  /api/internal/tools/classification-self-check/participant/{participant_id}/latest`
  - `get  /api/internal/tools/contribution-estimator/participant/{participant_id}/latest`
  - `get  /api/internal/tools/family-coordinator/participant/{participant_id}/household`
  - `get  /api/internal/tools/provider-price-checker/participant/{participant_id}/latest`
  - `get  /api/internal/tools/reassessment-letter-generator/participant/{participant_id}/latest`
  - `get  /api/internal/tools/statement-decoder/participant/{participant_id}/latest`
  - `patch  /api/care-plans/{plan_id}/notes`
  - `patch  /api/care-plans/{plan_id}/preview`
  - `post  /api/care-plans/admin/purge-expired`
  - `post  /api/care-plans/upload`
  - `post  /api/care-plans/upload-files`
  - `post  /api/care-plans/{plan_id}/analyse`
  - `post  /api/care-plans/{plan_id}/restore`
  - `post  /api/public/care-plans/review`
  - `post  /api/public/care-plans/review-files`


---
_Handoff generated 2026-08-16. Keep in sync with backend changes._
