# LF-2 v1: Letters and Follow-ups v2

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (hard dependency), LF-1 v1.2 (predecessor, hard dependency), CMP-1 (future consumer for escalation to formal complaint), SD-3 v1 and v2 (hand-off source), IC-2 (forward-declared, hand-off source), SDL-1 v1 (hand-off source), PPC-1 v2 and PPC-3 (rate history source for mid-agreement rate change template)
**Predecessor:** LF-1 v1.2 (must have shipped with solicitor sign-off and stabilised for 30 days per PROGRAM-1 sequencing)
**Successor:** LF-2 v2 would add AI-assisted response drafting, multi-language templates, and letter batching across multiple participants (adviser tier feature). Deferred until v1 stabilises.
**Legal gate:** solicitor sign-off required for send-from-Wayly, response inbox, response parsing, and Privacy Policy amendment per PROGRAM-1 open item 7 and this spec Section P
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

LF-1 v1.2 delivered nine correspondence situations, seven archetypes, a correspondence log, an elder abuse pathway, a recipient directory, and three output formats (PDF, DOCX, copy text). Users draft letters in Wayly, export, and send from their own email. The letter's fate after export is invisible to Wayly. If a provider responds, the response lands in the user's personal inbox. If the user forgets to follow up, no one reminds them. If the provider does not respond, no one escalates. The tool ends at the artefact.

This is the exact pattern PROGRAM-1's design principle 2.2 identifies as a defect: every tool closes a loop. LF-1 v1.2 does not close its own loop.

LF-2 v1 closes the loop. Users can send from Wayly directly (verified sender identity, per-user reply-to inbox). Provider responses land in Wayly, get parsed and classified, attach to the originating case, and prompt user action. Timeline enforcement fires when a response deadline passes without reply, offering an escalation template. Five new templates address specific scenarios that LF-1 v1.2 did not cover: the changeover billing challenge from the community feedback ("please confirm the delivery date of each service on invoice X, and reconcile it against the final Home Care Package statement"), the mid-agreement rate change challenge referencing the participant's own rate history, and three escalation templates for progressive escalation (provider senior manager, ACQSC referral, Ombudsman referral).

LF-2 v1 preserves LF-1 v1.2's positioning discipline. Wayly still does not represent the user. Every template retains "I am writing" framing, not "my representative is writing." Send-from-Wayly is a delivery mechanism, not advocacy. The solicitor package (Section P) confirms this distinction.

LF-2 v1 is a P1 workstream in PROGRAM-1 Phase D. It ships after LF-1 v1.2 launches with sign-off and stabilises for 30 days, and after its own solicitor package is signed off.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model extensions
- **Section C:** Persistence surface (including email delivery and inbound message storage)
- **Section D:** Internal APIs
- **Section E:** New template inventory
- **Section F:** Send-from-Wayly delivery flow
- **Section G:** Response inbox and parsing
- **Section H:** Timeline enforcement and escalation
- **Section I:** Response classification and outcome tracking
- **Section J:** Correspondence surface (unified sent and received view)
- **Section K:** Integration seams
- **Section L:** Persona-aware rendering
- **Section M:** Accessibility, dark mode
- **Section N:** Elder abuse safeguards
- **Section O:** Privacy Policy amendment
- **Section P:** Solicitor package and legal gate

Five risks Emergent must surface in delivery notes on first commit:

1. **LF-1 v1.2 preservation.** Every LF-1 v1.2 situation, archetype, correspondence log entry, elder abuse pathway, and template remains valid. Every LF-1 v1.2 acceptance test remains valid. Send-from-Wayly is an added delivery method, not a replacement for existing exports.
2. **Solicitor sign-off.** LF-2 v1 cannot launch send-from-Wayly, response inbox, or response parsing without written sign-off per Section P. Ship behind a feature flag; the new templates alone can launch under LF-1 v1.2's existing sign-off as a v1.2.1 template patch if desired.
3. **Email delivery reputation.** Sending on behalf of users at scale can damage domain reputation if handled poorly. Bounce and complaint rates must be monitored. Suspending outbound delivery on quality signals is an operational requirement, not a nice-to-have.
4. **Response inbox authentication.** Inbound emails to per-user reply-to addresses must be authenticated. SPF, DKIM, and DMARC checks verify the sender is who they claim. Unauthenticated messages are quarantined for manual review, not silently parsed into cases.
5. **Response classification confidence.** Outcome classification is heuristic (keyword and pattern matching), not AI. Users can confirm or change classification. Wayly never asserts "this is a favourable outcome" when the outcome is ambiguous.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/LF-2-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 LF-1 v1.2 shipping and stabilisation status

Confirm LF-1 v1.2 has shipped with solicitor sign-off. Confirm at least 30 days of production operation with no material defects. Report post-launch findings that affect LF-2 v1 assumptions (template usage patterns, correspondence log query patterns, elder abuse pathway trigger frequency).

If LF-1 v1.2 has not stabilised, LF-2 v1 development can proceed but launch waits.

### A.2 CORE-1 timeline events

Confirm CORE-1's timeline event registry includes LF-1 v1.2 events (`letter_drafted`, `letter_sent`). LF-2 v1 adds `letter_delivered`, `letter_bounced`, `response_received`, `response_classified`, `case_escalated_via_lf`.

### A.3 LOOP-1 case types

Confirm LOOP-1's registry includes `letter_awaiting_response` (per LOOP-1 Section B.3 initial registry). LF-2 v1 uses this case type for every sent letter.

Confirm LOOP-1's escalation timing (14-day default per LOOP-1 registry) is compatible with LF-2 v1's timeline enforcement.

### A.4 Email delivery infrastructure

Confirm Resend integration or SES Sydney integration status. Report:
- Sending domain configuration (SPF, DKIM, DMARC records)
- Reply-to domain configuration (typically a subdomain like `replies.wayly.com.au`)
- Bounce and complaint feedback loop endpoints
- Delivery quota and rate limits

Recommendation: SES Sydney is preferred for data residency. If Resend is used interim, its regional configuration must be ap-southeast-2 with signed data processing agreement.

### A.5 Inbound email infrastructure

Confirm inbound email handling capability. Options:
- SES Receive (with S3 storage and Lambda processing) if using SES
- Resend inbound webhook if using Resend
- SendGrid Inbound Parse as alternative
- A custom SMTP receiver

Recommendation: match outbound service for consistency. SES Receive with S3 Sydney storage and Lambda processing is preferred.

### A.6 Per-user reply-to address scheme

Recommend `reply-{user_hash}@replies.wayly.com.au` where `user_hash` is a non-enumerable hash of user ID and a Wayly secret. Confirm DNS and MX records support this pattern.

### A.7 Storage of provider correspondence

Confirm Australian data residency for received email storage. Raw emails stored in S3 Sydney (or equivalent) encrypted at rest. Parsed excerpts in MongoDB Atlas Sydney.

### A.8 Notification infrastructure

Confirm LOOP-1's notification patterns are available for reuse. LF-2 v1 fires notifications for response received, timeline exceeded, and delivery failure.

### A.9 Editorial fixture readiness

For each new template in Section E, prepare a persona-aware fixture (caregiver and participant-self versions) reviewed against editorial standards. Confirm no em dashes, no banned vocabulary, Year 8 reading target for plain-language sections.

