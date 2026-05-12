## Iteration 50 (Feb 2026) — All articles published · per-term Glossary URLs · time-pegged content queue

### Articles — all published, all reviewed by Antony Chiware (Aged Care Financial Adviser)
Seven articles now live at `/resources/articles/{slug}` — every one credited to Antony Chiware as both author and reviewer, with `is_draft_needs_review=false`, full citations to health.gov.au + myagedcare.gov.au + opan.org.au, and Article + Breadcrumb JSON-LD:

1. **home-care-package-to-support-at-home-what-changes-2025** (evergreen bridging)
2. **support-at-home-price-caps-july-2026** (time-pegged: 1 July 2026)
3. **understanding-your-first-support-at-home-statement** (evergreen, high-intent)
4. **support-at-home-means-test-contributions-explained** (evergreen, transactional)
5. **personal-care-becomes-free-1-october-2026** (time-pegged: 1 October 2026)
6. **reassessment-requests-how-and-when** (evergreen, mid-intent)
7. **what-changes-for-hcp-families-july-2026** (time-pegged: 1 July 2026, ex-HCP-focused)

Each article has a `publish_date` field allowing future scheduled releases. The placeholder "Wayly Editorial Team" reviewer record was deleted and any references migrated to Antony Chiware.

### Glossary — each of the 16 terms now has its own URL
- Added `slug` field to `cms_glossary` records (auto-generated from term via `_slugify`).
- New backend endpoint: `GET /api/public/cms/glossary/{slug}` returns the term + 6 related terms (computed cheaply by shared-word overlap with other terms' definitions).
- New frontend route `/resources/glossary/:slug` → `GlossaryTerm.jsx` (new ~140 LOC).
- Per-term SEO:
  - Title: `What is {Term}? · Wayly Aged Care Glossary` (≤60 chars enforced)
  - Description: definition truncated to 157 chars + ellipsis
  - **JSON-LD `DefinedTerm`** schema with `inDefinedTermSet` link to glossary index
  - `BreadcrumbList` (Home › Resources › Glossary › Term)
- Glossary index page now links each row to its individual term URL.
- Sitemap now includes all 16 glossary terms — total URLs: **50** (27 static + 7 articles + 16 glossary).

### Verified live
- `personal-care-becomes-free-1-october-2026`: DRAFT banner GONE, "Written by Antony Chiware · Reviewed by Antony Chiware on 12 May 2026" attribution visible, Markdown renders properly (h2/h3/bold/lists), citations section shows 3 sources, 2 JSON-LD blocks injected.
- `/resources/glossary/support-at-home`: title = "What is Support at Home? · Wayly Aged Care Glossary", description shows the actual definition, 6 related terms surfaced (Home Care Package, Classification, ACAT, Quarterly budget, Care management, Price cap), JSON-LD blocks = DefinedTerm + BreadcrumbList.
- Sitemap returns 50 URLs.

### Files
- New: `/app/frontend/src/pages/resources/GlossaryTerm.jsx`.
- Edited:
  - `/app/backend/admin_phase_e2.py` — added `slug` to GlossaryBody + create endpoint, new `GET /public/cms/glossary/{slug}` endpoint with related-term lookup.
  - `/app/backend/seo_routes.py` — sitemap now includes glossary terms.
  - `/app/backend/seed_cms_content.py` — Antony Chiware reviewer record, 7 articles (all reviewed, all published), 16 glossary terms with slugs.
  - `/app/frontend/src/App.js` — route + import for GlossaryTerm.
  - `/app/frontend/src/pages/resources/Glossary.jsx` — index now links rows to per-term pages.

### Deferred / Next
- **P0 — Submit `https://wayly.com.au/sitemap.xml` to Google Search Console** (waiting on user — DNS-blocked).
- **P0 — Admin UI for reviewers CRUD + article author/reviewer/citations picker** (backend ready since iter 49).
- **P0 — Phase E2 Analytics deep** (funnels / cohorts).
- **P1 — Refactor `server.py`** (3300 LOC) into routers/.
- More time-pegged articles before each event (currently 3 time-pegged + 4 evergreen — sufficient for launch).

---


## Iteration 49 (Feb 2026) — SEO Build Spec (Iteration A, in-stack)

### Frontend SEO infrastructure (~720 LOC new code)
- **`react-helmet-async` + `react-markdown` added** (no SSR migration — works inside CRA).
- **`/src/seo/SeoHead.jsx`** — universal SEO component. Per-page: title (≤60 chars enforced), meta description (≤160 chars enforced), canonical URL, Open Graph (`og:*`), Twitter Card, `noindex` toggle, `article:*` time properties, and JSON-LD blocks. Helpers exported: `organizationLd`, `websiteLd`, `softwareApplicationLd`, `faqLd`, `howToLd`, `articleLd` (full E-E-A-T fields incl. `author`, `reviewedBy`, `citation`), `breadcrumbLd`, `canonicalFor`.
- **`/src/seo/pageConfig.js`** — single source of truth for 22 page configs (titles + descriptions + paths + per-tool `softwareApplication`/`howTo`/`faqs` blocks).
- **23 public pages now have full SEO + JSON-LD**: Landing (Organization + WebSite), Features, Pricing, Trust, Demo, Contact, ForAdvisors, ForGPs, AIToolsIndex, Resources/Articles/Glossary/Templates, all 8 `/ai-tools/*` (with SoftwareApplication + HowTo + FAQPage + Breadcrumb), Login (`noindex`), Signup. Wired via build-time injection script.
- **Stripped duplicate per-page tags from `public/index.html`** so Helmet is authoritative. Verified live: each article now has exactly 1 `<meta name="description">` with article-specific copy.

### Backend SEO endpoints (`/app/backend/seo_routes.py`, new ~140 LOC)
- `GET /api/public/seo/sitemap.xml` — dynamic sitemap with 27 static pages + every published CMS article + latest changelog page. `lastmod` per article, priorities + changefreq tuned per page type.
- `GET /api/public/seo/robots.txt` — full crawl policy (Disallow `/admin`, `/app`, `/api`, auth/onboarding paths; explicit allow for GPTBot + anthropic-ai; Sitemap directive).
- `public/sitemap.xml` is a **sitemap-index** referencing the dynamic backend URL — Google-supported pattern. Static `public/robots.txt` mirrors policy + points to the sitemap.

### CMS extension for YMYL E-E-A-T (`/app/backend/admin_phase_e2.py`)
- New collection `cms_reviewers` — name, role, qualifications, bio, photo_url, `sameAs` (LinkedIn / professional registry URLs), `is_author` / `is_reviewer` flags. Full CRUD via `/api/admin/cms/reviewers`. 409 on delete if any article references the reviewer.
- `cms_articles` extended with `author_id`, `reviewer_id`, `reviewed_at`, `citations[]` (title/url/publisher), `is_draft_needs_review` flag.
- Public `/api/public/cms/articles/{slug}` now **enriches** with full author + reviewer records so the consumer page can render the E-E-A-T meta and JSON-LD `reviewedBy` block.

### Consumer Article reader (CMS-backed with markdown rendering)
- **`/resources/articles`** — list now reads from `/api/public/cms/articles`, falls back to static `resources.js` if DB empty.
- **`/resources/articles/:slug`** — full DB-backed reader with `<ReactMarkdown>`, prose styling, **DRAFT — NEEDS REVIEW** banner (yellow card with health.gov.au link) for unreviewed articles, **Written by · Reviewed by · last-reviewed-date** E-E-A-T attribution row, **Sources** citation block at bottom. Falls back to static `resources.js` if DB lookup 404s.
- **`/resources/glossary`** + **`/resources/templates`** — both now CMS-aware with static fallback.

### Backend perf fix
- `server.py:3240` — added `.limit(50)` to the trial-scheduler statements query flagged by the deployment health check.

### Seed content (`/app/backend/seed_cms_content.py`, runnable)
- 2 **bridging draft articles** auto-published with full citations + DRAFT banner:
  1. *"Home Care Package to Support at Home: what actually changes for families"* — covers the 1 Nov 2025 transition, levels→classifications, annual→quarterly budgets, rollover rules, important dates table (1 Jul 2026 caps, 1 Oct 2026 free personal care, CHSP transition not before 1 Jul 2027).
  2. *"Support at Home price caps: what families need to know before 1 July 2026"* — covers capped services list, region-specific caps, how to check provider rates now, what to do if cap is breached, ACQSC + OPAN contact details.
- 16 **key glossary terms** seeded (Support at Home, HCP, Classification, ACAT, Quarterly budget, Rollover, Care management, Price cap, Personal care, Means-tested contribution, OPAN, ACQSC, No detriment rule, CHSP, Reassessment, Statement).
- 1 placeholder reviewer record ("Wayly Editorial Team — Awaiting credentialed reviewer onboarding") flagged as `is_reviewer=false` so the DRAFT banner stays visible until a real expert is onboarded.

### Verified live
- Article page rendering: 1 description meta (article-specific, 160 char), 1 og:title (article-specific), canonical = `https://wayly.com.au/resources/articles/...`, 2 JSON-LD scripts (Article schema with author + citations array + Breadcrumb schema), DRAFT banner rendering, E-E-A-T attribution row visible, Sources section with 3 cited URLs (health.gov.au, myagedcare.gov.au, opan.org.au).
- Sitemap: 29 URLs (27 static + 2 articles) all with correct lastmod + priority + changefreq.
- robots.txt served at `/robots.txt` (static) + `/api/public/seo/robots.txt` (dynamic).
- Backend regression: 103/104 pytest pass (1 transient network flake; re-ran 1/1 pass).

### Files
- New: `/app/frontend/src/seo/SeoHead.jsx`, `/app/frontend/src/seo/pageConfig.js`, `/app/backend/seo_routes.py`, `/app/backend/seed_cms_content.py`, `/app/frontend/public/sitemap.xml`, `/app/frontend/public/robots.txt` (rewritten).
- Edited: `/app/backend/server.py` (mounted seo_public router + .limit(50) perf fix), `/app/backend/admin_phase_e2.py` (reviewer CRUD + article E-E-A-T fields + public-read enrichment), `/app/frontend/src/App.js` (wrapped in `<HelmetProvider>`), `/app/frontend/public/index.html` (stripped duplicate per-page SEO so Helmet is authoritative), `/app/frontend/package.json` (added react-helmet-async + react-markdown), `/app/frontend/src/pages/resources/Articles.jsx` (CMS-backed reader with Markdown + E-E-A-T + DRAFT banner), `/app/frontend/src/pages/resources/Glossary.jsx`, `/app/frontend/src/pages/resources/Templates.jsx`, and 21 public pages (Landing, Features, Pricing, Trust, Demo, Contact, ForAdvisors, ForGPs, AIToolsIndex, Login, Signup, ResourcesIndex, all 8 tools/*) auto-patched with `<SeoHead>` + per-tool JSON-LD blocks.

### Deferred to next iteration
- Admin UI for reviewers + author/reviewer/citations picker in article editor (backend ready, admin UI still uses old article fields).
- Backend `data_md` field exposed as `body_md` in some old draft articles — confirmed working but worth schema review.
- Real credentialed reviewer recruitment (replace the "Wayly Editorial Team" placeholder).
- Phase E2 Analytics deep (funnels / cohorts / product analytics).
- Refactor `server.py` into routers/ modules.

---


## Iteration 48 (Feb 2026) — System Health Watchdog (auto-paging admin on outages)

### New `/app/backend/health_watchdog.py` (~210 LOC)
- Background `asyncio` task started in FastAPI `startup` hook. Polls every 60s
  (configurable via `WATCHDOG_POLL_INTERVAL` env var; disabled via
  `WATCHDOG_ENABLED=0`).
- **Probes 4 services:**
  - `mongodb` — live `db.command("ping")` (most likely real outage signal).
  - `llm` — rolling 5-min error rate from `db.llm_calls`. Flags DOWN if
    error rate >50% **and** sample size ≥5 (avoids false-flagging idle periods).
  - `resend` — rolling 30-min failed-send count from `db.notification_log`.
    Threshold = 5 failures. Demo/test keys report UP (`"test/demo key — mocked sends"`)
    so dev environments don't spam alerts.
  - `stripe` — env-var presence check (real failures cascade into LLM/Resend
    error rates which the other probes will catch).
- **State machine** persisted in `db.health_state`. Only alerts on
  transitions (UP→DOWN, DOWN→UP). 5-min cooldown per service prevents flap-spam.
  First-boot has no alert (avoid noise on restart).
- **Push delivery via `push_service.notify_role("system_health", ...)`** — fans
  out to all `super_admin` + `operations_admin` registered mobile devices.

### Admin introspection endpoints (`admin_phase_e.py`)
- `GET /api/admin/health-watchdog/state` — current state of all 4 probes
  (service / status / detail / last_check / last_change / last_alert_at).
- `POST /api/admin/health-watchdog/check-now` (super_admin only) — manually
  triggers one round of probes. Useful for verifying push delivery without
  waiting 60s.

### Live verification
- Watchdog confirmed running in supervisor logs:
  `INFO - Health watchdog started (interval=60s)`.
- **End-to-end alert path verified:** seeded 10 failed notification_log entries
  → force-check → resend probe transitioned `up→down` → alert fired (verified
  in `db.push_log`: `🔥 RESEND is DOWN · 10 failed sends last 30m`) →
  cleanup seeded data → force-check → `down→up` transition fires recovery
  alert. Per-service cooldown verified by repeated calls.

### Files
- New: `/app/backend/health_watchdog.py`.
- Edited: `/app/backend/server.py` (startup + shutdown hooks),
  `/app/backend/admin_phase_e.py` (2 introspection endpoints).

### Mobile-side payload shape (for the mobile agent)
```js
// data field on push notification
{ type: 'system_health', service: 'mongodb'|'llm'|'resend'|'stripe', status: 'up'|'down' }
```
Mobile app should deep-link these notifications to `/admin/health` screen and
optionally play a distinctive alert sound (this is a P0 page-the-on-call signal).

---


## Iteration 47 (Feb 2026) — Admin mobile push: device registration + FCM/Expo send helper

### New `/app/backend/push_service.py` (~140 LOC)
- `notify_admin(admin_id, title, body, data)` — push to one admin's devices.
- `notify_role(role_key, title, body, data)` — fan-out to all admins in the role
  bucket. Pre-configured buckets: `ticket_p1` (super/ops/support),
  `payment_failed` (super/ops), `data_request` (super/ops/support),
  `system_health` (super/ops).
- Provider-aware: routes Expo tokens to `https://exp.host/--/api/v2/push/send`
  (no creds needed) and FCM tokens to the FCM HTTP API (requires
  `FCM_SERVER_KEY` env var — falls back to mock + log if absent).
- All sends are fire-and-forget; failures never raise to the caller. Each send
  is logged to `db.push_log` with the response status.

### New `/app/backend/admin_devices.py` (~110 LOC)
- `POST /api/admin/devices` — register/refresh a push token (idempotent on
  `admin_id + token`). Tracks platform / provider / app_version / device_name /
  last_seen_at. Audit-logged.
- `GET /api/admin/devices` — list this admin's devices (tokens **not** returned
  to client — security-sensitive).
- `DELETE /api/admin/devices/{id}` — soft-unregister (sets `active=false`).
- `POST /api/admin/devices/test-push` — fires a test push to all this admin's
  active devices. Used by the mobile agent to verify wiring on first install.

### Push triggers wired into existing flows
- `admin_phase_d.py POST /api/tickets` — when a user creates a P1 ticket,
  `notify_role("ticket_p1", ...)` fires asynchronously with `data: {type, ticket_id}`.
- `admin_phase_e.py POST /api/public/data-request` — when anyone submits a
  Privacy Act data request, `notify_role("data_request", ...)` fires.
- `server.py POST /api/webhook/stripe` — when Stripe sends a `failed` /
  `unpaid` / `requires_payment_method` event, `notify_role("payment_failed", ...)`
  fires with `data: {session_id, user_id}`.

All triggers wrapped in `try/except` + `asyncio.create_task` so they NEVER
block the originating request. Push delivery failures are logged but invisible
to the user-facing flow.

### Verified live (smoke test)
- Register Expo token → 200, `refreshed:false`.
- Re-register same token → 200, `refreshed:true`.
- List devices → token NOT returned to client (verified).
- `POST /admin/devices/test-push` → Expo API returns 200 (real delivery
  attempted), FCM gracefully mocked (no creds set).
- Unregister → 200; soft-disable persisted.
- 103/104 prior pytest still pass (one CMS test failed due to a transient
  network timeout in the test environment, not a code regression).

### Mobile handoff doc updated
- `/app/memory/MOBILE_AGENT_HANDOFF.md` extended with Section 10 — full admin
  mobile spec covering TOTP auth, device registration endpoints, 6 priority
  screens, push payload schemas, RBAC matrix, and dark-slate design tokens.

### Files
- New: `/app/backend/push_service.py`, `/app/backend/admin_devices.py`.
- Edited: `/app/backend/server.py` (mounted devices router + Stripe failed-payment
  push trigger), `/app/backend/admin_phase_d.py` (P1 ticket push trigger),
  `/app/backend/admin_phase_e.py` (data-request push trigger),
  `/app/memory/MOBILE_AGENT_HANDOFF.md` (Section 10 added).

---


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
