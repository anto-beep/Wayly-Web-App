# CE-3 v1: Contribution Estimator v3

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), SD-3 v1 (decoded statement contribution data source), LOOP-1 v1 (case creation for variance), INDEX-1 (lifetime cap constant source), IC-2 (forward-declared for invoice correlation), LCA-1 v1 (event subscriber), BC-2 v1 (coordination on projection model), LF-1 v1.2 / LF-2 v1 (hand-off target)
**Predecessor:** Contribution Estimator v2 v1.1 (CE-2 v1.1, shipped)
**Successor:** CE-3 v2 will absorb further refinements including deemed income what-if, family situation transitions (widowhood, partner entering care), and integration with Centrelink data feeds if available. Deferred.
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

CE-2 v1.1 answers a point-in-time question: given a participant's classification, pension status, and Home Care Package grandfathering status, what will they contribute per week and per quarter? It uses INDEX-1 constants, applies means-testing rules, shows the government share alongside the participant share, and produces a PDF or email artefact. It handles HCP comparison for grandfathered users. It surfaces a hardship callout.

CE-2 does not answer the questions that matter more over time. What will this person contribute this year? How much of the lifetime cap have they already used? Is what the provider is billing them consistent with what CE-2 said they would owe? If their pension status changes, what happens to their prior estimate PDFs? If their contribution capacity drops suddenly, does the tool notice?

CE-3 v1 addresses each. Annual projection appears alongside weekly and quarterly with a range and confidence band. The lifetime cap accumulator shows total cap, used to date, remaining, and years at current pace. For most users, "years at current pace" is measured in decades. That single number does more to reassure participants and families than any other calculation Wayly can render. Reconciliation compares estimated contributions against actual contributions billed on decoded statements, month by month, and surfaces variances at four severity levels. Pension-status change becomes a full recalculation flow with prior PDF supersession. Hardship pathway detection triggers on step-change variances or capacity signals, prompting a walkthrough of the application process.

CE-3 v1 is a P1 workstream in PROGRAM-1 Phase D. It ships after CE-2 v1.1 has stabilised, CORE-1 and LOOP-1 have shipped, and SD-3 v1 is providing decoded statement contribution data reliably.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model extensions
- **Section C:** Persistence surface
- **Section D:** Internal APIs
- **Section E:** Main dashboard extensions
- **Section F:** Annual projection view
- **Section G:** Lifetime cap accumulator surface
- **Section H:** Reconciliation view
- **Section I:** Pension-status change what-if flow
- **Section J:** Hardship pathway trigger and walkthrough
- **Section K:** Integration seams
- **Section L:** Persona-aware rendering
- **Section M:** Accessibility, dark mode, design tokens
- **Section N:** Privacy considerations

Three risks Emergent must surface in delivery notes on first commit:

1. **CE-2 v1.1 preservation.** All CE-2 v1.1 behaviour preserved without regression. Every CE-2 v1.1 acceptance test remains valid. HCP comparison, weekly-first framing, government-share visualisation, PDF and email artefact, hardship callout all continue to function.
2. **Lifetime cap calculation source reliability.** The used-to-date figure sources from decoded statement contribution amounts. If SD-3 v1 does not reliably extract per-statement contributions, the accumulator degrades to projected-from-estimator mode with explicit user framing. Phase 0 tests SD-3 v1's contribution extraction on the fixture set.
3. **Variance thresholds are lockable, not arbitrary.** Section H reconciliation variance thresholds (minor, notable, significant, step change) are set for locked decision but may need tuning based on Phase 0 fixture data. Emergent should test on real-world fixture variance patterns and surface tuning findings before launch.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/CE-3-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 CE-2 v1.1 shipping status

Confirm CE-2 v1.1 has shipped and stabilised for at least 30 days. Report post-launch findings that affect CE-3 assumptions.

### A.2 SD-3 v1 contribution extraction

Report SD-3 v1's ability to extract per-statement contribution amounts and their reliability on the fixture set. If reliability is below 95%, note this as a launch risk factor. Options:
- Delay CE-3 v1 reconciliation view until SD-3 v1 extraction is strengthened
- Ship reconciliation view with explicit "based on available data" framing

### A.3 INDEX-1 lifetime cap constant

Confirm INDEX-1 exposes:
- Total lifetime cap amount ($137,917.01 as at 20 March 2026 per PROGRAM-1)
- Effective date
- `legislativeVerificationStatus` (must be `verified`, not `PENDING`)

If not, Phase 0 workstream includes INDEX-1 update.

### A.4 CORE-1 timeline events

Confirm CORE-1 timeline event registry includes `contribution_estimated` (already in CORE-1 registry per CORE-1 Section F.2). CE-3 v1 extends with `annual_projection_computed`, `lifetime_cap_updated`, `reconciliation_run`, `pension_status_change_recorded`, `hardship_pathway_triggered`.

### A.5 LOOP-1 case type

Confirm LOOP-1's registry includes a case type compatible with variance-triggered cases. Recommend using `statement_anomaly` case type with metadata indicating the anomaly is contribution-variance (rather than adding a new case type).

Alternatively, if `statement_anomaly` metadata schema is too tight, propose adding `contribution_variance` as a case type to LOOP-1's registry.

### A.6 LCA-1 event subscription

Confirm LCA-1 v1 fires `tool_cache_invalidate` events per LCA-1 Section I.4. CE-3 v1 subscribes for legislative changes affecting means-testing, lifetime cap, or classification band amounts.

### A.7 Existing CE-2 v1.1 PDF artefact

