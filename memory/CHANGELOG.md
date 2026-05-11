## Iteration 44 (Feb 2026) — Admin Phase D: Support Tickets + Communications

### Backend (`/app/backend/admin_phase_d.py`, new, ~570 LOC)
- **Tickets** — user-side: `POST/GET /api/tickets`, `GET /api/tickets/{id}` (only non-internal-notes), `POST /api/tickets/{id}/messages`.
- **Tickets** — admin-side: `GET /admin/tickets` (filters: status/priority/category/unassigned/mine + pagination), `GET /admin/tickets/{id}` (incl. internal notes), `PUT /admin/tickets/{id}`, `POST /admin/tickets/{id}/messages` (with `is_internal_note` flag — admin reply auto-flips status to waiting_on_user + emails the user via Resend).
- **Ticket reports** — `GET /admin/ticket-reports` (status counts, open_p1, opened_7d, resolved_7d, oldest_unresolved).
- **Macros** — full CRUD: `GET/POST /admin/macros`, `PUT/DELETE /admin/macros/{id}`.
- **Campaigns** — `GET/POST /admin/campaigns`, `POST /admin/campaigns/{id}/send` (iterates Mongo users by audience, calls email_service per recipient, logs to db.notification_log, double-send guard).
- **Audience builder** — `POST /admin/campaigns/preview-audience` supports 5 types: all / plan / trial_expiring / churned / never_decoded.
- **Email templates** — `GET /admin/email-templates` returns 11 system templates + custom array (edit-in-place deferred).
- **Notification log** — `GET /admin/notification-log` (filters + last-hour aggregates).
- **Newsletter subscribers** — `GET /admin/newsletter-subscribers`.

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseD.jsx`, new, ~520 LOC)
- `AdminTickets` — stat cards + 3 filter selects + table with row→detail navigation.
- `AdminTicketDetail` — 2-column layout: thread + reply composer (macro dropdown, internal-note toggle, Send/Add note) on the left; priority/status/assignment metadata on the right.
- `AdminMacros` — full CRUD inline form + table.
- `AdminCampaigns` + `CampaignBuilder` — 3-step wizard (name+audience+preview / subject+html / preview+save), table with one-click Send.
- `AdminEmailTemplates`, `AdminNotificationLog` (with last-hour stat cards), `AdminSubscribers`.
- All routes wired in `AdminApp.jsx` under `/admin/{tickets,tickets/:id,macros,campaigns,email-templates,notifications,newsletter-subscribers}`.
- Sidebar groups: Support (Tickets, Macros), Communications (Campaigns, Templates, Notification Log).

### Verified by testing agent (iter 24)
- **36/36 backend pytest pass** — admin TOTP login, RBAC, all 7 endpoint groups (incl. validation rejects + double-send guard), audit log emission.
- **Frontend Playwright 100%** — admin login + 2FA, all 5 Phase D nav testids, ticket reply auto-flips status, priority PUT works, campaign builder navigates all 3 steps to save-draft, all 16 ticket/campaign testids present. Regression Phase A/B/C pages render without page errors.

### Deferred (Phase E)
- **Server-side impersonation read-block** — still client-side only (admins can mutate via raw curl during impersonation; all actions audited).
- **Background queue for campaign send** — currently fans out synchronously in-process (fine for low volume, OK for now).
- **Email-template edit-in-place** + version history.
- Sections 8–13 (Content CMS, Analytics funnels, Compliance UI, System mgmt, Admin CRUD, full Cmd+K search).

### Files
- New: `/app/backend/admin_phase_d.py`, `/app/frontend/src/pages/admin/AdminPhaseD.jsx`, `/app/backend/tests/test_admin_phase_d.py`.
- Edited: `/app/backend/server.py` (router mounting), `/app/frontend/src/pages/admin/AdminApp.jsx` (routes + sidebar nav).

---


## Iteration 43 (Feb 2026) — Admin Phase C: AI logs + Billing depth + MRR chart

### Backend (`/app/backend/admin_routes.py` Phase C block, +260 LOC)
- `GET /admin/decoder-log` — paginated statement summaries with anomaly_summary (H/M/L counts) + line_items_count; file_b64/raw_text/audit/line_items withheld.
- `GET /admin/decoder-log/{statement_id}` — full statement detail + linked llm_calls (up to 10 from same household).
- `GET /admin/anomaly-log` — Mongo aggregation $unwind across all statement.anomalies. Severity filterable. Returns rows + stats_30d {by_severity counts, total_impact_aud}.
- `GET /admin/tool-stats` — today / week / month buckets per tool with calls, cost_aud, errors, avg_ms (from db.llm_calls).
- `GET /admin/subscriptions?status=` — filterable by active / trialing / cancelled / expired with user_email/user_name enrichment.
- `GET /admin/failed-payments?days=30` — failed transactions over a configurable window.
- `GET /admin/refunds?status=` — list refund records (records-only; actual Stripe call deferred to a later iteration).
- `POST /admin/refunds/{refund_id}/mark-processed` — flip pending_stripe → processed (admin manually issued refund in Stripe dashboard); audited.
- `GET /admin/mrr-trend?months=12` — monthly MRR rollup (1–36 month clamp). Sums active subs × plan price per month.

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseC.jsx`, new — single file)
- `AdminDecoderLog` — statement table with H/M/L anomaly count pills; row links to user profile (guards against missing uploaded_by).
- `AdminAnomalyLog` — 4 stat cards (High/Medium/Low/Impact 30d) + severity filter chips + table.
- `AdminToolStats` — today/week/month nested table with cost + errors per tool; friendly empty-state when no LLM activity recorded yet.
- `AdminSubscriptions` — status filter buttons (Active/Trialing/Cancelled/Expired) + table with user link.
- `AdminFailedPayments` — 30-day failed payments table with celebratory empty state.
- `AdminRefunds` — info banner explaining manual Stripe workflow + table with "Mark processed" action.
- `AdminRevenue` — 3 stat cards (Current MRR, Δ vs last month, Projected ARR) + **recharts** 12-month MRR line chart (gold #D4A24E line on dark theme).

### Routes wired in AdminApp.jsx
- `/admin/decoder-log`, `/admin/anomaly-log`, `/admin/tool-stats`, `/admin/subscriptions`, `/admin/refunds`, `/admin/revenue` all live.

### Verified by testing agent (iter 23)
- 28/28 backend pytest pass — every endpoint, RBAC, filters, pagination, mark-processed.
- 8/8 frontend Playwright checks pass — all 6 Phase C pages render with correct testids, recharts line chart visible.
- One cosmetic bug fixed inline: decoder-log row Link guards against missing uploaded_by.

### Deferred (Phase D/E)
- **Stripe API call** for refunds (still records-only).
- **Server-side impersonation write-block** (still client-side).
- **Per-statement decoder-log detail page** in frontend (backend endpoint exists, no UI yet).
- **Manual Review Queue** (Section 5.5) — needs new workflow + collection.
- Sections 6–13 (ticketing, campaigns, CMS, analytics deep, compliance UI, system management, admin CRUD, full Cmd+K search).

### Files
- New: `/app/frontend/src/pages/admin/AdminPhaseC.jsx`.
- Edited: `/app/backend/admin_routes.py` (Phase C block appended), `/app/frontend/src/pages/admin/AdminApp.jsx` (routes wired), `/app/frontend/package.json` (recharts added).

---

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
