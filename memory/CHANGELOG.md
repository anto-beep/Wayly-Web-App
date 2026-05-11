## Iteration 46 (Feb 2026) — Phase E2 Content CMS · Admin invite flow · ReDoS fix · Password visibility toggle

### Backend (`/app/backend/admin_phase_e2.py`, new ~460 LOC + additions to `admin_phase_e.py`)
- **Content CMS** — full admin CRUD + public read for 4 collections:
  - `cms_articles` (slug, title, excerpt, body_md, tags, published, published_at) — `GET/POST /admin/cms/articles`, `GET/PUT/DELETE /admin/cms/articles/{slug}`. Public `GET /public/cms/articles` returns published only; `GET /public/cms/articles/{slug}` 404s on draft.
  - `cms_glossary` (id, term, definition, published) — full CRUD + bulk-import endpoint (`POST /admin/cms/glossary/bulk-import` — case-insensitive duplicate skip).
  - `cms_templates` (slug, title, description, cta_label, cta_href, body_md, published).
  - `cms_changelog` (id, version, title, body_md, tags, release_date, published).
- **Admin invite flow** — magic-link onboarding (replaces password-prompt admin creation as the primary path):
  - `POST /admin/admins/invite` (super_admin only) creates `db.admin_invites` record + emails magic link via Resend. Supersedes any prior pending invite for the same email; 409 if already an admin.
  - `GET /admin/admins/invites` lists; `DELETE /admin/admins/invites/{id}` revokes pending.
  - Public `GET /api/admin/invite/{token}` returns invite metadata (status / email / role / expires).
  - Public `POST /api/admin/invite/accept` {token, password>=8} creates new admin or promotes existing user. Flips invite to `accepted`. Subsequent accept attempts 400.