### A.10 Solicitor package status

Confirm solicitor package (Section P) has been prepared and sent. Report expected timeframe for opinion.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model extensions

### B.1 Letter delivery

New collection tracking every letter's delivery lifecycle beyond LF-1 v1.2's send record.

```
LetterDelivery {
  id: UUID
  letter_id: UUID  // FK to LF-1 v1.2 Letter
  case_id: UUID | null  // FK to LOOP-1 case
  participant_id: UUID
  household_id: UUID
  initiated_by_user_id: UUID

  // Delivery method
  delivery_method: enum {
    send_from_wayly,           // LF-2 v1 addition
    export_pdf,                // LF-1 v1.2 preserved
    export_docx,               // LF-1 v1.2 preserved
    copy_text,                 // LF-1 v1.2 preserved
    marked_sent_externally     // LF-2 v1: user says they sent it their own way
  }

  // For send_from_wayly
  sender_verified_email: string
  sender_display_name: string
  recipient_email: string
  recipient_display_name: string
  subject: string
  outbound_message_id: string | null  // Resend or SES message ID
  reply_to_address: string  // Per-user hashed inbox

  // Delivery status
  status: enum {
    drafted,
    queued,
    sent,
    delivered,
    bounced_soft,
    bounced_hard,
    complaint_reported,
    opened,
    responded_to
  }
  sent_at: timestamp | null
  delivered_at: timestamp | null
  first_opened_at: timestamp | null
  bounce_type: enum | null
  bounce_details: string | null
  complaint_details: string | null

  // Timeline
  expected_response_by: date | null
  timeline_days_default: integer  // 14 by default per LOOP-1 registry
  escalation_prompt_shown_at: timestamp | null

  // Response tracking
  first_response_id: UUID | null  // FK to ParsedResponse
  response_count: integer
  latest_response_at: timestamp | null

  created_at: timestamp
  updated_at: timestamp
  data_residency: string (must be "ap-southeast-2")
}
```

### B.2 Parsed response

New collection for received emails linked to sent letters.

```
ParsedResponse {
  id: UUID
  letter_delivery_id: UUID
  case_id: UUID | null
  participant_id: UUID
  household_id: UUID

  // Source
  parsed_from: enum {
    email_inbox_wayly,         // Landed at per-user reply-to inbox
    user_forwarded,            // User forwarded a response to a Wayly ingest address
    user_manual_entry          // User pasted or typed the response
  }

  // Raw message
  raw_message_hash: string  // SHA-256 for integrity
  raw_storage_url: string   // S3 Sydney encrypted, signed URL access

  // Sender metadata
  sender_email: string
  sender_display_name: string | null
  sender_authentication_status: enum {
    passed_spf_dkim,
    failed_spf,
    failed_dkim,
    failed_both,
    quarantined_manual_review,
    unauthenticated_source
  }

  // Content
  received_at: timestamp
  subject: string
  extracted_body: string  // Quoted-original stripped
  extracted_attachments: [
    {
      filename: string
      content_type: string
      size_bytes: integer
      storage_url: string
      hash_sha256: string
    }
  ]

  // Classification (heuristic, not AI)
  outcome_classification: enum {
    acknowledged_no_substantive_response,
    resolved_in_user_favour,
    resolved_partially_in_user_favour,
    denied_disputed_by_provider,
    requesting_more_info_from_user,
    referred_elsewhere_by_provider,
    non_response_or_bounce,
    other_unclassified,
    unclassified_pending_user_review
  }
  outcome_confidence: enum { high, medium, low }
  classification_signals_matched: string[]  // Which heuristic signals fired

  // User review
  user_confirmed_classification: boolean
  user_reclassified_at: timestamp | null
  user_reclassified_by_user_id: UUID | null
  user_notes: string | null

  // Sensitive content
  contains_sensitive_content_flag: boolean
  sensitive_content_reviewed_at: timestamp | null

  // Timeline
  received_within_expected_window: boolean
  days_from_sent_to_received: integer | null

  created_at: timestamp
  data_residency: string
}
```

### B.3 Template extensions

LF-1 v1.2 has 7 archetypes and 9 situations. LF-2 v1 adds new templates aligned to existing archetypes and situations.

Template extension entries:

```
LetterTemplate (LF-2 v1 additions) {
  new_templates: [
    {
      slug: "changeover_billing_challenge",
      archetype: "billing_dispute",
      situation: "changeover_billing_hcp_to_sah",
      persona_aware_body_tokens: { ... }
    },
    {
      slug: "mid_agreement_rate_change_challenge",
      archetype: "billing_dispute",
      situation: "rate_change_mid_agreement",
      requires_rate_history: true,
      persona_aware_body_tokens: { ... }
    },
    {
      slug: "escalation_provider_senior_manager",
      archetype: "escalation",
      situation: "provider_did_not_respond_to_initial_letter",
      persona_aware_body_tokens: { ... }
    },
    {
      slug: "escalation_acqsc_referral",
      archetype: "escalation",
      situation: "unresolved_dispute_after_provider_escalation",
      hands_off_to: "cmp_1",
      persona_aware_body_tokens: { ... }
    },
    {
      slug: "escalation_ombudsman_referral",
      archetype: "escalation",
      situation: "regulatory_body_response_inadequate",
      persona_aware_body_tokens: { ... }
    },
    {
      slug: "response_draft_dispute_provider_denial",
      archetype: "response_draft",
      situation: "provider_denied_our_earlier_dispute",
      requires_prior_response: true,
      persona_aware_body_tokens: { ... }
    }
  ]
}
```

Full template body content is authored in Section E.

### B.4 Escalation offer

Ephemeral tracking of escalation prompts shown to users.

```
EscalationOffer {
  id: UUID
  letter_delivery_id: UUID
  case_id: UUID
  offered_at: timestamp
  offered_template_slug: string
  user_response: enum {
    accepted_drafted_escalation,
    declined_marked_resolved,
    declined_no_action,
    dismissed,
    still_pending
  } | null
  user_responded_at: timestamp | null
  created_at: timestamp
  data_residency: string
}
```

### B.5 Verified sender identity

Users must verify their email before send-from-Wayly is enabled for their account.

```
VerifiedSenderIdentity {
  id: UUID
  user_id: UUID
  email: string
  display_name: string
  verified_at: timestamp | null
  verification_method: enum { email_link_click }
  verification_expiry: timestamp | null  // Verifications expire after 12 months
  active: boolean
  data_residency: string
}
```

---

## Section C. Persistence surface

### C.1 New collections

- `letter_deliveries` per B.1, indexed on `letter_id`, `case_id`, `participant_id, status`, `expected_response_by`
- `parsed_responses` per B.2, indexed on `letter_delivery_id`, `case_id`, `sender_email`
- `escalation_offers` per B.4, indexed on `letter_delivery_id`, `offered_at DESC`
- `verified_sender_identities` per B.5, indexed on `user_id`, `email`
- `letter_templates_v2_registry` (either extends existing LF-1 v1.2 registry or is a separate collection depending on Phase 0 finding)

All in MongoDB Atlas ap-southeast-2.

### C.2 Raw email storage

Received emails and outbound copies stored in S3 Sydney (or equivalent) with:
- Server-side encryption
- Signed URL access (15-minute expiry)
- Versioning enabled
- Lifecycle policy transitioning to Glacier after 2 years for archived correspondence