Report the current CE-2 v1.1 PDF template structure. CE-3 v1 extends with annual projection, lifetime cap, and reconciliation sections. PDF versioning per CE-3 v1 changes.

### A.8 Australian data residency

Confirm ap-southeast-2 for all new CE-3 collections.

### A.9 Reconciliation performance

Estimate reconciliation performance for participants with 12 months of decoded statements (12 statements × 1 to 3 contribution lines per statement = 36 line items). Report expected computation time. If p95 exceeds 500ms without caching, define caching approach.

### A.10 Hardship pathway walkthrough content

Confirm content availability for the hardship pathway walkthrough. Sources:
- My Aged Care hardship supplement guidance
- Aged Care Rules 2025 provisions
- Program Manual on financial hardship

If content is incomplete, Phase 0 workstream includes content authoring.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model extensions

### B.1 Contribution projection (extended from CE-2)

CE-3 v1 extends CE-2's projection output with annual data and range.

```
ContributionProjection (extended from CE-2 v1.1) {
  ...existing CE-2 fields (weekly, quarterly, government share, HCP comparison),

  // Annual projection (CE-3 v1 addition)
  annual_estimate: MoneyWithSource
  annual_estimate_range: {
    low: MoneyWithSource
    high: MoneyWithSource
    confidence: enum { high, medium, low }
    range_explanation_tokens: {
      caregiver: string
      participant_self: string
    }
  }

  // Financial year context
  financial_year_start: date
  financial_year_end: date

  // Lifetime cap reference (populated for user context, computed separately)
  lifetime_cap_summary_at_projection_time: {
    remaining: MoneyWithSource
    years_at_current_pace: decimal | null
  } | null

  // Pension status change linkage
  is_recalculation: boolean
  supersedes_projection_id: UUID | null
  supersedes_reason: enum { pension_status_change, legislative_change, user_correction } | null

  created_at: timestamp
  based_on_profile_at: timestamp
  data_residency: string (must be "ap-southeast-2")
}
```

### B.2 Lifetime cap accumulator

New collection tracking cap accumulation per participant.

```
LifetimeCapAccumulator {
  id: UUID
  participant_id: UUID (foreign key to Participant per CORE-1)
  household_id: UUID (denormalised)

  // Cap constant (from INDEX-1)
  total_cap: MoneyWithSource  // Includes effective_date from INDEX-1
  total_cap_effective_date: date

  // Used to date
  used_to_date: MoneyWithSource
  used_to_date_source: enum {
    actual_from_statements,
    projected_from_estimator,
    hybrid_actual_and_projected
  }
  based_on_statement_ids: UUID[]  // Which statements contributed to actual
  based_on_projection_ids: UUID[]  // Which estimator projections filled gaps

  // Program history
  program_entry_date: date
  days_since_program_entry: integer

  // Calculation
  remaining: MoneyWithSource  // total_cap - used_to_date
  annual_pace: MoneyWithSource | null
  years_at_current_pace: decimal | null  // Null if less than 30 days since entry
  cap_projected_reach_date: date | null

  // Framing
  is_cap_approaching: boolean  // True when remaining < 20% of total, or years_at_current_pace < 5
  years_at_current_pace_bucket: enum { gt_50, 20_to_50, 10_to_20, 5_to_10, lt_5 } | null

  calculated_at: timestamp
  cache_valid_until: timestamp
  data_residency: string
}
```

### B.3 Contribution reconciliation

New collection per participant per month.

```
ContributionReconciliation {
  id: UUID
  participant_id: UUID
  household_id: UUID

  // Period
  reconciliation_period_month: string  // "2026-08" ISO format
  month_start: date
  month_end: date

  // Estimated (from CE-2/CE-3 projection valid for this period)
  estimated_contribution: MoneyWithSource
  estimated_from_projection_id: UUID

  // Actual (from decoded statements covering this month)
  actual_contribution: MoneyWithSource
  based_on_statement_ids: UUID[]

  // Variance
  variance_amount: MoneyWithSource  // actual - estimated (positive means user paid more)
  variance_percentage: decimal
  variance_flag: enum {
    none_reconciled,
    minor_variance,
    notable_variance,
    significant_variance,
    step_change_variance
  }

  // Case
  case_id: UUID | null  // LOOP-1 case if step_change_variance
  case_created_at: timestamp | null

  // Explanation
  automated_explanation_tokens: {
    caregiver: string
    participant_self: string
  } | null
  user_notes: string | null

  computed_at: timestamp
  data_residency: string
}
```

### B.4 Pension status change flow

Tracks a formal pension-status change event triggered by user action.

```
PensionStatusChange {
  id: UUID
  participant_id: UUID
  initiated_by_user_id: UUID

  // Change details
  previous_pension_status: enum
  new_pension_status: enum
  effective_date: date
  reason_context: enum {
    partner_deceased,
    partner_entered_care,
    income_changed,
    assets_reassessed,
    corrected_error,
    other
  } | null
  reason_notes: string | null

  // Recalculation linkage
  pre_change_projection_id: UUID  // Snapshot of prior projection
  post_change_projection_id: UUID  // New projection with updated status
  pre_change_lifetime_cap_snapshot: LifetimeCapAccumulator  // Embedded snapshot

  // Prior PDF handling
  prior_pdfs_marked_superseded: UUID[]  // IDs of prior CE-2 or CE-3 PDF artefacts

  // Timeline
  effective_from_next_projection: boolean  // Whether effective for future or backdated to effective_date
  requires_backdated_reconciliation: boolean

  created_at: timestamp
  data_residency: string
}
```

### B.5 Hardship pathway trigger

