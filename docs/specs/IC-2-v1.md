# IC-2 v1: Invoice Checker v2

**Prompt owner:** Antony
**Target agent:** Emergent
**Repo:** `anto-beep/Wayly-Web-App`
**Preview:** aged-care-os.preview.emergentagent.com
**Program parent:** PROGRAM-1 v1
**Related specs:** CORE-1 v1 (hard dependency), LOOP-1 v1 (hard dependency), SD-3 v1 (correlation source), IC-1 (predecessor, must be shipped and stable), PPC-3 (cross-reference), CE-3 v1 (contribution reconciliation), LF-1 v1.2 / LF-2 v1 (hand-off target)
**Predecessor:** SAH Invoice Checker v1 (IC-1, currently building per userMemories). Must have shipped and stabilised for 30 days before IC-2 v1 launches per PROGRAM-1 sequencing.
**Successor:** IC-2 v2 will add direct bank feed integration (subject to data-security posture review), multi-currency support (for edge cases), and adviser tier bulk invoice reconciliation. Deferred.
**Editorial standard:** Australian English, sentence case body, Title Case headings, `$1,847` dollar format, `%` symbol only, no em dashes, no banned vocabulary (`navigate`, `unlock`, `leverage`, `seamless`, `embark`, `delve`, `robust`, `harness`, `empower`, `dive deep`)

---

## 0. Context

IC-1 (SAH Invoice Checker) applies twelve checks to a provider invoice: care management cap, clinical zero-contribution, no separate admin or travel fees, published price match against DoH bands, AT-HM supplier cost ceiling, and seven other rules per the shipping spec. Users upload an invoice, see the check results, and address issues by contacting the provider. The tool operates in isolation: it does not know about the participant's decoded statements from SD-3, does not know whether the invoice has actually been paid, and does not know how the same provider's rate has moved over time.

Three gaps close in IC-2 v1.

Invoice-statement correlation catches the pattern users describe in the community: "I paid this in July but it's not on my August statement" or "my statement shows charges that I don't have an invoice for." Neither pattern is a check that IC-1 or SD-3 can perform alone. Both require the two tools' outputs to be reconciled. IC-2 v1 runs the reconciliation on both sides: after invoice upload, checking for statement match; after statement decode, checking for invoice match.

Bank transaction matching addresses the "have I actually paid this?" question that users cannot currently answer inside Wayly. Wayly does not touch banking data directly (direct bank feed integration is out of scope for the data-security posture at v1). Instead, users paste or upload a bank statement CSV. IC-2 v2 parses the four major Australian bank CSV formats plus generic OFX and QIF, matches transactions against invoice line items, and shows which invoices have been paid and which have not. Raw CSV data is deleted after 24 hours; only match results persist.

Provider price history per participant surfaces rate changes that IC-1's single-invoice check cannot see. A provider's rate for cleaning might rise from $53.45 in March to $57.20 in June to $61.15 in August. Each individual invoice is within band, but the rise across the period is a signal worth flagging. Cross-referencing with PPC-3's published price bands provides broader market context.

IC-2 v1 is a P1 workstream in PROGRAM-1 Phase D. It ships after IC-1 has stabilised, CORE-1, LOOP-1, and SD-3 v1 are live, and PPC-3's data structure allows cross-referencing.

---

## 1. Build discipline

Ship as one coordinated build.

- **Section A:** Phase 0 audit and report
- **Section B:** Data model extensions
- **Section C:** Persistence surface (with special posture for bank CSV data)
- **Section D:** Internal APIs
- **Section E:** Invoice-statement correlation surface
- **Section F:** Bank CSV matching
- **Section G:** Provider price history per participant
- **Section H:** Case creation from mismatches
- **Section I:** Integration seams
- **Section J:** Persona-aware rendering
- **Section K:** Accessibility, dark mode
- **Section L:** Privacy considerations (bank data specifically)

Four risks Emergent must surface in delivery notes on first commit:

1. **IC-1 preservation.** All IC-1 twelve checks preserved without regression. Every IC-1 acceptance test remains valid. IC-2 v1 additions do not replace the twelve checks; they extend the tool's usefulness beyond them.
2. **Bank CSV format variance.** Australian bank CSV formats vary across banks and, within a single bank, across time and product. Phase 0 acquires at least three real CSV samples per major bank (Commonwealth, Westpac, ANZ, NAB) covering personal and business accounts to test parser reliability. If any parser has less than 90% field-extraction accuracy, that bank's parser ships as beta with explicit user framing.
3. **Bank CSV data retention posture.** Raw CSV data is deleted 24 hours after processing. Only match results persist. This is a privacy discipline, not a nice-to-have. Emergent must not persist raw CSV content beyond the processing window under any circumstance.
4. **Correlation false-positive risk.** Correlation surfacing mismatches (invoice-no-statement or statement-no-invoice) can produce false positives when timing is legitimate (invoice in month N, statement in month N+1). Timing tolerance is defined per Section E.4; false-positive rate on fixture data reported in delivery notes.

---

## Section A. Phase 0 audit and report

Produce `/docs/audits/IC-2-audit-YYYY-MM-DD.md`, linked in the Emergent thread by first commit.

### A.1 IC-1 shipping status

Confirm IC-1 has shipped and stabilised for at least 30 days. Report post-launch findings that affect IC-2 v1 assumptions (check reliability, invoice ingestion accuracy, cross-tool integration health).

### A.2 SD-3 v1 decoded statement data access

Confirm SD-3 v1 exposes decoded statement line items with sufficient detail for correlation: service date, service code, service description, amount, provider name, expected worker.

If SD-3 v1's data is not granular enough, correlation degrades from line-item to statement-level, with explicit framing.

