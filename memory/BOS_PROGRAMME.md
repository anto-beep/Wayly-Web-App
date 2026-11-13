# Wayly BOS Programme — Phases 5A.1, 5A.2, 4A, 4B

Single coordinated programme. Shared backend (FastAPI+Mongo), React admin. Preview only.
Cadence (user choice): build all four, then ONE comprehensive test pass at the end.
Money (user choice): add NEW financial fields safely as Decimal128/cents, NO migration of
existing records, never binary-float math, never assume missing=0 or paid.

## Governing loop
Observe → Analyse → Recommend → Approve → Execute → Measure → Improve.
Approval ≠ execution. Material change after approval ⇒ re-approve. Everything audited.
No auto-send / auto-publish / auto-outreach / ad-budget or billing changes. Honest N/A, never fabricated zero.

## Shared architecture (new)
- `backend/bos_core.py` — money (Decimal/Decimal128, GST, expense_financials), Australia/Sydney
  periods + previous-period compare, pct_change (None when prev 0), SLA policy, serialisers.
- `backend/bos_approvals.py` — unified approval registry `bos_approvals` (draft→submitted→
  pending_approval→approved/rejected/changes_requested→executed/failed/cancelled). Reused by 4A/4B.
- Collections (new): bos_approvals, bos_alerts, bos_content, bos_seo_opportunities,
  bos_integrations, bos_publicity, bos_partnerships, bos_referrals, bos_experiments,
  bos_recommendations. Reuse existing: marketing_* , sup_* , help_articles, subscriptions, users.

## Milestones
- 5A.1 Marketing Investment Intelligence — EXTEND routes/marketing_spend.py
  (placement fields, distinct planned/committed/incurred/paid, campaign budget+financials+
  performance with honest attribution, keep CSV export). Frontend: extend AdminMarketingSpend.jsx.
- 5A.2 Founder Command Centre — EXTEND command_centre (new router command_centre_ext.py at same
  /admin/command-centre prefix): metric defs, 7/30/90/custom trends + prev-period, fixed SLA/
  security/help metrics, actionable alerts, unified Approval Centre, Needs-Your-Attention, on-demand
  daily/weekly briefing, integration health. Frontend: overhaul AdminCommandCentre.jsx (same page).
- 4A Growth Engine — routes/growth_engine.py (marketing calendar + content workflow, AI content
  draft grounded in approved Help Centre, SEO opportunities, read-only connector framework honest
  'not connected'). Frontend: AdminGrowthEngine.jsx.
- 4B Publicity/Partnerships/Referrals/Experiments — routes/growth_pipeline.py (publicity pipeline,
  partnership pipeline w/ independence flag, referral tracking behind feature flag + safeguards,
  experiment register w/ uncertainty, AI growth recommendations). Frontend: AdminGrowthPipeline.jsx.

## Status
- [DONE] 15 Help Centre articles published (approve→publish, audited). Preview only; prod on next deploy.
- [DONE] Phase 3A.3 AI Support fixed+tested (iteration_399).
- [DONE] 5A.1, 5A.2, 4A, 4B built + tested (iteration_400, 1 bug fixed). Preview only, awaiting founder approval to Publish.
- Consolidated report: /app/memory/BOS_IMPLEMENTATION_REPORT.md
