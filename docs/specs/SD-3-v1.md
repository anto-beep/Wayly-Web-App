# SD-3 v1: Statement Decoder v3

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (hard dependency), LF-1 v1.2 (soft dependency), SDL-1 v1 (future consumer), LCA-1 v1 (event subscriber)
**Predecessor:** Statement Decoder v2 (SD-2, shipped)
**Successor:** SD-3 v2 will add the statement history trend view and CHSP mode. This v1 spec covers Phase B scope only per PROGRAM-1 phasing.
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

Statement Decoder v2 extracts and interprets a Support at Home statement, applies eight anomaly rules (care management cap, clinical zero-contribution, no separate admin or travel fees, published price match, AT-HM supplier cost ceiling, transport duplicates, worker substitution, GST anomalies), and produces a decoded artefact with per-line explanations. It detects duplicate uploads by file hash and semantic fingerprint. All processing is single-statement.

Two persistent user needs remain unmet by SD-2, and both are visible in the aged care community:

**Betty Curnow's question.** A Support at Home statement shows a Care Management line with `Units 2.50` and no dollar amount. She doesn't know what care management is, whether the government pays it separately, or whether 2.5 units means 2.5 hours. This is the highest-frequency confusion pattern in the community feedback. SD-2 doesn't explain it.

**Derick Osafo Aboagye's post.** Users at the November 2025 Home Care Package to Support at Home changeover are seeing three billing patterns that SD-2 cannot catch, because they all require reconciliation across two statements: services delivered before 1 November but invoiced under Support at Home rules, the same service billed once on the final HCP invoice and again on the first SAH statement, and estimated or forecast billing rather than delivered services. Users have no tool to catch these.

SD-3 v1 addresses both. Cross-statement diff detects Derick's three patterns. The Care Management explainer resolves Betty's question. A first-run overlay tackles the underlying misconception that a statement is a bill. Every detected anomaly opens a case in LOOP-1 with a hand-off CTA to LF-1 v1.2 for the appropriate letter template. A "mark as disputed" affordance on each service line opens a `delivery_discrepancy` case for future consumption by SDL-1.

Trend view across a participant's statement history and CHSP-mode support are deferred to SD-3 v2 in Phase C per PROGRAM-1 sequencing.

SD-3 v1 is a P0 workstream in Phase B. It ships after CORE-1 and LOOP-1 land and after LF-1 v1.2 launches. If LF-1 v1.2 has not launched by the time SD-3 v1 is ready to ship, SD-3 hand-off CTAs route to LF-1 v1.1 templates as a coverage stub, with an upgrade to v1.2 templates on that launch.

---

## 1. Build discipline

Ship as one coordinated build. Sections numbered for organisation, not sequence.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model (extends SD-2)
- **Section C:** Persistence surface
- **Section D:** Internal APIs
- **Section E:** Statement upload flow (extended from SD-2)
- **Section F:** Cross-statement diff surface
- **Section G:** Care Management explainer
- **Section H:** First-run overlay
- **Section I:** Per-anomaly hand-off to LF-1 v1.2 (or v1.1 stub)
- **Section J:** Delivery verification: mark as disputed
- **Section K:** Anomaly detection rules (new plus extensions to SD-2 rules)
- **Section L:** Integration seams (CORE-1, LOOP-1, LF-1, LCA-1, SDL-1 forward)
- **Section M:** Persona-aware rendering
- **Section N:** Accessibility, dark mode, design tokens
- **Section O:** Privacy considerations

Three risks Emergent must surface in delivery notes on first commit:

1. **SD-2 rule preservation.** SD-3 v1 must not regress the eight SD-2 anomaly rules or their post-hallucination hardening. Every SD-2 acceptance test remains valid; every SD-3 addition is tested alongside, not in place of, SD-2's tests.
2. **LF-1 v1.2 launch timing.** SD-3's per-anomaly hand-off assumes LF-1 v1.2 has launched with the new changeover challenge template. If it has not, SD-3 ships with the coverage stub of routing to LF-1 v1.1 templates for available anomaly types and hiding the CTA where no template exists.
3. **Cross-statement diff false-positive risk.** The diff engine is AI-assisted candidate proposal, not silent auto-flagging. A false-positive rate above 15% observed in Phase 0 test fixtures raises a delivery-note concern and gates the launch of diff-created cases behind a manual-review UX step.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/SD-3-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 SD-2 anomaly rule inventory

For each of SD-2's eight rules, report the exact rule identifier, the detection logic, and the persistence shape for the flagged finding. SD-3 v1 preserves these unchanged and extends the set.

### A.2 Statement Decoder persistence

Report the current shape of the decoded statement record (top-level fields, per-line-item shape, per-anomaly shape, persistence collection).

### A.3 CORE-1 profile signals

Confirm CORE-1's ProfileAggregate exposes:
- `participant.transition_status` (needed for HCP-to-SAH boundary date reasoning)
- `latest_artefacts.statement` (SD-3 populates this)
- Timeline write endpoint per CORE-1 Section F.4

### A.4 LOOP-1 case types

Confirm the LOOP-1 registry includes:
- `statement_anomaly` (existing per LOOP-1 Section B.3)
- `cross_boundary_charge` (existing per LOOP-1 Section B.3)
- `delivery_discrepancy` (forward-declared per LOOP-1 Section B.3)

For each, confirm the metadata schema is compatible with SD-3's anomaly output.

### A.5 LF-1 v1.2 launch status

Report whether LF-1 v1.2 has launched. Report which templates exist and their identifiers. SD-3's per-anomaly hand-off maps depend on this inventory.

Recommended templates that SD-3 v1 hand-offs assume:
- Changeover billing challenge template (LF-1 v1.2)
- Statement anomaly dispute template (LF-1 v1.1 or v1.2)
- Delivery discrepancy provider follow-up template (LF-1 v1.1 or v1.2)

Missing templates are documented in delivery notes and the CTA is hidden where no template exists rather than routing to a broken hand-off.

### A.6 Existing PII redaction and duplicate detection

SD-2's PII redaction and duplicate upload detection are preserved. Confirm the mechanisms so SD-3 additions do not weaken them.