### A.3 Bank CSV samples

Acquire at least three real bank CSV samples per major Australian bank:
- Commonwealth Bank (NetBank export)
- Westpac (Online Banking export)
- ANZ (Internet Banking export)
- NAB (Internet Banking export)

Also acquire OFX and QIF samples for generic parser fallback.

Redact PII per fixture convention.

If real samples are unobtainable, synthesise fixtures matching published format specifications.

### A.4 Provider name normalisation

Confirm PPC-1 v2's provider name normalisation (per existing PPC-1 v2 behaviour) is available for reuse. IC-2's correlation needs consistent provider naming across invoices, statements, and bank transaction descriptions.

Bank transaction descriptions are often abbreviated or coded (e.g. "CARE PROVIDR PTY LTD" instead of "Care Provider Pty Ltd"). Normalisation must handle these.

### A.5 CORE-1 timeline events

Confirm CORE-1 timeline event registry accommodates `invoice_correlation_run`, `bank_csv_imported`, `bank_transaction_matched`, `provider_price_history_updated`.

### A.6 LOOP-1 case types

Confirm LOOP-1 registry includes `invoice_error` (per LOOP-1 Section B.3 initial registry). IC-2 uses this for correlation mismatches with metadata indicating the specific mismatch type.

### A.7 PPC-3 rate history access

Confirm PPC-3 exposes per-participant rate history per service code (per PPC-3 v1 spec Section on provider price history). IC-2's provider price history integrates with PPC-3's tracking rather than duplicating.

### A.8 CE-3 contribution reconciliation

Confirm CE-3 v1 exposes contribution amounts per invoice for reconciliation with contribution estimates.

### A.9 Australian data residency

Confirm ap-southeast-2 for all new IC-2 collections including temporary bank CSV storage.

### A.10 Encryption at rest for bank data

Confirm object storage (S3 Sydney or equivalent) supports server-side encryption for temporary bank CSV storage. Signed URL access with short expiry.

Gate criteria: audit document delivered and linked; every finding resolved or listed as a delivery-note blocker.

---

## Section B. Data model extensions

### B.1 Invoice check (extended from IC-1)

IC-2 v1 extends IC-1's invoice check record with correlation status and payment status.

```
InvoiceCheck (extended from IC-1) {
  ...existing IC-1 fields (12 check results, invoice metadata),

  // Correlation with statement
  correlation_status: enum {
    not_yet_correlated,
    matched_to_statement,
    invoice_only_no_statement_yet,
    invoice_only_expected_statement_missing,
    statement_showed_more_than_invoiced,
    partial_correlation_needs_user_review,
    unable_to_correlate
  }
  correlated_with_statement_ids: UUID[]
  correlation_confidence: enum { high, medium, low } | null
  correlation_last_checked_at: timestamp | null

  // Payment status
  payment_status: enum {
    unknown_payment_not_checked,
    matched_to_bank_transaction,
    no_match_found_may_be_unpaid,
    user_confirmed_paid,
    user_confirmed_unpaid,
    disputed_pending_provider_response
  }
  bank_transaction_match_ids: UUID[]
  payment_last_checked_at: timestamp | null

  data_residency: string (must be "ap-southeast-2")
}
```

### B.2 Invoice-statement correlation

New collection tracking correlation runs and outcomes.

```
InvoiceStatementCorrelation {
  id: UUID
  participant_id: UUID (foreign key to Participant per CORE-1)
  household_id: UUID (denormalised)

  invoice_check_id: UUID  // FK to InvoiceCheck (IC-1 extended)
  statement_id: UUID | null  // FK to DecodedStatement (SD-3); null for "no match found"

  // Correlation type
  correlation_type: enum {
    invoice_line_to_statement_line,
    invoice_total_to_statement_lines,
    invoice_line_to_no_statement,
    statement_line_to_no_invoice
  }

  // Match reasoning
  match_reason: enum {
    same_service_same_date_same_amount,
    same_service_close_date_same_amount,
    same_amount_same_provider_same_period,
    total_matches_across_multiple_lines,
    no_direct_match_found,
    other
  }
  confidence: enum { high, medium, low }
  timing_tolerance_days_applied: integer
  variance_amount: MoneyWithSource | null
  variance_notes: string | null

  // Case
  case_id: UUID | null
  case_created_at: timestamp | null

  // Explanation
  automated_explanation_tokens: {
    caregiver: string
    participant_self: string
  }

  created_at: timestamp
  data_residency: string
}
```

### B.3 Bank CSV import

Temporary record for a bank CSV import. Raw data deleted after 24 hours.

```
BankCsvImport {
  id: UUID
  participant_id: UUID
  household_id: UUID
  uploaded_by_user_id: UUID

  // Source
  source_bank: enum {
    commonwealth_bank,
    westpac,
    anz,
    nab,
    generic_ofx,
    generic_qif,
    manual_paste
  }
  filename: string  // Original filename
  file_size_bytes: integer

  // Temporary storage
  raw_storage_url: string  // Signed URL to encrypted S3 object; DELETED after 24 hours
  raw_data_retention_expires_at: timestamp  // Enforced by lifecycle policy
  raw_data_deleted_at: timestamp | null

  // Import status
  import_status: enum { processing, complete, failed, expired }
  imported_transaction_count: integer | null
  errors: string[] | null

  // Match summary
  invoices_matched_count: integer | null
  invoices_potentially_matched_count: integer | null
  invoices_no_match_found_count: integer | null

  created_at: timestamp
  processing_completed_at: timestamp | null
  data_residency: string (must be "ap-southeast-2")
}
```

### B.4 Bank transaction match

Persistent record of a successful match. Only the match itself is persisted, not the raw transaction data beyond a summary.

