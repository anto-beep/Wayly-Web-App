# CPR-2 v1: Support Plan Reviewer

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (hard dependency), LCA-1 v1 (event source for re-review triggers), FC-2 v1 (voice note source), LF-1 v1.2 / LF-2 v1 (hand-off target)
**Predecessor:** Care Plan Reviewer v1 or v2 (CPR-1, shipped or shipping)
**Successor:** CPR-2 v2 will absorb aggregated dataset for similar-profile comparison when data source is available, plus multi-participant plan comparison for adviser tier. Deferred.
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

CPR-1 (Care Plan Reviewer) provides document ingestion (PDF, DOCX, image with OCR), a Care Plan Store with versioning and soft-delete restore, structured analysis with per-finding citation, a meeting artefact output, cross-tool integrations, and Family Coordinator sharing. Users upload a plan, get findings, prepare for a meeting with their care manager. The tool ends at the review.

Five gaps identified in PROGRAM-1 shape CPR-2 v1.

The name is wrong. Under the Aged Care Act 2024, the document is now the "Support Plan," not the "Care Plan." Users are increasingly searching for "Support Plan reviewer" and finding nothing. The rename addresses a search-visibility risk while retaining the Care Plan alias.

Plans are point-in-time. When a new plan is uploaded, prior plan findings are lost. Goals set in the last plan are not tracked to determine if they were met. Goal ledger addresses this.

Legislative changes affecting a plan (the 1 October 2026 personal care reclassification, for example) do not automatically prompt users to re-review their plan. LCA-1's event system supports this; CPR-2 subscribes.

The participant voice module in CPR-1 checks for participant-authored goals within the uploaded document. It cannot ask the participant themselves "was this actually your idea." Participant voice check as a first-class module runs after the plan is uploaded and gives the participant a direct surface to affirm or challenge whether the plan reflects their voice.

Similar-profile comparison shows a participant "here's what a typical Classification 5 plan looks like" so they can see whether their own plan is an outlier. Data source for this is out of CPR-2 v1 scope; Phase 0 identifies it and the v1 shipping posture (Program Manual guidance for the initial comparison, aggregated user data when consent and threshold permit).

CPR-2 v1 is a P1 workstream in PROGRAM-1 Phase D. It ships after CPR-1 has stabilised, CORE-1, LOOP-1, LCA-1 are all live, and FC-2 v1's voice notes surface is available for consumption.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model extensions
- **Section C:** Persistence surface
- **Section D:** Internal APIs
- **Section E:** Support Plan rename across all surfaces
- **Section F:** Goal ledger
- **Section G:** Legislative-change-triggered re-review
- **Section H:** Participant voice check (first-class module)
- **Section I:** Similar-profile comparison
- **Section J:** Case creation from plan findings
- **Section K:** Integration seams
- **Section L:** Persona-aware rendering with participant-first for voice check
- **Section M:** Accessibility, dark mode, design tokens
- **Section N:** Privacy considerations

Four risks Emergent must surface in delivery notes on first commit:

1. **CPR-1 preservation.** All CPR-1 behaviour preserved without regression. Every CPR-1 acceptance test remains valid. Document ingestion, Care Plan Store, structured analysis, meeting artefact, cross-tool integrations, Family Coordinator sharing all continue to function.
2. **Support Plan rename discipline.** The rename touches every surface: labels, search meta, PDF headers, email content, tool page titles, user preferences. Missing a surface causes user confusion. Emergent must produce a rename inventory in Phase 0 covering every user-facing string.
3. **Similar-profile data source availability.** The initial data source is Program Manual guidance per Phase 0 A.7 recommendation. If the guidance is not sufficient granularity for the comparison, similar-profile comparison ships with explicit "Based on Program Manual guidance; see the tool notes for scope" framing.
4. **Goal extraction reliability.** Goals must be extracted reliably from the uploaded plan document. Phase 0 tests extraction on real plan fixtures. If extraction accuracy is below 90% on a fixture set, extraction confidence displays with each extracted goal and users confirm before ledger entry.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/CPR-2-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 CPR-1 shipping status

Confirm CPR-1 has shipped and stabilised for at least 30 days. Report post-launch findings that affect CPR-2 v1 assumptions (analysis engine reliability, cross-tool integration health, per-finding citation quality).

### A.2 Support Plan rename inventory

Produce a comprehensive inventory of every user-facing string, meta tag, URL path, email subject, PDF header, tool label, dashboard reference, and marketing content that mentions "Care Plan" in the context of the CPR tool. Each entry needs a rename plan (change to "Support Plan," retain as alias for search, or preserve unchanged with rationale).

Follow LF-1 v1.1 rename pattern (per predecessor rename history).

### A.3 CORE-1 timeline events

Confirm CORE-1 timeline event registry. CPR-2 adds `plan_reviewed` (already may exist for CPR-1), `goal_ledger_updated`, `re_review_prompted`, `participant_voice_check_completed`, `similar_profile_compared`.

### A.4 LOOP-1 case types

Confirm LOOP-1 registry includes `plan_finding` (per LOOP-1 Section B.3 initial registry). CPR-2 uses this for opened cases with metadata indicating specific finding type.

### A.5 LCA-1 subscription

Confirm LCA-1 exposes an event stream for `tool_cache_invalidate` events per LCA-1 Section I.4. CPR-2 subscribes with a filter for changes where `affects_wayly_tools` includes `support_plan_reviewer` (or `care_plan_reviewer` in the alias transition period).

### A.6 FC-2 voice note read access

Confirm FC-2 v1 exposes shared voice notes via internal API per FC-2 Section I.8. CPR-2's participant voice check reads notes with `visibility: shared_with_household` or notes shared specifically with the CPR user.

### A.7 Similar-profile data source

Report the recommended initial data source:

Recommended for v1: Program Manual guidance on typical service mix by classification.

