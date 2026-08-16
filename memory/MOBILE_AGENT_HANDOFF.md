# Wayly — Mobile Agent Handoff

This doc is everything the **Mobile Agent** project needs to build a React Native (Expo) app that talks to the existing Wayly backend. Copy/paste sections into the Mobile Agent's day-1 prompt.

---

## 1. Architecture

- **Backend**: existing FastAPI app on this Emergent project (`wayly` web project). **DO NOT rebuild** — the mobile app is a second client.
- **Database**: shared MongoDB. A user signing up on web sees the same data on mobile and vice versa.
- **Auth**: JWT bearer (30-day TTL). Same login on web and mobile.
- **Billing**: Stripe subscription is shared. Mobile can defer billing to web for v1 (deep-link to `https://wayly.com.au/settings/billing`).

```
┌──────────────┐     ┌──────────────┐
│  Web (React) │     │  Mobile (RN) │
└──────┬───────┘     └──────┬───────┘
       │                    │
       │   JWT Bearer       │
       └──────────┬─────────┘
                  ▼
         ┌────────────────┐
         │  FastAPI API   │  ← THIS PROJECT (Emergent web)
         │   /api/*       │
         └────────┬───────┘
                  ▼
              MongoDB
```

---

## 2. API Base URL

The mobile app must read `EXPO_PUBLIC_API_URL` (Expo) or `REACT_NATIVE_API_URL` from env.

- **Production**: `https://wayly.com.au` (after domain link) or the deployed `*.emergentagent.com` URL.
- **Dev**: this project's preview URL (don't hardcode — read from env).

All endpoints are prefixed with **`/api/`**.

---

## 3. Authentication (Bearer JWT)

### Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/api/auth/signup` | `{email, password, role, name?, plan?}` | `{token, user}` |
| POST | `/api/auth/login` | `{email, password}` | `{token, user}` |
| GET | `/api/auth/me` | — | `{user}` |
| POST | `/api/auth/forgot` | `{email}` | `{ok:true}` (enumeration-safe) |
| POST | `/api/auth/reset` | `{token, password}` | `{ok:true}` |
| POST | `/api/auth/logout` | — | `{ok:true}` |
| PUT | `/api/auth/plan` | `{plan}` | `{user}` |
| POST | `/api/auth/verify/send` | — | `{ok:true}` |
| POST | `/api/auth/verify` | `{token}` | `{ok:true}` |
| DELETE | `/api/auth/account` | — | `{ok:true}` |

### Sample request