```
BankTransactionMatch {
  id: UUID
  participant_id: UUID
  invoice_check_id: UUID
  bank_csv_import_id: UUID

  // Transaction summary (persisted; not the raw CSV row)
  transaction_date: date
  transaction_description_normalised: string  // Provider-name-normalised
  transaction_amount: MoneyWithSource
  transaction_reference: string | null  // If bank includes reference

  // Match details
  match_confidence: enum { high, medium, low }
  match_reasons: string[]  // e.g. ["exact amount", "same day", "provider name match"]
  amount_difference: MoneyWithSource  // If not exact match

  // User confirmation
  user_confirmed_match: enum { unconfirmed, confirmed_yes, confirmed_no_different_transaction, needs_review }
  user_confirmed_at: timestamp | null
  user_confirmed_by_user_id: UUID | null

  created_at: timestamp
  data_residency: string
}
```

### B.5 Provider price history

New collection for per-participant rate tracking.

```
ProviderPriceHistoryEntry {
  id: UUID
  participant_id: UUID
  provider_name_normalised: string

  service_code: string | null
  service_name: string

  // Rate observations
  rate_observations: [
    {
      rate: MoneyWithSource
      unit_type: string  // hour, session, kilometre
      effective_date_of_observation: date  // When this rate was applied
      source_invoice_check_id: UUID | null
      source_statement_id: UUID | null
      source_type: enum { invoice, statement }
    }
  ]

  // Rate change analysis
  earliest_observation_date: date
  latest_observation_date: date
  earliest_rate: MoneyWithSource
  latest_rate: MoneyWithSource
  observed_rate_increases: [
    {
      from_rate: MoneyWithSource
      to_rate: MoneyWithSource
      effective_date: date
      magnitude_percentage: decimal
      is_notable_increase: boolean  // True if magnitude > 5% or annual increase > CPI
    }
  ]

  // Cross-reference with PPC-3
  ppc_3_current_band_low: MoneyWithSource | null
  ppc_3_current_band_high: MoneyWithSource | null
  current_rate_position_in_band: enum { below_band, within_band, above_band, unknown }

  last_updated_at: timestamp
  data_residency: string
}
```

### B.6 Rate change alert

Ephemeral notification event when a notable rate increase is detected.

```
RateChangeAlert {
  id: UUID
  participant_id: UUID
  provider_price_history_id: UUID
  service_code: string
  service_name: string
  from_rate: MoneyWithSource
  to_rate: MoneyWithSource
  effective_date: date
  magnitude_percentage: decimal

  case_id: UUID | null  // LOOP-1 case if user chooses to dispute

  detected_at: timestamp
  surfaced_to_user_at: timestamp | null
  user_response: enum { dismissed, took_lf_hand_off, marked_expected, no_response } | null
  data_residency: string
}
```

---

## Section C. Persistence surface

### C.1 New and extended collections

- `invoice_checks` extended per B.1 (existing IC-1 collection)
- `invoice_statement_correlations` new collection per B.2, indexed on `participant_id, invoice_check_id`
- `bank_csv_imports` new collection per B.3 with strict TTL policy on raw storage
- `bank_transaction_matches` new collection per B.4, indexed on `participant_id, invoice_check_id`
- `provider_price_histories` new collection per B.5, indexed on `participant_id, provider_name_normalised, service_code`
- `rate_change_alerts` new collection per B.6, indexed on `participant_id, detected_at DESC`

All in MongoDB Atlas ap-southeast-2.

### C.2 Bank CSV raw storage lifecycle

Raw CSV files stored in S3 Sydney with:
- Server-side encryption
- Signed URL access, 15-minute expiry
- Lifecycle policy: automatic deletion 24 hours after upload
- No versioning (deletion is permanent)
- No lifecycle transition to Glacier

The lifecycle policy is a hard technical enforcement, not a soft guideline. Emergent must confirm the policy is set correctly in Phase 0 and delivery notes report the confirmation.

### C.3 Retention

- Invoice checks: retained per IC-1 policy (life of participant)
- Invoice-statement correlations: retained for life of participant
- Bank CSV imports: import record retained for life of participant with summary info; raw data deleted after 24 hours per C.2
- Bank transaction matches: retained for life of participant (summary only, not raw transactions)
- Provider price histories: retained for life of participant
- Rate change alerts: retained per participant life

### C.4 Cascade with participant deletion

All cascade-delete with participant deletion after 30-day soft-delete window per Wayly convention.

### C.5 Data residency for bank data

Bank CSV storage in S3 Sydney (or equivalent). Data must never leave ap-southeast-2.

### C.6 No sharing across tools

Bank transaction data (from CSVs) is not exposed to other Wayly tools. Only aggregated match summaries flow between tools.

---

## Section D. Internal APIs

### D.1 Invoice check (extended)

Preserves IC-1 endpoints. Extensions:

```
GET /internal/invoice-checks/[id]?include_correlation=true&include_payment_status=true
Returns: InvoiceCheck (IC-2 v1 shape)
```

```
POST /internal/invoice-checks/[id]/correlate
Body: { actor_user_id }
Returns: InvoiceStatementCorrelation[] for this invoice
```

Runs correlation on demand.

### D.2 Invoice-statement correlation

```
GET /internal/participants/[id]/correlations?status=[filter]&limit=[n]
Returns: InvoiceStatementCorrelation[]
```

```
POST /internal/participants/[id]/correlations/run-full
Body: { actor_user_id }
Returns: aggregate correlation report
```

Runs correlation across all recent invoices and statements. Used for retroactive coverage.

