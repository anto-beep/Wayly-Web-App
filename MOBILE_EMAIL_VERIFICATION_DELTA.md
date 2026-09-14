# Mobile Agent — Email Verification Delta (Iteration 55)

**For the mobile (React Native / Expo) Wayly app.** Backend already supports the full email-verification flow. This document lists the mobile-specific UI / deep-link / auth-context changes required.

---

## Backend contract (already shipped on web preview + production)

All endpoints live under the existing `${API_URL}/api` prefix and use the existing JWT Bearer auth.

| Method | Path                                  | Auth      | Purpose                                                         |
|--------|---------------------------------------|-----------|-----------------------------------------------------------------|
| POST   | `/api/auth/signup`                    | Public    | Now sets `email_verified=false`, `verification_deadline=now+7d` and auto-sends a verification email. Response shape unchanged. |
| POST   | `/api/auth/login`                     | Public    | Returns **403** with `{detail: {code: "email_verification_required", message, email}}` when the user is past their 7-day deadline AND still unverified. Same response shape on success. |
| GET    | `/api/auth/verification-status`       | Bearer    | Returns `{email, email_verified, email_verified_at, verification_deadline, days_remaining, past_deadline, grace_days}`. Mobile should poll on app launch + after every login. |
| POST   | `/api/auth/send-verification-email`   | Bearer    | Re-sends a fresh verification email. 60-second per-user cooldown returns **429**. |
| POST   | `/api/auth/resend-verification-email` | Public    | Body: `{email}`. Always returns 200 (anti-enumeration) unless cooldown 429. Use this on the "your grace period expired" screen where the user can't log in. |
| GET    | `/api/auth/verify-email?token=…`      | Public    | Email-link landing. **Redirects** (302) to `${FRONTEND_URL}/verify-email?status=success|expired|invalid|already_verified`. Mobile should NOT call this directly — it's hit by the link in the email. |

**Token TTL:** verification links expire 24h after issue. Each new send invalidates prior unused tokens for that user.

---

## Mobile work required

### 1. AuthContext / Login screen

When `POST /api/auth/login` returns **403** with `code: "email_verification_required"`:
- Do NOT store any token (the response has none).
- Show a full-screen "Verify your email to continue" interstitial with:
  - "We sent a link to **{email}**. Check your inbox."
  - **Primary button** "Resend verification email" → `POST /api/auth/resend-verification-email` with `{email}`. On 429, show "Please wait Ns".
  - Secondary link "Try a different account" → return to login form.

After every successful login AND on app launch (when a stored JWT exists), call `GET /api/auth/verification-status` and stash `{email_verified, days_remaining, verification_deadline}` in AuthContext so the dashboard banner can render without an extra round-trip.

### 2. Dashboard banner

If `email_verified === false`:
- Render a banner above the dashboard content. Tone: **gold/clay** when `days_remaining > 1`, **terracotta** when `days_remaining <= 1`.
- Copy: "Please verify your email — we sent a link to **{email}**. **{days_remaining}** day(s) remaining before login is locked."
- Actions: **Resend email** (calls `POST /api/auth/send-verification-email`) and **Hide** (dismiss for this session only, do not persist).
- Hide the banner entirely when `email_verified === true`.

### 3. Deep-link handling for the email link

The verification email contains a link like `https://wayly.com.au/verify-email?token=ABC123`. There are two acceptable approaches:

**A. Universal/App Link (recommended):** Configure `wayly.com.au/verify-email` as a universal/app link that opens inside the mobile app. The app reads `?token=` from the URL and calls `GET /api/auth/verify-email?token=…` itself (handling the 302 redirect manually with `fetch(…, {redirect: 'manual'})` so it doesn't blow up). On success, show a "Verified ✓" toast and route to the dashboard.

**B. Fallback (no universal link):** Let the link open in the user's browser. The web `/verify-email?status=success` page renders (already shipped). When the user returns to the app, the next launch's `verification-status` call will reflect the new state and the banner will hide.

Choose A if you've already set up associated domains for the bundle ID; B is fine for a v1 ship.

### 4. Signup screen

After `POST /api/auth/signup` succeeds, route directly to the dashboard but show a one-time toast: "Welcome to Wayly. Check **{email}** for your verification link." The banner picks up from there.

---

## Visual brand guide for native banner

```
┌──────────────────────────────────────────────────────┐
│  📧  Please verify your email                        │
│      We sent a link to dorothy@example.com           │
│      3 days remaining before login is locked         │
│                                                      │
│      [Resend email]              [Hide]              │
└──────────────────────────────────────────────────────┘
```

- Border: 1px solid `#A5512B40` (gold/clay 25% alpha)
- Background: `#A5512B1A` (gold/clay 10% alpha)
- Icon: 20px Mail icon, navy `#0E2A47`
- Title: 14sp medium, navy `#0E2A47`
- Subtext: 12sp regular, muted `#6B7C92`
- Primary button: navy `#0E2A47` background, white text, 8pt radius
- Hide link: muted `#6B7C92`, underline on press

When `days_remaining <= 1`, swap to terracotta: border `#A5403040`, background `#A540301A`, but keep navy text/icons.

---

## Test plan for mobile

1. **Fresh signup → banner appears.** Sign up with a fresh email, land on dashboard, verify banner is visible with "7 days remaining".
2. **Resend cooldown.** Tap "Resend email" twice fast — second tap should surface the 429 "Please wait Ns" message.
3. **Email-link verifies.** Click the link in the email (in the simulator's mail client or by tapping a copy-pasted URL). Confirm the universal link opens the app, the dashboard reloads, and the banner is gone.
4. **Past-deadline login block.** Mutate a test user's `verification_deadline` to a past date via Mongo. Try to log in → should be blocked with the 403 interstitial. Tap "Resend verification email" → should succeed (200 or 429 on cooldown).
5. **Grandfathered legacy users.** Login as cathy@example.com (preview seed user) — she's auto-verified by the backfill migration. No banner should appear; login should succeed normally.

---

## What stays unchanged

- Login token shape (`{token, refresh_token, user}`) — unchanged on success.
- `user` payload on `/auth/me`, `/auth/login`, `/auth/signup` — still has the same fields; `email_verified` is now also present.
- All paid-tier gating, MFA, brute-force protection, password rules — untouched.

End of delta.
