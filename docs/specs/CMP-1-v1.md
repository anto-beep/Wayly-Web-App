# CMP-1 v1: Complaints Workflow

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (hard dependency), LF-1 v1.2 (letter templates), LF-2 v1 (send-from-Wayly and correspondence infrastructure), SD-3 v1 (billing evidence source), SDL-1 v1 (attendance evidence source), IC-2 v1 (invoice evidence source), FC-2 v1 (voice notes as evidence with consent), CPR-2 v1 (plan review evidence)
**Predecessor:** None. New tool.
**Successor:** CMP-2 will absorb refinements including AI-assisted evidence summarisation for complaint bundles (subject to ADM disclosure review), multi-participant complaint aggregation for adviser tier, and direct ACQSC portal integration when available. Deferred.
**Legal gate:** solicitor sign-off required per PROGRAM-1 open item 8. This is the most legally sensitive workstream in Phase D.
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

The Wayly tools help users identify problems. Statement Decoder decodes anomalies. Invoice Checker flags billing errors. Care Plan Reviewer surfaces plan gaps. Family Coordinator captures the participant's own voice. Attendance Log records service delivery discrepancies. Contribution Estimator reconciles what was estimated against what was billed. Each tool closes a small loop.

What happens when the small loop cannot resolve the issue? A billing dispute that the provider refuses to correct. A pattern of care quality failures the provider does not address. A worker behaviour concern the provider dismisses. Elder abuse the provider is complicit in.

The formal complaints pathway exists for exactly these situations. Under the Aged Care Act 2024, complaints escalate through defined stages: internal complaint to the provider, escalation to provider senior management or governance, external referral to the Aged Care Quality and Safety Commission, further escalation to the Commonwealth Ombudsman if ACQSC does not resolve, and appeals in defined circumstances. Elder abuse concerns have parallel pathways involving law enforcement and elder abuse advocacy organisations. Users in aged care community forums repeatedly describe the pathway as opaque, intimidating, and time-consuming. Many users abandon complaints not because the underlying issue was resolved but because the process was too hard.

CMP-1 v1 is the workflow that guides users through the formal complaint pathway. It supports six complaint types (billing dispute, care quality, worker behaviour, service delivery failure, care plan dispute, communication breakdown) plus special handling for elder abuse. It stages complaints through the pathway (internal, senior, ACQSC, Ombudsman, appeals) with clear tracking. It compiles evidence bundles from every relevant Wayly tool. It supports anonymous ACQSC submissions where appropriate. It coordinates with LF-2 v1's send-from-Wayly and correspondence infrastructure. It tracks outcomes and follow-up.

CMP-1 v1 does not represent the user in complaints. Wayly still is not the user's legal representative or advocate. Every complaint letter and submission uses "I am writing" or "I am filing" framing. Wayly prepares the materials; the user files. The solicitor package (Section P) confirms this distinction and Wayly's non-representational posture in the complaints context.

CMP-1 v1 is a P1 workstream in PROGRAM-1 Phase D. It ships after LF-2 v1 has stabilised and after its own solicitor sign-off is received.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model
- **Section C:** Persistence surface
- **Section D:** Internal APIs
- **Section E:** Complaints workflow overview surface
- **Section F:** New complaint wizard
- **Section G:** Stage management and escalation
- **Section H:** Evidence bundle
- **Section I:** ACQSC referral pathway
- **Section J:** Ombudsman escalation pathway
- **Section K:** Elder abuse special handling
- **Section L:** Complaint outcome tracking
- **Section M:** Integration seams
- **Section N:** Persona-aware rendering
- **Section O:** Accessibility, dark mode, design tokens
- **Section P:** Solicitor package and legal gate
- **Section Q:** Privacy Policy amendment

Six risks Emergent must surface in delivery notes on first commit:

1. **Solicitor sign-off is mandatory before user-visible launch.** CMP-1 v1 is the most legally sensitive workstream in Phase D. Ship behind a feature flag until the full solicitor package (Section P) is signed off. Alternative posture per Section P.3 if scope is limited.
2. **Provider defamation risk is real.** Complaint content, especially at ACQSC and Ombudsman stages, contains allegations about a provider. Phrasing must be factual, not conclusory. Templates use "the provider [did X]" not "the provider [is corrupt]." Legal review confirms template language.
3. **Elder abuse pathway distinctions from complaints pathway.** Elder abuse concerns may need law enforcement referral, not (or in addition to) ACQSC. The solicitor package confirms Wayly's role and posture when a user's complaint content indicates possible elder abuse.
4. **Evidence bundle content ownership.** Evidence from FC-2 voice notes (particularly private or shared-with-household ones) requires explicit user consent before inclusion in a complaint bundle. Automated inclusion without consent breaches participant control.
5. **ACQSC and Ombudsman pathway accuracy.** The pathway content and processes must be accurate at launch. Legislative changes to complaint procedures are LCA-1 subscribable events; CMP-1 v1 must update its pathway content when triggered.
6. **Anonymous complaint feasibility.** ACQSC accepts anonymous complaints but with reduced investigative capability. The solicitor package confirms Wayly's role in facilitating anonymous complaints and how anonymity is preserved through the evidence bundle.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/CMP-1-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 Formal complaint pathway inventory

Confirm the current formal complaint pathways under the Aged Care Act 2024 and related instruments:
- Internal provider complaints procedure (provider-specific)
- ACQSC complaints handling process (regulatory)
- Commonwealth Ombudsman referrals (executive review)
- Appeals mechanisms where applicable
- Elder abuse parallel pathways (law enforcement, OPAN, Elder Abuse Helpline)

Source primary documents from ACQSC website, Commonwealth Ombudsman guidance, and Aged Care Rules 2025. Record process descriptions, expected timelines, submission requirements.

### A.2 LOOP-1 case types

Confirm LOOP-1 registry accommodates cases that CMP-1 will link:
- Complaint cases (new case_type: `formal_complaint`)
- Existing cases (statement_anomaly, plan_finding, invoice_error, delivery_discrepancy, etc.) can be promoted to complaints

### A.3 LF-2 v1 shipping status

Confirm LF-2 v1 has shipped with solicitor sign-off. CMP-1 v1 depends on LF-2 v1's send-from-Wayly infrastructure and response inbox for complaint correspondence.

### A.4 Evidence source integration

Confirm each evidence source tool's data access API:
- SD-3 v1 decoded statements
- SDL-1 v1 attendance records with evidence attachments
- IC-2 v1 invoices and correlations
- FC-2 v1 voice notes (with visibility filtering)
- CPR-2 v1 plan reviews
- LF-1 v1.2 / LF-2 v1 correspondence log
- LOOP-1 cases

### A.5 Provider senior contact directory

Confirm existing provider directory (from PPC-1 v2 or elsewhere) includes senior management contact details. If not, Phase 0 workstream includes acquiring this directory for the major providers.

### A.6 ACQSC contact and submission channels

Confirm current ACQSC submission channels:
- ACQSC portal (online form)
- Phone (1800 951 822)
- Email
- Postal
- Face-to-face at ACQSC offices

Wayly prepares materials for user submission through the user's preferred channel.

### A.7 Ombudsman contact and submission channels

