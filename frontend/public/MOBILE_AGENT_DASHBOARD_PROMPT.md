# Mobile Agent Prompt — Full Wayly Dashboard Parity

Paste everything from the `===` separator below into the mobile agent. It's a single self-contained brief covering **every module, route, API call, and behavior** the web dashboard exposes, plus the participant switcher, billing flows, settings, auth, and brand tokens.

The web app is the single source of truth. **If anything is unclear, read the file paths referenced inline** — they all live in this repo and the mobile agent has filesystem access to it.

The earlier handoff bundle at `/app/wayly-mobile-handoff.zip` (and `/app/docs/wayly-mobile-handoff.zip`, and `https://<wayly-domain>/wayly-mobile-handoff.zip`) covers colours, fonts, logos and icons. **This prompt is the structural / functional spec — use both together.**

===

# Mobile App — Wayly Caregiver Dashboard (full parity with web)

You're building the authenticated caregiver experience on mobile (Capacitor over our existing React app, OR a fresh React-Native / Expo app — your choice; both are acceptable). The web app at https://wayly.com.au is the spec. **Every category, every module, every flow on the web dashboard must exist on mobile** — no omissions.

You can read the web codebase directly. Key paths (clone or check out the repo):

| What | Path |
|---|---|
| Routing | `frontend/src/App.js` (lines 264–284 are the authenticated `/app/*` routes) |
| Sidebar groups & nav | `frontend/src/components/Layout.jsx` (`navGroups` const, lines 22–71) |
| Participant context | `frontend/src/context/ParticipantsContext.jsx` |
| Auth context | `frontend/src/context/AuthContext.jsx` |
| HTTP client / interceptors | `frontend/src/lib/api.js` |
| Participant switcher UI | `frontend/src/components/ParticipantSwitcher.jsx` |
| Notifications bell | `frontend/src/components/NotificationsBell.jsx` |
| Dashboard home | `frontend/src/pages/CaregiverDashboard.jsx` |
| Settings (10 tabs) | `frontend/src/pages/Settings.jsx` |
| Billing logic | `frontend/src/pages/Settings.jsx` `BillingTab()` (lines 84–270) |

---

## 1. Navigation taxonomy — must be IDENTICAL on mobile

The web sidebar groups 19 modules into **5 named categories**, plus 2 secondary items, plus admin (gated). The mobile app must use the **same group names**, **same modules**, **same order**.

```
TODAY
  Dashboard            → /app                  (icon: LayoutDashboard) ★ mobile bottom-nav
  Family wall          → /app/wall             (icon: Heart)           ★ mobile bottom-nav
  Ask Wayly            → /app/chat             (icon: MessageCircle)

MONEY & STATEMENTS
  Statements           → /app/statements       (icon: FileText)        ★ mobile bottom-nav
  Budget alerts        → /app/budget-alerts    (icon: Bell)
  Reports              → /app/reports          (icon: FileBarChart)

THEIR CARE
  Care team            → /app/family           (icon: Users)
  Calendar             → /app/calendar         (icon: Calendar)
  Hospital mode        → /app/hospital         (icon: HeartPulse)
  AT & HM              → /app/at-hm            (icon: Wrench)
  Care-plan changes    → /app/amendments       (icon: FilePenLine)

PROVIDERS & PAPERWORK
  Documents            → /app/documents        (icon: FolderArchive)
  Correspondence       → /app/correspondence   (icon: Mail)
  Switch provider      → /app/provider-switch  (icon: Repeat)
  Ratings              → /app/ratings          (icon: Star)

YOUR ACCOUNT
  Participants         → /app/participants     (icon: UserPlus)
  Referrals            → /app/referrals        (icon: Share2)
  Audit log            → /app/audit            (icon: ScrollText)

SECONDARY (below divider)
  AI Tools             → /ai-tools             (icon: Sparkles)
  Settings             → /settings/profile     (icon: Settings)

ADMIN (only if user.is_admin === true)
  Admin                → opens /admin/login in an in-app browser
```

### Mobile-specific nav rules

