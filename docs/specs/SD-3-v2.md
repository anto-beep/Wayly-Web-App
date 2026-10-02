# SD-3 v2: Statement Decoder v3 (Phase C remainder)

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (hard dependency), SD-3 v1 (predecessor), FC-2 v1 (soft dependency), SDL-1 v1 (soft dependency), CHSP-1 (forward-linked)
**Predecessor:** SD-3 v1 (shipped or shipping in Phase B). All SD-3 v1 behaviour preserved.
**Successor:** SD-3 v3 will absorb remaining v1 deferred items (per-provider Care Management unit conversion, 3+ statement diff, provider-level cross-participant patterns, PDF export). Scheduled after PROGRAM-1 Phase D or on identified user demand.
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

SD-3 v1 delivered cross-statement diff, the Care Management explainer, the first-run overlay, per-anomaly hand-off to LF-1 v1.2, and the disputed service line affordance. PROGRAM-1 explicitly deferred two SD-3 features from Phase B into Phase C: the statement history trend view and CHSP mode.

The trend view is the tool most likely to change how users think about spending over time. SD-3 v1's decoded statement is a snapshot. Users who have decoded three or more statements should see spending patterns across those statements: is cleaning cost stable, is personal care rising, when did allied health drop off. The trend view is where SD-3 stops being a document decoder and starts being a longitudinal financial picture.

CHSP mode addresses an audience Wayly cannot help today. Users on the Commonwealth Home Support Programme, transitioning to Support at Home by 1 July 2027, cannot decode their statements in Wayly because SD-3 v1 is SAH-shaped. Program type detection recognises CHSP statements but treats them as `unknown` for decoding purposes. SD-3 v2 introduces CHSP-shaped decoding, terminology, service categories, and anomaly rules, extending Wayly's usefulness to the pre-transition CHSP audience.

Two smaller additions land alongside: auto-resolve for statement anomaly cases (when a new statement no longer shows the anomaly, the LOOP-1 case can close automatically, per SD-3 v1's Section G.2 forward-declaration) and bulk dispute mode (multi-select of service lines for a single dispute action, matching SDL-1's bulk confirmation pattern for consistency).

SD-3 v2 is a P0-carryover workstream in PROGRAM-1 Phase C. It ships after SD-3 v1, LOOP-1 v1, and SDL-1 v1 are stable, and coordinates with CHSP-1 timing for the CHSP audience.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model extensions
- **Section C:** Persistence surface
- **Section D:** Internal APIs
- **Section E:** Statement history trend view surface
- **Section F:** CHSP mode
- **Section G:** Auto-resolve for statement anomaly cases
- **Section H:** Bulk dispute mode
- **Section I:** Integration seams
- **Section J:** Persona-aware rendering
- **Section K:** Accessibility, dark mode
- **Section L:** Privacy considerations

Four risks Emergent must surface in delivery notes on first commit:

1. **SD-3 v1 and BC-1 preservation.** All SD-3 v1 anomaly rules, cross-statement diff logic, Care Management explainer, first-run overlay, and disputed service line behaviour preserved without regression. Every SD-3 v1 acceptance test remains valid.
2. **CHSP statement source fixtures.** CHSP statements have per-provider format variance. Phase 0 requires acquiring at least five real CHSP statement samples across at least three providers to validate decoding reliability. If sample coverage is inadequate, CHSP mode ships as a beta with explicit user framing.
3. **Trend view performance for high-history participants.** Participants with 12+ months of decoded statements may have several hundred service line items across statements. Trend computation performance is a Phase 0 concern; caching strategy defined at Phase 0.
4. **Auto-resolve reliability.** Auto-resolving a statement anomaly case must be conservative. Better to leave a case open (user manually resolves) than close it wrongly. Phase 0 tests the auto-resolve logic against fixture cases with known outcomes.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/SD-3-v2-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 SD-3 v1 shipping status

Confirm SD-3 v1 has shipped and stabilised for at least 30 days. If not, SD-3 v2 launch delays accordingly.

Report SD-3 v1's current v1 anomaly rule inventory, decoded statement shape, and any post-launch findings that affect SD-3 v2 assumptions.

### A.2 CHSP statement fixtures

Acquire at least five real CHSP statement samples across at least three providers. Redact PII per standard fixture process.

If real samples are unobtainable within the Phase 0 window, synthesise fixtures based on published CHSP Program Manual guidance and note the synthesis in delivery notes as a launch risk factor.

### A.3 CHSP-specific service categories

Report the CHSP service categories per the Program Manual:
- Domestic Assistance
- Social Support (individual and group)
- Transport
- Meals (delivered and centre-based)
- Nursing
- Allied Health and Therapy Services
- Home Modifications
- Home Maintenance
- Personal Care

Confirm INDEX-1 has (or gets) a CHSP service category reference table separate from SAH.

### A.4 CHSP fee structure

Report the CHSP fee structure (client contributions, unit prices, hourly rates). CHSP does not have SAH's quarterly budget concept; fees are typically per-service or per-visit.

### A.5 CHSP transition awareness

