# Wayly Business OS — Phase 1 Email Automation
## Final Security & Production-Readiness Review — GO-LIVE REPORT

**Date:** 13 November 2026 · **Status:** ✅ Review complete, all checks green in PREVIEW.
**NOT deployed. No customer emails sent. Outbox worker OFF. Resend webhook INERT (503). Awaiting your approval before Publish.**

---

## 1. Issues found & fixes made

| # | Review item | Finding | Fix |
|---|---|---|---|
| 1 | Email hashing | Suppression/consent/delivery records used a **bare SHA-256** of the email — reversible by brute-forcing the small space of real addresses. | Replaced with **keyed HMAC-SHA256** (`EMAIL_HASH_SECRET`), applied to a single normalised form (`strip().lower()`). **Fail-closed:** a missing/short secret raises `EmailHashSecretMissing`; `can_send_marketing` then returns `(False,'hash_unavailable')` so marketing can never bypass the suppression list. Secret never logged / never in source. |
| 2 | Deletion & re-consent | Explicit re-opt-in only cleared an `unsubscribe` tombstone, so a **deleted-then-recreated, explicitly-consenting user stayed permanently blocked** (`account_deleted` tombstone never cleared). | New `clear_optout_tombstones()` clears **only** `unsubscribe` + `account_deleted` on an **explicit affirmative opt-in** (signup-with-consent, settings toggle, prefs page). **Never** clears `complaint`/`bounce_permanent`. Recreation **without** consent clears nothing. Transactional email is never gated by suppression. |
| 3 | Unsubscribe/preference token security | A one-click **unsubscribe** token could be replayed to **re-subscribe** someone via the preferences POST; tokens had no issued-at/expiry. | Tokens now carry `iat` and are **purpose-scoped**. Opt-**IN** requires a fresh (`<=30 day`) `purpose="prefs"` token → unsub/stale tokens return **403**. Opt-**OUT** works with any valid token and never expires (RFC 8058). GET never mutates (unchanged, re-verified). Admin footer now uses an **opt-out** token for the unsubscribe link and a **separate prefs** token for "manage preferences". |
| 4 | Eligibility timing | Admin campaign checked consent only when the recipient list was **built**. | Added an **at-send** `can_send_marketing` re-check immediately before every `deliver()` in the admin loop (counts `skipped_ineligible`), and in the outbox send path (marketing-category → terminal `skipped`, not `sent`). |
| 5 | Resend contract | Verified against current Resend/Svix docs. | No bug. Confirmed: event names `email.bounced`/`email.complained`; `data.bounce.type` ∈ Permanent/Transient/Undetermined (hard → permanent suppression, soft/undetermined → non-permanent); Svix HMAC on the **raw body** with 5-min tolerance + `v1,<b64>` multi-sig parsing; svix-id dedupe; Resend Python SDK `Idempotency-Key` via `SendOptions(idempotency_key=...)` (matches our `deliver`); ambiguous/5xx/timeout → retried, definite 4xx → not retried. |
| — | Deliverables doc date | Said "June 2026". | Corrected to **13 November 2026**. |
| — | Stale test fixture | `trialactive@example.com` trial had lapsed. | Refreshed `trial_ends_at` to +5 days (test data only). |

---

## 2. Files changed (this review)

- `backend/lib/email_governance.py` — keyed HMAC `email_hash` + `normalize_email` + `email_hash_available` + `EmailHashSecretMissing`; `make_email_token` adds `iat`; `verify_email_token` adds `expected_purpose` + `max_age_days`; `clear_optout_tombstones()`; `record_consent` + `can_send_marketing` updated (fail-closed).
- `backend/routes/email_prefs.py` — opt-IN requires fresh `prefs` token (403 otherwise); opt-OUT unchanged.
- `backend/admin_phase_d.py` — at-send eligibility re-check; scoped unsub vs prefs footer tokens.
- `backend/lib/email_outbox.py` — terminal `skipped` state + counter.
- `backend/server.py` — signup clears opt-out tombstones on explicit consent; outbox `_send_fn` at-send marketing gate.
- `backend/.env` — added `EMAIL_HASH_SECRET` (preview value; **prod must set its own**).
- `backend/tests/test_phase1_security_iter396.py` (new, 10), `backend/tests/test_phase1_regression_iter396.py` (new, 9, by testing agent).
- `PHASE1_EMAIL_DELIVERABLES.md` — date + hashing wording corrected.
- No frontend/mobile code changes this pass (UI unchanged; re-verified).

---

## 3. Full test results