Detection event for hardship pathway offering.

```
HardshipPathwayTrigger {
  id: UUID
  participant_id: UUID

  // Trigger reason
  trigger_reason: enum {
    step_change_variance_from_reconciliation,
    income_step_down_from_pension_change,
    contribution_capacity_change_from_user_indication,
    persistent_variance_pattern,
    other
  }
  involved_reconciliation_ids: UUID[]
  involved_pension_change_id: UUID | null

  // Context
  variance_summary: string | null
  detected_at: timestamp

  // Surfacing
  surfaced_to_user_at: timestamp | null
  surfaced_to_user_id: UUID | null

  // User response
  user_response: enum {
    started_walkthrough,
    completed_walkthrough,
    dismissed,
    took_lf_hand_off,
    no_response
  } | null
  user_responded_at: timestamp | null

  data_residency: string
}
```

### B.6 Annual projection range calculation

Confidence banding for annual projection:

- **High confidence:** 3+ decoded statements in the current financial year AND stable pension status AND no legislative change pending. Range typically +/-5%.
- **Medium confidence:** 1-2 decoded statements OR recent pension status change OR pending legislative change within 90 days. Range +/-15%.
- **Low confidence:** 0 decoded statements OR unknown pension status. Range +/-30%, essentially projected from CE-2 quarterly × 4.

---

## Section C. Persistence surface

### C.1 New and extended collections

- `contribution_projections` extended per B.1 (existing CE-2 collection)
- `lifetime_cap_accumulators` new collection per B.2, indexed on `participant_id, calculated_at DESC`
- `contribution_reconciliations` new collection per B.3, indexed on `participant_id, reconciliation_period_month DESC`
- `pension_status_changes` new collection per B.4, indexed on `participant_id, effective_date DESC`
- `hardship_pathway_triggers` new collection per B.5, indexed on `participant_id, detected_at DESC`

All in MongoDB Atlas ap-southeast-2.

### C.2 Lifetime cap cache

The accumulator has a 24-hour cache validity by default, invalidated on:
- New decoded statement for the participant
- Pension status change
- Legislative change affecting cap (via LCA-1 event)
- Explicit user refresh

### C.3 Reconciliation retention

Reconciliations retained for the life of the participant. Historical data valuable for pattern detection and hardship trigger evaluation.

### C.4 PDF artefact retention

CE-2 v1.1 PDFs preserved. CE-3 v1 PDFs versioned. Superseded PDFs (per pension status change) marked but retained.

### C.5 Data source lineage

Every lifetime cap accumulator record stores the specific statement IDs and projection IDs that contributed to `used_to_date`. This provides auditable lineage for the reassuring "you have used $X" number.

---

## Section D. Internal APIs

### D.1 Contribution projection

```
GET /internal/participants/[id]/contribution-projection?include_annual=[bool]
Returns: ContributionProjection (CE-3 v1 shape)
```

Returns current projection. If none exists or profile has changed since last projection, regenerates.

```
POST /internal/participants/[id]/contribution-projection/regenerate
Body: { reason, actor_user_id }
Returns: fresh ContributionProjection
```

### D.2 Lifetime cap accumulator

```
GET /internal/participants/[id]/lifetime-cap
Returns: LifetimeCapAccumulator
```

If cache is invalid, recomputes synchronously.

```
POST /internal/participants/[id]/lifetime-cap/refresh
Returns: fresh LifetimeCapAccumulator with source lineage
```

### D.3 Reconciliation

```
GET /internal/participants/[id]/reconciliations?months_back=[n]
Returns: ContributionReconciliation[] sorted by period desc
```

Default `months_back=12`.

```
POST /internal/participants/[id]/reconciliations/reconcile
Body: { period_month: "2026-08" }
Returns: ContributionReconciliation for the specified month
```

Idempotent per participant/period.

```
POST /internal/reconciliations/[id]/add-user-note
Body: { user_notes, actor_user_id }
Returns: updated ContributionReconciliation
```

### D.4 Pension status change

```
POST /internal/participants/[id]/pension-status-changes
Body: {
  new_pension_status,
  effective_date,
  reason_context,
  reason_notes,
  effective_from_next_projection (bool),
  actor_user_id
}
Returns: PensionStatusChange with pre and post projections
```

Records the change, snapshots the prior projection, generates a new projection with updated pension status, marks prior PDFs as superseded, triggers hardship pathway evaluation if reason indicates step-down.

```
GET /internal/participants/[id]/pension-status-changes
Returns: PensionStatusChange[] sorted by effective_date DESC
```

### D.5 Hardship pathway

```
GET /internal/participants/[id]/hardship-pathway-triggers?surfaced_only=[bool]
Returns: HardshipPathwayTrigger[]
```

```
POST /internal/hardship-pathway-triggers/[id]/mark-surfaced
Body: { surfaced_to_user_id }
```

```
POST /internal/hardship-pathway-triggers/[id]/user-response
Body: { response, responded_by_user_id }
```

### D.6 Extended PDF artefact

```
POST /internal/participants/[id]/contribution-projection/pdf
Body: { include_annual: bool, include_lifetime_cap: bool, include_reconciliation: bool, actor_user_id }
Returns: { pdf_url (signed, 15-minute expiry), artefact_id }
```

Preserves CE-2 v1.1 PDF endpoint but with new optional sections.

### D.7 Authorisation

All endpoints scoped by household membership per CORE-1 pattern.

---

## Section E. Main dashboard extensions

### E.1 Route

Existing `/app/tools/contribution-estimator` route extended.

Also accessible from participant profile page (CORE-1) via a "Contribution position" card.