```js
const res = await fetch(`${API}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const { token, user } = await res.json();
// Store token in expo-secure-store, NOT AsyncStorage.
```

### Authenticated requests

```js
fetch(`${API}/api/auth/me`, {
  headers: { Authorization: `Bearer ${token}` },
});
```

### Google sign-in
Web uses Emergent-managed Google session. **Mobile should use native `expo-auth-session` with Google provider** instead — get the Google `id_token` and POST it to a new mobile-specific endpoint (TBD; for v1, default to email/password and add native Google later).

---

## 4. Core endpoints (priority for mobile v1)

### Tier 1 — Build first

| Endpoint | Purpose |
|---|---|
| `GET /api/auth/me` | Get current user + plan + trial state |
| `POST /api/statements/upload` (multipart) | **Camera capture → OCR + decode** (the killer mobile feature) |
| `GET /api/statements/upload-job/{job_id}` | Poll upload+decode progress |
| `GET /api/statements` | List statements |
| `GET /api/statements/{id}` | Statement detail (line items, anomalies) |
| `GET /api/budget/current` | Today screen — quarter burn, lifetime cap |
| `GET /api/notifications` | Bell + push payload source |
| `POST /api/notifications/read` | Mark read |
| `POST /api/help-chat` | Grounded chatbot |

### Tier 2 — Adds depth

| Endpoint | Purpose |
|---|---|
| `GET /api/household` / `POST /api/household` | Household setup |
| `GET /api/household/members` | Family list |
| `POST /api/household/invite` | Invite family |
| `GET /api/family-thread` / `POST /api/family-thread` | Family chat |
| `GET /api/audit-log` | Activity feed |
| `GET /api/participant/today` | Participant view (large-text) |
| `POST /api/participant/wellbeing` | Daily check-in |
| `POST /api/participant/concern` | "Something's wrong" button |
| `POST /api/dashboard/share` | Share snapshot via email |

### Tier 3 — Defer to web

- `POST /api/billing/checkout` (Stripe) — deep-link to web for v1.
- `POST /api/contact`, `/api/digest/*`, `/api/public/*` — the public AI tools live on web.

---

## 5. Statement upload (the mobile killer feature)

### Flow
1. User taps "Snap a statement".
2. Use `expo-camera` or `expo-image-picker` to capture a photo OR `expo-document-picker` for PDF.
3. POST to `/api/statements/upload` as multipart form data with `file` field.
4. Response: `{job_id, status:"pending"}`.
5. Poll `GET /api/statements/upload-job/{job_id}` every 2s until `status === "complete"` or `"error"`.
6. On complete, navigate to statement detail using `result.statement_id`.

### Sample multipart request

```js
const form = new FormData();
form.append('file', {
  uri: photoUri,
  name: 'statement.jpg',
  type: 'image/jpeg',
});

const res = await fetch(`${API}/api/statements/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
const { job_id } = await res.json();
```

The backend already handles:
- Image quality assessment (OpenCV)
- Auto-rotation
- Multi-page PDFs
- Claude Vision OCR fallback for low-quality images

---

## 6. Notifications (push)

Currently the web bell polls `GET /api/notifications`. For mobile, plan to:
1. **For v1**: keep polling on app foreground (simplest path).
2. **For v2**: register Expo push tokens; backend can be extended to send via Expo's push service when a new HIGH/MEDIUM anomaly is detected.

Notification document shape:
```js
{
  id: string,
  user_id: string,
  type: 'anomaly' | 'invite' | 'family_message' | 'wellbeing' | 'trial_ending' | 'system',
  title: string,
  body: string,
  link: string,        // deep-link path, e.g. "/app/statements/abc123"
  read: boolean,
  created_at: ISO,
}
```

---

## 7. Brand tokens (mirror these in the mobile app)

```js
export const colors = {
  bg: '#FAF7F2',          // warm off-white
  surface: '#FFFFFF',
  surface2: '#F2EEE5',
  primary: '#1F3A5F',     // deep navy (CTAs, headers)
  primaryFg: '#FFFFFF',
  gold: '#D4A24E',        // accent (badges, highlights)
  sage: '#7A9B7E',        // success
  terracotta: '#C5734D',  // alerts / over-budget
  text: '#1A1A1A',
  muted: '#5C6878',
  border: '#E8E2D6',
};

export const fonts = {
  heading: 'CrimsonPro_600SemiBold',  // expo-google-fonts/crimson-pro
  body: 'IBMPlexSans_400Regular',     // expo-google-fonts/ibm-plex-sans
};
```

---

## 8. User & data shapes (Pydantic mirrors)

### User
```js
{
  id: string,
  email: string,
  name: string,
  role: 'caregiver' | 'participant' | 'advisor',
  plan: 'free' | 'solo' | 'family' | 'advisor' | 'advisor_pro',
  household_id: string | null,
  subscription_status: 'active' | 'trialing' | 'expired' | 'canceled' | null,
  trial_ends_at: ISO | null,
  cancel_at_period_end: boolean,
  auth_method: 'password' | 'google',
  email_verified: boolean,
}
```

### Statement (top-level)
```js
{
  id: string,
  household_id: string,
  uploaded_at: ISO,
  has_original_file: boolean,
  participant_name: string,
  statement_period: string,
  reported_total_gross: number,
  reported_total_participant_contribution: number,
  reported_total_government_paid: number,
  line_items: LineItem[],
  anomalies: Anomaly[],
  stream_breakdown: StreamBreakdown[],
  audit: { /* full audit object */ },
}
```

### Anomaly
```js
{
  rule: string,        // e.g. "RULE_3_DUPLICATE_EXACT"
  severity: 'HIGH' | 'MEDIUM' | 'LOW',
  headline: string,
  detail: string,
  suggested_action: string,
  evidence: string[],
  dollar_impact: number | null,
}
```

### Household
```js
{
  id: string,
  owner_id: string,
  participant_name: string,
  classification: 1..8,
  provider_name: string,
  is_grandfathered: boolean,
  inbound_address: string,   // kndrd_xxxx@inbound.wayly.com.au
}
```

---

## 9. Day-1 prompt for the Mobile Agent

Paste this verbatim into the new Mobile Agent project to bootstrap:

> Build a **React Native (Expo)** app for **Wayly** — an AI concierge for Australian families navigating the Support at Home program. The backend is already live at `EXPO_PUBLIC_API_URL` (set in `.env`). Do NOT rebuild backend logic — only consume the existing API.
>
> **Auth**: JWT bearer. Endpoints `/api/auth/login`, `/api/auth/signup`, `/api/auth/me`. Store token in `expo-secure-store`. 30-day TTL.
>
> **Phase 1 screens**:
> 1. Login / Signup (email + password; Google sign-in deferred).
> 2. **Today** — quarter burn %, lifetime-cap %, alert count, latest statement card. Source: `GET /api/auth/me` + `GET /api/budget/current` + `GET /api/statements?limit=1`.
> 3. **Snap a statement** — `expo-camera` + multipart POST to `/api/statements/upload`, poll `/api/statements/upload-job/{job_id}` every 2s, navigate to detail on completion.
> 4. **Statements list** — `GET /api/statements`.
> 5. **Statement detail** — line items, anomaly cards (severity-tinted: HIGH=terracotta, MEDIUM=gold, LOW=muted), stream breakdown.
> 6. **Notifications** — bell tab, polls `GET /api/notifications`.
> 7. **Help chatbot** — `POST /api/help-chat` with `{message, history?}`.
>
> **Brand**: navy `#1F3A5F`, gold `#D4A24E`, cream `#FAF7F2`, sage `#7A9B7E`, terracotta `#C5734D`. Crimson Pro headings + IBM Plex Sans body via `@expo-google-fonts`.
>
> **Tone**: warm, plain English, never patronising. Never invent dollar figures. Always include "AI may be incorrect — verify before acting" near anomalies.
>
> **Defer to web** (deep-link `https://wayly.com.au/...`):
> - Stripe checkout / plan changes
> - Resources / glossary / articles
> - AI Tools (Budget Calculator, Price Checker, etc.)
>
> **Do NOT include** the "Made with Emergent" badge per user request.
>
> Reference doc lives at `/app/memory/MOBILE_AGENT_HANDOFF.md` in the source repo (push via Save to GitHub on the web project, then import into this project).