### A.7 Original file retention

Cross-statement diff requires access to prior decoded statements. If original files are retained, the diff can access them. If only decoded artefacts are retained, the diff operates on decoded data, which is adequate for v1.

Report retention status. Delivery notes name the implication.

### A.8 Australian data residency

Confirm ap-southeast-2 for the new SD-3 collections.

### A.9 Cross-statement diff test fixtures

Prepare two test-fixture pairs:
- Pair 1: Louisa Davids final HCP statement (Oct 2025) and first SAH statement (Nov 2025) with known Pattern 2 duplicates and Pattern 1 cross-boundary services. Canonical fixture per Wayly convention.
- Pair 2: Margaret Chen consecutive SAH statements (Feb 2026 and Mar 2026) with no duplicates. Negative-test fixture.

Both fixtures are pre-existing per Wayly convention (Louisa and Margaret are canonical) and extended for SD-3 with the specific line items needed to exercise cross-statement detection.

### A.10 Care Management line-item detection reliability

For a sample of ten real Support at Home statements, verify SD-2's ability to identify the Care Management line item. If detection is unreliable (below 95% recall on the sample), extending the explainer is premature; the detection layer needs strengthening first as a Phase 0 workstream in SD-3 v1.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model

### B.1 Decoded statement (extended from SD-2)

SD-3 adds fields to the existing decoded statement record. Existing fields preserved.

New fields:

```
DecodedStatement (extends SD-2 shape) {
  ...existing SD-2 fields,
  program_type: enum { sah, hcp, chsp, unknown }  // Detected on decode
  statement_period_start: date
  statement_period_end: date
  boundary_context: {
    contains_pre_1_nov_2025_services: boolean
    contains_post_1_nov_2025_services: boolean
    is_final_hcp_statement: boolean
    is_first_sah_statement: boolean
  }
  care_management_line: {
    detected: boolean
    line_id: string | null
    units: decimal | null
    hours_equivalent: decimal | null
    dollar_amount: decimal | null
    explanation_shown_to_user: boolean
  } | null
  first_run_overlay_shown_to_user: boolean
  disputed_service_line_ids: string[]  // Line IDs the user has marked as disputed
}
```

Existing SD-2 fields including PII redaction status, anomaly array, and duplicate-detection outputs are preserved without modification.

### B.2 Statement pair

New collection for cross-statement diff.

```
StatementPair {
  id: UUID
  participant_id: UUID
  statement_a_id: UUID  // Foreign key to DecodedStatement
  statement_b_id: UUID
  pair_type: enum { changeover_hcp_to_sah, consecutive_same_program, manual_pair }
  boundary_date: date | null  // Populated for changeover pairs; typically 2025-11-01
  duplicate_candidates_generated: boolean
  cross_boundary_findings_generated: boolean
  estimated_billing_findings_generated: boolean
  user_review_status: enum { not_started, in_review, completed }
  created_at: timestamp
  reviewed_at: timestamp | null
  data_residency: string (must be "ap-southeast-2")
}
```

### B.3 Duplicate candidate

New collection.

```
DuplicateCandidate {
  id: UUID
  statement_pair_id: UUID
  statement_a_line_id: string
  statement_b_line_id: string
  match_type: enum { same_amount_same_date, same_service_description, same_service_code_across_boundary, service_delivered_pre_boundary_billed_post }
  confidence: enum { high, medium, low }
  ai_rationale: string  // Persona-neutral, staff-visible; not shown to end user
  suggested_summary_tokens: {
    caregiver: string
    participant_self: string
  }
  user_decision: enum { unconfirmed, confirmed_duplicate, dismissed_as_not_duplicate }
  case_id: UUID | null  // LOOP-1 case if user confirms
  created_at: timestamp
  decided_at: timestamp | null
}
```

### B.4 Cross-boundary finding

New collection for Pattern 1 detections that are not duplicate matches but standalone anomalies (a service delivered before 1 November billed on a SAH statement without a corresponding HCP line).

```
CrossBoundaryFinding {
  id: UUID
  statement_id: UUID
  statement_pair_id: UUID | null  // Populated when detected via pair; null when detected on single statement
  affected_line_id: string
  service_delivery_date: date
  billing_program: enum { sah, hcp, chsp }
  boundary_violated: enum { pre_1_nov_2025_billed_as_sah, post_1_nov_2025_billed_as_hcp }
  summary_tokens: {
    caregiver: string
    participant_self: string
  }
  case_id: UUID | null
  created_at: timestamp
}
```

### B.5 Estimated billing finding

New collection for Pattern 3 detections.

```
EstimatedBillingFinding {
  id: UUID
  statement_id: UUID
  affected_line_id: string
  reason: enum {
    description_indicates_estimate,
    quantity_matches_typical_forecast_pattern,
    date_in_future_relative_to_statement_period,
    other
  }
  reason_details: string
  summary_tokens: {
    caregiver: string
    participant_self: string
  }
  case_id: UUID | null
  created_at: timestamp
}
```

### B.6 Disputed service line

New collection for delivery verification.

```
DisputedServiceLine {
  id: UUID
  statement_id: UUID
  service_line_id: string
  disputed_by_user_id: UUID
  dispute_reason: enum {
    participant_was_in_hospital,
    worker_did_not_arrive,
    different_service_than_billed,
    duration_shorter_than_billed,
    duration_longer_than_billed,
    wrong_worker,
    other
  }
  dispute_details: string  // User's free-text description, max 500 chars
  case_id: UUID | null  // LOOP-1 case
  status: enum { open, resolved, dismissed }
  created_at: timestamp
  resolved_at: timestamp | null
}
```

### B.7 First-run overlay

Not a persisted collection; a preference stored on the user record.

```
User {
  ...existing fields,
  ui_state: {
    ...existing,
    statement_first_run_overlay_shown: boolean  // Default false; set true on first dismiss
    statement_first_run_overlay_dismissed_at: timestamp | null
  }
}
```

---

## Section C. Persistence surface

### C.1 New collections