Report when the CHSP-to-SAH transition affects individual participants. Currently by 1 July 2027 per PROGRAM-1. Phase 0 confirms whether the transition has firm effective-date confirmation or whether it may shift.

### A.6 Trend view data requirements

Report CORE-1's decoded statement aggregation capability. Trend view reads across all decoded statements for a participant. Confirm CORE-1 profile aggregate exposes what's needed or an internal API on Statement Decoder does.

### A.7 Trend view performance baseline

Estimate trend computation cost for participants with 3, 6, 12, and 24 months of statements. Model:
- 12 statements
- Each with 40 service line items
- Compute stream totals, service code totals, month-over-month deltas

Report performance under current infrastructure. If p95 exceeds 500ms, caching strategy is a Phase 0 workstream, not a follow-up.

### A.8 LOOP-1 auto-resolve integration

Confirm LOOP-1's case type registry auto_resolve_on rules for `statement_anomaly` per LOOP-1 Section G.2. SD-3 v2 provides the signal LOOP-1 needs to fire auto-resolve.

### A.9 Australian data residency

Confirm ap-southeast-2 for any new SD-3 v2 collections and cache stores.

### A.10 CHSP-1 spec status

Report the CHSP-1 spec status. SD-3 v2 CHSP mode is independent (a CHSP recipient with SD-3 v2 can decode statements), but CHSP-1 will build the broader CHSP tool ecosystem. Coordinate on shared data model and terminology.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model extensions

### B.1 Decoded statement (SD-3 v2 additions)

SD-3 v2 adds CHSP-specific fields to the existing decoded statement record.

```
DecodedStatement (SD-3 v2 extensions) {
  ...v1 fields,

  // CHSP-specific structured data (populated when program_type is chsp)
  chsp_specific: {
    fee_structure: enum { unit_price, hourly, monthly_contribution, mixed }
    service_categories: [
      {
        category: string  // From CHSP category enum per A.3
        amount: MoneyWithSource
        units: decimal | null
        unit_type: string | null  // hours, sessions, meals, kilometres
        client_contribution: MoneyWithSource
        provider_billed: MoneyWithSource
      }
    ]
    contribution_period: enum { weekly, fortnightly, monthly, quarterly }
    is_transition_statement: boolean  // First statement after CHSP-to-SAH transition
    transition_effective_date: date | null
  } | null

  // Trend view computation attribution
  trend_view_last_computed_at: timestamp | null
  trend_view_included_in_current: boolean  // Set false if this statement is later invalidated or superseded
}
```

### B.2 Statement trend view (computed, cached)

The trend view is a computed aggregate, not a persistent authoritative record. Cached for performance.

```
StatementTrendView {
  participant_id: UUID
  program_type: enum { sah, chsp, mixed }
  computed_at: timestamp
  cache_valid_until: timestamp
  covered_periods: [
    {
      period_start: date
      period_end: date
      statement_id: UUID
    }
  ]

  // For SAH participants
  trends_by_stream: [
    {
      stream: enum { clinical_care, independence, everyday_living }
      period_amounts: [
        { period_index, amount: MoneyWithSource, statement_id }
      ]
      trend_summary: {
        average_monthly: MoneyWithSource
        highest_month: { period_index, amount }
        lowest_month: { period_index, amount }
        direction: enum { rising, stable, falling, volatile }
      }
    }
  ]

  // For SAH and CHSP participants
  trends_by_service: [
    {
      service_code: string | null
      service_name: string
      service_type: string  // From SD-3 v1 service type enum
      period_amounts: [
        { period_index, amount: MoneyWithSource, statement_id }
      ]
      trend_summary: {
        average_monthly: MoneyWithSource
        highest_month: { period_index, amount }
        lowest_month: { period_index, amount }
        direction: enum { rising, stable, falling, volatile }
      }
    }
  ]

  // For CHSP participants
  trends_by_category: [
    {
      category: string  // CHSP category
      period_amounts: [
        { period_index, amount: MoneyWithSource, statement_id }
      ]
      trend_summary: { ... }
    }
  ] | null

  overall_summary: {
    total_across_periods: MoneyWithSource
    average_per_month: MoneyWithSource
    most_frequent_provider: string | null
    period_count: integer
  }

  attribution: {
    based_on_most_recent_statement_period_end: date
    statement_count_used: integer
  }

  data_residency: string
}
```

### B.3 Bulk dispute batch

New collection for tracking bulk dispute operations.

```
BulkDisputeBatch {
  id: UUID
  participant_id: UUID
  statement_id: UUID
  initiated_by_user_id: UUID
  disputed_line_ids: string[]  // Service line IDs from the statement
  aggregate_dispute_reason: enum {
    multiple_billing_errors,
    provider_pattern_error,
    changeover_related,
    period_wide_dispute,
    other
  }
  aggregate_dispute_details: string  // Max 3000 chars
  case_id: UUID  // Single LOOP-1 case for the batch
  created_at: timestamp
  data_residency: string
}
```

### B.4 Case auto-resolve trigger event

Ephemeral event; not a persisted collection. When SD-3 v2 detects a new statement that no longer shows a previously-flagged anomaly, it fires an event to LOOP-1:

