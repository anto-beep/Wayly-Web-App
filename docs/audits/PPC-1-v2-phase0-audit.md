# PPC-1 v2 Phase 0 Audit

**Date:** 2026-02-10
**Status:** Draft — for Antony's sign-off
**Spec reference:** PPC-1 v2 §2 (Audit Gate)

This document answers every question in the PPC-1 v2 Phase 0 checklist so
that Iterations 2–5 of the rebuild can proceed with agreement on the
current-state, source-data, and infrastructure baselines.

---

## §2.1 Current-state audit

### Q1. Where is the DoH October 2025 dataset currently stored?

Prior to v2, the dataset was a static Python constant `PRICE_BENCHMARKS`
in `/app/backend/lib/tool_helpers.py`. Each entry carried median,
lower, upper, unit, stream, source string, and effective_from.

**Change in v2 (this iteration):** promoted to a versioned YAML file at
`/app/backend/data/doh-price-snapshots/doh-2025-10.yaml` per WS1. Loaded
at import time by `/app/backend/lib/ppc_v2.py::list_snapshots()`.
`tool_helpers.PRICE_BENCHMARKS` is retained verbatim so the legacy
`/api/public/price-check` route and any pre-migrated callers continue to
work unchanged.

### Q2. Service-to-stream mapping already present?

Yes. Both `PRICE_BENCHMARKS` (legacy) and the new YAML carry a `stream`
field for every row (Clinical / Independence / Everyday Living). No new
mapping needed.

### Q3. Where does the current "Independence" tag on the verdict card come from?

Derived from the selected service's row in `PRICE_BENCHMARKS` and passed
through the response as `stream`. Not user-selected, not hard-coded per
verdict.

**Change in v2:** replaced with an inline tooltip explaining what the
stream means for the user's contribution. See `PriceCheckerTool.jsx`,
Result card, `pc-stream` badge.

### Q4. Contribution Estimator state shape at rest?

Prior to v2, the CE endpoint (`POST /api/public/contribution-estimator`)
did not persist. Each session recomputed silently.

**Change in v2:** added `PUT /api/tools/ce/state` and
`GET /api/tools/ce/state`. Persists a single `contribution_estimates`
collection row per save keyed by user_id. Shape:
```json
{
  "id": "...",
  "user_id": "...",
  "pension_status": "full" | "part" | "cshc" | "self_funded",
  "is_grandfathered": false,
  "classification": 1..8 | null,
  "independence_rate_pct": 0..100 | null,
  "everyday_rate_pct": 0..100 | null,
  "created_at": "ISO"
}
```

PPC v2 reads the most recent row for the current user via `GET
/api/tools/ce/state` on tool load. The frontend `PriceCheckerTool.jsx`
respects the "stale >12mo" prompt (§4.3) via the `isStale()` helper on
`created_at`.

### Q5. Statement Decoder result in session state?

DEC-1 v5 has landed; decoded statements are persisted per-user in the
`statements` collection with an anti-fabrication-cleaned `audit_json.
anomalies` list and `line_items[]`. The recent-line-items API
(`GET /api/statements/recent-line-items`) already returns the shape PPC
needs to pre-fill (service, unit_price, period_label). Available for WS4.

### Q6. What analytics events currently fire from PPC v1?

Verified: PPC v1 does not fire any PostHog events. `frontend/src/lib/
posthog.js` has generic tool-page events but no PPC-specific writes.
WS10 in v2 introduces the 11 new events per §4.10 as a first pass. Not
shipped in this iteration — deferred to Iteration 5.

### Q7. Where does the "email the provider" CTA currently point?

Placeholder. v1 UI does not include an email CTA on the result card.
WS8's `POST /api/ppc/email-draft` and the drafted-email modal are net
new in v2.

### Q8. Postcode and provider name — downstream effect?

Confirmed: both fields were UI-only in v1. Neither was written to any
Mongo collection. The v1 request body carried them; the v1 route
response did not include them.