- `statement_pairs` (see B.2, indexed on `participant_id, created_at DESC`)
- `duplicate_candidates` (see B.3, indexed on `statement_pair_id, user_decision`)
- `cross_boundary_findings` (see B.4, indexed on `statement_id, participant_id`)
- `estimated_billing_findings` (see B.5, indexed on `statement_id, participant_id`)
- `disputed_service_lines` (see B.6, indexed on `statement_id, status`)

Existing SD-2 `decoded_statements` collection extended in place with the new B.1 fields.

All new collections in MongoDB Atlas ap-southeast-2.

### C.2 Retention

- Statement pairs retained for the life of the participant record
- Duplicate candidates retained for 2 years after `decided_at`; unconfirmed candidates retained indefinitely until decided
- Cross-boundary and estimated billing findings retained for the life of the parent statement
- Disputed service lines retained for the life of the parent statement
- All cascade-delete with participant deletion after the 30-day soft-delete window

### C.3 Backfill

Existing decoded statements from SD-2 do not need retroactive extension. New fields default to null or false. A cross-statement diff on an SD-2-decoded statement operates on the persisted decoded data.

---

## Section D. Internal APIs

### D.1 Statement decode API (extended from SD-2)

Existing SD-2 endpoint preserved. Response shape extended per B.1.

```
POST /internal/statement-decoder/decode
Body: multipart/form-data with the statement file, participant_id
Returns: DecodedStatement (SD-3 extended shape)
```

Detection and anomaly rules per Section K run in the same request.

### D.2 Cross-statement diff

```
POST /internal/statement-decoder/pairs
Body: {
  participant_id,
  statement_a_id,
  statement_b_id,
  pair_type: enum,
  boundary_date: date | null
}
Returns: StatementPair with duplicate_candidates, cross_boundary_findings, and estimated_billing_findings populated
```

Idempotent on `(participant_id, statement_a_id, statement_b_id)` in that order. Statement order is normalised (statement A is chronologically earlier).

```
GET /internal/statement-decoder/pairs/[id]
Returns: StatementPair with populated findings
```

```
PATCH /internal/statement-decoder/duplicate-candidates/[id]
Body: { user_decision: confirmed_duplicate | dismissed_as_not_duplicate, actor_user_id }
Returns: updated DuplicateCandidate; on confirmed, opens a LOOP-1 case
```

```
PATCH /internal/statement-decoder/pairs/[id]/review-status
Body: { user_review_status: in_review | completed }
```

### D.3 Care Management explainer

```
GET /internal/statement-decoder/statements/[id]/care-management
Returns: {
  detected: boolean,
  units: decimal | null,
  hours_equivalent: decimal | null,
  dollar_amount: decimal | null,
  explanation_tokens: {
    caregiver: string,
    participant_self: string
  }
}
```

The explanation content is authored in a template with placeholders (units, hours, quarterly budget percentage) resolved at read time.

```
PATCH /internal/statement-decoder/statements/[id]/care-management-explanation-shown
Body: { shown: true }
```

Marks the explanation as shown to prevent repeated first-time framing.

### D.4 Disputed service line

```
POST /internal/statement-decoder/disputed-service-lines
Body: {
  statement_id,
  service_line_id,
  dispute_reason: enum,
  dispute_details: string
}
Returns: DisputedServiceLine, and opens a LOOP-1 case with case_type `delivery_discrepancy`
```

```
PATCH /internal/statement-decoder/disputed-service-lines/[id]
Body: { status: resolved | dismissed }
```

### D.5 First-run overlay

```
GET /internal/users/[user_id]/statement-first-run-overlay-state
Returns: { should_show: boolean }
```

Returns `should_show: true` for a user with `statement_first_run_overlay_shown: false` who has just successfully decoded their first statement.

```
POST /internal/users/[user_id]/statement-first-run-overlay-dismiss
Sets shown to true.
```

### D.6 Authorisation

All endpoints scoped by household membership per CORE-1 pattern. Failures return 404.

---

## Section E. Statement upload flow (extended from SD-2)

### E.1 Existing flow preserved

SD-2's upload flow (file selection, hash check, semantic fingerprint, decode, anomaly detection, display) is preserved. Persona-aware rendering per PERSONA-1.

### E.2 First-run overlay integration

After a successful decode, the frontend checks the first-run overlay state via D.5. If `should_show: true`:

- The overlay renders as a modal on top of the decoded statement view
- Overlay content is persona-aware
- Two CTAs: "Got it" (dismiss and mark shown) and "Show me this again next time" (dismiss without marking shown)
- Dismissal calls D.5's POST endpoint

### E.3 Care Management explainer integration

If the decoded statement's `care_management_line.detected: true`:

- On the decoded statement view, the Care Management line renders with an inline explainer icon
- Clicking the icon opens the explainer content per Section G
- The first time a user views a statement with Care Management, the explainer opens automatically once
- Subsequent statements show the icon but do not auto-open

### E.4 Cross-statement diff prompt

After a successful decode, if the participant has at least one prior decoded statement:

- A prompt appears: "Compare this statement with [prior statement date]" as a suggested action card
- User can accept (opens the diff flow per Section F), dismiss (hides for this session), or defer

For a participant whose transition_status suggests HCP-to-SAH changeover and whose statement metadata matches a changeover boundary, the prompt is more prominent and mentions the specific benefit ("Catch any charges that crossed the changeover").

### E.5 Per-anomaly display

Every existing SD-2 anomaly plus every new SD-3 finding (cross-boundary, estimated-billing) renders on the decoded statement view. Each anomaly has:

- Persona-aware description
- Severity indicator per LOOP-1 severity tokens
- Hand-off CTA per Section I

---

## Section F. Cross-statement diff surface

### F.1 Route

`/app/participants/[id]/statement-pairs/[pair_id]`

### F.2 Diff view layout

Two-column layout:

- Left column: Statement A (earlier)
- Right column: Statement B (later)
- Column headers: date range, program type, provider
- Below headers: totals summary per statement

Between columns: candidate match indicators (visual connectors or shared background highlight) drawn between paired lines.

Below the two columns: three sections
- Duplicate candidates (with confirmation UI)
- Cross-boundary findings
- Estimated billing findings (if any)

