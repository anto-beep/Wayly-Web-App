# Web ↔ Mobile Parity Audit — Their Care / Providers & Paperwork / Your Account

Web (`/app/frontend`) is the source of truth. Mobile (`/app/mobile`) is aligned to it.
Scope = the three nav categories the user flagged. Screen list from
`frontend/src/components/Layout.jsx` navGroups + `mobile/src/config/navGroups.ts`.

Status legend: ✅ done & tested this iteration · 🟡 partial · ⬜ remaining (backlog)

---

## THEIR CARE

| Screen | Web page | Mobile screen | Status | Notes |
|---|---|---|---|---|
| Care Team | `/app/family` (FamilyThread) → contacts | `care-team.tsx` (ContactsView) | 🟡 | Backed by shared ContactsView; verify field parity with web family contacts. |
| Key Contacts | dashboard modal `/app?contacts=open` | `key-contacts.tsx` (ContactsView) | 🟡 | Mobile is a full screen vs web modal; functionally equivalent. |
| Calendar | `extended/VisitCalendar.jsx` (`/api/visits` CRUD) | `calendar.tsx` | ✅ | Rebuilt mobile to full `/api/visits` CRUD: add/edit/cancel/restore/archive/delete. Was read-only. Tested iter243. |
| Hospital Mode | `extended/HospitalLiaison.jsx` | `hospital.tsx` | 🟡 | Endpoints match (admissions/discharge/request-rcp). ⬜ Swap YYYY-MM-DD text input for DateField (DD/MM/YYYY). |
| Care Plans | `CarePlanStore.jsx` + `CarePlanDetail.jsx` | `care-plans.tsx` + NEW `care-plan/[id].tsx` | ✅🟡 | Built mobile detail (summary, findings by severity, services, notes save, re-run analyse, follow-up-email modal+copy, PDF download) + list header + tap-open. Tested iter243. ⬜ Remaining: archived list + restore (`/care-plans/archived/list`, `/care-plans/{id}/restore`), compare two plans. |
| Care-Plan Changes | `extended/CarePlanAmendments.jsx` | `amendments.tsx` | 🟡 | generate + list match. ⬜ Add status update action (`PATCH /amendments/{id}/status`). |
| Log a Scenario | `extended/ScenarioCapture.jsx` | `scenarios.tsx` | 🟡 | event-types + events match. ⬜ Surface `/scenario/participants/{id}/state`. |
| Cases | `ParticipantCases.jsx` / `CaseDetail.jsx` | `cases.tsx` + `case/[id].tsx` | ✅🟡 | Added header title "Complaints & Cases". Detail has assignee/events. ⬜ Verify statement-pair deep-links + assignee-candidates parity. |
| Timeline | `extended/ParticipantTimeline.jsx` (`/scenario/.../timeline`) | `timeline.tsx` (`/core/.../timeline`) | 🟡 | DIVERGENT endpoint. ⬜ Confirm both aggregate the same events or align to one source. |

## PROVIDERS & PAPERWORK

| Screen | Web page | Mobile screen | Status | Notes |
|---|---|---|---|---|
| Documents | `DocumentVault.jsx` | `documents.tsx` | ✅ | Added EDIT metadata modal (title/category/notes → `PATCH /documents/{id}`) + notes on card. Upload/download/send-to-decoder already present. Tested iter244. |
| Correspondence | `extended/Correspondence.jsx` (`/correspondence` contact-log) | `correspondence.tsx` | ✅ | REBUILT mobile from LF-1 letters to the web contact-log (`/api/correspondence`): direction/channel/counterparty/subject/when/notes, add + delete. Now shares data with web. Tested iter244. NOTE: `correspondence/[id].tsx` remains the LF-1 letter editor used by invoice/CHSP deep-links + `/letters`. |
| Compare Providers | `/app/tools/provider-price-checker/compare` | `compare-providers.tsx` (`/ppc3/provider-comparison`) | 🟡 | ⬜ Verify depth parity: official star ratings / quality profiles / history. |
| Ratings | `extended/ProviderRatings.jsx` | `ratings.tsx` | ✅ | Same `/provider-ratings` CRUD — parity. |

## YOUR ACCOUNT