### E.2 Layout preservation

CE-2 v1.1's dashboard preserved. New cards added below existing content:
- Existing: weekly, quarterly, government share, HCP comparison
- Added: annual projection card, lifetime cap card, reconciliation summary card (conditional)

### E.3 Annual projection card

Shows:
- Financial year context (e.g. "For 2026-27")
- Annual estimate (headline)
- Range (low to high with confidence label)
- Explanation of range: "This range is based on [confidence signals]"
- CTA: "See the details" (routes to Section F full annual view)

### E.4 Lifetime cap card

The flagship. Prominent placement, above reconciliation.

Shows:
- Total lifetime cap ($137,917.01 with effective date)
- Used to date (with progress bar; typically small)
- Remaining (headline number)
- Years at current pace ("At your current pace, you would reach the cap in approximately [X] years.")
- Source attribution ("Based on [count] statements and [count] estimates.")
- CTA: "See how this was calculated" (routes to Section G detail view)

Card colour and tone:
- If years_at_current_pace > 10: neutral/reassuring tone, green or neutral accent
- If years_at_current_pace 5-10: informational, no urgency
- If years_at_current_pace < 5: informational with slightly elevated attention, amber accent
- If is_cap_approaching: prominent card with action prompts

### E.5 Reconciliation summary card (conditional)

Only appears when at least one reconciliation has run.

Shows:
- Latest reconciled month
- Overall variance signal (none, minor, notable, significant, step change)
- Number of months reconciled with variance
- CTA: "See month-by-month" (routes to Section H)

### E.6 Existing CE-2 v1.1 hand-offs preserved

The hardship callout on CE-2 v1.1 continues to render.

Additional hand-off CTAs on new cards:
- Lifetime cap card: "Talk to a financial counsellor" (informational link)
- Reconciliation card with step_change: "Dispute this variance" (LF-1 v1.2 or LF-2 hand-off)

---

## Section F. Annual projection view

### F.1 Route

`/app/tools/contribution-estimator/annual`

### F.2 Structure

- Financial year context
- Annual estimate with range
- Weekly breakdown (52 weekly amounts)
- Quarterly breakdown (4 quarterly amounts, cross-referenced with CE-2 output)
- Comparison to prior year (if data available)
- Government share breakdown for the year
- Confidence explanation

### F.3 Confidence explanation

Persona-aware content explaining why the range is what it is:

Caregiver variant (high confidence example):
> "This annual estimate is based on 3 of [Participant Name]'s decoded statements this year, showing stable spending patterns. We're confident within about 5%. Actual amounts may vary slightly depending on how many services are used in the remaining quarters."

Participant-self variant:
> "This annual estimate is based on 3 of your decoded statements this year, showing stable spending patterns..."

### F.4 Prior year comparison

If prior year projections and actuals are available:
- Chart showing prior year monthly amounts
- Total for prior year
- Percentage change comparison
- Framing: "This helps you see if your care needs and costs have been steady, rising, or falling."

### F.5 Export

PDF export includes annual view when requested.

---

## Section G. Lifetime cap accumulator surface

### G.1 Route

`/app/tools/contribution-estimator/lifetime-cap`

### G.2 Layout

- Headline: "You've paid $[used] toward your $[cap] lifetime cap." (persona-aware)
- Progress bar (visually small for most users)
- Remaining amount (large, reassuring)
- Years at current pace (the key figure)

### G.3 Explanation panel

Persona-aware explanation:

Caregiver variant:
> "The lifetime cap is the most Australia asks anyone to contribute toward their aged care over a lifetime. Once someone reaches it, they don't have to pay anything more. For most people, this figure is a very long way off."

Participant-self variant:
> "The lifetime cap is the most Australia asks you to contribute toward your aged care over a lifetime. Once you reach it, you don't have to pay anything more. For most people, this figure is a very long way off."

### G.4 Source lineage panel

Expandable "Where does this figure come from?":
- List of statements contributing to `used_to_date`
- Any projected periods (gaps in statement data)
- Link back to each statement

### G.5 Cap approaching UI

For participants with `is_cap_approaching: true`:
- Card tone shifts from reassuring to informational
- Message: "You're approaching your lifetime cap. Reaching the cap means you won't have to contribute further to your care."
- Framing is positive (reaching the cap is a good thing)
- CTA: "See what this means for you" opens explanatory content
- Hand-off: "Talk to a financial counsellor" or LF-1 v1.2 template for provider inquiry about cap treatment

### G.6 Years at current pace calculation

```
if days_since_program_entry < 30:
  years_at_current_pace = null
  render "We need more data to project this"
else:
  annual_pace = (used_to_date / days_since_program_entry) * 365
  years_at_current_pace = remaining / annual_pace
```

Displayed as approximate figure with appropriate rounding (e.g. "approximately 32 years" not "31.8477 years").

### G.7 Refresh button

User can force refresh. Otherwise cache updates automatically on new statements.

---

## Section H. Reconciliation view

### H.1 Route

`/app/tools/contribution-estimator/reconciliation`

### H.2 Layout

Table or timeline view showing month-by-month:
- Month
- Estimated contribution
- Actual contribution
- Variance amount and percentage
- Variance flag
- Actions

Users can filter to show only variance months or specific severity levels.

### H.3 Variance flag thresholds

Locked per Section 2:
- **none_reconciled:** month has no decoded statement data available
- **minor_variance:** actual is within 5% of estimated
- **notable_variance:** actual is 5-15% different from estimated
- **significant_variance:** actual is 15-30% different from estimated
- **step_change_variance:** actual is more than 30% different from estimated