```
CaseAutoResolveEvent {
  case_id: UUID
  triggering_statement_id: UUID
  original_anomaly_finding_id: string
  reason: enum { anomaly_did_not_recur, statement_supersedes }
  confidence: enum { high, medium, low }
  fired_at: timestamp
}
```

LOOP-1 evaluates the event per its auto-resolve rules and either transitions the case to resolved or leaves it open depending on confidence and case type.

---

## Section C. Persistence surface

### C.1 New and extended collections

- `decoded_statements` extended with CHSP fields per B.1 (in place)
- `statement_trend_view_cache` new collection for cached trend view aggregates (indexed on `participant_id`, TTL 60 minutes but invalidated on any new statement decode)
- `bulk_dispute_batches` new collection per B.3, indexed on `participant_id, created_at DESC`

All in MongoDB Atlas ap-southeast-2.

### C.2 Trend view cache invalidation

Cache invalidated on:
- Any new decoded statement for the participant
- Any existing decoded statement modification (re-decode, dispute, correction)
- Participant classification change (may affect stream mapping)
- Manual force-refresh from user

### C.3 Trend view cache warmup

For participants with 3+ decoded statements, trend view is computed on first request post-invalidation. Background warmup on new statement decode is optional; only implement if Phase 0 performance justifies.

### C.4 Retention

- Trend view cache: transient; regenerated as needed
- Bulk dispute batches: retained for life of participant
- CHSP-decoded statements: same retention as SAH-decoded statements

---

## Section D. Internal APIs

### D.1 Trend view

```
GET /internal/participants/[id]/statement-trend?force_refresh=[bool]
Returns: StatementTrendView
```

If cached and cache is valid, returns cached. If invalid or `force_refresh=true`, recomputes.

Returns 404 if participant has fewer than 3 decoded statements ("not enough data for trends yet").

```
GET /internal/participants/[id]/statement-trend/by-service/[service_code]
Returns: detailed period-by-period view of one specific service
```

### D.2 CHSP-specific endpoints

CHSP decoding uses the same `POST /internal/statement-decoder/decode` endpoint as SAH decoding. Program type detection routes to the CHSP-specific parser.

```
GET /internal/participants/[id]/chsp-service-categories
Returns: [{ category, total, ... }]
```

Returns CHSP category totals for the current statement or period.

### D.3 Bulk dispute

```
POST /internal/statement-decoder/bulk-dispute
Body: {
  participant_id,
  statement_id,
  disputed_line_ids: string[],
  aggregate_dispute_reason,
  aggregate_dispute_details,
  actor_user_id
}
Returns: BulkDisputeBatch with case_id populated
```

Opens a single LOOP-1 case with case_type `statement_anomaly` and metadata containing the array of disputed line IDs and aggregate reason.

Idempotency on `(participant_id, statement_id, disputed_line_ids_hash)` to prevent duplicate cases from resubmission.

### D.4 Auto-resolve trigger

Internal only, called by SD-3 v2 post-decode:

```
POST /internal/loop/cases/auto-resolve-trigger
Body: CaseAutoResolveEvent per B.4
```

LOOP-1 evaluates and responds; SD-3 v2 does not need to act on the response.

### D.5 Authorisation

All endpoints scoped by household membership per CORE-1 pattern.

---

## Section E. Statement history trend view surface

### E.1 Route

`/app/participants/[id]/statement-trends`

Also embedded as a "Spending trends" card on the participant profile page (CORE-1) for participants with 3+ decoded statements.

### E.2 Overview layout

- Attribution stamp at top: "Based on statements through [most recent period_end]. [statement_count] statements included."
- Summary metrics: average per month, most recent month total, most frequent provider
- Program type badge (SAH, CHSP, or Mixed for transition-era participants)

### E.3 Stream view (SAH participants)

Three stream cards:
- Clinical Care
- Independence
- Everyday Living

Each shows a line chart of monthly amounts over the covered periods, plus a summary label: "Rising steadily," "Stable," "Falling," "Volatile."

Click into a stream opens the service-level detail for that stream.

### E.4 Service view

For each service type observed across the participant's statements:
- Service name and typical description
- Line chart of monthly amounts
- Trend direction indicator
- Comparison to first observed month

Click into a service opens the per-statement drill-down.

### E.5 Category view (CHSP participants)

Instead of streams, CHSP participants see category cards per the CHSP category taxonomy:
- Domestic Assistance
- Social Support
- Transport
- Meals
- Nursing
- Allied Health
- Home Maintenance
- Personal Care

Otherwise identical layout to stream view.

### E.6 Mixed view (transition-era participants)

For participants whose statement history spans CHSP and SAH:
- A vertical divider showing the transition point
- CHSP category totals for pre-transition periods
- SAH stream totals for post-transition periods
- Optional cross-mapping panel: "How CHSP categories map to SAH streams" (Section F.5)

### E.7 Drill-down: per-statement view

For any service, users can click into a period-by-period view showing which statement contributed which amount.

Each row links to the decoded statement in Statement Decoder.