Alternative sources to evaluate:
- Aged care research organisation licensed dataset
- Wayly-internal aggregated de-identified user data (requires consent model and minimum aggregate threshold to avoid re-identification)

For v1, ship with Program Manual guidance and explicit framing that the comparison is "typical guidance, not a peer aggregate." Aggregated data added in v2 when consent and threshold permit.

### A.8 Goal extraction reliability

Test the existing goal extraction (from CPR-1) on a fixture set of 10 real plans. Report:
- Extraction recall (percentage of plan goals correctly identified)
- Extraction precision (percentage of extracted goals that are actual goals)
- Common failure modes

If recall below 90%, goal ledger v1 requires user confirmation before ledger entry.

### A.9 Australian data residency

Confirm ap-southeast-2 for all new CPR-2 collections.

### A.10 PERSONA-1 audit for participant voice module

The participant voice check module is participant-first. Confirm PERSONA-1 has landed remediation on CPR-1's existing participant persona surfaces so that CPR-2's participant voice check integrates coherently.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model extensions

### B.1 Plan review (extended from CPR-1)

CPR-2 v1 extends CPR-1's plan review record with additional fields.

```
PlanReview (extended from CPR-1) {
  ...existing CPR-1 fields (document metadata, per-finding citations, meeting artefact),

  // Rename
  document_type_label: enum { support_plan, care_plan, mixed }  // "mixed" for legacy plans predating SAH

  // Goal ledger linkage
  extracted_goals: [
    {
      goal_id: UUID  // FK to GoalLedgerEntry
      goal_text_as_extracted: string
      extraction_confidence: enum { high, medium, low }
      user_confirmed: boolean
    }
  ]

  // Re-review triggers
  triggered_by_lca_1_change_ids: UUID[]
  re_review_prompt_ids: UUID[]

  // Participant voice check linkage
  participant_voice_check_id: UUID | null

  // Similar-profile comparison
  similar_profile_comparison_id: UUID | null

  // Metadata
  version: integer  // CPR-1 already versions; preserved
  data_residency: string (must be "ap-southeast-2")
}
```

### B.2 Goal ledger entry

New collection.

```
GoalLedgerEntry {
  id: UUID
  participant_id: UUID (foreign key to Participant per CORE-1)
  household_id: UUID (denormalised)

  // Goal content
  goal_text: string  // Canonical goal statement (may be edited from original)
  original_extracted_text: string  // As extracted from source plan
  goal_type: enum {
    self_directed_participant_stated,
    provider_recommended,
    medical_or_clinical,
    functional,
    social_wellbeing,
    other
  }

  // Provenance
  first_extracted_from_plan_id: UUID
  first_extracted_at: timestamp
  extraction_confidence: enum { high, medium, low }
  user_confirmed_at_extraction: boolean

  // Status tracking
  status: enum {
    active_ongoing,
    partially_met,
    fully_met,
    dropped_no_longer_relevant,
    dropped_by_provider,
    new_in_current_plan,
    superseded_by_new_goal
  }
  status_reason: string | null
  last_status_change_at: timestamp
  last_status_change_by_user_id: UUID | null

  // Cross-plan tracking
  appears_in_plan_ids: UUID[]  // Every plan version where this goal (or its match) appears
  superseded_by_goal_id: UUID | null

  // Meeting notes
  meeting_notes: [
    {
      timestamp,
      note,
      note_by_user_id
    }
  ]

  created_at: timestamp
  updated_at: timestamp
  data_residency: string
}
```

### B.3 Re-review prompt

Tracks LCA-1-triggered re-review offers.

```
ReReviewPrompt {
  id: UUID
  participant_id: UUID
  plan_review_id: UUID

  // Trigger
  triggered_by: enum { legislative_change, user_request, scheduled_cadence, cross_tool_referral }
  lca_1_change_id: UUID | null
  triggered_at: timestamp

  // Change context (if legislative)
  change_summary: string | null

  // User surfacing
  prompted_to_user_at: timestamp | null
  prompted_to_user_id: UUID | null

  // User response
  user_response: enum {
    dismissed,
    started_re_review,
    deferred_to_date,
    completed_new_review
  } | null
  user_responded_at: timestamp | null
  deferred_until: date | null

  // New review linkage
  new_plan_review_id: UUID | null  // Set when re-review results in a new upload

  data_residency: string
}
```

### B.4 Participant voice check

New collection for first-class voice check module.

```
ParticipantVoiceCheck {
  id: UUID
  plan_review_id: UUID
  participant_id: UUID
  initiated_by_user_id: UUID  // Typically the participant themselves
  authored_on_behalf: boolean  // True if a caregiver initiated for the participant

  // Verification of authorship
  participant_confirmed_review_at: timestamp | null  // Participant confirms they reviewed
  participant_confirmed_by_user_id: UUID | null  // The participant user

  // Goal-by-goal review
  goal_reviews: [
    {
      goal_id: UUID  // FK to GoalLedgerEntry
      goal_text_shown: string
      review_prompt_shown: string  // "Was this your idea?" or persona-appropriate variant
      participant_answer: enum {
        yes_i_wanted_this,
        yes_but_not_exactly,
        no_this_was_the_providers_idea,
        i_dont_remember_discussing_this,
        skipped
      }
      participant_notes: string | null
    }
  ]

  // Overall finding
  overall_finding: enum {
    participant_led,
    provider_led,
    mixed_collaborative,
    participant_absent
  }
  overall_notes: string | null

  // Follow-up
  suggested_actions_taken: {
    letter_drafted: boolean
    letter_id: UUID | null
    voice_note_created: boolean
    voice_note_id: UUID | null  // FK to FC-2 ParticipantVoiceNote
    plan_re_review_requested: boolean
  }

  // Sensitive content
  contains_sensitive_content_flag: boolean

  created_at: timestamp
  data_residency: string
}
```

### B.5 Similar-profile comparison

New collection.