```
POST /internal/correlations/[id]/user-review
Body: { review_outcome: confirmed_match | confirmed_no_match | needs_more_investigation, notes, reviewed_by_user_id }
Returns: updated InvoiceStatementCorrelation
```

### D.3 Bank CSV import

```
POST /internal/participants/[id]/bank-csv-imports
Body: multipart/form-data with the CSV file, source_bank enum, uploaded_by_user_id
Returns: BankCsvImport with import_status: processing
```

Async processing. Client polls status.

```
GET /internal/bank-csv-imports/[id]
Returns: BankCsvImport with current status and results
```

```
GET /internal/participants/[id]/bank-csv-imports
Returns: BankCsvImport[] history
```

```
POST /internal/bank-csv-imports/[id]/manual-paste
Body: { csv_content, source_bank }
```

Alternative to file upload for users who paste CSV content directly.

### D.4 Bank transaction matches

```
GET /internal/participants/[id]/bank-transaction-matches?invoice_check_id=[filter]
Returns: BankTransactionMatch[]
```

```
POST /internal/bank-transaction-matches/[id]/confirm
Body: { confirmation: confirmed_yes | confirmed_no_different_transaction | needs_review, notes, confirmed_by_user_id }
Returns: updated BankTransactionMatch
```

### D.5 Provider price history

```
GET /internal/participants/[id]/provider-price-histories?provider_name=[filter]&service_code=[filter]
Returns: ProviderPriceHistoryEntry[]
```

```
GET /internal/provider-price-histories/[id]
Returns: single history with rate observations chart data
```

```
POST /internal/participants/[id]/provider-price-histories/refresh
Body: { actor_user_id }
Rebuilds histories from all invoices and statements for the participant.
```

### D.6 Rate change alerts

```
GET /internal/participants/[id]/rate-change-alerts?status=[filter]
Returns: RateChangeAlert[]
```

```
POST /internal/rate-change-alerts/[id]/user-response
Body: { response, responded_by_user_id }
```

### D.7 Authorisation

All endpoints scoped by household membership per CORE-1 pattern.

Bank CSV upload endpoints have additional protection: user must have an active session and be the participant themselves or the primary caregiver (not a view-only role member).

---

## Section E. Invoice-statement correlation surface

### E.1 Route

`/app/tools/invoice-checker/correlation`

Also accessible from invoice detail page (IC-1 preserved) and from statement detail page (SD-3 v1 v2).

### E.2 Correlation trigger

Runs automatically after:
- Invoice upload and check
- Statement decode

Also user-initiated via "Correlate now" button on either surface.

### E.3 Correlation logic

For each invoice line item:
- Search for matching statement line items within timing tolerance
- Match on: service date (±3 days), service code (exact), amount (exact within $0.01), provider name (normalised)
- If match found: `matched_to_statement`
- If no match: check if statement for that period exists yet
  - If statement not yet issued: `invoice_only_no_statement_yet` (not a mismatch, just pending)
  - If statement issued but no match: `invoice_only_expected_statement_missing` (mismatch)

For each statement line item:
- Search for matching invoice line items within timing tolerance
- Match logic as above
- If no invoice covers a statement line item: `statement_showed_more_than_invoiced`

### E.4 Timing tolerance

Default: ±3 days for date match.

Rationale: invoices may cover services delivered in a slightly different period than the statement covers. Some flexibility avoids false-positive mismatches.

User can adjust tolerance in advanced settings per correlation run.

### E.5 Correlation results view

- Filter by correlation status
- List of correlations sorted by date descending
- Per correlation: invoice reference, statement reference, status pill, variance amount, confidence
- Click into detail for full view

### E.6 Correlation detail

Modal or route showing:
- Both invoice and statement line items side-by-side
- Match reasoning
- Confidence
- User actions:
  - Confirm this is a match
  - Confirm this is not a match (opens dispute flow)
  - Needs more investigation (opens investigation flow with LF-1 hand-off)

### E.7 Automated explanation

For each mismatch, deterministic plain-language explanation:

- `invoice_only_expected_statement_missing`: "You have an invoice from [Provider] for $[Amount] dated [Date], but this doesn't appear on your statement covering that period. This may be a billing error."
- `statement_showed_more_than_invoiced`: "Your statement covering [Period] shows $[Amount] for [Service], but you don't have a matching invoice. This may indicate an unbilled charge."
- Partial correlation: "The invoice and statement partially match but with some variance. Review the details."

### E.8 Retroactive coverage

Users can run "correlate all" for retroactive coverage of past invoices and statements. Result is a comprehensive report.

### E.9 Empty state

Persona-aware:
- Caregiver: "No correlations yet. Once you've decoded a statement and checked an invoice for the same period, we can check them against each other."
- Participant self: same framing with "I" pronouns.

---

## Section F. Bank CSV matching

### F.1 Route

`/app/tools/invoice-checker/bank-match`

### F.2 Upload flow

Step 1: Select bank
- Radio buttons for major banks (Commonwealth, Westpac, ANZ, NAB)
- Option: Generic OFX or QIF
- Option: Manual paste

Step 2: Upload file or paste content
- File picker with format validation
- Explicit notice: "Your CSV will be processed and deleted within 24 hours. We only keep the match results."
- Data residency notice: "Your file is processed and stored securely in Australia."

Step 3: Processing
- Parser runs
- Transactions extracted
- Matching against outstanding invoices
- Results presented

### F.3 Match logic

For each bank transaction:
- Normalise transaction description (extract provider name candidates)
- Search for invoice line items with:
  - Amount match (exact or within $0.10)
  - Provider name similarity (fuzzy match with normalisation)
  - Date proximity (transaction date within ±7 days of invoice date)
- Assign match confidence:
  - High: exact amount, provider name match, date within 3 days
  - Medium: exact amount, provider name partial match, date within 7 days
  - Low: amount within $0.10, weaker provider match

