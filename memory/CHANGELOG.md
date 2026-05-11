---

## Iteration 40 (Feb 2026) — Admin Dashboard

The system owner (`hello@techglove.com.au`) now has a full admin panel at `/admin` with 5 sub-views.

### Backend (`/app/backend/admin_routes.py` — new file)

Mounted as a sub-router on `/api/admin/*`. Every endpoint gated by `get_current_admin_id` (new dep in `/app/backend/auth.py`) which decodes JWT and verifies `is_admin === true` on the user document.

- `GET /api/admin/analytics` — total users (+24h/7d/30d), plan counts, subscription counts, statements (+7d/30d), households, paid count + revenue total (AUD sum), top 5 active households by statement count.
- `GET /api/admin/users?q=&plan=&role=&is_admin=&page=&page_size=` — paginated, searchable user list with subscription join.
- `GET /api/admin/users/{user_id}` — full detail: user, subscription, household, last 20 statements (no file_b64/raw_text), last 20 audit events, last 20 payments.
- `PUT /api/admin/users/{user_id}/admin` `{is_admin}` — toggle admin flag (self-demote → 400).
- `PUT /api/admin/users/{user_id}/plan` `{plan}` — manual plan override.
- `POST /api/admin/users/{user_id}/reset-password` — fires Resend password-reset email.
- `POST /api/admin/users/{user_id}/cancel-subscription` — flips active/trialing → cancelled, user.plan → free.
- `DELETE /api/admin/users/{user_id}` — cascade delete user + sessions + resets + audit + notifications. Household + statements deleted only if user was the owner. Cannot delete self.
- `GET /api/admin/households?q=&page=&page_size=` — list with member + statement counts joined per household.
- `GET /api/admin/payments?status=&page=&page_size=` — list `payment_transactions` with user_email/user_name enrichment.
- `GET /api/admin/statements?q=&page=&page_size=` — list with file_b64/raw_text/audit/line_items projected out (lighter payload).
- `GET /api/admin/export/{users,payments,statements}.csv` — three CSV exports with attachment headers.

### Model changes
- `UserPublic.is_admin: bool = False` added to `/app/backend/models.py`.
- `_user_public()` in `server.py` now hydrates the field from `u.get("is_admin", False)`.
- Login / signup / me / google-session / plan-update all return `is_admin` (since they go through `_user_public_with_sub`).

### Frontend (`/app/frontend/src/pages/admin/AdminApp.jsx` — new, single file)

One file containing:
- `<AdminShell>` — navy header with "Wayly Admin · System Owner" badge + sticky tab nav (Overview / Users / Households / Payments / Statements) + "Back to app" link.
- `<RequireAdmin>` — gates the entire `/admin/*` tree client-side; non-admins toast + redirect to `/app`.
- `<AdminAnalytics>` — 4 stat cards (Total users, Households, Statements, Revenue) + Plans/Subscriptions/Top active households panels.
- `<AdminUsers>` — searchable + plan-filterable paginated table; clicking a row opens `<UserDetailDrawer>` (slide-out from right) with all admin actions: send reset, toggle admin, set plan, cancel subscription, delete user.
- `<AdminHouseholds>` — searchable paginated table with member + statement counts.
- `<AdminPayments>` — status-filtered paginated table with user enrichment.
- `<AdminStatements>` — paginated table with reported gross + anomaly count.
- CSV export links on Users, Payments, Statements tables.

Mounted at `<Route path="/admin/*" element={<RequireAuth requireHousehold={false}><AdminApp /></RequireAuth>} />` in `App.js`.

Admin sidebar nav link appears in `Layout.jsx` only when `user.is_admin === true`.

### Seed (`/app/backend/seed_admin.py` — new)

Idempotent: if `hello@techglove.com.au` exists, promote to admin. Otherwise create with default password `AdminPass!2026`. Run: `cd /app/backend && python seed_admin.py`.

### Verified
- 27/27 pytest cases pass.
- Frontend Playwright: admin sees nav-admin link, /admin renders, all tabs work, search filters, user drawer opens with all admin actions, CSV export links present.
- RBAC: unauthenticated → 401, non-admin → 403 on every `/api/admin/*` endpoint.
- Self-protection: admin cannot demote or delete themselves.
- No MongoDB `_id` leakage; no password hashes in responses.

### Files changed/added
- New: `/app/backend/admin_routes.py`, `/app/backend/seed_admin.py`, `/app/frontend/src/pages/admin/AdminApp.jsx`.
- `/app/backend/auth.py` — added `get_current_admin_id` dep.
- `/app/backend/server.py` — `_user_public()` includes `is_admin`; admin router mounted on `api` router.
- `/app/backend/models.py` — `UserPublic.is_admin` field.
- `/app/frontend/src/App.js` — `<Route path="/admin/*">`.
- `/app/frontend/src/components/Layout.jsx` — conditional Admin sidebar link.
- `/app/memory/test_credentials.md` — admin credentials documented.
