# SDL-1 v1: Service Delivery Attendance Log

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (hard dependency), FC-2 v1 (calendar seed data), SD-3 v1 (statement reconciliation source), IC-2 (forward-declared, invoice reconciliation), CMP-1 (forward-declared, pattern-triggered pathway), LF-1 v1.2 (dispute letter templates), LF-2 (upgraded correspondence)
**Legal gate:** solicitor sign-off required per PROGRAM-1 open item 5 (evidentiary status of user-entered attendance records)
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

Every Wayly tool that touches billing takes the provider's word for what happened. Statement Decoder decodes what a provider says was delivered. Invoice Checker checks what a provider says was charged. Neither answers the underlying question: did the service actually happen as billed? "Charged for a visit that never happened" is a top-three complaint in the aged care community. Users have no tool inside Wayly to catch this. They rely on memory, provider dialogue, and eventually a formal complaint if the mismatch is significant. All three approaches favour the provider because provider records are treated as authoritative.

SDL-1 v1 is the counterweight. It creates a household-controlled attendance log of service delivery. Each expected service becomes a record. The participant or a caregiver confirms it happened as expected, confirms it happened with variance (different worker, shorter duration), disputes it did not happen, or leaves it unconfirmed. Evidence attachments (photos, voice notes, text descriptions) build the evidentiary record. When a statement is decoded, SDL-1 reconciles automatically against the attendance log and surfaces mismatches for user action.

The log is not a workforce management system. Wayly does not manage workers, does not rate them, does not surface a "worst worker" ranking. SDL-1 records what happened to service delivery for one participant. Everything else stays in the provider's domain.

SDL-1 is legally sensitive. User-entered attendance records may be used to challenge provider billing. The evidentiary quality of those records depends on chain of custody, contemporaneity, and immutability. The solicitor package (Section P) confirms Wayly's evidentiary posture before the tool launches. The tool ships behind a feature flag until sign-off is received.