- **ReDoS fix** — `/admin/search?q=` now `re.escape()`s the query before passing to Mongo `$regex`. Verified safe on `.*`, `(a+)+b`, etc.

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseE2.jsx`, new ~700 LOC + `AdminAcceptInvite.jsx`, new ~120 LOC)
- 4 CMS management pages — `AdminArticles`, `AdminGlossary` (with bulk-import importer), `AdminTemplatesLibrary`, `AdminChangelog`. Each: list table + inline editor card + delete confirm.
- `AdminInvitesPanel` (rendered inside `AdminAccounts`) — invites table + Invite form modal with auto-mailed magic link (fallback: shows the URL + copy-to-clipboard if email delivery failed).
- `/admin/accept-invite?token=...` — standalone public page (registered before `RequireAdmin`); 4 states: loading, invalid/expired card, password+confirm form, success card with "Sign in" CTA.
- **Admin login password visibility toggle** — Eye/EyeOff icon button inside password input (aria-labelled, data-testid `admin-login-toggle-password`). Also fixed React setState-in-render warning by moving the "already logged in" redirect into `useEffect`.

### Routes wired in `AdminApp.jsx`
- `/admin/blog`, `/admin/glossary`, `/admin/templates-library`, `/admin/changelog` (existing sidebar nav now resolves).
- `/admin/accept-invite` route registered ahead of the auth-guarded catch-all.

### Verified by testing agent (iter 26)
- **37/37 backend pytest pass** — CMS CRUD (incl. 409 dup, 404 on draft), bulk-import idempotency, full invite happy-path (invite → public fetch → accept → first login with TOTP setup offered), ReDoS safety, RBAC (super-only on invite create/revoke).
- **Frontend Playwright 100%** — all CMS testids present, password toggle flips `type=password`↔`type=text`, accept-invite page renders all 3 states correctly, invite panel inside AdminAccounts works end-to-end.

### Deferred (Iteration B+)
- Phase E2 Analytics deep (Funnels, Cohorts, Product analytics events).
- Refactor `server.py` into routers/ modules.
- Switch public `/resources/{articles,glossary,templates}` consumer pages from static `resources.js` to DB-backed CMS reads (currently the DB is empty by default; readers still use static).
- Markdown rendering on consumer Article pages (currently only excerpt is displayed; full body_md needs a renderer).

### Files
- New: `/app/backend/admin_phase_e2.py`, `/app/frontend/src/pages/admin/AdminPhaseE2.jsx`, `/app/frontend/src/pages/admin/AdminAcceptInvite.jsx`, `/app/backend/tests/test_iter26_cms_invite.py`.
- Edited: `/app/backend/admin_phase_e.py` (invite endpoints + `re.escape` on search), `/app/backend/server.py` (mounted cms_admin / cms_public / phase_e_invite_public), `/app/frontend/src/pages/admin/AdminApp.jsx` (CMS routes + accept-invite route), `/app/frontend/src/pages/admin/AdminPhaseE.jsx` (`<AdminInvitesPanel />` mounted under AdminAccounts), `/app/frontend/src/pages/admin/AdminLogin.jsx` (Eye toggle + useEffect redirect).

---


## Iteration 45 (Feb 2026) — Admin Phase E1: Security UI + System + Admin CRUD

### Backend (`/app/backend/admin_phase_e.py`, ~480 LOC — was a stub from earlier session, now finished + wired)
- **Audit Log export** — `GET /admin/audit-log/export` returns text/csv with `Content-Disposition: attachment` (filters action/actor_id/target_id; configurable `days` 1-365; 10k row cap).
- **Admin Sessions** — `GET /admin/sessions` (last-30d list with admin_email/admin_role enrichment + active flag + active_count). `DELETE /admin/sessions/{id}` (super_admin only) revokes a session.
- **Data Requests (Privacy Act)** — public `POST /api/public/data-request` (no auth, intake), `GET /admin/data-requests` (status/type filters + pagination), `PUT /admin/data-requests/{id}` (pushes a history entry; audit-logged).
- **Feature Flags** — `GET /admin/feature-flags`, `POST /admin/feature-flags` (super_admin only), `PUT /admin/feature-flags/{name}` (any admin), `DELETE /admin/feature-flags/{name}` (super_admin only). Fields: enabled, rollout_percent, allowed_plans, allowed_emails.
- **System Health** — `GET /admin/system-health` returns services (MongoDB / Stripe / Resend / Emergent LLM / Maintenance) + collection counts + llm_errors_24h.
- **Maintenance Mode** — `GET /admin/maintenance`, `POST /admin/maintenance` (super_admin only); public `GET /api/public/maintenance-status` for frontends to poll.
- **Admin Accounts CRUD** (super_admin only) — `GET /admin/admins` (with last_login_ts), `POST /admin/admins` (creates new OR promotes existing user), `PUT /admin/admins/{id}/role` (2-super-admin minimum + self-demote prevention), `DELETE /admin/admins/{id}` (removes admin role; 2-super minimum), `POST /admin/admins/{id}/reset-2fa` (clears TOTP + revokes sessions; not self), `GET /admin/admins/{id}/login-history` (30-day audit slice).
- **Global Cmd+K search** — `GET /admin/search?q=...` already present (users / households / tickets / payments by session_id).

### Frontend (`/app/frontend/src/pages/admin/AdminPhaseE.jsx`, new ~510 LOC)
- `AdminAuditLog` — table + 3 filter inputs + Export CSV link.
- `AdminSessions` — active/all toggle + table with one-click revoke (super_admin only).
- `AdminDataRequests` — status chip filters + table with Start / Complete / Reject action buttons.
- `AdminFeatureFlags` — table + inline editor card (FlagEditor), super-admin-gated create/delete.
- `AdminSystemHealth` — maintenance card with super-only toggle, services grid (5 cards), DB counts grid, LLM errors stat. Auto-refreshes every 60s.
- `AdminAccounts` — table with History / Role / Reset 2FA / Remove per row (self row hides destructive actions); inline create form; slide-out login history drawer.

### Routes wired in `AdminApp.jsx`
- `/admin/audit-log`, `/admin/sessions`, `/admin/data-requests`, `/admin/feature-flags`, `/admin/health`, `/admin/maintenance` (alias of /health), `/admin/admins`. Sidebar System section visible to super + ops; Admin section visible to super only.

### Verified by testing agent (iter 25)
- **31/31 backend pytest pass** after one HIGH fix (POST /admin/feature-flags now requires super_admin, matching DELETE).
- **Frontend Playwright 100%** — all 6 Phase E pages render with correct root + child testids; CSV export href correct; feature-flag create→row→edit flow works; maintenance toggle persists; admins page hides destructive actions on self row; login-history drawer opens. Regression Phase A/B/C/D pages render with 0 page errors.

### Known gaps (deferred to Phase E2)
- `global_search` does not `re.escape` the regex input — potential catastrophic-backtracking on hostile admin input. Worth fixing alongside E2.
- Email-template edit-in-place + version history.
- Background queue for campaign send.
- Server-side enforcement of impersonation read-block.

### Files
- New: `/app/frontend/src/pages/admin/AdminPhaseE.jsx`, `/app/backend/tests/test_admin_phase_e.py`.
- Edited: `/app/backend/admin_phase_e.py` (added data-requests + audit export + GET /maintenance + 2FA reset/login history; tightened POST /feature-flags to super_admin), `/app/backend/server.py` (mounted phase_e + phase_e_public), `/app/frontend/src/pages/admin/AdminApp.jsx` (Phase E1 routes wired).

---


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
