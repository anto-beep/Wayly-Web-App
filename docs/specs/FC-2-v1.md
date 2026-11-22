# FC-2 v1: Family Coordinator v2

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (soft dependency), SD-3 v1 (calendar seed data), BC-2 v1 (handover pack data), CPR-1 (handover pack data), CPR-2 (soft dependency, forward-declared), LF-1 v1.2 (correspondence handoff), CMP-1 (incident log source), SDL-1 (calendar attendance sink and incident log source)
**Predecessor:** Family Coordinator v1 (FC-1, shipped, 120 lines of frontend)
**Successor:** FC-2 v2 will add worker directory contact management, calendar sync to external services, and rich media in voice notes. Scheduled after FC-2 v1 stabilises.
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

Family Coordinator v1 is a permissions layer. It handles household membership and role-based access (owner, member, view-only) for up to five family members. The frontend is 120 lines. Compared to Statement Decoder's 403 lines, Care Plan Reviewer's 168 lines, or Contribution Estimator's 291 lines, FC-1 is the thinnest tool by a wide margin. The gap between what "Family Coordinator" promises and what FC-1 delivers is a trust risk. Community feedback names the missing pieces plainly: who's picking up Dad's script this week, when is the cleaner coming, who called the provider about the missed visit, what happens if the primary caregiver is unavailable.

FC-2 v1 addresses six functional gaps identified in the PROGRAM-1 gap scrutiny:

1. Task assignment: household members can create, assign, and complete tasks
2. Shared service calendar: aggregated from care plan schedule, statement patterns, and manual entry
3. Handover pack: single-click PDF for when the primary caregiver is unavailable
4. Incident log: cross-tool aggregate of issues (missed visits, letters sent, cases open, complaints filed)
5. Message thread: async messages between household members scoped to the participant
6. Participant voice capture: a first-class surface for the participant to record their own preferences, wishes, and feedback

The participant voice capture is the flagship feature. FC-1's participant persona is second-class in scope. Everything the tool does today serves caregivers. FC-2 v1 explicitly promotes the participant to first-class: they can express what they want, they can flag concerns, and they can control who sees what. This aligns with PERSONA-1's principles and directly addresses the persona integrity failure identified in the scrutiny.

FC-2 v1 is a P1 workstream in PROGRAM-1 Phase C. It ships after CORE-1, LOOP-1, and SD-3 v1 are stable.

Excluded from Wayly's lane and confirmed out of scope: shift management, timesheet approval, worker payroll. FC-2 does not manage workers; it coordinates the household.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model
- **Section C:** Persistence surface
- **Section D:** Internal APIs
- **Section E:** Tasks surface
- **Section F:** Shared calendar surface
- **Section G:** Incident log surface (aggregated view)
- **Section H:** Message thread surface
- **Section I:** Participant voice capture surface
- **Section J:** Handover pack generation
- **Section K:** Integration seams
- **Section L:** Persona-aware rendering with participant-first design for voice
- **Section M:** Accessibility, dark mode
- **Section N:** Elder abuse safeguards and crisis pathway
- **Section O:** Privacy Policy amendment

Four risks Emergent must surface in delivery notes on first commit:

1. **FC-1 preservation.** FC-1's household membership, role-based access, and permission checks remain unchanged. Every FC-1 acceptance test remains valid.
2. **Participant voice legal opinion.** The participant voice capture module cannot launch without solicitor sign-off on retention, visibility, and mandatory report triggers per PROGRAM-1 open item 6 (indefinite retention until explicit deletion, active-case content retained until case closure). If the solicitor opinion is not received in time, the module ships behind a distinct feature flag with the rest of FC-2 v1 launching without it.
3. **Elder abuse indicator handling.** Any content in voice notes or messages that includes indicators of elder abuse triggers a support-resource offer to the participant. It does not trigger automatic disclosure to caregivers or authorities. This is a specific product-design choice with legal implications; the solicitor package must confirm.
4. **Calendar aggregation reliability.** Statement-pattern detection proposes recurring calendar entries for user acceptance, deterministic (same-day same-service across weeks), not AI-inferred. False positives from noisy statement data are acceptable; false negatives (missing an actual recurring service) are worse.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/FC-2-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 FC-1 preservation inventory

Report FC-1's existing household model, role definitions, access checks, and UI surfaces. FC-2 v1 preserves all of it.

### A.2 CORE-1 household model integration

Confirm CORE-1 exposes the household model via internal API per CORE-1 Section D. FC-2 reads household membership, participant assignments, and roles from CORE-1 without duplicating.

### A.3 LOOP-1 case data access

Confirm LOOP-1 exposes cases via internal API. FC-2's incident log reads open, resolved, and escalated cases per participant.

### A.4 SD-3 decoded statement pattern data

Report the shape of SD-3's decoded statement line items. FC-2's calendar aggregation runs deterministic pattern detection over these (same day of week, same service code, at least three occurrences in the last 90 days = candidate recurring entry). Confirm data structure supports this.

### A.5 CPR-1 and CPR-2 plan data

Report whether CPR-1 exposes any machine-readable schedule from an uploaded plan. If not, calendar entries from care plans wait until CPR-2's structured plan data is available. Manual entry and statement patterns cover v1.

### A.6 BC-2 living projection data

Confirm BC-2 exposes projection data via internal API. FC-2's handover pack includes current budget position.

### A.7 CMP-1 and SDL-1 data (forward-declared)

Both are forward-declared per PROGRAM-1. FC-2's incident log includes an entry type for each; entries are populated when the source tools ship. Until then, entry types exist in the aggregation code but produce no rows.

### A.8 LF-1 v1.2 correspondence data

Confirm LF-1 v1.2 exposes sent letters and correspondence log via internal API. FC-2's incident log includes letters as entries.

### A.9 PDF generation infrastructure

Handover pack is a PDF. Report existing PDF generation library or service in use in Wayly (jsPDF, Puppeteer server-side, external service). Recommend using existing infrastructure rather than introducing a new one.

### A.10 Australian data residency and existing solicitor sequence

Confirm ap-southeast-2 for all new collections. Confirm current Privacy Policy amendment sequence and add FC-2's amendment to the queue (see Section O.2 sequencing).

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model

### B.1 Task

```
Task {
  id: UUID
  participant_id: UUID (foreign key to Participant per CORE-1)
  household_id: UUID (denormalised)
  title: string (max 200 chars)
  description: string (max 2000 chars, optional)
  assignee_user_id: UUID | null (unassigned tasks allowed)
  due_date: date | null
  status: enum { open, in_progress, done, cancelled }
  created_by_user_id: UUID
  created_at: timestamp
  updated_at: timestamp
  completed_at: timestamp | null
  completed_by_user_id: UUID | null
  cancelled_at: timestamp | null
  cancelled_by_user_id: UUID | null
  data_residency: string (must be "ap-southeast-2")
}
```