---

## 10. Pre-flight checklist before pointing the Mobile Agent at production

- [ ] Web project deployed (so `*.emergentagent.com` URL is stable).
- [ ] Custom domain `wayly.com.au` linked (optional — emergentagent.com URL also works).
- [ ] CORS = `*` in backend `.env` ✅ (already set).
- [ ] JWT `Authorization: Bearer` works ✅ (already set).
- [ ] `Save to GitHub` on this project so the Mobile Agent can import the repo for context.

---

## 11. What stays on web (do NOT port to mobile v1)

- Stripe Checkout & plan switching (use web deep-link).
- All 8 public AI tools (Statement Decoder, Budget Calc, Price Checker, etc.) — they're conversion funnels for anonymous users; mobile users are already authenticated.
- Resources hub (glossary, articles, templates) — long-form content reads better on web.
- Advisor multi-client portal (B2B) — desktop is the right surface.
- Settings → Family members management (deep-link to web).

---

## 10. ADMIN MOBILE APP (separate variant — for super_admin / ops / support / content roles)

If you're also building the Wayly admin mobile app (triage tool for staff), refer
to the focused spec below. **The admin app is a separate build target from the
consumer app** — different login, different design system (dark slate), different
audience (5-10 staff users vs. tens of thousands of customers).

### Admin auth (TOTP-protected — same backend as web admin)

```
POST   /api/admin/auth/login         { email, password }
  → { requires_2fa: true, temp_token, role }
  OR { requires_2fa_setup: true, setup_token, qr_data_uri, secret, role }

POST   /api/admin/auth/2fa/verify    { temp_token, code }      → { token, admin }
POST   /api/admin/auth/2fa/enable    { setup_token, code }     → { token, admin, backup_codes }  // shown ONCE
POST   /api/admin/auth/logout        → { ok: true }
```

