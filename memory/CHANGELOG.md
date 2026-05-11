## Iteration 42 (Feb 2026) — Admin Phase B: Real Overview, User Profile, Impersonation, LLM Cost Tracking

### Backend
- **`/app/backend/llm_costs.py`** (new) — `record_llm_call(tool, model, ...)` writes to `db.llm_calls` with input/output char counts, token estimates, AUD cost estimate (based on Anthropic/OpenAI public rates × 1.5 USD→AUD). Fire-and-forget; never throws.
- **`/app/backend/agents.py`** — `_attempt()` inside `_llm_chunk_call` now records every Claude call (the Statement Decoder's primary code path) with `tool=chunk:<name>`, duration, success/error.
- **`/app/backend/admin_routes.py`** — Phase B block appended:
  - `GET /admin/overview` — 8 metric cards + AI health (LLM cost today/month, calls, errors, decoder runs, avg ms, success rate) + plans + subscriptions.
  - `GET /admin/activity?limit=N` — merged chronological feed from users/statements/payments with kind+color coding.
  - `GET /admin/llm-cost-trend?days=30` — daily LLM spend rollup.
  - `GET /admin/audit-log` — paginated, filterable by actor/target/action.
  - `GET /admin/users/{id}/profile` — enriched detail (user + sub + household + 20 statements + payments + 20 LLM calls + 30 audit events + notes + 10 user_sessions).
  - `GET/POST /admin/users/{id}/notes` — admin-only internal notes (5000 char max).
  - `POST /admin/users/{id}/suspend` + `POST /admin/users/{id}/reinstate` — soft suspension with reason; invalidates active sessions on suspend.
  - `POST /admin/users/{id}/extend-trial` `{days}` — 1–90 days, adds to current trial_ends_at.
  - `POST /admin/users/{id}/impersonate` — issues 60-min impersonation JWT (`type='impersonation'`, `impersonator_id`, `sub=target_user_id`); audits.
  - `POST /admin/users/{id}/refund` `{session_id, amount, reason}` — records to `db.refunds` (Stripe API call deferred — pending_stripe status); enforces cap of $500 for support_admin role.

### Frontend
- **AdminUserProfile.jsx (new)** — 3-column layout:
  - Left: avatar + name/email + plan/admin/suspended badges + key stats.
  - Centre: 5 tabs (Overview / Subscription & Billing / AI Tool Usage / Audit Log / Internal Notes).
  - Right: actions panel — send reset, toggle admin, set plan, extend trial, impersonate (with target prompt), cancel sub, suspend/reinstate, delete (super_admin only with typed-email confirmation).
- **AdminPages.jsx** — `AdminAnalytics` rewritten to consume real `/admin/overview` + `/admin/activity`: 8 stat cards, AI Health panel, Plans+Subs panel, recent activity feed. `AdminUsers` row click now navigates to `/admin/users/:id`.
- **AdminApp.jsx** — new route `users/:userId` mounted.
- **ImpersonationBanner.jsx (new)** — red sticky banner shown across consumer app when `localStorage.wayly_impersonation_token` is set; "Stop impersonation" clears + reloads.
- **lib/api.js** — request interceptor swaps impersonation token in and blocks all POST/PUT/PATCH/DELETE client-side.
- **App.js** — `ConsumerWidgets` wrapper hides chat/A2HS/AccessibilityWidget on `/admin/*`; includes ImpersonationBanner globally.

### Verified by testing agent (iter 22)
- **28/28 backend pytest pass** — every Phase B endpoint, RBAC, validation, impersonation token issuance, audit logging.
- **Frontend full Playwright pass** — admin login → 2FA → Overview (11 testids) → user table → user profile (5 tabs, 7 actions; reinstate correctly hidden when not suspended) → notes add flow all green.

### Deferred (Phase C+)
- **MRR chart** (12-month line) — needs chart library decision (recharts? Tremor?).
- **Cohort retention table** — needs historical signup → retention join across months.
- **AU map** — geo IP lookup integration.
- **Section 4 billing deep-dive** — failed payments retry status, churn dashboard, revenue charts.
- **Section 5 AI tools** — Statement Decoder Log (per-call view), Anomaly Detection Log, Tool Usage stats by tool, Manual Review Queue, AI Error Reports.
- **Section 6 Support** — ticketing system (new collection + UI).
- **Section 7 Communications** — campaign builder, template editor with version history.
- **Section 8 CMS** — blog/guides/glossary/templates/changelog.
- **Section 9 Analytics** — funnels, custom report builder.
- **Section 10 Compliance UI** — full audit-log UI, data requests, breach log.
- **Section 11 System** — feature flags, system health charts, API key rotation, webhooks viewer, maintenance mode.
- **Section 12 Admin CRUD** — admin accounts management page, role permissions matrix editor.
- **Section 13 Global Cmd+K** — wire to user/household/payment/audit indices.
- **Stripe API call for refunds** — real Stripe refund call (currently records pending_stripe).
- **Server-side enforcement** of impersonation read-only (currently client-side only; admins with valid creds can theoretically still mutate via raw curl — acceptable risk for now since all admin actions are audited).

### Files
- New: `/app/backend/llm_costs.py`, `/app/frontend/src/pages/admin/AdminUserProfile.jsx`, `/app/frontend/src/components/ImpersonationBanner.jsx`.
- Edited: `/app/backend/agents.py`, `/app/backend/admin_routes.py`, `/app/frontend/src/pages/admin/AdminPages.jsx`, `/app/frontend/src/pages/admin/AdminApp.jsx`, `/app/frontend/src/lib/api.js`, `/app/frontend/src/App.js`.

---

## Iteration 41 (Feb 2026) — Admin Phase A: TOTP 2FA + 4-tier roles + dark UI

See above (kept for reference).