Deliberately simple. No priorities, subtasks, tags, or projects. A household that needs those uses a dedicated task manager.

### B.2 Calendar entry

```
CalendarEntry {
  id: UUID
  participant_id: UUID
  household_id: UUID
  entry_type: enum { care_service, medical_appointment, care_plan_review, family_visit, other }
  title: string (max 200 chars)
  notes: string (max 2000 chars, optional)

  // Timing
  start_datetime: timestamp
  end_datetime: timestamp | null
  timezone: string (default Australia/Sydney)
  is_all_day: boolean

  // Recurrence
  recurrence: {
    pattern: enum { weekly, fortnightly, monthly }
    day_of_week: integer | null  // For weekly and fortnightly
    day_of_month: integer | null  // For monthly
    starts_on: date
    ends_on: date | null  // Null = ongoing
  } | null

  // Provenance
  source: enum { manual, statement_pattern_proposed, statement_pattern_confirmed, care_plan, external }
  source_reference_id: UUID | null  // Links to SD-3 statement, CPR-1/2 plan, etc.

  // Service context
  service_type: string | null  // From SD-3's service type enum
  provider_name: string | null
  expected_worker_name: string | null

  // Attendance tracking (feeds SDL-1)
  attendance_status: enum { expected, confirmed_present, confirmed_missed, disputed, unknown }
  attendance_confirmed_by_user_id: UUID | null
  attendance_confirmed_at: timestamp | null
  attendance_notes: string | null

  created_by_user_id: UUID
  created_at: timestamp
  updated_at: timestamp
  data_residency: string
}
```

Attendance status is stored on the calendar entry and is the source of truth SDL-1 consumes when it ships. FC-2 v1 populates it; SDL-1 v1 reads it and builds the attendance log surface.

### B.3 Household message

```
HouseholdMessage {
  id: UUID
  participant_id: UUID  // Scoped per participant, not per household globally
  household_id: UUID
  author_user_id: UUID
  content: string (max 5000 chars)
  reply_to_message_id: UUID | null  // Threading
  edited_at: timestamp | null
  deleted_at: timestamp | null  // Soft delete; author can delete their own message
  read_by_user_ids: UUID[]  // Who has viewed this message
  created_at: timestamp
  data_residency: string
}
```

Message thread is per participant. Households managing two participants have two message threads.

### B.4 Participant voice note

The sensitive one. Explicit visibility control.

```
ParticipantVoiceNote {
  id: UUID
  participant_id: UUID
  author_user_id: UUID  // Who wrote the note (typically the participant themselves)
  authored_on_behalf: boolean  // True if a caregiver recorded participant's spoken input
  authored_on_behalf_of_participant_confirmation: boolean  // Did the participant confirm the caregiver's write-up

  category: enum {
    preferences_care_style,  // "I prefer showers to baths"
    preferences_daily_routine,  // "I like a cup of tea at 10am"
    preferences_communication,  // "Please speak slowly and don't rush me"
    wishes_future,  // "If I need more help, I'd like to stay at home"
    feedback_on_care_quality,
    feedback_on_specific_worker,
    concerns_or_worries,
    values_and_dignity,  // "I want to remain independent as much as possible"
    other
  }

  content: string (max 5000 chars)

  visibility: enum {
    private_to_participant,
    shared_with_household,
    shared_with_specific_caregivers
  }
  shared_with_user_ids: UUID[]  // For shared_with_specific_caregivers only

  // Sensitive content detection
  contains_sensitive_content_flag: enum { none, distress, elder_abuse_indicators, harm_disclosure, other_sensitive }
  sensitive_content_reviewed_by_participant: boolean
  crisis_resources_offered_at: timestamp | null

  created_at: timestamp
  updated_at: timestamp
  data_residency: string
}
```

### B.5 Handover pack

Generated on demand, not persisted as a document. Metadata about generation events persisted:

```
HandoverPackGeneration {
  id: UUID
  participant_id: UUID
  generated_by_user_id: UUID
  generated_at: timestamp
  content_snapshot_hash: string  // Hash of the content included
  file_size_bytes: integer
  purpose: enum { primary_caregiver_absence, hospital_visit, provider_change, other }
  purpose_notes: string | null
}
```

Purpose captured for later review and for informing the pack content weighting (a hospital visit pack emphasises different content than a caregiver absence pack).

### B.6 Incident log (view, not stored)

Aggregated read-only view over:
- LOOP-1 cases for the participant with status open, awaiting_response, or escalated
- SDL-1 attendance discrepancies (when SDL-1 ships)
- LF-1 v1.2 sent letters
- CMP-1 complaints in flight (when CMP-1 ships)

Sort by most recent activity descending. No persistent incident record; the log is a query.

---

## Section C. Persistence surface

### C.1 New collections

- `tasks` (see B.1, indexed on `participant_id, status, due_date`)
- `calendar_entries` (see B.2, indexed on `participant_id, start_datetime`)
- `household_messages` (see B.3, indexed on `participant_id, created_at DESC`)
- `participant_voice_notes` (see B.4, indexed on `participant_id, category, visibility`)
- `handover_pack_generations` (see B.5, indexed on `participant_id, generated_at DESC`)

All in MongoDB Atlas ap-southeast-2.

### C.2 Retention

- Tasks retained for the life of the participant. Completed and cancelled tasks archived to a `tasks_archive` view after 12 months but still queryable.
- Calendar entries retained for the life of the participant. Past entries older than 24 months archived similarly.
- Household messages retained per PROGRAM-1 open item 6 (locked): indefinite retention until explicit deletion request; active-case content retained until case closure regardless of individual deletion request.
- Participant voice notes retained per the same locked policy. Deletion by author is a soft delete that hides content immediately from all viewers; hard delete after 30 days per Wayly convention.
- Handover pack generation metadata retained indefinitely; the packs themselves are not stored (generated on demand).

### C.3 Author deletion rights

- Task creator can delete their own task if no one else has interacted (assignee not set, status still open). Otherwise cancel is the appropriate action.
- Calendar entry creator can edit or delete their own entries. Statement-pattern entries can be dismissed but not deleted (dismiss hides them).
- Household message author can edit for 15 minutes; soft-delete indefinitely with a "deleted" placeholder shown.
- Voice note author can edit or delete at any time. If part of an active case, deletion is soft with the content hidden but the record retained until case closure.

---

## Section D. Internal APIs

### D.1 Tasks