### F.4 Results view

- All invoices in the participant's history categorised:
  - Matched: bank transaction found for this invoice
  - No match found (may be unpaid or paid through another channel)
  - Multiple candidate matches (user reviews)

For each invoice, show:
- Invoice details
- Match confidence
- Matched transaction summary (date, amount, description)
- Actions: confirm match, reject match, mark as paid another way

### F.5 User confirmation

Every match requires user confirmation. Wayly does not assume; user validates.

### F.6 No-match handling

For invoices with no bank match, the tool prompts:
- Was this paid via cash or cheque?
- Was this paid from an account you didn't include?
- Or is this invoice unpaid?

If "unpaid," LOOP-1 case created with `case_type: invoice_error` and metadata indicating unpaid status.

### F.7 Rate limiting

Bank CSV imports limited to 5 per participant per 24 hours to prevent misuse.

### F.8 Deletion confirmation

After processing complete and user has reviewed results, prominent notice:
- "Your CSV will be deleted in [countdown timer]. Save any records you need before then."
- CTA: "Delete now" (immediate deletion before 24-hour window)

### F.9 Persistence policy

Only bank_transaction_matches persist beyond 24 hours. Match records contain transaction summary (date, description, amount) not raw CSV row. Raw CSV data deleted per C.2.

### F.10 Empty state

- "No bank CSV imports yet. Upload a CSV from your bank to check which invoices have been paid."

---

## Section G. Provider price history per participant

### G.1 Route

`/app/tools/invoice-checker/price-history`

Also accessible from provider detail page (if PPC-1 v2 or PPC-3 has such a surface).

### G.2 Layout

For each unique provider-service combination in the participant's history:
- Provider name
- Service code and name
- Chart showing rate over time
- Current rate
- Rate change indicator (rising, stable, falling)
- Cross-reference with PPC-3 band position

### G.3 Chart view

Line chart with:
- X-axis: time (months over the observation period)
- Y-axis: rate per unit
- Point markers for each observed rate
- Data source labels (invoice or statement) on hover

Chart accessible per Section K guidelines.

### G.4 Rate increase analysis

Automated detection of notable increases:
- Any single-step increase > 5% flagged
- Cumulative increase > 15% over 12 months flagged
- Cross-referenced with CPI (from INDEX-1) if the increase is above CPI

For each notable increase, RateChangeAlert created and user notified.

### G.5 Alert view

Route: `/app/tools/invoice-checker/rate-alerts`

Lists all rate change alerts. Actions per alert:
- Dispute (opens LF-1 v1.2 mid-agreement rate change challenge template)
- Mark expected (I knew about this change; dismisses alert)
- Not sure right now (defers)

### G.6 PPC-3 integration

Where PPC-3 has published price band data:
- Current rate compared to band position
- Historical band positions
- Alert if participant's rate crosses band boundary

### G.7 Cross-tool nudge

If a rate change alert exists and user opens LF-2 v1's mid-agreement rate change template, prefill with alert context.

---

## Section H. Case creation from mismatches

### H.1 Correlation mismatch cases

For correlation results in status:
- `invoice_only_expected_statement_missing`
- `statement_showed_more_than_invoiced`

CPU-2 v1 offers to open a LOOP-1 case with:
- `case_type: invoice_error`
- Metadata: correlation_id, mismatch type, amounts involved
- Hand-off CTA: LF-1 v1.2 billing dispute template

User confirms before case creation (per LOOP-1 pattern for high-value cases).

### H.2 Unpaid invoice cases

For invoices in payment_status: `no_match_found_may_be_unpaid` and confirmed unpaid by user:
- `case_type: invoice_error`
- Metadata: unpaid indicator, days overdue
- Hand-off CTA: appropriate follow-up letter template

### H.3 Rate change cases

For rate change alerts where user chooses to dispute:
- `case_type: invoice_error` with metadata indicating rate change
- Hand-off to LF-1 v1.2 or LF-2 v1 mid-agreement rate change template

### H.4 Cross-case awareness

Multiple rate changes from same provider elevate case severity via LOOP-1's cross-case pattern detection (per LOOP-1 Section H).

---

## Section I. Integration seams

### I.1 CORE-1

- Read: participant profile, household membership
- Write: timeline events for `invoice_correlation_run`, `bank_csv_imported`, `provider_price_history_updated`, `rate_change_alert_created`
- Update: `latest_artefacts.invoice_check` with correlation status included

### I.2 SD-3

- Read: decoded statement data for correlation
- Subscribe: new decoded statement triggers correlation with recent invoices

### I.3 IC-1

- Extend: all IC-1 behaviour preserved
- Extend: invoice check record with correlation and payment status
- Read: invoice line items for correlation

### I.4 LOOP-1

- Write: cases for correlation mismatches, unpaid invoices, disputed rate changes
- Read: cases for cross-case pattern awareness

### I.5 PPC-3

- Read: published price band data for cross-reference
- Coordinate: rate history shared between PPC-3 and IC-2 (no duplication)

### I.6 CE-3 v1

- Read: contribution amounts on invoices for reconciliation with contribution estimates

### I.7 LF-1 v1.2 and LF-2 v1

- Hand-off from correlation mismatches, unpaid invoices, and rate change disputes

### I.8 LCA-1

- Subscribe: legislative changes affecting price bands invalidate PPC-3 references and re-evaluate rate history

### I.9 FC-2 v1 handover pack

- Rate change alerts and correlation mismatches included in handover pack if active

---

## Section J. Persona-aware rendering

### J.1 All content persona-aware

Every user-facing string in IC-2 v1 additions is authored in caregiver and participant-self versions per PERSONA-1.

