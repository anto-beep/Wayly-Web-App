# Wayly BOS — PRODUCTION GO-LIVE READINESS REPORT (Report A)
Date: 13 Nov 2026 · Prepared in PREVIEW · **Publish NOT executed — awaiting founder approval**
Scope: Phases 1–5 BOS + Founder Command Centre. Reporting timezone: Australia/Sydney.

## Recommendation: ✅ CONDITIONAL GO
The code is production-ready (all automated checks green). Two operational conditions must be met as part of the release (both documented, non-destructive):
1. **Seed the 15 Help Centre articles into the production database after Publish** — because redeploys ship code only, not data (see §Environment). Script + export are ready.
2. **Confirm `EMERGENT_LLM_KEY` is present in production** (needed for AI support/content/pitch drafting) and that **email-sending flags are unchanged** (marketing remains OFF unless separately approved).
No release-blocking critical issues were found.

## 1. Features verified (preview)
5A.1 Marketing Investment Intelligence · 5A.2 Founder Command Centre (incl. new trend sparklines + auto daily/weekly briefing) · 4A Growth Engine · 4B Publicity/Partnerships/Referrals/Experiments · shared money/approval/alert core · corrected SLA/Help metrics · AI support (3A.3) · Help Centre (3A.2, 15 published).

## 2. Final test results
- **testing-agent iteration_401** — backend 16/16 passed, 1 skipped (skip was a wrong-path false alarm; publicity POST re-verified 200 by main agent). Covered: trend sparkline series, auto-briefing idempotency (same stored_at per Sydney day), **Decimal128 campaign GET/list/financials = 200 (previously-failing bug, now fixed)**, core regression (auth, summary, approvals, 15 public articles, marketing totals, support auth gates, growth content + AI draft, bos approvals).
- **testing-agent iteration_400** — BOS 5A.1/5A.2/4A/4B, 27/28 (1 HIGH Decimal128 bug found + fixed).
- **deployment-agent scan — PASS**: no hardcoded secrets/URLs, env-only config, CORS OK, supervisor valid, seeds idempotent, Decimal128 serialisers on all return paths, no destructive startup ops.
- Independence flag + publicity POST + GST/rounding/partial-payment/basis verified by main-agent curls.

## 3. Production environment assessment (AUTHORITATIVE — from Emergent platform)
- **Preview and production use SEPARATE MongoDB databases.** No sync between them.
- The **first** deploy migrated preview→production (one-time snapshot). **Every subsequent Publish deploys CODE ONLY** — the production database is left untouched.
- **Consequence:** the 15 Help Centre articles (approved+published in preview *after* the first deploy) are **in preview only** and will NOT appear in production on redeploy. New BOS collections (bos_*, new marketing fields) are created automatically on first write in production, but existing content must be migrated.
- **Rollback = CODE ONLY** (never restores the database). 
- **Mobile (Expo) deploys separately** — this release did not touch mobile, so no mobile build is required.

## 4. Database & migration plan
- **New collections (auto-created on first write in prod, no migration needed):** bos_approvals, bos_alerts, bos_briefings, bos_content, bos_seo_opportunities, bos_integrations, bos_publicity, bos_partnerships, bos_referrals, bos_experiments, bos_recommendations.
- **New marketing fields** on existing `marketing_*` docs are **additive** (Decimal128), written only on new/edited records — **no migration, existing records preserved**, missing fields handled honestly (never assumed paid/0).
- **Help Centre articles (one-time, required):** run the idempotent seed after Publish —
  `PROD_MONGO_URL=... PROD_DB_NAME=... python3 /app/backend/scripts/seed_help_articles_prod.py`
  (reads `scripts/help_articles_export.json`, 15 articles; INSERTs missing slugs, SKIPs any already-published in prod, never duplicates). Verified by dry-run. Alternative: Manage Publishes → Database → export `help_articles` from preview, import to production.
- **Legacy support tickets:** inspect production `sup_*` before any migration; the preview legacy migration is idempotent but production counts differ — run only if production has unmigrated legacy tickets, after backup. Not required for this release.

## 5. AI support readiness
AI drafts admin-triggered only, grounded strictly in approved/published Help Centre knowledge, never auto-send. Needs `EMERGENT_LLM_KEY` in production (Claude Sonnet 5.5). Degrades safely (503 with a friendly message) if the AI service/key is unavailable.