Store `token` in Keychain / Keystore. Send as `Authorization: Bearer {token}`
on every admin call. Auto-logout after 30 min idle.

### Mobile push notifications (FCM + Expo supported)

The backend has device-registration endpoints ready to consume FCM or Expo push
tokens. Triggers already wired:

| Event                          | Pushed to roles                                       |
| ------------------------------ | ----------------------------------------------------- |
| New P1 support ticket created  | super_admin, operations_admin, support_admin          |
| Stripe payment failure webhook | super_admin, operations_admin                         |
| New privacy data request       | super_admin, operations_admin, support_admin          |

#### Device registration

```
POST   /api/admin/devices
  Body: { token: "ExponentPushToken[xxx]" | "fcm-token-xxx",
          platform: "ios" | "android",
          provider: "expo" | "fcm",
          app_version?: "1.0.0",
          device_name?: "Antony's iPhone 16 Pro" }
  → { ok: true, device_id, refreshed: bool }

GET    /api/admin/devices        → { devices: [...], total }   // tokens NOT returned
DELETE /api/admin/devices/{id}   → { ok: true }                // unregister (sign-out, lost phone)
POST   /api/admin/devices/test-push → { ok: true, result: {...} }  // fires test push to all this admin's devices
```

The register endpoint is idempotent — sending the same token twice returns
`refreshed: true` and bumps `last_seen_at`.

#### Notification payload shape (data the OS hands you on tap)

```js
{
  type: 'ticket_p1' | 'payment_failed' | 'data_request' | 'test',
  ticket_id?: string,
  session_id?: string,   // for payment_failed
  user_id?: string,
  request_id?: string,   // for data_request
  ts?: string,
}
```

Use the `type` field to deep-link to the right screen. For instance:
- `ticket_p1` → `/tickets/{ticket_id}`
- `payment_failed` → `/users/{user_id}`
- `data_request` → `/data-requests` (then highlight `request_id`)

#### Provider choice

- **Recommended:** Expo Push (no creds, works out-of-box if mobile app is built
  with Expo SDK). Backend will POST to `https://exp.host/--/api/v2/push/send`.
- **Alternative:** FCM directly. Set `FCM_SERVER_KEY` env var on backend.
  Without it, FCM sends are mocked (logged but no actual delivery).

### Admin RBAC

`admin.admin_role` is one of: `super_admin`, `operations_admin`,
`support_admin`, `content_admin`. Hide tabs/actions the user's role can't
access. Backend enforces too.

### Admin mobile v1 screens (build in this order)

1. **Inbox / triage** — combines: open P1 tickets, failed payments (24h), new
   data requests, system health warnings. Endpoints:
   - `GET /api/admin/ticket-reports` (P1 count, oldest unresolved)
   - `GET /api/admin/tickets?status=open&priority=P1`
   - `GET /api/admin/failed-payments?days=1`
   - `GET /api/admin/data-requests?status=received`
   - `GET /api/admin/system-health`
2. **Ticket detail + reply** —
   `GET /api/admin/tickets/{id}` · `POST /api/admin/tickets/{id}/messages` ·
   `PUT /api/admin/tickets/{id}` · macros via `GET /api/admin/macros`.
3. **User lookup** — search via `GET /api/admin/search?q=...`, profile via
   `GET /api/admin/users/{id}/profile`. Actions: suspend, extend trial.
4. **System health + maintenance toggle** — `GET /api/admin/system-health` ·
   `GET/POST /api/admin/maintenance` (super only, biometric-confirm before flip).
5. **Privacy data requests** — `GET /api/admin/data-requests` · `PUT /.../{id}`.
6. **Audit log** (read-only) — `GET /api/admin/audit-log?page_size=50`.

### Admin design tokens (dark slate — different from consumer cream)

```js
export const adminColors = {
  bg:        '#0F172A',  // slate-900
  card:      '#1E293B',  // slate-800
  border:    '#334155',  // slate-700
  text:      '#E2E8F0',
  muted:     '#94A3B8',
  info:      '#63B3ED',
  active:    '#48BB78',  // success / healthy
  trial:     '#F6AD55',  // warning / in-progress
  critical:  '#FC8181',  // danger / failed / P1
  red:       '#E53E3E',  // admin brand accent
  gold:      '#D4A24E',  // occasional accent — match consumer brand
};
```