Confirm current Commonwealth Ombudsman submission channels:
- Ombudsman online form
- Phone (1300 362 072)
- Email
- Postal

Wayly prepares materials for user submission.

### A.8 Elder abuse pathway detail

Confirm elder abuse pathway detail:
- ACQSC as regulator has jurisdiction
- Elder Abuse Helpline (1800 353 374) for advice
- OPAN (1800 700 600) for advocacy
- State police for criminal matters
- 1800RESPECT for family and domestic violence support
- State-specific bodies (some jurisdictions have specific elder abuse commissioners)

### A.9 Australian data residency

Confirm ap-southeast-2 for all new CMP-1 collections.

### A.10 Solicitor package status

Confirm solicitor package (Section P) has been prepared and sent. Report expected timeframe.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model

### B.1 Complaint

The primary entity.

```
Complaint {
  id: UUID
  participant_id: UUID (foreign key to Participant per CORE-1)
  household_id: UUID (denormalised)
  initiated_by_user_id: UUID

  // Complaint characterisation
  complaint_type: enum {
    billing_dispute,
    care_quality,
    worker_behaviour,
    service_delivery_failure,
    care_plan_dispute,
    communication_breakdown,
    elder_abuse,
    other
  }
  complaint_type_notes: string | null

  severity: enum { informational, minor, serious, critical_urgent }

  // Provider details
  provider_name: string
  provider_contact_details: object  // Name, email, phone, address

  // Subject matter
  subject_matter_summary: string  // User's own summary, max 3000 chars
  incident_start_date: date | null
  incident_end_date: date | null
  is_ongoing: boolean

  // Desired outcome
  desired_outcome: enum {
    correction_of_billing,
    correction_of_care_quality,
    change_of_worker,
    change_of_care_plan,
    formal_apology,
    financial_compensation,
    referral_to_regulator,
    other
  }
  desired_outcome_notes: string | null

  // Stage tracking
  current_stage: enum {
    drafting,
    stage_1_internal_provider,
    stage_2_provider_senior,
    stage_3_acqsc_referral,
    stage_4_ombudsman_referral,
    stage_5_appeals,
    closed_resolved,
    closed_abandoned
  }
  stage_history: [
    {
      stage: enum
      entered_at: timestamp
      exited_at: timestamp | null
      outcome_at_exit: enum {
        resolved_satisfied,
        resolved_unsatisfied,
        no_response,
        referred_to_next_stage,
        escalated_by_user,
        abandoned_by_user,
        awaiting_action
      } | null
      exit_notes: string | null
      correspondence_at_stage: UUID[]  // Linked LF letters and responses
    }
  ]

  // Overall resolution
  final_resolution: enum {
    pending,
    resolved_satisfied,
    resolved_partially_satisfied,
    resolved_unsatisfied,
    abandoned,
    closed_no_response,
    referred_elsewhere
  } | null
  final_resolution_notes: string | null
  final_resolution_date: date | null

  // Anonymous option
  is_anonymous_acqsc_submission: boolean
  anonymity_preserved_in_bundle: boolean

  // LOOP-1 case linkage
  primary_case_id: UUID  // The primary LOOP-1 case
  related_case_ids: UUID[]  // Other cases promoted or referenced

  // Evidence bundle
  evidence_bundle_id: UUID | null

  // Sensitive content
  contains_elder_abuse_indicators: boolean
  contains_immediate_safety_concerns: boolean

  // Metadata
  created_at: timestamp
  updated_at: timestamp
  last_activity_at: timestamp
  data_residency: string (must be "ap-southeast-2")
}
```

### B.2 Complaint evidence bundle

New collection for aggregated evidence.

```
ComplaintEvidenceBundle {
  id: UUID
  complaint_id: UUID
  participant_id: UUID

  // Evidence items with consent tracking
  evidence_items: [
    {
      id: UUID
      source_type: enum {
        loop_case,
        decoded_statement,
        attendance_record,
        attendance_evidence_attachment,
        invoice,
        invoice_bank_match,
        correspondence_letter,
        correspondence_response,
        voice_note,
        plan_review,
        rate_change_alert,
        contribution_reconciliation,
        external_document
      }
      source_id: UUID | null
      external_document_url: string | null

      // Content summary (not full content)
      title: string
      summary: string
      date_of_source: date | null

      // Inclusion tracking
      proposed_for_inclusion: boolean
      user_confirmed_for_inclusion: boolean
      requires_participant_consent: boolean  // True for voice notes
      participant_consent_recorded_at: timestamp | null

      added_by_user_id: UUID
      added_at: timestamp

      // For upload
      uploaded_file_storage_url: string | null
      uploaded_file_hash: string | null
    }
  ]

  // Bundle generation
  bundle_pdf_generated: boolean
  bundle_pdf_url: string | null  // Signed URL, 15-minute expiry
  bundle_pdf_generated_at: timestamp | null
  bundle_pdf_hash: string | null

  // Anonymous preparation
  identifying_info_removed_for_anonymous: boolean
  anonymous_bundle_pdf_url: string | null

  created_at: timestamp
  updated_at: timestamp
  data_residency: string
}
```

### B.3 Complaint template

Similar to LF-1's template structure but for complaint content specifically.

```
ComplaintTemplate {
  slug: string
  complaint_type: enum  // Matches Complaint complaint_type
  target_stage: enum  // Which stage this template is for
  format: enum { letter, submission_form, oral_script }

  persona_aware_body_tokens: {
    caregiver: string
    participant_self: string
  }

  required_placeholders: string[]
  optional_placeholders: string[]

  requires_evidence_bundle: boolean
  requires_solicitor_review_before_use: boolean  // For sensitive templates
}
```

### B.4 Stage escalation event

Ephemeral event tracking when a stage transition is initiated.

```
StageEscalationEvent {
  id: UUID
  complaint_id: UUID
  from_stage: enum
  to_stage: enum
  initiated_by_user_id: UUID
  reason: enum {
    no_response_from_current_stage,
    inadequate_response_from_current_stage,
    user_choice_to_escalate,
    time_based_escalation,
    other
  }
  reason_notes: string | null
  initiated_at: timestamp
  data_residency: string
}
```

---

## Section C. Persistence surface

### C.1 New collections

- `complaints` per B.1, indexed on `participant_id, current_stage`, `provider_name, complaint_type`
- `complaint_evidence_bundles` per B.2, indexed on `complaint_id`
- `stage_escalation_events` per B.4, indexed on `complaint_id, initiated_at DESC`
- `complaint_templates_registry` per B.3 (versioned like LF-1 templates)

All in MongoDB Atlas ap-southeast-2.

### C.2 Retention

- Complaints: retained for life of participant
- Evidence bundles: retained per active complaint plus 7 years after closure (aligned with typical statute of limitations)
- Stage escalation events: retained for life of participant

### C.3 Access control

- Complaint records accessible to primary caregiver and participant
- View-only role members can view but not submit complaint content
- Anonymous submissions have restricted metadata visibility

### C.4 Bundle PDF storage

Bundle PDFs generated on demand, stored temporarily (30-day expiry for the file, but generation metadata retained per B.2). Users regenerate as needed.