```
SimilarProfileComparison {
  id: UUID
  participant_id: UUID
  plan_review_id: UUID

  // Baseline
  participant_classification_band: integer 1-8
  participant_service_mix: [
    { service_type, hours_per_month, dollars_per_month }
  ]

  // Comparison
  comparison_source: enum {
    program_manual_guidance,
    aggregated_user_data_v2  // Future
  }
  comparison_typical_mix: [
    { service_type, typical_hours_per_month, typical_range }
  ]

  // Analysis
  outlier_findings: [
    {
      service_type: string
      deviation_type: enum { significantly_more, significantly_less, absent_but_typical, present_but_atypical }
      deviation_magnitude: string  // Persona-aware description
    }
  ]
  overall_summary_tokens: {
    caregiver: string
    participant_self: string
  }

  computed_at: timestamp
  cache_valid_until: timestamp
  data_residency: string
}
```

---

## Section C. Persistence surface

### C.1 New and extended collections

- `plan_reviews` extended per B.1 (existing CPR-1 collection)
- `goal_ledger_entries` new collection per B.2, indexed on `participant_id, status`, `first_extracted_from_plan_id`
- `re_review_prompts` new collection per B.3, indexed on `participant_id, triggered_at DESC`
- `participant_voice_checks` new collection per B.4, indexed on `plan_review_id`, `participant_id`
- `similar_profile_comparisons` new collection per B.5, indexed on `participant_id, plan_review_id`

All in MongoDB Atlas ap-southeast-2.

### C.2 Retention

- Plan reviews: retained per CPR-1 policy (life of participant)
- Goal ledger entries: retained per participant life. Goals with status `dropped_no_longer_relevant` or `superseded_by_new_goal` retained for audit
- Re-review prompts: retained per participant life
- Participant voice checks: retained per participant life. Sensitive-flagged content follows FC-2 voice note retention posture (indefinite until deletion, active-case content until closure)
- Similar-profile comparisons: cache-invalidated on new plan or new comparison data source. 90-day retention window for older comparisons

### C.3 Cross-plan goal linking

When a new plan is uploaded, extracted goals are proposed as matches to existing goal ledger entries. Match candidates displayed to user for confirmation.

Matches update `appears_in_plan_ids` and status.

### C.4 Cascade with participant deletion

All new collections cascade-delete with participant deletion after 30-day soft-delete window.

---

## Section D. Internal APIs

### D.1 Plan review (extended)

Preserves CPR-1 endpoints. Extensions:

```
GET /internal/plan-reviews/[id]?include_goals=true&include_voice_check=true&include_similar_profile=true
Returns: PlanReview with extended fields per B.1
```

```
POST /internal/plan-reviews/[id]/rename-source-label
Body: { document_type_label: support_plan | care_plan | mixed }
```

### D.2 Goal ledger

```
GET /internal/participants/[id]/goals?status=[filter]&limit=[n]
Returns: GoalLedgerEntry[]
```

```
POST /internal/participants/[id]/goals
Body: { goal_text, goal_type, first_extracted_from_plan_id, extraction_confidence, actor_user_id }
Returns: GoalLedgerEntry
```

```
PATCH /internal/goals/[id]
Body: partial fields (status, status_reason, goal_text)
Returns: updated GoalLedgerEntry
```

```
POST /internal/goals/[id]/link-to-plan
Body: { plan_id }
Adds plan_id to appears_in_plan_ids.
```

```
POST /internal/goals/[id]/supersede
Body: { superseding_goal_id, actor_user_id }
Updates both goals' relationship.
```

```
POST /internal/goals/[id]/meeting-note
Body: { note, note_by_user_id }
```

### D.3 Re-review prompts

```
GET /internal/participants/[id]/re-review-prompts?status=[filter]
Returns: ReReviewPrompt[]
```

```
POST /internal/participants/[id]/re-review-prompts
Body: {
  plan_review_id,
  triggered_by,
  lca_1_change_id (if legislative)
}
Returns: ReReviewPrompt
```

Fires internally when LCA-1 events arrive, or externally when user initiates a request via `POST /internal/plan-reviews/[id]/request-re-review`.

```
POST /internal/re-review-prompts/[id]/user-response
Body: { response, deferred_until (optional), responded_by_user_id }
```

### D.4 Participant voice check

```
POST /internal/plan-reviews/[id]/voice-checks
Body: {
  initiated_by_user_id,
  authored_on_behalf,
  goal_reviews: []
}
Returns: ParticipantVoiceCheck
```

```
GET /internal/plan-reviews/[id]/voice-checks
Returns: ParticipantVoiceCheck[]
```

```
PATCH /internal/voice-checks/[id]
Body: partial fields (goal_reviews, overall_finding, participant_confirmed_review_at)
```

```
POST /internal/voice-checks/[id]/mark-follow-up
Body: {
  action: letter_drafted | voice_note_created | plan_re_review_requested,
  reference_id: UUID
}
```

### D.5 Similar-profile comparison

```
POST /internal/plan-reviews/[id]/similar-profile-comparison
Returns: SimilarProfileComparison
```

Computes on demand. Cached for 30 days.

```
GET /internal/plan-reviews/[id]/similar-profile-comparison
Returns: SimilarProfileComparison
```

### D.6 Authorisation

All endpoints scoped by household membership per CORE-1 pattern.

Participant voice check has additional visibility considerations: participant-authored check content follows FC-2 voice note visibility rules for sensitive content.

---

## Section E. Support Plan rename across all surfaces

### E.1 Primary label

"Support Plan Reviewer" is the primary name for the tool.

Wayly surfaces:
- Tool page title
- Navigation menu label
- Dashboard card title
- Internal API tool slug: `support_plan_reviewer` (with `care_plan_reviewer` alias)
- PDF artefact header
- Email subject line
- Meta tags (SEO)
- Marketing content

### E.2 Alias retention