### H.4 Automated explanation

For notable and above variances, CE-3 v1 generates a plain-language explanation:

Persona-aware, deterministic (not AI-generated) explanation based on signals:
- If reconciliation happened close to a legislative change: "This month included the [change name] effective date, which changed the calculation partway through."
- If participant is grandfathered HCP with new SAH statement: "This month may reflect a transition between arrangements."
- If pension status changed: "Your pension status changed on [date], which affects contribution calculation."
- If no clear signal: "This variance may have several causes. Consider discussing with your provider or reviewing your latest statement."

### H.5 Step change case creation

When variance_flag is `step_change_variance`, CE-3 v1 automatically opens a LOOP-1 case:
- case_type: `statement_anomaly` (with metadata indicating contribution_variance)
- source_finding_id: reconciliation.id
- summary: "Contribution for [month] was [X]% different from estimated. This may indicate a billing error or a change in circumstance."
- Hand-off CTA: LF-1 v1.2 billing dispute template pre-populated with the variance details

### H.6 User action per variance

Per-row actions:
- "This looks correct" (marks reconciliation as user-confirmed)
- "Dispute this variance" (opens LF-1 v1.2 hand-off)
- "Explain what happened" (opens context modal for user notes)
- "Not sure right now" (leaves flagged)

### H.7 Reconciliation history export

PDF export of reconciliation history for the last 12 months, suitable for accountant or financial counsellor discussion.

### H.8 Empty state

If no reconciliations have been run yet:
- Persona-aware framing: "Reconciliation compares what you were estimated to pay against what you were actually charged. Once you've decoded a statement, we'll start reconciling."

---

## Section I. Pension-status change what-if flow

### I.1 Route

`/app/tools/contribution-estimator/pension-change`

Multi-step wizard.

### I.2 Step 1: Change context

- Current pension status displayed
- New pension status dropdown
- Effective date picker (defaults to today)
- Reason context dropdown (optional)
- Reason notes (optional)

Persona-aware framing acknowledges sensitive contexts (partner deceased especially).

### I.3 Step 2: Impact preview

- Prior weekly, quarterly, annual amounts (from current projection)
- New weekly, quarterly, annual amounts (with new pension status)
- Delta per period
- Government share change
- Effect on lifetime cap projection

### I.4 Step 3: Confirmation and prior PDF handling

- Explicit confirmation of the change
- List of prior PDF artefacts that will be marked superseded
- Options:
  - Mark superseded (default) - PDFs remain accessible but flagged
  - Delete prior PDFs (requires explicit confirmation)
  - Keep prior PDFs unmarked (not recommended; warning shown)

### I.5 Step 4: Post-change

- New projection generated and saved
- Prior projection snapshotted
- Prior PDFs marked
- Hardship pathway evaluation triggered if reason suggests step-down (pension moved from full to part, partner deceased with reduced household income, etc.)
- Confirmation summary
- CTA to view new projection

### I.6 Sensitive-context handling

For reason context `partner_deceased`:
- Tone is factual, not clinical, not overly warm
- Support resources offered at appropriate step (Lifeline 13 11 14, Bereavement Care Programme)
- User can pause and return; no time-pressure UX

### I.7 Backdated changes

If the change's effective date is in the past:
- Reconciliation for prior months may need recalculation
- Historical projections snapshotted but not modified
- Framing: "This change is backdated to [date]. Prior contributions may have been calculated at an older rate; you may want to check with your provider."

---

## Section J. Hardship pathway trigger and walkthrough

### J.1 Trigger evaluation

Runs on:
- New reconciliation with `step_change_variance` flag
- Pension status change with income-step-down reason
- Persistent variance pattern detected (3+ notable variances in 6 months)
- User indication (via a "my situation has changed" affordance)

Creates a `HardshipPathwayTrigger` record if conditions match.

### J.2 Trigger surfacing

Notification to the participant (or primary caregiver):
- "We noticed a change in your contribution pattern. If your circumstances have changed and paying your contribution has become difficult, you may qualify for a financial hardship supplement."

Notification includes CTA to open the walkthrough.

### J.3 Walkthrough content

Not an application on the user's behalf. Informational walkthrough of:
- What financial hardship provisions exist under the Aged Care Act 2024
- Eligibility overview
- What information they need to gather
- Where to apply (My Aged Care, provider, Services Australia)
- What outcomes to expect
- Estimated timeline

Content sourced from primary instruments and Program Manual per Phase 0 A.10.

### J.4 Walkthrough surface

Route: `/app/tools/contribution-estimator/hardship-walkthrough`

Multi-page walkthrough with:
- Introduction
- Eligibility self-check (informational, not authoritative)
- Documents to gather checklist
- How to apply
- What to expect
- Resource links

### J.5 Hand-off to LF templates

At walkthrough completion, hand-off options:
- Draft a letter to provider requesting hardship consideration (LF-1 v1.2 template)
- Draft a letter to My Aged Care requesting hardship supplement (LF-1 v1.2 template)

### J.6 User response tracking

Per B.5, user's response to the trigger (started, completed, dismissed, took hand-off) is persisted for future refinement.

### J.7 No automatic application submission

Wayly does not submit hardship applications on behalf of users. The walkthrough educates; users apply through the appropriate channels themselves.

---

## Section K. Integration seams

### K.1 CORE-1

- Read: participant profile (classification, pension_status, transition_status, program_entry_date, provider)
- Write: timeline events for contribution_projection updates, lifetime_cap calculations, reconciliation runs, pension_status_change, hardship_pathway_triggered
- Update: `latest_artefacts.contribution_projection` on profile aggregate