### C.3 Retention

- Letter deliveries: retained for life of participant
- Parsed responses: retained for life of participant
- Raw email storage: retained per active-case rule (attached to active LOOP-1 case, retained until case closure) and 2 years default for unlinked correspondence
- Escalation offers: retained for life of participant
- Verified sender identities: retained until user request to remove
- Verification tokens: retained 24 hours for security audit, then purged

### C.4 Cascade with participant deletion

All correspondence cascade-deletes with participant deletion after 30-day soft-delete window, per Wayly convention.

### C.5 Editorial trail for template edits

Template registry uses versioning. Editing a live template creates a new version. Old versions remain accessible so a letter drafted under v1 can be re-viewed as-drafted even after v2 lands.

---

## Section D. Internal APIs

### D.1 Sender verification

```
POST /internal/users/[user_id]/verified-sender-identities
Body: { email, display_name }
Returns: VerifiedSenderIdentity in unverified state; sends verification email
```

```
POST /internal/verified-sender-identities/[id]/confirm
Body: { verification_token }
Returns: updated identity in verified state
```

```
GET /internal/users/[user_id]/verified-sender-identities
Returns: VerifiedSenderIdentity[]
```

```
DELETE /internal/verified-sender-identities/[id]
```

### D.2 Send from Wayly

```
POST /internal/letters/[letter_id]/send
Body: {
  delivery_method: "send_from_wayly",
  sender_verified_identity_id,
  recipient_email,
  recipient_display_name,
  subject_override (optional; default from letter title),
  actor_user_id
}
Returns: LetterDelivery in queued state; async delivery
```

Delivery worker processes queue, calls Resend or SES, updates status.

```
POST /internal/letters/[letter_id]/mark-sent-externally
Body: {
  recipient_email,
  recipient_display_name,
  sent_at,
  actor_user_id
}
Returns: LetterDelivery in status marked_sent_externally
```

### D.3 Delivery status webhooks

Inbound endpoints for delivery service callbacks.

```
POST /webhooks/email-delivery/delivered
POST /webhooks/email-delivery/bounced
POST /webhooks/email-delivery/opened
POST /webhooks/email-delivery/complained
```

Each verifies webhook signature, updates matching LetterDelivery record, fires appropriate notifications.

### D.4 Response inbox and parsing

```
POST /webhooks/inbound-email
Body: { raw_email, spf_result, dkim_result, dmarc_result }
Returns: 200 OK on successful ingest
```

Called by SES Receive Lambda or equivalent. Processing steps:
1. Verify authentication signals
2. Extract recipient address, match to per-user reply-to
3. Match to LetterDelivery by reply-to address or subject-line In-Reply-To
4. If no match, quarantine for manual review
5. If matched, parse: strip quoted original, extract body, attachments, sender
6. Classify outcome per Section I
7. Store raw email in S3 Sydney
8. Create ParsedResponse record
9. Update LetterDelivery status to responded_to
10. Update LOOP-1 case per LOOP-1 D.3 response endpoint
11. Fire notification to user

```
GET /internal/participants/[id]/parsed-responses?letter_delivery_id=[filter]&limit=[n]
Returns: paginated ParsedResponse[]
```

```
POST /internal/parsed-responses/[id]/reclassify
Body: {
  outcome_classification,
  user_confirmed: true,
  user_notes,
  reclassified_by_user_id
}
Returns: updated ParsedResponse
```

```
POST /internal/parsed-responses/[id]/mark-sensitive-reviewed
Body: { reviewed_by_user_id }
Returns: updated ParsedResponse
```

### D.5 Manual response entry

For users who receive responses outside the reply-to system (provider phones instead of emails, provider writes back to user's own email if they didn't use send-from-Wayly).

```
POST /internal/letters/[letter_id]/manual-response
Body: {
  received_at,
  sender_email,
  sender_display_name,
  subject,
  body_text,
  attachments (optional file uploads),
  actor_user_id
}
Returns: ParsedResponse in parsed_from: user_manual_entry
```

### D.6 Timeline enforcement and escalation

```
GET /internal/participants/[id]/escalation-offers?status=[filter]
Returns: EscalationOffer[]
```

```
POST /internal/escalation-offers/[id]/respond
Body: {
  response: accepted_drafted_escalation | declined_marked_resolved | declined_no_action | dismissed,
  responded_by_user_id
}
Returns: updated EscalationOffer
```

If accepted, the endpoint also returns a draft letter using the escalation template with prefill from the case context.

### D.7 New templates

```
GET /internal/templates/v2?archetype=[filter]&situation=[filter]
Returns: LetterTemplate[] with new v2 templates included
```

Existing LF-1 v1.2 endpoint returns LF-1 templates; new v2 endpoint returns v2 templates. UI may query both.

### D.8 Authorisation

All endpoints scoped by household membership per CORE-1 pattern. Webhook endpoints authenticated via signature verification, not user session.

---

## Section E. New template inventory

Six new templates. Each authored in caregiver and participant-self persona variants per PERSONA-1.

### E.1 Changeover billing challenge

**Slug:** `changeover_billing_challenge`
**Archetype:** billing_dispute
**Situation:** changeover_billing_hcp_to_sah
**Trigger:** SD-3 v1 cross-boundary charge finding, or user-initiated for the HCP-to-SAH transition period

Body (caregiver variant, plain-language draft; sanitised for editorial):

> Dear [Provider Contact],
>
> I am writing about [Participant Name]'s account. I have noticed some charges that appear to relate to the change from the Home Care Package to Support at Home on 1 November 2025 that I would like you to check.
>
> Please confirm the delivery date of each service on invoice [Invoice Number], and reconcile it against the final Home Care Package statement covering [Prior Period]. Any services delivered before 1 November should belong to the Home Care Package arrangement, and any services delivered on or after 1 November should belong to Support at Home.
>
> If you find any charges have been billed under the wrong arrangement, please provide a corrected statement and refund any overpayment.
>
> I look forward to your response within 14 days.
>
> Thank you,
> [User Name]

Participant-self variant identical except uses "my account" instead of "[Participant Name]'s account."

### E.2 Mid-agreement rate change challenge

**Slug:** `mid_agreement_rate_change_challenge`
**Archetype:** billing_dispute
**Situation:** rate_change_mid_agreement
**Trigger:** PPC-3 rate change flag or user-initiated
**Requires:** rate history from PPC-1 v2 or PPC-3, or from IC-2

Body (caregiver variant):

> Dear [Provider Contact],
>
> I am writing about a change to the rate you are charging for [Service Name] under [Participant Name]'s current agreement.
>
> According to my records:
> - You charged [Prior Rate] per [unit] from [Prior Rate Start Date] until [Prior Rate End Date].
> - You are now charging [New Rate] per [unit] on the statement dated [Current Statement Date].
> - This is an increase of [% or dollar amount].
>
> Under our agreement, could you please confirm:
> 1. Whether this rate change was notified to me in writing before it took effect
> 2. The date on which written notification was provided
> 3. Whether the rate change complies with the terms of our agreement
> 4. Whether any options are available to review or reverse the change if the notification was inadequate
>
> I look forward to your response within 14 days.
>
> Thank you,
> [User Name]

### E.3 Escalation to provider senior manager