| Screen | Web page | Mobile screen | Status | Notes |
|---|---|---|---|---|
| Participants | `extended/Participants.jsx` | `participants.tsx` | 🟡 | Core CRUD/preview/promote/share-link/remove/restore match. ⬜ Add share-link **rotate** (`/participants/{id}/share-link/rotate`) + `/v2/cancel-pending-addon`. |
| Referrals | `extended/Referrals.jsx` | `referrals.tsx` | ✅ | Same `/referrals` — parity. |
| Audit Log | `AuditLog.jsx` | `audit.tsx` | ✅ | Same `/audit-log` — parity. |
| Support | `MySupport.jsx` | `support.tsx` + `support/[id].tsx` | ✅🟡 | Added CSAT rating (stars + comment → `POST /support/tickets/{id}/csat`) + read-only display. List/detail/messages/close/reopen present. Tested iter244. ⬜ Add message attachments upload/download. |
| Settings | `Settings.jsx` (account + notifications + full payments mgmt) | `(tabs)/settings.tsx` + `plan-billing.tsx` + `family-members.tsx` + `security.tsx` + `profile-edit.tsx` | 🟡 | Settings is split across several mobile screens. ⬜ Verify payments parity: change-plan, proration-preview, schedule-downgrade, cancel/reactivate, portal, invoices. |

---

## Remaining backlog — Phase 2 status
1. ✅ Care Plans: archived (Trash) list + restore + permanent delete + side-by-side compare (mobile). DONE iter245.
2. ✅ Settings/Billing: invoice history added + reactivate path bug fixed (was `/reactivate-subscription` → 404; now `/payments/reactivate-subscription`). Change/cancel/downgrade/keep/portal already present. DONE iter245.
3. ✅ Compare Providers: already at depth parity (ACQSC compliance, official star ratings, Wayly recommend %, public referrals, quality signal chip, drill-in to `/provider-quality/[name]`). No change needed.
4. ✅ Support: message attachments (upload PDF/PNG/JPEG/WebP + authenticated download). DONE iter245.
5. ✅ Participants: share-link rotate. DONE iter245. (⬜ `/v2/cancel-pending-addon` still not surfaced on mobile.)
6. ✅ Timeline UNIFIED (iter248). Canonical source + shape decided: **`GET /api/core/participants/{pid}/timeline` returning `{events:[{id,event_type,event_source,event_timestamp,summary,linked_artefact_type,linked_artefact_id,metadata}]}`** (persona-rendered, artefact-linked). The core builder (`_compose_timeline`/`_derived_events_for_participant`) was enriched to also fold in scenario life-events, lifecycle state transitions, and alerts (safeguarding `flag_change` rows excluded), so nothing the old web `/scenario/.../timeline` showed is lost. Web `ParticipantTimeline` now reads `/core/.../timeline` and adapts events → its `{items}` view model; mobile already consumed `{events}`. Legacy `/scenario/.../timeline` remains for backward compatibility but is no longer used by the UI.
7. ✅ Hospital DateField; ✅ Amendments status update; ✅ Scenarios state panel. DONE iter245.
8. ✅ Care Team / Key Contacts RESOLVED (iter249). Canonical mapping applied on mobile: **Care Team = family message thread** (`GET/POST /family-thread`, mirrors web `/app/family`) — `mobile/app/care-team.tsx` rewritten from a contacts list into a threaded message screen. **Key Contacts = the full contacts modal** — `mobile/app/key-contacts.tsx` now uses ContactsView `variant="all"` (care professionals + personal/emergency), matching the web dashboard Key Contacts panel, so no contact kinds are orphaned. `/v2/cancel-pending-addon` is now on mobile too (iter247). NOTE: mobile "Their Care" still lists an extra "Cases" item not in web's Their Care nav.


## Publishing (web) — done this iteration
- 3 SEO/AEO articles added to `/resources/articles` via `frontend/src/data/seoArticles2026.js`
  (chsp-extension-2029-what-it-means, support-at-home-personal-care-free-1-october-2026,
  support-at-home-statement-vs-invoice-explained). Full Article + FAQPage + HowTo + Breadcrumb
  JSON-LD, TOC, key takeaways, related links, trust footer. Added to `backend/seo_routes.py` sitemap.