### K.2 SD-3 v1

- Read: decoded statement contribution amounts for lifetime cap actual data and reconciliation
- Read: statement periods for reconciliation period matching

### K.3 LOOP-1

- Write: cases for step_change variances (case_type: statement_anomaly with contribution_variance metadata)
- Read: no direct read dependency

### K.4 INDEX-1

- Read: lifetime cap constant with effective date
- Read: means-testing rules and constants
- Read: classification amounts
- Subscribe: legislative-change updates trigger recalculation

### K.5 LCA-1

- Subscribe: `tool_cache_invalidate` events for contribution-affecting legislative changes
- Invalidate lifetime cap cache and recompute affected projections

### K.6 BC-2 v1

- Coordinate: BC-2's living projection references CE-3's contribution position for its own dashboard
- Shared data model where possible (both use MoneyWithSource pattern)

### K.7 IC-2 (forward-declared)

- Future: when IC-2 ships, reconciliation extends to invoice-level detail
- API stub exposed for IC-2 to consume when it ships

### K.8 LF-1 v1.2 and LF-2 v1

- Hand-off: dispute variance CTA opens LF-1 v1.2 or LF-2 v1 with prefill
- Hardship letter templates hand-off to LF-1 v1.2

### K.9 FC-2 v1 handover pack

- Contribution position and lifetime cap remaining appear in FC-2 handover pack budget section

---

## Section L. Persona-aware rendering

### L.1 All content persona-aware

Every user-facing string in CE-3 v1 additions is authored in caregiver and participant-self versions per PERSONA-1.

### L.2 Placeholder resolution

`[Participant name]`, `[X years]`, `[$Y remaining]`, `[Financial year]` resolved at render time.

### L.3 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

### L.4 Sensitive-context tone: partner deceased

For pension status change with `partner_deceased` reason, tone is factual and quiet. Editorial QA confirms.

### L.5 Reassuring tone: lifetime cap remaining

For most users, lifetime cap remaining and years-at-pace is a reassuring number. Framing is quiet and factual, not gushing.

### L.6 Elevated attention tone: cap approaching

For rare users approaching the cap, tone is informational not alarming. Reaching the cap is a positive outcome (no more contributions).

### L.7 Elevated attention tone: step change variance

For users with step change variance, tone is neutral. "Something changed. It may be an error, it may be a legitimate change. Here's what you can do."

---

## Section M. Accessibility, dark mode, design tokens

### M.1 UXF-1 v3

All new components use UXF-1 v3 tokens.

### M.2 Dark mode

All new surfaces render in light, dark, and system modes.

### M.3 WCAG 2.1 AAA

Standard.

### M.4 Numeric display

Every monetary value renders in IBM Plex Mono per Wayly convention. Years-at-pace figure uses same convention with appropriate rounding.

### M.5 Progress bars

Lifetime cap progress bar uses UXF-1 v3 consequence-ladder tokens. Reconciliation variance flags use same tokens.

### M.6 Screen reader

Lifetime cap card has an aria-label combining the reassuring headline ("$X remaining of your $Y lifetime cap. At your current pace, this would last approximately Z years.") so screen reader users hear the key number without moving through multiple elements.

### M.7 Chart accessibility

Reconciliation timeline includes an accessible data-table alternative. Variance chart alt text summarises the pattern.

---

## Section N. Privacy considerations

### N.1 No new data category

CE-3 v1 does not introduce a new data category. All new persistence is derived from existing decoded statement data (SD-3 v1), profile data (CORE-1), and INDEX-1 constants.

### N.2 Privacy Policy amendment

No amendment required. Confirm with solicitor as courtesy but not treated as launch gate.

### N.3 Pension status change sensitivity

Reason context includes sensitive personal information (partner deceased). Standard data protection applies. No additional disclosure required beyond existing Privacy Policy coverage of profile data.

### N.4 Hardship pathway walkthrough content

Content is informational only. Not personalised financial advice. Confirm framing is appropriate with solicitor as courtesy.

---

## 2. Locked decisions