"Care Plan Reviewer" retained for:
- URL redirect (old `/app/tools/care-plan-reviewer` → new `/app/tools/support-plan-reviewer`)
- Search meta (keyword "care plan reviewer" preserved for SEO)
- Internal API alias (`care_plan_reviewer` slug redirects to `support_plan_reviewer`)
- Backward compatibility in any external integrations

### E.3 User-facing rename messaging

For existing users, on first CPR-2 login, a one-time notification:
- "Care Plan Reviewer is now Support Plan Reviewer. Under the Aged Care Act 2024, the document you sign with your provider is called a Support Plan. We've updated the name to match. Everything else works the same."

Persona-aware.

### E.4 Document type detection

The uploaded document may be labelled "Care Plan," "Support Plan," or something else. CPR-2 detects the label and stores in `document_type_label`. Analysis logic is program-agnostic; label is informational.

### E.5 Rename inventory audit

Delivery notes include the completed rename inventory per Phase 0 A.2, confirming every user-facing string has been reviewed.

---

## Section F. Goal ledger

### F.1 Route

`/app/participants/[id]/goals`

Also embedded as a "Goals" card on the participant profile page (CORE-1) and on plan review detail pages.

### F.2 Goal list layout

Each goal renders as a card:
- Goal text
- Goal type badge (self-directed, provider-recommended, medical, functional, social, other)
- Status pill (active, partially met, fully met, dropped, new, superseded)
- Appears in [N] plans
- Last status change date
- Meeting notes indicator (count)

Sort options: status, goal type, most recently updated. Filter options.

### F.3 Goal detail

Click opens a modal or route showing:
- Goal text (editable, preserves original_extracted_text)
- Goal type (editable)
- Status with change history
- Appears in plans (chronological list of plans)
- Meeting notes (add, view)
- Related actions: link to plan review, draft letter about goal, mark met, mark dropped, add meeting note

### F.4 Goal extraction from new plan

When a new plan is uploaded through CPR-2:
1. Extraction identifies candidate goals
2. Extraction confidence assigned per candidate
3. Matching against existing goal ledger entries (fuzzy match on text)
4. Modal shows: "Here are the goals we found in this plan. Confirm which are matches to your existing goals."
5. User confirms matches, adds new goals, drops removed goals
6. Ledger updates:
   - Matched goals: `appears_in_plan_ids` extended
   - New goals: created with status `new_in_current_plan`
   - Removed goals: status transitions to `dropped_by_provider` if the previous plan showed them but new one doesn't (with user confirmation)

### F.5 User-initiated status transitions

Users can manually update goal status at any time:
- Mark as met (fully or partially)
- Mark as dropped (no longer relevant)
- Add meeting note
- Add comment

### F.6 Timeline view

Route: `/app/participants/[id]/goals/timeline`

Chronological view showing:
- When each goal was first extracted
- Status transitions over time
- Cross-plan appearances

### F.7 Cross-tool integration

Goal ledger populates:
- CORE-1 profile page's goals card
- FC-2 v1 handover pack goals section
- LF-1 v1.2 / LF-2 v1 template prefill (e.g. "asking about progress on [goal text]")

### F.8 Empty state

Persona-aware:
- Caregiver: "No goals recorded yet. When you upload [participant name]'s next plan, we'll start extracting goals to track."
- Participant self: "No goals recorded yet. When you upload your next plan, we'll start extracting goals to track."

---

## Section G. Legislative-change-triggered re-review

### G.1 Trigger mechanism

CPR-2 subscribes to LCA-1's `tool_cache_invalidate` events. When a change affects `support_plan_reviewer` (or `care_plan_reviewer`), CPR-2 evaluates:

For each participant with an active plan review:
- Does the change affect the plan's classification, service mix, or contribution treatment?
- If yes, create a ReReviewPrompt record

### G.2 Prompt evaluation

Not every legislative change requires re-review. Rules:

- Personal care reclassification (October 2026 example): re-review if plan includes personal care
- Contribution rate change: re-review if the plan explicitly references contribution rates
- Care management percentage change: re-review for all active plans
- Program Manual clarification without material rule change: no re-review

Evaluation runs on LCA-1 event. Prompt created per matching participant.

### G.3 User notification

Notification fires per LOOP-1's infrastructure:
- "A legislative change on [effective_date] may affect [participant name]'s support plan. Would you like to review the plan against the change?"

Persona-aware.

### G.4 Re-review options

User can:
- Start re-review (walks through the plan against the change)
- Defer (mark for later; will re-prompt in 30 days)
- Dismiss (no action; no re-prompt)

### G.5 Re-review flow

The re-review is a guided walkthrough. CPR-2 highlights sections of the existing plan potentially affected by the change and asks the user to consider each:
- Does this section still make sense?
- Should the participant discuss it with their care manager?

Output is a "re-review summary" the user can print or share.

If the user determines the plan needs formal update, hand-off to:
- Request a plan review meeting (LF-1 v1.2 letter template)
- Upload a new plan when received (routes to standard CPR-2 upload)

### G.6 Post-re-review

If a new plan is uploaded after re-review, `new_plan_review_id` is set on the ReReviewPrompt.

---

## Section H. Participant voice check (first-class module)

### H.1 Route

`/app/plan-reviews/[id]/voice-check`

Available for any plan review. For participant-self persona, prominently offered after plan upload. For caregiver persona, offered as "would you like the participant to review this?"

### H.2 Participant-first framing

For participant persona, the check begins:

> "You just uploaded a support plan. This plan describes the care you're going to receive.
>
> The plan can only work if it reflects what you actually want. This quick check asks you goal by goal: did you want this, or is this someone else's idea?
>
> There are no wrong answers. This isn't a test. What you say here helps you and your family make sure the plan fits you."

### H.3 Goal-by-goal review