## 6. Marketing & financial integrity
Planned/committed/incurred/paid are distinct lenses (never summed); Decimal128 money, no float math; refunds/credits/voids/partial-payments handled; duplicate detection retained; CSV export kept; **no CSV import**; CPA/ROAS only where attribution exists else "attribution unavailable".

## 7. Founder dashboard metric verification
Every KPI carries source/definition/period/last-updated. Trends 7/30/90 + previous-period with honest N/A (never a % against a zero base) + sparklines. SLA = current first-response breaches only; security active vs historical; Help "pending approval" = submitted-only; Help helpful% = value or N/A with denominator. Alerts have lifecycle + dedup + auto-resolve. Approval Centre reflects real workflow states; approval ≠ execution. Briefing separates facts from rule-based recommendations; auto-generated once per Sydney day/week (no new scheduler, no external send).

## 8. Security & privacy
Admin-only (super_admin/operations_admin), server-side enforced, audited. No customer PII in marketing/analytics flows. External AI receives only approved knowledge + public brand text. Secrets env-only; none hardcoded. **If a previously-exposed Resend credential is still active, rotate it securely before/with go-live** (handled via secure secrets, never pasted in chat).

## 9. Feature-flag inventory (keep protected at go-live)
- Autonomous AI customer replies: **OFF** (drafts only). 
- Autonomous public content publishing: **OFF** (manual + approved + evidenced).
- Autonomous media/partnership outreach: **OFF** (approved + mark-sent only).
- Advertising budget/bid/targeting changes: **OFF** (read-only by design).
- Referral incentives / customer-facing programme: **OFF** (`REFERRAL_PROGRAM_ENABLED` unset).
- New/unapproved customer marketing sends: **OFF** (unchanged).

## 10. Existing email automation status (UNCHANGED by this release)
This release did not modify email. Marketing sending remains disabled unless separately approved (outbox worker OFF, Resend webhook inert). Required prod env for any future marketing send: `EMAIL_HASH_SECRET` (+ separately-approved `RESEND_WEBHOOK_SECRET`, `EMAIL_OUTBOX_WORKER_ENABLED`). Transactional/lifecycle emails: leave exactly as currently configured — do not duplicate or reschedule.

## 11. Production env vars for the new BOS code
- `EMERGENT_LLM_KEY` — **required** for AI drafting (confirm present in production).
- `SUPPORT_AI_MODEL` (default `claude-sonnet-5-5`), `SUPPORT_AI_PROVIDER` (default `anthropic`) — optional, safe defaults.
- `REFERRAL_PROGRAM_ENABLED` — optional, defaults OFF (keep OFF).

## 12. Deployment sequence (on approval)
1. Confirm backups + rollback readiness; confirm prod env vars + feature flags.
2. Publish (backend + frontend code). 3. Run `seed_help_articles_prod.py` against production (or manual import). 4. Production smoke test (§13). 5. Return Deployment Confirmation (Report B).

## 13. Rollback plan (data-preserving)
- **Code:** platform Deployment Rollback (reverts container only). 
- **Data:** no destructive migrations in this release; all BOS schema changes are additive, so old code runs safely against the new data. New collections may be dropped if ever needed without touching existing data. Rollback does NOT restore the DB — rely on the additive-only design + backups.

## 14. Remaining risks (none release-blocking)
- R1 (medium, operational): articles must be seeded post-deploy or `/help` + AI grounding will be empty in production — **mitigated** by the ready seed script/export.
- R2 (low): confirm `EMERGENT_LLM_KEY` in prod or AI drafting returns 503.
- R3 (low, cosmetic, FIXED): public cookie/ads banner no longer shows on `/admin` (ad pixels suppressed on admin/settings/billing).
- R4 (info): external marketing connectors (GA4/GSC/Metricool/Google/Meta/Microsoft Ads) are **not connected** — post-go-live stage, needs the founder's authorised read-only access.

## 15. GO / CONDITIONAL GO / NO-GO
**CONDITIONAL GO** — proceed when the founder approves, then perform the article seed and confirm `EMERGENT_LLM_KEY` + email flags as part of the release. **STOP: awaiting explicit founder production approval before Publish.**