```
GET /internal/participants/[id]/tasks?status=[filter]&assignee_user_id=[filter]&limit=[n]&offset=[n]
Returns: paginated Task[]
```

Default excludes cancelled tasks. `include_cancelled=true` includes them.

```
POST /internal/participants/[id]/tasks
Body: { title, description, assignee_user_id (optional), due_date (optional) }
Returns: Task
```

```
PATCH /internal/tasks/[id]
Body: partial fields (title, description, assignee_user_id, due_date, status)
Returns: updated Task
```

```
POST /internal/tasks/[id]/complete
Body: { completed_by_user_id, completion_note (optional) }
Returns: updated Task with status: done
```

```
POST /internal/tasks/[id]/cancel
Body: { cancelled_by_user_id, cancellation_reason }
Returns: updated Task
```

### D.2 Calendar

```
GET /internal/participants/[id]/calendar?start_date=[date]&end_date=[date]&entry_type=[filter]
Returns: CalendarEntry[] expanded from recurrence patterns
```

For recurring entries, expand into individual occurrences within the date range for the response. Storage is the recurrence config; response is expanded occurrences.

```
POST /internal/participants/[id]/calendar
Body: { entry_type, title, start_datetime, end_datetime, recurrence, service_type, provider_name, ...B.2 fields except source }
Returns: CalendarEntry with source: manual
```

```
PATCH /internal/calendar-entries/[id]
Body: partial fields; if recurrence changes, existing occurrences update from now forward
Returns: updated CalendarEntry
```

```
DELETE /internal/calendar-entries/[id]
```

For statement-pattern entries: dismiss instead of delete.

```
POST /internal/calendar-entries/[id]/dismiss
Body: { dismissed_by_user_id }
Sets source to statement_pattern_dismissed; hides from calendar.
```

```
POST /internal/participants/[id]/calendar/detect-patterns
Runs pattern detection over SD-3 decoded statements; returns proposed CalendarEntry[] in status statement_pattern_proposed.
```

```
POST /internal/calendar-entries/[id]/confirm-attendance
Body: { attendance_status: confirmed_present | confirmed_missed | disputed, attendance_notes (optional), confirmed_by_user_id }
Returns: updated CalendarEntry
```

If attendance_status is `disputed`, a LOOP-1 case opens with case_type `delivery_discrepancy` per SD-3 v1's Section J pattern.

### D.3 Messages

```
GET /internal/participants/[id]/messages?before=[timestamp]&limit=[n]
Returns: paginated HouseholdMessage[] in reverse chronological
```

```
POST /internal/participants/[id]/messages
Body: { content, reply_to_message_id (optional), author_user_id }
Returns: HouseholdMessage
```

```
PATCH /internal/messages/[id]
Body: { content }  // Only within 15-minute edit window
```

```
DELETE /internal/messages/[id]
Soft delete; content hidden with "deleted" placeholder.
```

```
POST /internal/messages/[id]/mark-read
Body: { user_id }
```

### D.4 Participant voice notes

```
GET /internal/participants/[id]/voice-notes?category=[filter]&visibility=[filter]
Returns: ParticipantVoiceNote[]
```

Authorisation is stricter for voice notes:
- Author sees all their own notes regardless of visibility
- Other household members see only notes with `visibility: shared_with_household` or `visibility: shared_with_specific_caregivers` where they are in `shared_with_user_ids`
- Private notes are visible only to the author

```
POST /internal/participants/[id]/voice-notes
Body: { author_user_id, authored_on_behalf, category, content, visibility, shared_with_user_ids }
Returns: ParticipantVoiceNote
```

On write, content is scanned for sensitive-content indicators per Section N. If flagged, response includes crisis resources; UI surfaces them.

```
PATCH /internal/voice-notes/[id]
Body: partial fields (category, content, visibility, shared_with_user_ids)
Only the author can modify.
```

```
DELETE /internal/voice-notes/[id]
Soft delete by author; hidden immediately; hard delete after 30 days.
```

```
POST /internal/voice-notes/[id]/confirm-caregiver-write-up
Body: { confirmed_by_participant_user_id }
For notes authored_on_behalf: participant confirms the caregiver's write-up.
```

### D.5 Incident log

```
GET /internal/participants/[id]/incident-log?since=[date]&limit=[n]&types=[filter]
Returns: [
  {
    id, source_tool, source_reference_id, event_type, timestamp, summary_tokens, url, status
  }
]
```

Aggregates from LOOP-1 cases, SDL-1 (when shipped), LF-1 v1.2 letters, CMP-1 (when shipped). No persistent incident records; this is a query.

### D.6 Handover pack

```
POST /internal/participants/[id]/handover-pack
Body: { purpose, purpose_notes (optional), generated_by_user_id }
Returns: {
  generation_id,
  pdf_download_url (short-lived, signed URL, expires in 15 minutes),
  content_summary: {
    included_sections: string[]
  }
}
```

PDF is generated synchronously and streamed to a temporary storage location. URL is signed and expires. Metadata about the generation is persisted per B.5.

### D.7 Authorisation

Every endpoint scoped by household membership per CORE-1 pattern. Voice notes have additional visibility check per D.4.

---

## Section E. Tasks surface

### E.1 Route

`/app/participants/[id]/tasks`

Also accessible from participant profile page (CORE-1) via a "Tasks" card showing open tasks assigned to the current user and unassigned tasks.

### E.2 Task list layout

Filter chips: All, Assigned to me, Unassigned, Due this week, Overdue, Completed
Sort: due date ascending (default), created date descending, alphabetical

Each task renders as a compact card:
- Checkbox to complete
- Title
- Assignee avatar and name (or "Unassigned" chip)
- Due date (with overdue highlight if past)
- Comment count if any (v2 feature; hidden in v1)

### E.3 Task detail

Click opens a modal with:
- Title (editable)
- Description (editable)
- Assignee (change via dropdown of household members)
- Due date (change via date picker)
- Status (change via dropdown)
- Created by, created date (read-only)
- Actions: Mark done, Cancel, Delete (if eligible)

### E.4 Task creation

Compact form: title (required), assignee (optional), due date (optional), description (optional). Submit creates and adds to the list.

### E.5 Empty state

Persona-aware:
- Caregiver: "No tasks yet. Add one for anything that needs doing for [participant name]: collect a prescription, call the provider, drop off a form."
- Participant self: "No tasks yet. Add one for anything that needs doing: call the provider, follow up on a letter, ask a family member to help with something."

---

## Section F. Shared calendar surface

### F.1 Route

`/app/participants/[id]/calendar`

Also embedded as a "Next 7 days" card on the participant profile page (CORE-1).

### F.2 Calendar views