### F.3 Duplicate candidate confirmation UI

Each candidate is presented as a card:

- Statement A line: date, description, quantity, amount
- Statement B line: date, description, quantity, amount
- Match type label
- Confidence indicator
- Persona-aware summary sentence explaining why the system flagged it
- Three buttons: "Yes, this is a duplicate," "No, these are different services," "Not sure right now"

Confirming a duplicate:
- Sets `user_decision: confirmed_duplicate`
- Opens a LOOP-1 case with `case_type: statement_anomaly`, source_finding_id including the candidate id, and metadata containing both line items and the match type
- The case CTA in Section I routes to LF-1 v1.2's changeover challenge template if the match is cross-boundary; otherwise to the standard billing dispute template

Dismissing:
- Sets `user_decision: dismissed_as_not_duplicate`
- No case opened

"Not sure":
- Leaves as `unconfirmed`
- The candidate remains in the diff view for later review

### F.4 Cross-boundary findings display

Each finding is presented as a card:

- Affected line: date, description, amount
- Boundary direction (pre-1-Nov service billed on SAH statement, for example)
- Persona-aware summary explaining why this is worth challenging
- Hand-off CTA (per Section I) to LF-1 v1.2's changeover challenge template

### F.5 Estimated billing findings display

Same pattern as cross-boundary findings. Hand-off CTA routes to LF-1 v1.2's estimated-billing challenge template if available; otherwise to the standard billing dispute template.

### F.6 Review completion

A "Mark review complete" button transitions the pair to `user_review_status: completed`. Undecided candidates remain but the pair no longer prompts the user.

### F.7 Entry points to the diff

- From the decoded statement view (Section E.4 prompt)
- From the participant profile page (CORE-1) if any statement pair has `user_review_status: not_started`
- Direct URL

### F.8 Empty state (no candidates or findings)

If the diff engine finds nothing:

- The view renders "No duplicates or cross-boundary charges found between these statements. That's a clean handover."
- The pair is marked `user_review_status: completed` automatically

---

## Section G. Care Management explainer

### G.1 Detection

On statement decode, the parser looks for a line item labelled variously "Care Management," "Care coordination," "Case management," or with a service code matching known Care Management codes. Detection populates `care_management_line` per B.1.

