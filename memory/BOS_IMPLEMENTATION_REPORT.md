# Wayly Business Operating System — Consolidated Implementation Report
Programme: Phase 5A.1 + 5A.2 + 4A + 4B · Built as ONE coordinated programme · **PREVIEW ONLY — NOT DEPLOYED**
Date: 13 Nov 2026 · Testing: testing-agent iteration_400 (27/28 pytest, 1 bug found & fixed, retest green) · Model for AI: Claude Sonnet 5.5 (Emergent key)

Governing loop honoured throughout: Observe → Analyse → Recommend → **Approve** → **Execute** → Measure → Improve.
Approval ≠ execution. No auto-publish, no auto-send, no ad-budget/billing changes. Honest N/A, never fabricated zeros.

---
## Shared architecture (new, reused across all phases)
- `backend/bos_core.py` — AUD money as **Decimal / BSON Decimal128** (never binary float); GST compute; `expense_financials()` returning distinct planned/committed/incurred/paid/outstanding lenses with an honest *basis* (explicit / derived / unknown / voided); Australia/Sydney period math (7/30/90/custom) + previous-period; `pct_change` returns **None (N/A) when previous is 0**; per-priority SLA policy.
- `backend/bos_approvals.py` — unified approval registry `bos_approvals` (draft→submitted→pending_approval→approved/rejected/changes_requested→executed/failed/cancelled); `request_approval()` + `/api/admin/bos/approvals` (approve/reject/request-changes/mark-executed). Syncs `approval_state` back to source entities. Does NOT replace Help/marketing native flows.
- New collections: bos_approvals, bos_alerts, bos_content, bos_seo_opportunities, bos_integrations, bos_publicity, bos_partnerships, bos_referrals, bos_experiments, bos_recommendations. Reused: marketing_* , sup_*, help_articles, subscriptions, users, contact_requests, security_alerts.

---
## Milestone 1 — Phase 5A.1 Marketing Investment Intelligence  ✅
**Reused:** existing `routes/marketing_spend.py` register (categories incl. EDM/Solus/newsletter/advertorial, campaigns+outcomes, GST-aware expenses, void/refund, duplicate detection, CSV **export**, attachments, audit). No second ledger. **No CSV import** (per mandate).
**New:**
- Distinct financial lenses on each expense: `planned_amount_aud`, `committed_amount_aud`, `incurred_amount_aud`, `amount_paid_aud`, `credit_amount_aud` (Decimal128). `financials` block computed per expense; **never summed together**; `outstanding = incurred − paid` only when both known; partially-paid with no explicit amount = **unknown** (not 0, not paid).
- Publisher / media-placement fields: publisher_name, publication_name, placement_format, placement_objective, audience_description, quoted_audience_size, booked/actual distribution dates, tracking_link, utm_source/medium/campaign, performance_report_url/notes. Multiple placements per campaign.
- Campaign budget + financials: `POST /campaigns/{id}/budget`, `GET /campaigns/{id}/financials` (budget vs planned/committed/incurred/paid, remaining, variance, by channel/category/publisher, monthly, performance: cost-per-enquiry/registration/trial/paid-sub, ROAS, marketing ROI — each shows **"attribution unavailable"** when the outcome is missing). `GET /placements`. Outcome `source_class` (publisher_reported vs verified).
- CSV export extended with the new columns (export retained; import NOT built).
**Endpoints:** `/api/admin/marketing/*` (existing + budget/financials/placements). **UI:** `/admin/marketing-spend` — summary lenses (Total/Committed/Incurred/Paid/Outstanding/Planned/Budget remaining), expense modal "Financial detail" + "Publisher & media placement" sections, per-campaign **Financials** drill.

## Milestone 2 — Phase 5A.2 Founder Command Centre  ✅
**Reused + corrected the existing `/admin/command-centre` (not replaced).**
**Fixed misleading metrics:** SLA breaches → only CURRENT unresolved tickets past their per-priority first-response target with no staff reply (not every old ticket); Help "pending approval" → only `in_review` (plain drafts excluded); Help helpful% shows value or **N/A** with denominator; marketing lenses never double-counted.
**New (`routes/command_centre_ext.py`, same prefix):** metric-definitions registry; `/trends` 7/30/90/custom + previous-period (+abs/%, honest N/A); actionable `/alerts` with lifecycle (active/acknowledged/resolved, dedup, auto-resolve) + acknowledge/resolve; unified `/approvals` (help in_review + marketing planned + bos_approvals; drafts & AI drafts excluded); `/needs-attention`; on-demand `/briefing?type=daily|weekly` (facts vs rule-based recommendations, clearly separated); `/integrations` health (external connectors all **not_connected**, manual never shown as verified).
**UI:** `/admin/command-centre` — Needs-Your-Attention, Business Trends, summary blocks, Founder Approval Centre (approve/reject/request-changes), Operational Alerts (ack/resolve), Founder Briefing (generate daily/weekly), Integration & Data-source Health.

