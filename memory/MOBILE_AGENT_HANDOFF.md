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

_Last updated: Feb 2026 · iter 38_