### E.8 Trend direction rules

- **Rising:** three consecutive periods with amount increases exceeding 10% per period
- **Stable:** all periods within 10% of the mean
- **Falling:** three consecutive periods with amount decreases exceeding 10% per period
- **Volatile:** no clear direction; period-over-period changes exceed 30% without directional consistency

Rules deterministic. No AI classification.

### E.9 Freshness indicator

- "Last updated [timestamp]. Refresh?" button
- "Not up to date if you've decoded a statement in the last hour" (cache-invalidation window)

### E.10 Empty and insufficient-data states

- Fewer than 3 statements: "Trends need at least 3 months of decoded statements. You have [n]. Upload more to see spending patterns."
- 3+ statements but all in same month: "Trends need statements from at least 3 different months. Yours are all from [month]. Upload statements from earlier months to see patterns."

### E.11 Persona-aware

Every string on the trend view is persona-aware per PERSONA-1.

---

## Section F. CHSP mode

### F.1 Program type detection

SD-3 v1 already detects `program_type` including CHSP. SD-3 v2 fully implements the CHSP-decoded branch.

Detection heuristics for CHSP:
- Statement header contains "Commonwealth Home Support Programme," "CHSP," or "Home Support Programme"
- Service categories present that are CHSP-typical (Domestic Assistance, Meals delivered, Social Support Group)
- Client contribution structure (not SAH quarterly budget structure)
- Statement layout differs materially from SAH standard

If detection is uncertain, user is prompted to confirm: "This looks like a Commonwealth Home Support Programme statement. Is that right?"

### F.2 CHSP-decoded parser

Distinct from SAH parser. Extracts:
- Fee structure (unit price, hourly, monthly contribution, mixed)
- Service category totals per B.1
- Client contribution vs provider amounts
- Contribution period
- Provider details
- Any anomaly rules per Section F.4

### F.3 CHSP-specific UI