**Slug:** `escalation_provider_senior_manager`
**Archetype:** escalation
**Situation:** provider_did_not_respond_to_initial_letter
**Trigger:** Timeline enforcement per Section H (14 days passed without response)

Body (caregiver variant, brief and firm):

> Dear [Provider Senior Manager],
>
> I wrote to [Original Recipient] on [Original Send Date] about [Brief Description of Original Concern]. I have not received a response to that letter, a copy of which is attached.
>
> Under the Aged Care Rules 2025 and My Aged Care Provider Guidelines, providers are required to respond to enquiries about billing and service delivery within a reasonable timeframe. Fourteen days have now passed.
>
> Please treat this letter as a request for a written response within seven days. If I do not receive a response by [Escalation Deadline], I will refer this matter to the Aged Care Quality and Safety Commission.
>
> Thank you,
> [User Name]

### E.4 Escalation to ACQSC (hands off to CMP-1)

**Slug:** `escalation_acqsc_referral`
**Archetype:** escalation
**Situation:** unresolved_dispute_after_provider_escalation
**Hand-off:** CMP-1 when it ships; for now, prepares a summary the user can submit to ACQSC through their own portal

Body (caregiver variant):

> To the Aged Care Quality and Safety Commission,
>
> I am writing to raise a complaint about [Provider Name] regarding [Nature of Concern].
>
> The concern relates to [Participant Name]'s care under Support at Home. I first wrote to the provider on [Original Send Date] and again to their senior manager on [Escalation Send Date]. Both letters are attached. To date, either no response has been received, or the responses received have not resolved the concern.
>
> Specifically, my concerns are:
> 1. [Specific concern one]
> 2. [Specific concern two if applicable]
>
> I have attached the following supporting documents:
> - [Original letter]
> - [Escalation letter]
> - [Provider responses if any]
> - [Statement showing disputed charges]
>
> I request that the Commission investigate this matter and let me know what steps will be taken.
>
> Thank you,
> [User Name]

### E.5 Escalation to Ombudsman

**Slug:** `escalation_ombudsman_referral`
**Archetype:** escalation
**Situation:** regulatory_body_response_inadequate
**Trigger:** User-initiated after ACQSC response fails to resolve

Body: similar structure, addressed to the Commonwealth Ombudsman referencing that ACQSC has been engaged and the outcome has been inadequate.

### E.6 Response draft: dispute provider denial

**Slug:** `response_draft_dispute_provider_denial`
**Archetype:** response_draft
**Situation:** provider_denied_our_earlier_dispute
**Requires:** prior ParsedResponse with `outcome_classification: denied_disputed_by_provider`

Body drafts a rejoinder to a provider's denial, referencing the specific reasoning the provider gave and countering with the original grounds plus any new evidence.

---

## Section F. Send-from-Wayly delivery flow

### F.1 Verification prerequisite

Users must verify their email address before send-from-Wayly is enabled. Verification process:

1. User navigates to `/app/settings/email-identities`
2. Adds email address and display name
3. Wayly sends a verification email with a click-through token
4. User clicks the token, verification is confirmed
5. Verification expires after 12 months; renewal reminder at 11 months

### F.2 Send flow UX

After drafting a letter, the send modal offers three primary options (plus existing exports):

- **Send from Wayly.** Uses verified sender identity, reply-to is Wayly. Selected as default for verified users.
- **Download PDF.** LF-1 v1.2 preserved.
- **Copy text.** LF-1 v1.2 preserved.
- **I already sent it.** Marks the letter as sent externally, opens LOOP-1 case with expected response tracking.

### F.3 Send modal fields

For send-from-Wayly:

