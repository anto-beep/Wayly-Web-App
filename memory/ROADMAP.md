# Wayly — Prioritised Backlog / Roadmap

_Started Jun 2026. Historical implementation log lives in PRD.md (dated sections)._

## Recently shipped
- **Iter 321 (Jun 2026)** — Auth dark-mode fix (lighter warm cards + clay accents, readable Google label); invoice per-issue draft-letter parity; Fee Transparency + Confidence Legend on the statement decoder (web+mobile); app-wide sleek/less-round/no-hover button restyle; prod test-account cleanup script; confirmed Gateway Guardrail + /api/health already mitigated (off-loop LLM executor, 75s timeout, dependency-free liveness). Verified iteration_321.
- **Iter 320 (Jun 2026)** — Blocked Statement Demo; Required/Optional badge sweep (mobile); Bulk Follow-up (web+mobile); Letter Preview (in-app WYSIWYG); landing dark-mode + button polish; Statement Decoder CTA pricing fix.

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