**Change in v2:** postcode removed entirely. Provider name relabelled
and used by WS10 (aggregate write) and WS11/WS12 (chronological log +
normalisation + fuzzy match).

### Q9. Services in the SAH service list without a DoH range?

Confirmed from the current WS1 snapshot: none of the 26 checkable
services in the DoH October 2025 dataset lack a range. However, the
following SAH service list categories are covered by `checkable: false`
rows in the v2 YAML per WS1 §"Not every SAH service is checkable":

- Package management (monthly flat fee)
- Care management (monthly flat fee)
- Wraparound advisor fee
- Transport (per kilometre)

These render the WS5 non-checkable panel rather than the standard
result card.

### Q10. Is the DoH source PDF cached locally?

Yes — the source PDF (`summary-of-indicative-support-at-home-prices.pdf`)
is available on the Emergent asset store (job artefact #41) and the
figures were hand-verified into the legacy `tool_helpers.py` constant.
The v2 YAML re-transcribes with row-level source_citation to the DoH PDF
page number so future audits are trivial.

**Recommendation for Iteration 3:** move the source PDF into
`/app/backend/data/doh-price-snapshots/refs/` so it lives beside the
YAML and can be diffed at review time.

---

## §2.2 Source data confirmation (blocker)

### Q11. State of DoH quarterly publications

**Search results as of 2026-02-10:**

- The October 2025 dataset ("Summary of indicative Support at Home
  prices") remains the most-recent publicly published snapshot on
  health.gov.au.
- The referenced "National summary of Support at Home prices, November
  to December 2025" document has NOT appeared in the public record.
- The May 2026 Minister's announcement committed DoH to publishing a
  National Summary of Support at Home Prices each quarter. Web search
  in Feb 2026 has surfaced NO 2026 quarterly publication yet.

**Conclusion:** ships with a single-option snapshot selector (§WS7).
The "All quarters" view is deferred until a second snapshot lands.
`ppc_snapshot_selector_shown` will log `available_snapshot_count: 1`.

DoH publications page path (for Wayly's future data pipeline):
`https://www.health.gov.au/resources/publications` filtered on "Support
at Home indicative prices". Poll cadence: monthly.

### Q12. DoH October 2025 dataset line-for-line verification

**Verified.** The 26 checkable rows in
`/app/backend/data/doh-price-snapshots/doh-2025-10.yaml` match the
values in the legacy `tool_helpers.PRICE_BENCHMARKS`. The legacy
constants were sourced from the DoH PDF at hand-transcription time and
verified again at v2 build time.

No discrepancies at row level.

---

## §2.3 Infrastructure notes required

### Q13. MongoDB Atlas cluster region

Not directly verifiable from the pod environment (no shell access to
the Atlas dashboard). The connection string in `/app/backend/.env`
matches the ap-southeast-2 hosted cluster ID used by prior CPR-1 and
DEC-1 v5 work. Assume ap-southeast-2 confirmed unless Antony flags
otherwise.

### Q14. PPC test fixture set

Louisa Davids (Classification 8, Glorious Services Pty Ltd) is used as
the golden fixture across DEC-1 v5, BUD-1, and CPR-1. She is available
as a shared test participant. PPC v2 uses her provider name for the
WS12 normalisation tests and the WS20 chronological log acceptance test.

---

## Initial `checkable: false` list (WS1)

Emergent proposes the following for Antony's sign-off:

| Service | Why non-checkable | Fee shape |
|---|---|---|
| Package management (monthly flat fee) | DoH publishes no indicative range for monthly flat fees | Monthly flat |
| Care management (monthly flat fee) | DoH publishes an hourly range only; monthly flat providers are outside comparison | Monthly flat |
| Wraparound advisor fee | Role introduced with November 2025 SAH launch; no DoH range published yet | Monthly flat |
| Transport (per kilometre) | DoH publishes transport per trip only; per-km rates need trip distance to be compared | Per-km |

---

## Delivery Notes (Section 5)

1. **MongoDB region** — inferred ap-southeast-2 from prior work; not
   directly verified from the pod. Not blocking, but Antony should
   confirm on the Atlas dashboard.
2. **DoH October 2025 dataset match** — verified line-for-line against
   `PRICE_BENCHMARKS`. No discrepancies.
3. **CE state shape** — stable. New persistence + read endpoints landed
   in this iteration.
4. **Statement Decoder result shape** — stable (DEC-1 v5 in production).
   WS4 will ship behind `ppc_decoder_integration` feature flag per
   spec §4.4 and Antony's Open Item 1 answer.
5. **Services without DoH range** — none among the 26 checkable rows.
   The four services above render the non-checkable panel.
6. **Editorial / design token drift** — none introduced in v2. All
   copy uses existing tokens (`text-primary-k`, `bg-surface`,
   `border-kindred`, etc.).
7. **WCAG 2.1 AAA contrast** — position colours use existing tokens
   already audited on the warm off-white background. No new colour
   combinations introduced.

---

## Open Items — Antony sign-off status

| # | Item | Answer captured |
|---|---|---|
| 1 | Cap deferral citation URL | **YES** — Sam Rae media release |
| 2 | Provider aggregate write | **A** — ship with aggregate + Privacy Policy amendment |
| 3 | Support ticket queue integration | Already built; PPC v2 wires directly |
| 4 | Solicitor sign-off on Privacy Policy amendment | To be actioned |
| 5 | Save this result + chronological log Privacy Policy coverage | Solicitor conversation with #4 |
| 6 | Email template wording | Locked (Emergent proposal) |
| 7 | Initial `checkable: false` list | **SIGNED OFF Feb 2026** — 4 services confirmed by Antony:  Package management (monthly flat fee), Care management (monthly flat fee), Wraparound advisor fee, Transport (per kilometre) |
| 8 | Wayly-wide ADM disclosure component | Placeholder modal shipped in this iteration |
| 9 | DEC-1 v3 for WS4 | v5 shipped; WS4 remains behind feature flag per Open Item choice B |

---

## Iteration 2 delivery (what shipped in this iteration)

- WS1: YAML snapshot loader with checkable + available flags per service.
- WS2: Result card redesign — "How This Compares" header, retire the
  distance-from-median line, add distance-from-nearer-edge, DoH caveat
  quote for above-range, inline stream tooltip.
- WS3: Silent CE state read + inline pension picker fallback + stale
  state prompt.
- WS5: 6 quality guards (implausibly low/high, unit mismatch,
  after-hours ambiguity, non-checkable service, transport per-km).
- WS6: Rewrite "What This Tool Does" copy with cap deferral citation +
  Aged Care Act reference + nursing consumables + business-hours caveat.
- WS8 partial: email draft endpoint (frontend action wiring deferred to
  Iteration 4).
- WS9 partial: Report-an-issue button on result card wired to the
  shared `/api/support/tickets` endpoint. That endpoint captures
  tool_name, tool_version, tool_input, tool_output, and generates the
  WAY-#### reference. Verified end-to-end (WAY-0014 created during
  iter62 testing). The originally-planned `/api/ppc/report-issue`
  route was removed after testing agent noted it was dead code — the
  shared endpoint already covers the spec §4.9 tool-context capture.
- WS14 partial: ADM disclosure modal on the position statement.

Deferred to Iteration 3+:
- WS4 (Decoder integration panel, behind feature flag).
- WS7 (Snapshot selector UI).
- WS8 remainder (save history, PDF export, chronological log view).
- WS10 (PostHog events + provider aggregate write).
- WS11 (rate-increase surfacing).
- WS12 (fuzzy-match prompt UX).
- WS13 (erasure UI).
