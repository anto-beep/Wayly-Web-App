## Iteration 41 (Feb 2026) — Admin Phase A: TOTP 2FA + 4-tier roles + dark UI

### Backend
- New `/app/backend/admin_auth.py` mounted at `/api/admin/auth/*`:
  - **TOTP 2FA mandatory** via `pyotp` 2.9.0 + `qrcode` 8.2 (QR data URI).
  - Login is **two-step**:
    1. `POST /admin/auth/login` with email + password → returns one of:
       - `{requires_2fa: true, temp_token, role}` (existing 2FA user)
       - `{requires_2fa_setup: true, setup_token, qr_data_uri, secret, role}` (first-time)
    2. `POST /admin/auth/2fa/verify` `{temp_token, code}` → admin JWT + admin user
       OR `POST /admin/auth/2fa/enable` `{setup_token, code}` → admin JWT + 8 backup codes (shown once)
  - **Three JWT types** (distinguished by `type` claim): `admin_pre2fa` (5 min), `admin_setup` (10 min), `admin` (12h max).
  - **Session model** in `admin_sessions` collection: `last_activity` (4h inactivity), `expires_at_max` (12h absolute), revocable.
  - **Brute-force lockout**: 5 failed password attempts → 30 min lockout (per user).
  - **Backup codes**: 8 single-use, bcrypt-hashed at rest, plaintext shown once at enrollment.
  - **Audit log** in `admin_audit` collection — every login attempt, 2FA event, backup-code use.
- **4-tier role model** on `users.admin_role`: `super_admin` / `operations_admin` / `support_admin` / `content_admin`.
  - Legacy `is_admin: true` users auto-migrated to `super_admin` on first call.
  - Role helper deps: `require_super_admin`, `require_super_or_ops`, `require_roles(...)`.
  - DELETE /api/admin/users/{id} now gated to `super_admin` only.
- `/app/backend/admin_routes.py` updated to use the new `get_current_admin` dep (dict, includes role).
- `UserPublic.admin_role` field added to `models.py` so it flows through to frontend.
- `/app/backend/seed_admin.py` idempotently promotes two super admins:
  - `hello@techglove.com.au` / `AdminPass!2026`
  - `a.chiware2@gmail.com` / `Admin!2026` (Antony, second super admin required for the "minimum 2 super admins" policy).

### Frontend
- `/app/frontend/src/pages/admin/admin.css` — full dark theme tokens (`#0F1923` bg, `#0A1420` sidebar, `#1A2535` card, `#E53E3E` red, JetBrains Mono for IDs).
- `/app/frontend/src/pages/admin/AdminAuthContext.jsx` — separate auth context with own token (`wayly_admin_token` localStorage key); never shares state with user app.
- `/app/frontend/src/pages/admin/AdminLogin.jsx` — 3-step flow (credentials → setup OR verify → backup-codes show-once → dashboard).
- `/app/frontend/src/pages/admin/AdminApp.jsx` — rewritten:
  - Full sidebar per Section 1 spec (11 nav groups: Overview, User Management, Subscriptions & Billing, AI & Tools, Support, Communications, Content, Analytics, Security, System, Admin).
  - System + Admin sections gated by `rolesAllowed`.
  - Header with Cmd+K search trigger, notification bell skeleton, admin name + role pill, logout.
  - **Cmd+K** modal (skeleton) filters nav items live.
- `/app/frontend/src/pages/admin/AdminPages.jsx` — Analytics, Users (search + filter + drawer with all actions), Households / Payments / Statements (compact SimpleTable), Placeholder for not-yet-built pages.
- `App.js` route updated: `<Route path="/admin/*" element={<AdminApp />} />` — completely outside the regular `AuthProvider`.

### Verified by testing agent (iter 21 report)
- 16/16 backend pytest cases pass (login two-step, 2FA verify, setup, lockout, session, role gate, backup-code consumption, audit log, RBAC).
- Full Playwright frontend run: admin login → 2FA → sidebar render → users table → drawer → logout — all pass.
- One bug found + fixed by testing agent: invalid bcrypt dummy hash in the "unknown email" branch was raising 500 — replaced with a valid hash.

### Deferred to Phase B–E
- Section 2 Overview real-time charts (MRR / cohort / DAU / activity feed) — needs analytics data source.
- Section 3 user profile 8-tab detail, impersonation, login history, internal notes.
- Section 4 full billing (subs/trials/churned/failed/refunds/revenue charts).
- Section 5 AI tool logs (decoder log, anomaly log, manual review queue) — needs per-call tracking.
- Section 6 full ticketing system (new schema).
- Section 7 campaign builder.
- Section 8 CMS for blog/guides/glossary/templates/changelog.
- Section 9 product analytics (PostHog or in-house event tracking).
- Section 10–12 audit log UI / sessions UI / data requests / breach log / feature flags / system health / admin account CRUD.

### Files changed
- New: `/app/backend/admin_auth.py`, `/app/frontend/src/pages/admin/admin.css`, `/app/frontend/src/pages/admin/AdminAuthContext.jsx`, `/app/frontend/src/pages/admin/AdminLogin.jsx`, `/app/frontend/src/pages/admin/AdminPages.jsx`.
- Rewritten: `/app/frontend/src/pages/admin/AdminApp.jsx`, `/app/backend/seed_admin.py`.
- Edited: `/app/backend/admin_routes.py`, `/app/backend/server.py`, `/app/backend/models.py`, `/app/frontend/src/App.js`, `/app/frontend/src/components/Layout.jsx`.
- New deps: `pyotp==2.9.0`, `qrcode==8.2` (in `requirements.txt`).