- **Bottom tab bar** = 4 items: Dashboard, Family wall, Statements, **More** (opens a drawer with everything else). These are exactly the items flagged `mobile: true` in `Layout.jsx`.
- **More drawer** renders the same 5 grouped categories, collapsible, with sticky group headers.
- **Header on every screen** must show:
  - Wayly logo (mark) on the left → tap returns to `/app`.
  - Notification bell (badge with unread count from `GET /api/notifications`).
  - **Participant switcher pill** with the active participant's coloured swatch + first initial + first name + classification (`L{classification}`). Tap opens the switcher (see §3).
  - Plan badge (`FREE` / `SOLO` / `FAMILY` pill) → tap goes to Settings → Plan & Billing.
  - User menu (Dashboard / Profile & settings / Plan & billing / Members / Help & support / Sign out).

---

## 2. Authentication

All requests go to `${REACT_APP_BACKEND_URL}/api/*`. Use axios or fetch — the contract is documented below.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/signup` | new account |
| POST | `/api/auth/login` | returns `{ token, refresh_token, user }` |
| POST | `/api/auth/refresh` | swap `refresh_token` for a new access token |
| GET  | `/api/auth/me` | current user (used to hydrate session on launch) |
| POST | `/api/auth/forgot` | send reset email |
| POST | `/api/auth/reset` | reset with code |
| POST | `/api/auth/mfa/setup` · `/auth/mfa/enable` · `/auth/mfa/disable` | TOTP 2FA |

### Token storage

Mirror the web app's localStorage keys verbatim so a user on both surfaces stays signed in:

| Key | Value |
|---|---|
| `kindred_token` | access JWT (Bearer) — sent as `Authorization: Bearer ...` |
| `kindred_refresh_token` | long-lived refresh token |
| `wayly_active_participant_id` | UUID of the active participant (see §3) |
| `wayly_impersonation_token` | admin-only — read-only mode if present (writes blocked client-side) |

Use the **secure storage** APIs on iOS (Keychain) and Android (EncryptedSharedPreferences) for `kindred_token` + `kindred_refresh_token`. The other keys can live in regular storage.

### Refresh-token rotation (the web app does this — match it)

`frontend/src/lib/api.js` lines 47–78 implement this. On any 401 from a non-`/auth/*` route:

1. POST `/api/auth/refresh` with `{ refresh_token }`.
2. If it returns `{ token, refresh_token? }` → save them and **retry the original request once** with the new bearer token.
3. If refresh fails → clear both tokens, kick user to `/login`.

A single in-flight refresh must be deduplicated (a `_refreshPromise` guard in the web; use the same pattern).

### Auth UI

- `/login` — email + password. Show "Continue with Google" → opens `auth.emergentagent.com` in an in-app browser, then handles the `/auth/callback?token=...` redirect. (See `frontend/src/pages/Login.jsx` and `frontend/src/pages/AuthCallback.jsx`.)
- `/signup` — name, email, password, plan picker (Free / Solo / Family). The chosen paid plan must trigger a `POST /api/billing/start-trial` immediately after signup; if trial is already used, the user is bounced to Stripe Checkout.
- `/forgot` and `/reset` — match the web flows.
- `/onboarding` — multi-step (participant details, provider lookup, classification self-check). Reached when `user.household` is null. See `frontend/src/pages/Onboarding.jsx`.

---

## 3. Participant switching (CRITICAL — this is the spine of the app)

Wayly is a multi-participant app: one caregiver can manage Mum, Dad and an aunt at once. Every data-bearing API call must be scoped to one participant, and the user can switch at any time.

### Data shape

`GET /api/account` returns:

```jsonc
{
  "summary": {
    "account_id": "uuid",
    "base_plan": "FREE | SOLO | FAMILY",
    "base_plan_status": "ACTIVE | TRIALING | CANCELED | ...",
    "trial_ends_at": "ISO8601 | null",
    "base_price_monthly": 39.0,
    "addon_price_monthly": 19.0,
    "addon_count": 0,
    "addon_monthly_total": 0.0,
    "monthly_total": 39.0,
    "participants_included": 2,
    "participants_active": 2,
    "participants_max": 10,
    "seat_limit": 3,
    "seats_used": 1,
    "pending_downgrade_to": null,
    "pending_downgrade_at": null
  },
  "participants": [
    {
      "id": "uuid",
      "account_id": "uuid",
      "household_id": "uuid | null",
      "first_name": "Dorothy",
      "last_name": "",
      "date_of_birth": "YYYY-MM-DD | null",
      "classification": 4,                    // Support at Home level 1-8
      "provider_name": "BlueBerry Care",
      "provider_id": "uuid | null",
      "household_email": "dorothy-1c8113@in.wayly.com.au",
      "is_primary": true,
      "status": "ACTIVE | PENDING_REMOVAL | REMOVED",
      "color_index": 0,                       // 0-4, drives swatch colour
      "created_at": "ISO8601",
      "updated_at": "ISO8601"
    }
  ],
  "addons": [{ "participant_id": "uuid", "status": "ACTIVE", ... }]
}
```

### Active-participant logic (replicate exactly)

`frontend/src/context/ParticipantsContext.jsx` is the canonical implementation. Replicate it as a global store (Zustand, Redux, MobX, or React Context — your call):

1. On launch: read `wayly_active_participant_id` from storage.
2. Hydrate by calling `GET /api/account`.
3. If the saved ID is in the returned `participants` array → that's the active one.
4. Otherwise pick the one with `is_primary: true`, falling back to `participants[0]`.
5. **Auto-inject** the active id as `X-Participant-Id: <uuid>` header on every authenticated API call — this is how `/budget/current`, `/statements`, `/chat/history`, etc. know whose data to return. Match the interceptor in `frontend/src/lib/api.js` lines 14–23.
6. When the user picks a different participant from the switcher:
   - Write the new id to `wayly_active_participant_id` in storage.
   - Update the URL deep-link param `?p=<shortcode>` (web uses first-name lowercased; mobile can use the UUID).
   - **Invalidate every participant-scoped query cache** — broadcast a `wayly:participant-changed` event (or whatever equivalent you wire) so all open screens refetch.
   - Re-mount the `<main>` content (web uses `key={activeParticipant.id}`). On mobile this is "pop to root of the current tab and reload".

### Participant switcher UI

- Pill button: coloured 3 px left inset (from `COLOR_SWATCHES`), 20 px circle with first initial, first name truncated at 140 px, classification chip (`L4`), chevron-down.
- Tap → bottom sheet (mobile) or popover (tablet) listing every participant:
  - Each row: coloured left border, 32 px circle with initial, `Firstname Lastname`, classification + provider on a second line.
  - Active row has a teal-tinted background.
  - `is_primary` rows get a small "Primary" gold pill.
  - `status === "PENDING_REMOVAL"` rows get an amber AlertCircle and "Removal pending — back to active in 30 days" subtext.
- Sheet footer: **"+ Add a participant"** → routes to `/app/participants?add=1`. Hide if `participants_active >= participants_max`.

Colour swatch palette (same as web — keep them mapped by `color_index`):

```
['#0E4D52', '#3D8488', '#54775A', '#A5512B', '#6E6559']  // teal-600, teal-400, sage-500, clay-500, neutral-600
```

(The web app currently uses the *old* swatches at `frontend/src/components/ParticipantSwitcher.jsx:13` — replace with the brand colours above on mobile.)

### Single-participant mode

If `items.length === 1`, the switcher is **disabled** (`collapsed`). Still show the active person's initial + name so the carer never doubts whose data they're looking at, just no chevron and no tap action.

---

## 4. Billing & plan logic (the bit you specifically asked about)

The web `BillingTab()` in `frontend/src/pages/Settings.jsx` lines 84–270 is the canonical reference. Mobile must show:

### Current plan card

- Crown icon + "Current plan" label.
- Plan name + price + period (`Family · $39/mo`).
- **If trialing** (`sub.status === "trialing"` and `sub.trial_ends_at` exists): gold-bordered "Free trial · N days left · ends {weekday short date}" chip.
- **If active subscription**: "Renews {date}" or "Ends {date}" if `cancel_at_period_end` is true.
- If active and not already cancelled: "Cancel auto-renewal" link (red/clay), tap calls `POST /api/billing/cancel`.

### Participants & add-ons summary card (the one you mentioned)

Mirror the web's `billing-participants-card`. Four mini-tiles in a 2×2 grid on mobile:

| Tile | Source | Format |
|---|---|---|
| Base plan | `summary.base_plan` | "Family" |
|  | `summary.base_price_monthly` | "$39.00/mo" |
| Participants | `summary.participants_active` `/` `summary.participants_included` included | "2 / 2 included" |
|  | `summary.participants_max` | "Max 10" |
| Add-ons | `summary.addon_count` `@` `summary.addon_price_monthly` each | "0 @ $19.00/mo each" |
|  | `summary.addon_monthly_total` | "Subtotal $0.00/mo" |
| Monthly total | `summary.monthly_total` | "$39.00" + "excl. tax" |

Under the tiles, a **list of active participants** (`participants.filter(p => p.status === "ACTIVE")`), each row showing:

- Name + "Primary" gold pill if `is_primary`.
- Right side: "+$19.00/mo add-on" if `addons.find(a => a.participant_id === p.id && a.status === "ACTIVE")` else "Included in base plan".

A "Manage participants" link in the header routes to `/app/participants`.

### Plan picker (3 cards: Free / Solo / Family)

Cards in a grid (mobile = stacked). Each card:

- Plan name + price/period.
- If `isCurrent` → "✓ Current" chip (sage).
- If `p === 'free'` and currentPlan !== 'free' → "Downgrade to Free" outline button → confirm dialog → `POST /api/billing/downgrade-to-free`.
- If `activeSub` → "Switch to {Plan}" filled button → `POST /api/billing/upgrade` with `{ plan }`.
- If no active sub and `p !== 'free'` → "Start {Plan}" button → see Trial logic below.

### Trial flow (start a paid plan)

```text
try POST /api/billing/start-trial { plan }
  → 200 ok            → toast "Your free 7-day Family trial is active"; refresh user + account; stay on page
  → 400 trial_used    → fall through to checkout
  → other error       → toast error and stop

POST /api/billing/checkout { plan, origin_url: <app URL> }
  → opens Stripe Checkout in an in-app browser
  → on success Stripe redirects to /billing/success → backend webhook updates the sub → frontend polls /api/billing/subscription
```

### Family → Solo downgrade guard

The web blocks downgrade-to-Solo if the account has > 1 active participant (Solo allows only 1). Replicate:

```js
if (plan === "solo" && currentPlan === "family") {
  const active = summary.participants_active ?? participants.filter(p => p.status === "ACTIVE").length;
  if (active > 1) {
    showBlockingToast({
      title: "Remove additional participants before downgrading",
      body: `Solo includes 1 participant. You currently have ${active}. Remove the extras (or downgrade individual add-ons) before switching to Solo.`,
      action: { label: "Manage participants", onTap: () => navigate("/app/participants") },
    });
    return;
  }
}
```

### Billing endpoints (full list)

| Method | Path | Body | Purpose |
|---|---|---|---|
| GET | `/api/billing/subscription` | — | current Stripe sub object |
| GET | `/api/account` | — | base plan + participants + add-ons summary |
| POST | `/api/billing/start-trial` | `{ plan }` | 7-day free trial (one per account ever) |
| POST | `/api/billing/checkout` | `{ plan, origin_url }` | Stripe Checkout URL |
| POST | `/api/billing/upgrade` | `{ plan }` | mid-cycle plan change |
| POST | `/api/billing/cancel` | — | cancel at period end |
| POST | `/api/billing/downgrade-to-free` | — | immediate downgrade |

---

## 5. Per-module specs (every screen the web has)

For each module: route, primary endpoints, what the screen does, key data-testid for parity testing. **All endpoints are scoped to the active participant via the `X-Participant-Id` header.**

### 5.1 Dashboard (`/app` → `CaregiverDashboard.jsx`)

Top stack:
- `GET /api/budget/current` → Support at Home current quarter spend, remaining, anomalies. Donut + 4 category bars.
- `GET /api/statements` (limit 5) → most-recent statements list (tap → detail).
- `GET /api/family-thread` (limit 5) → latest care-team messages.
- `GET /api/audit-log` (limit 5) → recent activity.
- `GET /api/chat/history` (limit 5) → last Ask Wayly Q&A.

Each card has a "View all" link to its full module. Pull-to-refresh refetches everything.

### 5.2 Family wall (`/app/wall`)

A social-feed style stream. Posts, reactions, "added a document" event cards. See `frontend/src/pages/extended/FamilyWall.jsx`.

### 5.3 Ask Wayly chat (`/app/chat` → `Chat.jsx`)

- `GET /api/chat/history` → list of past messages.
- `POST /api/chat` `{ message }` → returns assistant response (streamed if available; web uses non-streaming).
- "Start fresh chat" → `DELETE /api/chat/history` (or whatever the reset endpoint is in `frontend/src/pages/Chat.jsx`).
- Render markdown in assistant replies. Inline citations link to the statement / care plan / policy doc.

### 5.4 Statements (`/app/statements` + `/app/statements/:id`)

- List: `GET /api/statements` — paginated, sortable by date, total.
- Upload: `/app/statements/upload` — file picker + drop zone → `POST /api/statements/upload` (multipart). Mobile: use the native camera roll + document picker. **Chunk uploads** (Capacitor file plugin or `expo-file-system`) for files > 5 MB to dodge edge-proxy limits.
- Detail: `GET /api/statements/:id` — anomalies tagged with severity (info / warn / error), expandable line items, "Email provider" CTA → `POST /api/contact` with templated body.

### 5.5 Budget alerts (`/app/budget-alerts`)

- `GET /api/budget-alerts` → threshold list (e.g. ">80% of quarterly Personal Care budget").
- `POST /api/budget-alerts` / `PATCH` / `DELETE` for CRUD.

### 5.6 Reports (`/app/reports`)

- `GET /api/reports` → list of 8 PDF report types.
- `POST /api/reports/generate { type, range }` → returns `{ download_url }`. Mobile: open URL in in-app browser or use a download helper.

### 5.7 Care team (`/app/family` → `FamilyThread.jsx`)

Threaded chat with the care team. `GET /api/family-thread`, `POST /api/family-thread` `{ body, attachments? }`. Show member avatars, role pills (carer / family / advisor).

### 5.8 Calendar (`/app/calendar`)

- `GET /api/calendar?from=&to=` → list of upcoming visits.
- "Today" / "Week" / "Month" toggles.
- Tap event → detail sheet with carer name, role, ETA, address, notes.

### 5.9 Hospital mode (`/app/hospital`)

A red-tinted screen for emergencies. One-tap "Pause services" → `POST /api/hospital/pause`. Lists meds, allergies, advance care directive PDF, key contacts.

### 5.10 AT & HM (`/app/at-hm`)

Assistive Technology + Home Modifications tracker. CRUD via `/api/at-hm` endpoints.

### 5.11 Care-plan changes (`/app/amendments`)

`GET /api/amendments`, `POST` to log a change request. Shows a diff of the old vs proposed care plan.

### 5.12 Documents (`/app/documents` → `DocumentVault.jsx`)

`GET /api/documents`, `POST /api/documents` (multipart). Mobile: support photo capture → upload as JPEG. Show category tabs (Care plan / Statements / Letters / Other), search.

### 5.13 Correspondence (`/app/correspondence`)

Inbound emails to the per-participant `household_email` (`dorothy-1c8113@in.wayly.com.au`) are surfaced here. `GET /api/correspondence`, `GET /api/inbound/my-address` for "show me my inbox address". The latter must be one-tap copyable on mobile.

### 5.14 Switch provider (`/app/provider-switch`)

Step-by-step wizard. `GET /api/providers`, `POST /api/provider-switch/request`. Outputs a draft letter to the current provider plus a checklist.

### 5.15 Ratings (`/app/ratings`)

`GET /api/ratings`, `POST /api/ratings { provider_id, stars, body }`. Shows aggregate community ratings.

### 5.16 Participants (`/app/participants` → `extended/Participants.jsx`)

The CRUD screen for §3's data.

- `GET /api/account` → list.
- `POST /api/participants` `{ first_name, last_name, classification, provider_name }` → add. Blocks if `participants_active >= participants_max`.
- `PATCH /api/participants/:id` → edit.
- `DELETE /api/participants/:id` → 30-day soft delete (status flips to `PENDING_REMOVAL`).
- `POST /api/participants/:id/undo-removal` → cancel pending removal.

This screen is also reachable from the billing card's "Manage participants" link.

### 5.17 Referrals (`/app/referrals`)

`GET /api/referrals` (your code + share count), `POST /api/referrals/share` (logs a share). Native share sheet on mobile.

### 5.18 Audit log (`/app/audit`)

`GET /api/audit-log?cursor=&limit=` — every action on the account, signed and hashed (immutable). Filter by actor (carer / system / admin) and type. Tappable rows show the full payload.

### 5.19 AI Tools (`/ai-tools` and `/ai-tools/:tool`)

8 tools — all reachable from the dashboard's secondary nav. Most call `POST /api/ai-tools/:slug` with the tool's input shape and render a markdown result with a "Save to documents" CTA.

| Slug | Name |
|---|---|
| `statement-decoder` | Statement Decoder |
| `budget-calculator` | Budget Calculator |
| `provider-price-checker` | Provider Price Checker |
| `classification-self-check` | Classification Self-Check |
| `reassessment-letter` | Reassessment Letter |
| `contribution-estimator` | Contribution Estimator |
| `care-plan-reviewer` | Care Plan Reviewer |
| `family-coordinator` | Family Coordinator |

The first one (`statement-decoder`) is gated to paid plans; the rest are free with a 5/day rate limit. The web checks gating client-side via `user.plan !== "free"` — match that.

---

## 6. Settings (10 tabs)

Web: `/settings/:tab` with `TABS` array at `frontend/src/pages/Settings.jsx:14`. Mobile: a vertical scroll-list with sections (no sidebar). All 10 tabs are mandatory.

| Tab id | Label | Primary endpoints |
|---|---|---|
| `profile` | Profile | `GET /auth/me`, `PATCH /auth/me` |
| `billing` | Plan & Billing | §4 above |
| `members` | Family members | `GET /household/members`, `POST /household/invite`, `DELETE /household/members/:id` |
| `sms` | SMS alerts | `GET/POST /sms-contacts`, `POST /sms-contacts/:id/verify` |
| `digest` | Weekly digest | `GET /digest/preview`, `GET /digest/history`, `POST /digest/send` |
| `notifications` | Notifications | `GET/PUT /notifications/prefs` |
| `appearance` | Appearance | local-only (theme override; usually follows system) |
| `usage` | Usage | `GET /usage` (AI tool call counts, statement uploads) |
| `security` | Security | `POST /auth/mfa/setup` / `enable` / `disable`, password change |
| `danger` | Danger zone | `DELETE /auth/me` (account close), data export request |

---

## 7. Notifications

- `GET /api/notifications` → array of `{ id, kind, body, link, created_at, read_at }`.
- Badge count = length of items where `read_at == null`.
- Tap bell → bottom sheet listing all (newest first). Tapping a notification:
  1. `POST /api/notifications/read { ids: [id] }`.
  2. Navigate to `link`.
- "Mark all read" → `POST /api/notifications/read { ids: [] }` (empty body = mark all).
- Use **push notifications** via FCM / APNs for `kind === "urgent"` (budget breach, statement anomaly, hospital pause). Mobile pull-to-refresh refetches.

---

## 8. Global search (`GlobalSearch.jsx`)

- Header pill on tablet/desktop; on phone surfaces in the More drawer.
- Debounced 300 ms. `GET /api/search?q=...` returns grouped hits across statements, documents, family messages, audit log.

---

## 9. Brand colours (production palette — Feb 2026)

These match `frontend/tailwind.config.js`. Use the centralised tokens from §1 of the earlier handoff doc. Critical highlights:

```ts
brand:       '#0E4D52'   // teal-600 (primary app surface, dark headers)
accent / CTA:'#A5512B'   // clay-500 (every primary button)
success:     '#0F5648'   // for "remaining budget" / "ok" states
warning:     '#A5512B'   // same as accent — also signals attention
error:       '#C0392B'
appBg:       '#FBF8F3'   // warm off-white
surface:     '#FFFFFF'
textPrimary: '#1C2B2D'   // neutral-900
textSecondary:'#524B42'  // neutral-700
border:      '#E7E0D5'   // neutral-200

// dark mode (admin / hospital):
darkSurface: '#072E31'   // teal-800
```

Typography:

- **Fraunces** (variable serif) — every heading (`h1` / `h2` / `h3`). Letter-spacing -0.5%.
- **Inter** (variable sans) — body, labels, buttons.
- **IBM Plex Mono** — dollar amounts, statement IDs, budget figures. `font-variant-numeric: tabular-nums` on **everywhere a $ appears**.

Buttons:

- Primary = pill, clay-500 fill, white text, 48 px tall, 24 px horizontal padding.
- Secondary = pill, white fill, teal-600 1.5 px border, teal-600 text.
- All buttons get a 150 ms hover / pressed transition.

Cards: 16 px radius, 20 px padding, shadow `0 8px 24px -12px rgba(28,43,45,0.18)`.

---

## 10. Behaviors the web has that you MUST replicate

These are easy to miss — check each one off:

- **`X-Participant-Id` injection** on every API call (§3).
- **Refresh-token retry** on 401 (§2).
- **Impersonation read-only mode** — if `wayly_impersonation_token` exists in storage, every POST/PUT/PATCH/DELETE must be rejected client-side with a friendly toast. See `frontend/src/lib/api.js` lines 139–151.
- **Plan badge in header** = `user.plan` uppercase, links to `/settings/billing`.
- **Trial countdown banner** above the main content if `subscription.status === "trialing"`. See `frontend/src/components/TrialCountdownBanner.jsx`.
- **Toast handling**: 429 → warning toast "You've reached the usage limit. Sign up free for more." 503 → "Our AI is taking a short break. Try again in a few minutes." Other errors use `extractErrorMessage()` semantics — handle both `{ detail: "string" }` and `{ detail: { message, error } }`.
- **AUD currency formatting**: `Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" })`. Two variants (whole and 2-dp) — see `formatAUD` and `formatAUD2` in `frontend/src/lib/api.js`.
- **AU date formatting**: `toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })` for compact, full weekday for trial-end labels.
- **Accessibility**: every interactive element has a `data-testid` (see web). Mobile equivalent: `testID` on RN, `data-testid` on Capacitor. Same kebab-case names so smoke tests work cross-surface.
- **Empty states** for every list (no statements yet, no notifications, no participants etc.) — mobile mockups in the web app via `<EmptyState>` component. Reuse the same icon + headline + CTA copy.
- **Skeleton loaders** while data fetches — match the `<Skeleton>` component shapes.
- **Pull-to-refresh** on every list screen (mobile-only).

---

## 11. Data testIDs (must match web for cross-surface smoke testing)

Every interactive element must carry a `testID` (RN) / `data-testid` (Capacitor) matching the web. A non-exhaustive list:

```
brand-link, logout-button, layout-plan-badge, layout-menu-button,
nav-avatar, nav-dropdown, mobile-bottom-nav, mobile-nav-dashboard,
mobile-nav-family-wall, mobile-nav-statements, mobile-nav-more,
participant-switcher-trigger, participant-switcher-menu, participant-option-<id>,
participant-view-link,
chat-page, statement-card-<id>, statement-upload-dropzone,
settings-tabnav, settings-tab-<id>, settings-billing,
current-plan-card, billing-trial-remaining, billing-participants-card,
billing-participants-count, billing-addons-count, billing-monthly-total,
billing-participants-list, billing-participant-<id>,
billing-plan-free, billing-plan-solo, billing-plan-family,
billing-downgrade-free, billing-switch-<plan>, billing-start-<plan>,
billing-manage-participants, cancel-plan-btn,
notif-bell, notif-list, notif-item-<id>
```

Grep the web codebase for `data-testid=` if you need more — there are hundreds; every one needs a mobile equivalent.

---

## 12. Build / shipping

### If you're going with Capacitor (recommended, fastest path)

1. `npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`
2. `npx cap init "Wayly" com.wayly.app --web-dir=build`
3. `npx cap add ios && npx cap add android`
4. `yarn build` (already produces a mobile-friendly bundle thanks to the web app's responsive layout — the web hides the sidebar and shows the bottom nav at `md` breakpoint).
5. `npx cap sync` → open in Xcode / Android Studio.
6. Install the asset bundle from §1-§3 of the handoff doc (`wayly-mobile-handoff.zip` — branding, icons, fonts, splash, status bar).
7. Add native plugins:
   - `@capacitor/push-notifications` (notifications)
   - `@capacitor/camera` (doc upload from camera)
   - `@capacitor/filesystem` (downloads / chunked upload)
   - `@capacitor/browser` (Stripe Checkout, Google OAuth in-app browser)
   - `@capacitor/share` (referrals)
   - `@capacitor/preferences` + `@capacitor/secure-storage` for token storage

### If you go React Native / Expo

1. `npx create-expo-app wayly-mobile --template default-typescript`
2. Mirror the route table in §1 as a stack-of-tabs navigator.
3. Recreate every screen, top-to-bottom, importing the API client and types from a thin shared module (or copy-paste then port).
4. Use `expo-secure-store` for tokens.
5. Plugins to add: `expo-image-picker`, `expo-file-system`, `expo-web-browser`, `expo-notifications`, `expo-sharing`, `expo-font` (Fraunces / Inter / IBM Plex Mono).

---

## 13. Verification checklist before submitting App Store / Play Store builds

Walk through this on a real device:

- [ ] Sign up a new account on mobile, hit `POST /api/auth/signup`, land on `/onboarding`.
- [ ] Complete onboarding, see Dashboard.
- [ ] Hit every one of the 19 modules above — no crashes, no blank states without an EmptyState component, no missing data.
- [ ] Tap the participant switcher with 2+ participants; data refetches and the UI clearly indicates whose data is showing.
- [ ] Pay attention to currency formatting: every `$` is in IBM Plex Mono with tabular-nums.
- [ ] Pay attention to dates: AU format everywhere ("3 Mar 2026", not "Mar 3, 2026").
- [ ] Go to Settings → Plan & Billing. Verify the participants/add-ons card mirrors the web exactly (4 tiles + active-participant list with primary pill + add-on label per row).
- [ ] Start a Family trial via mobile. Verify trial chip appears in the Current plan card with day count + AU end-date. Cancel auto-renewal — verify the "Ends" label appears.
- [ ] As a Family user with 2 participants, try to downgrade to Solo. Verify the blocking toast appears with the "Manage participants" action.
- [ ] Upload a statement (camera + file picker). Verify chunked upload progress.
- [ ] Open the chat, ask one question, verify response. Pull to refresh history.
- [ ] Tap a notification → marks as read → routes to its `link`.
- [ ] Quit the app, reopen → session is restored from secure storage; active participant from last session is still active.
- [ ] Sign out → all tokens cleared from secure storage; user bounced to `/login`.
- [ ] Run on a phone with Wi-Fi off after a cold launch → Fraunces / Inter / IBM Plex Mono still render correctly (i.e. fonts are bundled, not CDN-fetched).

---

## 14. When you're done

1. Commit with message:

   ```
   feat: full Wayly caregiver dashboard parity (all 19 modules + billing + participant switching)
   ```

2. Open a TestFlight build (iOS) and an internal-track Play build (Android). Send the install link to `hello@wayly.com.au`.

3. Send back **screenshots of every category** so the human can spot anything off-spec.

If anything in this prompt is ambiguous, **read the corresponding source file in the web repo** — paths are listed at the top of this document. Do not guess.