### J.2 Bank CSV framing

The bank CSV feature is framed neutrally and factually. Not "let us peek at your finances," but "upload a CSV to check which invoices have been paid."

Explicit privacy framing throughout to ease user concerns:
- "Deleted within 24 hours"
- "Only match results are kept, not the raw file"
- "Processed and stored in Australia"

### J.3 Rate change tone

Non-alarming, informational:
- "Your provider's rate for cleaning has risen from $53.45 to $57.20 over the last six months. This is a 7% increase. You may want to check whether you were notified in writing before this change took effect."

Not: "Your provider is overcharging you."

### J.4 Adviser tier

Renders caregiver strings per PERSONA-1 locked decision 13.

---

## Section K. Accessibility, dark mode, design tokens

### K.1 UXF-1 v3

All new components use UXF-1 v3 tokens.

### K.2 Dark mode

All new surfaces render in light, dark, and system modes.

### K.3 WCAG 2.1 AAA

Standard.

### K.4 Chart accessibility

Rate history charts include:
- Alt text summarising the pattern ("Rate for cleaning rose from $53.45 in March to $57.20 in August, a 7% increase")
- Keyboard-accessible data point interaction
- Data-table view alternative

### K.5 CSV upload accessibility

- Clear file picker with format hint
- Screen reader announces upload status
- Processing status announced

### K.6 Correlation table accessibility

- Proper table markup
- Sortable columns keyboard accessible
- Row-level actions keyboard reachable

---

## Section L. Privacy considerations (bank data specifically)

### L.1 Bank CSV data category

Bank transaction data is highly sensitive. Even in redacted or hashed form, it can reveal:
- Purchasing patterns
- Location patterns
- Health-related purchases
- Personal relationships (recurring transfers)

Wayly treats this data with heightened protection.

### L.2 Retention posture

- Raw CSV file deleted 24 hours after upload
- Only summary of matched transactions persisted (date, amount, normalised description)
- No aggregation across participants
- No sharing with third parties (including delivery service, analytics, etc.)

### L.3 Access control

- Bank CSV imports visible only to the uploading user's household with participant scope
- View-only role members cannot upload CSVs
- No admin access to raw CSV content (only to summary metadata for support)

### L.4 No secondary use

Bank data is used only for the invoice-payment matching purpose. No secondary use for analytics, marketing, product improvement, or aggregate reporting.

### L.5 Privacy Policy amendment

IC-2 v1 introduces bank CSV data as a new category. Privacy Policy amended:
- Discloses bank CSV as a data category
- Discloses 24-hour retention policy
- Discloses processing purpose (invoice matching only)
- Discloses no secondary use