For a CHSP-decoded statement, the decoded statement view uses CHSP-appropriate labels:
- "Weekly contribution" instead of "Quarterly budget"
- "Service categories" instead of "SAH streams"
- No care management explainer (CHSP does not have SAH's 10% care management)
- No rollover cap or lifetime cap
- Fee structure summary card

The persona-aware Care Management explainer is suppressed for CHSP statements. If the user's next statement is SAH (post-transition), the explainer re-enables.

### F.4 CHSP anomaly rules

CHSP-specific rules:

1. **CHSP unit price variance:** if a provider charges more than the published CHSP unit rate for a service category, flag.

2. **Contribution discrepancy:** if client contribution amount does not align with the participant's assessed contribution level (typically 17.5% of the Basic Age Pension for standard fees), flag with explanation.

3. **Category miscategorisation:** if a line item's description does not match the assigned category (e.g. what looks like personal care coded as domestic assistance), flag for user review.

4. **Duplicate billing:** as SAH RULE_3 but adapted for CHSP service codes.

5. **Wrong-program billing:** if a service that is not CHSP-eligible appears on a CHSP statement.

CHSP-specific rules do not replace SAH rules; the parser chooses the ruleset based on `program_type`.

### F.5 CHSP-to-SAH transition support

For participants transitioning from CHSP to SAH:
- The first SAH statement is flagged `is_first_sah_statement: true` per SD-3 v1 boundary context
- The final CHSP statement is flagged `is_final_chsp_statement: true` (new field per Phase 0 need)
- SD-3 v1's cross-statement diff supports pairing these for changeover audit
- Trend view continues showing both periods with the transition marked

### F.6 CHSP category to SAH stream cross-mapping

Reference table for post-transition users understanding how their care translates:

- Domestic Assistance → Everyday Living
- Social Support → Everyday Living
- Transport → Everyday Living
- Meals → Everyday Living
- Nursing → Clinical Care
- Allied Health → Clinical Care
- Home Modifications → separate AT-HM stream in SAH
- Home Maintenance → Independence
- Personal Care → Independence

Mapping is illustrative, not authoritative. Actual SAH plan design determines category assignment.

Displayed in the trend view mixed mode (E.6) and as a standalone card on the participant profile for transition-era participants.

### F.7 CHSP terminology across Wayly

Where BC-1 or BC-2 renders "quarterly budget," CHSP participants see "your CHSP arrangements." Where CE-2 v1.1 renders "quarterly contribution," CHSP participants see "your CHSP contributions." These are cross-tool changes coordinated with the tool teams; SD-3 v2 does not modify BC or CE surfaces.

### F.8 CHSP transition awareness in Ask Wayly

Ask Wayly (or its AW-2 upgrade) is signalled when a participant has any CHSP statements. Ask Wayly then avoids SAH-only advice for that participant until their transition statement is decoded.

Coordination via CORE-1 timeline events (`chsp_statement_decoded`) and Ask Wayly's context APIs.

---

## Section G. Auto-resolve for statement anomaly cases

### G.1 Auto-resolve rule

Per SD-3 v1 Section G.2 forward declaration:

When a new statement is decoded, SD-3 v2 evaluates:
- All open `statement_anomaly` cases for the same participant and provider
- For each case, check whether the same anomaly type (e.g. same rule ID, same service code combination) appears in the new statement

Outcomes:
- **Same anomaly appears in new statement:** case remains open. LOOP-1 receives a `severity_elevated` signal because the anomaly is systemic.
- **Anomaly does NOT appear in new statement:** LOOP-1 receives an auto-resolve trigger with confidence.

### G.2 Confidence levels

**High confidence** (auto-resolve immediately if LOOP-1's registry permits):
- The anomaly type is a per-line item flag (transport duplicate, worker substitution) and no such flag appears
- The provider is the same
- The statement covers the period immediately following the original anomaly

**Medium confidence** (surface to user for review, do not silent-resolve):
- The provider is different
- The gap between the anomaly and the new statement is longer than one period
- The new statement is CHSP but the original was SAH (or vice versa)

**Low confidence** (do not auto-resolve; leave open):
- The anomaly type is systemic (cross-boundary charge, estimated billing)
- The new statement shows the same pattern with variance

### G.3 LOOP-1 event

Per B.4, SD-3 v2 fires `CaseAutoResolveEvent` to LOOP-1. LOOP-1 evaluates per its registry and either transitions the case to resolved with `resolution_reason: auto_resolved_by_sd_3` or writes a case note explaining why auto-resolve did not fire.

### G.4 User transparency

Cases auto-resolved by SD-3 v2 show a system-authored resolution note: "Wayly closed this case because the anomaly did not appear in your next statement. If you disagree, you can reopen it within 30 days."

### G.5 Cross-boundary and estimated billing cases

These case types are structurally systemic. Auto-resolve rules for them are conservative: SD-3 v2 does not auto-resolve `cross_boundary_charge` or estimated billing cases. Users manually resolve.

---

## Section H. Bulk dispute mode

### H.1 UX affordance

On the decoded statement view, multi-select checkboxes appear next to each service line. A "Dispute selected" button becomes active when 2 or more lines are selected.

### H.2 Bulk dispute flow

Clicking "Dispute selected" opens a modal:
- List of selected lines
- Aggregate dispute reason dropdown per B.3 enum
- Aggregate dispute details textarea (max 3000 chars)
- Confirmation: "This creates one case covering all selected lines. You can send one letter about all of them."
- Confirm button

### H.3 Case creation

Single LOOP-1 case with:
- `case_type: statement_anomaly`
- `metadata.disputed_line_ids: [array]`
- `metadata.bulk_dispute_batch_id: [id]`
- Summary tokens describe multiple lines: "You disputed 5 service lines on the July statement"

### H.4 Hand-off to letter

The case's hand-off CTA routes to LF-1 v1.2 (or LF-2) with a bulk-dispute template that lists all disputed lines. Users get one letter to send, not five separate letters.

### H.5 Idempotency

Per D.3, resubmission of the same batch (same participant, statement, and set of line IDs) returns the existing batch and case rather than creating duplicates.

### H.6 Individual dispute preserved

Users can still dispute individual lines per SD-3 v1's Section J flow. Bulk mode is additive for cases where multiple lines share the same underlying issue.

---

## Section I. Integration seams

### I.1 CORE-1

- Read: participant profile including `transition_status` for CHSP awareness
- Write: timeline events for `statement_trend_view_computed`, `chsp_statement_decoded`, `bulk_dispute_created`, `case_auto_resolved_by_decoder`
- Update: `latest_artefacts.statement_trend_view` on ProfileAggregate for participants with 3+ statements

### I.2 LOOP-1

- Write: cases via bulk dispute per Section H
- Write: auto-resolve trigger events per Section G
- Read: open cases for auto-resolve evaluation

### I.3 SD-3 v1

- Extend: all v1 behaviour preserved
- CHSP mode branches within the existing decoder infrastructure

### I.4 SDL-1 v1

- Bulk dispute cases include SDL-1 attendance records where matched
- CHSP-decoded statement dates match against SDL-1 attendance records the same as SAH statements

### I.5 FC-2 v1

- CHSP statements feed FC-2 calendar pattern detection using CHSP service categories
- Trend view surfaces available from participant profile

### I.6 LCA-1

- Subscribe: `tool_cache_invalidate` events; trend view cache invalidated on legislative changes affecting statement calculations
- CHSP-to-SAH transition legislative changes trigger user notifications and re-review prompts

### I.7 CHSP-1 (forward-declared)

- CHSP-1 spec (Phase F workstream) builds broader CHSP tooling. SD-3 v2 CHSP mode is the decoder foundation CHSP-1 depends on
- Coordinate on CHSP category taxonomy, terminology, and transition data model

### I.8 BC-2 and CE-2

- BC-2 v2 (Phase D) will use CHSP mode for its CHSP calculator. SD-3 v2's CHSP-decoded data is the input source
- CE-2 v1.1 CHSP contribution comparison uses SD-3 v2's `client_contribution` field

---

## Section J. Persona-aware rendering

### J.1 Trend view content persona-aware

Every user-facing string in the trend view is persona-aware per PERSONA-1.

Examples:

Caregiver variant:
- "[Participant first name]'s spending across three streams over the past 6 months"
- "Cleaning has been rising steadily since March"

Participant-self variant:
- "Your spending across three streams over the past 6 months"
- "Cleaning has been rising steadily since March"

### J.2 CHSP-specific terminology

Persona-aware and program-appropriate:

Caregiver variant for CHSP:
- "[Participant first name]'s CHSP services this month"
- "Your father's Social Support category"

Participant-self for CHSP:
- "Your CHSP services this month"
- "Your Social Support category"

Consistent with the tone of SAH content; only the program-specific labels change.

### J.3 Transition-era framing

For participants who have decoded both CHSP and SAH statements:
- Trend view acknowledges the transition
- Content tone reflects the change ("Your care changed from CHSP to SAH on [date]. Trends before and after are shown separately.")

### J.4 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

---

## Section K. Accessibility, dark mode, design tokens

### K.1 UXF-1 v3

All new surfaces use UXF-1 v3 tokens.

### K.2 Dark mode

All new surfaces render correctly in light, dark, and system modes.

### K.3 WCAG 2.1 AAA

Standard.

### K.4 Chart accessibility

Trend view line charts include:
- Alt text summarising the trend direction ("Cleaning services rose from $180 in March to $310 in August, a steady increase")
- Keyboard-accessible data point interaction
- High-contrast line colours meeting WCAG 2.1 AAA
- Optional data-table view alternative for users who prefer tabular data over charts

### K.5 CHSP-specific rendering

CHSP category cards use the same visual system as SAH stream cards. Program badge (SAH vs CHSP) is prominent and colour-differentiated with accessibility considerations.

---

## Section L. Privacy considerations

### L.1 No new data category

SD-3 v2 does not introduce a new data category. Trend view is a computed aggregate over existing decoded statement data. CHSP mode is a program-type-specific parser over the same decoded statement infrastructure. Auto-resolve and bulk dispute are workflow additions to existing case management.

### L.2 Privacy Policy amendment

No amendment required. Confirm with solicitor as courtesy but not treated as launch gate.

### L.3 PII redaction

CHSP statements undergo the same PII redaction as SAH statements per SD-3 v1.

---

## 2. Locked decisions

1. **Version scope.** SD-3 v2 covers trend view, CHSP mode, auto-resolve for statement anomaly cases, and bulk dispute. Per-provider Care Management unit conversion, 3+ statement diff, and PDF export deferred to SD-3 v3.
2. **Trend view minimum data.** 3 decoded statements from at least 3 different months required to render trend view.
3. **Trend direction rules.** Deterministic per Section E.8. No AI classification.
4. **Trend view cache.** 60-minute TTL, invalidated on new statement decode.
5. **Trend view program mode.** SAH shows streams; CHSP shows categories; mixed transition shows both with transition marker.
6. **CHSP detection.** Header heuristics + service category pattern matching. User confirmation prompt if uncertain.
7. **CHSP fixture requirement.** Minimum 5 real samples across 3 providers. Synthesised fallback if unobtainable.
8. **CHSP anomaly rules.** Five rules per Section F.4. Do not replace SAH rules; parser routes.
9. **CHSP terminology cross-tool.** SD-3 v2 provides decoded data; BC, CE, and Ask Wayly render CHSP terminology in their own surfaces.
10. **Auto-resolve confidence tiers.** High auto-resolves; Medium surfaces to user; Low leaves open. Rules per Section G.2.
11. **Auto-resolve conservatism.** Cross-boundary charge and estimated billing cases never auto-resolve.
12. **User transparency on auto-resolve.** System-authored resolution note visible to user, 30-day reopen window.
13. **Bulk dispute minimum.** 2 or more selected lines. Single LOOP-1 case per batch.
14. **Bulk dispute idempotency.** Same participant, statement, and line ID set does not duplicate.
15. **CHSP transition data.** Final CHSP statement and first SAH statement flagged for cross-statement diff support.
16. **CHSP category to SAH stream mapping.** Reference table displayed as illustrative, not authoritative.
17. **CHSP-1 coordination.** Shared taxonomy and terminology; SD-3 v2 does not depend on CHSP-1 shipping.
18. **Ask Wayly CHSP awareness.** CHSP participants signalled via CORE-1 timeline; Ask Wayly avoids SAH-only advice.
19. **Data residency.** ap-southeast-2 for all new writes.
20. **Feature flag.** `sd_3_v2_features` gates all SD-3 v2 additions.
21. **CORE-1 timeline events.** Trend view computation, CHSP statement decoding, auto-resolve events, and bulk disputes write timeline events.
22. **No Privacy Policy amendment required.** Existing coverage adequate.
23. **SD-3 v1 preservation.** All v1 behaviour unchanged.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit with CHSP fixture acquisition (Section A)
- **WS2.** DecodedStatement CHSP extensions (Section B.1)
- **WS3.** StatementTrendView data model and cache (Sections B.2, C.1)
- **WS4.** BulkDisputeBatch data model and persistence (Sections B.3, C.1)
- **WS5.** Trend view computation engine (Section E)
- **WS6.** Trend view surface UI (Section E)
- **WS7.** CHSP parser and decoding branch (Section F)
- **WS8.** CHSP-specific anomaly rules (Section F.4)
- **WS9.** CHSP-specific UI treatment (Section F.3)
- **WS10.** CHSP-to-SAH transition support and cross-mapping (Sections F.5, F.6)
- **WS11.** Auto-resolve evaluation engine (Section G)
- **WS12.** LOOP-1 auto-resolve event integration (Section G.3)
- **WS13.** Bulk dispute UX affordance and modal (Section H)
- **WS14.** Bulk dispute API and case creation (Sections D.3, H)
- **WS15.** CORE-1 integration and timeline events (Section I.1)
- **WS16.** LOOP-1 integrations for auto-resolve and bulk dispute (Section I.2)
- **WS17.** CHSP fixture-based test suite (from A.2)
- **WS18.** Chart accessibility for trend view (Section K.4)
- **WS19.** Persona-aware rendering integration (Section J)
- **WS20.** UXF-1 v3 tokens, dark mode, WCAG (Section K)
- **WS21.** PostHog event schema (see 3.1)
- **WS22.** Feature flag and rollback
- **WS23.** SD-3 v1 regression test suite integration
- **WS24.** Cross-tool CHSP coordination with BC, CE, Ask Wayly

### 3.1 PostHog event schema

- `statement_trend_view_computed` (statement_count, cache_hit_or_miss, computation_ms)
- `statement_trend_view_shown` (program_type, statement_count)
- `trend_stream_drilled_in` (stream)
- `trend_service_drilled_in` (service_type)
- `chsp_statement_decoded` (fee_structure, category_count, anomaly_count)
- `chsp_detection_uncertain_prompt_shown`
- `chsp_detection_user_confirmed`
- `chsp_transition_flagged` (statement_id)
- `chsp_to_sah_cross_mapping_shown`
- `case_auto_resolve_evaluated` (confidence, outcome: resolved | left_open | user_review)
- `case_auto_resolve_reopened_by_user`
- `bulk_dispute_started` (selected_line_count)
- `bulk_dispute_submitted` (line_count, aggregate_reason)
- `bulk_dispute_hand_off_clicked` (target_template)

---

## 4. Rollback plan

### 4.1 Feature flag

`sd_3_v2_features` gates all SD-3 v2 additions. When off:
- Trend view surface returns 404
- CHSP statements decoded via SD-3 v1's `unknown` program type path
- Auto-resolve events not fired
- Bulk dispute UI hidden; individual dispute per SD-3 v1 preserved

SD-3 v1 continues to operate.

### 4.2 Rollback triggers

- Trend view computation causing timeouts
- CHSP parser regressing SAH decoding
- Auto-resolve incorrectly closing cases
- Bulk dispute creating duplicate cases
- Cross-participant data leak in trend view

### 4.3 Data retention during rollback

All new collections retained. Flag re-enable restores surfaces.

### 4.4 SD-3 v1 independence

SD-3 v1 operates without SD-3 v2. Turning v2 off does not regress v1.

---

## 5. Acceptance tests

Fifty-two tests across ten categories.

### 5.1 SD-3 v1 preservation

1. **T1.** All SD-3 v1 anomaly rules pass regression tests.
2. **T2.** SD-3 v1 cross-statement diff behaviour preserved.
3. **T3.** SD-3 v1 Care Management explainer preserved for SAH statements.
4. **T4.** SD-3 v1 first-run overlay preserved.
5. **T5.** SD-3 v1 individual dispute affordance preserved.

### 5.2 Trend view

6. **T6.** Trend view API returns 404 for participants with fewer than 3 statements.
7. **T7.** Trend view computes correctly for 3 statements across 3 months.
8. **T8.** Trend view computes correctly for 12 statements across 12 months.
9. **T9.** Cache invalidated on new statement decode.
10. **T10.** Force refresh regenerates cached view.
11. **T11.** Trend direction rules correctly classify rising, stable, falling, volatile.
12. **T12.** Stream view renders for SAH participants.
13. **T13.** Category view renders for CHSP participants.
14. **T14.** Mixed view renders for transition-era participants.
15. **T15.** Drill-down from service to per-statement view works.
16. **T16.** Trend view computation p95 under 500ms with caching enabled.

### 5.3 CHSP mode

17. **T17.** CHSP detection identifies real CHSP statement fixtures with 90%+ accuracy.
18. **T18.** CHSP parser extracts fee structure, service categories, contribution period.
19. **T19.** CHSP-specific UI renders CHSP labels ("weekly contribution," not "quarterly budget").
20. **T20.** Care Management explainer suppressed for CHSP-decoded statements.
21. **T21.** CHSP unit price variance rule fires on known fixture.
22. **T22.** CHSP contribution discrepancy rule fires on known fixture.
23. **T23.** CHSP category miscategorisation rule fires on known fixture.
24. **T24.** Final CHSP statement and first SAH statement flagged for changeover diff.
25. **T25.** CHSP-to-SAH cross-mapping displayed on mixed-mode trend view.
26. **T26.** Ask Wayly signalled about CHSP participant via CORE-1 timeline.

### 5.4 Auto-resolve

27. **T27.** High-confidence auto-resolve fires when anomaly does not recur in same-provider next-period statement.
28. **T28.** Medium-confidence auto-resolve does not fire; surfaces to user.
29. **T29.** Low-confidence cases never auto-resolve.
30. **T30.** Cross-boundary charge cases never auto-resolve.
31. **T31.** Estimated billing cases never auto-resolve.
32. **T32.** Auto-resolve writes system-authored resolution note.
33. **T33.** User can reopen auto-resolved case within 30 days.
34. **T34.** Same-anomaly recurrence elevates case severity, not resolves.

### 5.5 Bulk dispute

35. **T35.** Multi-select checkboxes appear on decoded statement view.
36. **T36.** "Dispute selected" activates at 2+ lines.
37. **T37.** Bulk dispute creates single LOOP-1 case with correct metadata.
38. **T38.** Idempotency: resubmission of same batch returns existing case.
39. **T39.** Individual dispute preserved alongside bulk mode.
40. **T40.** Hand-off template lists all disputed lines.

### 5.6 Integrations

41. **T41.** CORE-1 timeline events written for all instrumented v2 actions.
42. **T42.** LOOP-1 auto-resolve trigger event received correctly.
43. **T43.** LOOP-1 bulk dispute case created with correct case_type and metadata.
44. **T44.** LCA-1 cache-invalidation event received.
45. **T45.** SDL-1 integration for CHSP-decoded statements matches SAH pattern.

### 5.7 Persona and editorial

46. **T46.** Trend view content passes PERSONA-1 audit.
47. **T47.** CHSP terminology renders correctly for both personas.
48. **T48.** Transition-era framing acknowledges the CHSP-to-SAH transition.
49. **T49.** All strings pass editorial QA.

### 5.8 Accessibility

50. **T50.** Trend view charts include alt text summarising direction.
51. **T51.** Charts pass WCAG 2.1 AAA contrast and keyboard navigation.
52. **T52.** Data-table alternative view available.

---

## 6. Delivery notes

### 6.1 SD-3 v1 regression status

Delivery notes confirm all SD-3 v1 tests pass.

### 6.2 CHSP fixture coverage

Delivery notes state fixture count and provider count. If below 5 samples across 3 providers, launch as beta with user framing.

### 6.3 CHSP detection accuracy

Delivery notes report CHSP detection accuracy on the fixture set.

### 6.4 Trend view performance

Delivery notes state measured p95 for trend computation across 3, 6, 12, 24 statement histories.

### 6.5 Auto-resolve conservatism

Delivery notes report auto-resolve firing rate and reopen rate on fixture cases. High reopen rate indicates over-aggressive resolution; tune conservatively.

### 6.6 Bulk dispute coverage

Delivery notes confirm bulk dispute template exists in LF-1 v1.2 (or LF-2) and lists all lines correctly.

### 6.7 Cross-tool CHSP coordination

Delivery notes confirm BC, CE, and Ask Wayly teams received CHSP data model coordination and their own tools plan CHSP terminology updates.

---

## 7. Explicit v3 candidates

Items deferred from SD-3 v2 for SD-3 v3 or later.

1. **Per-provider Care Management unit conversion.** Learn from participant's history whether a specific provider bills care management differently. Adjust units-to-hours per provider.
2. **N-way statement diff.** Beyond pairs, diff across 3+ statements.
3. **Provider-level cross-participant pattern detection.** Multiple participants sharing a provider seeing the same anomaly. Privacy-sensitive.
4. **Estimated billing auto-detection tuning per provider.** Learn per provider whether flat-rate patterns are legitimate.
5. **PDF export of trend view.** For records or provider correspondence.
6. **Predictive spending model.** Where spending is trending, project forward. Deferred; overlaps with BC-2's scenario mode.
7. **CHSP fee structure comparison.** Comparing provider CHSP unit prices against published rates. Deferred to a CHSP-specific price checker.
8. **AI-suggested aggregate dispute reason.** LLM suggests which reason fits multiple selected lines. Deferred; adds ADM disclosure concern.
9. **Category-to-provider heat map for CHSP.** Which providers dominate which categories. Deferred.
10. **Long-form spending narrative.** Natural-language summary of a participant's spending pattern. Deferred.

---

## 8. Change log

- **v2** (this document): Phase C remainder for SD-3. Statement history trend view with SAH stream and CHSP category modes and mixed transition view, deterministic trend direction rules, cache-invalidated computation. CHSP mode with parser, five CHSP-specific anomaly rules, CHSP-specific UI, transition support, cross-mapping to SAH streams. Auto-resolve for statement anomaly cases with three confidence tiers, conservative posture on systemic anomalies. Bulk dispute mode with single-case-per-batch model. Fifty-two acceptance tests. Coordinates with BC, CE, Ask Wayly for cross-tool CHSP terminology.

---

**End of SD-3 v2 handoff prompt.**