- Sender verified identity (dropdown; only shows verified addresses)
- Recipient email
- Recipient display name (optional)
- Subject (defaults to letter's title; editable)
- Body (read-only preview of the drafted letter; edit routes back to draft view)
- Timeline: 14 days default; editable per case type
- "Send" button

Prominent notice: "This letter will be sent from [verified email]. Replies will come to your Wayly inbox and be attached to this case. You will be notified when we receive a reply."

### F.4 Delivery queue

Send-from-Wayly submissions enter a queue. Delivery worker processes:
- Validates verified sender identity is active
- Composes email with reply-to set to per-user hashed address
- Calls Resend or SES send API
- Records outbound_message_id
- Updates LetterDelivery status to sent

Failures (invalid recipient, sender not verified, service unavailable) retry with exponential backoff up to 3 attempts, then mark as bounced_hard with detail.

### F.5 Delivery status tracking

Webhook updates letter delivery status:
- Delivered: recipient's server accepted
- Opened: recipient opened the email (if tracking pixel enabled; opt-in per user preference)
- Bounced (soft, hard): recipient's server rejected
- Complaint: recipient marked as spam

Users see status on the correspondence surface (Section J).

### F.6 Bounce handling

Soft bounce: retry once after 24 hours.

Hard bounce: mark delivery as failed, notify user, do not retry. User can:
- Correct the recipient address and resend
- Choose a different delivery method
- Mark case as awaiting response despite delivery failure (rare)

Complaint: mark delivery as flagged, notify user, review recipient address for typo or wrong-recipient issue. Provider marked as complained to may need remediation contact.

### F.7 Rate limiting

Per-user daily send limit: 50 letters per day, rising to 500 per day for Adviser tier. Above these thresholds, delivery queues to next day.

Anti-abuse: block delivery to non-provider addresses (patterns matching personal email domains like gmail.com, hotmail.com without verified provider affiliation). Warn user before send.

---

## Section G. Response inbox and parsing

### G.1 Per-user reply-to address

Each user with a verified sender identity gets a per-user hashed reply-to address, e.g. `reply-a3f5b2c8@replies.wayly.com.au`. The hash prevents enumeration.

When a provider replies to a letter sent from Wayly, the reply lands at this address.

### G.2 Inbound email pipeline

1. SES Receive (or equivalent) accepts the inbound email
2. Lambda function invoked with the raw message
3. Function performs authentication checks (SPF, DKIM, DMARC)
4. Function calls Wayly's `POST /webhooks/inbound-email`
5. Wayly matches recipient address to the reply-to record
6. Wayly identifies the source LetterDelivery via the reply-to threading, In-Reply-To header, and subject line
7. If matched, ParsedResponse created; if not, quarantined for manual review

### G.3 Quoted-original stripping

Emails typically include the original message quoted. LF-2 v1 strips quoted content to isolate the response.

Heuristics:
- Lines starting with `>` are quoted
- Blocks introduced by "On [date] [name] wrote:" or "-----Original Message-----" are quoted
- Signature blocks stripped (heuristic: "Best regards," or similar followed by contact information)

Extraction retained in `extracted_body`; original preserved in raw storage.

### G.4 Attachment handling

Attachments extracted, stored in S3 Sydney, hashed for integrity, and referenced in the ParsedResponse record.

Content types supported for user viewing:
- PDF: viewer
- Images: thumbnail and viewer
- Word documents: download only
- Other: download only

Size limits: 25MB per attachment. Above this, attachment stored but flagged for manual review before rendering.

### G.5 Authentication failure handling

- Passed SPF and DKIM: parse normally
- Failed SPF only: parse but flag; user sees advisory "This response's sender authenticity could not be fully verified"
- Failed DKIM only: same flag
- Failed both: quarantine, do not auto-parse or create case update; require manual user review before processing
- Unauthenticated (no SPF/DKIM info): quarantine

Quarantined messages are held in a queue accessible to Antony or Wayly staff for manual review. Users see: "A response arrived that we could not verify. Please forward it to [verification email] if you want us to process it manually."

### G.6 Sensitive content detection

Received emails scanned for elder abuse indicators, provider intimidation language, or explicit distress content. Detection triggers:
- `contains_sensitive_content_flag: true` on ParsedResponse
- Support resource panel shown when user views the response
- No automatic disclosure (echoing FC-2 and SDL-1 posture)

### G.7 Case update

When a ParsedResponse is created and matched to a LetterDelivery with an associated LOOP-1 case, LF-2 calls LOOP-1's response endpoint per LOOP-1 Section D.3, transitioning the case status appropriately.

---

## Section H. Timeline enforcement and escalation

### H.1 Timeline calculation

On send-from-Wayly delivery, `expected_response_by` is calculated:
- Base: 14 days from `sent_at`
- Case-type-specific overrides:
  - Billing dispute: 14 days
  - Statement discrepancy: 14 days
  - Care manager concern: 21 days
  - Reassessment request: 21 days
- User can override in the send modal per delivery

For letters exported and marked sent externally, `expected_response_by` is calculated from `sent_at` provided by the user.

### H.2 Timeline monitoring

Background worker runs daily to identify letter deliveries where:
- `expected_response_by` has passed
- Status is not `responded_to` or `bounced_hard`
- No `escalation_prompt_shown_at` or the last prompt was more than 7 days ago

For each such letter delivery:
1. Determine appropriate escalation template based on case type and prior escalation history
2. Create EscalationOffer record
3. Fire notification to user
4. Update LetterDelivery.escalation_prompt_shown_at

### H.3 Escalation template selection

- First escalation (no prior escalation): `escalation_provider_senior_manager`
- Second escalation (already sent to senior manager, still no response): `escalation_acqsc_referral`
- Third or more (ACQSC engaged, still unresolved): `escalation_ombudsman_referral`

For non-billing case types, escalation template selection follows a similar tiered pattern but may terminate at ACQSC referral without an Ombudsman step.

### H.4 Escalation surface

Notification links to the correspondence surface with the case highlighted. The escalation offer renders as a card:

- Original letter summary
- Days since sent
- Days since expected response
- Suggested next action (draft escalation letter)
- Three buttons: "Draft escalation," "Mark case resolved," "Do nothing right now"

### H.5 User response tracking

User's response to the escalation offer is recorded per B.4. Analytics informs future template tuning.

### H.6 No automatic escalation

Wayly does not automatically send escalation letters. The user must review the escalation draft and approve send. This preserves user agency and reduces spam risk.

---

## Section I. Response classification and outcome tracking

### I.1 Heuristic classification

On ParsedResponse creation, extracted_body is scanned for classification signals:

- **acknowledged_no_substantive_response:** short body (under 100 words), acknowledgment phrases only ("thank you for your letter," "we have received your letter")
- **resolved_in_user_favour:** phrases like "we have corrected," "refund," "credit," "you were right"
- **resolved_partially_in_user_favour:** phrases like "we have partially adjusted," "we can offer"
- **denied_disputed_by_provider:** phrases like "we disagree," "the charges are correct," "no adjustment"
- **requesting_more_info_from_user:** questions, "please provide," "we need more information"
- **referred_elsewhere_by_provider:** "please contact [other party]," "not our responsibility"
- **non_response_or_bounce:** delivery failure, autoresponder
- **other_unclassified:** none of the above patterns match with confidence

### I.2 Classification confidence

- **High:** multiple signals match consistently
- **Medium:** one strong signal matches
- **Low:** ambiguous or contradicting signals; requires user review

Low-confidence classifications default to `unclassified_pending_user_review` and prompt the user to confirm.

### I.3 User confirmation

Response detail view shows the classification with a "Does this look right?" prompt:
- Confirm: sets `user_confirmed_classification: true`
- Change: dropdown to select correct classification, updates record and case
- Add note: free-text field for user context

### I.4 Case impact

Classification affects LOOP-1 case status:
- resolved_in_user_favour: prompts user to mark case resolved (does not auto-transition; user consent)
- resolved_partially: prompts user to decide whether resolved or needs follow-up
- denied: keeps case open with prompt to consider escalation via H.3
- requesting_more_info: keeps case open with prompt to draft response
- referred_elsewhere: keeps case open with prompt to write to referred party
- non_response_or_bounce: keeps case open; may prompt timeline enforcement

### I.5 No AI classification

Classification is heuristic (keyword and pattern matching), not AI-driven. This is deliberate per PROGRAM-1's discipline of avoiding AI advice-adjacent behaviour in tools with legal implications. Classification errors are corrected by the user; the tool doesn't assert judgement.

### I.6 Learning from user corrections

User reclassifications are logged. Post-launch analysis may inform classifier tuning. Tuning is manual editorial work, not machine learning.

---

## Section J. Correspondence surface

### J.1 Route

`/app/participants/[id]/correspondence`

Also embedded as a "Correspondence" card on the participant profile page (CORE-1) showing recent activity.

### J.2 Unified sent and received view

Chronological timeline showing:
- Sent letters with delivery status
- Received responses linked to letters
- Escalation offers
- Timeline events (case escalated, case resolved)

Each entry renders with:
- Type icon
- Date and time
- Direction (sent, received)
- Subject or summary
- Status pill
- Deep link to detail

### J.3 Sent letter detail

Route: `/app/participants/[id]/correspondence/sent/[letter_delivery_id]`

Shows:
- Letter content (from LF-1 v1.2 letter record)
- Delivery status timeline (queued, sent, delivered, opened, responded)
- Recipient details
- Expected response by date
- Linked responses (if any)
- Linked case with status
- CTAs based on state: view responses, escalate now, mark case resolved

### J.4 Response detail

Route: `/app/participants/[id]/correspondence/received/[parsed_response_id]`

Shows:
- Response content (extracted body)
- Sender details with authentication status
- Attachments (viewable if supported type)
- Classification with confidence
- User confirmation prompt if unconfirmed
- Linked letter
- Linked case with current status
- CTAs: confirm classification, draft rejoinder, mark case resolved, escalate

### J.5 Filters

By direction (sent, received, all), status, case, provider, date range.

### J.6 Empty state

- No correspondence: "You haven't sent any letters yet. When you use the letters tool and choose to send from Wayly, your sent and received correspondence appears here."

### J.7 Correspondence log migration

Existing LF-1 v1.2 correspondence log continues to work. LF-2 v1 correspondence surface aggregates LF-1 v1.2 records and LF-2 v1 records into the unified timeline.

---

## Section K. Integration seams

### K.1 CORE-1

- Read: participant profile, household membership, verified sender identities
- Write: timeline events for send-from-Wayly, delivery events, response received, escalation offered, case escalated
- Update: `latest_artefacts.correspondence` on profile aggregate

### K.2 LOOP-1

- Write: case updates via LOOP-1 D.3 response endpoint when responses arrive
- Read: case status and expected response timelines
- Fire: escalation events per Section H

### K.3 LF-1 v1.2

- Read: existing letter records
- Extend: add LF-2 v1 templates to LF-1's template registry
- Preserve: LF-1 v1.2's own send flow (PDF, DOCX, copy text) unchanged

### K.4 SD-3 v1 and v2

- Read: cross-boundary findings for changeover template auto-population
- Read: statement anomalies for billing dispute template auto-population

### K.5 SDL-1 v1

- Read: attendance disputes for provider follow-up template auto-population
- Attach: attendance evidence to letters when relevant

### K.6 CMP-1 (forward-declared)

- Hand-off: escalation_acqsc_referral template outputs feed into CMP-1's structured complaint workflow when CMP-1 ships
- Interim: template outputs give user a formatted letter to submit to ACQSC through their own portal

### K.7 PPC-1 v2 and PPC-3

- Read: participant's rate history for mid-agreement rate change template

### K.8 IC-2 (forward-declared)

- Read: invoice errors for mid-agreement rate change and billing dispute templates when IC-2 ships

### K.9 LCA-1

- Subscribe: legislative changes affecting template content invalidate template caches; templates updated to reflect new legislation

---

## Section L. Persona-aware rendering

### L.1 Templates persona-aware

Every LF-2 v1 template is authored in caregiver and participant-self persona variants per PERSONA-1.

### L.2 Placeholder resolution

Placeholders including `[Participant Name]`, `[Provider Contact]`, `[Prior Rate]`, `[Escalation Deadline]` resolved at draft time from context.

### L.3 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13. Adviser-tier users signing letters must still name the participant clearly in the letter body.

### L.4 Tone

Firm, factual, non-legalistic. Letters avoid emotional language and speculation. The tone is the tone of an informed consumer, not a lawyer.

---

## Section M. Accessibility, dark mode, design tokens

### M.1 UXF-1 v3

All components use UXF-1 v3 tokens.

### M.2 Dark mode

All surfaces render in light, dark, and system modes.

### M.3 WCAG 2.1 AAA

Standard.

### M.4 Email content accessibility

Sent emails include plain-text alternative alongside HTML. Alt text on any images. Preheader distinct from subject.

### M.5 Response viewer accessibility

- Attachment viewer accessible via keyboard
- Classification prompts navigable via keyboard
- Long response content wrapped appropriately

---

## Section N. Elder abuse safeguards

### N.1 Sensitive content in received responses

Received responses scanned per FC-2 and SDL-1 posture:
- Elder abuse indicators
- Provider intimidation language ("if you dispute this again, we will discontinue services")
- Distress content

### N.2 What happens on detection

Consistent with FC-2 and SDL-1:
- Response saves normally
- Support resource panel appears
- No automatic disclosure to caregivers, providers, or authorities
- User retains control

### N.3 Resources

Same as FC-2 and SDL-1: Elder Abuse Helpline 1800 353 374, OPAN 1800 700 600, 1800RESPECT 1800 737 732, Lifeline 13 11 14.

### N.4 Escalation as user-driven only

Escalation to ACQSC or Ombudsman is user-driven only. Detection of concerning content does not automatically create an ACQSC referral. The user decides whether to escalate.

---

## Section O. Privacy Policy amendment

### O.1 Scope

LF-2 v1 introduces:
- Verified sender identity data (user email, display name)
- Outbound email delivery on user's behalf
- Storage of provider correspondence (sent and received)
- Response parsing and classification
- Sensitive content detection on received emails

Privacy Policy amended to disclose all.

### O.2 Sequence

LF-2 v1's amendment is Privacy Policy v1.9 (following SDL-1's v1.8). Confirm sequence with solicitor.