- Week view (default): 7 days, hourly granularity for scheduled entries; all-day entries at top
- Month view: high-level view for planning
- Agenda view: chronological list of upcoming entries

Toggle between views.

### F.3 Entry rendering

Each entry shows:
- Time or "All day"
- Title
- Entry type icon
- Provider name (if applicable)
- Attendance status badge (expected, confirmed present, confirmed missed, disputed)

Click opens detail.

### F.4 Entry detail

Modal with:
- Title
- Timing
- Provider and expected worker (if applicable)
- Notes
- Recurrence details (if recurring)
- Source badge (Manual, From statements, From care plan)
- Attendance confirmation UI:
  - "Did this service happen as expected?" with buttons: Yes, No, Different than expected, Not sure

### F.5 Attendance confirmation flow

Confirming "Yes": sets attendance_status to `confirmed_present`.

Confirming "No" or "Different than expected": opens a submodal:
- Reason dropdown (worker didn't arrive, service was shorter, service was different, participant was absent, other)
- Notes field
- Submit: sets attendance_status to `confirmed_missed` or `disputed`; opens LOOP-1 case with case_type `delivery_discrepancy` per SD-3 Section J pattern

"Not sure": no status change; entry remains at `expected`.

### F.6 Add entry

Manual entry button on the calendar surface.

### F.7 Pattern detection

Button: "Detect recurring services from your statements." Runs pattern detection per D.2. Returns proposed entries. UI presents each with accept and dismiss buttons.

Detection logic: for each service type per provider, if the same day of week appears in at least 3 statements in the last 90 days, propose a weekly recurrence. Same for fortnightly (every second occurrence).

### F.8 Feed to SDL-1

When SDL-1 ships, its attendance log reads from calendar entries with attendance_status set. FC-2 v1 populates the field; SDL-1 v1 consumes it. No FC-2 v1 dependency on SDL-1.

### F.9 Empty state

Persona-aware:
- Caregiver: "No services scheduled. Add [participant name]'s regular services, or detect them from statements."
- Participant self: "No services scheduled. Add your regular services, or detect them from statements."

---

## Section G. Incident log surface

### G.1 Route

`/app/participants/[id]/incidents`

Also embedded as an "Open incidents" card on the participant profile page (CORE-1).

### G.2 Aggregated view

Chronological list showing:
- LOOP-1 cases: open, awaiting_response, escalated
- SDL-1 attendance issues (when SDL-1 ships): confirmed_missed, disputed
- LF-1 v1.2 letters: sent within the last 30 days awaiting response
- CMP-1 complaints (when CMP-1 ships): in flight

Each row:
- Icon per incident type
- Summary line (from source tool)
- Provider name if applicable
- Days open or last activity date
- Status pill
- Deep link to source tool detail

### G.3 Filters

By type: cases, attendance issues, letters, complaints
By status: open, awaiting response, escalated, resolved
By time: last 7 days, last 30 days, all

### G.4 Empty state

Persona-aware:
- Caregiver: "No incidents right now. When something goes wrong (missed visit, dispute, complaint), you'll see it here."
- Participant self: same framing, "I" pronouns.

### G.5 No new persistence

Incident log is a query. No new records created by this surface itself. Actions (marking a case resolved, replying to a letter) route to the source tool.

---

## Section H. Message thread surface

### H.1 Route

`/app/participants/[id]/messages`

Also accessible as a "Messages" tab on the participant profile page (CORE-1) with unread badge count.

### H.2 Thread layout

Reverse-chronological (most recent at bottom, conventional messaging pattern).

Each message shows:
- Author avatar and name
- Content
- Timestamp (relative for recent, absolute for older)
- Edit indicator if edited
- Read receipts (compact avatar row of who has read it)
- Reply, delete affordances

### H.3 Threading

Replies to a specific message render inline as a compact chain. Not full nested threading; one level deep.

### H.4 Composition

Textarea at the bottom, always visible. Submit on Ctrl or Cmd + Enter, or via button.

Character count (max 5000) shown when approaching limit.

### H.5 Edit and delete

Author-only. Edit within 15 minutes. Soft delete indefinitely.

### H.6 Notifications

New messages trigger in-app notifications per LOOP-1's notification pattern (reused infrastructure). Notification recipients: all household members with access to the participant, excluding the message author.

Batched to prevent spam: if the same author sends multiple messages within 5 minutes, one aggregated notification.

### H.7 Empty state

Persona-aware:
- Caregiver: "No messages yet. Use this to coordinate with other family members about [participant name]'s care."
- Participant self: "No messages yet. Use this to talk to your family about your care."

---

## Section I. Participant voice capture surface

### I.1 Route

`/app/participants/[id]/voice`

Prominently placed. For the participant persona, this is featured on their profile page as a primary surface, not a secondary tab.

### I.2 Participant-first design

For a participant-self persona user, the surface framing is:

> "This is your space to say what you want, how you want to be cared for, and what matters to you. What you write here helps your family and providers understand you better, and gives you a place to record things privately if you want to."

For a caregiver persona user, the framing is:

> "This is [participant name]'s voice: their own preferences, wishes, and feedback. Where they've shared with you, you can read it. If you're helping them record something, mark it as recorded on their behalf and check with them."

### I.3 Note categories

Categories per B.4:
- Preferences: care style
- Preferences: daily routine
- Preferences: communication
- Wishes for the future
- Feedback on care quality
- Feedback on a specific worker
- Concerns or worries
- Values and dignity
- Other

Each category has a persona-aware prompt explaining what belongs there.

### I.4 Note composition

- Category dropdown
- Content textarea (max 5000 chars)
- "Recorded on my behalf" checkbox if author is not the participant
- Visibility selector:
  - Private (only I see this)
  - Share with everyone in my household
  - Share with specific people (opens list)
- Submit

### I.5 Visibility control

Every note has a visibility indicator. Users can change visibility at any time.

Explicit warning when changing from private to shared: "This note will now be visible to [list of names]. Continue?"

Explicit warning when changing from shared to private: "Only you will be able to see this note going forward. If someone has already read it, they may remember what it said. Continue?"

### I.6 Sensitive content flow

On write, content scanned per Section N. If sensitive-content indicators fire:

1. The note saves normally (user's choice is respected)
2. A support-resources panel appears next to the note: "It sounds like you may be going through something difficult. Would you like to see some support options?"
3. User can view resources (Elder Abuse Helpline 1800 353 374, OPAN 1800 700 600, Lifeline 13 11 14) without disclosure obligation
4. The `crisis_resources_offered_at` timestamp records the offer

No automatic disclosure to caregivers, providers, or authorities. The participant retains full control.

### I.7 Caregiver "recorded on behalf" flow

If a caregiver records a note on behalf of the participant:

1. Note is created with `authored_on_behalf: true`
2. Note requires participant confirmation before it can be shared beyond the caregiver who wrote it
3. UI on participant's next login prompts: "[Caregiver name] recorded something for you. Please review and confirm it's accurate."
4. Participant reviews, edits if needed, and confirms
5. Confirmed notes then honor the visibility setting

### I.8 Integration with CPR-2 participant voice check

CPR-2's participant voice check (per CPR-2 v1 spec) reads voice notes with `visibility: shared_with_household` and any specific-caregiver notes shared with the CPR user. Notes marked private are never surfaced to CPR-2.

### I.9 Empty state

- Participant self: "This space is yours. Start with anything that matters to you: how you like your morning tea, what you want your family to know, something you've been thinking about."
- Caregiver: "Nothing here yet. If [participant name] wants to share their thoughts and preferences, this is where. If you're helping them, mark notes as recorded on their behalf and check with them."

---

## Section J. Handover pack generation

### J.1 Trigger

Generation initiated from:
- Participant profile page (CORE-1): "Generate handover pack" CTA
- Explicit route `/app/participants/[id]/handover-pack`

### J.2 Pack contents

The pack includes:

1. **Cover page.** Participant name, date generated, generated by, purpose.
2. **Participant summary.** Preferred name, DOB (if disclosed by the participant), classification with confidence, primary contact preferences, key medical or care conditions the participant has chosen to share.
3. **Providers.** Primary and additional providers, contact details, current agreement summary.
4. **Budget position.** Current quarter budget from BC-2 living projection: entitled, spent to date, remaining, days remaining. Rollover risk flag if any.
5. **Active support plan summary.** Key goals, planned services, active pathway (if RCP or EoLP), from CPR-1 or CPR-2.
6. **Key contacts.** Household members with roles, care manager, GP if disclosed, allied health if relevant.
7. **Participant preferences.** Shared voice notes from category `preferences_care_style`, `preferences_daily_routine`, `preferences_communication`, `values_and_dignity`.
8. **Open incidents.** Current LOOP-1 cases with status, next action, due date.
9. **Next 14 days scheduled services.** Calendar entries with dates, providers, expected workers.
10. **Emergency contacts and support lines.** Elder Abuse Helpline (1800 353 374), OPAN (1800 700 600), Lifeline (13 11 14), My Aged Care (1800 200 422), ACQSC (1800 951 822).
11. **Metadata footer.** Generated timestamp, "This is a snapshot from Wayly. For latest information, see the Wayly participant profile at [URL]."

### J.3 Pack does not include

- Private voice notes (never in pack, regardless of who generates)
- Sensitive-flagged content unless the participant has explicitly shared
- Full statement PDFs (pack summarises current position; statements available in Wayly)
- Full letters (pack lists open correspondence; content available in Wayly)
- Message thread history (pack is for handover, not full communication log)

### J.4 Purpose selector

Before generation, user selects purpose:
- Primary caregiver absence (default)
- Hospital visit
- Provider change
- Other (with notes)

Purpose affects section emphasis:
- Hospital visit emphasises medical conditions, current medications (if disclosed), care preferences during hospitalisation
- Provider change emphasises current provider details, service history, transition considerations

### J.5 Preview and edit

Before download, user sees a preview. Cannot edit content directly; can toggle sections to include or exclude:
- Include preferences (default on)
- Include open incidents (default on)
- Include next 14 days services (default on)

The three items are toggleable because different handover scenarios need different content.

### J.6 Download and share

Generation produces a PDF. Download link is signed, expires in 15 minutes. Not stored server-side beyond that window; if reneeded, regenerate.

Share options in the UI:
- Download (default)
- Email to yourself (via user's verified email)
- Copy shareable link (link expires in 24 hours, single-use)

### J.7 Persona-aware content

Content within the pack uses caregiver framing throughout, even when the participant themselves generates it. The pack is for someone else reading about the participant.

Exception: participant-authored voice notes appear in first-person as originally written.

### J.8 Language and readability

Plain language target: Year 8 reading level. Sentence length capped. Editorial QA required.

---

## Section K. Integration seams

### K.1 CORE-1

- Read: participant profile, household membership, latest artefacts for the handover pack
- Write: timeline events for `task_created`, `task_completed`, `calendar_entry_added`, `voice_note_created`, `handover_pack_generated`, `message_sent`, `attendance_confirmed`
- Update: `latest_artefacts` slots for FC-2 (if any; likely no new slot since these are ongoing, not artefact-shaped)

### K.2 LOOP-1

- Write: cases with case_type `delivery_discrepancy` when calendar attendance is disputed
- Read: cases for incident log per Section G

### K.3 SD-3

- Read: decoded statement line items for calendar pattern detection
- Subscribe: no direct subscription; pattern detection runs on user command

### K.4 BC-2

- Read: current living budget projection for handover pack

### K.5 CPR-1 and CPR-2

- Read: current care plan summary for handover pack
- CPR-2 reads voice notes (shared visibility only) for participant voice check per CPR-2 v1 spec Section on participant voice

### K.6 LF-1 v1.2

- Read: sent letters and correspondence log for incident log

### K.7 SDL-1 (forward-declared)

- SDL-1 reads calendar attendance status when it ships
- No FC-2 v1 dependency on SDL-1

### K.8 CMP-1 (forward-declared)

- Read: complaints in flight for incident log when CMP-1 ships

### K.9 LCA-1

- Subscribe: no direct subscription; LCA-1 alerts appear on the participant profile page rather than in FC-2 surfaces

---

## Section L. Persona-aware rendering

### L.1 Participant-first design for voice

The participant voice surface is the flagship for participant-self persona. It renders prominently on the participant's profile page as a primary card.

For caregiver persona, the voice surface still exists but is less prominent (secondary tab or card) and framed as reading the participant's own words.

### L.2 Copy per persona for every surface

Every string is authored in caregiver and participant-self variants per PERSONA-1. Task titles, calendar entry descriptions, message content, and voice notes are user-generated content; only Wayly-authored strings (labels, empty states, prompts, notifications) need persona variants.

### L.3 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

### L.4 Third-person rendering for handover pack

The handover pack is written in third-person about the participant, regardless of who generated it. Even when a participant generates their own handover pack for their own hospital visit, the pack renders "[Participant name] prefers X" not "I prefer X" for readability by the person receiving it.

---

## Section M. Accessibility, dark mode, design tokens

### M.1 UXF-1 v3

All components use UXF-1 v3 tokens.

### M.2 Dark mode

All new surfaces render in light, dark, and system modes.

### M.3 WCAG 2.1 AAA

Standard.

### M.4 Voice surface accessibility

Given the participant persona may include users with lower digital comfort, the voice surface has:
- Larger default text (16px minimum, 18px for content)
- High-contrast focus indicators
- Optional voice-to-text hint if the browser supports it (v2 candidate; v1 is text input only)
- Clear submit and cancel buttons (no ambiguous icons)

### M.5 Screen reader

- Task list: `<ul>` semantic markup
- Calendar: proper table semantics for week view; list semantics for agenda view
- Messages: `<ol>` with `aria-live="polite"` for new messages during a session
- Voice notes: proper heading structure per category

### M.6 Keyboard navigation

All action affordances keyboard reachable. Modals trap focus per standard.

---

## Section N. Elder abuse safeguards and crisis pathway

### N.1 Sensitive content detection

On write of voice notes and messages, content is scanned for indicators including:
- Explicit references to physical harm, financial exploitation, neglect, coercion
- Distress language patterns (hopelessness, "I can't take this anymore," similar)
- Mentions of specific abusers (worker names paired with concerning descriptions)
- Isolation language ("no one listens to me," "they told me not to say")

Detection is heuristic and conservative. Better to offer resources unnecessarily than miss a case. Better to offer than to disclose.

### N.2 What happens on detection

1. The note or message saves normally
2. A support-resources panel appears in the UI adjacent to the note
3. Panel content is persona-aware:
   - Participant persona: "It sounds like something might be difficult. If you want to talk to someone, these people can help:"
   - Caregiver persona (rare, but if a caregiver writes concerning content): "It sounds like you're dealing with a lot. If you want support:"
4. Resources listed:
   - Elder Abuse Helpline: 1800 353 374 (for participant persona and elder-abuse-flagged content)
   - OPAN (Older Persons Advocacy Network): 1800 700 600 (advocacy support)
   - 1800RESPECT: 1800 737 732 (family and domestic violence support)
   - Lifeline: 13 11 14 (crisis support, generic backstop)
5. `crisis_resources_offered_at` timestamp recorded on the note

### N.3 What does NOT happen on detection

- No automatic disclosure to household members
- No automatic disclosure to providers
- No automatic disclosure to authorities
- No notification to a "trusted contact" (Wayly does not maintain a trusted contact registry)
- No AI-generated follow-up questions

The participant retains full control. This is a deliberate product-design choice with legal implications the solicitor package must confirm.

### N.4 Explicit disclosure pathway

If a participant wants to escalate, the incident log surface has an explicit "File a formal complaint" CTA routing to CMP-1 (when CMP-1 ships) or to LF-1 v1.2 with an appropriate template.

If a participant wants to talk to a family member about it, they can share a voice note explicitly with a specific caregiver via the visibility control.

### N.5 Mandatory reporting posture

Wayly does not have a mandatory-reporting obligation as an information platform. The solicitor package confirms this. If the platform were determined to have such an obligation, product design would need to change materially.

### N.6 Sensitive content review by participant

For notes flagged with sensitive content, on next login the participant sees:

> "You wrote a note recently that we flagged as sensitive. This is just a reminder that:
> - You control who sees it
> - You can change or delete it any time
> - Support is available if you want it: [resources]"

They can dismiss the reminder.

### N.7 Solicitor package

Draft the solicitor question package at Phase 0:
1. Is the "no automatic disclosure" posture legally sound?
2. Is Wayly a mandatory reporter under any elder abuse regime?
3. Is the retention policy (indefinite until deletion, active-case content retained) appropriate?
4. What is the caregiver's access model in the case of a participant's cognitive decline (a caregiver with legal guardianship, for example)?

Do not launch the voice surface without answers.

---

## Section O. Privacy Policy amendment

### O.1 Scope

FC-2 introduces:
- Task management data
- Calendar data (services, appointments)
- Household message history
- Participant voice notes (including sensitive content)
- Handover pack generation records
- Attendance status data (feeds SDL-1)
- Sensitive-content detection heuristics
- Crisis resource offering behaviour

The Privacy Policy is amended to disclose all of these.

### O.2 Sequence

FC-2's amendment is Privacy Policy v1.7 (following LCA-1's v1.6). Confirm with solicitor.

### O.3 Elder abuse specific disclosure

The policy includes a specific section on elder abuse handling: the detection heuristic, the "no automatic disclosure" posture, the resource offering behaviour, and the participant's continued control over their own content.

### O.4 Retention specific disclosure

Voice notes and messages retained per PROGRAM-1 open item 6 policy. Explicitly disclose.

### O.5 Solicitor sign-off gate

Voice notes and messages module launch gated on sign-off. Rest of FC-2 v1 can launch without.

### O.6 Founder sign-off record

Founder sign-off received, covering the participant voice capture module (retention, visibility, mandatory-report triggers) and the elder abuse indicator handling posture. The solicitor package questions above remain the record of what was reviewed; the signed opinion is held on file. The interim gate is lifted: the `fc_2_v1_voice_and_messages` flag may be enabled for user access on the founder's authority. The no-automatic-disclosure posture and the mandatory-reporting determination are load-bearing; if the solicitor's written responses change either, treat it as a material change and re-record here before the module stays live.

---

## 2. Locked decisions

1. **FC-1 preservation.** All FC-1 behaviour preserved. Every FC-1 acceptance test remains valid.
2. **Wayly lane discipline.** Worker matching, shift management, timesheet approval, and payroll are excluded. FC-2 v1 coordinates the household; it does not manage workers.
3. **Task model.** No priorities, subtasks, tags, or projects. Simple by design.
4. **Calendar sources.** Manual entry, statement pattern detection, care plan (when CPR-2 ships). No external calendar sync in v1.
5. **Pattern detection.** Deterministic (same day of week, at least 3 occurrences in 90 days), never AI-inferred silently.
6. **Attendance status.** Stored on calendar entries; feeds SDL-1 when SDL-1 ships.
7. **Message threading.** One level deep. No full nested threads.
8. **Message edit window.** 15 minutes.
9. **Message soft delete.** Placeholder shown; content hidden immediately.
10. **Voice note visibility.** Three levels: private, shared with household, shared with specific caregivers.
11. **Recorded on behalf.** Caregiver-written notes require participant confirmation before being shared beyond the caregiver author.
12. **Sensitive content posture.** No automatic disclosure. Resource offering only.
13. **Crisis resources for voice.** Elder Abuse Helpline (1800 353 374), OPAN (1800 700 600), 1800RESPECT (1800 737 732), Lifeline (13 11 14).
14. **Handover pack.** Generated on demand, not persisted (only metadata). Signed URL expires in 15 minutes.
15. **Handover pack shareable link.** 24-hour single-use link if requested.
16. **Handover pack sections.** 11 sections per Section J.2, three of which are user-toggleable at generation time.
17. **Handover pack tone.** Third-person about the participant, plain language, Year 8 target.
18. **Retention.** Voice notes and messages per PROGRAM-1 open item 6 policy: indefinite until deletion, active case content retained until closure.
19. **Voice note deletion.** Author-only. Soft delete for 30 days, then hard delete.
20. **Voice surface prominence.** Primary card on participant profile for participant-self persona. Secondary tab for caregiver persona.
21. **Solicitor gate.** Voice notes and messages launch gated on sign-off. Tasks, calendar, incident log, and handover pack launch without.
22. **Feature flags.** `fc_2_v1_features` gates tasks, calendar, incident log, and handover pack. `fc_2_v1_voice_and_messages` gates the sensitive modules.
23. **CORE-1 timeline events.** Every meaningful FC-2 action writes a timeline event.
24. **LOOP-1 case creation.** Disputed attendance opens a LOOP-1 case with case_type `delivery_discrepancy`.
25. **No LOOP-1 case creation for tasks, messages, voice notes.** Those are household coordination, not tracked issues.
26. **Data residency.** ap-southeast-2 for all new writes.
27. **Elder abuse mandatory reporting.** Wayly's posture confirmed by solicitor before launch.
28. **Participant control.** Sensitive content detection never overrides participant control over their own content.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit (Section A)
- **WS2.** Task data model, persistence, and APIs (Sections B.1, C.1, D.1)
- **WS3.** Task list and detail surface (Section E)
- **WS4.** Calendar data model, persistence, and APIs (Sections B.2, C.1, D.2)
- **WS5.** Calendar week, month, and agenda views (Section F)
- **WS6.** Statement pattern detection engine (Section F.7)
- **WS7.** Attendance confirmation flow (Section F.5)
- **WS8.** Household message data model, persistence, and APIs (Sections B.3, C.1, D.3)
- **WS9.** Message thread surface (Section H)
- **WS10.** Message notification integration with LOOP-1 (Section H.6)
- **WS11.** Voice note data model, persistence, and APIs (Sections B.4, C.1, D.4)
- **WS12.** Voice capture surface (Section I)
- **WS13.** Sensitive content detection heuristic (Section N.1)
- **WS14.** Crisis resource UI panels (Section N.2)
- **WS15.** Incident log aggregation and surface (Sections G, D.5)
- **WS16.** Handover pack generation engine (Sections B.5, D.6, J)
- **WS17.** Handover pack PDF template (Section J.2)
- **WS18.** Handover pack preview and share (Sections J.5, J.6)
- **WS19.** CORE-1 integration and timeline events (Section K.1)
- **WS20.** LOOP-1 case creation from disputed attendance (Section K.2)
- **WS21.** SD-3 pattern detection integration (Section K.3)
- **WS22.** BC-2, CPR, and LF-1 integrations for handover pack (Sections K.4, K.5, K.6)
- **WS23.** Persona-aware rendering with participant-first design for voice (Section L)
- **WS24.** UXF-1 v3, dark mode, WCAG, voice surface accessibility (Section M)
- **WS25.** PostHog event schema (see 3.1)
- **WS26.** Two feature flags and rollback (Sections 4)
- **WS27.** Privacy Policy amendment (Section O)
- **WS28.** Solicitor package for voice and messages (Section N.7)

### 3.1 PostHog event schema

- `task_created` (has_assignee, has_due_date)
- `task_completed` (days_open)
- `task_cancelled` (reason_category)
- `calendar_entry_added` (source, entry_type, has_recurrence)
- `calendar_pattern_detection_run` (patterns_detected_count)
- `calendar_pattern_confirmed` (service_type)
- `calendar_pattern_dismissed` (service_type)
- `attendance_confirmed` (status, entry_type)
- `attendance_disputed` (reason)
- `message_sent` (thread_depth, character_count)
- `message_edited`
- `message_deleted`
- `voice_note_created` (category, visibility, authored_on_behalf, contains_sensitive_flag)
- `voice_note_visibility_changed` (from, to)
- `voice_note_shared_with_specific_caregivers` (recipient_count)
- `voice_note_recorded_on_behalf_confirmed_by_participant`
- `sensitive_content_resources_offered` (source: voice | message)
- `handover_pack_generated` (purpose, sections_included_count, generation_duration_ms)
- `handover_pack_shared_via` (channel: download | email | link)
- `incident_log_viewed`
- `incident_log_deep_link_clicked` (source_tool)

---

## 4. Rollback plan

### 4.1 Two feature flags

`fc_2_v1_features` gates tasks, calendar, incident log, and handover pack. When off, FC-1's core household permissions remain; new surfaces return 404.

`fc_2_v1_voice_and_messages` gates the voice capture and message thread surfaces. Independent flag because these are the legally sensitive modules.

Both can be turned off independently.

### 4.2 Rollback triggers

For `fc_2_v1_features`:
- Cross-participant data leak in tasks, calendar, or handover pack
- Handover pack content includes private voice notes (breach)
- Statement pattern detection false-negative rate exceeds acceptable threshold

For `fc_2_v1_voice_and_messages`:
- Solicitor concern raised on voice or message posture
- Sensitive content detection false-negative rate observed
- Elder abuse pattern surfaces requiring product-model change

### 4.3 Data retention during rollback

All data retained. Flag re-enable restores surfaces.

### 4.4 FC-1 independence

FC-1's core permissions layer remains operational independent of both flags.

---

## 5. Acceptance tests

Sixty tests across twelve categories.

### 5.1 FC-1 preservation

1. **T1.** Household membership CRUD unchanged.
2. **T2.** Role-based access checks unchanged.
3. **T3.** Existing FC-1 UI surfaces render correctly.

### 5.2 Tasks

4. **T4.** Task creation persists with data_residency `ap-southeast-2`.
5. **T5.** Task assignment shows in assignee's task list.
6. **T6.** Task completion updates status and timestamp.
7. **T7.** Overdue tasks flagged in list view.
8. **T8.** Task deletion allowed only if unassigned and open.
9. **T9.** Task list filters (Assigned to me, Overdue) work correctly.
10. **T10.** CORE-1 timeline event written on task creation and completion.

### 5.3 Calendar

11. **T11.** Calendar entry creation with recurrence expands correctly in read responses.
12. **T12.** Statement pattern detection returns proposed entries for services with 3+ occurrences on the same day of week in 90 days.
13. **T13.** Pattern confirmation persists as `statement_pattern_confirmed`.
14. **T14.** Pattern dismissal persists and does not re-propose.
15. **T15.** Attendance confirmation transitions status correctly.
16. **T16.** Disputed attendance opens a LOOP-1 case with case_type `delivery_discrepancy`.
17. **T17.** Calendar week, month, and agenda views render correctly.
18. **T18.** Timezone handling defaults to Australia/Sydney.

### 5.4 Messages

19. **T19.** Message send persists and appears for household members with access.
20. **T20.** Reply-to threading renders correctly.
21. **T21.** Edit within 15 minutes succeeds; edit after fails.
22. **T22.** Soft delete shows placeholder and hides content immediately.
23. **T23.** Read receipts update when household member views.
24. **T24.** New message notification fires for other household members.
25. **T25.** Notification batching aggregates multiple messages from same author within 5 minutes.

### 5.5 Voice notes

26. **T26.** Voice note creation persists with correct visibility.
27. **T27.** Private notes visible only to author.
28. **T28.** Shared-with-household notes visible to all household members with access.
29. **T29.** Shared-with-specific-caregivers notes visible only to listed recipients.
30. **T30.** Author can edit and delete own notes.
31. **T31.** Non-authors cannot edit or delete.
32. **T32.** Visibility change from private to shared prompts confirmation.
33. **T33.** Recorded-on-behalf notes require participant confirmation before extended sharing.
34. **T34.** CPR-2 reads voice notes with `shared_with_household` visibility per its own spec.

### 5.6 Sensitive content

35. **T35.** Content with explicit elder abuse indicators triggers `contains_sensitive_content_flag: elder_abuse_indicators`.
36. **T36.** Sensitive-flagged notes save normally; user maintains control.
37. **T37.** Crisis resources panel renders with correct numbers.
38. **T38.** `crisis_resources_offered_at` timestamp records the offer.
39. **T39.** No automatic disclosure to caregivers, providers, or authorities.
40. **T40.** Sensitive content review reminder shown on next participant login.

### 5.7 Incident log

41. **T41.** Log aggregates from LOOP-1 cases correctly.
42. **T42.** Log aggregates from LF-1 v1.2 letters correctly.
43. **T43.** Filters by type and status work.
44. **T44.** Deep link routes to source tool detail.

### 5.8 Handover pack

45. **T45.** Pack generation produces PDF with 11 sections per J.2 defaults.
46. **T46.** Private voice notes excluded from pack under all conditions.
47. **T47.** Purpose selector affects section emphasis.
48. **T48.** Section toggles (preferences, incidents, services) work.
49. **T49.** Signed download URL expires in 15 minutes.
50. **T50.** Shareable link expires in 24 hours single-use.
51. **T51.** Metadata about generation persisted.
52. **T52.** Pack content in third-person plain language.

### 5.9 Integrations

53. **T53.** CORE-1 timeline events fire for all instrumented FC-2 actions.
54. **T54.** LOOP-1 case creation from disputed attendance succeeds with correct metadata.
55. **T55.** Handover pack reads current data from CORE-1, BC-2, CPR, LF-1.

### 5.10 Persona and editorial

56. **T56.** Voice surface renders participant-first framing for participant-self persona.
57. **T57.** All strings pass PERSONA-1 audit.
58. **T58.** All strings pass editorial QA (Australian English, no em dashes, no banned vocabulary).

### 5.11 Accessibility

59. **T59.** Voice surface passes accessibility with larger text and high-contrast focus.
60. **T60.** All new surfaces pass WCAG 2.1 AAA in light, dark, and system modes; pass keyboard navigation and screen reader tests.

---

## 6. Delivery notes

### 6.1 FC-1 regression status

Delivery notes confirm all FC-1 tests pass.

### 6.2 Solicitor package status

Delivery notes state package status for voice and messages: prepared, sent, under review, signed off.

### 6.3 Sensitive content detection tuning

Delivery notes report false-positive and false-negative rates on a fixture set. Detection is conservative; false-positive rate expected to be higher than production comfort would want, and this is a documented posture.

### 6.4 Handover pack content coverage

Delivery notes confirm each section pulls from the right source and renders correctly in the PDF template.

### 6.5 Statement pattern detection performance

Delivery notes report pattern detection accuracy on the Louisa Davids fixture (known recurring services) and any coverage gaps.

### 6.6 CPR-2 forward integration

Delivery notes confirm the API for CPR-2 to read shared voice notes exists even though CPR-2 has not shipped.

### 6.7 SDL-1 forward integration

Delivery notes confirm calendar attendance status is populated and stored in a shape SDL-1 will consume.

### 6.8 Voice module gate

Delivery notes state whether the voice module ships in the initial release (solicitor sign-off received) or waits behind `fc_2_v1_voice_and_messages` flag.

---

## 7. Explicit v2 candidates

Items deferred from FC-2 v1.

1. **External calendar sync.** Google Calendar and Outlook sync. Data leaves Wayly's ap-southeast-2 boundary; needs a specific privacy analysis.
2. **Voice-to-text for voice notes.** Users with lower digital comfort may prefer voice input. Deferred pending browser support review and privacy analysis for voice data handling.
3. **Rich media in voice notes.** Photos, audio recordings, video. Storage and Australian data residency work required.
4. **Task comments.** Threaded discussion on a task. Deferred; message thread covers most cases in v1.
5. **Task templates.** Pre-set task lists (weekly prescription pickup, monthly medication review). Deferred.
6. **Message reactions.** Emoji reactions to messages. Deferred; low value.
7. **Handover pack templates.** User-savable pack configurations. Deferred; three purpose presets cover v1 needs.
8. **Handover pack scheduling.** Schedule auto-generation before known events. Deferred.
9. **Cross-household voice note sharing.** Sharing preferences with a professional the household is engaging (a new provider considering the participant). Deferred; needs a specific consent model.
10. **AI summary of message thread.** For catch-up when a caregiver returns from absence. Deferred; adds ADM disclosure concern.
11. **Elder abuse escalation pathway.** Beyond resource offering, an assisted disclosure pathway if the participant chooses. Deferred pending solicitor review.
12. **Task recurrence.** Recurring tasks (weekly prescription pickup). Deferred; users can create individual instances.

---

## 8. Change log

- **v1** (this document): initial FC-2 spec covering six functional modules: tasks, shared calendar with pattern detection, incident log aggregation, message thread, participant voice capture with three visibility levels, and handover pack generation with 11 sections. Two feature flags gating the sensitive modules separately from the operational ones. Sensitive content detection with no-automatic-disclosure posture. Sixty acceptance tests. Solicitor package required for voice and messages launch.

---

**End of FC-2 v1 handoff prompt.**
