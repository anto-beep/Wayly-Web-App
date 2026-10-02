# UI-1 Backend Overhaul — Implementation Audit (Updated Feb 2026)

Status legend: ✅ shipped · 🟡 partial · ⬜ deferred for a follow-up PR

## Wave A — Foundations and copy discipline (shipped)
- ✅ §0.6 — `lib/formatDate.js` central util (DD/MM/YYYY, plus formatDateTime, formatRelative). Now used by Reports.jsx, CaregiverDashboard.jsx, NotificationsBell.jsx, DashboardTimelinePanel.jsx, EmailForwardingPanel.jsx, StatementLifecycleModals.jsx. Remaining callsites are incremental.
- ✅ §5 — `lib/formatRole.js` with acronym exception list (GP) + FIXED Title Case lookup.
- ✅ §4 — `lib/formatStatus.js` Title Case status mapping (DB enum unchanged; rendering layer only).
- ✅ §1 — backend header tagline "Support at Home, in plain English" removed; Wayly wordmark stays.
- ✅ §10 — Settings: Title Case sweep across every visible heading, SMS Alerts tab fully removed from TabNav and routing, appearance scoping caption added.
- ✅ §6.4 — appearance preference scoped to `wayly:app:appearance`. New `AppearanceScope` route hook in App.js strips `.theme-dark` on marketing routes so the bleed bug is closed.
- ✅ §11 — marketing hero pills cased "Australian-Hosted", "Privacy-First", "Independent", "AI Powered" + dark-mode tokens.
- ✅ §12 — Signup form: First Name + Last Name + Email + Mobile Number + Password with AU mobile regex and microcopy.
- ✅ §14.1 — AT-HM screen verbatim intro copy + status select Title Case via formatStatus.
- ✅ §14.2 — Care-Plan Changes intro copy + "Your Role" / "Your Name" Title Case + heading "Care-Plan Changes".
- ✅ §14.3 — Log a Scenario screen intro verbatim + tile redesign for AAA contrast.
- ✅ §14.4 — Switch Provider 5-step verbatim copy.

## Wave B — Major UX rebuilds (shipped)
- ✅ §3 — Calendar rebuilt with `react-big-calendar` + `date-fns`. Month/Week/Agenda views, edit/cancel/archive logic, brand token CSS. Backend `VisitBody` gained `status` enum (`active|cancelled|archived`).
- ✅ §9 — Switch Provider 5-step wizard. Stepper resumes from saved stage; draft notice letter auto-generated and downloadable as `.txt` and `.pdf` (server route `GET /api/switch-provider/{sid}/pdf`).
- ✅ §7 — Log a Scenario stepper: existing WorkflowsPanel + new cancel-confirm modal ("Keep Working" / "Save and Exit" / "Discard and Start Over") + Switch Workflow drawer that lists alternate workflows and preserves the current draft via the existing event-replay state.

## Wave C — Dark mode tokens, dashboard, contacts (shipped this round)
- ✅ §2 — **Dashboard bar charts rebuilt** (`components/DashboardInsights.jsx`):
  - Monthly Spend: 280px tall bars, Teal-Ink primary fill, Clay diagonal-striped co-payment overlay, y-axis with rounded ticks and gridlines, IBM Plex Mono tabular value labels above each bar, written empty state.
  - Anomalies Over Time: 240px tall stacked bars (Clay alert · Gold warn · Sage info), integer-tick y-axis, gridlines, written empty state.
  - Both charts: legend with shape indicators (squares + icons), AAA contrast both modes, hover shadow lift.
- ✅ §8 — Participant Contacts side panel (`ParticipantContactsPanel.jsx`) + `participant_contacts` Mongo collection. Permissions enforced.
- 🟡 §6.1 — Dark mode tokens applied to top-level surfaces (kindred-primary lifted to `#4FA8AE` for AAA on dark surface). Component-level audit (toggles, buttons, inputs, modals) verified for the new chart components; broader sweep still incremental.
- ✅ §4 — AT-HM Documents upload via `POST /api/athm/{hh}/files` (GridFS) with delete-soft + audit log entry.
- ✅ §10.2 — SMS notification endpoints return `410 Gone`; in-app UI removed; DB columns retained pending follow-up migration.

## §16 PR checklist status
- [x] No em dashes in any new copy.
- [x] Australian English throughout new copy.
- [x] Date format `DD/MM/YYYY` via `lib/formatDate.js`.
- [x] Font stack untouched; no stray font-family overrides introduced.
- [x] Backend tagline removed.
- [x] **Dashboard bar charts prominent, themed, AAA accessible.**
- [x] Calendar full rebuild.
- [x] AT-HM intro copy + Title Case status options + file uploads.
- [x] Care-Plan Changes intro copy + Title Case role/name labels.
- [x] Log a Scenario stepper with cancel-confirm + Switch Workflow drawer.
- [x] Participant Contacts side panel.
- [x] Switch Provider 5-step rebuild + PDF export.
- [x] Settings: Title Case sweep + SMS UI removed + appearance scoping caption.
- [x] Appearance preference no longer bleeds from app to marketing site.
- [x] Hero pills correctly cased and styled for dark mode.
- [x] Signup collects first/last/email/mobile with microcopy.
- [ ] Full WCAG 2.1 AAA contrast sweep across every primary screen — manual QA pass deferred (placeholder dark hex values pending Antony lock per §17).

## Open Items for Antony (§17)
1. Lock the dark-mode hex values for the broader Wave C-2 token sweep.
2. ~~Confirm `react-big-calendar` for §3 — done.~~
3. ~~Confirm archive (not hard-delete) for past appointments — implemented as spec.~~
4. Virus scan on uploads — pipeline check still needed.
5. SMS column drop migration timing — pending.
6. Mobile field international-format exception — currently AU-only.