- **Phase 1 feature + security pytest: 33/33 PASS** — governance (4), outbox (6), webhook (5), consent integration (8), security hardening (10). ~55s.
- **Regression pytest: 9/9 PASS (1 skip)** — signup/login/me, forgot (always 200), verification-status, access-state fixtures, `/billing/subscription`, Stripe checkout + webhook routes parse (<500). *Skip:* `forgot_then_reset` (dev harness can't read the one-time reset token from the DB — the forgot endpoint itself passes; not a regression).
- **Testing agent iter396:** backend green + **Web** `/signup` consent (unchecked) and `/settings/digest` toggle (PATCH 200, persists) + **Mobile** signup consent + Settings `MarketingEmailCard` toggle present/persisting. Report: `/app/test_reports/iteration_396.json`.
- Constraints upheld: no sends, `RESEND_WEBHOOK_SECRET` unset, worker unset, no live Stripe charges. Synthetic data cleaned; `cathy@example.com` restored to `marketing_consent=false`.

---

## 4. Outstanding risks

- **`EMAIL_HASH_SECRET` must be set in production and must never change.** It keys every suppression/consent identifier; rotating it orphans the existing do-not-mail list. Treat it like `JWT_SECRET`. If absent in prod, marketing fails closed (safe) but consent-audit hashing will log warnings.
- **Suppression = pseudonymous personal data**, not anonymous. Documented; handle under the same privacy rules as other PII.
- **Webhook + sending remain OFF by design.** No bounce/complaint suppression accrues until `RESEND_WEBHOOK_SECRET` is set and the endpoint is registered in Resend. Until then, rely on consent + manual unsubscribe only.
- **Delivery guarantee is at-least-once + strong dedupe** (not exactly-once) — acceptable and documented.
- **Forgot/reset DB-token test** is skipped in the harness; the live flow works but isn't covered by an automated end-to-end assertion.

---

## 5. Required production environment variables (names only)

**New / must set before enabling Phase 1 marketing:**
- `EMAIL_HASH_SECRET` — **REQUIRED**, strong random, stable forever.

**Needed only when you choose to ACTIVATE sending/webhook (keep unset for now):**
- `RESEND_WEBHOOK_SECRET` — activates the bounce/complaint webhook (otherwise 503).
- `EMAIL_OUTBOX_WORKER_ENABLED` — set to `1` to start the background delivery worker.

**Already present in prod (used by Phase 1, no change):**
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (or `SENDER_EMAIL`), `FRONTEND_URL` (or `PUBLIC_APP_URL`), `MONGO_URL`, `DB_NAME`, `JWT_SECRET`.

Optional tuning (sensible defaults in code): `EMAIL_OUTBOX_MAX_ATTEMPTS`, `EMAIL_OUTBOX_STALE_SECONDS`, `EMAIL_OUTBOX_BACKOFF_BASE`.

---

## 6. Manual Resend dashboard steps (do LATER, on activation — not now)

1. Resend → **Webhooks** → add endpoint `https://<prod-domain>/api/webhook/resend`.
2. Subscribe to `email.bounced`, `email.complained` (optionally `email.delivered`).
3. Copy the signing secret (`whsec_…`) → set prod `RESEND_WEBHOOK_SECRET` → restart backend.
4. Send a Resend **test** event → expect **200**; confirm a bounce/complaint creates one `email_suppressions` row.
5. Confirm `RESEND_FROM_EMAIL` is a **verified** domain/sender in Resend.
6. Only when ready to actually send lifecycle mail: set `EMAIL_OUTBOX_WORKER_ENABLED=1`.

---

## 7. Safe deployment order

1. Set **`EMAIL_HASH_SECRET`** in the production environment first (before code).
2. Publish the backend (routes, governance, outbox, admin gate, privacy). Webhook stays 503, worker stays off — zero customer-facing email behaviour changes.
3. Publish web + mobile (consent checkbox + settings toggles).
4. Leave `RESEND_WEBHOOK_SECRET` and `EMAIL_OUTBOX_WORKER_ENABLED` **unset** → Phase 1 is live for consent capture + preferences only, still no sends.
5. (Separate, later, with its own approval) complete the Resend dashboard steps to activate the webhook, then the worker.

---

## 8. Post-deployment verification checklist (prod, non-destructive)

- [ ] `GET /api/webhook/resend` path returns **503** (inert) until the secret is set.
- [ ] Backend logs show `email governance + outbox indexes ensured` and `email outbox worker disabled`.
- [ ] `email_suppressions` has the unique `(email_hash, reason)` index and `email_outbox` has the unique `dedupe_key` index.
- [ ] Sign up a throwaway account with the box **ticked** → `users.marketing_consent=true` + a `marketing_consent_events` row; with it **unticked** → false.
- [ ] Web `/signup` + `/settings/digest` toggle and mobile signup + Settings card render.
- [ ] One-click `POST /api/email/unsubscribe?token=…` opts out + writes a suppression; `GET` of the same link does **not**.
- [ ] Admin test campaign to a non-consented/suppressed user reports `skipped_ineligible` and sends 0 to them.
- [ ] Delete the throwaway account → `account_deleted` suppression tombstone present; recreate + explicitly consent → eligible again.

---

## 9. Rollback instructions

- **Preferred:** use the Emergent **Rollback** feature to return to the previous checkpoint (free, no data loss). Do **not** `git reset`.
- **Fast disable without rollback:** marketing sending is already gated — simply **unset `EMAIL_OUTBOX_WORKER_ENABLED`** (stops the worker) and **unset `RESEND_WEBHOOK_SECRET`** (webhook back to 503). Consent capture is passive and safe to leave running.
- **If `EMAIL_HASH_SECRET` was mis-set:** because it keys the suppression list, do **not** silently change it; if it must change, plan a re-hash migration of `email_suppressions` / `email_delivery_events` (Phase 1 ships with these collections empty, so a pre-send change is free).

---

## 10. Approval gate

Per your instruction, **nothing has been deployed or activated.** Please review and approve before we Publish. On approval, follow §7 (set `EMAIL_HASH_SECRET`, then publish; keep webhook + worker off until you separately choose to activate per §6).