### Out of scope for admin v1 (use web)
- Email campaign builder, template editor
- CMS authoring (articles / glossary / templates / changelog)
- Admin accounts CRUD (create/invite/2FA reset)
- Feature flags CRUD
- CSV exports, MRR charts, cohort tables
- Impersonation

---

## 10. New features added in iter27–30 (Feb 2026) — mobile parity guide

This block was added after the original handoff. Treat this as the **delta** the mobile agent must support to reach feature-parity with web.

### 10.1 Adviser plan (`adviser` · $299 AUD/mo · 25 clients · 7-day trial)
A new pricing tier for **financial advisers** managing many clients. Plan literal is now `Literal["free","solo","family","adviser"]` everywhere.

- **Billing**:
  - `POST /api/billing/start-trial` body `{plan: "adviser"}` → 7-day trial.
  - `POST /api/billing/checkout` body `{plan: "adviser", origin_url}` → Stripe Checkout.
  - `POST /api/billing/upgrade` body `{plan: "adviser"}` → in-app upgrade.
- **Routing**: After login an adviser-plan user does NOT have a household — route them to the **Adviser Portal** screen, not the consumer dashboard.
- **Plan-gating helper** on backend: `require_plan("adviser", feature_label=...)` returns 401/403 with `{error:"plan_required", current_plan, required_plans, redirect:"/pricing"}`. Mobile should display the message and offer an in-app deep link to upgrade.

### 10.2 Adviser Portal endpoints
All require `plan="adviser"` (otherwise 403). Mobile should expose this as a tab in the bottom nav when `user.plan === "adviser"`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/adviser/summary` | Quick stats: `{plan, max_clients, clients_total, clients_active, clients_invited, seats_remaining}` |
| GET | `/api/adviser/clients` | Roster (up to 500). Each row: `{id, client_name, client_email, status, notes, linked_user_id, linked_household_id, invite_token, invite_sent_at, created_at, updated_at}` |
| POST | `/api/adviser/clients` | Body `{client_name, client_email, notes?}`. Generates `invite_token`, fires branded **Resend** email with `/signup?plan=family&invite=<token>` CTA. Auto-links if email already exists. 409 on duplicate. 403 `client_cap_reached` at 25 clients. |
| PATCH | `/api/adviser/clients/{cid}` | Update `client_name / notes / status` (`invited / active / inactive / archived`) |
| DELETE | `/api/adviser/clients/{cid}` | Remove from roster (does NOT delete client's data) |
| POST | `/api/adviser/clients/{cid}/resend-invite` | Rotates token + re-sends email. 409 `already_linked` if accepted. |
| GET | `/api/adviser/clients/{cid}/snapshot` | Per-client read-only JSON: `{client, household:{participant_name, classification, provider_name, grandfathered}, metrics:{statements_count, line_items_total, anomalies_total, spent_total_aud, flagged_sample[]}, recent_statements[], members_count}`. 409 `client_not_linked` if not yet linked. |
| GET | `/api/adviser/clients/{cid}/review-pack.pdf` | Returns a single-page A4 **PDF review pack** (Content-Type: application/pdf, Content-Disposition attachment). Render natively via `expo-sharing` + `expo-file-system`. |
| GET | `/api/public/adviser/invite/{token}` | **Public**, no auth — used by the signup deep-link to fetch `{client_name, client_email, adviser_name, notes}`. 404 unknown / 409 `already_accepted`. |

### 10.3 Adviser-invite deep link handling
- The Resend email points to `https://wayly.com.au/signup?plan=family&invite=<token>`.
- **Mobile must register a Universal Link / App Link** for `/signup` and read the `invite=` query param. If present:
  1. `GET /api/public/adviser/invite/<token>` to preview `{adviser_name, client_name, client_email, notes}`.
  2. Pre-fill name + email on the signup form.
  3. Pass `invite` field through to `POST /api/auth/signup` body.
  4. Backend auto-flips the matching adviser_clients row to `linked_user_id=<new_user.id>`, status=`active`.

### 10.4 Signup body — new optional field
```ts
type SignupRequest = {
  email: string;
  password: string;     // 8+ chars, mixed case + number + symbol; cannot include name/email
  name: string;
  role?: "caregiver" | "participant";
  plan?: "free" | "solo" | "family" | "adviser";
  invite?: string;      // ← NEW: adviser invite token (24-char url-safe)
}
```