For each extracted goal, the module presents:
- Goal text
- Question: "Was this your idea?" (or persona-appropriate variant)
- Answer options per B.4:
  - Yes, I wanted this
  - Yes, but not exactly
  - No, this was the provider's idea
  - I don't remember discussing this
  - Skip

Optional notes field per goal.

### H.4 Overall finding

At end of goal review:
- Automatic overall finding based on distribution of answers:
  - Mostly "yes I wanted this" → `participant_led`
  - Mix of yes and no → `mixed_collaborative`
  - Mostly "no, provider's idea" or "don't remember" → `provider_led`
  - Skipped most → `participant_absent`

User can override overall finding.

### H.5 Follow-up actions

Based on overall finding, module suggests:

**Participant led:**
- No action needed. Persona-appropriate confirmation ("Sounds like your plan is genuinely yours.")

**Mixed collaborative:**
- Optional: note specific goals to discuss with care manager
- Draft a letter requesting discussion of unclear goals (LF-1 v1.2 template)

**Provider led:**
- Strong prompt to discuss with care manager
- Draft a letter requesting plan revision to include participant preferences
- Create a FC-2 v1 voice note capturing what the participant does want

**Participant absent:**
- Prompt to arrange for participant involvement in plan development
- Elder abuse safeguard consideration if pattern persists

### H.6 Caregiver-authored variant

If a caregiver initiates the voice check because the participant is unable to (cognitive decline, other circumstances), the check runs but is flagged `authored_on_behalf: true`. Framing acknowledges:

> "You're doing this on behalf of [participant name]. Please answer as they would if they could. When you're done, if [participant name] can review, please have them do so and confirm."

### H.7 Sensitive content detection

Per FC-2 posture, content is scanned for elder abuse indicators, provider intimidation language, or distress. Detection triggers resource panel per FC-2 Section N. No automatic disclosure.

### H.8 Integration with FC-2 voice notes

Participant voice check reads FC-2 voice notes with shared visibility to enrich context. The check does not read private notes.

Voice check outputs can be saved as FC-2 voice notes if the participant chooses (via the follow-up actions).

### H.9 Sensitivity

The voice check surfaces uncomfortable truths (a plan that is provider-authored without participant input). The framing acknowledges this. Users can pause and return.

---

## Section I. Similar-profile comparison

### I.1 Route

`/app/plan-reviews/[id]/similar-profile`

### I.2 Comparison structure

Presents the participant's plan side-by-side with a "typical" profile for their classification:

**Participant's plan (as extracted)**
- Service type A: X hours per month
- Service type B: Y hours per month
- etc.

**Typical Classification [N] plan (per Program Manual guidance)**
- Service type A: X' hours per month (range: min to max)
- Service type B: Y' hours per month (range: min to max)
- etc.

### I.3 Outlier findings

Automated analysis flags:
- Services in participant's plan significantly above typical range
- Services in participant's plan significantly below typical range
- Services absent from participant's plan that are typical for the classification
- Services in participant's plan that are atypical for the classification

Each finding renders as a card with:
- Service type
- Deviation description (persona-aware)
- Question prompts: "Is this deliberate? Was it discussed with your care manager?"

### I.4 Overall summary

Persona-aware summary:

Caregiver variant example:
> "[Participant name]'s plan focuses more heavily on personal care than a typical Classification 5 plan, and includes less social support than typical. This may be intentional based on [participant's] needs, or it may be worth discussing with the care manager."

### I.5 Data source disclosure

Every comparison view shows the data source explicitly:
- "Based on Program Manual guidance for typical Classification [N] plans."
- Or (v2): "Based on aggregated de-identified data from [N] Wayly users at Classification [N]."

If the initial source (Program Manual) is limited, the tool notes explicitly what the limitation is.

### I.6 Hand-off actions

- Discuss with care manager (LF-1 v1.2 letter template)
- Request plan review (LF-1 v1.2 template)
- Update goal ledger with new goals reflecting outlier discussion
- Save comparison to include in FC-2 v1 handover pack

### I.7 Sensitivity

Framing is exploratory, not judgemental. "Different from typical" is not "wrong." The tool surfaces information; the user decides what it means.

### I.8 Data source v2 roadmap

For CPR-2 v2, aggregated de-identified user data becomes the source once:
- Minimum aggregate threshold reached (recommend 50 participants per classification band)
- Explicit consent model in place
- Re-identification risk analysis completed

Program Manual guidance remains as fallback.

---

## Section J. Case creation from plan findings

### J.1 CPR-1 preservation

CPR-1's per-finding citation and analysis output is preserved. CPR-2 v1 adds case creation from findings.

### J.2 Case creation logic

For each plan finding with severity above `notable`, CPR-2 offers to open a LOOP-1 case with:
- `case_type: plan_finding`
- `source_artefact_id: plan_review.id`
- `source_finding_id: finding.id`
- Metadata containing finding details and severity
- Summary tokens describing the finding for both personas

User confirms before case creation (not automatic).

### J.3 Hand-off from cases

Cases opened from plan findings hand off to LF-1 v1.2 with prefill for the appropriate template.

### J.4 Cross-tool coordination

