# Indexation Review Runbook (v0.1 · stub for Deploy 1a)

**Owner:** Antony · **Last updated:** 2026-07-08 (E1, INDEX-1 Deploy 1a) · **Next full pass:** Deploy 2.

This document is a **stub** shipped with Deploy 1a. Deploy 2 fleshes it out with the CI drift detection procedure and the "how to action an alert" walk-through.

---

## 1. Scope of this runbook

Wayly hard-codes 210 monetary and policy constants (dollar amounts, percentages, rate caps, thresholds) sourced from Australian primary legislation, delegated instruments, DoH operational schedules, and My Aged Care operational content. Every one of them can drift when the government issues a scheduled indexation (twice yearly at 20 March + 20 September) or an ad-hoc amendment.

This runbook governs the manual review process the human owner (Antony) performs every six months so no stale value ships to caregivers.

## 2. Review cadence

Anchor dates: **20 March** and **20 September** each year.

Before each anchor, block a 30-minute review window in the calendar and:

1. Open `/app/backend/data/monetary_constants.yaml`.
2. Filter to entries where `next_review_due <= today + 14 days`.
3. For each entry:
   - Open the `source_url`, verify the current published value matches the registry.
   - If unchanged, bump `last_verified_at` to today, `next_review_due` to the next indexation date.
   - If changed, add a new entry with `effective_from = date_of_publication`, move the previous row into the `history` block with `effective_to = date_of_publication - 1`, and update `last_verified_at`.
4. Commit as a single PR titled `chore(index): 20 March 2026 indexation review`.

## 3. Ad-hoc changes

When a legislative amendment lands outside the twice-yearly cycle (e.g. the 1 October 2026 personal care funding change):

1. Add the anticipated effective date to `/app/backend/data/scheduled_changes.yaml`.
2. Set `lookahead_alert_days: 30` (Deploy 2 CI check will surface the alert).
3. Publish the new registry rows in a PR at least a fortnight before commencement.

## 4. Alert channel

Per Antony's Deploy 1 authorisation, alerts flow to:

- **GitHub issue** in the `wayly` repository (auto-created by the Deploy 2 CI check, tagged `indexation`).
- **Email** to Antony's registered address (address to be confirmed at Phase 0 close).

Slack alerts are not configured for this cadence.

## 5. Verification backlog

Entries with `source_url: PENDING` are tracked in the `verification_backlog` section of the registry (not yet added — Deploy 2). For Deploy 1a, PENDING entries are silently accepted by the loader; the validation test excludes them from the "no PENDING sources" assertion.

## 6. Deploy 2 additions (planned)

- CI job `.github/workflows/check-monetary-drift.yml` runs weekly on Sydney tz + is manually dispatchable.
- CI opens a GitHub issue when a `next_review_due` slips past today, or when the scheduled_changes lookahead window fires.
- Verification backlog file lists pending source URL resolutions.
- Full runbook walk-through with screenshots of the DoH page → registry PR flow.

## 7. Ownership

- **Primary reviewer:** Antony
- **Delegation:** none yet. Revisit after the September 2026 cycle.
- **Escalation:** if the reviewer is unavailable for more than 5 business days past a `next_review_due`, the on-call product owner takes over.