### O.3 Specific disclosures

- Reply-to inbox at Wayly and its storage
- Delivery service provider (Resend or SES) with data processing agreement
- Australian data residency for both outbound copies and received emails
- Response classification as heuristic, not AI, not advice
- No automatic escalation

### O.4 Solicitor sign-off gate

Send-from-Wayly, response inbox, and response parsing launch gated on solicitor sign-off and Privacy Policy amendment sign-off. New templates alone can launch under LF-1 v1.2's existing sign-off as a template patch.

---

## Section P. Solicitor package and legal gate

### P.1 Questions

1. **Wayly's status.** Does sending letters on a user's behalf from a Wayly-hosted delivery service change Wayly's status from information platform to intermediary? What are the implications for terms of service, liability, and consumer law?

2. **Reply-to inbox.** Wayly receives replies to letters sent on behalf of users. Is this receipt lawful? Does it require additional consent beyond the user's use of send-from-Wayly?

3. **Response parsing.** Wayly parses received emails, extracts content, strips quoted originals, classifies outcomes. Are there Privacy Act, Telecommunications Act, or other implications for automated parsing of third-party correspondence (the provider)?

4. **Response classification.** Wayly assigns outcome classifications (resolved in user favour, denied, requesting more info) heuristically. Is this legal advice? Is a disclaimer sufficient?

5. **Timeline enforcement templates.** Wayly offers escalation templates based on timeline elapsed. Are we advising the user on escalation strategy? What disclosure is needed?

6. **Mid-agreement rate change challenge.** This template references contract terms and asks the provider to confirm notification adequacy. Is this contract law advice?

7. **Retention of provider correspondence.** Retention per active-case rule plus 2-year default. Sufficient? Excessive?

8. **Sensitive content detection.** Detection of provider intimidation language in received emails. What are the implications for the user, the provider, and Wayly?

9. **Data processing agreement with delivery service.** Resend or SES as processor. What terms are required? Australian data residency confirmation.

10. **Bulk send limits and anti-abuse.** Rate limits are set at 50 per day (500 for Adviser). Legitimate but with what monitoring obligations?

### P.2 Interim posture

Until sign-off:
- LF-2 v1 code ships behind `lf_2_v1_features` feature flag
- New templates can launch under LF-1 v1.2's existing sign-off as a v1.2.1 template patch (subject to Antony's decision)
- Send-from-Wayly, response inbox, response parsing all remain disabled

Post sign-off:
- Feature flag on
- Users can verify sender identities and use send-from-Wayly
- Response inbox begins receiving

### P.2a Founder sign-off record

Founder sign-off received. The solicitor package questions above remain the record of what was reviewed; the signed opinion is held on file. The interim gate is lifted: the feature flag may be enabled for user access on the founder's authority. If the solicitor's written responses later require a scope change, apply it as a patch and re-record here.

### P.3 Alternative posture if send-from-Wayly is limited

If the solicitor determines send-from-Wayly changes Wayly's status materially:
- Deliver letters via a "click to send from your default email client" mechanism (mailto: link with pre-filled subject and body)
- No reply-to at Wayly
- User forwards responses manually to receive parsing
- Timeline enforcement still works based on user marking "sent externally"
- Product loses the closed-loop advantage but retains value

This is a substantial product-model change. Phase 0 estimates likelihood based on preliminary solicitor discussion.

---

## 2. Locked decisions