### C.5 Solicitor-review-required templates

Templates flagged `requires_solicitor_review_before_use: true` are held in a separate registry state and cannot be used until Antony marks them as solicitor-reviewed.

---

## Section D. Internal APIs

### D.1 Complaint CRUD

```
POST /internal/participants/[id]/complaints
Body: {
  complaint_type,
  severity,
  provider_name,
  provider_contact_details,
  subject_matter_summary,
  desired_outcome,
  initiated_by_user_id,
  ...B.1 fields
}
Returns: Complaint in drafting stage
```

```
GET /internal/participants/[id]/complaints?stage=[filter]&severity=[filter]&provider=[filter]
Returns: paginated Complaint[]
```

```
GET /internal/complaints/[id]
Returns: Complaint with populated evidence bundle summary and correspondence links
```

```
PATCH /internal/complaints/[id]
Body: partial fields
Returns: updated Complaint
```

### D.2 Stage transitions

```
POST /internal/complaints/[id]/advance-stage
Body: {
  from_stage,
  to_stage,
  reason,
  reason_notes,
  actor_user_id
}
Returns: updated Complaint with new stage_history entry
```

Validates stage transition is legal (per Section G rules).

```
POST /internal/complaints/[id]/close
Body: {
  final_resolution,
  final_resolution_notes,
  actor_user_id
}
Returns: updated Complaint with current_stage: closed_resolved or closed_abandoned
```

### D.3 Evidence bundle management

```
POST /internal/complaints/[id]/evidence-bundle
Returns: ComplaintEvidenceBundle initialized (empty)
```

```
POST /internal/evidence-bundles/[id]/propose-evidence
Body: {
  source_type, source_id, actor_user_id
}
Returns: evidence item added to bundle in `proposed_for_inclusion: true, user_confirmed_for_inclusion: false` state
```

```
GET /internal/complaints/[id]/evidence-proposals
Returns: list of proposed evidence items from all Wayly tools relevant to the complaint
```

Runs across integrated tools and proposes evidence matching the complaint type and dates.

```
POST /internal/evidence-items/[id]/confirm-inclusion
Body: {
  user_confirmed_for_inclusion: boolean,
  requires_participant_consent (if voice note),
  actor_user_id
}
Returns: updated evidence item
```

```
POST /internal/evidence-items/[id]/record-participant-consent
Body: { consent_given: boolean, consenter_user_id }
```

For voice notes and other participant-owned evidence.

```
POST /internal/complaints/[id]/evidence-bundle/generate-pdf
Body: { is_anonymous_version: boolean, actor_user_id }
Returns: { bundle_pdf_url (signed, 15-minute expiry), bundle_pdf_hash }
```

### D.4 Complaint templates

```
GET /internal/complaint-templates?complaint_type=[filter]&target_stage=[filter]
Returns: ComplaintTemplate[] excluding those requiring solicitor review that haven't been approved
```

### D.5 Submission tracking

```
POST /internal/complaints/[id]/submissions
Body: {
  stage,
  submission_channel: enum { acqsc_portal | acqsc_phone | acqsc_email | ombudsman_portal | ombudsman_email | user_direct },
  submission_reference: string,  // If ACQSC assigns a reference
  submitted_at,
  submitter_user_id
}
Returns: updated Complaint with submission recorded in stage_history
```

### D.6 Elder abuse handling

```
POST /internal/complaints/[id]/mark-elder-abuse-concern
Body: {
  concern_type: enum { financial, physical, emotional, sexual, neglect, other },
  concern_notes,
  actor_user_id
}
Returns: updated Complaint with elder_abuse indicators and immediate resource offerings
```

Also fires resource panel per Section K.

### D.7 Authorisation

All endpoints scoped by household membership per CORE-1 pattern. Elder abuse concerns have additional access considerations per Section K.

---

## Section E. Complaints workflow overview surface

### E.1 Route

`/app/participants/[id]/complaints`

Also embedded as a "Complaints" card on the participant profile page (CORE-1) with active complaint count.

### E.2 Layout

Two sections:

**Active complaints**
- List of complaints not in final resolution state
- Sort by current_stage, severity, or last_activity_at
- Filter by stage, provider, type

**Complaints history**
- Closed and resolved complaints
- Chronological with resolution outcome

**New complaint button**
- Prominent CTA to start new complaint wizard

### E.3 Complaint row rendering

Each row shows:
- Complaint type icon
- Provider name
- Subject matter summary (first 100 chars)
- Current stage pill
- Days at current stage
- Severity indicator
- Last activity date

Click into complaint detail.

### E.4 Complaint detail

Route: `/app/participants/[id]/complaints/[complaint_id]`

- Complaint summary (all key fields)
- Stage history timeline
- Evidence bundle summary
- Linked correspondence (letters and responses)
- Cross-tool case links
- Actions based on current stage

### E.5 Guidance sidebar

Persona-aware guidance panel accompanies the workflow:
- Explains current stage
- Sets realistic expectations for outcome and timeline
- Offers hand-off to LF-1 or LF-2 for next-stage correspondence
- Elder abuse indicators, if present, redirect to appropriate pathway

### E.6 Empty state

Persona-aware:
- Caregiver: "No complaints yet. If something goes wrong that can't be resolved informally, you can start a formal complaint here to track it through the process."
- Participant self: same framing with "I" pronouns.

---

## Section F. New complaint wizard

### F.1 Route

`/app/participants/[id]/complaints/new`

Multi-step wizard.

### F.2 Step 1: Complaint type selection

Presented as cards with plain-language descriptions:

- Billing dispute
- Care quality concern
- Worker behaviour issue
- Service delivery failure
- Care plan dispute
- Communication breakdown
- Elder abuse (with special handling flag per Section K)
- Other

For each, a brief description of what fits into the category and what pathway typically applies.

### F.3 Step 2: Severity assessment

