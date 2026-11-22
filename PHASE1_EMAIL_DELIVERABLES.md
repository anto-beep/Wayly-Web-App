# Wayly Business OS — Phase 1 Deliverables
## Email Automation Foundation · Consent & Reliability

**Status:** ✅ Implemented + tested in PREVIEW. **Nothing sent, nothing published.**
**Scope guardrails honoured:** development/testing only — no production sends, no live DNS/Stripe/Resend changes, outbox worker DISABLED, Resend webhook INERT (503).
**Date:** 13 November 2026 · **Verification:** 23 unit/integration + 10 security-hardening pytest PASS (iter396), testing agent iter395 (10 API-contract), web + mobile UI confirmed.

---

## 1. Summary of what was built

| # | P0 Requirement | Delivered |
|---|---|---|
| 1 | Optional, unchecked marketing-consent checkbox on web **and** mobile signup | ✅ Web `Signup.jsx` + Mobile `signup.tsx`, default **off**, never required to create an account |
| 2 | Secure unsubscribe/preferences pages + endpoint + RFC 8058 one-click POST | ✅ Web page `/email/preferences` & `/email/unsubscribe`; backend `routes/email_prefs.py`; `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headers |
| 3 | MongoDB-backed, duplicate-safe lifecycle email **outbox** (idempotency, delivery tracking, retries) | ✅ `lib/email_outbox.py` — unique `dedupe_key`, atomic claim, exponential backoff, dead-letter, provider Idempotency-Key, worker OFF by default |
| 4 | Resend webhook for bounces/complaints → suppression list | ✅ `routes/resend_webhook.py` — Svix signature verify, event dedupe, suppression upsert; **inert (503) until `RESEND_WEBHOOK_SECRET` is set** |
| 5 | Admin marketing campaigns cannot send to no-consent / unsubscribed / suppressed | ✅ `admin_phase_d.py` routes every recipient through the central `can_send_marketing` gate; counts `skipped_ineligible` |
| P1 | Privacy deletion covers lifecycle/notification/consent records, keeps de-identified opt-out tombstone | ✅ `privacy.py` — purges outbox + delivery events + consent events; writes a one-way `account_deleted` suppression hash |
| P1 | Development tests for all features | ✅ 4 pytest suites (23 tests) + testing-agent API contract (10 tests) |

---

## 2. Files changed / created

**Created (backend)**
- `lib/email_governance.py` — consent recording, signed tokens, suppression, the single `can_send_marketing` eligibility gate, `List-Unsubscribe` headers, index setup.
- `lib/email_outbox.py` — duplicate-safe outbox: `enqueue`, atomic `_claim_one`, `process_once` (retry/backoff/dead-letter), `worker_enabled()` (OFF by default).
- `routes/email_prefs.py` — `/email/preferences` (GET/POST), `/email/unsubscribe` (GET scanner-safe / POST one-click), `/account/marketing-preferences` (GET/PATCH, authenticated).
- `routes/resend_webhook.py` — `/webhook/resend` Svix-verified, dedup'd, suppression-maintaining; inert without the secret.
- `tests/test_email_governance_phase1.py`, `tests/test_email_outbox_phase1.py`, `tests/test_resend_webhook_phase1.py`, `tests/test_phase1_consent_integration.py`.

**Created (web)**
- `src/pages/EmailPreferences.jsx` — token-based preferences/unsubscribe page (`/email/preferences`, `/email/unsubscribe`).
- `src/components/settings/MarketingEmailToggle.jsx` — in-app Settings toggle.

**Modified**
- `backend/server.py` — signup captures consent + writes a consent-event; mounts the two routers; startup ensures indexes; outbox worker guarded OFF; `UserPublic.marketing_opted_in`.
- `backend/models.py` — `SignupRequest.marketing_consent: bool = False`.
- `backend/admin_phase_d.py` — campaign send gated by `can_send_marketing`.
- `backend/privacy.py` — deletion tombstone + lifecycle/consent/delivery cleanup.
- `frontend/src/pages/Signup.jsx` — consent checkbox (`signup-marketing-consent`).
- `frontend/src/pages/Settings.jsx` — renders `MarketingEmailToggle`.
- `mobile/app/signup.tsx` — consent checkbox (`signup-marketing-consent`).
- `mobile/app/(tabs)/settings.tsx` — `MarketingEmailCard` toggle (+ a11y state).

---

## 3. Database schema changes (MongoDB)

- `users` — new fields: `marketing_consent` (bool), `marketing_consent_at`, `marketing_consent_source` (`signup`|`settings`|`preferences_page`|`unsubscribe`), `marketing_consent_version`.
- `marketing_consent_events` — append-only consent audit: `{user_id, email_hash, status(opted_in|opted_out), source, version, created_at}`. Index `(user_id, created_at desc)`.
- `email_suppressions` — do-not-mail list: `{email_hash, reason(bounce_permanent|bounce_transient|complaint|unsubscribe|account_deleted), permanent, meta, created_at, updated_at}`. Unique index `(email_hash, reason)` + index on `permanent`.
- `email_outbox` — the lifecycle outbox. Unique index `dedupe_key`; index `(status, next_attempt_at)`. Body dropped on success.
- `email_delivery_events` — de-identified delivery log: `{svix_id, type, email_hash, provider_message_id, created_at}`.
- `resend_webhook_events` — svix-id dedupe ledger with `processed_at`.

Privacy note: suppression/delivery/consent records store only a **keyed HMAC-SHA256** (not a bare SHA-256) of the normalised email, keyed by `EMAIL_HASH_SECRET` — a pseudonymous identifier, never plaintext. Without the secret the value cannot be reversed by brute-forcing known addresses.

---

## 4. Outbox mechanism (how reliability works)

- **Guarantee:** at-least-once with strong de-duplication (NOT exactly-once).
- **Enqueue:** upsert on a unique `dedupe_key` → the same logical message can never be queued twice (concurrent-safe).
- **Claim:** atomic `find_one_and_update` marks a row `claimed` with an owner → two workers never process the same row. A claim left by a crashed worker is recovered after `STALE_CLAIM_SECONDS` (300s).
- **Lifecycle:** `pending → claimed → sent`, or retry with exponential backoff (60s→…→6h cap), or `dead` after `max_attempts` (default 6).
- **Provider idempotency:** the Resend `Idempotency-Key` is forwarded on every attempt, so a retry after an ambiguous/timed-out response won't double-send at Resend.
- **Privacy:** the HTML body is dropped from the row on success; failures log template + error only, never the body.
- **Safety:** the background worker is **OFF** (`worker_enabled()` returns false unless `EMAIL_OUTBOX_WORKER_ENABLED=1`), so Phase 1 never sends in preview.

---

## 5. Consent & compliance

- Consent checkbox is **optional and unchecked by default** on both surfaces; signup succeeds regardless.
- Every change (signup, Settings, preferences page, unsubscribe, webhook) is written to `marketing_consent_events` with source + wording version (`marketing-consent-v1-2026-06`).
- Marketing vs transactional is classified centrally (`EMAIL_TEMPLATES`); **unknown templates fail safe to marketing** (gated). Transactional mail (verification, reset, billing, trial, security) is never gated.
- Unsubscribe GET is **scanner-safe** (never mutates — link prefetchers/scanners only see a confirm page); the POST performs the opt-out (RFC 8058 one-click compatible).
- Re-opt-in clears an `unsubscribe` tombstone but **never** a hard `complaint`/`bounce_permanent` (protects sender reputation).

---

## 6. Privacy deletion

On account deletion (`privacy.py`): consent events, outbox rows, and de-identified delivery events for the address are purged, and a permanent **`account_deleted`** suppression (email **hash** only) tombstone is kept so a deleted/re-created address is never re-enrolled or re-emailed.

---

## 7. Test results

- `test_email_governance_phase1.py` — tokens/tamper, categories, consent+eligibility matrix, opt-in clears unsubscribe but not complaint. **4 PASS**
- `test_email_outbox_phase1.py` — dedupe, success clears body + forwards idempotency key, retry→backoff→dead, ambiguous retried-not-duplicated, atomic claim + stale recovery, worker disabled. **6 PASS**
- `test_resend_webhook_phase1.py` — valid/invalid/missing/stale signature, bounce vs complaint suppression. **5 PASS**
- `test_phase1_consent_integration.py` — signup consent on/off/omitted, scanner-safe GET, one-click POST, prefs round-trip, authed toggle, bogus token 400, webhook inert. **8 PASS**
- Testing-agent API-contract suite (iter395) — **10 PASS**, web + mobile Settings toggle verified end-to-end. **No defects.**

**Total: 33 automated checks green. No email was ever sent.**

---

## 8. Resend webhook — production setup (to activate LATER, not now)

The handler is intentionally inert. To turn it on after approval:
1. In the **Resend dashboard → Webhooks**, add an endpoint: `https://<prod-domain>/api/webhook/resend`.
2. Subscribe to events: `email.bounced`, `email.complained` (optionally `email.delivered`).
3. Copy the signing secret (`whsec_...`) and set it as backend env var **`RESEND_WEBHOOK_SECRET`**; restart the backend.
4. (When ready to actually send) set **`EMAIL_OUTBOX_WORKER_ENABLED=1`** to start the background delivery worker, and ensure `FRONTEND_URL`/`PUBLIC_APP_URL` are set so unsubscribe links are branded.
5. Send a Resend test event; confirm it returns 200 and a bounce/complaint creates an `email_suppressions` row.

Until step 3, `/api/webhook/resend` returns **503** and records nothing — unsigned events are never accepted.

---

## 9. NOT in Phase 1 (explicitly deferred)

Trial onboarding/conversion email sequences (Phase 2), consolidating the two trial/checkout mechanisms, and server-side GA4 purchase tracking — all left untouched per the Phase 1 constraints.