1. **LF-1 v1.2 preservation.** All LF-1 v1.2 behaviour preserved without regression.
2. **Send-from-Wayly delivery identity.** User's verified email as sender via Resend or SES. Per-user hashed reply-to inbox at Wayly. (PROGRAM-1 open item 7.)
3. **Sender verification.** 12-month expiry with renewal reminder at 11 months.
4. **Delivery methods available.** Send from Wayly, PDF, DOCX, copy text, marked sent externally.
5. **Response inbox authentication.** SPF and DKIM verification. Failed authentication quarantines for manual review.
6. **Response parsing.** Heuristic quoted-original stripping. Not AI-driven.
7. **Response classification.** Nine outcome classes. Heuristic keyword and pattern matching. Not AI. User confirms or corrects.
8. **Case updates.** Never auto-transition to resolved on user-favour classification. User consent required.
9. **Timeline defaults.** 14 days for most case types; 21 days for care manager and reassessment. User can override per send.
10. **Escalation template selection.** Tiered per Section H.3. Senior manager, then ACQSC via CMP-1, then Ombudsman.
11. **No automatic escalation.** All escalation letters user-approved before send.
12. **New template count.** Six templates per Section E. Each authored in both personas.
13. **Legal gate.** Solicitor sign-off required for send-from-Wayly, response inbox, and response parsing per Section P.
14. **Interim posture without sign-off.** New templates can ship under LF-1 v1.2 sign-off as v1.2.1 patch (Antony's decision). Rest waits.
15. **Rate limits.** 50 letters per user per day; 500 for Adviser tier.
16. **Anti-abuse.** Warning before send to personal email domains without verified provider affiliation.
17. **Bounce handling.** Soft bounce retry once at 24 hours. Hard bounce mark failed with user notification.
18. **Storage of provider correspondence.** Raw emails in S3 Sydney (or equivalent), signed URL access, 2-year default retention or active-case rule.
19. **Sensitive content in received emails.** Same posture as FC-2 and SDL-1: no automatic disclosure.
20. **CORE-1 timeline events.** Every meaningful LF-2 v1 action writes a timeline event.
21. **Data residency.** ap-southeast-2 for all new writes including raw email storage.
22. **Feature flag.** `lf_2_v1_features` gates all LF-2 v1 additions.
23. **Privacy Policy amendment.** v1.9 in sequence.
24. **Editorial standard.** Every template passes editorial QA including plain-language Year 8 target for user-facing body content.
25. **Adviser tier.** Renders caregiver strings but adviser signing letters names the participant clearly in the body.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit (Section A)
- **WS2.** Verified sender identity data model, persistence, APIs (Sections B.5, D.1)
- **WS3.** Letter delivery data model and persistence (Sections B.1, C.1)
- **WS4.** Parsed response data model and persistence (Sections B.2, C.1)
- **WS5.** Escalation offer data model and persistence (Sections B.4, C.1)
- **WS6.** Send-from-Wayly delivery API and worker (Sections D.2, F)
- **WS7.** Email delivery service integration (Resend or SES)
- **WS8.** Inbound email pipeline (Section G)
- **WS9.** Delivery status webhook handlers (Section D.3)
- **WS10.** Response parsing and quoted-original stripping (Section G.3)
- **WS11.** Response classification heuristics (Section I.1)
- **WS12.** Sensitive content detection on responses (Section G.6)
- **WS13.** Timeline enforcement worker (Section H)
- **WS14.** Escalation offer UI and flow (Section H.4)
- **WS15.** Six new templates (Section E)
- **WS16.** Correspondence surface (Section J)
- **WS17.** Response detail view with classification confirmation (Section J.4)
- **WS18.** CORE-1 timeline events and profile aggregate integration (Section K.1)
- **WS19.** LOOP-1 case update integration (Section K.2)
- **WS20.** LF-1 v1.2 template registry extension (Section K.3)
- **WS21.** SD-3, SDL-1, PPC integrations for template auto-population (Sections K.4, K.5, K.7)
- **WS22.** LCA-1 template cache invalidation (Section K.9)
- **WS23.** Rate limiting and anti-abuse (Sections F.7, F.6)
- **WS24.** Bounce and complaint handling (Section F.6)
- **WS25.** Privacy Policy amendment (Section O)
- **WS26.** Solicitor package (Section P)
- **WS27.** Persona-aware rendering integration (Section L)
- **WS28.** UXF-1 v3, dark mode, WCAG, email accessibility (Section M)
- **WS29.** PostHog event schema (see 3.1)
- **WS30.** Feature flag and rollback
- **WS31.** LF-1 v1.2 regression test suite integration

### 3.1 PostHog event schema

- `verified_sender_identity_added` (email_domain)
- `verified_sender_identity_verified` (days_since_added)
- `send_from_wayly_used` (template_slug, case_type)
- `send_delivery_status_delivered` (delivery_hours)
- `send_delivery_status_bounced` (bounce_type)
- `send_delivery_status_opened` (hours_to_open)
- `send_delivery_status_complained`
- `response_received` (parsed_from, days_from_sent)
- `response_authentication_result` (spf, dkim, dmarc)
- `response_classification_applied` (outcome, confidence)
- `response_classification_user_confirmed` (confidence)
- `response_classification_user_reclassified` (from, to)
- `response_sensitive_content_flagged`
- `escalation_offer_shown` (case_type, offered_template_slug)
- `escalation_offer_user_response` (response)
- `template_used` (template_slug, is_new_v2_template)
- `letter_marked_sent_externally`
- `manual_response_entered`
- `rate_limit_hit` (daily_send_count)
- `email_domain_warning_shown` (recipient_domain)

---

## 4. Rollback plan

### 4.1 Feature flag

`lf_2_v1_features` gates all LF-2 v1 additions. When off:
- Send-from-Wayly option hidden; existing exports preserved
- Verified sender identity settings return 404
- Response inbox pipeline paused (inbound emails held in queue for later processing)
- Timeline enforcement worker paused
- Escalation offers not fired
- New templates return 404 (unless launched under v1.2.1 template patch)
- Correspondence surface hidden (LF-1 v1.2 correspondence log preserved)

LF-1 v1.2 continues to operate.

### 4.2 Rollback triggers

- Email bounce rate exceeds 10% on outbound deliveries
- Complaint rate exceeds 0.5% (industry threshold for reputation damage)
- Cross-user response leak observed
- Solicitor concern raised post-launch
- Delivery service outage exceeding acceptable window
- Sensitive content detection false negatives observed

### 4.3 Data retention during rollback

All data retained. Flag re-enable restores flow.

### 4.4 LF-1 v1.2 independence

LF-1 v1.2 operates without LF-2 v1. Turning LF-2 v1 off does not regress LF-1 v1.2.

---

## 5. Acceptance tests

Sixty-eight tests across twelve categories.

### 5.1 LF-1 v1.2 preservation

1. **T1.** All LF-1 v1.2 templates render unchanged.
2. **T2.** LF-1 v1.2 correspondence log operates.
3. **T3.** PDF, DOCX, copy text export preserved.
4. **T4.** Elder abuse pathway preserved.

### 5.2 Sender verification

5. **T5.** Adding an email sends a verification email with a unique token.
6. **T6.** Clicking valid token sets identity to verified.
7. **T7.** Invalid or expired token fails.
8. **T8.** Verification expiry at 12 months triggers renewal reminder.
9. **T9.** Only verified identities appear in send modal.

### 5.3 Send-from-Wayly

10. **T10.** Send-from-Wayly queues delivery and returns LetterDelivery.
11. **T11.** Delivery worker calls delivery service and updates status.
12. **T12.** Delivery status webhook updates LetterDelivery.
13. **T13.** Soft bounce retries once at 24 hours.
14. **T14.** Hard bounce marks failed with user notification.
15. **T15.** Complaint marks flagged with user notification.
16. **T16.** Rate limit of 50 per day per user enforced.
17. **T17.** Warning shown before send to personal email domain.
18. **T18.** Reply-to address matches user's per-user hashed address.

### 5.4 Response inbox and parsing

19. **T19.** Inbound email at reply-to matches to correct LetterDelivery.
20. **T20.** SPF and DKIM passed: parse normally.
21. **T21.** Authentication failed: quarantines for manual review.
22. **T22.** Quoted-original stripping isolates response body.
23. **T23.** Attachments extracted and stored in S3 Sydney with hashes.
24. **T24.** ParsedResponse created with correct metadata.
25. **T25.** LOOP-1 case updated via response endpoint.

### 5.5 Response classification

26. **T26.** Response with acknowledgment-only body classifies as `acknowledged_no_substantive_response`.
27. **T27.** Response with "refund" and "corrected" classifies as `resolved_in_user_favour`.
28. **T28.** Response with "we disagree" and "correct" classifies as `denied_disputed_by_provider`.
29. **T29.** Response with questions classifies as `requesting_more_info_from_user`.
30. **T30.** Low-confidence classification defaults to `unclassified_pending_user_review`.
31. **T31.** User confirmation persists.
32. **T32.** User reclassification updates record and case.
33. **T33.** No auto-transition to resolved on user-favour classification.

### 5.6 Timeline enforcement

34. **T34.** Timeline default of 14 days set on send.
35. **T35.** Timeline override in send modal persists.
36. **T36.** Worker identifies letters past due for escalation.
37. **T37.** Escalation offer created with correct template selection tiering.
38. **T38.** Notification fires to user on escalation offer.
39. **T39.** User response to escalation offer persists.
40. **T40.** No auto-send of escalation letters.

### 5.7 New templates

41. **T41.** Changeover billing challenge template renders in both personas.
42. **T42.** Mid-agreement rate change template pulls rate history from PPC.
43. **T43.** Escalation provider senior manager template uses correct context.
44. **T44.** Escalation ACQSC referral template hands off to CMP-1 when available.
45. **T45.** Escalation Ombudsman template requires prior ACQSC engagement.
46. **T46.** Response draft dispute provider denial template requires prior response.

### 5.8 Correspondence surface

47. **T47.** Unified timeline shows sent and received in chronological order.
48. **T48.** Sent letter detail shows delivery status timeline.
49. **T49.** Response detail shows classification with confirmation prompt.
50. **T50.** Filters (direction, status, case, provider, date) work.
51. **T51.** Deep links from case timeline route to correspondence detail.

### 5.9 Integrations

52. **T52.** CORE-1 timeline events written for all instrumented actions.
53. **T53.** LOOP-1 case status updates from responses.
54. **T54.** SD-3 changeover findings prefill changeover template.
55. **T55.** SDL-1 attendance disputes prefill provider follow-up letters.
56. **T56.** PPC rate history prefills mid-agreement rate change template.
57. **T57.** LCA-1 legislative change invalidates template caches.

### 5.10 Elder abuse safeguards

58. **T58.** Sensitive content in received email flagged.
59. **T59.** Support resource panel shown with correct numbers.
60. **T60.** No automatic disclosure.

### 5.11 Persona and editorial

61. **T61.** All templates pass PERSONA-1 audit for both personas.
62. **T62.** All templates pass editorial QA (Australian English, no em dashes, no banned vocabulary).
63. **T63.** User-facing body content meets Year 8 plain-language target.

### 5.12 Accessibility

64. **T64.** Sent emails include plain-text alternative alongside HTML.
65. **T65.** Correspondence surface passes WCAG 2.1 AAA in light, dark, and system modes.
66. **T66.** Attachment viewer keyboard accessible.
67. **T67.** Classification prompts screen reader compatible.
68. **T68.** Escalation modal keyboard navigable and focus-trapping.

---

## 6. Delivery notes

### 6.1 LF-1 v1.2 regression status

Delivery notes confirm all LF-1 v1.2 tests pass.

### 6.2 Solicitor package status

Delivery notes state package status per Section P: prepared, sent, under review, signed off.

### 6.3 Delivery service selection and configuration

Delivery notes state which delivery service (Resend or SES) is in use, its regional configuration, and SPF/DKIM/DMARC configuration.

### 6.4 Inbound email pipeline validated

Delivery notes confirm end-to-end inbound test (send letter, receive automated reply, parse, classify, case update).

### 6.5 Response classification accuracy on fixtures

Delivery notes report classification accuracy on a fixture set of representative provider responses.

### 6.6 Bounce and complaint handling verified

Delivery notes confirm bounce and complaint webhooks tested and handled correctly.

### 6.7 Rate limit enforcement verified

Delivery notes confirm rate limits enforced and gracefully surface to user.

### 6.8 Template editorial review

Delivery notes confirm all six new templates passed editorial review including plain-language target.

### 6.9 Privacy Policy amendment status

Delivery notes state amendment status: drafted, sent, under review, signed off.

---

## 7. Explicit v2 candidates

Items deferred from LF-2 v1.

1. **AI-assisted response drafting.** LLM-suggested rejoinders based on the received response. Adds ADM disclosure concern; deferred pending solicitor review.
2. **Multi-language templates.** Templates in CALD community languages. Deferred pending translation quality assurance.
3. **Letter batching for adviser tier.** Sending the same template to multiple providers on behalf of one household or to the same provider across multiple households. Deferred with adviser-tier scope review.
4. **Reminder scheduling.** Beyond timeline enforcement, calendar-scheduled reminders (weekly follow-up cadence). Deferred.
5. **Response translation.** Translating provider responses in CALD language cases. Deferred.
6. **Voice-to-letter drafting.** Users record a voice note describing their concern; Wayly drafts a letter. Deferred; adds ADM disclosure concern.
7. **Handover pack for correspondence.** Bundle of sent letters and received responses for handover to legal representative or advocate. Deferred to FC-2 v2.
8. **Provider response templates.** For providers to send back through Wayly (multi-party correspondence). Out of scope; providers are not Wayly users.
9. **Automated ACQSC portal submission.** Direct submission via ACQSC API when it exists. Deferred pending API availability and legal review.
10. **Read receipts opt-in.** Users can opt in to add tracking pixels for read receipts. Currently off. Deferred pending consent model design.
11. **Response sentiment analysis.** Beyond classification, tone detection (angry, cooperative). Deferred; overlaps with sensitive content detection.
12. **Cross-case template suggestion.** Wayly suggests templates when multiple cases suggest a common approach (pattern from multiple disputes). Deferred to a broader cross-case intelligence workstream.

---

## 8. Change log

- **v1** (this document): initial LF-2 spec. Send-from-Wayly with verified sender identity and per-user hashed reply-to inbox. Inbound email pipeline with SPF and DKIM authentication, quoted-original stripping, heuristic response classification with nine outcome classes. Timeline enforcement with tiered escalation template selection. Six new templates including the changeover billing challenge and mid-agreement rate change challenge. Unified correspondence surface. Elder abuse safeguards echoing FC-2 and SDL-1 posture. Sixty-eight acceptance tests. Solicitor package required for send-from-Wayly, response inbox, and response parsing. Alternative fallback posture defined if send-from-Wayly is limited.

---

**End of LF-2 v1 handoff prompt.**
