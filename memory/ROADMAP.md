# Wayly — Prioritised Backlog / Roadmap

_Started Jun 2026. Historical implementation log lives in PRD.md (dated sections)._

## Recently shipped
- **Iter 320 (Jun 2026)** — Blocked Statement Demo (seed + forward publishable/publish_block/low_confidence into DecoderResultView on web + mobile statement detail); Required/Optional badge sweep across 22 mobile forms; Bulk Follow-up (multi-select mailbox chase-ups, web + mobile, `POST /lf1/follow-ups/bulk-send`); Letter Preview (polished WYSIWYG letter-paper modal, web + mobile). Verified iteration_320 (both platforms).
- **Mobile parity (Jun 2026)** — Statement Decoder publish gate; Letters & Follow-ups redesigned front door + mailbox; consolidated letter detail screen; Required/Optional badges on account forms. Verified iteration_319.

## P1 — next up
- **Reviewer PDF Match** — the downloaded review PDF should include the same safety checks the family sees on screen.
- **Printable Estimate** — turn the budget summary into a one-page printable sheet families can take to their provider.
- **Fee Transparency** — break out care management, package management and GST as their own visible rows so the total always reconciles on screen.

## P2 — backlog
- **LLM auto-retry / timeout for letter generation** (Gateway Guardrail) if the gateway hangs — ties into the recurring backend-deadlock blocker.
- **Recipient Directory** — save a provider's name + email once so every future letter is pre-addressed.
- **Blocker Letters Bundle** — turn all blockers on a statement into a single email to the provider instead of one per issue.
- **Corrected Re-check** — mark a blocker as "provider fixed it" and re-run just that statement to confirm reconciliation.
- **Confidence Legend** — small "how we read this" note explaining low-confidence / unverified figures.
- **Short-Term Pathways Tool** — user-facing Restorative Care / End-of-Life pathways (reviewer checks shipped iter310).
- **Letter Preview PDF** — render the actual server PDF in the preview (current preview is an in-app WYSIWYG built from the draft; not the byte-identical PDF).
- **Prod/preview data separation** — cleanup script to remove test accounts (e.g. sam@test.com) from the PROD db except admins. Preview uses local Mongo; this is a platform/deploy action.

## Tech-debt / infra
- Backend runtime deadlock after LiteLLM-heavy ops — currently mitigated by manual `supervisorctl restart backend`. Investigate root cause (thread-pool / semaphore exhaustion around LiteLLM calls) for a permanent fix. Intermittent `/api/health` timeout suspected same cause.
- `cpr_review_jobs` collection has no TTL index yet.
- Web statement deeplink is `/app/statements/:id` (plural) vs mobile `/statement/:id` (singular) — branch when building cross-platform deeplinks.

## Demo/seed helpers (for QA + forks)
- `python3 /app/backend/scripts/seed_blocked_statement.py [email]` — seeds the publish-blocked demo statement (id `blocked-demo-<hh8>`, default cathy@example.com).
- `python3 /app/backend/scripts/seed_followups.py [email]` — seeds 3 overdue + 1 upcoming follow-up letters (bulk chase-up is destructive; re-run to reset).