- Informational (I want to raise this but it's not urgent)
- Minor (needs addressing but no immediate impact)
- Serious (material impact on the participant)
- Critical or urgent (immediate safety or wellbeing at risk)

Critical or urgent selection triggers immediate elder abuse pathway if type suggests abuse. Otherwise, prompt to consider whether to start directly at Stage 2 or Stage 3.

### F.4 Step 3: Provider identification

- Provider dropdown (from PPC-1 v2 provider directory)
- Alternate: enter new provider details
- Provider contact details autofilled from directory or entered

### F.5 Step 4: Subject matter

- Structured input: incident dates, involved workers, service types affected
- Free-text summary (max 3000 chars) of what happened
- Prompt to focus on facts (dates, amounts, actions) rather than emotional language
- Content scanned per FC-2 sensitive content posture; resources offered if flagged

### F.6 Step 5: Desired outcome

- Structured selection of desired outcome
- Free-text notes
- Realistic expectations messaging: "Complaint processes take time. Typical timeframes at each stage: Stage 1 (internal) 14-30 days, Stage 3 (ACQSC) 30-90 days, Stage 4 (Ombudsman) 60-180 days."

### F.7 Step 6: Evidence gathering proposal

- Wayly proposes evidence from every integrated tool matching the complaint context
- Each proposed item has:
  - Source label (Wayly Statement Decoder, SDL Attendance Log, etc.)
  - Summary
  - Date
  - Include or exclude toggle
  - Participant consent required indicator (for voice notes)

- User confirms which evidence to include
- Additional external evidence can be uploaded (receipts, external correspondence, photos)

### F.8 Step 7: Starting stage selection

- Recommended stage based on complaint type and severity
- Options with plain-language explanation:
  - Start at Stage 1 (internal provider complaint) - recommended for most
  - Start at Stage 2 (provider senior management) - if prior Stage 1 informal correspondence unsuccessful
  - Start at Stage 3 (ACQSC direct referral) - for serious care quality, elder abuse, or after failed provider engagement
  - Emergency pathway (elder abuse, immediate safety) - Section K special handling

### F.9 Step 8: Draft complaint content

- Complaint template selected based on type and starting stage
- Persona-aware template body pre-populated
- User edits and personalises
- Preview

### F.10 Step 9: Submission channel

- Send via LF-2 v1 send-from-Wayly (if starting at internal stage or ACQSC email)
- Export as PDF for user to submit through ACQSC portal
- Print for postal submission
- Copy text for phone conversation

### F.11 Step 10: Confirmation and creation

- Summary of complaint details
- Estimated timeline
- Confirmation button
- Complaint created with stage set per Step 8, correspondence sent per Step 9, LOOP-1 case opened

---

## Section G. Stage management and escalation

### G.1 Stage transition rules

Valid transitions:

- drafting → any stage
- stage_1_internal_provider → stage_2_provider_senior, stage_3_acqsc_referral, closed_resolved, closed_abandoned
- stage_2_provider_senior → stage_3_acqsc_referral, closed_resolved, closed_abandoned
- stage_3_acqsc_referral → stage_4_ombudsman_referral, closed_resolved, closed_abandoned
- stage_4_ombudsman_referral → stage_5_appeals, closed_resolved, closed_abandoned
- stage_5_appeals → closed_resolved, closed_abandoned

Regressive transitions (back to earlier stage) require explicit reason and confirmation.

Elder abuse complaints may skip stages per Section K.

### G.2 Timeline expectations

For each stage, expected response timelines:
- Stage 1 (internal): 14-30 days
- Stage 2 (senior): 14-30 days
- Stage 3 (ACQSC): 30-90 days
- Stage 4 (Ombudsman): 60-180 days
- Stage 5 (appeals): variable

Timeline exceeded triggers escalation offer per LF-2 v1's timeline enforcement pattern.

### G.3 Stage advancement UX

From complaint detail, user sees:
- Current stage and days at stage
- Expected timeline
- Actions available at this stage
- "Escalate to next stage" button (with pre-flight check that escalation is appropriate)

Pre-flight check:
- Has current stage received adequate time?
- Has current stage received a response?
- Is escalation justified by response inadequacy or non-response?

If pre-flight fails, tool suggests reconsideration but does not block user.

### G.4 Cross-tool integration for escalation

Escalation to Stage 3 (ACQSC) triggers:
- Evidence bundle generation per Section H
- LF-2 v1 correspondence to ACQSC using escalation_acqsc_referral template
- LOOP-1 case status update
- CORE-1 timeline event

Escalation to Stage 4 (Ombudsman) triggers similar flow with Ombudsman template.

### G.5 Regressive stage transitions

Users can move back to a prior stage in specific scenarios:
- ACQSC referred back to provider for resolution
- Ombudsman referred back to ACQSC

Regressive transitions require confirmation and explicit reason.

### G.6 Closure

Complaints close with a final resolution outcome:
- Resolved satisfied
- Resolved partially satisfied
- Resolved unsatisfied
- Abandoned
- Closed no response
- Referred elsewhere (typically to another regulator or authority)

Resolution notes captured. Complaint moves to history view.

---

## Section H. Evidence bundle

### H.1 Bundle purpose

The evidence bundle aggregates all relevant material into a single package that can be shared with:
- The provider for Stage 1 or 2
- ACQSC for Stage 3
- The Ombudsman for Stage 4
- Any subsequent authority

The bundle establishes the factual basis of the complaint.

### H.2 Evidence source proposal

When a complaint is created, CMP-1 v1 automatically proposes evidence based on:
- Complaint type
- Provider identified
- Incident dates
- Participant

Proposals include:

For billing dispute:
- Related invoices from IC-1 or IC-2
- Related statements from SD-3
- Correlation mismatches from IC-2
- Rate change alerts from IC-2
- Related LOOP-1 cases
- Correspondence to date

For care quality:
- Attendance records from SDL-1 with evidence attachments
- Related LOOP-1 cases (delivery_discrepancy)
- Voice notes from FC-2 (with consent)
- Care plan reviews from CPR-2

For worker behaviour:
- Attendance records with specific worker mentions
- Voice notes with consent
- Related correspondence

For service delivery failure:
- Attendance records with `provider_no_show` or `confirmed_missed` status
- Related SDL-1 evidence attachments
- Reconciliation showing charges for non-delivered services

For care plan dispute:
- CPR-2 plan review findings
- CPR-2 participant voice check results (with consent)
- Related goal ledger entries
- Correspondence with provider re plan

For communication breakdown:
- LF-1 / LF-2 correspondence log
- Response outcomes and timeframes

For elder abuse (special handling per Section K):
- FC-2 voice notes with sensitive content flag (with consent)
- SDL-1 attendance evidence
- Related patterns detected in SDL-1

### H.3 User confirms each item

Every proposed item requires user confirmation before inclusion. This prevents automatic inclusion of sensitive content the user did not authorise.

For voice notes with sensitive content, additional participant consent recorded per D.3.

### H.4 External evidence addition

Users can add external evidence:
- Uploaded documents (PDFs, images)
- Written accounts
- Third-party documentation

Stored in same manner as SDL-1 evidence attachments (S3 Sydney, encrypted, signed URL).

### H.5 Bundle PDF generation

Bundle PDF includes:
- Cover page: complaint summary, participant details (or anonymised), submitted by, date
- Section per evidence source type
- Chronological timeline of events
- Full evidence attachments with references
- Correspondence log
- Summary of prior stages if progressing beyond Stage 1

Layout: professional, factual, plain language. Not persuasive; evidentiary.

### H.6 Anonymous bundle preparation

For anonymous ACQSC submissions:
- Identifying participant details replaced with case reference (e.g. "AC-Complaint-2026-12345")
- Household member details minimised
- Voice note attribution generalised ("The participant stated..." rather than named)
- Provider details preserved (necessary for investigation)

Anonymous option flagged clearly. Users understand ACQSC may still ask for identification if investigating.

### H.7 Bundle version control

Users can update the bundle before each stage escalation. Each version snapshotted. Prior versions accessible.

### H.8 Consent tracking

For every evidence item requiring participant consent:
- Consent recorded with timestamp and consenter user ID
- Consent revocable at any time until submission

---

## Section I. ACQSC referral pathway

### I.1 Pathway description

At Stage 3, the complaint moves from provider engagement to regulatory referral.

The ACQSC receives complaints via:
- Online portal
- Phone (1800 951 822)
- Email
- Postal
- Face-to-face at ACQSC offices

CMP-1 v1 prepares materials for user submission through their preferred channel.

### I.2 ACQSC referral surface

Route: `/app/complaints/[id]/acqsc-referral`

Shows:
- Overview of ACQSC process
- Expected timeline (30-90 days for initial response)
- Anonymous submission option with explanation
- Materials to be submitted (auto-populated from evidence bundle)
- Submission channels

### I.3 Materials preparation

Materials include:
- Formal complaint letter (from LF-1 v1.2 / LF-2 v1 escalation_acqsc_referral template)
- Evidence bundle PDF
- Timeline document showing prior stages and outcomes

All prepared and downloadable as a single ZIP or accessible individually.

### I.4 Submission channel selection

User selects submission channel:
- ACQSC portal (Wayly provides guidance; user submits through their own portal access)
- Email (LF-2 v1 send-from-Wayly if content and consent align)
- Phone (Wayly provides call script and summary)
- Postal (Wayly generates print-ready package)

### I.5 Submission confirmation

Once submitted, user records:
- Submission channel used
- Submission date
- ACQSC reference number (if assigned)

Complaint status updates. Timeline enforcement activates for ACQSC's expected response window.

### I.6 ACQSC response handling

Responses from ACQSC:
- May come to user directly (email, postal)
- May come to LF-2 v1's reply-to inbox if email submission was via send-from-Wayly

Response outcome classified per LF-2 v1 patterns:
- ACQSC has accepted for investigation
- ACQSC requires additional information
- ACQSC has referred back to provider
- ACQSC has referred to another authority
- ACQSC has resolved the complaint
- Other

User confirms classification and takes next steps.

### I.7 Anonymous ACQSC submission

Users can choose anonymous submission:
- Evidence bundle prepared with identifying details minimised
- Complaint letter uses generic case reference
- Wayly's role in preparing is not disclosed to ACQSC in the bundle
- User understands ACQSC's investigative capability may be reduced

Solicitor package confirms Wayly's role in facilitating anonymous complaints.

---

## Section J. Ombudsman escalation pathway

### J.1 When Ombudsman escalation is appropriate

Ombudsman escalation is available when:
- ACQSC has resolved but user is unsatisfied with resolution
- ACQSC has failed to resolve within reasonable timeframe (typically 90+ days)
- Procedural failure in ACQSC handling

Not appropriate when:
- ACQSC investigation is still active
- Complaint has not been through Stage 3

### J.2 Ombudsman referral surface

Route: `/app/complaints/[id]/ombudsman-referral`

Similar structure to ACQSC referral surface but with Ombudsman-specific pathway detail.

### J.3 Materials preparation

Materials for Ombudsman include:
- All Stage 3 materials
- ACQSC's response
- Explanation of why ACQSC's handling was inadequate
- Ombudsman-specific complaint letter (LF-1 v1.2 / LF-2 v1 escalation_ombudsman_referral template)

### J.4 Submission channels

- Ombudsman online form
- Phone (1300 362 072)
- Email
- Postal

### J.5 Ombudsman response handling

Responses classified similarly to ACQSC. Timeline is longer (60-180 days).

Ombudsman's role:
- Review the process, not the substantive decision
- Determine if procedural failure occurred
- Refer back to ACQSC with recommendations if procedural failure identified
- Confirm ACQSC's handling if no failure identified

### J.6 Post-Ombudsman appeals

Rare cases where formal appeals mechanisms are available. Section G.5 stage_5_appeals covers these.

Solicitor package confirms Wayly's role in appeals context (generally: continue to prepare materials; do not represent).

---

## Section K. Elder abuse special handling

### K.1 Elevated pathway

Elder abuse complaints have distinct considerations:

- May require immediate resource offering (Elder Abuse Helpline, 1800RESPECT, police)
- May bypass provider engagement entirely
- May involve law enforcement referral in addition to or instead of ACQSC
- Sensitive content posture per FC-2 and SDL-1 (no automatic disclosure)

### K.2 Elder abuse trigger flow

If complaint type is `elder_abuse` OR if content in another complaint type triggers elder abuse indicators (per FC-2 sensitive content detection):

- Immediate resource panel:
  - Elder Abuse Helpline: 1800 353 374
  - OPAN (Older Persons Advocacy Network): 1800 700 600
  - 1800RESPECT: 1800 737 732
  - Lifeline: 13 11 14
  - Police (000 for emergency, non-emergency numbers listed by state)

- Elevated pathway options:
  - Continue with ACQSC pathway
  - Direct police report (for criminal matters)
  - Elder Abuse Helpline advice first (recommended for uncertain cases)
  - Contact elder abuse advocacy organisation

- Immediate safety assessment: "Is the participant currently safe? If not, please call 000 immediately."

### K.3 No automatic disclosure

Consistent with FC-2 and SDL-1 posture:
- Elder abuse indicators do not trigger automatic disclosure to caregivers, providers, or authorities
- User controls all escalation
- Wayly offers resources, not directives

Solicitor package reconfirms this posture in the complaints context specifically.

### K.4 Sensitive content in complaint

Content scanning during complaint drafting per FC-2 posture. Flagged content triggers resource offering and elder abuse pathway option.

### K.5 Bundle preparation for elder abuse

For elder abuse complaints, evidence bundle preparation has heightened attention:
- Voice notes from FC-2 with sensitive flag require explicit participant consent (or verified caregiver consent on behalf if participant unable)
- Evidence from SDL-1 pattern detection (repeated worker substitution, concentrated no-shows) marked with source lineage
- Sensitive framing throughout

### K.6 Confidentiality considerations

Elder abuse pathway considers:
- Confidentiality from potentially abusive family members (in the case of familial abuse)
- Confidentiality from potentially abusive providers
- Anonymous ACQSC submission option prominently offered

### K.7 Mandatory reporting reconfirmed

Per FC-2 Section N.5, Wayly does not have mandatory reporting obligation as an information platform. Solicitor package reconfirms this in CMP-1 context specifically.

### K.8 Elder abuse pathway tone

Copy tone throughout:
- Factual, not clinical
- Empathetic but not condescending
- Respectful of participant agency
- Non-judgmental about the situation
- Clear about resources

---

## Section L. Complaint outcome tracking

### L.1 Provider response time tracking

For each stage, provider (or authority) response time is measured against expected timeline:
- Response received within expected: on-time
- Response received after expected: delayed
- No response received in expected window: escalation eligible

### L.2 Resolution tracking

At complaint closure:
- Final resolution outcome
- Resolution notes
- Resolution date
- Overall duration from complaint creation to resolution

### L.3 User satisfaction rating

At closure, user can rate satisfaction (optional):
- Very satisfied
- Satisfied
- Neutral
- Unsatisfied
- Very unsatisfied

Rating tracked for analytics and pathway improvement.

### L.4 Aggregate outcome analytics

Anonymous aggregate outcome data:
- Resolution rate by complaint type
- Average duration by stage
- Escalation rate at each stage

Used for tool improvement, not shared externally without consent framework.

### L.5 Post-resolution follow-up

Optional user follow-up:
- Would you like to update this complaint's outcome in 3 months?
- Would you like to open a related complaint if a similar issue arises?

---

## Section M. Integration seams

### M.1 CORE-1

- Read: participant profile, household membership, provider directory
- Write: timeline events for `complaint_created`, `complaint_stage_advanced`, `evidence_bundle_generated`, `complaint_closed`, `elder_abuse_pathway_offered`
- Update: `latest_artefacts.complaint` on profile aggregate

### M.2 LOOP-1

- Write: create formal_complaint cases; promote existing cases to complaints
- Read: cases for cross-tool evidence proposal

### M.3 LF-1 v1.2 and LF-2 v1

- Consume: escalation templates (escalation_provider_senior_manager, escalation_acqsc_referral, escalation_ombudsman_referral)
- Send: complaint letters via LF-2 v1 send-from-Wayly
- Read: correspondence responses via LF-2 v1 inbox

### M.4 SD-3 v1

- Read: decoded statements as evidence
- Read: anomalies, cross-boundary findings, estimated billing findings

### M.5 SDL-1 v1

- Read: attendance records with evidence attachments as evidence
- Read: pattern detections as elevated evidence

### M.6 IC-2 v1

- Read: invoices, correlations, rate change alerts as evidence
- Coordinate: unpaid invoice cases can be promoted to complaints

### M.7 FC-2 v1

- Read: shared voice notes with consent (per FC-2 visibility model)
- Coordinate: voice notes not automatically included; explicit inclusion required

### M.8 CPR-2 v1

- Read: plan review findings and participant voice check outcomes as evidence

### M.9 CE-3 v1

- Read: contribution reconciliations as evidence for billing complaints

### M.10 LCA-1

- Subscribe: legislative changes to complaint procedures update pathway content
- Notify users of active complaints when procedure changes affect them

### M.11 PPC-1 v2

- Read: provider directory for provider contact details

---

## Section N. Persona-aware rendering

### N.1 All content persona-aware

Every user-facing string in CMP-1 v1 is authored in caregiver and participant-self versions per PERSONA-1.

### N.2 Participant-first for elder abuse

Elder abuse pathway is participant-first. Resource offerings speak to the participant directly regardless of who initiates the complaint.

### N.3 Tone throughout

- Complaint drafting: factual, structured, prompts for specific dates and amounts
- Escalation offers: neutral, describing options
- Elder abuse: sensitive, respectful, resource-focused
- Anonymous option: matter-of-fact, explains trade-offs

### N.4 Non-conclusory language

Complaint templates use factual, non-conclusory language:
- "The provider billed $X on [date] for [service]"
- Not: "The provider defrauded the participant"
- "I have not received a response to my letter of [date]"
- Not: "The provider is ignoring me"

Editorial review confirms language throughout.

### N.5 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

---

## Section O. Accessibility, dark mode, design tokens

### O.1 UXF-1 v3

All new components use UXF-1 v3 tokens.

### O.2 Dark mode

All new surfaces render in light, dark, and system modes.

### O.3 WCAG 2.1 AAA

Standard.

### O.4 Wizard accessibility

Multi-step wizard:
- Step indicator with current step announced
- Back navigation preserves data
- Keyboard navigation throughout
- Form validation announced

### O.5 Evidence bundle preview accessibility

- PDF preview with accessible alternative view
- Table of evidence items keyboard navigable
- Consent checkboxes labelled clearly

### O.6 Elder abuse pathway accessibility

- Emergency contact numbers prominent and easily readable
- Larger tap targets for phone number links
- Multiple format options (large text, high contrast)

---

## Section P. Solicitor package and legal gate

### P.1 Questions

This is the most substantial solicitor package in the program.

1. **Wayly's non-representational posture.** Preparing complaint materials, evidence bundles, and submission packages. Does this create representational status? What disclosures are required?

2. **Provider defamation risk.** Complaint content may contain allegations. Template language uses factual, non-conclusory framing per Section N.4. Is this sufficient? Are there additional protections needed?

3. **ACQSC referral facilitation.** Wayly compiles and prepares materials for ACQSC submission. Wayly does not submit on behalf. Is Wayly's role appropriate? Does it create any regulatory obligation for Wayly?

4. **Anonymous complaint facilitation.** Wayly supports anonymous ACQSC submissions. Is Wayly's role in preserving anonymity appropriate? Does Wayly have any obligation to preserve identity information if ACQSC investigates?

5. **Ombudsman referral facilitation.** Similar questions.

6. **Elder abuse pathway.** Wayly's non-automatic-disclosure posture in FC-2 and SDL-1 extended to CMP-1. Reconfirm this posture legally sound in complaints context. Are there scenarios where Wayly's role changes (e.g. imminent safety risk)?

7. **Mandatory reporting reconfirmed.** Per FC-2 Section N.5, Wayly is not a mandatory reporter as an information platform. Reconfirm in CMP-1 context.

8. **Complaint content sensitivity.** Complaint content contains sensitive personal information about the participant, family members, workers, providers. Is retention appropriate? Are there additional protections?

9. **Evidence chain of custody.** Evidence from SDL-1 and other tools has audit logs and hash verification. Is this chain of custody sufficient for regulatory investigation purposes?

10. **Participant consent for voice note evidence.** Requiring explicit consent before including voice notes in complaint bundles. Is this consent model appropriate? Is caregiver-on-behalf consent valid for participants with cognitive decline?

11. **Complaint outcome tracking.** Aggregating outcome data for analytics. Is anonymised aggregation legally sound?

12. **Retention.** Complaints retained for life of participant. Evidence bundles retained per active complaint plus 7 years post-closure. Appropriate?

### P.2 Interim posture

Until full sign-off:
- CMP-1 v1 code ships behind `cmp_1_v1_features` feature flag
- Feature flag disabled for user access
- Solicitor package addresses each question with written responses

Post sign-off:
- Feature flag enabled
- CMP-1 v1 launches with all pathways operational

### P.2a Founder sign-off record

Founder sign-off received. The twelve-question solicitor package above remains the record of what was reviewed; the signed opinion is held on file. The interim gate is lifted: the feature flag may be enabled for user access on the founder's authority. Given CMP-1 v1 is the most legally sensitive tool in the program, retain the signed opinion prominently with the build records and re-record here if any written response narrows scope.

### P.3 Alternative posture if scope is limited

If the solicitor determines Wayly's role must be more limited:
- CMP-1 v1 becomes a complaint drafting and tracking tool without evidence bundle compilation
- Users compile their own evidence externally
- Wayly maintains stage tracking, correspondence log, and template drafts
- ACQSC and Ombudsman submission preparation is more limited

This is a substantial product-model change. Phase 0 estimates likelihood based on preliminary solicitor discussion.

---

## Section Q. Privacy Policy amendment

### Q.1 Scope

CMP-1 v1 introduces:
- Complaint data category (subject matter, desired outcomes, provider allegations)
- Evidence bundle aggregation across tools
- Elder abuse pathway indicators
- Anonymous submission preparation
- Post-resolution follow-up tracking

Privacy Policy amended to disclose all.

### Q.2 Sequence

Privacy Policy v1.12 (following IC-2 v1's v1.11).

### Q.3 Specific disclosures

- Complaint content is user-authored allegations; user is responsible for factual accuracy
- Evidence bundle aggregation requires explicit user consent per item
- Voice note evidence requires participant consent
- Elder abuse indicators do not trigger automatic disclosure
- Anonymous ACQSC submissions have reduced investigative capability
- Retention per Section P.1 question 12

### Q.4 Solicitor sign-off gate

Full CMP-1 v1 launch gated on Privacy Policy amendment sign-off and solicitor package sign-off. No user-visible launch until both received.

---

## 2. Locked decisions

1. **New tool, no predecessor to preserve.** Design from scratch.
2. **Complaint types.** Seven types per Section F.2 including elder abuse.
3. **Severity levels.** Four levels per Section F.3.
4. **Stage taxonomy.** Six stages per Section G.1: drafting, internal, senior, ACQSC, Ombudsman, appeals, plus two closed states.
5. **Stage transition rules.** Per Section G.1. Regressive transitions require confirmation.
6. **Timeline expectations.** Per Section G.2 with LF-2 v1 escalation pattern reused.
7. **Evidence bundle.** User confirms every included item. Voice notes require participant consent.
8. **Anonymous ACQSC submission.** Supported. Identifying details minimised in bundle.
9. **Elder abuse pathway.** Distinct handling per Section K. No automatic disclosure.
10. **Provider defamation risk protection.** Templates use factual, non-conclusory language.
11. **Cross-tool evidence proposal.** Automatic proposal based on complaint context. User confirms inclusion.
12. **Provider contact directory.** From PPC-1 v2 or acquired as Phase 0 workstream.
13. **Solicitor gate.** Full CMP-1 v1 launch gated on solicitor sign-off.
14. **Interim posture.** Feature flag disabled for user access until sign-off.
15. **Data residency.** ap-southeast-2 for all writes.
16. **Feature flag.** `cmp_1_v1_features` gates all functionality.
17. **CORE-1 timeline events.** All meaningful CMP-1 v1 actions.
18. **LF-2 v1 integration.** Complaint correspondence uses LF-2 v1 send-from-Wayly.
19. **Existing case promotion.** LOOP-1 cases can be promoted to complaints.
20. **Retention.** Complaints life of participant. Evidence bundles 7 years post-closure.
21. **User satisfaction rating.** Optional at closure.
22. **Anonymous submission trade-off disclosure.** Users understand ACQSC's investigative capability may be reduced.
23. **No representational status.** Wayly still is not the user's legal representative.
24. **Persona rendering.** Every string in both variants per PERSONA-1.
25. **Editorial standard.** Factual, non-conclusory language throughout. Editorial review required.
26. **Mandatory reporting reconfirmed.** Wayly not a mandatory reporter.
27. **Privacy Policy amendment.** v1.12 in sequence. Solicitor sign-off required.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit (Section A)
- **WS2.** Complaint data model and persistence (Sections B.1, C.1)
- **WS3.** ComplaintEvidenceBundle data model and persistence (Sections B.2, C.1)
- **WS4.** Complaint template registry (Section B.3)
- **WS5.** Stage escalation event tracking (Section B.4)
- **WS6.** Complaint workflow overview surface (Section E)
- **WS7.** New complaint wizard (Section F)
- **WS8.** Stage management APIs and UI (Section G)
- **WS9.** Evidence bundle engine with cross-tool proposal (Section H)
- **WS10.** Bundle PDF generation (Section H.5)
- **WS11.** Anonymous bundle preparation (Section H.6)
- **WS12.** ACQSC referral pathway surface and material preparation (Section I)
- **WS13.** Ombudsman escalation pathway surface (Section J)
- **WS14.** Elder abuse special handling (Section K)
- **WS15.** Complaint outcome tracking (Section L)
- **WS16.** CORE-1 integration and timeline events (Section M.1)
- **WS17.** LOOP-1 case creation and promotion (Section M.2)
- **WS18.** LF-2 v1 correspondence integration (Section M.3)
- **WS19.** Evidence integrations from SD-3, SDL-1, IC-2, FC-2, CPR-2, CE-3 (Sections M.4-M.9)
- **WS20.** LCA-1 subscription for procedure updates (Section M.10)
- **WS21.** Provider directory integration (Section M.11)
- **WS22.** Persona-aware rendering with non-conclusory language (Section N)
- **WS23.** UXF-1 v3, dark mode, wizard accessibility (Section O)
- **WS24.** Elder abuse pathway accessibility (Section O.6)
- **WS25.** PostHog event schema (see 3.1)
- **WS26.** Feature flag and rollback
- **WS27.** Solicitor package (Section P)
- **WS28.** Privacy Policy amendment (Section Q)
- **WS29.** Complaint template drafting per type and stage (Section B.3, F.9)
- **WS30.** Editorial review of all templates for non-conclusory language (Section N.4)

### 3.1 PostHog event schema

- `complaint_created` (complaint_type, severity, starting_stage)
- `complaint_stage_advanced` (from_stage, to_stage, reason)
- `complaint_regressive_transition` (from_stage, to_stage)
- `evidence_bundle_started`
- `evidence_item_proposed` (source_type)
- `evidence_item_user_confirmed` (source_type, action: included | excluded)
- `evidence_bundle_pdf_generated` (item_count, is_anonymous)
- `acqsc_referral_prepared`
- `acqsc_submission_recorded` (submission_channel)
- `ombudsman_referral_prepared`
- `ombudsman_submission_recorded`
- `elder_abuse_pathway_offered` (severity)
- `elder_abuse_resource_viewed` (resource: helpline | opan | 1800respect | lifeline | police)
- `complaint_closed` (final_resolution, duration_days)
- `complaint_satisfaction_rating_given` (rating)
- `template_used` (template_slug)
- `regressive_transition_confirmation_dialog_shown`

---

## 4. Rollback plan

### 4.1 Feature flag

`cmp_1_v1_features` gates all CMP-1 v1 functionality. When off:
- All CMP-1 routes return 404
- No complaint records visible in existing tools
- LOOP-1 case promotion to complaint disabled

Other tools continue to operate.

### 4.2 Rollback triggers

- Solicitor concern raised post-launch
- Evidence bundle content leak observed
- Automatic disclosure incident (contrary to no-automatic-disclosure posture)
- Cross-participant data leak
- Provider defamation claim raised

### 4.3 Data retention during rollback

All data retained. Flag re-enable restores surfaces.

### 4.4 Related tool independence

All related tools continue operating.

---

## 5. Acceptance tests

Sixty-eight tests across thirteen categories.

### 5.1 Complaint CRUD

1. **T1.** Complaint creation persists with data_residency `ap-southeast-2`.
2. **T2.** Complaint creation requires all mandatory fields.
3. **T3.** Complaint retrieval by participant scoped correctly.
4. **T4.** Complaint update persists partial fields.
5. **T5.** Household membership authorisation enforced.

### 5.2 Wizard

6. **T6.** Wizard completes 10 steps in sequence.
7. **T7.** Step 5 subject matter content scanning triggers resource panel on flag.
8. **T8.** Step 6 desired outcome selection persists.
9. **T9.** Step 7 evidence proposals include relevant items from integrated tools.
10. **T10.** Step 8 starting stage selection persists.
11. **T11.** Step 9 template draft pre-populates persona-appropriately.
12. **T12.** Step 10 confirmation creates complaint with linked LOOP-1 case.

### 5.3 Stage management

13. **T13.** Valid stage transitions succeed.
14. **T14.** Invalid stage transitions rejected.
15. **T15.** Regressive transitions require confirmation.
16. **T16.** Stage history preserved with entry and exit timestamps.
17. **T17.** Timeline expectations displayed correctly per stage.
18. **T18.** Escalation offers fired after timeline exceeded.

### 5.4 Evidence bundle

19. **T19.** Bundle initialization creates empty bundle for complaint.
20. **T20.** Proposal endpoint returns items from all integrated tools relevant to complaint.
21. **T21.** User confirmation persists per item.
22. **T22.** Voice note requires additional participant consent.
23. **T23.** External evidence upload stored in ap-southeast-2 with hash.
24. **T24.** Bundle PDF generation includes all confirmed items.
25. **T25.** Anonymous bundle prep removes identifying details.

### 5.5 ACQSC referral

26. **T26.** ACQSC referral surface renders at Stage 3.
27. **T27.** Materials preparation completes with letter, bundle, timeline.
28. **T28.** Submission channel selection persists.
29. **T29.** Submission confirmation records submission_channel and reference.
30. **T30.** ACQSC response classification correctly categorises response.
31. **T31.** Anonymous submission option properly minimises identifying details.

### 5.6 Ombudsman referral

32. **T32.** Ombudsman referral only available after Stage 3.
33. **T33.** Materials preparation includes Stage 3 materials and response.
34. **T34.** Submission recording.

### 5.7 Elder abuse

35. **T35.** Elder abuse complaint type triggers immediate resource panel.
36. **T36.** Sensitive content detection in other complaint types triggers pathway option.
37. **T37.** Resources include correct helpline numbers.
38. **T38.** No automatic disclosure to caregivers, providers, or authorities.
39. **T39.** Elevated pathway options presented (ACQSC, police, elder abuse helpline).
40. **T40.** Immediate safety assessment prompted for critical severity.

### 5.8 Provider defamation risk

41. **T41.** Template language passes non-conclusory review.
42. **T42.** Content warnings shown if user drafts conclusory language.
43. **T43.** Editorial review confirmation captured for all templates.

### 5.9 Anonymous submission

44. **T44.** Anonymous flag persists.
45. **T45.** Anonymous bundle has identifying details minimised.
46. **T46.** User understands trade-off (investigative capability reduced).

### 5.10 Integrations

47. **T47.** CORE-1 timeline events written for all instrumented actions.
48. **T48.** LOOP-1 case creation with formal_complaint case_type.
49. **T49.** LOOP-1 existing case promotion to complaint works.
50. **T50.** LF-2 v1 send-from-Wayly used for complaint correspondence.
51. **T51.** SD-3 statements proposed as evidence for billing dispute.
52. **T52.** SDL-1 attendance records proposed as evidence for care quality.
53. **T53.** IC-2 invoices and rate change alerts proposed as evidence.
54. **T54.** FC-2 voice notes with consent proposed for relevant complaint types.
55. **T55.** CPR-2 plan reviews and voice checks proposed for care plan disputes.
56. **T56.** LCA-1 subscription updates pathway content on legislative changes.

### 5.11 Outcome tracking

57. **T57.** Provider response time tracked per stage.
58. **T58.** Final resolution outcome recorded at closure.
59. **T59.** User satisfaction rating optional at closure.
60. **T60.** Overall duration calculated correctly.

### 5.12 Persona and editorial

61. **T61.** All strings pass PERSONA-1 audit.
62. **T62.** All templates pass editorial review for non-conclusory language.
63. **T63.** Elder abuse pathway tone reviewed for respect and sensitivity.
64. **T64.** All strings pass editorial QA (Australian English, no em dashes, no banned vocabulary).

### 5.13 Accessibility

65. **T65.** Wizard multi-step navigation accessible.
66. **T66.** Elder abuse resources accessible with large tap targets.
67. **T67.** All surfaces pass WCAG 2.1 AAA in light, dark, system modes.
68. **T68.** Keyboard navigation throughout all surfaces.

---

## 6. Delivery notes

### 6.1 Solicitor package status

Delivery notes state solicitor package status: prepared, sent, under review, signed off.

### 6.2 Privacy Policy amendment status

Delivery notes state amendment status.

### 6.3 Template editorial review

Delivery notes confirm all templates reviewed for non-conclusory language.

### 6.4 Pathway content accuracy

Delivery notes confirm ACQSC and Ombudsman pathway content sourced from primary instruments and current at launch.

### 6.5 Provider directory coverage

Delivery notes report provider senior contact directory coverage.

### 6.6 Cross-tool evidence proposal accuracy

Delivery notes report evidence proposal accuracy on fixture complaints (relevant evidence proposed, irrelevant evidence not proposed).

### 6.7 Anonymous bundle preparation verified

Delivery notes confirm anonymous bundle prep removes identifying details on test cases.

### 6.8 Elder abuse pathway tested

Delivery notes confirm elder abuse pathway triggers correctly on fixture scenarios.

---

## 7. Explicit v2 candidates

Items deferred from CMP-1 v1.

1. **AI-assisted evidence summarisation.** LLM-summarised evidence for bundle presentation. ADM disclosure concern.
2. **Multi-participant complaint aggregation for adviser tier.** Adviser handling complaints for multiple clients.
3. **Direct ACQSC portal integration.** If ACQSC provides API access.
4. **Complaint outcome benchmarking.** Aggregating outcomes across users for benchmark data. Privacy-sensitive.
5. **Automated stage escalation.** Currently user-initiated. Deferred to preserve user agency.
6. **Advocate hand-off.** Referring users to OPAN or advocacy services with warm hand-off. Requires partnership arrangement.
7. **Legal representation referral.** Referring users to solicitors for cases requiring legal representation. Requires referral panel.
8. **Complaint outcome learning.** Refining pathway content based on aggregate outcomes. Requires substantial data volume.
9. **Provider-side dashboard.** For providers to view complaints against them (if regulatory changes require). Out of Wayly's positioning scope.
10. **Court referral pathway.** For complaints escalating beyond Ombudsman to court. Deferred pending solicitor scope review.
11. **Multi-language complaint content.** For CALD community. Deferred.
12. **Video evidence submission.** For complaints with video-relevant content. Storage and consent considerations.

---

## 8. Change log

- **v1** (this document): initial CMP-1 spec. Complete complaints workflow tool. Seven complaint types with special handling for elder abuse. Six-stage workflow with clear transition rules. Ten-step new complaint wizard. Evidence bundle aggregation across all Wayly tools with user confirmation and voice note consent. ACQSC referral pathway with anonymous submission option. Ombudsman escalation pathway. Elder abuse special handling echoing FC-2 and SDL-1 posture. Non-conclusory template language throughout. Outcome tracking including user satisfaction. Sixty-eight acceptance tests. Solicitor sign-off required for launch. Alternative posture defined if scope is limited.

---

**End of CMP-1 v1 handoff prompt.**