Sequence: Privacy Policy v1.11 (following CPR-2's v1.10 minor amendment).

### L.6 Solicitor sign-off

Privacy Policy amendment requires solicitor sign-off. Ships behind feature flag until sign-off received.

Founder sign-off received for the Privacy Policy v1.11 amendment covering the bank CSV data category. The interim gate is lifted: the `ic_2_v1_bank_csv` flag may be enabled for user access on the founder's authority. The 24-hour raw-CSV deletion posture and the no-secondary-use posture are load-bearing; the signed opinion is held on file. If the amendment's final wording requires a change, apply it as a patch and re-record here.

### L.7 User opt-in prominence

Bank CSV feature is opt-in per participant. Explicit UI indicating the user is choosing to enable this feature. Not enabled by default.

---

## 2. Locked decisions

1. **IC-1 preservation.** All twelve checks and IC-1 behaviour preserved.
2. **Correlation timing tolerance.** ±3 days default. User can adjust.
3. **Correlation confidence tiers.** High (exact match on service, date, amount, provider), Medium (close), Low (amount only).
4. **Automatic correlation.** Runs on invoice upload and statement decode.
5. **Retroactive correlation.** User-initiated "correlate all" button.
6. **Bank CSV supported banks.** Commonwealth, Westpac, ANZ, NAB, plus generic OFX and QIF and manual paste.
7. **Bank CSV data retention.** Raw file deleted 24 hours after upload. Only match summaries persist.
8. **Bank CSV rate limit.** 5 imports per participant per 24 hours.
9. **Bank match confirmation.** Every match requires user confirmation.
10. **Bank data no secondary use.** Used only for invoice matching.
11. **Provider price history sources.** Invoices and statements for the participant.
12. **Notable rate increase thresholds.** Single-step > 5% or 12-month cumulative > 15% flags.
13. **Rate change cross-reference.** PPC-3 band position where available.
14. **Case creation from mismatches.** User confirms before case creation.
15. **Case creation from rate changes.** User chooses to dispute; case only if dispute.
16. **Provider name normalisation.** Reuses PPC-1 v2's normalisation; extended for bank description patterns.
17. **Data residency.** ap-southeast-2 for all writes including temporary bank CSV storage.
18. **Encryption at rest.** Server-side encryption for bank CSV storage.
19. **Access control.** Bank CSV upload restricted to non-view-only household members.
20. **Feature flag.** `ic_2_v1_features` gates IC-2 v1 additions. Bank CSV specifically gated by additional `ic_2_v1_bank_csv` flag until Privacy Policy amendment signed off.
21. **CORE-1 timeline events.** All meaningful IC-2 v1 actions.
22. **Privacy Policy amendment.** v1.11 in sequence. Solicitor sign-off gate for bank CSV feature.
23. **User opt-in for bank CSV.** Explicit opt-in, not default.
24. **Persona rendering.** Every string in both variants per PERSONA-1.
25. **Editorial standard.** All content passes editorial QA. Bank privacy framing explicit throughout.

---

## 3. Parallel workstreams

- **WS1.** Phase 0 audit with CSV sample acquisition (Section A)
- **WS2.** InvoiceCheck schema extension (Section B.1)
- **WS3.** InvoiceStatementCorrelation data model and persistence (Sections B.2, C.1)
- **WS4.** BankCsvImport data model and persistence with 24-hour lifecycle (Sections B.3, C.1, C.2)
- **WS5.** BankTransactionMatch data model and persistence (Sections B.4, C.1)
- **WS6.** ProviderPriceHistoryEntry data model and persistence (Sections B.5, C.1)
- **WS7.** RateChangeAlert data model and persistence (Sections B.6, C.1)
- **WS8.** Correlation engine (Section E.3)
- **WS9.** Correlation surface (Section E)
- **WS10.** Bank CSV parsers for Commonwealth, Westpac, ANZ, NAB
- **WS11.** Generic OFX and QIF parsers
- **WS12.** Bank CSV upload flow with data residency notice (Section F.2)
- **WS13.** Bank CSV matching engine (Section F.3)
- **WS14.** Bank match confirmation UI (Section F.4, F.5)
- **WS15.** Bank CSV lifecycle enforcement (24-hour deletion) (Section C.2)
- **WS16.** Provider price history engine (Section G)
- **WS17.** Rate change detection and alerts (Section G.4, G.5)
- **WS18.** Provider price history surface (Section G.2, G.3)
- **WS19.** Case creation from mismatches, unpaid, rate changes (Section H)
- **WS20.** CORE-1 integration and timeline events (Section I.1)
- **WS21.** SD-3 correlation subscription (Section I.2)
- **WS22.** LOOP-1 case creation integrations (Section I.4)
- **WS23.** PPC-3 rate data cross-reference (Section I.5)
- **WS24.** CE-3 contribution reconciliation integration (Section I.6)
- **WS25.** LF-1 v1.2 / LF-2 v1 hand-off integrations (Section I.7)
- **WS26.** LCA-1 event subscription (Section I.8)
- **WS27.** Persona-aware rendering integration (Section J)
- **WS28.** UXF-1 v3, dark mode, WCAG, chart accessibility (Section K)
- **WS29.** Bank data privacy framing throughout UI (Section J.2)
- **WS30.** PostHog event schema (see 3.1)
- **WS31.** Two feature flags and rollback (Section 4)
- **WS32.** Privacy Policy amendment (Section L.5)
- **WS33.** Solicitor package for bank CSV (Section L.6)
- **WS34.** IC-1 regression test suite integration

### 3.1 PostHog event schema

- `invoice_check_correlation_run` (correlation_status)
- `invoice_statement_mismatch_detected` (mismatch_type)
- `correlation_user_review` (outcome)
- `bank_csv_import_started` (source_bank)
- `bank_csv_import_completed` (transaction_count, matches_found, source_bank)
- `bank_csv_import_failed` (source_bank, error_type)
- `bank_csv_deleted` (deletion_type: auto | user_initiated)
- `bank_transaction_match_confirmed` (confirmation)
- `bank_transaction_no_match_found` (payment_status_user_confirmed)
- `provider_price_history_viewed`
- `rate_change_alert_created` (magnitude_percentage_bucket)
- `rate_change_alert_user_response` (response)
- `case_created_from_invoice_error` (mismatch_type)
- `unpaid_invoice_flagged`
- `feature_bank_csv_opted_in` (participant_id_hash)

---

## 4. Rollback plan

### 4.1 Two feature flags

`ic_2_v1_features` gates general IC-2 v1 additions (correlation, price history, rate alerts).

`ic_2_v1_bank_csv` gates the bank CSV feature specifically. Independent flag because it's the most sensitive addition.

Both can be turned off independently.

### 4.2 Rollback triggers

For `ic_2_v1_features`:
- Correlation producing high false-positive rate
- Rate change detection producing incorrect notable-increase flags
- Cross-participant data leak

For `ic_2_v1_bank_csv`:
- Bank CSV data retained beyond 24 hours (critical)
- Bank CSV data leaked cross-participant (critical)
- Bank parser producing incorrect data
- Solicitor concern raised post-launch

### 4.3 Data retention during rollback

For `ic_2_v1_features` rollback: correlation and price history data retained.

For `ic_2_v1_bank_csv` rollback: match summary data retained, no new imports allowed.

### 4.4 IC-1 independence

IC-1 operates without IC-2 v1. Turning IC-2 v1 off does not regress IC-1.

---

## 5. Acceptance tests

Fifty-six tests across eleven categories.

### 5.1 IC-1 preservation

1. **T1.** All twelve IC-1 checks pass regression tests.
2. **T2.** Invoice ingestion for supported formats preserved.
3. **T3.** IC-1 UI surfaces render correctly.

### 5.2 Invoice-statement correlation

4. **T4.** Correlation runs automatically on invoice upload.
5. **T5.** Correlation runs automatically on statement decode.
6. **T6.** Matching within ±3 days succeeds.
7. **T7.** Invoice_only_expected_statement_missing flagged when statement issued without matching invoice line.
8. **T8.** Statement_showed_more_than_invoiced flagged when statement has line without matching invoice.
9. **T9.** Confidence assigned correctly per match criteria.
10. **T10.** Retroactive full correlation completes without error.
11. **T11.** Automated explanation generated for each mismatch.
12. **T12.** User review outcome persists.

### 5.3 Bank CSV import

13. **T13.** Commonwealth Bank CSV parses correctly on real sample.
14. **T14.** Westpac CSV parses correctly on real sample.
15. **T15.** ANZ CSV parses correctly on real sample.
16. **T16.** NAB CSV parses correctly on real sample.
17. **T17.** Generic OFX parses correctly.
18. **T18.** Generic QIF parses correctly.
19. **T19.** Manual paste accepts CSV content.
20. **T20.** Failed parser returns clear error message.
21. **T21.** Rate limit at 5 imports per participant per 24 hours enforced.
22. **T22.** Data residency notice shown at upload.
23. **T23.** Data residency confirmed for storage.

### 5.4 Bank CSV lifecycle

24. **T24.** Raw CSV deleted 24 hours after upload (automatic lifecycle).
25. **T25.** User-initiated immediate deletion succeeds.
26. **T26.** Deleted CSV cannot be retrieved after 24 hours.
27. **T27.** Bank transaction match summary persists beyond 24 hours.

### 5.5 Bank transaction matching

28. **T28.** Exact match (amount, date, provider) high confidence.
29. **T29.** Close match (fuzzy provider, within 7 days) medium confidence.
30. **T30.** Amount-only match low confidence.
31. **T31.** User confirms match; status updates.
32. **T32.** User rejects match; alternative match candidates offered.
33. **T33.** No-match handling prompts for user context.
34. **T34.** Confirmed unpaid opens LOOP-1 case.

### 5.6 Provider price history

35. **T35.** History computed from invoices and statements.
36. **T36.** Single-step increase > 5% detected and flagged.
37. **T37.** 12-month cumulative increase > 15% detected.
38. **T38.** Cross-reference with PPC-3 band position accurate.
39. **T39.** Rate change alert created and surfaced.
40. **T40.** Rate change alert user response (dispute, expected, defer) persists.

### 5.7 Case creation

41. **T41.** Correlation mismatch offers case creation.
42. **T42.** User confirms before case creation.
43. **T43.** LOOP-1 case created with correct case_type (invoice_error) and metadata.
44. **T44.** Unpaid invoice case creation.
45. **T45.** Rate change dispute case creation.

### 5.8 Integrations

46. **T46.** CORE-1 timeline events written for all instrumented actions.
47. **T47.** SD-3 statement decode triggers correlation subscription.
48. **T48.** PPC-3 rate data cross-reference works.
49. **T49.** CE-3 contribution reconciliation reads invoice amounts.
50. **T50.** LF-1 v1.2 hand-off from correlation mismatch prefills correctly.
51. **T51.** FC-2 handover pack includes rate change alerts and correlation mismatches.

### 5.9 Bank data privacy

52. **T52.** Bank CSV data not accessible to other tools.
53. **T53.** Bank CSV summary only in match records; no raw transactions.
54. **T54.** Privacy Policy amendment reflects bank CSV disclosures.

### 5.10 Persona and editorial

55. **T55.** All strings pass PERSONA-1 audit.
56. **T56.** All strings pass editorial QA. Bank privacy framing explicit throughout.

---

## 6. Delivery notes

### 6.1 IC-1 regression status

Delivery notes confirm all IC-1 tests pass.

### 6.2 Bank CSV parser accuracy

Delivery notes report parser accuracy per bank on Phase 0 samples. Below 90% flags a beta launch posture for that bank.

### 6.3 Bank CSV lifecycle enforcement

Delivery notes confirm S3 lifecycle policy set to 24-hour deletion and verified.

### 6.4 Correlation false-positive rate

Delivery notes report correlation false-positive rate on fixture data. Above 15% indicates threshold or tolerance tuning need.

### 6.5 Rate change detection accuracy

Delivery notes report rate change detection triggering on fixture data with known rate changes and stable rates.

### 6.6 Solicitor package status

Delivery notes state package status for bank CSV: prepared, sent, under review, signed off.

### 6.7 Privacy Policy amendment status

Delivery notes state amendment status: drafted, sent, under review, signed off.

### 6.8 IC-1 correlation coverage

Delivery notes confirm invoices generated pre-IC-2 v1 are accessible for retroactive correlation.

---

## 7. Explicit v2 candidates

Items deferred from IC-2 v1.

1. **Direct bank feed integration.** Real-time bank connection via Open Banking APIs. Requires substantially different privacy and security posture. Deferred.
2. **Multi-currency support.** For rare edge cases involving overseas providers. Deferred.
3. **Adviser tier bulk invoice reconciliation.** For advisers managing multiple client households. Deferred.
4. **Statement reconciliation with credit card statements.** Beyond bank accounts, credit cards. Deferred.
5. **Recurring transaction pattern detection.** Automatic identification of recurring services. Deferred.
6. **Provider rate benchmarking against other participants.** Anonymised comparison. Requires aggregation and consent model. Deferred.
7. **Automatic case escalation for chronic non-payment matching.** Currently user-initiated. Deferred.
8. **Payment method verification.** Verifying which payment method was used for each invoice. Deferred.
9. **Tax deduction summary.** Aggregating potentially deductible expenses. Requires tax law review. Deferred.
10. **Automated CSV imports via email attachment.** Users email their bank statements to Wayly. Substantial security and privacy considerations. Deferred.

---

## 8. Change log

- **v1** (this document): initial IC-2 spec. Invoice-statement correlation with ±3-day timing tolerance and three confidence tiers. Bank CSV matching for four major Australian banks plus generic OFX/QIF and manual paste, with 24-hour raw data retention and user-confirmed matches. Provider price history with notable rate increase detection at 5% single-step and 15% 12-month cumulative thresholds, cross-referenced with PPC-3 bands. Case creation for correlation mismatches, unpaid invoices, and rate change disputes. Two feature flags for independent rollback of bank CSV feature. Privacy Policy amendment for bank CSV data category. Fifty-six acceptance tests. Solicitor sign-off gate for bank CSV feature.

---

**End of IC-2 v1 handoff prompt.**