Findings on plans may relate to findings in other tools (e.g. a plan review finding that personal care hours are inadequate ties to BC-2's living budget showing underutilised budget). Cross-references appear on the case detail page per LOOP-1's cross-case awareness (per LOOP-1 Section H).

---

## Section K. Integration seams

### K.1 CORE-1

- Read: participant profile, household membership
- Write: timeline events for `plan_reviewed`, `goal_ledger_updated`, `re_review_prompted`, `participant_voice_check_completed`, `similar_profile_compared`
- Update: `latest_artefacts.plan_review` on profile aggregate. Add goals card if goal ledger populated.

### K.2 LOOP-1

- Write: cases for plan findings per Section J
- Read: cases for cross-tool coordination

### K.3 LCA-1

- Subscribe: `tool_cache_invalidate` events with filter for `support_plan_reviewer` or `care_plan_reviewer`
- Create ReReviewPrompt records for affected participants per Section G

### K.4 FC-2 v1

- Read: shared voice notes for participant voice check context per Section H.8
- Write: voice notes as follow-up action from voice check
- Handover pack integration: goal ledger appears in handover pack goals section

### K.5 LF-1 v1.2 and LF-2 v1

- Hand-off from re-review prompts, voice check follow-ups, similar-profile comparisons, and plan findings

### K.6 SD-3

- Cross-reference plan services with decoded statement services to identify discrepancies (services in plan but not billed, services billed but not in plan)

### K.7 BC-2 v1

- Coordinate with living budget: plan services and BC-2 projected budget align (services expected in plan should roughly total the budget allocation)

### K.8 CPR-1

- Preserve all CPR-1 behaviour
- Extend analysis engine with goal extraction refinements

---

## Section L. Persona-aware rendering

### L.1 All content persona-aware

Every user-facing string in CPR-2 v1 additions is authored in caregiver and participant-self versions per PERSONA-1.

### L.2 Participant-first for voice check

Section H.2 explicitly designs the voice check for the participant persona. Caregiver persona sees a variant that acknowledges they may be initiating on behalf of the participant.

The voice check is the flagship participant-first surface in CPR-2 v1. Editorial QA confirms tone.

### L.3 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

### L.4 Sensitive tone for provider-led findings

If voice check reveals a plan is provider-led without participant input, the framing is not accusatory. It acknowledges the participant's situation:

> "It sounds like this plan may not fully reflect what you wanted. That's important information. Here are some things you can do."

Not: "Your provider ignored you."

### L.5 Sensitive tone for participant-absent findings

If voice check reveals the participant was not involved:

> "Sometimes plans get made without the person they're for being fully involved. This might be because of the situation, or because it just happened that way. Either way, you have options."

Not clinical, not judgemental.

---

## Section M. Accessibility, dark mode, design tokens

### M.1 UXF-1 v3

All new components use UXF-1 v3 tokens.

### M.2 Dark mode

All new surfaces render in light, dark, and system modes.

### M.3 WCAG 2.1 AAA

Standard.

### M.4 Voice check accessibility

The voice check may be used by participants with lower digital comfort. Considerations:
- Larger default text (16px minimum, 18px for content)
- High-contrast focus indicators
- Clear answer buttons (no ambiguous icons)
- Ability to pause and resume without losing progress
- Optional caregiver assistance without disabling participant control

### M.5 Screen reader

- Goal list uses `<ul>` semantic markup
- Voice check uses `<form>` semantics with clear labels
- Timeline view uses `<ol>` with chronological ordering

### M.6 Reduced motion

Voice check progress indicators respect `prefers-reduced-motion`.

---

## Section N. Privacy considerations

### N.1 No new sensitive data category beyond FC-2 precedent

CPR-2 v1 extends CPR-1 which is already covered by Privacy Policy. Participant voice check content is sensitive but follows FC-2 v1's posture (no automatic disclosure, participant control, sensitive content resource offering).

### N.2 Privacy Policy amendment

Recommend minor clarifying update to reference participant voice check as a distinct module. Not a launch gate.

Sequence: Privacy Policy v1.10 (following LF-2 v1's v1.9).

### N.3 Similar-profile comparison data disclosure

The comparison discloses that Wayly uses Program Manual guidance (or aggregated data in v2). Users should understand what they're being compared against.

### N.4 Sensitive content detection

Applied to voice check content per FC-2 posture. Resource offering, no automatic disclosure.

---

## 2. Locked decisions

1. **CPR-1 preservation.** All existing behaviour preserved.
2. **Support Plan primary label.** With Care Plan alias for search visibility.
3. **Rename messaging.** One-time notification on first CPR-2 login.
4. **Goal extraction confidence display.** If Phase 0 shows recall below 90%, confidence displayed per goal and user confirms.
5. **Goal ledger status transitions.** User-initiated primarily; automatic supersession when new plan clearly replaces goal (with user confirmation).
6. **Re-review evaluation rules.** Not every legislative change triggers re-review. Rules per Section G.2.
7. **Re-review deferral.** Users can defer to a specific date; re-prompt at that date.
8. **Voice check participant-first framing.** For participant persona, prominent and welcoming.
9. **Voice check overall findings.** Auto-derived from goal-by-goal answers; user can override.
10. **Voice check sensitive content.** Same posture as FC-2 (no automatic disclosure).
11. **Similar-profile v1 data source.** Program Manual guidance.
12. **Similar-profile framing.** Exploratory, not judgemental.
13. **Case creation from findings.** User confirms; not automatic.
14. **Goal ledger cross-tool integration.** Appears in profile, handover pack, letter templates.
15. **Data residency.** ap-southeast-2 for all new writes.
16. **Feature flag.** `cpr_2_v1_features` gates all CPR-2 v1 additions.
17. **CORE-1 timeline events.** All meaningful CPR-2 v1 actions.
18. **Persona rendering.** Every string in both variants per PERSONA-1.
19. **Editorial standard.** All content passes editorial QA.
20. **Retention.** New collections retained per participant life.
21. **URL redirect for rename.** Old URL redirects to new URL.
22. **Backward compatibility.** Care Plan Reviewer slug remains as alias in internal API and search.
23. **Similar-profile v2 data source.** Aggregated de-identified user data when threshold and consent model available.
24. **Voice check when participant unable.** Caregiver can author on behalf; participant confirms when possible.
25. **Privacy Policy amendment.** Minor clarifying update recommended, not a launch gate.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit including rename inventory (Section A)
- **WS2.** PlanReview schema extension (Section B.1)
- **WS3.** GoalLedgerEntry data model and persistence (Sections B.2, C.1)
- **WS4.** ReReviewPrompt data model and persistence (Sections B.3, C.1)
- **WS5.** ParticipantVoiceCheck data model and persistence (Sections B.4, C.1)
- **WS6.** SimilarProfileComparison data model and persistence (Sections B.5, C.1)
- **WS7.** Goal extraction engine enhancements (Section F.4)
- **WS8.** Goal ledger list and detail surface (Sections F.2, F.3)
- **WS9.** Cross-plan goal matching and status transitions (Sections F.4, F.5)
- **WS10.** Goal ledger timeline view (Section F.6)
- **WS11.** LCA-1 event subscription for re-review triggers (Sections G.1, G.2)
- **WS12.** Re-review prompt notification and surface (Sections G.3, G.4)
- **WS13.** Re-review flow walkthrough (Section G.5)
- **WS14.** Participant voice check surface (Section H)
- **WS15.** Voice check goal-by-goal review (Section H.3)
- **WS16.** Voice check overall finding computation (Section H.4)
- **WS17.** Voice check follow-up actions (Section H.5)
- **WS18.** Voice check sensitive content detection (Section H.7)
- **WS19.** Voice check caregiver-on-behalf flow (Section H.6)
- **WS20.** Similar-profile comparison engine (Section I)
- **WS21.** Similar-profile data source integration (Section I.5)
- **WS22.** Support Plan rename across all surfaces (Section E)
- **WS23.** URL redirect and backward compatibility (Section E.2)
- **WS24.** Rename notification (Section E.3)
- **WS25.** Case creation from plan findings (Section J)
- **WS26.** CORE-1 integration and timeline events (Section K.1)
- **WS27.** LOOP-1 case creation (Section K.2)
- **WS28.** FC-2 voice note and handover pack integrations (Section K.4)
- **WS29.** LF-1 v1.2 / LF-2 v1 hand-off integrations (Section K.5)
- **WS30.** Persona-aware rendering integration (Section L)
- **WS31.** UXF-1 v3, dark mode, WCAG, voice check accessibility (Section M)
- **WS32.** PostHog event schema (see 3.1)
- **WS33.** Feature flag and rollback
- **WS34.** CPR-1 regression test suite integration
- **WS35.** Privacy Policy clarifying update (Section N.2)

### 3.1 PostHog event schema

- `support_plan_reviewer_renamed_notification_shown`
- `goal_extracted_from_plan` (extraction_confidence, goal_type)
- `goal_extraction_user_confirmed`
- `goal_status_changed` (from, to, reason)
- `goal_appears_in_new_plan` (goal_type)
- `goal_meeting_note_added`
- `goal_ledger_timeline_viewed`
- `re_review_prompt_created` (triggered_by, lca_1_change_id)
- `re_review_prompt_shown_to_user`
- `re_review_user_response` (response)
- `re_review_flow_completed`
- `participant_voice_check_initiated` (initiator: participant | caregiver_on_behalf)
- `voice_check_goal_answered` (answer, goal_type)
- `voice_check_completed` (overall_finding, goals_reviewed_count)
- `voice_check_follow_up_action_taken` (action)
- `voice_check_sensitive_content_flagged`
- `similar_profile_comparison_run` (classification_band, data_source)
- `similar_profile_outlier_findings_shown` (finding_count)
- `similar_profile_hand_off_clicked` (target_tool)
- `case_created_from_plan_finding` (finding_severity)

---

## 4. Rollback plan

### 4.1 Feature flag

`cpr_2_v1_features` gates all CPR-2 v1 additions. When off:
- Support Plan label reverts to Care Plan label
- URL redirects still work
- Goal ledger routes return 404
- Re-review prompt routes return 404
- Voice check routes return 404
- Similar-profile comparison routes return 404
- Case creation from plan findings reverts to CPR-1 flow

CPR-1 behaviour preserved.

### 4.2 Rollback triggers

- Goal extraction producing widespread incorrect data
- Rename causing user confusion (measurable via support requests)
- Voice check triggering unintended sensitive content detection
- Similar-profile comparison producing misleading findings
- LCA-1 event integration causing spurious re-review prompts

### 4.3 Data retention during rollback

All data retained. Flag re-enable restores.

### 4.4 CPR-1 independence

CPR-1 operates without CPR-2 v1. Turning CPR-2 v1 off does not regress CPR-1.

---

## 5. Acceptance tests

Fifty-six tests across twelve categories.

### 5.1 CPR-1 preservation

1. **T1.** Document ingestion for PDF, DOCX, image with OCR preserved.
2. **T2.** Care Plan Store versioning and soft-delete restore preserved.
3. **T3.** Structured analysis with per-finding citations preserved.
4. **T4.** Meeting artefact output preserved.
5. **T5.** Family Coordinator sharing preserved.

### 5.2 Support Plan rename

6. **T6.** Every user-facing string per rename inventory updated.
7. **T7.** URL redirect from `/app/tools/care-plan-reviewer` to `/app/tools/support-plan-reviewer` works.
8. **T8.** Internal API alias `care_plan_reviewer` redirects to `support_plan_reviewer`.
9. **T9.** Search meta preserves "care plan reviewer" keyword.
10. **T10.** Rename notification shown once per user on first CPR-2 login.

### 5.3 Goal ledger

11. **T11.** Goal extraction from uploaded plan produces candidates with confidence.
12. **T12.** User confirmation dialog shown for extracted goals.
13. **T13.** Matching against existing ledger entries proposes correct matches on fuzzy text.
14. **T14.** New plan uploads extend appears_in_plan_ids for matched goals.
15. **T15.** Removed goals transition to `dropped_by_provider` with user confirmation.
16. **T16.** Goal status transitions persist correctly.
17. **T17.** Meeting notes attach to goals correctly.
18. **T18.** Timeline view renders chronologically.

### 5.4 Re-review prompts

19. **T19.** LCA-1 event with affected `support_plan_reviewer` creates ReReviewPrompt for relevant participants.
20. **T20.** Legislative changes not affecting active plans do not create prompts.
21. **T21.** Prompt notification fires correctly.
22. **T22.** User response (dismiss, defer, start) persists.
23. **T23.** Deferred prompts re-prompt at deferred_until date.
24. **T24.** Re-review flow walkthrough highlights affected plan sections.
25. **T25.** New plan upload after re-review sets new_plan_review_id.

### 5.5 Participant voice check

26. **T26.** Voice check for participant persona prominently offered after plan upload.
27. **T27.** Goal-by-goal review displays each goal with question and answer options.
28. **T28.** Overall finding auto-derived correctly from answer distribution.
29. **T29.** User can override overall finding.
30. **T30.** Follow-up actions offered based on finding.
31. **T31.** Caregiver-on-behalf flow flagged and requires participant confirmation.
32. **T32.** Sensitive content detection triggers resource panel per FC-2 posture.
33. **T33.** FC-2 voice notes with shared visibility read as context.
34. **T34.** Voice check output can save as FC-2 voice note via follow-up.

### 5.6 Similar-profile comparison

35. **T35.** Comparison for Classification 5 participant renders against Program Manual guidance.
36. **T36.** Outlier findings identify significantly more, significantly less, absent, and atypical services.
37. **T37.** Overall summary tokens render persona-appropriately.
38. **T38.** Data source disclosed on view.
39. **T39.** Hand-off to letter, plan review, and goal ledger updates work.

### 5.7 Case creation

40. **T40.** Findings above notable severity offer case creation.
41. **T41.** User confirmation required; not automatic.
42. **T42.** LOOP-1 case created with correct case_type and metadata.
43. **T43.** Hand-off from case to LF-1 v1.2 with prefill works.

### 5.8 Integrations

44. **T44.** CORE-1 timeline events written for all instrumented actions.
45. **T45.** FC-2 voice notes read correctly.
46. **T46.** FC-2 handover pack includes goal ledger.
47. **T47.** LF-1 v1.2 hand-offs prefill correctly.
48. **T48.** LCA-1 event subscription active and firing correctly.
49. **T49.** SD-3 cross-reference identifies plan-vs-statement discrepancies.
50. **T50.** BC-2 coordination checks plan-service to budget-allocation alignment.

### 5.9 Persona and editorial

51. **T51.** All strings pass PERSONA-1 audit.
52. **T52.** Participant voice check tone reviewed and approved for participant-first framing.
53. **T53.** Provider-led and participant-absent finding tones non-accusatory.
54. **T54.** All strings pass editorial QA.

### 5.10 Accessibility

55. **T55.** All new surfaces render in light, dark, system modes at WCAG 2.1 AAA.
56. **T56.** Voice check surface passes accessibility with larger text and clear affordances.

---

## 6. Delivery notes

### 6.1 CPR-1 regression status

Delivery notes confirm all CPR-1 tests pass.

### 6.2 Rename inventory completion

Delivery notes confirm rename inventory produced in Phase 0 A.2 has been executed, with each entry marked complete or explicitly deferred with rationale.

### 6.3 Goal extraction reliability

Delivery notes report goal extraction recall on fixture set. If below 90%, confidence displayed per goal and user confirms per locked decision 4.

### 6.4 Similar-profile data source posture

Delivery notes confirm data source is Program Manual guidance for v1, with data source disclosure in the UI.

### 6.5 LCA-1 event integration verified

Delivery notes confirm end-to-end LCA-1 event triggering ReReviewPrompt creation.

### 6.6 Voice check editorial review

Delivery notes confirm participant voice check copy reviewed for tone per Section L.

### 6.7 Sensitive content detection tuning

Delivery notes report sensitive content detection triggering on fixture set.

### 6.8 Cross-tool integrations

Delivery notes confirm FC-2 voice note reading, handover pack integration, LF-1 v1.2 hand-offs, and SD-3 cross-reference all functional.

---

## 7. Explicit v2 candidates

Items deferred from CPR-2 v1.

1. **Aggregated de-identified user data as similar-profile source.** Requires consent model, minimum aggregate threshold, re-identification risk analysis.
2. **Multi-participant plan comparison for adviser tier.** Comparing plans across multiple clients for pattern insights. Adviser-tier feature.
3. **AI-suggested goal refinement.** LLM-suggested rewording of goals for clarity. ADM disclosure concern.
4. **Automated goal-outcome correlation.** Tracking whether specific goals correlated with better outcomes (statistical work; ethical review needed).
5. **Provider-side plan comparison.** How does this provider's typical plan compare to other providers. Requires cross-participant provider aggregation.
6. **Plan lineage across providers.** When a participant switches providers, tracking plan continuity.
7. **Rich media evidence for voice check.** Audio recordings of the plan development meeting. Consent and storage considerations.
8. **Automated re-review scheduling.** Beyond legislative changes, cadence-based re-review reminders (annual, biannual).
9. **CPR export for legal representative.** Bundle of plan reviews and voice checks for advocate or lawyer. Deferred pending solicitor review.
10. **Multi-language plan support.** For CALD community plans. Deferred.
11. **Cross-plan goal similarity across participants.** For research or advocacy purposes. Privacy-sensitive.
12. **Participant voice video content.** Beyond text, video expression. Storage and consent considerations.

---

## 8. Change log

- **v1** (this document): initial CPR-2 spec. Support Plan rename across all surfaces with Care Plan alias for search. Goal ledger with extraction, matching, status tracking, cross-plan appearance, meeting notes, timeline view. Legislative-change-triggered re-review with LCA-1 event subscription. Participant voice check as first-class module with participant-first framing and follow-up actions. Similar-profile comparison with Program Manual guidance for v1 and outlier findings. Case creation from plan findings with user confirmation. Fifty-six acceptance tests. Minor Privacy Policy clarifying update recommended.

---

**End of CPR-2 v1 handoff prompt.**