SDL-1 is a P1 workstream in PROGRAM-1 Phase C. It ships after CORE-1, LOOP-1, SD-3 v1, and FC-2 v1 are stable, and after the solicitor package is signed off.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model
- **Section C:** Persistence surface (including evidence attachment storage)
- **Section D:** Internal APIs
- **Section E:** Attendance log surface
- **Section F:** Attendance record detail and confirmation flow
- **Section G:** Evidence upload and management
- **Section H:** Statement reconciliation
- **Section I:** Pattern detection and elder abuse safeguards
- **Section J:** Integration seams
- **Section K:** Evidentiary quality framework
- **Section L:** Persona-aware rendering
- **Section M:** Accessibility, dark mode
- **Section N:** Elder abuse safeguards (echoing FC-2's posture)
- **Section O:** Privacy Policy amendment
- **Section P:** Legal gate and solicitor package

Five risks Emergent must surface in delivery notes on first commit:

1. **Solicitor sign-off.** SDL-1 v1 cannot launch to real users without written sign-off on the evidentiary posture, retention of evidence attachments, and elder abuse pattern surfacing per PROGRAM-1 open item 5. Ship behind a feature flag until sign-off is received.
2. **Evidence storage infrastructure.** Photos and voice notes are new storage patterns for Wayly. Object storage in ap-southeast-2 must be provisioned (S3 Sydney or Supabase Storage Sydney post-migration). Do not fall back to storing binaries in MongoDB above 1MB.
3. **FC-2 v1 launch status.** SDL-1 v1 reads FC-2 v1 calendar entries as attendance record seeds. If FC-2 v1 has not launched, SDL-1 v1 supports manual entry only in the interim, with the calendar-seed flow enabled once FC-2 v1 is live.
4. **Reconciliation false-positive risk.** SD-3 decoded statements are matched against attendance records automatically. A false positive (statement line flagged as unmatched when it actually corresponds to a real visit the user forgot to confirm) undermines trust. Reconciliation surfaces mismatches for user review; it never opens LOOP-1 cases silently.
5. **No-automatic-disclosure posture.** SDL-1 follows FC-2's posture: pattern detection surfaces resources and pathways to the participant, does not disclose to providers or authorities. The solicitor package confirms this posture.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/SDL-1-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 FC-2 v1 calendar integration

Confirm FC-2 v1 has shipped and exposes calendar entries via internal API. Confirm the `attendance_status` field on FC-2 CalendarEntry per FC-2 Section B.2. SDL-1 v1 reads calendar entries as seed data for attendance records, and writes back attendance_status when the record is confirmed or disputed.

If FC-2 v1 has not shipped, SDL-1 v1 launches with manual entry only. Delivery notes name the interim posture.

### A.2 SD-3 v1 statement data

Confirm SD-3 v1 exposes decoded statement line items with service date, service code, service description, provider, and expected worker (where captured). SDL-1's reconciliation runs against these fields.

### A.3 LOOP-1 case type

Confirm LOOP-1's registry includes `delivery_discrepancy` (per LOOP-1 Section B.3 initial registry). Confirm metadata schema is compatible with SDL-1 dispute output.

### A.4 CORE-1 profile data

Confirm CORE-1 exposes participant, household membership, and provider information needed for context on attendance records.

### A.5 Object storage in ap-southeast-2

Report current object storage capability. If none exists, SDL-1 v1's evidence upload requires provisioning:

Preferred: S3 Sydney (ap-southeast-2) bucket with private access, signed URLs for download.
Alternative post-migration: Supabase Storage Sydney.
Fallback: base64 storage in MongoDB for files under 1MB with an explicit larger-file rejection at upload.

The recommendation is provisioning S3 Sydney; the fallback is a delivery-note posture only.

### A.6 Voice note and image processing

Report capability to:
- Extract EXIF timestamp from uploaded photos
- Extract creation timestamp from voice note recordings
- Reject files above configured size limits (recommend 25MB per attachment, 100MB per attendance record)
- Strip GPS coordinates from photo EXIF (privacy hygiene; discussed in Section G.5)

### A.7 Australian data residency

Confirm ap-southeast-2 for all new SDL-1 collections and evidence storage.

### A.8 Notification infrastructure

SDL-1 v1 sends confirmation reminders on the day of an expected service. Confirm LOOP-1's notification infrastructure (per LOOP-1 Section I.1) is available for reuse.

### A.9 CMP-1 forward status

Confirm CMP-1 spec is in draft or shipped. If CMP-1 has not shipped, pattern-detection resource offering falls back to LF-1 v1.2 templates and OPAN referral, not CMP-1 pathway.

### A.10 Existing pattern detection code

Report any existing pattern detection code in Wayly. Recommend supersession by SDL-1's engine, not parallel implementation.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model

### B.1 Attendance record

The primary object.

```
AttendanceRecord {
  id: UUID
  participant_id: UUID (foreign key to Participant per CORE-1)
  household_id: UUID (denormalised)
  calendar_entry_id: UUID | null  // Set when seeded from FC-2 calendar

  // Expected service details
  expected: {
    service_type: string
    service_code: string | null  // Standard SAH service code where known
    provider_name: string
    expected_worker_name: string | null
    expected_start_datetime: timestamp
    expected_end_datetime: timestamp | null
    expected_duration_minutes: integer | null
  }

  // Observed service details (populated on confirmation)
  observed: {
    actual_start_datetime: timestamp | null
    actual_end_datetime: timestamp | null
    actual_duration_minutes: integer | null
    actual_worker_name: string | null
    actual_service_type: string | null  // If different from expected
    notes: string | null
  } | null

  // Confirmation
  confirmation_status: enum {
    unconfirmed,
    confirmed_as_expected,
    confirmed_with_variance,
    provider_no_show,
    participant_absent,
    disputed,
    unknown_declined_to_answer
  }
  confirmation_variance_type: enum {
    different_worker,
    shorter_duration,
    longer_duration,
    different_service,
    late_arrival,
    early_departure,
    multiple_variances
  } | null
  confirmation_variance_notes: string | null

  // Dispute details (when confirmation_status is disputed)
  dispute_reason: enum {
    service_did_not_occur_at_all,
    worker_did_not_arrive,
    participant_was_in_hospital,
    participant_was_absent_but_billed,
    different_service_than_billed,
    duration_significantly_shorter_than_billed,
    wrong_worker_but_service_occurred,
    other
  } | null
  dispute_details: string | null  // Free text, max 2000 chars

  // Evidence
  evidence_attachment_ids: UUID[]

  // Metadata
  confirmed_by_user_id: UUID | null
  confirmed_at: timestamp | null
  entered_by_user_id: UUID  // Who created this record
  entered_at: timestamp
  updated_at: timestamp
  audit_log: [
    {
      timestamp,
      user_id,
      action: enum { created, confirmed, disputed, evidence_added, evidence_removed, edited, reopened },
      details
    }
  ]

  // Reconciliation with statements
  reconciled_with_statement_ids: UUID[]  // All statements that have referenced this record
  reconciliation_status: enum {
    not_yet_billed,
    billed_and_matched,
    billed_but_disputed_by_user,
    attendance_but_never_billed,
    partial_match
  }
  reconciliation_notes: string | null

  // Evidentiary quality (Section K)
  evidentiary_quality: enum {
    strong,      // Confirmed within 24 hours of expected service
    moderate,    // Confirmed within 7 days
    weaker,      // Confirmed after 30 days
    unconfirmed
  }
  evidentiary_quality_calculated_at: timestamp

  // Cases (LOOP-1 integration)
  case_id: UUID | null

  // Elder abuse pattern participation
  contributes_to_patterns: UUID[]  // PatternDetection IDs this record supports

  data_residency: string (must be "ap-southeast-2")
}
```

### B.2 Evidence attachment

```
EvidenceAttachment {
  id: UUID
  attendance_record_id: UUID
  participant_id: UUID
  attachment_type: enum { photo, voice_note, video, document, text_note }
  content_type: string  // MIME type
  size_bytes: integer
  storage_url: string  // Object storage URL (S3 Sydney or equivalent)
  filename: string  // Original filename, sanitised
  description: string | null  // User-provided description
  captured_at: timestamp | null  // From EXIF for photos, from voice note metadata
  uploaded_at: timestamp
  uploaded_by_user_id: UUID
  hash_sha256: string  // For integrity verification
  gps_stripped: boolean  // True if photo had GPS coordinates removed
  audit_log: [
    {
      timestamp, user_id, action: enum { uploaded, viewed, downloaded, deleted }
    }
  ]
  deleted_at: timestamp | null  // Soft delete
  data_residency: string
}
```

### B.3 Pattern detection

```
PatternDetection {
  id: UUID
  participant_id: UUID
  pattern_type: enum {
    repeated_worker_substitution,
    multiple_disputes_same_provider,
    confirmed_missed_visits_despite_billing,
    concentrated_no_shows,
    other
  }
  involved_provider_name: string
  involved_attendance_record_ids: UUID[]
  detected_at: timestamp
  first_incident_date: date
  last_incident_date: date
  incident_count: integer
  severity: enum { informational, elevated_concern, high_concern }
  surfaced_to_user_at: timestamp | null
  surfaced_to_user_id: UUID | null
  resources_offered_at: timestamp | null
  user_response: enum { dismissed, took_resource_pathway, took_cmp_pathway, no_response } | null
  data_residency: string
}
```

### B.4 Reconciliation event

Persisted record of each statement reconciliation run.

```
ReconciliationEvent {
  id: UUID
  participant_id: UUID
  statement_id: UUID
  triggered_at: timestamp
  triggered_by: enum { user, automated_on_statement_decode }
  matches_found: integer
  mismatches_billed_but_no_attendance: integer
  mismatches_attendance_but_not_billed: integer
  mismatches_billed_but_disputed: integer
  matched_attendance_record_ids: UUID[]
  mismatch_report_url: string | null  // Generated report accessible for 30 days
  case_ids_created: UUID[]
  data_residency: string
}
```

### B.5 Retention

- Attendance records retained for the life of the participant record.
- Evidence attachments retained per active-case rule: attachments linked to open cases retained until case closure. Attachments not linked to cases retained for 2 years from `uploaded_at`, then user is prompted to confirm retention or authorise deletion.
- Pattern detections retained for the life of the participant.
- Reconciliation events retained for the life of the participant.

---

## Section C. Persistence surface

### C.1 New collections

- `attendance_records` (see B.1, indexed on `participant_id, expected.expected_start_datetime DESC` and `participant_id, confirmation_status`)
- `evidence_attachments` (see B.2, indexed on `attendance_record_id`)
- `pattern_detections` (see B.3, indexed on `participant_id, detected_at DESC`)
- `reconciliation_events` (see B.4, indexed on `participant_id, triggered_at DESC`)

All in MongoDB Atlas ap-southeast-2.

### C.2 Evidence storage

Recommended: S3 Sydney bucket with:
- Private access, no public bucket policy
- Server-side encryption (SSE-S3 or SSE-KMS)
- Signed URL access for user download, 15-minute expiry
- Versioning enabled (protects against accidental delete)
- Lifecycle policy: transition to Glacier after 2 years for archived attachments

Bucket naming: `wayly-evidence-attachments-au-syd` or per Wayly convention.

### C.3 Chain of custody

Every write to an attendance record appends to `audit_log`. Fields must never be silently mutated. Corrections are new audit entries with the previous value referenced.

Every evidence attachment upload includes SHA-256 hash of the file content. Downloads verify hash against stored hash. Modifications produce a new evidence attachment record; the original is retained.

### C.4 Deletion posture

- Attendance records: soft delete only. Delete flags the record; content remains for audit and evidentiary chain purposes. Hard delete only on participant deletion after 30-day soft-delete window.
- Evidence attachments: soft delete flags the record; the object in storage is not immediately removed. Object removal occurs 30 days after soft delete unless linked to an active case.
- Pattern detections: retained per participant; cannot be user-deleted (would defeat pattern surfacing).

### C.5 Editorial trail

Every edit to a confirmation status or dispute reason writes an audit log entry. The confirmation_status field can be changed by the confirming user within 7 days of first confirmation; beyond that, a "reopening" audit entry is required which downgrades the evidentiary quality to `weaker`.

---

## Section D. Internal APIs

### D.1 Attendance record CRUD

```
GET /internal/participants/[id]/attendance-records?start_date=[date]&end_date=[date]&status=[filter]&provider=[filter]&limit=[n]
Returns: AttendanceRecord[] with evidence attachment count and reconciliation status
```

```
POST /internal/participants/[id]/attendance-records
Body: {
  calendar_entry_id (optional, if seeded from FC-2),
  expected: {...},
  entered_by_user_id
}
Returns: AttendanceRecord with confirmation_status: unconfirmed
```

```
PATCH /internal/attendance-records/[id]
Body: partial fields except audit_log, evidentiary_quality (computed)
Returns: updated AttendanceRecord
```

```
DELETE /internal/attendance-records/[id]
Body: { deleted_by_user_id, deletion_reason }
Soft delete only.
```

### D.2 Confirmation and dispute flows

```
POST /internal/attendance-records/[id]/confirm
Body: {
  confirmation_status: confirmed_as_expected | confirmed_with_variance | provider_no_show | participant_absent,
  observed (optional structured details),
  confirmation_variance_type (if variance),
  confirmation_variance_notes,
  confirmed_by_user_id
}
Returns: updated AttendanceRecord
```

```
POST /internal/attendance-records/[id]/dispute
Body: {
  dispute_reason,
  dispute_details,
  disputed_by_user_id
}
Returns: updated AttendanceRecord with case_id populated (LOOP-1 case opened)
```

```
POST /internal/attendance-records/[id]/reopen
Body: { reopened_by_user_id, reopen_reason }
Returns: updated AttendanceRecord with confirmation_status reset and evidentiary_quality downgraded
```

### D.3 Evidence upload and management

```
POST /internal/attendance-records/[id]/evidence
Body: multipart/form-data with file, description (optional)
Returns: EvidenceAttachment
```

Server extracts EXIF, strips GPS from photos, computes hash, stores to object storage.

```
GET /internal/evidence-attachments/[id]
Returns: EvidenceAttachment metadata with signed download URL (15-minute expiry)
```

```
DELETE /internal/evidence-attachments/[id]
Body: { deleted_by_user_id, deletion_reason }
Soft delete.
```

### D.4 Reconciliation

```
POST /internal/participants/[id]/reconcile
Body: { statement_id (optional; if omitted, reconciles latest unprocessed statement) }
Returns: ReconciliationEvent with mismatches enumerated
```

```
GET /internal/reconciliation-events/[id]/report
Returns: signed URL to a generated reconciliation report (HTML, 30-day expiry)
```

### D.5 Pattern detection

```
GET /internal/participants/[id]/pattern-detections?since=[date]
Returns: PatternDetection[]
```

```
POST /internal/pattern-detections/[id]/mark-surfaced
Body: { surfaced_to_user_id }
Returns: updated PatternDetection
```

```
POST /internal/pattern-detections/[id]/user-response
Body: { user_id, response: dismissed | took_resource_pathway | took_cmp_pathway }
Returns: updated PatternDetection
```

### D.6 Seed from FC-2 calendar

```
POST /internal/participants/[id]/attendance-records/seed-from-calendar
Body: { start_date, end_date }
Returns: AttendanceRecord[] created from calendar entries in the range
```

Runs when a participant activates SDL-1 for the first time (bulk seed of upcoming week) and on a schedule (daily) to seed new upcoming entries.

### D.7 Authorisation

All endpoints scoped by household membership per CORE-1 pattern.

Evidence attachment downloads require an active session and the caller must have access to the parent attendance record.

---

## Section E. Attendance log surface

### E.1 Route

`/app/participants/[id]/attendance`

Also embedded as a "This week's services" card on the participant profile page (CORE-1).

### E.2 Views

- **This week (default):** current week's expected services, each row showing status
- **This month:** month view with high-level status indicators
- **All:** paginated full history
- **Disputes only:** filter to disputed records
- **Unconfirmed:** filter to expected services awaiting confirmation

### E.3 List row rendering

Each row shows:
- Date and time (day of week explicit for weekly recurring pattern recognition)
- Service type and provider
- Expected worker (if known)
- Confirmation status pill with colour per UXF-1 v3 tokens
- Reconciliation indicator (matched, mismatched, pending)
- Evidence indicator (paperclip icon if attachments exist)
- Quick action buttons: Confirm as expected (single tap for the common case), Report an issue

### E.4 Quick confirmation

The "Confirm as expected" quick action skips the detail modal for the majority case where the service happened normally. One tap sets status to `confirmed_as_expected` with `confirmed_at: now` and no observed details.

The evidentiary quality calculation for quick confirmations depends only on timing per Section K.

### E.5 Report an issue

Opens the dispute flow directly (Section F.3).

### E.6 Bulk confirmation

For a caregiver who is catching up on a week's services, a "Confirm the past week as expected" bulk action lets them confirm all pending records within the last 7 days in one action. Each confirmation is individually audit-logged with the bulk_confirmation flag.

Bulk confirmation is available only for confirmations, never for disputes.

### E.7 Empty state

Persona-aware:
- Caregiver: "No services logged yet. Services will appear here as they're scheduled through your care plan or added manually. You can confirm each one as it happens."
- Participant self: same framing with "I" pronouns.

Includes prompt to link with FC-2 calendar if not already connected.

### E.8 Persona display and tone

Neutral, clinical tone. The log is a factual record. Avoid loaded language such as "missed visit" in system labels; use "not confirmed" or specific status names.

---

## Section F. Attendance record detail and confirmation flow

### F.1 Detail modal

Click on a record row opens a detail modal or page (route `/app/attendance/[id]`) showing:

- Expected details (read-only for the participant; editable by caregiver if the source is manual entry)
- Observed details section (editable, structured)
- Confirmation status area with buttons per confirmation flow
- Evidence area
- Reconciliation status (billed on statement X on Y date, matched or mismatched)
- Audit log (chronological, showing every change)
- Related case link (if LOOP-1 case exists)

### F.2 Confirmation flow (positive path)

For the "confirmed_as_expected" case:
- Single button
- Optional field: "Anything to note?" (populates observed.notes)
- Confirm button

For "confirmed_with_variance":
- Variance type dropdown
- Notes field
- Optional observed details (worker name, arrival time, duration)
- Confirm button

For "provider_no_show":
- Modal: "The worker didn't come at all?"
- Notes field (optional)
- Prompt: "Would you like to also mark this as disputed?"
- Confirm no-show button

For "participant_absent":
- Modal: "The participant wasn't there for this scheduled service?"
- Reason (in hospital, at family, other) dropdown
- Notes field
- Prompt: "Did the provider still charge for this? Add evidence to check later."
- Confirm absence button

### F.3 Dispute flow

For "disputed":
- Modal with heightened UX weight (clear framing that this is a formal record)
- Dispute reason dropdown
- Dispute details textarea (max 2000 chars)
- Evidence attachment area (encouraged for evidentiary quality)
- Preview of what happens next: "This creates an open case. You can send a letter to the provider from the case detail page."
- Confirm dispute button

On submit:
- Attendance record updates with dispute fields
- LOOP-1 case opens with case_type `delivery_discrepancy` per LOOP-1 metadata schema
- Evidentiary quality calculated per Section K
- Provider notification is NOT automatic (per no-automatic-disclosure posture)

### F.4 Reopen flow

If a user later realises a confirmation was wrong (they confirmed but shouldn't have, or vice versa):

- "Reopen this record" button on the detail
- Reason required
- Confirmation resets to unconfirmed
- Audit log records the reopen
- Evidentiary quality downgrades to `weaker` regardless of new confirmation timing
- Explicit warning: "Reopening this record may weaken it as evidence if used in a formal dispute."

### F.5 Editable details window

Observed details can be edited for 7 days after first confirmation. Beyond 7 days, a reopen is required. This preserves editorial trail integrity.

---

## Section G. Evidence upload and management

### G.1 Supported attachment types

- Photo: JPG, PNG, HEIC (converted to JPG on upload)
- Voice note: WAV, MP3, M4A
- Video: MP4, MOV (limited to 60 seconds v1)
- Document: PDF (for provider correspondence or clinic notes)
- Text note: free-text with rich formatting (v2 candidate; v1 is plain text)

### G.2 Upload UX

- Drag-and-drop or file picker
- On mobile: direct camera access, direct microphone access
- Preview before finalising
- Description field (optional but encouraged)
- Data residency notice: "This file is stored securely in Australia."

### G.3 File size and count limits

- Individual attachment: max 25MB
- Total per attendance record: max 100MB across all attachments
- Attendance records with more than 10 attachments prompt for consolidation

Above these limits, upload is refused with a specific error message. No silent truncation.

### G.4 EXIF and metadata extraction

Photos: EXIF timestamp extracted and stored as `captured_at`. Camera model, orientation retained.

GPS coordinates from photo EXIF are stripped by default before storage. This is a privacy hygiene choice: recorded location of "empty living room at expected visit time" is not needed to establish the visit did not occur, and its presence creates unnecessary sensitivity.

Users can opt in to preserve GPS on a per-attachment basis for evidentiary reinforcement (a photo of themselves in a hospital at the expected visit time genuinely benefits from GPS confirmation). The default is strip.

Voice notes: creation timestamp from file metadata stored as `captured_at`.

### G.5 Hashing and integrity

SHA-256 hash computed at upload. Stored with the record. Downloads verify hash and log the download.

Any user-detected mismatch between attachment and stored hash is a critical event surfacing to Emergent for investigation.

### G.6 Evidence viewing

Click an attachment thumbnail (photo) or filename opens the viewer:
- Photo: full-size viewer with zoom, download, delete affordances
- Voice note: audio player with playback controls
- Video: video player
- Document: PDF viewer
- Text note: text display

Every viewing writes an audit log entry.

### G.7 Evidence deletion

Author can soft delete their own attachments. Deletion writes an audit entry.

Attachments linked to open LOOP-1 cases cannot be hard-deleted until case closure. Soft delete hides them from the user view but retains for evidentiary chain.

### G.8 Storage cost management

Object storage costs money. Users on Solo tier have a 500MB evidence storage quota; Family tier has 2GB per household; Adviser tier has 5GB per client household.

Approaching quota triggers a notification. Exceeding quota blocks new uploads with a specific error and a prompt to review and delete stale attachments.

---

## Section H. Statement reconciliation

### H.1 Automatic reconciliation on statement decode

When SD-3 decodes a new statement for a participant, SDL-1 subscribes to the event and automatically runs reconciliation:

For each billed line item on the statement:
1. Find attendance records for the same service date (or within a 1-day tolerance) with matching or similar provider and service type
2. Match on: date, provider, service type or service code, expected worker
3. Categorise per match result:
   - **Matched:** billed line item corresponds to a confirmed attendance record; both agree
   - **Billed but no attendance:** billed line item has no corresponding attendance record at all
   - **Billed but disputed:** billed line item corresponds to a record the user has disputed
   - **Attendance but not billed:** attendance record exists but no billed line item (potentially a service the participant received without charge; also worth flagging)
   - **Partial match:** billed line item corresponds but with variance (different worker, different duration)

### H.2 Mismatch surfacing

Mismatches surface as a report on the participant profile page:
- Card: "N mismatches found on the July statement"
- Deep link to a reconciliation report showing each mismatch

Users review each mismatch and take an action:
- "Confirm the billing is correct" (updates attendance record to matched, may auto-create an attendance record if missing)
- "Dispute this billing" (opens dispute flow, creates LOOP-1 case)
- "Not sure right now" (leaves as flagged; can revisit)

### H.3 No automatic LOOP-1 case creation from mismatch

Reconciliation surfaces mismatches. It does not open cases silently. Users explicitly choose to dispute, and case creation is a downstream user action per Section F.3.

This is a deliberate choice: reconciliation false positives are inevitable (a user forgot to confirm a real visit; a statement line covers a service that spans multiple days). Silent case creation would erode trust in the pattern-detection story generally.

### H.4 Reconciliation report

Route: `/app/participants/[id]/reconciliation/[reconciliation_event_id]`

Shows:
- Statement metadata
- Total lines billed
- Total matched
- Total mismatches by category
- Per-mismatch detail with action buttons
- Downloadable HTML report (30-day expiry)

### H.5 Retroactive reconciliation

Users can trigger reconciliation for any decoded statement, not just the most recent:

Route: `/app/participants/[id]/reconciliation/history` shows all past reconciliation events and allows re-running against any statement.

Historical reconciliation is useful when a participant activates SDL-1 mid-quarter and wants to check statements decoded before SDL-1 was active. Attendance records for past services can be entered retroactively with weakened evidentiary quality per Section K.

---

## Section I. Pattern detection and elder abuse safeguards

### I.1 Patterns detected in v1

1. **Repeated worker substitution:** more than 3 confirmed_with_variance records with `different_worker` variance type for the same participant in 90 days, potentially indicating provider staffing instability. Severity `informational` by default; `elevated_concern` if concurrent with other patterns.

2. **Multiple disputes same provider:** 2 or more disputes against the same provider in 60 days. Severity `elevated_concern`.

3. **Confirmed missed visits despite billing:** provider billed for services flagged in reconciliation as `billed_but_disputed` for the same provider more than once. Severity `high_concern`.

4. **Concentrated no-shows:** 3 or more `provider_no_show` records for the same provider in 30 days. Severity `elevated_concern`.

### I.2 Detection schedule

- On every attendance record write and every reconciliation event, pattern detection re-runs for that participant.
- Scan bounded to the participant's own records.
- Deterministic, not AI-inferred. Match rules per I.1.

### I.3 Surfacing to user

Per PROGRAM-1's participant-control posture and FC-2's precedent, pattern detection surfaces to the affected participant only. It does not disclose to caregivers by default, does not disclose to providers, does not disclose to authorities.

Surfacing:
- Notification to the participant (or the primary caregiver if the participant is not the primary user)
- In-app card on the participant profile: "We've noticed a pattern with [provider name]. Would you like to review?"
- Detail view showing the involved records with context

### I.4 What the user can do

From the pattern detail view:
- Review the involved records
- Take a resource pathway (Elder Abuse Helpline 1800 353 374, OPAN 1800 700 600, Lifeline 13 11 14)
- Take the CMP-1 pathway (when CMP-1 ships) to file a formal complaint
- Dismiss the pattern (does not delete; keeps for future context)

### I.5 No automatic escalation

Detection does not trigger automatic reports to ACQSC, Ombudsman, or providers. The participant's choice to escalate is explicit and their own.

### I.6 CMP-1 forward integration

When CMP-1 ships, pattern detection with `severity: high_concern` offers a direct pathway to file a formal complaint with pre-populated evidence from the involved attendance records and evidence attachments. Until CMP-1 ships, the resource pathway is offered.

### I.7 Elder abuse mandatory reporting posture

Per FC-2 Section N.5, Wayly does not have a mandatory reporting obligation as an information platform. The SDL-1 solicitor package (Section P) reconfirms this in the SDL-1 context. If the solicitor identifies a mandatory obligation, the product model changes materially.

---

## Section J. Integration seams

### J.1 CORE-1

- Read: participant profile, household membership, providers
- Write: timeline events for `attendance_record_created`, `attendance_record_confirmed`, `attendance_record_disputed`, `evidence_uploaded`, `pattern_detected`, `reconciliation_run`
- Update: participant profile shows counts (unconfirmed attendance records, open disputes)

### J.2 LOOP-1

- Write: cases with case_type `delivery_discrepancy` when a user disputes an attendance record
- Read: cases for incident log integration (FC-2 also reads for its own incident log)

### J.3 FC-2 v1

- Read: calendar entries as seed data for attendance records
- Write: attendance_status on calendar entries when the corresponding attendance record is confirmed or disputed
- Coordinate: FC-2's calendar surface links to SDL-1 detail for records that exist

### J.4 SD-3 v1

- Subscribe: decoded statement events trigger automatic reconciliation per Section H.1
- Read: decoded statement line items for reconciliation matching

### J.5 IC-2 (forward-declared)

- Future: invoice reconciliation against attendance records. IC-2 v1 will consume this integration point when it ships.

### J.6 LF-1 v1.2 and LF-2

- Hand-off from disputed attendance records opens LF-1 v1.2 or LF-2 with prefill for a challenge letter template

### J.7 CMP-1 (forward-declared)

- Pattern detection with high concern severity offers CMP-1 pathway when CMP-1 ships
- Interim fallback to OPAN resource pathway

### J.8 LCA-1

- No direct dependency. LCA-1 alerts show on participant profile as normal; do not affect SDL-1 surfaces.

---

## Section K. Evidentiary quality framework

### K.1 Purpose

If a user's attendance record is later used to challenge provider billing (in correspondence, complaint, or advocacy), the record's quality as evidence matters. This section defines Wayly's evidentiary posture and the framework for calculating quality per record.

### K.2 Quality tiers

**Strong evidence.** Confirmation timestamp within 24 hours of the expected service start time. Written by the participant or the primary caregiver. Has evidence attachments (photo, voice note) with captured timestamps close to the expected service time. No reopens.

**Moderate evidence.** Confirmation within 7 days of the expected service. Has evidence attachments or detailed notes. No reopens.

**Weaker evidence.** Confirmation after 30 days. May have detailed notes but no evidence attachments. Or has been reopened and re-confirmed after the initial confirmation window.

**Unconfirmed.** Record exists but no confirmation status. Cannot serve as evidence.

### K.3 Calculation

On confirmation or on a nightly job:

```
if confirmation_status == unconfirmed: evidentiary_quality = unconfirmed
elif reopens_count > 0: evidentiary_quality = weaker
elif confirmed_within_24h_of_expected: evidentiary_quality = strong (if any evidence attached; moderate otherwise)
elif confirmed_within_7_days_of_expected: evidentiary_quality = moderate
elif confirmed_more_than_30_days_after: evidentiary_quality = weaker
else: evidentiary_quality = moderate (7 to 30 days is the moderate bucket)
```

Evidence attachment presence upgrades within-24h from `moderate` to `strong`.

### K.4 User-facing framing

The framework is displayed to users:
- At the moment of confirming late: "You're confirming this service 35 days after it was scheduled. If used to dispute billing, this record may carry less weight than a same-day confirmation."
- On the attendance record detail: badge showing quality tier
- On the reconciliation report: flagged records show their tier

Framing is factual, not judgmental. Users may still choose to confirm late; the tool records it, notes the quality, and does not obstruct.

### K.5 Not legal advice

The evidentiary quality framework is Wayly's own model. It is not legal advice. Users may still use records of any quality in correspondence with providers; whether a formal complaint or legal action succeeds depends on many factors beyond Wayly's model. Solicitor package (Section P) confirms this framing is legally sound and adequately disclaimed.

---

## Section L. Persona-aware rendering

### L.1 Both personas equal weight

Participant and caregiver personas both have first-class attendance log surfaces. Participant-self persona confirms their own attendance; caregiver persona confirms on behalf of the participant.

### L.2 Confirmation attribution

Records confirmed by a caregiver on behalf of the participant note this: "Confirmed by [caregiver name]." Records confirmed by the participant themselves note "Confirmed by [participant first name]."

### L.3 Participant confirmation prompt for caregiver actions

For a participant with participant-self access and a caregiver in the household, if the caregiver confirms an attendance record, the participant sees a notification: "[Caregiver name] confirmed the service on [date]. Let them know if this doesn't match your memory of what happened."

This is a courtesy, not a challenge mechanism. It preserves participant awareness without creating friction.

### L.4 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

### L.5 Tone

Neutral, factual, clinical for the log itself. Warmer, resource-oriented for elder abuse pattern surfacing (per FC-2 Section N tone precedent).

---

## Section M. Accessibility, dark mode, design tokens

### M.1 UXF-1 v3

All components use UXF-1 v3 tokens.

### M.2 Dark mode

All new surfaces render in light, dark, and system modes.

### M.3 WCAG 2.1 AAA

Standard.

### M.4 Evidence viewer accessibility

- Photo viewer: alt text field required on upload prompt (user provides description of what the photo shows)
- Voice note player: transcript field encouraged (user provides a text description of what was said)
- Video player: caption support (optional)

### M.5 Screen reader

Attendance log list uses `<ul>` semantic markup. Each row has an aria-label combining date, service, provider, and status. Status changes trigger `aria-live="polite"` updates.

### M.6 Mobile-first considerations

Mobile is the likely primary confirmation surface (users confirm on their phone the day of service). Tap targets sized for one-handed use. Camera and microphone access flows well-tested on iOS Safari, Chrome Android.

---

## Section N. Elder abuse safeguards

Echoes FC-2 Section N's posture.

### N.1 Sensitive content detection

Attendance record notes, dispute details, and evidence descriptions are scanned for indicators of elder abuse or distress per FC-2 heuristics. Same detection code, same categories.

### N.2 What happens on detection

Per FC-2:
- Content saves normally
- Resource panel appears offering Elder Abuse Helpline (1800 353 374), OPAN (1800 700 600), 1800RESPECT (1800 737 732), Lifeline (13 11 14)
- No automatic disclosure

### N.3 Pattern-triggered surfacing versus content-triggered

SDL-1 has both:
- Content-triggered: sensitive content in a record or evidence description triggers resource panel per FC-2 precedent
- Pattern-triggered: pattern detection (Section I) triggers a separate resource offering

Both operate independently. Neither overrides participant control.

### N.4 Solicitor package overlap

SDL-1's solicitor package (Section P) confirms both mechanisms are aligned with FC-2's posture and legally sound in the SDL-1 context.

---

## Section O. Privacy Policy amendment

### O.1 Scope

SDL-1 introduces:
- Attendance records data category
- Evidence attachment storage (photos, voice notes, video, documents)
- Pattern detection over attendance data
- Statement reconciliation as a data flow
- Evidentiary quality metadata

Privacy Policy amended to disclose all.

### O.2 Sequence

SDL-1's amendment is Privacy Policy v1.8 (following FC-2's v1.7). Confirm sequence with solicitor.

### O.3 Specific disclosures

- Evidence attachments stored in ap-southeast-2, encrypted at rest, access via signed URLs
- GPS coordinates stripped from photos by default
- Pattern detection is deterministic (not AI), participant-controlled, no automatic disclosure
- Evidentiary quality framework and its limitations

### O.4 Solicitor sign-off gate

SDL-1 v1 launch gated on:
- Privacy Policy amendment sign-off
- Evidentiary posture opinion
- Mandatory reporting posture reconfirmation

---

## Section P. Legal gate and solicitor package

### P.1 Solicitor questions

1. **Evidentiary status.** Are user-entered attendance records, with chain-of-custody audit logs and evidence attachments stored in Wayly, valid contemporaneous evidence for use in disputes with providers, formal complaints to ACQSC, and Ombudsman referrals? Under what conditions is their evidentiary weight diminished?

2. **Wayly's role.** Does providing this tool make Wayly a party to disputes, advocacy, or legal proceedings that arise from its use? If so, what protections are required?

3. **Retention posture.** Is retaining evidence attachments per active-case rule (indefinite until case closure) and 2-year default retention for unlinked attachments appropriate?

4. **Pattern detection posture.** Is the "no automatic disclosure" posture legally sound in the context of pattern detection that suggests elder abuse or systemic provider failure?

5. **Mandatory reporting.** Reconfirm Wayly's non-mandatory-reporter status in the SDL-1 context. Is there a scenario where SDL-1's tools would trigger mandatory reporting obligations?

6. **Evidentiary quality framework.** Is the framework in Section K appropriate as Wayly's own model, or does it require external validation or disclaimer that goes beyond current wording?

7. **GPS stripping default.** Is stripping GPS from photo EXIF by default a reasonable privacy hygiene choice, or does it undermine evidentiary value in cases where GPS would strengthen it? Default posture, opt-in for preservation.

8. **Evidence attachment types.** Are video and voice note evidence types appropriate, or are there additional considerations (consent to record if a worker is in the frame, for example)?

### P.2 Interim posture

Until sign-off:
- SDL-1 v1 code ships behind `sdl_1_v1_features` feature flag
- Manual and calendar-seeded attendance records can be created (low legal risk)
- Confirmation flows work (low legal risk)
- Dispute flows and LOOP-1 case creation work (low legal risk with disclaimer)
- Evidence attachments accept upload
- Pattern detection runs internally but does not surface to users
- Reconciliation runs internally but reports are not user-facing

Post sign-off:
- Feature flag on
- Reconciliation reports become user-facing
- Pattern detection surfaces to users per Section I

### P.2a Founder sign-off record

Founder sign-off received. The solicitor package questions above remain the record of what was reviewed; the signed opinion is held on file. The interim gate is lifted: the feature flag may be enabled for user access on the founder's authority. Retain the signed opinion with the build records. If the solicitor's written responses later require a scope change, apply it as a patch and re-record here.

### P.3 Alternate approaches if solicitor limits scope

If the solicitor determines evidentiary use is limited:
- SDL-1 ships as a household-facing tool for personal record-keeping, not for use in formal disputes
- Language reworded to remove "evidence" framing
- Dispute flow removed or restricted

This is a substantial product-model change and would delay launch materially. Phase 0 estimates likelihood based on preliminary discussion with the solicitor.

---

## 2. Locked decisions

1. **Legal gate.** SDL-1 v1 launch gated on solicitor sign-off per PROGRAM-1 open item 5. Ships behind feature flag until sign-off.
2. **Evidentiary quality framework.** Four tiers: strong, moderate, weaker, unconfirmed. Rules per Section K.3.
3. **Chain of custody.** Every attendance record has an append-only audit log. Every evidence attachment has a SHA-256 hash.
4. **Object storage.** S3 Sydney (or Supabase Storage Sydney post-migration). Private access, signed URLs.
5. **GPS stripping.** Default strip from photo EXIF. Opt-in preservation available.
6. **File size limits.** 25MB per attachment, 100MB per attendance record, 10 attachments per record.
7. **Storage quotas.** Solo 500MB, Family 2GB per household, Adviser 5GB per client household.
8. **Confirmation edit window.** 7 days for confirmation details editing. Reopens allowed but downgrade evidentiary quality to weaker.
9. **Quick confirmation.** One-tap "Confirm as expected" for the majority case.
10. **Bulk confirmation.** Available for confirmations only, never for disputes.
11. **Reconciliation on statement decode.** Automatic. Mismatches surface for user review. No silent LOOP-1 case creation.
12. **Dispute flow.** Opens LOOP-1 case with case_type `delivery_discrepancy`. Idempotency per LOOP-1 pattern.
13. **Pattern detection.** Four patterns in v1 (per Section I.1). Deterministic, not AI.
14. **No automatic disclosure.** Pattern detection surfaces to participant only. Same posture as FC-2.
15. **Elder abuse resources.** Elder Abuse Helpline (1800 353 374), OPAN (1800 700 600), 1800RESPECT (1800 737 732), Lifeline (13 11 14).
16. **Retention.** Attendance records for life of participant. Evidence attachments per active-case rule with 2-year default. Pattern detections retained for life.
17. **Deletion posture.** Soft delete only for attendance records and evidence attachments. Hard delete only on participant deletion after 30-day soft-delete window.
18. **Feature flag.** `sdl_1_v1_features` gates all SDL-1 v1 functionality.
19. **Data residency.** ap-southeast-2 for all new writes.
20. **FC-2 v1 calendar integration.** SDL-1 v1 seeds attendance records from FC-2 calendar entries and writes back attendance_status. Manual entry supported independently.
21. **Notifications.** Confirmation reminders on the day of expected service. Not silently delayed.
22. **Mobile-first UX.** Confirmation is a mobile-primary flow.
23. **Attribution.** Confirmations note who confirmed (caregiver name or participant name).
24. **Reopen warning.** Explicit warning that reopening downgrades evidentiary quality.
25. **CMP-1 forward integration.** Pattern detection with high concern offers CMP-1 pathway when CMP-1 ships. Interim OPAN resource pathway.
26. **No worker rating.** SDL-1 records what happened; it does not rate workers. Firmly.
27. **CORE-1 timeline events.** Every meaningful SDL-1 action writes a timeline event.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit (Section A)
- **WS2.** Attendance record data model and persistence (Sections B.1, C.1)
- **WS3.** Evidence attachment data model and object storage integration (Sections B.2, C.2)
- **WS4.** Chain-of-custody audit log implementation (Section C.3)
- **WS5.** Attendance record CRUD APIs (Section D.1)
- **WS6.** Confirmation and dispute flow APIs (Section D.2)
- **WS7.** Evidence upload API with EXIF stripping and hashing (Sections D.3, G.4, G.5)
- **WS8.** Attendance log list surface (Section E)
- **WS9.** Attendance record detail and confirmation UI (Section F)
- **WS10.** Evidence upload UI with camera and mic access (Section G.2)
- **WS11.** Statement reconciliation engine (Section H)
- **WS12.** Reconciliation report generation (Section H.4)
- **WS13.** Pattern detection engine (Section I.1, I.2)
- **WS14.** Pattern surfacing UI and resource offering (Section I.3, I.4)
- **WS15.** Evidentiary quality calculation and display (Section K)
- **WS16.** CORE-1 integration and timeline events (Section J.1)
- **WS17.** LOOP-1 case creation integration (Section J.2)
- **WS18.** FC-2 calendar bidirectional integration (Section J.3)
- **WS19.** SD-3 statement subscription and reconciliation trigger (Section J.4)
- **WS20.** LF-1 dispute letter hand-off (Section J.6)
- **WS21.** Elder abuse safeguards (Section N)
- **WS22.** Persona-aware rendering (Section L)
- **WS23.** UXF-1 v3, dark mode, WCAG, mobile-first (Section M)
- **WS24.** PostHog event schema (see 3.1)
- **WS25.** Feature flag and rollback
- **WS26.** Privacy Policy amendment (Section O)
- **WS27.** Solicitor package (Section P)
- **WS28.** Storage cost monitoring and quota enforcement (Section G.8)

### 3.1 PostHog event schema

- `attendance_record_created` (source: calendar_seeded | manual)
- `attendance_record_confirmed` (status, hours_after_expected_start)
- `attendance_record_disputed` (dispute_reason)
- `attendance_record_reopened`
- `evidence_uploaded` (attachment_type, size_bytes, gps_stripped, has_description)
- `evidence_viewed` (attachment_type)
- `evidence_deleted` (attachment_type)
- `bulk_confirmation_used` (records_confirmed_count)
- `reconciliation_triggered` (trigger: user | automatic_on_statement)
- `reconciliation_mismatches_found` (count_by_category)
- `reconciliation_mismatch_actioned` (action: confirmed | disputed | deferred)
- `pattern_detected` (pattern_type, severity, incident_count)
- `pattern_surfaced_to_user` (pattern_type)
- `pattern_user_response` (response, pattern_type)
- `evidentiary_quality_calculated` (quality_tier)
- `storage_quota_warning_shown` (percentage_used)
- `storage_quota_exceeded_upload_blocked`
- `hand_off_to_letter` (dispute_reason, letter_template)

---

## 4. Rollback plan

### 4.1 Feature flag

`sdl_1_v1_features` gates all SDL-1 v1 functionality. When off:
- All SDL-1 routes return 404
- Internal APIs return 404
- FC-2 calendar seed operation skips SDL-1 write
- SD-3 reconciliation subscription silently drops events
- No pattern detection scans run

### 4.2 Rollback triggers

- Cross-participant data leak in attendance records or evidence
- Evidence storage integrity issue (hash mismatch)
- Object storage residency issue (data outside ap-southeast-2)
- Legal issue raised by solicitor after launch
- Reconciliation producing high false-positive rate observed in production

### 4.3 Data retention during rollback

All records and evidence retained per the retention policy. Turning the flag back on restores access.

### 4.4 Related tool independence

FC-2, SD-3, and LOOP-1 continue to operate. SDL-1 off degrades the delivery-verification loop but does not regress any existing tool.

---

## 5. Acceptance tests

Sixty-five tests across twelve categories.

### 5.1 Data model and persistence

1. **T1.** Attendance record creation writes with data_residency `ap-southeast-2`.
2. **T2.** Evidence attachment upload stores to ap-southeast-2 object storage with SHA-256 hash.
3. **T3.** GPS coordinates stripped from photo EXIF by default.
4. **T4.** Photo upload with user opt-in preserves GPS.
5. **T5.** Audit log appended on every state change.
6. **T6.** File size limit (25MB per attachment) enforced.
7. **T7.** Storage quota enforced per tier.

### 5.2 Confirmation and dispute flows

8. **T8.** Quick confirmation sets confirmed_as_expected with confirmed_at timestamp.
9. **T9.** Variance confirmation persists observed and variance details.
10. **T10.** Dispute flow persists dispute reason and details.
11. **T11.** Dispute opens LOOP-1 case with case_type `delivery_discrepancy`.
12. **T12.** LOOP-1 case idempotency per attendance record.
13. **T13.** Reopen resets confirmation and downgrades evidentiary quality.
14. **T14.** Edit within 7 days succeeds; edit after 7 days requires reopen.
15. **T15.** Bulk confirmation succeeds for multiple pending records; fails for disputes.

### 5.3 Evidence

16. **T16.** Photo upload with EXIF timestamp extraction.
17. **T17.** Voice note upload with creation timestamp.
18. **T18.** Video upload with 60-second limit enforced.
19. **T19.** Document upload accepts PDF.
20. **T20.** Evidence view generates signed URL with 15-minute expiry.
21. **T21.** Evidence download logs audit entry.
22. **T22.** Hash verification on download; mismatch surfaces error.
23. **T23.** Soft delete hides from view; retained for audit.
24. **T24.** Attachments linked to active cases cannot be hard-deleted.

### 5.4 Reconciliation

25. **T25.** Automatic reconciliation triggered on SD-3 statement decode event.
26. **T26.** Matched line items paired with attendance records within 1-day tolerance.
27. **T27.** Billed but no attendance flagged correctly.
28. **T28.** Billed but disputed flagged correctly.
29. **T29.** Attendance but not billed flagged correctly.
30. **T30.** Partial match with variance flagged correctly.
31. **T31.** Reconciliation report generated with 30-day expiry.
32. **T32.** Retroactive reconciliation on prior statements succeeds.
33. **T33.** No silent LOOP-1 case creation from reconciliation.

### 5.5 Pattern detection

34. **T34.** Repeated worker substitution pattern triggered at 4+ variance records with different_worker in 90 days.
35. **T35.** Multiple disputes same provider pattern triggered at 2 disputes in 60 days.
36. **T36.** Confirmed missed visits despite billing pattern triggered per rules.
37. **T37.** Concentrated no-shows pattern triggered at 3+ in 30 days.
38. **T38.** Pattern surfaced to affected participant only.
39. **T39.** Pattern user response persisted correctly.
40. **T40.** No automatic disclosure on pattern detection.

### 5.6 Evidentiary quality

41. **T41.** Confirmation within 24 hours with evidence attachment sets `strong`.
42. **T42.** Confirmation within 24 hours without evidence sets `moderate`.
43. **T43.** Confirmation within 7 days sets `moderate`.
44. **T44.** Confirmation after 30 days sets `weaker`.
45. **T45.** Reopen downgrades to `weaker` regardless of new confirmation timing.

### 5.7 Integrations

46. **T46.** CORE-1 timeline events written for all instrumented actions.
47. **T47.** LOOP-1 case creation with correct case_type and metadata.
48. **T48.** FC-2 calendar seed creates attendance records with correct expected details.
49. **T49.** FC-2 calendar entry attendance_status updated when record confirmed.
50. **T50.** SD-3 statement subscription triggers reconciliation.
51. **T51.** LF-1 dispute letter hand-off with prefill.

### 5.8 Elder abuse safeguards

52. **T52.** Sensitive content detection on dispute details triggers resource panel.
53. **T53.** Resource offering includes correct helpline numbers.
54. **T54.** No automatic disclosure on sensitive content or pattern detection.
55. **T55.** CMP-1 pathway offered on high concern patterns when CMP-1 available.

### 5.9 Authorisation and scope

56. **T56.** Household member with access can view participant's attendance records.
57. **T57.** Household member without access gets 404.
58. **T58.** Evidence attachment access requires session and record access.
59. **T59.** View-only role cannot confirm or dispute.

### 5.10 Persona and editorial

60. **T60.** Attribution correct for participant-confirmed and caregiver-confirmed records.
61. **T61.** All strings pass PERSONA-1 audit.
62. **T62.** All strings pass editorial QA (Australian English, no em dashes, no banned vocabulary).

### 5.11 Accessibility and mobile

63. **T63.** All surfaces pass WCAG 2.1 AAA in light, dark, and system modes.
64. **T64.** Camera and microphone access flows on iOS Safari and Chrome Android.
65. **T65.** Screen reader labels correct for attendance records and evidence.

---

## 6. Delivery notes

### 6.1 Solicitor package status

Delivery notes state package status per Section P: prepared, sent, under review, signed off.

### 6.2 Object storage provisioning

Delivery notes confirm S3 Sydney (or equivalent) bucket provisioned with private access, encryption, signed URLs, versioning, and lifecycle policy.

### 6.3 FC-2 v1 launch status

Delivery notes state FC-2 v1 launch status. If not launched, manual-entry-only posture documented.

### 6.4 Reconciliation false-positive rate

Delivery notes report reconciliation false-positive rate on fixture set. Above 10% raises concern.

### 6.5 Pattern detection accuracy

Delivery notes report pattern detection triggering on fixtures per pattern type.

### 6.6 Storage quota implementation

Delivery notes confirm quota enforcement is functional and monitoring in place.

### 6.7 GPS stripping verification

Delivery notes confirm GPS is stripped from photo EXIF at upload for a sample of test photos.

### 6.8 Evidentiary quality framework validated

Delivery notes confirm the framework is documented, calculated correctly, and displayed to users.

---

## 7. Explicit v2 candidates

Items deferred from SDL-1 v1.

1. **Rich text notes.** Formatting in text notes. Deferred.
2. **Longer video attachments.** Above 60 seconds. Storage cost and legal review required.
3. **Provider workflow integration.** Providers accessing their own attendance record view. Out of Wayly's lane.
4. **AI-suggested evidence descriptions.** LLM writing descriptions from photos. Deferred; adds ADM disclosure concern.
5. **Cross-participant pattern detection.** Same provider issues affecting multiple participants across households. Privacy-sensitive; deferred.
6. **Time-motion analysis.** Automatic detection of duration variance from photos or voice notes. Deferred.
7. **Handover pack integration.** Attendance summary in FC-2's handover pack. Small integration, deferred to FC-2 v2.
8. **Attendance record export.** CSV or PDF export of the log for external use (advocate, lawyer). Deferred pending solicitor review.
9. **Provider response ingestion.** When a provider responds via email to a dispute letter, ingesting into the attendance record. LF-2 handles the response inbox; integration is v2.
10. **Recurring absence patterns.** Detecting participant absence patterns (in hospital, at family) to preemptively mark scheduled services. Deferred; participant control considerations.
11. **Automatic reconciliation of historical records.** Backfilling reconciliation for statements decoded before SDL-1 was active. In v1 users must trigger manually per statement.
12. **Transcript generation for voice notes.** Automatic speech-to-text. Deferred; costs, accuracy, and privacy considerations.

---

## 8. Change log

- **v1** (this document): initial SDL-1 spec covering attendance record data model with chain of custody, evidence attachment storage in ap-southeast-2 object storage with hash verification and GPS stripping, confirmation flows including quick confirmation and bulk confirmation, dispute flow with LOOP-1 case creation, statement reconciliation with mismatch surfacing but no silent case creation, four pattern detections with participant-controlled surfacing and no automatic disclosure, four-tier evidentiary quality framework, elder abuse safeguards echoing FC-2 posture, sixty-five acceptance tests. Solicitor package required for launch.

---

**End of SDL-1 v1 handoff prompt.**
