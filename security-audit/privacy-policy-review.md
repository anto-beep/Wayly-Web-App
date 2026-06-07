# Wayly — Privacy Policy Review (Phase 9)

Last updated: 2026-02-07
Owner: security@wayly.com.au + (legal counsel)

This document maps each Australian Privacy Principle (APP) to a concrete
control we now have in place. It's the engineering-side checklist that
underpins the customer-facing privacy policy at `wayly.com.au/privacy`.

## APP 1 — Open and transparent management
- **Public privacy policy** at `wayly.com.au/privacy` (existing page).
- **Trust page** at `wayly.com.au/trust` (Phase 9.5 deliverable — pending).
- **Privacy policy review cadence**: quarterly, signed off by the DPO.

## APP 3 — Collection of personal information
- We collect **only what's necessary** to operate the aged-care budget tool: name, email, participant DOB, classification level, statements.
- **No collection of unnecessary sensitive info** (e.g., we don't ask for Medicare number, tax file number, biometrics).
- **No third-party data brokers** — every record originates from the user.

## APP 5 — Notification of collection
- Signup form discloses what we collect and why (the existing copy needs a one-line refresh to add the new "two-factor" + "60-day deletion window" notes).
- Each tool (decoder, budget calc, reports) shows a one-liner explaining the data used.

## APP 6 — Use or disclosure
- **Data is never sold**.
- **Disclosure only** for: payments (Stripe), email delivery (Resend), AI analysis (LLM through Emergent Universal Key), file scanning (ClamAV — local only, no upload).
- Cross-border disclosure: Stripe (US), Resend (US), OpenAI/Anthropic (US). Disclosed in the privacy policy.

## APP 7 — Direct marketing
- Marketing emails (newsletter) are **double-opt-in** with a one-click unsubscribe.
- Transactional emails (receipts, alerts) are not subject to opt-in.

## APP 8 — Cross-border disclosure
- All cross-border processors above are listed in the policy.
- All carry **SOC 2 Type II** equivalents (Stripe / Resend / OpenAI / Anthropic).

## APP 11 — Security of personal information
- **Phase 1**: bcrypt cost-12 passwords, HIBP blocked, MFA available, account lockout, JWT refresh + blocklist.
- **Phase 2**: every participant-scoped endpoint validated via `assert_participant_access`.
- **Phase 3**: Redis rate limits on login / signup / reset / uploads / tools.
- **Phase 4**: ClamAV virus scan, magic-byte allowlist, 20 MB cap, UUID rename, prompt-injection sanitiser.
- **Phase 5**: HSTS + CSP + X-Frame-Options + Referrer-Policy + Permissions-Policy.
- **Phase 6**: AES-256 at rest (Mongo Atlas + S3 SSE), TLS 1.2+ in transit, Fernet on TOTP secrets.
- **Phase 7**: weekly Dependabot; bumped pyjwt / starlette / urllib3 / aiohttp / axios / react-router.
- **Phase 8**: admin gate, IP allowlist, new-device email alert, hash-chained immutable audit log.
- **Phase 11.2**: When personal info is no longer needed, we destroy it — Phase 9 cron purges 60 days after deletion request.

## APP 12 — Access to personal information
- **`/api/auth/account/export`** (Phase 9) — returns every piece of personal data Wayly holds about the user, cited as "Australian Privacy Act APP 12" in the response payload.
- Returns within 30 seconds (synchronous JSON); no application form required.

## APP 13 — Correction of personal information
- **`/api/account` PATCH** — name, email, plan.
- **Settings → Participants** — edit DOB, classification, household members.
- Statement line-item corrections via the existing care-plan amendments flow.

## APP "delete me" — Right to deletion
- **`DELETE /api/auth/account`** with confirmation phrase (Phase 9):
  - Immediate anonymisation of `users.email`, `name`, `password_hash`, `totp_secret`.
  - Soft-mark `deleted_at` on every scoped row across 26 collections.
  - 60-day cool-off window during which contact to `hello@wayly.com.au` can restore.
  - Hard-delete cron runs daily and permanently removes everything after 60 days.

## Open follow-ups (P1 backlog)
1. Update the public `/privacy` page copy with the new MFA + 60-day deletion language.
2. Publish a public `/trust` page mapping each APP to a plain-English control (Phase 9.5).
3. Add the `templates/breach_notification.html` email template referenced by the NDB runbook.
4. Schedule quarterly tabletop exercises (first one within 90 days of Phase 9 ship).
5. Document a CSFLE migration plan for free-text PII columns (longer-term Tier-1 hardening).