1. **CE-2 v1.1 preservation.** All existing behaviour preserved without regression.
2. **Annual projection.** Standard alongside weekly and quarterly per Section E.3.
3. **Annual range confidence tiers.** High (+/-5%), medium (+/-15%), low (+/-30%) per B.6.
4. **Lifetime cap accumulator.** Prominent card on main dashboard. Reassuring tone.
5. **Years at current pace calculation.** Rendered as approximate (e.g. "approximately 32 years"). Null if less than 30 days since program entry.
6. **Cap approaching threshold.** Remaining less than 20% of total OR years at pace less than 5.
7. **Cap approaching tone.** Informational, not alarming. Reaching cap is positive.
8. **Reconciliation variance thresholds.** Locked per Section H.3: 5%, 15%, 30% cutoffs.
9. **Step change case creation.** Automatic LOOP-1 case for step change variance. Case type: statement_anomaly with contribution_variance metadata.
10. **Reconciliation explanation.** Deterministic (not AI-generated) plain-language explanation per Section H.4.
11. **Pension status change flow.** Multi-step wizard. Prior PDFs marked superseded by default.
12. **Prior PDF handling.** Marked superseded (default); delete option available with explicit confirmation.
13. **Sensitive context handling.** Partner-deceased pension change uses factual tone.
14. **Hardship pathway triggers.** Four trigger reasons per B.5. Walkthrough only, not application submission.
15. **Hardship pathway walkthrough.** Informational content sourced from primary instruments per Phase 0 A.10.
16. **No automatic application submission.** Wayly educates; users apply through appropriate channels.
17. **INDEX-1 as sole source of lifetime cap.** No hardcoded constant.
18. **Lifetime cap cache.** 24-hour default, invalidated on relevant events.
19. **Reconciliation retention.** Life of participant.
20. **Data residency.** ap-southeast-2 for all new writes.
21. **Feature flag.** `ce_3_v1_features` gates all CE-3 v1 additions.
22. **CORE-1 timeline events.** All meaningful CE-3 v1 actions write timeline events.
23. **No Privacy Policy amendment required.** Existing coverage adequate.
24. **Persona rendering.** Every string authored in both variants per PERSONA-1.
25. **Editorial standard.** All content passes editorial QA.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit (Section A)
- **WS2.** ContributionProjection schema extension (Section B.1)
- **WS3.** LifetimeCapAccumulator data model and persistence (Sections B.2, C.1)
- **WS4.** Lifetime cap calculation engine (Section G.6)
- **WS5.** ContributionReconciliation data model and persistence (Sections B.3, C.1)
- **WS6.** Reconciliation engine (Section H)
- **WS7.** Reconciliation variance thresholds and case triggering (Sections H.3, H.5)
- **WS8.** PensionStatusChange data model and persistence (Sections B.4, C.1)
- **WS9.** Pension status change wizard UI (Section I)
- **WS10.** HardshipPathwayTrigger data model and persistence (Sections B.5, C.1)
- **WS11.** Hardship pathway trigger evaluation (Section J.1)
- **WS12.** Hardship pathway walkthrough content (per Phase 0 A.10)
- **WS13.** Hardship pathway walkthrough UI (Section J)
- **WS14.** Main dashboard extensions (Section E)
- **WS15.** Annual projection view (Section F)
- **WS16.** Lifetime cap surface (Section G)
- **WS17.** Reconciliation view (Section H)
- **WS18.** Extended PDF artefact (Section D.6)
- **WS19.** CORE-1 integration and timeline events (Section K.1)
- **WS20.** SD-3 v1 decoded statement contribution consumption (Section K.2)
- **WS21.** LOOP-1 case creation on step_change (Section K.3)
- **WS22.** INDEX-1 constant subscription and cache invalidation (Section K.4)
- **WS23.** LCA-1 event subscription (Section K.5)
- **WS24.** BC-2 coordination on shared data model (Section K.6)
- **WS25.** LF-1 v1.2 / LF-2 v1 hand-off integration (Section K.8)
- **WS26.** FC-2 handover pack integration (Section K.9)
- **WS27.** Persona-aware rendering (Section L)
- **WS28.** UXF-1 v3, dark mode, WCAG (Section M)
- **WS29.** PostHog event schema (see 3.1)
- **WS30.** Feature flag and rollback
- **WS31.** CE-2 v1.1 regression test suite integration

### 3.1 PostHog event schema

- `contribution_annual_projection_computed` (confidence)
- `lifetime_cap_calculated` (years_at_pace_bucket, source_type)
- `lifetime_cap_approaching_ui_shown` (years_at_pace)
- `reconciliation_run` (period_month, variance_flag)
- `reconciliation_case_opened` (variance_flag, percentage)
- `reconciliation_user_action` (action: confirmed_correct | disputed | explained | deferred)
- `pension_status_change_initiated` (reason_context)
- `pension_status_change_completed` (previous, new, effective_date_backdated_bool)
- `pension_change_pdf_action` (action: marked_superseded | deleted | kept)
- `hardship_trigger_created` (trigger_reason)
- `hardship_trigger_surfaced` (trigger_reason)
- `hardship_trigger_user_response` (response, trigger_reason)
- `hardship_walkthrough_started`
- `hardship_walkthrough_completed`
- `extended_pdf_generated` (sections_included)

---

## 4. Rollback plan

### 4.1 Feature flag

`ce_3_v1_features` gates all CE-3 v1 additions. When off:
- Annual projection card hidden
- Lifetime cap card hidden
- Reconciliation card hidden
- Pension change wizard returns 404
- Hardship pathway walkthrough returns 404
- CE-2 v1.1 dashboard operates unchanged

### 4.2 Rollback triggers

- Lifetime cap calculation producing incorrect used_to_date
- Reconciliation false positives above acceptable threshold
- Step change case creation producing duplicate or incorrect cases
- Cross-participant data leak

### 4.3 Data retention during rollback

All new collections retained. Flag re-enable restores surfaces.

### 4.4 CE-2 v1.1 independence

CE-2 v1.1 operates without CE-3 v1. Turning CE-3 v1 off does not regress CE-2 v1.1.

---

## 5. Acceptance tests

Fifty-four tests across eleven categories.

### 5.1 CE-2 v1.1 preservation

1. **T1.** All CE-2 v1.1 weekly and quarterly calculations unchanged.
2. **T2.** HCP comparison for grandfathered users preserved.
3. **T3.** Government share visualisation preserved.
4. **T4.** Existing hardship callout preserved.
5. **T5.** PDF and email artefact preserved (with new optional sections).

### 5.2 Annual projection

6. **T6.** Annual estimate computed as sum of quarterly with pension status applied.
7. **T7.** High confidence range set when 3+ statements this financial year.
8. **T8.** Medium confidence range for 1-2 statements or pending change.
9. **T9.** Low confidence range for no statements.
10. **T10.** Range explanation renders correctly per confidence.

### 5.3 Lifetime cap

