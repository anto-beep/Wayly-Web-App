# Wayly — Prioritised Backlog / Roadmap

_Started Jun 2026. Historical implementation log lives in PRD.md (dated sections)._

## Recently shipped
- **Mobile parity (Jun 2026)** — Statement Decoder publish gate; Letters & Follow-ups redesigned front door + mailbox; consolidated letter detail screen; Required/Optional badges on account forms. Verified iteration_319.

## P1 — next up
- **Letter output/detail polish parity** — the consolidated `/letters/[id]` draft output already has clean letter-paper UI + Copy/PDF/Email-me; audit against web `CorrespondenceDetail.jsx` for any remaining copy/format-switcher gaps.
- **Required/Optional badge sweep** — extend the badge convention to the remaining ~30 mobile forms (care-plan settings, complaints, contacts, pacing, budget, etc.) for full app-wide consistency.

## P2 — backlog
- **LLM auto-retry / timeout for letter generation** if the gateway hangs (ties into the recurring backend-deadlock blocker).
- **Bulk follow-up** — select several overdue letters in the mailbox and send chase-ups in one action.
- **Letter Preview PDF** — show the polished PDF exactly as the provider will receive it before sending.
- **Seed a `publishable=false` statement** in the demo account so the Statement Decoder blocked-state UI can be QA'd end-to-end on mobile (currently code-verified only).

## Tech-debt / infra
- Backend runtime deadlock after LiteLLM-heavy ops — currently mitigated by manual `supervisorctl restart backend`. Investigate root cause (thread-pool / semaphore exhaustion around LiteLLM calls) for a permanent fix.
- `cpr_review_jobs` collection has no TTL index yet.