If the line shows units without a dollar amount (Betty Curnow's pattern), the units-to-hours conversion applies: default assumption is `1 unit = 1 hour` for Care Management; overridden per-provider mapping if a discrepancy is confirmed on a specific provider's statements over time (out of scope for v1; noted as a v2 candidate).

### G.2 Explainer content

Authored in caregiver and participant-self versions with placeholder resolution.

Caregiver version, resolved for Betty's example:

> "This line is 2.5 hours of care management for the month. Care management is the coordination and administration your provider does behind the scenes: arranging services, monitoring [participant name]'s plan, and keeping records. Under Support at Home, care management is capped at 10% of the quarterly budget and is deducted from the quarterly envelope before services are delivered. It is not paid separately by the government on top of your services."

Participant-self version:

> "This line is 2.5 hours of care management for the month. Care management is the coordination and administration your provider does behind the scenes: arranging services, monitoring your plan, and keeping records. Under Support at Home, care management is capped at 10% of your quarterly budget and is deducted from your envelope before services are delivered. It is not paid separately by the government on top of your services."

Content sourced from the Support at Home Program Manual with a link to the primary source.

### G.3 Explainer UI

- Inline icon on the Care Management line
- Click opens a modal with the explainer content
- Modal includes: content, "Where does this come from" link (Program Manual), close button
- On first display for a user with `explanation_shown_to_user: false`, the modal auto-opens after the statement view has loaded
- On subsequent statements, the icon renders but does not auto-open

### G.4 Zero-hours case

If Care Management units are zero for the month (some providers pre-charge), the explainer notes: "This month's Care Management was recorded as 0 units. Your provider may charge this at other times in the quarter."

### G.5 Cap breach case

If Care Management for the quarter exceeds 10% of the quarterly budget, SD-2's existing care management cap rule fires as an anomaly. The explainer references the finding.

---

## Section H. First-run overlay

### H.1 Content

Persona-aware modal shown once per user on their first successful statement decode.

Caregiver version:

> "This is a statement, not a bill.
>
> A monthly statement shows what your provider did with your quarterly Support at Home budget and how it was spent.
>
> If [participant name] owes a contribution, they will receive a separate invoice from the provider. That is the bill.
>
> Any charges shown here have already come out of the government-funded portion of the budget."

Participant-self version:

> "This is a statement, not a bill.
>
> A monthly statement shows what your provider did with your quarterly Support at Home budget and how it was spent.
>
> If you owe a contribution, you will receive a separate invoice from the provider. That is the bill.
>
> Any charges shown here have already come out of the government-funded portion of the budget."

### H.2 UX rules

- Appears once per user, on first successful decode
- Two CTAs: "Got it" (dismiss and mark shown) and "Show me this again next time" (dismiss without marking shown)
- Fully dismissable, not blocking
- Never re-appears for a user who has chosen "Got it"

### H.3 Contribution invoice reference

The overlay references the separate invoice that users receive if they have a contribution. This distinguishes statement from invoice, which is the source of Betty's misconception.

### H.4 Persona-aware placeholder resolution

`[participant name]` resolves from CORE-1 profile at render time. If not available (very first statement decoded for a user with an incomplete profile), the caregiver version substitutes "the person you care for."

---

## Section I. Per-anomaly hand-off to LF-1 v1.2

### I.1 Hand-off mapping

Each anomaly type has a target letter template.

| Anomaly type | Target LF-1 template | Fallback if LF-1 v1.2 not shipped |
|---|---|---|
| Care management cap breach | Billing dispute template | LF-1 v1.1 generic dispute |
| Clinical zero-contribution violation | Billing dispute template | Same |
| Separate admin/travel fee | Billing dispute template | Same |
| Published price mismatch | Billing dispute template | Same |
| AT-HM supplier ceiling breach | AT-HM dispute template (LF-1 v1.2) | Hide CTA |
| Transport duplicate (RULE_3) | Billing dispute template | LF-1 v1.1 generic dispute |
| Worker substitution (RULE_6) | Provider follow-up template | LF-1 v1.1 provider follow-up |
| GST anomaly | Billing dispute template | LF-1 v1.1 generic dispute |
| Duplicate candidate confirmed (new) | Changeover challenge template (LF-1 v1.2) if cross-boundary; billing dispute otherwise | Hide CTA if v1.2 not shipped and cross-boundary; LF-1 v1.1 generic otherwise |
| Cross-boundary finding (new) | Changeover challenge template (LF-1 v1.2) | Hide CTA if v1.2 not shipped |
| Estimated billing finding (new) | Estimated billing dispute template (LF-1 v1.2) | LF-1 v1.1 generic dispute as fallback |
| Delivery discrepancy (new) | Provider follow-up template | LF-1 v1.1 provider follow-up |

### I.2 Hand-off flow

1. User views an anomaly on the decoded statement or in the diff view
2. Primary CTA: "Draft a letter about this"
3. Clicking opens LF-1 v1.2 with prefill data:
   - Participant profile context (name, provider)
   - Statement metadata (period, statement id)
   - Specific line items involved
   - Anomaly-type-specific narrative pre-populated
4. User reviews the letter draft, edits as needed, sends via LF-1's export or send flow

### I.3 Case opening

When the user takes the hand-off CTA, a LOOP-1 case opens with:

- `case_type: statement_anomaly` for SD-2 anomalies and estimated billing
- `case_type: cross_boundary_charge` for cross-boundary findings and confirmed cross-boundary duplicates
- `case_type: delivery_discrepancy` for disputed service lines (Section J)
- `source_artefact_id: decoded_statement.id`
- `source_finding_id: anomaly.id` or `duplicate_candidate.id` or `cross_boundary_finding.id`

Idempotency per LOOP-1's registry: the same finding does not create multiple cases.

### I.4 Cancellation of a hand-off

Users may abandon the letter draft. The case remains open with status `open`. The user can return via the case detail page in LOOP-1.

---

## Section J. Delivery verification: mark as disputed

### J.1 UX affordance

Every service line on a decoded statement has a compact "This didn't happen" affordance visible on hover or expand. Deliberately understated to avoid encouraging spurious disputes.

### J.2 Dispute modal

Clicking opens a modal with:

- Confirmation ("Are you telling us this service didn't happen as billed?")
- Dispute reason dropdown per B.6 enum
- Free-text details field (max 500 chars, optional)
- Two buttons: "Submit dispute" and "Cancel"

### J.3 Case creation

On submit:
- A `DisputedServiceLine` record is created
- A LOOP-1 case opens with `case_type: delivery_discrepancy`, metadata including reason, details, and the service line
- The service line renders on the statement view with a "Disputed" flag

### J.4 Visibility

Disputed service lines appear on:
- The decoded statement view with the flag
- The participant profile page under open cases
- The LOOP-1 case list

### J.5 SDL-1 forward integration

When SDL-1 ships, it consumes these cases and cross-references them against the SDL-1 attendance log. In SD-3 v1, dispute records persist and cases open, but no attendance log exists yet.

### J.6 Resolution paths

- User marks the case resolved after the provider responds (via LOOP-1 case actions)
- Auto-resolve when a subsequent statement shows a credit for the disputed service (out of scope for v1; noted as v2 candidate)

---

## Section K. Anomaly detection rules

### K.1 Preserved SD-2 rules

All eight SD-2 rules unchanged:

1. Care management cap breach
2. Clinical zero-contribution violation
3. Separate admin or travel fee
4. Published price mismatch
5. AT-HM supplier ceiling breach
6. Transport duplicate (RULE_3, same-day same-code within one statement)
7. Worker substitution (RULE_6, unexpected worker substitutions)
8. GST anomaly (post-hallucination fix)

### K.2 New rule: Cross-statement duplicate

Detects the same charge appearing on two statements. Runs during cross-statement diff.

Match criteria (any of):
- Same date, same amount, same or highly similar description
- Same service code across a changeover boundary
- Same amount within a small tolerance and same date

Confidence:
- High: exact date, exact amount, same or near-identical description
- Medium: same amount, dates within 7 days
- Low: same amount only

Never silent-flagged. Always presented as a candidate for user confirmation.

### K.3 New rule: Cross-boundary charge

Detects a service delivered before 1 November 2025 billed on a SAH statement, or delivered after 1 November 2025 billed on an HCP statement. Runs during single-statement decode (if boundary_context suggests this may apply) and during cross-statement diff.

Detection: the service delivery date on a line item is compared against the statement's program type. Mismatched period-program combinations flag.

### K.4 New rule: Estimated billing

Detects statement lines that appear to reflect forecast rather than delivered services.

Signals:
- Description contains keywords: "estimate," "forecast," "expected," "planned"
- Quantity matches a typical forecast pattern (recurring identical quantities across multiple weeks without variation)
- Date is in the future relative to the statement period

The rule is intentionally conservative: false positives on legitimate flat-rate services (a fixed monthly cleaning fee) are worse than false negatives. Confidence tuned during Phase 0 against fixtures.

### K.5 New rule: Care Management line special handling

Not an anomaly rule per se; the Care Management explainer (Section G) is triggered by the detection. If the line shows units without dollar amount, this is normal; the explainer clarifies.

Anomaly fires only if the Care Management amount exceeds 10% of the quarterly budget (existing SD-2 cap rule) or is billed on a non-Support-at-Home statement.

### K.6 Detection layer versus finding creation

Detection runs synchronously in the decode request. Findings are persisted immediately. Cross-statement diff findings run when a pair is created via D.2.

### K.7 Prompt hardening

The AI-assisted candidate proposal for cross-statement duplicates uses a heavily constrained prompt with the same discipline that prevented the SD-2 GST hallucination (fixture-driven, structured output, rule-based post-filter). Prompt QA is a delivery-note item.

---

## Section L. Integration seams

### L.1 CORE-1

- Read: participant profile including `transition_status`, `provider`, `classification` for context
- Write: timeline events for `statement_decoded` (extended from SD-2), `statement_pair_created`, `duplicate_candidate_confirmed`, `cross_boundary_finding_created`, `estimated_billing_finding_created`, `service_line_disputed`
- Update: `latest_artefacts.statement` on the profile aggregate

### L.2 LOOP-1

- Write: cases for confirmed duplicates, cross-boundary findings, estimated billing findings, disputed service lines
- Case types used: `statement_anomaly`, `cross_boundary_charge`, `delivery_discrepancy`
- Idempotency per LOOP-1's registry

### L.3 LF-1 v1.2

- Hand-off prefill data structure per Section I
- If LF-1 v1.2 has not launched, fallback per Section I.1 table

### L.4 LCA-1

- SD-3 subscribes to `tool_cache_invalidate` events per LCA-1 Section I.4. When a legislative change with `affects_wayly_tools` including Statement Decoder becomes effective, SD-3's cached calculations invalidate.

### L.5 SDL-1 forward

- Disputed service line records persist; SDL-1 will consume them when it ships. No SD-3 v1 dependency.

### L.6 QP-1 forward

- QP-1's living spend ledger will read from decoded statements. SD-3 v1 does not build a ledger; QP-1 does when it ships.

---

## Section M. Persona-aware rendering

### M.1 Persona-aware content

Every user-facing string in SD-3 additions is authored in both caregiver and participant-self versions per PERSONA-1. This includes:

- First-run overlay
- Care Management explainer
- Duplicate candidate summary sentences
- Cross-boundary finding summaries
- Estimated billing finding summaries
- Dispute modal copy
- Hand-off CTA labels

### M.2 Placeholder resolution

`[participant name]`, `[provider name]`, `[quarterly budget amount]`, `[statement period]` resolved at render time from CORE-1's ProfileAggregate.

### M.3 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

---

## Section N. Accessibility, dark mode, design tokens

### N.1 UXF-1 v3

Every new component uses UXF-1 v3 tokens.

### N.2 Diff view accessibility

The two-column diff view has considerations for screen readers:
- Table markup with proper `<th>` and `<td>` roles
- `aria-live` regions for candidate confirmation status updates
- Alternative single-column view accessible via keyboard shortcut for users who cannot process two-column visual comparison

### N.3 Dark mode

All new surfaces render correctly in light, dark, and system modes. Statement content remains light-themed within dark chrome per Wayly convention.

### N.4 WCAG 2.1 AAA

Contrast, focus indicators, keyboard navigation, screen reader labels per Wayly standard.

### N.5 Reduced motion

Diff view connector animations respect `prefers-reduced-motion`.

---

## Section O. Privacy considerations

### O.1 Privacy Policy amendment

SD-3 v1's additions are within scope of the existing SD-2 Privacy Policy coverage. Statement data is already covered. Cross-statement diff, dispute records, and additional findings are functionally derivative and do not introduce a new data category.

Minor amendment recommended:
- Disclose the existence of user-marked disputed service lines and their persistence
- Disclose the AI-assisted candidate proposal for cross-statement duplicates

Confirm with solicitor whether a formal Privacy Policy update is required or whether the existing wording covers it. Recommend a small clarifying update to be safe.

### O.2 PII redaction

SD-2's PII redaction is preserved for both statements in a diff. Redacted content is redacted in both views.

### O.3 Correspondence retention

Disputed service line dispute details are user-authored free text. Retention per B.6 (life of parent statement, cascade with participant deletion). No solicitor sign-off required beyond the standard.

---

## 2. Locked decisions

1. **Version scope.** SD-3 v1 covers cross-statement diff, Care Management explainer, first-run overlay, per-anomaly hand-off, and disputed service line affordance. Trend view and CHSP mode deferred to SD-3 v2.
2. **Cross-statement diff pattern.** AI-assisted candidate proposal, never silent auto-flag. User confirms each duplicate.
3. **False-positive tolerance.** Phase 0 fixture test target is under 15% false-positive rate on duplicate candidates. Above this, launch gates behind a manual-review UX step.
4. **Care Management unit-to-hours conversion.** Default 1 unit = 1 hour. Per-provider override deferred to v2.
5. **First-run overlay.** Once per user, on first successful decode, with "show me again next time" option.
6. **Care Management explainer auto-open.** Once per user on first statement with Care Management detected; icon-only thereafter.
7. **Hand-off target.** LF-1 v1.2 preferred; LF-1 v1.1 fallback per Section I.1 table.
8. **Case types.** `statement_anomaly` for SD-2 and estimated billing findings, `cross_boundary_charge` for cross-boundary and cross-boundary duplicates, `delivery_discrepancy` for disputed service lines.
9. **Diff entry points.** Decoded statement view prompt, participant profile page pending-review indicator, direct URL.
10. **Diff completion.** "Mark review complete" button transitions status to `completed`. Undecided candidates persist.
11. **Delivery discrepancy dispute reasons.** Fixed enum per B.6; free-text details optional, max 500 chars.
12. **PII redaction.** Preserved from SD-2 unchanged.
13. **Cross-statement matching tolerance.** Same amount, same date, same or highly similar description = high confidence. Same amount within 7 days = medium. Same amount only = low.
14. **Estimated billing rule confidence.** Conservative by default; false-positive on flat-rate services worse than false-negative.
15. **Detection performance.** Cross-statement diff completes in under 8 seconds for a typical pair. Delivery notes report actual measured performance.
16. **Backfill.** SD-2 decoded statements accessible in cross-statement diff without backfill.
17. **Data residency.** ap-southeast-2 for all new writes.
18. **Feature flag.** `sd_3_v1_features` gates all new SD-3 v1 functionality. Rollback via flag off.
19. **CORE-1 timeline events.** Statement pair creation, duplicate confirmation, findings creation, and service line disputes write timeline events.
20. **LOOP-1 case idempotency.** One case per (participant, finding) pair; re-runs do not duplicate.
21. **CHSP mode.** Deferred to SD-3 v2. Program type detection includes CHSP identification; UI treatment is v2.
22. **Trend view.** Deferred to SD-3 v2.
23. **Retention.** New collections retained per Section C.2. Cascade with participant deletion.
24. **SD-2 rule preservation.** All eight rules preserved without regression. Every SD-2 acceptance test remains valid.
25. **Privacy Policy.** Small clarifying update recommended, not a launch gate.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit (Section A)
- **WS2.** DecodedStatement schema extension and program type detection (Sections B.1, C.1)
- **WS3.** StatementPair collection and API (Sections B.2, C.1, D.2)
- **WS4.** DuplicateCandidate collection and confirmation API (Sections B.3, C.1, D.2)
- **WS5.** CrossBoundaryFinding collection and detection (Sections B.4, C.1, K.3)
- **WS6.** EstimatedBillingFinding collection and detection (Sections B.5, C.1, K.4)
- **WS7.** DisputedServiceLine collection and API (Sections B.6, C.1, D.4)
- **WS8.** Care Management line detection and explainer (Sections G, K.5)
- **WS9.** First-run overlay state and API (Sections H, D.5)
- **WS10.** Cross-statement diff engine (Sections F, K.2)
- **WS11.** Cross-statement diff surface (Section F)
- **WS12.** Extended decode flow with first-run overlay and Care Management explainer (Section E)
- **WS13.** Per-anomaly hand-off mapping and CTAs (Section I)
- **WS14.** Delivery verification UX (Section J)
- **WS15.** CORE-1 integration and timeline events (Section L.1)
- **WS16.** LOOP-1 case creation integration (Section L.2)
- **WS17.** LF-1 hand-off integration (Section L.3)
- **WS18.** LCA-1 cache invalidation subscription (Section L.4)
- **WS19.** Persona-aware rendering integration (Section M)
- **WS20.** UXF-1 v3 tokens, dark mode, WCAG (Section N)
- **WS21.** PostHog event schema (see 3.1)
- **WS22.** Feature flag and rollback
- **WS23.** Privacy Policy clarifying update (Section O.1)
- **WS24.** SD-2 regression test suite integration

### 3.1 PostHog event schema

- `statement_decoded_v3` (participant_id, program_type, anomaly_count, care_management_detected, boundary_context)
- `statement_first_run_overlay_shown`
- `statement_first_run_overlay_dismissed` (choice: got_it | show_again)
- `care_management_explainer_opened` (auto: bool)
- `care_management_explainer_closed`
- `statement_pair_created` (pair_type, boundary_date)
- `statement_pair_reviewed` (duplicate_candidates_confirmed, duplicate_candidates_dismissed, cross_boundary_findings, estimated_billing_findings, review_duration_seconds)
- `duplicate_candidate_shown` (match_type, confidence)
- `duplicate_candidate_decided` (match_type, confidence, decision)
- `cross_boundary_finding_shown` (boundary_violated)
- `estimated_billing_finding_shown` (reason)
- `hand_off_cta_clicked` (anomaly_type, target_template, fallback_used)
- `service_line_disputed` (dispute_reason)
- `service_line_dispute_resolved` (resolution_time_days)

---

## 4. Rollback plan

### 4.1 Feature flag

`sd_3_v1_features` gates all SD-3 v1 additions. When off:
- Cross-statement diff routes return 404
- Diff prompt on decoded statement view hidden
- Care Management explainer icon and modal hidden
- First-run overlay suppressed
- Disputed service line affordances hidden
- Cross-boundary and estimated billing findings not shown on decoded statement view
- Per-anomaly hand-off CTAs hidden or fall back to SD-2 CTAs

SD-2's core decode and anomaly detection continue to operate.

### 4.2 Rollback triggers

- Cross-statement diff false-positive rate exceeds 25% in production observation
- Care Management explainer misidentifies non-Care-Management lines above 5% rate
- Duplicate LOOP-1 case creation observed
- Cross-participant data leak observed
- Regression in any SD-2 anomaly rule

### 4.3 Data retention during rollback

All new collections retained. Flag re-enable restores visibility.

### 4.4 SD-2 independence

SD-2 continues to operate without SD-3 v1. Turning SD-3 v1 off does not regress any SD-2 behaviour.

---

## 5. Acceptance tests

Forty-eight tests across ten categories.

### 5.1 SD-2 rule preservation

1. **T1.** All eight SD-2 anomaly rules pass their original acceptance tests unchanged.
2. **T2.** SD-2's PII redaction operates unchanged.
3. **T3.** SD-2's duplicate upload detection (file hash and semantic fingerprint) operates unchanged.

### 5.2 Extended decode

4. **T4.** Decoding a statement populates `program_type`, `statement_period_start`, `statement_period_end`, `boundary_context`, and `care_management_line` fields.
5. **T5.** A statement with Care Management populates `care_management_line.detected: true` with `units`, `hours_equivalent`, and either `dollar_amount` or null.
6. **T6.** A statement's `boundary_context` correctly identifies pre-1-Nov-2025 services and post-1-Nov-2025 services.
7. **T7.** A statement decoded with data_residency `ap-southeast-2` written.

### 5.3 First-run overlay

8. **T8.** First successful decode for a user shows the overlay.
9. **T9.** Dismissing with "Got it" sets `statement_first_run_overlay_shown: true`; subsequent decodes do not show it.
10. **T10.** Dismissing with "Show me again next time" does not set shown; next decode shows it again.
11. **T11.** Overlay content renders correct persona strings.

### 5.4 Care Management explainer

12. **T12.** Statement with Care Management line auto-opens the explainer on first view.
13. **T13.** Subsequent statements with Care Management show icon only.
14. **T14.** Explainer content resolves placeholders (units, hours, participant name) correctly.
15. **T15.** Statement without Care Management does not render the explainer.
16. **T16.** Care Management line showing units without dollar amount renders correctly.

### 5.5 Cross-statement diff

17. **T17.** Creating a pair from Louisa Davids Oct 2025 HCP and Nov 2025 SAH fixtures identifies known duplicates as high-confidence candidates.
18. **T18.** Creating a pair from Margaret Chen consecutive fixtures (no duplicates) returns empty candidates.
19. **T19.** Cross-boundary services in the Louisa fixture surface as findings.
20. **T20.** False-positive rate on the fixture test set is below 15%.
21. **T21.** Diff pair creation idempotent on same (participant, statement_a, statement_b) tuple.
22. **T22.** Confirming a duplicate creates a LOOP-1 case with correct case_type and metadata.
23. **T23.** Dismissing a candidate creates no case.
24. **T24.** "Mark review complete" transitions pair status to `completed`.
25. **T25.** Diff completes in under 8 seconds for a typical pair.

### 5.6 Cross-boundary and estimated billing findings

26. **T26.** Cross-boundary detection flags pre-1-Nov service billed on SAH statement.
27. **T27.** Estimated billing detection flags a line item with "estimate" keyword.
28. **T28.** Estimated billing detection does NOT flag a flat-rate monthly cleaning fee.

### 5.7 Delivery verification

29. **T29.** Marking a service line as disputed creates a DisputedServiceLine record and a LOOP-1 case with case_type `delivery_discrepancy`.
30. **T30.** Disputed service line renders on statement view with "Disputed" flag.
31. **T31.** Dispute modal dispute reason enum is validated.
32. **T32.** Dispute details free-text max length 500 chars enforced.

### 5.8 Per-anomaly hand-off

33. **T33.** Every anomaly type has a mapped LF-1 template per Section I.1 table.
34. **T34.** Hand-off CTA click routes to LF-1 with prefill data.
35. **T35.** If LF-1 v1.2 has not launched, fallback per Section I.1 applies.
36. **T36.** Hand-off opens a LOOP-1 case with correct type and idempotency.

### 5.9 Integrations

37. **T37.** CORE-1 timeline events written for statement_decoded, statement_pair_created, duplicate_candidate_confirmed, cross_boundary_finding_created, estimated_billing_finding_created, service_line_disputed.
38. **T38.** LOOP-1 case creation succeeds with correct case_type and metadata for each finding class.
39. **T39.** LCA-1 cache-invalidation event received by SD-3 causes cached calculations to invalidate.
40. **T40.** CORE-1's `latest_artefacts.statement` on ProfileAggregate updates after decode.

### 5.10 Persona, editorial, accessibility

41. **T41.** All strings pass PERSONA-1 audit (no cross-persona leaks).
42. **T42.** Adviser tier renders caregiver strings.
43. **T43.** All strings pass editorial QA (Australian English, no em dashes, no banned vocabulary, `$1,847` format, `%` symbol).
44. **T44.** Diff view renders correctly in light, dark, and system modes at WCAG 2.1 AAA contrast.
45. **T45.** Diff view has an accessible single-column alternative for keyboard-only users.
46. **T46.** Diff view screen reader labels correctly announce match candidates.
47. **T47.** All modals (first-run overlay, Care Management explainer, dispute) trap focus and close on Escape.
48. **T48.** Reduced motion respected in diff view animations.

---

## 6. Delivery notes

### 6.1 SD-2 regression status

Delivery notes confirm all eight SD-2 rules pass regression tests and PII redaction and duplicate detection are unchanged.

### 6.2 LF-1 v1.2 launch status

Delivery notes state which LF-1 templates are available and which anomaly hand-offs use fallbacks. Any hidden CTA (no template available) is documented.

### 6.3 Cross-statement diff false-positive rate

Delivery notes state the measured false-positive rate on Phase 0 fixtures. If above 15%, the manual-review UX step is engaged per locked decision 3.

### 6.4 Care Management line detection reliability

Delivery notes state the measured Care Management detection rate on the ten-statement sample per A.10.

### 6.5 Cross-statement diff performance

Delivery notes state the measured diff completion time p95 on Phase 0 fixtures.

### 6.6 Original file retention status

Delivery notes state whether original files are retained. If not, the diff operates on decoded data (which is adequate for v1) and the implication is documented.

### 6.7 Program type detection

Delivery notes report per-program detection accuracy (SAH, HCP, CHSP, unknown) on the audit sample.

### 6.8 Privacy Policy update

Delivery notes state whether solicitor confirmed the existing wording covers SD-3 v1 additions or whether a clarifying update was drafted.

---

## 7. Explicit v2 candidates

Items deferred from SD-3 v1.

1. **Trend view.** Statement history spending trend by stream and service code, month-over-month, on the participant profile page. Deferred to SD-3 v2 in Phase C.
2. **CHSP mode.** Dedicated statement structure, terminology, and service list for CHSP recipients. Deferred to SD-3 v2 in Phase C.
3. **Per-provider Care Management unit conversion.** Some providers may bill units differently than 1 unit = 1 hour. Deferred to v2.
4. **Auto-resolve for disputed service lines.** When a subsequent statement shows a credit for a disputed service, auto-resolve the dispute case. Deferred to v2.
5. **Bulk dispute mode.** Marking multiple service lines as disputed in one action. Deferred to v2.
6. **AI-suggested response to duplicate candidate.** Beyond confidence indicator, an explicit "we recommend confirming this" or "we recommend dismissing this" per candidate. Deferred to v2.
7. **Cross-statement diff across three or more statements.** N-way diff for a participant transitioning across HCP and multiple SAH periods. Deferred to v2.
8. **Provider-level cross-statement pattern detection.** Multiple participants sharing a provider seeing the same anomaly pattern. Aggregation and reporting. Deferred to v2 (privacy-sensitive).
9. **Estimated billing auto-detection tuning per provider.** Learning per provider whether flat-rate patterns are legitimate. Deferred to v2.
10. **PDF export of a cross-statement diff report.** For records or provider correspondence. Deferred to v2.

---

## 8. Change log

- **v1** (this document): initial SD-3 spec covering Phase B scope. Cross-statement diff with duplicate candidates, cross-boundary detection, estimated billing detection, Care Management explainer with units-to-hours conversion, first-run overlay, per-anomaly hand-off to LF-1 v1.2 with v1.1 fallback, delivery verification with LOOP-1 case creation, CORE-1 and LOOP-1 integrations, LCA-1 subscription. Trend view and CHSP mode deferred to SD-3 v2 in Phase C. Forty-eight acceptance tests.

---

**End of SD-3 v1 handoff prompt.**