## Milestone 3 — Phase 4A Marketing & Brand Growth Engine  ✅
**New (`routes/growth_engine.py`):** consolidated content calendar + editorial workflow `bos_content` (idea→…→approved→scheduled→published, distinct editorial vs publish status); submit routes into the Approval Centre; schedule/mark-published gated behind **approved** and **manual+evidenced** (no auto-publish); grounded **AI content draft** (Claude Sonnet 5.5, approved Help Centre knowledge only, Australian English, no fabricated stats/testimonials); SEO opportunity engine `bos_seo_opportunities`; read-only connector framework `bos_integrations` (GSC, GA4, Metricool, Google/Meta/Microsoft Ads — all **not_connected**, honest setup notes). Marketing spend stays in the Register.
**UI:** `/admin/growth-engine` — Content / Calendar / SEO / Connectors.

## Milestone 4 — Phase 4B Publicity, Partnerships, Referrals & Experiments  ✅
**New (`routes/growth_pipeline.py`):** publicity pipeline `bos_publicity` (identified→…→sent) with **AI pitch draft** (never auto-sent) + approval + mark-sent gated behind approved; partnership pipeline `bos_partnerships` with **independence flag** (provider referral/commission/endorsement → flagged for founder review); experiment register `bos_experiments` (hypothesis, metrics, guardrails, baseline, sample size, confidence note — uncertainty-honest); referral tracking `bos_referrals` **behind feature flag `REFERRAL_PROGRAM_ENABLED` (OFF)**, no incentives, internal source records only (no customer PII exposed); AI growth recommendations `bos_recommendations` (+ generator from verified signals, impact always paired with its uncertainty).
**UI:** `/admin/growth-pipeline` — Publicity / Partnerships / Experiments / Referrals / Recommendations.

---
## Security, privacy, independence
Admin-only (super_admin + operations_admin), server-side enforced, audited. No customer PII in marketing/analytics flows. External AI only receives approved Help Centre knowledge + public brand text. Wayly independence preserved (provider referrals flagged, never auto-accepted). Referral programme OFF behind a flag. No live sends/publishes/ad-budget/billing changes.

## Test results
testing-agent iteration_400 — backend 27/28 pytest PASS; all four admin pages render with their testids. One HIGH bug found (GET campaign 500 on Decimal128 budget) — **fixed** via `_campaign_public()` serializer and re-verified (GET/list/financials 200; budget round-trips 5000.0). Money/GST/rounding/partial-payment/basis, trends N/A, alert lifecycle, approval≠execution, AI grounding, referral flag, independence flag all verified. All synthetic test data cleaned up.

## Known limitations / not available
- **External marketing integrations are NOT connected** (GSC/GA4/Metricool/Google/Meta/Microsoft Ads). Framework + honest status only; each needs authorised account access + credentials before any real data is shown. None assumed available via ChatGPT.
- Trends cover reliable flow metrics (signups, new subs, cancellations proxy via status+updated_at, enquiries, tickets, marketing spend). Cohort trial→paid conversion is reported honestly where derivable, not fabricated.
- Content "published" / publicity "sent" are **manual, evidenced** records — Wayly does not post or email externally itself.
- Referral programme is behind a flag and OFF; no customer-facing codes/incentives live.

## Operating cost
AI drafting (content + pitches) uses the Emergent key (Claude Sonnet 5.5), on-demand only, ~sub-cent per draft. No new paid services introduced.

## Production readiness & rollback
Preview-verified; **awaiting founder approval before Publish**. All new money fields are additive — **no migration performed**, existing records untouched. Rollback is data-preserving (use the platform Rollback; new collections can be dropped without touching existing data).

## Final programme summary
- **Complete:** 5A.1, 5A.2, 4A, 4B backend + admin UI; shared money/approval/alert core; corrected Command Centre metrics.
- **Unavailable until authorised:** all external read-only connectors (GSC, GA4, Metricool, Google/Meta/Microsoft Ads).
- **Active workflows:** marketing investment; founder approvals; alerts; content editorial; SEO opportunities; publicity/partnership/experiment tracking; recommendations.
- **Disabled/flagged:** customer referral programme (feature flag OFF); provider-type partnerships (independence flag).
- **Requires founder approval (in-app):** content publication, media/partnership outreach, marketing expenses, experiment proposals — surfaced in the Founder Approval Centre.
- **Next:** connect GSC + GA4 read-only (needs authorised access); extend attribution once analytics connected; optional recurring briefing schedule (separate approval).