11. **T11.** Lifetime cap accumulator reads total_cap from INDEX-1.
12. **T12.** Used_to_date sums correctly from statement contributions.
13. **T13.** Remaining calculated as total minus used.
14. **T14.** Years at current pace correct for 90-day history.
15. **T15.** Years at current pace null for less than 30 days since entry.
16. **T16.** Cap approaching UI renders correctly at less than 5 years.
17. **T17.** Source lineage panel lists correct statement IDs.
18. **T18.** Cache invalidated on new statement decode.

### 5.4 Reconciliation

19. **T19.** Reconciliation for a month with 3 decoded statements sums correctly.
20. **T20.** Variance percentage calculated correctly.
21. **T21.** Minor variance (< 5%) flagged as minor.
22. **T22.** Notable variance (5-15%) flagged notable.
23. **T23.** Significant variance (15-30%) flagged significant.
24. **T24.** Step change variance (> 30%) flagged step_change.
25. **T25.** Step change opens LOOP-1 case with correct case_type and metadata.
26. **T26.** Automated explanation generated for notable and above variances.
27. **T27.** No AI-generated content in explanations.
28. **T28.** User action per row persists.
29. **T29.** Reconciliation export as PDF for 12 months.

### 5.5 Pension status change

30. **T30.** Pension change wizard completes multi-step flow.
31. **T31.** Prior projection snapshotted correctly.
32. **T32.** New projection generated with updated status.
33. **T33.** Prior PDFs marked superseded by default.
34. **T34.** Delete prior PDFs requires explicit confirmation.
35. **T35.** Backdated change triggers reconciliation recalculation.
36. **T36.** Partner-deceased reason triggers sensitive context handling.
37. **T37.** Step-down reason triggers hardship pathway evaluation.

### 5.6 Hardship pathway

38. **T38.** Trigger evaluation runs on step_change reconciliation.
39. **T39.** Trigger evaluation runs on pension status step-down.
40. **T40.** Trigger surfacing notification fires.
41. **T41.** Walkthrough content renders correctly.
42. **T42.** User response persists.
43. **T43.** No automatic application submission.
44. **T44.** LF-1 v1.2 hand-off from walkthrough works.

### 5.7 Integrations

45. **T45.** CORE-1 timeline events written for all instrumented actions.
46. **T46.** LOOP-1 case creation with correct case_type.
47. **T47.** INDEX-1 constant subscription and cache invalidation.
48. **T48.** LCA-1 event subscription triggers recomputation.
49. **T49.** BC-2 reads current lifetime cap.
50. **T50.** FC-2 handover pack includes contribution position.

### 5.8 Persona and editorial

51. **T51.** All strings pass PERSONA-1 audit.
52. **T52.** All strings pass editorial QA (Australian English, no em dashes, no banned vocabulary, `$1,847` format).

### 5.9 Accessibility

53. **T53.** All new surfaces render correctly in light, dark, system modes.
54. **T54.** Lifetime cap card aria-label communicates key figure.

---

## 6. Delivery notes

### 6.1 CE-2 v1.1 regression status

Delivery notes confirm all CE-2 v1.1 tests pass.

### 6.2 SD-3 v1 contribution extraction reliability

Delivery notes report SD-3 v1 contribution extraction reliability on fixtures. If below 95%, launch posture is "hybrid actual and projected" mode by default.

### 6.3 INDEX-1 lifetime cap status

Delivery notes confirm INDEX-1's lifetime cap constant is verified (not PENDING) at launch.

### 6.4 Reconciliation performance

Delivery notes report reconciliation p95 for 12-month history.

### 6.5 Variance threshold validation

Delivery notes report variance flag distribution on fixture data. Skewed distribution indicates threshold tuning need.

### 6.6 Hardship walkthrough content

Delivery notes confirm content authored from primary instruments and reviewed.

### 6.7 Fixture data adequacy

Delivery notes confirm Louisa Davids and Margaret Chen fixtures have adequate decoded statement history and pension status history.

### 6.8 BC-2 coordination

Delivery notes confirm BC-2's lifetime cap tracker (BC-2 Section K) reads from CE-3's accumulator.

---

## 7. Explicit v2 candidates

Items deferred from CE-3 v1.

1. **Deemed income what-if.** Beyond pension status change, modelling changes in assessed deemed income. Deferred.
2. **Family situation transition support.** Beyond partner-deceased, transitions like partner entering care, adult child moving in. Deferred.
3. **Centrelink data feed integration.** If APIs become available, direct pension status verification. Deferred.
4. **Multi-year projection.** Beyond current financial year, 3-5 year projections. Deferred.
5. **Provider-specific reconciliation.** Reconcile per provider when a participant has multiple providers. Deferred.
6. **Variance pattern analytics.** Beyond individual variance flagging, pattern detection across time (persistent under-charging, seasonal variance). Deferred.
7. **Hardship application prefill.** Beyond walkthrough, prefill of application data. Legal review required.
8. **Financial counsellor referral integration.** Direct referral into external services. Deferred.
9. **Household contribution view.** For couples where both are in care. Deferred pending household model expansion.
10. **Assistive Technology contribution integration.** Once ATHM-1 ships, AT-HM contributions and cap treatment. Deferred.

---

## 8. Change log

- **v1** (this document): initial CE-3 spec. Annual projection with confidence-banded range. Lifetime cap accumulator with source lineage and years-at-pace calculation as the flagship reassuring number. Reconciliation view with four variance flag tiers and automatic LOOP-1 case creation on step_change. Pension status change multi-step wizard with prior PDF supersession. Hardship pathway trigger detection and informational walkthrough. Fifty-four acceptance tests. No new Privacy Policy amendment required.

---

**End of CE-3 v1 handoff prompt.**