### 10.5 Document Vault (`/api/documents`)
Household-scoped file storage. **Caps: 10 MB per file, 100 MB per vault.**

Categories enum: `assessment | statement | care_plan | medical | financial | legal | other`.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/documents` | `{documents[], scope: "owner"\|"adviser", limits:{max_file_bytes, max_vault_bytes, vault_used_bytes, vault_remaining_bytes}, categories[]}`. Optional `?category=` filter. |
| POST | `/api/documents` | **multipart/form-data**: `file`, `category`, `title?`, `notes?`. Mobile: use `expo-document-picker` + `expo-image-picker` (camera scan!). 413 with `error:"file_too_large"` or `"vault_full"`. |
| GET | `/api/documents/{id}` | Metadata only (no file bytes). |
| GET | `/api/documents/{id}/download` | Binary stream — save to device with `expo-file-system` and open with `expo-sharing`. |
| PATCH | `/api/documents/{id}` | Update title / category / notes. |
| DELETE | `/api/documents/{id}` | Remove. |
| POST | `/api/documents/{id}/send-to-decoder` | Only for `category="statement"`. Returns `{job_id, status:"pending"}` — poll `/api/statements/upload-job/{job_id}` until `status="done"`. |
| GET | `/api/documents?as_client_id=<cid>` | **Adviser read-only** — same shape but `scope:"adviser"`. Plan-gated to adviser. Same for `GET /{id}` and `/{id}/download`. POST/PATCH/DELETE are owner-only. |

**Mobile UX recommendation**: The mobile app's killer feature here is **camera-scan a paper statement → upload → auto-decode**. Combine `expo-camera` + the existing OCR pipeline (which already handles JPEG/PNG/HEIC/PDF).

### 10.6 Extended Functionality Build (Features 4–13)

All household-scoped except provider-ratings (user-scoped). All CRUD endpoints follow the same pattern — body validation maps to FastAPI 422; missing household → 409 `no_household`.

| Resource | Base path | Body / fields | Notes |
|---|---|---|---|
| **Visits** | `/api/visits` | `title`, `starts_at` (ISO), `duration_minutes`, `location?`, `provider?`, `notes?`, `kind: appointment\|home_visit\|telehealth\|assessment\|other` | `?upcoming_only=true` filter |
| **Budget Alerts** | `/api/budget-alerts` | `stream: Clinical\|Independence\|Everyday Living\|lifetime\|all`, `threshold_pct: 10-100`, `notify_email`, `active` | Worker for actual fire is **NOT YET wired** — alerts persist but don't trigger emails yet. |
| **Provider Switch** | `/api/provider-switch` | `current_provider`, `target_provider?`, `reason?`, `stage: considering\|comparing\|notice_given\|transition\|complete`, `checklist: {7 boolean keys}`, `notes?` | **Single workflow per household**. PATCH supports stage + checklist merge. |
| **AT-HM Tracker** | `/api/athm` | `kind: AT\|HM`, `name`, `status: proposed\|approved\|ordered\|installed\|declined`, `cost_aud?`, `supplier?`, `notes?` | |
| **Correspondence** | `/api/correspondence` | `direction: in\|out`, `channel: email\|letter\|phone\|sms\|in_person`, `counterparty`, `subject`, `body_summary?`, `occurred_at` (ISO), `follow_up_at?`, `attachment_doc_id?` | |
| **Referrals** | `/api/referrals` | `referred_to`, `kind: GP\|specialist\|allied_health\|support_service\|other`, `contact?`, `reason?`, `status: open\|in_progress\|completed\|declined`, `referred_at`, `completed_at?`, `notes?` | |
| **Provider Ratings** | `/api/provider-ratings` | `provider_name`, `stars: 1-5`, `comment?`, `would_recommend?` | **USER-scoped** (not household). Each user's private list. |

### 10.7 Global Search
`GET /api/search?q=<2-200 chars>` returns `{q, count, results[]}`. Each result:
```ts
type SearchResult = {
  type: "statement" | "document" | "family_message" | "visit" | "correspondence" | "referral";
  id: string;
  title: string;
  subtitle: string;
  href: string;  // web path — map to native screen in mobile
};
```
Mobile: implement as a global "Search" tab or a header magnifying-glass icon. Debounce 250 ms. Results without a household → empty (200).

### 10.8 Summary Reports
`GET /api/reports/summary.pdf?period=quarter|all` — one-page A4 PDF (reportlab) covering household + at-a-glance metrics + recent decisions. Same download pattern as the adviser review pack.

### 10.9 Offline mode (web service worker — mobile equivalent)
Web has a minimal service worker (`/sw.js`) + an `OfflineIndicator` banner. **For mobile, the same UX should use React Native's NetInfo + a queue:**
- Detect `NetInfo.useNetInfo().isConnected === false` → show a sticky banner ("You're offline; new uploads will retry when you're back").
- Persist pending mutations in `AsyncStorage`/SQLite and replay them on reconnect. (Web has this on the roadmap — mobile is the better surface for a true offline-first build.)

### 10.10 New / updated frontend routes (for parity mapping)
| Web route | Suggested mobile screen | Min plan |
|---|---|---|
| `/adviser` | AdviserPortalScreen | adviser |
| `/app/documents` | DocumentVaultScreen | any household user |
| `/app/calendar` | VisitCalendarScreen | any household user |
| `/app/budget-alerts` | BudgetAlertsScreen | any household user |
| `/app/provider-switch` | ProviderSwitchScreen | any household user |
| `/app/at-hm` | AthmTrackerScreen | any household user |
| `/app/correspondence` | CorrespondenceScreen | any household user |
| `/app/referrals` | ReferralsScreen | any household user |
| `/app/ratings` | ProviderRatingsScreen | any user |
| `/app/reports` | SummaryReportsScreen | any household user |
| `/signup?plan=adviser` | SignupScreen (plan picker) | — |
| `/signup?invite=<token>` | SignupScreen (preview banner) | — |

### 10.11 Test accounts (already provisioned in the shared DB)
| Email | Password | Plan | Use case |
|---|---|---|---|
| `cathy@example.com` | `testpass123` | family | Caregiver with a real household + statements + family chat |
| `mark.adviser@example.com` | `AdviserPass1!` | adviser | Roster + linked client (Cathy can be added) |
| `hello@techglove.com.au` | `AdminPass!2026` | super-admin | Admin Dashboard (requires TOTP — see `test_credentials.md`) |

### 10.12 What to give the mobile agent
Hand the mobile agent **all four** of these files (in this order):
1. This file (`MOBILE_AGENT_HANDOFF.md`) — full API + UX contract
2. `/app/memory/PRD.md` — product context + every feature shipped so far
3. `/app/memory/test_credentials.md` — accounts they can sign in with
4. The screenshot or Figma/Plain text design of the consumer dashboard so they can replicate visual brand (cream `#FAF7F2`, navy `#1F3A5F`, gold `#D4A24E`, sage `#7BA28F`, terra `#B7553A`)

Plus this one-paragraph onboarding prompt:

> **Mobile Agent prompt** — "Build a React Native (Expo SDK 51+) iOS/Android client for Wayly, an Australian Support-at-Home aged-care SaaS. The backend already exists — read `MOBILE_AGENT_HANDOFF.md` cover-to-cover before writing a single line of code. Base URL comes from `EXPO_PUBLIC_API_URL`. Auth is JWT bearer via `expo-secure-store`. Use React Navigation v6 (bottom tabs + native stack). Required v1 surface: Auth (email + Google + biometric unlock), Dashboard, Statements (with camera-scan upload via expo-camera), Document Vault, Visit Calendar, Family chat, Ask Wayly chat, Notifications bell, Settings/Billing (deep-link to web for Stripe). Required v1.5: Adviser portal screen (only when `user.plan === 'adviser'`) with snapshot + PDF review pack. Required v2: the rest of Features 4–13. Use the Wayly brand tokens listed in section 8. Push notifications via FCM/APNs registering with `POST /api/admin/devices`. Treat the web app as the source of truth for UX flows — when in doubt, mirror it. NEVER reimplement business logic; always call existing API endpoints."

_Last updated: Feb 2026 · iter 30 (Adviser plan + Document Vault + Features 4–13)_
